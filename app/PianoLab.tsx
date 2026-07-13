"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import {
  CHROMATIC_SOLFEGE,
  CONVENTIONAL_PITCH_CLASSES,
  PIANO_SCALES,
  chordTransitionEvidence,
  conventionalPitchName,
  fifthStepForPitchClass,
  fifthsCircle,
  frequencyFromMidi,
  groupChordGestures,
  identifyChordCandidates,
  intervalLandmark,
  nearbyScaleChords,
  nearestMidiForPitchClass,
  noteContext,
  pairwiseIntervals,
  parseMidiMessage,
  pitchClassFromMidi,
  pushPhraseEvent,
  pushRollingNoteEvent,
  resolutionDirection,
  scaleFrameTimeline,
  scaleSemitones,
  tonalTendency,
  voiceChordNear,
  voiceLeadingProfile,
  type ChordCandidate,
  type ChordBoundaryCorrection,
  type ChordGesture,
  type NearbyChord,
  type PianoScale,
  type ScaleCandidate,
} from "@/lib/piano-model";
import { sonorityPerceptionModel } from "@/lib/sonority-model";

type MidiInputLike = {
  id: string;
  name?: string | null;
  manufacturer?: string | null;
  state?: string;
  onmidimessage: ((event: { data: Uint8Array }) => void) | null;
};
type MidiAccessLike = { inputs: Map<string, MidiInputLike>; onstatechange: (() => void) | null };
type NavigatorWithMidi = Navigator & {
  requestMIDIAccess?: (options?: { sysex?: boolean }) => Promise<MidiAccessLike>;
};
type HudNoteEvent = {
  id: number;
  note: number;
  velocity: number;
  channel: number;
  source: "midi" | "screen";
  onsetMs: number;
  keyReleaseMs: number | null;
  releaseMs: number | null;
  releaseReason: "key" | "pedal" | null;
  fieldNotes: number[];
};
type EventMeasure = {
  event: HudNoteEvent;
  crunch: number | null;
  pull: number;
  arrival: number;
  novelty: number;
  motion: number;
};
type HudChordGesture = ChordGesture<HudNoteEvent>;
type ChordMeasure = {
  gesture: HudChordGesture;
  candidate: ChordCandidate | null;
  hasPreviousChord: boolean;
  crunch: number | null;
  pull: number;
  arrival: number;
  novelty: number;
  motion: number;
  rootTravel: number;
  rootTravelSteps: number | null;
  commonPitchClassCount: number;
};
type FrameMode = "discover" | "locked";
type FocusLens = "explore" | "intervals" | "scales" | "chords" | "motion";
type IntervalEchoTarget = { semitones: number; anchorEventId: number };

type MidiCallbacks = {
  onAttack: (note: number, velocity: number, channel: number, fieldNotes: number[], atMs: number) => void;
  onRelease: (note: number, channel: number, atMs: number, heldByPedal: boolean) => void;
  onSustain: (down: boolean, channel: number, atMs: number, releasedNotes: number[]) => void;
};

type PersistedPianoSession = {
  version: 2;
  phraseEvents: HudNoteEvent[];
  chordWindowMs: number;
  boundaryCorrections: Record<number, ChordBoundaryCorrection>;
  focusLens: FocusLens;
  showConventions: boolean;
  frameMode: FrameMode;
  lockedScaleId: PianoScale["id"];
  lockedDoMidi: number;
  ghostChord: NearbyChord | null;
  ghostNotes: number[];
};

const WHITE_PITCH_CLASSES = new Set([0, 2, 4, 5, 7, 9, 11]);
const VISIBLE_NOTES = Array.from({ length: 25 }, (_, index) => 48 + index);
const WHITE_NOTES = VISIBLE_NOTES.filter((note) => WHITE_PITCH_CLASSES.has(pitchClassFromMidi(note)));
const DEFAULT_SCALE = PIANO_SCALES[0];
const FIFTHS_ORDER = fifthsCircle();
const EVENT_X = (slot: number) => 84 + slot * 88;
const PIANO_SESSION_KEY = "music-with-no-names:piano-session:v2";
const FOCUS_LENSES: Array<{ id: FocusLens; label: string; description: string }> = [
  { id: "explore", label: "Explore", description: "See the whole phrase across every representation." },
  { id: "intervals", label: "Intervals", description: "Connect spacing, frequency ratio, and transferable hand shape." },
  { id: "scales", label: "Scales", description: "See how pitch evidence suggests Do and a scale route." },
  { id: "chords", label: "Chords", description: "Inspect grouping, chord identity, and one-change consequences." },
  { id: "motion", label: "Motion", description: "Follow pull, repose, novelty, and voice movement through time." },
];

function formatHz(value: number) {
  return `${value.toFixed(value < 1000 ? 1 : 0)} Hz`;
}

function uniqueSorted(notes: number[]) {
  return [...new Set(notes.map(Math.round))].sort((first, second) => first - second);
}

function samePitchClasses(firstNotes: number[], secondPitchClasses: number[]) {
  const first = [...new Set(firstNotes.map(pitchClassFromMidi))].sort((a, b) => a - b);
  const second = [...new Set(secondPitchClasses.map(pitchClassFromMidi))].sort((a, b) => a - b);
  return first.length === second.length && first.every((pitchClass, index) => pitchClass === second[index]);
}

function currentHudTime() {
  return performance.now();
}

function relativeSyllable(note: number, doMidi: number, scale: PianoScale) {
  return noteContext(note, doMidi, scale).syllable;
}

function candidateKey(candidate: ScaleCandidate | null) {
  return candidate ? `${candidate.rootPitchClass}:${candidate.scale.id}` : "";
}

function evidenceWord(value: number) {
  if (value >= 0.67) return "high";
  if (value >= 0.34) return "moderate";
  return "low";
}

function gestureSlots(gesture: HudChordGesture, events: HudNoteEvent[]) {
  const start = events.findIndex((event) => event.id === gesture.attacks[0].id);
  const end = events.findIndex((event) => event.id === gesture.attacks.at(-1)!.id);
  return { start: Math.max(0, start), end: Math.max(0, end) };
}

function useMidiKeyboard(callbacks: MidiCallbacks) {
  const accessRef = useRef<MidiAccessLike | null>(null);
  const pressedRef = useRef(new Set<number>());
  const sustainedRef = useRef(new Set<number>());
  const sustainDownRef = useRef(false);
  const notesRef = useRef(new Map<number, number>());
  const callbacksRef = useRef(callbacks);
  const [supported, setSupported] = useState<boolean | null>(null);
  const [inputs, setInputs] = useState<MidiInputLike[]>([]);
  const [selectedInputId, setSelectedInputId] = useState("");
  const [notes, setNotes] = useState<Map<number, number>>(new Map());
  const [pressed, setPressed] = useState<Set<number>>(new Set());
  const [sustained, setSustained] = useState<Set<number>>(new Set());
  const [status, setStatus] = useState("Connect a MIDI keyboard, or use the silent on-screen keys.");

  useEffect(() => { callbacksRef.current = callbacks; }, [callbacks]);

  const publish = useCallback(() => {
    setNotes(new Map(notesRef.current));
    setPressed(new Set(pressedRef.current));
    setSustained(new Set(sustainedRef.current));
  }, []);

  const clear = useCallback(() => {
    pressedRef.current.clear();
    sustainedRef.current.clear();
    sustainDownRef.current = false;
    notesRef.current.clear();
    publish();
  }, [publish]);

  const refreshInputs = useCallback((access: MidiAccessLike) => {
    const next = Array.from(access.inputs.values()).filter((input) => input.state !== "disconnected");
    setInputs(next);
    setSelectedInputId((current) => next.some((input) => input.id === current) ? current : next[0]?.id ?? "");
    setStatus(next.length ? `${next.length} MIDI input${next.length === 1 ? "" : "s"} available.` : "Permission is ready; connect or power on a MIDI keyboard.");
  }, []);

  const connect = useCallback(async () => {
    const request = (navigator as NavigatorWithMidi).requestMIDIAccess;
    if (!request) {
      setSupported(false);
      setStatus("This browser does not expose MIDI input. The silent on-screen keys still work.");
      return;
    }
    setStatus("Waiting for MIDI permission…");
    try {
      const access = await request.call(navigator, { sysex: false });
      accessRef.current = access;
      setSupported(true);
      refreshInputs(access);
      access.onstatechange = () => refreshInputs(access);
    } catch {
      setStatus("MIDI permission was not granted. Retry, or use the silent on-screen keys.");
    }
  }, [refreshInputs]);

  useEffect(() => {
    const input = accessRef.current?.inputs.get(selectedInputId);
    if (!input) return;
    clear();
    setStatus(`Visualizing ${input.name || "MIDI input"}. No sound is generated or recorded.`);
    input.onmidimessage = (event) => {
      const message = parseMidiMessage(event.data);
      const atMs = performance.now();
      if (message.type === "note-on") {
        pressedRef.current.add(message.note);
        sustainedRef.current.delete(message.note);
        notesRef.current.set(message.note, message.velocity);
        publish();
        callbacksRef.current.onAttack(message.note, message.velocity, message.channel, uniqueSorted(Array.from(notesRef.current.keys())), atMs);
      } else if (message.type === "note-off") {
        pressedRef.current.delete(message.note);
        if (sustainDownRef.current) sustainedRef.current.add(message.note);
        else notesRef.current.delete(message.note);
        callbacksRef.current.onRelease(message.note, message.channel, atMs, sustainDownRef.current);
        publish();
      } else if (message.type === "sustain") {
        const releasedNotes = message.down ? [] : Array.from(sustainedRef.current).filter((note) => !pressedRef.current.has(note));
        sustainDownRef.current = message.down;
        if (!message.down) {
          sustainedRef.current.forEach((note) => {
            if (!pressedRef.current.has(note)) notesRef.current.delete(note);
          });
          sustainedRef.current.clear();
        }
        callbacksRef.current.onSustain(message.down, message.channel, atMs, releasedNotes);
        publish();
      }
    };
    return () => { input.onmidimessage = null; };
  }, [clear, publish, selectedInputId]);

  useEffect(() => () => { if (accessRef.current) accessRef.current.onstatechange = null; }, []);

  return { clear, connect, inputs, notes, pressed, selectedInputId, setSelectedInputId, status, supported, sustained };
}

function diatonicIndex(note: number) {
  const letterByPitchClass = [0, 0, 1, 1, 2, 3, 3, 4, 4, 5, 5, 6];
  return (Math.floor(note / 12) - 1) * 7 + letterByPitchClass[pitchClassFromMidi(note)];
}

function staffY(note: number) {
  const index = diatonicIndex(note);
  return note >= 60 ? 88 - (index - 30) * 6 : 186 - (index - 18) * 6;
}

