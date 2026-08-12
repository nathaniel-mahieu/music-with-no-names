"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ECHO_KEY_PHRASES,
  ECHO_KEY_LESSON_STORAGE_KEY,
  ECHO_KEY_STORAGE_KEY,
  ECHO_KEY_VARIATION_SHIFTS,
  confusionFromEvaluation,
  echoKeyCaptureIssue,
  echoKeyIntervalName,
  echoKeyRepairPairs,
  echoKeyTargetNotes,
  evaluateEchoKeyAttempt,
  parseEchoKeyConfusions,
  signedSemitoneLabel,
  summarizeEchoKeyConfusions,
  type EchoKeyAttemptMode,
  type EchoKeyConfusion,
  type EchoKeyCaptureIssue,
  type EchoKeyEvaluation,
  type EchoKeyPhrase,
  type EchoKeyRoute,
} from "@/lib/echo-key-model";
import { configureSafetyCompressor, SYNTH_MASTER_GAIN } from "@/lib/audio-level";
import {
  PIANO_SCALES,
  conventionalPitchName,
  frequencyFromMidi,
  noteContext,
  type PianoScale,
} from "@/lib/piano-model";
import {
  displayedAccidentalsForMeasure,
  makeNotatedPitch,
  preferredAccidentalsForShape,
  preferredAccidentalsForTonic,
  spellShapeRelativePitch,
  type Accidental,
  type Clef,
  type NotatedPitch,
} from "@/lib/piano-sight-reading-model";
import styles from "./PianoEchoKeyHud.module.css";

export type PianoEchoKeyEvent = {
  id: number;
  note: number;
  onsetMs: number;
};

type PianoEchoKeyHudProps = {
  events: PianoEchoKeyEvent[];
  activeNotes: number[];
  doMidi: number;
  scale: PianoScale;
  showConventions: boolean;
  frozen: boolean;
  onResumeCapture: () => void;
};

type EchoPhase = "hear" | "sing" | "find" | "diagnose" | "repair" | "read" | "vary";
type SingReport = "sang-path" | "uncertain" | "skipped";
type FrameSnapshot = { doMidi: number; scale: PianoScale };
type AudioContextWindow = Window & typeof globalThis & { webkitAudioContext?: typeof AudioContext };
type ToneSegment = { note: number | null; beats: number };
type PersistedEchoLesson = {
  version: 1;
  phraseId: string;
  phase: EchoPhase;
  attemptMode: EchoKeyAttemptMode;
  frameDoMidi: number;
  frameScaleId: PianoScale["id"];
  attemptBoundaryId: number;
  completedNotes: number[] | null;
  hasHeard: boolean;
  singReport: SingReport | null;
  variationShift: number;
};

const PHASES: Array<{ id: EchoPhase; short: string; label: string }> = [
  { id: "hear", short: "01", label: "Hear" },
  { id: "sing", short: "02", label: "Sing" },
  { id: "find", short: "03", label: "Find" },
  { id: "diagnose", short: "04", label: "Diagnose" },
  { id: "repair", short: "05", label: "Repair" },
  { id: "read", short: "06", label: "Read" },
  { id: "vary", short: "07", label: "Vary" },
];
const CAPTURE_SETTLE_MS = 360;

const ROUTE_SCALE_ID: Record<EchoKeyRoute, PianoScale["id"]> = {
  major: "bright-seven",
  "natural-minor": "shadow-seven",
  "major-pentatonic": "open-five",
};

const ROUTE_LABEL: Record<EchoKeyRoute, string> = {
  major: "major relationship field",
  "natural-minor": "natural-minor relationship field",
  "major-pentatonic": "major-pentatonic relationship field",
};

const MODE_COPY: Record<EchoKeyAttemptMode, { label: string; short: string; detail: string }> = {
  relative: {
    label: "Begin anywhere",
    short: "any-key relationship",
    detail: "Your first attack places the phrase. Every later move is compared with that transposed path.",
  },
  "given-start": {
    label: "Match the heard start",
    short: "heard-start placement",
    detail: "The relationship and the absolute first pitch must match the phrase you heard. No target key is shown.",
  },
};

const SING_REPORT_COPY: Record<SingReport, string> = {
  "sang-path": "You completed a sing or hum attempt and reported that it felt clear.",
  uncertain: "You completed a sing or hum attempt and reported that it felt uncertain.",
  skipped: "You skipped the voice attempt this round.",
};

