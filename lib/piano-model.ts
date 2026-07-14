import { centsFromRatio } from "./music-math.ts";

export type PianoScale = {
  id: "bright-seven" | "shadow-seven" | "open-five" | "blues-six";
  name: string;
  conventionalName: string;
  character: string;
  steps: number[];
  solfege: string[];
};

export type MidiMessage =
  | { type: "note-on"; note: number; velocity: number; channel: number }
  | { type: "note-off"; note: number; channel: number }
  | { type: "sustain"; down: boolean; channel: number }
  | { type: "other" };

export type ScaleCandidate = {
  scale: PianoScale;
  rootPitchClass: number;
  uniqueNoteCount: number;
  inScaleCount: number;
  routeCoveredCount: number;
  matchFraction: number;
  coverageFraction: number;
  homePresent: boolean;
  fit: number;
};

export type TonalTendency = {
  homePull: number;
  homeEvidence: number;
  hasHome: boolean;
  directNeighborCount: number;
  fifthPresent: boolean;
};

export type RollingNoteEvent = {
  note: number;
};

export type TimedNoteAttack = RollingNoteEvent & {
  id: number;
  onsetMs: number;
  fieldNotes: number[];
};

export type ChordGesture<T extends TimedNoteAttack = TimedNoteAttack> = {
  id: string;
  attacks: T[];
  attackedNotes: number[];
  inheritedNotes: number[];
  soundingNotesAtClose: number[];
  startMs: number;
  endMs: number;
  spreadMs: number;
  temporalCompactness: number;
  kind: "together" | "rolled";
};

export type ChordBoundaryCorrection = "break" | "join";

export type ChordTransitionEvidence = {
  commonPitchClassCount: number;
  pitchSetNovelty: number;
  voiceMotion: number;
  rootTravel: number;
  rootTravelSteps: number | null;
};

export type VoiceLeadingStrand = {
  from: number | null;
  to: number | null;
  semitones: number;
  motion: "held" | "up" | "down" | "added" | "released";
};

export type VoiceLeadingProfile = {
  strands: VoiceLeadingStrand[];
  largestLeap: number;
  totalMotion: number;
  bassMotion: number;
  motionClasses: Array<"parallel" | "contrary" | "oblique" | "changing voice count">;
};

export type ScaleFrameSnapshot = {
  eventIndex: number;
  leading: ScaleCandidate | null;
  runnersUp: ScaleCandidate[];
  stable: ScaleCandidate | null;
  changed: boolean;
  distinctPitchClasses: number;
  evidenceLabel: "no evidence" | "little evidence" | "several compatible frames" | "distinct within this catalog";
};

export type ScaleWalkAttempt = {
  note: number;
  kind: "find-do" | "started" | "matched" | "complete" | "restarted" | "try-again";
  expectedMidi: number | null;
  expectedGap: number | null;
  actualGap: number | null;
};

export type AscendingScaleWalk = {
  status: "waiting-do" | "walking" | "complete";
  baseMidi: number | null;
  routeOffsets: number[];
  matchedNotes: number[];
  nextIndex: number;
  expectedMidi: number | null;
  attemptCount: number;
  errorCount: number;
  lastAttempt: ScaleWalkAttempt | null;
};

export type PerformedScaleFingerprintAttempt = {
  note: number;
  kind: "started" | "extended" | "complete" | "try-again";
  actualGap: number | null;
  expectedGap: number | null;
  reason: "descending" | "beyond-octave" | "wrong-gap" | null;
};

export type PerformedScaleFingerprint = {
  status: "waiting" | "building" | "complete";
  baseMidi: number | null;
  matchedNotes: number[];
  positions: number[];
  steps: number[];
  octaveRemaining: number;
  expectedMidi: number | null;
  expectedGap: number | null;
  attemptCount: number;
  errorCount: number;
  lastAttempt: PerformedScaleFingerprintAttempt | null;
};

export type ScaleFingerprintMatch = {
  scale: PianoScale;
  rotation: number;
  exactFromDo: boolean;
};

export type ControlledSonorityFieldId = "aligned" | "lowered-middle" | "held-open" | "close-cluster";

export type ControlledSonorityField = {
  id: ControlledSonorityFieldId;
  label: string;
  offsets: number[];
  relationship: string;
  instruction: string;
};

export type ControlledSonorityChange = {
  kind: "same" | "one-added" | "one-removed" | "multiple";
  baselineNotes: number[];
  currentNotes: number[];
  keptNotes: number[];
  addedNotes: number[];
  removedNotes: number[];
  changedNote: number | null;
  changedIntervals: Array<{
    lower: number;
    upper: number;
    distance: ReturnType<typeof intervalLandmark>;
  }>;
  baselineSpan: number;
  currentSpan: number;
  spanDelta: number;
};

export type PerformanceEvidenceEvent = RollingNoteEvent & {
  velocity?: number;
  onsetMs: number;
  keyReleaseMs?: number | null;
  releaseMs?: number | null;
  fieldNotes?: number[];
};

export type TonalGravityCandidate = {
  rootPitchClass: number;
  scale: PianoScale;
  score: number;
  components: {
    routeFit: number;
    duration: number;
    recurrence: number;
    accent: number;
    bass: number;
    ending: number;
  };
};

export type TonalGravityComponent = keyof TonalGravityCandidate["components"];
export type TonalGravityCue = Exclude<TonalGravityComponent, "routeFit">;

export const TONAL_GRAVITY_WEIGHTS: Record<TonalGravityComponent, number> = {
  routeFit: 0.42,
  duration: 0.17,
  recurrence: 0.14,
  accent: 0.09,
  bass: 0.08,
  ending: 0.1,
};

export type TonalGravityCounterfactual = {
  targetPitchClass: number;
  cue: TonalGravityCue;
  baseline: TonalGravityCandidate[];
  counterfactual: TonalGravityCandidate[];
  targetBefore: TonalGravityCandidate;
  targetAfter: TonalGravityCandidate;
  baselineRank: number;
  counterfactualRank: number;
  scoreDelta: number;
};

export type PhraseLensComparison = {
  sound: {
    meanMidiA: number;
    meanMidiB: number;
    pitchSpanA: number;
    pitchSpanB: number;
    meanVelocityA: number;
    meanVelocityB: number;
  };
  relationships: {
    intervalPathA: number[];
    intervalPathB: number[];
    changedMoveCount: number;
    sameIntervalPath: boolean;
    uniformTransposition: number | null;
  };
  motion: {
    phraseMsA: number;
    phraseMsB: number;
    timingShapeDistance: number | null;
    sameTimingShape: boolean;
    tempoRatio: number | null;
    overlapShareA: number;
    overlapShareB: number;
  };
  context: {
    leadingCenterA: number;
    leadingCenterB: number;
    leadingScaleIdA: PianoScale["id"];
    leadingScaleIdB: PianoScale["id"];
    clarityA: number;
    clarityB: number;
    endingPitchClassA: number;
    endingPitchClassB: number;
  };
};

export type PhraseChangeIntention = "transpose" | "timing" | "touch" | "articulation" | "interval" | "ending";
export type PhraseChangeLens = "sound" | "relationships" | "motion" | "context";
export type PhraseChangeObservation = "register" | "span" | "touch" | "intervalPath" | "timing" | "articulation" | "ending" | "context";

export type PhraseChangeProfile = {
  intention: PhraseChangeIntention;
  targetObserved: boolean;
  controlPreserved: boolean;
  observations: Record<PhraseChangeObservation, boolean>;
  changedLenses: PhraseChangeLens[];
  invariantLenses: PhraseChangeLens[];
  otherChangedLenses: PhraseChangeLens[];
};

export type ResolutionFork = {
  id: "center-return" | "least-motion" | "fifths-neighbor" | "fresh-route" | "alternate-route";
  label: string;
  note: number;
  pitchClass: number;
  movement: number;
  explanation: string;
};

export type ArticulationKind = "held" | "phrase-end" | "detached" | "connected" | "finger-overlap" | "pedal-joined";

export type ArticulationEvidence = {
  eventIndex: number;
  eventId: number;
  kind: ArticulationKind;
  fingerMs: number;
  pedalMs: number;
  soundingMs: number;
  interOnsetMs: number | null;
  silenceMs: number;
  overlapMs: number;
};

export type MotifNoteEvent = RollingNoteEvent & {
  id: number;
  onsetMs: number;
};

export type MotifTransformation = {
  kind: "exact-repeat" | "transposed-repeat" | "rhythmic-variation" | "altered-ending";
  sourceStartIndex: number;
  targetStartIndex: number;
  length: number;
  sourceEventIds: number[];
  targetEventIds: number[];
  transpositionSemitones: number;
  rhythmDistance: number;
  endingDeltaSemitones: number;
  returnAfterInterveningMaterial: boolean;
  confidence: number;
};

export type LandmarkPathId = "pop-loop" | "blues-turn" | "classical-cadence" | "pedal-field";

export type LandmarkPathStep = {
  id: string;
  role: string;
  conventionalName: string;
  rootOffset: number;
  pitchOffsets: number[];
  prompt: string;
};

export type LandmarkPath = {
  id: LandmarkPathId;
  family: string;
  title: string;
  question: string;
  invariant: string;
  characteristic: string;
  provenance: string;
  steps: LandmarkPathStep[];
};

export type LandmarkTransitionProfile = {
  commonPitchClassCount: number;
  totalVoiceMotion: number;
  largestLeap: number;
  rootTravelSteps: number | null;
};

export type ChordTemplate = {
  id: string;
  name: string;
  symbol: string;
  offsets: readonly number[];
};

export type ChordCandidate = {
  rootPitchClass: number;
  template: ChordTemplate;
  exact: boolean;
  score: number;
  commonPitchClasses: number[];
  missingPitchClasses: number[];
  extraPitchClasses: number[];
  bassPitchClass: number;
  inversion: number;
};

export type NearbyChord = {
  rootPitchClass: number;
  pitchClasses: number[];
  degreeIndex: number;
  syllable: string;
  commonPitchClasses: number[];
  changedPitchClasses: number;
  instruction: string;
  candidate: ChordCandidate | null;
};

export const CHROMATIC_SOLFEGE = [
  "Do",
  "Di",
  "Re",
  "Ri",
  "Mi",
  "Fa",
  "Fi",
  "Sol",
  "Si",
  "La",
  "Li",
  "Ti",
] as const;

export const CONVENTIONAL_PITCH_CLASSES = [
  "C",
  "C♯",
  "D",
  "D♯",
  "E",
  "F",
  "F♯",
  "G",
  "G♯",
  "A",
  "A♯",
  "B",
] as const;