function ledgerLines(note: number) {
  const y = staffY(note);
  const lines: number[] = [];
  const limits = note >= 60 ? { top: 40, bottom: 88 } : { top: 138, bottom: 186 };
  if (y < limits.top) for (let line = limits.top - 12; line >= y - 1; line -= 12) lines.push(line);
  if (y > limits.bottom) for (let line = limits.bottom + 12; line <= y + 1; line += 12) lines.push(line);
  return lines;
}

function StaffView({ events, gestures, selectedChordId, doMidi, scale, focusedId, showConventions }: {
  events: HudNoteEvent[]; gestures: HudChordGesture[]; selectedChordId: string | null; doMidi: number; scale: PianoScale; focusedId: number | null; showConventions: boolean;
}) {
  return (
    <div className="hud-plot hud-staff-plot">
      <div className="hud-panel-heading"><span>Attack history</span><strong>Grand staff</strong><small>Pitch height by attack order; duration is not inferred.</small></div>
      <svg viewBox="0 0 720 224" role="img" aria-label={events.length ? `Grand staff showing ${events.map((event) => relativeSyllable(event.note, doMidi, scale)).join(", ")} across ${gestures.length} grouped chord gesture${gestures.length === 1 ? "" : "s"}` : "Empty grand staff waiting for note attacks"}>
        <title>Last seven note attacks on a grand staff</title>
        {gestures.map((gesture) => {
          const slots = gestureSlots(gesture, events);
          const x = EVENT_X(slots.start) - 34;
          const width = EVENT_X(slots.end) - EVENT_X(slots.start) + 68;
          return <rect key={gesture.id} x={x} y="23" width={width} height="177" rx="5" className={`hud-chord-band ${gesture.kind === "rolled" ? "is-rolled" : ""} ${gesture.id === selectedChordId ? "is-selected" : ""}`} />;
        })}
        {[40, 52, 64, 76, 88, 138, 150, 162, 174, 186].map((y) => <line key={y} x1="52" x2="700" y1={y} y2={y} className="hud-grid-line" />)}
        <text x="14" y="82" className="hud-clef">𝄞</text><text x="18" y="178" className="hud-clef hud-bass-clef">𝄢</text>
        {events.map((event, slot) => {
          const x = EVENT_X(slot);
          const y = staffY(event.note);
          const context = noteContext(event.note, doMidi, scale);
          const black = !WHITE_PITCH_CLASSES.has(pitchClassFromMidi(event.note));
          return <g key={event.id} className={event.id === focusedId ? "is-focused" : ""}>
            {ledgerLines(event.note).map((lineY) => <line key={lineY} x1={x - 12} x2={x + 12} y1={lineY} y2={lineY} className="hud-ledger-line" />)}
            <ellipse cx={x} cy={y} rx="9" ry="6" className="hud-note-head" transform={`rotate(-14 ${x} ${y})`} />
            <line x1={x + 8} x2={x + 8} y1={y} y2={y - 31} className="hud-note-stem" />
            {black ? <text x={x - 18} y={y + 5} className="hud-accidental">♯</text> : null}
            <text x={x} y="214" className="hud-event-label">{slot + 1} · {showConventions ? conventionalPitchName(event.note) : context.syllable}</text>
          </g>;
        })}
        {!events.length ? <text x="376" y="116" className="hud-empty-label">Play a key to begin the shared seven-event trace</text> : null}
      </svg>
    </div>
  );
}

function ChordGestureLane({ events, measures, selectedChordId, focusedId, boundaryCorrections, doMidi, showConventions, onSelect, onBoundaryChange }: {
  events: HudNoteEvent[];
  measures: ChordMeasure[];
  selectedChordId: string | null;
  focusedId: number | null;
  boundaryCorrections: Record<number, ChordBoundaryCorrection>;
  doMidi: number;
  showConventions: boolean;
  onSelect: (id: string) => void;
  onBoundaryChange: (eventId: number, correction: ChordBoundaryCorrection | null) => void;
}) {
  const focusedIndex = events.findIndex((event) => event.id === focusedId);
  const focusedCorrection = focusedId == null ? undefined : boundaryCorrections[focusedId];
  return (
    <div className="hud-chord-lane-wrap">
      <div className="hud-chord-lane" aria-label="Chord gestures grouped by attack timing">
        <span className="hud-chord-lane-label">chord grouping</span>
        <div>
        {measures.map((measure) => {
          const slots = gestureSlots(measure.gesture, events);
          const label = measure.candidate ? `${measure.candidate.exact ? "" : "≈ "}${chordLabel(measure.candidate, doMidi, showConventions)}` : `${new Set(measure.gesture.attackedNotes.map(pitchClassFromMidi)).size}-position field`;
          return <button
            key={measure.gesture.id}
            type="button"
            className={measure.gesture.kind === "rolled" ? "is-rolled" : ""}
            style={{ gridColumn: `${slots.start + 1} / ${slots.end + 2}` }}
            aria-pressed={selectedChordId === measure.gesture.id}
            onClick={() => onSelect(measure.gesture.id)}
          >
            <span>{measure.gesture.kind} · {Math.round(measure.gesture.spreadMs)} ms</span>
            <strong>{label}</strong>
            <small>{measure.gesture.attacks.length} attacks</small>
          </button>;
        })}
        {!measures.length ? <p>Notes inside the chosen time window will share a bracket.</p> : null}
        </div>
      </div>
      <div className="hud-boundary-controls" aria-label="Correct chord grouping">
        <span>{focusedIndex > 0 ? `Before attack ${focusedIndex + 1}` : "Select attack 2–7 to correct its boundary"}</span>
        <button type="button" disabled={focusedIndex <= 0} aria-pressed={focusedCorrection === "break"} onClick={() => focusedId != null && onBoundaryChange(focusedId, focusedCorrection === "break" ? null : "break")}>Start new chord</button>
        <button type="button" disabled={focusedIndex <= 0} aria-pressed={focusedCorrection === "join"} onClick={() => focusedId != null && onBoundaryChange(focusedId, focusedCorrection === "join" ? null : "join")}>Join previous</button>
        {focusedCorrection ? <button type="button" onClick={() => focusedId != null && onBoundaryChange(focusedId, null)}>Use timing</button> : null}
      </div>
    </div>
  );
}

function FrequencyView({ events, gestures, selectedChordId, doMidi, scale, focusedId, showConventions }: {
  events: HudNoteEvent[]; gestures: HudChordGesture[]; selectedChordId: string | null; doMidi: number; scale: PianoScale; focusedId: number | null; showConventions: boolean;
}) {
  const notes = events.map((event) => event.note);
  const minimum = notes.length ? Math.min(...notes, doMidi) : doMidi - 12;
  const maximum = notes.length ? Math.max(...notes, doMidi) : doMidi + 12;
  const center = (minimum + maximum) / 2;
  const range = Math.max(24, maximum - minimum + 6);
  const low = center - range / 2;
  const high = center + range / 2;
  const yFor = (note: number) => 132 - ((note - low) / (high - low)) * 104;
  const points = events.map((event, slot) => `${EVENT_X(slot)},${yFor(event.note)}`).join(" ");
  return (
    <div className="hud-plot hud-frequency-plot">
      <div className="hud-panel-heading"><span>Physical pitch</span><strong>Log-frequency height</strong><small>Same columns; equal vertical steps mean equal frequency ratios.</small></div>
      <svg viewBox="0 0 720 162" role="img" aria-label={events.length ? `Frequency trace from ${formatHz(frequencyFromMidi(events[0].note))} to ${formatHz(frequencyFromMidi(events.at(-1)!.note))}` : "Empty frequency trace"}>
        <title>Frequency trace aligned to the grand staff</title>
        {gestures.map((gesture) => {
          const slots = gestureSlots(gesture, events);
          const x = EVENT_X(slots.start) - 34;
          const width = EVENT_X(slots.end) - EVENT_X(slots.start) + 68;
          return <rect key={gesture.id} x={x} y="17" width={width} height="119" rx="5" className={`hud-chord-band ${gesture.kind === "rolled" ? "is-rolled" : ""} ${gesture.id === selectedChordId ? "is-selected" : ""}`} />;
        })}
        {[0, 1, 2, 3, 4].map((tick) => { const note = low + (tick / 4) * (high - low); return <g key={tick}><line x1="52" x2="700" y1={yFor(note)} y2={yFor(note)} className="hud-grid-line" /><text x="7" y={yFor(note) + 4} className="hud-axis-label">{Math.round(frequencyFromMidi(note))}</text></g>; })}
        <text x="7" y="14" className="hud-axis-unit">Hz</text>
        {points ? <polyline points={points} className="hud-frequency-line" /> : null}
        {events.map((event, slot) => {
          const context = noteContext(event.note, doMidi, scale);
          const landmark = intervalLandmark(event.note - doMidi);
          return <g key={event.id} className={event.id === focusedId ? "is-focused" : ""}>
            <circle cx={EVENT_X(slot)} cy={yFor(event.note)} r="6" className="hud-frequency-dot" />
            <text x={EVENT_X(slot)} y={Math.max(14, yFor(event.note) - 10)} className="hud-point-label">{showConventions ? conventionalPitchName(event.note) : context.syllable}</text>
            <text x={EVENT_X(slot)} y="153" className="hud-event-label">{event.note === doMidi ? "1:1" : landmark.landmarkLabel}</text>
          </g>;
        })}
      </svg>
    </div>
  );
}

