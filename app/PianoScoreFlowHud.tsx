"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type CSSProperties,
  type DragEvent,
} from "react";
import styles from "./PianoScoreFlowHud.module.css";
import {
  ORBIT_STUDY_MUSICXML,
  importMusicXmlFile,
  normalizeImportedMusicXmlScore,
  parseMusicXml,
  type ImportedMusicXmlNote,
  type ImportedMusicXmlScore,
} from "@/lib/musicxml-import";
import {
  analyzeLocalPitchCollections,
  buildScoreReferencePlan,
  buildSheetMusicReadingChunks,
  chordSpacing,
  clusterMidiPerformance,
  evaluateSheetMusicPerformance,
  fingerDistance,
  repairLoopAroundFirstDivergence,
  scoreReferenceFrameAt,
  selectSheetMusicLoop,
  summarizeSheetReadingChunkProgress,
  type PracticeHand,
  type MidiPerformanceNote,
  type MidiAttackCluster,
  type SheetPitchCollectionAnalysis,
  type SheetReadingChunk,
  type SheetReadingChunkProgress,
  type SheetEventComparison,
  type SheetMusicPracticeLoop,
  type SheetMusicNote,
  type SheetMusicPracticeAttack,
  type SheetReferencePlan,
  type SheetMusicScore,
  type RelationshipComparison,
} from "@/lib/sheet-music-coach-model";
import { configureSafetyCompressor, loudnessControlGain } from "@/lib/audio-level";
import { frequencyFromMidi } from "@/lib/piano-model";
import {
  appendBoundedSheetTakeHistory,
  sheetTakeEvidenceFromEvaluation,
  summarizeSheetChunkMemory,
  type SheetChunkMemory,
  type SheetTakeEvidence,
} from "@/lib/sheet-music-practice-memory";
import {
  buildScoreMediaReferencePlan,
  normalizeScoreMediaAnchors,
  scoreBeatToMediaSeconds,
  type ScoreMediaAnchor,
} from "@/lib/score-media-sync";
import { spotifyEmbedTarget, type SpotifyEmbedTarget } from "@/lib/spotify-embed";

const SCORE_FLOW_STORAGE_KEY = "music-with-no-names:score-flow:v1";
const SCORE_FLOW_HISTORY_STORAGE_KEY = "music-with-no-names:score-flow-history:v1";
const MAX_LIVE_FEEDBACK_ATTACKS = 160;
const MAX_UI_ALIGNMENT_CELLS = 1_250_000;
const MAX_REFERENCE_VOICES = 256;
const WHITE_PITCH_CLASSES = new Set([0, 2, 4, 5, 7, 9, 11]);
const INTERVAL_COLORS = [
  "#f4f0e7", "#ff8f86", "#f5a46f", "#edc66a", "#c9d875", "#85d6a0",
  "#69d8d0", "#65c8e5", "#7eafe9", "#9d9ce8", "#c494e2", "#dd8dca", "#f3df9b",
] as const;

type HandNoteMap = { left: number[]; right: number[] };

type ScoreHudEvent = {
  id: number;
  note: number;
  velocity: number;
  onsetMs: number;
  keyReleaseMs?: number | null;
  releaseMs: number | null;
  fieldNotes: number[];
};

type PianoScoreFlowHudProps = {
  events: ScoreHudEvent[];
  activeNotes: number[];
  /** Keys physically down now. Pedal-sustained tones remain in activeNotes only. */
  pressedNotes: number[];
  chordWindowMs: number;
  showConventions: boolean;
  frozen: boolean;
  midiConnected: boolean;
  midiStatus: string;
  onConnectMidi: () => void;
  onResumeCapture: () => void;
};

type ReadingMode = "read" | "ear" | "memory";
type TimingMode = "self-paced" | "pulse";
type CaptureState = "idle" | "armed" | "review";
type ReferenceVoice = "full" | "upper" | "bass";
type ReferenceSource = "synth" | "local" | "spotify";
type ReferenceIntent = "listen" | "practice" | "preview";
type ReferencePhase = "idle" | "count-in" | "playing" | "complete" | "unavailable";
type ReferencePlaybackView = {
  phase: ReferencePhase;
  voice: ReferenceVoice;
  playAlong: boolean;
  source: ReferenceSource;
  intent: ReferenceIntent | null;
  /** A blind/listen pass never discloses pitch unless the learner explicitly reveals review. */
  notationLocked: boolean;
  startIndex: number | null;
  currentIndex: number | null;
  cursorIndex: number | null;
  /** One cue whose exact staff position is briefly available in Memory mode. */
  memoryRevealIndex: number | null;
  /** Latest score cue with at least one synthesized tone still physically sounding. */
  soundingIndex: number | null;
  sounding: boolean;
  cueCount: number;
  progress: number;
  elapsedMs: number;
  durationMs: number;
  countdown: number | null;
  truncated: boolean;
};
type ReadingLens = "landmark" | "motion" | "vertical" | "rhythm";
type AudioContextWindow = Window & typeof globalThis & { webkitAudioContext?: typeof AudioContext };
type LocalReferenceAudio = { name: string; url: string; durationSeconds: number | null };

const EMPTY_REFERENCE_VIEW: ReferencePlaybackView = {
  phase: "idle",
  voice: "full",
  playAlong: false,
  source: "synth",
  intent: null,
  notationLocked: false,
  startIndex: null,
  currentIndex: null,
  cursorIndex: null,
  memoryRevealIndex: null,
  soundingIndex: null,
  sounding: false,
  cueCount: 0,
  progress: 0,
  elapsedMs: 0,
  durationMs: 0,
  countdown: null,
  truncated: false,
};

const DIATONIC_STEP_INDEX: Record<SheetMusicNote["pitch"]["step"], number> = {
  C: 0,
  D: 1,
  E: 2,
  F: 3,
  G: 4,
  A: 5,
  B: 6,
};

function cx(...values: Array<string | false | null | undefined>) {
  return values.filter(Boolean).join(" ");
}

function newestEventId(events: ScoreHudEvent[]) {
  return events.reduce((latest, event) => Math.max(latest, event.id), -1);
}

function signed(value: number, digits = 0) {
  const rounded = Number(value.toFixed(digits));
  return `${rounded > 0 ? "+" : ""}${rounded}`;
}

function pitchClassName(midi: number, prefer: "flats" | "sharps") {
  const flats = ["C", "D♭", "D", "E♭", "E", "F", "G♭", "G", "A♭", "A", "B♭", "B"];
  const sharps = ["C", "C♯", "D", "D♯", "E", "F", "F♯", "G", "G♯", "A", "A♯", "B"];
  const octave = Math.floor(midi / 12) - 1;
  return `${(prefer === "sharps" ? sharps : flats)[((midi % 12) + 12) % 12]}${octave}`;
}

function writtenLabel(note: SheetMusicNote, showConventions: boolean) {
  return showConventions ? note.pitch.label : `${note.hand === "left" ? "lower" : "upper"} key`;
}

function ordinal(value: number) {
  const remainder = value % 100;
  if (remainder >= 11 && remainder <= 13) return `${value}th`;
  if (value % 10 === 1) return `${value}st`;
  if (value % 10 === 2) return `${value}nd`;
  if (value % 10 === 3) return `${value}rd`;
  return `${value}th`;
}

function staffPositionLabel(note: SheetMusicNote, source: ImportedMusicXmlNote | undefined) {
  const diatonic = note.pitch.octave * 7 + DIATONIC_STEP_INDEX[note.pitch.step];
  const bottomLine = note.hand === "left" ? 18 : 30;
  const delta = diatonic - bottomLine;
  const staff = note.hand === "left" ? "lower staff" : "upper staff";
  const position = delta < 0
    ? `${staff}, ${Math.abs(delta)} staff step${delta === -1 ? "" : "s"} below the bottom line`
    : delta > 8
      ? `${staff}, ${delta - 8} staff step${delta === 9 ? "" : "s"} above the top line`
      : delta % 2 === 0
    ? `${staff}, ${ordinal(delta / 2 + 1)} line`
    : `${staff}, ${ordinal((delta + 1) / 2)} space`;
  if (source?.accidental?.trim().toLowerCase() === "natural") return `${position}, natural`;
  if (note.pitch.alter > 0) return `${position}, raised ${note.pitch.alter} semitone${note.pitch.alter === 1 ? "" : "s"}`;
  if (note.pitch.alter < 0) return `${position}, lowered ${Math.abs(note.pitch.alter)} semitone${note.pitch.alter === -1 ? "" : "s"}`;
  return position;
}

function scoreStaffY(note: SheetMusicNote) {
  const diatonic = note.pitch.octave * 7 + DIATONIC_STEP_INDEX[note.pitch.step];
  // Upper E4 and lower G2 are the bottom lines of the two compact staves.
  const bottomLine = note.hand === "left" ? 18 : 30;
  const bottomY = note.hand === "left" ? 164 : 78;
  let y = bottomY - (diatonic - bottomLine) * 5;
  while (y < 13) y += 35;
  while (y > 187) y -= 35;
  return y;
}

function scoreStaffOctaveMark(note: SheetMusicNote) {
  const diatonic = note.pitch.octave * 7 + DIATONIC_STEP_INDEX[note.pitch.step];
  const bottomLine = note.hand === "left" ? 18 : 30;
  const bottomY = note.hand === "left" ? 164 : 78;
  const rawY = bottomY - (diatonic - bottomLine) * 5;
  const octaves = rawY < 13 ? Math.ceil((13 - rawY) / 35) : rawY > 187 ? -Math.ceil((rawY - 187) / 35) : 0;
  if (!octaves) return null;
  if (octaves === 1) return "8va";
  if (octaves === -1) return "8vb";
  if (octaves === 2) return "15ma";
  if (octaves === -2) return "15mb";
  return octaves > 0 ? `${octaves} oct. above` : `${Math.abs(octaves)} oct. below`;
}

function explicitAccidentalGlyph(accidental: string | null | undefined) {
  const normalized = accidental?.trim().toLowerCase();
  if (!normalized) return null;
  if (normalized === "flat-flat" || normalized === "double-flat") return "𝄫";
  if (normalized === "flat") return "♭";
  if (normalized === "natural") return "♮";
  if (normalized === "sharp") return "♯";
  if (normalized === "double-sharp" || normalized === "sharp-sharp") return "𝄪";
  if (normalized === "natural-flat") return "♮♭";
  if (normalized === "natural-sharp") return "♮♯";
  return null;
}

function pitchLocatorAccidentalGlyph(note: SheetMusicNote, source: ImportedMusicXmlNote | undefined) {
  const explicit = explicitAccidentalGlyph(source?.accidental);
  if (explicit) return explicit;
  if (note.pitch.alter <= -2) return "𝄫";
  if (note.pitch.alter === -1) return "♭";
  if (note.pitch.alter === 1) return "♯";
  if (note.pitch.alter >= 2) return "𝄪";
  return null;
}

function spreadStaffAttackPositions(rawPositions: number[], minimumGap = 13) {
  if (rawPositions.length < 2) return rawPositions;
  const positions = rawPositions.slice();
  for (let index = 1; index < positions.length; index += 1) {
    positions[index] = Math.max(positions[index], positions[index - 1] + minimumGap);
  }
  if (positions.at(-1)! <= 94) return positions;
  positions[positions.length - 1] = 94;
  for (let index = positions.length - 2; index >= 0; index -= 1) {
    positions[index] = Math.min(positions[index], positions[index + 1] - minimumGap);
  }
  return positions;
}

function referenceNotesForAttack(attack: SheetMusicPracticeAttack, voice: ReferenceVoice) {
  if (voice === "upper") return [...attack.notes].sort((first, second) => second.pitch.midi - first.pitch.midi).slice(0, 1);
  if (voice === "bass") return [...attack.notes].sort((first, second) => first.pitch.midi - second.pitch.midi).slice(0, 1);
  return attack.notes.slice(0, 12);
}

function audioTimeToPerformanceMs(context: AudioContext, contextTime: number) {
  try {
    const timestamp = context.getOutputTimestamp();
    const timestampContextTime = timestamp.contextTime;
    const timestampPerformanceTime = timestamp.performanceTime;
    const projectedNow = typeof timestampContextTime === "number" && typeof timestampPerformanceTime === "number"
      ? timestampPerformanceTime + (context.currentTime - timestampContextTime) * 1_000
      : Number.NaN;
    if (typeof timestampContextTime === "number" && typeof timestampPerformanceTime === "number"
      && Number.isFinite(timestampContextTime) && Number.isFinite(timestampPerformanceTime)
      && timestampPerformanceTime > 0 && Math.abs(timestampContextTime - context.currentTime) < 2
      && Math.abs(projectedNow - performance.now()) < 250) {
      return timestampPerformanceTime + (contextTime - timestampContextTime) * 1_000;
    }
  } catch {
    // Safari versions without a stable output timestamp use the latency-aware fallback.
  }
  const outputLatency = Number.isFinite(context.outputLatency) ? context.outputLatency : context.baseLatency;
  return performance.now() + Math.max(0, contextTime - context.currentTime) * 1_000 + Math.max(0, outputLatency) * 1_000;
}

function capturedScoreEvents(
  events: ScoreHudEvent[],
  afterId: number,
  earliestOnsetMs = Number.NEGATIVE_INFINITY,
  latestOnsetMs = Number.POSITIVE_INFINITY,
): MidiPerformanceNote[] {
  return events
    .filter((event) => event.id > afterId && event.onsetMs >= earliestOnsetMs && event.onsetMs <= latestOnsetMs)
    .sort((first, second) => first.onsetMs - second.onsetMs || first.id - second.id)
    .map((event) => ({
      id: event.id,
      midi: event.note,
      onsetMs: event.onsetMs,
      velocity: event.velocity,
      releaseMs: event.keyReleaseMs ?? event.releaseMs ?? undefined,
    }));
}

function referenceLevelGain(percent: number) {
  return percent <= 0 ? 0.0001 : loudnessControlGain(percent);
}

function mediaLevel(percent: number) {
  return Math.max(0, Math.min(1, percent / 100));
}

function clockLabel(milliseconds: number) {
  const totalSeconds = Math.max(0, Math.floor(milliseconds / 1_000));
  const minutes = Math.floor(totalSeconds / 60);
  return `${minutes}:${String(totalSeconds % 60).padStart(2, "0")}`;
}

function playAlongCountIn(loop: SheetMusicPracticeLoop, score: SheetMusicScore) {
  const firstMeasure = score.measures[loop.attacks[0]?.measureIndex ?? 0];
  const measureBeats = Math.max(1, firstMeasure?.durationBeats ?? 4);
  const signatureBeats = Math.max(1, firstMeasure?.beats ?? 4);
  const signatureBeatType = Math.max(1, firstMeasure?.beatType ?? 4);
  const compoundPulses = signatureBeatType === 8 && signatureBeats >= 6 && signatureBeats % 3 === 0
    ? signatureBeats / 3
    : signatureBeats;
  const pulseCount = Math.max(2, Math.min(4, Math.round(compoundPulses)));
  return {
    measureBeats,
    pulseOffsetsBeats: Array.from({ length: pulseCount }, (_, index) => index * measureBeats / pulseCount),
  };
}

function closestSinglePitchCorrection(comparison: SheetEventComparison | null) {
  if (!comparison || comparison.expectedNotes.length !== 1 || comparison.actualNotes.length !== 1) return null;
  return comparison.expectedNotes[0] - comparison.actualNotes[0];
}

function keySignatureLabel(score: Pick<ImportedMusicXmlScore, "keyFifths" | "keyMode">) {
  const fifths = score.keyFifths;
  if (fifths == null) return "key signature not encoded";
  if (fifths === 0) return score.keyMode ? `no sharps or flats · ${score.keyMode}` : "no sharps or flats · mode not encoded";
  const count = Math.abs(fifths);
  const accidental = fifths > 0 ? "sharp" : "flat";
  return `${count} ${accidental}${count === 1 ? "" : "s"} · ${score.keyMode ?? "mode not encoded"}`;
}

function meterSummary(score: ImportedMusicXmlScore) {
  const changes = score.measures.filter((measure, index) => index === 0 || measure.timeSignatureDisplay !== score.measures[index - 1].timeSignatureDisplay);
  return changes.map((measure) => `${measure.timeSignatureDisplay}${measure.index ? ` at m.${measure.number}` : ""}`).join(" → ");
}

function metricLabel(accuracy: number | null, compared: number) {
  return accuracy == null ? "not observed" : `${Math.round(accuracy * 100)}% · ${compared} compared`;
}

function intervalColor(semitones: number) {
  const absolute = Math.abs(semitones);
  const intervalClass = absolute === 0 ? 0 : absolute % 12 === 0 ? 12 : absolute % 12;
  return INTERVAL_COLORS[intervalClass];
}

function chordHypothesis(midis: number[], prefer: "flats" | "sharps", authoredNotes: SheetMusicNote[] = []) {
  const pitchClasses = [...new Set(midis.map((midi) => ((midi % 12) + 12) % 12))];
  if (pitchClasses.length !== 3) return null;
  const qualities = [
    { name: "major", intervals: [0, 4, 7] },
    { name: "minor", intervals: [0, 3, 7] },
    { name: "diminished", intervals: [0, 3, 6] },
    { name: "augmented", intervals: [0, 4, 8] },
  ];
  for (const root of pitchClasses) {
    const relative = pitchClasses.map((pitchClass) => (pitchClass - root + 12) % 12).sort((a, b) => a - b);
    const quality = qualities.find((candidate) => candidate.intervals.every((interval, index) => interval === relative[index]));
    if (!quality) continue;
    const bassInterval = (Math.min(...midis) - root + 120) % 12;
    const inversion = bassInterval === 0 ? "root position" : bassInterval === quality.intervals[1] ? "first inversion" : bassInterval === quality.intervals[2] ? "second inversion" : "open voicing";
    const authoredRoot = authoredNotes.find((note) => ((note.pitch.midi % 12) + 12) % 12 === root)?.pitch.label.replace(/-?\d+$/, "");
    return `${authoredRoot ?? pitchClassName(root + 60, prefer).replace(/\d+$/, "")} ${quality.name} · ${inversion}`;
  }
  return null;
}

function notesByHand(comparison: SheetEventComparison | null, fallback: SheetMusicPracticeAttack | null): HandNoteMap {
  const result: HandNoteMap = { left: [], right: [] };
  if (comparison?.actualNotes.length && comparison.expected.notes.length) {
    const actual = [...comparison.actualNotes].sort((a, b) => a - b);
    const expected = [...comparison.expected.notes].sort((a, b) => a.pitch.midi - b.pitch.midi);
    if (actual.length === expected.length) {
      actual.forEach((midi, index) => {
        const hand = expected[index]?.hand === "left" ? "left" : "right";
        result[hand].push(midi);
      });
      return result;
    }
    actual.forEach((midi) => {
      const nearest = expected.reduce((best, note) => Math.abs(note.pitch.midi - midi) < Math.abs(best.pitch.midi - midi) ? note : best, expected[0]);
      result[nearest.hand === "left" ? "left" : "right"].push(midi);
    });
    return result;
  }
  fallback?.notes.forEach((note) => result[note.hand === "left" ? "left" : "right"].push(note.pitch.midi));
  return result;
}

function handFingering(notes: SheetMusicNote[], hand: "left" | "right") {
  const sorted = [...notes].sort((first, second) => first.pitch.midi - second.pitch.midi);
  if (sorted.length === 1) return new Map<string, number | null>([[sorted[0].id, sorted[0].fingering]]);
  const patterns: Record<number, number[]> = {
    2: [1, 5],
    3: [1, 3, 5],
    4: [1, 2, 3, 5],
    5: [1, 2, 3, 4, 5],
  };
  const base = patterns[Math.min(5, sorted.length)] ?? Array.from({ length: sorted.length }, (_, index) => Math.min(5, index + 1));
  const fingers = hand === "right" ? base : [...base].reverse();
  return new Map<string, number | null>(sorted.map((note, index) => [note.id, note.fingering ?? fingers[index] ?? null]));
}

function KeyboardTerritory({ next, previousNotes, activeNotes, showConventions, prefer, allowSplit = true }: {
  next: SheetMusicPracticeAttack | null;
  previousNotes: number[];
  activeNotes: number[];
  showConventions: boolean;
  prefer: "flats" | "sharps";
  allowSplit?: boolean;
}) {
  const targets = next?.midiNotes ?? [];
  const source = [...targets, ...previousNotes, ...activeNotes];
  const span = source.length ? Math.max(...source) - Math.min(...source) : 0;
  const leftTargets = next?.notes.filter((note) => note.hand === "left") ?? [];
  const rightTargets = next?.notes.filter((note) => note.hand === "right") ?? [];
  if (allowSplit && span > 30 && leftTargets.length && rightTargets.length && next) {
    const leftCenter = leftTargets.reduce((sum, note) => sum + note.pitch.midi, 0) / leftTargets.length;
    const rightCenter = rightTargets.reduce((sum, note) => sum + note.pitch.midi, 0) / rightTargets.length;
    const midpoint = (leftCenter + rightCenter) / 2;
    const handAttack = (notes: SheetMusicNote[]): SheetMusicPracticeAttack => ({ ...next, notes, midiNotes: notes.map((note) => note.pitch.midi).sort((a, b) => a - b), hands: [...new Set(notes.map((note) => note.hand))] });
    return <div className={styles.territorySplit}>
      <section><span>Upper-staff territory</span><KeyboardTerritory next={handAttack(rightTargets)} previousNotes={previousNotes.filter((note) => note >= midpoint)} activeNotes={activeNotes.filter((note) => note >= midpoint)} showConventions={showConventions} prefer={prefer} allowSplit={false} /></section>
      <section><span>Lower-staff territory</span><KeyboardTerritory next={handAttack(leftTargets)} previousNotes={previousNotes.filter((note) => note < midpoint)} activeNotes={activeNotes.filter((note) => note < midpoint)} showConventions={showConventions} prefer={prefer} allowSplit={false} /></section>
      <small>An octave break separates the two staff territories so the drawn key widths remain physical rather than compressing the entire piano.</small>
    </div>;
  }
  const center = source.length ? Math.round(source.reduce((sum, note) => sum + note, 0) / source.length) : 60;
  let low = Math.max(21, Math.min(...(source.length ? source : [center])) - 4);
  let high = Math.min(108, Math.max(...(source.length ? source : [center])) + 4);
  while (high - low < 18) { if (low > 21) low -= 1; if (high < 108 && high - low < 18) high += 1; if (low === 21 && high === 108) break; }
  const visible = Array.from({ length: high - low + 1 }, (_, index) => low + index);
  const whites = visible.filter((note) => WHITE_PITCH_CLASSES.has(note % 12));
  const fingerMaps = next ? {
    left: handFingering(next.notes.filter((note) => note.hand === "left"), "left"),
    right: handFingering(next.notes.filter((note) => note.hand === "right"), "right"),
  } : null;
  const label = targets.length
    ? `Next keyboard territory: ${targets.map((note) => pitchClassName(note, prefer)).join(" plus ")}. Suggested finger numbers are starting points unless the MusicXML supplied them.`
    : "Keyboard territory waiting for a score landing.";
  return <div className={styles.keyboardTerritory} role="group" aria-label={label}>
    <div className={styles.whiteKeys} style={{ "--black-width": `${(0.62 / Math.max(1, whites.length)) * 100}%` } as CSSProperties}>
      {whites.map((note) => {
        const targetNote = next?.notes.find((item) => item.pitch.midi === note);
        const finger = targetNote ? targetNote.fingering ?? fingerMaps?.[targetNote.hand === "left" ? "left" : "right"].get(targetNote.id) : null;
        return <i key={note} className={cx(styles.whiteKey, targets.includes(note) && styles.isTarget, activeNotes.includes(note) && styles.isActive, previousNotes.includes(note) && styles.isPrevious)}>
          {showConventions && (targets.includes(note) || activeNotes.includes(note)) ? <small>{pitchClassName(note, prefer)}</small> : null}
          {targetNote ? <b className={targetNote.fingering ? styles.authoredFinger : finger ? styles.suggestedFinger : styles.unknownFinger}>{targetNote.fingering ? `score ${finger}` : finger ? `~${finger}` : "?"}</b> : null}
        </i>;
      })}
      {visible.filter((note) => !WHITE_PITCH_CLASSES.has(note % 12)).map((note) => {
        const whitesBefore = whites.filter((white) => white < note).length;
        const targetNote = next?.notes.find((item) => item.pitch.midi === note);
        const finger = targetNote ? targetNote.fingering ?? fingerMaps?.[targetNote.hand === "left" ? "left" : "right"].get(targetNote.id) : null;
        return <i key={note} className={cx(styles.blackKey, targets.includes(note) && styles.isTarget, activeNotes.includes(note) && styles.isActive, previousNotes.includes(note) && styles.isPrevious)} style={{ "--black-left": `${(whitesBefore / Math.max(1, whites.length)) * 100}%` } as CSSProperties}>{targetNote ? <b className={targetNote.fingering ? styles.authoredFinger : finger ? styles.suggestedFinger : styles.unknownFinger}>{targetNote.fingering ? `score ${finger}` : finger ? `~${finger}` : "?"}</b> : null}</i>;
      })}
    </div>
    <div className={styles.keyboardLegend}><span><i className={styles.targetSwatch} />next</span><span><i className={styles.activeSwatch} />held</span><span><i className={styles.previousSwatch} />last landing</span><em><b>score 3</b> = authored · <b>~3</b> = shape suggestion · ? = passage context needed</em></div>
  </div>;
}