export const PIANO_SCALES: PianoScale[] = [
  {
    id: "bright-seven",
    name: "Seven-pitch bright route",
    conventionalName: "major scale / Ionian mode",
    character: "Unequal gaps make a strong route back to Do.",
    steps: [2, 2, 1, 2, 2, 2, 1],
    solfege: ["Do", "Re", "Mi", "Fa", "Sol", "La", "Ti"],
  },
  {
    id: "shadow-seven",
    name: "Seven-pitch shadow route",
    conventionalName: "natural minor / Aeolian mode",
    character: "Three lowered positions change the route while Do stays home.",
    steps: [2, 1, 2, 2, 1, 2, 2],
    solfege: ["Do", "Re", "Me", "Fa", "Sol", "Le", "Te"],
  },
  {
    id: "open-five",
    name: "Five-pitch open route",
    conventionalName: "major pentatonic scale",
    character: "Five wider-spaced positions leave fewer close collisions.",
    steps: [2, 2, 3, 2, 3],
    solfege: ["Do", "Re", "Mi", "Sol", "La"],
  },
  {
    id: "blues-six",
    name: "Six-pitch bending route",
    conventionalName: "minor blues scale",
    character: "A close middle pair creates expressive friction and motion.",
    steps: [3, 2, 1, 1, 3, 2],
    solfege: ["Do", "Me", "Fa", "Fi", "Sol", "Te"],
  },
];

/**
 * Silent, equal-key starting fields for one-change MIDI experiments. They are
 * physical comparison recipes, not emotion buttons or aesthetic rankings.
 */
export const CONTROLLED_SONORITY_FIELDS: ControlledSonorityField[] = [
  {
    id: "aligned",
    label: "Compact aligned field",
    offsets: [0, 4, 7],
    relationship: "two wider gaps · near a 4:5:6 relation",
    instruction: "Build Do–Mi–Sol, then change exactly one note.",
  },
  {
    id: "lowered-middle",
    label: "Lowered-middle field",
    offsets: [0, 3, 7],
    relationship: "lower the middle by one equal key",
    instruction: "Build Do–Me–Sol, then compare one addition or removal.",
  },
  {
    id: "held-open",
    label: "Held-open field",
    offsets: [0, 5, 7],
    relationship: "two linked spans around a close upper pair",
    instruction: "Build Do–Fa–Sol, then disturb only one relationship source.",
  },
  {
    id: "close-cluster",
    label: "Close cluster",
    offsets: [0, 1, 2],
    relationship: "two adjacent equal-key gaps",
    instruction: "Build three neighboring keys, then widen or thin the field once.",
  },
];

export const CHORD_TEMPLATES: ChordTemplate[] = [
  { id: "major", name: "major triad", symbol: "", offsets: [0, 4, 7] },
  { id: "minor", name: "minor triad", symbol: "m", offsets: [0, 3, 7] },
  { id: "diminished", name: "diminished triad", symbol: "°", offsets: [0, 3, 6] },
  { id: "augmented", name: "augmented triad", symbol: "+", offsets: [0, 4, 8] },
  { id: "sus2", name: "suspended second", symbol: "sus2", offsets: [0, 2, 7] },
  { id: "sus4", name: "suspended fourth", symbol: "sus4", offsets: [0, 5, 7] },
  { id: "major6", name: "major sixth", symbol: "6", offsets: [0, 4, 7, 9] },
  { id: "minor6", name: "minor sixth", symbol: "m6", offsets: [0, 3, 7, 9] },
  { id: "dominant7", name: "dominant seventh", symbol: "7", offsets: [0, 4, 7, 10] },
  { id: "major7", name: "major seventh", symbol: "maj7", offsets: [0, 4, 7, 11] },
  { id: "minor7", name: "minor seventh", symbol: "m7", offsets: [0, 3, 7, 10] },
  { id: "half-diminished7", name: "half-diminished seventh", symbol: "ø7", offsets: [0, 3, 6, 10] },
];

/**
 * Generated harmonic archetypes, not transcriptions of particular recordings.
 * Offsets are relative to the learner's movable Do so every path transposes as
 * one relationship-preserving object.
 */
export const LANDMARK_PATHS: LandmarkPath[] = [
  {
    id: "pop-loop",
    family: "Pop loop",
    title: "Four-field return",
    question: "Can you feel direction even though every fourth move begins the cycle again?",
    invariant: "The four-position order repeats while the entire path can move to any Do.",
    characteristic: "Short voice moves bind contrasting fields into a circular, forward-moving loop.",
    provenance: "Generated from the widely used I–V–vi–IV harmonic archetype; no song or recording is reproduced.",
    steps: [
      { id: "home", role: "home field", conventionalName: "I", rootOffset: 0, pitchOffsets: [0, 4, 7], prompt: "Establish the center." },
      { id: "fifth", role: "fifth field", conventionalName: "V", rootOffset: 7, pitchOffsets: [2, 7, 11], prompt: "Keep one position while the root moves near a 3:2 relation." },
      { id: "shadow", role: "shadow field", conventionalName: "vi", rootOffset: 9, pitchOffsets: [0, 4, 9], prompt: "Notice how a darker third arrives through small voice motion." },
      { id: "side", role: "side field", conventionalName: "IV", rootOffset: 5, pitchOffsets: [0, 5, 9], prompt: "Hold two positions and change one before the loop restarts." },
    ],
  },
  {
    id: "blues-turn",
    family: "Blues cycle",
    title: "Seventh-colored turn",
    question: "What stays blues-like while the root visits the side and fifth fields?",
    invariant: "The lowered-seventh color remains present as the root path leaves and returns to Do.",
    characteristic: "Persistent seventh tension makes arrival porous rather than completely smoothed away.",
    provenance: "Generated from a traditional I7–IV7–I7–V7–I7 blues archetype; no melody or recording is reproduced.",
    steps: [
      { id: "home-seven", role: "home with edge", conventionalName: "I7", rootOffset: 0, pitchOffsets: [0, 4, 7, 10], prompt: "Establish home without removing the lowered-seventh edge." },
      { id: "side-seven", role: "side with edge", conventionalName: "IV7", rootOffset: 5, pitchOffsets: [0, 3, 5, 9], prompt: "Move the root to the side field while keeping the seventh color." },
      { id: "home-return", role: "home return", conventionalName: "I7", rootOffset: 0, pitchOffsets: [0, 4, 7, 10], prompt: "Return without becoming fully smooth." },
      { id: "fifth-seven", role: "fifth with pull", conventionalName: "V7", rootOffset: 7, pitchOffsets: [2, 5, 7, 11], prompt: "Let the fifth field create the strongest directed pull." },
      { id: "home-close", role: "home again", conventionalName: "I7", rootOffset: 0, pitchOffsets: [0, 4, 7, 10], prompt: "Resolve the root path while preserving the style-defining edge." },
    ],
  },
  {
    id: "classical-cadence",
    family: "Classical cadence",
    title: "Gathering into home",
    question: "Can several small voice moves make the final field feel more focused than a large leap?",
    invariant: "The cadence is a directed relationship pattern and survives transposition to another Do.",
    characteristic: "Shared tones and half-step motion concentrate expectation before the final arrival.",
    provenance: "Generated from the common ii–V7–I cadence archetype; no composition or performance is reproduced.",
    steps: [
      { id: "prepare", role: "preparation field", conventionalName: "ii", rootOffset: 2, pitchOffsets: [2, 5, 9], prompt: "Begin away from home with a soft preparation." },
      { id: "focus", role: "fifth with pull", conventionalName: "V7", rootOffset: 7, pitchOffsets: [2, 5, 7, 11], prompt: "Keep two positions and sharpen the pull toward Do." },
      { id: "arrive", role: "home arrival", conventionalName: "I", rootOffset: 0, pitchOffsets: [0, 4, 7], prompt: "Move the nearest voices into the home field." },
    ],
  },
  {
    id: "pedal-field",
    family: "Pedal point",
    title: "One tone, changing sky",
    question: "How much can the field change while one physical frequency stays fixed?",
    invariant: "Do remains present in every field while the upper intervals supply the motion.",
    characteristic: "A fixed bass can make changing upper structures feel connected, suspended, or returning.",
    provenance: "Generated from a common pedal-point technique; no composition or performance is reproduced.",
    steps: [
      { id: "pedal-home", role: "clear home", conventionalName: "I", rootOffset: 0, pitchOffsets: [0, 4, 7], prompt: "Establish Do as the fixed floor." },
      { id: "pedal-side", role: "side over Do", conventionalName: "IV/Do", rootOffset: 5, pitchOffsets: [0, 5, 9], prompt: "Keep Do and replace the upper interval field." },
      { id: "pedal-open", role: "open pull over Do", conventionalName: "Vsus/Do", rootOffset: 7, pitchOffsets: [0, 2, 7], prompt: "Keep Do while the upper pair opens a suspended pull." },
      { id: "pedal-return", role: "clear home", conventionalName: "I", rootOffset: 0, pitchOffsets: [0, 4, 7], prompt: "Resolve only the upper voices; the floor never moved." },
    ],
  },
];

const INTERVAL_LANDMARKS = [
  { relationship: "same cycle", conventionalName: "unison", ratio: 1, label: "1:1" },
  { relationship: "closest equal-key step", conventionalName: "minor second", ratio: 16 / 15, label: "16:15" },
  { relationship: "two equal-key steps", conventionalName: "major second", ratio: 9 / 8, label: "9:8" },
  { relationship: "compact 6:5 region", conventionalName: "minor third", ratio: 6 / 5, label: "6:5" },
  { relationship: "compact 5:4 region", conventionalName: "major third", ratio: 5 / 4, label: "5:4" },
  { relationship: "4:3 region", conventionalName: "perfect fourth", ratio: 4 / 3, label: "4:3" },
  { relationship: "octave midpoint √2", conventionalName: "tritone", ratio: Math.SQRT2, label: "√2:1" },
  { relationship: "3:2 region", conventionalName: "perfect fifth", ratio: 3 / 2, label: "3:2" },
  { relationship: "8:5 region", conventionalName: "minor sixth", ratio: 8 / 5, label: "8:5" },
  { relationship: "5:3 region", conventionalName: "major sixth", ratio: 5 / 3, label: "5:3" },
  { relationship: "7:4 region", conventionalName: "minor seventh", ratio: 7 / 4, label: "7:4" },
  { relationship: "near the octave return", conventionalName: "major seventh", ratio: 15 / 8, label: "15:8" },
  { relationship: "frequency doubled", conventionalName: "octave", ratio: 2, label: "2:1" },
] as const;

function modulo(value: number, modulus: number) {
  return ((value % modulus) + modulus) % modulus;
}

export function frequencyFromMidi(note: number, tuningHz = 440) {
  if (!Number.isFinite(note) || !Number.isFinite(tuningHz) || tuningHz <= 0) {
    throw new RangeError("MIDI note and tuning must be finite, and tuning must be positive.");
  }
  return tuningHz * 2 ** ((note - 69) / 12);
}

export function scaleSemitones(scale: PianoScale) {
  const positions = [0];
  let position = 0;
  for (const step of scale.steps.slice(0, -1)) {
    position += step;
    positions.push(position);
  }
  return positions;
}

/**
 * Reads note-on attacks as one ascending octave route. The first matching Do
 * establishes register in any octave. A wrong attack leaves completed steps
 * intact so feedback can compare the attempted and expected physical gaps.
 */