function FifthsCompass({ events, activeNotes, chordNotes, chordRootPitchClass, doMidi, scale, focusedNote, showConventions }: {
  events: HudNoteEvent[]; activeNotes: number[]; chordNotes: number[]; chordRootPitchClass: number | null; doMidi: number; scale: PianoScale; focusedNote: number | null; showConventions: boolean;
}) {
  const visits = new Map<number, number[]>();
  events.forEach((event, index) => {
    const step = fifthStepForPitchClass(pitchClassFromMidi(event.note));
    visits.set(step, [...(visits.get(step) ?? []), index + 1]);
  });
  const activeSteps = new Set(activeNotes.map((note) => fifthStepForPitchClass(pitchClassFromMidi(note))));
  const chordSteps = new Set(chordNotes.map((note) => fifthStepForPitchClass(pitchClassFromMidi(note))));
  const chordRootStep = chordRootPitchClass == null ? -1 : fifthStepForPitchClass(chordRootPitchClass);
  const focusedStep = focusedNote == null ? -1 : fifthStepForPitchClass(pitchClassFromMidi(focusedNote));
  const doStep = fifthStepForPitchClass(pitchClassFromMidi(doMidi));
  return (
    <div className="hud-circle-panel">
      <div className="hud-panel-heading"><span>Pitch geography</span><strong>Fifths compass</strong><small>Clockwise neighbors differ by the near-3:2 relation.</small></div>
      <div className="hud-fifths-circle" role="img" aria-label="Circle of fifths with the last seven event numbers, active notes, and selected chord members">
        <div className="hud-fifths-center"><span>{chordNotes.length ? "selected chord" : "current frame"}</span><strong>{chordNotes.length ? chordRootPitchClass == null ? "root ?" : showConventions ? CONVENTIONAL_PITCH_CLASSES[chordRootPitchClass] : CHROMATIC_SOLFEGE[pitchClassFromMidi(chordRootPitchClass - pitchClassFromMidi(doMidi))] : "Do"}</strong><small>{chordNotes.length ? chordRootPitchClass == null ? `${new Set(chordNotes.map(pitchClassFromMidi)).size} positions · outline` : `${new Set(chordNotes.map(pitchClassFromMidi)).size} positions · exact root` : showConventions ? CONVENTIONAL_PITCH_CLASSES[pitchClassFromMidi(doMidi)] : scale.name.replace(" route", "")}</small></div>
        {FIFTHS_ORDER.nodes.map((node) => {
          const absolutePc = node.pitchClass;
          const relative = CHROMATIC_SOLFEGE[pitchClassFromMidi(absolutePc - pitchClassFromMidi(doMidi))];
          const eventVisits = visits.get(node.step) ?? [];
          const className = ["hud-fifth-node", node.step === doStep ? "is-home" : "", activeSteps.has(node.step) ? "is-active" : "", chordSteps.has(node.step) ? "is-chord-member" : "", node.step === chordRootStep ? "is-chord-root" : "", node.step === focusedStep ? "is-focused" : ""].filter(Boolean).join(" ");
          return <div key={node.step} className={className} style={{ "--fifth-angle": `${node.step * 30}deg` } as CSSProperties}>
            <strong>{showConventions ? CONVENTIONAL_PITCH_CLASSES[absolutePc] : relative}</strong>
            <span>{eventVisits.length ? eventVisits.join("·") : "·"}</span>
          </div>;
        })}
      </div>
    </div>
  );
}

function ScaleLens({ events, chordNotes, snapshots, frame, doMidi, showConventions, onAdopt }: {
  events: HudNoteEvent[];
  chordNotes: number[];
  snapshots: ReturnType<typeof scaleFrameTimeline>;
  frame: ScaleCandidate;
  doMidi: number;
  showConventions: boolean;
  onAdopt: (candidate: ScaleCandidate) => void;
}) {
  const latest = snapshots.at(-1);
  const positions = new Set(scaleSemitones(frame.scale));
  const observed = new Set(events.map((event) => pitchClassFromMidi(event.note - doMidi)));
  const chordPositions = new Set(chordNotes.map((note) => pitchClassFromMidi(note - doMidi)));
  const compatibleCount = [...observed].filter((position) => positions.has(position)).length;
  const candidates = latest ? [latest.leading, ...latest.runnersUp].filter((candidate): candidate is ScaleCandidate => Boolean(candidate)) : [];
  return (
    <div className="hud-scale-panel">
      <div className="hud-panel-heading"><span>Scale hypothesis</span><strong>Scale lens</strong><small>{latest?.evidenceLabel ?? "no evidence"} · compatibility, not certainty</small></div>
      <div className="hud-scale-current">
        <span>{showConventions ? `Do = ${CONVENTIONAL_PITCH_CLASSES[pitchClassFromMidi(doMidi)]}` : "movable Do"}</span>
        <strong>{showConventions ? frame.scale.conventionalName : frame.scale.name}</strong>
        <small>{observed.size ? `${compatibleCount}/${observed.size} observed positions fit this route` : "Play four distinct positions before automatic reframing."}</small>
      </div>
      <div className="hud-scale-rail" role="img" aria-label="Twelve equal key positions showing scale membership and observed positions">
        {Array.from({ length: 12 }, (_, position) => {
          const inScale = positions.has(position);
          const seen = observed.has(position);
          const inChord = chordPositions.has(position);
          const context = noteContext(doMidi + position, doMidi, frame.scale);
          return <div key={position} className={`${inScale ? "is-in-scale" : ""} ${seen ? "is-seen" : ""} ${inChord ? "is-chord-tone" : ""}`}><span>{showConventions ? CONVENTIONAL_PITCH_CLASSES[pitchClassFromMidi(doMidi + position)] : inScale ? context.syllable : "·"}</span><i>{inChord ? "chord" : seen ? "seen" : inScale ? "route" : ""}</i></div>;
        })}
      </div>
      <ol className="hud-frame-candidates" aria-label="Compatible scale frames">
        {candidates.slice(0, 3).map((candidate, index) => <li key={candidateKey(candidate)}>
          <button type="button" onClick={() => onAdopt(candidate)} aria-label={`Lock ${candidate.scale.name} with ${CONVENTIONAL_PITCH_CLASSES[candidate.rootPitchClass]} as Do`}>
            <span>{index === 0 ? "leading" : "also fits"}</span>
            <strong>{showConventions ? `${CONVENTIONAL_PITCH_CLASSES[candidate.rootPitchClass]} · ${candidate.scale.conventionalName}` : `${CHROMATIC_SOLFEGE[pitchClassFromMidi(candidate.rootPitchClass - pitchClassFromMidi(doMidi))]} as Do · ${candidate.scale.name}`}</strong>
            <small>{candidate.inScaleCount}/{candidate.uniqueNoteCount} observed inside</small>
          </button>
        </li>)}
        {!candidates.length ? <li className="hud-empty-copy">Candidate frames appear as you play.</li> : null}
      </ol>
      <div className="hud-frame-history" aria-label="Frame stability across the seven events">
        {events.map((event, index) => <span key={event.id} className={snapshots[index]?.changed ? "is-change" : ""}>{index + 1}<i>{snapshots[index]?.changed ? "frame" : "·"}</i></span>)}
      </div>
    </div>
  );
}

function chordLabel(candidate: ChordCandidate, doMidi: number, showConventions: boolean) {
  const root = showConventions ? CONVENTIONAL_PITCH_CLASSES[candidate.rootPitchClass] : CHROMATIC_SOLFEGE[pitchClassFromMidi(candidate.rootPitchClass - pitchClassFromMidi(doMidi))];
  if (showConventions) return `${root}${candidate.template.symbol || ""}`;
  return `${root} · ${candidate.template.name}`;
}

function RelationshipTexture({ notes, inheritedNotes, doMidi, scale, showConventions }: { notes: number[]; inheritedNotes: number[]; doMidi: number; scale: PianoScale; showConventions: boolean }) {
  const unique = uniqueSorted(notes);
  const pairs = pairwiseIntervals(unique);
  const xFor = (note: number) => unique.length <= 1 ? 180 : 46 + (unique.indexOf(note) / (unique.length - 1)) * 268;
  const pairScore = (semitones: number) => {
    const distance = intervalLandmark(semitones);
    return Math.max(0.15, 1 - Math.min(1, Math.abs(distance.errorCents) / 35));
  };
  return (
    <div className="hud-texture-panel">
      <div className="hud-panel-heading"><span>Within the selected field</span><strong>Interval texture</strong><small>Thicker arcs sit nearer simple ratio landmarks; hollow nodes were already sounding.</small></div>
      <svg viewBox="0 0 360 168" role="img" aria-label={pairs.length ? `${pairs.length} pairwise interval relationships` : "Interval texture needs two simultaneous notes"}>
        <title>Pairwise interval texture</title>
        {pairs.map((pair) => {
          const x1 = xFor(pair.lower); const x2 = xFor(pair.upper); const peak = 126 - Math.min(90, (x2 - x1) * 0.38);
          return <path key={`${pair.lower}-${pair.upper}`} d={`M ${x1} 126 Q ${(x1 + x2) / 2} ${peak} ${x2} 126`} className="hud-texture-arc" style={{ "--arc-strength": pairScore(pair.upper - pair.lower) } as CSSProperties}><title>{pair.distance.relationship}, {pair.distance.cents} cents</title></path>;
        })}
        {unique.map((note) => <g key={note}><circle cx={xFor(note)} cy="126" r="9" className={`hud-texture-node ${inheritedNotes.includes(note) ? "is-inherited" : ""}`} /><text x={xFor(note)} y="151" className="hud-point-label">{showConventions ? conventionalPitchName(note) : relativeSyllable(note, doMidi, scale)}</text></g>)}
        {unique.length < 2 ? <text x="180" y="78" className="hud-empty-label">Hold two notes to expose their interval</text> : null}
      </svg>
    </div>
  );
}