function DistanceField({ next, previousByHand, showConventions, prefer }: {
  next: SheetMusicPracticeAttack | null;
  previousByHand: HandNoteMap;
  showConventions: boolean;
  prefer: "flats" | "sharps";
}) {
  if (!next) return <div className={styles.emptyField}><strong>Loop complete.</strong><span>Review the evidence, then shrink or move the loop.</span></div>;
  const byHand = (["right", "left"] as const).map((hand) => {
    const notes = next.notes.filter((note) => note.hand === hand);
    if (!notes.length) return null;
    const fingers = handFingering(notes, hand);
    return { hand, notes: [...notes].sort((a, b) => a.pitch.midi - b.pitch.midi), fingers };
  }).filter((item): item is NonNullable<typeof item> => item != null);
  return <div className={styles.distanceField}>
    {byHand.map(({ hand, notes, fingers }) => <section key={hand}>
      <header><span>{hand === "right" ? "upper staff" : "lower staff"}</span><strong>{notes.length > 1 ? "prepare one shape" : "prepare one landing"}</strong></header>
      <div className={styles.distanceRoutes}>
        {notes.map((note, index) => {
          const sources = [...previousByHand[hand]].sort((a, b) => a - b);
          const sourceIndex = notes.length <= 1 ? Math.floor((sources.length - 1) / 2) : Math.round(index * Math.max(0, sources.length - 1) / Math.max(1, notes.length - 1));
          const nearest = sources[sourceIndex] ?? null;
          const distance = nearest == null ? null : fingerDistance(nearest, note.pitch.midi);
          const finger = note.fingering ?? fingers.get(note.id) ?? null;
          return <article key={note.id}>
            <b className={note.fingering ? styles.authoredFinger : finger ? styles.suggestedFinger : styles.unknownFinger}>{note.fingering ? `score ${finger}` : finger ? `~${finger}` : "?"}</b>
            <div><strong>{writtenLabel(note, showConventions)}</strong><span>{distance ? `${distance.direction === "same" ? "stay" : distance.direction} ${distance.absoluteSemitones} semitone${distance.absoluteSemitones === 1 ? "" : "s"}` : "place from the written staff"}</span><small>{distance ? `about ${Math.round(distance.whiteKeyWidths * 10) / 10} white-key widths · ${distance.reach.replace("-", " ")}` : showConventions ? pitchClassName(note.pitch.midi, prefer) : "first landing establishes the hand"}</small></div>
          </article>;
        })}
      </div>
      <footer>{notes.every((note) => note.fingering != null) ? "Finger numbers are authored in this file. Travel is a same-staff route estimate from the prior landing." : notes.length === 1 ? "No finger is inferred from an isolated landing. Travel is a same-staff route estimate; MIDI cannot identify which finger moved." : "Chord-shape starting suggestion—not authored. Routes stay within the same staff and preserve low-to-high order; hand size and the next phrase may favor another choice."}</footer>
    </section>)}
  </div>;
}

function RelationshipEvidence({ label, comparison }: { label: string; comparison: RelationshipComparison | null }) {
  if (!comparison) return <article><span>{label}</span><strong>Play two landings</strong><small>A directed interval appears after a comparable pair.</small></article>;
  return <article className={styles.relationshipCard}>
    <span>{label}</span>
    <strong><i style={{ "--interval-color": intervalColor(comparison.expectedSemitones) } as CSSProperties} />expected {signed(comparison.expectedSemitones)} st <b>→</b> <i style={{ "--interval-color": intervalColor(comparison.playedSemitones) } as CSSProperties} />played {signed(comparison.playedSemitones)} st</strong>
    <small>{comparison.intervalMatch ? "Same directed width—link the color, reach, and sound." : comparison.contourMatch ? "Direction agrees; feel the difference in exact reach." : "Direction changed. Rehearse only these two landings."}</small>
  </article>;
}

type EvidenceItem = {
  label: string;
  value: string;
  detail: string;
};

function EvidenceGroup({ eyebrow, title, items }: { eyebrow: string; title: string; items: EvidenceItem[] }) {
  return <article className={styles.evidenceGroup}>
    <header><span>{eyebrow}</span><strong>{title}</strong></header>
    <div>{items.map((item) => <section key={item.label}>
      <div><span>{item.label}</span><strong>{item.value}</strong></div>
      <small>{item.detail}</small>
    </section>)}</div>
  </article>;
}

function attackStatusLabel(comparison: SheetEventComparison | null, current: boolean) {
  if (comparison?.status === "correct") return "✓ right landing";
  if (comparison?.status === "missed") return "− missed landing";
  if (comparison?.status === "incorrect") {
    if (!comparison.pitchMatch) {
      if (comparison.missingNotes.length && !comparison.extraNotes.length) return `− ${comparison.missingNotes.length} missing`;
      if (comparison.extraNotes.length && !comparison.missingNotes.length) return `+ ${comparison.extraNotes.length} extra`;
      return "× wrong key set";
    }
    if (comparison.arpeggiationMatch === false) return "↕ change roll direction";
    if (comparison.timingMatch === false) return comparison.timingErrorMs != null && comparison.timingErrorMs < 0 ? "← early attack" : "→ late attack";
    if (comparison.durationMatch === false) return comparison.durationErrorMs != null && comparison.durationErrorMs < 0 ? "↓ released early" : "↑ released late";
    return "× needs repair";
  }
  return current ? "next landing" : "waiting";
}

function patternLabel(values: number[]) {
  if (!values.length) return "one landing";
  return values.map((value) => `${value > 0 ? "↑" : value < 0 ? "↓" : "→"} ${Math.abs(value)} st`).join(" · ");
}

function rhythmLabel(values: number[]) {
  if (!values.length) return "one attack boundary";
  return values.map((value) => `${Math.round(value * 100) / 100}`).join(" · ") + " beats";
}

function defaultReadingLens(chunk: SheetReadingChunk | null): ReadingLens {
  if (!chunk) return "landmark";
  if (chunk.strategy === "chord-shapes" || chunk.strategy === "chord-anchor" || chunk.strategy === "hand-coordination") return "vertical";
  if (chunk.strategy === "scale-fragment" || chunk.strategy === "interval-chain" || chunk.strategy === "repeated-shape" || chunk.strategy === "landmark-contour") return "motion";
  return "landmark";
}

function evidenceReadingLens(comparison: SheetEventComparison | null, timingMode: TimingMode, fallback: ReadingLens): ReadingLens {
  if (!comparison || comparison.status === "pending" || comparison.status === "correct") return fallback;
  if (!comparison.pitchMatch) return comparison.expectedNotes.length > 1 || comparison.actualNotes.length > 1 ? "vertical" : "landmark";
  if (comparison.arpeggiationMatch === false || comparison.spacingMatch === false) return "vertical";
  if (timingMode === "pulse" && (comparison.timingMatch === false || comparison.durationMatch === false)) return "rhythm";
  return "motion";
}

function LiveAttackEcho({
  liveAttack,
  comparison,
  veiled,
  showConventions,
  prefer,
  arrivalWindowOpen,
  captureState,
}: {
  liveAttack: MidiAttackCluster | null;
  comparison: SheetEventComparison | null;
  veiled: boolean;
  showConventions: boolean;
  prefer: "flats" | "sharps";
  arrivalWindowOpen: boolean;
  captureState: CaptureState;
}) {
  if (!liveAttack) return <div className={cx(styles.liveAttackEcho, styles.isWaiting)} data-state="waiting" role="status" aria-live="polite">
    <div className={styles.attackEchoPulse} aria-hidden="true"><i /></div>
    <div><span>Input echo</span><strong>Play any key</strong><small>The first incoming attack will bloom here immediately.</small></div>
  </div>;

  const gatheringChord = arrivalWindowOpen && (comparison?.expected.midiNotes.length ?? 1) > 1;
  const feedbackState = arrivalWindowOpen
    ? gatheringChord ? "gathering" : "received"
    : comparison?.status === "correct"
      ? "aligned"
      : comparison?.status === "incorrect" || comparison?.status === "missed"
        ? "repair"
        : "received";
  const feedbackLabel = veiled
    ? "MIDI received"
    : feedbackState === "gathering"
    ? "Gathering"
    : feedbackState === "aligned"
      ? "✓ Aligned"
      : feedbackState === "repair"
        ? "× Repair"
        : "Received";
  const noteCount = liveAttack.notes.length;
  const details = veiled
    ? "Anonymous input received · pitch and chord size are hidden"
    : showConventions
      ? liveAttack.notes.slice(0, 8).map((midi) => pitchClassName(midi, prefer)).join(" + ")
      : `${noteCount} played tone${noteCount === 1 ? "" : "s"}`;
  const explanation = veiled
    ? "Receipt is visible; pitch, position, and right/repair outcome stay veiled until review."
    : feedbackState === "gathering"
      ? "The first attack keeps this togetherness window open; add the rest of the chord now."
      : feedbackState === "aligned"
        ? "This completed landing matched. The gold destination may already have moved to what comes next."
        : feedbackState === "repair"
          ? `${attackStatusLabel(comparison, false)} in landing ${(comparison?.expectedIndex ?? 0) + 1} · the destination above has moved to what comes next.`
          : captureState === "review"
            ? "MIDI was received, but the formal review remains frozen until you start another take."
            : "MIDI was received and the live-follow comparison is provisional.";
  return <div className={styles.liveAttackEcho} data-state={veiled ? "veiled" : feedbackState} role="status" aria-live="polite" aria-atomic="true">
    <div className={styles.attackEchoPulse} aria-hidden="true">
      <i />
      {Array.from({ length: veiled ? 1 : Math.min(8, noteCount) }, (_, index) => <b key={index} style={{ "--echo-angle": `${index * (360 / Math.max(1, Math.min(8, noteCount)))}deg` } as CSSProperties} />)}
    </div>
    <div><span>Played now · {feedbackLabel}</span><strong>{details}{!veiled && liveAttack.notes.length > 8 ? ` + ${liveAttack.notes.length - 8} more` : ""}</strong><small>{explanation}</small></div>
  </div>;
}

function FocusLanding({
  attack,
  comparison,
  currentIndex,
  totalAttacks,
  activeNotes,
  veiled,
  showConventions,
  prefer,
  arrivalWindowMs,
  arrivalWindowOpen,
  captureState,
  liveAttack,
  liveComparison,
}: {
  attack: SheetMusicPracticeAttack | null;
  comparison: SheetEventComparison | null;
  currentIndex: number;
  totalAttacks: number;
  activeNotes: number[];
  veiled: boolean;
  showConventions: boolean;
  prefer: "flats" | "sharps";
  arrivalWindowMs: number;
  arrivalWindowOpen: boolean;
  captureState: CaptureState;
  liveAttack: MidiAttackCluster | null;
  liveComparison: SheetEventComparison | null;
}) {
  if (!attack && totalAttacks === 0) return <section className={styles.focusLanding} aria-labelledby="focus-landing-title">
    <header><span>Now · landing</span><strong id="focus-landing-title">No playable landing in this selection</strong></header>
    <div className={styles.landingComplete}><i>○</i><strong>Choose a measure and staff containing note attacks.</strong><small>Rests remain part of the written context, but this release evaluates played landings rather than silence.</small></div>
  </section>;
  if (!attack) return <section className={styles.focusLanding} aria-labelledby="focus-landing-title">
    <header><span>Now · landing</span><strong id="focus-landing-title">Loop complete</strong></header>
    <div className={styles.landingComplete}><i>✓</i><strong>{captureState === "review" ? "Every written landing has a frozen comparison." : "Every written landing has arrived."}</strong><small>{captureState === "armed" ? "Release any held keys so note lengths can enter the frozen review." : "Live follow will return to the first landing after this result has had a moment to remain visible."}</small></div>
    <LiveAttackEcho key={String(liveAttack?.events.at(-1)?.id ?? "complete")} liveAttack={liveAttack} comparison={liveComparison} veiled={veiled} showConventions={showConventions} prefer={prefer} arrivalWindowOpen={arrivalWindowOpen} captureState={captureState} />
  </section>;
  const ordered = [...attack.notes].sort((first, second) => first.pitch.midi - second.pitch.midi);
  const bass = ordered[0]?.pitch.midi ?? 60;
  const spacing = chordSpacing(attack.midiNotes);
  const hypothesis = chordHypothesis(attack.midiNotes, prefer, attack.notes);
  const activeTargetCount = [...new Set(activeNotes.filter((note) => attack.midiNotes.includes(note)))].length;
  const capturedTargetCount = [...new Set((comparison?.actualNotes ?? []).filter((note) => attack.midiNotes.includes(note)))].length;
  const capturedExtraCount = [...new Set(comparison?.extraNotes ?? [])].length;
  const gatheredTargetCount = Math.min(attack.midiNotes.length, Math.max(activeTargetCount, capturedTargetCount));
  const gathering = captureState !== "review" && arrivalWindowOpen && attack.midiNotes.length > 1 && capturedExtraCount === 0
    && ((gatheredTargetCount > 0 && gatheredTargetCount < attack.midiNotes.length) || Boolean(comparison?.missingNotes.length && !comparison.extraNotes.length));
  const revealOutcome = !veiled && !gathering;
  const status = veiled ? "written field locked · feedback categorical" : gathering ? `gathering ${gatheredTargetCount} of ${attack.midiNotes.length} · ${arrivalWindowMs} ms lens` : attackStatusLabel(comparison, true);
  return <section className={cx(styles.focusLanding, revealOutcome && comparison?.status === "correct" && styles.isFocusCorrect, revealOutcome && (comparison?.status === "incorrect" || comparison?.status === "missed") && styles.isFocusWrong)} aria-labelledby="focus-landing-title" aria-busy={arrivalWindowOpen}>
    <header><span>{revealOutcome && comparison && comparison.status !== "pending" ? "Review · landing" : "Now · landing"}</span><strong id="focus-landing-title">Landing {Math.min(currentIndex + 1, totalAttacks)} of {totalAttacks} · m.{attack.measureNumber}</strong><em>{status}</em></header>
    <div className={cx(styles.landingField, veiled && styles.isVeiled)} data-input={liveAttack ? "received" : "waiting"}>
      <div className={styles.landingOrbits} aria-hidden="true"><i /><i /><i /></div>
      <div className={styles.noteConstellation} role="list" aria-label={veiled ? "Written landing locked: pitch, staff position, and chord size are hidden" : `Written landing: ${ordered.map((note) => note.pitch.label).join(" plus ")}`}>
        {veiled ? <article role="listitem" className={styles.landingNote} style={{ "--node-color": "#77d1df", "--node-rise": "0px" } as CSSProperties}><i aria-hidden="true" /><strong>?</strong><span>field locked</span></article> : ordered.map((note, index) => {
          const relative = note.pitch.midi - bass;
          const held = activeNotes.includes(note.pitch.midi);
          const matched = comparison?.actualNotes.includes(note.pitch.midi) && !comparison.missingNotes.includes(note.pitch.midi);
          const comparisonIsJudged = comparison?.status === "incorrect" || comparison?.status === "missed";
          const missing = (comparisonIsJudged && comparison.missingNotes.includes(note.pitch.midi)) || (gathering && !held && !matched);
          return <article key={note.id} role="listitem" className={cx(styles.landingNote, held && styles.isHeld, matched && styles.isMatched, missing && styles.isMissing)} style={{ "--node-color": intervalColor(relative), "--node-rise": `${Math.min(42, relative * 3)}px` } as CSSProperties}>
            <i aria-hidden="true" />
            <strong>{showConventions ? note.pitch.label : `tone ${index + 1}`}</strong>
            <span>{`${note.staff > 1 ? "lower staff" : "upper staff"}${note.fingering ? ` · finger ${note.fingering}` : ""}`}</span>
            {held ? <em>held</em> : null}
          </article>;
        })}
        {!veiled && comparison?.extraNotes.map((midi) => <article key={`extra-${midi}`} role="listitem" className={cx(styles.landingNote, styles.isExtra)} style={{ "--node-color": "#f18d7e", "--node-rise": "0px" } as CSSProperties}><i aria-hidden="true" /><strong>+ {pitchClassName(midi, prefer)}</strong><span>extra note</span></article>)}
      </div>
      <LiveAttackEcho key={String(liveAttack?.events.at(-1)?.id ?? "waiting")} liveAttack={liveAttack} comparison={liveComparison} veiled={veiled} showConventions={showConventions} prefer={prefer} arrivalWindowOpen={arrivalWindowOpen} captureState={captureState} />
    </div>
    <div className={styles.landingFacts}>
      <div><span>Written field</span><strong>{veiled ? "Pitch and chord size locked" : ordered.map((note) => showConventions ? note.pitch.label : note.staff > 1 ? "lower" : "upper").join(" + ")}</strong><small>{veiled ? "The pulse slot is visible; its contents are not." : "One landing = one or more notes that begin together."}</small></div>
      <div><span>{veiled ? "Interval shape" : attack.midiNotes.length >= 3 ? "Chord shape" : attack.midiNotes.length === 2 ? "Vertical shape" : "Attack shape"}</span><strong>{veiled ? "Spacing locked" : spacing.adjacentSemitones.length ? `${spacing.adjacentSemitones.map((gap) => `${gap} st`).join(" · ")} · ${spacing.spanSemitones} st span` : "single tone"}</strong><small>{veiled ? "Reveal after the pass to connect the heard field with its semitone structure." : hypothesis ? `${hypothesis} · inferred from pitch classes` : attack.midiNotes.length > 1 ? "Read the outside reach, then the inside gaps." : "Relate it to the previous and next landing."}</small></div>
    </div>
    {!veiled && !gathering && comparison?.status === "incorrect" ? <div className={styles.landingCorrection}>
      <span>Smallest correction</span>
      <strong>{comparison.corrections[0] ? `${comparison.corrections[0].direction === "same" ? "Stay" : `Move ${comparison.corrections[0].direction}`} ${comparison.corrections[0].absoluteSemitones} st · about ${Math.round(comparison.corrections[0].whiteKeyWidths * 10) / 10} white-key widths` : comparison.missingNotes.length ? `Add ${comparison.missingNotes.map((midi) => attack.notes.find((note) => note.pitch.midi === midi)?.pitch.label ?? pitchClassName(midi, prefer)).join(" + ")}` : comparison.extraNotes.length ? `Release ${comparison.extraNotes.map((midi) => pitchClassName(midi, prefer)).join(" + ")}` : attackStatusLabel(comparison, true)}</strong>
    </div> : null}
  </section>;
}

function ReadingChunkFocus({
  chunk,
  progress,
  memory,
  loop,
  comparisons,
  currentIndex,
  veiled,
  showConventions,
  notationById,
  directionText,
  activeLens,
  recommendedLens,
  onLensChange,
}: {
  chunk: SheetReadingChunk | null;
  progress: SheetReadingChunkProgress | null;
  memory: SheetChunkMemory | null;
  loop: SheetMusicPracticeLoop;
  comparisons: Map<number, SheetEventComparison>;
  currentIndex: number;
  veiled: boolean;
  showConventions: boolean;
  notationById: Map<string, ImportedMusicXmlNote>;
  directionText: string | null;
  activeLens: ReadingLens;
  recommendedLens: ReadingLens;
  onLensChange: (lens: ReadingLens) => void;
}) {
  if (!chunk) return <section className={styles.chunkFocus}><header><span>Chunk · read shapes</span><strong>No playable chunk in this loop.</strong></header></section>;
  const chordSummary = veiled
    ? `${chunk.chordSpacings.length} vertical field${chunk.chordSpacings.length === 1 ? "" : "s"} · exact gaps veiled`
    : chunk.chordSpacings.length
    ? chunk.chordSpacings.map((shape) => shape.adjacentSemitones.map((gap) => `${gap}`).join("–")).join(" / ") + " st"
    : "no vertical chord inside this chunk";
  return <section className={cx(styles.chunkFocus, progress?.status === "secure" && styles.isChunkSecure, progress?.status === "repair" && styles.isChunkRepair)} aria-labelledby="reading-chunk-title">
    <header><div><span>Suggested chunk {chunk.ordinal + 1} · {chunk.attackCount} landings</span><strong id="reading-chunk-title">{veiled ? "Hidden reading shape" : chunk.label}</strong></div><em>{progress?.status === "secure" ? "✓ all matched this take" : progress?.status === "repair" ? `${progress.needsRepair} repair` : progress?.status === "in-progress" ? `${progress.successes} right · continue` : "up next"}</em></header>
    <p className={styles.chunkCue}>{veiled ? "Keep only the rhythm cell and phrase boundary in memory; pitch and chord size return after an explicit reveal." : chunk.cue}</p>
    {directionText && !veiled ? <p className={styles.chunkDirection}><span>Authored direction</span>{directionText}</p> : null}
    {!veiled && memory?.recentTakes.length ? <div className={styles.chunkMemory} aria-label="Recent repetitions of this reading chunk">
      <div><span>Recent evidence</span>{memory.recentTakes.slice(0, 3).map((take, index) => <i key={take.takeId} className={take.clean ? styles.isClean : take.needsRepair ? styles.needsRepair : undefined}>{take.clean ? "✓" : take.needsRepair ? "×" : "○"}<small>{take.completeCoverage ? index ? `${index + 1} back` : "latest" : "partial"}</small></i>)}</div>
      <strong>{memory.evidencePhrases[0] ?? `${memory.recentTakes.length} frozen take${memory.recentTakes.length === 1 ? "" : "s"} retained as separate evidence.`}</strong>
    </div> : null}
    <div className={styles.chunkAttackRail} role="list" aria-label={`Reading chunk from landing ${chunk.startAttackIndex + 1} through ${chunk.endAttackIndex + 1}`}>
      {chunk.attackIndexes.map((attackIndex, index) => {
        const attack = loop.attacks[attackIndex];
        const comparison = comparisons.get(attackIndex) ?? null;
        const isCurrent = attackIndex === currentIndex;
        const movement = index ? chunk.semitonePattern[index - 1] : null;
        const flags = [...new Set(attack.notes.flatMap((note) => {
          const source = notationById.get(note.id);
          return [source?.tuplet ? `${source.tuplet.actual}:${source.tuplet.normal}` : null, source?.fermata ? "fermata" : null, source?.slurStart ? "slur begins" : null, source?.slurStop ? "slur ends" : null, note.tie.start ? "tie" : null].filter((item): item is string => item != null);
        }))];
        return <div key={attack.id} className={styles.chunkAttackPair} style={{ "--rhythm-space": Math.max(1, Math.min(4, index ? chunk.rhythmPatternBeats[index - 1] : 1)) } as CSSProperties}>
          {movement != null && !veiled ? <i className={styles.chunkMove} style={{ "--interval-color": intervalColor(movement) } as CSSProperties}>{movement > 0 ? "↑" : movement < 0 ? "↓" : "→"}{Math.abs(movement)}</i> : null}
          <article role="listitem" className={cx(styles.chunkAttack, isCurrent && styles.isCurrent, comparison?.status === "correct" && styles.isCorrect, (comparison?.status === "incorrect" || comparison?.status === "missed") && styles.isWrong)} aria-current={isCurrent ? "step" : undefined} aria-label={veiled ? `Landing ${attackIndex + 1}, notation locked` : `Landing ${attackIndex + 1}, ${attackStatusLabel(comparison, isCurrent)}, ${attack.notes.length} note${attack.notes.length === 1 ? "" : "s"}`}>
            <small>{veiled ? "locked" : attack.notes.length > 1 ? `${attack.notes.length} notes` : "1 note"}</small>
            <div>{veiled ? <i /> : attack.notes.slice(0, 5).map((note) => <i key={note.id} />)}</div>
            <strong>{veiled ? "hidden" : showConventions ? attack.notes.map((note) => note.pitch.label).join("+") : attack.notes.length > 1 ? "field" : "tone"}</strong>
            <em>{attackStatusLabel(comparison, isCurrent)}</em>
            {!veiled && flags.length ? <span className={styles.notationFlags}>{flags.join(" · ")}</span> : null}
          </article>
        </div>;
      })}
    </div>
    <div className={styles.readingLensSelectors} role="group" aria-label="Choose one way to read this chunk">
      {([
        ["landmark", "Landmark"],
        ["motion", "Motion"],
        ["vertical", "Vertical"],
        ["rhythm", "Rhythm"],
      ] as const).map(([lens, label]) => {
        const unavailableWhileVeiled = veiled && lens !== "rhythm";
        return <button key={lens} type="button" disabled={unavailableWhileVeiled} aria-pressed={activeLens === lens} onClick={() => onLensChange(lens)}><span>{label}</span><small>{unavailableWhileVeiled ? "after reveal" : !veiled && recommendedLens === lens ? "suggested" : "view"}</small></button>;
      })}
    </div>
    <div className={styles.readingLensFocus}>
      {activeLens === "landmark" ? <><span>Landmark · prepare the territory</span><strong>{veiled ? `${chunk.noteCount} notes across ${chunk.attackCount} hidden landings` : showConventions ? chunk.noteSummary : `${chunk.handSummary.replace("both hands", "both staves").replace("right hand", "upper staff").replace("left hand", "lower staff")} · ${chunk.rangeSemitones} st range`}</strong><small>Find the outside register and recurring landing before decoding every interior note.</small></> : null}
      {activeLens === "motion" ? <><span>Motion · follow the top-note path</span><strong>{veiled ? "exact direction and width veiled" : patternLabel(chunk.semitonePattern)}</strong><small>Keep rise, fall, repeat, and exact semitone width as separate clues.</small></> : null}
      {activeLens === "vertical" ? <><span>Vertical · gather simultaneous notes</span><strong>{chordSummary}</strong><small>Read the outside span first, then the adjacent semitone gaps inside it.</small></> : null}
      {activeLens === "rhythm" ? <><span>Rhythm · feel the attack spacing</span><strong>{rhythmLabel(chunk.rhythmPatternBeats)}</strong><small>One slot is one landing; several notes inside a slot still share one attack boundary.</small></> : null}
    </div>
  </section>;
}