export function evaluateAscendingScaleWalk(notes: number[], doPitchClass: number, scale: PianoScale): AscendingScaleWalk {
  const routeOffsets = [...scaleSemitones(scale), 12];
  const targetDo = modulo(Math.round(doPitchClass), 12);
  let baseMidi: number | null = null;
  let matchedNotes: number[] = [];
  let nextIndex = 0;
  let attemptCount = 0;
  let errorCount = 0;
  let lastAttempt: ScaleWalkAttempt | null = null;

  notes.filter(Number.isFinite).map(Math.round).forEach((note) => {
    if (nextIndex >= routeOffsets.length && baseMidi != null) return;
    attemptCount += 1;
    if (baseMidi == null) {
      if (pitchClassFromMidi(note) !== targetDo) {
        errorCount += 1;
        lastAttempt = { note, kind: "find-do", expectedMidi: null, expectedGap: null, actualGap: null };
        return;
      }
      baseMidi = note;
      matchedNotes = [note];
      nextIndex = 1;
      lastAttempt = { note, kind: "started", expectedMidi: note, expectedGap: null, actualGap: null };
      return;
    }

    const expectedMidi = baseMidi + routeOffsets[nextIndex];
    const previousMidi = baseMidi + routeOffsets[nextIndex - 1];
    const expectedGap = expectedMidi - previousMidi;
    const actualGap = note - previousMidi;
    if (note === expectedMidi) {
      matchedNotes = [...matchedNotes, note];
      nextIndex += 1;
      lastAttempt = { note, kind: nextIndex >= routeOffsets.length ? "complete" : "matched", expectedMidi, expectedGap, actualGap };
      return;
    }
    if (pitchClassFromMidi(note) === targetDo) {
      baseMidi = note;
      matchedNotes = [note];
      nextIndex = 1;
      lastAttempt = { note, kind: "restarted", expectedMidi: note, expectedGap: null, actualGap: null };
      return;
    }
    errorCount += 1;
    lastAttempt = { note, kind: "try-again", expectedMidi, expectedGap, actualGap };
  });

  const complete = baseMidi != null && nextIndex >= routeOffsets.length;
  return {
    status: baseMidi == null ? "waiting-do" : complete ? "complete" : "walking",
    baseMidi,
    routeOffsets,
    matchedNotes,
    nextIndex,
    expectedMidi: baseMidi == null || complete ? null : baseMidi + routeOffsets[nextIndex],
    attemptCount,
    errorCount,
    lastAttempt,
  };
}

/**
 * Builds an unnamed, strictly ascending route from performed key attacks. The
 * first attack establishes an arbitrary origin; reaching exactly twelve equal
 * key steps closes the octave. When expectedSteps is supplied, only the next
 * required gap advances, so one wrong move can be repaired without erasing the
 * relationships already performed.
 */
export function evaluatePerformedScaleFingerprint(notes: number[], expectedSteps: number[] | null = null): PerformedScaleFingerprint {
  const expectedCandidate = expectedSteps?.filter((step) => Number.isInteger(step) && step > 0) ?? null;
  const expected = expectedCandidate?.reduce((sum, step) => sum + step, 0) === 12 ? expectedCandidate : null;
  const expectedTotal = expected?.reduce((sum, step) => sum + step, 0) ?? 12;
  const usable = notes.filter(Number.isFinite).map(Math.round);
  let baseMidi: number | null = null;
  let matchedNotes: number[] = [];
  let positions: number[] = [];
  let steps: number[] = [];
  let attemptCount = 0;
  let errorCount = 0;
  let lastAttempt: PerformedScaleFingerprintAttempt | null = null;

  for (const note of usable) {
    if (baseMidi != null && positions.at(-1) === expectedTotal) break;
    attemptCount += 1;
    if (baseMidi == null) {
      baseMidi = note;
      matchedNotes = [note];
      positions = [0];
      lastAttempt = { note, kind: "started", actualGap: null, expectedGap: expected?.[0] ?? null, reason: null };
      continue;
    }

    const previous = matchedNotes.at(-1)!;
    const actualGap = note - previous;
    const nextExpectedGap = expected?.[steps.length] ?? null;
    const nextPosition = note - baseMidi;
    let reason: PerformedScaleFingerprintAttempt["reason"] = null;
    if (actualGap <= 0) reason = "descending";
    else if (nextPosition > expectedTotal) reason = "beyond-octave";
    else if (nextExpectedGap != null && actualGap !== nextExpectedGap) reason = "wrong-gap";

    if (reason) {
      errorCount += 1;
      lastAttempt = { note, kind: "try-again", actualGap, expectedGap: nextExpectedGap, reason };
      continue;
    }

    matchedNotes = [...matchedNotes, note];
    positions = [...positions, nextPosition];
    steps = [...steps, actualGap];
    const complete = nextPosition === expectedTotal && (!expected || steps.length === expected.length);
    lastAttempt = { note, kind: complete ? "complete" : "extended", actualGap, expectedGap: nextExpectedGap, reason: null };
  }

  const lastPosition = positions.at(-1) ?? 0;
  const complete = baseMidi != null && lastPosition === expectedTotal && (!expected || steps.length === expected.length);
  const expectedGap = complete ? null : expected?.[steps.length] ?? null;
  return {
    status: baseMidi == null ? "waiting" : complete ? "complete" : "building",
    baseMidi,
    matchedNotes,
    positions,
    steps,
    octaveRemaining: Math.max(0, expectedTotal - lastPosition),
    expectedMidi: baseMidi == null || expectedGap == null ? null : matchedNotes.at(-1)! + expectedGap,
    expectedGap,
    attemptCount,
    errorCount,
    lastAttempt,
  };
}

export function pitchClassFromMidi(note: number) {
  return modulo(Math.round(note), 12);
}

export function conventionalPitchName(note: number) {
  const rounded = Math.round(note);
  const octave = Math.floor(rounded / 12) - 1;
  return `${CONVENTIONAL_PITCH_CLASSES[pitchClassFromMidi(rounded)]}${octave}`;
}

export function nearestMidiForPitchClass(pitchClass: number, nearMidi = 60) {
  const target = modulo(Math.round(pitchClass), 12);
  let best = Math.round(nearMidi);
  let bestDistance = Number.POSITIVE_INFINITY;
  for (let note = Math.round(nearMidi) - 12; note <= Math.round(nearMidi) + 12; note += 1) {
    if (pitchClassFromMidi(note) !== target) continue;
    const distance = Math.abs(note - nearMidi);
    if (distance < bestDistance) {
      best = note;
      bestDistance = distance;
    }
  }
  return best;
}

export function noteContext(note: number, doMidi: number, scale: PianoScale) {
  const rounded = Math.round(note);
  const roundedDo = Math.round(doMidi);
  const rawStepsFromDo = rounded - roundedDo;
  const stepsWithinOctave = modulo(rawStepsFromDo, 12);
  const positions = scaleSemitones(scale);
  const degreeIndex = positions.indexOf(stepsWithinOctave);
  const octaveOffset = Math.floor(rawStepsFromDo / 12);
  return {
    note: rounded,
    frequencyHz: frequencyFromMidi(rounded),
    rawStepsFromDo,
    stepsWithinOctave,
    centsFromDo: rawStepsFromDo * 100,
    ratioToDo: 2 ** (rawStepsFromDo / 12),
    octaveOffset,
    inScale: degreeIndex >= 0,
    degreeIndex,
    syllable: degreeIndex >= 0 ? scale.solfege[degreeIndex] : CHROMATIC_SOLFEGE[stepsWithinOctave],
  };
}

export function intervalLandmark(semitones: number) {
  const distance = Math.abs(Math.round(semitones));
  const octaves = Math.floor(distance / 12);
  const withinOctave = distance % 12;
  const index = withinOctave === 0 && distance > 0 ? 12 : withinOctave;
  const base = INTERVAL_LANDMARKS[index];
  const extraOctaves = index === 12 ? Math.max(0, octaves - 1) : octaves;
  const landmarkRatio = base.ratio * 2 ** extraOctaves;
  const equalKeyboardRatio = 2 ** (distance / 12);
  return {
    semitones: distance,
    cents: distance * 100,
    equalKeyboardRatio,
    relationship: distance > 12 ? `${octaves} octave${octaves === 1 ? "" : "s"} + ${base.relationship}` : base.relationship,
    conventionalName: distance > 12 ? `compound ${base.conventionalName}` : base.conventionalName,
    landmarkRatio,
    landmarkLabel: extraOctaves > 0 ? `${base.label} × ${2 ** extraOctaves}` : base.label,
    errorCents: centsFromRatio(equalKeyboardRatio / landmarkRatio),
  };
}

export function pairwiseIntervals(notes: number[]) {
  const sorted = [...new Set(notes.map((note) => Math.round(note)))].sort((a, b) => a - b);
  const pairs: Array<{
    lower: number;
    upper: number;
    distance: ReturnType<typeof intervalLandmark>;
  }> = [];
  for (let lowerIndex = 0; lowerIndex < sorted.length; lowerIndex += 1) {
    for (let upperIndex = lowerIndex + 1; upperIndex < sorted.length; upperIndex += 1) {
      pairs.push({
        lower: sorted[lowerIndex],
        upper: sorted[upperIndex],
        distance: intervalLandmark(sorted[upperIndex] - sorted[lowerIndex]),
      });
    }
  }
  return pairs;
}

/**
 * Attributes a field change only when exactly one MIDI note was added or
 * removed. More complex changes remain visible but are not given a one-note
 * causal explanation.
 */
export function controlledSonorityChange(baseline: number[], current: number[]): ControlledSonorityChange {
  const normalize = (notes: number[]) => [...new Set(notes.filter(Number.isFinite).map(Math.round).filter((note) => note >= 0 && note <= 127))].sort((a, b) => a - b);
  const baselineNotes = normalize(baseline);
  const currentNotes = normalize(current);
  const baselineSet = new Set(baselineNotes);
  const currentSet = new Set(currentNotes);
  const keptNotes = baselineNotes.filter((note) => currentSet.has(note));
  const addedNotes = currentNotes.filter((note) => !baselineSet.has(note));
  const removedNotes = baselineNotes.filter((note) => !currentSet.has(note));
  const kind = addedNotes.length === 0 && removedNotes.length === 0
    ? "same"
    : addedNotes.length === 1 && removedNotes.length === 0
      ? "one-added"
      : removedNotes.length === 1 && addedNotes.length === 0
        ? "one-removed"
        : "multiple";
  const changedNote = kind === "one-added" ? addedNotes[0] : kind === "one-removed" ? removedNotes[0] : null;
  const changedIntervals = changedNote == null ? [] : keptNotes.map((kept) => {
    const lower = Math.min(kept, changedNote);
    const upper = Math.max(kept, changedNote);
    return { lower, upper, distance: intervalLandmark(upper - lower) };
  });
  const span = (notes: number[]) => notes.length < 2 ? 0 : notes.at(-1)! - notes[0];
  const baselineSpan = span(baselineNotes);
  const currentSpan = span(currentNotes);
  return {
    kind,
    baselineNotes,
    currentNotes,
    keptNotes,
    addedNotes,
    removedNotes,
    changedNote,
    changedIntervals,
    baselineSpan,
    currentSpan,
    spanDelta: currentSpan - baselineSpan,
  };
}