function EvidenceTrace({ measures, chordMeasures, events, selectedChordId }: { measures: EventMeasure[]; chordMeasures: ChordMeasure[]; events: HudNoteEvent[]; selectedChordId: string | null }) {
  const series: Array<{ key: keyof Pick<EventMeasure, "crunch" | "pull" | "arrival" | "novelty" | "motion">; label: string; className: string }> = [
    { key: "crunch", label: "crunch", className: "is-crunch" },
    { key: "pull", label: "pull", className: "is-pull" },
    { key: "arrival", label: "arrival", className: "is-arrival" },
    { key: "novelty", label: "pitch novelty", className: "is-novelty" },
    { key: "motion", label: "voice motion", className: "is-motion" },
  ];
  const pathFor = (key: typeof series[number]["key"]) => measures.map((measure, slot) => {
    const value = measure[key];
    return value == null ? null : `${EVENT_X(slot)},${128 - value * 96}`;
  });
  return (
    <div className="hud-evidence-panel">
      <div className="hud-panel-heading"><span>Attack + chord evidence</span><strong>Perceptual motion</strong><small>Lines follow attacks; diamonds summarize grouped chords. No overall goodness score.</small></div>
      <div className="hud-trace-legend" aria-hidden="true">{series.map((item) => <span key={item.key} className={item.className}>{item.label}</span>)}<span className="is-chord-symbol">grouped chord</span></div>
      <svg viewBox="0 0 720 156" role="img" aria-label={measures.length ? `Evidence traces across ${measures.length} note attacks and ${chordMeasures.length} grouped chord gestures` : "Empty evidence trace"}>
        <title>Crunch, tonal pull, arrival evidence, pitch novelty, and voice motion for note fields and chord gestures</title>
        {chordMeasures.map((measure) => {
          const slots = gestureSlots(measure.gesture, events);
          const x = EVENT_X(slots.start) - 34;
          const width = EVENT_X(slots.end) - EVENT_X(slots.start) + 68;
          return <rect key={measure.gesture.id} x={x} y="20" width={width} height="114" rx="4" className={`hud-chord-band ${measure.gesture.kind === "rolled" ? "is-rolled" : ""} ${measure.gesture.id === selectedChordId ? "is-selected" : ""}`} />;
        })}
        {[32, 80, 128].map((y, index) => <g key={y}><line x1="52" x2="700" y1={y} y2={y} className="hud-grid-line" /><text x="11" y={y + 4} className="hud-axis-label">{["more", "mid", "less"][index]}</text></g>)}
        {series.map((item) => {
          const points = pathFor(item.key);
          const chunks: string[] = []; let current: string[] = [];
          points.forEach((point) => { if (point) current.push(point); else if (current.length) { chunks.push(current.join(" ")); current = []; } });
          if (current.length) chunks.push(current.join(" "));
          return <g key={item.key} className={`hud-trace-series ${item.className}`}>{chunks.map((pointsChunk, index) => <polyline key={index} points={pointsChunk} />)}{points.map((point, index) => point ? <circle key={index} cx={Number(point.split(",")[0])} cy={Number(point.split(",")[1])} r="3.5" /> : null)}</g>;
        })}
        {series.map((item) => <g key={`chords-${item.key}`} className={`hud-chord-trace ${item.className}`}>
          {chordMeasures.map((measure) => {
            const value = measure[item.key];
            if (value == null || (!measure.hasPreviousChord && (item.key === "novelty" || item.key === "motion"))) return null;
            const slots = gestureSlots(measure.gesture, events);
            const x = (EVENT_X(slots.start) + EVENT_X(slots.end)) / 2;
            const y = 128 - value * 96;
            return <rect key={measure.gesture.id} x={x - 4.5} y={y - 4.5} width="9" height="9" transform={`rotate(45 ${x} ${y})`} />;
          })}
        </g>)}
        {measures.map((measure, slot) => <text key={measure.event.id} x={EVENT_X(slot)} y="151" className="hud-event-label">{slot + 1}</text>)}
      </svg>
    </div>
  );
}

function nearbyLabel(chord: NearbyChord, doMidi: number, showConventions: boolean) {
  if (chord.candidate) return chordLabel(chord.candidate, doMidi, showConventions);
  return showConventions ? CONVENTIONAL_PITCH_CLASSES[chord.rootPitchClass] : chord.syllable;
}

function durationLabel(event: HudNoteEvent, nowMs: number) {
  const end = event.releaseMs ?? nowMs;
  const duration = Math.max(0, end - event.onsetMs);
  if (duration < 1000) return `${Math.round(duration)} ms`;
  return `${(duration / 1000).toFixed(1)} s`;
}

function PhraseRibbon({ events, nowMs, doMidi, scale, focusedId, showConventions }: {
  events: HudNoteEvent[];
  nowMs: number;
  doMidi: number;
  scale: PianoScale;
  focusedId: number | null;
  showConventions: boolean;
}) {
  const windowStart = nowMs - 60_000;
  const visibleEvents = events.filter((event) => (event.releaseMs ?? nowMs) >= windowStart);
  const firstOnset = Math.max(windowStart, visibleEvents[0]?.onsetMs ?? nowMs);
  const lastEnd = visibleEvents.reduce((latest, event) => Math.max(latest, Math.min(nowMs, event.releaseMs ?? nowMs)), firstOnset + 800);
  const span = Math.max(800, lastEnd - firstOnset);
  const notes = visibleEvents.map((event) => event.note);
  const low = notes.length ? Math.min(...notes) - 1 : doMidi - 6;
  const high = notes.length ? Math.max(...notes) + 1 : doMidi + 6;
  const microscopeStart = Math.max(0, visibleEvents.length - 7);
  const xFor = (atMs: number) => 58 + ((Math.max(firstOnset, atMs) - firstOnset) / span) * 632;
  const yFor = (note: number) => 118 - ((note - low) / Math.max(1, high - low)) * 82;
  return (
    <section className="hud-phrase-ribbon" aria-labelledby="hud-ribbon-title">
      <div className="hud-panel-heading"><span>60-second phrase memory · 7-attack microscope below</span><strong id="hud-ribbon-title">Live phrase ribbon</strong><small>Length is sounding time · tail is pedal sustain · height is pitch · opacity is attack strength.</small></div>
      <svg viewBox="0 0 720 142" role="img" aria-label={visibleEvents.length ? `Sixty-second phrase ribbon with ${visibleEvents.length} attacks and their sounding durations` : "Empty live phrase ribbon waiting for note attacks"}>
        <title>Sixty-second phrase timing, pitch, velocity, release, silence, and pedal sustain</title>
        {[36, 77, 118].map((y) => <line key={y} x1="58" x2="690" y1={y} y2={y} className="hud-grid-line" />)}
        {visibleEvents.map((event, index) => {
          const microscopeSlot = index >= microscopeStart ? index - microscopeStart + 1 : null;
          const keyEnd = event.keyReleaseMs ?? event.releaseMs ?? nowMs;
          const soundingEnd = event.releaseMs ?? nowMs;
          const x = xFor(event.onsetMs);
          const keyWidth = Math.max(5, xFor(keyEnd) - x);
          const tailWidth = Math.max(0, xFor(soundingEnd) - xFor(keyEnd));
          const y = yFor(event.note);
          const context = noteContext(event.note, doMidi, scale);
          return <g key={event.id} className={event.id === focusedId ? "is-focused" : ""} aria-label={`Phrase attack ${index + 1}${microscopeSlot ? `, microscope ${microscopeSlot}` : ""}, ${showConventions ? conventionalPitchName(event.note) : context.syllable}, ${durationLabel(event, nowMs)}`}>
            <rect x={x} y={y - 5} width={keyWidth} height="10" rx="5" className="hud-ribbon-key" style={{ "--attack-strength": Math.max(.28, event.velocity / 127) } as CSSProperties} />
            {tailWidth > 0 ? <line x1={xFor(keyEnd)} x2={xFor(soundingEnd)} y1={y} y2={y} className="hud-ribbon-pedal" /> : null}
            <circle cx={x} cy={y} r="7" className="hud-ribbon-attack" />
            {microscopeSlot ? <text x={x} y={Math.max(14, y - 12)} className="hud-point-label">M{microscopeSlot} · {showConventions ? conventionalPitchName(event.note) : context.syllable}</text> : null}
          </g>;
        })}
        {!visibleEvents.length ? <text x="374" y="80" className="hud-empty-label">Your phrase will keep sixty seconds of timing, touch, release, silence, and pedal shape here</text> : null}
        {visibleEvents.length ? <text x="690" y="136" className="hud-axis-label">{(span / 1000).toFixed(1)} s</text> : null}
      </svg>
    </section>
  );
}

function IntervalEcho({ events, target, doMidi, scale, showConventions, onSetTarget, onClear }: {
  events: HudNoteEvent[];
  target: IntervalEchoTarget | null;
  doMidi: number;
  scale: PianoScale;
  showConventions: boolean;
  onSetTarget: (target: IntervalEchoTarget) => void;
  onClear: () => void;
}) {
  const latestPair = events.length >= 2 ? [events.at(-2)!, events.at(-1)!] as const : null;
  const latestDistance = latestPair ? Math.abs(latestPair[1].note - latestPair[0].note) : null;
  const afterTarget = target ? events.filter((event) => event.id > target.anchorEventId) : [];
  const attempt = afterTarget.length >= 2 ? Math.abs(afterTarget.at(-1)!.note - afterTarget.at(-2)!.note) : null;
  const matched = target != null && attempt === target.semitones;
  const landmark = latestDistance == null ? null : intervalLandmark(latestDistance);
  return (
    <section className="hud-echo-panel" aria-labelledby="hud-echo-title">
      <div className="hud-panel-heading"><span>Transfer, don’t memorize</span><strong id="hud-echo-title">Interval Echo</strong><small>Replay the same spacing from another key. The HUD stays silent and checks the relationship.</small></div>
      {latestPair && landmark ? <div className="hud-echo-current">
        <span>{showConventions ? `${conventionalPitchName(latestPair[0].note)} → ${conventionalPitchName(latestPair[1].note)}` : `${relativeSyllable(latestPair[0].note, doMidi, scale)} → ${relativeSyllable(latestPair[1].note, doMidi, scale)}`}</span>
        <strong>{latestDistance} key step{latestDistance === 1 ? "" : "s"}</strong>
        <small>{landmark.relationship} · near {landmark.landmarkLabel}</small>
      </div> : <p className="hud-empty-copy">Play two notes to create an interval worth echoing.</p>}
      <div className="hud-echo-actions">
        <button type="button" disabled={!latestPair || latestDistance == null} onClick={() => latestPair && latestDistance != null && onSetTarget({ semitones: latestDistance, anchorEventId: latestPair[1].id })}>Echo this spacing</button>
        {target ? <button type="button" onClick={onClear}>End echo</button> : null}
      </div>
      {target ? <div className={`hud-echo-feedback ${matched ? "is-match" : ""}`} aria-live="polite">
        <span>Ghost target · {target.semitones} key step{target.semitones === 1 ? "" : "s"}</span>
        <strong>{attempt == null ? "Play a new starting note, then a second note." : matched ? "Same relationship—new place." : `You moved ${attempt}. Keep the shape and try again.`}</strong>
      </div> : null}
    </section>
  );
}