function CollectionFocus({ analysis, showConventions, prefer, veiled }: { analysis: SheetPitchCollectionAnalysis; showConventions: boolean; prefer: "flats" | "sharps"; veiled: boolean }) {
  const kindLabel = (kind: string) => kind === "natural-minor" ? "natural minor" : kind.replace("-", " ");
  const fitGap = (analysis.candidates[0]?.fitScore ?? 0) - (analysis.candidates[1]?.fitScore ?? 0);
  const evidenceHeadline = analysis.evidence === "thin"
    ? "Too few nearby pitches to orient a scale"
    : analysis.evidence === "usable"
      ? "Nearby notes fit several collections"
      : fitGap >= .08
        ? "One collection is the stronger nearby fit"
        : "Several nearby collections remain plausible";
  return <section className={styles.collectionFocus} aria-labelledby="collection-focus-title">
    <header><span>Local collection · chromatic pitch ring</span><strong id="collection-focus-title">{veiled ? "Scale context hidden during this pass" : evidenceHeadline}</strong></header>
    {veiled ? <div className={styles.collectionVeil}><i aria-hidden="true">?</i><strong>Pitch collection is veiled.</strong><small>Rhythm slots and neutral chunk boundaries remain; chord size, signature, pitch classes, and scale candidates return after reveal.</small></div> : <>
    <div className={styles.signatureContext}><span>Written context</span><strong>{analysis.authored.label}</strong>{analysis.authored.relativePossibilities.length ? <small>Signature relatives: {analysis.authored.relativePossibilities.join(" / ")}</small> : null}</div>
    <div className={styles.pitchClassOrbit} role="img" aria-label={`${analysis.observedPitchClasses.length} distinct pitch classes in the nearby reading window`}>
      {Array.from({ length: 12 }, (_, pitchClass) => <i key={pitchClass} className={analysis.observedPitchClasses.includes(pitchClass) ? styles.isObserved : undefined} style={{ "--pitch-angle": `${pitchClass * 30}deg` } as CSSProperties}><span>{showConventions && analysis.observedPitchClasses.includes(pitchClass) ? pitchClassName(pitchClass + 60, prefer).replace(/\d+$/, "") : ""}</span></i>)}
      <b>{analysis.observedPitchClasses.length}<small>pitch classes</small></b>
    </div>
    {analysis.evidence === "thin" ? <div className={styles.thinCollection}><strong>Play through more distinct pitch positions.</strong><small>This nearby window fits too many scales to orient you honestly.</small></div> : <div className={styles.collectionCandidates}>{analysis.candidates.slice(0, 2).map((candidate, index) => <article key={`${candidate.kind}-${candidate.tonicPitchClass}`}>
      <header><span>{analysis.evidence === "thin" ? "example compatible set" : index ? "another compatible fit" : fitGap >= .08 && analysis.evidence === "rich" ? "stronger local fit" : "compatible fit"}</span><strong>{showConventions ? candidate.label : kindLabel(candidate.kind)}</strong></header>
      <div><i style={{ "--fit": candidate.occurrenceCoverage } as CSSProperties} /></div>
      <small>{Math.round(candidate.occurrenceCoverage * 100)}% note coverage—not confidence · {candidate.signatureCompatible ? "agrees with signature" : "local subset only"}</small>
    </article>)}</div>}
    <p>{analysis.caveat}</p>
    </>}
  </section>;
}

function ScoreJourney({
  loop,
  chunks,
  chunkProgress,
  chunkMemory,
  comparisons,
  currentIndex,
  extraCount,
  captureState,
  veiled,
  selectedChunkId,
  onSelectChunk,
}: {
  loop: SheetMusicPracticeLoop;
  chunks: SheetReadingChunk[];
  chunkProgress: SheetReadingChunkProgress[];
  chunkMemory: Map<string, SheetChunkMemory>;
  comparisons: Map<number, SheetEventComparison>;
  currentIndex: number;
  extraCount: number;
  captureState: CaptureState;
  veiled: boolean;
  selectedChunkId: string | null;
  onSelectChunk: (chunk: SheetReadingChunk) => void;
}) {
  const exactLimit = 96;
  const binSize = Math.max(1, Math.ceil(loop.attacks.length / exactLimit));
  const bins = Array.from({ length: Math.ceil(loop.attacks.length / binSize) }, (_, binIndex) => {
    const start = binIndex * binSize;
    const end = Math.min(loop.attacks.length, start + binSize);
    const statuses = Array.from({ length: end - start }, (_, offset) => comparisons.get(start + offset)?.status ?? "pending");
    const wrong = statuses.filter((status) => status === "incorrect" || status === "missed").length;
    const correct = statuses.filter((status) => status === "correct").length;
    const current = currentIndex >= start && currentIndex < end;
    const state = wrong ? "repair" : correct === statuses.length ? "secure" : correct ? "mixed" : "pending";
    return { start, end, wrong, correct, current, state };
  });
  const successCount = [...comparisons.values()].filter((comparison) => comparison.status === "correct").length;
  const missCount = [...comparisons.values()].filter((comparison) => comparison.status === "incorrect" || comparison.status === "missed").length;
  const progressById = new Map(chunkProgress.map((progress) => [progress.chunkId, progress]));
  const chunkPageSize = 40;
  const selectedChunkIndex = selectedChunkId ? chunks.findIndex((chunk) => chunk.id === selectedChunkId) : -1;
  const cursorChunkIndex = chunks.findIndex((chunk) => currentIndex >= chunk.startAttackIndex && currentIndex <= chunk.endAttackIndex);
  const anchorChunkIndex = selectedChunkIndex >= 0 ? selectedChunkIndex : cursorChunkIndex >= 0 ? cursorChunkIndex : Math.max(0, chunks.length - 1);
  const desiredChunkPage = Math.floor(anchorChunkIndex / chunkPageSize);
  const chunkPageScope = `${chunks[0]?.id ?? "none"}:${chunks.at(-1)?.id ?? "none"}:${chunks.length}:${chunks[anchorChunkIndex]?.id ?? "none"}`;
  const [chunkPageOverride, setChunkPageOverride] = useState<{ scope: string; page: number } | null>(null);
  const chunkPageCount = Math.max(1, Math.ceil(chunks.length / chunkPageSize));
  const chunkPage = chunkPageOverride?.scope === chunkPageScope ? chunkPageOverride.page : desiredChunkPage;
  const safeChunkPage = Math.min(chunkPageCount - 1, chunkPage);
  const visibleChunkStart = safeChunkPage * chunkPageSize;
  const visibleChunks = chunks.slice(visibleChunkStart, visibleChunkStart + chunkPageSize);
  return <section className={styles.scoreJourney} aria-labelledby="score-journey-title">
    <header><div><span>Form · loop journey</span><strong id="score-journey-title">{loop.attacks.length} written landings in {chunks.length} reading chunks</strong></div><div className={styles.journeyCounts}><span className={styles.successCount}>✓ {successCount} right</span><span className={styles.missCount}>× {missCount} repair</span><span>○ {Math.max(0, loop.attacks.length - successCount - missCount)} waiting</span>{extraCount ? <span>+ {extraCount} extra landing{extraCount === 1 ? "" : "s"}</span> : null}</div></header>
    <div className={styles.journeyTrack} role="img" aria-label={`${successCount} correct, ${missCount} needing repair, ${Math.max(0, loop.attacks.length - successCount - missCount)} waiting${extraCount ? `, and ${extraCount} extra landings` : ""}`}>
      {bins.map((bin) => <i key={bin.start} className={cx(bin.state === "secure" && styles.isSecure, bin.state === "repair" && styles.isRepair, bin.state === "mixed" && styles.isMixed, bin.current && styles.isCursor)} title={`Landings ${bin.start + 1}–${bin.end}: ${bin.correct} right, ${bin.wrong} repair`} />)}
    </div>
    {chunkPageCount > 1 ? <div className={styles.chunkJourneyNav} aria-label="Reading chunk pages"><button type="button" disabled={safeChunkPage === 0} onClick={() => setChunkPageOverride({ scope: chunkPageScope, page: Math.max(0, safeChunkPage - 1) })}>← Previous chunks</button><span>Chunks {visibleChunkStart + 1}–{Math.min(chunks.length, visibleChunkStart + visibleChunks.length)} of {chunks.length}</span><button type="button" disabled={safeChunkPage >= chunkPageCount - 1} onClick={() => setChunkPageOverride({ scope: chunkPageScope, page: Math.min(chunkPageCount - 1, safeChunkPage + 1) })}>Next chunks →</button></div> : null}
    <div className={styles.chunkJourney} aria-label="Select a reading chunk to practice">{visibleChunks.map((chunk) => {
      const progress = progressById.get(chunk.id);
      const memory = veiled ? null : chunkMemory.get(chunk.id);
      const selected = selectedChunkId === chunk.id;
      const live = currentIndex >= chunk.startAttackIndex && currentIndex <= chunk.endAttackIndex;
      const outcome = progress?.status === "secure" ? "all matched this take" : progress?.status === "repair" ? "needs repair this take" : "waiting this take";
      const repetition = veiled ? "repeat evidence veiled" : memory?.consecutiveCleanTakes ? `${memory.consecutiveCleanTakes} aligned in a row` : memory?.repeatedRepairLandingIds.length ? `same repair at ${memory.repeatedRepairLandingIds.length} landing${memory.repeatedRepairLandingIds.length === 1 ? "" : "s"}` : "no repeat pattern yet";
      return <button key={chunk.id} type="button" className={cx(progress?.status === "secure" && styles.isSecure, progress?.status === "repair" && styles.isRepair, live && styles.isCursor, selected && styles.isSelected)} style={{ "--chunk-grow": chunk.attackCount } as CSSProperties} aria-pressed={selected} aria-current={live ? "step" : undefined} aria-label={`Practice chunk ${chunk.ordinal + 1}, measures ${chunk.measureNumbers.join(" to ")}, ${chunk.attackCount} landings${live ? ", current" : ""}, ${outcome}, ${repetition}`} onClick={() => onSelectChunk(chunk)}><span>{chunk.ordinal + 1}</span><small>{progress?.status === "secure" ? "✓" : progress?.status === "repair" ? "×" : "○"}</small>{live ? <b aria-hidden="true">now</b> : null}{memory?.recentTakes.length ? <em>{memory.consecutiveCleanTakes >= 2 ? "2×✓" : memory.repeatedRepairLandingIds.length ? "repeat ×" : `${memory.recentTakes.length} take${memory.recentTakes.length === 1 ? "" : "s"}`}</em> : null}</button>;
    })}</div>
    <p>{veiled ? "Chunk boundaries and landing counts remain visible; pitch, outcomes, and repetition evidence return in review." : selectedChunkId ? "A selected chunk becomes the exact practice target; surrounding measure landings stay visible here but are not marked missed." : captureState === "review" ? "Frozen review: ✓ and × are definitive for this take. Select a chunk to repeat only that reading unit." : captureState === "armed" ? "Live alignment is provisional; a later landing can clarify an earlier match." : "Live follow is already active. Choose a chunk for a short repetition, or start a review take when you want one pass frozen."}</p>
  </section>;
}

type ListeningStaffDisclosure = "veiled" | "revealed" | "memory";

function listeningStaffDisclosure(index: number, view: ReferencePlaybackView, readingMode: ReadingMode, reviewRevealed: boolean): ListeningStaffDisclosure {
  const started = view.phase === "playing" || view.phase === "complete";
  const insideScheduledRange = view.startIndex != null && view.cursorIndex != null
    && index >= view.startIndex && index <= view.cursorIndex;
  const cursorHasSounded = view.cursorIndex != null && (
    index < view.cursorIndex
    || index === view.currentIndex
    || view.progress > 0
    || view.phase === "complete"
  );
  if (!started || !insideScheduledRange || !cursorHasSounded) return "veiled";
  if (reviewRevealed) return "revealed";
  if (view.notationLocked) return "veiled";
  if (readingMode === "read") return "revealed";
  if (readingMode === "memory" && view.phase === "playing") return index === view.memoryRevealIndex ? "memory" : "veiled";
  return "veiled";
}

function staffNoteNudge(notes: SheetMusicNote[], index: number) {
  const current = notes[index];
  const prior = notes[index - 1];
  if (!current || !prior) return 0;
  return Math.abs(scoreStaffY(current) - scoreStaffY(prior)) <= 5 ? (index % 2 ? 5 : -5) : 0;
}

function staffLedgerLines(note: SheetMusicNote) {
  const y = scoreStaffY(note);
  const top = note.hand === "left" ? 124 : 38;
  const bottom = note.hand === "left" ? 164 : 78;
  const lines: number[] = [];
  if (y < top) for (let line = top - 10; line >= y - 1; line -= 10) lines.push(line);
  if (y > bottom) for (let line = bottom + 10; line <= y + 1; line += 10) lines.push(line);
  return lines;
}

function listeningStaffResult(comparison: SheetEventComparison | undefined, exact: boolean) {
  if (!comparison || comparison.status === "pending") return "heard · waiting for your keys";
  if (comparison.status === "correct") return "✓ found on the pulse";
  if (comparison.status === "missed") return "× heard · no played landing";
  if (!comparison.pitchMatch) {
    const correction = closestSinglePitchCorrection(comparison);
    if (correction == null) return "△ chord shape differs";
    if (!exact) return correction > 0 ? "↑ your key was lower" : "↓ your key was higher";
    return `${Math.abs(correction)} st ${correction > 0 ? "low · move right" : "high · move left"}`;
  }
  if (comparison.arpeggiationMatch === false) return "↕ change roll direction";
  if (comparison.spacingMatch === false) return "△ chord spacing differs";
  if (comparison.timingMatch === false) return comparison.timingErrorMs != null && comparison.timingErrorMs < 0 ? "← early attack" : "→ late attack";
  if (comparison.durationMatch === false) return comparison.durationErrorMs != null && comparison.durationErrorMs < 0 ? "↓ released early" : "↑ released late";
  return "△ needs another pass";
}

function ListeningStaff({ view, loop, comparisons, readingMode, showConventions, notationById, feedbackAttackId, reviewRevealed }: {
  view: ReferencePlaybackView;
  loop: SheetMusicPracticeLoop;
  comparisons: ReadonlyMap<string, SheetEventComparison>;
  readingMode: ReadingMode;
  showConventions: boolean;
  notationById: ReadonlyMap<string, ImportedMusicXmlNote>;
  feedbackAttackId: string | null;
  reviewRevealed: boolean;
}) {
  const windowSize = Math.min(7, loop.attacks.length);
  const anchor = Math.max(0, Math.min(loop.attacks.length - 1, view.cursorIndex ?? view.startIndex ?? 0));
  const start = Math.max(0, Math.min(loop.attacks.length - windowSize, anchor - Math.floor(windowSize / 2)));
  const attacks = loop.attacks.slice(start, start + windowSize);
  const firstBeat = attacks[0]?.relativeOnsetBeat ?? 0;
  const lastBeat = attacks.at(-1)?.relativeOnsetBeat ?? firstBeat;
  const beatSpan = Math.max(.0001, lastBeat - firstBeat);
  const attackPositions = spreadStaffAttackPositions(attacks.map((attack) => attacks.length === 1 ? 50 : 6 + (attack.relativeOnsetBeat - firstBeat) / beatSpan * 88));
  const staffItems = attacks.map((attack, localIndex) => {
    const attackIndex = start + localIndex;
    const x = attackPositions[localIndex];
    const cellLeft = localIndex === 0 ? 0 : (attackPositions[localIndex - 1] + x) / 2;
    const cellRight = localIndex === attacks.length - 1 ? 100 : (x + attackPositions[localIndex + 1]) / 2;
    const attackX = cellRight - cellLeft < .001 ? 50 : (x - cellLeft) / (cellRight - cellLeft) * 100;
    const disclosure = listeningStaffDisclosure(attackIndex, view, readingMode, reviewRevealed);
    return {
      attack,
      attackIndex,
      attackX,
      cellLeft,
      cellWidth: cellRight - cellLeft,
      comparison: view.playAlong ? comparisons.get(attack.id) : undefined,
      disclosure,
      notes: referenceNotesForAttack(attack, view.voice).sort((first, second) => first.pitch.midi - second.pitch.midi),
    };
  });
  const visibleReachedCount = staffItems.filter((item) => item.disclosure !== "veiled").length;
  const totalReachedCount = loop.attacks.reduce((count, _attack, index) => (
    listeningStaffDisclosure(index, { ...view, notationLocked: false }, "read", true) === "veiled" ? count : count + 1
  ), 0);
  const revealedItems = staffItems.filter((item) => item.disclosure === "revealed" || item.disclosure === "memory");
  const revealedSummary = revealedItems.length
    ? revealedItems.map((item) => `measure ${item.attack.measureNumber}, ${item.notes.map((note) => showConventions ? writtenLabel(note, true) : staffPositionLabel(note, notationById.get(note.id))).join(" plus ")}, ${listeningStaffResult(item.comparison, true)}`).join(". ")
    : "No pitch position is revealed yet.";
  const reachedState = totalReachedCount === visibleReachedCount
    ? `${totalReachedCount} clock-reached landing${totalReachedCount === 1 ? "" : "s"} in this window`
    : `${totalReachedCount} clock-reached overall; ${visibleReachedCount} in this staff window`;
  const staffState = view.phase === "count-in"
    ? "Count-in: the staff is present, but every pitch-bearing landing stays covered."
    : view.phase === "playing" && readingMode === "read"
      ? `${reachedState} revealed; later pitch positions remain covered.`
      : view.phase === "playing" && readingMode === "memory" && !view.notationLocked
        ? `The current onset appears briefly, then returns behind the veil. ${reachedState}.`
      : view.phase === "playing"
          ? `${reachedState}; pitch, note count, and staff height remain locked.`
          : view.phase === "complete"
            ? reviewRevealed
              ? `${reachedState} revealed by request; unreached landings remain covered.`
              : `${reachedState}; notation remains locked until you choose Reveal heard passage.`
            : "The grand staff stays visible while every pitch-bearing landing remains covered.";

  return <div className={styles.listeningStaffRegion} role="group" aria-label="Listening staff: notation follows the selected disclosure policy">
    <div className={styles.listeningStaff} aria-hidden="true">
      <i className={styles.listeningTrebleLines} /><i className={styles.listeningBassLines} />
      <b className={styles.listeningBrace}>{"}"}</b><b className={styles.trebleClef}>𝄞</b><b className={styles.bassClef}>𝄢</b>
      <span className={styles.staffNotationBoundary}>pitch-explicit ♯ ♭ ♮ · repeats intentional</span>
      <div className={styles.listeningStaffTrack}>
        {staffItems.map(({ attack, attackIndex, attackX, cellLeft, cellWidth, comparison, disclosure, notes }) => {
          const exact = disclosure === "revealed" || disclosure === "memory";
          const outcomeVisible = disclosure !== "veiled" && comparison != null;
          const resultClass = outcomeVisible && comparison.status === "correct" ? styles.isStaffCorrect
            : outcomeVisible && (comparison.status === "incorrect" || comparison.status === "missed") ? styles.isStaffWrong : null;
          const isCursor = attackIndex === view.cursorIndex && (view.phase === "count-in" || view.phase === "playing");
          const isSounding = attackIndex === view.soundingIndex && view.sounding;
          const isFeedback = outcomeVisible && comparison.actual != null && attack.id === feedbackAttackId;
          const priorAttack = loop.attacks[attackIndex - 1];
          const measureStart = attackIndex === 0 || priorAttack?.measureIndex !== attack.measureIndex;
          return <div key={attack.id} className={cx(styles.listeningLanding, isCursor && styles.isStaffCursor, isSounding && styles.isStaffSounding, isFeedback && styles.isStaffFeedback, measureStart && styles.isStaffMeasureStart, resultClass)} data-disclosure={disclosure} style={{ "--staff-cell-left": `${cellLeft}%`, "--staff-cell-width": `${cellWidth}%`, "--staff-attack-x": `${attackX}%` } as CSSProperties}>
            {exact ? notes.map((note, noteIndex) => {
              const accidental = pitchLocatorAccidentalGlyph(note, notationById.get(note.id));
              const octaveMark = scoreStaffOctaveMark(note);
              const nudge = staffNoteNudge(notes, noteIndex);
              return <span key={note.id} className={styles.listeningNoteGroup} style={{ "--staff-y": `${scoreStaffY(note)}px`, "--note-nudge": `${nudge}px` } as CSSProperties}>
                {staffLedgerLines(note).map((line) => <i key={line} className={styles.listeningLedger} style={{ "--ledger-y": `${line - scoreStaffY(note)}px` } as CSSProperties} />)}
                {accidental ? <b className={styles.listeningAccidental}>{accidental}</b> : null}
                <i className={styles.listeningNote} />
                {octaveMark ? <small className={styles.listeningOctave}>{octaveMark}</small> : null}
              </span>;
            }) : null}
            {disclosure !== "revealed" ? <span className={styles.staffSlotVeil}><b>{disclosure === "memory" ? "◌" : "·"}</b><small>{disclosure === "memory" ? "remember" : view.phase === "playing" && attackIndex <= (view.cursorIndex ?? -1) ? "heard · locked" : "covered"}</small></span> : null}
            <span className={styles.staffSlotCaption}><b>{measureStart ? `m.${attack.measureNumber}` : `+${Number((attack.relativeOnsetBeat - (priorAttack?.relativeOnsetBeat ?? attack.relativeOnsetBeat)).toFixed(2))} beat`}</b><small>{disclosure === "revealed" ? listeningStaffResult(comparison, true) : disclosure === "memory" ? "hold the image" : "listen first"}</small>{disclosure === "revealed" && showConventions && isCursor ? <em>{notes.map((note) => note.pitch.label).join(" + ")}</em> : null}</span>
          </div>;
        })}
      </div>
    </div>
    <p className="sr-only">{staffState} Visible revealed notation: {revealedSummary}</p>
    {view.phase === "complete" ? <p className="sr-only" role="status" aria-live="polite">Listening-staff review ready. {revealedSummary}</p> : null}
  </div>;
}