export function scaleCoverage(notes: number[], doMidi: number, scale: PianoScale) {
  const contexts = notes.map((note) => noteContext(note, doMidi, scale));
  const activePositions = new Set(contexts.map((context) => context.stepsWithinOctave));
  const positions = scaleSemitones(scale);
  const inScaleCount = contexts.filter((context) => context.inScale).length;
  return {
    noteCount: contexts.length,
    inScaleCount,
    fraction: contexts.length > 0 ? inScaleCount / contexts.length : 0,
    hasHome: activePositions.has(0),
    missingSyllables: positions
      .map((position, index) => ({ position, syllable: scale.solfege[index] }))
      .filter((item) => !activePositions.has(item.position))
      .map((item) => item.syllable),
  };
}

export function inferScaleCandidates(notes: number[], limit = 4): ScaleCandidate[] {
  const pitchClasses = [...new Set(notes.map((note) => pitchClassFromMidi(note)))];
  if (pitchClasses.length === 0 || limit <= 0) return [];

  const candidates: ScaleCandidate[] = [];
  for (let rootPitchClass = 0; rootPitchClass < 12; rootPitchClass += 1) {
    for (const scale of PIANO_SCALES) {
      const route = new Set(scaleSemitones(scale).map((position) => modulo(rootPitchClass + position, 12)));
      const inScaleCount = pitchClasses.filter((pitchClass) => route.has(pitchClass)).length;
      const routeCoveredCount = [...route].filter((pitchClass) => pitchClasses.includes(pitchClass)).length;
      const matchFraction = inScaleCount / pitchClasses.length;
      const coverageFraction = routeCoveredCount / route.size;
      const homePresent = pitchClasses.includes(rootPitchClass);
      const fit = Math.min(1, matchFraction * 0.72 + coverageFraction * 0.18 + (homePresent ? 0.1 : 0));
      candidates.push({
        scale,
        rootPitchClass,
        uniqueNoteCount: pitchClasses.length,
        inScaleCount,
        routeCoveredCount,
        matchFraction,
        coverageFraction,
        homePresent,
        fit,
      });
    }
  }

  return candidates
    .sort((first, second) => (
      second.fit - first.fit
      || second.matchFraction - first.matchFraction
      || second.coverageFraction - first.coverageFraction
      || Number(second.homePresent) - Number(first.homePresent)
      || PIANO_SCALES.indexOf(first.scale) - PIANO_SCALES.indexOf(second.scale)
      || first.rootPitchClass - second.rootPitchClass
    ))
    .slice(0, limit);
}

function sameScaleCandidate(first: ScaleCandidate | null, second: ScaleCandidate | null) {
  return Boolean(first && second && first.rootPitchClass === second.rootPitchClass && first.scale.id === second.scale.id);
}

export function scaleFrameTimeline(notes: number[]): ScaleFrameSnapshot[] {
  let stable: ScaleCandidate | null = null;
  let pendingKey = "";
  let pendingWins = 0;

  return notes.map((_, eventIndex) => {
    const prefix = notes.slice(0, eventIndex + 1);
    const candidates = inferScaleCandidates(prefix, 3);
    const leading = candidates[0] ?? null;
    const distinctPitchClasses = new Set(prefix.map((note) => pitchClassFromMidi(note))).size;
    const gap = leading && candidates[1] ? leading.fit - candidates[1].fit : 0;
    let changed = false;

    if (leading && distinctPitchClasses >= 4) {
      const leadingKey = `${leading.rootPitchClass}:${leading.scale.id}`;
      if (sameScaleCandidate(stable, leading)) {
        pendingKey = "";
        pendingWins = 0;
      } else {
        if (pendingKey === leadingKey) pendingWins += 1;
        else {
          pendingKey = leadingKey;
          pendingWins = 1;
        }
        if (stable == null || gap >= 0.08 || pendingWins >= 2) {
          stable = leading;
          changed = true;
          pendingKey = "";
          pendingWins = 0;
        }
      }
    }

    const evidenceLabel = distinctPitchClasses === 0
      ? "no evidence"
      : distinctPitchClasses < 4
        ? "little evidence"
        : gap >= 0.08
          ? "distinct within this catalog"
          : "several compatible frames";

    return {
      eventIndex,
      leading,
      runnersUp: candidates.slice(1),
      stable,
      changed,
      distinctPitchClasses,
      evidenceLabel,
    };
  });
}

function clampUnit(value: number) {
  return Math.max(0, Math.min(1, value));
}

function performedDuration(event: PerformanceEvidenceEvent, nowMs: number) {
  const keyEnd = event.keyReleaseMs ?? event.releaseMs ?? Math.min(nowMs, event.onsetMs + 420);
  const soundEnd = event.releaseMs ?? Math.min(nowMs, event.onsetMs + 2_500);
  const fingerMs = Math.max(0, Math.min(2_500, keyEnd - event.onsetMs));
  const pedalMs = Math.max(0, Math.min(2_500, soundEnd - keyEnd));
  return clampUnit(Math.log1p((fingerMs + pedalMs * 0.35) / 100) / Math.log1p(25));
}

function tonalGravityScore(components: TonalGravityCandidate["components"]) {
  return clampUnit((Object.keys(TONAL_GRAVITY_WEIGHTS) as TonalGravityComponent[])
    .reduce((score, component) => score + components[component] * TONAL_GRAVITY_WEIGHTS[component], 0));
}

/**
 * Ranks competing center + route hypotheses from performed evidence. The score is
 * deliberately decomposed: pitch-set compatibility is not allowed to masquerade
 * as a measured key, and held, repeated, accented, low, and ending notes remain
 * separately inspectable teaching cues.
 */
export function tonalGravityCandidates(
  events: PerformanceEvidenceEvent[],
  nowMs = events.reduce((latest, event) => Math.max(latest, event.releaseMs ?? event.onsetMs), 0),
  limit = 3,
): TonalGravityCandidate[] {
  const usable = events.filter((event) => Number.isFinite(event.note) && Number.isFinite(event.onsetMs));
  if (!usable.length || !Number.isInteger(limit) || limit <= 0) return [];
  const referenceNow = Number.isFinite(nowMs) ? nowMs : usable.at(-1)!.onsetMs;
  const phraseLow = Math.min(...usable.map((event) => event.note));
  const counts = Array.from({ length: 12 }, () => 0);
  const durations = Array.from({ length: 12 }, () => 0);
  const accents = Array.from({ length: 12 }, () => 0);
  const basses = Array.from({ length: 12 }, () => 0);
  const endings = Array.from({ length: 12 }, () => 0);
  const eventWeights: number[] = [];

  usable.forEach((event, index) => {
    const pitchClass = pitchClassFromMidi(event.note);
    const duration = performedDuration(event, referenceNow);
    const accent = clampUnit((event.velocity ?? 88) / 127);
    const ageMs = Math.max(0, referenceNow - event.onsetMs);
    const recency = 0.35 + 0.65 * Math.exp(-ageMs / 20_000);
    const weight = (0.35 + 0.65 * duration) * (0.65 + 0.35 * accent) * recency;
    counts[pitchClass] += 1;
    durations[pitchClass] += duration * recency;
    accents[pitchClass] += accent;
    if (event.note <= phraseLow + 2) basses[pitchClass] += recency;
    const fromEnd = usable.length - 1 - index;
    if (fromEnd < 3) endings[pitchClass] += [1, 0.45, 0.2][fromEnd];
    eventWeights.push(weight);
  });

  const normalize = (values: number[]) => {
    const maximum = Math.max(...values, 0);
    return values.map((value) => maximum > 0 ? value / maximum : 0);
  };
  const durationEvidence = normalize(durations);
  const recurrenceEvidence = normalize(counts);
  const accentEvidence = normalize(accents.map((value, pitchClass) => counts[pitchClass] ? value / counts[pitchClass] : 0));
  const bassEvidence = normalize(basses);
  const endingEvidence = normalize(endings);
  const totalEventWeight = eventWeights.reduce((sum, weight) => sum + weight, 0);

  const candidates: TonalGravityCandidate[] = [];
  for (let rootPitchClass = 0; rootPitchClass < 12; rootPitchClass += 1) {
    let bestScale = PIANO_SCALES[0];
    let bestRouteFit = -1;
    PIANO_SCALES.forEach((scale) => {
      const route = new Set(scaleSemitones(scale).map((position) => modulo(rootPitchClass + position, 12)));
      const routeFit = usable.reduce((sum, event, index) => sum + (route.has(pitchClassFromMidi(event.note)) ? eventWeights[index] : 0), 0) / totalEventWeight;
      if (routeFit > bestRouteFit) {
        bestScale = scale;
        bestRouteFit = routeFit;
      }
    });
    const components = {
      routeFit: clampUnit(bestRouteFit),
      duration: durationEvidence[rootPitchClass],
      recurrence: recurrenceEvidence[rootPitchClass],
      accent: accentEvidence[rootPitchClass],
      bass: bassEvidence[rootPitchClass],
      ending: endingEvidence[rootPitchClass],
    };
    candidates.push({ rootPitchClass, scale: bestScale, score: tonalGravityScore(components), components });
  }

  return candidates.sort((first, second) => second.score - first.score || first.rootPitchClass - second.rootPitchClass).slice(0, limit);
}

/**
 * Intervenes on one complete contextual-evidence lane while freezing route fit
 * and every other performed cue. The chosen candidate alone receives the
 * strongest value for that lane. This exposes model sensitivity; it does not
 * simulate a new performance or predict a listener's heard tonal center.
 */
export function tonalGravityCounterfactual(
  events: PerformanceEvidenceEvent[],
  targetPitchClass: number,
  cue: TonalGravityCue,
  nowMs = events.reduce((latest, event) => Math.max(latest, event.releaseMs ?? event.onsetMs), 0),
): TonalGravityCounterfactual | null {
  const baseline = tonalGravityCandidates(events, nowMs, 12);
  const supportedCues: TonalGravityCue[] = ["duration", "recurrence", "accent", "bass", "ending"];
  if (baseline.length !== 12 || !supportedCues.includes(cue)) return null;
  const target = modulo(Math.round(targetPitchClass), 12);
  const counterfactual = baseline.map((candidate) => {
    const components = { ...candidate.components, [cue]: candidate.rootPitchClass === target ? 1 : 0 };
    return { ...candidate, components, score: tonalGravityScore(components) };
  }).sort((first, second) => second.score - first.score || first.rootPitchClass - second.rootPitchClass);
  const baselineRank = baseline.findIndex((candidate) => candidate.rootPitchClass === target);
  const counterfactualRank = counterfactual.findIndex((candidate) => candidate.rootPitchClass === target);
  if (baselineRank < 0 || counterfactualRank < 0) return null;
  const targetBefore = baseline[baselineRank];
  const targetAfter = counterfactual[counterfactualRank];
  return {
    targetPitchClass: target,
    cue,
    baseline,
    counterfactual,
    targetBefore,
    targetAfter,
    baselineRank,
    counterfactualRank,
    scoreDelta: targetAfter.score - targetBefore.score,
  };
}