function ChordCausePanel({ measures, selectedId, doMidi, showConventions }: {
  measures: ChordMeasure[];
  selectedId: string | null;
  doMidi: number;
  showConventions: boolean;
}) {
  const selectedIndex = measures.findIndex((measure) => measure.gesture.id === selectedId);
  const index = selectedIndex >= 0 ? selectedIndex : measures.length - 1;
  const current = measures[index] ?? measures.at(-1) ?? null;
  const previous = current ? measures[measures.indexOf(current) - 1] ?? null : null;
  if (!current || !previous) return <section className="hud-cause-panel"><div className="hud-panel-heading"><span>Change one chord</span><strong>Causal chord view</strong><small>A second grouped chord creates the comparison baseline.</small></div><p className="hud-empty-copy">Play two chord gestures. The HUD will separate what changed from how the model changed.</p></section>;
  const previousSet = new Set(previous.gesture.attackedNotes.map(pitchClassFromMidi));
  const currentSet = new Set(current.gesture.attackedNotes.map(pitchClassFromMidi));
  const namePc = (pc: number) => showConventions ? CONVENTIONAL_PITCH_CLASSES[pc] : CHROMATIC_SOLFEGE[pitchClassFromMidi(pc - pitchClassFromMidi(doMidi))];
  const added = [...currentSet].filter((pc) => !previousSet.has(pc)).map(namePc);
  const removed = [...previousSet].filter((pc) => !currentSet.has(pc)).map(namePc);
  const kept = [...currentSet].filter((pc) => previousSet.has(pc)).map(namePc);
  const delta = (currentValue: number | null, previousValue: number | null) => currentValue == null || previousValue == null ? null : Math.round((currentValue - previousValue) * 100);
  const deltas = [
    { label: "modeled roughness", value: delta(current.crunch, previous.crunch) },
    { label: "pull toward Do", value: delta(current.pull, previous.pull) },
    { label: "repose evidence", value: delta(current.arrival, previous.arrival) },
  ];
  return <section className="hud-cause-panel" aria-labelledby="hud-cause-title">
    <div className="hud-panel-heading"><span>Change → consequence</span><strong id="hud-cause-title">Causal chord view</strong><small>These deltas describe this assumed sound model, not an emotional verdict.</small></div>
    <div className="hud-cause-change"><span>{added.length ? `added ${added.join(" · ")}` : "added none"}</span><span>{removed.length ? `released ${removed.join(" · ")}` : "released none"}</span><span>{kept.length ? `kept ${kept.join(" · ")}` : "kept no positions"}</span></div>
    <div className="hud-cause-deltas">{deltas.map((item) => <span key={item.label}><small>{item.label}</small><strong>{item.value == null ? "—" : `${item.value > 0 ? "+" : ""}${item.value}`}</strong><em>{item.value == null ? "not available" : item.value > 3 ? "more" : item.value < -3 ? "less" : "similar"}</em></span>)}</div>
  </section>;
}

function VoiceLeadingCoach({ measures, selectedId, doMidi, scale, showConventions }: {
  measures: ChordMeasure[];
  selectedId: string | null;
  doMidi: number;
  scale: PianoScale;
  showConventions: boolean;
}) {
  const selectedIndex = measures.findIndex((measure) => measure.gesture.id === selectedId);
  const index = selectedIndex >= 0 ? selectedIndex : measures.length - 1;
  const current = measures[index] ?? null;
  const previous = measures[index - 1] ?? null;
  if (!current || !previous) return <section className="hud-voice-coach"><div className="hud-panel-heading"><span>Chord-to-chord motion</span><strong>Voice-leading coach</strong><small>A second grouped chord reveals held and moving strands.</small></div><p className="hud-empty-copy">Play two chord gestures. The coach will trace each nearest voice without calling one path correct.</p></section>;
  const priorNotes = uniqueSorted(previous.gesture.attackedNotes);
  const currentNotes = uniqueSorted(current.gesture.attackedNotes);
  const profile = voiceLeadingProfile(priorNotes, currentNotes);
  const allNotes = [...priorNotes, ...currentNotes];
  const low = Math.min(...allNotes) - 1;
  const high = Math.max(...allNotes) + 1;
  const yFor = (note: number) => 142 - ((note - low) / Math.max(1, high - low)) * 104;
  const label = (note: number) => showConventions ? conventionalPitchName(note) : relativeSyllable(note, doMidi, scale);
  return <section className="hud-voice-coach" aria-labelledby="hud-voice-title">
    <div className="hud-panel-heading"><span>Chord-to-chord motion</span><strong id="hud-voice-title">Voice-leading coach</strong><small>Horizontal means held · slope shows direction and size · broken ends show entering or released voices.</small></div>
    <svg viewBox="0 0 720 176" role="img" aria-label={`${profile.strands.length} voice-leading strands; largest leap ${profile.largestLeap} key steps; ${profile.motionClasses.join(", ") || "no classified motion"}`}>
      <title>Nearest voice paths between the selected chord and the chord before it</title>
      <text x="82" y="18" className="hud-axis-label">previous</text><text x="638" y="18" className="hud-axis-label">selected</text>
      {profile.strands.map((strand, strandIndex) => {
        const fromX = strand.from == null ? 390 : 92;
        const toX = strand.to == null ? 330 : 628;
        const fromY = yFor(strand.from ?? strand.to!);
        const toY = yFor(strand.to ?? strand.from!);
        return <g key={`${strand.from}-${strand.to}-${strandIndex}`} className={`hud-voice-strand is-${strand.motion}`}>
          <line x1={fromX} y1={fromY} x2={toX} y2={toY} />
          {strand.from != null ? <><circle cx={fromX} cy={fromY} r="6" /><text x={fromX - 12} y={fromY + 4} className="hud-voice-label is-left">{label(strand.from)}</text></> : null}
          {strand.to != null ? <><circle cx={toX} cy={toY} r="6" /><text x={toX + 12} y={toY + 4} className="hud-voice-label">{label(strand.to)}</text></> : null}
          <text x={(fromX + toX) / 2} y={(fromY + toY) / 2 - 7} className="hud-point-label">{strand.motion === "held" ? "held" : strand.motion === "added" || strand.motion === "released" ? strand.motion : `${strand.semitones > 0 ? "+" : ""}${strand.semitones}`}</text>
        </g>;
      })}
    </svg>
    <div className="hud-voice-summary">
      <span><small>motion kind</small><strong>{profile.motionClasses.join(" + ") || "held / repeated"}</strong></span>
      <span><small>largest leap</small><strong>{profile.largestLeap} key step{profile.largestLeap === 1 ? "" : "s"}</strong></span>
      <span><small>bass motion</small><strong>{profile.bassMotion === 0 ? "held" : `${profile.bassMotion > 0 ? "up" : "down"} ${Math.abs(profile.bassMotion)}`}</strong></span>
    </div>
  </section>;
}