function PlayAlongField({ view, loop, comparison, comparisons, readingMode, showConventions, notationById, activeNotes, audioPlaying, canPlay, independentListening, sourceLabel, reviewRevealed, onListen, onToggle, onToggleReveal }: {
  view: ReferencePlaybackView;
  loop: SheetMusicPracticeLoop;
  comparison: SheetEventComparison | null;
  comparisons: ReadonlyMap<string, SheetEventComparison>;
  readingMode: ReadingMode;
  showConventions: boolean;
  notationById: ReadonlyMap<string, ImportedMusicXmlNote>;
  activeNotes: number[];
  audioPlaying: boolean;
  canPlay: boolean;
  independentListening: boolean;
  sourceLabel: string;
  reviewRevealed: boolean;
  onListen: () => void;
  onToggle: () => void;
  onToggleReveal: () => void;
}) {
  const heardAttack = view.currentIndex == null ? null : loop.attacks[view.currentIndex] ?? null;
  const heardNotes = heardAttack ? referenceNotesForAttack(heardAttack, view.voice) : [];
  const noteCount = heardNotes.length;
  const learnerComparison = view.playAlong ? comparison : null;
  const earExactReveal = reviewRevealed || (!view.notationLocked && readingMode === "read")
    || (readingMode === "memory" && view.memoryRevealIndex != null && view.memoryRevealIndex === view.currentIndex);
  const handExactReveal = reviewRevealed || (!view.notationLocked && readingMode === "read")
    || (readingMode === "memory" && view.memoryRevealIndex != null && view.memoryRevealIndex === learnerComparison?.expectedIndex);
  const pitchCorrection = closestSinglePitchCorrection(learnerComparison);
  const timingError = learnerComparison?.timingErrorMs ?? null;
  const timingPosition = timingError == null || learnerComparison?.timingMatch ? 50 : handExactReveal
    ? Math.max(6, Math.min(94, 50 + timingError / 420 * 44))
    : timingError < 0 ? 24 : 76;
  const pitchPosition = pitchCorrection == null || pitchCorrection === 0 ? 50 : handExactReveal
    ? Math.max(8, Math.min(92, 50 - pitchCorrection / 12 * 42))
    : pitchCorrection > 0 ? 24 : 76;
  const heardOrdinal = view.currentIndex == null ? null : view.currentIndex + 1;
  const cursorOrdinal = view.cursorIndex == null ? null : view.cursorIndex + 1;
  const currentOnsetIsSounding = view.sounding && view.soundingIndex === view.currentIndex;
  const earlierSustainIsSounding = view.sounding && view.soundingIndex != null && view.soundingIndex !== view.currentIndex;
  const phaseTitle = view.phase === "count-in"
    ? `Starting in ${view.countdown ?? "…"}`
    : view.phase === "playing"
      ? currentOnsetIsSounding
        ? `Reference sounding · landing ${heardOrdinal ?? "…"}`
        : earlierSustainIsSounding
          ? `Sustain ringing · after landing ${cursorOrdinal ?? "…"}`
          : `Rest · pulse continues after landing ${cursorOrdinal ?? "…"}`
      : view.phase === "complete"
        ? view.intent === "practice"
          ? reviewRevealed ? "Pass complete · heard passage revealed by choice" : "Pass complete · evidence ready, notation still your choice"
          : reviewRevealed ? "Listening complete · heard passage revealed by choice" : "Listening complete · notation stayed locked"
        : view.phase === "unavailable"
          ? "Audio unavailable · silent practice remains ready"
          : "Listen first, then play when the phrase is inside you";
  const voiceLabel = view.voice === "upper" ? "upper path" : view.voice === "bass" ? "bass route" : "full score field";
  const targetLabel = heardAttack
    ? (earExactReveal && !view.notationLocked) || reviewRevealed
      ? heardNotes.map((note) => writtenLabel(note, showConventions)).join(" + ")
      : "Pitch and note count stay hidden"
    : "No pitch is revealed before it sounds";
  const pitchFeedback = !learnerComparison?.actual
    ? "Your played landing appears after attack"
    : learnerComparison.pitchMatch
      ? handExactReveal ? "Pitch aligned · no key correction" : "Shape aligned"
      : pitchCorrection != null
        ? handExactReveal
          ? `${Math.abs(pitchCorrection)} semitone${Math.abs(pitchCorrection) === 1 ? "" : "s"} ${pitchCorrection > 0 ? "low · move right" : "high · move left"}`
          : pitchCorrection > 0 ? "Played lower than heard" : "Played higher than heard"
        : handExactReveal
          ? `${learnerComparison.missingNotes.length} missing · ${learnerComparison.extraNotes.length} extra`
          : "Pitch shape differs";
  const timingFeedback = timingError == null
    ? "The center will catch your attack"
    : learnerComparison?.timingMatch
      ? handExactReveal ? `${Math.round(Math.abs(timingError))} ms from the pulse · aligned` : "On the pulse"
      : handExactReveal
        ? `${Math.round(Math.abs(timingError))} ms ${timingError < 0 ? "early" : "late"}`
        : timingError < 0 ? "Early" : "Late";
  const feedbackMidi = learnerComparison?.expectedNotes ?? heardNotes.map((note) => note.pitch.midi);
  const feedbackNoteCount = feedbackMidi.length;
  const pressedTargetCount = handExactReveal ? new Set(activeNotes.filter((note) => feedbackMidi.includes(note))).size : 0;
  const scalarFeedback = Boolean(learnerComparison?.actual && (pitchCorrection != null || learnerComparison.pitchMatch));
  const chordShapeFeedback = Boolean(learnerComparison?.actual && pitchCorrection == null && !learnerComparison.pitchMatch);

  return <section className={styles.playAlongField} data-phase={view.phase} data-reading={readingMode} aria-labelledby="play-along-field-title">
    <header>
      <div><span>Shared musical now · {sourceLabel}</span><strong id="play-along-field-title">{phaseTitle}</strong></div>
      <div className={styles.playbackHeaderActions}>
        <div className={styles.playbackBadges}><span>{readingMode === "read" ? "Follow · heard notes stay" : readingMode === "memory" ? "Flash · then cover" : "Hidden · ear only"}</span><span>{voiceLabel}</span></div>
        <div className={styles.fieldTransportActions}>
          {independentListening ? <span className={styles.fieldIndependentNotice}>Use the player above · score timing stays independent</span> : audioPlaying ? <button type="button" className={styles.fieldPlayAction} aria-pressed onClick={onToggle}>Stop</button> : <>
            <button type="button" className={styles.fieldListenAction} disabled={!canPlay} onClick={onListen}>Listen · notes locked</button>
            <button type="button" className={styles.fieldPlayAction} disabled={!canPlay} onClick={onToggle}>Play + compare</button>
          </>}
          {view.phase === "complete" && !audioPlaying ? <button type="button" className={styles.fieldRevealAction} aria-pressed={reviewRevealed} onClick={onToggleReveal}>{reviewRevealed ? "Hide notation" : "Reveal heard passage"}</button> : null}
        </div>
      </div>
    </header>
    <div className={styles.referenceTimeline} style={{ "--reference-progress": `${Math.round(view.progress * 1000) / 10}%` } as CSSProperties} role="progressbar" aria-label="Reference playback position" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(view.progress * 100)}>
      <i />
      <b key={view.phase === "count-in" ? `count-${view.countdown}` : "playhead"} aria-hidden="true" />
      <span>{view.phase === "count-in" ? `count ${view.countdown ?? "…"}` : view.durationMs > 0 ? `${clockLabel(view.elapsedMs)} / ${clockLabel(view.durationMs)}${cursorOrdinal ? ` · ${cursorOrdinal}/${loop.attacks.length}` : ""}` : cursorOrdinal ? `${cursorOrdinal} / ${loop.attacks.length}` : `${loop.attacks.length} landings ready`}</span>
    </div>
    <div className={styles.sensoryBridge}>
      <article className={styles.earBeacon}>
        <div className={styles.soundOrb} aria-hidden="true"><i /><i /><i />{view.phase === "playing" && view.sounding ? <b key={view.soundingIndex ?? "sound"} /> : null}</div>
        <span>Ear · hear this instant</span>
        <strong>{view.phase === "playing" ? currentOnsetIsSounding ? targetLabel : earlierSustainIsSounding ? "Earlier sound still ringing · no new attack" : "Rest · keep the shared pulse inside" : view.phase === "count-in" ? "Feel the pulse before touching a key" : view.phase === "complete" ? "The reference has released" : "The score stays silent until you start"}</strong>
        <small>{currentOnsetIsSounding && heardAttack ? view.notationLocked && !reviewRevealed ? `Measure ${heardAttack.measureNumber} · listen without counting or naming notes.` : `Measure ${heardAttack.measureNumber} · ${noteCount > 1 ? `${noteCount} tones begin together now` : "one tone begins now"}` : earlierSustainIsSounding ? `After landing ${cursorOrdinal ?? "…"} · sustain continues without a new onset.` : view.phase === "playing" ? "No scheduled reference tone is sounding in this gap." : "A visible count-in will establish the shared clock."}</small>
      </article>

      <article className={styles.heardStaff} aria-labelledby="listening-staff-title">
        <span>Eye · one staff, learner-controlled disclosure</span>
        <strong id="listening-staff-title">{reviewRevealed ? "You chose to connect the heard passage to notation." : view.notationLocked || readingMode === "ear" ? "Listen. Notation is intentionally locked." : readingMode === "memory" ? "See it once; keep it after the veil returns." : "Each heard landing stays on the staff."}</strong>
        <ListeningStaff view={view} loop={loop} comparisons={comparisons} readingMode={readingMode} showConventions={showConventions} notationById={notationById} feedbackAttackId={learnerComparison?.expected.id ?? null} reviewRevealed={reviewRevealed} />
        <small>{reviewRevealed ? "Only the clock-reached passage is visible; later notes remain covered." : view.notationLocked || readingMode === "ear" ? "Listening and stopping do not reveal pitch, note count, staff height, or target keys. Reveal is a separate choice." : readingMode === "memory" ? "Flash opens only the current onset briefly, then removes its exact pitch from the page." : "Follow keeps the clock-reached prefix visible while later positions stay covered."} Revealed accidentals are pitch-explicit; the source page remains the authoritative engraving.</small>
      </article>

      <article className={styles.handFeedback}>
        <span>Hands · {learnerComparison?.actual ? `last attack vs landing ${learnerComparison.expectedIndex + 1}` : "compare the keys you touch"}</span>
        <div className={styles.feedbackCompass} aria-label={`${pitchFeedback}. ${timingFeedback}.`}>
          {scalarFeedback ? <i className={styles.feedbackPoint} style={{ "--feedback-x": `${timingPosition}%`, "--feedback-y": `${pitchPosition}%` } as CSSProperties} /> : null}
          {chordShapeFeedback ? <i className={styles.feedbackTimingMark} style={{ "--feedback-x": `${timingPosition}%` } as CSSProperties} /> : null}
          <b className={styles.feedbackCenter} aria-hidden="true" />
          <small className={styles.earlyLabel}>early</small><small className={styles.lateLabel}>late</small>
          <small className={styles.higherLabel}>move higher</small><small className={styles.lowerLabel}>move lower</small>
        </div>
        <strong>{pitchFeedback}</strong>
        <small>{timingFeedback}{learnerComparison && pressedTargetCount ? ` · ${pressedTargetCount} of ${feedbackNoteCount} target key${feedbackNoteCount === 1 ? "" : "s"} down now` : ""}</small>
      </article>
    </div>
    <p className="sr-only" role="status" aria-live={view.phase === "playing" ? "off" : "polite"} aria-atomic="true">{phaseTitle}{heardAttack ? `. ${targetLabel}. ${pitchFeedback}. ${timingFeedback}.` : "."}</p>
    {view.truncated ? <p className={styles.referenceBoundary}>This audition is browser-bounded; choose a shorter reading chunk to hear the complete unit.</p> : null}
  </section>;
}

function stopAudioContext(context: AudioContext | null, master: GainNode | null) {
  if (!context || context.state === "closed") return;
  try {
    const now = context.currentTime;
    if (master) {
      master.gain.cancelScheduledValues(now);
      master.gain.setValueAtTime(Math.max(0.0001, master.gain.value), now);
      master.gain.exponentialRampToValueAtTime(0.0001, now + 0.025);
    }
    window.setTimeout(() => { if (context.state !== "closed") void context.close(); }, 40);
  } catch { void context.close(); }
}