function phraseIntervalPath(events: PerformanceEvidenceEvent[]) {
  return events.slice(1).map((event, index) => event.note - events[index].note);
}

function phraseOnsetShape(events: PerformanceEvidenceEvent[]) {
  const gaps = events.slice(1).map((event, index) => Math.max(0, event.onsetMs - events[index].onsetMs));
  const total = gaps.reduce((sum, gap) => sum + gap, 0);
  return total > 0 ? gaps.map((gap) => gap / total) : gaps.map(() => 0);
}

function phraseOverlapShare(events: PerformanceEvidenceEvent[], nowMs: number) {
  if (events.length < 2) return 0;
  const overlappingConnections = events.slice(0, -1).filter((event, index) => {
    const soundEnd = event.releaseMs ?? event.keyReleaseMs ?? nowMs;
    return soundEnd > events[index + 1].onsetMs;
  }).length;
  return overlappingConnections / (events.length - 1);
}

/**
 * Compares two learner-declared phrase specimens through separate physical,
 * relational, temporal, and contextual lenses. It deliberately omits an
 * aggregate similarity, goodness, or experience score: the listener-facing
 * lane must be reported by the learner in the interface.
 */
export function comparePhraseLenses(
  phraseA: PerformanceEvidenceEvent[],
  phraseB: PerformanceEvidenceEvent[],
): PhraseLensComparison | null {
  if (phraseA.length < 3 || phraseB.length < 3) return null;
  const nowA = phraseA.reduce((latest, event) => Math.max(latest, event.releaseMs ?? event.keyReleaseMs ?? event.onsetMs), phraseA.at(-1)!.onsetMs);
  const nowB = phraseB.reduce((latest, event) => Math.max(latest, event.releaseMs ?? event.keyReleaseMs ?? event.onsetMs), phraseB.at(-1)!.onsetMs);
  const notesA = phraseA.map((event) => event.note);
  const notesB = phraseB.map((event) => event.note);
  const intervalPathA = phraseIntervalPath(phraseA);
  const intervalPathB = phraseIntervalPath(phraseB);
  const sameLength = phraseA.length === phraseB.length;
  const changedMoveCount = Math.max(intervalPathA.length, intervalPathB.length)
    - intervalPathA.filter((move, index) => move === intervalPathB[index]).length;
  const sameIntervalPath = sameLength && changedMoveCount === 0;
  const candidateTransposition = sameLength ? phraseB[0].note - phraseA[0].note : null;
  const uniformTransposition = candidateTransposition != null
    && phraseA.every((event, index) => phraseB[index].note - event.note === candidateTransposition)
    ? candidateTransposition
    : null;
  const onsetShapeA = phraseOnsetShape(phraseA);
  const onsetShapeB = phraseOnsetShape(phraseB);
  const timingShapeDistance = sameLength
    ? onsetShapeA.reduce((sum, value, index) => sum + Math.abs(value - onsetShapeB[index]), 0) / Math.max(1, onsetShapeA.length)
    : null;
  const sameTimingShape = timingShapeDistance != null && timingShapeDistance <= 0.04;
  const phraseMsA = Math.max(0, phraseA.at(-1)!.onsetMs - phraseA[0].onsetMs);
  const phraseMsB = Math.max(0, phraseB.at(-1)!.onsetMs - phraseB[0].onsetMs);
  const gravityA = tonalGravityCandidates(phraseA, nowA, 2);
  const gravityB = tonalGravityCandidates(phraseB, nowB, 2);
  return {
    sound: {
      meanMidiA: notesA.reduce((sum, note) => sum + note, 0) / notesA.length,
      meanMidiB: notesB.reduce((sum, note) => sum + note, 0) / notesB.length,
      pitchSpanA: Math.max(...notesA) - Math.min(...notesA),
      pitchSpanB: Math.max(...notesB) - Math.min(...notesB),
      meanVelocityA: phraseA.reduce((sum, event) => sum + (event.velocity ?? 64), 0) / phraseA.length,
      meanVelocityB: phraseB.reduce((sum, event) => sum + (event.velocity ?? 64), 0) / phraseB.length,
    },
    relationships: {
      intervalPathA,
      intervalPathB,
      changedMoveCount,
      sameIntervalPath,
      uniformTransposition,
    },
    motion: {
      phraseMsA,
      phraseMsB,
      timingShapeDistance,
      sameTimingShape,
      tempoRatio: sameTimingShape && phraseMsA > 0 ? phraseMsB / phraseMsA : null,
      overlapShareA: phraseOverlapShare(phraseA, nowA),
      overlapShareB: phraseOverlapShare(phraseB, nowB),
    },
    context: {
      leadingCenterA: gravityA[0].rootPitchClass,
      leadingCenterB: gravityB[0].rootPitchClass,
      leadingScaleIdA: gravityA[0].scale.id,
      leadingScaleIdB: gravityB[0].scale.id,
      clarityA: Math.max(0, gravityA[0].score - (gravityA[1]?.score ?? 0)),
      clarityB: Math.max(0, gravityB[0].score - (gravityB[1]?.score ?? 0)),
      endingPitchClassA: pitchClassFromMidi(phraseA.at(-1)!.note),
      endingPitchClassB: pitchClassFromMidi(phraseB.at(-1)!.note),
    },
  };
}

/**
 * Reads a five-lens comparison against one learner-declared change intention.
 * This does not score execution or claim that one visible difference caused
 * another; it only separates the intended coordinate, its control condition,
 * and other observed lens changes.
 */
export function phraseChangeProfile(
  comparison: PhraseLensComparison,
  intention: PhraseChangeIntention,
): PhraseChangeProfile {
  const register = Math.abs(comparison.sound.meanMidiB - comparison.sound.meanMidiA) >= 0.5;
  const span = comparison.sound.pitchSpanA !== comparison.sound.pitchSpanB;
  const touch = Math.abs(comparison.sound.meanVelocityB - comparison.sound.meanVelocityA) >= 1;
  const intervalPath = !comparison.relationships.sameIntervalPath;
  const durationChanged = comparison.motion.tempoRatio != null && Math.abs(comparison.motion.tempoRatio - 1) > 0.05;
  const timing = !comparison.motion.sameTimingShape || durationChanged;
  const articulation = Math.abs(comparison.motion.overlapShareB - comparison.motion.overlapShareA) > 0.05;
  const ending = comparison.context.endingPitchClassA !== comparison.context.endingPitchClassB;
  const context = comparison.context.leadingCenterA !== comparison.context.leadingCenterB
    || comparison.context.leadingScaleIdA !== comparison.context.leadingScaleIdB
    || Math.abs(comparison.context.clarityB - comparison.context.clarityA) > 0.03
    || ending;
  const observations: PhraseChangeProfile["observations"] = {
    register,
    span,
    touch,
    intervalPath,
    timing,
    articulation,
    ending,
    context,
  };
  const sameAbsolutePitchPath = comparison.relationships.sameIntervalPath
    && comparison.relationships.uniformTransposition === 0;
  const equalMoveCounts = comparison.relationships.intervalPathA.length === comparison.relationships.intervalPathB.length;
  const sameEarlierMoves = equalMoveCounts
    && comparison.relationships.intervalPathA.slice(0, -1).every((move, index) => move === comparison.relationships.intervalPathB[index]);
  const targetObserved = intention === "transpose" ? register
    : intention === "timing" ? timing
      : intention === "touch" ? touch
        : intention === "articulation" ? articulation
          : intention === "interval" ? intervalPath
            : ending;
  const controlPreserved = intention === "transpose"
    ? comparison.relationships.sameIntervalPath && comparison.relationships.uniformTransposition != null
    : intention === "timing" || intention === "touch" || intention === "articulation"
      ? sameAbsolutePitchPath
      : intention === "interval"
        ? equalMoveCounts && comparison.relationships.changedMoveCount === 1
        : sameEarlierMoves && comparison.relationships.changedMoveCount === 1;
  const lensChanged: Record<PhraseChangeLens, boolean> = {
    sound: register || span || touch,
    relationships: intervalPath,
    motion: timing || articulation,
    context,
  };
  const lensOrder: PhraseChangeLens[] = ["sound", "relationships", "motion", "context"];
  const changedLenses = lensOrder.filter((lens) => lensChanged[lens]);
  const invariantLenses = lensOrder.filter((lens) => !lensChanged[lens]);
  const primaryLens: PhraseChangeLens = intention === "transpose" || intention === "touch"
    ? "sound"
    : intention === "timing" || intention === "articulation"
      ? "motion"
      : "relationships";
  return {
    intention,
    targetObserved,
    controlPreserved,
    observations,
    changedLenses,
    invariantLenses,
    otherChangedLenses: changedLenses.filter((lens) => lens !== primaryLens),
  };
}

export function scaleFingerprint(scale: PianoScale, rotation = 0) {
  const length = scale.steps.length;
  if (!length) return { steps: [] as number[], positions: [] as number[], rotation: 0, total: 0 };
  const normalizedRotation = modulo(Math.round(rotation), length);
  const steps = [...scale.steps.slice(normalizedRotation), ...scale.steps.slice(0, normalizedRotation)];
  const positions: number[] = [0];
  steps.slice(0, -1).forEach((step) => positions.push(positions.at(-1)! + step));
  return { steps, positions, rotation: normalizedRotation, total: steps.reduce((sum, step) => sum + step, 0) };
}

/** Finds catalog translations without treating a conventional name as the scale itself. */
export function matchScaleFingerprint(steps: number[]): ScaleFingerprintMatch[] {
  if (!steps.length || steps.some((step) => !Number.isInteger(step) || step <= 0) || steps.reduce((sum, step) => sum + step, 0) !== 12) return [];
  const matches: ScaleFingerprintMatch[] = [];
  PIANO_SCALES.forEach((scale) => {
    if (scale.steps.length !== steps.length) return;
    for (let rotation = 0; rotation < scale.steps.length; rotation += 1) {
      const candidate = scaleFingerprint(scale, rotation).steps;
      if (candidate.every((step, index) => step === steps[index])) {
        matches.push({ scale, rotation, exactFromDo: rotation === 0 });
      }
    }
  });
  return matches;
}