function cx(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

function routeForScale(scale: PianoScale): EchoKeyRoute | null {
  const match = (Object.entries(ROUTE_SCALE_ID) as Array<[EchoKeyRoute, PianoScale["id"]]>).find(([, id]) => id === scale.id);
  return match?.[0] ?? null;
}

function scaleForPhrase(phrase: EchoKeyPhrase, incoming: PianoScale) {
  if (ROUTE_SCALE_ID[phrase.route] === incoming.id) return incoming;
  return PIANO_SCALES.find((candidate) => candidate.id === ROUTE_SCALE_ID[phrase.route]) ?? incoming;
}

function parsePersistedEchoLesson(raw: string | null): PersistedEchoLesson | null {
  if (!raw) return null;
  try {
    const value = JSON.parse(raw) as Partial<PersistedEchoLesson>;
    const validPhase = PHASES.some((phase) => phase.id === value.phase);
    const phrase = ECHO_KEY_PHRASES.find((candidate) => candidate.id === value.phraseId);
    const validScale = PIANO_SCALES.some((scale) => scale.id === value.frameScaleId);
    const validMode = value.attemptMode === "relative" || value.attemptMode === "given-start";
    const validSingReport = value.singReport == null || value.singReport === "sang-path" || value.singReport === "uncertain" || value.singReport === "skipped";
    const validNotes = value.completedNotes == null || Array.isArray(value.completedNotes)
      && value.completedNotes.length <= 16
      && value.completedNotes.every((note) => Number.isInteger(note) && note >= 0 && note <= 127);
    if (value.version !== 1 || !validPhase || !phrase || !validScale || !validMode || !validSingReport || !validNotes) return null;
    if (!Number.isInteger(value.frameDoMidi) || value.frameDoMidi! < 0 || value.frameDoMidi! > 127) return null;
    if (!Number.isInteger(value.attemptBoundaryId) || value.attemptBoundaryId! < -1) return null;
    if (typeof value.hasHeard !== "boolean" || !ECHO_KEY_VARIATION_SHIFTS.includes(value.variationShift as typeof ECHO_KEY_VARIATION_SHIFTS[number])) return null;
    if (ROUTE_SCALE_ID[phrase.route] !== value.frameScaleId) return null;
    if (phrase.offsets.some((offset) => value.frameDoMidi! + offset < 0 || value.frameDoMidi! + offset > 127)) return null;
    if (value.phase !== "hear" && !value.hasHeard) return null;
    if (["hear", "sing", "find"].includes(value.phase!) && value.completedNotes != null) return null;
    if (["diagnose", "repair", "read", "vary"].includes(value.phase!) && value.completedNotes?.length !== phrase.offsets.length) return null;
    if (["find", "diagnose", "repair", "read", "vary"].includes(value.phase!) && value.singReport == null) return null;
    return value as PersistedEchoLesson;
  } catch {
    return null;
  }
}

function newestEventId(events: PianoEchoKeyEvent[]) {
  return events.reduce((latest, event) => Math.max(latest, event.id), -1);
}

function fitPhraseTonic(phrase: EchoKeyPhrase, value: number) {
  const minimumOffset = Math.min(...phrase.offsets);
  const maximumOffset = Math.max(...phrase.offsets);
  return Math.max(-minimumOffset, Math.min(127 - maximumOffset, Math.round(value)));
}

function fadeAndCloseAudio(context: AudioContext | null, master: GainNode | null) {
  if (!context || context.state === "closed") return;
  try {
    const now = context.currentTime;
    if (master) {
      master.gain.cancelScheduledValues(now);
      master.gain.setValueAtTime(Math.max(0.0001, master.gain.value), now);
      master.gain.exponentialRampToValueAtTime(0.0001, now + 0.02);
    }
    window.setTimeout(() => { if (context.state !== "closed") void context.close(); }, 28);
  } catch {
    void context.close();
  }
}

function contourLevels(offsets: number[]) {
  return offsets.reduce<number[]>((levels, value, index) => {
    if (index === 0) return [0];
    const movement = Math.sign(value - offsets[index - 1]);
    return [...levels, levels[levels.length - 1] + movement];
  }, []);
}

function plotPoints(values: number[], width = 680, height = 180, insetX = 36, insetY = 30) {
  if (!values.length) return "";
  const minimum = Math.min(...values);
  const maximum = Math.max(...values);
  const span = Math.max(1, maximum - minimum);
  return values.map((value, index) => {
    const x = values.length === 1 ? width / 2 : insetX + index * ((width - insetX * 2) / (values.length - 1));
    const y = insetY + (maximum - value) / span * (height - insetY * 2);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(" ");
}

function pointCoordinates(values: number[], width = 680, height = 180, insetX = 36, insetY = 30) {
  if (!values.length) return [];
  const minimum = Math.min(...values);
  const maximum = Math.max(...values);
  const span = Math.max(1, maximum - minimum);
  return values.map((value, index) => ({
    x: values.length === 1 ? width / 2 : insetX + index * ((width - insetX * 2) / (values.length - 1)),
    y: insetY + (maximum - value) / span * (height - insetY * 2),
  }));
}

function accidentalGlyph(accidental: Accidental | null) {
  if (accidental === "flat") return "♭";
  if (accidental === "sharp") return "♯";
  if (accidental === "natural") return "♮";
  if (accidental === "double-flat") return "𝄫";
  if (accidental === "double-sharp") return "𝄪";
  return "";
}

function diagnosticCopy(evaluation: EchoKeyEvaluation) {
  if (evaluation.kind === "secure") return {
    eyebrow: "Complete relationship",
    headline: evaluation.alignmentShift === 0
      ? "Every direction and semitone width matched."
      : `Every move survived a ${signedSemitoneLabel(evaluation.alignmentShift)} transposition.`,
    body: "This compares the received MIDI path with the authored path. It does not identify how you heard, sang, found, or physically produced it.",
  };
  if (evaluation.kind === "anchor") return {
    eyebrow: "Starting-place difference",
    headline: "The complete relationship matched, but it began away from the heard first pitch.",
    body: "Only placement differs in this mode. The interval path itself is intact; the comparison does not assign a perceptual or motor cause.",
  };
  if (evaluation.kind === "contour") return {
    eyebrow: "First relational divergence",
    headline: evaluation.divergence?.expectedContour === 0 || evaluation.divergence?.performedContour === 0
      ? `Move ${(evaluation.divergence?.moveIndex ?? 0) + 1} changed between repeating and moving.`
      : `Move ${(evaluation.divergence?.moveIndex ?? 0) + 1} turned in a different direction.`,
    body: `The authored move was ${signedSemitoneLabel(evaluation.divergence?.expectedInterval ?? 0)}; the keyboard supplied ${signedSemitoneLabel(evaluation.divergence?.performedInterval ?? 0)}. Later moves remain visible but are not treated as the cause.`,
  };
  return {
    eyebrow: "First relational divergence",
    headline: `Move ${(evaluation.divergence?.moveIndex ?? 0) + 1} kept its direction but changed width.`,
    body: `The authored move was ${signedSemitoneLabel(evaluation.divergence?.expectedInterval ?? 0)}; the keyboard supplied ${signedSemitoneLabel(evaluation.divergence?.performedInterval ?? 0)}. The preserved contour is credited separately from exact spacing.`,
  };
}

function ContourOnly({ phrase, revealed }: { phrase: EchoKeyPhrase; revealed: boolean }) {
  const levels = contourLevels(phrase.offsets);
  const points = pointCoordinates(levels);
  return <figure className={cx(styles.contourFigure, revealed && styles.isRevealed)}>
    <div className={styles.contourStage} role="img" aria-label={revealed
      ? `Contour-only memory trace for ${phrase.title}. It shows ${levels.length} events and direction changes, but not keys, note names, staff positions, or exact interval widths.`
      : "The contour remains veiled until the phrase has been played."}>
      {revealed ? <svg viewBox="0 0 680 180" preserveAspectRatio="none" aria-hidden="true">
        <polyline points={plotPoints(levels)} />
        {points.map((point, index) => <g key={`${point.x}-${index}`}>
          <circle cx={point.x} cy={point.y} r={index === 0 || index === points.length - 1 ? 8 : 6} />
          {index < points.length - 1 ? <text x={(point.x + points[index + 1].x) / 2} y={(point.y + points[index + 1].y) / 2 - 10}>{levels[index + 1] > levels[index] ? "up" : levels[index + 1] < levels[index] ? "down" : "same"}</text> : null}
        </g>)}
      </svg> : <div className={styles.contourVeil}><i /><i /><i /><span>sound first · shape second</span></div>}
    </div>
    <figcaption>{revealed ? "Direction only: every rise and fall has equal visual height, so this cannot reveal exact semitone width." : "Press Hear phrase. The first visual arrives only after sound."}</figcaption>
  </figure>;
}

function RelationshipPlot({ evaluation }: { evaluation: EchoKeyEvaluation }) {
  const target = evaluation.alignedTarget.map((note) => note - evaluation.alignedTarget[0]);
  const performed = evaluation.performed.map((note) => note - evaluation.performed[0]);
  const sharedMinimum = Math.min(...target, ...performed);
  const sharedMaximum = Math.max(...target, ...performed);
  const domainMinimum = Math.min(-12, Math.floor(sharedMinimum / 12) * 12);
  const domainMaximum = Math.max(12, Math.ceil(sharedMaximum / 12) * 12);
  const span = domainMaximum - domainMinimum;
  const guideStep = span > 48 ? 12 : span > 24 ? 6 : 4;
  const guides = Array.from({ length: Math.floor(span / guideStep) + 1 }, (_, index) => domainMinimum + index * guideStep);
  const coordinates = (values: number[]) => values.map((value, index) => ({
    x: values.length === 1 ? 340 : 36 + index * (608 / Math.max(1, values.length - 1)),
    y: 26 + (domainMaximum - value) / span * 148,
  }));
  const targetPoints = coordinates(target);
  const performedPoints = coordinates(performed);
  const toPolyline = (points: Array<{ x: number; y: number }>) => points.map((point) => `${point.x.toFixed(1)},${point.y.toFixed(1)}`).join(" ");
  const divergencePoint = evaluation.divergence ? evaluation.divergence.moveIndex + 1 : null;
  return <figure className={styles.relationshipFigure}>
    <div className={styles.relationshipLegend}><span><i className={styles.targetSwatch} />authored relation</span><span><i className={styles.attemptSwatch} />played relation</span><em>fixed −12 to +12 semitone ruler; expands by octaves only when needed</em></div>
    <svg viewBox="0 0 680 200" role="img" aria-label={`Delayed relational path. ${evaluation.targetIntervals.length - Math.round(evaluation.contourAccuracy * evaluation.targetIntervals.length)} of ${evaluation.targetIntervals.length} directions differ; ${evaluation.targetIntervals.length - Math.round(evaluation.intervalAccuracy * evaluation.targetIntervals.length)} exact moves differ. ${evaluation.divergence ? `First divergence is move ${evaluation.divergence.moveIndex + 1}.` : "No move diverges."}`}>
      <title>Authored and played relative pitch paths after the attempt</title>
      {guides.map((guide) => {
        const y = 26 + (domainMaximum - guide) / span * 148;
        return <g key={guide}><line x1="30" x2="658" y1={y} y2={y} className={styles.plotGuide} /><text x="24" y={y + 3} textAnchor="end" className={styles.plotGuideLabel}>{guide > 0 ? `+${guide}` : guide}</text></g>;
      })}
      <polyline points={toPolyline(targetPoints)} className={styles.targetPath} />
      <polyline points={toPolyline(performedPoints)} className={styles.attemptPath} />
      {targetPoints.map((point, index) => <circle key={`target-${index}`} cx={point.x} cy={point.y} r="6" className={styles.targetPoint} />)}
      {performedPoints.map((point, index) => <circle key={`attempt-${index}`} cx={point.x} cy={point.y} r="4.5" className={styles.attemptPoint} />)}
      {divergencePoint != null && performedPoints[divergencePoint] ? <g className={styles.divergenceMark}>
        <circle cx={performedPoints[divergencePoint].x} cy={performedPoints[divergencePoint].y} r="14" />
        <text x={performedPoints[divergencePoint].x + 18} y={performedPoints[divergencePoint].y - 12}>first difference</text>
      </g> : null}
    </svg>
    <figcaption>The paths share a zero starting point, so the view compares relationships rather than register. Labeled guides are semitone offsets; the same one-octave ruler is retained across ordinary attempts and expands only for an outlying performance. The authored line is withheld until diagnosis.</figcaption>
  </figure>;
}

function ledgerSteps(pitch: NotatedPitch) {
  const steps: number[] = [];
  if (pitch.staffStep <= -2) {
    for (let step = -2; step >= pitch.staffStep; step -= 2) steps.push(step);
  }
  if (pitch.staffStep >= 10) {
    for (let step = 10; step <= pitch.staffStep; step += 2) steps.push(step);
  }
  return steps;
}

function contextualPhrasePitches(notes: number[], doMidi: number) {
  const prefer = preferredAccidentalsForShape(doMidi, notes.map((note) => note - doMidi));
  return notes.map((note) => spellShapeRelativePitch(doMidi, note - doMidi, prefer));
}

function compactStaffLayout(spellings: NotatedPitch[], clef: Clef) {
  const candidates = Array.from({ length: 19 }, (_, index) => index - 9).flatMap((octaves) => {
    try {
      const pitches = spellings.map((pitch) => makeNotatedPitch({
        letter: pitch.letter,
        accidental: pitch.accidental,
        octave: pitch.octave + octaves,
        clef,
      }));
      const overflow = pitches.reduce((total, pitch) => total
        + Math.max(0, -2 - pitch.staffStep) ** 2
        + Math.max(0, pitch.staffStep - 10) ** 2, 0);
      const center = Math.abs(pitches.reduce((sum, pitch) => sum + pitch.staffStep, 0) / pitches.length - 4);
      return [{ pitches, octaves, score: overflow * 1_000 + Math.abs(octaves) * 100 + center }];
    } catch {
      return [];
    }
  }).sort((first, second) => first.score - second.score || Math.abs(first.octaves) - Math.abs(second.octaves));
  return candidates[0] ?? { pitches: spellings, octaves: 0, score: 0 };
}

function CompactStaff({ spellings, beats, showConventions }: { spellings: NotatedPitch[]; beats: number[]; showConventions: boolean }) {
  const notes = spellings.map((pitch) => pitch.midi);
  const clef: Clef = notes.reduce((sum, note) => sum + note, 0) / Math.max(1, notes.length) < 60 ? "bass" : "treble";
  const layout = compactStaffLayout(spellings, clef);
  const pitches = layout.pitches;
  const accidentals = displayedAccidentalsForMeasure(pitches);
  const xFor = (index: number) => 84 + index * (536 / Math.max(1, notes.length - 1));
  const yFor = (pitch: NotatedPitch) => 92 - pitch.staffStep * 6;
  const aria = spellings.map((pitch, index) => `${pitch.label}, event ${index + 1}, ${beats[index] ?? 1} beat${(beats[index] ?? 1) === 1 ? "" : "s"}`).join("; ");
  const registerTransfer = layout.octaves === 0 ? null : `${layout.octaves > 0 ? "+" : "−"}${Math.abs(layout.octaves)} written octave${Math.abs(layout.octaves) === 1 ? "" : "s"}`;
  return <figure className={styles.staffFigure}>
    <svg viewBox="0 0 680 136" role="img" aria-label={`Compact ${clef} staff revealed after listening and playing: ${aria}.${registerTransfer ? ` Noteheads are moved ${registerTransfer} for legibility while sounding pitch labels stay exact.` : ""}`}>
      <title>Compact notation of the authored relationship</title>
      {registerTransfer ? <text x="648" y="16" textAnchor="end" className={styles.staffTransfer}>teaching display · {registerTransfer}</text> : null}
      {[0, 1, 2, 3, 4].map((line) => <line key={line} x1="54" x2="648" y1={92 - line * 12} y2={92 - line * 12} className={styles.staffLine} />)}
      <text x="17" y="88" className={styles.clef}>{clef === "treble" ? "𝄞" : "𝄢"}</text>
      {pitches.map((pitch, index) => {
        const x = xFor(index);
        const y = yFor(pitch);
        return <g key={`${pitch.label}-${index}`}>
          {ledgerSteps(pitch).map((step) => <line key={step} x1={x - 13} x2={x + 13} y1={92 - step * 6} y2={92 - step * 6} className={styles.ledgerLine} />)}
          {accidentals[index] ? <text x={x - 21} y={y + 5} className={styles.accidental}>{accidentalGlyph(accidentals[index])}</text> : null}
          <ellipse cx={x} cy={y} rx="8.5" ry="6" transform={`rotate(-14 ${x} ${y})`} className={(beats[index] ?? 1) >= 2 ? styles.openNotehead : styles.notehead} />
          <line x1={x + 7} x2={x + 7} y1={y} y2={y - 28} className={styles.stem} />
          {showConventions ? <text x={x} y="128" className={styles.staffLabel}>{spellings[index].label}</text> : null}
        </g>;
      })}
      <line x1="650" x2="650" y1="44" y2="92" className={styles.barLine} />
    </svg>
    <figcaption>One unbarred teaching measure. Filled heads last one relative beat; open heads last two. Accidentals carry within the measure, and a natural cancels an earlier sign. {registerTransfer ? `To prevent extreme-register notes from clipping, this teaching staff moves every notehead ${Math.abs(layout.octaves)} octave${Math.abs(layout.octaves) === 1 ? "" : "s"} ${layout.octaves > 0 ? "up" : "down"}; sounding labels and the semitone strip remain exact.` : "Staff height matches the sounding register."}</figcaption>
  </figure>;
}

function ReadKeyboard({ notes, spellings, doMidi, scale, showConventions }: { notes: number[]; spellings: NotatedPitch[]; doMidi: number; scale: PianoScale; showConventions: boolean }) {
  const minimum = Math.max(0, Math.min(...notes) - 2);
  const maximum = Math.min(127, Math.max(...notes) + 2);
  const keys = Array.from({ length: maximum - minimum + 1 }, (_, index) => minimum + index);
  const targetEvents = new Map<number, number[]>();
  notes.forEach((note, index) => targetEvents.set(note, [...(targetEvents.get(note) ?? []), index + 1]));
  const aria = notes.map((note, index) => {
    const context = noteContext(note, doMidi, scale);
    return `event ${index + 1}: ${context.syllable}, ${note - doMidi >= 0 ? "+" : "−"}${Math.abs(note - doMidi)} semitones from Do${showConventions ? `, ${spellings[index].label}` : ""}`;
  }).join("; ");
  return <figure className={styles.readKeyboard}>
    <div className={styles.readKeyboardKeys} role="img" aria-label={`Revealed chromatic semitone strip from low to high. ${aria}.`}>
      {keys.map((note) => {
        const raised = [1, 3, 6, 8, 10].includes(((note % 12) + 12) % 12);
        const eventsHere = targetEvents.get(note) ?? [];
        const context = noteContext(note, doMidi, scale);
        return <div key={note} className={cx(styles.readKey, raised && styles.isRaisedKey, eventsHere.length > 0 && styles.isTargetKey)}>
          {eventsHere.length ? <><strong>{eventsHere.join("·")}</strong><span>{showConventions ? spellings[eventsHere[0] - 1].label : context.syllable}</span><small>{note - doMidi >= 0 ? "+" : "−"}{Math.abs(note - doMidi)} st</small></> : <span aria-hidden="true">·</span>}
        </div>;
      })}
    </div>
    <figcaption>Chromatic semitone strip—not a literal piano drawing. Every equal-width cell is one semitone from its neighbor; shorter dark cells identify piano black-key pitch classes. Event numbers show returns to the same sounding key.</figcaption>
  </figure>;
}

export function PianoEchoKeyHud({ events, activeNotes, doMidi, scale, showConventions, frozen, onResumeCapture }: PianoEchoKeyHudProps) {
  const initialPhrase = useMemo(() => {
    const incomingRoute = routeForScale(scale);
    return ECHO_KEY_PHRASES.find((phrase) => phrase.route === incomingRoute) ?? ECHO_KEY_PHRASES[0];
    // The initial selection is intentionally stable for the life of this mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const [phraseId, setPhraseId] = useState(initialPhrase.id);
  const phrase = ECHO_KEY_PHRASES.find((candidate) => candidate.id === phraseId) ?? ECHO_KEY_PHRASES[0];
  const [phase, setPhase] = useState<EchoPhase>("hear");
  const [attemptMode, setAttemptMode] = useState<EchoKeyAttemptMode>("relative");
  const [frame, setFrame] = useState<FrameSnapshot>(() => ({ doMidi: fitPhraseTonic(initialPhrase, doMidi), scale: scaleForPhrase(initialPhrase, scale) }));
  const [attemptBoundaryId, setAttemptBoundaryId] = useState(() => newestEventId(events));
  const [completedNotes, setCompletedNotes] = useState<number[] | null>(null);
  const [hasHeard, setHasHeard] = useState(false);
  const [singReport, setSingReport] = useState<SingReport | null>(null);
  const [confusions, setConfusions] = useState<EchoKeyConfusion[]>([]);
  const [historyHydrated, setHistoryHydrated] = useState(false);
  const [lessonHydrated, setLessonHydrated] = useState(false);
  const [clearHistoryArmed, setClearHistoryArmed] = useState(false);
  const [captureIssue, setCaptureIssue] = useState<EchoKeyCaptureIssue | null>(null);
  const [captureNeedsRelease, setCaptureNeedsRelease] = useState(false);
  const [captureBoundaryNotice, setCaptureBoundaryNotice] = useState<string | null>(null);
  const [variationShift, setVariationShift] = useState<number>(ECHO_KEY_VARIATION_SHIFTS[0]);
  const [audioState, setAudioState] = useState<"idle" | "playing" | "unavailable">("idle");
  const [audioNotice, setAudioNotice] = useState("Audio plays only after an explicit button press.");
  const audioContextRef = useRef<AudioContext | null>(null);
  const audioMasterRef = useRef<GainNode | null>(null);
  const audioTimerRef = useRef<number | null>(null);
  const audioTokenRef = useRef(0);
  const recordedAttemptRef = useRef<string | null>(null);
  const eventsRef = useRef(events);
  const phasePanelRef = useRef<HTMLElement | null>(null);
  const phaseRailRef = useRef<HTMLOListElement | null>(null);
  const previousPhaseRef = useRef<EchoPhase>(phase);

  const liveAttemptEvents = useMemo(() => captureNeedsRelease ? [] : events
    .filter((event) => event.id > attemptBoundaryId)
    .sort((first, second) => first.onsetMs - second.onsetMs || first.id - second.id), [attemptBoundaryId, captureNeedsRelease, events]);
  const liveAttemptNotes = useMemo(() => liveAttemptEvents.slice(0, phrase.offsets.length).map((event) => event.note), [liveAttemptEvents, phrase.offsets.length]);
  const evaluatedNotes = completedNotes ?? liveAttemptNotes;
  const evaluation = useMemo(() => evaluateEchoKeyAttempt(phrase, frame.doMidi, evaluatedNotes, attemptMode), [attemptMode, evaluatedNotes, frame.doMidi, phrase]);
  const liveEvaluation = useMemo(() => evaluateEchoKeyAttempt(phrase, frame.doMidi, liveAttemptNotes, attemptMode), [attemptMode, frame.doMidi, liveAttemptNotes, phrase]);
  const repairPairs = useMemo(() => echoKeyRepairPairs(evaluation), [evaluation]);
  const confusionSummaries = useMemo(() => summarizeEchoKeyConfusions(confusions), [confusions]);
  const relationalMissCount = useMemo(() => confusions.filter((confusion) => confusion.kind !== "anchor").length, [confusions]);
  const frameChangedOutside = frame.doMidi !== doMidi || frame.scale.id !== scaleForPhrase(phrase, scale).id;
  const targetNotes = useMemo(() => echoKeyTargetNotes(phrase, frame.doMidi), [frame.doMidi, phrase]);
  const availableVariationShifts = useMemo(() => ECHO_KEY_VARIATION_SHIFTS.filter((shift) => phrase.offsets.every((offset) => {
    const note = frame.doMidi + shift + offset;
    return Number.isInteger(note) && note >= 0 && note <= 127;
  })), [frame.doMidi, phrase.offsets]);
  const selectedVariationShift = availableVariationShifts.includes(variationShift as typeof ECHO_KEY_VARIATION_SHIFTS[number])
    ? variationShift
    : availableVariationShifts[0];
  const repairPlaybackShift = repairPairs && evaluation.divergence
    ? repairPairs.expected[0] - evaluation.divergence.performedFrom
    : 0;

  const stopAudio = useCallback((notice = "Playback stopped.") => {
    audioTokenRef.current += 1;
    if (audioTimerRef.current != null) window.clearTimeout(audioTimerRef.current);
    audioTimerRef.current = null;
    const context = audioContextRef.current;
    const master = audioMasterRef.current;
    audioContextRef.current = null;
    audioMasterRef.current = null;
    fadeAndCloseAudio(context, master);
    setAudioState("idle");
    setAudioNotice(notice);
  }, []);

  const playSegments = useCallback(async (segments: ToneSegment[], notice: string, onFinished?: () => void) => {
    const AudioContextConstructor = window.AudioContext || (window as AudioContextWindow).webkitAudioContext;
    if (!AudioContextConstructor) {
      setAudioState("unavailable");
      setAudioNotice("Reference playback is unavailable in this browser. Try a current Chrome, Edge, Safari, or Firefox release on another device.");
      return false;
    }
    audioTokenRef.current += 1;
    const token = audioTokenRef.current;
    if (audioTimerRef.current != null) window.clearTimeout(audioTimerRef.current);
    const previous = audioContextRef.current;
    const previousMaster = audioMasterRef.current;
    audioContextRef.current = null;
    audioMasterRef.current = null;
    fadeAndCloseAudio(previous, previousMaster);
    let context: AudioContext | null = null;
    let master: GainNode | null = null;
    try {
      context = new AudioContextConstructor({ latencyHint: "interactive" });
      const activeContext = context;
      audioContextRef.current = activeContext;
      await activeContext.resume();
      if (audioTokenRef.current !== token || audioContextRef.current !== activeContext) {
        fadeAndCloseAudio(activeContext, null);
        return false;
      }
      if (activeContext.state !== "running") throw new Error("Reference audio context did not enter the running state.");
      const now = activeContext.currentTime;
      const compressor = activeContext.createDynamicsCompressor();
      configureSafetyCompressor(compressor, now);
      master = activeContext.createGain();
      audioMasterRef.current = master;
      master.gain.setValueAtTime(SYNTH_MASTER_GAIN, now);
      compressor.connect(master).connect(activeContext.destination);
      const beatSeconds = 0.34;
      let cursor = now + 0.055;
      segments.forEach((segment) => {
        const segmentSeconds = Math.max(0.18, segment.beats * beatSeconds);
        if (segment.note != null) {
          const oscillator = activeContext.createOscillator();
          const envelope = activeContext.createGain();
          oscillator.type = "sine";
          oscillator.frequency.setValueAtTime(frequencyFromMidi(segment.note), cursor);
          envelope.gain.setValueAtTime(0.0001, cursor);
          envelope.gain.exponentialRampToValueAtTime(0.72, cursor + 0.018);
          envelope.gain.setValueAtTime(0.72, cursor + Math.max(0.04, segmentSeconds - 0.07));
          envelope.gain.exponentialRampToValueAtTime(0.0001, cursor + segmentSeconds);
          oscillator.connect(envelope).connect(compressor);
          oscillator.start(cursor);
          oscillator.stop(cursor + segmentSeconds + 0.025);
        }
        cursor += segmentSeconds + 0.055;
      });
      const durationMs = Math.max(180, (cursor - now + 0.08) * 1000);
      setAudioState("playing");
      setAudioNotice(notice);
      audioTimerRef.current = window.setTimeout(() => {
        if (audioTokenRef.current !== token) return;
        audioTimerRef.current = null;
        if (activeContext.state !== "closed") void activeContext.close();
        if (audioContextRef.current === activeContext) audioContextRef.current = null;
        if (audioMasterRef.current === master) audioMasterRef.current = null;
        setAudioState("idle");
        setAudioNotice("Reference finished. Continue from memory before replaying it.");
        onFinished?.();
      }, durationMs);
      return true;
    } catch {
      const cancelled = audioTokenRef.current !== token || audioContextRef.current !== context;
      fadeAndCloseAudio(context, master);
      if (audioContextRef.current === context) audioContextRef.current = null;
      if (audioMasterRef.current === master) audioMasterRef.current = null;
      if (cancelled) return false;
      setAudioState("unavailable");
      setAudioNotice("Reference playback could not start. Check this site’s audio permission or try another browser; the hidden exercise remains locked.");
      return false;
    }
  }, []);

  const hearTarget = useCallback(() => {
    void playSegments(
      targetNotes.map((note, index) => ({ note, beats: phrase.beats[index] ?? 1 })),
      `Playing ${phrase.title} once. No note names or target keys are being shown.`,
      () => setHasHeard(true),
    );
  }, [phrase.beats, phrase.title, playSegments, targetNotes]);

  const playRepair = useCallback((kind: "expected" | "performed" | "contrast") => {
    if (!repairPairs) {
      void playSegments(targetNotes.map((note, index) => ({ note, beats: phrase.beats[index] ?? 1 })), "Playing the intact target phrase once.");
      return;
    }
    const expected = repairPairs.expected.map((note) => ({ note, beats: 1 })) satisfies ToneSegment[];
    const performed = repairPairs.performed.map((note) => ({ note, beats: 1 })) satisfies ToneSegment[];
    const segments = kind === "expected" ? expected : kind === "performed" ? performed : [...expected, { note: null, beats: 1 }, ...performed];
    const relocation = repairPlaybackShift ? ` Both links are shifted ${signedSemitoneLabel(repairPlaybackShift)} into the playable MIDI range.` : "";
    void playSegments(segments, `${kind === "expected" ? "Playing the authored interval." : kind === "performed" ? "Playing the keyboard-supplied interval shape." : "Playing authored interval, then keyboard-supplied interval shape."}${relocation}`);
  }, [phrase.beats, playSegments, repairPairs, repairPlaybackShift, targetNotes]);

  useEffect(() => () => {
    audioTokenRef.current += 1;
    if (audioTimerRef.current != null) window.clearTimeout(audioTimerRef.current);
    const context = audioContextRef.current;
    fadeAndCloseAudio(context, audioMasterRef.current);
  }, []);

  useEffect(() => { eventsRef.current = events; }, [events]);

  useEffect(() => {
    if (previousPhaseRef.current === phase) return;
    previousPhaseRef.current = phase;
    const task = window.requestAnimationFrame(() => {
      phasePanelRef.current?.focus();
      const rail = phaseRailRef.current;
      const currentStep = rail?.querySelector<HTMLElement>('[aria-current="step"]');
      if (rail && currentStep) rail.scrollTo({
        left: currentStep.offsetLeft - (rail.clientWidth - currentStep.clientWidth) / 2,
        behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth",
      });
    });
    return () => window.cancelAnimationFrame(task);
  }, [phase]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      let persisted: PersistedEchoLesson | null = null;
      try {
        persisted = parsePersistedEchoLesson(window.sessionStorage.getItem(ECHO_KEY_LESSON_STORAGE_KEY));
      } catch {
        persisted = null;
      }
      if (persisted) {
        const persistedPhrase = ECHO_KEY_PHRASES.find((candidate) => candidate.id === persisted!.phraseId)!;
        const persistedScale = PIANO_SCALES.find((candidate) => candidate.id === persisted!.frameScaleId) ?? scaleForPhrase(persistedPhrase, scale);
        setPhraseId(persistedPhrase.id);
        setPhase(persisted.phase);
        setAttemptMode(persisted.attemptMode);
        setFrame({ doMidi: fitPhraseTonic(persistedPhrase, persisted.frameDoMidi), scale: persistedScale });
        const restoredFind = persisted.phase === "find";
        setAttemptBoundaryId(restoredFind ? newestEventId(events) : persisted.attemptBoundaryId);
        setCompletedNotes(restoredFind ? null : persisted.completedNotes?.slice(0, persistedPhrase.offsets.length) ?? null);
        setHasHeard(persisted.hasHeard);
        setSingReport(persisted.singReport);
        setVariationShift(persisted.variationShift);
        setCaptureNeedsRelease(restoredFind && activeNotes.length > 0);
        setCaptureBoundaryNotice(restoredFind
          ? "Find resumed with a fresh boundary. Attacks made while another Piano view was open were discarded; play the phrase again from its first tone."
          : null);
      }
      setLessonHydrated(true);
    }, 0);
    return () => window.clearTimeout(timer);
    // The persisted frame is authoritative for this mount; live-frame changes
    // remain visible through the explicit snapshot notice.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!lessonHydrated) return;
    const lesson: PersistedEchoLesson = {
      version: 1,
      phraseId: phrase.id,
      phase,
      attemptMode,
      frameDoMidi: frame.doMidi,
      frameScaleId: frame.scale.id,
      attemptBoundaryId,
      completedNotes,
      hasHeard,
      singReport,
      variationShift,
    };
    try {
      window.sessionStorage.setItem(ECHO_KEY_LESSON_STORAGE_KEY, JSON.stringify(lesson));
    } catch {
      // The exercise remains usable in memory when session storage is blocked.
    }
  }, [attemptBoundaryId, attemptMode, completedNotes, frame.doMidi, frame.scale.id, hasHeard, lessonHydrated, phase, phrase.id, singReport, variationShift]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      try {
        setConfusions(parseEchoKeyConfusions(window.sessionStorage.getItem(ECHO_KEY_STORAGE_KEY)));
      } catch {
        setConfusions([]);
      }
      setHistoryHydrated(true);
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (phase !== "find" || captureNeedsRelease || liveEvaluation.status !== "complete") return;
    const timer = window.setTimeout(() => {
      const latestEvents = eventsRef.current
        .filter((event) => event.id > attemptBoundaryId)
        .sort((first, second) => first.onsetMs - second.onsetMs || first.id - second.id);
      const issue = echoKeyCaptureIssue(latestEvents, phrase.offsets.length);
      if (issue) {
        setCaptureIssue(issue);
        return;
      }
      const latestNotes = latestEvents.map((event) => event.note);
      const latestEvaluation = evaluateEchoKeyAttempt(phrase, frame.doMidi, latestNotes, attemptMode);
      if (latestEvaluation.status !== "complete") return;
      const completionKey = `${phrase.id}:${attemptMode}:${attemptBoundaryId}:${latestEvaluation.performed.join(",")}`;
      if (recordedAttemptRef.current === completionKey) return;
      recordedAttemptRef.current = completionKey;
      setCaptureIssue(null);
      setCompletedNotes(latestEvaluation.performed);
      const record = confusionFromEvaluation(latestEvaluation, phrase.id);
      if (record) setConfusions((current) => {
          const next = [...current, record].slice(-80);
          try {
            window.sessionStorage.setItem(ECHO_KEY_STORAGE_KEY, JSON.stringify(next));
          } catch {
            // The visible history still works for this mount when storage is unavailable.
          }
          return next;
        });
      setPhase("diagnose");
    }, CAPTURE_SETTLE_MS);
    return () => window.clearTimeout(timer);
  }, [attemptBoundaryId, attemptMode, captureNeedsRelease, frame.doMidi, liveAttemptEvents, liveEvaluation.status, phase, phrase]);

  const resetExercise = useCallback((nextPhrase = phrase, nextDo = doMidi, nextMode = attemptMode) => {
    stopAudio("Exercise reset. Nothing is playing.");
    const nextScale = scaleForPhrase(nextPhrase, scale);
    setFrame({ doMidi: fitPhraseTonic(nextPhrase, nextDo), scale: nextScale });
    setAttemptMode(nextMode);
    setAttemptBoundaryId(newestEventId(events));
    setCompletedNotes(null);
    setCaptureIssue(null);
    setCaptureNeedsRelease(false);
    setCaptureBoundaryNotice(null);
    setHasHeard(false);
    setSingReport(null);
    setPhase("hear");
    recordedAttemptRef.current = null;
  }, [attemptMode, doMidi, events, phrase, scale, stopAudio]);

  const choosePhrase = useCallback((nextId: string) => {
    const nextPhrase = ECHO_KEY_PHRASES.find((candidate) => candidate.id === nextId) ?? ECHO_KEY_PHRASES[0];
    setPhraseId(nextPhrase.id);
    resetExercise(nextPhrase, doMidi, attemptMode);
  }, [attemptMode, doMidi, resetExercise]);

  const chooseMode = useCallback((nextMode: EchoKeyAttemptMode) => {
    if (nextMode === attemptMode) return;
    resetExercise(phrase, doMidi, nextMode);
  }, [attemptMode, doMidi, phrase, resetExercise]);

  const beginFind = useCallback((report: SingReport) => {
    stopAudio("Reference stopped. Capture begins after this boundary.");
    setSingReport(report);
    setAttemptBoundaryId(newestEventId(events));
    setCompletedNotes(null);
    setCaptureIssue(null);
    setCaptureNeedsRelease(activeNotes.length > 0);
    setCaptureBoundaryNotice(activeNotes.length > 0 ? "Capture is waiting for silence. Release every held or sustained note, then arm a fresh boundary." : null);
    recordedAttemptRef.current = null;
    setPhase("find");
  }, [activeNotes.length, events, stopAudio]);

  const retryPhrase = useCallback(() => {
    stopAudio("Retry boundary set. Nothing is playing.");
    setAttemptBoundaryId(newestEventId(events));
    setCompletedNotes(null);
    setCaptureIssue(null);
    setCaptureNeedsRelease(activeNotes.length > 0);
    setCaptureBoundaryNotice(activeNotes.length > 0 ? "Release every held or sustained note before arming the retry." : "Retry armed from a fresh event boundary.");
    recordedAttemptRef.current = null;
    setPhase("find");
  }, [activeNotes.length, events, stopAudio]);

  const resumeCapture = useCallback(() => {
    onResumeCapture();
    setAttemptBoundaryId(newestEventId(events));
    setCompletedNotes(null);
    setCaptureIssue(null);
    setCaptureNeedsRelease(activeNotes.length > 0);
    setCaptureBoundaryNotice(activeNotes.length > 0 ? "Trace resumed. Release every sounding key, then arm the attempt." : "Trace resumed with a fresh attempt boundary.");
    recordedAttemptRef.current = null;
  }, [activeNotes.length, events, onResumeCapture]);

  const resetAttemptBoundary = useCallback(() => {
    setAttemptBoundaryId(newestEventId(events));
    setCompletedNotes(null);
    setCaptureIssue(null);
    setCaptureNeedsRelease(activeNotes.length > 0);
    setCaptureBoundaryNotice(activeNotes.length > 0 ? "Release every held or sustained note before arming the new boundary." : "Fresh boundary set. Play from the first tone.");
    recordedAttemptRef.current = null;
  }, [activeNotes.length, events]);

  const armAfterRelease = useCallback(() => {
    if (activeNotes.length > 0) return;
    setAttemptBoundaryId(newestEventId(events));
    setCompletedNotes(null);
    setCaptureIssue(null);
    setCaptureNeedsRelease(false);
    setCaptureBoundaryNotice("All keys are released. Capture is armed from this fresh boundary.");
    recordedAttemptRef.current = null;
  }, [activeNotes.length, events]);

  const clearHistory = useCallback(() => {
    if (!clearHistoryArmed) {
      setClearHistoryArmed(true);
      return;
    }
    setConfusions([]);
    try {
      window.sessionStorage.removeItem(ECHO_KEY_STORAGE_KEY);
    } catch {
      // The in-memory history is still cleared.
    }
    setClearHistoryArmed(false);
  }, [clearHistoryArmed]);

  const beginVariation = useCallback(() => {
    if (selectedVariationShift == null) return;
    resetExercise(phrase, frame.doMidi + selectedVariationShift, "given-start");
  }, [frame.doMidi, phrase, resetExercise, selectedVariationShift]);

  const nextPhrase = useCallback(() => {
    const index = ECHO_KEY_PHRASES.findIndex((candidate) => candidate.id === phrase.id);
    choosePhrase(ECHO_KEY_PHRASES[(index + 1) % ECHO_KEY_PHRASES.length].id);
  }, [choosePhrase, phrase.id]);

  const diagnosis = diagnosticCopy(evaluation);
  const moveCount = evaluation.targetIntervals.length;
  const matchingContours = Math.round(evaluation.contourAccuracy * moveCount);
  const matchingIntervals = Math.round(evaluation.intervalAccuracy * moveCount);
  const alignedTargetFitsKeyboard = evaluation.alignedTarget.every((note) => Number.isInteger(note) && note >= 0 && note <= 127);
  const scoreNotes = evaluation.alignedTarget.length && alignedTargetFitsKeyboard ? evaluation.alignedTarget : targetNotes;
  const scoreDo = alignedTargetFitsKeyboard && attemptMode === "relative" ? frame.doMidi + evaluation.alignmentShift : frame.doMidi;
  const scoreSpellings = contextualPhrasePitches(scoreNotes, scoreDo);
  const framePreference = preferredAccidentalsForTonic(scoreDo);
  const frameLabel = showConventions ? conventionalPitchName(scoreDo, framePreference) : "movable Do";
  const relationalReveal = phase === "diagnose" || phase === "repair" || phase === "read" || phase === "vary";
  const frameReveal = phase === "read" || phase === "vary";
  const historyVeiled = phase === "hear" || phase === "sing" || phase === "find";

  return <section className={styles.shell} aria-labelledby="echo-key-title">
    <header className={styles.hero}>
      <div>
        <span className={styles.eyebrow}>Echo Path · ear first, notation later</span>
        <h3 id="echo-key-title">Hear it inside. Find the relationship under your hands.</h3>
        <p>Exact pitch, interval width, scale address, and notation stay hidden while you listen, sing or hum, and play. A direction-only memory trace appears after listening; the precise relationship unfolds only after your attempt.</p>
      </div>
      <aside className={styles.boundaryNote} role="note">
        <span>Evidence boundary</span>
        <strong>MIDI tells us which keys arrived—not why.</strong>
        <p>The diagnosis compares received pitch relationships. Your voice step is a self-report in this version; no microphone is opened, recorded, or scored.</p>
      </aside>
    </header>

    <ol ref={phaseRailRef} className={styles.phaseRail} aria-label="Echo Path learning loop">
      {PHASES.map((item) => <li key={item.id} className={cx(item.id === phase && styles.isCurrent, PHASES.findIndex((candidate) => candidate.id === item.id) < PHASES.findIndex((candidate) => candidate.id === phase) && styles.isPast)} aria-current={item.id === phase ? "step" : undefined}><span>{item.short}</span><strong>{item.label}</strong></li>)}
    </ol>
    <p className="sr-only" role="status" aria-live="polite" aria-atomic="true">Echo Path step {PHASES.findIndex((item) => item.id === phase) + 1} of {PHASES.length}: {PHASES.find((item) => item.id === phase)?.label}.{phase === "diagnose" ? ` Diagnosis ready: ${diagnosis.headline}` : ""}</p>

    <div className={styles.setupBar}>
      <label><span>Phrase</span><select value={phrase.id} onChange={(event) => choosePhrase(event.target.value)}>{ECHO_KEY_PHRASES.map((candidate) => <option key={candidate.id} value={candidate.id}>{candidate.title}{relationalReveal ? ` · ${candidate.subtitle}` : ""}</option>)}</select><small>{relationalReveal ? ROUTE_LABEL[phrase.route] : "Relationship family withheld until after the attempt"}</small></label>
      <div className={styles.modePicker} role="group" aria-label="Choose attempt placement mode">
        {(Object.keys(MODE_COPY) as EchoKeyAttemptMode[]).map((mode) => <button key={mode} type="button" aria-pressed={attemptMode === mode} onClick={() => chooseMode(mode)}><strong>{MODE_COPY[mode].label}</strong><span>{MODE_COPY[mode].short}</span></button>)}
      </div>
      <div className={styles.setupActions}>
        <button type="button" onClick={() => resetExercise()}>Restart on live frame</button>
        {audioState === "playing" ? <button type="button" onClick={() => stopAudio()}>Stop audio</button> : null}
      </div>
    </div>

    <div className={styles.frameLedger} role="status">
      <span>Exercise frame</span>
      <strong>{frameReveal ? `${frameLabel} · ${frame.scale.name}` : relationalReveal ? "Directed semitone path revealed · starting key still withheld" : "Starting pitch and relationship field withheld"}</strong>
      <small>{frameChangedOutside ? "The live Piano frame changed; this exercise keeps its snapshot until you restart." : "Do and route are snapshotted for this exercise."} {MODE_COPY[attemptMode].detail}</small>
    </div>

    <div className={styles.workbench}>
      {phase === "hear" ? <section ref={phasePanelRef} tabIndex={-1} className={styles.phasePanel} aria-labelledby="echo-hear-title">
        <div className={styles.phaseHeading}><span>01 · Hear</span><h4 id="echo-hear-title">Listen before the display explains.</h4><p>{phrase.listenFor}</p></div>
        <ContourOnly phrase={phrase} revealed={hasHeard} />
        <div className={styles.primaryActions}>
          <button type="button" className={styles.primaryButton} aria-pressed={audioState === "playing"} onClick={hearTarget}>{audioState === "playing" ? "Replay from the beginning" : hasHeard ? "Hear once more" : "Hear phrase"}</button>
          <button type="button" disabled={!hasHeard} onClick={() => { stopAudio("Playback stopped. Continue hearing the path internally."); setPhase("sing"); }}>Hold it inside → sing</button>
        </div>
        <p className={styles.audioNotice} role="status">{audioNotice}</p>
      </section> : null}

      {phase === "sing" ? <section ref={phasePanelRef} tabIndex={-1} className={styles.phasePanel} aria-labelledby="echo-sing-title">
        <div className={styles.phaseHeading}><span>02 · Sing or hum</span><h4 id="echo-sing-title">Carry the shape without the keyboard.</h4><p>Look away if useful. Sing on any comfortable syllable or octave; beauty, timbre, and register are not the task.</p></div>
        <ContourOnly phrase={phrase} revealed />
        <div className={styles.selfReport}>
          <div><span>Self-report only</span><strong>How did the sing or hum attempt feel?</strong><small>No microphone opens here. Choose one report; it is retained only through this attempt and is not used to explain the MIDI result.</small></div>
          <div role="group" aria-label="Report the sing or hum step">
            <button type="button" onClick={() => beginFind("sang-path")}>Completed · felt clear</button>
            <button type="button" onClick={() => beginFind("uncertain")}>Completed · felt uncertain</button>
            <button type="button" onClick={() => beginFind("skipped")}>Skipped this round</button>
          </div>
        </div>
      </section> : null}

      {phase === "find" ? <section ref={phasePanelRef} tabIndex={-1} className={styles.phasePanel} aria-labelledby="echo-find-title">
        <div className={styles.phaseHeading}><span>03 · Find and play</span><h4 id="echo-find-title">{attemptMode === "relative" ? "Begin anywhere. Preserve every move." : "Return to the exact first pitch you heard."}</h4><p>The connected instrument or DAW supplies sound. The HUD receives note events only and never plays, echoes, or routes your keypresses.</p></div>
        {frozen ? <div className={styles.captureWarning} role="alert"><div><span>Capture is frozen</span><strong>New attacks cannot enter this attempt yet.</strong><small>Held keys may still appear elsewhere in Piano, but Echo Path needs a fresh attack boundary.</small></div><button type="button" onClick={resumeCapture}>Resume and set boundary</button></div> : null}
        {captureNeedsRelease ? <div className={styles.captureWarning} role="alert"><div><span>Release before arming</span><strong>A key or sustain-held tone was already active.</strong><small>Pre-existing sound is outside the melodic attack boundary. Release every sounding key so the attempt cannot be scored over an unseen held tone.</small></div><button type="button" disabled={activeNotes.length > 0 || frozen} onClick={armAfterRelease}>{activeNotes.length > 0 ? "Waiting for all releases" : frozen ? "Resume trace first" : "Arm fresh boundary"}</button></div> : null}
        {captureIssue ? <div className={styles.captureWarning} role="alert"><div><span>Attempt not scored</span><strong>{captureIssue === "simultaneous-attacks" ? "More than one attack arrived together." : "More attacks arrived than this phrase contains."}</strong><small>{captureIssue === "simultaneous-attacks" ? "Echo Path treats attacks within 70 ms as a chord-like cluster. This exercise follows one melodic line, so release the keys and begin again." : "The extra attack may belong to a new gesture. Set a fresh boundary so it cannot be silently ignored."}</small></div><button type="button" onClick={resetAttemptBoundary}>Discard arrivals and begin again</button></div> : null}
        {captureBoundaryNotice ? <p className={styles.audioNotice} role="status">{captureBoundaryNotice}</p> : null}
        <div className={styles.captureField} aria-live="polite">
          <div className={styles.captureOrbit} role="img" aria-label={`${Math.min(liveAttemptEvents.length, phrase.offsets.length)} of ${phrase.offsets.length} attacks received. Target pitches remain hidden.${captureIssue ? " This attempt was not scored." : ""}`}>
            {phrase.offsets.map((_, index) => <i key={index} className={index < liveAttemptNotes.length ? styles.isCaptured : ""}><span className="sr-only">{index < liveAttemptNotes.length ? `Attack ${index + 1} received` : `Attack ${index + 1} waiting`}</span></i>)}
          </div>
          <strong>{Math.min(liveAttemptEvents.length, phrase.offsets.length)} / {phrase.offsets.length} attacks received</strong>
          <p>{liveAttemptNotes.length ? "Keep the remembered path moving; note identities stay hidden until the phrase is complete." : "Play the first tone when the path is ready inside you."}</p>
          <small>{activeNotes.length} key{activeNotes.length === 1 ? "" : "s"} currently held · attempt begins after event {attemptBoundaryId}</small>
        </div>
        <button type="button" className={styles.textButton} onClick={resetAttemptBoundary}>Reset attempt boundary</button>
      </section> : null}

      {phase === "diagnose" ? <section ref={phasePanelRef} tabIndex={-1} className={styles.phasePanel} aria-labelledby="echo-diagnose-title">
        <div className={styles.phaseHeading}><span>04 · Diagnose</span><h4 id="echo-diagnose-title">Now reveal the relationship.</h4><p>The first divergence is marked before later differences. Contour and exact interval width remain separate.</p></div>
        <div className={cx(styles.diagnosisCard, evaluation.kind === "secure" && styles.isSecure)}>
          <span>{diagnosis.eyebrow}</span><strong>{diagnosis.headline}</strong><p>{diagnosis.body}</p>
          <div><span><b>{matchingContours}/{moveCount}</b> directions match</span><span><b>{matchingIntervals}/{moveCount}</b> exact moves match</span><span><b>{evaluation.alignmentShift === 0 ? "0" : signedSemitoneLabel(evaluation.alignmentShift)}</b> alignment shift</span></div>
        </div>
        <RelationshipPlot evaluation={evaluation} />
        <div className={styles.intervalStrip} aria-label="Authored and played signed semitone moves">
          {evaluation.targetIntervals.map((interval, index) => {
            const performed = evaluation.performedIntervals[index];
            const diverged = performed !== interval;
            return <article key={`${interval}-${index}`} className={cx(diverged && styles.isDiverged)}><span>move {index + 1}</span><strong>{signedSemitoneLabel(interval)}</strong><small>{echoKeyIntervalName(interval)} · played {signedSemitoneLabel(performed)}</small></article>;
          })}
        </div>
        <p className={styles.singDisclosure}>{singReport ? SING_REPORT_COPY[singReport] : "No singing self-report was captured."} This statement and the MIDI comparison are displayed together but not treated as causal evidence.</p>
        <div className={styles.primaryActions}><button type="button" className={styles.primaryButton} onClick={() => setPhase("repair")}>{evaluation.kind === "secure" ? "Strengthen one link" : evaluation.kind === "anchor" ? "Repair the starting place" : "Repair first divergence"}</button>{evaluation.kind === "secure" ? <button type="button" onClick={() => setPhase("read")}>Reveal notation now</button> : null}</div>
      </section> : null}

      {phase === "repair" ? <section ref={phasePanelRef} tabIndex={-1} className={styles.phasePanel} aria-labelledby="echo-repair-title">
        <div className={styles.phaseHeading}><span>05 · Repair</span><h4 id="echo-repair-title">{evaluation.kind === "anchor" ? "Restore the supplied starting place." : "Shrink the phrase to one useful contrast."}</h4><p>{evaluation.kind === "secure" ? "No substituted interval needs correction. Rehear the intact path, then decide whether to replay or attach notation." : evaluation.kind === "anchor" ? "The intervals stayed intact. Hear the complete phrase again, keep its first pitch in memory, then place the same path from that anchor." : phrase.repairPrompt}</p></div>
        {repairPairs ? <div className={styles.repairPair}>
          <article><span>Authored link</span><strong>{signedSemitoneLabel(evaluation.divergence!.expectedInterval)}</strong><small>{echoKeyIntervalName(evaluation.divergence!.expectedInterval)} from the same comparison anchor</small></article>
          <i aria-hidden="true">↔</i>
          <article><span>Keyboard-supplied interval</span><strong>{signedSemitoneLabel(evaluation.divergence!.performedInterval)}</strong><small>{echoKeyIntervalName(evaluation.divergence!.performedInterval)} · not labeled as a perceptual or motor cause</small></article>
        </div> : <div className={styles.secureRepair}><span>{evaluation.kind === "anchor" ? "Relationship intact · placement differs" : "Relationship intact"}</span><strong>{phrase.relationship}</strong><p>{evaluation.kind === "anchor" ? `Your path began ${signedSemitoneLabel(evaluation.alignmentShift)} from the supplied anchor. Replay the reference, then try that first placement again.` : "Use replay as memory reinforcement, not as correction."}</p></div>}
        {repairPlaybackShift ? <p className={styles.singDisclosure}>Playback keeps both signed intervals intact but moves their shared anchor {signedSemitoneLabel(repairPlaybackShift)} so every endpoint fits the 0–127 MIDI range. This is the same interval contrast in another octave register, not the exact received pitches.</p> : null}
        <div className={styles.audioButtons} role="group" aria-label="Explicit repair playback">
          {repairPairs ? <><button type="button" onClick={() => playRepair("expected")}>Hear authored interval</button><button type="button" onClick={() => playRepair("performed")}>Hear played interval</button><button type="button" className={styles.primaryButton} onClick={() => playRepair("contrast")}>Hear A → B contrast</button></> : <button type="button" className={styles.primaryButton} onClick={() => playRepair("expected")}>Hear intact phrase</button>}
          {audioState === "playing" ? <button type="button" onClick={() => stopAudio()}>Stop audio</button> : null}
        </div>
        <p className={styles.audioNotice} role="status">{audioNotice}</p>
        <div className={styles.primaryActions}><button type="button" onClick={retryPhrase}>Try the whole phrase again</button><button type="button" onClick={() => setPhase("read")}>{evaluation.kind === "secure" ? "Attach notation" : "Reveal and continue (assisted)"}</button></div>
      </section> : null}

      {phase === "read" ? <section ref={phasePanelRef} tabIndex={-1} className={styles.phasePanel} aria-labelledby="echo-read-title">
        <div className={styles.phaseHeading}><span>06 · Read</span><h4 id="echo-read-title">Give familiar sound a written address.</h4><p>{phrase.relationship} The score follows the authored relationship at {attemptMode === "relative" ? "your chosen starting place" : "the supplied starting place"}.</p></div>
        {evaluation.kind !== "secure" ? <p className={styles.singDisclosure}>Assisted reveal: the relationship did not yet match independently. Notation is feedback after repair, not evidence of recall. {evaluation.divergence ? "The interval substitution remains in this tab’s local history, and Vary provides another hidden attempt." : "Vary provides another hidden attempt from a supplied starting place."}</p> : null}
        <CompactStaff spellings={scoreSpellings} beats={phrase.beats} showConventions={showConventions} />
        <ReadKeyboard notes={scoreNotes} spellings={scoreSpellings} doMidi={scoreDo} scale={frame.scale} showConventions={showConventions} />
        {!alignedTargetFitsKeyboard && attemptMode === "relative" ? <p className={styles.singDisclosure}>Your chosen start placed part of the authored comparison beyond the 128-key MIDI coordinate, so the staff uses the exercise’s original register while keeping the same directed interval path.</p> : null}
        <div className={styles.degreePath} aria-label="Scale degrees, solfege, and semitone positions for the authored path">
          {scoreNotes.map((note, index) => {
            const context = noteContext(note, scoreDo, frame.scale);
            return <article key={`${note}-${index}`}>
              <span>event {index + 1}</span>
              <strong>{context.inScale ? `degree ${context.degreeIndex + 1}` : `+${context.stepsWithinOctave} st`}</strong>
              <b>{context.syllable}</b>
              <small>{showConventions ? `${scoreSpellings[index].label} · ` : ""}{index ? signedSemitoneLabel(evaluation.targetIntervals[index - 1]) : "starting point"}</small>
            </article>;
          })}
        </div>
        <div className={styles.readBoundary}><span>What notation adds</span><p>Staff height names a written location; scale degree and solfège place it relative to Do; signed semitones preserve the exact keyboard move. None alone explains how the phrase felt or why an attempt differed.</p></div>
        <div className={styles.primaryActions}><button type="button" className={styles.primaryButton} onClick={() => setPhase("vary")}>Vary the starting place</button><button type="button" onClick={nextPhrase}>Try the next phrase</button></div>
      </section> : null}

      {phase === "vary" ? <section ref={phasePanelRef} tabIndex={-1} className={styles.phasePanel} aria-labelledby="echo-vary-title">
        <div className={styles.phaseHeading}><span>07 · Vary and recall</span><h4 id="echo-vary-title">Move the phrase. Keep its inner distances.</h4><p>A variation starts a new heard-start attempt. The signed displacement is a deliberate bridge between calculated transposition and auditory recall; the destination key is not highlighted.</p></div>
        <div className={styles.variationPicker}>
          <div><span>Choose a displacement</span><strong>{selectedVariationShift == null ? "No legal shift" : signedSemitoneLabel(selectedVariationShift)}</strong><small>You may calculate the destination from the score, then test whether you can carry the heard reference without a highlighted key. Later practice can rely on the ear alone.</small></div>
          <div role="group" aria-label="Choose variation displacement">{ECHO_KEY_VARIATION_SHIFTS.map((shift) => {
            const available = availableVariationShifts.includes(shift);
            return <button key={shift} type="button" disabled={!available} aria-pressed={selectedVariationShift === shift} aria-label={`${signedSemitoneLabel(shift)}${available ? "" : ", unavailable at this MIDI range edge"}`} onClick={() => setVariationShift(shift)}>{signedSemitoneLabel(shift)}{available ? "" : " · edge"}</button>;
          })}</div>
        </div>
        <div className={styles.variationInvariant}><span>Stays invariant</span><strong>{evaluation.targetIntervals.map((interval) => interval > 0 ? `+${interval}` : interval).join(" · ")} semitones</strong><p>Changes: every target frequency and physical key. Stays fixed: contour, directed interval sequence, rhythm template, route degrees, and phrase identity.</p></div>
        <div className={styles.primaryActions}><button type="button" className={styles.primaryButton} disabled={selectedVariationShift == null} onClick={beginVariation}>Begin varied echo</button><button type="button" onClick={nextPhrase}>Begin a different phrase</button></div>
      </section> : null}
    </div>

    <footer className={styles.historyPanel}>
      <div>
        <span>Relational substitution history · this tab only</span>
        <strong>{historyVeiled ? "History veiled during blind recall" : historyHydrated ? relationalMissCount ? `${relationalMissCount} recorded interval divergence${relationalMissCount === 1 ? "" : "s"}` : "No recorded interval divergences yet" : "Reading this tab’s history…"}</strong>
        <p>{historyVeiled ? "Earlier expected → played links return after this attempt reaches Diagnose, so they cannot disclose a target move while you listen, sing, or find." : "Stored only in this tab’s session and cleared when the tab session ends. The current Echo Path step also survives focus switches in this tab; the global Clear button resets that lesson. These are MIDI relationship substitutions, not a model of your hearing, voice, hands, ability, or identity."}</p>
      </div>
      {!historyVeiled && confusionSummaries.length ? <ol>
        {confusionSummaries.slice(0, 4).map((summary) => <li key={summary.key}><span>{summary.count}×</span><strong>{signedSemitoneLabel(summary.expectedInterval)} → {signedSemitoneLabel(summary.performedInterval)}</strong><small>{echoKeyIntervalName(summary.expectedInterval)} compared with {echoKeyIntervalName(summary.performedInterval)}</small></li>)}
      </ol> : <div className={styles.historyEmpty}>{historyVeiled ? "Exact substitutions hidden until diagnosis." : "An expected → played interval substitution will appear here after a missed diagnosis."}</div>}
      {!historyVeiled && confusions.length ? <button type="button" className={cx(styles.clearButton, clearHistoryArmed && styles.isArmed)} onClick={clearHistory}>{clearHistoryArmed ? "Confirm clear for this tab" : "Clear this tab’s history"}</button> : null}
    </footer>
  </section>;
}