export function PianoScoreFlowHud({ events, activeNotes, pressedNotes, chordWindowMs, showConventions, frozen, midiConnected, midiStatus, onConnectMidi, onResumeCapture }: PianoScoreFlowHudProps) {
  const [imported, setImported] = useState<ImportedMusicXmlScore | null>(null);
  const [score, setScore] = useState<SheetMusicScore | null>(null);
  const [fileState, setFileState] = useState<"empty" | "loading" | "ready" | "error">("empty");
  const [fileNotice, setFileNotice] = useState("Choose compressed MXL or uncompressed MusicXML. Nothing leaves this browser tab.");
  const [loopStart, setLoopStart] = useState(0);
  const [loopEnd, setLoopEnd] = useState(3);
  const [practiceHand, setPracticeHand] = useState<PracticeHand>("both");
  const [readingMode, setReadingMode] = useState<ReadingMode>("ear");
  const [timingMode, setTimingMode] = useState<TimingMode>("self-paced");
  const [tempoPercent, setTempoPercent] = useState(70);
  const [clusterWindow, setClusterWindow] = useState(() => chordWindowMs <= 80 ? 70 : chordWindowMs <= 160 ? 140 : 220);
  const [selectedChunkId, setSelectedChunkId] = useState<string | null>(null);
  const [manualReadingLens, setManualReadingLens] = useState<ReadingLens | null>(null);
  const [takeHistory, setTakeHistory] = useState<SheetTakeEvidence[]>([]);
  const [captureState, setCaptureState] = useState<CaptureState>("idle");
  const [reviewTakeEvents, setReviewTakeEvents] = useState<MidiPerformanceNote[] | null>(null);
  const [attemptAfterId, setAttemptAfterId] = useState(() => newestEventId(events));
  const [settledThroughEventId, setSettledThroughEventId] = useState(() => newestEventId(events));
  const [captureNotice, setCaptureNotice] = useState("Load a score, then play: live follow begins without arming. Start a review take only when you want to freeze one pass.");
  const [isDragging, setIsDragging] = useState(false);
  const [audioState, setAudioState] = useState<"idle" | "playing" | "unavailable">("idle");
  const [audioNotice, setAudioNotice] = useState("Synthesized score reference is ready. MIDI input remains silent.");
  const [referenceVolume, setReferenceVolume] = useState(78);
  const [referenceSource, setReferenceSource] = useState<ReferenceSource>("synth");
  const [sourceDrawerOpen, setSourceDrawerOpen] = useState(false);
  const [reviewNotationRevealed, setReviewNotationRevealed] = useState(false);
  const [localReferenceAudio, setLocalReferenceAudio] = useState<LocalReferenceAudio | null>(null);
  const [localAudioTime, setLocalAudioTime] = useState(0);
  const [mediaSyncAnchors, setMediaSyncAnchors] = useState<ScoreMediaAnchor[]>([]);
  const [syncTargetAttackId, setSyncTargetAttackId] = useState<string | null>(null);
  const [spotifyInput, setSpotifyInput] = useState("");
  const [spotifyTarget, setSpotifyTarget] = useState<SpotifyEmbedTarget | null>(null);
  const [spotifyNotice, setSpotifyNotice] = useState("Paste a Spotify track, album, playlist, show, or episode link.");
  const [referencePlayback, setReferencePlayback] = useState<ReferencePlaybackView>(EMPTY_REFERENCE_VIEW);
  const [referenceTimingClock, setReferenceTimingClock] = useState<{ scoreBeat: number; performanceTimeMs: number } | null>(null);
  const [referenceTimingMap, setReferenceTimingMap] = useState<Array<{ scoreBeat: number; performanceTimeMs: number }> | null>(null);
  const [referenceReviewRange, setReferenceReviewRange] = useState<{ startAttackId: string; endAttackId: string } | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const audioMasterRef = useRef<GainNode | null>(null);
  const audioTimerRef = useRef<number | null>(null);
  const audioFrameRef = useRef<number | null>(null);
  const audioTokenRef = useRef(0);
  const visualUpdateMsRef = useRef(0);
  const localAudioElementRef = useRef<HTMLAudioElement | null>(null);
  const localAudioUrlRef = useRef<string | null>(null);
  const referenceSessionRef = useRef<{
    afterId: number;
    earliestOnsetMs: number;
    latestOnsetMs: number;
    playAlong: boolean;
    startAttackId: string;
    heardEndAttackId: string | null;
  } | null>(null);
  const eventsRef = useRef(events);
  const recordedTakeRef = useRef<string | null>(null);

  useEffect(() => {
    eventsRef.current = events;
  }, [events]);

  useEffect(() => {
    const element = localAudioElementRef.current;
    if (element) element.volume = mediaLevel(referenceVolume);
  }, [referenceVolume, localReferenceAudio?.url]);

  useEffect(() => () => {
    if (localAudioUrlRef.current) URL.revokeObjectURL(localAudioUrlRef.current);
  }, []);

  const stopReference = useCallback((notice = "Reference stopped. MIDI remains silent.", preserveClock = false, freezeTake = false, preserveReviewRange = false) => {
    audioTokenRef.current += 1;
    if (audioTimerRef.current != null) window.clearTimeout(audioTimerRef.current);
    if (audioFrameRef.current != null) window.cancelAnimationFrame(audioFrameRef.current);
    audioTimerRef.current = null;
    audioFrameRef.current = null;
    localAudioElementRef.current?.pause();
    stopAudioContext(audioContextRef.current, audioMasterRef.current);
    audioContextRef.current = null;
    audioMasterRef.current = null;
    const session = referenceSessionRef.current;
    const freezePracticePrefix = Boolean(freezeTake && session?.playAlong && session.heardEndAttackId);
    const freezeListeningPrefix = Boolean(preserveReviewRange && session && !session.playAlong && session.heardEndAttackId);
    const preserveHeardPrefix = freezePracticePrefix || freezeListeningPrefix;
    if (freezePracticePrefix && session) {
      const captured = capturedScoreEvents(
        eventsRef.current,
        session.afterId,
        session.earliestOnsetMs,
        Math.min(performance.now(), session.latestOnsetMs),
      );
      setReferenceReviewRange({ startAttackId: session.startAttackId, endAttackId: session.heardEndAttackId! });
      setReviewTakeEvents(captured);
      setCaptureState("review");
      setCaptureNotice(captured.length ? "Play + compare stopped. Only the heard prefix is frozen for synchronized review." : "Play + compare stopped after the reference began, but no MIDI attack arrived. Only the heard prefix is shown as missed.");
    } else if (freezeTake && session?.playAlong) {
      setReferenceReviewRange(null);
      setCaptureState("idle");
      setCaptureNotice("Play + compare stopped during the count-in; no score landing was marked missed.");
    } else if (!preserveReviewRange) {
      setReferenceReviewRange(null);
    }
    referenceSessionRef.current = null;
    setAudioState("idle");
    setReferencePlayback((current) => preserveHeardPrefix
      ? { ...current, phase: "complete", currentIndex: null, memoryRevealIndex: null, soundingIndex: null, sounding: false, countdown: null }
      : EMPTY_REFERENCE_VIEW);
    // The audible clock is meaningful only when a synchronized take survives.
    // In particular, Stop during count-in must not poison later live-follow
    // timing, while a later upper/bass preview must preserve frozen evidence.
    const cancelledPlayAlongBeforeSound = Boolean(freezeTake && session?.playAlong && !freezePracticePrefix);
    if (!preserveClock || cancelledPlayAlongBeforeSound) {
      setReferenceTimingClock(null);
      setReferenceTimingMap(null);
    }
    setAudioNotice(notice);
  }, []);

  const installScore = useCallback((nextImported: ImportedMusicXmlScore, xml: string, persist: boolean) => {
    stopReference("Reference stopped for the new score. MIDI remains silent.");
    if (nextImported.partNames.length !== 1) throw new Error(`This piano release evaluates one MusicXML part at a time. This file contains ${nextImported.partNames.length}; export the piano part by itself, then import that file.`);
    const normalized = normalizeImportedMusicXmlScore(nextImported);
    setImported(nextImported);
    setScore(normalized);
    setFileState("ready");
    setFileNotice(`${nextImported.measureCount} measures · ${normalized.attacks.length} landings · ${nextImported.notes.length} written notes.`);
    setLoopStart(0);
    setLoopEnd(Math.min(3, nextImported.measureCount - 1));
    setTempoPercent(70);
    setReadingMode("ear");
    setReviewNotationRevealed(false);
    setMediaSyncAnchors([]);
    setSyncTargetAttackId(normalized.attacks[0]?.id ?? null);
    setSelectedChunkId(null);
    setManualReadingLens(null);
    setTakeHistory([]);
    recordedTakeRef.current = null;
    setCaptureState("idle");
    setReviewTakeEvents(null);
    setAttemptAfterId(newestEventId(eventsRef.current));
    setSettledThroughEventId(newestEventId(eventsRef.current));
    setCaptureNotice("Score ready. Play now for provisional live follow; start a review take when you want one pass frozen for diagnosis and repetition memory.");
    if (persist) {
      try {
        // Never let an older score reappear if the new score exceeds the tab's
        // storage quota. The in-memory import remains fully usable.
        window.sessionStorage.removeItem(SCORE_FLOW_STORAGE_KEY);
        window.sessionStorage.removeItem(SCORE_FLOW_HISTORY_STORAGE_KEY);
        window.sessionStorage.setItem(SCORE_FLOW_STORAGE_KEY, JSON.stringify({ version: 1, fileName: nextImported.fileName, xml }));
      }
      catch {
        try { window.sessionStorage.removeItem(SCORE_FLOW_STORAGE_KEY); window.sessionStorage.removeItem(SCORE_FLOW_HISTORY_STORAGE_KEY); } catch { /* The in-memory score remains usable. */ }
        setFileNotice(`${nextImported.measureCount} measures loaded in memory; this browser could not retain the upload after navigation.`);
      }
    }
    return normalized;
  }, [stopReference]);

  useEffect(() => {
    const task = window.setTimeout(() => {
      try {
        const raw = window.sessionStorage.getItem(SCORE_FLOW_STORAGE_KEY);
        if (!raw) { window.sessionStorage.removeItem(SCORE_FLOW_HISTORY_STORAGE_KEY); return; }
        const saved = JSON.parse(raw) as { version?: unknown; fileName?: unknown; xml?: unknown };
        if (saved.version !== 1 || typeof saved.fileName !== "string" || typeof saved.xml !== "string" || saved.xml.length > 16 * 1024 * 1024) {
          window.sessionStorage.removeItem(SCORE_FLOW_STORAGE_KEY);
          window.sessionStorage.removeItem(SCORE_FLOW_HISTORY_STORAGE_KEY);
          return;
        }
        const normalized = installScore(parseMusicXml(saved.xml, saved.fileName), saved.xml, false);
        let restoredHistory: SheetTakeEvidence[] = [];
        try {
          const historyRaw = window.sessionStorage.getItem(SCORE_FLOW_HISTORY_STORAGE_KEY);
          if (historyRaw) {
            if (historyRaw.length > 2 * 1024 * 1024) throw new RangeError("Saved repetition evidence is oversized.");
            const savedHistory = JSON.parse(historyRaw) as { version?: unknown; scoreId?: unknown; takes?: unknown };
            if (savedHistory.version !== 1 || savedHistory.scoreId !== normalized.id || !Array.isArray(savedHistory.takes) || savedHistory.takes.length > 32) throw new TypeError("Saved repetition evidence is malformed.");
            for (const take of savedHistory.takes) restoredHistory = appendBoundedSheetTakeHistory(restoredHistory, take as SheetTakeEvidence);
          }
        } catch {
          window.sessionStorage.removeItem(SCORE_FLOW_HISTORY_STORAGE_KEY);
          restoredHistory = [];
        }
        setTakeHistory(restoredHistory);
        setFileNotice(`Restored this tab’s on-device score${restoredHistory.length ? ` and ${restoredHistory.length} frozen take${restoredHistory.length === 1 ? "" : "s"}` : ""}. No file was uploaded to a server.`);
      } catch {
        try { window.sessionStorage.removeItem(SCORE_FLOW_STORAGE_KEY); window.sessionStorage.removeItem(SCORE_FLOW_HISTORY_STORAGE_KEY); } catch { /* Continue with an empty importer. */ }
      }
    }, 0);
    return () => window.clearTimeout(task);
  }, [installScore]);

  useEffect(() => {
    if (!score) return;
    const task = window.setTimeout(() => {
      try {
        if (!takeHistory.length) {
          window.sessionStorage.removeItem(SCORE_FLOW_HISTORY_STORAGE_KEY);
          return;
        }
        window.sessionStorage.setItem(SCORE_FLOW_HISTORY_STORAGE_KEY, JSON.stringify({ version: 1, scoreId: score.id, takes: takeHistory }));
      } catch {
        try { window.sessionStorage.removeItem(SCORE_FLOW_HISTORY_STORAGE_KEY); } catch { /* Current-view evidence remains usable. */ }
        setCaptureNotice("Repetition evidence remains available in this Score Flow view, but tab storage is unavailable.");
      }
    }, 0);
    return () => window.clearTimeout(task);
  }, [score, takeHistory]);

  const acceptFile = useCallback(async (file: File) => {
    setFileState("loading");
    setFileNotice(`Reading ${file.name} locally…`);
    try {
      const result = await importMusicXmlFile(file);
      installScore(result.score, result.xml, true);
    } catch (error) {
      setFileState("error");
      setFileNotice(error instanceof Error ? error.message : "This score could not be read.");
    }
  }, [installScore]);

  const onFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (file) void acceptFile(file);
  };

  const onDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setIsDragging(false);
    const file = event.dataTransfer.files?.[0];
    if (file) void acceptFile(file);
  };

  const acceptReferenceAudio = (file: File) => {
    const supportedExtension = /\.(mp3|wav|m4a|aac|ogg|oga|webm)$/i.test(file.name);
    if ((!file.type.startsWith("audio/") && !supportedExtension) || file.size <= 0) {
      setAudioNotice("Choose an MP3, WAV, M4A, AAC, OGG, or WebM audio recording.");
      return;
    }
    if (file.size > 512 * 1024 * 1024) {
      setAudioNotice("This recording is larger than the 512 MB browser-safe limit. Export a shorter practice reference.");
      return;
    }
    stopReference("Changing the local recording stopped the previous reference.");
    if (localAudioUrlRef.current) URL.revokeObjectURL(localAudioUrlRef.current);
    const url = URL.createObjectURL(file);
    localAudioUrlRef.current = url;
    setLocalReferenceAudio({ name: file.name, url, durationSeconds: null });
    setLocalAudioTime(0);
    const firstAttack = score?.attacks[0] ?? null;
    setMediaSyncAnchors(firstAttack ? [{ scoreBeat: firstAttack.onsetBeat, mediaTimeSeconds: 0 }] : []);
    setSyncTargetAttackId(firstAttack?.id ?? null);
    setReferenceSource("local");
    setReviewNotationRevealed(false);
    setAudioNotice(`${file.name} is local to this tab. Its first score landing is provisionally aligned to 0:00; scrub and set an anchor if the recording has an introduction.`);
  };

  const onReferenceAudioChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (file) acceptReferenceAudio(file);
  };

  const removeReferenceAudio = () => {
    stopReference("Local recording removed; synthesized score tones are ready.");
    if (localAudioUrlRef.current) URL.revokeObjectURL(localAudioUrlRef.current);
    localAudioUrlRef.current = null;
    setLocalReferenceAudio(null);
    setLocalAudioTime(0);
    setMediaSyncAnchors([]);
    setReferenceSource("synth");
  };

  const setRecordingAnchor = () => {
    if (!score || !localReferenceAudio || !syncTargetAttackId) return;
    const attack = score.attacks.find((candidate) => candidate.id === syncTargetAttackId);
    const element = localAudioElementRef.current;
    if (!attack || !element) return;
    try {
      const anchors = normalizeScoreMediaAnchors([
        ...mediaSyncAnchors.filter((anchor) => Math.abs(anchor.scoreBeat - attack.onsetBeat) > 1e-7),
        { scoreBeat: attack.onsetBeat, mediaTimeSeconds: element.currentTime },
      ], score.totalBeats);
      setMediaSyncAnchors(anchors);
      setAudioNotice(`Aligned landing ${score.attacks.indexOf(attack) + 1} in measure ${attack.measureNumber} to ${clockLabel(element.currentTime * 1_000)}. ${anchors.length > 1 ? "Multiple anchors now correct performed drift." : "Add a later anchor if the recording drifts from the encoded tempo."}`);
    } catch (error) {
      setAudioNotice(error instanceof Error ? error.message : "That sync point could not be added.");
    }
  };

  const nudgeRecordingAnchors = (deltaSeconds: number) => {
    if (!mediaSyncAnchors.length) return;
    const safeDelta = Math.max(deltaSeconds, -Math.min(...mediaSyncAnchors.map((anchor) => anchor.mediaTimeSeconds)));
    setMediaSyncAnchors((current) => current.map((anchor) => ({ ...anchor, mediaTimeSeconds: anchor.mediaTimeSeconds + safeDelta })));
    setAudioNotice(`Recording alignment nudged ${Math.round(Math.abs(safeDelta) * 1_000)} ms ${safeDelta < 0 ? "earlier" : "later"}.`);
  };

  const installSpotifyEmbed = () => {
    const target = spotifyEmbedTarget(spotifyInput);
    if (!target) {
      setSpotifyNotice("Use a full open.spotify.com link or Spotify content URI.");
      return;
    }
    stopReference("Spotify listening is independent from score timing.");
    setSpotifyTarget(target);
    setSpotifyInput(target.canonicalUrl);
    setReferenceSource("spotify");
    setSourceDrawerOpen(true);
    setReviewNotationRevealed(false);
    setSpotifyNotice("Spotify is embedded for independent reference listening. It does not move, reveal, or grade the score.");
  };

  const chooseReferenceSource = (source: ReferenceSource) => {
    if (source === referenceSource) return;
    stopReference("Reference source changed. MIDI input remains silent.");
    setReferenceSource(source);
    setSourceDrawerOpen(source !== "synth");
    setReviewNotationRevealed(false);
    setAudioNotice(source === "synth"
      ? "Score tones are ready for synchronized listening or play-along."
      : source === "local"
        ? localReferenceAudio ? "Local recording selected. Its media clock will drive the aligned score passage." : "Choose a local recording, then align at least one score landing."
        : "Spotify is listen-only here and never drives notation or performance evaluation.");
  };

  const loadDemo = () => {
    try { installScore(parseMusicXml(ORBIT_STUDY_MUSICXML, "orbit-study.musicxml"), ORBIT_STUDY_MUSICXML, true); }
    catch (error) { setFileState("error"); setFileNotice(error instanceof Error ? error.message : "The demo score could not be read."); }
  };

  const clearScore = () => {
    stopReference("Reference stopped. The local score was removed.");
    setImported(null); setScore(null); setFileState("empty"); setCaptureState("idle"); setReviewTakeEvents(null); setSelectedChunkId(null); setManualReadingLens(null); setTakeHistory([]); setMediaSyncAnchors([]); setSyncTargetAttackId(null); setReviewNotationRevealed(false);
    recordedTakeRef.current = null;
    setFileNotice("Score removed from this tab. Choose another MXL or MusicXML file.");
    try { window.sessionStorage.removeItem(SCORE_FLOW_STORAGE_KEY); window.sessionStorage.removeItem(SCORE_FLOW_HISTORY_STORAGE_KEY); } catch { /* The in-memory score is still cleared. */ }
  };

  const readingChunks = useMemo(() => score ? buildSheetMusicReadingChunks(score, {
    startMeasureIndex: loopStart,
    endMeasureIndex: loopEnd,
    hand: practiceHand,
    includeBoundaryTies: true,
    minAttacks: 2,
    maxAttacks: 6,
    targetAttacks: 4,
  }) : [], [loopEnd, loopStart, practiceHand, score]);
  const measureLoop = useMemo(() => score ? selectSheetMusicLoop(score, { startMeasureIndex: loopStart, endMeasureIndex: loopEnd, hand: practiceHand, includeBoundaryTies: true }) : null, [loopEnd, loopStart, practiceHand, score]);
  const selectedChunk = selectedChunkId ? readingChunks.find((chunk) => chunk.id === selectedChunkId) ?? null : null;
  const loop = useMemo(() => score ? selectSheetMusicLoop(score, {
    startMeasureIndex: loopStart,
    endMeasureIndex: loopEnd,
    hand: practiceHand,
    includeBoundaryTies: true,
    startAttackId: selectedChunk?.startAttackId,
    endAttackId: selectedChunk?.endAttackId,
  }) : null, [loopEnd, loopStart, practiceHand, score, selectedChunk?.endAttackId, selectedChunk?.startAttackId]);
  const liveTakeEvents = useMemo(() => capturedScoreEvents(
    events,
    attemptAfterId,
    referenceTimingClock ? referenceTimingClock.performanceTimeMs - 500 : Number.NEGATIVE_INFINITY,
  ), [attemptAfterId, events, referenceTimingClock]);
  const latestLiveEventId = Number(liveTakeEvents.at(-1)?.id ?? -1);
  // Study and armed states both follow the post-boundary stream. Only Review
  // substitutes its frozen copy; therefore playing never looks inert merely
  // because the learner did not discover an Arm button first.
  const takeEvents = useMemo(() => captureState === "review"
    ? reviewTakeEvents ?? []
    : liveTakeEvents, [captureState, liveTakeEvents, reviewTakeEvents]);
  const liveAttack = useMemo(() => clusterMidiPerformance(liveTakeEvents.slice(-32), clusterWindow).at(-1) ?? null, [clusterWindow, liveTakeEvents]);
  const synchronizedRevealActive = audioState === "playing" && referencePlayback.playAlong;
  const diagnosticReviewRevealed = reviewNotationRevealed && referencePlayback.intent === "practice" && captureState === "review";
  const scoreVeiled = !diagnosticReviewRevealed && (
    referencePlayback.notationLocked
    || readingMode === "ear"
    || readingMode === "memory"
  );
  const localTempoBeat = loop?.attacks[0]?.onsetBeat ?? loop?.startBeat ?? 0;
  const encodedLocalTempo = score?.tempoChanges.filter((change) => change.beat <= localTempoBeat + 1e-7).at(-1)?.bpm ?? score?.tempoBpm ?? 72;
  const practiceTempo = Math.max(20, Math.round(encodedLocalTempo * tempoPercent / 100));
  const evaluationState = useMemo(() => {
    if (!score) return { evaluation: null, error: null, paused: false };
    const targetCount = loop?.attacks.length ?? 0;
    if (captureState !== "review" && targetCount > MAX_LIVE_FEEDBACK_ATTACKS) return { evaluation: null, error: null, paused: true };
    try {
      if (targetCount * Math.max(1, takeEvents.length) > MAX_UI_ALIGNMENT_CELLS) throw new Error("This take and loop exceed the browser-safe comparison bound.");
      return {
        evaluation: evaluateSheetMusicPerformance(score, takeEvents, {
          startMeasureIndex: loopStart,
          endMeasureIndex: loopEnd,
          hand: practiceHand,
          includeBoundaryTies: true,
          startAttackId: referenceReviewRange?.startAttackId ?? selectedChunk?.startAttackId,
          endAttackId: referenceReviewRange?.endAttackId ?? selectedChunk?.endAttackId,
          clusterWindowMs: clusterWindow,
          arpeggioWindowMs: Math.min(500, Math.max(180, clusterWindow + 100)),
          timingToleranceMs: !referenceTimingClock && !referenceTimingMap && timingMode === "self-paced" ? 1_000_000_000 : undefined,
          durationToleranceMs: !referenceTimingClock && !referenceTimingMap && timingMode === "self-paced" ? 1_000_000_000 : undefined,
          tempoBpm: practiceTempo,
          timingClock: referenceTimingClock ?? undefined,
          timingMap: referenceTimingMap ?? undefined,
          finalize: captureState === "review",
        }),
        error: null,
        paused: false,
      };
    } catch (error) {
      return { evaluation: null, error: error instanceof Error ? error.message : "This take is too large to align safely.", paused: false };
    }
  }, [captureState, clusterWindow, loop?.attacks.length, loopEnd, loopStart, practiceHand, practiceTempo, referenceReviewRange?.endAttackId, referenceReviewRange?.startAttackId, referenceTimingClock, referenceTimingMap, score, selectedChunk?.endAttackId, selectedChunk?.startAttackId, takeEvents, timingMode]);
  const evaluation = evaluationState.evaluation;
  const evaluationError = evaluationState.error;
  const liveEvaluationPaused = evaluationState.paused;

  useEffect(() => {
    if (captureState === "review" || latestLiveEventId < 0 || latestLiveEventId <= settledThroughEventId) return;
    // Match the evaluator's non-transitive grouping: every chord window is
    // anchored to its first unsettled attack, not restarted by each new note.
    const unsettled = liveTakeEvents.filter((event) => Number(event.id) > settledThroughEventId);
    const anchor = unsettled[0];
    if (!anchor) return;
    const deadlineMs = anchor.onsetMs + clusterWindow;
    const delayMs = Math.max(0, deadlineMs - performance.now()) + 12;
    const task = window.setTimeout(() => {
      const throughId = unsettled
        .filter((event) => event.onsetMs <= deadlineMs + 0.001)
        .reduce((latest, event) => Math.max(latest, Number(event.id)), Number(anchor.id));
      setSettledThroughEventId((current) => Math.max(current, throughId));
    }, delayMs);
    return () => window.clearTimeout(task);
  }, [captureState, clusterWindow, latestLiveEventId, liveTakeEvents, settledThroughEventId]);

  useEffect(() => {
    const newest = newestEventId(events);
    if (newest >= attemptAfterId) return;
    const task = window.setTimeout(() => {
      setAttemptAfterId(newest);
      setSettledThroughEventId(newest);
      setCaptureState("idle");
      setReviewTakeEvents(null);
      setCaptureNotice("The shared piano trace was cleared. Arm a fresh score take when ready.");
    }, 0);
    return () => window.clearTimeout(task);
  }, [attemptAfterId, events]);

  useEffect(() => {
    if (captureState !== "armed" || !takeEvents.length || !evaluation?.complete || pressedNotes.length || (audioState === "playing" && referencePlayback.playAlong)) return;
    const task = window.setTimeout(() => {
      setReviewTakeEvents(takeEvents.map((event) => ({ ...event })));
      setCaptureState("review");
      setCaptureNotice("The selected loop has enough landings to review. Evidence is frozen at this attempt boundary.");
    }, 420);
    return () => window.clearTimeout(task);
  }, [audioState, captureState, evaluation?.complete, pressedNotes.length, referencePlayback.playAlong, takeEvents]);

  useEffect(() => {
    if (captureState !== "idle" || !takeEvents.length || !evaluation?.complete || pressedNotes.length || latestLiveEventId < 0) return;
    // Live follow is deliberately repeatable. Leave the final receipt visible
    // briefly, then put the cursor back at landing one without storing a take.
    const completedBoundaryId = latestLiveEventId;
    const task = window.setTimeout(() => {
      setAttemptAfterId(completedBoundaryId);
      setSettledThroughEventId(completedBoundaryId);
      setCaptureNotice("Live follow restarted at landing one. Start a review take whenever you want the next pass frozen and retained.");
    }, 1_050);
    return () => window.clearTimeout(task);
  }, [captureState, evaluation?.complete, latestLiveEventId, pressedNotes.length, takeEvents.length]);

  useEffect(() => {
    if (captureState !== "review" || !score || !evaluation?.complete || !reviewTakeEvents?.length) return;
    const firstId = String(reviewTakeEvents[0].id ?? "first");
    const lastId = String(reviewTakeEvents.at(-1)?.id ?? "last");
    const takeBoundaryKey = `${score.id}:${practiceHand}:${attemptAfterId}:${firstId}:${lastId}`;
    if (recordedTakeRef.current === takeBoundaryKey) return;
    const finishedAt = Date.now();
    const takeId = `${takeBoundaryKey}:${finishedAt}`;
    // Persist an epoch timestamp rather than the page-relative MIDI clock, so
    // restored evidence still sorts correctly after performance.now() resets.
    try {
      const evidence = sheetTakeEvidenceFromEvaluation(evaluation, {
        scoreId: score.id,
        takeId,
        finishedAt,
        hand: practiceHand,
        clockEvidence: referenceTimingMap ? "synced-recording" : referenceTimingClock || timingMode === "pulse" ? "fixed-pulse" : "unscored",
      });
      const task = window.setTimeout(() => {
        if (recordedTakeRef.current === takeBoundaryKey) return;
        recordedTakeRef.current = takeBoundaryKey;
        setTakeHistory((current) => appendBoundedSheetTakeHistory(current, evidence));
      }, 0);
      return () => window.clearTimeout(task);
    } catch {
      // An incomplete/oversized take remains reviewable even when it is not
      // eligible for the deliberately bounded repetition memory.
    }
  }, [attemptAfterId, captureState, evaluation, practiceHand, referenceTimingClock, referenceTimingMap, reviewTakeEvents, score, timingMode]);

  const armTake = () => {
    if (!score || !loop?.attacks.length) return;
    if (activeNotes.length) {
      setCaptureNotice("Release every held or sustained key before arming. This keeps the first score boundary unambiguous.");
      return;
    }
    stopReference("Silent review take ready. Synthesized reference is off.");
    setReferenceReviewRange(null);
    if (frozen) onResumeCapture();
    setAttemptAfterId(newestEventId(events));
    setSettledThroughEventId(newestEventId(events));
    setReviewTakeEvents(null);
    setCaptureState("armed");
    setCaptureNotice((loop?.attacks.length ?? 0) > MAX_LIVE_FEEDBACK_ATTACKS
      ? `Long take armed. To protect the browser, live alignment pauses above ${MAX_LIVE_FEEDBACK_ATTACKS} written landings; play the loop, then choose Stop + diagnose for one frozen evaluation.`
      : "Review take started. The first new MIDI or on-screen attack becomes its boundary; live feedback stays provisional until the take freezes. MIDI remains silent.");
  };

  const reviewTake = () => {
    if (!takeEvents.length) { setCaptureNotice("No new landings have crossed this take boundary yet."); return; }
    if (audioState === "playing") stopReference("Play + compare stopped at this review boundary.", true);
    setReviewTakeEvents(takeEvents.map((event) => ({ ...event })));
    setCaptureState("review");
    setCaptureNotice(pressedNotes.length
      ? `Take stopped while ${pressedNotes.length} key${pressedNotes.length === 1 ? " was" : "s were"} still pressed; those unfinished key-up lengths remain unscored.`
      : "Take stopped. The HUD now separates pitch, interval, chord, pulse, and release evidence.");
  };

  const resetTake = useCallback((notice = "Take cleared. Live follow is ready at the new boundary; start a review take only when you want to retain one pass.") => {
    stopReference("Reference stopped for the new practice boundary. MIDI remains silent.");
    setReviewNotationRevealed(false);
    setReferenceReviewRange(null);
    setAttemptAfterId(newestEventId(events));
    setSettledThroughEventId(newestEventId(events));
    setReviewTakeEvents(null);
    setCaptureState("idle");
    setCaptureNotice(notice);
  }, [events, stopReference]);

  const changeLoop = (start: number, end: number) => {
    if (!score) return;
    const nextStart = Math.max(0, Math.min(score.measures.length - 1, start));
    const nextEnd = Math.max(nextStart, Math.min(score.measures.length - 1, end));
    setLoopStart(nextStart); setLoopEnd(nextEnd); setSelectedChunkId(null); setManualReadingLens(null); resetTake(`Loop moved to measures ${score.measures[nextStart].number}–${score.measures[nextEnd].number}.`);
  };

  const selectPracticeChunk = (chunk: SheetReadingChunk) => {
    setSelectedChunkId(chunk.id);
    setManualReadingLens(null);
    resetTake(`Chunk ${chunk.ordinal + 1} selected: ${chunk.attackCount} exact landings across measure${chunk.measureNumbers.length === 1 ? "" : "s"} ${chunk.measureNumbers.join("–")}. Surrounding notes will not be counted as misses.`);
  };

  const clearPracticeChunk = () => {
    if (!selectedChunkId) return;
    setSelectedChunkId(null);
    setManualReadingLens(null);
    resetTake(`Returned to the full measure loop: measures ${score?.measures[loopStart].number ?? ""}–${score?.measures[loopEnd].number ?? ""}.`);
  };

  const installRepairLoop = () => {
    if (!score || !evaluation) return;
    const repair = repairLoopAroundFirstDivergence(score, evaluation, 1);
    if (!repair || repair.startMeasureIndex == null || repair.endMeasureIndex == null) return;
    setLoopStart(repair.startMeasureIndex); setLoopEnd(repair.endMeasureIndex); setPracticeHand(repair.hand ?? "both"); setSelectedChunkId(null); setManualReadingLens(null);
    resetTake(`Repair loop narrowed around the first divergence: measures ${score.measures[repair.startMeasureIndex].number}–${score.measures[repair.endMeasureIndex].number}.`);
  };

  const evaluatedCurrentIndex = captureState === "review"
    ? evaluation?.firstDivergence?.expectedIndex ?? evaluation?.progress.nextExpectedIndex ?? loop?.attacks.length ?? 0
    : evaluation?.progress.nextExpectedIndex ?? (evaluation?.complete ? loop?.attacks.length ?? 0 : 0);
  const arrivalWindowOpen = captureState !== "review" && latestLiveEventId > settledThroughEventId;
  const gatheringComparison = arrivalWindowOpen && evaluatedCurrentIndex > 0
    ? evaluation?.comparisons[evaluatedCurrentIndex - 1] ?? null
    : null;
  const gatheringPreviousChord = Boolean(gatheringComparison
    && gatheringComparison.expected.midiNotes.length > 1
    && gatheringComparison.status === "incorrect"
    && gatheringComparison.missingNotes.length
    && !gatheringComparison.extraNotes.length
    && !evaluation?.extraClusters.length);
  const currentIndex = gatheringPreviousChord ? evaluatedCurrentIndex - 1 : evaluatedCurrentIndex;
  const nextAttack = loop?.attacks[currentIndex] ?? null;
  const liveAttackEventIds = useMemo(() => new Set((liveAttack?.events ?? []).map((event) => String(event.id))), [liveAttack]);
  const liveAttackComparison = useMemo(() => evaluation?.comparisons.findLast((comparison) => comparison.actual?.events.some((event) => liveAttackEventIds.has(String(event.id)))) ?? null, [evaluation?.comparisons, liveAttackEventIds]);
  const contextAttack = nextAttack ?? loop?.attacks.at(-1) ?? null;
  const baseAttackIndexById = useMemo(() => new Map((measureLoop?.attacks ?? []).map((attack, index) => [attack.id, index])), [measureLoop]);
  const baseCurrentIndex = nextAttack
    ? baseAttackIndexById.get(nextAttack.id) ?? 0
    : selectedChunk
      ? selectedChunk.endAttackIndex
      : measureLoop?.attacks.length ?? 0;
  const referenceAttack = referencePlayback.cursorIndex == null
    ? referencePlayback.phase === "count-in" ? loop?.attacks[0] ?? null : null
    : loop?.attacks[referencePlayback.cursorIndex] ?? null;
  const journeyCurrentIndex = (referencePlayback.phase === "count-in" || referencePlayback.phase === "playing") && referenceAttack
    ? baseAttackIndexById.get(referenceAttack.id) ?? baseCurrentIndex
    : baseCurrentIndex;
  const priorComparison = evaluation?.comparisons.slice(0, currentIndex).findLast((comparison) => comparison.actual != null) ?? null;
  const priorAttack = currentIndex > 0 ? loop?.attacks[currentIndex - 1] ?? null : null;
  const previousNotes = priorComparison?.actualNotes ?? priorAttack?.midiNotes ?? [];
  const previousByHand = notesByHand(priorComparison, priorAttack);
  const currentMeasureIndex = contextAttack?.measureIndex ?? loopEnd;
  const prefer = (imported?.measures[currentMeasureIndex]?.keyFifths ?? score?.keyFifths ?? 0) > 0 ? "sharps" as const : "flats" as const;
  const notationById = useMemo(() => new Map((imported?.notes ?? []).map((note) => [note.id, note])), [imported]);
  const visibleComparisons = useMemo(() => {
    if (scoreVeiled) return [];
    const comparisons = evaluation?.comparisons ?? [];
    return gatheringPreviousChord ? comparisons.filter((comparison) => comparison.expectedIndex !== currentIndex) : comparisons;
  }, [currentIndex, evaluation?.comparisons, gatheringPreviousChord, scoreVeiled]);
  const journeyComparisons = useMemo(() => visibleComparisons.flatMap((comparison) => {
    const baseIndex = baseAttackIndexById.get(comparison.expected.id);
    return baseIndex == null ? [] : [{ ...comparison, expectedIndex: baseIndex }];
  }), [baseAttackIndexById, visibleComparisons]);
  const chunkProgress = useMemo(() => summarizeSheetReadingChunkProgress(readingChunks, journeyComparisons), [journeyComparisons, readingChunks]);
  const baseCurrentChunk = selectedChunk
    ?? readingChunks.find((chunk) => baseCurrentIndex >= chunk.startAttackIndex && baseCurrentIndex <= chunk.endAttackIndex)
    ?? (baseCurrentIndex >= (measureLoop?.attacks.length ?? 0) ? readingChunks.at(-1) : readingChunks[0])
    ?? null;
  const currentChunk = useMemo(() => {
    if (!baseCurrentChunk || !measureLoop || !loop) return null;
    const activeIndexById = new Map(loop.attacks.map((attack, index) => [attack.id, index]));
    const localIndexes = baseCurrentChunk.attackIndexes.flatMap((baseIndex) => {
      const attack = measureLoop.attacks[baseIndex];
      const localIndex = attack ? activeIndexById.get(attack.id) : undefined;
      return localIndex == null ? [] : [localIndex];
    });
    if (!localIndexes.length) return null;
    return { ...baseCurrentChunk, attackIndexes: localIndexes, startAttackIndex: localIndexes[0], endAttackIndex: localIndexes.at(-1)! };
  }, [baseCurrentChunk, loop, measureLoop]);
  const currentChunkProgress = baseCurrentChunk ? chunkProgress.find((progress) => progress.chunkId === baseCurrentChunk.id) ?? null : null;
  const chunkMemoryById = useMemo(() => {
    const memory = new Map<string, SheetChunkMemory>();
    if (!score || !measureLoop) return memory;
    for (const chunk of readingChunks) {
      const landingIds = chunk.attackIndexes.map((index) => measureLoop.attacks[index]?.id).filter((id): id is string => Boolean(id));
      if (!landingIds.length) continue;
      try { memory.set(chunk.id, summarizeSheetChunkMemory(landingIds, takeHistory, { scoreId: score.id, hand: practiceHand })); }
      catch { /* Oversized identifiers disable repetition memory, not score practice. */ }
    }
    return memory;
  }, [measureLoop, practiceHand, readingChunks, score, takeHistory]);
  const currentChunkMemory = baseCurrentChunk ? chunkMemoryById.get(baseCurrentChunk.id) ?? null : null;
  const comparisonsByExpectedIndex = useMemo(() => new Map(visibleComparisons.map((comparison) => [comparison.expectedIndex, comparison])), [visibleComparisons]);
  const referenceComparisonsByAttackId = useMemo(() => new Map((evaluation?.comparisons ?? []).map((comparison) => [comparison.expected.id, comparison])), [evaluation?.comparisons]);
  const journeyComparisonsByExpectedIndex = useMemo(() => new Map(journeyComparisons.map((comparison) => [comparison.expectedIndex, comparison])), [journeyComparisons]);
  const comparisonsByMeasureIndex = useMemo(() => {
    const grouped = new Map<number, SheetEventComparison[]>();
    for (const comparison of visibleComparisons) {
      const measureComparisons = grouped.get(comparison.expected.measureIndex) ?? [];
      measureComparisons.push(comparison);
      grouped.set(comparison.expected.measureIndex, measureComparisons);
    }
    return grouped;
  }, [visibleComparisons]);
  const localMeasureContext = imported?.measures[currentMeasureIndex] ?? null;
  const localCollectionAttacks = useMemo(() => {
    if (!baseCurrentChunk || !measureLoop || !imported) return [];
    const position = readingChunks.findIndex((chunk) => chunk.id === baseCurrentChunk.id);
    const indexes = readingChunks.slice(Math.max(0, position - 1), position + 2).flatMap((chunk) => chunk.attackIndexes);
    return indexes
      .map((index) => measureLoop.attacks[index])
      .filter((attack): attack is SheetMusicPracticeAttack => Boolean(attack))
      .filter((attack) => {
        const measure = imported.measures[attack.measureIndex];
        return measure?.keyFifths === localMeasureContext?.keyFifths && measure?.keyMode === localMeasureContext?.keyMode;
      });
  }, [baseCurrentChunk, imported, localMeasureContext?.keyFifths, localMeasureContext?.keyMode, measureLoop, readingChunks]);
  const localCollection = useMemo(() => analyzeLocalPitchCollections(
    localCollectionAttacks,
    { keyFifths: localMeasureContext?.keyFifths ?? null, keyMode: localMeasureContext?.keyMode ?? null, maxCandidates: 3 },
  ), [localCollectionAttacks, localMeasureContext?.keyFifths, localMeasureContext?.keyMode]);

  const playReference = useCallback(async (voice: ReferenceVoice = "full", playAlong = voice === "full") => {
    if (!score || !loop?.attacks.length) return;
    if (playAlong && activeNotes.length) {
      setAudioNotice("Release held or sustained keys before Play + compare so the first hand boundary is unambiguous.");
      return;
    }
    const intent: ReferenceIntent = playAlong ? "practice" : voice === "full" ? "listen" : "preview";
    const notationLocked = intent === "listen" || readingMode === "ear";
    setReviewNotationRevealed(false);
    setReferenceTimingMap(null);
    stopReference("Preparing the score-tone reference…", !playAlong, false, !playAlong);
    const AudioContextConstructor = window.AudioContext || (window as AudioContextWindow).webkitAudioContext;
    if (!AudioContextConstructor) {
      setAudioState("unavailable");
      setReferencePlayback({ ...EMPTY_REFERENCE_VIEW, phase: "unavailable" });
      setAudioNotice("Reference audio is unavailable here. The silent score coach still works.");
      return;
    }
    const token = audioTokenRef.current + 1;
    audioTokenRef.current = token;
    const afterId = newestEventId(eventsRef.current);
    if (playAlong) {
      if (frozen) onResumeCapture();
      setReferenceReviewRange(null);
      setAttemptAfterId(afterId);
      setSettledThroughEventId(afterId);
      setReviewTakeEvents(null);
      setCaptureState("armed");
      setCaptureNotice("Play + compare is ready. Wait through the count-in, then place each silent MIDI attack against the score-tone reference.");
    }
    let context: AudioContext | null = null;
    let master: GainNode | null = null;
    try {
      const restartFromBeginning = currentIndex >= loop.attacks.length;
      const startIndex = playAlong || intent === "listen" || restartFromBeginning ? 0 : Math.max(0, currentIndex);
      const plan: SheetReferencePlan = buildScoreReferencePlan(loop, {
        startIndex,
        tempoBpm: practiceTempo,
        maxLandings: playAlong ? 96 : 24,
        maxDurationMs: playAlong ? 30_000 : 14_000,
        noteDurationScale: 1,
        maxNoteDurationMs: 30_000,
      });
      if (!plan.cues.length) throw new Error("No playable reference cue is available in this loop.");
      let denseFieldClipped = false;
      let scheduledVoiceCount = 0;
      const playbackCues: SheetReferencePlan["cues"] = [];
      for (const cue of plan.cues) {
        const available = cue.notes;
        const notes = voice === "upper"
          ? [...available].sort((first, second) => second.midi - first.midi).slice(0, 1).map((note) => ({ ...note, durationMs: note.durationMs + note.onsetOffsetMs, onsetOffsetMs: 0 }))
          : voice === "bass"
            ? [...available].sort((first, second) => first.midi - second.midi).slice(0, 1).map((note) => ({ ...note, durationMs: note.durationMs + note.onsetOffsetMs, onsetOffsetMs: 0 }))
            : available.slice(0, 12);
        if (voice === "full" && available.length > notes.length) denseFieldClipped = true;
        if (playbackCues.length && scheduledVoiceCount + notes.length > MAX_REFERENCE_VOICES) break;
        scheduledVoiceCount += notes.length;
        playbackCues.push({
          ...cue,
          notes,
          endMs: cue.onsetMs + Math.max(80, ...notes.map((note) => note.onsetOffsetMs + note.durationMs + 80)),
        });
      }
      const playbackPlan: SheetReferencePlan = {
        ...plan,
        cues: playbackCues,
        totalDurationMs: Math.max(...playbackCues.map((cue) => cue.endMs)),
        truncated: plan.truncated || playbackCues.length < plan.cues.length,
      };
      context = new AudioContextConstructor({ latencyHint: "interactive" });
      audioContextRef.current = context;
      await context.resume();
      if (audioTokenRef.current !== token || audioContextRef.current !== context) { stopAudioContext(context, null); return; }
      const now = context.currentTime;
      const compressor = context.createDynamicsCompressor();
      configureSafetyCompressor(compressor, now);
      master = context.createGain();
      audioMasterRef.current = master;
      master.gain.setValueAtTime(referenceLevelGain(referenceVolume), now);
      // Trim before the safety compressor. The previous reversed order compressed
      // a full-scale oscillator and then attenuated it again, making Score Flow
      // substantially quieter than the other listening labs.
      master.connect(compressor).connect(context.destination);

      const secondsPerBeat = 60 / practiceTempo;
      const countIn = playAlong ? playAlongCountIn(loop, score) : { measureBeats: 0, pulseOffsetsBeats: [] as number[] };
      const countInDuration = countIn.measureBeats * secondsPerBeat;
      const audioStart = now + 0.12 + countInDuration;
      const firstPerformanceMs = audioTimeToPerformanceMs(context, audioStart);
      const earliestOnsetMs = firstPerformanceMs - 500;
      const latestOnsetMs = firstPerformanceMs + playbackPlan.totalDurationMs;
      referenceSessionRef.current = {
        afterId,
        earliestOnsetMs,
        latestOnsetMs,
        playAlong,
        startAttackId: playbackPlan.cues[0].attackId,
        heardEndAttackId: null,
      };
      if (playAlong) setReferenceTimingClock({ scoreBeat: playbackPlan.cues[0].scoreBeat, performanceTimeMs: firstPerformanceMs });

      countIn.pulseOffsetsBeats.forEach((beatOffset, pulseIndex) => {
        const start = now + 0.12 + beatOffset * secondsPerBeat;
        const oscillator = context!.createOscillator();
        const envelope = context!.createGain();
        oscillator.type = "sine";
        oscillator.frequency.setValueAtTime(pulseIndex === 0 ? 1_320 : 880, start);
        envelope.gain.setValueAtTime(0.0001, start);
        envelope.gain.exponentialRampToValueAtTime(pulseIndex === 0 ? 0.62 : 0.42, start + 0.004);
        envelope.gain.exponentialRampToValueAtTime(0.0001, start + 0.055);
        oscillator.connect(envelope).connect(master!);
        oscillator.start(start);
        oscillator.stop(start + 0.065);
      });

      let latestStop = audioStart + 0.1;
      for (const cue of playbackPlan.cues) {
        const voiceGain = 0.72 / Math.sqrt(Math.max(1, cue.notes.length));
        for (const note of cue.notes) {
          const start = audioStart + (cue.onsetMs + note.onsetOffsetMs) / 1_000;
          const duration = note.durationMs / 1_000;
          const oscillator = context.createOscillator();
          const envelope = context.createGain();
          oscillator.type = "triangle";
          oscillator.frequency.setValueAtTime(frequencyFromMidi(note.midi), start);
          envelope.gain.setValueAtTime(0.0001, start);
          envelope.gain.exponentialRampToValueAtTime(voiceGain, start + 0.014);
          envelope.gain.setValueAtTime(voiceGain, start + Math.max(0.035, duration - 0.075));
          envelope.gain.exponentialRampToValueAtTime(0.0001, start + duration);
          oscillator.connect(envelope).connect(master);
          oscillator.start(start);
          oscillator.stop(start + duration + 0.035);
          latestStop = Math.max(latestStop, start + duration + 0.09);
        }
      }

      setAudioState("playing");
      setReferencePlayback({
        phase: playAlong ? "count-in" : "playing",
        voice,
        playAlong,
        source: "synth",
        intent,
        notationLocked,
        startIndex: playbackPlan.cues[0].expectedIndex,
        currentIndex: null,
        cursorIndex: playbackPlan.cues[0].expectedIndex,
        memoryRevealIndex: null,
        soundingIndex: null,
        sounding: false,
        cueCount: playbackPlan.cues.length,
        progress: 0,
        elapsedMs: 0,
        durationMs: playbackPlan.totalDurationMs,
        countdown: playAlong ? countIn.pulseOffsetsBeats.length : null,
        truncated: playbackPlan.truncated,
      });
      const voiceLabel = voice === "upper" ? "upper path" : voice === "bass" ? "bass route" : "full score field";
      const densityNotice = denseFieldClipped ? " Written fields above 12 tones are transparently capped for safe reference synthesis." : "";
      const durationNotice = playbackPlan.cues.length < plan.cues.length ? ` Playback is capped at ${MAX_REFERENCE_VOICES} scheduled tones for browser stability; choose a shorter chunk for the full phrase.` : "";
      setAudioNotice(playAlong
        ? `Count-in started. The ${voiceLabel}, staff playhead, and MIDI timing share one ${practiceTempo} BPM clock. ${notationLocked ? "Pitch and note count remain locked until you choose Reveal." : "Disclosure follows the selected staff cue."} Reference level is ${referenceVolume}%. MIDI input itself remains silent.${densityNotice}${durationNotice}`
        : intent === "listen"
          ? `Listening to the ${voiceLabel} at ${practiceTempo} BPM. Notation stays locked before, during, and after this pass.${densityNotice}${durationNotice}`
          : `Previewing the ${voiceLabel} from the learner cursor at ${practiceTempo} BPM. MIDI input remains silent.${densityNotice}${durationNotice}`);

      visualUpdateMsRef.current = 0;
      const pulseMs = countIn.pulseOffsetsBeats.length ? countInDuration * 1_000 / countIn.pulseOffsetsBeats.length : 0;
      const updateVisual = () => {
        if (audioTokenRef.current !== token) return;
        // Use the same performance clock as Web MIDI and the audio timestamp.
        // A requestAnimationFrame timestamp can come from a document timeline
        // with a different origin after a restored/navigation session.
        const visualNow = performance.now();
        if (visualNow - visualUpdateMsRef.current >= 45) {
          visualUpdateMsRef.current = visualNow;
          const elapsedMs = visualNow - firstPerformanceMs;
          if (elapsedMs < 0) {
            setReferencePlayback((current) => ({
              ...current,
              phase: playAlong ? "count-in" : "playing",
              currentIndex: null,
              cursorIndex: playbackPlan.cues[0].expectedIndex,
              memoryRevealIndex: null,
              soundingIndex: null,
              sounding: false,
              progress: 0,
              elapsedMs: 0,
              durationMs: playbackPlan.totalDurationMs,
              countdown: playAlong ? Math.max(1, Math.min(countIn.pulseOffsetsBeats.length, Math.ceil(-elapsedMs / Math.max(1, pulseMs)))) : null,
            }));
          } else {
            const audibleElapsed = Math.max(0, elapsedMs);
            const frame = scoreReferenceFrameAt(playbackPlan, audibleElapsed + 8);
            const cursorCue = playbackPlan.cues.find((candidate) => candidate.expectedIndex === frame.cursorIndex) ?? playbackPlan.cues[0];
            const memoryRevealIndex = audibleElapsed + 8 >= cursorCue.onsetMs && audibleElapsed - cursorCue.onsetMs < 1_450
              ? cursorCue.expectedIndex
              : null;
            if (referenceSessionRef.current) referenceSessionRef.current.heardEndAttackId = cursorCue.attackId;
            setReferencePlayback((current) => ({
              ...current,
              phase: "playing",
              currentIndex: frame.cursorIndex,
              cursorIndex: frame.cursorIndex,
              memoryRevealIndex,
              soundingIndex: frame.soundingIndex,
              sounding: frame.soundingIndex != null,
              progress: Math.max(0, Math.min(1, audibleElapsed / Math.max(1, playbackPlan.totalDurationMs))),
              elapsedMs: Math.min(playbackPlan.totalDurationMs, audibleElapsed),
              durationMs: playbackPlan.totalDurationMs,
              countdown: null,
            }));
          }
        }
        audioFrameRef.current = window.requestAnimationFrame(updateVisual);
      };
      audioFrameRef.current = window.requestAnimationFrame(updateVisual);

      audioTimerRef.current = window.setTimeout(() => {
        if (audioTokenRef.current !== token) return;
        if (audioFrameRef.current != null) window.cancelAnimationFrame(audioFrameRef.current);
        audioFrameRef.current = null;
        if (context?.state !== "closed") void context?.close();
        audioContextRef.current = null;
        audioMasterRef.current = null;
        audioTimerRef.current = null;
        referenceSessionRef.current = null;
        setAudioState("idle");
        setReferencePlayback({
          phase: "complete",
          voice,
          playAlong,
          source: "synth",
          intent,
          notationLocked,
          startIndex: playbackPlan.cues[0].expectedIndex,
          currentIndex: null,
          cursorIndex: playbackPlan.cues.at(-1)?.expectedIndex ?? null,
          memoryRevealIndex: null,
          soundingIndex: null,
          sounding: false,
          cueCount: playbackPlan.cues.length,
          progress: 1,
          elapsedMs: playbackPlan.totalDurationMs,
          durationMs: playbackPlan.totalDurationMs,
          countdown: null,
          truncated: playbackPlan.truncated,
        });
        if (playAlong) {
          const captured = capturedScoreEvents(eventsRef.current, afterId, earliestOnsetMs, latestOnsetMs);
          setReferenceReviewRange({ startAttackId: playbackPlan.cues[0].attackId, endAttackId: playbackPlan.cues.at(-1)!.attackId });
          setReviewTakeEvents(captured);
          setCaptureState("review");
          setCaptureNotice(captured.length
            ? "The audible reference ended. Your synchronized take is frozen: inspect successes, misses, semitone correction, and pulse distance."
            : "The audible reference ended without a MIDI attack. The written landings are frozen as misses so the starting point remains visible.");
          setAudioNotice(`Play + compare finished at ${practiceTempo} BPM. The heard score and your silent MIDI take now share one review timeline${playbackPlan.truncated ? "; select a shorter chunk for an untruncated pass" : ""}.`);
        } else {
          setAudioNotice(intent === "listen"
            ? "Listening pass finished without revealing or grading notes. Listen again, play against it, or reveal the heard passage when ready."
            : `The ${voiceLabel} preview finished. Sing or imagine it once, then locate it inside the full score field.`);
        }
      }, Math.max(220, (latestStop - now) * 1_000));
    } catch {
      const cancelled = audioTokenRef.current !== token || (context != null && audioContextRef.current !== context);
      stopAudioContext(context, master);
      if (audioContextRef.current === context) audioContextRef.current = null;
      if (audioMasterRef.current === master) audioMasterRef.current = null;
      if (cancelled) return;
      referenceSessionRef.current = null;
      setAudioState("unavailable");
      setReferencePlayback({ ...EMPTY_REFERENCE_VIEW, phase: "unavailable", voice, playAlong });
      if (playAlong) setCaptureState("idle");
      setReferenceTimingClock(null);
      setAudioNotice("Reference playback could not start. Check site audio permission; score and MIDI visualization remain available.");
    }
  }, [activeNotes.length, currentIndex, frozen, loop, onResumeCapture, practiceTempo, readingMode, referenceVolume, score, stopReference]);

  const playLocalReference = useCallback(async (playAlong: boolean) => {
    const element = localAudioElementRef.current;
    if (!score || !loop?.attacks.length || !localReferenceAudio || !element) return;
    if (!mediaSyncAnchors.length) {
      setAudioNotice("Align at least one score landing to the recording before synchronized playback.");
      return;
    }
    if (playAlong && activeNotes.length) {
      setAudioNotice("Release held or sustained keys before Play + compare so the first hand boundary is unambiguous.");
      return;
    }
    setReviewNotationRevealed(false);
    stopReference("Preparing the local recording…", false, false, false);
    const token = audioTokenRef.current + 1;
    audioTokenRef.current = token;
    const afterId = newestEventId(eventsRef.current);
    if (playAlong) {
      if (frozen) onResumeCapture();
      setReferenceReviewRange(null);
      setAttemptAfterId(afterId);
      setSettledThroughEventId(afterId);
      setReviewTakeEvents(null);
      setCaptureState("armed");
      setCaptureNotice("Recording-linked take armed. Play against the local audio; its media clock drives attack timing while MIDI remains silent.");
    }
    try {
      const rawPlan = buildScoreMediaReferencePlan(score, loop, mediaSyncAnchors, {
        startIndex: 0,
        maxLandings: MAX_LIVE_FEEDBACK_ATTACKS,
        maxDurationMs: 180_000,
        maxNoteDurationMs: 30_000,
      });
      if (!rawPlan.cues.length) throw new Error("No recording-linked cue is available in this loop.");
      const mediaStartSeconds = scoreBeatToMediaSeconds(score, mediaSyncAnchors, rawPlan.cues[0].scoreBeat);
      if (mediaStartSeconds == null || mediaStartSeconds < 0 || !Number.isFinite(mediaStartSeconds)) throw new Error("The loop start does not have a usable recording time.");
      const mediaDurationSeconds = Number.isFinite(element.duration) ? element.duration : localReferenceAudio.durationSeconds;
      if (mediaDurationSeconds != null && mediaStartSeconds >= mediaDurationSeconds) throw new Error("The loop begins after this recording ends. Adjust the sync anchor.");
      const availableDurationMs = mediaDurationSeconds == null ? rawPlan.totalDurationMs : Math.max(0, (mediaDurationSeconds - mediaStartSeconds) * 1_000);
      const playbackCues = rawPlan.cues.filter((cue) => cue.onsetMs <= availableDurationMs + 1);
      if (!playbackCues.length) throw new Error("No score landing falls inside the available recording span.");
      const playbackPlan: SheetReferencePlan = {
        ...rawPlan,
        cues: playbackCues,
        totalDurationMs: Math.min(rawPlan.totalDurationMs, availableDurationMs),
        truncated: rawPlan.truncated || playbackCues.length < rawPlan.cues.length || availableDurationMs + 1 < rawPlan.totalDurationMs,
      };
      element.pause();
      element.volume = mediaLevel(referenceVolume);
      element.currentTime = mediaStartSeconds;
      await element.play();
      if (audioTokenRef.current !== token) { element.pause(); return; }
      const firstPerformanceMs = performance.now() - Math.max(0, element.currentTime - mediaStartSeconds) * 1_000;
      const earliestOnsetMs = firstPerformanceMs - 500;
      const latestOnsetMs = firstPerformanceMs + playbackPlan.totalDurationMs;
      const timingScoreBeats = new Set<number>();
      playbackPlan.cues.forEach((cue) => {
        timingScoreBeats.add(cue.scoreBeat);
        const attack = loop.attacks[cue.expectedIndex];
        attack?.notes.forEach((note) => timingScoreBeats.add(Math.min(loop.endBeat, note.onsetBeat + note.soundingDurationBeats)));
      });
      const timingMap = [...timingScoreBeats]
        .sort((first, second) => first - second)
        .map((scoreBeat) => {
          const mediaSeconds = scoreBeatToMediaSeconds(score, mediaSyncAnchors, scoreBeat);
          return mediaSeconds == null ? null : {
            scoreBeat,
            performanceTimeMs: firstPerformanceMs + (mediaSeconds - mediaStartSeconds) * 1_000,
          };
        })
        .filter((point): point is { scoreBeat: number; performanceTimeMs: number } => point != null
          && point.performanceTimeMs >= firstPerformanceMs - 1
          && point.performanceTimeMs <= firstPerformanceMs + playbackPlan.totalDurationMs + 1);
      referenceSessionRef.current = {
        afterId,
        earliestOnsetMs,
        latestOnsetMs,
        playAlong,
        startAttackId: playbackPlan.cues[0].attackId,
        heardEndAttackId: null,
      };
      if (playAlong) {
        setReferenceTimingClock({ scoreBeat: playbackPlan.cues[0].scoreBeat, performanceTimeMs: firstPerformanceMs });
        setReferenceTimingMap(timingMap);
      } else {
        setReferenceTimingClock(null);
        setReferenceTimingMap(null);
      }
      const notationLocked = !playAlong || readingMode === "ear";
      setAudioState("playing");
      setReferencePlayback({
        phase: "playing",
        voice: "full",
        playAlong,
        source: "local",
        intent: playAlong ? "practice" : "listen",
        notationLocked,
        startIndex: playbackPlan.cues[0].expectedIndex,
        currentIndex: playbackPlan.cues[0].expectedIndex,
        cursorIndex: playbackPlan.cues[0].expectedIndex,
        memoryRevealIndex: null,
        soundingIndex: playbackPlan.cues[0].expectedIndex,
        sounding: true,
        cueCount: playbackPlan.cues.length,
        progress: 0,
        elapsedMs: 0,
        durationMs: playbackPlan.totalDurationMs,
        countdown: null,
        truncated: playbackPlan.truncated,
      });
      setAudioNotice(playAlong
        ? `Local recording started at ${clockLabel(mediaStartSeconds * 1_000)}. Its aligned media clock drives the staff playhead and MIDI attack timing; ${notationLocked ? "notation remains locked" : "staff disclosure follows your cue setting"}.`
        : `Listening from ${clockLabel(mediaStartSeconds * 1_000)} with notation, note count, target keys, and grading locked.`);

      let completing = false;
      const completePlayback = () => {
        if (completing || audioTokenRef.current !== token) return;
        completing = true;
        if (audioFrameRef.current != null) window.cancelAnimationFrame(audioFrameRef.current);
        audioFrameRef.current = null;
        element.pause();
        referenceSessionRef.current = null;
        setAudioState("idle");
        setReferencePlayback({
          phase: "complete",
          voice: "full",
          playAlong,
          source: "local",
          intent: playAlong ? "practice" : "listen",
          notationLocked,
          startIndex: playbackPlan.cues[0].expectedIndex,
          currentIndex: null,
          cursorIndex: playbackPlan.cues.at(-1)?.expectedIndex ?? null,
          memoryRevealIndex: null,
          soundingIndex: null,
          sounding: false,
          cueCount: playbackPlan.cues.length,
          progress: 1,
          elapsedMs: playbackPlan.totalDurationMs,
          durationMs: playbackPlan.totalDurationMs,
          countdown: null,
          truncated: playbackPlan.truncated,
        });
        if (playAlong) {
          const captured = capturedScoreEvents(eventsRef.current, afterId, earliestOnsetMs, latestOnsetMs);
          setReferenceReviewRange({ startAttackId: playbackPlan.cues[0].attackId, endAttackId: playbackPlan.cues.at(-1)!.attackId });
          setReviewTakeEvents(captured);
          setCaptureState("review");
          setCaptureNotice(captured.length
            ? "The recording-linked take is frozen. Exact notation remains hidden until you choose Reveal heard passage."
            : "The recording ended without a MIDI attack. Exact notation still remains hidden until you choose Reveal heard passage.");
          setAudioNotice("Recording-linked play-along finished. Timing follows your score-to-recording anchors; reveal remains a separate learner choice.");
        } else {
          setAudioNotice("Listening pass finished without revealing or grading notes. Listen again, play against it, or reveal the heard passage when ready.");
        }
      };

      visualUpdateMsRef.current = 0;
      const updateVisual = () => {
        if (audioTokenRef.current !== token || completing) return;
        if (element.paused && !element.ended) {
          stopReference(playAlong ? "Recording paused. The heard prefix is frozen; notation remains locked." : "Listening paused. Notation remains locked.", playAlong, playAlong, !playAlong);
          return;
        }
        const audibleElapsed = Math.max(0, (element.currentTime - mediaStartSeconds) * 1_000);
        if (element.ended || audibleElapsed >= playbackPlan.totalDurationMs - 8) {
          completePlayback();
          return;
        }
        const visualNow = performance.now();
        if (visualNow - visualUpdateMsRef.current >= 45) {
          visualUpdateMsRef.current = visualNow;
          const frame = scoreReferenceFrameAt(playbackPlan, audibleElapsed + 8);
          const cursorCue = playbackPlan.cues.find((cue) => cue.expectedIndex === frame.cursorIndex) ?? playbackPlan.cues[0];
          const memoryRevealIndex = audibleElapsed + 8 >= cursorCue.onsetMs && audibleElapsed - cursorCue.onsetMs < 1_450
            ? cursorCue.expectedIndex
            : null;
          if (referenceSessionRef.current) referenceSessionRef.current.heardEndAttackId = cursorCue.attackId;
          setReferencePlayback((current) => ({
            ...current,
            phase: "playing",
            currentIndex: frame.cursorIndex,
            cursorIndex: frame.cursorIndex,
            memoryRevealIndex,
            soundingIndex: frame.soundingIndex,
            sounding: frame.soundingIndex != null,
            progress: Math.max(0, Math.min(1, audibleElapsed / Math.max(1, playbackPlan.totalDurationMs))),
            elapsedMs: Math.min(playbackPlan.totalDurationMs, audibleElapsed),
            durationMs: playbackPlan.totalDurationMs,
          }));
        }
        audioFrameRef.current = window.requestAnimationFrame(updateVisual);
      };
      audioFrameRef.current = window.requestAnimationFrame(updateVisual);
    } catch (error) {
      if (audioTokenRef.current !== token) return;
      element.pause();
      referenceSessionRef.current = null;
      setAudioState("unavailable");
      setReferenceTimingClock(null);
      setReferenceTimingMap(null);
      setReferencePlayback({ ...EMPTY_REFERENCE_VIEW, phase: "unavailable", source: "local", intent: playAlong ? "practice" : "listen", notationLocked: true, playAlong });
      if (playAlong) setCaptureState("idle");
      setAudioNotice(error instanceof Error ? error.message : "The local recording could not start.");
    }
  }, [activeNotes.length, frozen, localReferenceAudio, loop, mediaSyncAnchors, onResumeCapture, readingMode, referenceVolume, score, stopReference]);

  useEffect(() => () => stopReference(), [stopReference]);

  if (!score || !imported) return <section className={styles.shell} aria-labelledby="score-flow-title">
    <header className={styles.intro}>
      <div><span>Uploaded score · eyes, hands, and ear</span><h3 id="score-flow-title">Turn a page of music into a navigable field.</h3><p>Import MusicXML, choose a few measures, and let silent MIDI show where your playing agrees with the written pitch, interval, chord, timing, and release structure. Corrections are expressed as semitone direction and approximate physical key travel—not as a judgment of musical worth.</p></div>
      <dl><div><dt>Score</dt><dd>authored pitch spelling and structure lead</dd></div><div><dt>MIDI</dt><dd>notes and timing only · no sound</dd></div><div><dt>Fingering</dt><dd>authored when present · otherwise suggested</dd></div></dl>
    </header>
    <div className={cx(styles.dropZone, isDragging && styles.isDragging)} onDragEnter={(event) => { event.preventDefault(); setIsDragging(true); }} onDragOver={(event) => event.preventDefault()} onDragLeave={() => setIsDragging(false)} onDrop={onDrop}>
      <div className={styles.dropOrbit} aria-hidden="true"><i /><i /><i /></div>
      <span>Local score portal</span><strong>{fileState === "loading" ? "Reading the score…" : "Drop an MXL or MusicXML file here"}</strong><p>.mxl · .musicxml · .xml · up to 12 MB compressed / 16 MB expanded</p>
      <div><label htmlFor="score-flow-upload">Choose score<input id="score-flow-upload" type="file" accept=".mxl,.musicxml,.xml,application/vnd.recordare.musicxml,application/vnd.recordare.musicxml+xml,application/xml,text/xml" onChange={onFileChange} /></label><button type="button" onClick={loadDemo}>Try original Orbit Study</button></div>
      <small role={fileState === "error" ? "alert" : "status"}>{fileNotice}</small>
    </div>
    <div className={styles.importTruth}><article><span>Private by design</span><strong>Parsing happens in this tab.</strong><p>The score never leaves this browser. A tab-local copy is kept until you remove it or the tab session ends.</p></article><article><span>What is evaluated</span><strong>Written landings become targets.</strong><p>A landing is one or more notes that start together. Tied continuations stay held; simultaneous staff voices merge at one onset.</p></article><article><span>What remains human</span><strong>Expression is not reduced to correctness.</strong><p>Dynamics, pedaling, tone, rubato, intention, and enjoyment exceed silent MIDI. This HUD keeps the evidence it does have separate.</p></article></div>
  </section>;

  const navigatorStart = Math.max(0, loopStart - 6);
  const navigatorEnd = Math.min(score.measures.length - 1, loopEnd + 6);
  const navigatorMeasures = score.measures.slice(navigatorStart, navigatorEnd + 1);
  const currentDirections = imported.directions
    .filter((direction) => direction.measureIndex === currentMeasureIndex && direction.kind !== "tempo" && direction.onsetBeats <= (contextAttack?.onsetBeat ?? Number.POSITIVE_INFINITY) + 1e-7)
    .slice(-3);
  const repairAvailable = captureState === "review" && evaluation?.firstDivergence != null;
  const visibleEvaluation = scoreVeiled || gatheringPreviousChord ? null : evaluation;
  const hasTimingEvidence = Boolean(referenceTimingClock || referenceTimingMap || timingMode === "pulse");
  const pitchMetric = visibleEvaluation?.metrics.pitch;
  const chordMetric = visibleEvaluation?.metrics.chords;
  const contourMetric = visibleEvaluation?.metrics.soprano;
  const bassMetric = visibleEvaluation?.metrics.bass;
  const arpeggiationMetric = visibleEvaluation?.metrics.arpeggiation;
  const chordSpacingMetric = visibleEvaluation?.metrics.chordSpacing;
  const latestUpperRelationship = contourMetric?.comparisons.at(-1) ?? null;
  const latestBassRelationship = bassMetric?.comparisons.at(-1) ?? null;
  const hasPracticeAttacks = Boolean(loop?.attacks.length);
  const sourceCanPlay = hasPracticeAttacks && (referenceSource === "synth"
    || (referenceSource === "local" && Boolean(localReferenceAudio) && mediaSyncAnchors.length > 0));
  const referenceSourceLabel = referenceSource === "synth"
    ? "score tones"
    : referenceSource === "local"
      ? localReferenceAudio && mediaSyncAnchors.length ? "aligned local recording" : localReferenceAudio ? "local recording · align a landing" : "local recording · choose a file"
      : "Spotify · independent listening";
  const syncTargetOptions = loop?.attacks.slice(0, MAX_LIVE_FEEDBACK_ATTACKS) ?? [];
  const syncTargetAttack = syncTargetAttackId == null
    ? null
    : syncTargetOptions.find((attack) => attack.id === syncTargetAttackId) ?? null;
  const transportFocused = audioState === "playing";
  const focusComparison = evaluation?.comparisons.find((comparison) => comparison.expectedIndex === currentIndex) ?? null;
  const referenceComparison = referencePlayback.cursorIndex == null
    ? null
    : evaluation?.comparisons.slice(0, referencePlayback.cursorIndex + 1).findLast((comparison) => comparison.actual != null)
      ?? evaluation?.comparisons[referencePlayback.cursorIndex]
      ?? null;
  const divergenceComparison = evaluation?.firstDivergence?.expectedIndex == null
    ? null
    : evaluation.comparisons.find((comparison) => comparison.expectedIndex === evaluation.firstDivergence?.expectedIndex) ?? null;
  const recommendedReadingLens = evidenceReadingLens(captureState === "review" ? divergenceComparison : focusComparison, timingMode, defaultReadingLens(baseCurrentChunk));
  const activeReadingLens = manualReadingLens ?? recommendedReadingLens;
  const divergenceAttack = divergenceComparison?.expected ?? null;
  const divergenceBaseIndex = divergenceAttack ? baseAttackIndexById.get(divergenceAttack.id) ?? null : null;
  const repairChunk = divergenceBaseIndex == null ? null : readingChunks.find((chunk) => divergenceBaseIndex >= chunk.startAttackIndex && divergenceBaseIndex <= chunk.endAttackIndex) ?? null;
  const installRepairChunk = () => {
    if (!repairChunk) return;
    selectPracticeChunk(repairChunk);
  };
  const announcedGatheredCount = nextAttack ? Math.min(nextAttack.midiNotes.length, new Set([
    ...pressedNotes.filter((note) => nextAttack.midiNotes.includes(note)),
    ...(focusComparison?.actualNotes ?? []).filter((note) => nextAttack.midiNotes.includes(note)),
  ]).size) : 0;
  const liveHudMessage = scoreVeiled && nextAttack
    ? `Veiled landing ${currentIndex + 1} of ${loop?.attacks.length ?? 0}. Pitch, note count, staff position, and target keys remain locked; live timing and directional feedback stay categorical.`
    : gatheringPreviousChord && nextAttack
      ? `Gathering ${announcedGatheredCount} of ${nextAttack.midiNotes.length} notes inside the ${clusterWindow} millisecond togetherness window.`
      : nextAttack
        ? `${attackStatusLabel(focusComparison, true)}. Next landing has ${nextAttack.notes.length} note${nextAttack.notes.length === 1 ? "" : "s"}${showConventions ? `: ${nextAttack.notes.map((note) => note.pitch.label).join(" plus ")}` : ""}.`
        : captureState === "armed" ? "Every written landing has arrived. Release any pressed keys to finish the take." : "Loop complete. Review this take or move the loop.";
  const authoredLabelForMidi = (midi: number) => divergenceComparison?.expected.notes.find((note) => note.pitch.midi === midi)?.pitch.label ?? pitchClassName(midi, prefer);
  const repairInstruction = (() => {
    const divergence = evaluation?.firstDivergence;
    if (!divergence) return "";
    if (divergence.kind === "extra-attack") return "Omit the extra attack while preserving any notes already held across this boundary. Then replay the adjacent written landing without changing its correct tones.";
    if (divergence.kind === "missing-attack") return `Add the missing written landing${divergence.measureNumber ? ` in measure ${divergence.measureNumber}` : ""}; connect the landing before and after it as one short repair fragment.`;
    if (divergence.kind === "arpeggiation") return "Keep the written pitch set, but reverse or clarify the marked roll direction. Rehearse the outer notes first, then insert the interior tones.";
    if (divergence.signedSemitoneCorrection != null) return `Key correction: move ${divergence.signedSemitoneCorrection > 0 ? "right" : "left"} ${Math.abs(divergence.signedSemitoneCorrection)} semitone${Math.abs(divergence.signedSemitoneCorrection) === 1 ? "" : "s"}. Preserve the surrounding contour and every already-correct tone.`;
    if (divergenceComparison?.missingNotes.length && !divergenceComparison.extraNotes.length) {
      const retained = divergenceComparison.expectedNotes.filter((midi) => divergenceComparison.actualNotes.includes(midi)).map(authoredLabelForMidi);
      const missing = divergenceComparison.missingNotes.map((midi) => {
        const note = divergenceComparison.expected.notes.find((candidate) => candidate.pitch.midi === midi);
        return `${authoredLabelForMidi(midi)}${note?.fingering ? ` with authored finger ${note.fingering}` : ""}`;
      });
      return `${retained.length ? `Keep ${retained.join(" + ")} in place; ` : ""}add ${missing.join(" + ")}. Hear the complete vertical spacing, then rebuild it without moving the retained tones.`;
    }
    if (divergenceComparison?.extraNotes.length && !divergenceComparison.missingNotes.length) {
      const retained = divergenceComparison.actualNotes.filter((midi) => divergenceComparison.expectedNotes.includes(midi)).map(authoredLabelForMidi);
      const extras = divergenceComparison.extraNotes.map((midi) => pitchClassName(midi, prefer));
      return `${retained.length ? `Keep ${retained.join(" + ")}; ` : ""}remove ${extras.join(" + ")}. Re-form the written field before the next attack.`;
    }
    return "Replay the smallest surrounding relationship. Keep correct pitches intact and change only the named pulse or key-release boundary.";
  })();
  const inputState = frozen ? "paused" : liveAttack ? "received" : midiConnected ? "ready" : "disconnected";
  const inputHeadline = frozen
    ? "Trace paused"
    : liveAttack
      ? `${liveAttack.notes.length} key${liveAttack.notes.length === 1 ? "" : "s"} received now`
      : midiConnected
        ? "MIDI ready · play any key"
        : "MIDI is not connected";
  const togglePlayAlong = () => {
    if (audioState === "playing") {
      stopReference(
        referencePlayback.playAlong
          ? "Play + compare stopped. The synchronized evidence so far is frozen for review."
          : referencePlayback.intent === "listen"
            ? "Listening stopped. Notation remains locked; no performance judgment was added."
            : "Preview stopped. The frozen play-along review is unchanged.",
        true,
        referencePlayback.playAlong,
        !referencePlayback.playAlong,
      );
    } else {
      if (referenceSource === "local") void playLocalReference(true);
      else if (referenceSource === "synth") void playReference("full", true);
      else setSpotifyNotice("Use the Spotify player for independent listening. Spotify playback cannot drive score reveal, cursor timing, or grading here.");
    }
  };
  const listenReference = () => {
    if (referenceSource === "local") void playLocalReference(false);
    else if (referenceSource === "synth") void playReference("full", false);
    else setSpotifyNotice("Use the Spotify player below. The score stays fully locked and independent from Spotify playback.");
  };
  const toggleReviewReveal = () => {
    setReviewNotationRevealed((revealed) => {
      setAudioNotice(revealed
        ? "Notation is hidden again. The heard passage remains available for another ear-first pass."
        : "The clock-reached passage is now visible. Compare what you heard and played with the staff, then hide it for another pass.");
      return !revealed;
    });
  };

  return <section className={styles.shell} aria-labelledby="score-flow-title">
    <div className={styles.commandDeck}>
    <header className={styles.scoreHeader}>
      <div><span>Score Flow · uploaded score</span><h3 id="score-flow-title">{imported.title}</h3><p>{imported.composer ? `${imported.composer} · ` : ""}{imported.partNames.join(" + ")} · {imported.fileName}</p></div>
      <div className={styles.scoreFacts}><span>{imported.measureCount} measures</span><span>{score.attacks.length} landings</span><span>{scoreVeiled ? "key context veiled" : keySignatureLabel(localMeasureContext ?? imported)}</span><span>{meterSummary(imported)}</span><span>{imported.tempoBpm ? `opening ${Math.round(imported.tempoBpm)} BPM` : "tempo not encoded · using 72"}</span><span>{scoreVeiled ? "pitch range veiled" : imported.lowestMidi != null && imported.highestMidi != null ? `${pitchClassName(imported.lowestMidi, prefer)}–${pitchClassName(imported.highestMidi, prefer)}` : "range unavailable"}</span></div>
      <button type="button" className={styles.removeScore} aria-label="Remove local score" onClick={clearScore}>Remove</button>
    </header>

    <section className={cx(styles.referenceDock, transportFocused && styles.isTransportFocused)} aria-labelledby="reference-source-title">
      <header className={styles.referenceDockHeader}>
        <div><span>Sound source</span><strong id="reference-source-title">Hear the passage without giving away the page.</strong></div>
        <p>Listen keeps pitch, chord size, staff height, and target keys hidden. Play + compare adds silent MIDI evidence. Reveal is always a separate action after the pass.</p>
      </header>
      <div className={styles.sourceControls}>
        <div className={styles.sourceTabs} role="group" aria-label="Reference sound source">
          <button type="button" className={cx(styles.sourceTab, referenceSource === "synth" && styles.isSelected)} aria-pressed={referenceSource === "synth"} onClick={() => chooseReferenceSource("synth")}><span>Score tones</span><small>synchronized</small></button>
          <button type="button" className={cx(styles.sourceTab, referenceSource === "local" && styles.isSelected)} aria-pressed={referenceSource === "local"} onClick={() => chooseReferenceSource("local")}><span>Local recording</span><small>syncable</small></button>
          <button type="button" className={cx(styles.sourceTab, referenceSource === "spotify" && styles.isSelected)} aria-pressed={referenceSource === "spotify"} onClick={() => chooseReferenceSource("spotify")}><span>Spotify</span><small>listen-only</small></button>
        </div>
        <button type="button" className={styles.sourceDrawerToggle} aria-expanded={sourceDrawerOpen} aria-controls="score-flow-source-drawer" onClick={() => setSourceDrawerOpen((open) => !open)}>{sourceDrawerOpen ? "Close source" : referenceSource === "synth" ? "Source details" : "Open player"}</button>
      </div>

      {referenceSource === "synth" ? <div id="score-flow-source-drawer" className={cx(styles.sourceBody, !sourceDrawerOpen && styles.isSourceBodyCollapsed)} data-source="synth">
        <div className={styles.sourceSummary}><span>Generated from the uploaded score</span><strong>Exact score timing at {practiceTempo} BPM</strong><p>Best for measured play-along. The sound and cursor share one clock; MIDI produces no audio.</p></div>
      </div> : referenceSource === "local" ? <div id="score-flow-source-drawer" className={cx(styles.sourceBody, !sourceDrawerOpen && styles.isSourceBodyCollapsed)} data-source="local" data-ready={localReferenceAudio ? "true" : "false"}>
        {!localReferenceAudio ? <div className={styles.sourceSummary}><span>Private recording</span><strong>Add an MP3 or other local audio file.</strong><p>The file remains inside this browser tab. After upload, align one written landing to the matching instant in the recording.</p><label className={styles.audioFileAction} htmlFor="score-flow-reference-audio">Choose recording<input id="score-flow-reference-audio" type="file" accept="audio/*,.mp3,.wav,.m4a,.aac,.ogg,.oga,.webm" onChange={onReferenceAudioChange} /></label></div> : <>
          <div className={styles.localTrack}>
            <div><span>Local to this tab</span><strong>{localReferenceAudio.name}</strong><small>{localReferenceAudio.durationSeconds == null ? "reading duration…" : clockLabel(localReferenceAudio.durationSeconds * 1_000)} · current {clockLabel(localAudioTime * 1_000)}</small></div>
            <div><label className={styles.audioFileAction} htmlFor="score-flow-reference-audio-replace">Replace<input id="score-flow-reference-audio-replace" type="file" accept="audio/*,.mp3,.wav,.m4a,.aac,.ogg,.oga,.webm" onChange={onReferenceAudioChange} /></label><button type="button" onClick={removeReferenceAudio}>Remove</button></div>
          </div>
          <audio
            className={styles.localPlayer}
            ref={localAudioElementRef}
            src={localReferenceAudio.url}
            controls
            preload="metadata"
            onLoadedMetadata={(event) => {
              const durationSeconds = Number.isFinite(event.currentTarget.duration) ? event.currentTarget.duration : null;
              setLocalReferenceAudio((current) => current?.url === localReferenceAudio.url ? { ...current, durationSeconds } : current);
              event.currentTarget.volume = mediaLevel(referenceVolume);
            }}
            onTimeUpdate={(event) => setLocalAudioTime(event.currentTarget.currentTime)}
            onSeeked={(event) => setLocalAudioTime(event.currentTarget.currentTime)}
          >Your browser does not support local audio playback.</audio>
          <div className={styles.syncEditor}>
            <div className={styles.sourceSummary}><span>Score ↔ recording alignment</span><strong>{mediaSyncAnchors.length} anchor{mediaSyncAnchors.length === 1 ? "" : "s"} · {mediaSyncAnchors.length > 1 ? "performed drift mapped" : "encoded tempo between events"}</strong><p>Scrub the player to a clearly heard attack, select its written landing, then set the anchor. A later anchor follows rubato and recording drift more closely.</p></div>
            <div className={styles.syncControls}>
              <label><span>Written landing</span><select value={syncTargetOptions.some((attack) => attack.id === syncTargetAttackId) ? syncTargetAttackId ?? "" : ""} onChange={(event) => setSyncTargetAttackId(event.target.value || null)}><option value="">Choose inside this loop</option>{syncTargetOptions.map((attack) => <option key={attack.id} value={attack.id}>Landing {(baseAttackIndexById.get(attack.id) ?? 0) + 1} · measure {attack.measureNumber} · beat {Number(attack.relativeOnsetBeat.toFixed(2))}</option>)}</select></label>
              <button type="button" className={styles.primaryAction} disabled={!syncTargetAttack} onClick={setRecordingAnchor}>Set at {clockLabel(localAudioTime * 1_000)}</button>
              <button type="button" disabled={!mediaSyncAnchors.length} onClick={() => nudgeRecordingAnchors(-.05)}>−50 ms</button>
              <button type="button" disabled={!mediaSyncAnchors.length} onClick={() => nudgeRecordingAnchors(.05)}>+50 ms</button>
            </div>
            {mediaSyncAnchors.length ? <div className={styles.anchorList} aria-label="Recording sync anchors">{mediaSyncAnchors.map((anchor) => {
              const attack = score.attacks.find((candidate) => Math.abs(candidate.onsetBeat - anchor.scoreBeat) < 1e-7);
              return <div className={styles.anchorChip} key={`${anchor.scoreBeat}:${anchor.mediaTimeSeconds}`}><span>{attack ? `m.${attack.measureNumber} · landing ${(baseAttackIndexById.get(attack.id) ?? 0) + 1}` : `score beat ${Number(anchor.scoreBeat.toFixed(2))}`}</span><strong>{clockLabel(anchor.mediaTimeSeconds * 1_000)}</strong><button type="button" aria-label={`Remove sync anchor at ${clockLabel(anchor.mediaTimeSeconds * 1_000)}`} onClick={() => setMediaSyncAnchors((current) => current.filter((candidate) => candidate !== anchor))}>×</button></div>;
            })}</div> : null}
          </div>
        </>}
      </div> : <div id="score-flow-source-drawer" className={cx(styles.sourceBody, !sourceDrawerOpen && styles.isSourceBodyCollapsed)} data-source="spotify">
        <div className={styles.spotifyForm}>
          <label htmlFor="score-flow-spotify"><span>Spotify link or URI</span><input id="score-flow-spotify" type="url" inputMode="url" placeholder="https://open.spotify.com/track/…" value={spotifyInput} onChange={(event) => setSpotifyInput(event.target.value)} /></label>
          <button type="button" onClick={installSpotifyEmbed}>Embed</button>
        </div>
        <p className={styles.policyNote} role="status">{spotifyNotice} Spotify remains an independent listening reference: it does not drive the score cursor, reveal, timing map, or grading.</p>
        {spotifyTarget ? <iframe className={styles.spotifyEmbed} src={spotifyTarget.embedUrl} title={`Spotify ${spotifyTarget.kind} reference player`} width="100%" height="152" loading="lazy" allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture" allowFullScreen /> : null}
      </div>}
    </section>

    <details className={styles.practiceSetup}>
      <summary><span>Practice setup</span><strong>{selectedChunk ? `chunk ${selectedChunk.ordinal + 1} · ${selectedChunk.attackCount} landings` : `m.${score.measures[loopStart].number}–${score.measures[loopEnd].number}`} · {practiceHand === "both" ? "both staves" : practiceHand === "right" ? "upper staff" : "lower staff"} · {readingMode === "read" ? "Follow" : readingMode === "memory" ? "Flash" : "Hidden"} · {referenceSourceLabel}</strong><small>Loop, staff cues, timing, level, and chord-togetherness</small></summary>
      <div className={styles.practiceDrawer}>
      <div className={styles.practiceControls} aria-label="Score practice controls">
        <label><span>From measure</span><select value={loopStart} onChange={(event) => changeLoop(Number(event.target.value), Math.max(Number(event.target.value), loopEnd))}>{score.measures.map((measure) => <option key={measure.id} value={measure.index}>{measure.number}</option>)}</select></label>
        <label><span>Through measure</span><select value={loopEnd} onChange={(event) => changeLoop(Math.min(loopStart, Number(event.target.value)), Number(event.target.value))}>{score.measures.map((measure) => <option key={measure.id} value={measure.index} disabled={measure.index < loopStart}>{measure.number}</option>)}</select></label>
        <label><span>Staff focus</span><select value={practiceHand} onChange={(event) => { setPracticeHand(event.target.value as PracticeHand); setSelectedChunkId(null); setManualReadingLens(null); resetTake("Staff focus changed. The score boundary is fresh."); }}><option value="both">Both staves</option><option value="right">Upper staff</option><option value="left">Lower staff</option></select></label>
        <label><span>Staff cues</span><select value={readingMode} disabled={audioState === "playing"} onChange={(event) => { setReadingMode(event.target.value as ReadingMode); setReviewNotationRevealed(false); }}><option value="ear">Hidden · ear only</option><option value="memory">Flash · reveal then cover</option><option value="read">Follow · keep heard notes</option></select></label>
        <label><span>Timing lens</span><select value={timingMode} onChange={(event) => { setTimingMode(event.target.value as TimingMode); resetTake("Timing lens changed. Arm a fresh take."); }}><option value="self-paced">Self-paced · pitch first</option><option value="pulse">Fixed-pulse drill</option></select></label>
        <label><span>Practice tempo</span><select value={tempoPercent} disabled={referenceSource !== "synth"} onChange={(event) => { setTempoPercent(Number(event.target.value)); resetTake("Tempo changed. Arm a fresh take."); }}><option value={50}>50% · {Math.max(20, Math.round(encodedLocalTempo * .5))} BPM</option><option value={70}>70% · {Math.max(20, Math.round(encodedLocalTempo * .7))} BPM</option><option value={85}>85% · {Math.max(20, Math.round(encodedLocalTempo * .85))} BPM</option><option value={100}>100% · {Math.round(encodedLocalTempo)} BPM</option></select></label>
        <label className={styles.volumeControl}><span>{referenceSource === "spotify" ? "Use Spotify player volume" : `Reference level · ${referenceVolume}%`}</span><input type="range" min={0} max={100} step={1} value={referenceVolume} disabled={referenceSource === "spotify"} aria-label="Reference playback volume" aria-valuetext={`${referenceVolume} percent`} onChange={(event) => { const value = Number(event.target.value); setReferenceVolume(value); const context = audioContextRef.current; const master = audioMasterRef.current; if (context && master && context.state !== "closed") master.gain.setTargetAtTime(referenceLevelGain(value), context.currentTime, .025); }} /></label>
        <label><span>Notes count as together</span><select value={clusterWindow} onChange={(event) => { setClusterWindow(Number(event.target.value)); resetTake("Togetherness lens changed. Arm a fresh take."); }}><option value={70}>Tight · 70 ms</option><option value={140}>Relaxed · 140 ms</option><option value={220}>Rolled · 220 ms</option></select></label>
      </div>
      <div className={styles.measureMap} aria-label={`Measure navigator showing ${navigatorStart + 1} through ${navigatorEnd + 1} of ${score.measures.length} measures`}>{navigatorStart > 0 ? <span className={styles.measureGap} aria-hidden="true">…</span> : null}{navigatorMeasures.map((measure) => {
        const comparisons = comparisonsByMeasureIndex.get(measure.index) ?? [];
        const wrong = comparisons.some((comparison) => comparison.status === "incorrect" || comparison.status === "missed");
        const correct = comparisons.length > 0 && comparisons.every((comparison) => comparison.status === "correct");
        const inLoop = measure.index >= loopStart && measure.index <= loopEnd;
        const current = measure.index === currentMeasureIndex;
        const evidenceScope = selectedChunk ? "selected chunk" : "measure";
        const state = wrong ? `${evidenceScope} needs repair` : correct ? `${evidenceScope} aligned` : current ? "current" : inLoop ? "in loop" : "outside loop";
        return <button key={measure.id} type="button" className={cx(inLoop && styles.isInLoop, current && styles.isCurrentMeasure, wrong && styles.hasWrong, correct && styles.isMeasureCorrect)} aria-label={`Measure ${measure.number}, ${imported.measures[measure.index]?.timeSignatureDisplay ?? `${measure.beats}/${measure.beatType}`}, ${state}`} aria-current={current ? "location" : undefined} onClick={() => changeLoop(measure.index, Math.min(score.measures.length - 1, measure.index + Math.max(0, loopEnd - loopStart)))}><span>{measure.number}</span><small>{imported.measures[measure.index]?.timeSignatureDisplay ?? `${measure.beats}/${measure.beatType}`}</small><em>{wrong ? selectedChunk ? "chunk repair" : "repair" : correct ? selectedChunk ? "chunk aligned" : "aligned" : current ? "current" : inLoop ? "loop" : ""}</em></button>;
      })}{navigatorEnd < score.measures.length - 1 ? <span className={styles.measureGap} aria-hidden="true">…</span> : null}</div>
      </div>
    </details>

    <div className={styles.sessionBar}>
      <div className={styles.sessionSummary}>
        <span>{captureState === "idle" ? liveAttack ? "live follow" : "live follow · waiting" : captureState === "armed" ? liveEvaluationPaused ? "long review take" : evaluation?.complete && pressedNotes.length ? "release to finish" : takeEvents.length ? "recording review take" : "review take ready" : "frozen review"}</span>
        <strong>{loop?.attacks.length ?? 0} written landing{loop?.attacks.length === 1 ? "" : "s"} · {selectedChunk ? `chunk ${selectedChunk.ordinal + 1} selected` : `m.${score.measures[loopStart].number}–${score.measures[loopEnd].number}`}</strong>
        <div className={styles.inputReadiness} data-state={inputState}><i aria-hidden="true" /><div><span>Silent input</span><strong>{inputHeadline}</strong><small>{midiStatus}</small></div></div>
        <small role="status" aria-live="polite" aria-atomic="true">{frozen ? "The shared trace is paused. Resume it to let new attacks enter live follow; held keys may still light." : evaluationError ? "Evaluation paused until the loop is shortened." : !hasPracticeAttacks ? "This selection contains no landing targets for the chosen staff focus. Include a measure with notes or change the staff focus." : captureState === "armed" && evaluation?.complete && pressedNotes.length ? "All written landings have arrived. Release the pressed keys so key-up lengths can enter the frozen review; pedal-sustained tones do not block review." : captureState === "idle" && liveAttack ? "MIDI received. Live follow is comparing this pass now; no Arm step is required." : captureNotice}</small>
        {evaluationError ? <small role="alert">{evaluationError} Choose a shorter measure loop; raw input receipt remains active.</small> : null}
      </div>
      <div className={styles.sessionActions}>{selectedChunk ? <button type="button" onClick={clearPracticeChunk}>Full measure loop</button> : null}{frozen ? <button type="button" className={styles.primaryAction} onClick={onResumeCapture}>Resume live trace</button> : null}{!midiConnected ? <button type="button" onClick={onConnectMidi}>Connect / retry MIDI</button> : null}{referenceSource === "synth" ? <details className={styles.voicePreview}><summary>Voice previews</summary><div><button type="button" disabled={!hasPracticeAttacks || audioState === "playing"} onClick={() => void playReference("upper", false)}>Upper path</button><button type="button" disabled={!hasPracticeAttacks || audioState === "playing"} onClick={() => void playReference("bass", false)}>Bass route</button></div></details> : null}{audioState === "playing" && referencePlayback.playAlong ? null : captureState === "armed" ? <button type="button" onClick={reviewTake}>Stop + diagnose silent take</button> : <button type="button" disabled={!hasPracticeAttacks || Boolean(evaluationError)} onClick={armTake}>{captureState === "review" ? selectedChunk ? "Record chunk without audio" : "Record loop without audio" : selectedChunk ? "Record silent chunk" : "Record silent take"}</button>}</div>
      <p className={styles.audioNotice} role="status" aria-live="polite">{audioNotice}{referenceTimingMap ? " This review uses the recording’s aligned timing map, including the drift between your anchors." : referenceTimingClock ? ` This review measures attacks from the audible start; ${timingMode === "self-paced" ? "the Play + compare clock temporarily replaces self-paced timing" : "the fixed-pulse lens uses the same clock"}.` : timingMode === "pulse" ? ` Fixed-pulse is a constant ${practiceTempo} BPM drill from the latest numeric tempo at this boundary: your first landing is beat zero, and later tempo changes, rubato words, or fermatas do not move its clock.` : ""}</p>
    </div>
    </div>

    {loop ? <PlayAlongField view={referencePlayback} loop={loop} comparison={referenceComparison} comparisons={referenceComparisonsByAttackId} readingMode={readingMode} showConventions={showConventions} notationById={notationById} activeNotes={pressedNotes} audioPlaying={audioState === "playing"} canPlay={sourceCanPlay} independentListening={referenceSource === "spotify"} sourceLabel={referenceSourceLabel} reviewRevealed={reviewNotationRevealed} onListen={listenReference} onToggle={togglePlayAlong} onToggleReveal={toggleReviewReveal} /> : null}
    {synchronizedRevealActive ? <p className={styles.alignmentKey}><strong>One clock · two useful positions.</strong> The luminous field above is what the reference is sounding now. The panels below follow where your received MIDI currently aligns; the distance between them is your lead or lag.</p> : null}

    {loop && !transportFocused ? <div className={styles.immersionOverview}>
      <p className="sr-only" role="status" aria-live="polite" aria-atomic="true">{liveHudMessage}</p>
      {measureLoop ? <ScoreJourney loop={measureLoop} chunks={readingChunks} chunkProgress={chunkProgress} chunkMemory={chunkMemoryById} comparisons={journeyComparisonsByExpectedIndex} currentIndex={journeyCurrentIndex} extraCount={visibleEvaluation?.extraClusters.length ?? 0} captureState={captureState} veiled={scoreVeiled} selectedChunkId={selectedChunk?.id ?? null} onSelectChunk={selectPracticeChunk} /> : null}
      <FocusLanding attack={nextAttack} comparison={focusComparison} currentIndex={currentIndex} totalAttacks={loop.attacks.length} activeNotes={pressedNotes} veiled={scoreVeiled} showConventions={showConventions} prefer={prefer} arrivalWindowMs={clusterWindow} arrivalWindowOpen={arrivalWindowOpen} captureState={captureState} liveAttack={liveAttack} liveComparison={liveAttackComparison} />
      <ReadingChunkFocus chunk={currentChunk} progress={currentChunkProgress} memory={currentChunkMemory} loop={loop} comparisons={comparisonsByExpectedIndex} currentIndex={currentIndex} veiled={scoreVeiled} showConventions={showConventions} notationById={notationById} directionText={currentDirections.length ? currentDirections.map((direction) => direction.text).join(" · ") : null} activeLens={scoreVeiled ? "rhythm" : activeReadingLens} recommendedLens={recommendedReadingLens} onLensChange={setManualReadingLens} />
      <CollectionFocus analysis={localCollection} showConventions={showConventions} prefer={prefer} veiled={scoreVeiled} />
    </div> : null}

    {!transportFocused ? <div className={styles.hudGrid}>
      <section className={styles.handCompass} aria-labelledby="hand-compass-title">
        <header><div><span>Keyboard route</span><h4 id="hand-compass-title">Put the focused landing under the hands.</h4></div><p>{scoreVeiled ? "Destination, played pitches, and prior-score territory stay dark until review." : "White outline = sounding now (pressed or pedal) · gold = destination · blue edge = last landing. Finger numbers are never silently presented as authored."}</p></header>
        <KeyboardTerritory next={scoreVeiled ? null : nextAttack} previousNotes={scoreVeiled ? [] : previousNotes} activeNotes={scoreVeiled ? [] : activeNotes} showConventions={scoreVeiled ? false : showConventions} prefer={prefer} />
        {scoreVeiled ? <div className={styles.emptyField}><strong>Destination territory is veiled.</strong><span>Hear or imagine the landing, play the route, then stop the take to reveal exact semitones, physical key travel, and suggested fingers.</span></div> : <DistanceField next={nextAttack} previousByHand={previousByHand} showConventions={showConventions} prefer={prefer} />}
      </section>

      <section className={styles.diagnosis} aria-labelledby="score-diagnosis-title">
        <header><div><span>First useful difference</span><h4 id="score-diagnosis-title">{evaluationError ? "Shorten the loop to keep the diagnosis responsive." : liveEvaluationPaused ? "Long take is recording without repeated heavy alignment." : captureState === "review" ? evaluation?.firstDivergence ? `Repair measure ${evaluation.firstDivergence.measureNumber ?? "near the cursor"}.` : "The selected evidence aligned." : takeEvents.length ? "Follow the live cursor, not a score total." : "Launch only when the whole next shape is prepared."}</h4></div></header>
        {evaluationError ? <div className={styles.divergenceCard} role="alert"><span>Evaluation boundary</span><strong>{evaluationError}</strong><p>The score remains loaded and no evidence was discarded. Select fewer measures; raw MIDI receipt continues even while the comparison is paused.</p></div> : liveEvaluationPaused ? <div className={styles.liveInstruction}><strong>{takeEvents.length} key attack{takeEvents.length === 1 ? "" : "s"} received behind a browser-safe boundary.</strong><p>Raw key blooms remain live. Select a shorter loop for a moving comparison, or start a review take and use Stop + diagnose for one bounded frozen alignment.</p></div> : captureState === "review" ? evaluation?.firstDivergence ? <div className={styles.divergenceCard}>
          <span>{evaluation.firstDivergence.kind.replace("-", " ")}</span><strong>{evaluation.firstDivergence.message}</strong>
          <p>{repairInstruction}</p>
          {divergenceComparison?.expectedSpacing.adjacentSemitones.length || divergenceComparison?.actualSpacing?.adjacentSemitones.length ? <div className={styles.spacingComparison}>
            <div><span>Written gaps</span><strong>{divergenceComparison.expectedSpacing.adjacentSemitones.length ? divergenceComparison.expectedSpacing.adjacentSemitones.map((gap) => `${gap} st`).join(" · ") : "single tone"}</strong></div>
            <b>→</b>
            <div><span>Played gaps</span><strong>{divergenceComparison.actualSpacing?.adjacentSemitones.length ? divergenceComparison.actualSpacing.adjacentSemitones.map((gap) => `${gap} st`).join(" · ") : divergenceComparison.actualNotes.length ? "single tone" : "no landing"}</strong></div>
          </div> : null}
          {repairAvailable ? <button type="button" onClick={repairChunk ? installRepairChunk : installRepairLoop}>{repairChunk ? `Practice chunk ${repairChunk.ordinal + 1} · ${repairChunk.attackCount} landings` : "Make a ±1 measure repair loop"}</button> : null}
        </div> : <div className={styles.secureCard}><span>No first divergence</span><strong>Pitch, chord, and selected timing evidence aligned for this loop.</strong><p>This is not a musicality or expression score. Move the loop, fade notation, or sing one voice before replaying it.</p></div> : scoreVeiled ? <div className={styles.liveInstruction}><strong>Hold the heard or imagined route without searching for a lit destination.</strong><p>Only pulse slots, phrase progress, and neutral chunk boundaries remain visible while this layer is veiled. Choose Reveal heard passage after the take to see the exact written landing and smallest physical correction.</p></div> : <div className={styles.liveInstruction}><strong>{nextAttack ? `${nextAttack.midiNotes.length > 1 ? "Prepare the full vertical span" : "Orient the next finger"} before attacking.` : "The loop has no attack targets."}</strong><p>{nextAttack && previousNotes.length ? nextAttack.midiNotes.map((target) => { const from = [...previousNotes].sort((a, b) => Math.abs(target - a) - Math.abs(target - b))[0]; const distance = fingerDistance(from, target); return `${signed(distance.signedSemitones)} st / ${Math.round(distance.whiteKeyWidths * 10) / 10} key widths`; }).join(" · ") : "Use the staff and keyboard territory together; then look slightly ahead of the current landing."}</p></div>}
        {captureState === "review" && evaluation ? <div className={styles.relationshipEvidence} aria-label="Most recent directed interval evidence">
          <RelationshipEvidence label="Latest upper link" comparison={latestUpperRelationship} />
          <RelationshipEvidence label="Latest bass link" comparison={latestBassRelationship} />
        </div> : null}
        <details className={styles.reviewEvidence} open={captureState === "review"}>
          <summary><span>Deep evidence</span><strong>Right keys, note relationships, pulse, and release remain separate</strong></summary>
          <div className={styles.evidenceGroups} aria-label="Separate performance evidence">
          <EvidenceGroup eyebrow="Notes + chords" title="Did the written field arrive?" items={[
            { label: "Right keys", value: pitchMetric ? metricLabel(pitchMetric.accuracy, pitchMetric.compared) : "waiting", detail: "Exact MIDI set at each written landing" },
            { label: "Notes together", value: chordMetric ? metricLabel(chordMetric.accuracy, chordMetric.compared) : "waiting", detail: "Membership and duplicate key attacks" },
            { label: "Semitone spacing", value: chordSpacingMetric ? metricLabel(chordSpacingMetric.accuracy, chordSpacingMetric.compared) : "waiting", detail: "Adjacent gaps, kept separate from membership" },
            { label: "Marked roll direction", value: arpeggiationMetric ? metricLabel(arpeggiationMetric.accuracy, arpeggiationMetric.compared) : "waiting", detail: "Only fields explicitly marked arpeggiated" },
          ]} />
          <EvidenceGroup eyebrow="Motion" title="Did the relationships keep their shape?" items={[
            { label: "Top-note shape", value: contourMetric ? metricLabel(contourMetric.contourAccuracy, contourMetric.contourCompared) : "waiting", detail: "Rise, fall, or repeat in the highest-note envelope" },
            { label: "Top-note interval width", value: contourMetric ? metricLabel(contourMetric.intervalAccuracy, contourMetric.intervalCompared) : "waiting", detail: "Exact signed semitone links" },
            { label: "Bottom-note path", value: bassMetric ? metricLabel(bassMetric.intervalAccuracy, bassMetric.intervalCompared) : "waiting", detail: "Exact lowest-note semitone links" },
          ]} />
          <EvidenceGroup eyebrow="Time + journey" title="Did the landing and release boundaries align?" items={[
            { label: "Pulse proportions", value: !hasTimingEvidence ? "not scored · self-paced" : visibleEvaluation ? metricLabel(visibleEvaluation.metrics.rhythm.accuracy, visibleEvaluation.metrics.rhythm.compared) : "waiting", detail: !hasTimingEvidence ? "No clock judgment" : referenceTimingClock ? `Synchronized to the audible ${practiceTempo} BPM reference; qualitative rubato stays human` : `Literal ${practiceTempo} BPM drill; qualitative rubato stays human` },
            { label: "Release lengths · key-up", value: !hasTimingEvidence ? "not scored · self-paced" : visibleEvaluation ? metricLabel(visibleEvaluation.metrics.duration.accuracy, visibleEvaluation.metrics.duration.compared) : "waiting", detail: !hasTimingEvidence ? "Written lengths remain visible but ungraded" : "Physical key-up time against the shared clock; expressive holds still need human judgment" },
          ]} />
          </div>
        </details>
      </section>
    </div> : null}

    <details className={styles.truthDrawer}>
      <summary><span>Evidence limits</span><strong>What comes from the score, what MIDI measures, and what the coach only suggests</strong></summary>
      <footer className={styles.truthFooter}>
        <div><span>Score facts</span><strong>Spelling, staff, voice, duration, tie, meter, and encoded directions come from MusicXML.</strong></div>
        <div><span>Measured from MIDI</span><strong>Key number, landing time, physical key-up time, and near-simultaneous grouping enter this coach. Velocity and pedal state remain ungraded.</strong></div>
        <div><span>Teaching inference</span><strong>Reading chunks, fingering suggestions, collection fits, and key-width cues are hypotheses—not authored facts.</strong></div>
        <p>The HUD does not hear tone, pedaling acoustics, voicing balance, dynamics, rubato intention, emotion, or whether the performance is “good.” Notes count as together under the selected onset lens; a written arpeggiation can widen only its own field. This is a synchronized attack map rather than authoritative engraving: use the source page for rests, beams, clefs, layout, and editorial fingering. Staff 1 is treated as an upper-staff route and later staves as lower-staff routes; unusual or cross-staff writing needs human interpretation.</p>
      </footer>
    </details>
  </section>;
}