/** Returns contrasting, unranked next-note intentions. It does not predict a correct continuation. */
export function resolutionForks(events: RollingNoteEvent[], rootPitchClass: number, scale: PianoScale, limit = 4): ResolutionFork[] {
  const usable = events.filter((event) => Number.isFinite(event.note));
  if (!usable.length || !Number.isInteger(limit) || limit <= 0) return [];
  const last = Math.round(usable.at(-1)!.note);
  const routePitchClasses = scaleSemitones(scale).map((position) => modulo(rootPitchClass + position, 12));
  const recentPitchClasses = usable.map((event) => pitchClassFromMidi(event.note));
  const forks: ResolutionFork[] = [];
  const add = (id: ResolutionFork["id"], label: string, pitchClass: number, explanation: string) => {
    if (forks.some((fork) => fork.pitchClass === pitchClass)) return;
    const note = nearestMidiForPitchClass(pitchClass, last);
    forks.push({ id, label, note, pitchClass, movement: note - last, explanation });
  };

  add("center-return", "Return to the center", modulo(rootPitchClass, 12), "Tests the selected Do as a home arrival.");
  const leastMotion = routePitchClasses
    .filter((pitchClass) => pitchClass !== pitchClassFromMidi(last))
    .map((pitchClass) => ({ pitchClass, distance: Math.abs(nearestMidiForPitchClass(pitchClass, last) - last) }))
    .sort((first, second) => first.distance - second.distance || first.pitchClass - second.pitchClass)[0];
  if (leastMotion) add("least-motion", "Move the least", leastMotion.pitchClass, "Keeps the next hand move as small as this route permits.");
  add("fifths-neighbor", "Visit the fifths neighbor", modulo(rootPitchClass + 7, 12), "Tests the near-3:2 neighbor of the proposed center.");
  const fresh = routePitchClasses
    .map((pitchClass) => ({ pitchClass, lastSeen: recentPitchClasses.lastIndexOf(pitchClass), distance: Math.abs(nearestMidiForPitchClass(pitchClass, last) - last) }))
    .sort((first, second) => first.lastSeen - second.lastSeen || first.distance - second.distance)[0];
  if (fresh) add("fresh-route", "Refresh the route", fresh.pitchClass, "Chooses the least-recent pitch class inside the current route.");
  routePitchClasses.forEach((pitchClass) => {
    if (forks.length < limit) add("alternate-route", "Try another route tone", pitchClass, "Offers another in-route continuation when two intentions point to the same key.");
  });
  return forks.slice(0, limit);
}

/**
 * Separates finger contact, pedal extension, and the connection to the next
 * attack. The labels are tempo-relative descriptions of captured MIDI timing,
 * not claims about intended notation or performance technique.
 */
export function articulationTimeline(events: Array<PerformanceEvidenceEvent & { id: number }>, nowMs: number): ArticulationEvidence[] {
  const referenceNow = Number.isFinite(nowMs) ? nowMs : events.at(-1)?.onsetMs ?? 0;
  return events.map((event, eventIndex) => {
    const next = events[eventIndex + 1];
    const keyEnd = event.keyReleaseMs ?? event.releaseMs ?? referenceNow;
    const soundEnd = event.releaseMs ?? referenceNow;
    const fingerMs = Math.max(0, keyEnd - event.onsetMs);
    const soundingMs = Math.max(fingerMs, soundEnd - event.onsetMs);
    const pedalMs = Math.max(0, soundingMs - fingerMs);
    const interOnsetMs = next ? Math.max(0, next.onsetMs - event.onsetMs) : null;
    const silenceMs = next ? Math.max(0, next.onsetMs - soundEnd) : 0;
    const overlapMs = next ? Math.max(0, soundEnd - next.onsetMs) : 0;
    let kind: ArticulationKind;
    if (event.keyReleaseMs == null && event.releaseMs == null) kind = "held";
    else if (!next) kind = "phrase-end";
    else {
      const edgeTolerance = Math.max(25, Math.min(80, interOnsetMs! * 0.1));
      if (keyEnd > next.onsetMs + edgeTolerance) kind = "finger-overlap";
      else if (keyEnd < next.onsetMs - edgeTolerance) kind = soundEnd >= next.onsetMs - edgeTolerance ? "pedal-joined" : "detached";
      else kind = "connected";
    }
    return { eventIndex, eventId: event.id, kind, fingerMs, pedalMs, soundingMs, interOnsetMs, silenceMs, overlapMs };
  });
}

function normalizedOnsetGaps(events: MotifNoteEvent[]) {
  const gaps = events.slice(1).map((event, index) => Math.max(0, event.onsetMs - events[index].onsetMs));
  const total = gaps.reduce((sum, gap) => sum + gap, 0);
  return total > 0 ? gaps.map((gap) => gap / total) : gaps.map(() => 0);
}

function averageDistance(first: number[], second: number[]) {
  if (!first.length || first.length !== second.length) return 0;
  return first.reduce((sum, value, index) => sum + Math.abs(value - second[index]), 0) / first.length;
}

function sameNumberSequence(first: number[], second: number[]) {
  return first.length === second.length && first.every((value, index) => value === second[index]);
}

/**
 * Finds literal, transposed, rhythmically varied, and altered-ending returns in
 * non-overlapping three- or four-attack windows. Exact semitone shapes and
 * normalized onset gaps make every classification inspectable.
 */
export function detectMotifTransformations(events: MotifNoteEvent[], limit = 3): MotifTransformation[] {
  const usable = events.filter((event) => Number.isFinite(event.note) && Number.isFinite(event.onsetMs));
  if (usable.length < 6 || !Number.isInteger(limit) || limit <= 0) return [];
  const candidates: Array<MotifTransformation & { score: number }> = [];
  const seenWindowPairs = new Set<string>();

  for (let length = Math.min(4, Math.floor(usable.length / 2)); length >= 3; length -= 1) {
    for (let sourceStartIndex = 0; sourceStartIndex + length * 2 <= usable.length; sourceStartIndex += 1) {
      for (let targetStartIndex = sourceStartIndex + length; targetStartIndex + length <= usable.length; targetStartIndex += 1) {
        const pairKey = `${sourceStartIndex}:${targetStartIndex}`;
        if (seenWindowPairs.has(pairKey)) continue;
        const source = usable.slice(sourceStartIndex, sourceStartIndex + length);
        const target = usable.slice(targetStartIndex, targetStartIndex + length);
        const sourceNotes = source.map((event) => Math.round(event.note));
        const targetNotes = target.map((event) => Math.round(event.note));
        const sourceOffsets = sourceNotes.map((note) => note - sourceNotes[0]);
        const targetOffsets = targetNotes.map((note) => note - targetNotes[0]);
        const rhythmDistance = averageDistance(normalizedOnsetGaps(source), normalizedOnsetGaps(target));
        const rhythmClose = rhythmDistance <= 0.12;
        const exactPitch = sameNumberSequence(sourceNotes, targetNotes);
        const sameShape = sameNumberSequence(sourceOffsets, targetOffsets);
        const transpositionSemitones = targetNotes[0] - sourceNotes[0];
        const prefixShapeMatches = length >= 4 && sameNumberSequence(sourceOffsets.slice(0, -1), targetOffsets.slice(0, -1));
        const endingDeltaSemitones = targetOffsets.at(-1)! - sourceOffsets.at(-1)!;
        let kind: MotifTransformation["kind"] | null = null;
        let baseConfidence = 0;
        if (exactPitch && rhythmClose) {
          kind = "exact-repeat";
          baseConfidence = 1;
        } else if (sameShape && rhythmClose) {
          kind = "transposed-repeat";
          baseConfidence = 0.96;
        } else if (sameShape && rhythmDistance > 0.12 && rhythmDistance <= 0.5) {
          kind = "rhythmic-variation";
          baseConfidence = Math.max(0.68, 0.92 - rhythmDistance * 0.5);
        } else if (prefixShapeMatches && endingDeltaSemitones !== 0 && rhythmClose) {
          kind = "altered-ending";
          baseConfidence = Math.max(0.68, 0.88 - Math.min(12, Math.abs(endingDeltaSemitones)) / 60);
        }
        if (!kind) continue;
        const returnAfterInterveningMaterial = targetStartIndex > sourceStartIndex + length;
        const confidence = clampUnit(baseConfidence + (length === 4 ? 0.025 : 0) + (returnAfterInterveningMaterial ? 0.015 : 0));
        candidates.push({
          kind,
          sourceStartIndex,
          targetStartIndex,
          length,
          sourceEventIds: source.map((event) => event.id),
          targetEventIds: target.map((event) => event.id),
          transpositionSemitones,
          rhythmDistance,
          endingDeltaSemitones,
          returnAfterInterveningMaterial,
          confidence,
          score: confidence + length * 0.01 + targetStartIndex * 0.0001,
        });
        seenWindowPairs.add(pairKey);
      }
    }
  }

  return candidates
    .sort((first, second) => second.score - first.score || second.targetStartIndex - first.targetStartIndex)
    .slice(0, limit)
    // The ranking score is an internal ordering aid, not part of the public motif evidence.
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    .map(({ score: _score, ...candidate }) => candidate);
}

export function pushRollingNoteEvent<T extends RollingNoteEvent>(events: T[], event: T, limit = 7) {
  if (!Number.isInteger(limit) || limit <= 0) return [];
  return [...events, event].slice(-limit);
}

export function pushPhraseEvent<T extends TimedNoteAttack>(events: T[], event: T, windowMs = 60_000, limit = 256) {
  if (!Number.isFinite(windowMs) || windowMs <= 0 || !Number.isInteger(limit) || limit <= 0) return [];
  const threshold = event.onsetMs - windowMs;
  return [...events, event].filter((item) => item.onsetMs >= threshold).slice(-limit);
}

function finalizeChordGesture<T extends TimedNoteAttack>(attacks: T[], maximumSpanMs: number): ChordGesture<T> | null {
  const distinctPitchClasses = new Set(attacks.map((attack) => pitchClassFromMidi(attack.note)));
  if (attacks.length < 2 || distinctPitchClasses.size < 2) return null;
  const first = attacks[0];
  const last = attacks.at(-1)!;
  const attackedNotes = attacks.map((attack) => Math.round(attack.note));
  const attackedSet = new Set(attackedNotes);
  const soundingNotesAtClose = [...new Set(last.fieldNotes.map(Math.round))].sort((a, b) => a - b);
  const spreadMs = Math.max(0, last.onsetMs - first.onsetMs);
  return {
    id: `chord-${first.id}-${last.id}`,
    attacks: [...attacks],
    attackedNotes,
    inheritedNotes: soundingNotesAtClose.filter((note) => !attackedSet.has(note)),
    soundingNotesAtClose,
    startMs: first.onsetMs,
    endMs: last.onsetMs,
    spreadMs,
    temporalCompactness: Math.max(0, 1 - spreadMs / maximumSpanMs),
    kind: spreadMs <= 90 ? "together" : "rolled",
  };
}

