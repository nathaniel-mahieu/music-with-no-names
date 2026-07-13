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
  pushRollingNoteEvent,
  resolutionDirection,
  scaleFrameTimeline,
  scaleSemitones,
  tonalTendency,
  type ChordCandidate,
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

const WHITE_PITCH_CLASSES = new Set([0, 2, 4, 5, 7, 9, 11]);
const VISIBLE_NOTES = Array.from({ length: 25 }, (_, index) => 48 + index);
const WHITE_NOTES = VISIBLE_NOTES.filter((note) => WHITE_PITCH_CLASSES.has(pitchClassFromMidi(note)));
const DEFAULT_SCALE = PIANO_SCALES[0];
const FIFTHS_ORDER = fifthsCircle();
const EVENT_X = (slot: number) => 84 + slot * 88;

function formatHz(value: number) {
  return `${value.toFixed(value < 1000 ? 1 : 0)} Hz`;
}

function uniqueSorted(notes: number[]) {
  return [...new Set(notes.map(Math.round))].sort((first, second) => first - second);
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

function useMidiKeyboard(onAttack: (note: number, velocity: number, channel: number, fieldNotes: number[]) => void) {
  const accessRef = useRef<MidiAccessLike | null>(null);
  const pressedRef = useRef(new Set<number>());
  const sustainedRef = useRef(new Set<number>());
  const sustainDownRef = useRef(false);
  const notesRef = useRef(new Map<number, number>());
  const onAttackRef = useRef(onAttack);
  const [supported, setSupported] = useState<boolean | null>(null);
  const [inputs, setInputs] = useState<MidiInputLike[]>([]);
  const [selectedInputId, setSelectedInputId] = useState("");
  const [notes, setNotes] = useState<Map<number, number>>(new Map());
  const [pressed, setPressed] = useState<Set<number>>(new Set());
  const [sustained, setSustained] = useState<Set<number>>(new Set());
  const [status, setStatus] = useState("Connect a MIDI keyboard, or use the silent on-screen keys.");

  useEffect(() => { onAttackRef.current = onAttack; }, [onAttack]);

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
      if (message.type === "note-on") {
        pressedRef.current.add(message.note);
        sustainedRef.current.delete(message.note);
        notesRef.current.set(message.note, message.velocity);
        publish();
        onAttackRef.current(message.note, message.velocity, message.channel, uniqueSorted(Array.from(notesRef.current.keys())));
      } else if (message.type === "note-off") {
        pressedRef.current.delete(message.note);
        if (sustainDownRef.current) sustainedRef.current.add(message.note);
        else notesRef.current.delete(message.note);
        publish();
      } else if (message.type === "sustain") {
        sustainDownRef.current = message.down;
        if (!message.down) {
          sustainedRef.current.forEach((note) => {
            if (!pressedRef.current.has(note)) notesRef.current.delete(note);
          });
          sustainedRef.current.clear();
        }
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
      <div className="hud-panel-heading"><span>Last seven attacks</span><strong>Grand staff</strong><small>Onset order is measured; note lengths are not inferred.</small></div>
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

function ChordGestureLane({ events, measures, selectedChordId, doMidi, showConventions, onSelect }: {
  events: HudNoteEvent[];
  measures: ChordMeasure[];
  selectedChordId: string | null;
  doMidi: number;
  showConventions: boolean;
  onSelect: (id: string) => void;
}) {
  return (
    <div className="hud-chord-lane" aria-label="Chord gestures grouped by attack timing">
      <span className="hud-chord-lane-label">chord grouping</span>
      <div>
        {measures.map((measure) => {
          const slots = gestureSlots(measure.gesture, events);
          const label = measure.candidate ? chordLabel(measure.candidate, doMidi, showConventions) : `${new Set(measure.gesture.attackedNotes.map(pitchClassFromMidi)).size}-position field`;
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
      <div className="hud-panel-heading"><span>Same attacks</span><strong>Log-frequency height</strong><small>Equal vertical steps mean equal frequency ratios.</small></div>
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
      <div className="hud-panel-heading"><span>Absolute pitch geography</span><strong>Fifths compass</strong><small>Clockwise neighbors differ by the near-3:2 relation.</small></div>
      <div className="hud-fifths-circle" role="img" aria-label="Circle of fifths with the last seven event numbers, active notes, and selected chord members">
        <div className="hud-fifths-center"><span>{chordNotes.length ? "selected chord" : "current frame"}</span><strong>{chordRootPitchClass == null ? "Do" : showConventions ? CONVENTIONAL_PITCH_CLASSES[chordRootPitchClass] : CHROMATIC_SOLFEGE[pitchClassFromMidi(chordRootPitchClass - pitchClassFromMidi(doMidi))]}</strong><small>{chordNotes.length ? `${new Set(chordNotes.map(pitchClassFromMidi)).size} positions` : showConventions ? CONVENTIONAL_PITCH_CLASSES[pitchClassFromMidi(doMidi)] : scale.name.replace(" route", "")}</small></div>
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
      <div className="hud-panel-heading"><span>Changing hypothesis</span><strong>Scale lens</strong><small>{latest?.evidenceLabel ?? "no evidence"} · compatibility, not certainty</small></div>
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
      <div className="hud-panel-heading"><span>Inside the selected chord field</span><strong>Interval texture</strong><small>Thicker arcs sit nearer simple ratio landmarks; hollow nodes were already sounding.</small></div>
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
      <div className="hud-panel-heading"><span>Separate evidence, shared time</span><strong>Perceptual motion</strong><small>Lines follow attack fields; diamonds summarize grouped chords. No overall goodness score.</small></div>
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
            if (value == null) return null;
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

export function PianoLab() {
  const [events, setEvents] = useState<HudNoteEvent[]>([]);
  const [focusedId, setFocusedId] = useState<number | null>(null);
  const [selectedChordId, setSelectedChordId] = useState<string | null>(null);
  const [chordWindowMs, setChordWindowMs] = useState(160);
  const [latchedNotes, setLatchedNotes] = useState<Map<number, number>>(new Map());
  const [showConventions, setShowConventions] = useState(false);
  const [frozen, setFrozen] = useState(false);
  const [frameMode, setFrameMode] = useState<FrameMode>("discover");
  const [lockedScaleId, setLockedScaleId] = useState<PianoScale["id"]>(DEFAULT_SCALE.id);
  const [lockedDoMidi, setLockedDoMidi] = useState(60);
  const nextIdRef = useRef(1);
  const frozenRef = useRef(false);
  const eventsRef = useRef<HudNoteEvent[]>([]);
  const [rememberedFrame, setRememberedFrame] = useState<ScaleCandidate | null>(null);

  useEffect(() => { frozenRef.current = frozen; }, [frozen]);

  const addEvent = useCallback((note: number, velocity: number, channel: number, source: HudNoteEvent["source"], fieldNotes: number[]) => {
    if (frozenRef.current) return;
    const event: HudNoteEvent = { id: nextIdRef.current, note, velocity, channel, source, onsetMs: performance.now(), fieldNotes: uniqueSorted(fieldNotes) };
    nextIdRef.current += 1;
    const nextEvents = pushRollingNoteEvent(eventsRef.current, event, 7);
    eventsRef.current = nextEvents;
    setEvents(nextEvents);
    const nextStable = scaleFrameTimeline(nextEvents.map((item) => item.note)).at(-1)?.stable;
    if (nextStable) setRememberedFrame(nextStable);
    setFocusedId(event.id);
  }, []);

  const midiAttack = useCallback((note: number, velocity: number, channel: number, midiField: number[]) => {
    const combined = new Set([...latchedNotes.keys(), ...midiField]);
    addEvent(note, velocity, channel, "midi", Array.from(combined));
  }, [addEvent, latchedNotes]);
  const midi = useMidiKeyboard(midiAttack);

  const snapshots = useMemo(() => scaleFrameTimeline(events.map((event) => event.note)), [events]);
  const latestSnapshot = snapshots.at(-1);
  const discovered = latestSnapshot?.stable ?? rememberedFrame;
  const lockedScale = PIANO_SCALES.find((scale) => scale.id === lockedScaleId) ?? DEFAULT_SCALE;
  const frame: ScaleCandidate = frameMode === "locked"
    ? { scale: lockedScale, rootPitchClass: pitchClassFromMidi(lockedDoMidi), uniqueNoteCount: 0, inScaleCount: 0, routeCoveredCount: 0, matchFraction: 0, coverageFraction: 0, homePresent: false, fit: 0 }
    : discovered ?? { scale: DEFAULT_SCALE, rootPitchClass: 0, uniqueNoteCount: 0, inScaleCount: 0, routeCoveredCount: 0, matchFraction: 0, coverageFraction: 0, homePresent: false, fit: 0 };
  const doMidi = nearestMidiForPitchClass(frame.rootPitchClass, 60);
  const scale = frame.scale;
  const chordGestures = useMemo(() => groupChordGestures(events, chordWindowMs, chordWindowMs * 2), [chordWindowMs, events]);
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
  const nearby = nearbyScaleChords(analysisNotes, doMidi, scale, 3);
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
    if (next.has(note)) next.delete(note);
    else {
      next.set(note, 104);
      const combined = new Set([...next.keys(), ...midi.notes.keys()]);
      addEvent(note, 104, 0, "screen", Array.from(combined));
    }
    setLatchedNotes(next);
  };

  const clearAll = () => {
    eventsRef.current = [];
    setEvents([]);
    setFocusedId(null);
    setSelectedChordId(null);
    setRememberedFrame(null);
    setLatchedNotes(new Map());
    midi.clear();
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

  const placeNearbyChord = (chord: NearbyChord) => {
    const center = analysisNotes.length ? analysisNotes.reduce((sum, note) => sum + note, 0) / analysisNotes.length : 60;
    const notes = chord.pitchClasses.map((pitchClass) => nearestMidiForPitchClass(pitchClass, center)).sort((a, b) => a - b);
    const next = new Map(notes.map((note) => [note, 96]));
    setLatchedNotes(next);
    notes.forEach((note) => addEvent(note, 96, 0, "screen", notes));
  };

  const newestInsight = focusedEvent ? (() => {
    const context = noteContext(focusedEvent.note, doMidi, scale);
    const fieldCandidate = fieldPitchClassCount <= 5 ? selectedChordMeasure?.candidate ?? chordCandidates[0] : undefined;
    const intervalCopy = latestInterval ? `${latestInterval.relationship} from the prior attack` : "the first attack in this trace";
    const routeCopy = context.inScale ? `inside the current ${scale.name}` : `outside the current route`;
    const motionCopy = resolution?.label ?? "building a baseline";
    const transitionCopy = selectedChordMeasure ? `Grouped across ${Math.round(selectedChordMeasure.gesture.spreadMs)} ms: ${evidenceWord(selectedChordMeasure.novelty)} pitch-set novelty, ${evidenceWord(selectedChordMeasure.motion)} voice motion${selectedChordMeasure.rootTravelSteps == null ? "" : `, and ${selectedChordMeasure.rootTravelSteps} fifths step${selectedChordMeasure.rootTravelSteps === 1 ? "" : "s"} of root travel`}.` : "";
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
    const home = context.stepsWithinOctave === 0;
    const className = ["piano-key", black ? "is-black" : "is-white", context.inScale ? "is-in-scale" : "", active ? "is-active" : "", pressed ? "is-pressed" : "", sustained ? "is-sustained" : "", focused ? "is-focused" : "", chordMember ? "is-chord-member" : "", inherited ? "is-inherited" : "", home ? "is-home" : ""].filter(Boolean).join(" ");
    const style = ({
      "--key-left": black ? `${(WHITE_NOTES.filter((white) => white < note).length / WHITE_NOTES.length) * 100}%` : `${(WHITE_NOTES.indexOf(note) / WHITE_NOTES.length) * 100}%`,
      "--key-width": `${100 / WHITE_NOTES.length}%`,
    } as CSSProperties);
    return <button key={note} type="button" className={className} style={style} aria-pressed={active} aria-label={`${context.syllable}, ${context.inScale ? "in" : "outside"} the current route, ${formatHz(context.frequencyHz)}${showConventions ? `, ${conventionalPitchName(note)}` : ""}${sustained ? ", sustained by pedal" : ""}${chordMember ? ", attacked in selected chord" : inherited ? ", inherited into selected chord field" : ""}`} onClick={() => toggleScreenKey(note)}><span>{context.inScale || active || home ? context.syllable : "·"}</span>{showConventions ? <small>{conventionalPitchName(note)}</small> : null}</button>;
  };

  const exactChord = chordCandidates.find((candidate) => candidate.exact);
  const leadingChord = fieldPitchClassCount <= 5 ? selectedChordMeasure?.candidate ?? exactChord ?? chordCandidates[0] : undefined;

  return (
    <section className="advanced-lab piano-lab piano-hud" aria-labelledby="piano-hud-title">
      <header className="piano-hud-header">
        <div><p className="section-kicker">Silent MIDI piano companion · one coordinated view</p><h2 id="piano-hud-title">See the musical relationships while your hands play.</h2><p>Each attack occupies the same numbered column across notation, frequency, scale, fifths, and perception. The keyboard sends data only: this page does not synthesize, route, or record audio, and nothing is uploaded.</p></div>
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
        <small>{latestSnapshot?.evidenceLabel ?? "Play four distinct positions before the frame can move."} · chord gap {chordWindowMs} ms · maximum span {chordWindowMs * 2} ms</small>
        <em>{frozen ? "Trace frozen; held keys still show below." : `${events.length}/7 attacks in view`}</em>
      </div>

      <div className="piano-hud-main">
        <div className="hud-phrase-stack">
          <StaffView events={events} gestures={chordGestures} selectedChordId={effectiveSelectedChordId} doMidi={doMidi} scale={scale} focusedId={focusedEvent?.id ?? null} showConventions={showConventions} />
          <div className="hud-event-selector" aria-label="Select an event across every view">{events.map((event, index) => <button key={event.id} type="button" aria-pressed={focusedEvent?.id === event.id} onClick={() => { setFocusedId(event.id); const containing = chordGestures.find((gesture) => gesture.attacks.some((attack) => attack.id === event.id)); if (containing) setSelectedChordId(containing.id); }}><strong>{index + 1}</strong><span>{showConventions ? conventionalPitchName(event.note) : relativeSyllable(event.note, doMidi, scale)}</span><small>{index ? `${Math.round(event.onsetMs - events[index - 1].onsetMs)} ms` : "start"}</small></button>)}</div>
          <ChordGestureLane events={events} measures={chordMeasures} selectedChordId={effectiveSelectedChordId} doMidi={doMidi} showConventions={showConventions} onSelect={(id) => { setSelectedChordId(id); const gesture = chordGestures.find((item) => item.id === id); if (gesture) setFocusedId(gesture.attacks.at(-1)!.id); }} />
          <FrequencyView events={events} gestures={chordGestures} selectedChordId={effectiveSelectedChordId} doMidi={doMidi} scale={scale} focusedId={focusedEvent?.id ?? null} showConventions={showConventions} />
        </div>
        <div className="hud-context-stack">
          <FifthsCompass events={events} activeNotes={activeNoteNumbers} chordNotes={analysisNotes} chordRootPitchClass={selectedChordMeasure?.candidate?.exact ? selectedChordMeasure.candidate.rootPitchClass : null} doMidi={doMidi} scale={scale} focusedNote={focusedEvent?.note ?? null} showConventions={showConventions} />
          <ScaleLens events={events} chordNotes={analysisNotes} snapshots={snapshots} frame={frame} doMidi={doMidi} showConventions={showConventions} onAdopt={lockCandidate} />
        </div>
      </div>

      <div className="piano-hud-keyboard-wrap">
        <div className="hud-panel-heading"><span>Hands, pedal, and selected chord</span><strong>Persistent keyboard field</strong><small>solid = held · ring = sustain · bracket = chord attack · dotted = inherited · double mark = Do</small></div>
        <div className="piano-keyboard hud-keyboard" role="group" aria-label="Silent two-octave on-screen piano">{WHITE_NOTES.map((note) => renderKey(note, false))}{VISIBLE_NOTES.filter((note) => !WHITE_PITCH_CLASSES.has(pitchClassFromMidi(note))).map((note) => renderKey(note, true))}</div>
      </div>

      <div className="piano-hud-analysis">
        <section className="hud-chord-panel" aria-labelledby="hud-chord-title">
          <div className="hud-panel-heading"><span>{selectedGesture ? `${selectedGesture.kind} gesture · ${Math.round(selectedGesture.spreadMs)} ms` : fieldIsLive ? "Held now" : events.length ? "Last outlined field" : "Waiting for a field"}</span><strong id="hud-chord-title">Chord identity</strong><small>Chord attacks determine identity; already-held and pedal tones remain visible as inherited context.</small></div>
          {leadingChord ? <div className="hud-chord-result"><span>{leadingChord.exact ? "exact pitch-class match" : "possible outline"}</span><strong>{chordLabel(leadingChord, doMidi, showConventions)}</strong><small>{leadingChord.inversion > 0 ? `inversion ${leadingChord.inversion} · ` : ""}{leadingChord.missingPitchClasses.length ? `${leadingChord.missingPitchClasses.length} missing · ` : ""}{leadingChord.extraPitchClasses.length ? `${leadingChord.extraPitchClasses.length} added` : "no added tones"}</small></div> : fieldPitchClassCount > 5 ? <div className="hud-chord-result"><span>scale-like pitch field</span><strong>{fieldPitchClassCount} distinct positions</strong><small>Too many simultaneous positions for a useful chord-template label; inspect the interval texture and scale lens instead.</small></div> : <p className="hud-empty-copy">Hold two or more notes. The HUD will name exact matches separately from incomplete outlines.</p>}
          {selectedChordMeasure ? <div className="hud-chord-metrics" aria-label="Selected chord evidence">
            <span><small>crunch</small><strong>{selectedChordMeasure.crunch == null ? "—" : Math.round(selectedChordMeasure.crunch * 100)}</strong></span>
            <span><small>pull</small><strong>{Math.round(selectedChordMeasure.pull * 100)}</strong></span>
            <span><small>arrival</small><strong>{Math.round(selectedChordMeasure.arrival * 100)}</strong></span>
            <span><small>new tones</small><strong>{Math.round(selectedChordMeasure.novelty * 100)}</strong></span>
            <span><small>voice move</small><strong>{Math.round(selectedChordMeasure.motion * 100)}</strong></span>
            <span><small>root travel</small><strong>{selectedChordMeasure.rootTravelSteps == null ? "—" : `${selectedChordMeasure.rootTravelSteps}×5th`}</strong></span>
          </div> : null}
          <div className="hud-field-notes">{soundingAnalysisNotes.map((note) => <span key={note} className={inheritedAnalysisNotes.includes(note) ? "is-inherited" : ""}><strong>{relativeSyllable(note, doMidi, scale)}</strong><small>{inheritedAnalysisNotes.includes(note) ? "inherited" : showConventions ? conventionalPitchName(note) : formatHz(frequencyFromMidi(note))}</small></span>)}</div>
        </section>

        <section className="hud-nearby-panel" aria-labelledby="hud-nearby-title">
          <div className="hud-panel-heading"><span>One economical next move</span><strong id="hud-nearby-title">Nearby scale chords</strong><small>Ranked by shared tones and changed pitch classes.</small></div>
          <ol>{nearby.map((chord) => <li key={`${chord.rootPitchClass}-${chord.degreeIndex}`}><button type="button" onClick={() => placeNearbyChord(chord)}><span>{chord.syllable} · degree {chord.degreeIndex + 1}</span><strong>{nearbyLabel(chord, doMidi, showConventions)}</strong><small>{chord.instruction}</small></button></li>)}</ol>
          {!nearby.length ? <p className="hud-empty-copy">Play a field to compare close, scale-derived chord moves.</p> : null}
        </section>

        <RelationshipTexture notes={soundingAnalysisNotes} inheritedNotes={inheritedAnalysisNotes} doMidi={doMidi} scale={scale} showConventions={showConventions} />
      </div>

      <EvidenceTrace measures={measures} chordMeasures={chordMeasures} events={events} selectedChordId={effectiveSelectedChordId} />

      <footer className="piano-hud-insight" aria-live="polite"><span>What changed?</span><strong>{newestInsight}</strong><small>Chord crunch, pull, and arrival use the sounding field at the final attack; pitch-set novelty and voice motion use attacked members. Crunch remains a standardized nine-partial proxy. Musical goodness still depends on timing, style, memory, intention, and your response.</small></footer>
    </section>
  );
}
