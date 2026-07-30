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
  CONTROLLED_SONORITY_FIELDS,
  LANDMARK_PATHS,
  PIANO_SCALES,
  TONAL_GRAVITY_WEIGHTS,
  articulationTimeline,
  chordGapFingerprint,
  chordTransitionEvidence,
  compareChordGapMutation,
  compareChordGestureTiming,
  compareChordMotionEcho,
  compareChordVoicingEcho,
  compareIntervalEcho,
  compareLandmarkRouteFingerprints,
  comparePhraseEndingRipple,
  comparePhraseLenses,
  comparePhrasePauseMutation,
  compareScaleGapMutation,
  compareScaleLandingIntervalRipple,
  controlledSonorityChange,
  conventionalPitchName,
  detectMotifTransformations,
  compareMotifEcho,
  compareMotifFingerprints,
  evaluateAscendingScaleWalk,
  evaluatePerformedScaleFingerprint,
  fifthStepForPitchClass,
  fifthsCircle,
  fifthsSpiral,
  frequencyFromMidi,
  groupChordGestures,
  identifyChordCandidates,
  interpretedChordNotes,
  intervalLandmark,
  landmarkCounterfactualProfile,
  landmarkPerformanceEventIds,
  landmarkRouteFingerprint,
  landmarkTransitionChange,
  landmarkTranspositionProfile,
  matchScaleFingerprint,
  motifReturnArc,
  motifReturnArcEventIds,
  nearbyScaleChords,
  nearestMidiForPitchClass,
  noteContext,
  pairwiseIntervals,
  parseMidiMessage,
  phraseChangeProfile,
  phraseBreathMap,
  pitchClassFromMidi,
  pushPhraseEvent,
  pushRollingNoteEvent,
  resolutionForks,
  resolutionLandingEvidence,
  resolutionDirection,
  scaleCoverage,
  scaleFingerprint,
  scaleFrameTimeline,
  scaleSemitones,
  semitoneFieldProfile,
  sharedCycleCandidates,
  tonalGravityCandidates,
  tonalGravityCounterfactual,
  tonalTendency,
  upsertMotifReturnObservation,
  voiceChordNear,
  voiceLandmarkCounterfactual,
  voiceLandmarkPath,
  voiceLeadingProfile,
  type ChordCandidate,
  type ChordGapFingerprint,
  type ChordGapMutation,
  type ChordBoundaryCorrection,
  type ChordGesture,
  type ControlledSonorityFieldId,
  type ArticulationEvidence,
  type LandmarkPath,
  type LandmarkPathId,
  type LandmarkRouteComparison,
  type LandmarkRouteFingerprint,
  type LandmarkTransitionChange,
  type MotifTransformation,
  type MotifEchoComparison,
  type MotifFingerprintComparison,
  type MotifReturnObservation,
  type MotifReturnReport,
  type NearbyChord,
  type PianoScale,
  type ResolutionFork,
  type ResolutionLandingEvidence,
  type ScaleCandidate,
  type ScaleGapMutationComparison,
  type ScaleLandingIntervalRipple,
  type SharedCycleCandidate,
  type AscendingScaleWalk,
  type PerformedScaleFingerprint,
  type PhraseLensComparison,
  type PhrasePauseMutation,
  type PhraseBreathMap,
  type PhraseEndingRipple,
  type PhraseChangeIntention,
  type TonalGravityCandidate,
  type TonalGravityCounterfactual,
  type TonalGravityCue,
} from "@/lib/piano-model";
import { sonorityAffordances, sonorityPerceptionModel } from "@/lib/sonority-model";
import {
  DEFAULT_PIANO_SOUND_MODEL_ID,
  PIANO_SOUND_MODELS,
  comparePianoPartialInteractions,
  isPianoSoundModelId,
  pianoPartialInteraction,
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
  type PhraseCharacterContext,
  type PhraseCharacterObservation,
  type PhraseCharacterRatings,
} from "@/lib/personal-response";
import { livePulseMirror, type LivePulseMirror } from "@/lib/rhythm-model";
import { PIANO_SESSION_KEY } from "@/lib/piano-session";
import { preferredAccidentalsForTonic } from "@/lib/piano-sight-reading-model";
import { liveEarPairProfile, type LiveEarIntervalProfile } from "@/lib/live-ear";
import { PianoImmersion } from "@/app/PianoImmersion";
import { PianoIntervalGlowHud } from "@/app/PianoIntervalGlowHud";
import { PianoResearchHud } from "@/app/PianoResearchHud";
import { PianoScaleGravityHud } from "@/app/PianoScaleGravityHud";
import { PianoSightReadingHud } from "@/app/PianoSightReadingHud";
import { IMMERSION_HISTORY_ATTACKS, IMMERSION_MAX_FIELD_NOTES, immersionHistory } from "@/lib/piano-immersion-model";

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
  interpretedNotes: number[];
  audibleNotes: number[];
  excludedInheritedNotes: number[];
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
type FocusLens = "explore" | "immersion" | "interval-glow" | "sight-shapes" | "research" | "gravity" | "intervals" | "scales" | "chords" | "motion" | "paths" | "experience";
type MotionFocusMode = "pulse" | "touch" | "voices" | "motif" | "breath";
type ChordFocusMode = "cause" | "change" | "echo";
type ExperienceOrigin = "phrase" | "interval-echo" | "chord-change" | "chord-voicing-echo" | "chord-motion-echo" | "resolution-fork" | "motif-return" | "landmark-path";
type IntervalEchoTarget = {
  semitones: number;
  anchorEventId: number;
  sourceNotes: [number, number];
  sourceEvents: [HudNoteEvent, HudNoteEvent];
};
type ResolutionTarget = ResolutionFork & {
  anchorEventId: number;
  sourceEvent?: HudNoteEvent;
  frameRootPitchClass?: number;
  frameScaleId?: PianoScale["id"];
};
type ScaleWalkSession = {
  anchorEventId: number;
  rootPitchClass: number;
  scaleId: PianoScale["id"];
};
type ScaleFingerprintSession = {
  anchorEventId: number;
  exercise: "build" | "transpose" | "rotate" | "mutate";
  sourceSteps: number[] | null;
  expectedSteps: number[] | null;
  revealNames: boolean;
  sourceBaseMidi?: number | null;
};
type GravityCounterfactualSession = {
  specimen: HudNoteEvent[];
  targetPitchClass: number;
  cue: TonalGravityCue;
  rootPitchClass: number;
  scaleId: PianoScale["id"];
};
type ControlledSonoritySession = {
  recipeId: ControlledSonorityFieldId | "live";
  rootPitchClass: number;
  scaleId: PianoScale["id"];
  targetNotes: number[];
  baselineNotes: number[] | null;
  replayRequired: boolean;
};
type ChordVoicingEchoSession = {
  sourceEvents: HudNoteEvent[];
  sourceNotes: number[];
  anchorEventId: number;
  rootPitchClass: number;
  scaleId: PianoScale["id"];
};
type ChordMotionEchoSession = {
  sourceBeforeEvents: HudNoteEvent[];
  sourceAfterEvents: HudNoteEvent[];
  sourceBeforeAttackEventIds?: number[];
  sourceAfterAttackEventIds?: number[];
  sourceBeforeNotes: number[];
  sourceAfterNotes: number[];
  anchorEventId: number;
  attemptAnchorEventId: number;
  rootPitchClass: number;
  scaleId: PianoScale["id"];
};
type ChordMotionEchoAttempt = {
  beforeGesture: HudChordGesture;
  afterGesture: HudChordGesture;
  beforeNotes: number[];
  afterNotes: number[];
};
type PulseMirrorSession = {
  anchorEventId: number;
  capturedTapEventIds: number[];
};
type MotifEchoSession = {
  sourceEvents: HudNoteEvent[];
  anchorEventId: number;
  attempts?: HudNoteEvent[][];
  returnObservations?: MotifReturnObservation[];
  /** v1.75 migration field; new reports live in returnObservations. */
  returnReport?: MotifReturnReport | null;
};
type PhraseCompareDimension = "settledness" | "energy" | "liking";
type PhraseCompareReport = "a" | "same" | "b";
type PhraseCompareSession = {
  baseline: HudNoteEvent[];
  anchorEventId: number;
  comparison: HudNoteEvent[] | null;
  intention: PhraseChangeIntention | null;
  rootPitchClass: number;
  scaleId: PianoScale["id"];
  reports: Partial<Record<PhraseCompareDimension, PhraseCompareReport>>;
};
type LandmarkTransposeSession = {
  pathId: LandmarkPathId;
  sourceRootPitchClass: number;
  targetRootPitchClass: number;
};
type LandmarkCounterfactualReport = "source" | "same" | "changed";
type LandmarkCounterfactualSession = {
  pathId: LandmarkPathId;
  rootPitchClass: number;
  report: LandmarkCounterfactualReport | null;
};
type LandmarkPerformanceCapture = {
  pathId: LandmarkPathId;
  rootPitchClass: number;
  variant: PhraseCharacterContext["variant"];
  fieldEventIds: number[][];
};
type LandmarkRouteCompareSession = {
  sourcePathId: LandmarkPathId;
  sourceVariant: LandmarkRouteFingerprint["variant"];
  targetPathId: LandmarkPathId;
};

type MidiCallbacks = {
  onAttack: (note: number, velocity: number, channel: number, fieldNotes: number[], atMs: number) => void;
  onRelease: (note: number, channel: number, atMs: number, heldByPedal: boolean) => void;
  onSustain: (down: boolean, channel: number, atMs: number, releasedNotes: number[]) => void;
};

type PersistedPianoSession = {
  version: 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13 | 14 | 15 | 16 | 17 | 18 | 19 | 20 | 21 | 22 | 23 | 24 | 25;
  phraseEvents: HudNoteEvent[];
  chordWindowMs: number;
  boundaryCorrections: Record<number, ChordBoundaryCorrection>;
  membershipCorrections?: Record<string, number[]>;
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
  landmarkTransposeSession?: LandmarkTransposeSession | null;
  landmarkCounterfactualSession?: LandmarkCounterfactualSession | null;
  landmarkPerformanceCapture?: LandmarkPerformanceCapture | null;
  landmarkRouteCompareSession?: LandmarkRouteCompareSession | null;
  soundModelId?: PianoSoundModelId;
  scaleWalkSession?: ScaleWalkSession | null;
  scaleFingerprintSession?: ScaleFingerprintSession | null;
  gravityCounterfactualSession?: GravityCounterfactualSession | null;
  controlledSonoritySession?: ControlledSonoritySession | null;
  chordFocusMode?: ChordFocusMode;
  chordVoicingEchoSession?: ChordVoicingEchoSession | null;
  chordMotionEchoSession?: ChordMotionEchoSession | null;
  motionFocusMode?: MotionFocusMode;
  pulseMirrorSession?: PulseMirrorSession | null;
  motifEchoSession?: MotifEchoSession | null;
  phraseCompareSession?: PhraseCompareSession | null;
};

const WHITE_PITCH_CLASSES = new Set([0, 2, 4, 5, 7, 9, 11]);
const VISIBLE_NOTES = Array.from({ length: 25 }, (_, index) => 48 + index);
const WHITE_NOTES = VISIBLE_NOTES.filter((note) => WHITE_PITCH_CLASSES.has(pitchClassFromMidi(note)));
const DEFAULT_SCALE = PIANO_SCALES[0];
const FIFTHS_ORDER = fifthsCircle();
const EVENT_X = (slot: number) => 84 + slot * 88;
const FOCUS_LENSES: Array<{ id: FocusLens; label: string; description: string }> = [
  { id: "explore", label: "Explore", description: "See the whole phrase across every representation." },
  { id: "immersion", label: "Immersion", description: "Let register, fifths, intervals, timing, chords, and pull become one living sky." },
  { id: "interval-glow", label: "Interval Glow", description: "Make each exact semitone spacing a stable place, color, and phrase trace." },
  { id: "sight-shapes", label: "Sight Shapes", description: "Read staff geometry as one shape for the eyes, hands, and ear." },
  { id: "research", label: "Research HUD", description: "Compare semitone, interval-orbit, thirds-lattice, and all-pairs maps." },
  { id: "gravity", label: "Scale Gravity", description: "Hold one degree while IV, V, and I change its role beneath you." },
  { id: "intervals", label: "Intervals", description: "Connect spacing, frequency ratio, and transferable hand shape." },
  { id: "scales", label: "Scales", description: "See how pitch evidence suggests Do and a scale route." },
  { id: "chords", label: "Chords", description: "Choose one question about a note, a chord change, or a new voicing." },
  { id: "motion", label: "Motion", description: "Choose one question about pulse, touch, breath, voices, or motif." },
  { id: "paths", label: "Paths", description: "Play pop, blues, cadence, and pedal-point archetypes as transferable relationships." },
  { id: "experience", label: "Experience", description: "Report how this phrase felt; keep your response separate from modeled evidence." },
];
const MOTION_FOCUS_MODES: Array<{ id: MotionFocusMode; label: string; question: string }> = [
  { id: "pulse", label: "Pulse", question: "Where did each attack land?" },
  { id: "touch", label: "Touch", question: "How did one touch meet the next?" },
  { id: "breath", label: "Breath", question: "Where did the phrase leave space?" },
  { id: "voices", label: "Voices", question: "Which strands stayed or moved?" },
  { id: "motif", label: "Motif", question: "What repeated, and what changed?" },
];
const CHORD_FOCUS_MODES: Array<{ id: ChordFocusMode; label: string; question: string; instruction: string }> = [
  { id: "cause", label: "One note", question: "What did this one note change?", instruction: "Hold a field, then add or release exactly one key." },
  { id: "change", label: "Two chords", question: "What changed between these chords?", instruction: "Play two grouped gestures and inspect five separate lenses." },
  { id: "echo", label: "New voicing", question: "What survives when the hand shape changes?", instruction: "Freeze one grouped chord, then voice or transpose its relationship elsewhere." },
];
const PHRASE_CHANGE_CHOICES: Array<{
  id: PhraseChangeIntention;
  label: string;
  question: string;
  instruction: string;
  control: string;
}> = [
  { id: "transpose", label: "Move the whole phrase", question: "Can the relationship survive a new register?", instruction: "Replay every pitch by the same number of semitones.", control: "the signed interval path" },
  { id: "timing", label: "Change the timing", question: "What changes when the pitch path keeps different time?", instruction: "Keep the same pitches. Change one pause for the pause microscope, or reshape the broader timing path.", control: "the absolute pitch path" },
  { id: "touch", label: "Change the touch", question: "What changes when the same keys receive a different attack?", instruction: "Keep the same pitches; use a different MIDI attack strength.", control: "the absolute pitch path" },
  { id: "articulation", label: "Change the connections", question: "What changes when notes overlap or separate differently?", instruction: "Keep the same pitches; change finger hold, silence, overlap, or pedal connection.", control: "the absolute pitch path" },
  { id: "interval", label: "Change one interval", question: "How far does one changed spacing travel through the phrase?", instruction: "Keep the attack count; alter exactly one signed move.", control: "one and only one changed signed interval" },
  { id: "ending", label: "Change the ending", question: "How does one new ending reshape context?", instruction: "Keep the earlier path; choose a different final position.", control: "the earlier path with only its final move changed" },
];
const GRAVITY_CUE_OPTIONS: Array<{ id: TonalGravityCue; label: string; shortLabel: string; practice: string }> = [
  { id: "duration", label: "Held longest", shortLabel: "held time", practice: "Replay the same pitch collection and hold this position longer than the others." },
  { id: "recurrence", label: "Repeated most", shortLabel: "recurrence", practice: "Replay the same collection while returning to this position more often." },
  { id: "accent", label: "Attacked strongest", shortLabel: "attack", practice: "Replay it and give this position the strongest MIDI attack." },
  { id: "bass", label: "Placed lowest", shortLabel: "low register", practice: "Replay it with this pitch class below the other positions." },
  { id: "ending", label: "Phrase ends here", shortLabel: "ending", practice: "Replay the same collection and let this position be the final attack." },
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

function formatSemitones(value: number, digits = 0, showPlus = false) {
  const rounded = Number(value.toFixed(digits));
  const magnitude = Math.abs(rounded);
  const sign = rounded < 0 ? "−" : rounded > 0 && showPlus ? "+" : "";
  return `${sign}${magnitude.toFixed(digits)} semitone${magnitude === 1 ? "" : "s"}`;
}

function uniqueSorted(notes: number[]) {
  return [...new Set(notes.map(Math.round))].sort((first, second) => first - second);
}

function measureChordGestures(
  gestures: HudChordGesture[],
  membershipCorrections: Readonly<Record<string, number[]>>,
  doMidi: number,
  scale: PianoScale,
  soundModelId: PianoSoundModelId,
  maximumPerceptionNotes = Number.POSITIVE_INFINITY,
): ChordMeasure[] {
  return gestures.map((gesture, index) => {
    const excludedInheritedNotes = (membershipCorrections[gesture.id] ?? []).filter((note) => gesture.inheritedNotes.includes(note));
    const interpretedNotes = interpretedChordNotes(gesture, excludedInheritedNotes);
    const pitchClassCount = new Set(interpretedNotes.map(pitchClassFromMidi)).size;
    const candidates = pitchClassCount <= 5 ? identifyChordCandidates(interpretedNotes, 3) : [];
    const candidate = candidates.find((item) => item.exact) ?? candidates[0] ?? null;
    const audibleNotes = gesture.soundingNotesAtClose.length ? gesture.soundingNotesAtClose : uniqueSorted(gesture.attackedNotes);
    const perception = audibleNotes.length >= 2 && audibleNotes.length <= maximumPerceptionNotes
      ? sonorityPerceptionModel(audibleNotes.map((note) => pianoSoundVoice(frequencyFromMidi(note), 0.72, soundModelId)))
      : null;
    const tendency = tonalTendency(interpretedNotes, doMidi, scale);
    const previous = gestures[index - 1];
    const previousInterpretedNotes = previous ? interpretedChordNotes(previous, membershipCorrections[previous.id] ?? []) : [];
    const previousPitchClassCount = new Set(previousInterpretedNotes.map(pitchClassFromMidi)).size;
    const previousCandidates = previous && previousPitchClassCount <= 5 ? identifyChordCandidates(previousInterpretedNotes, 3) : [];
    const previousCandidate = previousCandidates.find((item) => item.exact) ?? previousCandidates[0] ?? null;
    const transition = chordTransitionEvidence(previous ? previousInterpretedNotes : null, interpretedNotes, previousCandidate?.exact ? previousCandidate.rootPitchClass : null, candidate?.exact ? candidate.rootPitchClass : null);
    return {
      gesture,
      interpretedNotes,
      audibleNotes,
      excludedInheritedNotes,
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
  });
}

function samePitchClasses(firstNotes: number[], secondPitchClasses: number[]) {
  const first = [...new Set(firstNotes.map(pitchClassFromMidi))].sort((a, b) => a - b);
  const second = [...new Set(secondPitchClasses.map(pitchClassFromMidi))].sort((a, b) => a - b);
  return first.length === second.length && first.every((pitchClass, index) => pitchClass === second[index]);
}

function sameMidiNotes(firstNotes: number[], secondNotes: number[]) {
  const first = uniqueSorted(firstNotes);
  const second = uniqueSorted(secondNotes);
  return first.length === second.length && first.every((note, index) => note === second[index]);
}

function isMidiNoteList(value: unknown, minimumLength = 0): value is number[] {
  return Array.isArray(value) && value.length >= minimumLength && value.every((note) => Number.isInteger(note) && note >= 0 && note <= 127);
}

function isControlledSonoritySession(value: unknown): value is ControlledSonoritySession {
  if (!value || typeof value !== "object") return false;
  const session = value as Partial<ControlledSonoritySession>;
  const recipeValid = session.recipeId === "live" || CONTROLLED_SONORITY_FIELDS.some((field) => field.id === session.recipeId);
  const scaleValid = PIANO_SCALES.some((scale) => scale.id === session.scaleId);
  const baselineValid = session.baselineNotes == null || isMidiNoteList(session.baselineNotes, 2);
  return recipeValid
    && Number.isInteger(session.rootPitchClass)
    && session.rootPitchClass! >= 0
    && session.rootPitchClass! < 12
    && scaleValid
    && isMidiNoteList(session.targetNotes)
    && baselineValid
    && typeof session.replayRequired === "boolean";
}

function isChordFocusMode(value: unknown): value is ChordFocusMode {
  return CHORD_FOCUS_MODES.some((mode) => mode.id === value);
}

function isChordVoicingEchoSession(value: unknown): value is ChordVoicingEchoSession {
  if (!value || typeof value !== "object") return false;
  const session = value as Partial<ChordVoicingEchoSession>;
  return Number.isInteger(session.anchorEventId)
    && session.anchorEventId! >= 0
    && isMidiNoteList(session.sourceNotes, 2)
    && session.sourceNotes!.length <= 6
    && new Set(session.sourceNotes!.map(pitchClassFromMidi)).size >= 2
    && Array.isArray(session.sourceEvents)
    && session.sourceEvents.length >= 2
    && session.sourceEvents.length <= 12
    && new Set(session.sourceEvents.map((event) => event?.id)).size === session.sourceEvents.length
    && session.sourceEvents.every((event) => event
      && Number.isInteger(event.id) && event.id > 0 && event.id <= session.anchorEventId!
      && Number.isInteger(event.note) && event.note >= 0 && event.note <= 127
      && Number.isFinite(event.velocity) && event.velocity >= 0 && event.velocity <= 127
      && Number.isFinite(event.onsetMs)
      && (event.keyReleaseMs == null || Number.isFinite(event.keyReleaseMs))
      && (event.releaseMs == null || Number.isFinite(event.releaseMs))
      && (event.source === "midi" || event.source === "screen")
      && isMidiNoteList(event.fieldNotes))
    && Number.isInteger(session.rootPitchClass)
    && session.rootPitchClass! >= 0
    && session.rootPitchClass! < 12
    && PIANO_SCALES.some((scale) => scale.id === session.scaleId);
}

function isChordMotionEchoSession(value: unknown): value is ChordMotionEchoSession {
  if (!value || typeof value !== "object") return false;
  const session = value as Partial<ChordMotionEchoSession>;
  const validNotes = (notes: unknown) => isMidiNoteList(notes, 2)
    && notes.length <= 6
    && new Set(notes.map(pitchClassFromMidi)).size >= 2;
  const validEvents = (events: unknown) => Array.isArray(events)
    && events.length >= 2
    && events.length <= 12
    && new Set(events.map((event) => event?.id)).size === events.length
    && events.every((event) => event
      && Number.isInteger(event.id) && event.id > 0 && event.id <= session.anchorEventId!
      && Number.isInteger(event.note) && event.note >= 0 && event.note <= 127
      && Number.isFinite(event.velocity) && event.velocity >= 0 && event.velocity <= 127
      && Number.isFinite(event.onsetMs)
      && (event.keyReleaseMs == null || Number.isFinite(event.keyReleaseMs))
      && (event.releaseMs == null || Number.isFinite(event.releaseMs))
      && (event.source === "midi" || event.source === "screen")
      && isMidiNoteList(event.fieldNotes));
  const validAttackIds = (ids: unknown, events: unknown) => ids == null || (Array.isArray(ids)
    && Array.isArray(events)
    && ids.length >= 2
    && new Set(ids).size === ids.length
    && ids.every((id) => Number.isInteger(id) && events.some((event) => event?.id === id)));
  return Number.isInteger(session.anchorEventId)
    && session.anchorEventId! >= 0
    && Number.isInteger(session.attemptAnchorEventId)
    && session.attemptAnchorEventId! >= session.anchorEventId!
    && validNotes(session.sourceBeforeNotes)
    && validNotes(session.sourceAfterNotes)
    && validEvents(session.sourceBeforeEvents)
    && validEvents(session.sourceAfterEvents)
    && validAttackIds(session.sourceBeforeAttackEventIds, session.sourceBeforeEvents)
    && validAttackIds(session.sourceAfterAttackEventIds, session.sourceAfterEvents)
    && Number.isInteger(session.rootPitchClass)
    && session.rootPitchClass! >= 0
    && session.rootPitchClass! < 12
    && PIANO_SCALES.some((scale) => scale.id === session.scaleId);
}

function isMotionFocusMode(value: unknown): value is MotionFocusMode {
  return MOTION_FOCUS_MODES.some((mode) => mode.id === value);
}

function isPhraseChangeIntention(value: unknown): value is PhraseChangeIntention {
  return PHRASE_CHANGE_CHOICES.some((choice) => choice.id === value);
}

function isPulseMirrorSession(value: unknown): value is PulseMirrorSession {
  if (!value || typeof value !== "object") return false;
  const session = value as Partial<PulseMirrorSession>;
  return Number.isInteger(session.anchorEventId)
    && session.anchorEventId! >= 0
    && Array.isArray(session.capturedTapEventIds)
    && (session.capturedTapEventIds.length === 0 || session.capturedTapEventIds.length === 4)
    && session.capturedTapEventIds.every((id) => Number.isInteger(id) && id > session.anchorEventId!);
}

function isMotifEchoSession(value: unknown): value is MotifEchoSession {
  if (!value || typeof value !== "object") return false;
  const session = value as Partial<MotifEchoSession>;
  const sourceEvents = session.sourceEvents;
  if (!isFrozenPhraseSpecimen(sourceEvents, 4)
    || (sourceEvents.length !== 3 && sourceEvents.length !== 4)
    || !Number.isInteger(session.anchorEventId)
    || session.anchorEventId! < Math.max(...sourceEvents.map((event) => event.id))) return false;
  const attempts = session.attempts ?? [];
  if (!Array.isArray(attempts) || attempts.length > 3 || attempts.some((attempt) => !isFrozenPhraseSpecimen(attempt, 4) || attempt.length !== sourceEvents.length)) return false;
  if (session.returnReport != null && session.returnReport !== "not-return" && session.returnReport !== "uncertain" && session.returnReport !== "felt-return") return false;
  const ids = [...sourceEvents, ...attempts.flat()].map((event) => event.id);
  const sourceLastId = Math.max(...sourceEvents.map((event) => event.id));
  const returnObservations = session.returnObservations ?? [];
  if (!Array.isArray(returnObservations) || returnObservations.length > 4 || returnObservations.some((observation) => !observation
    || !Array.isArray(observation.targetEventIds)
    || observation.targetEventIds.length !== sourceEvents.length
    || new Set(observation.targetEventIds).size !== observation.targetEventIds.length
    || observation.targetEventIds.some((id) => !Number.isInteger(id) || id <= sourceLastId)
    || (observation.relationship !== "exact-repeat" && observation.relationship !== "transposed-repeat")
    || !Number.isInteger(observation.startShiftSemitones)
    || (observation.report !== "not-return" && observation.report !== "uncertain" && observation.report !== "felt-return"))) return false;
  if (new Set(returnObservations.map((observation) => observation.targetEventIds.join("-"))).size !== returnObservations.length) return false;
  return new Set(ids).size === ids.length
    && attempts.flat().every((event) => event.id > sourceLastId && event.id <= session.anchorEventId!);
}

function isScaleFingerprintSession(value: unknown): value is ScaleFingerprintSession {
  if (!value || typeof value !== "object") return false;
  const session = value as Partial<ScaleFingerprintSession>;
  const validSteps = (steps: unknown) => steps == null || (Array.isArray(steps)
    && steps.length >= 1
    && steps.every((step) => Number.isInteger(step) && step > 0 && step < 12)
    && steps.reduce((sum, step) => sum + step, 0) === 12);
  return Number.isInteger(session.anchorEventId)
    && session.anchorEventId! >= 0
    && (session.exercise === "build" || session.exercise === "transpose" || session.exercise === "rotate" || session.exercise === "mutate")
    && validSteps(session.sourceSteps)
    && validSteps(session.expectedSteps)
    && typeof session.revealNames === "boolean"
    && (session.sourceBaseMidi == null || (Number.isInteger(session.sourceBaseMidi) && session.sourceBaseMidi! >= 0 && session.sourceBaseMidi! <= 115))
    && (session.exercise === "build"
      || (session.exercise === "mutate" && session.sourceSteps != null && session.expectedSteps == null)
      || (session.sourceSteps != null && session.expectedSteps != null));
}

function isGravityCounterfactualSession(value: unknown): value is GravityCounterfactualSession {
  if (!value || typeof value !== "object") return false;
  const session = value as Partial<GravityCounterfactualSession>;
  const cues: TonalGravityCue[] = ["duration", "recurrence", "accent", "bass", "ending"];
  if (!Array.isArray(session.specimen) || session.specimen.length < 3 || session.specimen.length > 24 || !cues.includes(session.cue as TonalGravityCue)) return false;
  const validEvents = session.specimen.every((event) => event
    && Number.isInteger(event.id)
    && Number.isInteger(event.note) && event.note >= 0 && event.note <= 127
    && Number.isFinite(event.velocity) && event.velocity >= 0 && event.velocity <= 127
    && Number.isFinite(event.onsetMs) && event.onsetMs >= 0
    && (event.keyReleaseMs == null || Number.isFinite(event.keyReleaseMs))
    && (event.releaseMs == null || Number.isFinite(event.releaseMs))
    && (event.source === "midi" || event.source === "screen")
    && isMidiNoteList(event.fieldNotes));
  if (!validEvents || !Number.isInteger(session.targetPitchClass) || session.targetPitchClass! < 0 || session.targetPitchClass! >= 12) return false;
  return Number.isInteger(session.rootPitchClass)
    && session.rootPitchClass! >= 0
    && session.rootPitchClass! < 12
    && PIANO_SCALES.some((scale) => scale.id === session.scaleId)
    && session.specimen.some((event) => pitchClassFromMidi(event.note) === session.targetPitchClass);
}

function isFrozenPhraseSpecimen(value: unknown, maximumLength = 12): value is HudNoteEvent[] {
  return Array.isArray(value)
    && value.length >= 3
    && value.length <= maximumLength
    && value.every((event) => event
      && Number.isInteger(event.id)
      && Number.isInteger(event.note) && event.note >= 0 && event.note <= 127
      && Number.isFinite(event.velocity) && event.velocity >= 0 && event.velocity <= 127
      && Number.isFinite(event.onsetMs) && event.onsetMs >= 0
      && (event.keyReleaseMs == null || Number.isFinite(event.keyReleaseMs))
      && (event.releaseMs == null || Number.isFinite(event.releaseMs))
      && (event.source === "midi" || event.source === "screen")
      && isMidiNoteList(event.fieldNotes));
}

function isLandmarkPerformanceCapture(value: unknown): value is LandmarkPerformanceCapture {
  if (!value || typeof value !== "object") return false;
  const capture = value as Partial<LandmarkPerformanceCapture>;
  return LANDMARK_PATHS.some((path) => path.id === capture.pathId)
    && Number.isInteger(capture.rootPitchClass)
    && capture.rootPitchClass! >= 0
    && capture.rootPitchClass! < 12
    && (capture.variant === "original" || capture.variant === "transposed" || capture.variant === "one-key-changed")
    && Array.isArray(capture.fieldEventIds)
    && capture.fieldEventIds.length <= 8
    && capture.fieldEventIds.every((field) => Array.isArray(field)
      && field.length >= 1
      && field.length <= 8
      && new Set(field).size === field.length
      && field.every((id) => Number.isInteger(id) && id > 0));
}

function isLandmarkRouteCompareSession(value: unknown): value is LandmarkRouteCompareSession {
  if (!value || typeof value !== "object") return false;
  const session = value as Partial<LandmarkRouteCompareSession>;
  return LANDMARK_PATHS.some((path) => path.id === session.sourcePathId)
    && LANDMARK_PATHS.some((path) => path.id === session.targetPathId)
    && session.sourcePathId !== session.targetPathId
    && (session.sourceVariant === "original" || session.sourceVariant === "one-key-changed");
}

function isPhraseCompareSession(value: unknown): value is PhraseCompareSession {
  if (!value || typeof value !== "object") return false;
  const session = value as Partial<PhraseCompareSession>;
  const reports = session.reports ?? {};
  const validReports = Object.entries(reports).every(([key, report]) => (key === "settledness" || key === "energy" || key === "liking")
    && (report === "a" || report === "same" || report === "b"));
  return isFrozenPhraseSpecimen(session.baseline)
    && (session.comparison == null || isFrozenPhraseSpecimen(session.comparison))
    && Number.isInteger(session.anchorEventId)
    && session.anchorEventId! >= 0
    && Number.isInteger(session.rootPitchClass)
    && session.rootPitchClass! >= 0
    && session.rootPitchClass! < 12
    && PIANO_SCALES.some((scale) => scale.id === session.scaleId)
    && (session.intention == null || isPhraseChangeIntention(session.intention))
    && validReports;
}

function freezeGravitySpecimen(events: HudNoteEvent[], captureAtMs: number) {
  const selected = events.slice(-24);
  const origin = selected[0]?.onsetMs ?? 0;
  return selected.map((event) => ({
    ...event,
    onsetMs: Math.max(0, event.onsetMs - origin),
    keyReleaseMs: Math.max(0, (event.keyReleaseMs ?? Math.max(captureAtMs, event.onsetMs)) - origin),
    releaseMs: Math.max(0, (event.releaseMs ?? Math.max(captureAtMs, event.onsetMs)) - origin),
  }));
}

function freezePhraseSpecimen(events: HudNoteEvent[], captureAtMs: number) {
  const selected = events.slice(-12);
  const origin = selected[0]?.onsetMs ?? 0;
  return selected.map((event) => ({
    ...event,
    onsetMs: Math.max(0, event.onsetMs - origin),
    keyReleaseMs: Math.max(0, (event.keyReleaseMs ?? Math.max(captureAtMs, event.onsetMs)) - origin),
    releaseMs: Math.max(0, (event.releaseMs ?? Math.max(captureAtMs, event.onsetMs)) - origin),
  }));
}

function latestReplayablePhrase(events: HudNoteEvent[]) {
  const selected = events.slice(-12);
  for (let index = selected.length - 1; index > 0; index -= 1) {
    if (selected[index].onsetMs - selected[index - 1].onsetMs > 1_600 && selected.length - index >= 3) return selected.slice(index);
  }
  return selected;
}

function frozenSpecimenNow(events: HudNoteEvent[]) {
  return events.reduce((latest, event) => Math.max(latest, event.releaseMs ?? event.keyReleaseMs ?? event.onsetMs), 0);
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
  const noveltyValues: number[] = events.slice(1).map((event, index) => events.slice(0, index + 1).some((prior) => pitchClassFromMidi(prior.note) === pitchClassFromMidi(event.note)) ? 0 : 1);
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

function diatonicIndex(note: number, prefer: "sharps" | "flats" = "sharps") {
  const letterByPitchClass = prefer === "flats"
    ? [0, 1, 1, 2, 2, 3, 4, 4, 5, 5, 6, 6]
    : [0, 0, 1, 1, 2, 3, 3, 4, 4, 5, 5, 6];
  return (Math.floor(note / 12) - 1) * 7 + letterByPitchClass[pitchClassFromMidi(note)];
}

function staffY(note: number, prefer: "sharps" | "flats" = "sharps") {
  const index = diatonicIndex(note, prefer);
  return note >= 60 ? 88 - (index - 30) * 6 : 186 - (index - 18) * 6;
}

function ledgerLines(note: number, prefer: "sharps" | "flats" = "sharps") {
  const y = staffY(note, prefer);
  const lines: number[] = [];
  const limits = note >= 60 ? { top: 40, bottom: 88 } : { top: 138, bottom: 186 };
  if (y < limits.top) for (let line = limits.top - 12; line >= y - 1; line -= 12) lines.push(line);
  if (y > limits.bottom) for (let line = limits.bottom + 12; line <= y + 1; line += 12) lines.push(line);
  return lines;
}

function StaffView({ events, gestures, selectedChordId, doMidi, scale, focusedId, showConventions }: {
  events: HudNoteEvent[]; gestures: HudChordGesture[]; selectedChordId: string | null; doMidi: number; scale: PianoScale; focusedId: number | null; showConventions: boolean;
}) {
  const pitchPreference = preferredAccidentalsForTonic(doMidi);
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
          const y = staffY(event.note, pitchPreference);
          const context = noteContext(event.note, doMidi, scale);
          const black = !WHITE_PITCH_CLASSES.has(pitchClassFromMidi(event.note));
          return <g key={event.id} className={event.id === focusedId ? "is-focused" : ""}>
            {ledgerLines(event.note, pitchPreference).map((lineY) => <line key={lineY} x1={x - 12} x2={x + 12} y1={lineY} y2={lineY} className="hud-ledger-line" />)}
            <ellipse cx={x} cy={y} rx="9" ry="6" className="hud-note-head" transform={`rotate(-14 ${x} ${y})`} />
            <line x1={x + 8} x2={x + 8} y1={y} y2={y - 31} className="hud-note-stem" />
            {black ? <text x={x - 18} y={y + 5} className="hud-accidental">{pitchPreference === "flats" ? "♭" : "♯"}</text> : null}
            <text x={x} y="214" className="hud-event-label">{slot + 1} · {showConventions ? conventionalPitchName(event.note, pitchPreference) : context.syllable}</text>
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
          const label = measure.candidate ? `${measure.candidate.exact ? "" : "≈ "}${chordLabel(measure.candidate, doMidi, showConventions)}` : `${new Set(measure.interpretedNotes.map(pitchClassFromMidi)).size}-position field`;
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
            <small>{measure.interpretedNotes.length} read · {measure.audibleNotes.length} sounding</small>
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
  const pitchPreference = preferredAccidentalsForTonic(doMidi);
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
      <div className="hud-panel-heading"><span>12-TET reference</span><strong>Reference-frequency height</strong><small>Derived from MIDI key number at A4=440 Hz; equal vertical steps mean equal reference-frequency ratios.</small></div>
      <svg viewBox="0 0 720 162" role="img" aria-label={events.length ? `Reference-frequency trace from ${formatHz(frequencyFromMidi(events[0].note))} to ${formatHz(frequencyFromMidi(events.at(-1)!.note))}` : "Empty reference-frequency trace"}>
        <title>12-TET reference-frequency trace aligned to the grand staff</title>
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
            <text x={EVENT_X(slot)} y={Math.max(14, yFor(event.note) - 10)} className="hud-point-label">{showConventions ? conventionalPitchName(event.note, pitchPreference) : context.syllable}</text>
            <text x={EVENT_X(slot)} y="153" className="hud-event-label">{event.note === doMidi ? "0 st · 1:1" : `${context.rawStepsFromDo > 0 ? "+" : ""}${context.rawStepsFromDo} st · ${landmark.landmarkLabel}`}</text>
          </g>;
        })}
      </svg>
    </div>
  );
}

function FifthsCompass({ events, activeNotes, chordNotes, chordRootPitchClass, doMidi, scale, focusedNote, showConventions, onChooseDo }: {
  events: HudNoteEvent[]; activeNotes: number[]; chordNotes: number[]; chordRootPitchClass: number | null; doMidi: number; scale: PianoScale; focusedNote: number | null; showConventions: boolean; onChooseDo: (pitchClass: number) => void;
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
      <div className="hud-panel-heading"><span>Pitch geography</span><strong>Fifths compass</strong><small>One clockwise fifths step is +7 semitones modulo the octave (or −5 by the shorter route), near 3:2. Choose any position to make it movable Do.</small></div>
      <div className="hud-fifths-circle" role="group" aria-label="Choose movable Do around the circle of fifths; event numbers, active notes, and selected chord members remain marked">
        <div className="hud-fifths-center"><span>{chordNotes.length ? "selected chord" : "current frame"}</span><strong>{chordNotes.length ? chordRootPitchClass == null ? "root ?" : showConventions ? CONVENTIONAL_PITCH_CLASSES[chordRootPitchClass] : CHROMATIC_SOLFEGE[pitchClassFromMidi(chordRootPitchClass - pitchClassFromMidi(doMidi))] : "Do"}</strong><small>{chordNotes.length ? chordRootPitchClass == null ? `${new Set(chordNotes.map(pitchClassFromMidi)).size} positions · outline` : `${new Set(chordNotes.map(pitchClassFromMidi)).size} positions · exact root` : showConventions ? CONVENTIONAL_PITCH_CLASSES[pitchClassFromMidi(doMidi)] : scale.name.replace(" route", "")}</small></div>
        {FIFTHS_ORDER.nodes.map((node) => {
          const absolutePc = node.pitchClass;
          const relative = CHROMATIC_SOLFEGE[pitchClassFromMidi(absolutePc - pitchClassFromMidi(doMidi))];
          const eventVisits = visits.get(node.step) ?? [];
          const className = ["hud-fifth-node", node.step === doStep ? "is-home" : "", activeSteps.has(node.step) ? "is-active" : "", chordSteps.has(node.step) ? "is-chord-member" : "", node.step === chordRootStep ? "is-chord-root" : "", node.step === focusedStep ? "is-focused" : ""].filter(Boolean).join(" ");
          const semitoneOffset = pitchClassFromMidi(absolutePc - pitchClassFromMidi(doMidi));
          return <button type="button" key={node.step} className={className} style={{ "--fifth-angle": `${node.step * 30}deg` } as CSSProperties} aria-pressed={node.step === doStep} aria-label={`${node.step === doStep ? "Current movable Do" : `Make ${relative} movable Do`}; ${semitoneOffset} semitone${semitoneOffset === 1 ? "" : "s"} above current Do modulo the octave; fifths step ${node.step}${eventVisits.length ? `; attacks ${eventVisits.join(", ")}` : ""}`} onClick={() => onChooseDo(absolutePc)}>
            <strong>{showConventions ? CONVENTIONAL_PITCH_CLASSES[absolutePc] : relative}</strong>
            <span>{eventVisits.length ? eventVisits.join("·") : "·"}</span>
          </button>;
        })}
      </div>
    </div>
  );
}

function FifthsDerivation({ doMidi, showConventions, onChooseDo }: { doMidi: number; showConventions: boolean; onChooseDo: (pitchClass: number) => void }) {
  const [stackedMoves, setStackedMoves] = useState(12);
  const [temperamentPercent, setTemperamentPercent] = useState(0);
  const blend = temperamentPercent / 100;
  const spiral = fifthsSpiral(blend);
  const visibleNodes = spiral.nodes.slice(0, stackedMoves + 1);
  const pointFor = (node: typeof spiral.nodes[number]) => {
    const angle = (node.step / 12 + node.cumulativeDriftCents / 1200) * Math.PI * 2 - Math.PI / 2;
    const radius = 98 + (1 - blend) * (node.step - 6) * 3.4;
    return { x: 180 + Math.cos(angle) * radius, y: 180 + Math.sin(angle) * radius };
  };
  const points = visibleNodes.map(pointFor);
  const current = visibleNodes.at(-1)!;
  const currentPoint = points.at(-1)!;
  const closure = Math.abs(spiral.closureDriftCents);
  const perFifthCorrection = spiral.pureFifthCents - spiral.displayedFifthCents;
  const doPitchClass = pitchClassFromMidi(doMidi);
  const currentAbsolutePitchClass = pitchClassFromMidi(doPitchClass + current.pitchClass);
  const currentRole = CHROMATIC_SOLFEGE[current.pitchClass];
  const currentLabel = showConventions ? CONVENTIONAL_PITCH_CLASSES[currentAbsolutePitchClass] : currentRole;
  const currentIsDo = current.pitchClass === 0;
  const description = `${stackedMoves} stacked fifth moves shown. Each displayed fifth is ${spiral.displayedFifthCents.toFixed(3)} cents. The twelve-step closure mismatch is ${closure.toFixed(2)} cents. ${temperamentPercent === 100 ? "The path closes on the 12-TET circle." : "The path remains an open spiral."}`;
  return <section className="hud-fifths-derivation" aria-labelledby="hud-fifths-derivation-title">
    <div className="hud-panel-heading"><span>3:2 → octave fold → keyboard circle</span><strong id="hud-fifths-derivation-title">Why the fifths circle is first a spiral</strong><small>One question: what is gained—and changed—when a pure relationship is adjusted until the keyboard cycle closes?</small></div>
    <div className="hud-fifths-derivation-body">
      <div className="hud-fifths-spiral-field">
        <svg viewBox="0 0 360 360" role="img" aria-label={description}>
          <title>Repeated fifths morphing from a nonclosing pure-ratio spiral to an equal-tempered circle</title>
          <circle cx="180" cy="180" r="98" className="hud-fifths-reference-circle" />
          <polyline points={points.map((point) => `${point.x},${point.y}`).join(" ")} className="hud-fifths-spiral-path" />
          {visibleNodes.map((node, index) => {
            const point = points[index];
            const relative = CHROMATIC_SOLFEGE[node.pitchClass];
            const absolutePitchClass = pitchClassFromMidi(doPitchClass + node.pitchClass);
            const label = showConventions ? CONVENTIONAL_PITCH_CLASSES[absolutePitchClass] : relative;
            return <g key={node.step} className={`${node.step === stackedMoves ? "is-current" : ""} ${node.step === 12 ? "is-return" : ""}`} style={{ transform: `translate(${point.x}px, ${point.y}px)` } as CSSProperties}>
              <circle cx="0" cy="0" r={node.step === stackedMoves ? 8 : 5} className="hud-fifths-spiral-node"><title>{`Move ${node.step}: ${label}; ${node.displayedFoldedCents.toFixed(2)} cents after octave folding`}</title></circle>
              {(node.step === 0 || node.step === stackedMoves || node.step === 12) ? <text x="0" y="-12" className="hud-fifths-spiral-label">{node.step === 12 ? `return ${label}` : `${node.step} · ${label}`}</text> : null}
            </g>;
          })}
          {stackedMoves === 12 ? <line x1={points[0].x} y1={points[0].y} x2={currentPoint.x} y2={currentPoint.y} className="hud-fifths-closure-gap" /> : null}
          <text x="180" y="174" className="hud-fifths-center-label">{temperamentPercent === 0 ? "pure 3:2" : temperamentPercent === 100 ? "12-TET" : `${temperamentPercent}% corrected`}</text>
          <text x="180" y="193" className="hud-fifths-center-value">{spiral.displayedFifthCents.toFixed(3)}¢ / fifth</text>
        </svg>
        <small>Angle carries accumulated cents beyond the equal-tempered position; radius separates successive moves so the open return stays visible.</small>
        <button type="button" onClick={() => onChooseDo(currentAbsolutePitchClass)} disabled={current.step === 12 || currentIsDo} aria-label={currentIsDo ? `Spiral move ${current.step} is the current movable Do` : `Make ${currentLabel} from spiral move ${current.step} movable Do`}>{current.step === 12 ? "Return points to the same key position" : currentIsDo ? `Move ${current.step} · ${currentLabel} is current Do` : `Make move ${current.step} · ${currentLabel} the new Do`}</button>
      </div>
      <div className="hud-fifths-controls">
        <label htmlFor="hud-fifths-stack"><span>Stack pure 3:2 moves</span><strong>{stackedMoves} of 12</strong></label>
        <input id="hud-fifths-stack" type="range" min="0" max="12" step="1" value={stackedMoves} onInput={(event) => setStackedMoves(Number(event.currentTarget.value))} onChange={(event) => setStackedMoves(Number(event.target.value))} />
        <label htmlFor="hud-fifths-temper"><span>Apply equal-temperament correction</span><strong>{temperamentPercent}%</strong></label>
        <input id="hud-fifths-temper" type="range" min="0" max="100" step="1" value={temperamentPercent} onInput={(event) => setTemperamentPercent(Number(event.currentTarget.value))} onChange={(event) => setTemperamentPercent(Number(event.target.value))} />
        <div className="hud-fifths-equation" aria-live="polite">
          <span>relationship repeated</span><strong>(3/2)<sup>{current.step}</sup></strong><small>Start from 1:1 and multiply by the same physical relationship.</small>
          <span>octaves folded away</span><strong>÷ 2<sup>{current.octavesRemoved}</sup> = {current.foldedRatio.toFixed(5)}</strong><small>Doubling or halving changes register while preserving octave-equivalent position.</small>
          <span>remaining closure gap</span><strong>{closure.toFixed(2)} cents</strong><small>{temperamentPercent === 0 ? "Twelve pure fifths overshoot seven octaves." : temperamentPercent === 100 ? `Each fifth is narrowed by ${perFifthCorrection.toFixed(3)} cents, so the cycle closes.` : `${perFifthCorrection.toFixed(3)} cents removed from each fifth; the spiral is partly closed.`}</small>
        </div>
      </div>
    </div>
    <p className="hud-fifths-takeaway"><strong>What stays invariant:</strong> the sequence of fifth-neighbor positions and every played MIDI key. <strong>What changes:</strong> the exact frequency size assigned to each fifth so twelve moves can return to the keyboard’s starting position.</p>
  </section>;
}

function ScaleLens({ events, chordNotes, snapshots, frame, doMidi, showConventions, onAdopt }: {
  events: HudNoteEvent[];
  chordNotes: number[];
  snapshots: Array<ReturnType<typeof scaleFrameTimeline>[number] | undefined>;
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
  const oneSemitoneGaps = frame.scale.steps.filter((gap) => gap === 1).length;
  const routeGapCopy = `${frame.scale.steps.join("–")} semitones`;
  const candidates = latest ? [latest.leading, ...latest.runnersUp].filter((candidate): candidate is ScaleCandidate => Boolean(candidate)) : [];
  return (
    <div className="hud-scale-panel">
      <div className="hud-panel-heading"><span>Scale hypothesis</span><strong>Scale lens</strong><small>{latest?.evidenceLabel ?? "no evidence"} · compatibility, not certainty</small></div>
      <div className="hud-scale-current">
        <span>{showConventions ? `Do = ${CONVENTIONAL_PITCH_CLASSES[pitchClassFromMidi(doMidi)]}` : "movable Do"}</span>
        <strong>{showConventions ? frame.scale.conventionalName : frame.scale.name}</strong>
        <small>{observed.size ? `${compatibleCount}/${observed.size} observed positions fit this route` : "Play four distinct positions before automatic reframing."}</small>
      </div>
      <div className="hud-scale-rail" role="img" aria-label={`Twelve semitone positions showing scale membership and observed positions. Selected route gap loop ${routeGapCopy}; the gaps total twelve semitones.`}>
        {Array.from({ length: 12 }, (_, position) => {
          const inScale = positions.has(position);
          const seen = observed.has(position);
          const inChord = chordPositions.has(position);
          const context = noteContext(doMidi + position, doMidi, frame.scale);
          return <div key={position} className={`${inScale ? "is-in-scale" : ""} ${seen ? "is-seen" : ""} ${inChord ? "is-chord-tone" : ""}`} title={`${showConventions ? CONVENTIONAL_PITCH_CLASSES[pitchClassFromMidi(doMidi + position)] : context.syllable}: ${position} semitone${position === 1 ? "" : "s"} above Do; ${inScale ? `route degree ${context.degreeIndex + 1}` : "outside the selected route"}${seen ? "; observed" : ""}${inChord ? "; selected chord member" : ""}`}><span>{showConventions ? CONVENTIONAL_PITCH_CLASSES[pitchClassFromMidi(doMidi + position)] : inScale ? context.syllable : "·"}</span><i>{inChord ? "chord" : seen ? "seen" : inScale ? "route" : ""}</i></div>;
        })}
      </div>
      <div className="hud-scale-gap-reading"><span>Semitone gap loop</span><strong>{routeGapCopy}</strong><small>{oneSemitoneGaps ? `${oneSemitoneGaps} one-semitone hinge${oneSemitoneGaps === 1 ? "" : "s"} make short neighboring moves available.` : "No adjacent route positions are one semitone apart."} Phrase, direction, repetition, and listening history still determine whether a move feels resolving.</small></div>
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

function RouteSelector({ scale, doMidi, frameMode, showConventions, doCaptureArmed, onSelect, onToggleDoCapture }: {
  scale: PianoScale;
  doMidi: number;
  frameMode: FrameMode;
  showConventions: boolean;
  doCaptureArmed: boolean;
  onSelect: (scaleId: PianoScale["id"]) => void;
  onToggleDoCapture: () => void;
}) {
  const positions = scaleSemitones(scale);
  const doLabel = showConventions ? conventionalPitchName(doMidi, preferredAccidentalsForTonic(doMidi)) : "movable Do";
  return <section className="piano-route-selector" aria-labelledby="piano-route-selector-title">
    <div className="piano-route-selected">
      <span>{frameMode === "locked" ? "Selected route · locked" : "Selected route · following evidence"}</span>
      <strong id="piano-route-selector-title">{showConventions ? scale.conventionalName : scale.name}</strong>
      <small>{scale.steps.join("–")} st gaps · positions {positions.join(" · ")} from {doLabel}</small>
      <div className="piano-do-capture">
        <button type="button" aria-pressed={doCaptureArmed} onClick={onToggleDoCapture}>{doCaptureArmed ? "Cancel · waiting for Do" : "Set Do from next note"}</button>
        <small role="status" aria-live="polite">{doCaptureArmed ? "Play one new MIDI or on-screen attack. That pitch becomes Do and the current route locks." : "Available in every Piano focus; the next-note action retains the current route."}</small>
      </div>
    </div>
    <label htmlFor="piano-route-choice">
      <span>Choose a new route</span>
      <select id="piano-route-choice" value={scale.id} onChange={(event) => onSelect(event.target.value as PianoScale["id"])}>
        {PIANO_SCALES.map((candidate) => <option key={candidate.id} value={candidate.id}>{candidate.name} · {candidate.steps.join("–")}</option>)}
      </select>
      <small>A direct choice keeps the current Do and locks this route.</small>
    </label>
    <div className="piano-route-methods">
      <span>How to select a route</span>
      <ol>
        <li><strong>Choose here</strong><small>Locks the menu route at the current Do.</small></li>
        <li><strong>Play while discovering</strong><small>Unlock the frame, then play four distinct positions so evidence can move Do and route.</small></li>
        <li><strong>Adopt a candidate</strong><small>In Explore or Scales, choose a compatible frame to lock its proposed Do and route.</small></li>
      </ol>
      <small>Set Do from next note works across every Piano focus. The fifths compass changes Do while retaining the selected route. Both are explicit learner choices, not detected key.</small>
    </div>
  </section>;
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

function fifthsCoordinateLabel(offset: number) {
  const clockwise = fifthStepForPitchClass(pitchClassFromMidi(offset));
  const signed = clockwise <= 6 ? clockwise : clockwise - 12;
  if (signed === 0) return "same fifths position as Do";
  return `${signed > 0 ? "+" : ""}${signed} repeated-fifth move${Math.abs(signed) === 1 ? "" : "s"} from Do`;
}

function ScaleLandingSpectralConsequence({
  ripple,
  retainedPosition,
  sourceBaseMidi,
  soundModelId,
}: {
  ripple: ScaleLandingIntervalRipple;
  retainedPosition: number;
  sourceBaseMidi: number;
  soundModelId: PianoSoundModelId;
}) {
  const relationship = ripple.relationships.find((item) => item.retainedPosition === retainedPosition)!;
  const sourceNotes = [sourceBaseMidi + ripple.sourcePosition, sourceBaseMidi + retainedPosition].sort((first, second) => first - second) as [number, number];
  const attemptNotes = [sourceBaseMidi + ripple.attemptPosition, sourceBaseMidi + retainedPosition].sort((first, second) => first - second) as [number, number];
  const sourceFrequencies = sourceNotes.map((note) => frequencyFromMidi(note)) as [number, number];
  const attemptFrequencies = attemptNotes.map((note) => frequencyFromMidi(note)) as [number, number];
  const comparison = comparePianoPartialInteractions(sourceFrequencies, attemptFrequencies, soundModelId);
  const model = pianoSoundModel(soundModelId);
  const allPartials = [comparison.source, comparison.attempt].flatMap((interaction) => [...interaction.lowerPartials, ...interaction.upperPartials]);
  const minimumHz = Math.min(...allPartials.map((partial) => partial.frequencyHz)) * 0.94;
  const maximumHz = Math.max(...allPartials.map((partial) => partial.frequencyHz)) * 1.06;
  const xFor = (frequencyHz: number) => 92 + (Math.log2(frequencyHz / minimumHz) / Math.log2(maximumHz / minimumHz)) * 594;
  const signed = (value: number, digits = 0) => `${value > 0 ? "+" : value < 0 ? "−" : ""}${Math.abs(value).toFixed(digits)}`;
  const states = [
    { id: "source", label: "source", distance: relationship.sourceDistanceSteps, interaction: comparison.source },
    { id: "attempt", label: "new", distance: relationship.attemptDistanceSteps, interaction: comparison.attempt },
  ] as const;
  const summary = `At the original route register, the source ${relationship.sourceDistanceSteps}-step interval has ${comparison.source.alignedPairs.length} aligned partial pairs, ${comparison.source.interactionPairs.length} displayed interaction-zone pairs, roughness proxy ${Math.round(comparison.source.roughness * 100)}, and overlap ${Math.round(comparison.source.overlap * 100)}. The new ${relationship.attemptDistanceSteps}-step interval has ${comparison.attempt.alignedPairs.length} aligned pairs, ${comparison.attempt.interactionPairs.length} interaction-zone pairs, roughness ${Math.round(comparison.attempt.roughness * 100)}, and overlap ${Math.round(comparison.attempt.overlap * 100)} under the ${model.shortLabel} assumed spectrum.`;
  return <div className="hud-scale-spectrum" aria-label="Assumed spectral consequence of one changed interval">
    <div className="hud-scale-spectrum-heading"><span>selected spoke · fixed source register</span><strong>What could this one-key change do to partial interaction?</strong><small>Both rows reuse the original route’s physical starting key. The actual replay register is ignored so only this interval change remains. MIDI contains no instrument spectrum; every partial below comes from the selected {model.shortLabel.toLowerCase()} teaching model.</small></div>
    <div className="sr-only hud-scale-spectrum-summary" role="img" aria-label={summary} />
    <div className="hud-scale-spectrum-strips">
      {states.map((state) => <div key={state.id} className={`is-${state.id}`}>
        <div><strong>{state.label} · {state.distance} steps</strong><small>{state.interaction.lowerHz.toFixed(1)} → {state.interaction.upperHz.toFixed(1)} Hz</small></div>
        <svg viewBox="0 0 720 86" role="img" aria-label={`${state.label} ${state.distance}-step interval partial strip: ${state.interaction.alignedPairs.length} aligned pairs and ${state.interaction.interactionPairs.length} displayed interaction-zone pairs`}>
          <title>{`${state.label} assumed partial strip at the fixed source register`}</title>
          <line x1="92" x2="686" y1="43" y2="43" className="hud-scale-spectrum-axis" />
          {state.interaction.alignedPairs.slice(0, 8).map((pair) => <circle key={`a-${pair.lowerPartial}-${pair.upperPartial}`} cx={(xFor(pair.lowerHz) + xFor(pair.upperHz)) / 2} cy="43" r="3" className="hud-scale-spectrum-aligned"><title>{`Aligned partials ${pair.lowerPartial} and ${pair.upperPartial}, ${pair.centsApart.toFixed(1)} cents apart`}</title></circle>)}
          {state.interaction.interactionPairs.slice(0, 6).map((pair) => <rect key={`i-${pair.lowerPartial}-${pair.upperPartial}`} x={(xFor(pair.lowerHz) + xFor(pair.upperHz)) / 2 - 2.5} y="40.5" width="5" height="5" className="hud-scale-spectrum-interaction" transform={`rotate(45 ${(xFor(pair.lowerHz) + xFor(pair.upperHz)) / 2} 43)`}><title>{`Interaction-zone partials ${pair.lowerPartial} and ${pair.upperPartial}, ${pair.separationHz.toFixed(1)} hertz apart`}</title></rect>)}
          {state.interaction.lowerPartials.map((partial) => <line key={`l-${partial.partialIndex}`} x1={xFor(partial.frequencyHz)} x2={xFor(partial.frequencyHz)} y1="41" y2={41 - 7 - partial.amplitude * 22} className="hud-scale-spectrum-partial is-lower"><title>{`Lower tone partial ${partial.partialIndex}, ${partial.frequencyHz.toFixed(1)} hertz`}</title></line>)}
          {state.interaction.upperPartials.map((partial) => <line key={`u-${partial.partialIndex}`} x1={xFor(partial.frequencyHz)} x2={xFor(partial.frequencyHz)} y1="45" y2={45 + 7 + partial.amplitude * 22} className="hud-scale-spectrum-partial is-upper"><title>{`Upper tone partial ${partial.partialIndex}, ${partial.frequencyHz.toFixed(1)} hertz`}</title></line>)}
          <text x="92" y="81" className="hud-scale-spectrum-axis-label">frequency →</text><circle cx="505" cy="77" r="3" className="hud-scale-spectrum-aligned" /><text x="513" y="81" className="hud-scale-spectrum-axis-label">aligned</text><rect x="579" y="74.5" width="5" height="5" className="hud-scale-spectrum-interaction" transform="rotate(45 581.5 77)" /><text x="589" y="81" className="hud-scale-spectrum-axis-label">interaction zone</text>
        </svg>
        <div className="hud-scale-spectrum-evidence"><span><small>aligned</small><strong>{state.interaction.alignedPairs.length}</strong></span><span><small>zones</small><strong>{state.interaction.interactionPairs.length}</strong></span><span><small>roughness</small><strong>{Math.round(state.interaction.roughness * 100)}</strong></span><span><small>overlap</small><strong>{Math.round(state.interaction.overlap * 100)}</strong></span></div>
      </div>)}
    </div>
    <div className="hud-scale-spectrum-reading" role="status" aria-live="polite"><span>Modeled change · separate outputs</span><strong>aligned {signed(comparison.alignedPairDelta)} · zones {signed(comparison.interactionPairDelta)} · roughness {signed(comparison.roughnessDelta * 100)} · overlap {signed(comparison.overlapDelta * 100)}</strong><small>A dot marks partials within the declared 18-cent alignment window; a diamond marks one of the strongest non-aligned interaction zones. Counts and proxies can move in different directions. They describe this assumed spectrum at this register—not consonance, tonal function, emotion, preference, or musical quality.</small></div>
  </div>;
}

function ScaleLandingIntervalRippleView({ ripple, sourceBaseMidi, soundModelId }: { ripple: ScaleLandingIntervalRipple; sourceBaseMidi: number | null; soundModelId: PianoSoundModelId }) {
  const [selectedRetainedPosition, setSelectedRetainedPosition] = useState<number | null>(null);
  const ratio = (value: number) => `×${value.toFixed(3)}`;
  const summary = `Landing ${ripple.sourcePosition} moved to ${ripple.attemptPosition}. ${ripple.changedRelationshipCount} normalized semitone intervals touching that landing changed by one semitone; ${ripple.retainedRelationshipCount} intervals between retained landings kept their distance and ratio.`;
  const selectedRelationship = ripple.relationships.find((relationship) => relationship.retainedPosition === selectedRetainedPosition) ?? null;
  return <div className="hud-scale-ripple">
    <div className="sr-only hud-scale-ripple-summary" role="img" aria-label={summary} />
    <div className="hud-scale-ripple-heading"><span>one moved landing · every connected interval</span><strong>{ripple.sourcePosition} → {ripple.attemptPosition}</strong><small>Each semitone multiplies an ascending frequency interval by 2<sup>1/12</sup>. Bar length shows that key distance; the ratio is the corresponding 12-TET frequency multiplier.</small></div>
    <div className="hud-scale-ripple-spokes">
      {ripple.relationships.map((relationship) => <button type="button" key={relationship.retainedPosition} className="hud-scale-ripple-spoke" aria-pressed={selectedRetainedPosition === relationship.retainedPosition} aria-label={`Inspect retained position ${relationship.retainedPosition}: source distance ${relationship.sourceDistanceSteps} steps, new distance ${relationship.attemptDistanceSteps} steps, ${relationship.distanceDelta < 0 ? "shorter" : "wider"} by one step`} onClick={() => setSelectedRetainedPosition(relationship.retainedPosition)}>
        <strong>to {relationship.retainedPosition}</strong>
        <div>
          <span className="is-source"><small>source</small><i><b style={{ "--ripple-width": `${relationship.sourceDistanceSteps / 12 * 100}%` } as CSSProperties} /></i><em>{relationship.sourceDistanceSteps} · {ratio(relationship.sourceFrequencyRatio)}</em></span>
          <span className="is-attempt"><small>new</small><i><b style={{ "--ripple-width": `${relationship.attemptDistanceSteps / 12 * 100}%` } as CSSProperties} /></i><em>{relationship.attemptDistanceSteps} · {ratio(relationship.attemptFrequencyRatio)}</em></span>
        </div>
        <small>{relationship.distanceDelta < 0 ? "shorter" : "wider"} by one semitone</small>
      </button>)}
    </div>
    <div className="hud-scale-ripple-reading" role="status" aria-live="polite"><span>Global consequence</span><strong>{ripple.changedRelationshipCount} changed spokes · {ripple.retainedRelationshipCount} held relationships</strong><small>Only intervals touching the moved landing changed. Every retained-to-retained interval kept its semitone distance and 12-TET ratio; absolute frequencies may differ if the replay started elsewhere. This is not a consonance, function, emotion, or quality judgment.</small></div>
    {!selectedRelationship ? <p className="hud-scale-spectrum-prompt">Choose one changed spoke to compare its source and new partial pattern under the declared sound model.</p> : sourceBaseMidi == null ? <p className="hud-scale-spectrum-prompt">The original route register is unavailable in this restored exercise. Restart the scale experiment to inspect a register-controlled spectrum.</p> : <ScaleLandingSpectralConsequence ripple={ripple} retainedPosition={selectedRelationship.retainedPosition} sourceBaseMidi={sourceBaseMidi} soundModelId={soundModelId} />}
  </div>;
}

function ScaleGapMutationResult({ comparison, sourceBaseMidi, soundModelId }: { comparison: ScaleGapMutationComparison; sourceBaseMidi: number | null; soundModelId: PianoSoundModelId }) {
  const [view, setView] = useState<"gaps" | "intervals">("gaps");
  const ripple = comparison.kind === "one-position" ? compareScaleLandingIntervalRipple(comparison.sourceSteps, comparison.attemptSteps) : null;
  const activeView = ripple ? view : "gaps";
  const sourceSet = new Set(comparison.sourcePositions);
  const attemptSet = new Set(comparison.attemptPositions);
  const sourceOnly = new Set(comparison.sourceOnlyPositions);
  const attemptOnly = new Set(comparison.attemptOnlyPositions);
  const signed = (value: number) => `${value > 0 ? "+" : value < 0 ? "−" : ""}${Math.abs(value)}`;
  const rows = [
    { id: "source", label: "source", positions: sourceSet, changed: sourceOnly },
    { id: "attempt", label: "new", positions: attemptSet, changed: attemptOnly },
  ] as const;
  const headline = comparison.kind === "one-position"
    ? `Landing ${comparison.sourceOnlyPositions[0]} → ${comparison.attemptOnlyPositions[0]}`
    : comparison.kind === "same"
      ? "Every landing stayed fixed"
      : comparison.kind === "different-count"
        ? `Landing count ${comparison.sourcePositions.length} → ${comparison.attemptPositions.length}`
        : comparison.kind === "wide-position"
          ? `Landing ${comparison.sourceOnlyPositions[0]} → ${comparison.attemptOnlyPositions[0]}`
        : `${comparison.changedPositionCount} internal landings changed`;
  const detail = comparison.kind === "one-position"
    ? `${signed(comparison.movedSteps!)} semitone${Math.abs(comparison.movedSteps!) === 1 ? "" : "s"}; ${comparison.changedGapCount} neighboring gap${comparison.changedGapCount === 1 ? "" : "s"} changed while every retained landing and the octave closure stayed fixed.`
    : comparison.kind === "same"
      ? "The source was reproduced exactly. Restart and move one internal landing by one key while keeping all the others."
      : comparison.kind === "different-count"
        ? "A landing was added or removed, so this attempt changes the route's density as well as its spacing. Restart and keep the same number of landings."
        : comparison.kind === "wide-position"
          ? `Only one landing moved, but it moved ${Math.abs(comparison.movedSteps!)} semitones. This control asks for one semitone so every changed interval can be attributed to the same minimal nudge.`
        : "More than one landing moved, so no single-position explanation is justified. Restart and change only one internal landing.";
  const summary = `${headline}. Source gaps ${comparison.sourceSteps.join(", ")}; new gaps ${comparison.attemptSteps.join(", ")}. Both routes total twelve semitones.`;
  return <section className={`hud-scale-mutation is-${comparison.kind}`} aria-label="Scale landing mutation comparison">
    {ripple ? <div className="hud-scale-mutation-view" role="group" aria-label="Choose one consequence of the moved scale landing"><button type="button" aria-pressed={activeView === "gaps"} onClick={() => setView("gaps")}>Adjacent gaps</button><button type="button" aria-pressed={activeView === "intervals"} onClick={() => setView("intervals")}>Every connected interval</button></div> : null}
    {activeView === "gaps" ? <><div className="hud-scale-mutation-routes" role="img" aria-label={summary}>
      {rows.map((row) => <div key={row.id} className={`is-${row.id}`}><strong>{row.label}</strong><div>{Array.from({ length: 13 }, (_, position) => {
        const present = row.positions.has(position);
        const changed = row.changed.has(position);
        return <span key={position} className={`${present ? "is-present" : ""} ${changed ? "is-changed" : ""}`}><i>{present ? position : ""}</i></span>;
      })}</div></div>)}
    </div>
    {comparison.gapDeltas ? <div className="hud-scale-mutation-gaps" aria-label={`Gap comparison: ${comparison.sourceSteps.map((gap, index) => `${gap} to ${comparison.attemptSteps[index]}, delta ${comparison.gapDeltas![index]}`).join("; ")}`}>
      {comparison.sourceSteps.map((gap, index) => {
        const delta = comparison.gapDeltas![index];
        return <span key={index} className={delta !== 0 ? "is-changed" : ""}><small>gap {index + 1}</small><strong>{gap}{delta === 0 ? "" : `→${comparison.attemptSteps[index]}`}</strong><em>{delta === 0 ? "held" : `Δ${signed(delta)}`}</em></span>;
      })}
    </div> : null}
    <div className="hud-scale-mutation-reading" role="status" aria-live="polite"><span>{comparison.kind === "one-position" ? "One cause isolated" : "Compare the control"}</span><strong>{headline}</strong><small>{detail} Both gap lists still sum to 12, so frequency still doubles at the final landing.</small></div></> : ripple ? <ScaleLandingIntervalRippleView key={`${ripple.sourcePosition}-${ripple.attemptPosition}`} ripple={ripple} sourceBaseMidi={sourceBaseMidi} soundModelId={soundModelId} /> : null}
  </section>;
}

function PerformedScaleFingerprintBuilder({
  session,
  progress,
  showConventions,
  soundModelId,
  onStart,
  onRestart,
  onReplay,
  onReveal,
  onEnd,
}: {
  session: ScaleFingerprintSession | null;
  progress: PerformedScaleFingerprint | null;
  showConventions: boolean;
  soundModelId: PianoSoundModelId;
  onStart: () => void;
  onRestart: () => void;
  onReplay: (steps: number[], exercise: "transpose" | "rotate" | "mutate") => void;
  onReveal: () => void;
  onEnd: () => void;
}) {
  if (!session || !progress) {
    return <div className="hud-scale-builder is-inactive">
      <div className="hud-builder-intro">
        <div className="hud-subheading"><span>Author a relationship · no sound</span><strong>Discover a scale with your hands</strong><small>Choose any starting key, move only upward, and return exactly one octave higher. The HUD records the gaps you create before comparing them with any named scale.</small></div>
        <button type="button" className="piano-primary-action" onClick={onStart}>Build an unnamed scale</button>
      </div>
      <p>The first attack becomes position 0. No Do, note name, or route is chosen for you.</p>
    </div>;
  }

  const replaying = session.exercise === "transpose" || session.exercise === "rotate";
  const mutating = session.exercise === "mutate";
  const wrongAttempt = progress.lastAttempt?.kind === "try-again";
  const matches = progress.status === "complete" ? matchScaleFingerprint(progress.steps) : [];
  const sourceSteps = session.sourceSteps ?? progress.steps;
  const rotatedSteps = sourceSteps.length ? [...sourceSteps.slice(1), sourceSteps[0]] : [];
  const mutationComparison = mutating && progress.status === "complete" ? compareScaleGapMutation(sourceSteps, progress.steps) : null;
  const completedMoveCount = progress.steps.length;
  const heading = session.exercise === "build" ? "Build an unnamed octave route" : session.exercise === "transpose" ? "Preserve the fingerprint elsewhere" : session.exercise === "rotate" ? "Make a different gap follow home" : "Change one landing, keep the octave";
  let cue = progress.status === "waiting" ? "Play any starting key" : progress.status === "complete" ? mutating ? mutationComparison?.kind === "one-position" ? "One changed landing isolated" : "Compare the attempted control" : "The octave loop closes" : replaying ? `Move +${progress.expectedGap} semitone${progress.expectedGap === 1 ? "" : "s"}` : mutating ? `${progress.octaveRemaining} semitones remain · keep the same landing count` : `${progress.octaveRemaining} semitones remain`;
  let feedback = progress.status === "waiting"
      ? replaying ? "This first key may be anywhere; it establishes a new physical and frequency origin." : mutating ? `Start anywhere. Use ${sourceSteps.join("–")} as the control, move exactly one internal landing by one key, and keep every other landing—including 0 and 12—fixed.` : "There is no correct first key. Your next upward moves will author the route."
    : progress.status === "complete"
      ? session.exercise === "build" ? `You made ${progress.steps.join("–")}. The gaps total 12, so the last frequency is exactly 2× the first on an equal-tempered keyboard.` : session.exercise === "transpose" ? `You preserved ${progress.steps.join("–")} from a new starting key. Absolute frequencies and hand position changed; the ordered relationships did not.` : session.exercise === "rotate" ? `You preserved the same cyclic gaps as ${session.sourceSteps?.join("–")}, but ${progress.steps[0]} now follows the starting point.` : mutationComparison?.kind === "one-position" ? `You changed one landing while ${mutationComparison.retainedPositions.length} positions—including origin and octave closure—stayed fixed.` : "The route closes at the octave; now compare whether exactly one internal landing changed."
      : replaying ? `${completedMoveCount} of ${session.expectedSteps?.length ?? 0} gaps preserved. Only the next expected move can advance the route.` : mutating ? `${completedMoveCount} of ${sourceSteps.length} source gaps rebuilt: ${progress.steps.length ? progress.steps.join("–") : "none yet"}. Keep the same number of landings and close exactly at 12.` : `${completedMoveCount} gaps authored: ${progress.steps.length ? progress.steps.join("–") : "none yet"}. Stop only when the last key is exactly 12 above the first.`;
  if (wrongAttempt) {
    feedback = progress.lastAttempt?.reason === "wrong-gap"
      ? `You moved ${progress.lastAttempt.actualGap! > 0 ? "+" : ""}${progress.lastAttempt.actualGap}; this replay asks for +${progress.lastAttempt.expectedGap}. The valid prefix stays intact—repair only this move.`
      : progress.lastAttempt?.reason === "beyond-octave"
        ? "That key passed the octave boundary. The valid gaps stay intact; return to an upward key no more than 12 steps above the start."
        : "That move did not rise. The valid gaps stay intact; choose a key above the last accepted position.";
    cue = "Compare only the last move";
  }

  return <div className={`hud-scale-builder is-active ${wrongAttempt ? "has-error" : ""}`} aria-label="Performed scale fingerprint builder">
    <div className="hud-builder-topline">
      <div className="hud-subheading"><span>{session.exercise === "build" ? "learner-authored route" : session.exercise === "transpose" ? "transposition test" : session.exercise === "rotate" ? "rotation test" : "one-position experiment"}</span><strong>{heading}</strong><small>{replaying ? `target gaps ${session.expectedSteps?.join("–")}` : mutating ? `source gaps ${sourceSteps.join("–")} · move one internal landing; keep 0 and 12` : "catalog scale names hidden until the octave relationship is complete"}</small></div>
      <div className="hud-builder-actions"><button type="button" onClick={onRestart}>Restart</button><button type="button" onClick={onEnd}>End</button></div>
    </div>
    <div className="hud-builder-octave" role="img" aria-label={progress.positions.length ? `${progress.positions.length} accepted positions from 0 through ${progress.positions.at(-1)}; ${progress.octaveRemaining} semitones remain to the octave` : "No accepted positions yet; the first attack will become position 0 and the octave will close at position 12 semitones"}>
      {Array.from({ length: 13 }, (_, position) => {
        const acceptedIndex = progress.positions.indexOf(position);
        const accepted = acceptedIndex >= 0;
        const current = position === progress.positions.at(-1);
        return <span key={position} className={`${accepted ? "is-accepted" : ""} ${current ? "is-current" : ""}`}><i>{accepted ? acceptedIndex + 1 : "·"}</i><small>{position === 0 ? "start" : position === 12 ? "2×" : position}</small></span>;
      })}
    </div>
    <div className="hud-builder-gaps" aria-label={progress.steps.length ? `Accepted gaps ${progress.steps.join(", ")}` : "No gaps accepted yet"}>
      {progress.steps.map((step, index) => <span key={`${index}-${step}`} style={{ "--builder-gap": step } as CSSProperties}><strong>{step}</strong><small>{step === 1 ? "close" : step === 2 ? "whole" : "wide"}</small></span>)}
      {!progress.steps.length ? <p>Your ordered gap fingerprint will grow here.</p> : null}
    </div>
    <div className="hud-builder-feedback" role="status" aria-live="polite"><span>{progress.status === "complete" ? mutating ? "Control result" : "Invariant ready" : wrongAttempt ? "Repair one relationship" : "Current question"}</span><strong>{cue}</strong><small>{feedback}</small></div>
    {progress.status === "complete" ? <div className="hud-builder-complete">
      {mutationComparison ? <ScaleGapMutationResult comparison={mutationComparison} sourceBaseMidi={session.sourceBaseMidi ?? null} soundModelId={soundModelId} /> : <><div className="hud-builder-actions">
        <button type="button" className="piano-primary-action" onClick={() => onReplay(sourceSteps, "transpose")}>Test the same gaps elsewhere</button>
        <button type="button" onClick={() => onReplay(rotatedSteps, "rotate")}>Rotate which gap comes first</button>
        <button type="button" onClick={() => onReplay(progress.steps, "mutate")}>Change one landing</button>
        {!session.revealNames ? <button type="button" onClick={onReveal}>Reveal theory translations</button> : null}
      </div>
      {session.revealNames ? <div className="hud-builder-translations">
        <span>optional conventional translation · structure came first</span>
        {matches.length ? matches.map((match) => <p key={`${match.scale.id}-${match.rotation}`}><strong>{match.exactFromDo ? match.scale.conventionalName : `${match.scale.conventionalName} · cyclic rotation ${match.rotation + 1}`}</strong><small>{showConventions && progress.baseMidi != null ? `started on ${conventionalPitchName(progress.baseMidi)} · ` : ""}{match.exactFromDo ? match.scale.character : "Same pitch-class collection, different starting gap; tonal context determines whether that start behaves like home."}</small></p>) : <p><strong>No exact route in this small teaching catalog</strong><small>The fingerprint is still physically valid. A missing label is not a musical or aesthetic judgment.</small></p>}
      </div> : <p className="hud-builder-name-hold">The physical result is complete. Catalog scale names remain hidden so you can first compare the ordered gaps, octave closure, and what survives a new starting key.</p>}</>}
    </div> : null}
  </div>;
}

function GuidedScaleWalk({
  session,
  events,
  progress,
  scale,
  showConventions,
  nowMs,
  onStart,
  onRestart,
  onEnd,
}: {
  session: ScaleWalkSession | null;
  events: HudNoteEvent[];
  progress: AscendingScaleWalk | null;
  scale: PianoScale;
  showConventions: boolean;
  nowMs: number;
  onStart: () => void;
  onRestart: () => void;
  onEnd: () => void;
}) {
  if (!session || !progress) {
    return <div className="hud-guided-walk is-inactive">
      <div className="hud-walk-intro">
        <div className="hud-subheading"><span>Playable experiment · no sound</span><strong>Walk one octave by its gaps</strong><small>Fix the current Do and scale route, then begin on Do in any MIDI octave. The same sequence of physical gaps survives when the frequencies and hand position change.</small></div>
        <button type="button" className="piano-primary-action" onClick={onStart}>Start guided walk</button>
      </div>
      <p>No note is entered or sounded when you start. Your next key attack supplies the first step.</p>
    </div>;
  }

  const routeLabels = [...scale.solfege, "Do↑"];
  const expectedIndex = progress.status === "waiting-do" ? 0 : progress.nextIndex;
  const previousOffset = progress.nextIndex > 0 ? progress.routeOffsets[progress.nextIndex - 1] : 0;
  const expectedOffset = progress.nextIndex < progress.routeOffsets.length ? progress.routeOffsets[progress.nextIndex] : 12;
  const nextGap = expectedOffset - previousOffset;
  const nextLandmark = intervalLandmark(nextGap);
  const expectedContext = progress.expectedMidi == null || progress.baseMidi == null
    ? null
    : noteContext(progress.expectedMidi, progress.baseMidi, scale);
  const lastAttempt = progress.lastAttempt;
  const wrongAttempt = lastAttempt?.kind === "try-again" || lastAttempt?.kind === "find-do";
  const actualContext = lastAttempt && progress.baseMidi != null ? noteContext(lastAttempt.note, progress.baseMidi, scale) : null;
  const gravity = tonalGravityCandidates(events, nowMs || events.at(-1)?.onsetMs || 0, 12);
  const doGravityIndex = gravity.findIndex((candidate) => candidate.rootPitchClass === session.rootPitchClass);
  const doGravity = doGravityIndex >= 0 ? gravity[doGravityIndex] : null;
  const gravityDrivers = doGravity ? strongestGravityDrivers(doGravity) : [];

  let cue = "Play Do in any octave";
  let feedback = "The first Do establishes the register. Only pitch relationships matter; the current frame is fixed for this walk.";
  if (progress.status === "walking" && expectedContext) {
    cue = `Move ${formatSemitones(nextGap, 0, true)} to ${expectedContext.syllable}`;
    feedback = wrongAttempt && lastAttempt?.actualGap != null
      ? `You moved ${lastAttempt.actualGap > 0 ? "+" : ""}${lastAttempt.actualGap} from the last correct step and reached ${actualContext?.syllable ?? "another position"}. This route asks for +${lastAttempt.expectedGap}. Progress stays here—try ${expectedContext.syllable} again.`
      : lastAttempt?.kind === "restarted"
        ? "A new Do restarted the same route in this register. The gap pattern did not change."
        : `${progress.nextIndex} of ${progress.routeOffsets.length} positions are connected. The dashed keyboard key is a silent target.`;
  } else if (progress.status === "complete") {
    cue = "One octave complete: frequency doubled";
    feedback = `You preserved ${scale.steps.join("–")} across ${progress.routeOffsets.length - 1} moves. The final Do is 2× the starting frequency, while the gap fingerprint stayed fixed.`;
  } else if (lastAttempt?.kind === "find-do") {
    const attempted = CHROMATIC_SOLFEGE[pitchClassFromMidi(lastAttempt.note - session.rootPitchClass)];
    feedback = `That attack was ${attempted} relative to the selected Do. Start on Do in any octave; your progress will begin there.`;
  }

  return <div className={`hud-guided-walk is-active ${wrongAttempt ? "has-error" : ""}`} aria-label="Guided ascending scale walk">
    <div className="hud-walk-topline">
      <div className="hud-subheading"><span>Live route · selected frame fixed</span><strong>Walk one octave by its gaps</strong><small>{showConventions ? `${CONVENTIONAL_PITCH_CLASSES[session.rootPitchClass]} as Do · ${scale.conventionalName}` : `movable Do · ${scale.name}`} · begin on Do in any octave</small></div>
      <div className="hud-walk-actions"><button type="button" onClick={onRestart}>Restart</button><button type="button" onClick={onEnd}>End walk</button></div>
    </div>
    <ol className="hud-walk-route" style={{ "--walk-count": progress.routeOffsets.length } as CSSProperties} aria-label={`Ascending route: ${routeLabels.join(", ")}`}>
      {progress.routeOffsets.map((offset, index) => {
        const complete = progress.status === "complete" || index < progress.nextIndex;
        const current = progress.status !== "complete" && index === expectedIndex;
        const gap = index === 0 ? "start" : `+${offset - progress.routeOffsets[index - 1]}`;
        return <li key={`${offset}-${index}`} className={`${complete ? "is-complete" : ""} ${current ? "is-current" : ""}`} aria-current={current ? "step" : undefined}><span>{complete ? "✓" : current ? "→" : index + 1}</span><strong>{routeLabels[index]}</strong><small>{gap}</small></li>;
      })}
    </ol>
    <div className="hud-walk-feedback" role="status" aria-live="polite">
      <span>{progress.status === "complete" ? "Invariant found" : wrongAttempt ? "Compare the gaps" : progress.status === "waiting-do" ? "Find the starting point" : "Next physical move"}</span>
      <strong>{cue}</strong>
      <small>{feedback}</small>
    </div>
    {progress.status === "walking" && progress.expectedMidi != null && progress.baseMidi != null ? <div className="hud-walk-physics" aria-label="Physical context for the next scale step">
      <span><small>next reference frequency</small><strong>{formatHz(frequencyFromMidi(progress.expectedMidi))}</strong><em>{(2 ** (expectedOffset / 12)).toFixed(3)}× starting Do</em></span>
      <span><small>local interval</small><strong>{formatSemitones(nextGap, 0, true)}</strong><em>near {nextLandmark.landmarkLabel} · {nextLandmark.relationship}</em></span>
      <span><small>fifths coordinate</small><strong>{expectedContext?.syllable}</strong><em>{fifthsCoordinateLabel(expectedOffset)}</em></span>
    </div> : null}
    {events.length ? <p className="hud-walk-gravity">In this performed route, Do currently ranks <strong>{doGravityIndex + 1} of 12</strong> center hypotheses{gravityDrivers.length ? `; its strongest cues are ${gravityDrivers.map((driver) => driver.label).join(" and ")}` : ""}. That contextual evidence can change even though the scale fingerprint cannot.</p> : null}
  </div>;
}

function TonalGravityCounterfactualField({
  session,
  result,
  availableAttackCount,
  doMidi,
  scale,
  showConventions,
  onStart,
  onTarget,
  onCue,
  onRecapture,
  onEnd,
}: {
  session: GravityCounterfactualSession | null;
  result: TonalGravityCounterfactual | null;
  availableAttackCount: number;
  doMidi: number;
  scale: PianoScale;
  showConventions: boolean;
  onStart: () => void;
  onTarget: (pitchClass: number) => void;
  onCue: (cue: TonalGravityCue) => void;
  onRecapture: () => void;
  onEnd: () => void;
}) {
  if (!session || !result) {
    const ready = availableAttackCount >= 3;
    return <div className="hud-gravity-counterfactual is-inactive">
      <div className="hud-gravity-counterfactual-intro">
        <div className="hud-subheading"><span>Change one model cue · no sound</span><strong>What makes a pitch feel like home?</strong><small>Freeze your phrase, give one candidate center the strongest held-time, recurrence, attack, bass, or ending cue, and see how much the model ranking depends on that assumption.</small></div>
        <button type="button" className="piano-primary-action" disabled={!ready} onClick={onStart}>Open center microscope</button>
      </div>
      <p>{ready ? `${availableAttackCount} live attacks are available to freeze.` : `Play at least ${3 - availableAttackCount} more attack${3 - availableAttackCount === 1 ? "" : "s"} first.`} The intervention changes no MIDI event and makes no claim about what you heard.</p>
    </div>;
  }

  const observedPitchClasses = [...new Set(session.specimen.map((event) => pitchClassFromMidi(event.note)))];
  const baselineByPitchClass = new Map(result.baseline.map((candidate) => [candidate.rootPitchClass, candidate]));
  const afterByPitchClass = new Map(result.counterfactual.map((candidate) => [candidate.rootPitchClass, candidate]));
  const cueOption = GRAVITY_CUE_OPTIONS.find((option) => option.id === session.cue)!;
  const targetLabel = pitchClassRoleLabel(session.targetPitchClass, doMidi, scale, showConventions);
  const cueBefore = result.targetBefore.components[session.cue];
  const targetCueCopy = cueBefore >= 0.999
    ? `The ${cueOption.shortLabel} lane for ${targetLabel} was already 100, so it stayed fixed while that lane was set to 0 for the other eleven candidates.`
    : `The ${cueOption.shortLabel} lane for ${targetLabel} changed from ${Math.round(cueBefore * 100)} to 100. The same lane was set to 0 for the other eleven candidates.`;
  const rankMoved = result.counterfactualRank - result.baselineRank;
  const rankCopy = rankMoved < 0 ? `rose ${Math.abs(rankMoved)} place${Math.abs(rankMoved) === 1 ? "" : "s"}` : rankMoved > 0 ? `fell ${rankMoved} place${rankMoved === 1 ? "" : "s"}` : "kept the same rank";
  const otherCues = GRAVITY_CUE_OPTIONS.filter((option) => option.id !== session.cue);
  const topBefore = result.baseline.slice(0, 3);
  const topAfter = result.counterfactual.slice(0, 3);
  return <div className="hud-gravity-counterfactual is-active" aria-label="Tonal gravity counterfactual microscope">
    <div className="hud-gravity-counterfactual-topline">
      <div className="hud-subheading"><span>Frozen phrase · model intervention</span><strong>What makes a pitch feel like home?</strong><small>{session.specimen.length} attacks · {observedPitchClasses.length} pitch classes · no performed event is edited</small></div>
      <div className="hud-builder-actions"><button type="button" onClick={onRecapture} disabled={availableAttackCount < 3}>Recapture latest phrase</button><button type="button" onClick={onEnd}>End</button></div>
    </div>

    <div className="hud-gravity-counterfactual-controls">
      <fieldset><legend>1 · Which sounded position should receive the cue?</legend><div className="hud-gravity-targets">{observedPitchClasses.map((pitchClass) => <button key={pitchClass} type="button" aria-pressed={session.targetPitchClass === pitchClass} onClick={() => onTarget(pitchClass)}>{pitchClassRoleLabel(pitchClass, doMidi, scale, showConventions)}</button>)}</div></fieldset>
      <fieldset><legend>2 · Change exactly one evidence lane</legend><div className="hud-gravity-cues">{GRAVITY_CUE_OPTIONS.map((option) => <button key={option.id} type="button" aria-pressed={session.cue === option.id} onClick={() => onCue(option.id)}><strong>{option.label}</strong><small>{Math.round(TONAL_GRAVITY_WEIGHTS[option.id] * 100)}% model weight</small></button>)}</div></fieldset>
    </div>

    <div className="hud-gravity-counterfactual-chart" role="img" aria-label={`${targetLabel} changes from rank ${result.baselineRank + 1} to rank ${result.counterfactualRank + 1} of 12 when the ${cueOption.shortLabel} cue belongs only to it; outline bars are the frozen phrase and filled bars are the intervention`}>
      {Array.from({ length: 12 }, (_, pitchClass) => {
        const before = baselineByPitchClass.get(pitchClass)!;
        const after = afterByPitchClass.get(pitchClass)!;
        const isTarget = pitchClass === session.targetPitchClass;
        return <span key={pitchClass} className={isTarget ? "is-target" : ""}><i className="is-before" style={{ "--gravity-height": before.score } as CSSProperties} /><i className="is-after" style={{ "--gravity-height": after.score } as CSSProperties} /><strong>{pitchClassRoleLabel(pitchClass, doMidi, scale, showConventions)}</strong><small>{Math.round(before.score * 100)}→{Math.round(after.score * 100)}</small></span>;
      })}
    </div>
    <div className="hud-gravity-counterfactual-legend"><span><i className="is-before" /> frozen phrase</span><span><i className="is-after" /> one-cue intervention</span><small>bar height = model support for each possible center · not confidence, tension, liking, or quality</small></div>

    <div className="hud-gravity-counterfactual-reading" role="status" aria-live="polite">
      <span>What changed?</span>
      <strong>{targetLabel}: rank {result.baselineRank + 1} → {result.counterfactualRank + 1}; {rankCopy}</strong>
      <small>{targetCueCopy} Route fit and the other four performed cues stayed numerically identical.</small>
    </div>

    <div className="hud-gravity-counterfactual-evidence" aria-label="Counterfactual evidence separation">
      <div><span>changed model lane</span><strong>{cueOption.shortLabel} · {Math.round(TONAL_GRAVITY_WEIGHTS[session.cue] * 100)}% weight</strong><small>One complete evidence lane was reassigned; no attack was added, removed, moved, or sounded.</small></div>
      <div><span>held invariant</span><strong>route fit · {otherCues.map((option) => option.shortLabel).join(" · ")}</strong><small>Every candidate retained these exact component values from the frozen phrase.</small></div>
      <div><span>try with your hands</span><strong>{cueOption.practice}</strong><small>Then recapture and compare the live evidence. A real replay will naturally change more than one cue.</small></div>
    </div>

    <div className="hud-gravity-rank-paths">
      <div><span>frozen top three</span>{topBefore.map((candidate, index) => <p key={candidate.rootPitchClass}><strong>{index + 1} · {pitchClassRoleLabel(candidate.rootPitchClass, doMidi, scale, showConventions)}</strong><small>{Math.round(candidate.score * 100)}</small></p>)}</div>
      <div><span>after one cue</span>{topAfter.map((candidate, index) => <p key={candidate.rootPitchClass}><strong>{index + 1} · {pitchClassRoleLabel(candidate.rootPitchClass, doMidi, scale, showConventions)}</strong><small>{Math.round(candidate.score * 100)}</small></p>)}</div>
    </div>
    <p className="hud-gravity-counterfactual-limit">This isolates sensitivity inside the declared heuristic. It does not synthesize a new phrase, detect a key, simulate a listener, or say which center should feel convincing.</p>
  </div>;
}

function ResolutionLandingLens({ phraseEvents, target, evidence, doMidi, showConventions, onReflect }: {
  phraseEvents: HudNoteEvent[];
  target: ResolutionTarget;
  evidence: ResolutionLandingEvidence;
  doMidi: number;
  showConventions: boolean;
  onReflect: (events: HudNoteEvent[]) => void;
}) {
  const scale = PIANO_SCALES.find((candidate) => candidate.id === target.frameScaleId) ?? DEFAULT_SCALE;
  const frameDoMidi = target.frameRootPitchClass == null ? doMidi : nearestMidiForPitchClass(target.frameRootPitchClass, doMidi);
  const ordered = [...phraseEvents].sort((first, second) => first.onsetMs - second.onsetMs || first.id - second.id);
  const sourceIndex = ordered.findIndex((event) => event.id === evidence.sourceEventId);
  const landingIndex = ordered.findIndex((event) => event.id === evidence.landingEventId);
  if (sourceIndex < 0 || landingIndex <= sourceIndex) return null;
  const source = ordered[sourceIndex];
  const landing = ordered[landingIndex];
  const finalApproach = ordered.find((event) => event.id === evidence.finalApproachEventId) ?? source;
  const pathEvents = ordered.slice(sourceIndex, landingIndex + 1);
  const omittedCount = Math.max(0, pathEvents.length - 12);
  const displayEvents = omittedCount ? [pathEvents[0], ...pathEvents.slice(-11)] : pathEvents;
  const sourceHz = frequencyFromMidi(source.note);
  const landingHz = frequencyFromMidi(landing.note);
  const relationship = intervalLandmark(Math.abs(evidence.sourceToLandingSteps));
  const sourceTendency = tonalTendency(uniqueSorted(source.fieldNotes), frameDoMidi, scale);
  const landingTendency = tonalTendency(uniqueSorted(landing.fieldNotes), frameDoMidi, scale);
  const signedSteps = (value: number) => `${value > 0 ? "+" : value < 0 ? "−" : ""}${Math.abs(value)}`;
  const role = (note: number) => showConventions ? conventionalPitchName(note) : relativeSyllable(note, frameDoMidi, scale);
  const bridgeCopy = evidence.bridge.kind === "unknown"
    ? "final release unknown"
    : evidence.bridge.kind === "touching"
      ? "release met the landing attack"
      : `${Math.round(evidence.bridge.durationMs!)} ms ${evidence.bridge.kind}${evidence.bridge.pedalExtended ? " · pedal-ended" : ""}`;
  const coreSpecimen = ordered.slice(sourceIndex, landingIndex + 1);
  const contextCount = coreSpecimen.length <= 10 ? Math.min(2, sourceIndex, 12 - coreSpecimen.length) : 0;
  const reflectionSpecimen = coreSpecimen.length <= 12 ? ordered.slice(sourceIndex - contextCount, landingIndex + 1) : [];
  const direct = evidence.interveningAttackCount === 0;
  const low = Math.min(...displayEvents.map((event) => event.note)) - 1;
  const high = Math.max(...displayEvents.map((event) => event.note)) + 1;
  const startMs = source.onsetMs;
  const durationMs = Math.max(1, landing.onsetMs - startMs);
  const xFor = (event: HudNoteEvent) => 92 + ((event.onsetMs - startMs) / durationMs) * 548;
  const yFor = (event: HudNoteEvent) => 126 - ((event.note - low) / Math.max(1, high - low)) * 82;
  const pathPoints = displayEvents.map((event) => `${xFor(event)},${yFor(event)}`).join(" ");
  const velocityCopy = evidence.velocityDelta == null
    ? "attack velocity unavailable"
    : evidence.velocityDelta === 0
      ? "same MIDI attack velocity"
      : `MIDI attack velocity ${signedSteps(evidence.velocityDelta)}`;
  const landmarkCopy = evidence.sourceToLandingSteps < 0 && relationship.landmarkLabel !== "1:1"
    ? `the descending reciprocal of the ${relationship.relationship} (${relationship.landmarkLabel})`
    : `${relationship.relationship} (${relationship.landmarkLabel})`;
  return <section className="hud-resolution-landing" aria-labelledby="hud-resolution-landing-title">
    <div className="hud-panel-heading"><span>{direct ? "Direct fork landing" : `Fork landing after ${evidence.interveningAttackCount} intervening attack${evidence.interveningAttackCount === 1 ? "" : "s"}`} · five lenses</span><strong id="hud-resolution-landing-title">What did this intended landing actually do?</strong><small>{target.label} selected one pitch-class destination. The performed path, frame model, and your response remain separate evidence.</small></div>
    <svg viewBox="0 0 720 162" role="img" aria-label={`${target.label}. ${role(source.note)} to ${role(landing.note)} is ${formatSemitones(evidence.sourceToLandingSteps, 0, true)} over ${Math.round(evidence.sourceToLandingGapMs)} milliseconds, with ${evidence.interveningAttackCount} intervening attacks. Final approach ${formatSemitones(evidence.finalApproachSteps, 0, true)} over ${Math.round(evidence.finalApproachGapMs)} milliseconds; ${bridgeCopy}.`}>
      <title>Performed pitch path from the frozen fork source to the first matching landing</title>
      <line x1="92" x2="640" y1="139" y2="139" className="hud-resolution-landing-axis" />
      <polyline points={pathPoints} className="hud-resolution-landing-path" />
      {displayEvents.map((event, index) => {
        const isSource = event.id === source.id;
        const isLanding = event.id === landing.id;
        return <g key={event.id} className={`hud-resolution-landing-node ${isSource ? "is-source" : isLanding ? "is-landing" : "is-between"}`}>
          {isLanding ? <rect x={xFor(event) - 6} y={yFor(event) - 6} width="12" height="12" transform={`rotate(45 ${xFor(event)} ${yFor(event)})`} /> : <circle cx={xFor(event)} cy={yFor(event)} r={isSource ? 6 : 4} />}
          {(isSource || isLanding) ? <text x={xFor(event)} y={yFor(event) - 13} className="hud-resolution-landing-label">{isSource ? `source · ${role(event.note)}` : `landing · ${role(event.note)}`}</text> : null}
          <title>{`${isSource ? "Frozen source" : isLanding ? "First matching landing" : `Intervening attack ${index}`}: ${role(event.note)}, ${Math.round(event.onsetMs - startMs)} milliseconds after source`}</title>
        </g>;
      })}
      {omittedCount ? <text x="164" y="154" className="hud-echo-axis-label">{omittedCount} earlier detour attack{omittedCount === 1 ? "" : "s"} condensed</text> : null}
      <text x="92" y="154" className="hud-echo-axis-label">source · 0 ms</text><text x="640" y="154" className="hud-echo-axis-label is-end">landing · {Math.round(durationMs)} ms</text>
    </svg>
    <div className="hud-last-lenses" role="group" aria-label="Five separate lenses for the performed resolution landing">
      <article className="is-measured"><span>Sound</span><em>MIDI + derived 12-TET reference</em><strong>{sourceHz.toFixed(1)} → {landingHz.toFixed(1)} Hz · {velocityCopy}</strong><small>Key number and transmitted attack changed. The Hz coordinate assumes A4=440; MIDI supplied no acoustic pitch, loudness, spectrum, room, or heard balance.</small></article>
      <article className="is-measured"><span>Relationships</span><em>source to intended destination</em><strong>{formatSemitones(evidence.sourceToLandingSteps, 0, true)} · ×{evidence.sourceToLandingFrequencyRatio.toFixed(3)}</strong><small>Near {landmarkCopy}. {direct ? "The fork was the next attack, so this is also the final approach." : `${evidence.interveningAttackCount} intervening attack${evidence.interveningAttackCount === 1 ? " means" : "s mean"} the fork intention was not an isolated one-move intervention.`}</small></article>
      <article className="is-measured"><span>Motion</span><em>performed final approach</em><strong>{formatSemitones(evidence.finalApproachSteps, 0, true)} · {Math.round(evidence.finalApproachGapMs)} ms</strong><small>{role(finalApproach.note)} → {role(landing.note)} · {bridgeCopy}. Timing and release evidence do not establish meter, groove, or intended articulation.</small></article>
      <article className="is-modeled"><span>Context</span><em>selected Do + route model</em><strong>remaining pull {Math.round(sourceTendency.homePull * 100)} → {Math.round(landingTendency.homePull * 100)} · home evidence {Math.round(sourceTendency.homeEvidence * 100)} → {Math.round(landingTendency.homeEvidence * 100)}</strong><small>Pull is modeled distance still left before Do, so zero can mean arrival—not indifference. The destination is {pitchClassRoleLabel(target.pitchClass, frameDoMidi, scale, showConventions)} in the frozen frame. The fork label named an intention, not a detected function or felt resolution.</small></article>
      <article className="is-unclaimed"><span>Experience</span><em>listener only</em><strong>Did this feel like return, continuation, opening, surprise, or something else?</strong><small>{reflectionSpecimen.length >= 3 ? `Hold this ${reflectionSpecimen.length}-attack context and answer settledness, energy, familiarity, and liking separately.` : coreSpecimen.length > 12 ? "The path exceeded the twelve-attack reflection bound; clear and try a shorter fork path." : "At least one earlier context attack is needed for a bounded three-attack reflection."}</small><button type="button" disabled={reflectionSpecimen.length < 3} onClick={() => onReflect(reflectionSpecimen)}>Reflect on this landing</button></article>
    </div>
    <p className="hud-last-attack-limit">No lens proves that the fork resolved, caused a feeling, was stylistically correct, or was musically good. The intention, performed path, selected-frame model, and listener report remain inspectably separate.</p>
  </section>;
}

function ScalePracticeField({
  phraseEvents,
  frame,
  doMidi,
  showConventions,
  soundModelId,
  gravity,
  fingerprintRotation,
  forks,
  target,
  targetMatched,
  landingEvidence,
  landingEvents,
  fingerprintSession,
  fingerprintProgress,
  gravityCounterfactualSession,
  gravityCounterfactualResult,
  walkSession,
  walkEvents,
  walkProgress,
  walkScale,
  nowMs,
  onRotate,
  onChooseTarget,
  onClearTarget,
  onReflectResolution,
  onStartFingerprint,
  onRestartFingerprint,
  onReplayFingerprint,
  onRevealFingerprint,
  onEndFingerprint,
  onStartGravityCounterfactual,
  onTargetGravityCounterfactual,
  onCueGravityCounterfactual,
  onRecaptureGravityCounterfactual,
  onEndGravityCounterfactual,
  onStartWalk,
  onRestartWalk,
  onEndWalk,
}: {
  phraseEvents: HudNoteEvent[];
  frame: ScaleCandidate;
  doMidi: number;
  showConventions: boolean;
  soundModelId: PianoSoundModelId;
  gravity: TonalGravityCandidate[];
  fingerprintRotation: number;
  forks: ResolutionFork[];
  target: ResolutionTarget | null;
  targetMatched: boolean;
  landingEvidence: ResolutionLandingEvidence | null;
  landingEvents: HudNoteEvent[];
  fingerprintSession: ScaleFingerprintSession | null;
  fingerprintProgress: PerformedScaleFingerprint | null;
  gravityCounterfactualSession: GravityCounterfactualSession | null;
  gravityCounterfactualResult: TonalGravityCounterfactual | null;
  walkSession: ScaleWalkSession | null;
  walkEvents: HudNoteEvent[];
  walkProgress: AscendingScaleWalk | null;
  walkScale: PianoScale;
  nowMs: number;
  onRotate: () => void;
  onChooseTarget: (fork: ResolutionFork) => void;
  onClearTarget: () => void;
  onReflectResolution: (events: HudNoteEvent[]) => void;
  onStartFingerprint: () => void;
  onRestartFingerprint: () => void;
  onReplayFingerprint: (steps: number[], exercise: "transpose" | "rotate" | "mutate") => void;
  onRevealFingerprint: () => void;
  onEndFingerprint: () => void;
  onStartGravityCounterfactual: () => void;
  onTargetGravityCounterfactual: (pitchClass: number) => void;
  onCueGravityCounterfactual: (cue: TonalGravityCue) => void;
  onRecaptureGravityCounterfactual: () => void;
  onEndGravityCounterfactual: () => void;
  onStartWalk: () => void;
  onRestartWalk: () => void;
  onEndWalk: () => void;
}) {
  const [landingRevealEventId, setLandingRevealEventId] = useState<number | null>(null);
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
  const movementLabel = (movement: number) => movement === 0 ? "repeat the same key" : `${movement > 0 ? "+" : ""}${movement} semitone${Math.abs(movement) === 1 ? "" : "s"}`;
  const landingRevealed = landingEvidence != null && landingRevealEventId === landingEvidence.landingEventId;
  return <section className="hud-scale-practice" aria-labelledby="hud-scale-practice-title">
    <div className="hud-panel-heading"><span>Author · preserve · contextualize</span><strong id="hud-scale-practice-title">Scale relationships with your hands</strong><small>First author an unnamed route. Then preserve it elsewhere or compare it with a selected frame. Tonal center remains a contextual hypothesis, never a goodness score.</small></div>
    {fingerprintSession ? <PerformedScaleFingerprintBuilder session={fingerprintSession} progress={fingerprintProgress} showConventions={showConventions} soundModelId={soundModelId} onStart={onStartFingerprint} onRestart={onRestartFingerprint} onReplay={onReplayFingerprint} onReveal={onRevealFingerprint} onEnd={onEndFingerprint} /> : walkSession ? <GuidedScaleWalk session={walkSession} events={walkEvents} progress={walkProgress} scale={walkScale} showConventions={showConventions} nowMs={nowMs} onStart={onStartWalk} onRestart={onRestartWalk} onEnd={onEndWalk} /> : gravityCounterfactualSession ? <TonalGravityCounterfactualField session={gravityCounterfactualSession} result={gravityCounterfactualResult} availableAttackCount={phraseEvents.length} doMidi={doMidi} scale={frame.scale} showConventions={showConventions} onStart={onStartGravityCounterfactual} onTarget={onTargetGravityCounterfactual} onCue={onCueGravityCounterfactual} onRecapture={onRecaptureGravityCounterfactual} onEnd={onEndGravityCounterfactual} /> : <div className="hud-scale-experiment-choices" aria-label="Choose one scale experiment">
      <PerformedScaleFingerprintBuilder session={null} progress={null} showConventions={showConventions} soundModelId={soundModelId} onStart={onStartFingerprint} onRestart={onRestartFingerprint} onReplay={onReplayFingerprint} onReveal={onRevealFingerprint} onEnd={onEndFingerprint} />
      <GuidedScaleWalk session={null} events={[]} progress={null} scale={walkScale} showConventions={showConventions} nowMs={nowMs} onStart={onStartWalk} onRestart={onRestartWalk} onEnd={onEndWalk} />
      <TonalGravityCounterfactualField session={null} result={null} availableAttackCount={phraseEvents.length} doMidi={doMidi} scale={frame.scale} showConventions={showConventions} onStart={onStartGravityCounterfactual} onTarget={onTargetGravityCounterfactual} onCue={onCueGravityCounterfactual} onRecapture={onRecaptureGravityCounterfactual} onEnd={onEndGravityCounterfactual} />
    </div>}
    {!fingerprintSession && !walkSession && !gravityCounterfactualSession ? <div className="hud-scale-learning-grid">
      <div className="hud-fingerprint-field">
        <div className="hud-subheading"><span>Selected frame · derived shape</span><strong>Read the gaps before the name</strong><small>{new Set(phraseEvents.map((event) => pitchClassFromMidi(event.note))).size} measured pitch classes encountered in phrase memory</small></div>
        <div className="hud-fingerprint" role="img" aria-label={`Cyclic scale gap fingerprint ${fingerprint.steps.join(", ")} semitones`}>
          {fingerprint.steps.map((step, index) => {
            const start = fingerprint.positions[index];
            const startPitchClass = pitchClassFromMidi(frame.rootPitchClass + rotationOffset + start);
            const endPitchClass = pitchClassFromMidi(startPitchClass + step);
            const encountered = observed.has(startPitchClass) && observed.has(endPitchClass);
            return <span key={`${fingerprint.rotation}-${index}`} className={encountered ? "is-encountered" : ""} style={{ "--fingerprint-gap": step } as CSSProperties}><strong>{step}</strong><small>{step === 1 ? "close" : step === 2 ? "whole" : "wide"}</small></span>;
          })}
        </div>
        <div className="hud-fingerprint-caption"><span>{fingerprint.steps.join("–")} semitones</span><small>Totals {fingerprint.total}: the octave loop closes. Moving Do transposes the loop without changing this string.</small></div>
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
          {forks.map((fork) => <button key={`${fork.id}-${fork.pitchClass}`} type="button" disabled={targetMatched} aria-pressed={target?.id === fork.id && target.pitchClass === fork.pitchClass} onClick={() => onChooseTarget(fork)}><span>{fork.label}</span><strong>{pitchClassRoleLabel(fork.pitchClass, forkDoMidi, forkScale, showConventions)} · {movementLabel(fork.movement)}</strong><small>{fork.explanation}</small></button>)}
        </div>
        {target ? <div className={`hud-resolution-feedback ${targetMatched ? "is-match" : ""}`}><p className="sr-only" role="status" aria-live="polite">{targetMatched ? "You played the fork. The first matching attack is fixed." : "Silent resolution target armed."}</p><span>{targetMatched ? "You played the fork" : "Silent target armed"}</span><strong>{pitchClassRoleLabel(target.pitchClass, forkDoMidi, forkScale, showConventions)} · any octave</strong><small>{targetMatched ? "The first matching attack is now fixed. Trace what the intended destination did without letting the model fill your experience." : "One pitch class is dashed on the keyboard. No note was entered or sounded."}</small><div className="hud-resolution-feedback-actions">{targetMatched && landingEvidence ? <button type="button" aria-expanded={landingRevealed} aria-controls="hud-resolution-landing-panel" onClick={() => setLandingRevealEventId(landingRevealed ? null : landingEvidence.landingEventId)}>{landingRevealed ? "Hide landing lenses" : "Trace this landing"}</button> : null}<button type="button" onClick={onClearTarget}>Clear fork</button></div></div> : null}
        {!forks.length ? <p>Play at least one note to reveal contrasting continuation intentions.</p> : null}
      </div>
    </div> : null}
    {landingRevealed && target && landingEvidence ? <div id="hud-resolution-landing-panel"><ResolutionLandingLens phraseEvents={landingEvents} target={target} evidence={landingEvidence} doMidi={doMidi} showConventions={showConventions} onReflect={onReflectResolution} /></div> : null}
  </section>;
}

function chordLabel(candidate: ChordCandidate, doMidi: number, showConventions: boolean) {
  const root = showConventions ? CONVENTIONAL_PITCH_CLASSES[candidate.rootPitchClass] : CHROMATIC_SOLFEGE[pitchClassFromMidi(candidate.rootPitchClass - pitchClassFromMidi(doMidi))];
  if (showConventions) return `${root}${candidate.template.symbol || ""}`;
  return `${root} · ${candidate.template.name}`;
}

function RelationshipTexture({ notes, inheritedNotes, excludedInheritedNotes = [], doMidi, scale, showConventions }: { notes: number[]; inheritedNotes: number[]; excludedInheritedNotes?: number[]; doMidi: number; scale: PianoScale; showConventions: boolean }) {
  const unique = uniqueSorted(notes);
  const pairs = pairwiseIntervals(unique);
  const semitoneProfile = semitoneFieldProfile(unique, doMidi);
  const semitoneBins = semitoneProfile.intervalBins.map((bin) => `${bin.semitones}${bin.pairCount > 1 ? `×${bin.pairCount}` : ""}`).join(" · ");
  const xFor = (note: number) => unique.length <= 1 ? 180 : 46 + (unique.indexOf(note) / (unique.length - 1)) * 268;
  const pairScore = (semitones: number) => {
    const distance = intervalLandmark(semitones);
    return Math.max(0.15, 1 - Math.min(1, Math.abs(distance.errorCents) / 35));
  };
  return (
    <div className="hud-texture-panel">
      <div className="hud-panel-heading"><span>Everything physically sounding</span><strong>Interval texture</strong><small>Every arc is an exact semitone span. Thickness shows nearness to its declared reference—integer ratios except the six-semitone √2 midpoint—and is not a consonance ranking. Hollow nodes were inherited; crossed nodes are excluded only from the chord reading.</small></div>
      <svg viewBox="0 0 360 168" role="img" aria-label={pairs.length ? `${pairs.length} pairwise interval relationships across every sounding note. Octave-folded semitone counts ${semitoneBins}. Adjacent voicing gaps ${semitoneProfile.adjacentGaps.join(", ") || "none"} semitones. ${excludedInheritedNotes.length} inherited note${excludedInheritedNotes.length === 1 ? " is" : "s are"} excluded from chord interpretation but retained here.` : "Interval texture needs two simultaneous notes"}>
        <title>Pairwise interval texture</title>
        {pairs.map((pair) => {
          const x1 = xFor(pair.lower); const x2 = xFor(pair.upper); const peak = 126 - Math.min(90, (x2 - x1) * 0.38);
          return <g key={`${pair.lower}-${pair.upper}`}><path d={`M ${x1} 126 Q ${(x1 + x2) / 2} ${peak} ${x2} 126`} className="hud-texture-arc" style={{ "--arc-strength": pairScore(pair.upper - pair.lower) } as CSSProperties}><title>{pair.distance.semitones} semitone{pair.distance.semitones === 1 ? "" : "s"}; {pair.distance.relationship}; {pair.distance.cents} cents</title></path>{pairs.length <= 3 ? <text x={(x1 + x2) / 2} y={peak - 5} className="hud-texture-gap-label">{pair.distance.semitones} st</text> : null}</g>;
        })}
        {unique.map((note) => {
          const inherited = inheritedNotes.includes(note);
          const excluded = excludedInheritedNotes.includes(note);
          const x = xFor(note);
          return <g key={note}><circle cx={x} cy="126" r="9" className={`hud-texture-node ${inherited ? "is-inherited" : ""} ${excluded ? "is-excluded" : ""}`} />{excluded ? <><line x1={x - 5} x2={x + 5} y1="121" y2="131" className="hud-texture-exclusion" /><line x1={x + 5} x2={x - 5} y1="121" y2="131" className="hud-texture-exclusion" /></> : null}<text x={x} y="151" className="hud-point-label">{showConventions ? conventionalPitchName(note) : relativeSyllable(note, doMidi, scale)}</text></g>;
        })}
        {unique.length < 2 ? <text x="180" y="78" className="hud-empty-label">Hold two notes to expose their interval</text> : null}
      </svg>
      {pairs.length ? <div className="hud-semitone-reading"><span>Semitone ruler</span><strong>{semitoneBins} st</strong><small>Adjacent register gaps {semitoneProfile.adjacentGaps.join("–")} semitones · closest pair {semitoneProfile.closestGap}. These numbers locate the notes. Simultaneous crunch still depends on register, overlap, and the selected assumed spectrum.</small></div> : null}
    </div>
  );
}

function selectedIntervalPair(notes: number[], focusedNote: number | null) {
  const unique = uniqueSorted(notes);
  if (unique.length < 2) return [];
  const anchor = focusedNote != null && unique.includes(focusedNote) ? focusedNote : unique.at(-1)!;
  const neighbor = unique
    .filter((note) => note !== anchor)
    .sort((first, second) => Math.abs(first - anchor) - Math.abs(second - anchor) || first - second)[0];
  return [anchor, neighbor].sort((first, second) => first - second);
}

function PartialInteractionMicroscope({ notes, focusedNote, doMidi, scale, soundModelId, showConventions }: {
  notes: number[];
  focusedNote: number | null;
  doMidi: number;
  scale: PianoScale;
  soundModelId: PianoSoundModelId;
  showConventions: boolean;
}) {
  const pair = selectedIntervalPair(notes, focusedNote);
  const model = pianoSoundModel(soundModelId);
  if (pair.length < 2) return <section className="hud-partial-microscope" aria-labelledby="hud-partial-title">
    <div className="hud-panel-heading"><span>Physical frequencies → assumed spectrum</span><strong id="hud-partial-title">Where partials meet</strong><small>Hold two notes. Select an event above to inspect that note with its nearest sounding neighbor.</small></div>
    <p className="hud-empty-copy">Two simultaneous or retained field notes are needed. MIDI itself contains no partials or instrument audio.</p>
  </section>;

  const [lowerNote, upperNote] = pair;
  const lowerHz = frequencyFromMidi(lowerNote);
  const upperHz = frequencyFromMidi(upperNote);
  const interaction = pianoPartialInteraction(lowerHz, upperHz, soundModelId);
  const distance = intervalLandmark(upperNote - lowerNote);
  const allPartials = [...interaction.lowerPartials, ...interaction.upperPartials];
  const minimumHz = Math.min(...allPartials.map((partial) => partial.frequencyHz)) * 0.92;
  const maximumHz = Math.max(...allPartials.map((partial) => partial.frequencyHz)) * 1.08;
  const xFor = (frequencyHz: number) => 88 + (Math.log2(frequencyHz / minimumHz) / Math.log2(maximumHz / minimumHz)) * 584;
  const lowerLabel = showConventions ? conventionalPitchName(lowerNote) : relativeSyllable(lowerNote, doMidi, scale);
  const upperLabel = showConventions ? conventionalPitchName(upperNote) : relativeSyllable(upperNote, doMidi, scale);
  const alignedShown = interaction.alignedPairs.slice(0, 8);
  const interactionsShown = interaction.interactionPairs.slice(0, 6);
  const strongestInteraction = interaction.interactionPairs[0] ?? null;
  const alignedCopy = interaction.alignedPairs.length
    ? interaction.alignedPairs.slice(0, 3).map((item) => `${item.lowerPartial}↔${item.upperPartial}`).join(" · ")
    : "none within 18 cents";
  const interactionCopy = strongestInteraction
    ? `${strongestInteraction.lowerPartial}↔${strongestInteraction.upperPartial} · ${strongestInteraction.separationHz.toFixed(1)} Hz apart`
    : "no strong near-collision in the displayed proxy";
  const pairSelectionCopy = notes.length > 2 ? `Selected event + nearest of ${uniqueSorted(notes).length} sounding notes` : "Two-note field";
  const summary = `${lowerLabel} at ${lowerHz.toFixed(1)} hertz and ${upperLabel} at ${upperHz.toFixed(1)} hertz; ${distance.relationship}; ${interaction.alignedPairs.length} aligned partial pairs and ${interaction.interactionPairs.length} modeled interaction-zone pairs under the ${model.shortLabel} assumed spectrum; roughness proxy ${Math.round(interaction.roughness * 100)} and partial overlap ${Math.round(interaction.overlap * 100)}.`;
  return <section className="hud-partial-microscope" aria-labelledby="hud-partial-title">
    <div className="hud-panel-heading"><span>{pairSelectionCopy} · {distance.relationship}</span><strong id="hud-partial-title">Where partials meet</strong><small>Reference frequencies are derived from MIDI key numbers using 12-TET at A4=440 Hz. Every upper partial and link is generated by the {model.shortLabel.toLowerCase()} teaching spectrum—not your DAW audio.</small></div>
    <svg viewBox="0 0 720 196" role="img" aria-label={summary}>
      <title>Two assumed partial combs on one logarithmic frequency axis</title>
      <line x1="88" x2="672" y1="70" y2="70" className="hud-partial-axis" />
      <line x1="88" x2="672" y1="130" y2="130" className="hud-partial-axis" />
      <text x="8" y="63" className="hud-partial-lane-label">{lowerLabel}</text><text x="8" y="76" className="hud-partial-hz-label">{lowerHz.toFixed(1)} Hz</text>
      <text x="8" y="123" className="hud-partial-lane-label">{upperLabel}</text><text x="8" y="136" className="hud-partial-hz-label">{upperHz.toFixed(1)} Hz</text>
      {alignedShown.map((item) => <g key={`a-${item.lowerPartial}-${item.upperPartial}`}><line x1={xFor(item.lowerHz)} x2={xFor(item.upperHz)} y1="73" y2="127" className="hud-partial-link is-aligned"><title>{`Aligned proxy partials ${item.lowerPartial} and ${item.upperPartial}; ${item.centsApart.toFixed(1)} cents apart`}</title></line><circle cx={(xFor(item.lowerHz) + xFor(item.upperHz)) / 2} cy="100" r="3" className="hud-partial-alignment-mark" /></g>)}
      {interactionsShown.map((item) => <g key={`i-${item.lowerPartial}-${item.upperPartial}`}><line x1={xFor(item.lowerHz)} x2={xFor(item.upperHz)} y1="73" y2="127" className="hud-partial-link is-interaction"><title>{`Proxy partials ${item.lowerPartial} and ${item.upperPartial}; ${item.separationHz.toFixed(1)} hertz and ${item.centsApart.toFixed(1)} cents apart`}</title></line><rect x={(xFor(item.lowerHz) + xFor(item.upperHz)) / 2 - 2.5} y="97.5" width="5" height="5" className="hud-partial-interaction-mark" transform={`rotate(45 ${(xFor(item.lowerHz) + xFor(item.upperHz)) / 2} 100)`} /></g>)}
      {interaction.lowerPartials.map((partial) => <line key={`l-${partial.partialIndex}`} x1={xFor(partial.frequencyHz)} x2={xFor(partial.frequencyHz)} y1="70" y2={70 - 9 - partial.amplitude * 24} className={`hud-partial-stem is-lower ${partial.partialIndex === 1 ? "is-fundamental" : ""}`}><title>{`${lowerLabel} partial ${partial.partialIndex}: ${partial.frequencyHz.toFixed(1)} hertz, relative amplitude ${partial.amplitude.toFixed(2)}`}</title></line>)}
      {interaction.upperPartials.map((partial) => <line key={`u-${partial.partialIndex}`} x1={xFor(partial.frequencyHz)} x2={xFor(partial.frequencyHz)} y1="130" y2={130 + 9 + partial.amplitude * 24} className={`hud-partial-stem is-upper ${partial.partialIndex === 1 ? "is-fundamental" : ""}`}><title>{`${upperLabel} partial ${partial.partialIndex}: ${partial.frequencyHz.toFixed(1)} hertz, relative amplitude ${partial.amplitude.toFixed(2)}`}</title></line>)}
      <text x="88" y="181" className="hud-partial-axis-label">frequency grows by ratio →</text>
      <circle cx="463" cy="178" r="3" className="hud-partial-alignment-mark" /><text x="471" y="181" className="hud-partial-axis-label">aligned</text>
      <rect x="535" y="175" width="5" height="5" className="hud-partial-interaction-mark" transform="rotate(45 537.5 177.5)" /><text x="545" y="181" className="hud-partial-axis-label">interaction zone</text>
    </svg>
    <div className="hud-partial-readout">
      <p><span>12-TET reference relationship</span><strong>{lowerHz.toFixed(1)} → {upperHz.toFixed(1)} Hz</strong><small>{distance.cents} cents · near {distance.relationship}</small></p>
      <p><span>partial alignment</span><strong>{alignedCopy}</strong><small>{interaction.alignedPairs.length} pair{interaction.alignedPairs.length === 1 ? "" : "s"} within the declared 18-cent teaching window</small></p>
      <p><span>strongest interaction zone</span><strong>{interactionCopy}</strong><small>{strongestInteraction ? strongestInteraction.separationHz < 30 ? `If present as steady components, this pair would create about ${strongestInteraction.separationHz.toFixed(1)} amplitude beats per second.` : "Separation and level both affect the roughness proxy." : "No pair crosses the displayed interaction-link threshold."}</small></p>
      <p><span>separate model outputs</span><strong>roughness {Math.round(interaction.roughness * 100)}/100 · overlap {Math.round(interaction.overlap * 100)}/100</strong><small>Roughness sums every cross-partial contribution, including weak unlinked pairs. Neither output measures musical goodness, your instrument, or your experience.</small></p>
    </div>
  </section>;
}

function SharedCycleLens({ notes, doMidi, scale, showConventions }: {
  notes: number[];
  doMidi: number;
  scale: PianoScale;
  showConventions: boolean;
}) {
  const unique = uniqueSorted(notes);
  const specimenKey = unique.join("-");
  const candidates = sharedCycleCandidates(unique);
  const [selection, setSelection] = useState({ specimenKey, revealed: false, index: 0 });
  const current = selection.specimenKey === specimenKey ? selection : { specimenKey, revealed: false, index: 0 };
  const candidate = candidates[Math.min(current.index, Math.max(0, candidates.length - 1))] ?? null;
  const label = (note: number) => showConventions ? conventionalPitchName(note) : relativeSyllable(note, doMidi, scale);
  const signedCents = (value: number) => `${value > 0 ? "+" : value < 0 ? "−" : ""}${Math.abs(value).toFixed(1)}¢`;
  const fitLabel = (item: SharedCycleCandidate) => item.maximumErrorCents < 10 ? "close compact fit" : item.maximumErrorCents < 24 ? "visible approximation" : "loose compact fit";
  const setRevealed = (revealed: boolean) => setSelection({ specimenKey, revealed, index: 0 });

  if (!current.revealed) return <section className="hud-shared-cycle is-collapsed" aria-labelledby="hud-shared-cycle-title">
    <div className="hud-shared-cycle-prompt"><div><span>Global physical question · MIDI-derived references</span><strong id="hud-shared-cycle-title">Could these pitches nearly repeat inside one longer cycle?</strong><small>Pairwise intervals describe every edge. This optional view asks a different question: can one short integer template approximately contain the whole field?</small></div><button type="button" disabled={unique.length < 2 || unique.length > 6} aria-expanded="false" onClick={() => setRevealed(true)}>Find shared cycles</button></div>
    {unique.length > 6 ? <p>Choose a field with two to six distinct physical keys; the lens will not compress a larger pitch field into one global template.</p> : null}
  </section>;

  if (!candidate) return <section className="hud-shared-cycle is-open" aria-labelledby="hud-shared-cycle-title">
    <div className="hud-shared-cycle-topline"><div><span>Global physical question · MIDI-derived references</span><strong id="hud-shared-cycle-title">No compact shared-cycle candidate</strong><small>No integer template through harmonic 16 keeps every 12-TET reference frequency within 35 cents. Pairwise relationships still remain available above.</small></div><button type="button" aria-expanded="true" onClick={() => setRevealed(false)}>Hide</button></div>
    <p className="hud-shared-cycle-limit">This refusal is not evidence that the field is dissonant, nonmusical, unpleasant, or without tonal meaning.</p>
  </section>;

  const plotWidth = 560;
  const xStart = 116;
  const rowGap = 38;
  const firstRow = 58;
  const plotHeight = firstRow + candidate.voices.length * rowGap + 38;
  const wavePath = (voice: SharedCycleCandidate["voices"][number], rowIndex: number) => {
    const rowY = firstRow + rowIndex * rowGap;
    return Array.from({ length: 121 }, (_, index) => {
      const progress = index / 120;
      const x = xStart + progress * plotWidth;
      const y = rowY - Math.sin(progress * voice.actualCycles * Math.PI * 2) * 9;
      return `${index ? "L" : "M"} ${x.toFixed(1)} ${y.toFixed(1)}`;
    }).join(" ");
  };
  const summary = `Shared-cycle candidate ${candidate.harmonics.join(":")} with a fitted base at ${candidate.fundamentalHz.toFixed(2)} hertz and candidate period ${candidate.periodMs.toFixed(2)} milliseconds. ${candidate.voices.map((voice) => `${label(voice.note)} at ${voice.frequencyHz.toFixed(1)} hertz under the A4=440 reference maps near integer multiple ${voice.harmonic} with ${signedCents(voice.errorCents)} mismatch`).join(". ")}. Phases are reset together only for this visual comparison.`;
  return <section className="hud-shared-cycle is-open" aria-labelledby="hud-shared-cycle-title">
    <div className="hud-shared-cycle-topline"><div><span>Candidate shared periodicity · derived reference frequencies</span><strong id="hud-shared-cycle-title">One long cycle, several near-integer repetitions</strong><small>The base is fitted to A4=440 reference frequencies derived from MIDI key numbers. No acoustic pitch, pitch bend, instrument tuning, phase, or spectrum was measured.</small></div><button type="button" aria-expanded="true" onClick={() => setRevealed(false)}>Hide</button></div>
    {candidates.length > 1 ? <div className="hud-shared-cycle-choices" role="group" aria-label="Shared-cycle complexity and mismatch tradeoffs">{candidates.map((item, index) => <button key={item.harmonics.join(":")} type="button" aria-pressed={current.index === index} onClick={() => setSelection({ specimenKey, revealed: true, index })}><span>{index === 0 ? "shorter template" : index === candidates.length - 1 ? "closer template" : "middle tradeoff"}</span><strong>{item.harmonics.join(":")}</strong><small>largest mismatch {item.maximumErrorCents.toFixed(1)}¢</small></button>)}</div> : null}
    <div className="hud-shared-cycle-summary"><span>{fitLabel(candidate)}</span><strong>{candidate.harmonics.join(" : ")} near integer multiples of a fitted {candidate.fundamentalHz.toFixed(2)} Hz base</strong><small>candidate period {candidate.periodMs.toFixed(2)} ms · RMS mismatch {candidate.rmsErrorCents.toFixed(1)}¢ · largest {candidate.maximumErrorCents.toFixed(1)}¢</small></div>
    <svg viewBox={`0 0 720 ${plotHeight}`} role="img" aria-label={summary}>
      <title>MIDI-derived 12-TET reference frequencies drawn across one fitted shared-cycle period</title>
      <line x1={xStart} x2={xStart} y1="32" y2={plotHeight - 26} className="hud-shared-cycle-boundary" />
      <line x1={xStart + plotWidth} x2={xStart + plotWidth} y1="32" y2={plotHeight - 26} className="hud-shared-cycle-boundary is-end" />
      <text x={xStart} y="20" className="hud-shared-cycle-axis-label">phase reset · 0 ms</text><text x={xStart + plotWidth} y="20" className="hud-shared-cycle-axis-label is-end">candidate return · {candidate.periodMs.toFixed(2)} ms</text>
      {candidate.voices.map((voice, index) => {
        const rowY = firstRow + index * rowGap;
        const endY = rowY - Math.sin(voice.actualCycles * Math.PI * 2) * 9;
        return <g key={voice.note} className="hud-shared-cycle-voice"><line x1={xStart} x2={xStart + plotWidth} y1={rowY} y2={rowY} className="hud-shared-cycle-midline" /><path d={wavePath(voice, index)} /><circle cx={xStart + plotWidth} cy={endY} r="4" /><text x="8" y={rowY - 2} className="hud-shared-cycle-note">{label(voice.note)}</text><text x="8" y={rowY + 11} className="hud-shared-cycle-hz">{voice.frequencyHz.toFixed(1)} Hz</text><text x={xStart + plotWidth - 8} y={rowY - 12} className="hud-shared-cycle-error">h{voice.harmonic} · {signedCents(voice.errorCents)}</text><title>{`${label(voice.note)}: ${voice.actualCycles.toFixed(3)} actual cycles, near harmonic ${voice.harmonic}, ${signedCents(voice.errorCents)} mismatch`}</title></g>;
      })}
    </svg>
    <div className="hud-shared-cycle-reading"><div><span>What the picture says</span><strong>Smaller endpoint drift means the reference frequencies nearly close together under this candidate period.</strong></div><div><span>What it does not say</span><strong>Not a detected root, chord name, tonal function, acoustic fusion, consonance, emotion, or goodness.</strong></div></div>
    <p className="hud-shared-cycle-limit">Changing register or equal-tempered spacing can change the shortest template. Actual audibility also depends on spectrum, duration, phase, level, room, hearing, context, and the listener.</p>
  </section>;
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

function LastAttackChange({ events, focusedId, doMidi, scale, showConventions, onReflect }: {
  events: HudNoteEvent[];
  focusedId: number | null;
  doMidi: number;
  scale: PianoScale;
  showConventions: boolean;
  onReflect: () => void;
}) {
  const foundIndex = events.findIndex((event) => event.id === focusedId);
  const selectedIndex = foundIndex >= 0 ? foundIndex : events.length - 1;
  const event = events[selectedIndex] ?? events.at(-1) ?? null;
  if (!event) return <section className="hud-last-attack" aria-labelledby="hud-last-attack-title">
    <div className="hud-last-attack-heading"><span>One selected attack · five lenses</span><strong id="hud-last-attack-title">What did this attack change?</strong><small>Play one note. Measured, modeled, and personal evidence will stay visibly separate.</small></div>
  </section>;

  const actualIndex = events.findIndex((candidate) => candidate.id === event.id);
  const previous = actualIndex > 0 ? events[actualIndex - 1] : null;
  const beforeNotes = previous ? uniqueSorted(previous.fieldNotes) : [];
  const afterNotes = uniqueSorted(event.fieldNotes);
  const fieldChange = previous ? controlledSonorityChange(beforeNotes, afterNotes) : null;
  const exactOneNoteAddition = fieldChange?.kind === "one-added" && fieldChange.changedNote === event.note;
  const melodicMove = previous ? event.note - previous.note : null;
  const onsetGapMs = previous ? Math.max(0, event.onsetMs - previous.onsetMs) : null;
  const velocityDelta = previous ? event.velocity - previous.velocity : null;
  const beforeTendency = tonalTendency(beforeNotes, doMidi, scale);
  const afterTendency = tonalTendency(afterNotes, doMidi, scale);
  const context = noteContext(event.note, doMidi, scale);
  const label = showConventions ? conventionalPitchName(event.note) : context.syllable;
  const signed = (value: number) => `${value > 0 ? "+" : value < 0 ? "−" : ""}${Math.abs(Math.round(value))}`;
  const createdIntervalCopy = exactOneNoteAddition && fieldChange.changedIntervals.length
    ? fieldChange.changedIntervals.slice(0, 3).map((item) => `${item.distance.semitones} semitone${item.distance.semitones === 1 ? "" : "s"} · ${item.distance.relationship}`).join(" / ")
    : null;
  const relationshipStrong = exactOneNoteAddition
    ? createdIntervalCopy ?? "First field position established"
    : fieldChange?.kind === "same"
      ? melodicMove == null ? "No earlier relationship" : `Membership unchanged · melodic move ${signed(melodicMove)}`
      : melodicMove == null
        ? "No earlier microscope snapshot"
        : `Melodic move ${formatSemitones(melodicMove, 0, true)}`;
  const relationshipSmall = exactOneNoteAddition
    ? fieldChange.changedIntervals.length
      ? `${fieldChange.changedIntervals.length} pairwise relationship${fieldChange.changedIntervals.length === 1 ? "" : "s"} can be attributed to this newly entered note.`
      : "This is the first member of the field, so it creates a reference rather than a pair."
    : fieldChange?.kind === "multiple"
      ? `${fieldChange.addedNotes.length} note${fieldChange.addedNotes.length === 1 ? "" : "s"} entered and ${fieldChange.removedNotes.length} note${fieldChange.removedNotes.length === 1 ? "" : "s"} left between snapshots; those changes cannot all be attributed to this attack.`
      : fieldChange?.kind === "one-removed"
        ? "A note left between snapshots as this attack arrived, so the whole field change is not a one-note addition."
        : fieldChange?.kind === "same"
          ? "The attack changed the melodic sequence without adding a new MIDI member to the field."
          : "The rolling microscope has no earlier field snapshot for a strict before/after attribution.";
  const attribution = exactOneNoteAddition
    ? `Exactly one MIDI member entered: ${label}. Its new pairwise relationships are attributable; the other lenses remain observations or models.`
    : fieldChange?.kind === "same"
      ? `${label} was attacked while the MIDI field membership stayed fixed. This is a repeated event, not a new field member.`
      : fieldChange
        ? `The field changed in more than one way around ${label}. The HUD reports snapshots without inventing a one-note cause.`
        : `${label} is the earliest attack available in the seven-event microscope, so there is no earlier field snapshot to compare.`;
  return <section className="hud-last-attack" aria-labelledby="hud-last-attack-title">
    <div className="hud-last-attack-heading">
      <span>Attack {actualIndex + 1} selected · five lenses</span>
      <strong id="hud-last-attack-title">What did this attack change?</strong>
      <small>{showConventions ? `${label} · ` : ""}{formatHz(context.frequencyHz)} · click another attack above to move the microscope</small>
    </div>
    <div className={`hud-last-attack-reading ${exactOneNoteAddition ? "is-attributable" : ""}`} role="status" aria-live="polite">{attribution}</div>
    <div className="hud-last-lenses" role="group" aria-label="Five separate lenses for the selected attack change">
      <article className="is-measured"><span>Sound</span><em>MIDI key + derived reference</em><strong>{label} · {formatHz(context.frequencyHz)}</strong><small>Attack {event.velocity}/127{velocityDelta == null ? "" : ` · ${signed(velocityDelta)} from prior attack`} · {previous ? `field ${beforeNotes.length}→${afterNotes.length} notes` : `current field snapshot ${afterNotes.length} note${afterNotes.length === 1 ? "" : "s"}`}. Hz assumes 12-TET at A4=440; MIDI attack is not acoustic loudness.</small></article>
      <article className="is-measured"><span>Relationships</span><em>{exactOneNoteAddition ? "attributable MIDI" : "measured snapshots"}</em><strong>{relationshipStrong}</strong><small>{relationshipSmall}</small></article>
      <article className="is-measured"><span>Motion</span><em>measured time</em><strong>{melodicMove == null ? "First visible attack" : `${formatSemitones(melodicMove, 0, true)} · ${Math.round(onsetGapMs!)} ms later`}</strong><small>{event.releaseMs == null ? "Still sounding in the captured state." : `Sounding duration ${durationLabel(event, event.releaseMs)}.`} This describes events, not fingering or technique.</small></article>
      <article className="is-modeled"><span>Context</span><em>selected-frame model</em><strong>{previous ? `pull ${Math.round(beforeTendency.homePull * 100)}→${Math.round(afterTendency.homePull * 100)} · home ${Math.round(beforeTendency.homeEvidence * 100)}→${Math.round(afterTendency.homeEvidence * 100)}` : `current pull ${Math.round(afterTendency.homePull * 100)} · home evidence ${Math.round(afterTendency.homeEvidence * 100)}`}</strong><small>{label} is {context.inScale ? "inside" : "outside"} the selected {scale.name}. These are route-relative teaching proxies, not heard certainty.</small></article>
      <article className="is-unclaimed"><span>Experience</span><em>listener only</em><strong>Not inferred</strong><small>Settledness, energy, familiarity, and liking belong to your report, not to the MIDI or context model.</small><button type="button" onClick={onReflect}>Reflect on this phrase</button></article>
    </div>
    <p className="hud-last-attack-limit">No lens is averaged into similarity, correctness, emotion, listenability, or musical goodness.</p>
  </section>;
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

function motifSigned(value: number) {
  return `${value > 0 ? "+" : value < 0 ? "−" : ""}${Math.abs(value)}`;
}

function MotifFingerprintFigure({ id, readingTitle, comparison, sourceLabel, targetLabel }: {
  id: string;
  readingTitle: string;
  comparison: MotifFingerprintComparison;
  sourceLabel: string;
  targetLabel: string;
}) {
  const pitchPath = (path: number[]) => path.map(motifSigned).join(" → ");
  const intervalPath = (path: number[]) => path.map(motifSigned).join(" · ");
  const timingPath = (shares: number[]) => shares.map((share) => `${Math.round(share * 100)}%`).join(" · ");
  const kept = [
    comparison.pitchShapePreserved ? "the signed pitch-step path" : comparison.openingShapePreserved ? "the opening pitch-step path" : null,
    comparison.rhythmWithinDetectorTolerance ? "the relative timing shape" : null,
    comparison.startShiftSemitones === 0 ? "the starting key" : null,
  ].filter(Boolean).join(" and ");
  const changed = [
    comparison.startShiftSemitones !== 0 ? `the start moved ${formatSemitones(comparison.startShiftSemitones, 0, true)}` : null,
    !comparison.rhythmWithinDetectorTolerance ? `gap ${comparison.largestTimingChangeGapIndex == null ? "timing" : comparison.largestTimingChangeGapIndex + 1} changed most` : null,
    comparison.changedIntervalIndices.length ? `move ${comparison.changedIntervalIndices.map((index) => index + 1).join(", ")} changed` : null,
  ].filter(Boolean).join("; ") || "no detector property changed";
  const summary = `${sourceLabel} and ${targetLabel}. Relative pitch paths ${pitchPath(comparison.sourceRelativePitchPath)} and ${pitchPath(comparison.targetRelativePitchPath)}. Interval paths ${intervalPath(comparison.sourceIntervalPath)} and ${intervalPath(comparison.targetIntervalPath)}. Timing shares ${timingPath(comparison.sourceTimingShares)} and ${timingPath(comparison.targetTimingShares)}. Kept: ${kept || "no complete fingerprint"}. Changed: ${changed}.`;
  const timingLane = (shares: number[]) => <span className="hud-motif-time-bar" aria-hidden="true">{shares.map((share, index) => <i key={index} style={{ "--motif-gap-share": share } as CSSProperties}><b>{Math.round(share * 100)}%</b></i>)}</span>;
  const titleId = `hud-motif-fingerprint-${id}-title`;
  return <div className="hud-motif-fingerprint" aria-labelledby={titleId}>
    <div className="hud-subheading"><span>Comparison made inspectable</span><strong id={titleId}>What survived the return?</strong><small>Set each statement’s first key to 0; turn each onset gap into a share of that statement’s total span.</small></div>
    <div className="hud-motif-fingerprint-grid" role="img" aria-label={summary}>
      <span aria-hidden="true" />
      <strong>{sourceLabel}</strong>
      <strong>{targetLabel}</strong>
      <span>relative key path</span>
      <code>{pitchPath(comparison.sourceRelativePitchPath)}</code>
      <code>{pitchPath(comparison.targetRelativePitchPath)}</code>
      <span>signed moves</span>
      <code>{intervalPath(comparison.sourceIntervalPath)}</code>
      <code>{intervalPath(comparison.targetIntervalPath)}</code>
      <span>gap shares</span>
      <div>{timingLane(comparison.sourceTimingShares)}<small>{timingPath(comparison.sourceTimingShares)}</small></div>
      <div>{timingLane(comparison.targetTimingShares)}<small>{timingPath(comparison.targetTimingShares)}</small></div>
    </div>
    <div className="hud-motif-invariance-reading" role="status" aria-live="polite">
      <span>invariance before interpretation</span>
      <strong>Kept: {kept || "no complete fingerprint"}</strong>
      <small>Changed: {changed}. This local comparison explains “{readingTitle}”; it does not infer intended motif, formal function, emotion, quality, or correctness.</small>
    </div>
  </div>;
}

function motifEchoTitle(comparison: MotifEchoComparison) {
  if (comparison.kind === "exact-repeat") return "exact return";
  if (comparison.kind === "transposed-repeat") return `same shape · start shifted ${motifSigned(comparison.startShiftSemitones)}`;
  if (comparison.kind === "rhythmic-variation") return "same pitch shape · timing changed";
  if (comparison.kind === "altered-ending") return `same opening · ending moved ${motifSigned(comparison.endingDeltaSemitones)}`;
  return "more than one relationship changed";
}

function motifTrailLabel(comparison: MotifEchoComparison) {
  if (comparison.kind === "exact-repeat") return "exact relationship";
  if (comparison.kind === "transposed-repeat") return `shift ${motifSigned(comparison.startShiftSemitones)}`;
  if (comparison.kind === "rhythmic-variation") return "timing changed";
  if (comparison.kind === "altered-ending") return "ending changed";
  return "several changes";
}

function MotifReturnTrail({ comparisons, currentIndex }: { comparisons: MotifEchoComparison[]; currentIndex: number | null }) {
  const arc = motifReturnArc(comparisons);
  const statusTitle = arc.status === "return-after-variation"
    ? "The relationship returned after a variation."
    : arc.status === "variation-open"
      ? "The variation is open—try bringing the relationship back."
      : comparisons.length
        ? "A relationship return is present; change one property next."
        : "Keep a statement to begin the transformation path.";
  const summary = `Chosen source followed by ${comparisons.length} statement${comparisons.length === 1 ? "" : "s"}: ${comparisons.map(motifTrailLabel).join(", ") || "none yet"}. ${statusTitle} Returns here mean recovered pitch and timing fingerprints, not inferred musical form.`;
  return <div className={`hud-motif-return-trail is-${arc.status}`}>
    <div className="hud-subheading"><span>Local sequence · source → change → return</span><strong>How can changed material become recognizable again?</strong><small>Each kept statement stays in order. A return may come back on the same key or carry the relationship to a new key.</small></div>
    <ol role="img" aria-label={summary} style={{ "--motif-statement-count": comparisons.length + 1 } as CSSProperties}>
      <li className="is-source"><span>source</span><strong>chosen relationship</strong></li>
      {comparisons.map((comparison, index) => {
        const isReturn = comparison.kind === "exact-repeat" || comparison.kind === "transposed-repeat";
        return <li key={index} className={`${isReturn ? "is-return" : "is-variation"}${currentIndex === index ? " is-current" : ""}`}><span>statement {index + 1}{currentIndex === index ? " · now" : ""}</span><strong>{motifTrailLabel(comparison)}</strong></li>;
      })}
    </ol>
    <div className="hud-motif-return-reading" role="status" aria-live="polite"><strong>{statusTitle}</strong><small>This is a local relationship trace, not a detected section, theme, compositional intention, style, listener recognition, or quality judgment.</small></div>
  </div>;
}

const MOTIF_RETURN_REPORTS: Array<{ id: MotifReturnReport; label: string; reading: string }> = [
  { id: "not-return", label: "Not as a return", reading: "You did not hear the last statement as a return." },
  { id: "uncertain", label: "Not sure", reading: "You were unsure whether the last statement felt like a return." },
  { id: "felt-return", label: "Yes, a return", reading: "You heard the last statement as a return." },
];

function MotifExperienceCheck({ comparison, report, observations, reflectSpecimen, onReport, onReflect }: {
  comparison: MotifEchoComparison;
  report: MotifReturnReport | null;
  observations: MotifReturnObservation[];
  reflectSpecimen: HudNoteEvent[] | null;
  onReport: (comparison: MotifEchoComparison, report: MotifReturnReport) => void;
  onReflect: (specimen: HudNoteEvent[]) => void;
}) {
  const selected = MOTIF_RETURN_REPORTS.find((candidate) => candidate.id === report);
  const relationshipDetail = comparison.kind === "transposed-repeat"
    ? `same signed moves and timing shape · starting key shifted ${motifSigned(comparison.startShiftSemitones)}`
    : "same signed moves, timing shape, and starting key";
  return <section className="hud-motif-experience-check" aria-labelledby="hud-motif-experience-title">
    <div className="hud-subheading"><span>Experience · yours, not inferred</span><strong id="hud-motif-experience-title">Did the last statement feel like a return to you?</strong><small>Answer from the experience you just had. Agreement with the relationship detector is not a goal.</small></div>
    <div className="hud-motif-experience-evidence" aria-label="Modeled relationship and listener report kept separate">
      <div><span>modeled relationship</span><strong>pitch + timing fingerprint returned</strong><small>{relationshipDetail}</small></div>
      <div><span>your experience</span><strong>{selected?.label ?? "not reported"}</strong><small>Only your button choice can fill this lane.</small></div>
    </div>
    <div className="hud-motif-experience-options" role="group" aria-label="Report whether the last statement felt like a return">
      {MOTIF_RETURN_REPORTS.map((choice) => <button key={choice.id} type="button" aria-pressed={report === choice.id} onClick={() => onReport(comparison, choice.id)}>{choice.label}</button>)}
    </div>
    <p role="status" aria-live="polite"><strong>{selected?.reading ?? "No listener report yet."}</strong><small>The model describes a local MIDI relationship. Your report does not turn that relationship into detected form, universal recognition, emotion, correctness, or musical quality.</small></p>
    {observations.length >= 2 ? <div className="hud-motif-return-contrast">
      <div className="hud-subheading"><span>Particular performances · no average</span><strong>Did moving the relationship change your experience?</strong><small>Read each physical return beside what you reported for that performance.</small></div>
      <ol role="img" aria-label={observations.map((observation, index) => `Return ${index + 1}: ${observation.relationship === "exact-repeat" ? "same starting key" : `starting key shifted ${motifSigned(observation.startShiftSemitones)}`}; ${MOTIF_RETURN_REPORTS.find((choice) => choice.id === observation.report)?.label ?? observation.report}`).join(". ")}>
        {observations.map((observation, index) => {
          const isCurrent = observation.targetEventIds.join("-") === comparison.targetEventIds.join("-");
          const reportLabel = MOTIF_RETURN_REPORTS.find((choice) => choice.id === observation.report)?.label ?? observation.report;
          return <li key={observation.targetEventIds.join("-")} className={`${observation.relationship === "exact-repeat" ? "is-exact" : "is-shifted"}${isCurrent ? " is-current" : ""}`}><span>return {index + 1}{isCurrent ? " · now" : ""}</span><strong>{observation.relationship === "exact-repeat" ? "same starting key" : `start shifted ${motifSigned(observation.startShiftSemitones)}`}</strong><small>{reportLabel}</small></li>;
        })}
      </ol>
      <p>These reports describe a few particular performances. They do not establish your recognition threshold or a general law about transposition.</p>
    </div> : null}
    {reflectSpecimen ? <button type="button" onClick={() => onReflect(reflectSpecimen)}>Reflect on the whole arc</button> : <p><small>The source aged out of the sixty-second phrase. Start a new arc to reflect on its exact timing.</small></p>}
  </section>;
}

function MotifEchoPractice({ events, session, attemptEvents, onStart, onRetry, onReport, onReflect, onEnd }: {
  events: HudNoteEvent[];
  session: MotifEchoSession | null;
  attemptEvents: HudNoteEvent[];
  onStart: (length: 3 | 4) => void;
  onRetry: () => void;
  onReport: (comparison: MotifEchoComparison, report: MotifReturnReport) => void;
  onReflect: (specimen: HudNoteEvent[]) => void;
  onEnd: () => void;
}) {
  const required = session?.sourceEvents.length ?? 0;
  const completeAttempt = session && attemptEvents.length === required ? attemptEvents : null;
  const comparison = session && completeAttempt ? compareMotifEcho(session.sourceEvents, completeAttempt) : null;
  const keptComparisons = (session?.attempts ?? []).flatMap((attempt) => {
    const kept = session ? compareMotifEcho(session.sourceEvents, attempt) : null;
    return kept ? [kept] : [];
  });
  const comparisons = comparison ? [...keptComparisons, comparison] : keptComparisons;
  const arc = motifReturnArc(comparisons);
  const closingReturn = arc.returnAfterVariationIndex == null ? null : comparisons[arc.returnAfterVariationIndex] ?? null;
  const returnObservations = session?.returnObservations ?? [];
  const closingObservation = closingReturn ? returnObservations.find((observation) => observation.targetEventIds.join("-") === closingReturn.targetEventIds.join("-")) : null;
  const closingReport = closingObservation?.report ?? (session?.returnObservations == null ? session?.returnReport ?? null : null);
  const arcEventIds = session ? motifReturnArcEventIds(session.sourceEvents.map((event) => event.id), comparisons) : null;
  const liveEventById = new Map(events.map((event) => [event.id, event]));
  const reflectSpecimen = arcEventIds
    ? arcEventIds.map((id) => liveEventById.get(id)).filter((event): event is HudNoteEvent => Boolean(event))
    : null;
  const exactReflectSpecimen = reflectSpecimen?.length === arcEventIds?.length ? reflectSpecimen : null;
  const sourceMoves = session ? session.sourceEvents.slice(1).map((event, index) => motifSigned(event.note - session.sourceEvents[index].note)).join(" · ") : "";
  return <section className="hud-motif-echo" aria-labelledby="hud-motif-echo-title">
    <div className="hud-subheading"><span>Learner-bounded experiment · silent</span><strong id="hud-motif-echo-title">Choose the shape before the model searches.</strong><small>Freeze exactly three or four recent attacks, then replay that whole statement. No smaller sub-match can replace your chosen boundary.</small></div>
    {!session ? <div className="hud-motif-echo-start">
      <div><span>source not chosen</span><strong>Play a short shape, then freeze its boundary.</strong><small>The later replay may keep everything, move the start, reshape time, alter only the ending, or change several properties.</small></div>
      <div role="group" aria-label="Choose motif source length">
        <button type="button" disabled={events.length < 3} onClick={() => onStart(3)}>Freeze last 3</button>
        <button type="button" disabled={events.length < 4} onClick={() => onStart(4)}>Freeze last 4</button>
      </div>
    </div> : <>
      <div className="hud-motif-echo-progress" role="status" aria-live="polite">
        <span>source frozen · {required} attacks · moves {sourceMoves}</span>
        <strong>{comparison ? motifEchoTitle(comparison) : `Play ${required - attemptEvents.length} more attack${required - attemptEvents.length === 1 ? "" : "s"}`}</strong>
        <small>{comparison ? "Every chosen attack entered this comparison." : `${attemptEvents.length}/${required} replay attacks captured. Timing begins with your first replay attack.`}</small>
      </div>
      {comparisons.length ? <MotifReturnTrail comparisons={comparisons} currentIndex={comparison ? comparisons.length - 1 : null} /> : null}
      {comparison ? <MotifFingerprintFigure id="echo" readingTitle={motifEchoTitle(comparison)} comparison={comparison} sourceLabel="chosen source" targetLabel="your replay" /> : null}
      {closingReturn ? <MotifExperienceCheck comparison={closingReturn} report={closingReport} observations={returnObservations} reflectSpecimen={exactReflectSpecimen} onReport={onReport} onReflect={onReflect} /> : null}
      <div className="hud-motif-echo-actions">
        {comparison ? <button type="button" onClick={onRetry}>{arc.status === "return-after-variation" ? "Keep return + continue" : comparison.kind === "exact-repeat" || comparison.kind === "transposed-repeat" ? "Keep return + change one property" : "Keep variation + try a return"}</button> : null}
        <button type="button" onClick={onEnd}>Release source</button>
      </div>
    </>}
  </section>;
}

function PhraseMotionField({ events, articulation, motifs, mode, motifEchoSession = null, motifEchoAttempt = [], onStartMotifEcho = () => {}, onRetryMotifEcho = () => {}, onReportMotifReturn = () => {}, onReflectMotifReturn = () => {}, onEndMotifEcho = () => {} }: {
  events: HudNoteEvent[];
  articulation: ArticulationEvidence[];
  motifs: MotifTransformation[];
  mode: "touch" | "motif";
  motifEchoSession?: MotifEchoSession | null;
  motifEchoAttempt?: HudNoteEvent[];
  onStartMotifEcho?: (length: 3 | 4) => void;
  onRetryMotifEcho?: () => void;
  onReportMotifReturn?: (comparison: MotifEchoComparison, report: MotifReturnReport) => void;
  onReflectMotifReturn?: (specimen: HudNoteEvent[]) => void;
  onEndMotifEcho?: () => void;
}) {
  const microscopeArticulation = articulation.slice(-7);
  const microscopeOffset = Math.max(0, events.length - microscopeArticulation.length);
  const firstOnset = events[0]?.onsetMs ?? 0;
  const lastOnset = events.at(-1)?.onsetMs ?? firstOnset;
  const phraseSpan = Math.max(500, lastOnset - firstOnset);
  const xFor = (eventIndex: number) => 54 + ((events[eventIndex]?.onsetMs ?? firstOnset) - firstOnset) / phraseSpan * 620;
  const leadingMotifs = motifs.slice(0, 2);
  const strongest = leadingMotifs[0];
  const strongestKey = strongest ? `${strongest.sourceEventIds.join("-")}:${strongest.targetEventIds.join("-")}` : "none";
  const [revealedMotifKey, setRevealedMotifKey] = useState<string | null>(null);
  const fingerprintRevealed = revealedMotifKey === strongestKey;
  const fingerprint = strongest ? compareMotifFingerprints(events, strongest) : null;
  const rangeLabel = (start: number, length: number) => `P${start + 1}–P${start + length}`;
  const motifDescription = leadingMotifs.length
    ? leadingMotifs.map((motif) => `${rangeLabel(motif.sourceStartIndex, motif.length)} to ${rangeLabel(motif.targetStartIndex, motif.length)}: ${motifTitle(motif)}`).join(". ")
    : "No three- or four-attack motif transformation detected yet.";
  return <section className="hud-phrase-motion" aria-labelledby="hud-phrase-motion-title">
    <div className="hud-panel-heading"><span>{mode === "touch" ? "Measured MIDI contact" : "Modeled phrase recurrence"}</span><strong id="hud-phrase-motion-title">{mode === "touch" ? "How did one touch meet the next?" : "What repeated, and what changed?"}</strong><small>{mode === "touch" ? "Finger contact, pedal extension, overlap, and silence can change while the key sequence stays fixed." : "Compare exact signed-semitone shapes and normalized onset gaps; change one property, then return."}</small></div>
    <div className="hud-motion-learning-grid is-single">
      {mode === "touch" ? <div className="hud-articulation-field">
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
      </div> : null}

      {mode === "motif" ? <div className="hud-motif-field">
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
        {strongest && fingerprint ? <div className="hud-motif-fingerprint-entry">
          <button type="button" aria-expanded={fingerprintRevealed} aria-controls="hud-motif-fingerprint-detail" onClick={() => setRevealedMotifKey(fingerprintRevealed ? null : strongestKey)}>{fingerprintRevealed ? "Hide what survived" : "Show what survived"}</button>
          <small>Compare relationship shape separately from starting key and elapsed speed.</small>
        </div> : null}
        {strongest && fingerprint && fingerprintRevealed ? <div id="hud-motif-fingerprint-detail"><MotifFingerprintFigure id="detected" readingTitle={motifTitle(strongest)} comparison={fingerprint} sourceLabel={rangeLabel(strongest.sourceStartIndex, strongest.length)} targetLabel={rangeLabel(strongest.targetStartIndex, strongest.length)} /></div> : null}
        <MotifEchoPractice events={events} session={motifEchoSession} attemptEvents={motifEchoAttempt} onStart={onStartMotifEcho} onRetry={onRetryMotifEcho} onReport={onReportMotifReturn} onReflect={onReflectMotifReturn} onEnd={onEndMotifEcho} />
      </div> : null}
    </div>
  </section>;
}

function PhraseBreathField({ events, doMidi, scale, showConventions, onComparePause }: {
  events: HudNoteEvent[];
  doMidi: number;
  scale: PianoScale;
  showConventions: boolean;
  onComparePause: () => void;
}) {
  const [thresholdMultiple, setThresholdMultiple] = useState(1.8);
  const breath = useMemo(() => phraseBreathMap(events, thresholdMultiple), [events, thresholdMultiple]);
  const ordered = useMemo(() => [...events].sort((first, second) => first.onsetMs - second.onsetMs || first.id - second.id), [events]);
  if (!breath) return <section className="hud-phrase-breath" aria-labelledby="hud-phrase-breath-title">
    <div className="hud-panel-heading"><span>Measured timing · adjustable grouping hypothesis</span><strong id="hud-phrase-breath-title">Where did the phrase leave space?</strong><small>Three onset groups establish a local gap reference. Attacks within 70 ms share a group so a chord does not masquerade as several beats.</small></div>
    <p className="hud-empty-copy">Play at least three separate onset groups. Release evidence will distinguish sounding overlap from actual quiet space.</p>
  </section>;
  const firstOnset = ordered[0].onsetMs;
  const lastOnset = ordered.at(-1)!.onsetMs;
  const spanMs = Math.max(500, lastOnset - firstOnset);
  const low = Math.min(...ordered.map((event) => event.note)) - 1;
  const high = Math.max(...ordered.map((event) => event.note)) + 1;
  const xFor = (event: HudNoteEvent) => 58 + ((event.onsetMs - firstOnset) / spanMs) * 604;
  const yFor = (event: HudNoteEvent) => 122 - ((event.note - low) / Math.max(1, high - low)) * 76;
  const candidateGaps = breath.gaps.filter((gap) => gap.candidateBreak);
  const labelledGapIds = new Set(candidateGaps.slice(-6).map((gap) => `${gap.beforeEventId}-${gap.afterEventId}`));
  const visibleSegments = breath.segments.slice(-6);
  const omittedSegments = breath.segments.length - visibleSegments.length;
  const microscopeOffset = Math.max(0, ordered.length - 7);
  const role = (note: number) => showConventions ? conventionalPitchName(note) : relativeSyllable(note, doMidi, scale);
  const signed = (value: number) => `${value > 0 ? "+" : value < 0 ? "−" : ""}${Math.abs(value)}`;
  const intervalPathCopy = (segment: PhraseBreathMap["segments"][number]) => {
    const displayed = segment.intervalPath.slice(0, 7).map(signed).join(" · ");
    return segment.intervalPath.length > 7 ? `${displayed} · …` : displayed || "one attack";
  };
  const summary = `${ordered.length} attacks form ${breath.attackGroupCount} onset groups with a median local group gap of ${Math.round(breath.referenceGapMs)} milliseconds. At ${breath.thresholdMultiple.toFixed(1)} times that gap, ${candidateGaps.length} release-proven quiet space${candidateGaps.length === 1 ? " is" : "s are"} marked as a candidate break, producing ${breath.segments.length} timing island${breath.segments.length === 1 ? "" : "s"}.`;
  return <section className="hud-phrase-breath" aria-labelledby="hud-phrase-breath-title">
    <div className="hud-panel-heading"><span>Measured timing · adjustable grouping hypothesis</span><strong id="hud-phrase-breath-title">Where did the phrase leave space?</strong><small>Move one threshold and watch grouping change while every attack, release, pitch, and velocity stays fixed.</small></div>
    <div className="hud-breath-control">
      <label htmlFor="hud-breath-threshold"><span>Mark a candidate break after</span><strong>{thresholdMultiple.toFixed(1)}× the local onset-group gap · {Math.round(breath.thresholdMs)} ms</strong></label>
      <input id="hud-breath-threshold" type="range" min="1.2" max="3" step="0.2" value={thresholdMultiple} onChange={(event) => setThresholdMultiple(Number(event.currentTarget.value))} />
      <p>{breath.attackGroupCount} onset groups · local reference = median {Math.round(breath.referenceGapMs)} ms · also requires at least {Math.round(breath.minimumSilenceMs)} ms of release-proven quiet.</p>
    </div>
    <svg viewBox="0 0 720 184" role="img" aria-label={summary}>
      <title>Performed pitch path divided only at long onset-group gaps containing release-proven silence</title>
      <line x1="58" x2="662" y1="142" y2="142" className="hud-breath-axis" />
      {breath.segments.map((segment, index) => {
        const segmentEvents = ordered.slice(segment.startIndex, segment.endIndex + 1);
        const points = segmentEvents.map((event) => `${xFor(event)},${yFor(event)}`).join(" ");
        return <g key={segment.eventIds.join("-")} className="hud-breath-island">
          <line x1={xFor(segmentEvents[0])} x2={xFor(segmentEvents.at(-1)!)} y1="142" y2="142" />
          <polyline points={points} />
          {breath.segments.length <= 8 ? <text x={(xFor(segmentEvents[0]) + xFor(segmentEvents.at(-1)!)) / 2} y="163">timing {index + 1}</text> : null}
        </g>;
      })}
      {candidateGaps.map((gap) => {
        const before = ordered.find((event) => event.id === gap.beforeEventId)!;
        const after = ordered.find((event) => event.id === gap.afterEventId)!;
        const x = (xFor(before) + xFor(after)) / 2;
        return <g key={`${gap.beforeEventId}-${gap.afterEventId}`} className="hud-breath-gate">
          <line x1={x} x2={x} y1="28" y2="151" />
          {labelledGapIds.has(`${gap.beforeEventId}-${gap.afterEventId}`) ? <text x={x} y="19">{gap.onsetMultiple.toFixed(1)}× · {Math.round(gap.bridge.durationMs!)} ms quiet</text> : null}
        </g>;
      })}
      {ordered.map((event, index) => <g key={event.id} className="hud-breath-event">
        <circle cx={xFor(event)} cy={yFor(event)} r="4" />
        {index >= microscopeOffset ? <text x={xFor(event)} y={Math.max(34, yFor(event) - 10)}>M{index - microscopeOffset + 1}</text> : null}
        <title>{`Attack ${index + 1}: ${role(event.note)}, ${Math.round(event.onsetMs - firstOnset)} milliseconds after the first attack`}</title>
      </g>)}
      <text x="58" y="178" className="hud-breath-time-label">0 s</text><text x="662" y="178" className="hud-breath-time-label is-end">{(spanMs / 1000).toFixed(1)} s</text>
    </svg>
    <div className="hud-breath-reading" role="status" aria-live="polite">
      <span>{candidateGaps.length} candidate break{candidateGaps.length === 1 ? "" : "s"} · {breath.segments.length} timing island{breath.segments.length === 1 ? "" : "s"}</span>
      <strong>{candidateGaps.length ? "Long timing and proven quiet agree at the marked gates." : "No gap currently satisfies both conditions."}</strong>
      <small>Changing the slider changes only the grouping hypothesis. Unknown releases, overlaps, and merely long held notes never become quiet-space boundaries.</small>
    </div>
    <ol className="hud-breath-segments" aria-label="Candidate timing islands">
      {omittedSegments ? <li className="is-omitted"><span>…</span><strong>{omittedSegments} earlier islands condensed</strong></li> : null}
      {visibleSegments.map((segment) => {
        const ending = ordered[segment.endIndex];
        return <li key={segment.eventIds.join("-")}><span>island {breath.segments.indexOf(segment) + 1}</span><strong>{segment.attackCount} attack{segment.attackCount === 1 ? "" : "s"} · onset span {compactTiming(segment.durationMs)} · pitch span {formatSemitones(segment.pitchSpan)}</strong><small>step path {intervalPathCopy(segment)} · ends on {role(ending.note)} in the selected frame</small></li>;
      })}
    </ol>
    <div className="hud-breath-next"><div><span>Next experiment · hold the keys fixed</span><strong>Can one changed pause reshape the phrase?</strong><small>Freeze this performance, replay the same absolute keys, and make one onset gap clearly shorter or longer.</small></div><button type="button" onClick={onComparePause}>Compare one pause</button></div>
    <p className="hud-breath-guardrail">A gate requires both unusual onset spacing and measured silence after release. This does not detect intended phrasing, breath, meter, form, expressiveness, correctness, or musical goodness.</p>
  </section>;
}

function MotionFocusGuide({ value, onChange }: { value: MotionFocusMode; onChange: (mode: MotionFocusMode) => void }) {
  return <section className="hud-motion-guide" aria-labelledby="hud-motion-guide-title">
    <div className="hud-panel-heading"><span>One phrase · one motion question</span><strong id="hud-motion-guide-title">Choose what to notice</strong><small>Each choice keeps the same live phrase but hides unrelated diagnostics. Nothing here grades timing or technique.</small></div>
    <nav className="hud-motion-mode-nav" aria-label="Motion learning question">
      {MOTION_FOCUS_MODES.map((mode) => <button key={mode.id} type="button" aria-pressed={value === mode.id} onClick={() => onChange(mode.id)}><span>{mode.label}</span><strong>{mode.question}</strong></button>)}
    </nav>
  </section>;
}

function PulseMirrorField({ session, mirror, expired, doMidi, scale, showConventions, onStart, onEnd }: {
  session: PulseMirrorSession | null;
  mirror: LivePulseMirror | null;
  expired: boolean;
  doMidi: number;
  scale: PianoScale;
  showConventions: boolean;
  onStart: () => void;
  onEnd: () => void;
}) {
  const tapLabel = mirror?.tapNote == null ? null : showConventions ? conventionalPitchName(mirror.tapNote) : relativeSyllable(mirror.tapNote, doMidi, scale);
  if (!session || !mirror) return <section className="hud-pulse-mirror" aria-labelledby="hud-pulse-title">
    <div className="hud-panel-heading"><span>Declared pulse · silent</span><strong id="hud-pulse-title">Where did each attack land?</strong><small>First establish one physical time unit. Later attacks will be placed around it without inferring meter, groove, or correctness.</small></div>
    <div className="hud-pulse-intro"><div><span>Four-tap anchor</span><strong>Repeat any one key four times at a comfortable steady pace.</strong><small>The first key becomes the anchor key. No metronome, sound, or answer is produced.</small></div><button type="button" onClick={onStart}>Begin pulse anchor</button></div>
  </section>;

  const tracking = mirror.status === "tracking" && !expired;
  const invalid = mirror.status === "invalid" || expired;
  const pulseMs = mirror.pulseMs ?? 500;
  const anchorOnsetMs = mirror.anchorOnsetMs ?? 0;
  const recentPlacements = mirror.placements.slice(-18);
  const latestPlacement = recentPlacements.at(-1) ?? null;
  const latestGap = mirror.gaps.at(-1) ?? null;
  const latestElapsed = latestPlacement ? (latestPlacement.onsetMs - anchorOnsetMs) / pulseMs : 0;
  const endPulse = Math.max(8, Math.ceil(latestElapsed) + 1);
  const startPulse = Math.max(0, endPulse - 8);
  const pulseIndexes = Array.from({ length: 9 }, (_, index) => startPulse + index);
  const xForElapsed = (elapsed: number) => 54 + ((elapsed - startPulse) / 8) * 612;
  const visiblePlacements = recentPlacements.filter((placement) => {
    const elapsed = (placement.onsetMs - anchorOnsetMs) / pulseMs;
    return elapsed >= startPulse - 0.12 && elapsed <= endPulse + 0.12;
  });
  const placementSummary = visiblePlacements.length
    ? visiblePlacements.map((placement) => `${placement.attackCount} attack${placement.attackCount === 1 ? "" : "s"} closest to ${placement.phaseLabel}, phase ${placement.phase.toFixed(2)}`).join(". ")
    : "The learner-declared pulse is ready; no later phrase attacks have arrived.";
  const offsetCopy = latestPlacement ? latestPlacement.offsetMs === 0
    ? "on the nearest pulse line"
    : `${Math.abs(Math.round(latestPlacement.offsetMs))} ms ${latestPlacement.offsetMs > 0 ? "after" : "before"} the nearest pulse line`
    : "waiting for a later attack";
  const signedPercent = (value: number) => `${value > 0 ? "+" : ""}${Math.round(value)}%`;

  let statusLabel = "Waiting for first tap";
  let statusTitle = "Tap one key four times";
  let statusCopy = "The first attack locks the anchor key; only later attacks of that same key complete the four-tap pulse.";
  if (mirror.status === "capturing") {
    statusLabel = `${mirror.tapEvents.length}/4 anchor taps · ${mirror.tapsNeeded} to go`;
    statusTitle = `Keep tapping ${tapLabel}`;
    statusCopy = `${mirror.ignoredDuringCapture ? `${mirror.ignoredDuringCapture} other-key attack${mirror.ignoredDuringCapture === 1 ? " was" : "s were"} ignored. ` : ""}Use gaps from 180 ms to 2 seconds; the four taps define the coordinate.`;
  } else if (invalid) {
    statusLabel = expired ? "Anchor left phrase memory" : "Anchor needs another try";
    statusTitle = "Rebuild the four-tap pulse";
    statusCopy = expired ? "The source taps aged out of the sixty-second phrase, so the HUD will not silently invent a replacement pulse." : `${mirror.invalidReason} Re-anchor at a comfortable pace.`;
  } else if (tracking) {
    statusLabel = "Pulse fixed by your taps";
    statusTitle = recentPlacements.length ? "Your phrase is now crossing the pulse field" : "Now play a short phrase";
    statusCopy = "Near-simultaneous attacks within 70 ms share one onset cluster. Their pitch membership remains separate from this timing view.";
  }

  return <section className="hud-pulse-mirror is-active" aria-labelledby="hud-pulse-title">
    <div className="hud-sonority-topline"><div className="hud-panel-heading"><span>Learner-declared time unit · silent</span><strong id="hud-pulse-title">Where did each attack land?</strong><small>{tracking ? `${Math.round(pulseMs)} ms per pulse · ${mirror.pulsesPerMinute?.toFixed(1)} per minute · anchor-key ${tapLabel}` : "Repeat one key; the app does not infer pulse from an arbitrary melody."}</small></div><div className="hud-sonority-actions"><button type="button" onClick={onStart}>Re-anchor</button><button type="button" onClick={onEnd}>End</button></div></div>
    <div className={`hud-pulse-status ${invalid ? "has-error" : tracking ? "is-ready" : ""}`} role="status" aria-live="polite"><span>{statusLabel}</span><strong>{statusTitle}</strong><small>{statusCopy}</small></div>
    {!tracking ? <ol className="hud-pulse-capture" aria-label="Four pulse-anchor taps">{Array.from({ length: 4 }, (_, index) => <li key={index} className={index < mirror.tapEvents.length ? "is-complete" : index === mirror.tapEvents.length ? "is-current" : ""}><span>{index + 1}</span><strong>{index < mirror.tapEvents.length ? "captured" : index === mirror.tapEvents.length ? "next" : "waiting"}</strong></li>)}</ol> : null}
    {tracking ? <>
      <div className="hud-pulse-facts" aria-label="Declared pulse facts"><span><small>one pulse</small><strong>{Math.round(pulseMs)} ms</strong><em>physical time unit</em></span><span><small>same unit per minute</small><strong>{mirror.pulsesPerMinute?.toFixed(1)}</strong><em>not detected tempo</em></span><span><small>anchor-gap spread</small><strong>±{Math.round(mirror.tapSpreadMs ?? 0)} ms</strong><em>raw four-tap variation</em></span></div>
      <div className="hud-pulse-plot">
        <div className="hud-subheading"><span>Rolling eight-pulse coordinate</span><strong>Attack phase around your pulse</strong><small>solid vertical = pulse · dotted = halfway · circle = one clustered onset</small></div>
        <svg viewBox="0 0 720 180" role="img" aria-label={placementSummary}>
          <title>Later MIDI attack clusters placed against the learner’s four-tap pulse</title>
          <line x1="54" x2="666" y1="104" y2="104" className="hud-pulse-axis" />
          {pulseIndexes.map((pulseIndex, index) => {
            const x = xForElapsed(pulseIndex);
            const halfX = xForElapsed(pulseIndex + 0.5);
            return <g key={pulseIndex}><line x1={x} x2={x} y1="34" y2="132" className="hud-pulse-line" /><text x={x} y="24" className="hud-pulse-label">P{pulseIndex}</text>{index < pulseIndexes.length - 1 ? <line x1={halfX} x2={halfX} y1="54" y2="124" className="hud-pulse-half" /> : null}</g>;
          })}
          {visiblePlacements.map((placement, index) => {
            const elapsed = (placement.onsetMs - anchorOnsetMs) / pulseMs;
            const x = xForElapsed(elapsed);
            const y = 92 + (index % 3 - 1) * 18;
            return <g key={placement.eventIds.join("-")}><circle cx={x} cy={y} r={placement.attackCount > 1 ? 7 : 5} className="hud-pulse-onset"><title>{`${placement.attackCount} attack${placement.attackCount === 1 ? "" : "s"}; closest to ${placement.phaseLabel}; phase ${placement.phase.toFixed(2)}`}</title></circle><text x={x} y={y + 21} className="hud-pulse-count">{placement.attackCount > 1 ? `×${placement.attackCount}` : "·"}</text></g>;
          })}
          {!visiblePlacements.length ? <text x="360" y="92" className="hud-pulse-empty">Play after the fourth anchor tap to place attacks here</text> : null}
        </svg>
      </div>
      <div className="hud-pulse-reading">
        <div><span>Latest phase coordinate</span><strong>{latestPlacement ? `${latestPlacement.phase.toFixed(2)} pulse · closest to ${latestPlacement.phaseLabel}` : "waiting for phrase"}</strong><small>{latestPlacement ? `${offsetCopy}; ${Math.round(latestPlacement.phaseError * 100)}% of a pulse from that simple phase landmark.` : "The anchor taps establish the pulse but are not counted as the phrase."}</small></div>
        <div><span>Latest onset spacing</span><strong>{latestGap ? `${latestGap.pulseMultiple.toFixed(2)}× pulse · nearest ${latestGap.ratioLabel}` : "two later onset clusters needed"}</strong><small>{latestGap ? `${Math.round(latestGap.gapMs)} ms · ${signedPercent(latestGap.errorPercent)} from that ratio landmark.` : "A chord cluster counts once, so pitch density does not masquerade as rhythmic speed."}</small></div>
      </div>
      <p className="hud-pulse-guardrail">These are coordinates around the pulse you supplied—not timing accuracy, notation, meter, swing, groove quality, or musical goodness.</p>
    </> : null}
  </section>;
}

function IntervalEcho({ events, target, doMidi, scale, soundModelId, showConventions, onSetTarget, onClear, onReflect }: {
  events: HudNoteEvent[];
  target: IntervalEchoTarget | null;
  doMidi: number;
  scale: PianoScale;
  soundModelId: PianoSoundModelId;
  showConventions: boolean;
  onSetTarget: (target: IntervalEchoTarget) => void;
  onClear: () => void;
  onReflect: (events: HudNoteEvent[]) => void;
}) {
  const latestPair = events.length >= 2 ? [events.at(-2)!, events.at(-1)!] as const : null;
  const latestDistance = latestPair ? Math.abs(latestPair[1].note - latestPair[0].note) : null;
  const afterTarget = target ? events.filter((event) => event.id > target.anchorEventId) : [];
  const completedAttemptCount = Math.floor(afterTarget.length / 2);
  const attemptEvents = completedAttemptCount ? [afterTarget[completedAttemptCount * 2 - 2], afterTarget[completedAttemptCount * 2 - 1]] as [HudNoteEvent, HudNoteEvent] : null;
  const attemptPair = attemptEvents ? [attemptEvents[0].note, attemptEvents[1].note] as [number, number] : null;
  const sourceEvents = target ? target.sourceEvents.map((saved) => events.find((event) => event.id === saved.id) ?? saved) as [HudNoteEvent, HudNoteEvent] : latestPair;
  const sourcePair = target?.sourceNotes ?? (latestPair ? [latestPair[0].note, latestPair[1].note] as [number, number] : null);
  const sourceDistance = target?.semitones ?? latestDistance;
  const landmark = sourceDistance == null ? null : intervalLandmark(sourceDistance);
  const comparison = target && attemptPair ? compareIntervalEcho(target.sourceNotes, attemptPair) : null;
  const model = pianoSoundModel(soundModelId);
  const noteLabel = (note: number) => showConventions ? conventionalPitchName(note) : relativeSyllable(note, doMidi, scale);
  const pairLabel = (pair: [number, number]) => `${noteLabel(pair[0])} → ${noteLabel(pair[1])}`;
  const sourceProfile = sourceEvents ? liveEarPairProfile(sourceEvents[0], sourceEvents[1]) : null;
  const attemptProfile = attemptEvents ? liveEarPairProfile(attemptEvents[0], attemptEvents[1]) : null;
  const sourceReading = sourceProfile?.modelReadings.find((reading) => reading.id === soundModelId) ?? null;
  const attemptReading = attemptProfile?.modelReadings.find((reading) => reading.id === soundModelId) ?? null;
  const auditoryComparable = Boolean(comparison?.matched && sourceReading && attemptReading);
  const interactionLabel = (profile: LiveEarIntervalProfile | null) => profile?.interactionStatus === "overlap"
    ? `${Math.round(profile.overlapMs ?? 0)} ms overlap`
    : profile?.interactionStatus === "separate" ? "sequential" : "release unknown";
  const fieldSize = (pair: readonly HudNoteEvent[] | null) => pair ? new Set(pair[1].fieldNotes).size : 0;
  const spectralReading = auditoryComparable && sourceReading && attemptReading
    ? `roughness ${Math.round(sourceReading.roughness * 100)} → ${Math.round(attemptReading.roughness * 100)}`
    : sourceProfile && attemptProfile && comparison?.matched
      ? `${interactionLabel(sourceProfile)} → ${interactionLabel(attemptProfile)}`
      : "wait for a matched spacing";
  const comparisonSummary = comparison && sourceProfile && attemptProfile
    ? `${comparison.matched ? "The semitone spacing matched" : "The semitone spacing did not match"}. Source ${pairLabel(comparison.sourceNotes)} and echo ${pairLabel(comparison.attemptNotes)}; hand center shift ${formatSemitones(comparison.centerShiftSteps, 0, true)}; onset gap ${Math.round(sourceProfile.second.onsetMs - sourceProfile.first.onsetMs)} to ${Math.round(attemptProfile.second.onsetMs - attemptProfile.first.onsetMs)} milliseconds; interaction ${interactionLabel(sourceProfile)} to ${interactionLabel(attemptProfile)}. ${auditoryComparable && sourceReading && attemptReading ? `Modeled roughness ${Math.round(sourceReading.roughness * 100)} to ${Math.round(attemptReading.roughness * 100)} under the ${model.shortLabel} assumed spectrum.` : "No simultaneous spectral comparison is made unless both performed pairs demonstrably overlapped."}`
    : "";
  return (
    <section className="hud-echo-panel" aria-labelledby="hud-echo-title">
      <div className="hud-panel-heading"><span>One relationship · two musical jobs</span><strong id="hud-echo-title">Same spacing, different context</strong><small>Replay one hand span elsewhere. Compare what the relationship preserves with what register, timing, surrounding notes, and your listening can change.</small></div>
      {sourcePair && landmark && sourceDistance != null ? <div className="hud-echo-current">
        <span>{target ? "Frozen source" : "Latest pair"} · {pairLabel(sourcePair)}</span>
        <strong>{sourceDistance} semitone{sourceDistance === 1 ? "" : "s"}</strong>
        <small>{landmark.relationship} · near {landmark.landmarkLabel}{sourceProfile ? ` · ${interactionLabel(sourceProfile)}` : ""}</small>
      </div> : <p className="hud-empty-copy">Play two notes to create an interval worth echoing.</p>}
      <div className="hud-echo-actions">
        <button type="button" disabled={!latestPair || latestDistance == null} onClick={() => latestPair && latestDistance != null && onSetTarget({ semitones: latestDistance, anchorEventId: latestPair[1].id, sourceNotes: [latestPair[0].note, latestPair[1].note], sourceEvents: [{ ...latestPair[0] }, { ...latestPair[1] }] })}>{target ? "Use latest pair as source" : "Echo this spacing"}</button>
        {target ? <button type="button" onClick={onClear}>End echo</button> : null}
      </div>
      {target ? <div className={`hud-echo-feedback ${comparison?.matched ? "is-match" : ""}`} aria-live="polite">
        <span>Ghost target · {target.semitones} semitone{target.semitones === 1 ? "" : "s"}</span>
        <strong>{comparison == null ? afterTarget.length % 2 ? "Starting note captured. Play the second note." : "Play a new starting note, then a second note." : comparison.matched ? "Same spacing—now inspect what changed around it." : `You moved ${comparison.attemptSemitones}. Keep the ${target.semitones}-step span and try another two-note pair.`}</strong>
      </div> : null}
      {comparison && sourceProfile && attemptProfile ? <div className={`hud-echo-comparison ${comparison.matched ? "is-match" : ""}`}>
        <svg viewBox="0 0 420 112" role="img" aria-label={comparisonSummary}>
          <title>Source and echo on one keyboard-position coordinate</title>
          <desc>{comparisonSummary}</desc>
          {(() => {
            const allNotes = [...comparison.sourceNotes, ...comparison.attemptNotes];
            const minimum = Math.min(...allNotes) - 1;
            const maximum = Math.max(...allNotes) + 1;
            const xFor = (note: number) => 70 + ((note - minimum) / (maximum - minimum)) * 320;
            return <>
              <text x="4" y="35" className="hud-echo-row-label">source</text>
              <text x="4" y="81" className="hud-echo-row-label">echo</text>
              <line x1={xFor(comparison.sourceNotes[0])} x2={xFor(comparison.sourceNotes[1])} y1="31" y2="31" className="hud-echo-span is-source" />
              <line x1={xFor(comparison.attemptNotes[0])} x2={xFor(comparison.attemptNotes[1])} y1="77" y2="77" className="hud-echo-span is-attempt" />
              <line x1={xFor(comparison.sourceNotes[0])} x2={xFor(comparison.attemptNotes[0])} y1="35" y2="73" className="hud-echo-shift" />
              <line x1={xFor(comparison.sourceNotes[1])} x2={xFor(comparison.attemptNotes[1])} y1="35" y2="73" className="hud-echo-shift" />
              {comparison.sourceNotes.map((note, index) => <circle key={`source-${index}`} cx={xFor(note)} cy="31" r="5" className="hud-echo-node is-source"><title>{`Source ${index + 1}: ${noteLabel(note)}, ${frequencyFromMidi(note).toFixed(1)} hertz under the A4=440 reference`}</title></circle>)}
              {comparison.attemptNotes.map((note, index) => <rect key={`attempt-${index}`} x={xFor(note) - 4.5} y="72.5" width="9" height="9" className="hud-echo-node is-attempt"><title>{`Echo ${index + 1}: ${noteLabel(note)}, ${frequencyFromMidi(note).toFixed(1)} hertz under the A4=440 reference`}</title></rect>)}
              <text x="70" y="105" className="hud-echo-axis-label">lower keyboard position</text><text x="390" y="105" className="hud-echo-axis-label is-end">higher</text>
            </>;
          })()}
        </svg>
        <div className="hud-echo-reading" role="group" aria-label="Five separate lenses for the source and echoed interval">
          <p><span>Relationships · MIDI + derived ratio</span><strong>{comparison.sourceSemitones} semitones · {comparison.equalKeyboardRatio.toFixed(3)}:1</strong><small>{comparison.matched ? `${landmark?.relationship}; 12-TET reference ratio and hand span survived.` : `Attempt was ${comparison.attemptSemitones} semitones; the target relationship did not survive.`}</small></p>
          <p><span>Sound · MIDI + derived reference + modeled</span><strong>{comparison.sourceFrequencyGapHz.toFixed(1)} → {comparison.attemptFrequencyGapHz.toFixed(1)} Hz · {spectralReading}</strong><small>Hz gaps use 12-TET at A4=440. Release evidence: {interactionLabel(sourceProfile)} → {interactionLabel(attemptProfile)}. {auditoryComparable && sourceReading && attemptReading ? `Assumed partial overlap ${Math.round(sourceReading.overlap * 100)} → ${Math.round(attemptReading.overlap * 100)} under ${model.shortLabel.toLowerCase()}.` : comparison.matched ? "At least one pair was sequential or release-unknown, so a simultaneous partial-interaction comparison would answer the wrong question." : "Spectral evidence waits until the performed relationship matches."} MIDI supplied no acoustic pitch, upper partials, or loudness.</small></p>
          <p><span>Motion · measured</span><strong>{Math.round(sourceProfile.second.onsetMs - sourceProfile.first.onsetMs)} → {Math.round(attemptProfile.second.onsetMs - attemptProfile.first.onsetMs)} ms attack gap</strong><small>Hand center {formatSemitones(comparison.centerShiftSteps, 0, true)} · direction {comparison.directionPreserved ? "preserved" : "reversed"}{comparison.uniformShiftSteps == null ? " · not one uniform shift" : ` · both notes ${formatSemitones(comparison.uniformShiftSteps, 0, true)}`}.</small></p>
          <p><span>Context · selected Do</span><strong>{pairLabel(comparison.sourceNotes)} · versus · {pairLabel(comparison.attemptNotes)}</strong><small>{fieldSize(sourceEvents)} → {fieldSize(attemptEvents)} notes sounding at the second attack. These labels use the current movable-Do frame, not a detected function.</small></p>
          <p className="hud-echo-experience"><span>Experience · listener only</span><strong>Did the two intervals do the same thing for you?</strong><small>The HUD does not infer similarity, tension, beauty, preference, correctness, or musical quality from the matched span.</small>{comparison.matched ? <button type="button" onClick={() => onReflect([...(sourceEvents ?? []), ...(attemptEvents ?? [])].sort((first, second) => first.onsetMs - second.onsetMs || first.id - second.id))}>Reflect on source + echo</button> : null}</p>
        </div>
        <p className="hud-echo-limit">A matched spacing preserves one relationship—not its melodic or harmonic job. Register, timing, overlap, surrounding notes, selected tonal frame, assumed spectrum, and your experience can all change around it.</p>
      </div> : null}
    </section>
  );
}

function ChordQuestionGuide({ value, onChange }: { value: ChordFocusMode; onChange: (mode: ChordFocusMode) => void }) {
  const active = CHORD_FOCUS_MODES.find((mode) => mode.id === value) ?? CHORD_FOCUS_MODES[0];
  return <section className="hud-chord-question-guide" aria-labelledby="hud-chord-question-title">
    <div className="hud-panel-heading"><span>One live phrase · one chord question</span><strong id="hud-chord-question-title">{active.question}</strong><small>{active.instruction} The phrase, grouping, corrections, spectrum, and selected Do stay shared when the question changes.</small></div>
    <div className="hud-chord-question-options" role="group" aria-label="Choose one chord-learning question">
      {CHORD_FOCUS_MODES.map((mode) => <button key={mode.id} type="button" aria-pressed={value === mode.id} onClick={() => onChange(mode.id)}><strong>{mode.label}</strong><span>{mode.question}</span></button>)}
    </div>
  </section>;
}

const CHORD_SEMITONE_ATLAS = [
  {
    id: "major",
    label: "Major triad",
    offsets: [0, 4, 7],
    adjacentGaps: [4, 3],
    foldedGaps: [4, 3, 5],
    down: "middle −1 st → minor",
    hold: "hold · no move required",
    up: "bass +1 st → diminished rooted above",
  },
  {
    id: "minor",
    label: "Minor triad",
    offsets: [0, 3, 7],
    adjacentGaps: [3, 4],
    foldedGaps: [3, 4, 5],
    down: "top −1 st → diminished",
    hold: "hold · no move required",
    up: "middle +1 st → major",
  },
  {
    id: "diminished",
    label: "Diminished triad",
    offsets: [0, 3, 6],
    adjacentGaps: [3, 3],
    foldedGaps: [3, 3, 6],
    down: "bass −1 st → major rooted below",
    hold: "hold · no move required",
    up: "top +1 st → minor",
  },
] as const;

function ChordSemitoneAtlas({ rootMidi, soundModelId, showConventions, activeTemplateId, anchorSource }: {
  rootMidi: number;
  soundModelId: PianoSoundModelId;
  showConventions: boolean;
  activeTemplateId: string | null;
  anchorSource: "current exact chord root" | "selected Do";
}) {
  const partialProfile = pianoSoundPartialProfile(soundModelId).slice(0, 4);
  const model = pianoSoundModel(soundModelId);
  const rootLabel = showConventions ? conventionalPitchName(rootMidi) : "root";
  const partialScopeCopy = partialProfile.length === 1
    ? "the model's one available component"
    : `the first ${partialProfile.length} available partials`;
  const atlasMinimumHz = frequencyFromMidi(rootMidi);
  const highestPartialMultiple = Math.max(...partialProfile.map((partial) => partial.frequencyMultiple));
  const atlasMaximumHz = frequencyFromMidi(rootMidi + 7) * highestPartialMultiple;
  const xForFrequency = (frequencyHz: number) => 82 + (Math.log2(frequencyHz / atlasMinimumHz) / Math.log2(atlasMaximumHz / atlasMinimumHz)) * 510;
  return <section className="hud-chord-semitone-atlas" aria-labelledby="hud-chord-semitone-atlas-title">
    <div className="hud-panel-heading">
      <span>Three triads · one physical ruler</span>
      <strong id="hud-chord-semitone-atlas-title">Each triad’s semitone shape and partial frequencies</strong>
      <small>Root-position examples begin at {rootLabel}, {formatHz(frequencyFromMidi(rootMidi))}, from the {anchorSource}. Fundamentals use 12-TET at A4=440; every card shares one logarithmic Hz axis and shows {partialScopeCopy} from the selected {model.shortLabel.toLowerCase()} teaching spectrum, capped at four. Harmonic mode uses exact harmonics; the piano proxies bend upper partials slightly.</small>
    </div>
    <div className="hud-chord-atlas-grid">
      {CHORD_SEMITONE_ATLAS.map((chord) => {
        const voices = chord.offsets.map((offset) => {
          const midi = rootMidi + offset;
          const fundamentalHz = frequencyFromMidi(midi);
          return {
            offset,
            midi,
            fundamentalHz,
            partials: partialProfile.map((partial) => ({
              ...partial,
              frequencyHz: fundamentalHz * partial.frequencyMultiple,
            })),
          };
        });
        const summary = `${chord.label}. Root-position semitone offsets ${chord.offsets.join(", ")}; adjacent gaps ${chord.adjacentGaps.join(", ")}; octave-folded loop ${chord.foldedGaps.join(", ")}. ${voices.map((voice) => `Voice plus ${voice.offset} semitones has fundamental ${formatHz(voice.fundamentalHz)} and assumed partials ${voice.partials.map((partial) => `${partial.partialIndex}, ${formatHz(partial.frequencyHz)}`).join("; ")}.`).join(" ")} One-semitone neighboring routes: down, ${chord.down}; hold, ${chord.hold}; up, ${chord.up}. These are available voice moves, not a predicted resolution.`;
        return <article key={chord.id} className={activeTemplateId === chord.id ? "is-current" : ""} aria-labelledby={`hud-chord-atlas-${chord.id}-title`}>
          <header>
            <div><span>{activeTemplateId === chord.id ? "current exact type" : "reference type"}</span><strong id={`hud-chord-atlas-${chord.id}-title`}>{chord.label}</strong></div>
            <p><b>{chord.offsets.join("–")} st</b><small>adjacent {chord.adjacentGaps.join(" + ")} · folded loop {chord.foldedGaps.join("–")}</small></p>
          </header>
          <svg viewBox="0 0 620 138" role="img" aria-label={summary}>
            <title>{chord.label} fundamentals and {partialScopeCopy}</title>
            <desc>{summary}</desc>
            {voices.map((voice, voiceIndex) => {
              const y = 27 + voiceIndex * 42;
              return <g key={voice.offset} className={`hud-chord-atlas-voice is-voice-${voiceIndex + 1}`}>
                <text x="2" y={y + 4}>{voice.offset === 0 ? "root" : `+${voice.offset} st`}</text>
                <line x1="82" x2="592" y1={y} y2={y} />
                {voice.partials.map((partial) => <g key={partial.partialIndex}>
                  <line className="hud-chord-atlas-partial-stem" x1={xForFrequency(partial.frequencyHz)} x2={xForFrequency(partial.frequencyHz)} y1={y - 8} y2={y + 8} style={{ opacity: Math.max(0.35, partial.amplitude) }} />
                  <circle className={partial.partialIndex === 1 ? "is-fundamental" : ""} cx={xForFrequency(partial.frequencyHz)} cy={y} r={partial.partialIndex === 1 ? 5 : 3}><title>{`${voice.offset === 0 ? "Root" : `Voice +${voice.offset} semitones`}, partial ${partial.partialIndex}: ${formatHz(partial.frequencyHz)}`}</title></circle>
                </g>)}
              </g>;
            })}
            <text className="hud-chord-atlas-axis" x="82" y="136">lower frequency</text><text className="hud-chord-atlas-axis is-end" x="592" y="136">higher · logarithmic</text>
          </svg>
          <ol className="hud-chord-atlas-frequencies" aria-label={`${chord.label} frequency breakout`}>
            {voices.map((voice) => <li key={voice.offset}>
              <span>{voice.offset === 0 ? "root" : `+${voice.offset} st`}{showConventions ? ` · ${conventionalPitchName(voice.midi)}` : ""}</span>
              <strong>fundamental {formatHz(voice.fundamentalHz)}</strong>
              <small>{voice.partials.slice(1).map((partial) => `partial ${partial.partialIndex} · ${formatHz(partial.frequencyHz)}`).join(" · ") || "no upper partials in this model"}</small>
            </li>)}
          </ol>
          <div className="hud-chord-atlas-directions" role="group" aria-label={`${chord.label} neighboring one-semitone routes`}>
            <div><span aria-hidden="true">↓</span><strong>down</strong><small>{chord.down}</small></div>
            <div><span aria-hidden="true">○</span><strong>nowhere</strong><small>{chord.hold}</small></div>
            <div><span aria-hidden="true">↑</span><strong>up</strong><small>{chord.up}</small></div>
          </div>
        </article>;
      })}
    </div>
    <p className="hud-chord-atlas-limit"><strong>Major and minor share the same unordered pair sizes—3, 4, and 7 semitones—but order their closed octave gaps as 4–3–5 versus 3–4–5. Diminished has pair sizes and a closed loop of 3–3–6.</strong> That is why pair counts alone cannot distinguish major from minor: root, ordering, voicing, and context matter. Read the arrows as available one-voice moves among these three types, not as forces. Chord type alone does not choose up, down, or rest; bass, phrase, repetition, rhythm, style, the next chord, and your hearing turn an available move into experienced resolution. Other one-semitone destinations also exist.</p>
  </section>;
}

function ChordGapFoldFigure({ source, attempt, sourceVoiceCount, attemptVoiceCount, mutation, changedMoveLabel, anchorLabel }: {
  source: ChordGapFingerprint;
  attempt: ChordGapFingerprint;
  sourceVoiceCount: number;
  attemptVoiceCount: number;
  mutation?: ChordGapMutation | null;
  changedMoveLabel?: string;
  anchorLabel?: string;
}) {
  const sourceGaps = mutation?.sourceGaps ?? source.canonicalGaps;
  const attemptGaps = mutation?.attemptGaps ?? attempt.canonicalGaps;
  const positions = (gaps: number[]) => gaps.reduce<number[]>((values, gap) => [...values, values.at(-1)! + gap], [0]);
  const xFor = (position: number) => 92 + (position / 12) * 548;
  const sameLoop = sourceGaps.length === attemptGaps.length
    && sourceGaps.every((gap, index) => gap === attemptGaps[index]);
  const rows = [
    { id: "source", label: "source", y: 52, gaps: sourceGaps, changedPosition: mutation == null ? null : (mutation.sourceChangedPitchClass - mutation.anchorPitchClass + 12) % 12 },
    { id: "attempt", label: "new", y: 130, gaps: attemptGaps, changedPosition: mutation == null ? null : (mutation.attemptChangedPitchClass - mutation.anchorPitchClass + 12) % 12 },
  ] as const;
  const summary = mutation
    ? `One octave position changed by ${mutation.movedSteps > 0 ? "+" : mutation.movedSteps < 0 ? "minus " : ""}${Math.abs(mutation.movedSteps)} semitone${Math.abs(mutation.movedSteps) === 1 ? "" : "s"}. Source gaps ${sourceGaps.join(", ")}; new gaps ${attemptGaps.join(", ")}; ${mutation.changedGapCount} adjacent gaps changed. Both closed loops total twelve semitones.`
    : `${sameLoop ? "Same" : "Different"} closed octave-gap loop. Source ${sourceGaps.join(", ")} semitones; new voicing ${attemptGaps.join(", ")}. Register and doubling are omitted.`;
  return <>
    <svg className="hud-chord-fold-figure" viewBox="0 0 720 184" role="img" aria-label={summary}>
      <title>{mutation ? "One changed chord position compared as two aligned octave-gap loops" : "Source chord and new voicing folded into normalized twelve-step octave loops"}</title>
      <desc>{summary} {mutation ? `Both loops begin at retained ${anchorLabel ?? "pitch"} solely for alignment; this is not a root claim.` : "The comparison start is a canonical rotation, not a chord root or movable Do."}</desc>
      {rows.map((row) => {
        const rowPositions = positions(row.gaps);
        return <g key={row.id} className={`is-${row.id}`}>
          <text x="20" y={row.y + 4} className="hud-echo-row-label">{row.label}</text>
          <path d={`M ${xFor(12)} ${row.y} C ${xFor(12)} ${row.y - 27}, ${xFor(0)} ${row.y - 27}, ${xFor(0)} ${row.y}`} className="hud-chord-fold-return" />
          {row.gaps.map((gap, index) => {
            const changed = mutation != null && mutation.gapDeltas[index] !== 0;
            const delta = row.id === "attempt" && changed ? ` Δ${mutation!.gapDeltas[index] > 0 ? "+" : "−"}${Math.abs(mutation!.gapDeltas[index])}` : "";
            return <g key={`${row.id}-gap-${index}`}>
              <line x1={xFor(rowPositions[index])} x2={xFor(rowPositions[index + 1])} y1={row.y} y2={row.y} className={`hud-chord-fold-segment ${changed ? "is-changed" : ""}`} />
              <text x={(xFor(rowPositions[index]) + xFor(rowPositions[index + 1])) / 2} y={row.y - 7} className={`hud-chord-fold-gap-label ${changed ? "is-changed" : ""}`}>{gap}{delta}</text>
            </g>;
          })}
          {rowPositions.slice(0, -1).map((position, index) => {
            const changed = position === row.changedPosition;
            return row.id === "source"
            ? <circle key={`${row.id}-node-${index}`} cx={xFor(position)} cy={row.y} r="6" className={`hud-chord-fold-node ${changed ? "is-changed" : ""}`}><title>{`Source folded position ${index + 1}${changed ? ", changed in the replay" : ""}; next gap ${formatSemitones(row.gaps[index])}`}</title></circle>
            : <rect key={`${row.id}-node-${index}`} x={xFor(position) - 6} y={row.y - 6} width="12" height="12" className={`hud-chord-fold-node ${changed ? "is-changed" : ""}`}><title>{`New-voicing folded position ${index + 1}${changed ? ", moved from the source" : ""}; next gap ${formatSemitones(row.gaps[index])}`}</title></rect>;
          })}
          <circle cx={xFor(12)} cy={row.y} r="4" className="hud-chord-fold-close"><title>Octave closure returns to the first position</title></circle>
        </g>;
      })}
      <text x={xFor(0)} y="177" className="hud-echo-axis-label">{mutation ? `retained ${anchorLabel ?? "pitch"} · comparison anchor` : "comparison start · not root"}</text><text x={xFor(12)} y="177" className="hud-echo-axis-label is-end">12 = same position</text>
    </svg>
    <div className="hud-chord-fold-reading" role="status" aria-live="polite"><span>{mutation ? "Gap space redistributed" : sameLoop ? "Same interval loop" : "Interval loop changed"}</span><strong>{sourceGaps.join(" · ")} {mutation ? "→" : sameLoop ? "=" : "≠"} {attemptGaps.join(" · ")}</strong><small>{mutation ? `${changedMoveLabel ?? "One position changed"}; ${mutation.changedGapCount} gap${mutation.changedGapCount === 1 ? "" : "s"} changed while both closed loops still total 12. The retained ${anchorLabel ?? "pitch"} aligns only the geometry; its label comes from the selected frame, and alignment does not infer root, function, or quality.` : `Source ${sourceVoiceCount} physical key${sourceVoiceCount === 1 ? "" : "s"} → ${source.pitchClasses.length} unique octave positions${source.duplicatePitchClassCount ? ` (${source.duplicatePitchClassCount} doubling removed)` : ""}; new ${attemptVoiceCount} → ${attempt.pitchClasses.length}${attempt.duplicatePitchClassCount ? ` (${attempt.duplicatePitchClassCount} doubling removed)` : ""}. The start is rotated only to compare loops—not to choose root, Do, function, or quality.`}</small></div>
  </>;
}

function ChordVoicingEcho({ session, sourceEvents, sourceCandidate, attempt, doMidi, scale, soundModelId, showConventions, onStart, onEnd, onReflect }: {
  session: ChordVoicingEchoSession | null;
  sourceEvents: HudNoteEvent[];
  sourceCandidate: ChordMeasure | null;
  attempt: ChordMeasure | null;
  doMidi: number;
  scale: PianoScale;
  soundModelId: PianoSoundModelId;
  showConventions: boolean;
  onStart: () => void;
  onEnd: () => void;
  onReflect: (events: HudNoteEvent[]) => void;
}) {
  const [octaveFoldSelection, setOctaveFoldSelection] = useState({ attemptId: attempt?.gesture.id ?? "", revealed: false });
  const label = (note: number) => showConventions ? conventionalPitchName(note) : relativeSyllable(note, doMidi, scale);
  const signed = (value: number) => `${value > 0 ? "+" : value < 0 ? "−" : ""}${Math.abs(Math.round(value * 10) / 10)}`;
  if (!session) {
    const notes = sourceCandidate ? uniqueSorted(sourceCandidate.interpretedNotes) : [];
    const ready = Boolean(sourceCandidate && sourceCandidate.gesture.attacks.length >= 2 && notes.length <= 6 && new Set(notes.map(pitchClassFromMidi)).size >= 2);
    return <section className="hud-chord-echo" aria-labelledby="hud-chord-echo-title">
      <div className="hud-panel-heading"><span>Chord relationship echo · silent</span><strong id="hud-chord-echo-title">What survives when the hand shape changes?</strong><small>Freeze one interpreted grouped chord, then replay its pitch-class relationship in a new register, inversion, or transposition. The control never enters or sounds a note.</small></div>
      <div className="hud-chord-echo-arm"><div><span>{ready ? "Selected source gesture" : "Waiting for a source gesture"}</span><strong>{ready ? notes.map(label).join(" · ") : "Play or select one grouped chord"}</strong><small>{ready ? `${sourceCandidate!.gesture.attacks.length} attacks · ${Math.round(sourceCandidate!.gesture.spreadMs)} ms grouping · membership can be corrected above before freezing.` : notes.length > 6 ? "Use a chord field of six keyboard positions or fewer." : "At least two attacks and two pitch-class positions are required."}</small></div><button type="button" disabled={!ready} onClick={onStart}>Freeze this relationship</button></div>
    </section>;
  }

  const sourceNotes = uniqueSorted(session.sourceNotes);
  const attemptNotes = attempt ? uniqueSorted(attempt.interpretedNotes) : [];
  const comparison = attempt ? compareChordVoicingEcho(sourceNotes, attemptNotes) : null;
  if (!attempt || !comparison) return <section className="hud-chord-echo is-armed" aria-labelledby="hud-chord-echo-title">
    <div className="hud-chord-echo-topline"><div className="hud-panel-heading"><span>Source relationship held</span><strong id="hud-chord-echo-title">Voice it somewhere else</strong><small>{sourceNotes.map(label).join(" · ")} · release the source, then play a new grouped chord in any register.</small></div><button type="button" onClick={onEnd}>End echo</button></div>
    <div className="hud-chord-echo-wait" role="status"><span>Listening for the next grouped gesture</span><strong>Keep the relationship, not necessarily the keys.</strong><small>A transposition may move every pitch class. An inversion may change the bass and spacing. Neither is entered for you.</small></div>
  </section>;

  const sourceModel = sonorityPerceptionModel(sourceNotes.map((note) => pianoSoundVoice(frequencyFromMidi(note), 0.72, soundModelId)));
  const attemptModel = sonorityPerceptionModel(attemptNotes.map((note) => pianoSoundVoice(frequencyFromMidi(note), 0.72, soundModelId)));
  const sourceGapFingerprint = chordGapFingerprint(sourceNotes);
  const attemptGapFingerprint = chordGapFingerprint(attemptNotes);
  const gapMutation = comparison.relationshipPreserved ? null : compareChordGapMutation(sourceNotes, attemptNotes);
  const canRevealGapStructure = comparison.relationshipPreserved || gapMutation != null;
  const octaveFoldRevealed = canRevealGapStructure
    && sourceGapFingerprint != null
    && attemptGapFingerprint != null
    && octaveFoldSelection.attemptId === attempt.gesture.id
    && octaveFoldSelection.revealed;
  const sourceTendency = tonalTendency(sourceNotes, doMidi, scale);
  const attemptTendency = tonalTendency(attemptNotes, doMidi, scale);
  const voice = voiceLeadingProfile(sourceNotes, attemptNotes);
  const allNotes = [...sourceNotes, ...attemptNotes];
  const low = Math.min(...allNotes) - 1;
  const high = Math.max(...allNotes) + 1;
  const xFor = (note: number) => 80 + ((note - low) / Math.max(1, high - low)) * 560;
  const relationshipStrong = comparison.relationshipPreserved
    ? comparison.pitchClassIdentityPreserved
      ? comparison.bassRoleChanged ? "same pitch-class set · new bass role" : "same pitch-class set"
      : `same internal relationship · shifted ${formatSemitones(comparison.transpositionSteps!, 0, true)}`
    : "relationship changed · source remains held";
  const movementStrong = comparison.uniformPhysicalShiftSteps != null
    ? `every voice shifted ${formatSemitones(comparison.uniformPhysicalShiftSteps, 0, true)}`
    : `${voice.motionClasses.join(" + ") || "nearest voices moved"} · largest leap ${formatSemitones(voice.largestLeap)}`;
  const modelDelta = Math.round((attemptModel.roughness - sourceModel.roughness) * 100);
  const changedMoveLabel = gapMutation
    ? `${pitchClassRoleLabel(gapMutation.sourceChangedPitchClass, doMidi, scale, showConventions)} → ${pitchClassRoleLabel(gapMutation.attemptChangedPitchClass, doMidi, scale, showConventions)} (${signed(gapMutation.movedSteps)} semitone${Math.abs(gapMutation.movedSteps) === 1 ? "" : "s"} around the octave)`
    : undefined;
  const gapAnchorLabel = gapMutation ? pitchClassRoleLabel(gapMutation.anchorPitchClass, doMidi, scale, showConventions) : undefined;
  const reflectionEvents = [...sourceEvents, ...attempt.gesture.attacks]
    .filter((event, index, events) => events.findIndex((candidate) => candidate.id === event.id) === index)
    .sort((first, second) => first.onsetMs - second.onsetMs || first.id - second.id);
  return <section className="hud-chord-echo is-comparing" aria-labelledby="hud-chord-echo-title">
    <div className="hud-chord-echo-topline"><div className="hud-panel-heading"><span>{comparison.relationshipPreserved ? "Relationship matched · five lenses" : "Latest independent attempt · five lenses"}</span><strong id="hud-chord-echo-title">What survived the new voicing?</strong><small>{sourceNotes.map(label).join(" · ")} → {attemptNotes.map(label).join(" · ")} · source relationship remains frozen for another attempt</small></div><button type="button" onClick={onEnd}>End echo</button></div>
    {canRevealGapStructure && sourceGapFingerprint && attemptGapFingerprint ? <div className="hud-chord-fold-test" aria-labelledby="hud-chord-fold-title"><div><span>{gapMutation ? "Next question · one changed position" : "Next question · interval identity"}</span><strong id="hud-chord-fold-title">{gapMutation ? "How did changing one position reshape the chord?" : "What remains if register, doubling, and starting pitch disappear?"}</strong><small>{gapMutation ? octaveFoldRevealed ? `Both fields begin at retained ${gapAnchorLabel} and close at 12. Delta labels show exactly which adjacent gaps gained or lost space.` : `Exactly one unique octave position changed while ${gapMutation.retainedPitchClasses.length} stayed. Align the retained ${gapAnchorLabel} and compare how the closed gap loop redistributed.` : octaveFoldRevealed ? "Both performed fields are folded into one twelve-semitone octave. Their unique positions are connected by adjacent semitone gaps; the comparison start is normalized, not heard as root." : "Fold both performed fields into one octave and compare only the gaps between unique pitch positions. No chord name is needed."} This display-only view changes no MIDI, frequency, voicing, model, or listener report.</small></div><button type="button" aria-pressed={octaveFoldRevealed} onClick={() => setOctaveFoldSelection({ attemptId: attempt.gesture.id, revealed: !octaveFoldRevealed })}>{gapMutation ? "Compare changed gaps" : "Fold into one octave"}</button></div> : null}
    {octaveFoldRevealed && sourceGapFingerprint && attemptGapFingerprint ? <ChordGapFoldFigure source={sourceGapFingerprint} attempt={attemptGapFingerprint} sourceVoiceCount={sourceNotes.length} attemptVoiceCount={attemptNotes.length} mutation={gapMutation} changedMoveLabel={changedMoveLabel} anchorLabel={gapAnchorLabel} /> : <svg className="hud-chord-echo-figure" viewBox="0 0 720 184" role="img" aria-label={`${relationshipStrong}. Source span ${formatSemitones(comparison.sourceSpan)}; new span ${formatSemitones(comparison.attemptSpan)}; center shift ${formatSemitones(comparison.centerShiftSteps, 0, true)}; ${comparison.bassRoleChanged ? "bass role changed" : "bass role retained or unavailable"}.`}>
      <title>Source chord and latest performed voicing on one keyboard-position axis</title>
      <text x="20" y="50" className="hud-echo-row-label">source</text><text x="20" y="132" className="hud-echo-row-label">new</text>
      <line x1="80" x2="640" y1="158" y2="158" className="hud-grid-line" />
      {voice.strands.filter((strand) => strand.from != null && strand.to != null).map((strand, index) => <line key={`${strand.from}-${strand.to}-${index}`} x1={xFor(strand.from!)} x2={xFor(strand.to!)} y1="54" y2="124" className={`hud-chord-echo-strand is-${strand.motion}`}><title>{`${label(strand.from!)} to ${label(strand.to!)}: ${formatSemitones(strand.semitones, 0, true)} under one nearest-position interpretation`}</title></line>)}
      {sourceNotes.map((note) => <g key={`source-${note}`}><circle cx={xFor(note)} cy="50" r="7" className="hud-chord-echo-node is-source"><title>{`Source ${label(note)}, ${frequencyFromMidi(note).toFixed(1)} hertz`}</title></circle><text x={xFor(note)} y="31" className="hud-point-label">{label(note)}</text></g>)}
      {attemptNotes.map((note) => <g key={`attempt-${note}`}><rect x={xFor(note) - 6} y="124" width="12" height="12" className="hud-chord-echo-node is-attempt"><title>{`New voicing ${label(note)}, ${frequencyFromMidi(note).toFixed(1)} hertz`}</title></rect><text x={xFor(note)} y="151" className="hud-point-label">{label(note)}</text></g>)}
      <text x="80" y="177" className="hud-echo-axis-label">lower keyboard position</text><text x="640" y="177" className="hud-echo-axis-label is-end">higher</text>
    </svg>}
    <div className="hud-last-lenses" role="group" aria-label="Five separate lenses for the source chord and new voicing">
      <article className="is-measured"><span>Sound</span><em>MIDI keys + derived reference + modeled spectrum</em><strong>{sourceNotes.length}→{attemptNotes.length} voices · span {comparison.sourceSpan}→{comparison.attemptSpan} semitones</strong><small>Modeled roughness {signed(modelDelta)} under {pianoSoundModel(soundModelId).shortLabel.toLowerCase()}. Key positions and register are measured; A4=440 reference frequencies, upper partials, and the acoustic result are derived or assumed.</small></article>
      <article className="is-measured"><span>Relationships</span><em>interpreted pitch classes</em><strong>{relationshipStrong}</strong><small>Bass-relative shapes {comparison.sourceBassRelativeShape.join(" · ")} → {comparison.attemptBassRelativeShape.join(" · ")}. {gapMutation ? `One unique octave position changed while ${gapMutation.retainedPitchClasses.length} stayed; reveal the gap comparison to see how that difference redistributed the closed loop.` : "Matching means one set relationship survived exact identity or uniform transposition—not that the experiences were identical."}</small></article>
      <article className="is-measured"><span>Motion</span><em>nearest-position interpretation</em><strong>{movementStrong}</strong><small>Hand center {formatSemitones(comparison.centerShiftSteps, 0, true)} · bass {voice.bassMotion === 0 ? "held" : `${voice.bassMotion > 0 ? "up" : "down"} ${formatSemitones(Math.abs(voice.bassMotion))}`} · total nearest-position travel {formatSemitones(voice.totalMotion)}. This is not intended fingering.</small></article>
      <article className="is-modeled"><span>Context</span><em>selected Do + route</em><strong>toward Do {Math.round(sourceTendency.homePull * 100)}→{Math.round(attemptTendency.homePull * 100)} · home {Math.round(sourceTendency.homeEvidence * 100)}→{Math.round(attemptTendency.homeEvidence * 100)}</strong><small>{comparison.pitchClassIdentityPreserved ? "The selected-Do positions stayed fixed even though voicing could change." : comparison.relationshipPreserved ? "Transposition preserved the internal relationship while changing its selected-Do positions." : "The internal relationship and selected-Do positions both changed."} Context is modeled, not heard certainty.</small></article>
      <article className="is-unclaimed"><span>Experience</span><em>listener only</em><strong>Did it still feel like the same chord relationship?</strong><small>The structural match does not answer similarity, function, emotion, preference, correctness, or goodness.</small>{comparison.relationshipPreserved ? <button type="button" disabled={reflectionEvents.length < 4} onClick={() => onReflect(reflectionEvents)}>Reflect on source + voicing</button> : null}</article>
    </div>
    <p className="hud-last-attack-limit">A relationship can survive while register, bass, spacing, doubling, spectrum, motion, selected context, and experience change independently.</p>
  </section>;
}

function ControlledSonorityField({
  session,
  activeNotes,
  doMidi,
  scale,
  soundModelId,
  showConventions,
  onChooseRecipe,
  onCaptureCurrent,
  onReplaceBaseline,
  onRestart,
  onEnd,
}: {
  session: ControlledSonoritySession | null;
  activeNotes: number[];
  doMidi: number;
  scale: PianoScale;
  soundModelId: PianoSoundModelId;
  showConventions: boolean;
  onChooseRecipe: (id: ControlledSonorityFieldId) => void;
  onCaptureCurrent: () => void;
  onReplaceBaseline: () => void;
  onRestart: () => void;
  onEnd: () => void;
}) {
  const noteLabel = (note: number) => showConventions ? conventionalPitchName(note) : relativeSyllable(note, doMidi, scale);
  if (!session) return <section className="hud-sonority-field" aria-labelledby="hud-sonority-title">
    <div className="hud-panel-heading"><span>Controlled live experiment · silent</span><strong id="hud-sonority-title">Change one note inside the whole</strong><small>Choose a physical starting field, perform its outlined keys, then add or remove exactly one note. Nothing here plays or enters an answer.</small></div>
    <div className="hud-sonority-start">
      {CONTROLLED_SONORITY_FIELDS.map((field) => <button key={field.id} type="button" onClick={() => onChooseRecipe(field.id)}><span>{field.relationship}</span><strong>{field.label}</strong><small>{field.instruction}</small></button>)}
    </div>
    <div className="hud-sonority-live-start"><div><span>Already holding a field?</span><strong>Use your own sounding notes as the baseline.</strong><small>At least two exact MIDI notes are required; register stays part of the experiment.</small></div><button type="button" disabled={activeNotes.length < 2} onClick={onCaptureCurrent}>Use current field</button></div>
  </section>;

  const recipe = CONTROLLED_SONORITY_FIELDS.find((field) => field.id === session.recipeId) ?? null;
  if (!session.baselineNotes) {
    const matched = session.targetNotes.filter((note) => activeNotes.includes(note));
    return <section className="hud-sonority-field is-armed" aria-labelledby="hud-sonority-title">
      <div className="hud-sonority-topline"><div className="hud-panel-heading"><span>Starting field armed · exact register</span><strong id="hud-sonority-title">Perform {recipe?.label ?? "the outlined field"}</strong><small>{recipe?.relationship}. Dashed keys are a silent target; your attacks establish the baseline.</small></div><button type="button" onClick={onEnd}>End experiment</button></div>
      <div className="hud-sonority-target" role="status" aria-live="polite"><span>{matched.length}/{session.targetNotes.length} exact notes held</span><strong>{session.targetNotes.map(noteLabel).join(" · ")}</strong><small>{matched.length === session.targetNotes.length ? "Baseline captured." : "Hold every outlined key together. No note was entered or sounded by this control."}</small></div>
    </section>;
  }

  const baselineNotes = session.baselineNotes;
  const change = controlledSonorityChange(baselineNotes, activeNotes);
  const hasCurrentField = activeNotes.length > 0;
  const replaying = session.replayRequired && !sameMidiNotes(activeNotes, baselineNotes);
  const controlled = !replaying && (change.kind === "one-added" || change.kind === "one-removed");
  const baselineModel = sonorityPerceptionModel(baselineNotes.map((note) => pianoSoundVoice(frequencyFromMidi(note), 0.72, soundModelId)));
  const currentModel = hasCurrentField ? sonorityPerceptionModel(activeNotes.map((note) => pianoSoundVoice(frequencyFromMidi(note), 0.72, soundModelId))) : null;
  const baselineTendency = tonalTendency(baselineNotes, doMidi, scale);
  const currentTendency = hasCurrentField ? tonalTendency(activeNotes, doMidi, scale) : null;
  const baselineCoverage = scaleCoverage(baselineNotes, doMidi, scale);
  const currentCoverage = hasCurrentField ? scaleCoverage(activeNotes, doMidi, scale) : null;
  const baselineAffordances = sonorityAffordances(baselineModel);
  const currentAffordances = currentModel ? sonorityAffordances(currentModel) : [];
  const affordanceDeltas = currentAffordances.map((affordance, index) => ({
    ...affordance,
    delta: Math.round((affordance.value - baselineAffordances[index].value) * 100),
  }));
  const strongestAffordanceShift = [...affordanceDeltas].sort((first, second) => Math.abs(second.delta) - Math.abs(first.delta))[0] ?? null;
  const signed = (value: number) => `${value > 0 ? "+" : ""}${value}`;
  const modelDelta = (key: "roughness" | "fusion" | "harmonicity" | "brightness") => currentModel ? Math.round((currentModel[key] - baselineModel[key]) * 100) : 0;
  const tendencyDelta = currentTendency ? Math.round((currentTendency.homePull - baselineTendency.homePull) * 100) : 0;
  const changedLabel = change.changedNote == null ? "" : noteLabel(change.changedNote);
  const intervalCopy = change.changedIntervals.map((pair) => `${noteLabel(pair.lower)}↔${noteLabel(pair.upper)} +${pair.distance.semitones} (${pair.distance.landmarkLabel})`).join(" · ");
  const changedRole = change.changedNote == null ? null : noteContext(change.changedNote, doMidi, scale);

  const remainingBaselineNotes = baselineNotes.filter((note) => !activeNotes.includes(note));
  let prompt = "Replay the baseline field";
  let explanation = `Still needed: ${remainingBaselineNotes.length ? remainingBaselineNotes.map(noteLabel).join(" · ") : "release any extra keys"}. The comparison stays paused until the exact baseline is sounding.`;
  if (!replaying && hasCurrentField && change.kind === "same") {
    prompt = "Baseline restored—change exactly one note";
    explanation = "Add one key or release one key while the others stay held. That isolates one cause inside the whole field.";
  } else if (!replaying && hasCurrentField && change.kind === "multiple") {
    prompt = "More than one note changed";
    explanation = `Added ${change.addedNotes.length}; removed ${change.removedNotes.length}. Return to the baseline or adopt this field before asking what one note did.`;
  } else if (controlled) {
    prompt = `${changedLabel} ${change.kind === "one-added" ? "entered" : "left"}: what did that one note change?`;
    explanation = `${change.kind === "one-added" ? "Created" : "Removed"} ${change.changedIntervals.length} pairwise relationship${change.changedIntervals.length === 1 ? "" : "s"}. The four lanes below remain separate descriptions, not a quality verdict.`;
  }

  return <section className="hud-sonority-field is-comparing" aria-labelledby="hud-sonority-title">
    <div className="hud-sonority-topline"><div className="hud-panel-heading"><span>One baseline · one controlled change</span><strong id="hud-sonority-title">What did this note do?</strong><small>{recipe ? `${recipe.label} · ` : "Your field · "}{baselineNotes.map(noteLabel).join(" · ")} · modeled with {pianoSoundModel(soundModelId).shortLabel.toLowerCase()}</small></div><div className="hud-sonority-actions">{!replaying && activeNotes.length >= 2 && !sameMidiNotes(activeNotes, baselineNotes) ? <button type="button" onClick={onReplaceBaseline}>Adopt current baseline</button> : null}{recipe ? <button type="button" onClick={onRestart}>Restart field</button> : null}<button type="button" onClick={onEnd}>End</button></div></div>
    <div className={`hud-sonority-question ${!replaying && change.kind === "multiple" ? "has-error" : controlled ? "has-change" : ""}`} role="status" aria-live="polite"><span>{replaying ? "Rebuilding baseline" : !hasCurrentField ? "Waiting for field" : change.kind === "same" ? "Controlled baseline" : change.kind === "multiple" ? "Causal boundary" : "One-note consequence"}</span><strong>{prompt}</strong><small>{explanation}</small></div>
    {controlled && currentModel && currentTendency && currentCoverage ? <div className="hud-sonority-chain" aria-label={`Causal comparison for ${changedLabel}, one ${change.kind === "one-added" ? "added" : "removed"} note`}>
      <div><span>1 · physical relationships</span><strong>{change.kind === "one-added" ? "gained" : "lost"} {intervalCopy || "no pairwise interval"}</strong><small>Outer span {signed(change.spanDelta)} semitone{Math.abs(change.spanDelta) === 1 ? "" : "s"} · MIDI positions and register are measured; A4=440 frequencies are derived.</small></div>
      <i aria-hidden="true">→</i>
      <div><span>2 · assumed auditory result</span><strong>roughness {signed(modelDelta("roughness"))} · fusion {signed(modelDelta("fusion"))}</strong><small>harmonic fit {signed(modelDelta("harmonicity"))} · brightness {signed(modelDelta("brightness"))} · teaching spectrum, not your DAW audio.</small></div>
      <i aria-hidden="true">→</i>
      <div><span>3 · selected tonal context</span><strong>{changedRole?.inScale ? `${changedLabel} is inside this route` : `${changedLabel} is outside this route`} · toward Do {signed(tendencyDelta)}</strong><small>{baselineCoverage.inScaleCount}/{baselineCoverage.noteCount} → {currentCoverage.inScaleCount}/{currentCoverage.noteCount} positions inside · membership is not correctness.</small></div>
      <i aria-hidden="true">→</i>
      <div><span>4 · conditional felt possibility</span><strong>{strongestAffordanceShift ? `${strongestAffordanceShift.label} ${signed(strongestAffordanceShift.delta)}` : "no modeled shift"}</strong><small>{strongestAffordanceShift ? `${strongestAffordanceShift.direction}. ` : ""}This is an invitation to listen, not an emotion prediction.</small></div>
    </div> : null}
    {controlled && affordanceDeltas.length ? <div className="hud-sonority-affordances" aria-label="Separate conditional affordance changes">{affordanceDeltas.map((affordance) => <span key={affordance.key}><small>{affordance.label}</small><strong>{signed(affordance.delta)}</strong><em>{affordance.delta > 3 ? "more available" : affordance.delta < -3 ? "less available" : "similar"}</em></span>)}</div> : null}
  </section>;
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
  const previousSet = new Set(previous.interpretedNotes.map(pitchClassFromMidi));
  const currentSet = new Set(current.interpretedNotes.map(pitchClassFromMidi));
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
    <div className="hud-panel-heading"><span>Membership change → consequence</span><strong id="hud-cause-title">Causal chord view</strong><small>Entering or leaving the reading does not claim that a key was physically pressed or released. Deltas are not an emotional verdict.</small></div>
    <div className="hud-cause-change"><span>{added.length ? `entered reading ${added.join(" · ")}` : "entered none"}</span><span>{removed.length ? `left reading ${removed.join(" · ")}` : "left none"}</span><span>{kept.length ? `stayed ${kept.join(" · ")}` : "stayed no positions"}</span></div>
    <div className="hud-cause-deltas">{deltas.map((item) => <span key={item.label}><small>{item.label}</small><strong>{item.value == null ? "—" : `${item.value > 0 ? "+" : ""}${item.value}`}</strong><em>{item.value == null ? "not available" : item.value > 3 ? "more" : item.value < -3 ? "less" : "similar"}</em></span>)}</div>
  </section>;
}

function ChordChangeLenses({ measures, selectedId, doMidi, scale, soundModelId, showConventions, onReflect, onStartMotionEcho }: {
  measures: ChordMeasure[];
  selectedId: string | null;
  doMidi: number;
  scale: PianoScale;
  soundModelId: PianoSoundModelId;
  showConventions: boolean;
  onReflect: (events: HudNoteEvent[]) => void;
  onStartMotionEcho: (before: ChordMeasure, after: ChordMeasure) => void;
}) {
  const selectedIndex = measures.findIndex((measure) => measure.gesture.id === selectedId);
  const index = selectedIndex >= 0 ? selectedIndex : measures.length - 1;
  const current = measures[index] ?? measures.at(-1) ?? null;
  const previous = current ? measures[index - 1] ?? null : null;
  if (!current || !previous) return <section className="hud-chord-change-lenses" aria-labelledby="hud-chord-change-title">
    <div className="hud-panel-heading"><span>Two grouped gestures · five lenses</span><strong id="hud-chord-change-title">What changed between these chords?</strong><small>Play two chord gestures. One comparison will connect sounding coordinates, relationships, motion, context, and your own experience.</small></div>
    <p className="hud-empty-copy">The second grouped gesture creates the before-and-after question.</p>
  </section>;

  const previousNotes = uniqueSorted(previous.interpretedNotes);
  const currentNotes = uniqueSorted(current.interpretedNotes);
  const previousSet = new Set(previousNotes.map(pitchClassFromMidi));
  const currentSet = new Set(currentNotes.map(pitchClassFromMidi));
  const pitchClassLabel = (pitchClass: number) => showConventions
    ? CONVENTIONAL_PITCH_CLASSES[pitchClass]
    : CHROMATIC_SOLFEGE[pitchClassFromMidi(pitchClass - pitchClassFromMidi(doMidi))];
  const noteLabel = (note: number) => showConventions ? conventionalPitchName(note) : relativeSyllable(note, doMidi, scale);
  const entered = [...currentSet].filter((pitchClass) => !previousSet.has(pitchClass)).map(pitchClassLabel);
  const left = [...previousSet].filter((pitchClass) => !currentSet.has(pitchClass)).map(pitchClassLabel);
  const stayed = [...currentSet].filter((pitchClass) => previousSet.has(pitchClass)).map(pitchClassLabel);
  const voice = voiceLeadingProfile(previousNotes, currentNotes);
  const delta = (currentValue: number | null, previousValue: number | null) => currentValue == null || previousValue == null ? null : Math.round((currentValue - previousValue) * 100);
  const signed = (value: number | null) => value == null ? "—" : `${value > 0 ? "+" : ""}${value}`;
  const previousSpan = previousNotes.length ? Math.max(...previousNotes) - Math.min(...previousNotes) : 0;
  const currentSpan = currentNotes.length ? Math.max(...currentNotes) - Math.min(...currentNotes) : 0;
  const bassMotion = voice.bassMotion === 0 ? "bass held" : `bass ${voice.bassMotion > 0 ? "up" : "down"} ${Math.abs(voice.bassMotion)}`;
  const specimen = [...previous.gesture.attacks, ...current.gesture.attacks]
    .filter((event, eventIndex, all) => all.findIndex((candidate) => candidate.id === event.id) === eventIndex)
    .sort((first, second) => first.onsetMs - second.onsetMs || first.id - second.id);
  const readyToReflect = specimen.length >= 3;
  const readyToEcho = [previous, current].every((measure) => measure.gesture.attacks.length >= 2
    && measure.interpretedNotes.length >= 2
    && measure.interpretedNotes.length <= 6
    && new Set(measure.interpretedNotes.map(pitchClassFromMidi)).size >= 2);
  return <section className="hud-chord-change-lenses" aria-labelledby="hud-chord-change-title">
    <div className="hud-panel-heading"><span>Selected before + after · five lenses</span><strong id="hud-chord-change-title">What changed between these chords?</strong><small>{previousNotes.map(noteLabel).join(" · ")} → {currentNotes.map(noteLabel).join(" · ")} · the grouped MIDI interpretation can be corrected above</small></div>
    <div className="hud-last-lenses" role="group" aria-label="Five separate lenses for the selected chord change">
      <article className="is-measured"><span>Sound</span><em>MIDI keys + derived reference + modeled spectrum</em><strong>{previous.audibleNotes.length}→{current.audibleNotes.length} sounding · span {previousSpan}→{currentSpan} semitones</strong><small>Modeled roughness {signed(delta(current.crunch, previous.crunch))} under {pianoSoundModel(soundModelId).shortLabel.toLowerCase()}. MIDI supplied key numbers and timing; A4=440 reference frequencies and the assumed spectrum are app-derived, not acoustic measurements.</small></article>
      <article className="is-measured"><span>Relationships</span><em>interpreted MIDI membership</em><strong>{entered.length ? `entered ${entered.join(" · ")}` : "entered none"} · {left.length ? `left ${left.join(" · ")}` : "left none"}</strong><small>{stayed.length ? `${stayed.join(" · ")} stayed in both readings.` : "No pitch-class position stayed."} Membership is not correctness or harmonic function.</small></article>
      <article className="is-measured"><span>Motion</span><em>nearest-position interpretation</em><strong>{voice.motionClasses.join(" + ") || "held / repeated"} · largest leap {formatSemitones(voice.largestLeap)}</strong><small>{bassMotion} · total nearest-position travel {formatSemitones(voice.totalMotion)}. All motion numbers are semitones; these strands describe one parsimonious mapping, not intended voices or fingering.</small></article>
      <article className="is-modeled"><span>Context</span><em>selected Do + teaching model</em><strong>toward Do {Math.round(previous.pull * 100)}→{Math.round(current.pull * 100)} · repose {Math.round(previous.arrival * 100)}→{Math.round(current.arrival * 100)}</strong><small>{current.rootTravelSteps == null ? "Root travel is unavailable under the current chord readings." : `${current.rootTravelSteps} fifths step${current.rootTravelSteps === 1 ? "" : "s"} between exact interpreted roots.`} These are contextual coordinates, not felt resolution.</small></article>
      <article className="is-unclaimed"><span>Experience</span><em>listener only</em><strong>Did this change feel like opening, arrival, motion, or something else?</strong><small>{readyToReflect ? "The HUD will freeze these exact two grouped gestures and ask for your report without filling it from the other lenses." : "At least three attacks across the two gestures are needed for a bounded reflection."}</small><button type="button" disabled={!readyToReflect} onClick={() => onReflect(specimen)}>Reflect on chord change</button></article>
    </div>
    <div className="hud-chord-motion-next"><div><span>Next question · same source move</span><strong>Can this entire chord change survive elsewhere?</strong><small>Freeze both corrected fields, then replay both in a new key or voicing. The two endpoints must share one transposition; physical voice motion may change.</small></div><button type="button" disabled={!readyToEcho} onClick={() => onStartMotionEcho(previous, current)}>Freeze this two-chord move</button></div>
    <p className="hud-last-attack-limit">No lens is averaged into similarity, emotionality, correctness, listenability, or musical goodness.</p>
  </section>;
}

function ChordMotionEcho({ session, sourceBeforeEvents, sourceAfterEvents, attempt, attemptProgress, pendingNotes, doMidi, scale, soundModelId, showConventions, onEnd, onRetry, onReflect }: {
  session: ChordMotionEchoSession;
  sourceBeforeEvents: HudNoteEvent[];
  sourceAfterEvents: HudNoteEvent[];
  attempt: ChordMotionEchoAttempt | null;
  attemptProgress: number;
  pendingNotes: number[];
  doMidi: number;
  scale: PianoScale;
  soundModelId: PianoSoundModelId;
  showConventions: boolean;
  onEnd: () => void;
  onRetry: () => void;
  onReflect: (events: HudNoteEvent[]) => void;
}) {
  const [contextFrameSelection, setContextFrameSelection] = useState({ attemptAnchorEventId: session.attemptAnchorEventId, followsReplay: false });
  const [gestureTimingRevealAnchor, setGestureTimingRevealAnchor] = useState<number | null>(null);
  const noteLabel = (note: number) => showConventions ? conventionalPitchName(note) : relativeSyllable(note, doMidi, scale);
  const signed = (value: number) => `${value > 0 ? "+" : value < 0 ? "−" : ""}${Math.abs(Math.round(value * 10) / 10)}`;
  const sourceBeforeNotes = uniqueSorted(session.sourceBeforeNotes);
  const sourceAfterNotes = uniqueSorted(session.sourceAfterNotes);
  const sourceMoveLabel = `${sourceBeforeNotes.map(noteLabel).join(" · ")} → ${sourceAfterNotes.map(noteLabel).join(" · ")}`;
  const comparison = attempt ? compareChordMotionEcho(sourceBeforeNotes, sourceAfterNotes, attempt.beforeNotes, attempt.afterNotes) : null;

  if (!attempt || !comparison) return <section className="hud-chord-motion-echo is-armed" aria-labelledby="hud-chord-motion-title">
    <div className="hud-chord-echo-topline"><div className="hud-panel-heading"><span>Two-chord source held · silent</span><strong id="hud-chord-motion-title">Replay the whole move elsewhere</strong><small>{sourceMoveLabel} · release the source, then perform two new grouped chord fields.</small></div><button type="button" onClick={onEnd}>End move echo</button></div>
    <div className="hud-chord-motion-progress" role="status" aria-live="polite"><span>{attemptProgress}/2 replay fields captured</span><strong>{attemptProgress === 0 ? "Play the first chord of the replay." : `First replay field: ${pendingNotes.map(noteLabel).join(" · ")}`}</strong><small>{attemptProgress === 0 ? "Choose any register or key. The second chord will reveal whether both endpoints shared one transposition." : "Now play the second grouped chord. A single later chord cannot silently complete this comparison."}</small></div>
  </section>;

  const attemptBeforeNotes = uniqueSorted(attempt.beforeNotes);
  const attemptAfterNotes = uniqueSorted(attempt.afterNotes);
  const sourceBeforeAttacks = session.sourceBeforeAttackEventIds
    ? sourceBeforeEvents.filter((event) => session.sourceBeforeAttackEventIds!.includes(event.id))
    : sourceBeforeEvents;
  const sourceAfterAttacks = session.sourceAfterAttackEventIds
    ? sourceAfterEvents.filter((event) => session.sourceAfterAttackEventIds!.includes(event.id))
    : sourceAfterEvents;
  const gestureTiming = compareChordGestureTiming(sourceBeforeAttacks, sourceAfterAttacks, attempt.beforeGesture.attacks, attempt.afterGesture.attacks);
  const gestureTimingRevealed = gestureTimingRevealAnchor === session.attemptAnchorEventId;
  const canMoveContextFrame = comparison.relationshipPreserved && comparison.transpositionSteps != null && comparison.transpositionSteps !== 0;
  const contextFollowsReplay = canMoveContextFrame
    && contextFrameSelection.attemptAnchorEventId === session.attemptAnchorEventId
    && contextFrameSelection.followsReplay;
  const replayDoMidi = contextFollowsReplay
    ? nearestMidiForPitchClass(pitchClassFromMidi(doMidi + comparison.transpositionSteps!), doMidi + comparison.transpositionSteps!)
    : doMidi;
  const replayNoteLabel = (note: number) => showConventions ? conventionalPitchName(note) : relativeSyllable(note, replayDoMidi, scale);
  const attemptMoveLabel = `${attemptBeforeNotes.map(replayNoteLabel).join(" · ")} → ${attemptAfterNotes.map(replayNoteLabel).join(" · ")}`;
  const sourceVoice = voiceLeadingProfile(sourceBeforeNotes, sourceAfterNotes);
  const attemptVoice = voiceLeadingProfile(attemptBeforeNotes, attemptAfterNotes);
  const sourceBeforeModel = sonorityPerceptionModel(sourceBeforeNotes.map((note) => pianoSoundVoice(frequencyFromMidi(note), 0.72, soundModelId)));
  const sourceAfterModel = sonorityPerceptionModel(sourceAfterNotes.map((note) => pianoSoundVoice(frequencyFromMidi(note), 0.72, soundModelId)));
  const attemptBeforeModel = sonorityPerceptionModel(attemptBeforeNotes.map((note) => pianoSoundVoice(frequencyFromMidi(note), 0.72, soundModelId)));
  const attemptAfterModel = sonorityPerceptionModel(attemptAfterNotes.map((note) => pianoSoundVoice(frequencyFromMidi(note), 0.72, soundModelId)));
  const sourceBeforeTendency = tonalTendency(sourceBeforeNotes, doMidi, scale);
  const sourceAfterTendency = tonalTendency(sourceAfterNotes, doMidi, scale);
  const attemptBeforeTendency = tonalTendency(attemptBeforeNotes, replayDoMidi, scale);
  const attemptAfterTendency = tonalTendency(attemptAfterNotes, replayDoMidi, scale);
  const span = (notes: number[]) => notes.at(-1)! - notes[0];
  const relationshipStrong = comparison.relationshipPreserved
    ? comparison.pitchClassIdentityPreserved
      ? "same two-field move · pitch classes unchanged"
      : `same two-field move · both fields shifted ${formatSemitones(comparison.transpositionSteps!, 0, true)}`
    : comparison.beforeRelationshipPreserved && comparison.afterRelationshipPreserved
      ? `both chord types returned · shifts disagree (${signed(comparison.beforeTranspositionSteps!)} then ${signed(comparison.afterTranspositionSteps!)})`
      : "one or both endpoint relationships changed";
  const allNotes = [...sourceBeforeNotes, ...sourceAfterNotes, ...attemptBeforeNotes, ...attemptAfterNotes];
  const low = Math.min(...allNotes) - 1;
  const high = Math.max(...allNotes) + 1;
  const xFor = (note: number) => 92 + ((note - low) / Math.max(1, high - low)) * 548;
  const reflectionEvents = [...sourceBeforeEvents, ...sourceAfterEvents, ...attempt.beforeGesture.attacks, ...attempt.afterGesture.attacks]
    .filter((event, index, events) => events.findIndex((candidate) => candidate.id === event.id) === index)
    .sort((first, second) => first.onsetMs - second.onsetMs || first.id - second.id);
  const modelScore = (value: number) => Math.round(value * 100);
  const bassCopy = (profile: ReturnType<typeof voiceLeadingProfile>) => profile.bassMotion === 0 ? "held" : `${profile.bassMotion > 0 ? "up" : "down"} ${Math.abs(profile.bassMotion)}`;
  const finalRelease = (event: HudNoteEvent) => event.releaseMs ?? (event.releaseReason === "key" ? event.keyReleaseMs : null);
  const rowDuration = (beforeEvents: HudNoteEvent[], afterEvents: HudNoteEvent[]) => {
    const origin = Math.min(...beforeEvents.map((event) => event.onsetMs));
    return Math.max(
      ...afterEvents.map((event) => event.onsetMs - origin),
      ...beforeEvents.map((event) => (finalRelease(event) ?? event.onsetMs) - origin),
      1,
    );
  };
  const gestureTimelineDuration = Math.max(
    rowDuration(sourceBeforeAttacks, sourceAfterAttacks),
    rowDuration(attempt.beforeGesture.attacks, attempt.afterGesture.attacks),
  );
  const gestureX = (onsetMs: number, originMs: number) => 116 + ((onsetMs - originMs) / gestureTimelineDuration) * 516;
  const bridgeLabel = (profile: NonNullable<typeof gestureTiming>["source"]) => profile.bridge.kind === "unknown"
    ? "release bridge unknown"
    : profile.bridge.kind === "touching"
      ? "releases touch next attack"
      : `${Math.round(profile.bridge.durationMs!)} ms ${profile.bridge.kind}${profile.bridge.pedalExtended ? " · pedal-extended" : ""}`;
  const timingProfileLabel = (profile: NonNullable<typeof gestureTiming>["source"]) => `spread ${Math.round(profile.beforeSpreadMs)}→${Math.round(profile.afterSpreadMs)} ms · next anchor ${Math.round(profile.anchorGapMs)} ms · ${bridgeLabel(profile)} · MIDI attack mean ${profile.beforeMeanVelocity == null ? "—" : Math.round(profile.beforeMeanVelocity)}→${profile.afterMeanVelocity == null ? "—" : Math.round(profile.afterMeanVelocity)}`;
  const gestureDeltaLabel = gestureTiming ? `Replay changed attack spread ${signed(gestureTiming.deltas.beforeSpreadMs)} then ${signed(gestureTiming.deltas.afterSpreadMs)} ms; chord-anchor spacing ${signed(gestureTiming.deltas.anchorGapMs)} ms; MIDI attack means ${gestureTiming.deltas.beforeMeanVelocity == null ? "—" : signed(gestureTiming.deltas.beforeMeanVelocity)} then ${gestureTiming.deltas.afterMeanVelocity == null ? "—" : signed(gestureTiming.deltas.afterMeanVelocity)}.` : "";
  const renderGestureRow = (label: string, beforeEvents: HudNoteEvent[], afterEvents: HudNoteEvent[], y: number) => {
    const origin = Math.min(...beforeEvents.map((event) => event.onsetMs));
    return <g>
      <text x="18" y={y + 4} className="hud-echo-row-label">{label}</text>
      <line x1="116" x2="632" y1={y} y2={y} className="hud-chord-gesture-axis" />
      {beforeEvents.map((event) => {
        const release = finalRelease(event);
        return <g key={`${label}-before-${event.id}`}>
          {release != null ? <line x1={gestureX(event.onsetMs, origin)} x2={gestureX(release, origin)} y1={y} y2={y} className={`hud-chord-gesture-hold${event.releaseReason === "pedal" ? " is-pedal" : ""}`}><title>{`${label} first chord: ${Math.round(release - event.onsetMs)} ms sounding evidence${event.releaseReason === "pedal" ? ", pedal-extended" : ""}`}</title></line> : null}
          <circle cx={gestureX(event.onsetMs, origin)} cy={y} r="5" className="hud-chord-gesture-attack is-before"><title>{`${label} first-chord attack at ${Math.round(event.onsetMs - origin)} ms; MIDI velocity ${event.velocity}`}</title></circle>
        </g>;
      })}
      {afterEvents.map((event) => <rect key={`${label}-after-${event.id}`} x={gestureX(event.onsetMs, origin) - 5} y={y - 5} width="10" height="10" className="hud-chord-gesture-attack is-after"><title>{`${label} second-chord attack at ${Math.round(event.onsetMs - origin)} ms; MIDI velocity ${event.velocity}`}</title></rect>)}
    </g>;
  };
  return <section className="hud-chord-motion-echo is-comparing" aria-labelledby="hud-chord-motion-title">
    <div className="hud-chord-echo-topline"><div className="hud-panel-heading"><span>{comparison.relationshipPreserved ? "Whole move matched · five lenses" : "Whole move changed · five lenses"}</span><strong id="hud-chord-motion-title">What survived across both chords?</strong><small>source {sourceMoveLabel} · replay {attemptMoveLabel}</small></div><div className="hud-chord-motion-actions"><button type="button" onClick={onRetry}>Try another move</button><button type="button" onClick={onEnd}>End move echo</button></div></div>
    <svg className="hud-chord-motion-figure" viewBox="0 0 720 228" role="img" aria-label={`${relationshipStrong}. Source nearest-position travel ${sourceVoice.totalMotion} semitones; replay travel ${attemptVoice.totalMotion} semitones. Source bass ${bassCopy(sourceVoice)}; replay bass ${bassCopy(attemptVoice)}.`}>
      <title>Source and replayed two-chord moves on one physical keyboard-position axis</title>
      <text x="18" y="42" className="hud-echo-row-label">source before</text><text x="18" y="87" className="hud-echo-row-label">source after</text>
      <text x="18" y="142" className="hud-echo-row-label">replay before</text><text x="18" y="187" className="hud-echo-row-label">replay after</text>
      {sourceVoice.strands.filter((strand) => strand.from != null && strand.to != null).map((strand, index) => <line key={`source-${strand.from}-${strand.to}-${index}`} x1={xFor(strand.from!)} x2={xFor(strand.to!)} y1="38" y2="82" className={`hud-chord-motion-strand is-source is-${strand.motion}`}><title>{`Source voice interpretation: ${noteLabel(strand.from!)} to ${noteLabel(strand.to!)}, ${formatSemitones(strand.semitones, 0, true)}`}</title></line>)}
      {attemptVoice.strands.filter((strand) => strand.from != null && strand.to != null).map((strand, index) => <line key={`attempt-${strand.from}-${strand.to}-${index}`} x1={xFor(strand.from!)} x2={xFor(strand.to!)} y1="138" y2="182" className={`hud-chord-motion-strand is-attempt is-${strand.motion}`}><title>{`Replay voice interpretation: ${replayNoteLabel(strand.from!)} to ${replayNoteLabel(strand.to!)}, ${formatSemitones(strand.semitones, 0, true)}`}</title></line>)}
      {sourceBeforeNotes.map((note) => <circle key={`sb-${note}`} cx={xFor(note)} cy="38" r="6" className="hud-chord-motion-node is-source is-before"><title>{`Source before: ${noteLabel(note)}, ${frequencyFromMidi(note).toFixed(1)} hertz`}</title></circle>)}
      {sourceAfterNotes.map((note) => <circle key={`sa-${note}`} cx={xFor(note)} cy="82" r="6" className="hud-chord-motion-node is-source is-after"><title>{`Source after: ${noteLabel(note)}, ${frequencyFromMidi(note).toFixed(1)} hertz`}</title></circle>)}
      {attemptBeforeNotes.map((note) => <rect key={`ab-${note}`} x={xFor(note) - 6} y="132" width="12" height="12" className="hud-chord-motion-node is-attempt is-before"><title>{`Replay before: ${replayNoteLabel(note)}, ${frequencyFromMidi(note).toFixed(1)} hertz`}</title></rect>)}
      {attemptAfterNotes.map((note) => <rect key={`aa-${note}`} x={xFor(note) - 6} y="176" width="12" height="12" className="hud-chord-motion-node is-attempt is-after"><title>{`Replay after: ${replayNoteLabel(note)}, ${frequencyFromMidi(note).toFixed(1)} hertz`}</title></rect>)}
      <line x1="92" x2="640" y1="207" y2="207" className="hud-grid-line" /><text x="92" y="222" className="hud-echo-axis-label">lower keyboard position</text><text x="640" y="222" className="hud-echo-axis-label is-end">higher</text>
    </svg>
    {comparison.relationshipPreserved && gestureTiming ? <div className="hud-chord-gesture-test"><div><span>Next question · same pitch relationship</span><strong>Did the hands make the same time-shape?</strong><small>The two-field pitch-class transformation stayed fixed. Attack spread, chord spacing, releases, pedal evidence, and MIDI velocity can vary independently.</small></div><button type="button" aria-expanded={gestureTimingRevealed} aria-controls="hud-chord-gesture-detail" onClick={() => setGestureTimingRevealAnchor(gestureTimingRevealed ? null : session.attemptAnchorEventId)}>{gestureTimingRevealed ? "Hide gesture timing" : "Compare gesture timing"}</button>{gestureTimingRevealed ? <div id="hud-chord-gesture-detail" className="hud-chord-gesture-detail"><svg viewBox="0 0 720 150" role="img" aria-label={`Source ${timingProfileLabel(gestureTiming.source)}. Replay ${timingProfileLabel(gestureTiming.attempt)}. ${gestureDeltaLabel}`}>
      <title>Two performances of the same chord relationship aligned to each first attack</title>
      {renderGestureRow("source", sourceBeforeAttacks, sourceAfterAttacks, 42)}
      {renderGestureRow("replay", attempt.beforeGesture.attacks, attempt.afterGesture.attacks, 96)}
      <text x="116" y="133" className="hud-echo-axis-label">first attack · circles</text><text x="632" y="133" className="hud-echo-axis-label is-end">later · squares begin chord 2</text>
    </svg><div className="hud-chord-gesture-readout"><span><b>Source</b> · {timingProfileLabel(gestureTiming.source)}</span><span><b>Replay</b> · {timingProfileLabel(gestureTiming.attempt)}</span><strong>{gestureDeltaLabel}</strong><small>Lines are recorded MIDI sounding evidence; dashed lines mark pedal-ended notes. Missing releases remain unknown. Velocity is an attack control, not measured acoustic loudness. This view does not infer meter, groove, intention, feeling, preference, or quality.</small></div></div> : null}</div> : null}
    {canMoveContextFrame ? <div className="hud-chord-frame-test" aria-labelledby="hud-chord-frame-title"><div><span>Second question · movable Do</span><strong id="hud-chord-frame-title">Does the tonal job travel when the reference frame travels?</strong><small>{contextFollowsReplay ? `Replay Do moved ${formatSemitones(comparison.transpositionSteps!, 0, true)} with the structural replay. MIDI, frequencies, voicings, and the relationship match did not change.` : `Replay Do remains fixed at the source center. The same structural move therefore occupies new relative roles.`} This is a display-only context counterfactual and never enters or sounds a note.</small></div><div className="hud-chord-frame-options" role="group" aria-label="Choose the replay's movable Do reference frame"><button type="button" aria-pressed={!contextFollowsReplay} onClick={() => setContextFrameSelection({ attemptAnchorEventId: session.attemptAnchorEventId, followsReplay: false })}>Keep Do fixed</button><button type="button" aria-pressed={contextFollowsReplay} onClick={() => setContextFrameSelection({ attemptAnchorEventId: session.attemptAnchorEventId, followsReplay: true })}>Move Do {formatSemitones(comparison.transpositionSteps!, 0, true)}</button></div></div> : null}
    <div className="hud-last-lenses" role="group" aria-label="Five separate lenses for the source and replayed chord move">
      <article className="is-measured"><span>Sound</span><em>MIDI keys + derived reference + modeled spectrum</em><strong>span {span(sourceBeforeNotes)}→{span(sourceAfterNotes)} vs {span(attemptBeforeNotes)}→{span(attemptAfterNotes)} semitones</strong><small>Modeled roughness source {modelScore(sourceBeforeModel.roughness)}→{modelScore(sourceAfterModel.roughness)} · replay {modelScore(attemptBeforeModel.roughness)}→{modelScore(attemptAfterModel.roughness)} under {pianoSoundModel(soundModelId).shortLabel.toLowerCase()}. Reference frequencies assume A4=440; upper partials and the acoustic result are assumed.</small></article>
      <article className="is-measured"><span>Relationships</span><em>interpreted pitch-class transformation</em><strong>{relationshipStrong}</strong><small>Source stayed / entered / left: {comparison.sourceCommonPitchClassCount} / {comparison.sourceEnteredPitchClassCount} / {comparison.sourceLeftPitchClassCount}. Replay: {comparison.attemptCommonPitchClassCount} / {comparison.attemptEnteredPitchClassCount} / {comparison.attemptLeftPitchClassCount}. Matching requires one shared shift across both fields.</small></article>
      <article className="is-measured"><span>Motion</span><em>nearest-position interpretations</em><strong>travel {sourceVoice.totalMotion} vs {attemptVoice.totalMotion} semitones · largest leap {sourceVoice.largestLeap} vs {attemptVoice.largestLeap}</strong><small>Bass source {bassCopy(sourceVoice)} · replay {bassCopy(attemptVoice)}. Every motion number is a semitone count. Revoicing may change every physical strand while the two-field relationship survives; these are not intended voices or fingering.</small></article>
      <article className="is-modeled"><span>Context</span><em>{contextFollowsReplay ? "replay Do moved + same route" : "same selected Do + route"}</em><strong>toward Do source {modelScore(sourceBeforeTendency.homePull)}→{modelScore(sourceAfterTendency.homePull)} · replay {modelScore(attemptBeforeTendency.homePull)}→{modelScore(attemptAfterTendency.homePull)}</strong><small>Home evidence source {modelScore(sourceBeforeTendency.homeEvidence)}→{modelScore(sourceAfterTendency.homeEvidence)} · replay {modelScore(attemptBeforeTendency.homeEvidence)}→{modelScore(attemptAfterTendency.homeEvidence)}. {contextFollowsReplay ? "Moving the reference frame restored the same relative-role path under this model; it did not prove the same heard function." : "A transposed relationship can occupy a different tonal context while Do stays fixed."}</small></article>
      <article className="is-unclaimed"><span>Experience</span><em>listener only</em><strong>Did the replay preserve the same sense of direction?</strong><small>A structural match does not prove the same function, tension, resolution, emotion, preference, correctness, or goodness. The display-only Do counterfactual never supplies your report.</small>{comparison.relationshipPreserved ? <button type="button" disabled={reflectionEvents.length < 8} onClick={() => onReflect(reflectionEvents)}>Reflect on source + replayed move</button> : null}</article>
    </div>
    <p className="hud-last-attack-limit">The two-field relationship may stay invariant while every physical voice, frequency, spectrum proxy, selected-Do role, and listener response changes.</p>
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
  const priorNotes = uniqueSorted(previous.interpretedNotes);
  const currentNotes = uniqueSorted(current.interpretedNotes);
  const profile = voiceLeadingProfile(priorNotes, currentNotes);
  const allNotes = [...priorNotes, ...currentNotes];
  const low = Math.min(...allNotes) - 1;
  const high = Math.max(...allNotes) + 1;
  const yFor = (note: number) => 142 - ((note - low) / Math.max(1, high - low)) * 104;
  const label = (note: number) => showConventions ? conventionalPitchName(note) : relativeSyllable(note, doMidi, scale);
  return <section className="hud-voice-coach" aria-labelledby="hud-voice-title">
    <div className="hud-panel-heading"><span>Interpreted chord-to-chord motion</span><strong id="hud-voice-title">Voice-leading coach</strong><small>Horizontal means held · slope shows direction and size · broken ends show voices entering or leaving the reading, not necessarily key attacks or releases.</small></div>
    <svg viewBox="0 0 720 176" role="img" aria-label={`${profile.strands.length} voice-leading strands; largest leap ${profile.largestLeap} semitones; ${profile.motionClasses.join(", ") || "no classified motion"}`}>
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
          <text x={(fromX + toX) / 2} y={(fromY + toY) / 2 - 7} className="hud-point-label">{strand.motion === "held" ? "held" : strand.motion === "added" ? "entered" : strand.motion === "released" ? "left" : `${strand.semitones > 0 ? "+" : ""}${strand.semitones}`}</text>
        </g>;
      })}
    </svg>
    <div className="hud-voice-summary">
      <span><small>motion kind</small><strong>{profile.motionClasses.join(" + ") || "held / repeated"}</strong></span>
      <span><small>largest leap</small><strong>{profile.largestLeap} semitone{profile.largestLeap === 1 ? "" : "s"}</strong></span>
      <span><small>bass motion</small><strong>{profile.bassMotion === 0 ? "held" : `${profile.bassMotion > 0 ? "up" : "down"} ${Math.abs(profile.bassMotion)}`}</strong></span>
    </div>
  </section>;
}

function LandmarkRouteFingerprintView({ fingerprint, showConventions, selectedTransitionIndex, onSelectTransition }: {
  fingerprint: LandmarkRouteFingerprint;
  showConventions: boolean;
  selectedTransitionIndex: number | null;
  onSelectTransition: (toStepIndex: number) => void;
}) {
  const width = 640;
  const height = 214;
  const left = 54;
  const right = 608;
  const top = 25;
  const bottom = 166;
  const xFor = (index: number) => fingerprint.fields.length <= 1
    ? (left + right) / 2
    : left + index / (fingerprint.fields.length - 1) * (right - left);
  const yFor = (offset: number) => bottom - offset / 11 * (bottom - top);
  const summary = `${fingerprint.fields.length}-field octave-folded relationship fingerprint. ${fingerprint.fields.map((field) => `Field ${field.stepIndex + 1}, ${field.role}: root position ${field.rootOffset}; field positions ${field.pitchOffsets.join(", ")}${field.changedFromOffset == null ? "" : `; changed position ${field.changedFromOffset} to ${field.changedToOffset}`}.`).join(" ")} ${fingerprint.transitions.map((transition) => `Transition ${transition.fromStepIndex + 1} to ${transition.toStepIndex + 1}: ${transition.sharedOffsets.length} carried position${transition.sharedOffsets.length === 1 ? "" : "s"}, ${transition.totalVoiceMotion} semitones of nearest-voice motion, largest leap ${transition.largestLeap} semitones, ${transition.rootTravelSteps ?? 0} fifths steps.`).join(" ")} Movable Do and register are factored out; this is not a sound, function, emotion, or quality score.`;
  return <section className="hud-landmark-fingerprint" aria-labelledby="hud-landmark-fingerprint-title">
    <div className="hud-landmark-fingerprint-heading"><div><span>relationship fingerprint · Do factored out</span><strong id="hud-landmark-fingerprint-title">The whole route inside one octave</strong></div><small>0–11 are semitone distances from movable Do, not note names.</small></div>
    <svg className="hud-landmark-fingerprint-plot" viewBox={`0 0 ${width} ${height}`} role="img" aria-label={summary}>
      {[0, 4, 7, 11].map((offset) => <g key={offset} className="hud-landmark-fingerprint-guide"><line x1={left - 18} x2={right + 18} y1={yFor(offset)} y2={yFor(offset)} /><text x={left - 24} y={yFor(offset) + 3} textAnchor="end">{offset === 0 ? "0 · Do" : `+${offset}`}</text></g>)}
      {fingerprint.transitions.flatMap((transition) => transition.sharedOffsets.map((offset) => <line key={`${transition.fromStepIndex}-${offset}`} className="hud-landmark-fingerprint-held" x1={xFor(transition.fromStepIndex)} x2={xFor(transition.toStepIndex)} y1={yFor(offset)} y2={yFor(offset)} />))}
      {fingerprint.fields.map((field) => <g key={field.stepIndex} className="hud-landmark-fingerprint-field">
        <line x1={xFor(field.stepIndex)} x2={xFor(field.stepIndex)} y1={top} y2={bottom} />
        {Array.from({ length: 12 }, (_, offset) => <circle key={`tick-${offset}`} className="hud-landmark-fingerprint-tick" cx={xFor(field.stepIndex)} cy={yFor(offset)} r="1.4" />)}
        {field.changedFromOffset != null && field.changedToOffset != null ? <g className="hud-landmark-fingerprint-mutation"><line x1={xFor(field.stepIndex)} x2={xFor(field.stepIndex)} y1={yFor(field.changedFromOffset)} y2={yFor(field.changedToOffset)} /><circle cx={xFor(field.stepIndex)} cy={yFor(field.changedFromOffset)} r="6" /></g> : null}
        {field.pitchOffsets.map((offset) => offset === field.changedToOffset
          ? <rect key={offset} className="hud-landmark-fingerprint-node is-changed" x={xFor(field.stepIndex) - 5} y={yFor(offset) - 5} width="10" height="10" transform={`rotate(45 ${xFor(field.stepIndex)} ${yFor(offset)})`}><title>{`Field ${field.stepIndex + 1}: changed target at +${offset}`}</title></rect>
          : offset === field.rootOffset
            ? <rect key={offset} className="hud-landmark-fingerprint-node is-root" x={xFor(field.stepIndex) - 5} y={yFor(offset) - 5} width="10" height="10"><title>{`Field ${field.stepIndex + 1}: root and field tone at +${offset}`}</title></rect>
            : <circle key={offset} className="hud-landmark-fingerprint-node" cx={xFor(field.stepIndex)} cy={yFor(offset)} r="5"><title>{`Field ${field.stepIndex + 1}: field tone at +${offset}`}</title></circle>)}
        <text className="hud-landmark-fingerprint-number" x={xFor(field.stepIndex)} y="194" textAnchor="middle">{field.stepIndex + 1}</text>
        <text className="hud-landmark-fingerprint-root-label" x={xFor(field.stepIndex)} y="208" textAnchor="middle">root +{field.rootOffset}</text>
      </g>)}
    </svg>
    <div className="hud-landmark-fingerprint-fields" style={{ "--landmark-field-count": fingerprint.fields.length } as CSSProperties} aria-hidden="true">
      {fingerprint.fields.map((field) => <span key={field.stepIndex}><small>field {field.stepIndex + 1}</small><strong>{showConventions ? `${field.conventionalName} · ${field.role}` : field.role}</strong></span>)}
    </div>
    <div className="hud-landmark-fingerprint-legend" aria-hidden="true"><span><i className="is-tone" />field position</span><span><i className="is-root" />root position</span>{fingerprint.variant === "one-key-changed" ? <><span><i className="is-source" />original position</span><span><i className="is-changed" />changed position</span></> : null}<span><i className="is-held" />carried unchanged</span></div>
    <ol className="hud-landmark-fingerprint-transitions" aria-label="Select one transition to inspect what changed">
      {fingerprint.transitions.map((transition) => <li key={transition.toStepIndex}><button type="button" aria-pressed={selectedTransitionIndex === transition.toStepIndex} onClick={() => onSelectTransition(transition.toStepIndex)}><strong>{transition.fromStepIndex + 1} → {transition.toStepIndex + 1}</strong><span>{transition.sharedOffsets.length} carried · {transition.totalVoiceMotion} semitones total · largest {transition.largestLeap} · fifths {transition.rootTravelSteps ?? "—"}</span><small>{selectedTransitionIndex === transition.toStepIndex ? "close change lens" : "inspect this move"}</small></button></li>)}
    </ol>
    <p>Transposing the whole route leaves this folded pattern unchanged. Register, timing, the assumed sound, tonal interpretation, and your experience remain separate evidence.</p>
  </section>;
}

function LandmarkTransitionChangeView({ change, doMidi, scale, soundModelId, showConventions }: {
  change: LandmarkTransitionChange;
  doMidi: number;
  scale: PianoScale;
  soundModelId: PianoSoundModelId;
  showConventions: boolean;
}) {
  const beforePerception = sonorityPerceptionModel(change.beforeNotes.map((note) => pianoSoundVoice(frequencyFromMidi(note), 0.72, soundModelId)));
  const afterPerception = sonorityPerceptionModel(change.afterNotes.map((note) => pianoSoundVoice(frequencyFromMidi(note), 0.72, soundModelId)));
  const beforeTendency = tonalTendency(change.beforeNotes, doMidi, scale);
  const afterTendency = tonalTendency(change.afterNotes, doMidi, scale);
  const allNotes = [...change.beforeNotes, ...change.afterNotes];
  const low = Math.min(...allNotes) - 1;
  const high = Math.max(...allNotes) + 1;
  const xFor = (note: number) => 132 + (note - low) / Math.max(1, high - low) * 474;
  const noteLabel = (note: number) => showConventions ? conventionalPitchName(note) : relativeSyllable(note, doMidi, scale);
  const offsetList = (offsets: number[]) => offsets.length ? offsets.map((offset) => `+${offset}`).join(" · ") : "none";
  const beforeRole = showConventions ? `${change.fromField.conventionalName} · ${change.fromField.role}` : change.fromField.role;
  const afterRole = showConventions ? `${change.toField.conventionalName} · ${change.toField.role}` : change.toField.role;
  const beforeSpan = Math.max(...change.beforeNotes) - Math.min(...change.beforeNotes);
  const afterSpan = Math.max(...change.afterNotes) - Math.min(...change.afterNotes);
  const summary = `Selected generated route move from ${beforeRole} to ${afterRole}. Folded positions held ${offsetList(change.stayedOffsets)}, entered ${offsetList(change.enteredOffsets)}, and left ${offsetList(change.leftOffsets)}. The stable reference voicing moves ${change.voiceLeading.totalMotion} semitones in total, with largest leap ${change.voiceLeading.largestLeap} semitones. Under the selected ${pianoSoundModel(soundModelId).shortLabel} teaching spectrum, modeled crunch changes ${signedPhraseValue((afterPerception.roughness - beforePerception.roughness) * 100)} and spectral repose changes ${signedPhraseValue((afterPerception.repose - beforePerception.repose) * 100)}. In the selected Do context, pull changes ${signedPhraseValue((afterTendency.homePull - beforeTendency.homePull) * 100)} and home evidence changes ${signedPhraseValue((afterTendency.homeEvidence - beforeTendency.homeEvidence) * 100)}. Listener experience is unclaimed.`;
  return <section className="hud-landmark-change" aria-labelledby="hud-landmark-change-title">
    <div className="hud-landmark-fingerprint-heading"><div><span>one move · five lenses</span><strong id="hud-landmark-change-title">What did field {change.toField.stepIndex + 1} change?</strong></div><small>{beforeRole} → {afterRole}</small></div>
    <svg className="hud-landmark-change-plot" viewBox="0 0 640 190" role="img" aria-label={summary}>
      <text x="18" y="51" className="hud-landmark-change-row">before · {change.fromField.stepIndex + 1}</text>
      <text x="18" y="126" className="hud-landmark-change-row">after · {change.toField.stepIndex + 1}</text>
      <line x1="132" x2="606" y1="156" y2="156" className="hud-landmark-change-axis" />
      {change.voiceLeading.strands.map((strand, index) => {
        if (strand.from != null && strand.to != null) return <line key={`strand-${index}`} x1={xFor(strand.from)} x2={xFor(strand.to)} y1="48" y2="123" className={`hud-landmark-change-strand is-${strand.motion}`}><title>{`${noteLabel(strand.from)} to ${noteLabel(strand.to)}: ${formatSemitones(strand.semitones, 0, true)}, ${strand.motion}`}</title></line>;
        if (strand.from != null) return <line key={`strand-${index}`} x1={xFor(strand.from)} x2={xFor(strand.from)} y1="48" y2="86" className="hud-landmark-change-strand is-released"><title>{`${noteLabel(strand.from)} leaves the compact reference voicing`}</title></line>;
        if (strand.to != null) return <line key={`strand-${index}`} x1={xFor(strand.to)} x2={xFor(strand.to)} y1="86" y2="123" className="hud-landmark-change-strand is-added"><title>{`${noteLabel(strand.to)} enters the compact reference voicing`}</title></line>;
        return null;
      })}
      {change.beforeNotes.map((note) => <circle key={`before-${note}`} cx={xFor(note)} cy="48" r="6" className="hud-landmark-change-node is-before"><title>{`Before: ${noteLabel(note)}, ${formatHz(frequencyFromMidi(note))}`}</title></circle>)}
      {change.afterNotes.map((note) => <rect key={`after-${note}`} x={xFor(note) - 6} y="117" width="12" height="12" className="hud-landmark-change-node is-after"><title>{`After: ${noteLabel(note)}, ${formatHz(frequencyFromMidi(note))}`}</title></rect>)}
      <text x="132" y="174" className="hud-landmark-change-axis-label">lower reference key</text><text x="606" y="174" textAnchor="end" className="hud-landmark-change-axis-label">higher</text>
    </svg>
    <ol className="hud-landmark-change-lenses" aria-label="Five evidence lenses for the selected route transition">
      <li><span>Sound · authored + modeled</span><strong>span {beforeSpan} → {afterSpan} semitones</strong><small>{pianoSoundModel(soundModelId).shortLabel} proxy: crunch {signedPhraseValue((afterPerception.roughness - beforePerception.roughness) * 100)} · repose {signedPhraseValue((afterPerception.repose - beforePerception.repose) * 100)}</small></li>
      <li><span>Relationships · authored</span><strong>{change.stayedOffsets.length} stayed · {change.enteredOffsets.length} entered · {change.leftOffsets.length} left</strong><small>held {offsetList(change.stayedOffsets)} · in {offsetList(change.enteredOffsets)} · out {offsetList(change.leftOffsets)}</small></li>
      <li><span>Motion · derived</span><strong>{change.voiceLeading.totalMotion} steps total · largest {change.voiceLeading.largestLeap}</strong><small>{change.voiceLeading.motionClasses.join(" · ") || "no moving-motion class"} · bass {signedPhraseValue(change.voiceLeading.bassMotion)}</small></li>
      <li><span>Context · modeled</span><strong>toward Do {signedPhraseValue((afterTendency.homePull - beforeTendency.homePull) * 100)}</strong><small>home evidence {signedPhraseValue((afterTendency.homeEvidence - beforeTendency.homeEvidence) * 100)} · root travel {change.rootTravelSteps ?? "—"} fifths steps</small></li>
      <li><span>Experience · yours</span><strong>Did this move feel more settled, less settled, or simply different?</strong><small>Unclaimed until you report it; no other lane supplies this answer.</small></li>
    </ol>
    <p>This is one generated target-to-target move, not reconstructed performance audio. The plot uses a stable compact reference voicing; timing, velocity, releases, pedal, balance, actual instrument spectrum, fingering, intention, emotion, and musical goodness remain outside it.</p>
  </section>;
}

function LandmarkRouteComparisonChoice({ sourcePath, sourceVariant, onChoose }: {
  sourcePath: LandmarkPath;
  sourceVariant: LandmarkRouteFingerprint["variant"];
  onChoose: (pathId: LandmarkPathId, sourceVariant: LandmarkRouteFingerprint["variant"]) => void;
}) {
  return <section className="hud-landmark-compare-choice" aria-labelledby="hud-landmark-compare-choice-title">
    <div><span>next experiment · perform both</span><strong id="hud-landmark-compare-choice-title">Which underlying route property changes?</strong><small>Keep this completed fingerprint as A. Choose B, perform every field, then compare recurrence, carried positions, nearest-key motion, and root travel in the same octave-folded coordinate.</small></div>
    <div aria-label="Choose a second landmark route">{LANDMARK_PATHS.filter((candidate) => candidate.id !== sourcePath.id).map((candidate) => <button key={candidate.id} type="button" onClick={() => onChoose(candidate.id, sourceVariant)}><span>{candidate.family}</span><strong>{candidate.title}</strong></button>)}</div>
  </section>;
}

function LandmarkRouteComparisonView({ comparison, sourcePath, targetPath, showConventions, onChooseNext, onEnd }: {
  comparison: LandmarkRouteComparison;
  sourcePath: LandmarkPath;
  targetPath: LandmarkPath;
  showConventions: boolean;
  onChooseNext: (pathId: LandmarkPathId) => void;
  onEnd: () => void;
}) {
  const width = 640;
  const height = 326;
  const left = 156;
  const right = 608;
  const sharedKeys = new Set(comparison.sharedFieldSets.map((field) => field.join(".")));
  const profileText = (profile: LandmarkRouteComparison["source"]) => `${profile.repeatedFieldCount} repeated field${profile.repeatedFieldCount === 1 ? "" : "s"}; ${profile.returnsToOpeningField ? "returns to its opening field" : "ends on a different field"}; carried-tone counts ${profile.carriedToneCounts.join(", ") || "none"}; nearest-key motion ${profile.nearestMotionSteps.join(", ") || "none"}; fifths travel ${profile.rootTravelSteps.map((value) => value ?? "unknown").join(", ") || "none"}; through-tones ${profile.throughToneOffsets.join(", ") || "none"}.`;
  const summary = `Two completed generated routes in one octave-folded coordinate. ${sourcePath.family}: ${profileText(comparison.source)} ${targetPath.family}: ${profileText(comparison.target)} They share ${comparison.sharedFieldSets.length} exact field shape${comparison.sharedFieldSets.length === 1 ? "" : "s"}. This compares authored structure, not performed timing, sound, style membership, emotion, or quality.`;
  const renderLane = (fingerprint: LandmarkRouteFingerprint, path: LandmarkPath, laneTop: number, laneBottom: number, lane: "source" | "target") => {
    const xFor = (index: number) => fingerprint.fields.length <= 1 ? (left + right) / 2 : left + index / (fingerprint.fields.length - 1) * (right - left);
    const yFor = (offset: number) => laneBottom - offset / 11 * (laneBottom - laneTop);
    return <g className={`hud-landmark-compare-lane is-${lane}`}>
      <text x="18" y={laneTop + 7} className="hud-landmark-compare-family">{lane === "source" ? "A" : "B"} · {path.family}</text>
      <text x="18" y={laneTop + 24} className="hud-landmark-compare-title">{path.title}</text>
      <text x={left - 19} y={laneTop + 3} textAnchor="end" className="hud-landmark-compare-axis">+11</text>
      <text x={left - 19} y={laneBottom + 3} textAnchor="end" className="hud-landmark-compare-axis">0 · Do</text>
      <line x1={left - 12} x2={right + 10} y1={laneTop} y2={laneTop} className="hud-landmark-compare-guide" />
      <line x1={left - 12} x2={right + 10} y1={laneBottom} y2={laneBottom} className="hud-landmark-compare-guide" />
      {fingerprint.transitions.flatMap((transition) => transition.sharedOffsets.map((offset) => <line key={`${lane}-${transition.fromStepIndex}-${offset}`} x1={xFor(transition.fromStepIndex)} x2={xFor(transition.toStepIndex)} y1={yFor(offset)} y2={yFor(offset)} className="hud-landmark-compare-held" />))}
      {fingerprint.fields.map((field) => {
        const shared = sharedKeys.has(field.pitchOffsets.join("."));
        return <g key={`${lane}-${field.stepIndex}`} className={`hud-landmark-compare-field ${shared ? "is-shared-shape" : ""}`}>
          {shared ? <rect x={xFor(field.stepIndex) - 12} y={laneTop - 7} width="24" height={laneBottom - laneTop + 14} rx="12"><title>{`Exact field shape shared by both routes: ${field.pitchOffsets.join(", ")}`}</title></rect> : null}
          <line x1={xFor(field.stepIndex)} x2={xFor(field.stepIndex)} y1={laneTop} y2={laneBottom} />
          {field.pitchOffsets.map((offset) => offset === field.changedToOffset
            ? <rect key={offset} x={xFor(field.stepIndex) - 4} y={yFor(offset) - 4} width="8" height="8" className="hud-landmark-compare-node is-changed" transform={`rotate(45 ${xFor(field.stepIndex)} ${yFor(offset)})`}><title>{`Changed position +${offset}`}</title></rect>
            : offset === field.rootOffset
              ? <rect key={offset} x={xFor(field.stepIndex) - 4} y={yFor(offset) - 4} width="8" height="8" className="hud-landmark-compare-node is-root"><title>{`Root position +${offset}`}</title></rect>
              : <circle key={offset} cx={xFor(field.stepIndex)} cy={yFor(offset)} r="4" className="hud-landmark-compare-node"><title>{`Field position +${offset}`}</title></circle>)}
          <text x={xFor(field.stepIndex)} y={laneBottom + 17} textAnchor="middle" className="hud-landmark-compare-number">{showConventions ? field.conventionalName : field.stepIndex + 1}</text>
        </g>;
      })}
    </g>;
  };
  const sourceFingerprint = landmarkRouteFingerprint(sourcePath, comparison.source.variant);
  const targetFingerprint = landmarkRouteFingerprint(targetPath, comparison.target.variant);
  const sequence = (values: Array<number | null>) => values.length ? values.map((value) => value ?? "—").join(" · ") : "one field";
  const recurrence = (profile: LandmarkRouteComparison["source"]) => `${profile.repeatedFieldCount} repeated${profile.returnsToOpeningField ? " · opening returns" : " · different ending"}`;
  const through = (profile: LandmarkRouteComparison["source"]) => profile.throughToneOffsets.length ? profile.throughToneOffsets.map((offset) => `+${offset}`).join(" · ") : "none through all fields";
  return <section className="hud-landmark-compare" aria-labelledby="hud-landmark-compare-title">
    <div className="hud-landmark-fingerprint-heading"><div><span>performed A/B · authored structure</span><strong id="hud-landmark-compare-title">Two routes in the same underlying coordinate</strong></div><small>Dashed capsules mark exact field shapes present in both routes. Squares mark authored roots; blue lines mark carried positions.</small></div>
    <svg className="hud-landmark-compare-plot" viewBox={`0 0 ${width} ${height}`} role="img" aria-label={summary}>
      {renderLane(sourceFingerprint, sourcePath, 39, 126, "source")}
      {renderLane(targetFingerprint, targetPath, 201, 288, "target")}
    </svg>
    <p className="hud-landmark-compare-shared"><span>shared exact field shapes</span><strong>{comparison.sharedFieldSets.length ? comparison.sharedFieldSets.map((field) => field.join("·")).join("  /  ") : "none"}</strong><small>A shared shape can occur at a different moment or carry a different role. It is not a style match.</small></p>
    <div className="hud-landmark-compare-table" role="table" aria-label="Route structure comparison">
      <div role="row" className="is-heading"><span role="columnheader">property</span><strong role="columnheader">A · {sourcePath.family}</strong><strong role="columnheader">B · {targetPath.family}</strong></div>
      <div role="row"><span role="rowheader">field recurrence</span><strong role="cell">{recurrence(comparison.source)}</strong><strong role="cell">{recurrence(comparison.target)}</strong></div>
      <div role="row"><span role="rowheader">one position throughout</span><strong role="cell">{through(comparison.source)}</strong><strong role="cell">{through(comparison.target)}</strong></div>
      <div role="row"><span role="rowheader">carried positions</span><strong role="cell">{sequence(comparison.source.carriedToneCounts)}</strong><strong role="cell">{sequence(comparison.target.carriedToneCounts)}</strong></div>
      <div role="row"><span role="rowheader">nearest-key motion</span><strong role="cell">{sequence(comparison.source.nearestMotionSteps)}</strong><strong role="cell">{sequence(comparison.target.nearestMotionSteps)}</strong></div>
      <div role="row"><span role="rowheader">root travel on fifths</span><strong role="cell">{sequence(comparison.source.rootTravelSteps)}</strong><strong role="cell">{sequence(comparison.target.rootTravelSteps)}</strong></div>
    </div>
    <p className="hud-landmark-compare-boundary">Your two completions unlock the comparison; the numbers come from the generated route definitions and one stable reference voicing. Timing, articulation, register, actual sound, tonal hearing, emotional response, familiarity, and goodness remain separate evidence.</p>
    <div className="hud-landmark-compare-actions"><div><span>keep A · perform another B</span>{LANDMARK_PATHS.filter((candidate) => candidate.id !== sourcePath.id && candidate.id !== targetPath.id).map((candidate) => <button key={candidate.id} type="button" onClick={() => onChooseNext(candidate.id)}>{candidate.family}</button>)}</div><button type="button" onClick={onEnd}>End comparison</button></div>
  </section>;
}

function LandmarkPathCoach({ path, pathVoicings, stepIndex, targetNotes, reflectionSpecimen, doMidi, scale, soundModelId, showConventions, transposeSession, counterfactualSession, routeCompareSession, onSelect, onReplay, onTranspose, onCounterfactual, onCounterfactualReport, onRestore, onReflect, onStartRouteComparison, onEndRouteComparison }: {
  path: LandmarkPath;
  pathVoicings: number[][];
  stepIndex: number;
  targetNotes: number[];
  reflectionSpecimen: HudNoteEvent[] | null;
  doMidi: number;
  scale: PianoScale;
  soundModelId: PianoSoundModelId;
  showConventions: boolean;
  transposeSession: LandmarkTransposeSession | null;
  counterfactualSession: LandmarkCounterfactualSession | null;
  routeCompareSession: LandmarkRouteCompareSession | null;
  onSelect: (id: LandmarkPathId) => void;
  onReplay: () => void;
  onTranspose: () => void;
  onCounterfactual: () => void;
  onCounterfactualReport: (report: LandmarkCounterfactualReport) => void;
  onRestore: () => void;
  onReflect: (specimen: HudNoteEvent[]) => void;
  onStartRouteComparison: (pathId: LandmarkPathId, sourceVariant: LandmarkRouteFingerprint["variant"]) => void;
  onEndRouteComparison: () => void;
}) {
  const [transitionSelection, setTransitionSelection] = useState<{ fingerprintKey: string; toStepIndex: number } | null>(null);
  const complete = stepIndex >= path.steps.length;
  const currentStep = complete ? null : path.steps[stepIndex];
  const counterfactualActive = counterfactualSession?.pathId === path.id && counterfactualSession.rootPitchClass === pitchClassFromMidi(doMidi);
  const transition = currentStep && stepIndex > 0 && pathVoicings[stepIndex - 1]?.length && pathVoicings[stepIndex]?.length ? (() => {
    const priorRoot = pitchClassFromMidi(doMidi + path.steps[stepIndex - 1].rootOffset);
    const currentRoot = pitchClassFromMidi(doMidi + path.steps[stepIndex].rootOffset);
    const field = chordTransitionEvidence(pathVoicings[stepIndex - 1], pathVoicings[stepIndex], priorRoot, currentRoot);
    const voices = voiceLeadingProfile(pathVoicings[stepIndex - 1], pathVoicings[stepIndex]);
    return { commonPitchClassCount: field.commonPitchClassCount, totalVoiceMotion: voices.totalMotion, largestLeap: voices.largestLeap, rootTravelSteps: field.rootTravelSteps };
  })() : null;
  const perception = targetNotes.length >= 2 ? sonorityPerceptionModel(targetNotes.map((note) => pianoSoundVoice(frequencyFromMidi(note), 0.72, soundModelId))) : null;
  const tendency = targetNotes.length ? tonalTendency(targetNotes, doMidi, scale) : null;
  const targetLabels = targetNotes.map((note) => showConventions ? conventionalPitchName(note) : relativeSyllable(note, doMidi, scale));
  const transposeProfile = transposeSession?.pathId === path.id
    ? landmarkTranspositionProfile(path, transposeSession.sourceRootPitchClass, transposeSession.targetRootPitchClass)
    : null;
  const counterfactualProfile = counterfactualActive ? landmarkCounterfactualProfile(path, doMidi) : null;
  const routeFingerprint = landmarkRouteFingerprint(path, counterfactualActive ? "one-key-changed" : "original");
  const fingerprintKey = `${routeFingerprint.pathId}:${routeFingerprint.variant}:${pitchClassFromMidi(doMidi)}`;
  const selectedTransitionIndex = transitionSelection?.fingerprintKey === fingerprintKey ? transitionSelection.toStepIndex : null;
  const selectedTransitionChange = selectedTransitionIndex == null ? null : landmarkTransitionChange(path, selectedTransitionIndex, doMidi, routeFingerprint.variant);
  const routeComparisonSourcePath = routeCompareSession?.targetPathId === path.id
    ? LANDMARK_PATHS.find((candidate) => candidate.id === routeCompareSession.sourcePathId) ?? null
    : null;
  const routeComparison = complete && routeCompareSession && routeComparisonSourcePath
    ? compareLandmarkRouteFingerprints(landmarkRouteFingerprint(routeComparisonSourcePath, routeCompareSession.sourceVariant), routeFingerprint)
    : null;
  const sourcePerception = counterfactualProfile ? sonorityPerceptionModel(counterfactualProfile.sourceNotes.map((note) => pianoSoundVoice(frequencyFromMidi(note), 0.72, soundModelId))) : null;
  const changedPerception = counterfactualProfile ? sonorityPerceptionModel(counterfactualProfile.targetNotes.map((note) => pianoSoundVoice(frequencyFromMidi(note), 0.72, soundModelId))) : null;
  const sourceTendency = counterfactualProfile ? tonalTendency(counterfactualProfile.sourceNotes, doMidi, scale) : null;
  const changedTendency = counterfactualProfile ? tonalTendency(counterfactualProfile.targetNotes, doMidi, scale) : null;
  const noteLabel = (note: number) => showConventions ? conventionalPitchName(note) : relativeSyllable(note, doMidi, scale);
  const doLabel = (pitchClass: number) => showConventions
    ? CONVENTIONAL_PITCH_CLASSES[pitchClass]
    : `${formatHz(frequencyFromMidi(nearestMidiForPitchClass(pitchClass, 60)))} Do`;
  const targetDescription = currentStep
    ? `Step ${stepIndex + 1} of ${path.steps.length}, ${currentStep.role}. Play ${targetLabels.join(", ")}.`
    : `${path.title} complete after ${path.steps.length} matched fields.`;
  const listeningQuestion = routeComparisonSourcePath
    ? `Which structural property makes ${path.family} take a different route from ${routeComparisonSourcePath.family}: recurrence, carried positions, nearest-key motion, or root travel?`
    : counterfactualActive ? path.counterfactual.question : path.question;
  return <section className="hud-landmark-coach" aria-labelledby="hud-landmark-title">
    <div className="hud-panel-heading"><span>Generated · silent · transposable</span><strong id="hud-landmark-title">Playable landmark paths</strong><small>Choose an archetype, then supply every outlined field yourself. Do stays fixed during one pass; changing center restarts at field one. The HUD advances only after an exact pitch-class match in any octave.</small></div>
    <div className="hud-landmark-selector" aria-label="Choose a landmark path">
      {LANDMARK_PATHS.map((candidate) => <button key={candidate.id} type="button" disabled={routeComparisonSourcePath?.id === candidate.id} aria-pressed={candidate.id === path.id} onClick={() => onSelect(candidate.id)}><span>{candidate.family}</span><strong>{candidate.title}</strong><small>{routeComparisonSourcePath?.id === candidate.id ? "A · completed" : `${candidate.steps.length} fields`}</small></button>)}
    </div>
    {routeComparisonSourcePath ? <div className="hud-landmark-compare-status" role="status"><span>route A held · now perform B</span><strong>{routeComparisonSourcePath.family} <i aria-hidden="true">→</i> {path.family}</strong><small>The first route stays frozen as a structural fingerprint. B must be completed before the comparison appears; no notes are entered or sounded for you.</small></div> : null}
    <div className="hud-landmark-question"><span>one listening question</span><strong>{listeningQuestion}</strong><small>{path.provenance}</small></div>
    {transposeProfile ? <div className="hud-landmark-transpose" role="status" aria-label={`Transposition comparison from ${doLabel(transposeProfile.sourceDoPitchClass)} to ${doLabel(transposeProfile.targetDoPitchClass)}`}>
      <div><span>same path, new center</span><strong>{doLabel(transposeProfile.sourceDoPitchClass)} <i aria-hidden="true">→</i> {doLabel(transposeProfile.targetDoPitchClass)}</strong><small>Every target pitch class rotated {transposeProfile.semitoneShift} semitone{transposeProfile.semitoneShift === 1 ? "" : "s"} around the octave; compact voicings may move individual keys differently. Begin again at field 1.</small></div>
      <p><span>changed</span><strong>Do and every physical target frequency</strong></p>
      <p><span>held constant</span><strong>field order, roles, root offsets, and internal pitch-class shapes</strong></p>
      <p><span>listen for</span><strong>Does the route still feel directed when its register and center move?</strong></p>
    </div> : null}
    {counterfactualProfile ? <div className="hud-landmark-counterfactual-intro" role="status" aria-label={`One-key counterfactual at field ${counterfactualProfile.stepIndex + 1}: ${noteLabel(counterfactualProfile.sourceNote)} to ${noteLabel(counterfactualProfile.targetNote)}`}>
      <span>one-key counterfactual · same Do · no answer played</span>
      <strong>{path.counterfactual.label}: {noteLabel(counterfactualProfile.sourceNote)} <i aria-hidden="true">→</i> {noteLabel(counterfactualProfile.targetNote)}</strong>
      <small>{path.counterfactual.hypothesis} Perform every outlined field; only field {counterfactualProfile.stepIndex + 1} differs from your source route.</small>
    </div> : null}
    <ol className="hud-landmark-progress" aria-label={`${path.title} progress`}>
      {path.steps.map((step, index) => <li key={step.id} className={index < stepIndex ? "is-complete" : index === stepIndex ? "is-current" : ""} aria-current={index === stepIndex ? "step" : undefined}>
        <span>{index < stepIndex ? "✓" : index + 1}</span>
        <strong>{showConventions ? `${step.conventionalName} · ${step.role}` : step.role}</strong>
        <small>{counterfactualActive && index === path.counterfactual.stepIndex ? `${index < stepIndex ? "matched" : index === stepIndex ? "play now" : "ahead"} · one key changed` : index < stepIndex ? "matched" : index === stepIndex ? "play now" : "ahead"}</small>
      </li>)}
    </ol>
    <div className={`hud-landmark-target ${complete ? "is-complete" : ""}`} role="status" aria-label={targetDescription}>
      <span>{complete ? "path complete" : `field ${stepIndex + 1} of ${path.steps.length}`}</span>
      <strong>{complete ? counterfactualActive ? "One route completed with exactly one changed key" : transposeProfile ? "Same route completed from two centers" : "Replay it here—or change one property" : `${currentStep!.role} · ${targetLabels.join(" · ")}`}</strong>
      <small>{complete ? counterfactualActive ? "The performed control changed one physical key in one field. Compare the evidence lanes, then report only what you experienced." : transposeProfile ? "The center and frequencies changed; the ordered interval relationships did not. Similarity of your felt experience remains yours to judge." : "The archetype is a reusable relationship path, not a fixed key or a claim about every piece in this style." : `${counterfactualActive && stepIndex === path.counterfactual.stepIndex ? `This is the only altered field: ${noteLabel(counterfactualProfile!.sourceNote)} became ${noteLabel(counterfactualProfile!.targetNote)}. ` : ""}${currentStep!.prompt} Release the prior field, then play the dashed keys together or as one compact roll.`}</small>
      {complete ? counterfactualActive ? <div className="hud-landmark-actions"><button type="button" onClick={onReplay}>Replay changed route</button><button type="button" onClick={onRestore}>Restore original route</button></div> : <div className="hud-landmark-actions"><button type="button" onClick={onReplay}>Replay here</button><button type="button" onClick={onCounterfactual}>Change one key</button><button type="button" onClick={onTranspose}>Move to fifths neighbor</button></div> : null}
      {complete ? <div className="hud-landmark-reflection"><div><span>Experience · yours, not inferred</span><strong>How did this whole performed route feel?</strong><small>{reflectionSpecimen ? `Freeze the exact ${reflectionSpecimen.length}-attack pass and answer settledness, energy, familiarity, and liking one at a time.` : "The exact pass is unavailable because an event expired or this completion predates path capture. Replay the route to reflect on its original timing."}</small></div><button type="button" disabled={!reflectionSpecimen} onClick={() => reflectionSpecimen && onReflect(reflectionSpecimen)}>Reflect on performed path</button></div> : null}
    </div>
    {complete ? routeComparison && routeComparisonSourcePath
      ? <LandmarkRouteComparisonView comparison={routeComparison} sourcePath={routeComparisonSourcePath} targetPath={path} showConventions={showConventions} onChooseNext={(pathId) => onSelect(pathId)} onEnd={onEndRouteComparison} />
      : <><LandmarkRouteFingerprintView fingerprint={routeFingerprint} showConventions={showConventions} selectedTransitionIndex={selectedTransitionIndex} onSelectTransition={(toStepIndex) => setTransitionSelection((current) => current?.fingerprintKey === fingerprintKey && current.toStepIndex === toStepIndex ? null : { fingerprintKey, toStepIndex })} />{selectedTransitionChange ? <LandmarkTransitionChangeView change={selectedTransitionChange} doMidi={doMidi} scale={scale} soundModelId={soundModelId} showConventions={showConventions} /> : null}<LandmarkRouteComparisonChoice sourcePath={path} sourceVariant={routeFingerprint.variant} onChoose={onStartRouteComparison} /></>
      : null}
    {!complete ? <div className="hud-landmark-evidence" aria-label="Current landmark transition evidence">
      <span><small>carried tones</small><strong>{transition ? transition.commonPitchClassCount : "—"}</strong><em>{transition ? "same pitch classes" : "first-field baseline"}</em></span>
      <span><small>nearest voices</small><strong>{transition ? transition.totalVoiceMotion : "—"}</strong><em>{transition ? `semitones total · largest ${transition.largestLeap}` : "motion begins next"}</em></span>
      <span><small>root around fifths</small><strong>{transition?.rootTravelSteps ?? "—"}</strong><em>{transition?.rootTravelSteps == null ? "baseline" : transition.rootTravelSteps === 1 ? "one neighbor" : "circle steps"}</em></span>
      <span><small>modeled field</small><strong>{perception ? `${Math.round(perception.roughness * 100)} / ${Math.round(perception.repose * 100)}` : "—"}</strong><em>crunch / repose proxy</em></span>
      <span><small>toward Do</small><strong>{tendency ? Math.round(tendency.homePull * 100) : "—"}</strong><em>{tendency?.hasHome ? "Do is present" : "Do is absent"}</em></span>
    </div> : null}
    {counterfactualProfile && sourcePerception && changedPerception && sourceTendency && changedTendency ? <div className="hud-landmark-counterfactual" aria-label="Original versus one-key path comparison across five lenses">
      <div><span>physical intervention</span><strong>{noteLabel(counterfactualProfile.sourceNote)} → {noteLabel(counterfactualProfile.targetNote)}</strong><small>{signedPhraseValue(counterfactualProfile.keyShift)} semitone at field {counterfactualProfile.stepIndex + 1} · {counterfactualProfile.retainedNotes.length} tones retained</small></div>
      <div><span>relationships</span><strong>{counterfactualProfile.sourceIntervals.join(" · ")} → {counterfactualProfile.targetIntervals.join(" · ")}</strong><small>semitone distances from changed tone to retained tones</small></div>
      <div><span>assumed spectrum</span><strong>crunch {signedPhraseValue((changedPerception.roughness - sourcePerception.roughness) * 100)}</strong><small>repose proxy {signedPhraseValue((changedPerception.repose - sourcePerception.repose) * 100)} · model, not heard audio</small></div>
      <div><span>selected context</span><strong>pull {signedPhraseValue((changedTendency.homePull - sourceTendency.homePull) * 100)}</strong><small>home evidence {signedPhraseValue((changedTendency.homeEvidence - sourceTendency.homeEvidence) * 100)} · selected Do model</small></div>
      <div className="hud-landmark-counterfactual-report"><span>your experience</span><strong>{complete ? "Which path felt more directed?" : "Complete the changed route first"}</strong>{complete ? <div role="group" aria-label="Report which landmark path felt more directed"><button type="button" aria-pressed={counterfactualSession?.report === "source"} onClick={() => onCounterfactualReport("source")}>Original</button><button type="button" aria-pressed={counterfactualSession?.report === "same"} onClick={() => onCounterfactualReport("same")}>About same</button><button type="button" aria-pressed={counterfactualSession?.report === "changed"} onClick={() => onCounterfactualReport("changed")}>Changed</button></div> : <small>No modeled lane fills this answer.</small>}</div>
    </div> : null}
    <div className="hud-landmark-reading">
      <p><span>what stays invariant</span><strong>{path.invariant}</strong></p>
      <p><span>characteristic affordance</span><strong>{path.characteristic}</strong></p>
    </div>
  </section>;
}

function signedPhraseValue(value: number, digits = 0) {
  const rounded = Number(value.toFixed(digits));
  return `${rounded > 0 ? "+" : ""}${rounded}`;
}

function phraseMovePath(moves: number[]) {
  return moves.length ? moves.map((move) => signedPhraseValue(move)).join(" · ") : "one attack only";
}

function PhraseEndingRippleView({ ripple, comparison, doMidi, scale, showConventions }: {
  ripple: PhraseEndingRipple;
  comparison: PhraseLensComparison;
  doMidi: number;
  scale: PianoScale;
  showConventions: boolean;
}) {
  const signed = (value: number) => `${value > 0 ? "+" : value < 0 ? "−" : ""}${Math.abs(value)}`;
  const ratio = (value: number) => `×${value.toFixed(3)}`;
  const largestDistance = Math.max(1, ...ripple.relationships.flatMap((relationship) => [relationship.sourceDistanceSteps, relationship.attemptDistanceSteps]));
  const endingALabel = pitchClassRoleLabel(comparison.context.endingPitchClassA, doMidi, scale, showConventions);
  const endingBLabel = pitchClassRoleLabel(comparison.context.endingPitchClassB, doMidi, scale, showConventions);
  const centerALabel = pitchClassRoleLabel(comparison.context.leadingCenterA, doMidi, scale, showConventions);
  const centerBLabel = pitchClassRoleLabel(comparison.context.leadingCenterB, doMidi, scale, showConventions);
  const summary = `The replay preserved ${ripple.sourcePositions.length - 1} earlier normalized attack positions and moved only the ending from position ${ripple.sourceEndingPosition} to ${ripple.attemptEndingPosition}. ${ripple.changedRelationshipCount} signed intervals touching the ending changed; ${ripple.retainedRelationshipCount} earlier-to-earlier intervals stayed invariant. The final approach changed from ${ripple.sourceFinalApproachSteps} to ${ripple.attemptFinalApproachSteps} semitones.`;
  const effect = (relationship: PhraseEndingRipple["relationships"][number]) => relationship.distanceDelta === 0
    ? "same span · direction changed"
    : `${relationship.distanceDelta < 0 ? "shorter" : "wider"} by ${Math.abs(relationship.distanceDelta)} semitone${Math.abs(relationship.distanceDelta) === 1 ? "" : "s"}`;
  return <div className="hud-ending-ripple" aria-label="Ending relationship ripple">
    <div className="sr-only hud-ending-ripple-summary" role="img" aria-label={summary} />
    <div className="hud-ending-ripple-heading"><span>one changed ending · every connected relationship</span><strong>Ending {formatSemitones(ripple.sourceEndingPosition, 0, true)} → {formatSemitones(ripple.attemptEndingPosition, 0, true)}</strong><small>Positions are measured from each phrase’s first attack, so a whole-phrase transposition of {formatSemitones(ripple.replayTranspositionSteps, 0, true)} is removed before comparison. Bar length shows interval size relative to this specimen; ratios use 12-TET.</small></div>
    <div className="hud-ending-ripple-approach"><span>final approach</span><strong>{signed(ripple.sourceFinalApproachSteps)} → {signed(ripple.attemptFinalApproachSteps)} semitones</strong><small>The last melodic move is one spoke. The changed ending also forms a new signed interval with every earlier attack.</small></div>
    <div className="hud-ending-ripple-spokes">
      {ripple.relationships.map((relationship) => <div key={relationship.eventIndex} className="hud-ending-ripple-spoke">
        <strong>attack {relationship.eventIndex + 1}<small>position {signed(relationship.retainedPosition)}</small></strong>
        <div>
          <span className="is-source"><small>A</small><i><b style={{ "--ending-width": `${relationship.sourceDistanceSteps / largestDistance * 100}%` } as CSSProperties} /></i><em>{signed(relationship.sourceSignedSteps)} · {ratio(relationship.sourceFrequencyRatio)}</em></span>
          <span className="is-attempt"><small>B</small><i><b style={{ "--ending-width": `${relationship.attemptDistanceSteps / largestDistance * 100}%` } as CSSProperties} /></i><em>{signed(relationship.attemptSignedSteps)} · {ratio(relationship.attemptFrequencyRatio)}</em></span>
        </div>
        <small>{effect(relationship)}</small>
      </div>)}
    </div>
    <div className="hud-ending-ripple-reading" role="status" aria-live="polite"><span>Relational consequence</span><strong>{ripple.changedRelationshipCount} ending spokes changed · {ripple.retainedRelationshipCount} earlier relationships held</strong><small>The performed ending role changed {endingALabel} → {endingBLabel}; the full-phrase gravity model’s leading candidate changed {centerALabel} → {centerBLabel}. That ranking also uses timing, duration, velocity, bass, recurrence, and phrase order, so this view does not claim the ending alone caused the modeled context—or the learner’s experience.</small></div>
  </div>;
}

function PhrasePauseMutationView({ mutation }: { mutation: PhrasePauseMutation }) {
  if (mutation.kind !== "one-gap" || mutation.changedGapIndex == null) return null;
  const changed = mutation.gaps[mutation.changedGapIndex];
  const sourcePositions = mutation.gaps.reduce<number[]>((positions, gap) => [...positions, positions.at(-1)! + gap.sourceMs], [0]);
  const attemptPositions = mutation.gaps.reduce<number[]>((positions, gap) => [...positions, positions.at(-1)! + gap.attemptMs], [0]);
  const maximumMs = Math.max(500, mutation.sourcePhraseMs, mutation.attemptPhraseMs);
  const xFor = (value: number) => 78 + (value / maximumMs) * 584;
  const bridgeCopy = (bridge: PhrasePauseMutation["gaps"][number]["sourceBridge"]) => bridge.kind === "unknown"
    ? "release unresolved"
    : bridge.kind === "touching"
      ? "release meets the next attack"
      : `${Math.round(bridge.durationMs ?? 0)} ms ${bridge.kind === "silence" ? "measured silence" : `${bridge.pedalExtended ? "pedal-ended " : ""}sounding overlap`}`;
  const deltaCopy = `${changed.deltaMs > 0 ? "+" : changed.deltaMs < 0 ? "−" : ""}${Math.abs(Math.round(changed.deltaMs))} ms`;
  const summary = `The absolute ${mutation.attackCountA}-attack pitch path stayed fixed. Only onset gap ${changed.gapIndex + 1}, between attacks ${changed.gapIndex + 1} and ${changed.gapIndex + 2}, moved beyond its ${Math.round(changed.toleranceMs)} millisecond performance tolerance: ${Math.round(changed.sourceMs)} milliseconds in phrase A and ${Math.round(changed.attemptMs)} milliseconds in phrase B. ${mutation.controlGapCount} other gaps stayed within their local tolerances.`;
  return <div className="hud-pause-mutation" aria-label="One-pause timing comparison">
    <div className="hud-pause-heading"><span>same keys · one changed onset gap</span><strong>Pause {changed.gapIndex + 1}: {Math.round(changed.sourceMs)} → {Math.round(changed.attemptMs)} ms</strong><small>The shared millisecond axis preserves the actual displacement of every later attack. A is solid and circular; B is dashed and square.</small></div>
    <svg viewBox="0 0 720 174" role="img" aria-label={summary}>
      <title>Two performances of the same pitch path with one onset gap changed</title>
      <text x="34" y="58" className="hud-pause-row-label">A</text><text x="34" y="118" className="hud-pause-row-label">B</text>
      {mutation.gaps.map((gap, index) => <g key={`gap-${index}`} className={`hud-pause-link ${gap.changed ? "is-changed" : "is-control"}`}>
        <line x1={xFor(sourcePositions[index])} x2={xFor(sourcePositions[index + 1])} y1="54" y2="54" className="is-source" />
        <line x1={xFor(attemptPositions[index])} x2={xFor(attemptPositions[index + 1])} y1="114" y2="114" className="is-attempt" />
      </g>)}
      {sourcePositions.map((position, index) => <g key={`a-${index}`} className="hud-pause-node is-source"><circle cx={xFor(position)} cy="54" r="5" /><text x={xFor(position)} y="38">{index + 1}</text></g>)}
      {attemptPositions.map((position, index) => <g key={`b-${index}`} className="hud-pause-node is-attempt"><rect x={xFor(position) - 5} y="109" width="10" height="10" /><text x={xFor(position)} y="139">{index + 1}</text></g>)}
      <line x1={xFor(sourcePositions[changed.gapIndex])} x2={xFor(sourcePositions[changed.gapIndex + 1])} y1="76" y2="76" className="hud-pause-bracket is-source" />
      <line x1={xFor(attemptPositions[changed.gapIndex])} x2={xFor(attemptPositions[changed.gapIndex + 1])} y1="92" y2="92" className="hud-pause-bracket is-attempt" />
      <text x="78" y="163" className="hud-pause-time-label">0 s</text><text x="662" y="163" className="hud-pause-time-label is-end">{(maximumMs / 1_000).toFixed(1)} s</text>
    </svg>
    <div className="hud-pause-reading" role="status" aria-live="polite">
      <span>attacks {changed.gapIndex + 1} → {changed.gapIndex + 2} · observed onset change {deltaCopy}</span>
      <strong>A: {bridgeCopy(changed.sourceBridge)} · B: {bridgeCopy(changed.attemptBridge)}</strong>
      <small>{mutation.controlGapCount} other onset gap{mutation.controlGapCount === 1 ? "" : "s"} stayed within a local tolerance of 12% or at least 45 ms. The keys and signed interval path stayed fixed.</small>
    </div>
    <p className="hud-pause-guardrail">Onset spacing and release-proven silence are separate: lengthening a gap does not guarantee more quiet if a note keeps sounding. This comparison does not prove a phrase boundary, meter, expressive intention, emotion, preference, quality, or causal effect.</p>
  </div>;
}

function PhraseCompareField({ session, liveReplayCount, comparison, availableAttackCount, doMidi, scale, showConventions, onStart, onCapture, onReplay, onPromote, onReport, onEnd }: {
  session: PhraseCompareSession | null;
  liveReplayCount: number;
  comparison: PhraseLensComparison | null;
  availableAttackCount: number;
  doMidi: number;
  scale: PianoScale;
  showConventions: boolean;
  onStart: (intention: PhraseChangeIntention) => void;
  onCapture: () => void;
  onReplay: () => void;
  onPromote: () => void;
  onReport: (dimension: PhraseCompareDimension, report: PhraseCompareReport) => void;
  onEnd: () => void;
}) {
  const [endingRippleRevealKey, setEndingRippleRevealKey] = useState<string | null>(null);
  const [pauseRevealKey, setPauseRevealKey] = useState<string | null>(null);
  const activeChoice = session ? PHRASE_CHANGE_CHOICES.find((choice) => choice.id === session.intention) ?? null : null;
  if (!session) return <section className="hud-phrase-compare is-entry" aria-labelledby="hud-phrase-compare-entry-title">
    <div className="hud-panel-heading"><span>One phrase · one declared change · five lenses</span><strong id="hud-phrase-compare-entry-title">Choose one thing to change</strong><small>Freeze your phrase with a question already in mind. The replay will show the intended coordinate, the control you tried to preserve, and every other lens that moved.</small></div>
    <div className="hud-phrase-intention-options" role="group" aria-label="Choose one phrase change to investigate">
      {PHRASE_CHANGE_CHOICES.map((choice) => <button key={choice.id} type="button" onClick={() => onStart(choice.id)} disabled={availableAttackCount < 3}><strong>{choice.label}</strong><span>{choice.question}</span></button>)}
    </div>
    <p>{availableAttackCount >= 3 ? `The latest ${Math.min(12, availableAttackCount)} attacks are available; a pause longer than 1.6 seconds starts a newer specimen when it contains at least three attacks.` : `Play at least ${3 - availableAttackCount} more attack${3 - availableAttackCount === 1 ? "" : "s"} first.`} No sound is generated or recorded.</p>
  </section>;

  const labelPitchClass = (pitchClass: number) => pitchClassRoleLabel(pitchClass, doMidi, scale, showConventions);
  if (!session.comparison || !comparison) return <section className="hud-phrase-compare is-capturing" aria-labelledby="hud-phrase-compare-title">
    <div className="hud-phrase-compare-topline"><div className="hud-panel-heading"><span>Phrase A frozen · frame fixed · intention declared</span><strong id="hud-phrase-compare-title">{activeChoice?.question ?? "Replay it as phrase B"}</strong><small>{activeChoice?.instruction ?? "Replay the phrase with one intentional change."} A contains {session.baseline.length} attacks.</small></div><button type="button" onClick={onEnd}>Choose another test</button></div>
    <div className="hud-phrase-capture-status" role="status" aria-live="polite"><span>B replay</span><strong>{liveReplayCount} attack{liveReplayCount === 1 ? "" : "s"} captured after A</strong><small>Aim for roughly {session.baseline.length}; capture is available after three and keeps at most twelve.</small></div>
    {activeChoice ? <div className="hud-phrase-intention-active" aria-label={`Current change intention: ${activeChoice.label}`}><span>change</span><strong>{activeChoice.label}</strong><small>Try to preserve: {activeChoice.control}.</small></div> : null}
    <div className="hud-builder-actions"><button type="button" onClick={onCapture} disabled={liveReplayCount < 3}>Freeze phrase B</button></div>
    <p className="hud-phrase-limit">The replay is learner-bounded rather than automatically segmented. MIDI captures events, not your instrument audio or intention.</p>
  </section>;

  const registerDelta = comparison.sound.meanMidiB - comparison.sound.meanMidiA;
  const velocityDelta = comparison.sound.meanVelocityB - comparison.sound.meanVelocityA;
  const spanDelta = comparison.sound.pitchSpanB - comparison.sound.pitchSpanA;
  const soundChanged = Math.abs(registerDelta) >= 0.5 || Math.abs(velocityDelta) >= 1 || spanDelta !== 0;
  const overlapDelta = comparison.motion.overlapShareB - comparison.motion.overlapShareA;
  const durationChanged = comparison.motion.tempoRatio != null && Math.abs(comparison.motion.tempoRatio - 1) > 0.05;
  const motionChanged = !comparison.motion.sameTimingShape || durationChanged || Math.abs(overlapDelta) > 0.05;
  const contextChanged = comparison.context.leadingCenterA !== comparison.context.leadingCenterB
    || comparison.context.endingPitchClassA !== comparison.context.endingPitchClassB
    || Math.abs(comparison.context.clarityB - comparison.context.clarityA) > 0.03;
  const relationshipCopy = comparison.relationships.sameIntervalPath
    ? comparison.relationships.uniformTransposition === 0
      ? "Every signed interval and every absolute key stayed the same."
      : `Every pitch moved ${formatSemitones(comparison.relationships.uniformTransposition ?? 0, 0, true)}; the signed interval path stayed invariant.`
    : `${comparison.relationships.changedMoveCount} of ${Math.max(comparison.relationships.intervalPathA.length, comparison.relationships.intervalPathB.length)} signed moves changed.`;
  const timingCopy = comparison.motion.sameTimingShape
    ? comparison.motion.tempoRatio == null
      ? "The proportional onset shape stayed the same."
      : `The proportional onset shape stayed the same at ${comparison.motion.tempoRatio.toFixed(2)}× A's elapsed time.`
    : comparison.motion.timingShapeDistance == null
      ? "The attack counts differ, so no one-to-one timing shape is claimed."
      : `The normalized onset spacing changed by ${Math.round(comparison.motion.timingShapeDistance * 100)} points on average.`;
  const reportRows: Array<{ id: PhraseCompareDimension; label: string; a: string; b: string }> = [
    { id: "settledness", label: "Which felt more settled?", a: "A", b: "B" },
    { id: "energy", label: "Which felt more energized?", a: "A", b: "B" },
    { id: "liking", label: "Which did you like more here?", a: "A", b: "B" },
  ];
  const reportCopy = (dimension: PhraseCompareDimension) => {
    const report = session.reports[dimension];
    if (!report) return "not reported";
    if (report === "same") return "felt about the same";
    const adjective = dimension === "settledness" ? "more settled" : dimension === "energy" ? "more energized" : "liked more";
    return `${report.toUpperCase()} ${adjective}`;
  };
  const changeProfile = session.intention ? phraseChangeProfile(comparison, session.intention) : null;
  const endingRipple = session.intention === "ending" && changeProfile?.targetObserved && changeProfile.controlPreserved
    ? comparePhraseEndingRipple(session.baseline, session.comparison)
    : null;
  const endingRippleKey = endingRipple ? `${session.anchorEventId}:${session.comparison.map((event) => event.note).join(",")}` : null;
  const endingRippleRevealed = endingRippleKey != null && endingRippleRevealKey === endingRippleKey;
  const pauseMutation = session.intention === "timing" && changeProfile?.controlPreserved
    ? comparePhrasePauseMutation(session.baseline, session.comparison)
    : null;
  const pauseKey = pauseMutation?.kind === "one-gap" ? `${session.anchorEventId}:${pauseMutation.changedGapIndex}:${pauseMutation.attemptPhraseMs}` : null;
  const pauseRevealed = pauseKey != null && pauseRevealKey === pauseKey;
  const lensLabel = (lens: "sound" | "relationships" | "motion" | "context") => lens === "context" ? "modeled context" : lens;
  const intendedEvidence = !changeProfile || !activeChoice ? "No declared change was stored with this comparison."
    : session.intention === "transpose" ? `Register center moved ${formatSemitones(registerDelta, 1, true)}.`
      : session.intention === "timing" ? timingCopy
        : session.intention === "touch" ? `Mean MIDI attack moved ${signedPhraseValue(velocityDelta)}.`
          : session.intention === "articulation" ? `Sounding-overlap share moved ${signedPhraseValue(overlapDelta * 100)} points.`
            : session.intention === "interval" ? `${comparison.relationships.changedMoveCount} signed move${comparison.relationships.changedMoveCount === 1 ? "" : "s"} changed.`
              : `The ending moved from ${labelPitchClass(comparison.context.endingPitchClassA)} to ${labelPitchClass(comparison.context.endingPitchClassB)}.`;
  const otherLensCopy = changeProfile?.otherChangedLenses.length
    ? `Other observed lens changes: ${changeProfile.otherChangedLenses.map(lensLabel).join(", ")}.`
    : "No other lens crossed its display threshold.";
  const invariantLensCopy = changeProfile?.invariantLenses.length
    ? `Invariant lenses: ${changeProfile.invariantLenses.map(lensLabel).join(", ")}.`
    : "Every measured or modeled lens crossed a display threshold.";
  return <section className="hud-phrase-compare is-complete" aria-labelledby="hud-phrase-compare-title">
    <div className="hud-phrase-compare-topline"><div className="hud-panel-heading"><span>A/B complete · declared intention · no combined score</span><strong id="hud-phrase-compare-title">One change, traced through five lenses</strong><small>A {session.baseline.length} attacks · B {session.comparison.length} attacks · the movable-Do frame stayed fixed while both specimens were compared.</small></div><div className="hud-builder-actions"><button type="button" onClick={onReplay}>Try the same change again</button><button type="button" onClick={onPromote}>Use B as new A</button><button type="button" onClick={onEnd}>Choose another test</button></div></div>
    {changeProfile && activeChoice ? <div className={`hud-phrase-change-reading ${changeProfile.targetObserved ? "has-target" : "is-unobserved"}`}><div className="sr-only hud-phrase-change-status" role="status" aria-live="polite">{`${activeChoice.label}. ${changeProfile.targetObserved ? "The intended coordinate moved." : "The intended coordinate did not move clearly."} ${intendedEvidence} ${changeProfile.controlPreserved ? "Control preserved" : "Control not preserved"}: ${activeChoice.control}. ${otherLensCopy} ${invariantLensCopy}`}</div><span>declared change · {activeChoice.label}</span><strong>{changeProfile.targetObserved ? "The intended coordinate moved" : "The intended coordinate did not move clearly"}</strong><p>{intendedEvidence}</p><small><b>{changeProfile.controlPreserved ? "Control preserved:" : "Control not preserved:"}</b> {activeChoice.control}. {otherLensCopy} {invariantLensCopy}</small>{endingRipple && endingRippleKey ? <button type="button" aria-pressed={endingRippleRevealed} onClick={() => setEndingRippleRevealKey(endingRippleRevealed ? null : endingRippleKey)}>{endingRippleRevealed ? "Hide ending ripple" : "Trace every ending relationship"}</button> : null}</div> : null}
    {endingRipple && endingRippleRevealed ? <PhraseEndingRippleView ripple={endingRipple} comparison={comparison} doMidi={doMidi} scale={scale} showConventions={showConventions} /> : null}
    {pauseMutation ? <div className={`hud-pause-entry is-${pauseMutation.kind}`} role="status" aria-live="polite"><div><span>Next question · same absolute pitch path</span><strong>{pauseMutation.kind === "one-gap" ? "Exactly one pause moved beyond performance tolerance" : pauseMutation.kind === "same" ? "No one pause moved clearly" : `${pauseMutation.changedGapIndices.length} onset gaps moved clearly`}</strong><small>{pauseMutation.kind === "one-gap" ? `${pauseMutation.controlGapCount} other gaps stayed near their source durations. Open the microscope to separate onset spacing from actual quiet.` : pauseMutation.kind === "same" ? "Small replay variation stayed inside the local 12% or 45 ms tolerance. Try again with one clearly shorter or longer pause." : "The broad timing comparison remains valid. The one-pause microscope opens only when one gap changes and the others remain near their source durations."}</small></div>{pauseMutation.kind === "one-gap" && pauseKey ? <button type="button" aria-expanded={pauseRevealed} aria-controls="hud-pause-mutation-detail" onClick={() => setPauseRevealKey(pauseRevealed ? null : pauseKey)}>{pauseRevealed ? "Hide changed pause" : "Trace the changed pause"}</button> : null}</div> : null}
    {pauseMutation?.kind === "one-gap" && pauseRevealed ? <div id="hud-pause-mutation-detail"><PhrasePauseMutationView mutation={pauseMutation} /></div> : null}
    <div className="hud-phrase-lens-profile" role="group" aria-label="Five separate phrase comparison lenses">
      <article className={soundChanged ? "has-change" : "is-invariant"}><header><span>1 · sound</span><em>measured MIDI</em><strong>{soundChanged ? "changed" : "invariant"}</strong></header><div><p><b>A</b> center {comparison.sound.meanMidiA.toFixed(1)} · span {comparison.sound.pitchSpanA} semitones · attack {Math.round(comparison.sound.meanVelocityA)}</p><i aria-hidden="true">→</i><p><b>B</b> center {comparison.sound.meanMidiB.toFixed(1)} · span {comparison.sound.pitchSpanB} semitones · attack {Math.round(comparison.sound.meanVelocityB)}</p></div><small>Register center {formatSemitones(registerDelta, 1, true)} · span {formatSemitones(spanDelta, 0, true)} · mean MIDI attack {signedPhraseValue(velocityDelta)}. This is not acoustic loudness or timbre.</small></article>
      <article className={comparison.relationships.sameIntervalPath ? "is-invariant" : "has-change"}><header><span>2 · relationships</span><em>measured intervals</em><strong>{comparison.relationships.sameIntervalPath ? "invariant" : "changed"}</strong></header><div><p><b>A</b> {phraseMovePath(comparison.relationships.intervalPathA)}</p><i aria-hidden="true">→</i><p><b>B</b> {phraseMovePath(comparison.relationships.intervalPathB)}</p></div><small>{relationshipCopy}</small></article>
      <article className={motionChanged ? "has-change" : "is-invariant"}><header><span>3 · motion</span><em>measured timing</em><strong>{motionChanged ? "changed" : "invariant"}</strong></header><div><p><b>A</b> {(comparison.motion.phraseMsA / 1_000).toFixed(2)} s · {Math.round(comparison.motion.overlapShareA * 100)}% overlapping links</p><i aria-hidden="true">→</i><p><b>B</b> {(comparison.motion.phraseMsB / 1_000).toFixed(2)} s · {Math.round(comparison.motion.overlapShareB * 100)}% overlapping links</p></div><small>{timingCopy} Sounding-overlap share changed {signedPhraseValue(overlapDelta * 100)} points.</small></article>
      <article className={contextChanged ? "has-change" : "is-invariant"}><header><span>4 · context</span><em>modeled hypothesis</em><strong>{contextChanged ? "changed" : "invariant"}</strong></header><div><p><b>A</b> {labelPitchClass(comparison.context.leadingCenterA)} leads · ends {labelPitchClass(comparison.context.endingPitchClassA)} · gap {Math.round(comparison.context.clarityA * 100)}</p><i aria-hidden="true">→</i><p><b>B</b> {labelPitchClass(comparison.context.leadingCenterB)} leads · ends {labelPitchClass(comparison.context.endingPitchClassB)} · gap {Math.round(comparison.context.clarityB * 100)}</p></div><small>Twelve center-and-route hypotheses were reranked from performed evidence. The gap is model separation, not confidence or heard key.</small></article>
      <article className="is-reported"><header><span>5 · experience</span><em>your report</em><strong>{Object.keys(session.reports).length}/3 answered</strong></header><div className="hud-phrase-report-rows">{reportRows.map((row) => <div key={row.id}><span><b>{row.label}</b><small>{reportCopy(row.id)}</small></span><span role="group" aria-label={row.label}><button type="button" aria-pressed={session.reports[row.id] === "a"} onClick={() => onReport(row.id, "a")}>{row.a}</button><button type="button" aria-pressed={session.reports[row.id] === "same"} onClick={() => onReport(row.id, "same")}>same</button><button type="button" aria-pressed={session.reports[row.id] === "b"} onClick={() => onReport(row.id, "b")}>{row.b}</button></span></div>)}</div><small>No MIDI or model value fills this lane. Settledness, energy, and liking remain separate and local to this comparison.</small></article>
    </div>
    <p className="hud-phrase-limit">This profile describes two captured performances. It does not decide whether either phrase is better, more musical, stylistically correct, emotionally universal, or causally explained by the largest visible change.</p>
  </section>;
}

function characterChoiceLabel(key: keyof PhraseCharacterRatings, value: number | undefined) {
  if (value == null) return "—";
  const question = CHARACTER_QUESTIONS.find((item) => item.key === key)!;
  const index = CHARACTER_VALUES.reduce((best, candidate, candidateIndex) => Math.abs(candidate - value) < Math.abs(CHARACTER_VALUES[best] - value) ? candidateIndex : best, 0);
  return question.choices[index];
}

function experiencePromptForOrigin(prompt: string, origin: ExperienceOrigin) {
  if (origin === "interval-echo") return prompt.replace("this phrase", "this source-and-echo comparison");
  if (origin === "chord-change") return prompt.replace("this phrase", "this chord change");
  if (origin === "chord-voicing-echo") return prompt.replace("this phrase", "this source-and-revoicing comparison");
  if (origin === "chord-motion-echo") return prompt.replace("this phrase", "this source-and-replayed chord move");
  if (origin === "resolution-fork") return prompt.replace("this phrase", "this intended landing in context");
  if (origin === "motif-return") return prompt
    .replace("this phrase", "this source–variation–return arc")
    .replace("this relationship path", "this source–variation–return arc")
    .replace("this particular experience", "this source–variation–return experience");
  if (origin === "landmark-path") return prompt
    .replace("this phrase", "this performed landmark path")
    .replace("this relationship path", "this performed landmark path")
    .replace("this particular experience", "this landmark-path experience");
  return prompt;
}

function ExperienceLens({ captured, origin, context, latestCount, observations, draft, questionIndex, saved, evidence, soundModelLabel, deleteArmed, onCapture, onAnswer, onBack, onSave, onReflectAgain, onArmDelete, onDelete }: {
  captured: HudNoteEvent[];
  origin: ExperienceOrigin;
  context: PhraseCharacterContext | null;
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
  const questionPrompt = question ? experiencePromptForOrigin(question.prompt, origin) : undefined;
  const ready = captured.length >= 3;
  const boundedComparison = origin !== "phrase";
  const specimenLabel = origin === "interval-echo" ? "interval source + echo" : origin === "chord-change" ? "chord before + after" : origin === "chord-voicing-echo" ? "chord source + voicing" : origin === "chord-motion-echo" ? "chord move source + replay" : origin === "resolution-fork" ? "resolution source + landing" : origin === "motif-return" ? "motif source + variation + return" : origin === "landmark-path" ? context?.label ?? "performed landmark path" : "reflection specimen";
  const specimenState = origin === "interval-echo" || origin === "chord-voicing-echo" || origin === "chord-motion-echo" ? "comparison held" : origin === "chord-change" ? "change held" : origin === "resolution-fork" ? "landing held" : origin === "motif-return" ? "return arc held" : origin === "landmark-path" ? "performed path held" : "";
  const repeatedReportCopy = `${repeats.length} prior report${repeats.length === 1 ? "" : "s"} ${repeats.length === 1 ? "shares" : "share"} this relationship signature.`;
  const specimenCopy = origin === "interval-echo"
    ? `The exact source and replay are frozen together. ${repeatedReportCopy}`
    : origin === "chord-change"
      ? `The exact two grouped gestures are frozen together. ${repeatedReportCopy}`
      : origin === "chord-voicing-echo"
        ? `The exact source and revoicing gestures are frozen together. ${repeatedReportCopy}`
        : origin === "chord-motion-echo"
          ? `The exact two source fields and two replay fields are frozen together. ${repeatedReportCopy}`
          : origin === "resolution-fork"
            ? `The frozen fork source, performed path, and first matching landing are held together. ${repeatedReportCopy}`
            : origin === "motif-return"
              ? `The exact source, latest variation, and relationship return are frozen together. ${repeatedReportCopy}`
              : origin === "landmark-path"
                ? `Every exact attack used to complete this generated path is frozen in its original chronology. ${repeatedReportCopy}`
      : `${repeats.length} prior report${repeats.length === 1 ? "" : "s"} with this relationship signature.`;
  const saveLabel = origin === "phrase" ? "Save this phrase report" : origin === "chord-change" ? "Save this chord-change report" : origin === "chord-voicing-echo" ? "Save this voicing report" : origin === "chord-motion-echo" ? "Save this chord-move report" : origin === "resolution-fork" ? "Save this landing report" : origin === "motif-return" ? "Save this return-arc report" : origin === "landmark-path" ? "Save this landmark-path report" : "Save this comparison report";
  const draftPlaced = draft.settledness != null && draft.energy != null;
  const xFor = (value: number) => 54 + value / 100 * 412;
  const yFor = (value: number) => 252 - value / 100 * 210;
  const mapDescription = observations.length
    ? `${observations.length} saved personal phrase report${observations.length === 1 ? "" : "s"}; center settledness ${Math.round(summary!.center.settledness)}, energy ${Math.round(summary!.center.energy)}, uncertainty plus or minus ${Math.round(summary!.uncertainty)}.`
    : "No saved personal phrase reports yet. The first two answers will place the current experience.";
  const reportedValues = CHARACTER_QUESTIONS.map((item) => `${item.low} ${draft[item.key] == null ? "—" : draft[item.key]} ${item.high}`).join("; ");
  return <section className="hud-experience-lens" aria-labelledby="hud-experience-title">
    <div className="hud-panel-heading"><span>Listener-reported · local · uncertain</span><strong id="hud-experience-title">Personal character map</strong><small>Describe this experience yourself. The map never derives emotion, liking, or familiarity from MIDI or the assumed sound model.</small></div>
    <div className="hud-experience-toolbar">
      <div><span>{specimenLabel}</span><strong>{ready ? `${captured.length} captured attacks${specimenState ? ` · ${specimenState}` : ""}` : "No phrase held yet"}</strong><small>{ready ? specimenCopy : "Play at least three attacks, then hold the latest phrase."}</small></div>
      <button type="button" disabled={latestCount < 3} onClick={onCapture}>{ready ? boundedComparison ? "Use whole live phrase" : "Use latest phrase" : "Hold latest phrase"}</button>
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
          {observations.map((observation, index) => <circle key={observation.id} cx={xFor(observation.ratings.settledness)} cy={yFor(observation.ratings.energy)} r={4 + observation.ratings.liking / 28} strokeWidth={1 + observation.ratings.familiarity / 55} className={`hud-character-point ${observation.phraseSignature === signature ? "is-same-phrase" : ""}`}><title>{`Report ${index + 1}${observation.context ? `, ${observation.context.label}` : ""}: settledness ${observation.ratings.settledness}, energy ${observation.ratings.energy}, familiarity ${observation.ratings.familiarity}, liking ${observation.ratings.liking}${observation.soundModelId ? `, assumed spectrum ${pianoSoundModel(observation.soundModelId).shortLabel}` : ""}`}</title></circle>)}
          {summary ? <circle cx={xFor(summary.center.settledness)} cy={yFor(summary.center.energy)} r="4" className="hud-character-center"><title>Center of saved reports</title></circle> : null}
          {draftPlaced ? <g className="hud-character-current"><circle cx={xFor(draft.settledness!)} cy={yFor(draft.energy!)} r="9" /><line x1={xFor(draft.settledness!) - 13} x2={xFor(draft.settledness!) + 13} y1={yFor(draft.energy!)} y2={yFor(draft.energy!)} /><line x1={xFor(draft.settledness!)} x2={xFor(draft.settledness!)} y1={yFor(draft.energy!) - 13} y2={yFor(draft.energy!) + 13} /></g> : null}
          {!observations.length && !draftPlaced ? <text x="270" y="148" className="hud-character-empty">Answer settledness and energy to place this experience</text> : null}
        </svg>
        <p>dot size = reported liking · ring weight = reported familiarity · gold = same relationship signature · ellipse = sample spread + uncertainty</p>
      </div>
      <div className="hud-character-question">
        {!ready ? <div className="hud-character-empty-state"><span>begin with your phrase</span><strong>Play, then hold at least three attacks.</strong><small>The reflection freezes a specimen so later playing cannot rewrite the experience you are rating.</small></div> : saved ? <div className="hud-character-saved" role="status"><span>saved locally</span><strong>This report is one sample, not your identity.</strong><small>Repeat the same relationship later to see whether surprise/familiarity, liking, settledness, or energy changes.</small><button type="button" onClick={onReflectAgain}>Reflect on it again</button></div> : question ? <>
          <ol className="hud-character-question-progress" aria-label="Reflection progress">{CHARACTER_QUESTIONS.map((item, index) => <li key={item.key} className={index < questionIndex ? "is-complete" : index === questionIndex ? "is-current" : ""}><span>{index < questionIndex ? "✓" : index + 1}</span><strong>{item.key === "settledness" ? "settled" : item.key}</strong></li>)}</ol>
          <div className="hud-character-prompt"><span>question {questionIndex + 1} of 4</span><strong>{questionPrompt}</strong><small>{question.low} → {question.high}</small></div>
          <div className="hud-character-choices" role="group" aria-label={questionPrompt}>{CHARACTER_VALUES.map((value, index) => <button key={value} type="button" aria-pressed={draft[question.key] === value} onClick={() => onAnswer(question.key, value)}><span>{index + 1}</span><strong>{question.choices[index]}</strong></button>)}</div>
          {questionIndex > 0 ? <button type="button" className="hud-character-back" onClick={onBack}>Change previous answer</button> : null}
        </> : <div className="hud-character-review">
          <span>your report · not a model output</span>
          <strong>Save this four-part experience?</strong>
          <div>{CHARACTER_QUESTIONS.map((item) => <p key={item.key}><span>{item.key === "settledness" ? "settled" : item.key}</span><strong>{characterChoiceLabel(item.key, draft[item.key])}</strong><small>{draft[item.key]}</small></p>)}</div>
          <button type="button" onClick={onSave}>{saveLabel}</button>
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
    <p>MIDI key numbers → 12-TET references at A4=440 · no audio analysis · pitch bend, instrument tuning, and audio pitch are not captured</p>
  </div>;
}

export function PianoLab() {
  const [events, setEvents] = useState<HudNoteEvent[]>([]);
  const [phraseEvents, setPhraseEvents] = useState<HudNoteEvent[]>([]);
  const [focusedId, setFocusedId] = useState<number | null>(null);
  const [selectedChordId, setSelectedChordId] = useState<string | null>(null);
  const [chordWindowMs, setChordWindowMs] = useState(160);
  const [boundaryCorrections, setBoundaryCorrections] = useState<Record<number, ChordBoundaryCorrection>>({});
  const [membershipCorrections, setMembershipCorrections] = useState<Record<string, number[]>>({});
  const [latchedNotes, setLatchedNotes] = useState<Map<number, number>>(new Map());
  const [showConventions, setShowConventions] = useState(false);
  const [frozen, setFrozen] = useState(false);
  const [focusLens, setFocusLens] = useState<FocusLens>("explore");
  const [sightShapesResetVersion, setSightShapesResetVersion] = useState(0);
  const isShortHudFocus = focusLens === "immersion" || focusLens === "interval-glow" || focusLens === "sight-shapes" || focusLens === "research" || focusLens === "gravity";
  const [intervalEchoTarget, setIntervalEchoTarget] = useState<IntervalEchoTarget | null>(null);
  const [ghostChord, setGhostChord] = useState<NearbyChord | null>(null);
  const [ghostNotes, setGhostNotes] = useState<number[]>([]);
  const [resolutionTarget, setResolutionTarget] = useState<ResolutionTarget | null>(null);
  const [resolutionForkSet, setResolutionForkSet] = useState<ResolutionFork[] | null>(null);
  const [landmarkPathId, setLandmarkPathId] = useState<LandmarkPathId>("pop-loop");
  const [landmarkStepIndex, setLandmarkStepIndex] = useState(0);
  const [landmarkTransposeSession, setLandmarkTransposeSession] = useState<LandmarkTransposeSession | null>(null);
  const [landmarkCounterfactualSession, setLandmarkCounterfactualSession] = useState<LandmarkCounterfactualSession | null>(null);
  const [landmarkPerformanceCapture, setLandmarkPerformanceCapture] = useState<LandmarkPerformanceCapture | null>(null);
  const [landmarkRouteCompareSession, setLandmarkRouteCompareSession] = useState<LandmarkRouteCompareSession | null>(null);
  const [soundModelId, setSoundModelId] = useState<PianoSoundModelId>(DEFAULT_PIANO_SOUND_MODEL_ID);
  const [experiencePhrase, setExperiencePhrase] = useState<HudNoteEvent[]>([]);
  const [experienceOrigin, setExperienceOrigin] = useState<ExperienceOrigin>("phrase");
  const [experienceContext, setExperienceContext] = useState<PhraseCharacterContext | null>(null);
  const [experienceDraft, setExperienceDraft] = useState<Partial<PhraseCharacterRatings>>({});
  const [experienceQuestionIndex, setExperienceQuestionIndex] = useState(0);
  const [experienceSaved, setExperienceSaved] = useState(false);
  const [phraseCharacterObservations, setPhraseCharacterObservations] = useState<PhraseCharacterObservation[]>([]);
  const [characterStorageReady, setCharacterStorageReady] = useState(false);
  const [characterDeleteArmed, setCharacterDeleteArmed] = useState(false);
  const [fingerprintRotation, setFingerprintRotation] = useState(0);
  const [scaleFingerprintSession, setScaleFingerprintSession] = useState<ScaleFingerprintSession | null>(null);
  const [scaleWalkSession, setScaleWalkSession] = useState<ScaleWalkSession | null>(null);
  const [gravityCounterfactualSession, setGravityCounterfactualSession] = useState<GravityCounterfactualSession | null>(null);
  const [controlledSonoritySession, setControlledSonoritySession] = useState<ControlledSonoritySession | null>(null);
  const [chordFocusMode, setChordFocusMode] = useState<ChordFocusMode>("change");
  const [chordVoicingEchoSession, setChordVoicingEchoSession] = useState<ChordVoicingEchoSession | null>(null);
  const [chordMotionEchoSession, setChordMotionEchoSession] = useState<ChordMotionEchoSession | null>(null);
  const [motionFocusMode, setMotionFocusMode] = useState<MotionFocusMode>("pulse");
  const [pulseMirrorSession, setPulseMirrorSession] = useState<PulseMirrorSession | null>(null);
  const [motifEchoSession, setMotifEchoSession] = useState<MotifEchoSession | null>(null);
  const [phraseCompareSession, setPhraseCompareSession] = useState<PhraseCompareSession | null>(null);
  const [frameMode, setFrameMode] = useState<FrameMode>("discover");
  const [lockedScaleId, setLockedScaleId] = useState<PianoScale["id"]>(DEFAULT_SCALE.id);
  const [lockedDoMidi, setLockedDoMidi] = useState(60);
  const [doCaptureArmed, setDoCaptureArmed] = useState(false);
  const [frameLearningAnchorId, setFrameLearningAnchorId] = useState<number | null>(null);
  const nextIdRef = useRef(1);
  const frozenRef = useRef(false);
  const doCaptureArmedRef = useRef(false);
  const frameLearningAnchorIdRef = useRef<number | null>(null);
  const applyCapturedDoRef = useRef<(pitchClass: number) => void>(() => {});
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
      const linkedParams = new URLSearchParams(window.location.search);
      const linkedLens = linkedParams.get("pianoLens") as FocusLens | null;
      const validLinkedLens = FOCUS_LENSES.some((lens) => lens.id === linkedLens) ? linkedLens : null;
      const linkedMotionMode = linkedParams.get("pianoMotion");
      const validLinkedMotionMode = isMotionFocusMode(linkedMotionMode) ? linkedMotionMode : null;
      const linkedChordMode = linkedParams.get("pianoChord");
      const validLinkedChordMode = isChordFocusMode(linkedChordMode) ? linkedChordMode : null;
      const linkedDoValue = Number(linkedParams.get("pianoDo"));
      const linkedScale = PIANO_SCALES.find((candidate) => candidate.id === linkedParams.get("pianoScale"));
      const validLinkedDo = linkedParams.has("pianoDo") && Number.isInteger(linkedDoValue) && linkedDoValue >= 0 && linkedDoValue < 12;
      if (validLinkedLens) setFocusLens(validLinkedLens);
      if (validLinkedMotionMode) setMotionFocusMode(validLinkedMotionMode);
      if (validLinkedChordMode) setChordFocusMode(validLinkedChordMode);
      try {
        const raw = window.sessionStorage.getItem(PIANO_SESSION_KEY);
        if (raw) {
          const saved = JSON.parse(raw) as PersistedPianoSession;
          if ((saved.version === 2 || saved.version === 3 || saved.version === 4 || saved.version === 5 || saved.version === 6 || saved.version === 7 || saved.version === 8 || saved.version === 9 || saved.version === 10 || saved.version === 11 || saved.version === 12 || saved.version === 13 || saved.version === 14 || saved.version === 15 || saved.version === 16 || saved.version === 17 || saved.version === 18 || saved.version === 19 || saved.version === 20 || saved.version === 21 || saved.version === 22 || saved.version === 23 || saved.version === 24 || saved.version === 25) && Array.isArray(saved.phraseEvents)) {
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
            setMembershipCorrections(saved.membershipCorrections ?? {});
            setFocusLens(validLinkedLens ?? saved.focusLens ?? "explore");
            setMotionFocusMode(validLinkedMotionMode ?? (isMotionFocusMode(saved.motionFocusMode) ? saved.motionFocusMode : "pulse"));
            setShowConventions(Boolean(saved.showConventions));
            setFrameMode(saved.frameMode ?? "discover");
            setLockedScaleId(saved.lockedScaleId ?? DEFAULT_SCALE.id);
            setLockedDoMidi(saved.lockedDoMidi ?? 60);
            setGhostChord(saved.ghostChord ?? null);
            setGhostNotes(saved.ghostNotes ?? []);
            setResolutionTarget(saved.resolutionTarget ? {
              ...saved.resolutionTarget,
              sourceEvent: saved.resolutionTarget.sourceEvent ? {
                ...saved.resolutionTarget.sourceEvent,
                onsetMs: saved.resolutionTarget.sourceEvent.onsetMs + shift,
                keyReleaseMs: saved.resolutionTarget.sourceEvent.keyReleaseMs == null ? null : saved.resolutionTarget.sourceEvent.keyReleaseMs + shift,
                releaseMs: saved.resolutionTarget.sourceEvent.releaseMs == null ? currentNow - 350 : saved.resolutionTarget.sourceEvent.releaseMs + shift,
                releaseReason: saved.resolutionTarget.sourceEvent.releaseReason ?? "key",
                fieldNotes: [...saved.resolutionTarget.sourceEvent.fieldNotes],
              } : undefined,
            } : null);
            setResolutionForkSet(saved.resolutionForkSet ?? null);
            if (LANDMARK_PATHS.some((path) => path.id === saved.landmarkPathId)) setLandmarkPathId(saved.landmarkPathId!);
            setLandmarkStepIndex(Math.max(0, Math.round(saved.landmarkStepIndex ?? 0)));
            if (saved.landmarkTransposeSession
              && LANDMARK_PATHS.some((path) => path.id === saved.landmarkTransposeSession!.pathId)
              && Number.isInteger(saved.landmarkTransposeSession.sourceRootPitchClass)
              && saved.landmarkTransposeSession.sourceRootPitchClass >= 0
              && saved.landmarkTransposeSession.sourceRootPitchClass < 12
              && Number.isInteger(saved.landmarkTransposeSession.targetRootPitchClass)
              && saved.landmarkTransposeSession.targetRootPitchClass >= 0
              && saved.landmarkTransposeSession.targetRootPitchClass < 12) setLandmarkTransposeSession(saved.landmarkTransposeSession);
            if (saved.landmarkCounterfactualSession
              && LANDMARK_PATHS.some((path) => path.id === saved.landmarkCounterfactualSession!.pathId)
              && Number.isInteger(saved.landmarkCounterfactualSession.rootPitchClass)
              && saved.landmarkCounterfactualSession.rootPitchClass >= 0
              && saved.landmarkCounterfactualSession.rootPitchClass < 12
              && (saved.landmarkCounterfactualSession.report === null || saved.landmarkCounterfactualSession.report === "source" || saved.landmarkCounterfactualSession.report === "same" || saved.landmarkCounterfactualSession.report === "changed")) setLandmarkCounterfactualSession(saved.landmarkCounterfactualSession);
            if (isLandmarkPerformanceCapture(saved.landmarkPerformanceCapture)) setLandmarkPerformanceCapture(saved.landmarkPerformanceCapture);
            if (isLandmarkRouteCompareSession(saved.landmarkRouteCompareSession)) setLandmarkRouteCompareSession(saved.landmarkRouteCompareSession);
            if (isPianoSoundModelId(saved.soundModelId)) setSoundModelId(saved.soundModelId);
            if (saved.scaleWalkSession
              && Number.isInteger(saved.scaleWalkSession.anchorEventId)
              && saved.scaleWalkSession.anchorEventId >= 0
              && Number.isInteger(saved.scaleWalkSession.rootPitchClass)
              && saved.scaleWalkSession.rootPitchClass >= 0
              && saved.scaleWalkSession.rootPitchClass < 12
              && PIANO_SCALES.some((candidate) => candidate.id === saved.scaleWalkSession!.scaleId)) {
              setScaleWalkSession(saved.scaleWalkSession);
            }
            if (isScaleFingerprintSession(saved.scaleFingerprintSession)) setScaleFingerprintSession(saved.scaleFingerprintSession);
            if (isGravityCounterfactualSession(saved.gravityCounterfactualSession)) setGravityCounterfactualSession(saved.gravityCounterfactualSession);
            if (isControlledSonoritySession(saved.controlledSonoritySession)) {
              setControlledSonoritySession({
                ...saved.controlledSonoritySession,
                replayRequired: Boolean(saved.controlledSonoritySession.baselineNotes),
              });
            }
            if (validLinkedChordMode) setChordFocusMode(validLinkedChordMode);
            else if (isChordFocusMode(saved.chordFocusMode)) setChordFocusMode(saved.chordFocusMode);
            if (isChordVoicingEchoSession(saved.chordVoicingEchoSession)) setChordVoicingEchoSession({
              ...saved.chordVoicingEchoSession,
              sourceEvents: saved.chordVoicingEchoSession.sourceEvents.map((event) => ({
                ...event,
                onsetMs: event.onsetMs + shift,
                keyReleaseMs: event.keyReleaseMs == null ? null : event.keyReleaseMs + shift,
                releaseMs: event.releaseMs == null ? currentNow - 350 : event.releaseMs + shift,
                releaseReason: event.releaseReason ?? "key",
                fieldNotes: [...event.fieldNotes],
              })),
            });
            if (isChordMotionEchoSession(saved.chordMotionEchoSession)) setChordMotionEchoSession({
              ...saved.chordMotionEchoSession,
              sourceBeforeEvents: saved.chordMotionEchoSession.sourceBeforeEvents.map((event) => ({
                ...event,
                onsetMs: event.onsetMs + shift,
                keyReleaseMs: event.keyReleaseMs == null ? null : event.keyReleaseMs + shift,
                releaseMs: event.releaseMs == null ? currentNow - 350 : event.releaseMs + shift,
                releaseReason: event.releaseReason ?? "key",
                fieldNotes: [...event.fieldNotes],
              })),
              sourceAfterEvents: saved.chordMotionEchoSession.sourceAfterEvents.map((event) => ({
                ...event,
                onsetMs: event.onsetMs + shift,
                keyReleaseMs: event.keyReleaseMs == null ? null : event.keyReleaseMs + shift,
                releaseMs: event.releaseMs == null ? currentNow - 350 : event.releaseMs + shift,
                releaseReason: event.releaseReason ?? "key",
                fieldNotes: [...event.fieldNotes],
              })),
            });
            if (isPulseMirrorSession(saved.pulseMirrorSession)) setPulseMirrorSession(saved.pulseMirrorSession);
            if (isMotifEchoSession(saved.motifEchoSession)) setMotifEchoSession({ ...saved.motifEchoSession, attempts: saved.motifEchoSession.attempts ?? [], returnReport: saved.motifEchoSession.returnReport ?? null });
            if (isPhraseCompareSession(saved.phraseCompareSession)) setPhraseCompareSession({ ...saved.phraseCompareSession, intention: saved.phraseCompareSession.intention ?? null });
          }
        }
      } catch {
        window.sessionStorage.removeItem(PIANO_SESSION_KEY);
      }
      if (validLinkedDo && linkedScale) {
        setLockedDoMidi(nearestMidiForPitchClass(linkedDoValue, 60));
        setLockedScaleId(linkedScale.id);
        setFrameMode("locked");
        setScaleWalkSession((current) => current && current.rootPitchClass === linkedDoValue && current.scaleId === linkedScale.id ? current : null);
        setControlledSonoritySession((current) => current && current.rootPitchClass === linkedDoValue && current.scaleId === linkedScale.id ? current : null);
        setChordVoicingEchoSession((current) => current && current.rootPitchClass === linkedDoValue && current.scaleId === linkedScale.id ? current : null);
        setChordMotionEchoSession((current) => current && current.rootPitchClass === linkedDoValue && current.scaleId === linkedScale.id ? current : null);
        setGravityCounterfactualSession((current) => current && current.rootPitchClass === linkedDoValue && current.scaleId === linkedScale.id ? current : null);
        setPhraseCompareSession((current) => current && current.rootPitchClass === linkedDoValue && current.scaleId === linkedScale.id ? current : null);
        setLandmarkCounterfactualSession((current) => current && current.rootPitchClass === linkedDoValue ? current : null);
        setLandmarkPerformanceCapture((current) => current && current.rootPitchClass === linkedDoValue ? current : null);
      }
      setHydrated(true);
    }, 0);
    return () => window.clearTimeout(hydrationTask);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    const session: PersistedPianoSession = { version: 25, phraseEvents, chordWindowMs, boundaryCorrections, membershipCorrections, focusLens, showConventions, frameMode, lockedScaleId, lockedDoMidi, ghostChord, ghostNotes, resolutionTarget, resolutionForkSet, landmarkPathId, landmarkStepIndex, landmarkTransposeSession, landmarkCounterfactualSession, landmarkPerformanceCapture, landmarkRouteCompareSession, soundModelId, scaleWalkSession, scaleFingerprintSession, gravityCounterfactualSession, controlledSonoritySession, chordFocusMode, chordVoicingEchoSession, chordMotionEchoSession, motionFocusMode, pulseMirrorSession, motifEchoSession, phraseCompareSession };
    try { window.sessionStorage.setItem(PIANO_SESSION_KEY, JSON.stringify(session)); } catch { /* Continue without persistence when storage is unavailable. */ }
  }, [boundaryCorrections, chordFocusMode, chordMotionEchoSession, chordVoicingEchoSession, chordWindowMs, controlledSonoritySession, focusLens, frameMode, ghostChord, ghostNotes, gravityCounterfactualSession, hydrated, landmarkCounterfactualSession, landmarkPathId, landmarkPerformanceCapture, landmarkRouteCompareSession, landmarkStepIndex, landmarkTransposeSession, lockedDoMidi, lockedScaleId, membershipCorrections, motifEchoSession, motionFocusMode, phraseCompareSession, phraseEvents, pulseMirrorSession, resolutionForkSet, resolutionTarget, scaleFingerprintSession, scaleWalkSession, showConventions, soundModelId]);

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
    const frameEvidence = frameLearningAnchorIdRef.current == null
      ? nextPhraseEvents
      : nextPhraseEvents.filter((item) => item.id > frameLearningAnchorIdRef.current!);
    const nextStable = scaleFrameTimeline(frameEvidence.map((item) => item.note)).at(-1)?.stable;
    if (nextStable) setRememberedFrame(nextStable);
    setFocusedId(event.id);
    setNowMs(atMs);
  }, []);

  const captureArmedDoAttack = useCallback((note: number) => {
    if (!doCaptureArmedRef.current) return;
    doCaptureArmedRef.current = false;
    setDoCaptureArmed(false);
    applyCapturedDoRef.current(pitchClassFromMidi(note));
  }, []);

  const midiAttack = useCallback((note: number, velocity: number, channel: number, midiField: number[], atMs: number) => {
    captureArmedDoAttack(note);
    const combined = new Set([...latchedNotes.keys(), ...midiField]);
    addEvent(note, velocity, channel, "midi", Array.from(combined), atMs);
  }, [addEvent, captureArmedDoAttack, latchedNotes]);
  const midiRelease = useCallback((note: number, channel: number, atMs: number, heldByPedal: boolean) => releaseEvent(note, channel, "midi", atMs, heldByPedal), [releaseEvent]);
  const midiSustain = useCallback((down: boolean, channel: number, atMs: number, releasedNotes: number[]) => { if (!down) releasePedalEvents(releasedNotes, channel, atMs); }, [releasePedalEvents]);
  const midi = useMidiKeyboard({ onAttack: midiAttack, onRelease: midiRelease, onSustain: midiSustain });

  const frameEvidenceEvents = useMemo(() => frameLearningAnchorId == null
    ? phraseEvents
    : phraseEvents.filter((event) => event.id > frameLearningAnchorId), [frameLearningAnchorId, phraseEvents]);
  const phraseSnapshots = useMemo(() => scaleFrameTimeline(frameEvidenceEvents.map((event) => event.note)), [frameEvidenceEvents]);
  const snapshots = phraseSnapshots.length >= events.length
    ? phraseSnapshots.slice(-events.length)
    : [...Array.from({ length: events.length - phraseSnapshots.length }, () => undefined), ...phraseSnapshots];
  const latestSnapshot = phraseSnapshots.at(-1);
  const discovered = latestSnapshot?.stable ?? rememberedFrame;
  const lockedScale = PIANO_SCALES.find((scale) => scale.id === lockedScaleId) ?? DEFAULT_SCALE;
  const frame: ScaleCandidate = frameMode === "locked"
    ? { scale: lockedScale, rootPitchClass: pitchClassFromMidi(lockedDoMidi), uniqueNoteCount: 0, inScaleCount: 0, routeCoveredCount: 0, matchFraction: 0, coverageFraction: 0, homePresent: false, fit: 0 }
    : discovered ?? { scale: DEFAULT_SCALE, rootPitchClass: 0, uniqueNoteCount: 0, inScaleCount: 0, routeCoveredCount: 0, matchFraction: 0, coverageFraction: 0, homePresent: false, fit: 0 };
  const doMidi = nearestMidiForPitchClass(frame.rootPitchClass, 60);
  const scale = frame.scale;
  const frameLearningDistinctPitchClasses = new Set(frameEvidenceEvents.map((event) => pitchClassFromMidi(event.note))).size;
  const scaleFingerprintEvents = useMemo(() => scaleFingerprintSession ? phraseEvents.filter((event) => event.id > scaleFingerprintSession.anchorEventId) : [], [phraseEvents, scaleFingerprintSession]);
  const performedScaleFingerprint = useMemo<PerformedScaleFingerprint | null>(() => scaleFingerprintSession
    ? evaluatePerformedScaleFingerprint(scaleFingerprintEvents.map((event) => event.note), scaleFingerprintSession.expectedSteps)
    : null, [scaleFingerprintEvents, scaleFingerprintSession]);
  const gravityCounterfactualResult = useMemo<TonalGravityCounterfactual | null>(() => gravityCounterfactualSession
    ? tonalGravityCounterfactual(gravityCounterfactualSession.specimen, gravityCounterfactualSession.targetPitchClass, gravityCounterfactualSession.cue, frozenSpecimenNow(gravityCounterfactualSession.specimen))
    : null, [gravityCounterfactualSession]);
  const phraseCompareLiveEvents = useMemo(() => phraseCompareSession && !phraseCompareSession.comparison
    ? phraseEvents.filter((event) => event.id > phraseCompareSession.anchorEventId).slice(-12)
    : [], [phraseCompareSession, phraseEvents]);
  const phraseLensComparison = useMemo<PhraseLensComparison | null>(() => phraseCompareSession?.comparison
    ? comparePhraseLenses(phraseCompareSession.baseline, phraseCompareSession.comparison)
    : null, [phraseCompareSession]);
  const phraseChangeReading = useMemo(() => phraseLensComparison && phraseCompareSession?.intention
    ? phraseChangeProfile(phraseLensComparison, phraseCompareSession.intention)
    : null, [phraseCompareSession, phraseLensComparison]);
  const scaleWalkScale = PIANO_SCALES.find((candidate) => candidate.id === scaleWalkSession?.scaleId) ?? scale;
  const scaleWalkEvents = useMemo(() => scaleWalkSession ? phraseEvents.filter((event) => event.id > scaleWalkSession.anchorEventId) : [], [phraseEvents, scaleWalkSession]);
  const scaleWalkProgress = useMemo<AscendingScaleWalk | null>(() => scaleWalkSession
    ? evaluateAscendingScaleWalk(scaleWalkEvents.map((event) => event.note), scaleWalkSession.rootPitchClass, scaleWalkScale)
    : null, [scaleWalkEvents, scaleWalkScale, scaleWalkSession]);
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
  const landmarkCounterfactualActive = landmarkCounterfactualSession?.pathId === landmarkPath.id && landmarkCounterfactualSession.rootPitchClass === pitchClassFromMidi(doMidi);
  const landmarkPerformanceVariant: PhraseCharacterContext["variant"] = landmarkCounterfactualActive
    ? "one-key-changed"
    : landmarkTransposeSession?.pathId === landmarkPath.id
      ? "transposed"
      : "original";
  const landmarkVoicings = useMemo(() => landmarkCounterfactualActive ? voiceLandmarkCounterfactual(landmarkPath, doMidi) : voiceLandmarkPath(landmarkPath, doMidi), [doMidi, landmarkCounterfactualActive, landmarkPath]);
  const landmarkTargetNotes = useMemo(() => landmarkVoicings[effectiveLandmarkStepIndex] ?? [], [effectiveLandmarkStepIndex, landmarkVoicings]);
  const landmarkReflectionSpecimen = useMemo(() => {
    if (effectiveLandmarkStepIndex < landmarkPath.steps.length
      || landmarkPerformanceCapture?.pathId !== landmarkPath.id
      || landmarkPerformanceCapture.rootPitchClass !== pitchClassFromMidi(doMidi)
      || landmarkPerformanceCapture.variant !== landmarkPerformanceVariant) return null;
    const eventIds = landmarkPerformanceEventIds(landmarkPerformanceCapture.fieldEventIds, landmarkPath.steps.length);
    if (!eventIds) return null;
    const byId = new Map(phraseEvents.map((event) => [event.id, event]));
    const specimen = eventIds.map((id) => byId.get(id)).filter((event): event is HudNoteEvent => Boolean(event));
    return specimen.length === eventIds.length ? specimen : null;
  }, [doMidi, effectiveLandmarkStepIndex, landmarkPath, landmarkPerformanceCapture, landmarkPerformanceVariant, phraseEvents]);
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
  const gravityCandidates = useMemo(() => isShortHudFocus
    ? []
    : tonalGravityCandidates(phraseEvents, nowMs || phraseEvents.at(-1)?.onsetMs || 0, 12), [isShortHudFocus, nowMs, phraseEvents]);
  const nextNoteForks = useMemo(() => focusLens === "scales"
    ? resolutionForks(phraseEvents, frame.rootPitchClass, scale, 4)
    : [], [focusLens, frame.rootPitchClass, phraseEvents, scale]);
  const articulationEvidence = useMemo(() => focusLens === "motion"
    ? articulationTimeline(phraseEvents, nowMs || phraseEvents.at(-1)?.onsetMs || 0)
    : [], [focusLens, nowMs, phraseEvents]);
  const motifTransformations = useMemo(() => detectMotifTransformations(phraseEvents, 3), [phraseEvents]);
  const immersionHistoryEvents = useMemo(() => immersionHistory(phraseEvents), [phraseEvents]);
  const immersionMotifs = useMemo(() => detectMotifTransformations(immersionHistoryEvents, 3), [immersionHistoryEvents]);
  const motifEchoAttempt = useMemo(() => motifEchoSession
    ? phraseEvents.filter((event) => event.id > motifEchoSession.anchorEventId).slice(0, motifEchoSession.sourceEvents.length)
    : [], [motifEchoSession, phraseEvents]);
  const motifEchoComparison = useMemo(() => motifEchoSession && motifEchoAttempt.length === motifEchoSession.sourceEvents.length
    ? compareMotifEcho(motifEchoSession.sourceEvents, motifEchoAttempt)
    : null, [motifEchoAttempt, motifEchoSession]);
  const pulseMirrorModel = useMemo(() => pulseMirrorSession ? livePulseMirror(phraseEvents, pulseMirrorSession.anchorEventId) : null, [phraseEvents, pulseMirrorSession]);
  const pulseMirrorExpired = Boolean(pulseMirrorSession?.capturedTapEventIds.length && pulseMirrorSession.capturedTapEventIds.some((id) => !phraseEvents.some((event) => event.id === id)));
  useEffect(() => {
    if (!pulseMirrorSession || pulseMirrorSession.capturedTapEventIds.length || pulseMirrorModel?.status !== "tracking") return;
    const capturedTapEventIds = pulseMirrorModel.tapEvents.map((event) => event.id);
    const timer = window.setTimeout(() => setPulseMirrorSession((current) => current && !current.capturedTapEventIds.length ? { ...current, capturedTapEventIds } : current), 0);
    return () => window.clearTimeout(timer);
  }, [pulseMirrorModel, pulseMirrorSession]);
  const chordGestures = useMemo(() => groupChordGestures(events, chordWindowMs, chordWindowMs * 2, boundaryCorrections), [boundaryCorrections, chordWindowMs, events]);
  const chordMeasures = useMemo(() => measureChordGestures(
    chordGestures,
    membershipCorrections,
    doMidi,
    scale,
    soundModelId,
    isShortHudFocus ? IMMERSION_MAX_FIELD_NOTES : Number.POSITIVE_INFINITY,
  ), [chordGestures, doMidi, isShortHudFocus, membershipCorrections, scale, soundModelId]);
  const immersionChordGestures = useMemo(() => groupChordGestures(immersionHistoryEvents, chordWindowMs, chordWindowMs * 2, boundaryCorrections), [boundaryCorrections, chordWindowMs, immersionHistoryEvents]);
  const immersionChordMeasures = useMemo(() => measureChordGestures(immersionChordGestures, membershipCorrections, doMidi, scale, soundModelId, IMMERSION_MAX_FIELD_NOTES).slice(-4), [doMidi, immersionChordGestures, membershipCorrections, scale, soundModelId]);
  const selectedChordMeasure = chordMeasures.find((measure) => measure.gesture.id === selectedChordId) ?? chordMeasures.at(-1) ?? null;
  const effectiveSelectedChordId = selectedChordMeasure?.gesture.id ?? null;
  const selectedGesture = selectedChordMeasure?.gesture ?? null;
  const chordVoicingEchoSourceEvents = useMemo(() => chordVoicingEchoSession
    ? chordVoicingEchoSession.sourceEvents.map((source) => phraseEvents.find((event) => event.id === source.id) ?? source)
    : [], [chordVoicingEchoSession, phraseEvents]);
  const chordVoicingEchoAttempt = chordVoicingEchoSession
    ? chordMeasures.filter((measure) => measure.gesture.attacks.every((attack) => attack.id > chordVoicingEchoSession.anchorEventId)).at(-1) ?? null
    : null;
  const chordVoicingEchoComparison = chordVoicingEchoSession && chordVoicingEchoAttempt
    ? compareChordVoicingEcho(chordVoicingEchoSession.sourceNotes, chordVoicingEchoAttempt.interpretedNotes)
    : null;
  const chordMotionEchoSourceBeforeEvents = useMemo(() => chordMotionEchoSession
    ? chordMotionEchoSession.sourceBeforeEvents.map((source) => phraseEvents.find((event) => event.id === source.id) ?? source)
    : [], [chordMotionEchoSession, phraseEvents]);
  const chordMotionEchoSourceAfterEvents = useMemo(() => chordMotionEchoSession
    ? chordMotionEchoSession.sourceAfterEvents.map((source) => phraseEvents.find((event) => event.id === source.id) ?? source)
    : [], [chordMotionEchoSession, phraseEvents]);
  const chordMotionEchoCandidates = useMemo(() => {
    if (!chordMotionEchoSession) return [];
    return groupChordGestures(
      phraseEvents.filter((event) => event.id > chordMotionEchoSession.attemptAnchorEventId),
      chordWindowMs,
      chordWindowMs * 2,
      boundaryCorrections,
    ).map((gesture) => ({
      gesture,
      notes: uniqueSorted(interpretedChordNotes(gesture, membershipCorrections[gesture.id] ?? [])),
    })).filter(({ gesture, notes }) => gesture.attacks.length >= 2
      && notes.length >= 2
      && notes.length <= 6
      && new Set(notes.map(pitchClassFromMidi)).size >= 2)
      .slice(0, 2);
  }, [boundaryCorrections, chordMotionEchoSession, chordWindowMs, membershipCorrections, phraseEvents]);
  const chordMotionEchoAttempt: ChordMotionEchoAttempt | null = chordMotionEchoCandidates.length === 2 ? {
    beforeGesture: chordMotionEchoCandidates[0].gesture,
    afterGesture: chordMotionEchoCandidates[1].gesture,
    beforeNotes: chordMotionEchoCandidates[0].notes,
    afterNotes: chordMotionEchoCandidates[1].notes,
  } : null;
  const chordMotionEchoComparison = chordMotionEchoSession && chordMotionEchoAttempt
    ? compareChordMotionEcho(
      chordMotionEchoSession.sourceBeforeNotes,
      chordMotionEchoSession.sourceAfterNotes,
      chordMotionEchoAttempt.beforeNotes,
      chordMotionEchoAttempt.afterNotes,
    )
    : null;

  const activeNotesMap = useMemo(() => {
    const combined = new Map(latchedNotes);
    midi.notes.forEach((velocity, note) => combined.set(note, velocity));
    return combined;
  }, [latchedNotes, midi.notes]);
  const activeNoteNumbers = useMemo(() => uniqueSorted(Array.from(activeNotesMap.keys())), [activeNotesMap]);
  const immersionTimeBucket = activeNoteNumbers.length ? Math.floor(nowMs / 500) : 0;
  const immersionGravityCandidates = useMemo(() => {
    const latestEvidenceMs = immersionHistoryEvents.reduce((latest, event) => Math.max(latest, event.releaseMs ?? event.keyReleaseMs ?? event.onsetMs), immersionHistoryEvents.at(-1)?.onsetMs ?? 0);
    const observationMs = immersionTimeBucket ? Math.max(latestEvidenceMs, immersionTimeBucket * 500) : latestEvidenceMs;
    return tonalGravityCandidates(immersionHistoryEvents, observationMs, 3);
  }, [immersionHistoryEvents, immersionTimeBucket]);
  const immersionActiveNotes = useMemo(() => activeNoteNumbers.map((note) => ({
    note,
    velocity: activeNotesMap.get(note) ?? 0,
    pressed: midi.pressed.has(note),
    sustained: midi.sustained.has(note),
  })), [activeNoteNumbers, activeNotesMap, midi.pressed, midi.sustained]);
  const immersionLatestOnsetMs = phraseEvents.at(-1)?.onsetMs ?? 0;
  const immersionNearbyReady = Boolean(phraseEvents.length && nowMs - immersionLatestOnsetMs >= 420);
  useEffect(() => {
    if (!phraseEvents.length) return;
    if (!isShortHudFocus) {
      const interval = window.setInterval(() => setNowMs(currentHudTime()), 120);
      return () => window.clearInterval(interval);
    }
    if (activeNoteNumbers.length) {
      const interval = window.setInterval(() => setNowMs(currentHudTime()), 500);
      return () => window.clearInterval(interval);
    }
    if (immersionNearbyReady) return;
    const remainingMs = Math.max(16, immersionLatestOnsetMs + 420 - currentHudTime() + 16);
    const timeout = window.setTimeout(() => setNowMs(currentHudTime()), remainingMs);
    return () => window.clearTimeout(timeout);
  }, [activeNoteNumbers.length, immersionLatestOnsetMs, immersionNearbyReady, isShortHudFocus, phraseEvents.length]);
  useEffect(() => {
    if (focusLens !== "chords" || chordFocusMode !== "cause" || !controlledSonoritySession || controlledSonoritySession.baselineNotes || !controlledSonoritySession.targetNotes.length) return;
    if (!sameMidiNotes(activeNoteNumbers, controlledSonoritySession.targetNotes)) return;
    const timer = window.setTimeout(() => setControlledSonoritySession((current) => current && !current.baselineNotes ? { ...current, baselineNotes: [...current.targetNotes], replayRequired: false } : current), 0);
    return () => window.clearTimeout(timer);
  }, [activeNoteNumbers, chordFocusMode, controlledSonoritySession, focusLens]);
  useEffect(() => {
    if (focusLens !== "chords" || chordFocusMode !== "cause" || !controlledSonoritySession?.baselineNotes) return;
    const baselineNotes = controlledSonoritySession.baselineNotes;
    const shouldRequireReplay = activeNoteNumbers.length === 0 && !controlledSonoritySession.replayRequired;
    const baselineRestored = controlledSonoritySession.replayRequired && sameMidiNotes(activeNoteNumbers, baselineNotes);
    if (!shouldRequireReplay && !baselineRestored) return;
    const timer = window.setTimeout(() => setControlledSonoritySession((current) => current?.baselineNotes ? {
      ...current,
      replayRequired: shouldRequireReplay,
    } : current), 0);
    return () => window.clearTimeout(timer);
  }, [activeNoteNumbers, chordFocusMode, controlledSonoritySession, focusLens]);
  useEffect(() => {
    if (focusLens !== "paths" || !landmarkTargetNotes.length || !activeNoteNumbers.length) return;
    const latestEventId = phraseEvents.at(-1)?.id ?? 0;
    if (latestEventId <= landmarkLastMatchIdRef.current) return;
    if (!samePitchClasses(activeNoteNumbers, landmarkTargetNotes)) return;
    const matchedEventIds = activeNoteNumbers.map((note) => phraseEvents.findLast((event) => event.note === note)?.id ?? 0);
    if (matchedEventIds.some((id) => id <= 0) || new Set(matchedEventIds).size !== matchedEventIds.length) return;
    landmarkLastMatchIdRef.current = latestEventId;
    const timer = window.setTimeout(() => {
      setLandmarkPerformanceCapture((current) => {
        const compatible = current
          && current.pathId === landmarkPath.id
          && current.rootPitchClass === pitchClassFromMidi(doMidi)
          && current.variant === landmarkPerformanceVariant
          && current.fieldEventIds.length === effectiveLandmarkStepIndex;
        const fieldEventIds = compatible ? current.fieldEventIds : [];
        return {
          pathId: landmarkPath.id,
          rootPitchClass: pitchClassFromMidi(doMidi),
          variant: landmarkPerformanceVariant,
          fieldEventIds: [...fieldEventIds, matchedEventIds],
        };
      });
      setLandmarkStepIndex((current) => Math.min(landmarkPath.steps.length, current + 1));
    }, 0);
    return () => window.clearTimeout(timer);
  }, [activeNoteNumbers, doMidi, effectiveLandmarkStepIndex, focusLens, landmarkPath.id, landmarkPath.steps.length, landmarkPerformanceVariant, landmarkTargetNotes, phraseEvents]);
  const lastField = events.at(-1)?.fieldNotes ?? [];
  const fieldNotes = activeNoteNumbers.length ? activeNoteNumbers : lastField;
  const fieldIsLive = activeNoteNumbers.length > 0;
  const analysisNotes = selectedChordMeasure?.interpretedNotes ?? fieldNotes;
  const soundingAnalysisNotes = selectedChordMeasure?.audibleNotes ?? analysisNotes;
  const soundingSemitoneProfile = semitoneFieldProfile(soundingAnalysisNotes, doMidi);
  const liveFieldMatchesDisplayed = fieldIsLive && sameMidiNotes(activeNoteNumbers, soundingAnalysisNotes);
  const liveHeldPerception = selectedChordMeasure?.crunch == null
    && liveFieldMatchesDisplayed
    && soundingAnalysisNotes.length >= 2
    && soundingAnalysisNotes.length <= IMMERSION_MAX_FIELD_NOTES
    ? sonorityPerceptionModel(soundingAnalysisNotes.map((note) => pianoSoundVoice(frequencyFromMidi(note), 0.72, soundModelId)))
    : null;
  const chordCrunchReading = selectedChordMeasure?.crunch ?? liveHeldPerception?.roughness ?? null;
  const chordCrunchPaused = selectedChordMeasure?.crunch == null && liveFieldMatchesDisplayed && soundingAnalysisNotes.length > IMMERSION_MAX_FIELD_NOTES;
  const inheritedAnalysisNotes = selectedGesture?.inheritedNotes ?? [];
  const excludedInheritedNotes = selectedChordMeasure?.excludedInheritedNotes ?? [];
  const fieldPitchClassCount = new Set(analysisNotes.map((note) => pitchClassFromMidi(note))).size;
  const chordCandidates = identifyChordCandidates(analysisNotes, 3);
  const nearby = analysisNotes.length ? nearbyScaleChords(analysisNotes, doMidi, scale, 3) : [];
  const ghostAttemptNotes = activeNoteNumbers.length ? activeNoteNumbers : chordMeasures.at(-1)?.interpretedNotes ?? [];
  const ghostMatched = ghostChord ? samePitchClasses(ghostAttemptNotes, ghostChord.pitchClasses) : false;
  const resolutionEvidenceEvents = resolutionTarget?.sourceEvent && !phraseEvents.some((event) => event.id === resolutionTarget.sourceEvent!.id)
    ? [resolutionTarget.sourceEvent, ...phraseEvents]
    : phraseEvents;
  const resolutionLanding = resolutionTarget ? resolutionLandingEvidence(resolutionEvidenceEvents, resolutionTarget.anchorEventId, resolutionTarget.pitchClass) : null;
  const resolutionMatched = resolutionLanding != null;
  const controlledSonorityComparison = controlledSonoritySession?.baselineNotes ? controlledSonorityChange(controlledSonoritySession.baselineNotes, activeNoteNumbers) : null;
  const focusedEvent = events.find((event) => event.id === focusedId) ?? events.at(-1) ?? null;

  const measures = useMemo<EventMeasure[]>(() => events.map((event, index) => {
    const notes = uniqueSorted(event.fieldNotes);
    const maximumPerceptionNotes = isShortHudFocus ? IMMERSION_MAX_FIELD_NOTES : Number.POSITIVE_INFINITY;
    const perception = notes.length >= 2 && notes.length <= maximumPerceptionNotes
      ? sonorityPerceptionModel(notes.map((note) => pianoSoundVoice(frequencyFromMidi(note), Math.max(0.12, (note === event.note ? event.velocity : 88) / 127), soundModelId)))
      : null;
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
  }), [doMidi, events, isShortHudFocus, scale, soundModelId]);

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
      captureArmedDoAttack(note);
      next.set(note, 104);
      const combined = new Set([...next.keys(), ...midi.notes.keys()]);
      addEvent(note, 104, 0, "screen", Array.from(combined));
    }
    setLatchedNotes(next);
  };

  const clearAll = () => {
    doCaptureArmedRef.current = false;
    setDoCaptureArmed(false);
    frameLearningAnchorIdRef.current = null;
    setFrameLearningAnchorId(null);
    phraseEventsRef.current = [];
    setPhraseEvents([]);
    eventsRef.current = [];
    setEvents([]);
    setFocusedId(null);
    setSelectedChordId(null);
    setRememberedFrame(null);
    setBoundaryCorrections({});
    setMembershipCorrections({});
    setIntervalEchoTarget(null);
    setGhostChord(null);
    setGhostNotes([]);
    setResolutionTarget(null);
    setResolutionForkSet(null);
    setLandmarkStepIndex(0);
    setLandmarkTransposeSession(null);
    setLandmarkCounterfactualSession(null);
    setLandmarkPerformanceCapture(null);
    setLandmarkRouteCompareSession(null);
    landmarkLastMatchIdRef.current = 0;
    setExperienceOrigin("phrase");
    setExperienceContext(null);
    setExperiencePhrase([]);
    setExperienceDraft({});
    setExperienceQuestionIndex(0);
    setExperienceSaved(false);
    setCharacterDeleteArmed(false);
    setFingerprintRotation(0);
    setScaleFingerprintSession(null);
    setScaleWalkSession(null);
    setGravityCounterfactualSession(null);
    setControlledSonoritySession(null);
    setChordVoicingEchoSession(null);
    setChordMotionEchoSession(null);
    setPulseMirrorSession(null);
    setMotifEchoSession(null);
    setPhraseCompareSession(null);
    setSightShapesResetVersion((current) => current + 1);
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
    setMembershipCorrections({});
    setSelectedChordId(null);
  };

  const toggleInheritedMembership = (gestureId: string, note: number) => {
    setMembershipCorrections((current) => {
      const excluded = new Set(current[gestureId] ?? []);
      if (excluded.has(note)) excluded.delete(note);
      else excluded.add(note);
      const next = { ...current };
      if (excluded.size) next[gestureId] = [...excluded].sort((first, second) => first - second);
      else delete next[gestureId];
      return next;
    });
  };

  const lockCandidate = (candidate: ScaleCandidate) => {
    doCaptureArmedRef.current = false;
    setDoCaptureArmed(false);
    frameLearningAnchorIdRef.current = null;
    setFrameLearningAnchorId(null);
    setScaleWalkSession(null);
    setControlledSonoritySession(null);
    setChordVoicingEchoSession(null);
    setChordMotionEchoSession(null);
    setResolutionTarget(null);
    setResolutionForkSet(null);
    setLockedScaleId(candidate.scale.id);
    setLockedDoMidi(nearestMidiForPitchClass(candidate.rootPitchClass, 60));
    setFrameMode("locked");
    const url = new URL(window.location.href);
    url.searchParams.set("pianoDo", String(candidate.rootPitchClass));
    url.searchParams.set("pianoScale", candidate.scale.id);
    window.history.replaceState(null, "", url);
  };

  const selectScaleRoute = (scaleId: PianoScale["id"]) => {
    const nextScale = PIANO_SCALES.find((candidate) => candidate.id === scaleId);
    if (!nextScale) return;
    lockCandidate({
      ...frame,
      scale: nextScale,
      rootPitchClass: pitchClassFromMidi(doMidi),
    });
  };

  const chooseDoFromFifths = useCallback((rootPitchClass: number) => {
    const pitchClass = pitchClassFromMidi(rootPitchClass);
    const currentPitchClass = pitchClassFromMidi(doMidi);
    doCaptureArmedRef.current = false;
    setDoCaptureArmed(false);
    frameLearningAnchorIdRef.current = null;
    setFrameLearningAnchorId(null);
    setScaleWalkSession(null);
    setControlledSonoritySession(null);
    setChordVoicingEchoSession(null);
    setChordMotionEchoSession(null);
    setResolutionTarget(null);
    setResolutionForkSet(null);
    setGhostChord(null);
    setGhostNotes([]);
    setLockedScaleId(scale.id);
    setLockedDoMidi(nearestMidiForPitchClass(pitchClass, 60));
    setFrameMode("locked");
    if (focusLens === "paths" && pitchClass !== currentPitchClass) {
      setLandmarkTransposeSession({ pathId: landmarkPath.id, sourceRootPitchClass: currentPitchClass, targetRootPitchClass: pitchClass });
      setLandmarkCounterfactualSession(null);
      setLandmarkStepIndex(0);
      landmarkLastMatchIdRef.current = phraseEvents.at(-1)?.id ?? 0;
    }
    const url = new URL(window.location.href);
    url.searchParams.set("pianoDo", String(pitchClass));
    url.searchParams.set("pianoScale", scale.id);
    window.history.replaceState(null, "", url);
  }, [doMidi, focusLens, landmarkPath.id, phraseEvents, scale.id]);

  const applyCapturedDo = useCallback((pitchClass: number) => {
    setScaleFingerprintSession(null);
    setGravityCounterfactualSession(null);
    setPhraseCompareSession(null);
    setLandmarkRouteCompareSession(null);
    chooseDoFromFifths(pitchClass);
  }, [chooseDoFromFifths]);

  useEffect(() => { applyCapturedDoRef.current = applyCapturedDo; }, [applyCapturedDo]);

  const toggleDoCapture = () => {
    const next = !doCaptureArmedRef.current;
    doCaptureArmedRef.current = next;
    setDoCaptureArmed(next);
    if (next) {
      frameLearningAnchorIdRef.current = null;
      setFrameLearningAnchorId(null);
    }
  };

  const resetFrameFromPlaying = () => {
    const anchorId = phraseEvents.at(-1)?.id ?? 0;
    doCaptureArmedRef.current = false;
    setDoCaptureArmed(false);
    frameLearningAnchorIdRef.current = anchorId;
    setFrameLearningAnchorId(anchorId);
    setRememberedFrame({ ...frame });
    setScaleWalkSession(null);
    setControlledSonoritySession(null);
    setResolutionTarget(null);
    setResolutionForkSet(null);
    setFrameMode("discover");
    const url = new URL(window.location.href);
    url.searchParams.delete("pianoDo");
    url.searchParams.delete("pianoScale");
    window.history.replaceState(null, "", url);
  };

  const toggleFrameMode = () => {
    frameLearningAnchorIdRef.current = null;
    setFrameLearningAnchorId(null);
    setScaleWalkSession(null);
    setControlledSonoritySession(null);
    setResolutionTarget(null);
    setResolutionForkSet(null);
    if (frameMode === "discover") {
      setLockedScaleId(scale.id);
      setLockedDoMidi(doMidi);
      setFrameMode("locked");
      const url = new URL(window.location.href);
      url.searchParams.set("pianoDo", String(pitchClassFromMidi(doMidi)));
      url.searchParams.set("pianoScale", scale.id);
      window.history.replaceState(null, "", url);
    } else {
      setFrameMode("discover");
      const url = new URL(window.location.href);
      url.searchParams.delete("pianoDo");
      url.searchParams.delete("pianoScale");
      window.history.replaceState(null, "", url);
    }
  };

  const beginPhraseCompare = (intention: PhraseChangeIntention) => {
    const source = latestReplayablePhrase(phraseEvents);
    if (source.length < 3) return;
    const rootPitchClass = pitchClassFromMidi(doMidi);
    setScaleWalkSession(null);
    setScaleFingerprintSession(null);
    setGravityCounterfactualSession(null);
    setControlledSonoritySession(null);
    setPulseMirrorSession(null);
    setResolutionTarget(null);
    setResolutionForkSet(null);
    setGhostChord(null);
    setGhostNotes([]);
    setLockedScaleId(scale.id);
    setLockedDoMidi(doMidi);
    setFrameMode("locked");
    setFocusLens("explore");
    setPhraseCompareSession({
      baseline: freezePhraseSpecimen(source, currentHudTime()),
      anchorEventId: phraseEvents.at(-1)?.id ?? 0,
      comparison: null,
      intention,
      rootPitchClass,
      scaleId: scale.id,
      reports: {},
    });
    const url = new URL(window.location.href);
    url.searchParams.set("pianoLens", "explore");
    url.searchParams.set("pianoDo", String(rootPitchClass));
    url.searchParams.set("pianoScale", scale.id);
    window.history.replaceState(null, "", url);
  };

  const capturePhraseCompareReplay = () => {
    if (!phraseCompareSession || phraseCompareLiveEvents.length < 3) return;
    setPhraseCompareSession({
      ...phraseCompareSession,
      comparison: freezePhraseSpecimen(phraseCompareLiveEvents, currentHudTime()),
      reports: {},
    });
  };

  const replayPhraseCompare = () => {
    setPhraseCompareSession((current) => current ? {
      ...current,
      anchorEventId: phraseEvents.at(-1)?.id ?? 0,
      comparison: null,
      reports: {},
    } : current);
  };

  const promotePhraseCompareReplay = () => {
    setPhraseCompareSession((current) => current?.comparison ? {
      ...current,
      baseline: current.comparison,
      anchorEventId: phraseEvents.at(-1)?.id ?? 0,
      comparison: null,
      reports: {},
    } : current);
  };

  const reportPhraseCompare = (dimension: PhraseCompareDimension, report: PhraseCompareReport) => {
    setPhraseCompareSession((current) => current?.comparison ? {
      ...current,
      reports: { ...current.reports, [dimension]: report },
    } : current);
  };

  const beginScaleWalk = () => {
    const rootPitchClass = pitchClassFromMidi(doMidi);
    setResolutionTarget(null);
    setResolutionForkSet(null);
    setGhostChord(null);
    setGhostNotes([]);
    setFingerprintRotation(0);
    setControlledSonoritySession(null);
    setScaleFingerprintSession(null);
    setGravityCounterfactualSession(null);
    setLockedScaleId(scale.id);
    setLockedDoMidi(doMidi);
    setFrameMode("locked");
    setScaleWalkSession({ anchorEventId: phraseEvents.at(-1)?.id ?? 0, rootPitchClass, scaleId: scale.id });
    const url = new URL(window.location.href);
    url.searchParams.set("pianoDo", String(rootPitchClass));
    url.searchParams.set("pianoScale", scale.id);
    window.history.replaceState(null, "", url);
  };

  const restartScaleWalk = () => {
    if (!scaleWalkSession) return;
    setScaleWalkSession({ ...scaleWalkSession, anchorEventId: phraseEvents.at(-1)?.id ?? 0 });
  };

  const beginScaleFingerprint = () => {
    setScaleWalkSession(null);
    setGravityCounterfactualSession(null);
    setResolutionTarget(null);
    setResolutionForkSet(null);
    setGhostChord(null);
    setGhostNotes([]);
    setScaleFingerprintSession({ anchorEventId: phraseEvents.at(-1)?.id ?? 0, exercise: "build", sourceSteps: null, expectedSteps: null, revealNames: false, sourceBaseMidi: null });
  };

  const restartScaleFingerprint = () => {
    setScaleFingerprintSession((current) => current ? { ...current, anchorEventId: phraseEvents.at(-1)?.id ?? 0, revealNames: false } : current);
  };

  const replayScaleFingerprint = (steps: number[], exercise: "transpose" | "rotate" | "mutate") => {
    const sourceSteps = exercise === "mutate" ? steps : scaleFingerprintSession?.sourceSteps ?? performedScaleFingerprint?.steps ?? steps;
    const sourceBaseMidi = exercise === "mutate"
      ? performedScaleFingerprint?.baseMidi ?? scaleFingerprintSession?.sourceBaseMidi ?? null
      : scaleFingerprintSession?.sourceBaseMidi ?? performedScaleFingerprint?.baseMidi ?? null;
    setScaleWalkSession(null);
    setScaleFingerprintSession({ anchorEventId: phraseEvents.at(-1)?.id ?? 0, exercise, sourceSteps: [...sourceSteps], expectedSteps: exercise === "mutate" ? null : [...steps], revealNames: false, sourceBaseMidi });
  };

  const revealScaleFingerprint = () => {
    setScaleFingerprintSession((current) => current ? { ...current, revealNames: true } : current);
  };

  const captureGravityCounterfactual = () => {
    if (phraseEvents.length < 3) return;
    const specimen = freezeGravitySpecimen(phraseEvents, currentHudTime());
    const specimenNow = frozenSpecimenNow(specimen);
    const observed = new Set(specimen.map((event) => pitchClassFromMidi(event.note)));
    const targetPitchClass = tonalGravityCandidates(specimen, specimenNow, 12)
      .filter((candidate) => observed.has(candidate.rootPitchClass))
      .sort((first, second) => first.components.ending - second.components.ending || first.score - second.score || first.rootPitchClass - second.rootPitchClass)[0]?.rootPitchClass
      ?? pitchClassFromMidi(specimen.at(-1)!.note);
    setScaleWalkSession(null);
    setScaleFingerprintSession(null);
    setResolutionTarget(null);
    setResolutionForkSet(null);
    setGhostChord(null);
    setGhostNotes([]);
    setLockedScaleId(scale.id);
    setLockedDoMidi(doMidi);
    setFrameMode("locked");
    setGravityCounterfactualSession({ specimen, targetPitchClass, cue: "ending", rootPitchClass: pitchClassFromMidi(doMidi), scaleId: scale.id });
    const url = new URL(window.location.href);
    url.searchParams.set("pianoDo", String(pitchClassFromMidi(doMidi)));
    url.searchParams.set("pianoScale", scale.id);
    window.history.replaceState(null, "", url);
  };

  const targetGravityCounterfactual = (targetPitchClass: number) => {
    setGravityCounterfactualSession((current) => current && current.specimen.some((event) => pitchClassFromMidi(event.note) === pitchClassFromMidi(targetPitchClass)) ? { ...current, targetPitchClass: pitchClassFromMidi(targetPitchClass) } : current);
  };

  const cueGravityCounterfactual = (cue: TonalGravityCue) => {
    setGravityCounterfactualSession((current) => current ? { ...current, cue } : current);
  };

  const beginControlledSonority = (recipeId: ControlledSonorityFieldId) => {
    const recipe = CONTROLLED_SONORITY_FIELDS.find((field) => field.id === recipeId);
    if (!recipe) return;
    const rootPitchClass = pitchClassFromMidi(doMidi);
    setScaleWalkSession(null);
    setScaleFingerprintSession(null);
    setGravityCounterfactualSession(null);
    setResolutionTarget(null);
    setResolutionForkSet(null);
    setGhostChord(null);
    setGhostNotes([]);
    setLockedScaleId(scale.id);
    setLockedDoMidi(doMidi);
    setFrameMode("locked");
    setControlledSonoritySession({ recipeId, rootPitchClass, scaleId: scale.id, targetNotes: recipe.offsets.map((offset) => doMidi + offset), baselineNotes: null, replayRequired: false });
    const url = new URL(window.location.href);
    url.searchParams.set("pianoDo", String(rootPitchClass));
    url.searchParams.set("pianoScale", scale.id);
    window.history.replaceState(null, "", url);
  };

  const captureCurrentSonority = () => {
    if (activeNoteNumbers.length < 2) return;
    const rootPitchClass = pitchClassFromMidi(doMidi);
    setScaleWalkSession(null);
    setScaleFingerprintSession(null);
    setGravityCounterfactualSession(null);
    setResolutionTarget(null);
    setResolutionForkSet(null);
    setGhostChord(null);
    setGhostNotes([]);
    setLockedScaleId(scale.id);
    setLockedDoMidi(doMidi);
    setFrameMode("locked");
    setControlledSonoritySession({ recipeId: "live", rootPitchClass, scaleId: scale.id, targetNotes: [], baselineNotes: [...activeNoteNumbers], replayRequired: false });
  };

  const replaceControlledSonorityBaseline = () => {
    if (activeNoteNumbers.length < 2) return;
    setControlledSonoritySession((current) => current ? { ...current, recipeId: "live", targetNotes: [], baselineNotes: [...activeNoteNumbers], replayRequired: false } : current);
  };

  const restartControlledSonority = () => {
    setControlledSonoritySession((current) => current && current.recipeId !== "live" ? { ...current, baselineNotes: null, replayRequired: false } : current);
  };

  const captureExperiencePhrase = () => {
    setExperienceOrigin("phrase");
    setExperienceContext(null);
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
      context: experienceContext ?? undefined,
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
    if (lens !== "explore") setPhraseCompareSession(null);
    if (lens === "paths") {
      setScaleWalkSession(null);
      setScaleFingerprintSession(null);
      setGravityCounterfactualSession(null);
      setControlledSonoritySession(null);
      setLockedScaleId(scale.id);
      setLockedDoMidi(doMidi);
      setFrameMode("locked");
      setGhostChord(null);
      setGhostNotes([]);
      setResolutionTarget(null);
      setResolutionForkSet(null);
      landmarkLastMatchIdRef.current = phraseEvents.at(-1)?.id ?? 0;
    }
    if (lens === "experience" && (experienceOrigin === "phrase" || experiencePhrase.length < 3)) captureExperiencePhrase();
    setFocusLens(lens);
    const url = new URL(window.location.href);
    url.searchParams.set("pianoLens", lens);
    if (lens === "motion") url.searchParams.set("pianoMotion", motionFocusMode);
    else url.searchParams.delete("pianoMotion");
    if (lens === "chords") url.searchParams.set("pianoChord", chordFocusMode);
    else url.searchParams.delete("pianoChord");
    window.history.replaceState(null, "", url);
  };

  const holdBoundedExperienceSpecimen = (origin: Exclude<ExperienceOrigin, "phrase">, specimen: HudNoteEvent[], context: PhraseCharacterContext | null = null) => {
    const uniqueSpecimen = [...new Map(specimen.map((event) => [event.id, event])).values()]
      .sort((first, second) => first.onsetMs - second.onsetMs || first.id - second.id);
    setPhraseCompareSession(null);
    setExperienceOrigin(origin);
    setExperienceContext(context);
    setExperiencePhrase(uniqueSpecimen.map((event) => ({ ...event, fieldNotes: [...event.fieldNotes] })));
    setExperienceDraft({});
    setExperienceQuestionIndex(0);
    setExperienceSaved(false);
    setCharacterDeleteArmed(false);
    setFocusLens("experience");
    const url = new URL(window.location.href);
    url.searchParams.set("pianoLens", "experience");
    url.searchParams.delete("pianoMotion");
    url.searchParams.delete("pianoChord");
    window.history.replaceState(null, "", url);
  };

  const beginIntervalEchoReflection = (specimen: HudNoteEvent[]) => {
    if (specimen.length !== 4) return;
    holdBoundedExperienceSpecimen("interval-echo", specimen);
  };

  const beginChordChangeReflection = (specimen: HudNoteEvent[]) => {
    if (new Set(specimen.map((event) => event.id)).size < 3) return;
    holdBoundedExperienceSpecimen("chord-change", specimen);
  };

  const beginChordVoicingEchoReflection = (specimen: HudNoteEvent[]) => {
    if (new Set(specimen.map((event) => event.id)).size < 4) return;
    holdBoundedExperienceSpecimen("chord-voicing-echo", specimen);
  };

  const beginChordMotionEchoReflection = (specimen: HudNoteEvent[]) => {
    if (new Set(specimen.map((event) => event.id)).size < 8) return;
    holdBoundedExperienceSpecimen("chord-motion-echo", specimen);
  };

  const beginResolutionForkReflection = (specimen: HudNoteEvent[]) => {
    const uniqueCount = new Set(specimen.map((event) => event.id)).size;
    if (uniqueCount < 3 || uniqueCount > 12) return;
    holdBoundedExperienceSpecimen("resolution-fork", specimen);
  };

  const beginMotifReturnReflection = (specimen: HudNoteEvent[]) => {
    const uniqueCount = new Set(specimen.map((event) => event.id)).size;
    if ((uniqueCount !== 9 && uniqueCount !== 12) || uniqueCount !== specimen.length) return;
    holdBoundedExperienceSpecimen("motif-return", specimen);
  };

  const beginLandmarkPathReflection = (specimen: HudNoteEvent[]) => {
    const uniqueCount = new Set(specimen.map((event) => event.id)).size;
    if (uniqueCount < 3 || uniqueCount > 32 || uniqueCount !== specimen.length) return;
    const variantLabel = landmarkPerformanceVariant === "transposed"
      ? "same path · moved center"
      : landmarkPerformanceVariant === "one-key-changed"
        ? "one-key changed route"
        : "original route";
    holdBoundedExperienceSpecimen("landmark-path", specimen, {
      kind: "landmark-path",
      id: landmarkPath.id,
      label: `${landmarkPath.family} · ${landmarkPath.title} · ${variantLabel}`,
      variant: landmarkPerformanceVariant,
      pathLabel: `${landmarkPath.family} · ${landmarkPath.title}`,
      rootPitchClass: pitchClassFromMidi(doMidi),
    });
  };

  const freezeChordSourceEvents = (measure: ChordMeasure) => {
    const notes = uniqueSorted(measure.interpretedNotes);
    const attackedNotes = new Set(measure.gesture.attacks.map((event) => event.note));
    const inheritedSourceEvents = notes
      .filter((note) => !attackedNotes.has(note))
      .map((note) => phraseEvents.findLast((event) => event.note === note && event.id < measure.gesture.attacks[0].id))
      .filter((event): event is HudNoteEvent => Boolean(event));
    return [...inheritedSourceEvents, ...measure.gesture.attacks]
      .filter((event, index, source) => source.findIndex((candidate) => candidate.id === event.id) === index)
      .sort((first, second) => first.onsetMs - second.onsetMs || first.id - second.id)
      .map((event) => ({ ...event, fieldNotes: [...event.fieldNotes] }));
  };

  const beginChordVoicingEcho = () => {
    const sourceNotes = selectedChordMeasure ? uniqueSorted(selectedChordMeasure.interpretedNotes) : [];
    if (!selectedChordMeasure || selectedChordMeasure.gesture.attacks.length < 2 || sourceNotes.length > 6 || new Set(sourceNotes.map(pitchClassFromMidi)).size < 2) return;
    const sourceEvents = freezeChordSourceEvents(selectedChordMeasure);
    const sourceEventIds = sourceEvents.map((event) => event.id);
    setControlledSonoritySession(null);
    setChordMotionEchoSession(null);
    setGhostChord(null);
    setGhostNotes([]);
    setResolutionTarget(null);
    setResolutionForkSet(null);
    setLockedScaleId(scale.id);
    setLockedDoMidi(doMidi);
    setFrameMode("locked");
    setChordVoicingEchoSession({ sourceEvents, sourceNotes, anchorEventId: Math.max(...sourceEventIds), rootPitchClass: pitchClassFromMidi(doMidi), scaleId: scale.id });
    const url = new URL(window.location.href);
    url.searchParams.set("pianoLens", "chords");
    url.searchParams.set("pianoChord", "echo");
    url.searchParams.set("pianoDo", String(pitchClassFromMidi(doMidi)));
    url.searchParams.set("pianoScale", scale.id);
    window.history.replaceState(null, "", url);
  };

  const beginChordMotionEcho = (before: ChordMeasure, after: ChordMeasure) => {
    const sourceBeforeNotes = uniqueSorted(before.interpretedNotes);
    const sourceAfterNotes = uniqueSorted(after.interpretedNotes);
    const validField = (measure: ChordMeasure, notes: number[]) => measure.gesture.attacks.length >= 2
      && notes.length >= 2
      && notes.length <= 6
      && new Set(notes.map(pitchClassFromMidi)).size >= 2;
    if (!validField(before, sourceBeforeNotes) || !validField(after, sourceAfterNotes)) return;
    const sourceBeforeEvents = freezeChordSourceEvents(before);
    const sourceAfterEvents = freezeChordSourceEvents(after);
    const anchorEventId = Math.max(...sourceBeforeEvents.map((event) => event.id), ...sourceAfterEvents.map((event) => event.id));
    setControlledSonoritySession(null);
    setChordVoicingEchoSession(null);
    setGhostChord(null);
    setGhostNotes([]);
    setResolutionTarget(null);
    setResolutionForkSet(null);
    setLockedScaleId(scale.id);
    setLockedDoMidi(doMidi);
    setFrameMode("locked");
    setChordMotionEchoSession({
      sourceBeforeEvents,
      sourceAfterEvents,
      sourceBeforeAttackEventIds: before.gesture.attacks.map((event) => event.id),
      sourceAfterAttackEventIds: after.gesture.attacks.map((event) => event.id),
      sourceBeforeNotes,
      sourceAfterNotes,
      anchorEventId,
      attemptAnchorEventId: anchorEventId,
      rootPitchClass: pitchClassFromMidi(doMidi),
      scaleId: scale.id,
    });
    const url = new URL(window.location.href);
    url.searchParams.set("pianoLens", "chords");
    url.searchParams.set("pianoChord", "change");
    url.searchParams.set("pianoDo", String(pitchClassFromMidi(doMidi)));
    url.searchParams.set("pianoScale", scale.id);
    window.history.replaceState(null, "", url);
  };

  const retryChordMotionEcho = () => {
    if (!chordMotionEchoAttempt) return;
    const nextAnchor = chordMotionEchoAttempt.afterGesture.attacks.at(-1)?.id;
    if (nextAnchor == null) return;
    setChordMotionEchoSession((current) => current ? { ...current, attemptAnchorEventId: Math.max(current.attemptAnchorEventId, nextAnchor) } : current);
  };

  const selectChordMode = (mode: ChordFocusMode) => {
    setChordFocusMode(mode);
    setGhostChord(null);
    setGhostNotes([]);
    const url = new URL(window.location.href);
    url.searchParams.set("pianoLens", "chords");
    url.searchParams.set("pianoChord", mode);
    url.searchParams.delete("pianoMotion");
    window.history.replaceState(null, "", url);
  };

  const selectMotionMode = (mode: MotionFocusMode) => {
    setMotionFocusMode(mode);
    const url = new URL(window.location.href);
    url.searchParams.set("pianoLens", "motion");
    url.searchParams.set("pianoMotion", mode);
    window.history.replaceState(null, "", url);
  };

  const beginPulseMirror = () => {
    setPulseMirrorSession({ anchorEventId: phraseEvents.at(-1)?.id ?? 0, capturedTapEventIds: [] });
  };

  const beginMotifEcho = (length: 3 | 4) => {
    if (phraseEvents.length < length) return;
    const sourceEvents = freezePhraseSpecimen(phraseEvents.slice(-length), currentHudTime());
    setMotifEchoSession({ sourceEvents, anchorEventId: phraseEvents.at(-1)?.id ?? 0, attempts: [], returnObservations: [], returnReport: null });
  };

  const retryMotifEcho = () => {
    setMotifEchoSession((current) => current && motifEchoAttempt.length === current.sourceEvents.length ? {
      ...current,
      attempts: [...(current.attempts ?? []), freezePhraseSpecimen(motifEchoAttempt, currentHudTime())].slice(-3),
      anchorEventId: phraseEvents.at(-1)?.id ?? current.anchorEventId,
      returnReport: motifEchoComparison?.kind === "exact-repeat" || motifEchoComparison?.kind === "transposed-repeat" ? current.returnReport ?? null : null,
    } : current);
  };

  const reportMotifReturn = (comparison: MotifEchoComparison, report: MotifReturnReport) => {
    setMotifEchoSession((current) => current ? {
      ...current,
      returnObservations: upsertMotifReturnObservation(current.returnObservations ?? [], comparison, report),
      returnReport: null,
    } : current);
  };

  const selectLandmarkPath = (id: LandmarkPathId) => {
    setScaleWalkSession(null);
    setScaleFingerprintSession(null);
    setGravityCounterfactualSession(null);
    setControlledSonoritySession(null);
    setLockedScaleId(scale.id);
    setLockedDoMidi(doMidi);
    setFrameMode("locked");
    setLandmarkPathId(id);
    setLandmarkRouteCompareSession((current) => current
      ? id === current.sourcePathId ? null : { ...current, targetPathId: id }
      : null);
    setLandmarkStepIndex(0);
    setLandmarkTransposeSession(null);
    setLandmarkCounterfactualSession(null);
    setLandmarkPerformanceCapture(null);
    landmarkLastMatchIdRef.current = phraseEvents.at(-1)?.id ?? 0;
    setGhostChord(null);
    setGhostNotes([]);
    setResolutionTarget(null);
    setResolutionForkSet(null);
  };

  const beginLandmarkRouteComparison = (targetPathId: LandmarkPathId, sourceVariant: LandmarkRouteFingerprint["variant"]) => {
    const sourcePathId = landmarkPath.id;
    selectLandmarkPath(targetPathId);
    setLandmarkRouteCompareSession({ sourcePathId, sourceVariant, targetPathId });
  };

  const endLandmarkRouteComparison = () => {
    setLandmarkRouteCompareSession(null);
  };

  const replayLandmarkPath = () => {
    setLandmarkStepIndex(0);
    setLandmarkPerformanceCapture(null);
    setLandmarkCounterfactualSession((current) => current ? { ...current, report: null } : current);
    landmarkLastMatchIdRef.current = phraseEvents.at(-1)?.id ?? 0;
  };

  const beginLandmarkCounterfactual = () => {
    setLandmarkTransposeSession(null);
    setLandmarkCounterfactualSession({ pathId: landmarkPath.id, rootPitchClass: pitchClassFromMidi(doMidi), report: null });
    setLandmarkStepIndex(0);
    setLandmarkPerformanceCapture(null);
    landmarkLastMatchIdRef.current = phraseEvents.at(-1)?.id ?? 0;
  };

  const reportLandmarkCounterfactual = (report: LandmarkCounterfactualReport) => {
    setLandmarkCounterfactualSession((current) => current ? { ...current, report } : current);
  };

  const restoreLandmarkPath = () => {
    setLandmarkCounterfactualSession(null);
    setLandmarkStepIndex(0);
    setLandmarkPerformanceCapture(null);
    landmarkLastMatchIdRef.current = phraseEvents.at(-1)?.id ?? 0;
  };

  const transposeLandmarkPath = () => {
    const sourceRootPitchClass = pitchClassFromMidi(doMidi);
    const targetRootPitchClass = (sourceRootPitchClass + 7) % 12;
    setLandmarkTransposeSession({ pathId: landmarkPath.id, sourceRootPitchClass, targetRootPitchClass });
    setLandmarkCounterfactualSession(null);
    setLockedScaleId(scale.id);
    setLockedDoMidi(nearestMidiForPitchClass(targetRootPitchClass, 60));
    setFrameMode("locked");
    setLandmarkStepIndex(0);
    setLandmarkPerformanceCapture(null);
    landmarkLastMatchIdRef.current = phraseEvents.at(-1)?.id ?? 0;
    setGhostChord(null);
    setGhostNotes([]);
    setResolutionTarget(null);
    setResolutionForkSet(null);
    const url = new URL(window.location.href);
    url.searchParams.set("pianoDo", String(targetRootPitchClass));
    url.searchParams.set("pianoScale", scale.id);
    window.history.replaceState(null, "", url);
  };

  const chooseGhostChord = (chord: NearbyChord) => {
    setControlledSonoritySession(null);
    const center = analysisNotes.length ? analysisNotes.reduce((sum, note) => sum + note, 0) / analysisNotes.length : 60;
    setResolutionTarget(null);
    setResolutionForkSet(null);
    setGhostChord(chord);
    setGhostNotes(voiceChordNear(chord.pitchClasses, analysisNotes, center));
  };

  const chooseResolutionTarget = (fork: ResolutionFork) => {
    const sourceEvent = phraseEvents.at(-1);
    if (!sourceEvent) return;
    setControlledSonoritySession(null);
    setGhostChord(null);
    setGhostNotes([]);
    setResolutionForkSet(resolutionForkSet ?? nextNoteForks);
    setResolutionTarget({ ...fork, anchorEventId: sourceEvent.id, sourceEvent: { ...sourceEvent, fieldNotes: [...sourceEvent.fieldNotes] }, frameRootPitchClass: frame.rootPitchClass, frameScaleId: scale.id });
  };

  const latestPulsePlacement = pulseMirrorModel?.placements.at(-1) ?? null;
  const latestPulseGap = pulseMirrorModel?.gaps.at(-1) ?? null;
  const gravityCounterfactualCue = GRAVITY_CUE_OPTIONS.find((option) => option.id === gravityCounterfactualSession?.cue);
  const gravityCounterfactualTargetLabel = gravityCounterfactualSession ? pitchClassRoleLabel(gravityCounterfactualSession.targetPitchClass, doMidi, scale, showConventions) : "candidate";
  const intervalFocusPair = focusLens === "intervals" ? selectedIntervalPair(soundingAnalysisNotes, focusedEvent?.note ?? null) : [];
  const intervalFocusInteraction = intervalFocusPair.length === 2
    ? pianoPartialInteraction(frequencyFromMidi(intervalFocusPair[0]), frequencyFromMidi(intervalFocusPair[1]), soundModelId)
    : null;
  const framePitchPreference = preferredAccidentalsForTonic(doMidi);

  const newestInsight = focusLens === "explore" && phraseCompareSession ? !phraseCompareSession.comparison || !phraseLensComparison
    ? `${PHRASE_CHANGE_CHOICES.find((choice) => choice.id === phraseCompareSession.intention)?.instruction ?? "Play phrase B with one declared change."} ${phraseCompareLiveEvents.length} of at least 3 replay attacks are captured.`
    : phraseChangeReading
      ? `${phraseChangeReading.targetObserved ? "The declared coordinate moved" : "The declared coordinate did not move clearly"}; its control was ${phraseChangeReading.controlPreserved ? "preserved" : "not preserved"}. ${phraseChangeReading.otherChangedLenses.length ? `Other changed lenses: ${phraseChangeReading.otherChangedLenses.join(", ")}.` : "No other lens crossed its display threshold."}`
      : "Phrase A and B remain separate five-lens comparisons without a combined verdict."
    : focusLens === "chords" && chordFocusMode === "echo" ? !chordVoicingEchoSession
      ? "Select one interpreted grouped chord and freeze its relationship before changing register, inversion, or transposition."
      : !chordVoicingEchoAttempt || !chordVoicingEchoComparison
        ? "The source relationship is frozen. Release it, then play one new grouped chord without following a ghost target."
        : chordVoicingEchoComparison.relationshipPreserved
          ? `${chordVoicingEchoComparison.pitchClassIdentityPreserved ? "The pitch-class set survived" : `The internal relationship survived a ${formatSemitones(chordVoicingEchoComparison.transpositionSteps!, 0, true)} transposition`}; register, bass role, spacing, doubling, modeled spectrum, context, and experience remain separate questions.`
          : "The latest grouped attempt changed the internal pitch-class relationship. The source remains frozen so you can try another voicing."
    : focusLens === "chords" && chordFocusMode === "change"
      ? chordMotionEchoSession
        ? !chordMotionEchoAttempt || !chordMotionEchoComparison
          ? `${chordMotionEchoCandidates.length}/2 replay fields captured. The two-chord source remains frozen until both new grouped fields are performed.`
          : chordMotionEchoComparison.relationshipPreserved
            ? `${chordMotionEchoComparison.pitchClassIdentityPreserved ? "The complete two-field pitch-class move survived" : `The complete move survived a ${formatSemitones(chordMotionEchoComparison.transpositionSteps!, 0, true)} transposition`}; physical voice motion, spectrum, context, and experience remain separate.`
            : chordMotionEchoComparison.beforeRelationshipPreserved && chordMotionEchoComparison.afterRelationshipPreserved
              ? "Both chord types returned, but they did not share one transposition, so the complete move changed."
              : "One or both endpoint relationships changed. The source move remains frozen for an explicit retry."
        : chordMeasures.length >= 2 ? "The selected before-and-after chord change is split across five independent lenses; freeze it only if you want to replay the entire move elsewhere." : "Play two grouped chord gestures to create one before-and-after question."
    : focusLens === "chords" && chordFocusMode === "cause" && controlledSonoritySession ? !controlledSonoritySession.baselineNotes
    ? "The starting field is only outlined. Perform every exact key to establish a physical and modeled baseline."
    : controlledSonoritySession.replayRequired
      ? "Replay the baseline field, then add or release exactly one note while the other notes stay held."
      : controlledSonorityComparison?.kind === "same"
        ? "The baseline is restored. Change exactly one note so its new or lost relationships can be isolated."
        : controlledSonorityComparison?.kind === "multiple"
          ? "Several notes changed, so a one-note causal explanation would be false. Return to the baseline or adopt this field."
          : controlledSonorityComparison
            ? `${showConventions ? conventionalPitchName(controlledSonorityComparison.changedNote!, framePitchPreference) : relativeSyllable(controlledSonorityComparison.changedNote!, doMidi, scale)} ${controlledSonorityComparison.kind === "one-added" ? "created" : "removed"} ${controlledSonorityComparison.changedIntervals.length} pairwise relationship${controlledSonorityComparison.changedIntervals.length === 1 ? "" : "s"}; the physical, auditory, contextual, and felt-possibility lanes show different consequences.`
            : "Choose or perform a starting field before making one controlled change."
    : focusLens === "chords" && chordFocusMode === "cause"
      ? "Choose a silent starting field or hold your own, then change exactly one note while the rest stay fixed."
    : focusLens === "scales" && performedScaleFingerprint ? performedScaleFingerprint.status === "waiting"
    ? scaleFingerprintSession?.exercise === "build" ? "Play any key to establish position 0; no note name or Do is required." : scaleFingerprintSession?.exercise === "mutate" ? "Play any key to establish a new position 0, then rebuild the route with exactly one internal landing moved." : "Play any key to transpose this fingerprint; the first attack establishes a new origin."
    : performedScaleFingerprint.status === "complete"
      ? scaleFingerprintSession?.exercise === "build" ? `You authored ${performedScaleFingerprint.steps.join("–")}; its gaps total 12 and the octave closes at 2:1.` : scaleFingerprintSession?.exercise === "mutate" ? "The changed route closes at 2:1; compare its landing positions to see whether one cause was isolated." : `You preserved ${performedScaleFingerprint.steps.join("–")} while the absolute starting frequency and hand position changed.`
      : performedScaleFingerprint.lastAttempt?.kind === "try-again"
        ? "The last move did not satisfy the current gap relationship. Valid earlier gaps were preserved so you can repair only that move."
        : `${performedScaleFingerprint.steps.length} gaps authored; ${performedScaleFingerprint.octaveRemaining} semitones remain before the frequency doubles.`
    : focusLens === "scales" && gravityCounterfactualResult && gravityCounterfactualCue
      ? `${gravityCounterfactualTargetLabel} moves from center rank ${gravityCounterfactualResult.baselineRank + 1} to ${gravityCounterfactualResult.counterfactualRank + 1} when only the ${gravityCounterfactualCue.shortLabel} evidence lane is reassigned. The frozen MIDI phrase and every other model component stay fixed.`
    : focusLens === "scales" && scaleWalkProgress ? scaleWalkProgress.status === "waiting-do"
    ? "The scale frame is fixed. Play Do in any octave to establish a register; the walk will judge relationships, not absolute note names."
    : scaleWalkProgress.status === "complete"
      ? `The octave closed at 2:1 while the ${scaleWalkScale.steps.join("–")} gap fingerprint stayed invariant.`
      : scaleWalkProgress.lastAttempt?.kind === "try-again"
        ? `The last move was ${scaleWalkProgress.lastAttempt.actualGap}; the route asks for +${scaleWalkProgress.lastAttempt.expectedGap}. Progress was preserved so you can correct only that relationship.`
        : `The last correct step changed the frequency and fifths position; the ${scaleWalkScale.steps.join("–")} route itself did not change.`
    : focusLens === "intervals" ? intervalFocusInteraction
      ? `${intervalLandmark(intervalFocusPair[1] - intervalFocusPair[0]).relationship}: ${intervalFocusInteraction.alignedPairs.length} assumed partial alignment${intervalFocusInteraction.alignedPairs.length === 1 ? "" : "s"} and ${intervalFocusInteraction.interactionPairs.length} near interaction zone${intervalFocusInteraction.interactionPairs.length === 1 ? "" : "s"} under the ${soundModel.shortLabel.toLowerCase()} teaching spectrum. Select another event to change the inspected pair.`
      : "Hold two notes to connect one physical interval with its assumed partial alignment and near-collision pattern."
    : focusLens === "experience" ? experiencePhrase.length < 3
    ? "Play at least three attacks, then hold the latest phrase for a personal reflection."
    : experienceSaved
      ? `Your ${experienceOrigin === "phrase" ? "phrase" : experienceOrigin === "chord-change" ? "chord-change" : experienceOrigin === "chord-voicing-echo" ? "chord-voicing" : experienceOrigin === "chord-motion-echo" ? "chord-move" : experienceOrigin === "resolution-fork" ? "resolution-landing" : experienceOrigin === "motif-return" ? "motif-return arc" : experienceOrigin === "landmark-path" ? "performed landmark path" : "interval-comparison"} report was saved locally as one uncertain observation; it remains separate from measured and modeled evidence.`
      : experienceQuestionIndex < CHARACTER_QUESTIONS.length
        ? `Reflection ${experienceQuestionIndex + 1} of 4: ${experiencePromptForOrigin(CHARACTER_QUESTIONS[experienceQuestionIndex].prompt, experienceOrigin)}`
        : "All four personal dimensions are answered. Review them together before saving this observation."
    : focusLens === "paths" ? effectiveLandmarkStepIndex >= landmarkPath.steps.length
    ? `${landmarkPath.family} complete: ${landmarkPath.invariant}`
    : `${landmarkPath.family}: ${effectiveLandmarkStepIndex} of ${landmarkPath.steps.length} fields matched. Next, play the outlined ${landmarkPath.steps[effectiveLandmarkStepIndex].role}; ${landmarkPath.steps[effectiveLandmarkStepIndex].prompt.toLowerCase()}`
    : focusLens === "motion" ? motionFocusMode === "pulse"
      ? !pulseMirrorSession
        ? "Begin a four-tap anchor to define one physical time unit before asking where later attacks land."
        : pulseMirrorExpired
          ? "The four source taps left the sixty-second phrase memory, so the pulse coordinate is paused until you re-anchor."
          : pulseMirrorModel?.status === "waiting"
            ? "The pulse experiment is armed. Your first attack chooses the one key to repeat four times."
            : pulseMirrorModel?.status === "capturing"
              ? `${pulseMirrorModel.tapEvents.length} of 4 same-key anchor taps captured; ${pulseMirrorModel.tapsNeeded} remain.`
              : pulseMirrorModel?.status === "invalid"
                ? "The four tap gaps fell outside the declared 180 ms to 2 second range; re-anchor rather than accepting a false coordinate."
                : latestPulsePlacement
                  ? `The latest onset cluster is at phase ${latestPulsePlacement.phase.toFixed(2)}, closest to ${latestPulsePlacement.phaseLabel}${latestPulseGap ? `; its preceding gap is ${latestPulseGap.pulseMultiple.toFixed(2)} times the pulse, nearest ${latestPulseGap.ratioLabel}` : ""}.`
                  : "The pulse is fixed by your taps. Play a short phrase to place its attack clusters around that coordinate."
      : motionFocusMode === "touch"
        ? articulationEvidence.length ? `The latest touch is ${ARTICULATION_LABELS[articulationEvidence.at(-1)!.kind]}; finger duration, pedal tail, overlap, and silence remain separate measurements.` : "Play two attacks to compare finger contact, pedal extension, overlap, and silence."
        : motionFocusMode === "breath"
          ? phraseEvents.length >= 3 ? "The breath map marks only unusually long onset-group gaps that also contain release-proven silence; move its threshold to see which groupings depend on the model." : "Play at least three onset groups to compare local attack spacing with release-proven quiet."
        : motionFocusMode === "voices"
          ? chordMeasures.length >= 2 ? "The voice coach maps nearest keyboard strands; held, rising, falling, added, and released notes are descriptions, not inferred fingering." : "Play two chord gestures to reveal held and moving nearest-key strands."
          : motifEchoSession
            ? motifEchoComparison
              ? `${motifEchoTitle(motifEchoComparison)}: every attack in your chosen ${motifEchoSession.sourceEvents.length}-attack boundary was compared.`
              : `${motifEchoAttempt.length}/${motifEchoSession.sourceEvents.length} replay attacks captured for the chosen motif boundary.`
            : motifTransformations.length ? `${motifTitle(motifTransformations[0])}: repeat, change one property, then return.` : "Play a three- or four-attack shape, leave space, then repeat or transform it."
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
    const correctionCopy = excludedInheritedNotes.length ? `${excludedInheritedNotes.length} inherited note${excludedInheritedNotes.length === 1 ? " is" : "s are"} excluded from the chord reading but remain in the audible texture.` : "Inherited sounding notes currently remain in the chord reading.";
    const chordCopy = fieldCandidate ? fieldCandidate.exact ? `The interpreted membership forms ${chordLabel(fieldCandidate, doMidi, showConventions)}. ${correctionCopy}` : `The interpreted membership may outline ${chordLabel(fieldCandidate, doMidi, showConventions)}; tones are missing or added. ${correctionCopy}` : fieldPitchClassCount > 5 ? `The ${fieldPitchClassCount}-position interpreted field is scale-like, so no chord label is forced. ${correctionCopy}` : "Hold another note to expose chord relationships.";
    return `${showConventions ? conventionalPitchName(focusedEvent.note, framePitchPreference) : context.syllable} arrived as ${intervalCopy}, ${routeCopy}; modeled evidence is ${motionCopy}. ${articulationCopy} ${motifCopy} ${chordCopy} ${transitionCopy}`.trim();
  })() : "Play a MIDI or on-screen key. One note attack will appear in every view at once.";

  const renderKey = (note: number, black: boolean) => {
    const context = noteContext(note, doMidi, scale);
    const active = activeNotesMap.has(note);
    const pressed = midi.pressed.has(note);
    const sustained = midi.sustained.has(note);
    const focused = focusedEvent?.note === note;
    const chordMember = selectedChordMeasure?.interpretedNotes.includes(note) ?? false;
    const attacked = selectedGesture?.attackedNotes.includes(note) ?? false;
    const inherited = selectedGesture?.inheritedNotes.includes(note) ?? false;
    const inheritedExcluded = excludedInheritedNotes.includes(note);
    const chordGhost = ghostNotes.includes(note);
    const resolutionGhost = resolutionTarget != null && pitchClassFromMidi(note) === resolutionTarget.pitchClass;
    const landmarkGhost = focusLens === "paths" && landmarkTargetNotes.includes(note);
    const scaleWalkTarget = focusLens === "scales" && scaleWalkProgress?.status === "walking" && note === scaleWalkProgress.expectedMidi;
    const scaleFingerprintTarget = focusLens === "scales" && performedScaleFingerprint?.status === "building" && performedScaleFingerprint.expectedMidi != null && note === performedScaleFingerprint.expectedMidi;
    const sonorityReferenceNotes = !controlledSonoritySession
      ? []
      : !controlledSonoritySession.baselineNotes
        ? controlledSonoritySession.targetNotes
        : controlledSonoritySession.replayRequired
          ? controlledSonoritySession.baselineNotes.filter((referenceNote) => !activeNoteNumbers.includes(referenceNote))
          : [];
    const sonorityGhost = focusLens === "chords" && sonorityReferenceNotes.includes(note);
    const ghost = chordGhost || resolutionGhost || landmarkGhost || sonorityGhost;
    const home = context.stepsWithinOctave === 0;
    const className = ["piano-key", black ? "is-black" : "is-white", context.inScale ? "is-in-scale" : "", active ? "is-active" : "", pressed ? "is-pressed" : "", sustained ? "is-sustained" : "", focused ? "is-focused" : "", attacked ? "is-chord-member" : "", inherited && chordMember ? "is-inherited" : "", inheritedExcluded ? "is-excluded" : "", ghost ? "is-ghost" : "", sonorityGhost ? "is-sonority-target" : "", scaleWalkTarget ? "is-scale-walk-target" : "", scaleFingerprintTarget ? "is-scale-builder-target" : "", home ? "is-home" : ""].filter(Boolean).join(" ");
    const style = ({
      "--key-left": black ? `${(WHITE_NOTES.filter((white) => white < note).length / WHITE_NOTES.length) * 100}%` : `${(WHITE_NOTES.indexOf(note) / WHITE_NOTES.length) * 100}%`,
      "--key-width": `${100 / WHITE_NOTES.length}%`,
    } as CSSProperties);
    return <button key={note} type="button" className={className} style={style} aria-pressed={active} aria-label={`${context.syllable}, ${context.inScale ? "in" : "outside"} the current route, ${formatHz(context.frequencyHz)} under the A4=440 reference${showConventions ? `, ${conventionalPitchName(note, framePitchPreference)}` : ""}${sustained ? ", sustained by pedal" : ""}${attacked ? ", attacked in selected chord" : inheritedExcluded ? ", sounding but excluded from selected chord interpretation" : inherited ? ", inherited and included in selected chord interpretation" : ""}${chordGhost ? ", silent chord target" : resolutionGhost ? ", silent resolution target, any octave" : landmarkGhost ? ", silent landmark path target" : sonorityGhost ? ", silent controlled sonority reference" : scaleWalkTarget ? ", silent guided scale-walk target" : scaleFingerprintTarget ? ", silent performed fingerprint target" : ""}`} onClick={() => toggleScreenKey(note)}><span>{context.inScale || active || home || ghost || scaleWalkTarget || scaleFingerprintTarget ? context.syllable : "·"}</span>{showConventions ? <small>{conventionalPitchName(note, framePitchPreference)}</small> : null}</button>;
  };

  const exactChord = chordCandidates.find((candidate) => candidate.exact);
  const leadingChord = fieldPitchClassCount <= 5 ? selectedChordMeasure?.candidate ?? exactChord ?? chordCandidates[0] : undefined;
  const chordSemitoneBins = soundingSemitoneProfile.intervalBins.map((bin) => `${bin.semitones}${bin.pairCount > 1 ? `×${bin.pairCount}` : ""}`).join(" · ");
  const chordHomeCue = soundingSemitoneProfile.strongestHomewardCue;
  const chordHomeCueLabel = chordHomeCue
    ? `${showConventions ? conventionalPitchName(chordHomeCue.note, framePitchPreference) : relativeSyllable(chordHomeCue.note, doMidi, scale)} → Do ${chordHomeCue.movement > 0 ? "+" : ""}${chordHomeCue.movement} semitone${Math.abs(chordHomeCue.movement) === 1 ? "" : "s"}${chordHomeCue.directNeighbor ? " · direct neighbor" : ""}`
    : soundingAnalysisNotes.length ? "Do is present without another homeward voice" : "no field";
  const exactChordForAtlas = selectedChordMeasure?.candidate?.exact ? selectedChordMeasure.candidate : exactChord?.exact ? exactChord : null;
  const chordAtlasRootMidi = exactChordForAtlas
    ? nearestMidiForPitchClass(exactChordForAtlas.rootPitchClass, doMidi)
    : doMidi;

  return (
    <section className="advanced-lab piano-lab piano-hud" aria-labelledby="piano-hud-title">
      <header className="piano-hud-header">
        <div><p className="section-kicker">MIDI relationship companion · one coordinated view</p><h2 id="piano-hud-title">See relationships as your hands play.</h2><p>{focusLens === "immersion" ? "Every attack becomes a stable place in one fifths-and-register sky; timing, interval, scale, chord, and tonal evidence gather around it without becoming a score." : focusLens === "interval-glow" ? "Every exact attack-to-attack and within-chord semitone spacing becomes a stable color and place around one live phrase thread." : focusLens === "sight-shapes" ? "Turn written intervals, lines, chord silhouettes, anchors, movement groups, and musical intention into one linked eyes–hands–ear practice loop." : focusLens === "research" ? "The same twelve pitch positions stay fixed while semitone, interval-orbit, thirds-lattice, and all-pairs maps expose different relationships—and their limits." : focusLens === "gravity" ? "A semitone-accurate major-scale landscape keeps degree location fixed while IV, V, and I reveal how one held pitch changes role without moving." : "Every attack keeps one numbered column across staff, reference frequency, and evidence."} MIDI sends note data only. Sung-pitch practice now lives on the dedicated Voice page.</p></div>
        <div className="piano-hud-controls" aria-label="HUD controls">
          <div className="midi-status"><i className={midi.inputs.length ? "is-connected" : ""} aria-hidden="true" /><div><span>MIDI</span><strong role="status">{midi.status}</strong></div></div>
          {midi.inputs.length ? <label htmlFor="hud-midi-input"><span>Input</span><select id="hud-midi-input" value={midi.selectedInputId} onChange={(event) => midi.setSelectedInputId(event.target.value)}>{midi.inputs.map((input) => <option key={input.id} value={input.id}>{[input.manufacturer, input.name].filter(Boolean).join(" · ") || "MIDI input"}</option>)}</select></label> : <button type="button" className="piano-primary-action" onClick={midi.connect}>{midi.supported === false ? "Retry MIDI" : "Connect MIDI"}</button>}
          <label htmlFor="hud-chord-window"><span>Chord grouping</span><select id="hud-chord-window" value={chordWindowMs} onChange={(event) => { setChordWindowMs(Number(event.target.value)); setMembershipCorrections({}); setSelectedChordId(null); }}><option value={80}>Together · 80 ms</option><option value={160}>Natural · 160 ms</option><option value={320}>Rolled · 320 ms</option></select></label>
          <button type="button" disabled={Boolean(phraseCompareSession)} aria-pressed={frozen} onClick={() => setFrozen((current) => !current)}>{phraseCompareSession ? "Trace live for A/B" : frozen ? "Resume trace" : "Freeze trace"}</button>
          <button type="button" disabled={focusLens === "paths" || Boolean(phraseCompareSession)} aria-pressed={frameMode === "locked"} onClick={toggleFrameMode}>{phraseCompareSession ? "Frame fixed for A/B" : focusLens === "paths" ? "Frame fixed for path" : frameMode === "locked" ? "Unlock frame" : "Lock frame"}</button>
          <label className="piano-convention-toggle"><input type="checkbox" checked={showConventions} onChange={(event) => setShowConventions(event.target.checked)} /><span>Theory names</span></label>
          <button type="button" onClick={clearAll}>Clear</button>
        </div>
      </header>

      <div className="piano-hud-statebar">
        <span className={frameMode === "locked" ? "is-locked" : ""}>{frameMode === "locked" ? "Locked frame" : "Discovering frame"}</span>
        <strong>Do reference · {formatHz(frequencyFromMidi(doMidi))}{showConventions ? ` · ${conventionalPitchName(doMidi, framePitchPreference)}` : ""}</strong>
        <small>{latestSnapshot?.evidenceLabel ?? "Play four distinct positions before the frame can move."} · group gaps up to {chordWindowMs} ms ({chordWindowMs * 2} ms maximum span)</small>
        <em>{frozen ? "Trace frozen; held keys still show below." : focusLens === "sight-shapes" ? `${phraseEvents.length} in silent phrase · each exercise owns a resettable attempt boundary` : isShortHudFocus ? `${immersionHistoryEvents.length}/${IMMERSION_HISTORY_ATTACKS} shared HUD history · notes + chords` : `${phraseEvents.length} in phrase · ${events.length}/7 in microscope`}</em>
      </div>

      <RouteSelector scale={scale} doMidi={doMidi} frameMode={frameMode} showConventions={showConventions} doCaptureArmed={doCaptureArmed} onSelect={selectScaleRoute} onToggleDoCapture={toggleDoCapture} />

      {!isShortHudFocus ? <SoundModelDisclosure value={soundModelId} onChange={setSoundModelId} /> : null}

      <nav className="piano-focus-lenses" aria-label="Learning focus">
        {FOCUS_LENSES.map((lens) => <button key={lens.id} type="button" aria-pressed={focusLens === lens.id} onClick={() => selectFocusLens(lens.id)}><strong>{lens.label}</strong><span>{lens.description}</span></button>)}
      </nav>

      {focusLens === "immersion" ? <PianoImmersion
        events={events}
        phraseEvents={immersionHistoryEvents}
        measures={measures}
        chordMeasures={immersionChordMeasures}
        activeNotes={immersionActiveNotes}
        doMidi={doMidi}
        scale={scale}
        frameMode={frameMode}
        doCaptureArmed={doCaptureArmed}
        frameLearningActive={frameMode === "discover" && frameLearningAnchorId != null}
        frameLearningDistinctPitchClasses={frameLearningDistinctPitchClasses}
        frameSnapshot={latestSnapshot ?? null}
        gravityCandidates={immersionGravityCandidates}
        motifs={immersionMotifs}
        nearbyReady={immersionNearbyReady}
        pulseMirror={pulseMirrorModel}
        chordWindowMs={chordWindowMs}
        soundModelId={soundModelId}
        showConventions={showConventions}
        onSoundModelChange={setSoundModelId}
        onToggleDoCapture={toggleDoCapture}
        onResetFrameFromPlaying={resetFrameFromPlaying}
      /> : null}

      {focusLens === "interval-glow" ? <PianoIntervalGlowHud
        events={immersionHistoryEvents}
        activeNotes={activeNoteNumbers}
        doMidi={doMidi}
        scale={scale}
        chordWindowMs={chordWindowMs}
        soundModelId={soundModelId}
        onSoundModelChange={setSoundModelId}
        showConventions={showConventions}
      /> : null}

      {focusLens === "sight-shapes" ? <PianoSightReadingHud
        key={sightShapesResetVersion}
        events={phraseEvents}
        activeNotes={activeNoteNumbers}
        doMidi={doMidi}
        scale={scale}
        chordWindowMs={chordWindowMs}
        showConventions={showConventions}
        frozen={frozen}
        onResumeCapture={() => setFrozen(false)}
      /> : null}

      {focusLens === "research" ? <PianoResearchHud
        events={immersionHistoryEvents}
        activeNotes={activeNoteNumbers}
        doMidi={doMidi}
        scale={scale}
        showConventions={showConventions}
      /> : null}

      {focusLens === "gravity" ? <PianoScaleGravityHud
        events={immersionHistoryEvents}
        activeNotes={activeNoteNumbers}
        doMidi={doMidi}
        scale={scale}
        showConventions={showConventions}
      /> : null}

      {!isShortHudFocus ? <PhraseRibbon events={phraseEvents} nowMs={nowMs || phraseEvents.at(-1)?.onsetMs || 0} doMidi={doMidi} scale={scale} focusedId={focusedEvent?.id ?? null} showConventions={showConventions} /> : null}

      {focusLens === "chords" ? <ChordQuestionGuide value={chordFocusMode} onChange={selectChordMode} /> : null}
      {focusLens === "chords" ? <ChordSemitoneAtlas rootMidi={chordAtlasRootMidi} soundModelId={soundModelId} showConventions={showConventions} activeTemplateId={exactChordForAtlas?.template.id ?? null} anchorSource={exactChordForAtlas ? "current exact chord root" : "selected Do"} /> : null}

      {!isShortHudFocus ? <div className="hud-event-selector" aria-label="Select an event across every view">{events.map((event, index) => <button key={event.id} type="button" aria-pressed={focusedEvent?.id === event.id} onClick={() => { setFocusedId(event.id); const containing = chordGestures.find((gesture) => gesture.attacks.some((attack) => attack.id === event.id)); if (containing) setSelectedChordId(containing.id); }}><strong>{index + 1}</strong><span>{showConventions ? conventionalPitchName(event.note, framePitchPreference) : relativeSyllable(event.note, doMidi, scale)}</span><small>{durationLabel(event, nowMs || event.onsetMs)}{event.releaseReason === "pedal" ? " · pedal" : ""}</small></button>)}</div> : null}

      {focusLens === "explore" ? <PhraseCompareField session={phraseCompareSession} liveReplayCount={phraseCompareLiveEvents.length} comparison={phraseLensComparison} availableAttackCount={phraseEvents.length} doMidi={doMidi} scale={scale} showConventions={showConventions} onStart={beginPhraseCompare} onCapture={capturePhraseCompareReplay} onReplay={replayPhraseCompare} onPromote={promotePhraseCompareReplay} onReport={reportPhraseCompare} onEnd={() => setPhraseCompareSession(null)} /> : null}

      {((focusLens === "explore" && !phraseCompareSession) || (focusLens === "chords" && chordFocusMode !== "cause")) ? <ChordGestureLane events={events} measures={chordMeasures} selectedChordId={effectiveSelectedChordId} focusedId={focusedEvent?.id ?? null} boundaryCorrections={boundaryCorrections} doMidi={doMidi} showConventions={showConventions} onBoundaryChange={setBoundaryCorrection} onSelect={(id) => { setSelectedChordId(id); const gesture = chordGestures.find((item) => item.id === id); if (gesture) setFocusedId(gesture.attacks.at(-1)!.id); }} /> : null}

      {focusLens === "explore" ? !phraseCompareSession ? <div className="piano-hud-main">
        <div className="hud-phrase-stack">
          <StaffView events={events} gestures={chordGestures} selectedChordId={effectiveSelectedChordId} doMidi={doMidi} scale={scale} focusedId={focusedEvent?.id ?? null} showConventions={showConventions} />
          <FrequencyView events={events} gestures={chordGestures} selectedChordId={effectiveSelectedChordId} doMidi={doMidi} scale={scale} focusedId={focusedEvent?.id ?? null} showConventions={showConventions} />
        </div>
        <div className="hud-context-stack">
          <FifthsCompass events={events} activeNotes={activeNoteNumbers} chordNotes={analysisNotes} chordRootPitchClass={selectedChordMeasure?.candidate?.exact ? selectedChordMeasure.candidate.rootPitchClass : null} doMidi={doMidi} scale={scale} focusedNote={focusedEvent?.note ?? null} showConventions={showConventions} onChooseDo={chooseDoFromFifths} />
          <ScaleLens events={events} chordNotes={analysisNotes} snapshots={snapshots} frame={frame} doMidi={doMidi} showConventions={showConventions} onAdopt={lockCandidate} />
        </div>
      </div> : null : focusLens === "intervals" ? <div className="piano-focus-grid is-intervals">
        <StaffView events={events} gestures={chordGestures} selectedChordId={effectiveSelectedChordId} doMidi={doMidi} scale={scale} focusedId={focusedEvent?.id ?? null} showConventions={showConventions} />
        <FrequencyView events={events} gestures={chordGestures} selectedChordId={effectiveSelectedChordId} doMidi={doMidi} scale={scale} focusedId={focusedEvent?.id ?? null} showConventions={showConventions} />
      </div> : focusLens === "scales" ? <div className="piano-focus-grid is-scales">
        {!scaleFingerprintSession && !scaleWalkSession && !gravityCounterfactualSession ? <>
          <FifthsCompass events={events} activeNotes={activeNoteNumbers} chordNotes={analysisNotes} chordRootPitchClass={selectedChordMeasure?.candidate?.exact ? selectedChordMeasure.candidate.rootPitchClass : null} doMidi={doMidi} scale={scale} focusedNote={focusedEvent?.note ?? null} showConventions={showConventions} onChooseDo={chooseDoFromFifths} />
          <ScaleLens events={events} chordNotes={analysisNotes} snapshots={snapshots} frame={frame} doMidi={doMidi} showConventions={showConventions} onAdopt={lockCandidate} />
          <FifthsDerivation doMidi={doMidi} showConventions={showConventions} onChooseDo={chooseDoFromFifths} />
        </> : null}
        <ScalePracticeField phraseEvents={phraseEvents} frame={frame} doMidi={doMidi} showConventions={showConventions} soundModelId={soundModelId} gravity={gravityCandidates} fingerprintRotation={fingerprintRotation} forks={resolutionForkSet ?? nextNoteForks} target={resolutionTarget} targetMatched={resolutionMatched} landingEvidence={resolutionLanding} landingEvents={resolutionEvidenceEvents} fingerprintSession={scaleFingerprintSession} fingerprintProgress={performedScaleFingerprint} gravityCounterfactualSession={gravityCounterfactualSession} gravityCounterfactualResult={gravityCounterfactualResult} walkSession={scaleWalkSession} walkEvents={scaleWalkEvents} walkProgress={scaleWalkProgress} walkScale={scaleWalkScale} nowMs={nowMs} onRotate={() => setFingerprintRotation((current) => current + 1)} onChooseTarget={chooseResolutionTarget} onClearTarget={() => { setResolutionTarget(null); setResolutionForkSet(null); }} onReflectResolution={beginResolutionForkReflection} onStartFingerprint={beginScaleFingerprint} onRestartFingerprint={restartScaleFingerprint} onReplayFingerprint={replayScaleFingerprint} onRevealFingerprint={revealScaleFingerprint} onEndFingerprint={() => setScaleFingerprintSession(null)} onStartGravityCounterfactual={captureGravityCounterfactual} onTargetGravityCounterfactual={targetGravityCounterfactual} onCueGravityCounterfactual={cueGravityCounterfactual} onRecaptureGravityCounterfactual={captureGravityCounterfactual} onEndGravityCounterfactual={() => setGravityCounterfactualSession(null)} onStartWalk={beginScaleWalk} onRestartWalk={restartScaleWalk} onEndWalk={() => setScaleWalkSession(null)} />
      </div> : focusLens === "paths" ? <><LandmarkPathCoach path={landmarkPath} pathVoicings={landmarkVoicings} stepIndex={effectiveLandmarkStepIndex} targetNotes={landmarkTargetNotes} reflectionSpecimen={landmarkReflectionSpecimen} doMidi={doMidi} scale={scale} soundModelId={soundModelId} showConventions={showConventions} transposeSession={landmarkTransposeSession} counterfactualSession={landmarkCounterfactualSession} routeCompareSession={landmarkRouteCompareSession} onSelect={selectLandmarkPath} onReplay={replayLandmarkPath} onTranspose={transposeLandmarkPath} onCounterfactual={beginLandmarkCounterfactual} onCounterfactualReport={reportLandmarkCounterfactual} onRestore={restoreLandmarkPath} onReflect={beginLandmarkPathReflection} onStartRouteComparison={beginLandmarkRouteComparison} onEndRouteComparison={endLandmarkRouteComparison} /><FifthsCompass events={events} activeNotes={activeNoteNumbers} chordNotes={analysisNotes} chordRootPitchClass={selectedChordMeasure?.candidate?.exact ? selectedChordMeasure.candidate.rootPitchClass : null} doMidi={doMidi} scale={scale} focusedNote={focusedEvent?.note ?? null} showConventions={showConventions} onChooseDo={chooseDoFromFifths} /></> : focusLens === "experience" ? <ExperienceLens captured={experiencePhrase} origin={experienceOrigin} context={experienceContext} latestCount={phraseEvents.length} observations={phraseCharacterObservations} draft={experienceDraft} questionIndex={experienceQuestionIndex} saved={experienceSaved} evidence={experienceEvidence} soundModelLabel={soundModel.label} deleteArmed={characterDeleteArmed} onCapture={captureExperiencePhrase} onAnswer={answerExperienceQuestion} onBack={backExperienceQuestion} onSave={saveExperienceReport} onReflectAgain={reflectOnExperienceAgain} onArmDelete={() => setCharacterDeleteArmed(true)} onDelete={deletePhraseReports} /> : focusLens === "motion" ? <>
        <MotionFocusGuide value={motionFocusMode} onChange={selectMotionMode} />
        {motionFocusMode === "pulse" ? <PulseMirrorField session={pulseMirrorSession} mirror={pulseMirrorModel} expired={pulseMirrorExpired} doMidi={doMidi} scale={scale} showConventions={showConventions} onStart={beginPulseMirror} onEnd={() => setPulseMirrorSession(null)} /> : motionFocusMode === "breath" ? <PhraseBreathField events={phraseEvents} doMidi={doMidi} scale={scale} showConventions={showConventions} onComparePause={() => beginPhraseCompare("timing")} /> : motionFocusMode === "voices" ? <VoiceLeadingCoach measures={chordMeasures} selectedId={effectiveSelectedChordId} doMidi={doMidi} scale={scale} showConventions={showConventions} /> : <PhraseMotionField events={phraseEvents} articulation={articulationEvidence} motifs={motifTransformations} mode={motionFocusMode} motifEchoSession={motifEchoSession} motifEchoAttempt={motifEchoAttempt} onStartMotifEcho={beginMotifEcho} onRetryMotifEcho={retryMotifEcho} onReportMotifReturn={reportMotifReturn} onReflectMotifReturn={beginMotifReturnReflection} onEndMotifEcho={() => setMotifEchoSession(null)} />}
      </> : null}

      {focusLens === "chords" && chordFocusMode === "cause" ? <ControlledSonorityField session={controlledSonoritySession} activeNotes={activeNoteNumbers} doMidi={doMidi} scale={scale} soundModelId={soundModelId} showConventions={showConventions} onChooseRecipe={beginControlledSonority} onCaptureCurrent={captureCurrentSonority} onReplaceBaseline={replaceControlledSonorityBaseline} onRestart={restartControlledSonority} onEnd={() => setControlledSonoritySession(null)} /> : null}

      {isShortHudFocus ? <details className="piano-immersion-keyboard">
        <summary><span>Open the silent hand horizon</span><small>Optional on-screen keys for testing without MIDI. Tap once to hold, again to release; repeated attacks need a release between them. Nothing here makes sound.</small></summary>
        <div className="piano-keyboard hud-keyboard" role="group" aria-label="Silent two-octave on-screen piano">{WHITE_NOTES.map((note) => renderKey(note, false))}{VISIBLE_NOTES.filter((note) => !WHITE_PITCH_CLASSES.has(pitchClassFromMidi(note))).map((note) => renderKey(note, true))}</div>
      </details> : <div className="piano-hud-keyboard-wrap">
        <div className="hud-panel-heading"><span>Held + grouped notes</span><strong>Persistent keyboard field</strong><small>gold attacked · dotted inherited member · crossed inherited exclusion · dashed silent target · double mark Do</small></div>
        <div className="piano-keyboard hud-keyboard" role="group" aria-label="Silent two-octave on-screen piano">{WHITE_NOTES.map((note) => renderKey(note, false))}{VISIBLE_NOTES.filter((note) => !WHITE_PITCH_CLASSES.has(pitchClassFromMidi(note))).map((note) => renderKey(note, true))}</div>
      </div>}

      {((focusLens === "explore" && !phraseCompareSession) || focusLens === "chords") ? <div className={`piano-hud-analysis ${focusLens === "chords" ? "is-chords-focused" : ""}`}>
        <section className="hud-chord-panel" aria-labelledby="hud-chord-title">
          <div className="hud-panel-heading"><span>{selectedGesture ? `${selectedGesture.kind} gesture · ${Math.round(selectedGesture.spreadMs)} ms` : fieldIsLive ? "Held now" : events.length ? "Last outlined field" : "Waiting for a field"}</span><strong id="hud-chord-title">Chord membership</strong><small>Attacks always belong. Inherited held or pedal notes begin included; exclude one when it belongs only to the previous harmony.</small></div>
          {leadingChord ? <div className="hud-chord-result"><span>{leadingChord.exact ? "exact pitch-class match" : "possible outline"}</span><strong>{chordLabel(leadingChord, doMidi, showConventions)}</strong><small>{leadingChord.inversion > 0 ? `inversion ${leadingChord.inversion} · ` : ""}{leadingChord.missingPitchClasses.length ? `${leadingChord.missingPitchClasses.length} missing · ` : ""}{leadingChord.extraPitchClasses.length ? `${leadingChord.extraPitchClasses.length} added` : "no added tones"}</small></div> : fieldPitchClassCount > 5 ? <div className="hud-chord-result"><span>scale-like pitch field</span><strong>{fieldPitchClassCount} distinct positions</strong><small>Too many simultaneous positions for a useful chord-template label; inspect the interval texture and scale lens instead.</small></div> : <p className="hud-empty-copy">Hold two or more notes. The HUD will name exact matches separately from incomplete outlines.</p>}
          {selectedChordMeasure ? <div className="hud-chord-metrics" aria-label="Selected chord evidence">
            <span><small>modeled crunch</small><strong>{selectedChordMeasure.crunch == null ? "—" : Math.round(selectedChordMeasure.crunch * 100)}</strong><em>{selectedChordMeasure.crunch == null ? "no field" : evidenceWord(selectedChordMeasure.crunch)}</em></span>
            <span><small>toward Do</small><strong>{Math.round(selectedChordMeasure.pull * 100)}</strong><em>{evidenceWord(selectedChordMeasure.pull)}</em></span>
            <span><small>repose</small><strong>{Math.round(selectedChordMeasure.arrival * 100)}</strong><em>{evidenceWord(selectedChordMeasure.arrival)}</em></span>
            <span><small>pitch change</small><strong>{selectedChordMeasure.hasPreviousChord ? Math.round(selectedChordMeasure.novelty * 100) : "—"}</strong><em>{selectedChordMeasure.hasPreviousChord ? evidenceWord(selectedChordMeasure.novelty) : "baseline"}</em></span>
            <span><small>voice motion</small><strong>{selectedChordMeasure.hasPreviousChord ? Math.round(selectedChordMeasure.motion * 100) : "—"}</strong><em>{selectedChordMeasure.hasPreviousChord ? evidenceWord(selectedChordMeasure.motion) : "baseline"}</em></span>
            <span><small>fifths move</small><strong>{selectedChordMeasure.rootTravelSteps == null ? "—" : selectedChordMeasure.rootTravelSteps}</strong><em>{selectedChordMeasure.rootTravelSteps == null ? selectedChordMeasure.hasPreviousChord ? "root uncertain" : "baseline" : selectedChordMeasure.rootTravelSteps === 1 ? "neighbor" : "steps"}</em></span>
          </div> : null}
          {soundingSemitoneProfile.pairCount ? <div className="hud-chord-semitone-reading" aria-label={`Chord semitone reading. Adjacent voicing gaps ${soundingSemitoneProfile.adjacentGaps.join(", ")} semitones. Octave-folded pair spans ${chordSemitoneBins}. Selected-Do cue ${chordHomeCueLabel}. ${chordCrunchPaused ? `Modeled crunch paused above ${IMMERSION_MAX_FIELD_NOTES} positions.` : chordCrunchReading == null ? "Modeled crunch unavailable." : `Modeled crunch ${Math.round(chordCrunchReading * 100)}.`}`}>
            <div><span>Physical spacing</span><strong>{soundingSemitoneProfile.adjacentGaps.join("–")} semitone adjacent gaps</strong><small>All pair classes {chordSemitoneBins} st · closest realized pair {soundingSemitoneProfile.closestGap} semitone{soundingSemitoneProfile.closestGap === 1 ? "" : "s"}.</small></div>
            <div><span>Selected-Do heuristic</span><strong>{chordHomeCueLabel}</strong><small>A short move makes one destination physically available; phrase, bass, repetition, style, and listening determine whether it feels resolving.</small></div>
            <div><span>Assumed sound</span><strong>{chordCrunchPaused ? `Crunch paused above ${IMMERSION_MAX_FIELD_NOTES} positions` : chordCrunchReading == null ? "Crunch unavailable" : `${Math.round(chordCrunchReading * 100)} modeled crunch`}</strong><small>Semitone spacing locates the pairs. Register and the selected assumed partials determine this bounded model; MIDI contains no acoustic spectrum.</small></div>
          </div> : null}
          <div className="hud-field-notes" aria-label="Correct inherited chord membership">{soundingAnalysisNotes.map((note) => {
            const inherited = inheritedAnalysisNotes.includes(note);
            const excluded = excludedInheritedNotes.includes(note);
            const label = showConventions ? conventionalPitchName(note, framePitchPreference) : relativeSyllable(note, doMidi, scale);
            if (!inherited || !selectedGesture) return <span key={note}><strong>{label}</strong><small>attacked · included</small></span>;
            return <button key={note} type="button" className={`is-inherited ${excluded ? "is-excluded" : ""}`} aria-pressed={!excluded} aria-label={`${excluded ? "Restore" : "Exclude"} inherited ${label} ${excluded ? "to" : "from"} chord interpretation`} onClick={() => toggleInheritedMembership(selectedGesture.id, note)}><strong>{label}</strong><small>{excluded ? "excluded · restore" : "inherited · exclude"}</small></button>;
          })}</div>
          {selectedGesture?.inheritedNotes.length ? <div className="hud-membership-effect" role="status"><span>{excludedInheritedNotes.length ? `${excludedInheritedNotes.length} inherited ${excludedInheritedNotes.length === 1 ? "note" : "notes"} excluded` : "All sounding notes interpreted"}</span><strong>Reading changes · MIDI field stays</strong><small>Chord identity, toward-Do evidence, the contextual share of repose, pitch change, root travel, and voice strands use interpreted membership. The full sounding field and selected-spectrum crunch model remain unchanged; MIDI contains no acoustic roughness measurement.</small></div> : null}
        </section>

        {focusLens === "explore" ? <section className="hud-nearby-panel" aria-labelledby="hud-nearby-title">
          <div className="hud-panel-heading"><span>Choose, then perform</span><strong id="hud-nearby-title">Silent ghost targets</strong><small>Ranked by shared tones and changed pitch classes. A choice marks keys but never enters or sounds notes.</small></div>
          <ol>{nearby.map((chord) => <li key={`${chord.rootPitchClass}-${chord.degreeIndex}`}><button type="button" aria-pressed={ghostChord?.rootPitchClass === chord.rootPitchClass && ghostChord.degreeIndex === chord.degreeIndex} onClick={() => chooseGhostChord(chord)}><span>{chord.syllable} · degree {chord.degreeIndex + 1}</span><strong>Aim for {nearbyLabel(chord, doMidi, showConventions)}</strong><small>{chord.instruction}</small></button></li>)}</ol>
          {ghostChord ? <div className={`hud-ghost-feedback ${ghostMatched ? "is-match" : ""}`} role="status"><span>{ghostMatched ? "Target matched" : "Ghost keys waiting"}</span><strong>{ghostNotes.map((note) => showConventions ? conventionalPitchName(note, framePitchPreference) : relativeSyllable(note, doMidi, scale)).join(" · ")}</strong><small>{ghostMatched ? "You supplied the notes. Compare the new voice-leading and causal views." : "Release the source chord, then play the outlined keys in any order."}</small><button type="button" onClick={() => { setGhostChord(null); setGhostNotes([]); }}>Clear target</button></div> : null}
          {!nearby.length ? <p className="hud-empty-copy">Play a note or chord before comparing close, scale-derived moves.</p> : null}
        </section> : null}

        {focusLens === "explore" ? <RelationshipTexture notes={soundingAnalysisNotes} inheritedNotes={inheritedAnalysisNotes} excludedInheritedNotes={excludedInheritedNotes} doMidi={doMidi} scale={scale} showConventions={showConventions} /> : null}
      </div> : null}

      {focusLens === "explore" && !phraseCompareSession ? <div className="piano-chord-learning-grid"><ChordCausePanel measures={chordMeasures} selectedId={effectiveSelectedChordId} doMidi={doMidi} showConventions={showConventions} /><VoiceLeadingCoach measures={chordMeasures} selectedId={effectiveSelectedChordId} doMidi={doMidi} scale={scale} showConventions={showConventions} /></div> : null}
      {focusLens === "chords" && chordFocusMode === "change" ? chordMotionEchoSession
        ? <ChordMotionEcho session={chordMotionEchoSession} sourceBeforeEvents={chordMotionEchoSourceBeforeEvents} sourceAfterEvents={chordMotionEchoSourceAfterEvents} attempt={chordMotionEchoAttempt} attemptProgress={chordMotionEchoCandidates.length} pendingNotes={chordMotionEchoCandidates[0]?.notes ?? []} doMidi={doMidi} scale={scale} soundModelId={soundModelId} showConventions={showConventions} onEnd={() => setChordMotionEchoSession(null)} onRetry={retryChordMotionEcho} onReflect={beginChordMotionEchoReflection} />
        : <ChordChangeLenses measures={chordMeasures} selectedId={effectiveSelectedChordId} doMidi={doMidi} scale={scale} soundModelId={soundModelId} showConventions={showConventions} onReflect={beginChordChangeReflection} onStartMotionEcho={beginChordMotionEcho} /> : null}
      {focusLens === "chords" && chordFocusMode === "echo" ? <ChordVoicingEcho session={chordVoicingEchoSession} sourceEvents={chordVoicingEchoSourceEvents} sourceCandidate={selectedChordMeasure} attempt={chordVoicingEchoAttempt} doMidi={doMidi} scale={scale} soundModelId={soundModelId} showConventions={showConventions} onStart={beginChordVoicingEcho} onEnd={() => setChordVoicingEchoSession(null)} onReflect={beginChordVoicingEchoReflection} /> : null}

      {focusLens === "intervals" ? <section className="hud-interval-lesson" aria-label="Interval context lesson">
        <IntervalEcho events={events} target={intervalEchoTarget} doMidi={doMidi} scale={scale} soundModelId={soundModelId} showConventions={showConventions} onSetTarget={setIntervalEchoTarget} onClear={() => setIntervalEchoTarget(null)} onReflect={beginIntervalEchoReflection} />
        <SharedCycleLens notes={soundingAnalysisNotes} doMidi={doMidi} scale={scale} showConventions={showConventions} />
        <details className="hud-interval-tools">
          <summary><span>Inspect the sounding field</span><small>Optional interval network and assumed-partial microscope</small></summary>
          <div className="piano-focus-grid is-interval-practice"><RelationshipTexture notes={soundingAnalysisNotes} inheritedNotes={inheritedAnalysisNotes} excludedInheritedNotes={excludedInheritedNotes} doMidi={doMidi} scale={scale} showConventions={showConventions} /><PartialInteractionMicroscope notes={soundingAnalysisNotes} focusedNote={focusedEvent?.note ?? null} doMidi={doMidi} scale={scale} soundModelId={soundModelId} showConventions={showConventions} /></div>
        </details>
      </section> : null}

      {focusLens === "explore" && !phraseCompareSession ? <EvidenceTrace measures={measures} chordMeasures={chordMeasures} events={events} selectedChordId={effectiveSelectedChordId} /> : null}

      {isShortHudFocus ? null : focusLens === "explore" && !phraseCompareSession
        ? <LastAttackChange events={events} focusedId={focusedEvent?.id ?? null} doMidi={doMidi} scale={scale} showConventions={showConventions} onReflect={() => selectFocusLens("experience")} />
        : <footer className="piano-hud-insight" aria-live="polite"><span>What changed?</span><strong>{newestInsight}</strong><small>The ribbon retains sixty seconds while the coordinated views magnify the latest seven attacks. Piano Hz values assume 12-TET at A4=440; pitch bend, instrument tuning, and connected piano or DAW audio pitch are not read. Crunch and the spectral share of repose use the selected {soundModel.shortLabel.toLowerCase()} teaching spectrum; pull toward Do does not. Musical goodness still depends on timing, style, memory, intention, timbre, and your response.</small></footer>}
    </section>
  );
}