export function groupChordGestures<T extends TimedNoteAttack>(
  events: T[],
  gapMs: number,
  maximumSpanMs = gapMs * 2,
  boundaryCorrections: Readonly<Record<number, ChordBoundaryCorrection>> = {},
): ChordGesture<T>[] {
  if (!Number.isFinite(gapMs) || gapMs <= 0 || !Number.isFinite(maximumSpanMs) || maximumSpanMs < gapMs) return [];
  const gestures: ChordGesture<T>[] = [];
  let cluster: T[] = [];

  const closeCluster = () => {
    const gesture = finalizeChordGesture(cluster, maximumSpanMs);
    if (gesture) gestures.push(gesture);
    cluster = [];
  };

  events.forEach((event) => {
    if (!cluster.length) {
      cluster = [event];
      return;
    }
    const first = cluster[0];
    const previous = cluster.at(-1)!;
    const correction = boundaryCorrections[event.id];
    const joinsPrevious = correction === "join" || (correction !== "break" && event.onsetMs - previous.onsetMs <= gapMs);
    const staysWithinMaximum = correction === "join" || event.onsetMs - first.onsetMs <= maximumSpanMs;
    if (joinsPrevious && staysWithinMaximum) cluster.push(event);
    else {
      closeCluster();
      cluster = [event];
    }
  });
  closeCluster();
  return gestures;
}

/**
 * Builds the notes used for a chord reading while leaving the physically
 * sounding field untouched. Attacked notes are always members. Inherited
 * held or pedal notes begin as members, but a learner may explicitly exclude
 * any of them when they belong to the preceding harmony instead.
 */
export function interpretedChordNotes<T extends TimedNoteAttack>(
  gesture: ChordGesture<T>,
  excludedInheritedNotes: readonly number[] = [],
) {
  const inherited = new Set(gesture.inheritedNotes.map(Math.round));
  const excluded = new Set(
    excludedInheritedNotes
      .filter(Number.isFinite)
      .map(Math.round)
      .filter((note) => inherited.has(note)),
  );
  return [...new Set([
    ...gesture.attackedNotes.map(Math.round),
    ...gesture.inheritedNotes.map(Math.round).filter((note) => !excluded.has(note)),
  ])].sort((first, second) => first - second);
}

function nearestVoiceDistance(source: number[], target: number[]) {
  if (!source.length || !target.length) return 0;
  return source.reduce((sum, note) => sum + Math.min(...target.map((targetNote) => Math.abs(note - targetNote))), 0) / source.length;
}

function minimumVoicePairs(source: number[], target: number[]): Array<[number, number]> {
  if (!source.length || !target.length) return [] as Array<[number, number]>;
  if (source.length > target.length) {
    return minimumVoicePairs(target, source).map(([to, from]) => [from, to] as [number, number]);
  }
  let best: Array<[number, number]> = [];
  let bestCost = Number.POSITIVE_INFINITY;
  const visit = (sourceIndex: number, availableTargetIndices: number[], pairs: Array<[number, number]>, cost: number) => {
    if (sourceIndex >= source.length) {
      if (cost < bestCost) { best = pairs; bestCost = cost; }
      return;
    }
    availableTargetIndices.forEach((targetIndex, optionIndex) => {
      const nextCost = cost + Math.abs(source[sourceIndex] - target[targetIndex]);
      if (nextCost > bestCost) return;
      visit(
        sourceIndex + 1,
        availableTargetIndices.filter((_, index) => index !== optionIndex),
        [...pairs, [source[sourceIndex], target[targetIndex]]],
        nextCost,
      );
    });
  };
  visit(0, target.map((_, index) => index), [], 0);
  return best;
}

function indicesConsumedByValues(notes: number[], values: number[]) {
  const used = new Set<number>();
  values.forEach((value) => {
    const index = notes.findIndex((note, noteIndex) => note === value && !used.has(noteIndex));
    if (index >= 0) used.add(index);
  });
  return used;
}

export function voiceLeadingProfile(previousNotes: number[], currentNotes: number[]): VoiceLeadingProfile {
  const previous = previousNotes.filter(Number.isFinite).map(Math.round).sort((a, b) => a - b);
  const current = currentNotes.filter(Number.isFinite).map(Math.round).sort((a, b) => a - b);
  const pairs = minimumVoicePairs(previous, current);
  const strands: VoiceLeadingStrand[] = pairs.map(([from, to]) => {
    const semitones = to - from;
    return { from, to, semitones, motion: semitones === 0 ? "held" : semitones > 0 ? "up" : "down" };
  });
  const usedPrevious = indicesConsumedByValues(previous, pairs.map(([from]) => from));
  const usedCurrent = indicesConsumedByValues(current, pairs.map(([, to]) => to));
  previous.forEach((note, index) => {
    if (!usedPrevious.has(index)) strands.push({ from: note, to: null, semitones: 0, motion: "released" });
  });
  current.forEach((note, index) => {
    if (!usedCurrent.has(index)) strands.push({ from: null, to: note, semitones: 0, motion: "added" });
  });
  strands.sort((first, second) => (first.from ?? first.to ?? 0) - (second.from ?? second.to ?? 0));
  const moved = strands.filter((strand) => strand.from != null && strand.to != null && strand.semitones !== 0);
  const hasUp = moved.some((strand) => strand.semitones > 0);
  const hasDown = moved.some((strand) => strand.semitones < 0);
  const hasHeld = strands.some((strand) => strand.motion === "held");
  const motionClasses: VoiceLeadingProfile["motionClasses"] = [];
  if (moved.length >= 2 && hasUp !== hasDown) motionClasses.push("parallel");
  if (hasUp && hasDown) motionClasses.push("contrary");
  if (hasHeld && moved.length) motionClasses.push("oblique");
  if (strands.some((strand) => strand.motion === "added" || strand.motion === "released")) motionClasses.push("changing voice count");
  return {
    strands,
    largestLeap: moved.reduce((largest, strand) => Math.max(largest, Math.abs(strand.semitones)), 0),
    totalMotion: moved.reduce((total, strand) => total + Math.abs(strand.semitones), 0),
    bassMotion: previous.length && current.length ? current[0] - previous[0] : 0,
    motionClasses,
  };
}

export function chordTransitionEvidence(
  previousNotes: number[] | null,
  currentNotes: number[],
  previousRootPitchClass: number | null = null,
  currentRootPitchClass: number | null = null,
): ChordTransitionEvidence {
  if (!previousNotes?.length || !currentNotes.length) {
    return { commonPitchClassCount: 0, pitchSetNovelty: 0, voiceMotion: 0, rootTravel: 0, rootTravelSteps: null };
  }
  const previousPitchClasses = pitchClassSet(previousNotes);
  const currentPitchClasses = pitchClassSet(currentNotes);
  const commonPitchClasses = currentPitchClasses.filter((pitchClass) => previousPitchClasses.includes(pitchClass));
  const union = new Set([...previousPitchClasses, ...currentPitchClasses]);
  const bidirectionalMotion = (
    nearestVoiceDistance(previousNotes, currentNotes)
    + nearestVoiceDistance(currentNotes, previousNotes)
  ) / 2;
  let rootTravelSteps: number | null = null;
  if (previousRootPitchClass != null && currentRootPitchClass != null) {
    const previousStep = fifthStepForPitchClass(previousRootPitchClass);
    const currentStep = fifthStepForPitchClass(currentRootPitchClass);
    const forward = modulo(currentStep - previousStep, 12);
    rootTravelSteps = Math.min(forward, 12 - forward);
  }
  return {
    commonPitchClassCount: commonPitchClasses.length,
    pitchSetNovelty: union.size ? 1 - commonPitchClasses.length / union.size : 0,
    voiceMotion: Math.min(1, bidirectionalMotion / 12),
    rootTravel: rootTravelSteps == null ? 0 : rootTravelSteps / 6,
    rootTravelSteps,
  };
}

export function voiceChordNear(pitchClasses: number[], sourceNotes: number[] = [], centerMidi = 60) {
  if (!Number.isFinite(centerMidi)) return [];
  const targets = [...new Set(pitchClasses.filter(Number.isFinite).map((pitchClass) => modulo(Math.round(pitchClass), 12)))];
  if (!targets.length || targets.length > 6) return [];
  const center = Math.round(centerMidi);
  const choices = targets.map((pitchClass) => {
    const notes: number[] = [];
    for (let note = center - 24; note <= center + 24; note += 1) {
      if (pitchClassFromMidi(note) === pitchClass) notes.push(note);
    }
    return notes;
  });
  let combinations: number[][] = [[]];
  choices.forEach((notes) => {
    combinations = combinations.flatMap((combination) => notes.map((note) => [...combination, note]));
  });
  const source = sourceNotes.filter(Number.isFinite).map(Math.round).sort((first, second) => first - second);
  const sourceCenter = source.length ? source.reduce((sum, note) => sum + note, 0) / source.length : center;
  const score = (combination: number[]) => {
    const voiced = [...combination].sort((first, second) => first - second);
    const voicedCenter = voiced.reduce((sum, note) => sum + note, 0) / voiced.length;
    const span = voiced.at(-1)! - voiced[0];
    const motion = source.length
      ? (nearestVoiceDistance(source, voiced) + nearestVoiceDistance(voiced, source)) / 2
      : 0;
    const rootInBassPenalty = pitchClassFromMidi(voiced[0]) === targets[0] ? 0 : 0.7;
    return motion * 4
      + Math.abs(voicedCenter - sourceCenter) * 0.15
      + Math.max(0, span - 12) * 0.08
      + (source.length ? 0 : rootInBassPenalty);
  };
  const best = combinations.sort((first, second) => score(first) - score(second))[0];
  return best ? [...best].sort((first, second) => first - second) : [];
}

export function landmarkStepPitchClasses(path: LandmarkPath, stepIndex: number, doPitchClass: number) {
  const step = path.steps[stepIndex];
  if (!step || !Number.isFinite(doPitchClass)) return [];
  return [...new Set(step.pitchOffsets.map((offset) => modulo(Math.round(doPitchClass + offset), 12)))].sort((first, second) => first - second);
}

export function matchesLandmarkStep(path: LandmarkPath, stepIndex: number, playedNotes: number[], doPitchClass: number) {
  const target = landmarkStepPitchClasses(path, stepIndex, doPitchClass);
  const played = [...new Set(playedNotes.filter(Number.isFinite).map(pitchClassFromMidi))].sort((first, second) => first - second);
  return target.length > 0 && target.length === played.length && target.every((pitchClass, index) => pitchClass === played[index]);
}

/** Produces one stable, compact voicing sequence so ghost keys never shift while a chord is being entered. */
export function voiceLandmarkPath(path: LandmarkPath, doMidi: number) {
  if (!Number.isFinite(doMidi)) return [];
  const rootPitchClass = pitchClassFromMidi(doMidi);
  let previous: number[] = [];
  return path.steps.map((_, stepIndex) => {
    const pitchClasses = landmarkStepPitchClasses(path, stepIndex, rootPitchClass);
    const voiced = voiceChordNear(pitchClasses, previous, doMidi);
    previous = voiced;
    return voiced;
  });
}