export function PianoLab() {
  const [events, setEvents] = useState<HudNoteEvent[]>([]);
  const [phraseEvents, setPhraseEvents] = useState<HudNoteEvent[]>([]);
  const [focusedId, setFocusedId] = useState<number | null>(null);
  const [selectedChordId, setSelectedChordId] = useState<string | null>(null);
  const [chordWindowMs, setChordWindowMs] = useState(160);
  const [boundaryCorrections, setBoundaryCorrections] = useState<Record<number, ChordBoundaryCorrection>>({});
  const [latchedNotes, setLatchedNotes] = useState<Map<number, number>>(new Map());
  const [showConventions, setShowConventions] = useState(false);
  const [frozen, setFrozen] = useState(false);
  const [focusLens, setFocusLens] = useState<FocusLens>("explore");
  const [intervalEchoTarget, setIntervalEchoTarget] = useState<IntervalEchoTarget | null>(null);
  const [ghostChord, setGhostChord] = useState<NearbyChord | null>(null);
  const [ghostNotes, setGhostNotes] = useState<number[]>([]);
  const [frameMode, setFrameMode] = useState<FrameMode>("discover");
  const [lockedScaleId, setLockedScaleId] = useState<PianoScale["id"]>(DEFAULT_SCALE.id);
  const [lockedDoMidi, setLockedDoMidi] = useState(60);
  const nextIdRef = useRef(1);
  const frozenRef = useRef(false);
  const eventsRef = useRef<HudNoteEvent[]>([]);
  const phraseEventsRef = useRef<HudNoteEvent[]>([]);
  const [rememberedFrame, setRememberedFrame] = useState<ScaleCandidate | null>(null);
  const [hydrated, setHydrated] = useState(false);
  const [nowMs, setNowMs] = useState(0);

  useEffect(() => { frozenRef.current = frozen; }, [frozen]);

  useEffect(() => {
    const hydrationTask = window.setTimeout(() => {
      const currentNow = currentHudTime();
      setNowMs(currentNow);
      const linkedLens = new URLSearchParams(window.location.search).get("pianoLens") as FocusLens | null;
      const validLinkedLens = FOCUS_LENSES.some((lens) => lens.id === linkedLens) ? linkedLens : null;
      if (validLinkedLens) setFocusLens(validLinkedLens);
      try {
        const raw = window.sessionStorage.getItem(PIANO_SESSION_KEY);
        if (raw) {
          const saved = JSON.parse(raw) as PersistedPianoSession;
          if (saved.version === 2 && Array.isArray(saved.phraseEvents)) {
            const lastOnset = saved.phraseEvents.at(-1)?.onsetMs ?? currentNow;
            const shift = currentNow - lastOnset - 350;
            const restoredPhrase = saved.phraseEvents.map((event) => ({
              ...event,
              onsetMs: event.onsetMs + shift,
              keyReleaseMs: event.keyReleaseMs == null ? null : event.keyReleaseMs + shift,
              releaseMs: event.releaseMs == null ? currentNow - 350 : event.releaseMs + shift,
              releaseReason: event.releaseReason ?? "key",
            }));
            const restoredEvents = restoredPhrase.slice(-7);
            phraseEventsRef.current = restoredPhrase;
            setPhraseEvents(restoredPhrase);
            eventsRef.current = restoredEvents;
            setEvents(restoredEvents);
            nextIdRef.current = Math.max(0, ...restoredPhrase.map((event) => event.id)) + 1;
            setFocusedId(restoredEvents.at(-1)?.id ?? null);
            setChordWindowMs(saved.chordWindowMs ?? 160);
            setBoundaryCorrections(saved.boundaryCorrections ?? {});
            setFocusLens(validLinkedLens ?? saved.focusLens ?? "explore");
            setShowConventions(Boolean(saved.showConventions));
            setFrameMode(saved.frameMode ?? "discover");
            setLockedScaleId(saved.lockedScaleId ?? DEFAULT_SCALE.id);
            setLockedDoMidi(saved.lockedDoMidi ?? 60);
            setGhostChord(saved.ghostChord ?? null);
            setGhostNotes(saved.ghostNotes ?? []);
          }
        }
      } catch {
        window.sessionStorage.removeItem(PIANO_SESSION_KEY);
      }
      setHydrated(true);
    }, 0);
    return () => window.clearTimeout(hydrationTask);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    const session: PersistedPianoSession = { version: 2, phraseEvents, chordWindowMs, boundaryCorrections, focusLens, showConventions, frameMode, lockedScaleId, lockedDoMidi, ghostChord, ghostNotes };
    try { window.sessionStorage.setItem(PIANO_SESSION_KEY, JSON.stringify(session)); } catch { /* Continue without persistence when storage is unavailable. */ }
  }, [boundaryCorrections, chordWindowMs, focusLens, frameMode, ghostChord, ghostNotes, hydrated, lockedDoMidi, lockedScaleId, phraseEvents, showConventions]);

  useEffect(() => {
    if (!phraseEvents.length) return;
    const timer = window.setInterval(() => setNowMs(currentHudTime()), 120);
    return () => window.clearInterval(timer);
  }, [phraseEvents.length]);

  const updateEvents = useCallback((updater: (current: HudNoteEvent[]) => HudNoteEvent[]) => {
    const nextPhrase = updater(phraseEventsRef.current);
    phraseEventsRef.current = nextPhrase;
    setPhraseEvents(nextPhrase);
    const next = updater(eventsRef.current);
    eventsRef.current = next;
    setEvents(next);
  }, []);

  const releaseEvent = useCallback((note: number, channel: number, source: HudNoteEvent["source"], atMs: number, heldByPedal: boolean) => {
    updateEvents((current) => {
      const index = current.findLastIndex((event) => event.note === note && event.channel === channel && event.source === source && event.releaseMs == null);
      if (index < 0) return current;
      return current.map((event, eventIndex) => eventIndex === index ? {
        ...event,
        keyReleaseMs: atMs,
        releaseMs: heldByPedal ? null : atMs,
        releaseReason: heldByPedal ? null : "key",
      } : event);
    });
  }, [updateEvents]);

  const releasePedalEvents = useCallback((notes: number[], channel: number, atMs: number) => {
    const released = new Set(notes);
    updateEvents((current) => current.map((event) => event.channel === channel && released.has(event.note) && event.keyReleaseMs != null && event.releaseMs == null ? { ...event, releaseMs: atMs, releaseReason: "pedal" } : event));
  }, [updateEvents]);

  const addEvent = useCallback((note: number, velocity: number, channel: number, source: HudNoteEvent["source"], fieldNotes: number[], atMs = currentHudTime()) => {
    if (frozenRef.current) return;
    const event: HudNoteEvent = { id: nextIdRef.current, note, velocity, channel, source, onsetMs: atMs, keyReleaseMs: null, releaseMs: null, releaseReason: null, fieldNotes: uniqueSorted(fieldNotes) };
    nextIdRef.current += 1;
    const nextEvents = pushRollingNoteEvent(eventsRef.current, event, 7);
    const nextPhraseEvents = pushPhraseEvent(phraseEventsRef.current, event, 60_000, 256);
    phraseEventsRef.current = nextPhraseEvents;
    setPhraseEvents(nextPhraseEvents);
    eventsRef.current = nextEvents;
    setEvents(nextEvents);
    const nextStable = scaleFrameTimeline(nextEvents.map((item) => item.note)).at(-1)?.stable;
    if (nextStable) setRememberedFrame(nextStable);
    setFocusedId(event.id);
    setNowMs(atMs);
  }, []);

  const midiAttack = useCallback((note: number, velocity: number, channel: number, midiField: number[], atMs: number) => {
    const combined = new Set([...latchedNotes.keys(), ...midiField]);
    addEvent(note, velocity, channel, "midi", Array.from(combined), atMs);
  }, [addEvent, latchedNotes]);
  const midiRelease = useCallback((note: number, channel: number, atMs: number, heldByPedal: boolean) => releaseEvent(note, channel, "midi", atMs, heldByPedal), [releaseEvent]);
  const midiSustain = useCallback((down: boolean, channel: number, atMs: number, releasedNotes: number[]) => { if (!down) releasePedalEvents(releasedNotes, channel, atMs); }, [releasePedalEvents]);
  const midi = useMidiKeyboard({ onAttack: midiAttack, onRelease: midiRelease, onSustain: midiSustain });

  const snapshots = useMemo(() => scaleFrameTimeline(events.map((event) => event.note)), [events]);
  const latestSnapshot = snapshots.at(-1);
  const discovered = latestSnapshot?.stable ?? rememberedFrame;
  const lockedScale = PIANO_SCALES.find((scale) => scale.id === lockedScaleId) ?? DEFAULT_SCALE;
  const frame: ScaleCandidate = frameMode === "locked"
    ? { scale: lockedScale, rootPitchClass: pitchClassFromMidi(lockedDoMidi), uniqueNoteCount: 0, inScaleCount: 0, routeCoveredCount: 0, matchFraction: 0, coverageFraction: 0, homePresent: false, fit: 0 }
    : discovered ?? { scale: DEFAULT_SCALE, rootPitchClass: 0, uniqueNoteCount: 0, inScaleCount: 0, routeCoveredCount: 0, matchFraction: 0, coverageFraction: 0, homePresent: false, fit: 0 };
  const doMidi = nearestMidiForPitchClass(frame.rootPitchClass, 60);
  const scale = frame.scale;
  const chordGestures = useMemo(() => groupChordGestures(events, chordWindowMs, chordWindowMs * 2, boundaryCorrections), [boundaryCorrections, chordWindowMs, events]);
  const chordMeasures = useMemo<ChordMeasure[]>(() => chordGestures.map((gesture, index) => {
    const pitchClassCount = new Set(gesture.attackedNotes.map(pitchClassFromMidi)).size;
    const candidates = pitchClassCount <= 5 ? identifyChordCandidates(gesture.attackedNotes, 3) : [];
    const candidate = candidates.find((item) => item.exact) ?? candidates[0] ?? null;
    const soundingNotes = gesture.soundingNotesAtClose.length ? gesture.soundingNotesAtClose : uniqueSorted(gesture.attackedNotes);
    const perception = soundingNotes.length >= 2 ? sonorityPerceptionModel(soundingNotes.map((note) => ({ frequencyHz: frequencyFromMidi(note), amplitude: 0.72, partialCount: 9 }))) : null;
    const tendency = tonalTendency(soundingNotes, doMidi, scale);
    const previous = chordGestures[index - 1];
    const previousPitchClassCount = previous ? new Set(previous.attackedNotes.map(pitchClassFromMidi)).size : 0;
    const previousCandidates = previous && previousPitchClassCount <= 5 ? identifyChordCandidates(previous.attackedNotes, 3) : [];
    const previousCandidate = previousCandidates.find((item) => item.exact) ?? previousCandidates[0] ?? null;
    const transition = chordTransitionEvidence(previous?.attackedNotes ?? null, gesture.attackedNotes, previousCandidate?.exact ? previousCandidate.rootPitchClass : null, candidate?.exact ? candidate.rootPitchClass : null);
    return {
      gesture,
      candidate,
      hasPreviousChord: Boolean(previous),
      crunch: perception?.roughness ?? null,
      pull: tendency.homePull,
      arrival: (perception?.repose ?? 0.5) * 0.55 + tendency.homeEvidence * 0.45,
      novelty: transition.pitchSetNovelty,
      motion: transition.voiceMotion,
      rootTravel: transition.rootTravel,
      rootTravelSteps: transition.rootTravelSteps,
      commonPitchClassCount: transition.commonPitchClassCount,
    };
  }), [chordGestures, doMidi, scale]);
  const selectedChordMeasure = chordMeasures.find((measure) => measure.gesture.id === selectedChordId) ?? chordMeasures.at(-1) ?? null;
  const effectiveSelectedChordId = selectedChordMeasure?.gesture.id ?? null;
  const selectedGesture = selectedChordMeasure?.gesture ?? null;

  const activeNotesMap = useMemo(() => {
    const combined = new Map(latchedNotes);
    midi.notes.forEach((velocity, note) => combined.set(note, velocity));
    return combined;
  }, [latchedNotes, midi.notes]);
  const activeNoteNumbers = useMemo(() => uniqueSorted(Array.from(activeNotesMap.keys())), [activeNotesMap]);
  const lastField = events.at(-1)?.fieldNotes ?? [];
  const fieldNotes = activeNoteNumbers.length ? activeNoteNumbers : lastField;
  const fieldIsLive = activeNoteNumbers.length > 0;
  const analysisNotes = selectedGesture?.attackedNotes ?? fieldNotes;
  const soundingAnalysisNotes = selectedGesture?.soundingNotesAtClose.length ? selectedGesture.soundingNotesAtClose : analysisNotes;
  const inheritedAnalysisNotes = selectedGesture?.inheritedNotes ?? [];
  const fieldPitchClassCount = new Set(analysisNotes.map((note) => pitchClassFromMidi(note))).size;
  const chordCandidates = identifyChordCandidates(analysisNotes, 3);
  const nearby = analysisNotes.length ? nearbyScaleChords(analysisNotes, doMidi, scale, 3) : [];
  const ghostAttemptNotes = activeNoteNumbers.length ? activeNoteNumbers : chordGestures.at(-1)?.attackedNotes ?? [];
  const ghostMatched = ghostChord ? samePitchClasses(ghostAttemptNotes, ghostChord.pitchClasses) : false;
  const focusedEvent = events.find((event) => event.id === focusedId) ?? events.at(-1) ?? null;

  const measures = useMemo<EventMeasure[]>(() => events.map((event, index) => {
    const notes = uniqueSorted(event.fieldNotes);
    const perception = notes.length >= 2 ? sonorityPerceptionModel(notes.map((note) => ({ frequencyHz: frequencyFromMidi(note), amplitude: Math.max(0.12, (note === event.note ? event.velocity : 88) / 127), partialCount: 9 }))) : null;
    const tendency = tonalTendency(notes, doMidi, scale);
    const previous = events[index - 1];
    const interval = previous ? Math.abs(event.note - previous.note) : 0;
    return {
      event,
      crunch: perception?.roughness ?? null,
      pull: tendency.homePull,
      arrival: (perception?.repose ?? 0.5) * 0.55 + tendency.homeEvidence * 0.45,
      novelty: previous ? (events.slice(0, index).some((prior) => pitchClassFromMidi(prior.note) === pitchClassFromMidi(event.note)) ? Math.min(0.35, interval / 36) : Math.min(1, 0.72 + interval / 48)) : 0,
      motion: previous ? Math.min(1, interval / 7) : 0,
    };
  }), [doMidi, events, scale]);

  const currentMeasure = measures.at(-1);
  const previousMeasure = measures.at(-2);
  const resolution = currentMeasure ? resolutionDirection(previousMeasure?.arrival ?? null, currentMeasure.arrival) : null;
  const latestInterval = events.length >= 2 ? intervalLandmark(events.at(-1)!.note - events.at(-2)!.note) : null;

  const toggleScreenKey = (note: number) => {
    const next = new Map(latchedNotes);
    if (next.has(note)) {
      next.delete(note);
      releaseEvent(note, 0, "screen", currentHudTime(), false);
    }
    else {
      next.set(note, 104);
      const combined = new Set([...next.keys(), ...midi.notes.keys()]);
      addEvent(note, 104, 0, "screen", Array.from(combined));
    }
    setLatchedNotes(next);
  };

  const clearAll = () => {
    phraseEventsRef.current = [];
    setPhraseEvents([]);
    eventsRef.current = [];
    setEvents([]);
    setFocusedId(null);
    setSelectedChordId(null);
    setRememberedFrame(null);
    setBoundaryCorrections({});
    setIntervalEchoTarget(null);
    setGhostChord(null);
    setGhostNotes([]);
    setLatchedNotes(new Map());
    midi.clear();
  };

  const setBoundaryCorrection = (eventId: number, correction: ChordBoundaryCorrection | null) => {
    setBoundaryCorrections((current) => {
      const next = { ...current };
      if (correction) next[eventId] = correction;
      else delete next[eventId];
      return next;
    });
    setSelectedChordId(null);
  };

  const lockCandidate = (candidate: ScaleCandidate) => {
    setLockedScaleId(candidate.scale.id);
    setLockedDoMidi(nearestMidiForPitchClass(candidate.rootPitchClass, 60));
    setFrameMode("locked");
  };

  const toggleFrameMode = () => {
    if (frameMode === "discover") {
      setLockedScaleId(scale.id);
      setLockedDoMidi(doMidi);
      setFrameMode("locked");
    } else setFrameMode("discover");
  };

  const selectFocusLens = (lens: FocusLens) => {
    setFocusLens(lens);
    const url = new URL(window.location.href);
    url.searchParams.set("pianoLens", lens);
    window.history.replaceState(null, "", url);
  };

  const chooseGhostChord = (chord: NearbyChord) => {
    const center = analysisNotes.length ? analysisNotes.reduce((sum, note) => sum + note, 0) / analysisNotes.length : 60;
    setGhostChord(chord);
    setGhostNotes(voiceChordNear(chord.pitchClasses, analysisNotes, center));
  };

  const newestInsight = focusedEvent ? (() => {
    const context = noteContext(focusedEvent.note, doMidi, scale);
    const fieldCandidate = fieldPitchClassCount <= 5 ? selectedChordMeasure?.candidate ?? chordCandidates[0] : undefined;
    const intervalCopy = latestInterval ? `${latestInterval.relationship} from the prior attack` : "the first attack in this trace";
    const routeCopy = context.inScale ? `inside the current ${scale.name}` : `outside the current route`;
    const motionCopy = resolution?.label ?? "building a baseline";
    const transitionCopy = selectedChordMeasure ? selectedChordMeasure.hasPreviousChord ? `Grouped across ${Math.round(selectedChordMeasure.gesture.spreadMs)} ms: ${evidenceWord(selectedChordMeasure.novelty)} pitch-set novelty, ${evidenceWord(selectedChordMeasure.motion)} voice motion${selectedChordMeasure.rootTravelSteps == null ? "" : `, and ${selectedChordMeasure.rootTravelSteps} fifths step${selectedChordMeasure.rootTravelSteps === 1 ? "" : "s"} of root travel`}.` : `Grouped across ${Math.round(selectedChordMeasure.gesture.spreadMs)} ms; this first chord gesture sets the transition baseline.` : "";
    const chordCopy = fieldCandidate ? fieldCandidate.exact ? `The ${selectedGesture ? "grouped attacks" : fieldIsLive ? "held" : "last"} form ${chordLabel(fieldCandidate, doMidi, showConventions)}.` : `The grouped field may outline ${chordLabel(fieldCandidate, doMidi, showConventions)}; tones are missing or added.` : fieldPitchClassCount > 5 ? `The ${fieldPitchClassCount}-position field is scale-like, so no chord label is forced.` : "Hold another note to expose chord relationships.";
    return `${showConventions ? conventionalPitchName(focusedEvent.note) : context.syllable} arrived as ${intervalCopy}, ${routeCopy}; modeled evidence is ${motionCopy}. ${chordCopy} ${transitionCopy}`.trim();
  })() : "Play a MIDI or on-screen key. One note attack will appear in every view at once.";

  const renderKey = (note: number, black: boolean) => {
    const context = noteContext(note, doMidi, scale);
    const active = activeNotesMap.has(note);
    const pressed = midi.pressed.has(note);
    const sustained = midi.sustained.has(note);
    const focused = focusedEvent?.note === note;
    const chordMember = selectedGesture?.attackedNotes.includes(note) ?? false;
    const inherited = selectedGesture?.inheritedNotes.includes(note) ?? false;
    const ghost = ghostNotes.includes(note);
    const home = context.stepsWithinOctave === 0;
    const className = ["piano-key", black ? "is-black" : "is-white", context.inScale ? "is-in-scale" : "", active ? "is-active" : "", pressed ? "is-pressed" : "", sustained ? "is-sustained" : "", focused ? "is-focused" : "", chordMember ? "is-chord-member" : "", inherited ? "is-inherited" : "", ghost ? "is-ghost" : "", home ? "is-home" : ""].filter(Boolean).join(" ");
    const style = ({
      "--key-left": black ? `${(WHITE_NOTES.filter((white) => white < note).length / WHITE_NOTES.length) * 100}%` : `${(WHITE_NOTES.indexOf(note) / WHITE_NOTES.length) * 100}%`,
      "--key-width": `${100 / WHITE_NOTES.length}%`,
    } as CSSProperties);
    return <button key={note} type="button" className={className} style={style} aria-pressed={active} aria-label={`${context.syllable}, ${context.inScale ? "in" : "outside"} the current route, ${formatHz(context.frequencyHz)}${showConventions ? `, ${conventionalPitchName(note)}` : ""}${sustained ? ", sustained by pedal" : ""}${chordMember ? ", attacked in selected chord" : inherited ? ", inherited into selected chord field" : ""}${ghost ? ", silent ghost target" : ""}`} onClick={() => toggleScreenKey(note)}><span>{context.inScale || active || home || ghost ? context.syllable : "·"}</span>{showConventions ? <small>{conventionalPitchName(note)}</small> : null}</button>;
  };

  const exactChord = chordCandidates.find((candidate) => candidate.exact);
  const leadingChord = fieldPitchClassCount <= 5 ? selectedChordMeasure?.candidate ?? exactChord ?? chordCandidates[0] : undefined;

  return (
    <section className="advanced-lab piano-lab piano-hud" aria-labelledby="piano-hud-title">
      <header className="piano-hud-header">
        <div><p className="section-kicker">Silent MIDI piano companion · one coordinated view</p><h2 id="piano-hud-title">See relationships as your hands play.</h2><p>Every attack keeps one numbered column across staff, frequency, and evidence. MIDI sends note data only—there is no sound, recording, or upload.</p></div>
        <div className="piano-hud-controls" aria-label="HUD controls">
          <div className="midi-status"><i className={midi.inputs.length ? "is-connected" : ""} aria-hidden="true" /><div><span>MIDI</span><strong role="status">{midi.status}</strong></div></div>
          {midi.inputs.length ? <label htmlFor="hud-midi-input"><span>Input</span><select id="hud-midi-input" value={midi.selectedInputId} onChange={(event) => midi.setSelectedInputId(event.target.value)}>{midi.inputs.map((input) => <option key={input.id} value={input.id}>{[input.manufacturer, input.name].filter(Boolean).join(" · ") || "MIDI input"}</option>)}</select></label> : <button type="button" className="piano-primary-action" onClick={midi.connect}>{midi.supported === false ? "Retry MIDI" : "Connect MIDI"}</button>}
          <label htmlFor="hud-chord-window"><span>Chord grouping</span><select id="hud-chord-window" value={chordWindowMs} onChange={(event) => { setChordWindowMs(Number(event.target.value)); setSelectedChordId(null); }}><option value={80}>Together · 80 ms</option><option value={160}>Natural · 160 ms</option><option value={320}>Rolled · 320 ms</option></select></label>
          <button type="button" aria-pressed={frozen} onClick={() => setFrozen((current) => !current)}>{frozen ? "Resume trace" : "Freeze trace"}</button>
          <button type="button" aria-pressed={frameMode === "locked"} onClick={toggleFrameMode}>{frameMode === "locked" ? "Unlock Do" : "Lock Do"}</button>
          <label className="piano-convention-toggle"><input type="checkbox" checked={showConventions} onChange={(event) => setShowConventions(event.target.checked)} /><span>Theory names</span></label>
          <button type="button" onClick={clearAll}>Clear</button>
        </div>
      </header>

      <div className="piano-hud-statebar">
        <span className={frameMode === "locked" ? "is-locked" : ""}>{frameMode === "locked" ? "Locked frame" : "Discovering frame"}</span>
        <strong>Do · {formatHz(frequencyFromMidi(doMidi))}{showConventions ? ` · ${conventionalPitchName(doMidi)}` : ""}</strong>
        <small>{latestSnapshot?.evidenceLabel ?? "Play four distinct positions before the frame can move."} · group gaps up to {chordWindowMs} ms ({chordWindowMs * 2} ms maximum span)</small>
        <em>{frozen ? "Trace frozen; held keys still show below." : `${phraseEvents.length} in phrase · ${events.length}/7 in microscope`}</em>
      </div>

      <div className="piano-model-disclosure"><strong>Assumed sound model</strong><span>12-key equal temperament · harmonic piano-like spectrum · 9 partials per note · MIDI events only</span><small>Roughness and repose are predictions from that standardized spectrum. They do not analyze the actual sound of your piano, keyboard patch, room, or DAW.</small></div>

      <nav className="piano-focus-lenses" aria-label="Learning focus">
        {FOCUS_LENSES.map((lens) => <button key={lens.id} type="button" aria-pressed={focusLens === lens.id} onClick={() => selectFocusLens(lens.id)}><strong>{lens.label}</strong><span>{lens.description}</span></button>)}
      </nav>

      <PhraseRibbon events={phraseEvents} nowMs={nowMs || phraseEvents.at(-1)?.onsetMs || 0} doMidi={doMidi} scale={scale} focusedId={focusedEvent?.id ?? null} showConventions={showConventions} />

      <div className="hud-event-selector" aria-label="Select an event across every view">{events.map((event, index) => <button key={event.id} type="button" aria-pressed={focusedEvent?.id === event.id} onClick={() => { setFocusedId(event.id); const containing = chordGestures.find((gesture) => gesture.attacks.some((attack) => attack.id === event.id)); if (containing) setSelectedChordId(containing.id); }}><strong>{index + 1}</strong><span>{showConventions ? conventionalPitchName(event.note) : relativeSyllable(event.note, doMidi, scale)}</span><small>{durationLabel(event, nowMs || event.onsetMs)}{event.releaseReason === "pedal" ? " · pedal" : ""}</small></button>)}</div>

      {(focusLens === "explore" || focusLens === "chords") ? <ChordGestureLane events={events} measures={chordMeasures} selectedChordId={effectiveSelectedChordId} focusedId={focusedEvent?.id ?? null} boundaryCorrections={boundaryCorrections} doMidi={doMidi} showConventions={showConventions} onBoundaryChange={setBoundaryCorrection} onSelect={(id) => { setSelectedChordId(id); const gesture = chordGestures.find((item) => item.id === id); if (gesture) setFocusedId(gesture.attacks.at(-1)!.id); }} /> : null}

      {focusLens === "explore" ? <div className="piano-hud-main">
        <div className="hud-phrase-stack">
          <StaffView events={events} gestures={chordGestures} selectedChordId={effectiveSelectedChordId} doMidi={doMidi} scale={scale} focusedId={focusedEvent?.id ?? null} showConventions={showConventions} />
          <FrequencyView events={events} gestures={chordGestures} selectedChordId={effectiveSelectedChordId} doMidi={doMidi} scale={scale} focusedId={focusedEvent?.id ?? null} showConventions={showConventions} />
        </div>
        <div className="hud-context-stack">
          <FifthsCompass events={events} activeNotes={activeNoteNumbers} chordNotes={analysisNotes} chordRootPitchClass={selectedChordMeasure?.candidate?.exact ? selectedChordMeasure.candidate.rootPitchClass : null} doMidi={doMidi} scale={scale} focusedNote={focusedEvent?.note ?? null} showConventions={showConventions} />
          <ScaleLens events={events} chordNotes={analysisNotes} snapshots={snapshots} frame={frame} doMidi={doMidi} showConventions={showConventions} onAdopt={lockCandidate} />
        </div>
      </div> : focusLens === "intervals" ? <div className="piano-focus-grid is-intervals">
        <StaffView events={events} gestures={chordGestures} selectedChordId={effectiveSelectedChordId} doMidi={doMidi} scale={scale} focusedId={focusedEvent?.id ?? null} showConventions={showConventions} />
        <FrequencyView events={events} gestures={chordGestures} selectedChordId={effectiveSelectedChordId} doMidi={doMidi} scale={scale} focusedId={focusedEvent?.id ?? null} showConventions={showConventions} />
      </div> : focusLens === "scales" ? <div className="piano-focus-grid is-scales">
        <FifthsCompass events={events} activeNotes={activeNoteNumbers} chordNotes={analysisNotes} chordRootPitchClass={selectedChordMeasure?.candidate?.exact ? selectedChordMeasure.candidate.rootPitchClass : null} doMidi={doMidi} scale={scale} focusedNote={focusedEvent?.note ?? null} showConventions={showConventions} />
        <ScaleLens events={events} chordNotes={analysisNotes} snapshots={snapshots} frame={frame} doMidi={doMidi} showConventions={showConventions} onAdopt={lockCandidate} />
      </div> : focusLens === "motion" ? <div className="piano-focus-grid is-motion">
        <FrequencyView events={events} gestures={chordGestures} selectedChordId={effectiveSelectedChordId} doMidi={doMidi} scale={scale} focusedId={focusedEvent?.id ?? null} showConventions={showConventions} />
        <VoiceLeadingCoach measures={chordMeasures} selectedId={effectiveSelectedChordId} doMidi={doMidi} scale={scale} showConventions={showConventions} />
      </div> : null}

      <div className="piano-hud-keyboard-wrap">
        <div className="hud-panel-heading"><span>Held + grouped notes</span><strong>Persistent keyboard field</strong><small>solid held · ring sustained · gold chord attack · dotted inherited · dashed ghost target · double mark Do</small></div>
        <div className="piano-keyboard hud-keyboard" role="group" aria-label="Silent two-octave on-screen piano">{WHITE_NOTES.map((note) => renderKey(note, false))}{VISIBLE_NOTES.filter((note) => !WHITE_PITCH_CLASSES.has(pitchClassFromMidi(note))).map((note) => renderKey(note, true))}</div>
      </div>

      {(focusLens === "explore" || focusLens === "chords") ? <div className="piano-hud-analysis">
        <section className="hud-chord-panel" aria-labelledby="hud-chord-title">
          <div className="hud-panel-heading"><span>{selectedGesture ? `${selectedGesture.kind} gesture · ${Math.round(selectedGesture.spreadMs)} ms` : fieldIsLive ? "Held now" : events.length ? "Last outlined field" : "Waiting for a field"}</span><strong id="hud-chord-title">Chord identity</strong><small>Chord attacks determine identity; already-held and pedal tones remain visible as inherited context.</small></div>
          {leadingChord ? <div className="hud-chord-result"><span>{leadingChord.exact ? "exact pitch-class match" : "possible outline"}</span><strong>{chordLabel(leadingChord, doMidi, showConventions)}</strong><small>{leadingChord.inversion > 0 ? `inversion ${leadingChord.inversion} · ` : ""}{leadingChord.missingPitchClasses.length ? `${leadingChord.missingPitchClasses.length} missing · ` : ""}{leadingChord.extraPitchClasses.length ? `${leadingChord.extraPitchClasses.length} added` : "no added tones"}</small></div> : fieldPitchClassCount > 5 ? <div className="hud-chord-result"><span>scale-like pitch field</span><strong>{fieldPitchClassCount} distinct positions</strong><small>Too many simultaneous positions for a useful chord-template label; inspect the interval texture and scale lens instead.</small></div> : <p className="hud-empty-copy">Hold two or more notes. The HUD will name exact matches separately from incomplete outlines.</p>}
          {selectedChordMeasure ? <div className="hud-chord-metrics" aria-label="Selected chord evidence">
            <span><small>roughness</small><strong>{selectedChordMeasure.crunch == null ? "—" : Math.round(selectedChordMeasure.crunch * 100)}</strong><em>{selectedChordMeasure.crunch == null ? "no field" : evidenceWord(selectedChordMeasure.crunch)}</em></span>
            <span><small>toward Do</small><strong>{Math.round(selectedChordMeasure.pull * 100)}</strong><em>{evidenceWord(selectedChordMeasure.pull)}</em></span>
            <span><small>repose</small><strong>{Math.round(selectedChordMeasure.arrival * 100)}</strong><em>{evidenceWord(selectedChordMeasure.arrival)}</em></span>
            <span><small>pitch change</small><strong>{selectedChordMeasure.hasPreviousChord ? Math.round(selectedChordMeasure.novelty * 100) : "—"}</strong><em>{selectedChordMeasure.hasPreviousChord ? evidenceWord(selectedChordMeasure.novelty) : "baseline"}</em></span>
            <span><small>voice motion</small><strong>{selectedChordMeasure.hasPreviousChord ? Math.round(selectedChordMeasure.motion * 100) : "—"}</strong><em>{selectedChordMeasure.hasPreviousChord ? evidenceWord(selectedChordMeasure.motion) : "baseline"}</em></span>
            <span><small>fifths move</small><strong>{selectedChordMeasure.rootTravelSteps == null ? "—" : selectedChordMeasure.rootTravelSteps}</strong><em>{selectedChordMeasure.rootTravelSteps == null ? selectedChordMeasure.hasPreviousChord ? "root uncertain" : "baseline" : selectedChordMeasure.rootTravelSteps === 1 ? "neighbor" : "steps"}</em></span>
          </div> : null}
          <div className="hud-field-notes">{soundingAnalysisNotes.map((note) => <span key={note} className={inheritedAnalysisNotes.includes(note) ? "is-inherited" : ""}><strong>{relativeSyllable(note, doMidi, scale)}</strong><small>{inheritedAnalysisNotes.includes(note) ? "inherited" : showConventions ? conventionalPitchName(note) : formatHz(frequencyFromMidi(note))}</small></span>)}</div>
        </section>

        <section className="hud-nearby-panel" aria-labelledby="hud-nearby-title">
          <div className="hud-panel-heading"><span>Choose, then perform</span><strong id="hud-nearby-title">Silent ghost targets</strong><small>Ranked by shared tones and changed pitch classes. A choice marks keys but never enters or sounds notes.</small></div>
          <ol>{nearby.map((chord) => <li key={`${chord.rootPitchClass}-${chord.degreeIndex}`}><button type="button" aria-pressed={ghostChord?.rootPitchClass === chord.rootPitchClass && ghostChord.degreeIndex === chord.degreeIndex} onClick={() => chooseGhostChord(chord)}><span>{chord.syllable} · degree {chord.degreeIndex + 1}</span><strong>Aim for {nearbyLabel(chord, doMidi, showConventions)}</strong><small>{chord.instruction}</small></button></li>)}</ol>
          {ghostChord ? <div className={`hud-ghost-feedback ${ghostMatched ? "is-match" : ""}`} role="status"><span>{ghostMatched ? "Target matched" : "Ghost keys waiting"}</span><strong>{ghostNotes.map((note) => showConventions ? conventionalPitchName(note) : relativeSyllable(note, doMidi, scale)).join(" · ")}</strong><small>{ghostMatched ? "You supplied the notes. Compare the new voice-leading and causal views." : "Release the source chord, then play the outlined keys in any order."}</small><button type="button" onClick={() => { setGhostChord(null); setGhostNotes([]); }}>Clear target</button></div> : null}
          {!nearby.length ? <p className="hud-empty-copy">Play a note or chord before comparing close, scale-derived moves.</p> : null}
        </section>

        <RelationshipTexture notes={soundingAnalysisNotes} inheritedNotes={inheritedAnalysisNotes} doMidi={doMidi} scale={scale} showConventions={showConventions} />
      </div> : null}

      {(focusLens === "explore" || focusLens === "chords") ? <div className="piano-chord-learning-grid"><ChordCausePanel measures={chordMeasures} selectedId={effectiveSelectedChordId} doMidi={doMidi} showConventions={showConventions} /><VoiceLeadingCoach measures={chordMeasures} selectedId={effectiveSelectedChordId} doMidi={doMidi} scale={scale} showConventions={showConventions} /></div> : null}

      {focusLens === "intervals" ? <div className="piano-focus-grid is-interval-practice"><IntervalEcho events={events} target={intervalEchoTarget} doMidi={doMidi} scale={scale} showConventions={showConventions} onSetTarget={setIntervalEchoTarget} onClear={() => setIntervalEchoTarget(null)} /><RelationshipTexture notes={soundingAnalysisNotes} inheritedNotes={inheritedAnalysisNotes} doMidi={doMidi} scale={scale} showConventions={showConventions} /></div> : null}

      {(focusLens === "explore" || focusLens === "motion") ? <EvidenceTrace measures={measures} chordMeasures={chordMeasures} events={events} selectedChordId={effectiveSelectedChordId} /> : null}

      <footer className="piano-hud-insight" aria-live="polite"><span>What changed?</span><strong>{newestInsight}</strong><small>The ribbon retains sixty seconds while the coordinated views magnify the latest seven attacks. Chord crunch, pull, and repose use a standardized nine-partial proxy; voice strands use nearest keyboard motion, not intended fingering. Musical goodness still depends on timing, style, memory, intention, and your response.</small></footer>
    </section>
  );
}
