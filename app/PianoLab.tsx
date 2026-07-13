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
  LANDMARK_PATHS,
  PIANO_SCALES,
  articulationTimeline,
  chordTransitionEvidence,
  conventionalPitchName,
  detectMotifTransformations,
  fifthStepForPitchClass,
  fifthsCircle,
  frequencyFromMidi,
  groupChordGestures,
  identifyChordCandidates,
  intervalLandmark,
  landmarkTransitionProfile,
  matchesLandmarkStep,
  nearbyScaleChords,
  nearestMidiForPitchClass,
  noteContext,
  pairwiseIntervals,
  parseMidiMessage,
  pitchClassFromMidi,
  pushPhraseEvent,
  pushRollingNoteEvent,
  resolutionForks,
  resolutionDirection,
  scaleFingerprint,
  scaleFrameTimeline,
  scaleSemitones,
  tonalGravityCandidates,
  tonalTendency,
  voiceChordNear,
  voiceLandmarkPath,
  voiceLeadingProfile,
  type ChordCandidate,
  type ChordBoundaryCorrection,
  type ChordGesture,
  type ArticulationEvidence,
  type LandmarkPath,
  type LandmarkPathId,
  type MotifTransformation,
  type NearbyChord,
  type PianoScale,
  type ResolutionFork,
  type ScaleCandidate,
  type TonalGravityCandidate,
} from "@/lib/piano-model";
import { sonorityPerceptionModel } from "@/lib/sonority-model";
import {
  DEFAULT_PIANO_SOUND_MODEL_ID,
  PIANO_SOUND_MODELS,
  isPianoSoundModelId,
  pianoSoundModel,
  pianoSoundPartialProfile,
  pianoSoundVoice,
  type PianoSoundModelId,
} from "@/lib/piano-sound-model";
import {
  PHRASE_CHARACTER_STORAGE_KEY,
  parsePhraseCharacterObservations,
  phraseRelationshipSignature,
  summarizePhraseCharacter,
  type PhraseCharacterEvidence,
  type PhraseCharacterObservation,
  type PhraseCharacterRatings,
} from "@/lib/personal-response";

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
type FocusLens = "explore" | "intervals" | "scales" | "chords" | "motion" | "paths" | "experience";
type IntervalEchoTarget = { semitones: number; anchorEventId: number };
type ResolutionTarget = ResolutionFork & {
  anchorEventId: number;
  frameRootPitchClass?: number;
  frameScaleId?: PianoScale["id"];
};

type MidiCallbacks = {
  onAttack: (note: number, velocity: number, channel: number, fieldNotes: number[], atMs: number) => void;
  onRelease: (note: number, channel: number, atMs: number, heldByPedal: boolean) => void;
  onSustain: (down: boolean, channel: number, atMs: number, releasedNotes: number[]) => void;
};

type PersistedPianoSession = {
  version: 2 | 3 | 4 | 5;
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
  resolutionTarget?: ResolutionTarget | null;
  resolutionForkSet?: ResolutionFork[] | null;
  landmarkPathId?: LandmarkPathId;
  landmarkStepIndex?: number;
  soundModelId?: PianoSoundModelId;
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
  { id: "motion", label: "Motion", description: "Follow touch, articulation, motifs, pull, and voice movement through time." },
  { id: "paths", label: "Paths", description: "Play pop, blues, cadence, and pedal-point archetypes as transferable relationships." },
  { id: "experience", label: "Experience", description: "Report how this phrase felt; keep your response separate from modeled evidence." },
];

const CHARACTER_QUESTIONS: Array<{
  key: keyof PhraseCharacterRatings;
  prompt: string;
  low: string;
  high: string;
  choices: string[];
}> = [
  { key: "settledness", prompt: "How settled did this phrase feel to you?", low: "suspended", high: "settled", choices: ["suspended", "mostly open", "between", "mostly settled", "settled"] },
  { key: "energy", prompt: "How energized did this phrase feel?", low: "calm", high: "energized", choices: ["calm", "gentle", "between", "active", "energized"] },
  { key: "familiarity", prompt: "How surprising or familiar did this relationship path feel?", low: "surprising", high: "familiar", choices: ["surprising", "unfamiliar", "between", "recognizable", "familiar"] },
  { key: "liking", prompt: "How much did you like this particular experience?", low: "less", high: "more", choices: ["much less", "less", "between", "more", "much more"] },
];
const CHARACTER_VALUES = [0, 25, 50, 75, 100];

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