export function landmarkTransitionProfile(path: LandmarkPath, stepIndex: number, doMidi: number): LandmarkTransitionProfile | null {
  if (stepIndex <= 0 || stepIndex >= path.steps.length || !Number.isFinite(doMidi)) return null;
  const voicings = voiceLandmarkPath(path, doMidi);
  const previous = voicings[stepIndex - 1];
  const current = voicings[stepIndex];
  if (!previous?.length || !current?.length) return null;
  const rootPitchClass = pitchClassFromMidi(doMidi);
  const previousRoot = modulo(rootPitchClass + path.steps[stepIndex - 1].rootOffset, 12);
  const currentRoot = modulo(rootPitchClass + path.steps[stepIndex].rootOffset, 12);
  const transition = chordTransitionEvidence(previous, current, previousRoot, currentRoot);
  const voices = voiceLeadingProfile(previous, current);
  return {
    commonPitchClassCount: transition.commonPitchClassCount,
    totalVoiceMotion: voices.totalMotion,
    largestLeap: voices.largestLeap,
    rootTravelSteps: transition.rootTravelSteps,
  };
}

function pitchClassSet(notes: number[]) {
  return [...new Set(notes.map((note) => pitchClassFromMidi(note)))].sort((first, second) => first - second);
}

export function identifyChordCandidates(notes: number[], limit = 3): ChordCandidate[] {
  if (notes.length < 2 || limit <= 0) return [];
  const active = pitchClassSet(notes);
  const activeSet = new Set(active);
  const bassPitchClass = pitchClassFromMidi(Math.min(...notes));
  const candidates: ChordCandidate[] = [];

  for (let rootPitchClass = 0; rootPitchClass < 12; rootPitchClass += 1) {
    for (const template of CHORD_TEMPLATES) {
      const target = template.offsets.map((offset) => modulo(rootPitchClass + offset, 12)).sort((first, second) => first - second);
      const targetSet = new Set(target);
      const commonPitchClasses = active.filter((pitchClass) => targetSet.has(pitchClass));
      const missingPitchClasses = target.filter((pitchClass) => !activeSet.has(pitchClass));
      const extraPitchClasses = active.filter((pitchClass) => !targetSet.has(pitchClass));
      const templateCoverage = commonPitchClasses.length / target.length;
      const activePurity = commonPitchClasses.length / active.length;
      const exact = missingPitchClasses.length === 0 && extraPitchClasses.length === 0;
      const inversion = target.indexOf(bassPitchClass);
      candidates.push({
        rootPitchClass,
        template,
        exact,
        score: Math.min(1, templateCoverage * 0.6 + activePurity * 0.4),
        commonPitchClasses,
        missingPitchClasses,
        extraPitchClasses,
        bassPitchClass,
        inversion: inversion < 0 ? -1 : inversion,
      });
    }
  }

  return candidates
    .sort((first, second) => (
      Number(second.exact) - Number(first.exact)
      || second.score - first.score
      || first.missingPitchClasses.length - second.missingPitchClasses.length
      || first.extraPitchClasses.length - second.extraPitchClasses.length
      || Number(second.rootPitchClass === bassPitchClass) - Number(first.rootPitchClass === bassPitchClass)
      || first.rootPitchClass - second.rootPitchClass
    ))
    .slice(0, limit);
}

function chordMoveInstruction(current: number[], target: number[], common: number[]) {
  const currentOnly = current.filter((pitchClass) => !common.includes(pitchClass));
  const targetOnly = target.filter((pitchClass) => !common.includes(pitchClass));
  if (currentOnly.length === 1 && targetOnly.length === 1) {
    const upward = modulo(targetOnly[0] - currentOnly[0], 12);
    const downward = modulo(currentOnly[0] - targetOnly[0], 12);
    const direction = upward <= downward ? "up" : "down";
    const distance = Math.min(upward, downward);
    return `keep ${common.length} · move ${CONVENTIONAL_PITCH_CLASSES[currentOnly[0]]} ${direction} ${distance} key${distance === 1 ? "" : "s"}`;
  }
  if (currentOnly.length === 0 && targetOnly.length === 1) {
    return `keep ${common.length} · add ${CONVENTIONAL_PITCH_CLASSES[targetOnly[0]]}`;
  }
  return `keep ${common.length} · change ${Math.max(currentOnly.length, targetOnly.length)} tone${Math.max(currentOnly.length, targetOnly.length) === 1 ? "" : "s"}`;
}

export function nearbyScaleChords(notes: number[], doMidi: number, scale: PianoScale, limit = 3): NearbyChord[] {
  if (limit <= 0) return [];
  const current = pitchClassSet(notes);
  const positions = scaleSemitones(scale);
  const doPitchClass = pitchClassFromMidi(doMidi);
  const results = positions.map((position, degreeIndex) => {
    const degreePositions = [degreeIndex, degreeIndex + 2, degreeIndex + 4].map((index) => positions[index % positions.length] + (index >= positions.length ? 12 : 0));
    const pitchClasses = [...new Set(degreePositions.map((degreePosition) => modulo(doPitchClass + degreePosition, 12)))].sort((first, second) => first - second);
    const commonPitchClasses = current.filter((pitchClass) => pitchClasses.includes(pitchClass));
    const changedPitchClasses = current.filter((pitchClass) => !pitchClasses.includes(pitchClass)).length
      + pitchClasses.filter((pitchClass) => !current.includes(pitchClass)).length;
    const rootPitchClass = modulo(doPitchClass + position, 12);
    const candidate = identifyChordCandidates(pitchClasses, 1)[0] ?? null;
    return {
      rootPitchClass,
      pitchClasses,
      degreeIndex,
      syllable: scale.solfege[degreeIndex],
      commonPitchClasses,
      changedPitchClasses,
      instruction: chordMoveInstruction(current, pitchClasses, commonPitchClasses),
      candidate,
    };
  });

  return results
    .filter((result) => result.changedPitchClasses > 0 || current.length === 0)
    .sort((first, second) => (
      first.changedPitchClasses - second.changedPitchClasses
      || second.commonPitchClasses.length - first.commonPitchClasses.length
      || first.degreeIndex - second.degreeIndex
    ))
    .slice(0, limit);
}

const HOME_PULL_BY_POSITION = [0, 1, 0.58, 0.38, 0.32, 0.48, 0.42, 0.75, 0.38, 0.32, 0.52, 1] as const;

export function tonalTendency(notes: number[], doMidi: number, scale: PianoScale): TonalTendency {
  const positions = [...new Set(notes.map((note) => noteContext(note, doMidi, scale).stepsWithinOctave))];
  if (positions.length === 0) {
    return { homePull: 0, homeEvidence: 0, hasHome: false, directNeighborCount: 0, fifthPresent: false };
  }

  const hasHome = positions.includes(0);
  const fifthPresent = positions.includes(7);
  const directNeighborCount = positions.filter((position) => position === 1 || position === 11).length;
  const nonHomePositions = positions.filter((position) => position !== 0);
  const rawPull = nonHomePositions.length > 0
    ? nonHomePositions.reduce((sum, position) => sum + HOME_PULL_BY_POSITION[position], 0) / nonHomePositions.length
    : 0;
  const coverage = scaleCoverage(notes, doMidi, scale);

  return {
    homePull: Math.min(1, rawPull * (hasHome ? 0.45 : 1)),
    homeEvidence: Math.min(1, (hasHome ? 0.55 : 0) + (fifthPresent ? 0.2 : 0) + coverage.fraction * 0.25),
    hasHome,
    directNeighborCount,
    fifthPresent,
  };
}

export function resolutionDirection(previousArrival: number | null, currentArrival: number) {
  if (previousArrival == null) {
    return { delta: null, label: "first field · building a baseline" };
  }
  const delta = currentArrival - previousArrival;
  if (delta >= 0.08) return { delta, label: "tending toward repose" };
  if (delta <= -0.08) return { delta, label: "moving away from repose" };
  return { delta, label: "holding a similar repose level" };
}

export function fifthStepForPitchClass(pitchClass: number) {
  const target = modulo(Math.round(pitchClass), 12);
  for (let step = 0; step < 12; step += 1) {
    if (modulo(step * 7, 12) === target) return step;
  }
  return 0;
}

export function fifthsCircle() {
  const nodes = Array.from({ length: 12 }, (_, step) => {
    const unfoldedRatio = (3 / 2) ** step;
    const octavesRemoved = Math.floor(Math.log2(unfoldedRatio));
    const foldedRatio = unfoldedRatio / 2 ** octavesRemoved;
    const pitchClass = modulo(step * 7, 12);
    const pureCents = centsFromRatio(foldedRatio);
    const keyboardCents = pitchClass * 100;
    let driftCents = pureCents - keyboardCents;
    if (driftCents > 600) driftCents -= 1200;
    if (driftCents < -600) driftCents += 1200;
    return {
      step,
      pitchClass,
      syllable: CHROMATIC_SOLFEGE[pitchClass],
      foldedRatio,
      pureCents,
      keyboardCents,
      driftCents,
    };
  });
  return {
    nodes,
    closureDriftCents: centsFromRatio((3 / 2) ** 12 / 2 ** 7),
  };
}

/**
 * Thirteen cumulative fifth positions, including the attempted return.
 * `temperamentBlend` moves each fifth from pure 3:2 (0) to 700 cents (1).
 */
export function fifthsSpiral(temperamentBlend = 0) {
  const blend = Math.max(0, Math.min(1, Number.isFinite(temperamentBlend) ? temperamentBlend : 0));
  const pureFifthCents = centsFromRatio(3 / 2);
  const equalFifthCents = 700;
  const displayedFifthCents = pureFifthCents + (equalFifthCents - pureFifthCents) * blend;
  const nodes = Array.from({ length: 13 }, (_, step) => {
    const pureUnfoldedRatio = (3 / 2) ** step;
    const octavesRemoved = Math.floor(Math.log2(pureUnfoldedRatio));
    const foldedRatio = pureUnfoldedRatio / 2 ** octavesRemoved;
    const pureFoldedCents = modulo(step * pureFifthCents, 1200);
    const keyboardFoldedCents = modulo(step * equalFifthCents, 1200);
    const displayedFoldedCents = modulo(step * displayedFifthCents, 1200);
    return {
      step,
      pitchClass: modulo(step * 7, 12),
      octavesRemoved,
      foldedRatio,
      pureFoldedCents,
      keyboardFoldedCents,
      displayedFoldedCents,
      cumulativeDriftCents: step * (displayedFifthCents - equalFifthCents),
    };
  });
  return {
    blend,
    pureFifthCents,
    equalFifthCents,
    displayedFifthCents,
    closureDriftCents: 12 * (displayedFifthCents - equalFifthCents),
    nodes,
  };
}

export function parseMidiMessage(data: ArrayLike<number>): MidiMessage {
  if (data.length < 1) return { type: "other" };
  const status = Number(data[0]);
  const command = status & 0xf0;
  const channel = status & 0x0f;
  const first = Number(data[1] ?? 0);
  const second = Number(data[2] ?? 0);
  if (command === 0x90 && second > 0) {
    return { type: "note-on", note: first, velocity: second, channel };
  }
  if (command === 0x80 || (command === 0x90 && second === 0)) {
    return { type: "note-off", note: first, channel };
  }
  if (command === 0xb0 && first === 64) {
    return { type: "sustain", down: second >= 64, channel };
  }
  return { type: "other" };
}