function phraseCharacterEvidence(events: HudNoteEvent[], doMidi: number, scale: PianoScale, soundModelId: PianoSoundModelId): PhraseCharacterEvidence {
  if (!events.length) return {
    measured: { attackCount: 0, phraseMs: 0, pitchSpan: 0, meanVelocity: 0, overlapShare: 0 },
    modeled: { meanCrunch: 0, endingRepose: 0, meanNovelty: 0, centerClarity: 0 },
  };
  const notes = events.map((event) => event.note);
  const phraseEnd = events.at(-1)?.releaseMs ?? events.at(-1)!.onsetMs;
  const articulation = articulationTimeline(events, phraseEnd);
  const overlapShare = articulation.length > 1 ? articulation.slice(0, -1).filter((item) => item.overlapMs > 0).length / (articulation.length - 1) : 0;
  const crunchValues = events.flatMap((event) => {
    const field = uniqueSorted(event.fieldNotes);
    if (field.length < 2) return [];
    return [sonorityPerceptionModel(field.map((note) => pianoSoundVoice(frequencyFromMidi(note), 0.72, soundModelId))).roughness];
  });
  const finalEvent = events.at(-1)!;
  const endingField = uniqueSorted(finalEvent.fieldNotes.length ? finalEvent.fieldNotes : [finalEvent.note]);
  const endingPerception = endingField.length >= 2 ? sonorityPerceptionModel(endingField.map((note) => pianoSoundVoice(frequencyFromMidi(note), 0.72, soundModelId))) : null;
  const endingTendency = tonalTendency(endingField, doMidi, scale);
  const noveltyValues = events.slice(1).map((event, index) => events.slice(0, index + 1).some((prior) => pitchClassFromMidi(prior.note) === pitchClassFromMidi(event.note)) ? 0 : 1);
  const gravity = tonalGravityCandidates(events, phraseEnd, 2);
  return {
    measured: {
      attackCount: events.length,
      phraseMs: Math.max(0, events.at(-1)!.onsetMs - events[0].onsetMs),
      pitchSpan: Math.max(...notes) - Math.min(...notes),
      meanVelocity: events.reduce((sum, event) => sum + event.velocity, 0) / events.length,
      overlapShare,
    },
    modeled: {
      meanCrunch: crunchValues.length ? crunchValues.reduce((sum, value) => sum + value, 0) / crunchValues.length : 0,
      endingRepose: (endingPerception?.repose ?? 0.5) * 0.55 + endingTendency.homeEvidence * 0.45,
      meanNovelty: noveltyValues.length ? noveltyValues.reduce((sum, value) => sum + value, 0) / noveltyValues.length : 0,
      centerClarity: gravity.length > 1 ? Math.max(0, gravity[0].score - gravity[1].score) : 0,
    },
  };
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

function pitchClassRoleLabel(pitchClass: number, doMidi: number, scale: PianoScale, showConventions: boolean) {
  return showConventions
    ? CONVENTIONAL_PITCH_CLASSES[pitchClass]
    : noteContext(nearestMidiForPitchClass(pitchClass, doMidi), doMidi, scale).syllable;
}

function gravityCenterLabel(candidate: TonalGravityCandidate, doMidi: number, scale: PianoScale, showConventions: boolean) {
  return pitchClassRoleLabel(candidate.rootPitchClass, doMidi, scale, showConventions);
}

function strongestGravityDrivers(candidate: TonalGravityCandidate) {
  const labels: Array<[keyof TonalGravityCandidate["components"], string]> = [
    ["routeFit", "route fit"],
    ["duration", "held time"],
    ["recurrence", "recurrence"],
    ["accent", "attack"],
    ["bass", "low register"],
    ["ending", "phrase ending"],
  ];
  return labels
    .map(([key, label]) => ({ label, value: candidate.components[key] }))
    .sort((first, second) => second.value - first.value)
    .slice(0, 2);
}

function ScalePracticeField({
  phraseEvents,
  frame,
  doMidi,
  showConventions,
  gravity,
  fingerprintRotation,
  forks,
  target,
  targetMatched,
  onRotate,
  onChooseTarget,
  onClearTarget,
}: {
  phraseEvents: HudNoteEvent[];
  frame: ScaleCandidate;
  doMidi: number;
  showConventions: boolean;
  gravity: TonalGravityCandidate[];
  fingerprintRotation: number;
  forks: ResolutionFork[];
  target: ResolutionTarget | null;
  targetMatched: boolean;
  onRotate: () => void;
  onChooseTarget: (fork: ResolutionFork) => void;
  onClearTarget: () => void;
}) {
  const fingerprint = scaleFingerprint(frame.scale, fingerprintRotation);
  const routePositions = scaleSemitones(frame.scale);
  const rotationOffset = routePositions[fingerprint.rotation] ?? 0;
  const observed = new Set(phraseEvents.map((event) => pitchClassFromMidi(event.note)));
  const gravityByPitchClass = new Map(gravity.map((candidate) => [candidate.rootPitchClass, candidate]));
  const maximumGravity = Math.max(...gravity.map((candidate) => candidate.score), 0.001);
  const leadingGravity = gravity
    .filter((candidate) => candidate.components.duration + candidate.components.recurrence + candidate.components.accent + candidate.components.bass + candidate.components.ending > 0)
    .slice(0, 3);
  const forkScale = PIANO_SCALES.find((scale) => scale.id === target?.frameScaleId) ?? frame.scale;
  const forkDoMidi = target?.frameRootPitchClass == null ? doMidi : nearestMidiForPitchClass(target.frameRootPitchClass, doMidi);
  const movementLabel = (movement: number) => movement === 0 ? "repeat" : `${movement > 0 ? "+" : ""}${movement} key step${Math.abs(movement) === 1 ? "" : "s"}`;
  return <section className="hud-scale-practice" aria-labelledby="hud-scale-practice-title">
    <div className="hud-panel-heading"><span>Shape · center · choice</span><strong id="hud-scale-practice-title">Scale fingerprint + tonal gravity</strong><small>One performed phrase, three separate questions. These are hypotheses and invitations—not a key detector or a goodness score.</small></div>
    <div className="hud-scale-learning-grid">
      <div className="hud-fingerprint-field">
        <div className="hud-subheading"><span>Selected frame · derived shape</span><strong>Read the gaps before the name</strong><small>{new Set(phraseEvents.map((event) => pitchClassFromMidi(event.note))).size} measured pitch classes encountered in phrase memory</small></div>
        <div className="hud-fingerprint" role="img" aria-label={`Cyclic scale gap fingerprint ${fingerprint.steps.join(", ")} equal-key steps`}>
          {fingerprint.steps.map((step, index) => {
            const start = fingerprint.positions[index];
            const startPitchClass = pitchClassFromMidi(frame.rootPitchClass + rotationOffset + start);
            const endPitchClass = pitchClassFromMidi(startPitchClass + step);
            const encountered = observed.has(startPitchClass) && observed.has(endPitchClass);
            return <span key={`${fingerprint.rotation}-${index}`} className={encountered ? "is-encountered" : ""} style={{ "--fingerprint-gap": step } as CSSProperties}><strong>{step}</strong><small>{step === 1 ? "close" : step === 2 ? "whole" : "wide"}</small></span>;
          })}
        </div>
        <div className="hud-fingerprint-caption"><span>{fingerprint.steps.join("–")}</span><small>Totals {fingerprint.total} equal key steps: the octave loop closes. Moving Do transposes the loop without changing this string.</small></div>
        <button type="button" className="hud-rotate-fingerprint" onClick={onRotate}>Rotate the starting point</button>
        <p>Rotation keeps the same cyclic pitch set but changes which gap follows Do—a direct preview of mode-like hearing.</p>
      </div>

      <div className="hud-gravity-field">
        <div className="hud-subheading"><span>Modeled from performance</span><strong>Competing centers</strong><small>Route fit + held time + recurrence + attack + low register + ending · named candidates were sounded</small></div>
        <div className="hud-gravity-bars" role="img" aria-label="Twelve possible tonal centers weighted by performed evidence">
          {Array.from({ length: 12 }, (_, pitchClass) => {
            const candidate = gravityByPitchClass.get(pitchClass);
            const label = pitchClassRoleLabel(pitchClass, doMidi, frame.scale, showConventions);
            const rank = gravity.findIndex((item) => item.rootPitchClass === pitchClass);
            return <span key={pitchClass} className={rank === 0 ? "is-leading is-strongest" : rank > 0 && rank < 3 ? "is-leading" : ""}><i style={{ "--gravity": candidate ? candidate.score / maximumGravity : 0 } as CSSProperties} /><strong>{label}</strong></span>;
          })}
        </div>
        <ol className="hud-gravity-candidates">
          {leadingGravity.map((candidate, index) => {
            const drivers = strongestGravityDrivers(candidate);
            return <li key={candidate.rootPitchClass}><span>{index === 0 ? "strongest hypothesis" : "competing"}</span><strong>{gravityCenterLabel(candidate, doMidi, frame.scale, showConventions)} · {showConventions ? candidate.scale.conventionalName : candidate.scale.name}</strong><small>{drivers.map((driver) => `${driver.label} ${Math.round(driver.value * 100)}`).join(" · ")}</small></li>;
          })}
          {!leadingGravity.length ? <li><span>waiting</span><strong>Play a phrase to form center hypotheses</strong><small>The current Do frame will not move from this panel.</small></li> : null}
        </ol>
      </div>

      <div className="hud-resolution-field">
        <div className="hud-subheading"><span>Playable experiment · selected Do</span><strong>Resolution forks</strong><small>Choose an intention; the HUD silently outlines a pitch class. Supply the note yourself.</small></div>
        <div className="hud-resolution-options">
          {forks.map((fork) => <button key={`${fork.id}-${fork.pitchClass}`} type="button" aria-pressed={target?.id === fork.id && target.pitchClass === fork.pitchClass} onClick={() => onChooseTarget(fork)}><span>{fork.label}</span><strong>{pitchClassRoleLabel(fork.pitchClass, forkDoMidi, forkScale, showConventions)} · {movementLabel(fork.movement)}</strong><small>{fork.explanation}</small></button>)}
        </div>
        {target ? <div className={`hud-resolution-feedback ${targetMatched ? "is-match" : ""}`} role="status"><span>{targetMatched ? "You played the fork" : "Silent target armed"}</span><strong>{pitchClassRoleLabel(target.pitchClass, forkDoMidi, forkScale, showConventions)} · any octave</strong><small>{targetMatched ? "Notice whether it felt like return, continuation, opening, or surprise; the model does not decide that response." : "One pitch class is dashed on the keyboard. No note was entered or sounded."}</small><button type="button" onClick={onClearTarget}>Clear fork</button></div> : null}
        {!forks.length ? <p>Play at least one note to reveal contrasting continuation intentions.</p> : null}
      </div>
    </div>
  </section>;
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

const ARTICULATION_LABELS: Record<ArticulationEvidence["kind"], string> = {
  held: "held",
  "phrase-end": "ending",
  detached: "detached",
  connected: "joined",
  "finger-overlap": "overlap",
  "pedal-joined": "pedal link",
};

function compactTiming(ms: number) {
  if (ms < 1000) return `${Math.round(ms)} ms`;
  return `${(ms / 1000).toFixed(1)} s`;
}

function articulationConnectionCopy(item: ArticulationEvidence) {
  if (item.kind === "held") return `finger ${compactTiming(item.fingerMs)} and growing`;
  if (item.kind === "phrase-end") return item.pedalMs > 25 ? `pedal tail ${compactTiming(item.pedalMs)}` : `sounded ${compactTiming(item.soundingMs)}`;
  if (item.kind === "detached") return `silence ${compactTiming(item.silenceMs)}`;
  if (item.kind === "pedal-joined") return `pedal overlap ${compactTiming(item.overlapMs)}`;
  if (item.kind === "finger-overlap") return `finger overlap ${compactTiming(item.overlapMs)}`;
  return "release meets next attack";
}

function motifTitle(motif: MotifTransformation) {
  const base = motif.kind === "exact-repeat"
    ? "exact repeat"
    : motif.kind === "transposed-repeat"
      ? `same shape · shifted ${motif.transpositionSemitones > 0 ? "+" : ""}${motif.transpositionSemitones}`
      : motif.kind === "rhythmic-variation"
        ? "same pitch shape · new rhythm"
        : `same opening · ending ${motif.endingDeltaSemitones > 0 ? "+" : ""}${motif.endingDeltaSemitones}`;
  return motif.returnAfterInterveningMaterial ? `return after intervening material · ${base}` : base;
}

function motifPracticePrompt(motif: MotifTransformation | undefined) {
  if (!motif) return "Play three or four attacks, leave a gap, then repeat the shape exactly or from a different starting key.";
  if (motif.kind === "exact-repeat") return "Try next: keep the onset pattern and move the whole shape to a new starting key.";
  if (motif.kind === "transposed-repeat") return "Try next: return to the original starting key while preserving this timing.";
  if (motif.kind === "rhythmic-variation") return "Try next: restore the first rhythm while keeping the later pitch placement.";
  return "Try next: keep the changed ending once, then return to the first ending.";
}

function PhraseMotionField({ events, articulation, motifs }: {
  events: HudNoteEvent[];
  articulation: ArticulationEvidence[];
  motifs: MotifTransformation[];
}) {
  const microscopeArticulation = articulation.slice(-7);
  const microscopeOffset = Math.max(0, events.length - microscopeArticulation.length);
  const firstOnset = events[0]?.onsetMs ?? 0;
  const lastOnset = events.at(-1)?.onsetMs ?? firstOnset;
  const phraseSpan = Math.max(500, lastOnset - firstOnset);
  const xFor = (eventIndex: number) => 54 + ((events[eventIndex]?.onsetMs ?? firstOnset) - firstOnset) / phraseSpan * 620;
  const leadingMotifs = motifs.slice(0, 2);
  const strongest = leadingMotifs[0];
  const rangeLabel = (start: number, length: number) => `P${start + 1}–P${start + length}`;
  const motifDescription = leadingMotifs.length
    ? leadingMotifs.map((motif) => `${rangeLabel(motif.sourceStartIndex, motif.length)} to ${rangeLabel(motif.targetStartIndex, motif.length)}: ${motifTitle(motif)}`).join(". ")
    : "No three- or four-attack motif transformation detected yet.";
  return <section className="hud-phrase-motion" aria-labelledby="hud-phrase-motion-title">
    <div className="hud-panel-heading"><span>Measured gesture + modeled recurrence</span><strong id="hud-phrase-motion-title">Touch, connection, and motif</strong><small>Timing can change the gesture while pitches stay fixed. Motif labels compare exact key-step shapes and normalized onset gaps.</small></div>
    <div className="hud-motion-learning-grid">
      <div className="hud-articulation-field">
        <div className="hud-subheading"><span>Captured MIDI timing</span><strong>Duration + articulation lane</strong><small>blue finger contact · gold pedal extension · link to the next attack</small></div>
        <div className="hud-articulation-lane" style={{ "--articulation-count": Math.max(1, microscopeArticulation.length) } as CSSProperties} aria-label="Finger, pedal, silence, and overlap for the seven-attack microscope">
          {microscopeArticulation.map((item, slot) => {
            const referenceMs = item.interOnsetMs ?? Math.max(250, item.soundingMs);
            const fingerShare = Math.min(1, item.fingerMs / Math.max(1, referenceMs));
            const pedalShare = Math.min(1 - fingerShare, item.pedalMs / Math.max(1, referenceMs));
            return <div key={item.eventId} className={`is-${item.kind}`} aria-label={`Microscope ${slot + 1}, ${ARTICULATION_LABELS[item.kind]}, finger ${compactTiming(item.fingerMs)}, pedal ${compactTiming(item.pedalMs)}, ${articulationConnectionCopy(item)}`}>
              <span>M{slot + 1}</span>
              <strong>{ARTICULATION_LABELS[item.kind]}</strong>
              <div className="hud-articulation-bar" style={{ "--finger-share": fingerShare, "--pedal-share": pedalShare } as CSSProperties}><i /><b /><em /></div>
              <small>{articulationConnectionCopy(item)}</small>
            </div>;
          })}
          {!microscopeArticulation.length ? <p>Play two attacks to see whether touch leaves silence, meets the next attack, or overlaps it.</p> : null}
        </div>
        <p className="hud-motion-teaching-copy">“Detached,” “joined,” and “overlap” describe captured timing relative to the next attack. They do not infer intended notation or judge technique.</p>
      </div>

      <div className="hud-motif-field">
        <div className="hud-subheading"><span>Local phrase comparison</span><strong>Motif transformation trail</strong><small>blue source · gold later statement · exact · transposed · rhythm changed · ending changed · return</small></div>
        <svg viewBox="0 0 720 192" role="img" aria-label={motifDescription}>
          <title>Repeated and transformed three- or four-attack shapes across the live phrase</title>
          {leadingMotifs.map((motif, row) => {
            const y = 18 + row * 34;
            const sourceX = xFor(motif.sourceStartIndex);
            const sourceEnd = xFor(motif.sourceStartIndex + motif.length - 1);
            const targetX = xFor(motif.targetStartIndex);
            const targetEnd = xFor(motif.targetStartIndex + motif.length - 1);
            return <g key={`${motif.sourceStartIndex}-${motif.targetStartIndex}-${motif.length}`}>
              <rect x={sourceX - 6} y={y} width={Math.max(12, sourceEnd - sourceX + 12)} height="18" rx="3" className="hud-motif-source" />
              <rect x={targetX - 6} y={y} width={Math.max(12, targetEnd - targetX + 12)} height="18" rx="3" className="hud-motif-target" />
              <line x1={sourceEnd + 8} x2={targetX - 8} y1={y + 9} y2={y + 9} className="hud-motif-connector" />
              <text x={(sourceEnd + targetX) / 2} y={y - 4} className="hud-motif-label">{motifTitle(motif)}</text>
              <text x={(sourceX + sourceEnd) / 2} y={y + 13} className="hud-motif-range-label">{rangeLabel(motif.sourceStartIndex, motif.length)}</text>
              <text x={(targetX + targetEnd) / 2} y={y + 13} className="hud-motif-range-label">{rangeLabel(motif.targetStartIndex, motif.length)}</text>
            </g>;
          })}
          <line x1="54" x2="674" y1="112" y2="112" className="hud-grid-line" />
          {events.map((event, index) => {
            const microscopeSlot = index >= microscopeOffset ? index - microscopeOffset + 1 : null;
            return <g key={event.id}><circle cx={xFor(index)} cy={112 + (index % 3 - 1) * 5} r="4" className="hud-motif-event" />{microscopeSlot ? <text x={xFor(index)} y={132 + index % 3 * 24} className="hud-motif-tick-label">M{microscopeSlot}</text> : null}</g>;
          })}
          {!events.length ? <text x="360" y="78" className="hud-motif-empty-label">Phrase attacks will form a recurrence trail here</text> : null}
          {events.length && !leadingMotifs.length ? <text x="360" y="64" className="hud-motif-empty-label">No three- or four-attack transformation yet</text> : null}
        </svg>
        <div className="hud-motif-readout">
          <span>{strongest ? "strongest local match" : "practice prompt"}</span>
          <strong>{strongest ? motifTitle(strongest) : "repeat → change one property → return"}</strong>
          <small>{strongest ? `${rangeLabel(strongest.sourceStartIndex, strongest.length)} → ${rangeLabel(strongest.targetStartIndex, strongest.length)}. ${motifPracticePrompt(strongest)}` : motifPracticePrompt(undefined)}</small>
        </div>
      </div>
    </div>
  </section>;
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

function LandmarkPathCoach({ path, stepIndex, targetNotes, doMidi, scale, soundModelId, showConventions, onSelect, onReplay }: {
  path: LandmarkPath;
  stepIndex: number;
  targetNotes: number[];
  doMidi: number;
  scale: PianoScale;
  soundModelId: PianoSoundModelId;
  showConventions: boolean;
  onSelect: (id: LandmarkPathId) => void;
  onReplay: () => void;
}) {
  const complete = stepIndex >= path.steps.length;
  const currentStep = complete ? null : path.steps[stepIndex];
  const transition = currentStep ? landmarkTransitionProfile(path, stepIndex, doMidi) : null;
  const perception = targetNotes.length >= 2 ? sonorityPerceptionModel(targetNotes.map((note) => pianoSoundVoice(frequencyFromMidi(note), 0.72, soundModelId))) : null;
  const tendency = targetNotes.length ? tonalTendency(targetNotes, doMidi, scale) : null;
  const targetLabels = targetNotes.map((note) => showConventions ? conventionalPitchName(note) : relativeSyllable(note, doMidi, scale));
  const targetDescription = currentStep
    ? `Step ${stepIndex + 1} of ${path.steps.length}, ${currentStep.role}. Play ${targetLabels.join(", ")}.`
    : `${path.title} complete after ${path.steps.length} matched fields.`;
  return <section className="hud-landmark-coach" aria-labelledby="hud-landmark-title">
    <div className="hud-panel-heading"><span>Generated · silent · transposable</span><strong id="hud-landmark-title">Playable landmark paths</strong><small>Choose an archetype, then supply every outlined field yourself. Do stays fixed; the HUD advances only after an exact pitch-class match in any octave.</small></div>
    <div className="hud-landmark-selector" aria-label="Choose a landmark path">
      {LANDMARK_PATHS.map((candidate) => <button key={candidate.id} type="button" aria-pressed={candidate.id === path.id} onClick={() => onSelect(candidate.id)}><span>{candidate.family}</span><strong>{candidate.title}</strong><small>{candidate.steps.length} fields</small></button>)}
    </div>
    <div className="hud-landmark-question"><span>one listening question</span><strong>{path.question}</strong><small>{path.provenance}</small></div>
    <ol className="hud-landmark-progress" aria-label={`${path.title} progress`}>
      {path.steps.map((step, index) => <li key={step.id} className={index < stepIndex ? "is-complete" : index === stepIndex ? "is-current" : ""} aria-current={index === stepIndex ? "step" : undefined}>
        <span>{index < stepIndex ? "✓" : index + 1}</span>
        <strong>{showConventions ? `${step.conventionalName} · ${step.role}` : step.role}</strong>
        <small>{index < stepIndex ? "matched" : index === stepIndex ? "play now" : "ahead"}</small>
      </li>)}
    </ol>
    <div className={`hud-landmark-target ${complete ? "is-complete" : ""}`} role="status" aria-label={targetDescription}>
      <span>{complete ? "path complete" : `field ${stepIndex + 1} of ${path.steps.length}`}</span>
      <strong>{complete ? "Replay it: same relationships, more embodied" : `${currentStep!.role} · ${targetLabels.join(" · ")}`}</strong>
      <small>{complete ? "The archetype is a reusable relationship path, not a fixed key or a claim about every piece in this style." : `${currentStep!.prompt} Release the prior field, then play the dashed keys together or as one compact roll.`}</small>
      {complete ? <button type="button" onClick={onReplay}>Replay path</button> : null}
    </div>
    {!complete ? <div className="hud-landmark-evidence" aria-label="Current landmark transition evidence">
      <span><small>carried tones</small><strong>{transition ? transition.commonPitchClassCount : "—"}</strong><em>{transition ? "same pitch classes" : "first-field baseline"}</em></span>
      <span><small>nearest voices</small><strong>{transition ? transition.totalVoiceMotion : "—"}</strong><em>{transition ? `key steps total · largest ${transition.largestLeap}` : "motion begins next"}</em></span>
      <span><small>root around fifths</small><strong>{transition?.rootTravelSteps ?? "—"}</strong><em>{transition?.rootTravelSteps == null ? "baseline" : transition.rootTravelSteps === 1 ? "one neighbor" : "circle steps"}</em></span>
      <span><small>modeled field</small><strong>{perception ? `${Math.round(perception.roughness * 100)} / ${Math.round(perception.repose * 100)}` : "—"}</strong><em>crunch / repose proxy</em></span>
      <span><small>toward Do</small><strong>{tendency ? Math.round(tendency.homePull * 100) : "—"}</strong><em>{tendency?.hasHome ? "Do is present" : "Do is absent"}</em></span>
    </div> : null}
    <div className="hud-landmark-reading">
      <p><span>what stays invariant</span><strong>{path.invariant}</strong></p>
      <p><span>characteristic affordance</span><strong>{path.characteristic}</strong></p>
    </div>
  </section>;
}

function characterChoiceLabel(key: keyof PhraseCharacterRatings, value: number | undefined) {
  if (value == null) return "—";
  const question = CHARACTER_QUESTIONS.find((item) => item.key === key)!;
  const index = CHARACTER_VALUES.reduce((best, candidate, candidateIndex) => Math.abs(candidate - value) < Math.abs(CHARACTER_VALUES[best] - value) ? candidateIndex : best, 0);
  return question.choices[index];
}

function ExperienceLens({ captured, latestCount, observations, draft, questionIndex, saved, evidence, soundModelLabel, deleteArmed, onCapture, onAnswer, onBack, onSave, onReflectAgain, onArmDelete, onDelete }: {
  captured: HudNoteEvent[];
  latestCount: number;
  observations: PhraseCharacterObservation[];
  draft: Partial<PhraseCharacterRatings>;
  questionIndex: number;
  saved: boolean;
  evidence: PhraseCharacterEvidence;
  soundModelLabel: string;
  deleteArmed: boolean;
  onCapture: () => void;
  onAnswer: (key: keyof PhraseCharacterRatings, value: number) => void;
  onBack: () => void;
  onSave: () => void;
  onReflectAgain: () => void;
  onArmDelete: () => void;
  onDelete: () => void;
}) {
  const signature = phraseRelationshipSignature(captured);
  const repeats = observations.filter((observation) => observation.phraseSignature === signature);
  const summary = summarizePhraseCharacter(observations);
  const question = CHARACTER_QUESTIONS[questionIndex];
  const ready = captured.length >= 3;
  const draftPlaced = draft.settledness != null && draft.energy != null;
  const xFor = (value: number) => 54 + value / 100 * 412;
  const yFor = (value: number) => 252 - value / 100 * 210;
  const mapDescription = observations.length
    ? `${observations.length} saved personal phrase reports; center settledness ${Math.round(summary!.center.settledness)}, energy ${Math.round(summary!.center.energy)}, uncertainty plus or minus ${Math.round(summary!.uncertainty)}.`
    : "No saved personal phrase reports yet. The first two answers will place the current experience.";
  const reportedValues = CHARACTER_QUESTIONS.map((item) => `${item.low} ${draft[item.key] == null ? "—" : draft[item.key]} ${item.high}`).join("; ");
  return <section className="hud-experience-lens" aria-labelledby="hud-experience-title">
    <div className="hud-panel-heading"><span>Listener-reported · local · uncertain</span><strong id="hud-experience-title">Personal character map</strong><small>Describe this experience yourself. The map never derives emotion, liking, or familiarity from MIDI or the assumed sound model.</small></div>
    <div className="hud-experience-toolbar">
      <div><span>reflection specimen</span><strong>{ready ? `${captured.length} captured attacks` : "No phrase held yet"}</strong><small>{ready ? `${repeats.length} prior report${repeats.length === 1 ? "" : "s"} with this relationship signature` : "Play at least three attacks, then hold the latest phrase."}</small></div>
      <button type="button" disabled={latestCount < 3} onClick={onCapture}>{ready ? "Use latest phrase" : "Hold latest phrase"}</button>
    </div>
    <div className="hud-experience-main">
      <div className="hud-character-map">
        <div className="hud-subheading"><span>Your saved reports</span><strong>Suspended ↔ settled · calm ↔ energized</strong><small>{observations.length} local sample{observations.length === 1 ? "" : "s"} · uncertainty {summary ? `±${Math.round(summary.uncertainty)}` : "not estimated"}</small></div>
        <svg viewBox="0 0 520 292" role="img" aria-label={mapDescription}>
          <title>Personal phrase reports mapped by settledness and energy</title>
          <line x1="54" x2="466" y1="252" y2="252" className="hud-character-axis" />
          <line x1="54" x2="54" y1="42" y2="252" className="hud-character-axis" />
          <line x1="260" x2="260" y1="42" y2="252" className="hud-character-grid" />
          <line x1="54" x2="466" y1="147" y2="147" className="hud-character-grid" />
          <text x="54" y="278" className="hud-character-axis-label is-start">suspended</text><text x="466" y="278" className="hud-character-axis-label is-end">settled</text>
          <text x="45" y="255" className="hud-character-axis-label is-end">calm</text><text x="45" y="46" className="hud-character-axis-label is-end">energized</text>
          {summary ? <ellipse cx={xFor(summary.center.settledness)} cy={yFor(summary.center.energy)} rx={Math.min(206, (summary.spread.settledness + summary.uncertainty) * 4.12)} ry={Math.min(105, (summary.spread.energy + summary.uncertainty) * 2.1)} className="hud-character-uncertainty" /> : null}
          {observations.map((observation, index) => <circle key={observation.id} cx={xFor(observation.ratings.settledness)} cy={yFor(observation.ratings.energy)} r={4 + observation.ratings.liking / 28} strokeWidth={1 + observation.ratings.familiarity / 55} className={`hud-character-point ${observation.phraseSignature === signature ? "is-same-phrase" : ""}`}><title>{`Report ${index + 1}: settledness ${observation.ratings.settledness}, energy ${observation.ratings.energy}, familiarity ${observation.ratings.familiarity}, liking ${observation.ratings.liking}${observation.soundModelId ? `, assumed spectrum ${pianoSoundModel(observation.soundModelId).shortLabel}` : ""}`}</title></circle>)}
          {summary ? <circle cx={xFor(summary.center.settledness)} cy={yFor(summary.center.energy)} r="4" className="hud-character-center"><title>Center of saved reports</title></circle> : null}
          {draftPlaced ? <g className="hud-character-current"><circle cx={xFor(draft.settledness!)} cy={yFor(draft.energy!)} r="9" /><line x1={xFor(draft.settledness!) - 13} x2={xFor(draft.settledness!) + 13} y1={yFor(draft.energy!)} y2={yFor(draft.energy!)} /><line x1={xFor(draft.settledness!)} x2={xFor(draft.settledness!)} y1={yFor(draft.energy!) - 13} y2={yFor(draft.energy!) + 13} /></g> : null}
          {!observations.length && !draftPlaced ? <text x="270" y="148" className="hud-character-empty">Answer settledness and energy to place this experience</text> : null}
        </svg>
        <p>dot size = reported liking · ring weight = reported familiarity · gold = same relationship signature · ellipse = sample spread + uncertainty</p>
      </div>
      <div className="hud-character-question">
        {!ready ? <div className="hud-character-empty-state"><span>begin with your phrase</span><strong>Play, then hold at least three attacks.</strong><small>The reflection freezes a specimen so later playing cannot rewrite the experience you are rating.</small></div> : saved ? <div className="hud-character-saved" role="status"><span>saved locally</span><strong>This report is one sample, not your identity.</strong><small>Repeat the same relationship later to see whether surprise/familiarity, liking, settledness, or energy changes.</small><button type="button" onClick={onReflectAgain}>Reflect on it again</button></div> : question ? <>
          <ol className="hud-character-question-progress" aria-label="Reflection progress">{CHARACTER_QUESTIONS.map((item, index) => <li key={item.key} className={index < questionIndex ? "is-complete" : index === questionIndex ? "is-current" : ""}><span>{index < questionIndex ? "✓" : index + 1}</span><strong>{item.key === "settledness" ? "settled" : item.key}</strong></li>)}</ol>
          <div className="hud-character-prompt"><span>question {questionIndex + 1} of 4</span><strong>{question.prompt}</strong><small>{question.low} → {question.high}</small></div>
          <div className="hud-character-choices" role="group" aria-label={question.prompt}>{CHARACTER_VALUES.map((value, index) => <button key={value} type="button" aria-pressed={draft[question.key] === value} onClick={() => onAnswer(question.key, value)}><span>{index + 1}</span><strong>{question.choices[index]}</strong></button>)}</div>
          {questionIndex > 0 ? <button type="button" className="hud-character-back" onClick={onBack}>Change previous answer</button> : null}
        </> : <div className="hud-character-review">
          <span>your report · not a model output</span>
          <strong>Save this four-part experience?</strong>
          <div>{CHARACTER_QUESTIONS.map((item) => <p key={item.key}><span>{item.key === "settledness" ? "settled" : item.key}</span><strong>{characterChoiceLabel(item.key, draft[item.key])}</strong><small>{draft[item.key]}</small></p>)}</div>
          <button type="button" onClick={onSave}>Save this phrase report</button>
          <button type="button" className="hud-character-back" onClick={onBack}>Change last answer</button>
        </div>}
      </div>
    </div>
    {ready ? <div className="hud-character-evidence" aria-label="Measured, modeled, and listener-reported phrase evidence">
      <div><span>measured from MIDI</span><strong>{evidence.measured.attackCount} attacks · {evidence.measured.pitchSpan} key span · {(evidence.measured.phraseMs / 1000).toFixed(1)} s · {Math.round(evidence.measured.overlapShare * 100)}% overlapping links</strong><small>Timing, pitch range, velocity, and overlap are captured events.</small></div>
      <div><span>modeled from assumptions</span><strong>{Math.round(evidence.modeled.meanCrunch * 100)} crunch · {Math.round(evidence.modeled.endingRepose * 100)} ending repose · {Math.round(evidence.modeled.meanNovelty * 100)} pitch novelty · {Math.round(evidence.modeled.centerClarity * 100)} center margin</strong><small>{soundModelLabel} supplies the spectral evidence; it is not your piano’s audio. Pitch novelty and center margin do not change with this choice.</small></div>
      <div><span>reported by you</span><strong>{reportedValues}</strong><small>These values are not inferred from the rows above, and correlation would not prove cause.</small></div>
    </div> : null}
    <div className="hud-character-local-data"><span>{observations.length} phrase report{observations.length === 1 ? "" : "s"} stored only in this browser</span>{observations.length ? <button type="button" onClick={deleteArmed ? onDelete : onArmDelete}>{deleteArmed ? "Confirm delete phrase reports" : "Delete phrase reports"}</button> : null}</div>
  </section>;
}

function SoundModelDisclosure({ value, onChange }: { value: PianoSoundModelId; onChange: (value: PianoSoundModelId) => void }) {
  const model = pianoSoundModel(value);
  const profile = pianoSoundPartialProfile(value);
  return <div className="piano-model-disclosure">
    <label htmlFor="hud-sound-model"><span>Assumed spectrum</span><select id="hud-sound-model" value={value} onChange={(event) => { if (isPianoSoundModelId(event.target.value)) onChange(event.target.value); }}>{PIANO_SOUND_MODELS.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}</select></label>
    <svg viewBox="0 0 180 58" role="img" aria-label={`${model.label}: ${model.partialCount} partial${model.partialCount === 1 ? "" : "s"}, ${model.rolloffDbPerOctave} decibels per octave rolloff${model.inharmonicity ? ", slight upper-partial stretch" : ", exact harmonic spacing"}.`}>
      <title>Relative partial frequencies and amplitudes for the selected teaching spectrum</title>
      <line x1="8" x2="172" y1="50" y2="50" />
      {profile.map((partial) => {
        const x = 8 + Math.min(1, Math.log2(partial.frequencyMultiple) / 4) * 164;
        const y = 50 - partial.amplitude * 38;
        return <line key={partial.partialIndex} x1={x} x2={x} y1="50" y2={y} className="piano-model-partial"><title>{`Partial ${partial.partialIndex}: ${partial.frequencyMultiple.toFixed(3)}×, relative amplitude ${partial.amplitude.toFixed(2)}`}</title></line>;
      })}
    </svg>
    <div className="piano-model-copy"><strong>{model.shortLabel}</strong><span>{model.description}</span><small><b>Changes:</b> modeled crunch, harmonic fit, brightness, and spectral share of repose. <b>Stays fixed:</b> keys, intervals, scales, fifths, rhythm, pull toward Do, novelty, and your reports.</small></div>
    <p>MIDI events only · silent · no audio analysis</p>
  </div>;
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
  const [resolutionTarget, setResolutionTarget] = useState<ResolutionTarget | null>(null);
  const [resolutionForkSet, setResolutionForkSet] = useState<ResolutionFork[] | null>(null);
  const [landmarkPathId, setLandmarkPathId] = useState<LandmarkPathId>("pop-loop");
  const [landmarkStepIndex, setLandmarkStepIndex] = useState(0);
  const [soundModelId, setSoundModelId] = useState<PianoSoundModelId>(DEFAULT_PIANO_SOUND_MODEL_ID);
  const [experiencePhrase, setExperiencePhrase] = useState<HudNoteEvent[]>([]);
  const [experienceDraft, setExperienceDraft] = useState<Partial<PhraseCharacterRatings>>({});
  const [experienceQuestionIndex, setExperienceQuestionIndex] = useState(0);
  const [experienceSaved, setExperienceSaved] = useState(false);
  const [phraseCharacterObservations, setPhraseCharacterObservations] = useState<PhraseCharacterObservation[]>([]);
  const [characterStorageReady, setCharacterStorageReady] = useState(false);
  const [characterDeleteArmed, setCharacterDeleteArmed] = useState(false);
  const [fingerprintRotation, setFingerprintRotation] = useState(0);
  const [frameMode, setFrameMode] = useState<FrameMode>("discover");
  const [lockedScaleId, setLockedScaleId] = useState<PianoScale["id"]>(DEFAULT_SCALE.id);
  const [lockedDoMidi, setLockedDoMidi] = useState(60);
  const nextIdRef = useRef(1);
  const frozenRef = useRef(false);
  const eventsRef = useRef<HudNoteEvent[]>([]);
  const phraseEventsRef = useRef<HudNoteEvent[]>([]);
  const landmarkLastMatchIdRef = useRef(0);
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
          if ((saved.version === 2 || saved.version === 3 || saved.version === 4 || saved.version === 5) && Array.isArray(saved.phraseEvents)) {
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
            setResolutionTarget(saved.resolutionTarget ?? null);
            setResolutionForkSet(saved.resolutionForkSet ?? null);
            if (LANDMARK_PATHS.some((path) => path.id === saved.landmarkPathId)) setLandmarkPathId(saved.landmarkPathId!);
            setLandmarkStepIndex(Math.max(0, Math.round(saved.landmarkStepIndex ?? 0)));
            if (isPianoSoundModelId(saved.soundModelId)) setSoundModelId(saved.soundModelId);
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
    const session: PersistedPianoSession = { version: 5, phraseEvents, chordWindowMs, boundaryCorrections, focusLens, showConventions, frameMode, lockedScaleId, lockedDoMidi, ghostChord, ghostNotes, resolutionTarget, resolutionForkSet, landmarkPathId, landmarkStepIndex, soundModelId };
    try { window.sessionStorage.setItem(PIANO_SESSION_KEY, JSON.stringify(session)); } catch { /* Continue without persistence when storage is unavailable. */ }
  }, [boundaryCorrections, chordWindowMs, focusLens, frameMode, ghostChord, ghostNotes, hydrated, landmarkPathId, landmarkStepIndex, lockedDoMidi, lockedScaleId, phraseEvents, resolutionForkSet, resolutionTarget, showConventions, soundModelId]);

  useEffect(() => {
    const hydrationTask = window.setTimeout(() => {
      setPhraseCharacterObservations(parsePhraseCharacterObservations(window.localStorage.getItem(PHRASE_CHARACTER_STORAGE_KEY)));
      setCharacterStorageReady(true);
    }, 0);
    return () => window.clearTimeout(hydrationTask);
  }, []);

  useEffect(() => {
    if (!characterStorageReady) return;
    try { window.localStorage.setItem(PHRASE_CHARACTER_STORAGE_KEY, JSON.stringify(phraseCharacterObservations)); } catch { /* Continue without persistent reports when storage is unavailable. */ }
  }, [characterStorageReady, phraseCharacterObservations]);

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
    const nextStable = scaleFrameTimeline(nextPhraseEvents.map((item) => item.note)).at(-1)?.stable;
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

  const phraseSnapshots = useMemo(() => scaleFrameTimeline(phraseEvents.map((event) => event.note)), [phraseEvents]);
  const snapshots = phraseSnapshots.slice(-events.length);
  const latestSnapshot = phraseSnapshots.at(-1);
  const discovered = latestSnapshot?.stable ?? rememberedFrame;
  const lockedScale = PIANO_SCALES.find((scale) => scale.id === lockedScaleId) ?? DEFAULT_SCALE;
  const frame: ScaleCandidate = frameMode === "locked"
    ? { scale: lockedScale, rootPitchClass: pitchClassFromMidi(lockedDoMidi), uniqueNoteCount: 0, inScaleCount: 0, routeCoveredCount: 0, matchFraction: 0, coverageFraction: 0, homePresent: false, fit: 0 }
    : discovered ?? { scale: DEFAULT_SCALE, rootPitchClass: 0, uniqueNoteCount: 0, inScaleCount: 0, routeCoveredCount: 0, matchFraction: 0, coverageFraction: 0, homePresent: false, fit: 0 };
  const doMidi = nearestMidiForPitchClass(frame.rootPitchClass, 60);
  const scale = frame.scale;
  useEffect(() => {
    if (!hydrated || focusLens !== "paths" || frameMode === "locked") return;
    const timer = window.setTimeout(() => {
      setLockedScaleId(scale.id);
      setLockedDoMidi(doMidi);
      setFrameMode("locked");
    }, 0);
    return () => window.clearTimeout(timer);
  }, [doMidi, focusLens, frameMode, hydrated, scale.id]);
  const landmarkPath = LANDMARK_PATHS.find((path) => path.id === landmarkPathId) ?? LANDMARK_PATHS[0];
  const effectiveLandmarkStepIndex = Math.min(landmarkStepIndex, landmarkPath.steps.length);
  const landmarkVoicings = useMemo(() => voiceLandmarkPath(landmarkPath, doMidi), [doMidi, landmarkPath]);
  const landmarkTargetNotes = landmarkVoicings[effectiveLandmarkStepIndex] ?? [];
  const soundModel = pianoSoundModel(soundModelId);
  const experienceEvidence = useMemo(() => phraseCharacterEvidence(experiencePhrase, doMidi, scale, soundModelId), [doMidi, experiencePhrase, scale, soundModelId]);
  useEffect(() => {
    if (!hydrated || focusLens !== "experience" || experiencePhrase.length >= 3 || phraseEvents.length < 3) return;
    const timer = window.setTimeout(() => {
      setExperiencePhrase([...phraseEvents]);
      setExperienceDraft({});
      setExperienceQuestionIndex(0);
      setExperienceSaved(false);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [experiencePhrase.length, focusLens, hydrated, phraseEvents]);
  const gravityCandidates = useMemo(() => tonalGravityCandidates(phraseEvents, nowMs || phraseEvents.at(-1)?.onsetMs || 0, 12), [nowMs, phraseEvents]);
  const nextNoteForks = useMemo(() => resolutionForks(phraseEvents, frame.rootPitchClass, scale, 4), [frame.rootPitchClass, phraseEvents, scale]);
  const articulationEvidence = useMemo(() => articulationTimeline(phraseEvents, nowMs || phraseEvents.at(-1)?.onsetMs || 0), [nowMs, phraseEvents]);
  const motifTransformations = useMemo(() => detectMotifTransformations(phraseEvents, 3), [phraseEvents]);
  const chordGestures = useMemo(() => groupChordGestures(events, chordWindowMs, chordWindowMs * 2, boundaryCorrections), [boundaryCorrections, chordWindowMs, events]);
  const chordMeasures = useMemo<ChordMeasure[]>(() => chordGestures.map((gesture, index) => {
    const pitchClassCount = new Set(gesture.attackedNotes.map(pitchClassFromMidi)).size;
    const candidates = pitchClassCount <= 5 ? identifyChordCandidates(gesture.attackedNotes, 3) : [];
    const candidate = candidates.find((item) => item.exact) ?? candidates[0] ?? null;
    const soundingNotes = gesture.soundingNotesAtClose.length ? gesture.soundingNotesAtClose : uniqueSorted(gesture.attackedNotes);
    const perception = soundingNotes.length >= 2 ? sonorityPerceptionModel(soundingNotes.map((note) => pianoSoundVoice(frequencyFromMidi(note), 0.72, soundModelId))) : null;
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
  }), [chordGestures, doMidi, scale, soundModelId]);
  const selectedChordMeasure = chordMeasures.find((measure) => measure.gesture.id === selectedChordId) ?? chordMeasures.at(-1) ?? null;
  const effectiveSelectedChordId = selectedChordMeasure?.gesture.id ?? null;
  const selectedGesture = selectedChordMeasure?.gesture ?? null;

  const activeNotesMap = useMemo(() => {
    const combined = new Map(latchedNotes);
    midi.notes.forEach((velocity, note) => combined.set(note, velocity));
    return combined;
  }, [latchedNotes, midi.notes]);
  const activeNoteNumbers = useMemo(() => uniqueSorted(Array.from(activeNotesMap.keys())), [activeNotesMap]);
  useEffect(() => {
    if (focusLens !== "paths" || !landmarkTargetNotes.length || !activeNoteNumbers.length) return;
    const latestEventId = phraseEvents.at(-1)?.id ?? 0;
    if (latestEventId <= landmarkLastMatchIdRef.current) return;
    if (!matchesLandmarkStep(landmarkPath, effectiveLandmarkStepIndex, activeNoteNumbers, pitchClassFromMidi(doMidi))) return;
    landmarkLastMatchIdRef.current = latestEventId;
    const timer = window.setTimeout(() => {
      setLandmarkStepIndex((current) => Math.min(landmarkPath.steps.length, current + 1));
    }, 0);
    return () => window.clearTimeout(timer);
  }, [activeNoteNumbers, doMidi, effectiveLandmarkStepIndex, focusLens, landmarkPath, landmarkTargetNotes.length, phraseEvents]);
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
  const resolutionMatched = resolutionTarget ? phraseEvents.some((event) => event.id > resolutionTarget.anchorEventId && pitchClassFromMidi(event.note) === resolutionTarget.pitchClass) : false;
  const focusedEvent = events.find((event) => event.id === focusedId) ?? events.at(-1) ?? null;

  const measures = useMemo<EventMeasure[]>(() => events.map((event, index) => {
    const notes = uniqueSorted(event.fieldNotes);
    const perception = notes.length >= 2 ? sonorityPerceptionModel(notes.map((note) => pianoSoundVoice(frequencyFromMidi(note), Math.max(0.12, (note === event.note ? event.velocity : 88) / 127), soundModelId))) : null;
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
  }), [doMidi, events, scale, soundModelId]);

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
    setResolutionTarget(null);
    setResolutionForkSet(null);
    setLandmarkStepIndex(0);
    landmarkLastMatchIdRef.current = 0;
    setExperiencePhrase([]);
    setExperienceDraft({});
    setExperienceQuestionIndex(0);
    setExperienceSaved(false);
    setCharacterDeleteArmed(false);
    setFingerprintRotation(0);
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
    setResolutionTarget(null);
    setResolutionForkSet(null);
    setLockedScaleId(candidate.scale.id);
    setLockedDoMidi(nearestMidiForPitchClass(candidate.rootPitchClass, 60));
    setFrameMode("locked");
  };

  const toggleFrameMode = () => {
    setResolutionTarget(null);
    setResolutionForkSet(null);
    if (frameMode === "discover") {
      setLockedScaleId(scale.id);
      setLockedDoMidi(doMidi);
      setFrameMode("locked");
    } else setFrameMode("discover");
  };

  const captureExperiencePhrase = () => {
    if (phraseEvents.length < 3) {
      setExperiencePhrase([]);
      setExperienceDraft({});
      setExperienceQuestionIndex(0);
      setExperienceSaved(false);
      return;
    }
    setExperiencePhrase([...phraseEvents]);
    setExperienceDraft({});
    setExperienceQuestionIndex(0);
    setExperienceSaved(false);
    setCharacterDeleteArmed(false);
  };

  const answerExperienceQuestion = (key: keyof PhraseCharacterRatings, value: number) => {
    setExperienceDraft((current) => ({ ...current, [key]: value }));
    setExperienceQuestionIndex((current) => Math.min(CHARACTER_QUESTIONS.length, current + 1));
    setExperienceSaved(false);
  };

  const backExperienceQuestion = () => {
    setExperienceQuestionIndex((current) => Math.max(0, current - 1));
    setExperienceSaved(false);
  };

  const saveExperienceReport = () => {
    if (experiencePhrase.length < 3 || CHARACTER_QUESTIONS.some((question) => experienceDraft[question.key] == null)) return;
    const observation: PhraseCharacterObservation = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      recordedAt: new Date().toISOString(),
      phraseSignature: phraseRelationshipSignature(experiencePhrase),
      ratings: experienceDraft as PhraseCharacterRatings,
      evidence: experienceEvidence,
      soundModelId,
    };
    setPhraseCharacterObservations((current) => [...current, observation]);
    setExperienceSaved(true);
    setCharacterDeleteArmed(false);
  };

  const reflectOnExperienceAgain = () => {
    setExperienceDraft({});
    setExperienceQuestionIndex(0);
    setExperienceSaved(false);
  };

  const deletePhraseReports = () => {
    setPhraseCharacterObservations([]);
    try { window.localStorage.removeItem(PHRASE_CHARACTER_STORAGE_KEY); } catch { /* Local deletion remains best-effort when storage is unavailable. */ }
    setCharacterDeleteArmed(false);
  };

  const selectFocusLens = (lens: FocusLens) => {
    if (lens === "paths") {
      setLockedScaleId(scale.id);
      setLockedDoMidi(doMidi);
      setFrameMode("locked");
      setGhostChord(null);
      setGhostNotes([]);
      setResolutionTarget(null);
      setResolutionForkSet(null);
      landmarkLastMatchIdRef.current = phraseEvents.at(-1)?.id ?? 0;
    }
    if (lens === "experience") captureExperiencePhrase();
    setFocusLens(lens);
    const url = new URL(window.location.href);
    url.searchParams.set("pianoLens", lens);
    window.history.replaceState(null, "", url);
  };

  const selectLandmarkPath = (id: LandmarkPathId) => {
    setLockedScaleId(scale.id);
    setLockedDoMidi(doMidi);
    setFrameMode("locked");
    setLandmarkPathId(id);
    setLandmarkStepIndex(0);
    landmarkLastMatchIdRef.current = phraseEvents.at(-1)?.id ?? 0;
    setGhostChord(null);
    setGhostNotes([]);
    setResolutionTarget(null);
    setResolutionForkSet(null);
  };

  const replayLandmarkPath = () => {
    setLandmarkStepIndex(0);
    landmarkLastMatchIdRef.current = phraseEvents.at(-1)?.id ?? 0;
  };

  const chooseGhostChord = (chord: NearbyChord) => {
    const center = analysisNotes.length ? analysisNotes.reduce((sum, note) => sum + note, 0) / analysisNotes.length : 60;
    setResolutionTarget(null);
    setResolutionForkSet(null);
    setGhostChord(chord);
    setGhostNotes(voiceChordNear(chord.pitchClasses, analysisNotes, center));
  };

  const chooseResolutionTarget = (fork: ResolutionFork) => {
    setGhostChord(null);
    setGhostNotes([]);
    setResolutionForkSet(resolutionForkSet ?? nextNoteForks);
    setResolutionTarget({ ...fork, anchorEventId: phraseEvents.at(-1)?.id ?? 0, frameRootPitchClass: frame.rootPitchClass, frameScaleId: scale.id });
  };

  const newestInsight = focusLens === "experience" ? experiencePhrase.length < 3
    ? "Play at least three attacks, then hold the latest phrase for a personal reflection."
    : experienceSaved
      ? "Your phrase report was saved locally as one uncertain observation; it remains separate from measured and modeled evidence."
      : experienceQuestionIndex < CHARACTER_QUESTIONS.length
        ? `Reflection ${experienceQuestionIndex + 1} of 4: ${CHARACTER_QUESTIONS[experienceQuestionIndex].prompt}`
        : "All four personal dimensions are answered. Review them together before saving this observation."
    : focusLens === "paths" ? effectiveLandmarkStepIndex >= landmarkPath.steps.length
    ? `${landmarkPath.family} complete: ${landmarkPath.invariant}`
    : `${landmarkPath.family}: ${effectiveLandmarkStepIndex} of ${landmarkPath.steps.length} fields matched. Next, play the outlined ${landmarkPath.steps[effectiveLandmarkStepIndex].role}; ${landmarkPath.steps[effectiveLandmarkStepIndex].prompt.toLowerCase()}`
    : focusedEvent ? (() => {
    const context = noteContext(focusedEvent.note, doMidi, scale);
    const fieldCandidate = fieldPitchClassCount <= 5 ? selectedChordMeasure?.candidate ?? chordCandidates[0] : undefined;
    const intervalCopy = latestInterval ? `${latestInterval.relationship} from the prior attack` : "the first attack in this trace";
    const routeCopy = context.inScale ? `inside the current ${scale.name}` : `outside the current route`;
    const motionCopy = resolution?.label ?? "building a baseline";
    const focusedArticulationIndex = articulationEvidence.findIndex((item) => item.eventId === focusedEvent.id);
    const connectionAroundFocus = focusedArticulationIndex > 0 ? articulationEvidence[focusedArticulationIndex - 1] : articulationEvidence[focusedArticulationIndex];
    const articulationCopy = connectionAroundFocus ? `The touch around this attack is ${ARTICULATION_LABELS[connectionAroundFocus.kind]} (${articulationConnectionCopy(connectionAroundFocus)}).` : "";
    const latestMotif = motifTransformations.find((motif) => motif.targetEventIds.includes(focusedEvent.id)) ?? motifTransformations[0];
    const motifCopy = latestMotif ? `Phrase memory also finds ${motifTitle(latestMotif)}.` : "";
    const transitionCopy = selectedChordMeasure ? selectedChordMeasure.hasPreviousChord ? `Grouped across ${Math.round(selectedChordMeasure.gesture.spreadMs)} ms: ${evidenceWord(selectedChordMeasure.novelty)} pitch-set novelty, ${evidenceWord(selectedChordMeasure.motion)} voice motion${selectedChordMeasure.rootTravelSteps == null ? "" : `, and ${selectedChordMeasure.rootTravelSteps} fifths step${selectedChordMeasure.rootTravelSteps === 1 ? "" : "s"} of root travel`}.` : `Grouped across ${Math.round(selectedChordMeasure.gesture.spreadMs)} ms; this first chord gesture sets the transition baseline.` : "";
    const chordCopy = fieldCandidate ? fieldCandidate.exact ? `The ${selectedGesture ? "grouped attacks" : fieldIsLive ? "held" : "last"} form ${chordLabel(fieldCandidate, doMidi, showConventions)}.` : `The grouped field may outline ${chordLabel(fieldCandidate, doMidi, showConventions)}; tones are missing or added.` : fieldPitchClassCount > 5 ? `The ${fieldPitchClassCount}-position field is scale-like, so no chord label is forced.` : "Hold another note to expose chord relationships.";
    return `${showConventions ? conventionalPitchName(focusedEvent.note) : context.syllable} arrived as ${intervalCopy}, ${routeCopy}; modeled evidence is ${motionCopy}. ${articulationCopy} ${motifCopy} ${chordCopy} ${transitionCopy}`.trim();
  })() : "Play a MIDI or on-screen key. One note attack will appear in every view at once.";

  const renderKey = (note: number, black: boolean) => {
    const context = noteContext(note, doMidi, scale);
    const active = activeNotesMap.has(note);
    const pressed = midi.pressed.has(note);
    const sustained = midi.sustained.has(note);
    const focused = focusedEvent?.note === note;
    const chordMember = selectedGesture?.attackedNotes.includes(note) ?? false;
    const inherited = selectedGesture?.inheritedNotes.includes(note) ?? false;
    const chordGhost = ghostNotes.includes(note);
    const resolutionGhost = resolutionTarget != null && pitchClassFromMidi(note) === resolutionTarget.pitchClass;
    const landmarkGhost = focusLens === "paths" && landmarkTargetNotes.includes(note);
    const ghost = chordGhost || resolutionGhost || landmarkGhost;
    const home = context.stepsWithinOctave === 0;
    const className = ["piano-key", black ? "is-black" : "is-white", context.inScale ? "is-in-scale" : "", active ? "is-active" : "", pressed ? "is-pressed" : "", sustained ? "is-sustained" : "", focused ? "is-focused" : "", chordMember ? "is-chord-member" : "", inherited ? "is-inherited" : "", ghost ? "is-ghost" : "", home ? "is-home" : ""].filter(Boolean).join(" ");
    const style = ({
      "--key-left": black ? `${(WHITE_NOTES.filter((white) => white < note).length / WHITE_NOTES.length) * 100}%` : `${(WHITE_NOTES.indexOf(note) / WHITE_NOTES.length) * 100}%`,
      "--key-width": `${100 / WHITE_NOTES.length}%`,
    } as CSSProperties);
    return <button key={note} type="button" className={className} style={style} aria-pressed={active} aria-label={`${context.syllable}, ${context.inScale ? "in" : "outside"} the current route, ${formatHz(context.frequencyHz)}${showConventions ? `, ${conventionalPitchName(note)}` : ""}${sustained ? ", sustained by pedal" : ""}${chordMember ? ", attacked in selected chord" : inherited ? ", inherited into selected chord field" : ""}${chordGhost ? ", silent chord target" : resolutionGhost ? ", silent resolution target, any octave" : landmarkGhost ? ", silent landmark path target" : ""}`} onClick={() => toggleScreenKey(note)}><span>{context.inScale || active || home || ghost ? context.syllable : "·"}</span>{showConventions ? <small>{conventionalPitchName(note)}</small> : null}</button>;
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
          <button type="button" disabled={focusLens === "paths"} aria-pressed={frameMode === "locked"} onClick={toggleFrameMode}>{focusLens === "paths" ? "Do fixed for path" : frameMode === "locked" ? "Unlock Do" : "Lock Do"}</button>
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

      <SoundModelDisclosure value={soundModelId} onChange={setSoundModelId} />

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
        <ScalePracticeField phraseEvents={phraseEvents} frame={frame} doMidi={doMidi} showConventions={showConventions} gravity={gravityCandidates} fingerprintRotation={fingerprintRotation} forks={resolutionForkSet ?? nextNoteForks} target={resolutionTarget} targetMatched={resolutionMatched} onRotate={() => setFingerprintRotation((current) => current + 1)} onChooseTarget={chooseResolutionTarget} onClearTarget={() => { setResolutionTarget(null); setResolutionForkSet(null); }} />
      </div> : focusLens === "paths" ? <LandmarkPathCoach path={landmarkPath} stepIndex={effectiveLandmarkStepIndex} targetNotes={landmarkTargetNotes} doMidi={doMidi} scale={scale} soundModelId={soundModelId} showConventions={showConventions} onSelect={selectLandmarkPath} onReplay={replayLandmarkPath} /> : focusLens === "experience" ? <ExperienceLens captured={experiencePhrase} latestCount={phraseEvents.length} observations={phraseCharacterObservations} draft={experienceDraft} questionIndex={experienceQuestionIndex} saved={experienceSaved} evidence={experienceEvidence} soundModelLabel={soundModel.label} deleteArmed={characterDeleteArmed} onCapture={captureExperiencePhrase} onAnswer={answerExperienceQuestion} onBack={backExperienceQuestion} onSave={saveExperienceReport} onReflectAgain={reflectOnExperienceAgain} onArmDelete={() => setCharacterDeleteArmed(true)} onDelete={deletePhraseReports} /> : focusLens === "motion" ? <div className="piano-focus-grid is-motion">
        <FrequencyView events={events} gestures={chordGestures} selectedChordId={effectiveSelectedChordId} doMidi={doMidi} scale={scale} focusedId={focusedEvent?.id ?? null} showConventions={showConventions} />
        <VoiceLeadingCoach measures={chordMeasures} selectedId={effectiveSelectedChordId} doMidi={doMidi} scale={scale} showConventions={showConventions} />
        <PhraseMotionField events={phraseEvents} articulation={articulationEvidence} motifs={motifTransformations} />
      </div> : null}

      <div className="piano-hud-keyboard-wrap">
        <div className="hud-panel-heading"><span>Held + grouped notes</span><strong>Persistent keyboard field</strong><small>solid held · ring sustained · gold chord attack · dotted inherited · dashed silent target · double mark Do</small></div>
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

      <footer className="piano-hud-insight" aria-live="polite"><span>What changed?</span><strong>{newestInsight}</strong><small>The ribbon retains sixty seconds while the coordinated views magnify the latest seven attacks. Crunch and the spectral share of repose use the selected {soundModel.shortLabel.toLowerCase()} teaching spectrum; pull toward Do does not. Voice strands use nearest keyboard motion, not intended fingering. Musical goodness still depends on timing, style, memory, intention, timbre, and your response.</small></footer>
    </section>
  );
}
