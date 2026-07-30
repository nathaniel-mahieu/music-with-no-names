/**
 * Pure domain model for the Sight Shapes piano-reading experience.
 *
 * The model deliberately keeps three related facts separate:
 * - written distance (staff steps / generic interval),
 * - physical keyboard distance (signed semitones), and
 * - the learner's subjective listening language.
 *
 * No function in this file plays audio, reads MIDI devices, or infers fingering.
 */

export const PITCH_LETTERS = ["C", "D", "E", "F", "G", "A", "B"] as const;
export const ACCIDENTALS = ["double-flat", "flat", "natural", "sharp", "double-sharp"] as const;
export const CLEFS = ["treble", "bass"] as const;

export type PitchLetter = (typeof PITCH_LETTERS)[number];
export type Accidental = (typeof ACCIDENTALS)[number];
export type Clef = (typeof CLEFS)[number];
export type ExerciseFamily =
  | "interval"
  | "contour"
  | "triad"
  | "inversion"
  | "arpeggio"
  | "anchor"
  | "transform";
export type ExerciseDifficulty = "foundation" | "developing" | "stretch";

export type NotatedPitch = {
  letter: PitchLetter;
  accidental: Accidental;
  octave: number;
  midi: number;
  /** Diatonic line/space steps from the clef's bottom line (E4 treble, G2 bass). */
  staffStep: number;
  clef: Clef;
  label: string;
};

export type NotatedInterval = {
  from: NotatedPitch;
  to: NotatedPitch;
  /** Inclusive written interval number: same letter = 1, adjacent letter = 2, etc. */
  genericNumber: number;
  simpleGenericNumber: number;
  writtenOctaves: number;
  /** Signed diatonic line/space movement. */
  signedStaffSteps: number;
  /** Signed equal-tempered keyboard movement. */
  signedSemitones: number;
  exactSemitones: number;
  notationDirection: "up" | "down" | "same";
  soundingDirection: "ascending" | "descending" | "stationary";
  label: string;
};

export type SightReadingEventRole =
  | "note"
  | "interval-start"
  | "interval-end"
  | "chord"
  | "arpeggio-tone"
  | "anchor"
  | "moving-tone"
  | "motif"
  | "transformation";

export type SightReadingEvent = {
  id: string;
  onsetBeats: number;
  durationBeats: number;
  pitches: NotatedPitch[];
  role: SightReadingEventRole;
  groupId: string;
  hand: "left" | "right";
};

export type ChordSpacingPair = {
  lowerMidi: number;
  upperMidi: number;
  semitones: number;
};

export type ChordSpacing = {
  notes: number[];
  adjacent: ChordSpacingPair[];
  pairwise: ChordSpacingPair[];
  adjacentSemitones: number[];
  pairwiseSemitones: number[];
  spanSemitones: number;
};

export type ContourReductionSegment = {
  fromEventId: string;
  toEventId: string;
  fromMidi: number;
  toMidi: number;
  signedSemitones: number;
  direction: "up" | "down" | "same";
};

export type FoldedArpeggioReduction = {
  sourceEventIds: string[];
  bassPitchClass: number;
  pitchClasses: number[];
  offsetsFromBass: number[];
  spacing: ChordSpacing;
};

export type AnchorReduction = {
  midi: number;
  label: string;
  eventIds: string[];
  occurrenceCount: number;
  explicit: boolean;
};

export type PatternReductions = {
  contour: ContourReductionSegment[];
  contourSignature: string;
  foldedArpeggio: FoldedArpeggioReduction | null;
  anchors: AnchorReduction[];
};

export type ScaffoldKind =
  | "note-names"
  | "staff-intervals"
  | "semitones"
  | "contour-ribbon"
  | "keyboard-territory"
  | "next-landing"
  | "group-brackets"
  | "chord-gaps"
  | "anchor-pins"
  | "two-word-prompt";

export type ScaffoldStage = "discover" | "connect" | "transfer" | "read";

export type ScaffoldHint = {
  kind: ScaffoldKind;
  label: string;
  reason: string;
  persistent: boolean;
};

export type ScaffoldPlan = Record<ScaffoldStage, ScaffoldHint[]>;

export type PracticeScaffoldState = {
  stage: ScaffoldStage;
  consecutivePasses: number;
  consecutiveNeedsWork: number;
  visibleHints: ScaffoldHint[];
  message: string;
};

export type SightReadingExercise = {
  schemaVersion: 1;
  id: string;
  seed: string;
  family: ExerciseFamily;
  difficulty: ExerciseDifficulty;
  clef: Clef;
  title: string;
  prompt: string;
  events: SightReadingEvent[];
  focus: {
    primary: string;
    notice: string;
    exactIntervals: number[];
    genericIntervals: number[];
    chordSpacings: ChordSpacing[];
  };
  reductions: PatternReductions;
  scaffoldPlan: ScaffoldPlan;
};

export type GenerateSightReadingExerciseOptions = {
  seed: string | number;
  family: ExerciseFamily;
  clef?: Clef;
  difficulty?: ExerciseDifficulty;
  range?: { lowestMidi: number; highestMidi: number };
};

export type SightReadingAttack = {
  id?: string | number;
  onsetMs: number;
  notes: number[];
};

export type AttemptMode = "exact" | "transposable-shape";
export type AttemptDiagnosisKind =
  | "voice-count"
  | "wrong-note"
  | "correct-shape-different-start"
  | "transposition-drift"
  | "wrong-direction"
  | "interval-too-wide"
  | "interval-too-narrow"
  | "chord-spacing"
  | "anchor-lost"
  | "timing"
  | "extra-event";

export type AttemptDiagnosis = {
  kind: AttemptDiagnosisKind;
  severity: "notice" | "retry";
  eventIndex: number;
  eventId: string | null;
  message: string;
  expected?: number[];
  actual?: number[];
  difference?: number;
};

export type EventAttemptComparison = {
  eventIndex: number;
  eventId: string;
  status: "pending" | "correct" | "incorrect";
  expectedNotes: number[];
  actualNotes: number[] | null;
  exactMatch: boolean;
  shapeMatch: boolean;
  spacingMatch: boolean | null;
  transpositionSteps: number | null;
  timingErrorMs: number | null;
  timingMatch: boolean | null;
};

export type SightReadingAttemptEvaluation = {
  mode: AttemptMode;
  complete: boolean;
  passed: boolean;
  inferredTransposition: number | null;
  comparisons: EventAttemptComparison[];
  diagnoses: AttemptDiagnosis[];
  attemptedEventCount: number;
  matchedEventCount: number;
  nextEventIndex: number | null;
  exactAccuracy: number;
  shapeAccuracy: number;
  summary: string;
};

export type EvaluateSightReadingAttemptOptions = {
  mode?: AttemptMode;
  /** Enables relative rhythm checking; pitch/shape checking never depends on it. */
  beatDurationMs?: number;
  timingToleranceMs?: number;
};

export type ReflectionValidationError = "empty" | "word-count" | "invalid-word" | "word-too-long";

export type TwoWordReflectionValidation = {
  valid: boolean;
  normalized: string;
  words: [string, string] | null;
  errors: ReflectionValidationError[];
  prompt: string;
};

const LETTER_INDEX: Record<PitchLetter, number> = {
  C: 0,
  D: 1,
  E: 2,
  F: 3,
  G: 4,
  A: 5,
  B: 6,
};

const NATURAL_PITCH_CLASS: Record<PitchLetter, number> = {
  C: 0,
  D: 2,
  E: 4,
  F: 5,
  G: 7,
  A: 9,
  B: 11,
};

const ACCIDENTAL_OFFSET: Record<Accidental, number> = {
  "double-flat": -2,
  flat: -1,
  natural: 0,
  sharp: 1,
  "double-sharp": 2,
};

const ACCIDENTAL_SYMBOL: Record<Accidental, string> = {
  "double-flat": "𝄫",
  flat: "♭",
  natural: "",
  sharp: "♯",
  "double-sharp": "𝄪",
};

const BOTTOM_LINE_DIATONIC: Record<Clef, number> = {
  treble: 4 * 7 + LETTER_INDEX.E,
  bass: 2 * 7 + LETTER_INDEX.G,
};

const ORDINALS = [
  "unison",
  "second",
  "third",
  "fourth",
  "fifth",
  "sixth",
  "seventh",
  "octave",
] as const;

const STAGE_ORDER: ScaffoldStage[] = ["discover", "connect", "transfer", "read"];

function assertMidi(note: number, label = "MIDI note") {
  if (!Number.isInteger(note) || note < 0 || note > 127) {
    throw new RangeError(`${label} must be an integer from 0 through 127.`);
  }
}

function assertFiniteNonNegative(value: number, label: string) {
  if (!Number.isFinite(value) || value < 0) {
    throw new RangeError(`${label} must be a finite non-negative number.`);
  }
}

function sortedUniqueMidi(notes: number[]) {
  notes.forEach((note) => assertMidi(note));
  return [...new Set(notes)].sort((a, b) => a - b);
}

function arraysEqual(a: number[], b: number[]) {
  return a.length === b.length && a.every((value, index) => value === b[index]);
}

function pitchClass(note: number) {
  return ((note % 12) + 12) % 12;
}

function intervalName(genericNumber: number) {
  if (genericNumber <= ORDINALS.length) return ORDINALS[genericNumber - 1];
  const lastDigit = genericNumber % 10;
  const lastTwo = genericNumber % 100;
  const suffix = lastTwo >= 11 && lastTwo <= 13 ? "th" : lastDigit === 1 ? "st" : lastDigit === 2 ? "nd" : lastDigit === 3 ? "rd" : "th";
  return `${genericNumber}${suffix}`;
}

/** Creates an explicitly spelled pitch and derives its physical and staff positions. */
export function makeNotatedPitch(input: {
  letter: PitchLetter;
  accidental?: Accidental;
  octave: number;
  clef?: Clef;
}): NotatedPitch {
  const accidental = input.accidental ?? "natural";
  const clef = input.clef ?? "treble";
  if (!PITCH_LETTERS.includes(input.letter)) throw new RangeError("Unknown pitch letter.");
  if (!ACCIDENTALS.includes(accidental)) throw new RangeError("Unknown accidental.");
  if (!CLEFS.includes(clef)) throw new RangeError("Unknown clef.");
  if (!Number.isInteger(input.octave) || input.octave < -1 || input.octave > 9) {
    throw new RangeError("Scientific pitch octave must be an integer from -1 through 9.");
  }
  const midi = (input.octave + 1) * 12 + NATURAL_PITCH_CLASS[input.letter] + ACCIDENTAL_OFFSET[accidental];
  assertMidi(midi, "Spelled pitch");
  const diatonicPosition = input.octave * 7 + LETTER_INDEX[input.letter];
  return {
    letter: input.letter,
    accidental,
    octave: input.octave,
    midi,
    staffStep: diatonicPosition - BOTTOM_LINE_DIATONIC[clef],
    clef,
    label: `${input.letter}${ACCIDENTAL_SYMBOL[accidental]}${input.octave}`,
  };
}

const SHARP_SPELLINGS: Array<[PitchLetter, Accidental]> = [
  ["C", "natural"], ["C", "sharp"], ["D", "natural"], ["D", "sharp"],
  ["E", "natural"], ["F", "natural"], ["F", "sharp"], ["G", "natural"],
  ["G", "sharp"], ["A", "natural"], ["A", "sharp"], ["B", "natural"],
];

const FLAT_SPELLINGS: Array<[PitchLetter, Accidental]> = [
  ["C", "natural"], ["D", "flat"], ["D", "natural"], ["E", "flat"],
  ["E", "natural"], ["F", "natural"], ["G", "flat"], ["G", "natural"],
  ["A", "flat"], ["A", "natural"], ["B", "flat"], ["B", "natural"],
];

const COMMON_FLAT_TONIC_PITCH_CLASSES = new Set([1, 3, 8, 10]);
const CANONICAL_SHAPE_STAFF_STEPS = [0, 1, 1, 2, 2, 3, 3, 4, 5, 5, 6, 6] as const;

/**
 * Chooses the lower-complexity conventional name for a movable-Do center.
 * D-flat, E-flat, A-flat, and B-flat avoid the double-sharps produced by their
 * enharmonic sharp keys; F-sharp remains the practical choice over G-flat.
 */
export function preferredAccidentalsForTonic(midi: number): "sharps" | "flats" {
  assertMidi(midi, "Tonic MIDI note");
  return COMMON_FLAT_TONIC_PITCH_CLASSES.has(pitchClass(midi)) ? "flats" : "sharps";
}

/** Gives a valid conventional spelling for a MIDI note without discarding the accidental. */
export function spellMidiPitch(
  midi: number,
  options: { clef?: Clef; prefer?: "sharps" | "flats" } = {},
): NotatedPitch {
  assertMidi(midi);
  const [letter, accidental] = (options.prefer === "flats" ? FLAT_SPELLINGS : SHARP_SPELLINGS)[pitchClass(midi)];
  const octave = Math.floor(midi / 12) - 1;
  return makeNotatedPitch({ letter, accidental, octave, clef: options.clef ?? "treble" });
}

/** Maps exact semitone distance onto this reader's default simple written interval shape. */
export function canonicalStaffStepsForSemitones(semitones: number) {
  if (!Number.isFinite(semitones)) throw new RangeError("Shape distance must be finite.");
  const rounded = Math.round(semitones);
  const sign = Math.sign(rounded);
  const absolute = Math.abs(rounded);
  return sign * (Math.floor(absolute / 12) * 7 + CANONICAL_SHAPE_STAFF_STEPS[absolute % 12]);
}

/** Spells one authored shape pitch while preserving both staff and keyboard distance. */
export function spellShapeRelativePitch(
  anchorMidi: number,
  semitoneOffset: number,
  prefer: "sharps" | "flats" = preferredAccidentalsForTonic(anchorMidi),
): NotatedPitch {
  assertMidi(anchorMidi, "Shape anchor");
  if (!Number.isInteger(semitoneOffset)) throw new RangeError("Shape semitone offset must be an integer.");
  const targetMidi = anchorMidi + semitoneOffset;
  assertMidi(targetMidi, "Shape target");
  const clef: Clef = targetMidi < 60 ? "bass" : "treble";
  const anchor = spellMidiPitch(anchorMidi, { clef, prefer });
  return transposeNotatedPitchByShape(anchor, canonicalStaffStepsForSemitones(semitoneOffset), semitoneOffset, clef);
}

/** Chooses one consistent tonic spelling that minimizes accidental complexity for a complete authored shape. */
export function preferredAccidentalsForShape(anchorMidi: number, semitoneOffsets: number[]): "sharps" | "flats" {
  assertMidi(anchorMidi, "Shape anchor");
  if (!semitoneOffsets.length || !semitoneOffsets.every(Number.isInteger)) throw new RangeError("A shape preference needs integer semitone offsets.");
  const accidentalCost: Record<Accidental, number> = {
    natural: 0,
    flat: 1,
    sharp: 1,
    "double-flat": 8,
    "double-sharp": 8,
  };
  const score = (prefer: "sharps" | "flats") => semitoneOffsets.reduce((total, offset) => (
    total + accidentalCost[spellShapeRelativePitch(anchorMidi, offset, prefer).accidental]
  ), 0);
  const sharpCost = score("sharps");
  const flatCost = score("flats");
  return flatCost === sharpCost ? preferredAccidentalsForTonic(anchorMidi) : flatCost < sharpCost ? "flats" : "sharps";
}

/**
 * Returns only the accidental signs that standard single-measure notation
 * needs to print. A sign carries for the same written letter and octave until
 * the closing barline; a natural sign is therefore emitted when it cancels an
 * earlier flat or sharp.
 */
export function displayedAccidentalsForMeasure(pitches: NotatedPitch[]): Array<Accidental | null> {
  const activeAccidentals = new Map<string, Accidental>();
  return pitches.map((pitch) => {
    const position = `${pitch.letter}${pitch.octave}`;
    const previous = activeAccidentals.get(position) ?? "natural";
    activeAccidentals.set(position, pitch.accidental);
    return pitch.accidental === previous ? null : pitch.accidental;
  });
}

/** Maps each received note, in arrival order, to one unique target index. */
export function assignNotesToTargets(actualNotes: number[], targetNotes: number[]): number[] {
  if (actualNotes.length > targetNotes.length) throw new RangeError("An assignment needs at least as many targets as received notes.");
  if (![...actualNotes, ...targetNotes].every(Number.isFinite)) throw new RangeError("Assignment notes must be finite numbers.");
  const unmatched = targetNotes.map((note, index) => ({ note, index }));
  return actualNotes.map((note) => {
    const exactIndex = unmatched.findIndex((candidate) => candidate.note === note);
    const matchIndex = exactIndex >= 0 ? exactIndex : unmatched.reduce((best, candidate, index) => (
      best < 0 || Math.abs(candidate.note - note) < Math.abs(unmatched[best].note - note) ? index : best
    ), -1);
    const [matched] = unmatched.splice(matchIndex, 1);
    return matched.index;
  });
}

/** Returns the shared shift between two unordered pitch sets, or null when their spacing differs. */
export function inferUniformTransposition(targetNotes: number[], actualNotes: number[]): number | null {
  if (!targetNotes.length || targetNotes.length !== actualNotes.length) return null;
  if (![...targetNotes, ...actualNotes].every(Number.isFinite)) throw new RangeError("Transposition notes must be finite numbers.");
  const target = [...targetNotes].sort((first, second) => first - second);
  const actual = [...actualNotes].sort((first, second) => first - second);
  const shift = actual[0] - target[0];
  return actual.every((note, index) => note - target[index] === shift) ? shift : null;
}

/** Mirrors the Piano HUD's adjacent-gap plus maximum-span chord grouping rule. */
export function attacksShareChordWindow(onsetsMs: number[], adjacentGapMs: number, maximumSpanMs = adjacentGapMs * 2) {
  if (!Number.isFinite(adjacentGapMs) || adjacentGapMs <= 0 || !Number.isFinite(maximumSpanMs) || maximumSpanMs < adjacentGapMs) return false;
  if (!onsetsMs.every(Number.isFinite)) return false;
  if (onsetsMs.length <= 1) return true;
  const ordered = [...onsetsMs].sort((first, second) => first - second);
  const adjacentFits = ordered.slice(1).every((onset, index) => onset - ordered[index] <= adjacentGapMs);
  return adjacentFits && ordered.at(-1)! - ordered[0] <= maximumSpanMs;
}

/**
 * Spells a target from independent written and keyboard movements.
 * This is the bridge used by shape-first notation: a written third can remain
 * a third while its exact keyboard distance changes from three to four keys.
 */
export function transposeNotatedPitchByShape(
  from: NotatedPitch,
  signedStaffSteps: number,
  signedSemitones: number,
  clef: Clef = from.clef,
): NotatedPitch {
  if (!Number.isInteger(signedStaffSteps)) throw new RangeError("Staff movement must be an integer number of line/space steps.");
  if (!Number.isInteger(signedSemitones)) throw new RangeError("Keyboard movement must be an integer number of semitones.");
  const targetMidi = from.midi + signedSemitones;
  assertMidi(targetMidi, "Transposed pitch");
  const fromDiatonic = from.octave * 7 + LETTER_INDEX[from.letter];
  const targetDiatonic = fromDiatonic + signedStaffSteps;
  const targetOctave = Math.floor(targetDiatonic / 7);
  const targetLetter = PITCH_LETTERS[((targetDiatonic % 7) + 7) % 7];
  const accidentalPreference: Accidental[] = ["natural", "flat", "sharp", "double-flat", "double-sharp"];
  for (const accidental of accidentalPreference) {
    try {
      const candidate = makeNotatedPitch({ letter: targetLetter, accidental, octave: targetOctave, clef });
      if (candidate.midi === targetMidi) return candidate;
    } catch {
      // An out-of-range spelling cannot be the requested MIDI target.
    }
  }
  throw new RangeError("This staff and semitone movement requires an accidental beyond the supported double-flat/double-sharp range.");
}

/** Analyzes notation geometry and keyboard distance as independent measurements. */
export function analyzeNotatedInterval(from: NotatedPitch, to: NotatedPitch): NotatedInterval {
  const fromDiatonic = from.octave * 7 + LETTER_INDEX[from.letter];
  const toDiatonic = to.octave * 7 + LETTER_INDEX[to.letter];
  const signedStaffSteps = toDiatonic - fromDiatonic;
  const genericNumber = Math.abs(signedStaffSteps) + 1;
  const signedSemitones = to.midi - from.midi;
  return {
    from,
    to,
    genericNumber,
    simpleGenericNumber: ((genericNumber - 1) % 7) + 1,
    writtenOctaves: Math.floor((genericNumber - 1) / 7),
    signedStaffSteps,
    signedSemitones,
    exactSemitones: Math.abs(signedSemitones),
    notationDirection: signedStaffSteps > 0 ? "up" : signedStaffSteps < 0 ? "down" : "same",
    soundingDirection: signedSemitones > 0 ? "ascending" : signedSemitones < 0 ? "descending" : "stationary",
    label: `${intervalName(genericNumber)} · ${Math.abs(signedSemitones)} semitone${Math.abs(signedSemitones) === 1 ? "" : "s"}`,
  };
}

/** Exact adjacent and all-pairs keyboard spacings for one voiced chord. */
export function chordSpacing(notesInput: number[] | NotatedPitch[]): ChordSpacing {
  const notes = sortedUniqueMidi(notesInput.map((note) => typeof note === "number" ? note : note.midi));
  const pairwise: ChordSpacingPair[] = [];
  for (let lowerIndex = 0; lowerIndex < notes.length; lowerIndex += 1) {
    for (let upperIndex = lowerIndex + 1; upperIndex < notes.length; upperIndex += 1) {
      pairwise.push({
        lowerMidi: notes[lowerIndex],
        upperMidi: notes[upperIndex],
        semitones: notes[upperIndex] - notes[lowerIndex],
      });
    }
  }
  const adjacent = notes.slice(1).map((upperMidi, index) => ({
    lowerMidi: notes[index],
    upperMidi,
    semitones: upperMidi - notes[index],
  }));
  return {
    notes,
    adjacent,
    pairwise,
    adjacentSemitones: adjacent.map((pair) => pair.semitones),
    pairwiseSemitones: pairwise.map((pair) => pair.semitones),
    spanSemitones: notes.length > 1 ? notes[notes.length - 1] - notes[0] : 0,
  };
}

function eventRepresentative(event: SightReadingEvent) {
  return Math.max(...event.pitches.map((pitch) => pitch.midi));
}

/** Produces visual reductions without replacing the literal score. */
export function reducePattern(input: SightReadingExercise | SightReadingEvent[]): PatternReductions {
  const events = Array.isArray(input) ? input : input.events;
  const contour = events.slice(1).map((event, index): ContourReductionSegment => {
    const previous = events[index];
    const fromMidi = eventRepresentative(previous);
    const toMidi = eventRepresentative(event);
    const signedSemitones = toMidi - fromMidi;
    return {
      fromEventId: previous.id,
      toEventId: event.id,
      fromMidi,
      toMidi,
      signedSemitones,
      direction: signedSemitones > 0 ? "up" : signedSemitones < 0 ? "down" : "same",
    };
  });
  const contourSignature = contour.map((segment) => segment.direction === "up" ? "↑" : segment.direction === "down" ? "↓" : "→").join("");

  const explicitAnchorMidis = new Set(events.filter((event) => event.role === "anchor").flatMap((event) => event.pitches.map((pitch) => pitch.midi)));
  const occurrences = new Map<number, { labels: string[]; eventIds: string[] }>();
  for (const event of events) {
    for (const pitch of event.pitches) {
      const current = occurrences.get(pitch.midi) ?? { labels: [], eventIds: [] };
      if (!current.eventIds.includes(event.id)) current.eventIds.push(event.id);
      current.labels.push(pitch.label);
      occurrences.set(pitch.midi, current);
    }
  }
  const anchors = [...occurrences.entries()]
    .filter(([midi, occurrence]) => occurrence.eventIds.length >= 2 || explicitAnchorMidis.has(midi))
    .map(([midi, occurrence]): AnchorReduction => ({
      midi,
      label: occurrence.labels[0],
      eventIds: occurrence.eventIds,
      occurrenceCount: occurrence.eventIds.length,
      explicit: explicitAnchorMidis.has(midi),
    }))
    .sort((a, b) => b.occurrenceCount - a.occurrenceCount || a.midi - b.midi);

  const sequentialSingleNotes = events.length >= 3 && events.every((event) => event.pitches.length === 1);
  let foldedArpeggio: FoldedArpeggioReduction | null = null;
  if (sequentialSingleNotes) {
    const pitchClasses = [...new Set(events.map((event) => pitchClass(event.pitches[0].midi)))].sort((a, b) => a - b);
    if (pitchClasses.length >= 2 && pitchClasses.length <= 6) {
      const bassPitchClass = pitchClasses[0];
      const foldedNotes = pitchClasses.map((value) => 60 + ((value - bassPitchClass + 12) % 12));
      foldedArpeggio = {
        sourceEventIds: events.map((event) => event.id),
        bassPitchClass,
        pitchClasses,
        offsetsFromBass: foldedNotes.map((note) => note - 60),
        spacing: chordSpacing(foldedNotes),
      };
    }
  }
  return { contour, contourSignature, foldedArpeggio, anchors };
}

function hashSeed(seed: string) {
  let hash = 2166136261;
  for (let index = 0; index < seed.length; index += 1) {
    hash ^= seed.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function seededRandom(seed: string) {
  let state = hashSeed(seed) || 0x6d2b79f5;
  return () => {
    state += 0x6d2b79f5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function choose<T>(rng: () => number, choices: readonly T[]): T {
  return choices[Math.floor(rng() * choices.length)];
}

function defaultRange(clef: Clef) {
  return clef === "treble" ? { lowestMidi: 60, highestMidi: 79 } : { lowestMidi: 40, highestMidi: 60 };
}

function validateRange(range: { lowestMidi: number; highestMidi: number }) {
  assertMidi(range.lowestMidi, "Lowest range note");
  assertMidi(range.highestMidi, "Highest range note");
  if (range.highestMidi - range.lowestMidi < 12) {
    throw new RangeError("Exercise range must span at least twelve semitones.");
  }
}

function rootForOffsets(rng: () => number, offsets: number[], range: { lowestMidi: number; highestMidi: number }) {
  const minimum = range.lowestMidi - Math.min(...offsets);
  const maximum = range.highestMidi - Math.max(...offsets);
  const candidates: number[] = [];
  for (let note = minimum; note <= maximum; note += 1) {
    if ([0, 2, 4, 5, 7, 9, 11].includes(pitchClass(note))) candidates.push(note);
  }
  if (candidates.length === 0) throw new RangeError("The selected range cannot contain this exercise pattern.");
  return choose(rng, candidates);
}

function generatedEvent(
  index: number,
  onsetBeats: number,
  midis: number[],
  clef: Clef,
  prefer: "sharps" | "flats",
  role: SightReadingEventRole,
  groupId: string,
): SightReadingEvent {
  return {
    id: `event-${index + 1}`,
    onsetBeats,
    durationBeats: 1,
    pitches: sortedUniqueMidi(midis).map((midi) => spellMidiPitch(midi, { clef, prefer })),
    role,
    groupId,
    hand: clef === "treble" ? "right" : "left",
  };
}

function exerciseScaffoldPlan(family: ExerciseFamily): ScaffoldPlan {
  const familyHint: ScaffoldHint = family === "triad" || family === "inversion" || family === "arpeggio"
    ? { kind: "chord-gaps", label: "Chord gap fingerprint", reason: "See adjacent semitone gaps as one voiced shape.", persistent: false }
    : family === "anchor"
      ? { kind: "anchor-pins", label: "Fixed point", reason: "Separate the stable pitch from the moving line.", persistent: false }
      : { kind: "contour-ribbon", label: "Contour ribbon", reason: "Read direction and turning points before individual notes.", persistent: false };
  return {
    discover: [
      { kind: "note-names", label: "Pitch labels", reason: "Locate a reliable starting landmark.", persistent: false },
      { kind: "staff-intervals", label: "Written intervals", reason: "Count line-and-space movement.", persistent: false },
      { kind: "semitones", label: "Keyboard distance", reason: "Connect notation with physical and heard distance.", persistent: false },
      familyHint,
    ],
    connect: [
      { kind: "staff-intervals", label: "Written intervals", reason: "Keep the geometric relationship visible.", persistent: false },
      { kind: "keyboard-territory", label: "Hand territory", reason: "Prepare the span without claiming a fingering.", persistent: false },
      familyHint,
    ],
    transfer: [
      { kind: "next-landing", label: "Next landing", reason: "Prepare the destination before its attack.", persistent: false },
      { kind: "group-brackets", label: "Groups", reason: "Read several notes as one unit.", persistent: false },
    ],
    read: [
      { kind: "two-word-prompt", label: "Two listening words", reason: "Connect accurate reading with a personal musical intention.", persistent: true },
    ],
  };
}

function familyPattern(
  family: ExerciseFamily,
  difficulty: ExerciseDifficulty,
  rng: () => number,
): { offsetsByEvent: number[][]; roles: SightReadingEventRole[]; groups: string[]; title: string; prompt: string; notice: string } {
  if (family === "interval") {
    const pools = difficulty === "foundation" ? [1, 2, 3, 4, 5] : difficulty === "developing" ? [2, 3, 4, 5, 7, 8, 9] : [1, 3, 6, 7, 10, 11, 12];
    const distance = choose(rng, pools) * (rng() < 0.5 ? -1 : 1);
    return {
      offsetsByEvent: [[0], [distance]],
      roles: ["interval-start", "interval-end"], groups: ["interval", "interval"],
      title: "One relationship", prompt: "See its written size, predict its keyboard distance, then play.",
      notice: "Written line-and-space distance and exact semitones are related but not interchangeable.",
    };
  }
  if (family === "contour") {
    const patterns = difficulty === "foundation"
      ? [[0, 2, 4, 2, 0], [0, -2, -4, -2, 0], [0, 2, 4, 5, 7]]
      : difficulty === "developing"
        ? [[0, 2, 5, 3, 7], [0, -3, 2, -2, 0], [0, 4, 2, 7, 5]]
        : [[0, 6, 2, 9, 4, 11], [0, -5, 3, -7, 2, -10]];
    const offsets = choose(rng, patterns);
    return {
      offsetsByEvent: offsets.map((offset) => [offset]), roles: offsets.map(() => "note"), groups: offsets.map(() => "line"),
      title: "Contour cell", prompt: "Find the direction changes before reading each landing.",
      notice: "The contour is a reduction; every accidental and rhythm still belongs to the score.",
    };
  }
  const quality = choose(rng, difficulty === "foundation" ? [[0, 4, 7], [0, 3, 7]] : [[0, 4, 7], [0, 3, 7], [0, 3, 6]]);
  if (family === "triad") {
    return {
      offsetsByEvent: [quality], roles: ["chord"], groups: ["chord"], title: "Chord silhouette",
      prompt: "Read the vertical shape as one event, then inspect its adjacent gaps.",
      notice: "Adjacent gaps describe this voicing; all-pairs distances reveal the complete interval field.",
    };
  }
  if (family === "inversion") {
    const inversion = rng() < 0.5 ? [quality[1], quality[2], quality[0] + 12] : [quality[2], quality[0] + 12, quality[1] + 12];
    return {
      offsetsByEvent: [quality, inversion], roles: ["chord", "chord"], groups: ["root-shape", "inversion"],
      title: "Inversion lens", prompt: "Compare which chord tone moved across the octave.",
      notice: "Pitch-class membership can stay constant while bass role and adjacent spacing change.",
    };
  }
  if (family === "arpeggio") {
    const offsets = difficulty === "foundation" ? quality : [...quality, quality[0] + 12, quality[2], quality[1]];
    return {
      offsetsByEvent: offsets.map((offset) => [offset]), roles: offsets.map(() => "arpeggio-tone"), groups: offsets.map(() => "arpeggio"),
      title: "Folded arpeggio", prompt: "Hear a chord stretched through time, then fold it into one vertical shape.",
      notice: "Attack order and register are retained even while the chord-class reduction is shown.",
    };
  }
  if (family === "anchor") {
    const moves = difficulty === "foundation" ? [2, 4] : difficulty === "developing" ? [3, 7] : [6, 11];
    const offsets = [0, moves[0], 0, moves[1], 0];
    return {
      offsetsByEvent: offsets.map((offset) => [offset]),
      roles: offsets.map((_, index) => index % 2 === 0 ? "anchor" : "moving-tone"), groups: offsets.map(() => "anchor-field"),
      title: "Fixed point", prompt: "Keep the anchor present while the moving note changes its distance.",
      notice: "The repeated reference makes each changing interval easier to compare.",
    };
  }
  const motif = difficulty === "foundation" ? [0, 2, 4] : difficulty === "developing" ? [0, 3, 2, 5] : [0, 4, -1, 6];
  const shift = choose(rng, difficulty === "stretch" ? [5, 6, 7] : [5, 7]);
  return {
    offsetsByEvent: [...motif.map((offset) => [offset]), ...motif.map((offset) => [offset + shift])],
    roles: [...motif.map(() => "motif" as const), ...motif.map(() => "transformation" as const)],
    groups: [...motif.map(() => "motif-a"), ...motif.map(() => "motif-b")],
    title: "Shape transformation", prompt: "Recognize the repeated interval pattern from its new anchor.",
    notice: "The second group preserves internal relationships while changing absolute pitch.",
  };
}

/** Generates the same fully notated exercise for the same options on every run. */
export function generateSightReadingExercise(options: GenerateSightReadingExerciseOptions): SightReadingExercise {
  const seed = String(options.seed);
  if (!seed.trim()) throw new RangeError("Exercise seed cannot be empty.");
  const family = options.family;
  if (!["interval", "contour", "triad", "inversion", "arpeggio", "anchor", "transform"].includes(family)) {
    throw new RangeError("Unknown sight-reading exercise family.");
  }
  const difficulty = options.difficulty ?? "foundation";
  const clef = options.clef ?? "treble";
  const range = options.range ?? defaultRange(clef);
  validateRange(range);
  const rng = seededRandom(`${seed}|${family}|${difficulty}|${clef}|${range.lowestMidi}-${range.highestMidi}`);
  const pattern = familyPattern(family, difficulty, rng);
  const allOffsets = pattern.offsetsByEvent.flat();
  const root = rootForOffsets(rng, allOffsets, range);
  const prefer = rng() < 0.5 ? "sharps" : "flats";
  const events = pattern.offsetsByEvent.map((offsets, index) => generatedEvent(
    index,
    index,
    offsets.map((offset) => root + offset),
    clef,
    prefer,
    pattern.roles[index],
    pattern.groups[index],
  ));
  const intervals = events.slice(1).map((event, index) => analyzeNotatedInterval(events[index].pitches.at(-1)!, event.pitches.at(-1)!));
  const chordSpacings = events.filter((event) => event.pitches.length > 1).map((event) => chordSpacing(event.pitches));
  const scaffoldPlan = exerciseScaffoldPlan(family);
  const exerciseWithoutReductions = {
    schemaVersion: 1 as const,
    id: `sight-${family}-${hashSeed(`${seed}|${difficulty}|${clef}`).toString(36)}`,
    seed,
    family,
    difficulty,
    clef,
    title: pattern.title,
    prompt: pattern.prompt,
    events,
    focus: {
      primary: family,
      notice: pattern.notice,
      exactIntervals: intervals.map((interval) => interval.signedSemitones),
      genericIntervals: intervals.map((interval) => interval.signedStaffSteps),
      chordSpacings,
    },
    scaffoldPlan,
  };
  return { ...exerciseWithoutReductions, reductions: reducePattern(events) };
}

function uniformOffset(expected: number[], actual: number[]) {
  if (expected.length !== actual.length || expected.length === 0) return null;
  const offset = actual[0] - expected[0];
  return actual.every((note, index) => note - expected[index] === offset) ? offset : null;
}

function comparisonTiming(
  exercise: SightReadingExercise,
  attacks: SightReadingAttack[],
  eventIndex: number,
  options: EvaluateSightReadingAttemptOptions,
) {
  if (options.beatDurationMs == null || attacks.length === 0 || eventIndex >= attacks.length) {
    return { error: null, match: null };
  }
  if (!Number.isFinite(options.beatDurationMs) || options.beatDurationMs <= 0) {
    throw new RangeError("Beat duration must be a positive finite number.");
  }
  const tolerance = options.timingToleranceMs ?? Math.max(70, options.beatDurationMs * 0.18);
  assertFiniteNonNegative(tolerance, "Timing tolerance");
  const expectedRelative = (exercise.events[eventIndex].onsetBeats - exercise.events[0].onsetBeats) * options.beatDurationMs;
  const actualRelative = attacks[eventIndex].onsetMs - attacks[0].onsetMs;
  const error = actualRelative - expectedRelative;
  return { error, match: Math.abs(error) <= tolerance };
}

/**
 * Incrementally compares clustered note attacks with score events.
 * In shape mode the first valid event establishes one transposition which every
 * later event must preserve; isolated single notes therefore cannot each move.
 */
export function evaluateSightReadingAttempt(
  exercise: SightReadingExercise,
  attacksInput: SightReadingAttack[],
  options: EvaluateSightReadingAttemptOptions = {},
): SightReadingAttemptEvaluation {
  const mode = options.mode ?? "exact";
  const attacks = attacksInput.map((attack) => {
    assertFiniteNonNegative(attack.onsetMs, "Attack onset");
    if (!Array.isArray(attack.notes) || attack.notes.length === 0) throw new RangeError("Every attack must contain at least one note.");
    return { ...attack, notes: sortedUniqueMidi(attack.notes) };
  });
  for (let index = 1; index < attacks.length; index += 1) {
    if (attacks[index].onsetMs < attacks[index - 1].onsetMs) throw new RangeError("Attacks must be ordered by onset.");
  }
  const diagnoses: AttemptDiagnosis[] = [];
  let inferredTransposition: number | null = null;
  for (let index = 0; index < Math.min(attacks.length, exercise.events.length); index += 1) {
    const expected = exercise.events[index].pitches.map((pitch) => pitch.midi).sort((a, b) => a - b);
    const candidate = uniformOffset(expected, attacks[index].notes);
    if (candidate != null) {
      inferredTransposition ??= candidate;
    }
  }

  const comparisons = exercise.events.map((event, eventIndex): EventAttemptComparison => {
    const expectedNotes = event.pitches.map((pitch) => pitch.midi).sort((a, b) => a - b);
    const attack = attacks[eventIndex];
    if (!attack) {
      return {
        eventIndex, eventId: event.id, status: "pending", expectedNotes, actualNotes: null,
        exactMatch: false, shapeMatch: false, spacingMatch: null, transpositionSteps: null,
        timingErrorMs: null, timingMatch: null,
      };
    }
    const actualNotes = attack.notes;
    const eventOffset = uniformOffset(expectedNotes, actualNotes);
    const exactMatch = arraysEqual(expectedNotes, actualNotes);
    const shiftedExpected = inferredTransposition == null ? expectedNotes : expectedNotes.map((note) => note + inferredTransposition);
    const shapeMatch = inferredTransposition != null && arraysEqual(shiftedExpected, actualNotes);
    const expectedSpacing = chordSpacing(expectedNotes);
    const actualSpacing = chordSpacing(actualNotes);
    const spacingMatch = expectedNotes.length > 1 || actualNotes.length > 1
      ? arraysEqual(expectedSpacing.adjacentSemitones, actualSpacing.adjacentSemitones)
      : null;
    const timing = comparisonTiming(exercise, attacks, eventIndex, options);
    const pitchPass = mode === "exact" ? exactMatch : shapeMatch;
    const status = pitchPass && timing.match !== false ? "correct" : "incorrect";

    if (expectedNotes.length !== actualNotes.length) {
      diagnoses.push({
        kind: "voice-count", severity: "retry", eventIndex, eventId: event.id,
        message: `Expected ${expectedNotes.length} simultaneous note${expectedNotes.length === 1 ? "" : "s"}; received ${actualNotes.length}.`,
        expected: expectedNotes, actual: actualNotes,
      });
    } else if (mode === "transposable-shape" && eventOffset !== inferredTransposition) {
      diagnoses.push({
        kind: "transposition-drift", severity: "retry", eventIndex, eventId: event.id,
        message: "The pattern changed its transposition instead of preserving one physical shape.",
        expected: shiftedExpected, actual: actualNotes,
        difference: eventOffset == null || inferredTransposition == null ? undefined : eventOffset - inferredTransposition,
      });
    } else if (mode === "exact" && !exactMatch) {
      if (eventOffset != null) {
        diagnoses.push({
          kind: "correct-shape-different-start", severity: "retry", eventIndex, eventId: event.id,
          message: `The voiced shape is intact but starts ${Math.abs(eventOffset)} semitone${Math.abs(eventOffset) === 1 ? "" : "s"} ${eventOffset > 0 ? "higher" : "lower"}.`,
          expected: expectedNotes, actual: actualNotes, difference: eventOffset,
        });
      } else {
        diagnoses.push({ kind: "wrong-note", severity: "retry", eventIndex, eventId: event.id, message: "One or more physical pitches differ from the score.", expected: expectedNotes, actual: actualNotes });
      }
    }
    if (spacingMatch === false && expectedNotes.length === actualNotes.length) {
      diagnoses.push({
        kind: "chord-spacing", severity: "retry", eventIndex, eventId: event.id,
        message: `Expected adjacent gaps ${expectedSpacing.adjacentSemitones.join(" + ")}; received ${actualSpacing.adjacentSemitones.join(" + ")}.`,
        expected: expectedSpacing.adjacentSemitones, actual: actualSpacing.adjacentSemitones,
      });
    }
    if (eventIndex > 0 && expectedNotes.length === 1 && actualNotes.length === 1 && attacks[eventIndex - 1]?.notes.length === 1) {
      const expectedPrevious = exercise.events[eventIndex - 1].pitches[0].midi;
      const expectedMove = expectedNotes[0] - expectedPrevious;
      const actualMove = actualNotes[0] - attacks[eventIndex - 1].notes[0];
      if (Math.sign(expectedMove) !== Math.sign(actualMove)) {
        diagnoses.push({ kind: "wrong-direction", severity: "retry", eventIndex, eventId: event.id, message: `The score moves ${expectedMove > 0 ? "up" : expectedMove < 0 ? "down" : "to the same key"}, but the played movement went ${actualMove > 0 ? "up" : actualMove < 0 ? "down" : "to the same key"}.`, difference: actualMove - expectedMove });
      } else if (Math.abs(actualMove) > Math.abs(expectedMove)) {
        diagnoses.push({ kind: "interval-too-wide", severity: "retry", eventIndex, eventId: event.id, message: `The movement was ${Math.abs(actualMove) - Math.abs(expectedMove)} semitone${Math.abs(actualMove) - Math.abs(expectedMove) === 1 ? "" : "s"} too wide.`, difference: Math.abs(actualMove) - Math.abs(expectedMove) });
      } else if (Math.abs(actualMove) < Math.abs(expectedMove)) {
        diagnoses.push({ kind: "interval-too-narrow", severity: "retry", eventIndex, eventId: event.id, message: `The movement was ${Math.abs(expectedMove) - Math.abs(actualMove)} semitone${Math.abs(expectedMove) - Math.abs(actualMove) === 1 ? "" : "s"} too narrow.`, difference: Math.abs(actualMove) - Math.abs(expectedMove) });
      }
    }
    if (event.role === "anchor" && !pitchPass) {
      diagnoses.push({ kind: "anchor-lost", severity: "retry", eventIndex, eventId: event.id, message: "Return to the fixed reference before reading the next moving note.", expected: expectedNotes, actual: actualNotes });
    }
    if (timing.match === false) {
      diagnoses.push({ kind: "timing", severity: "retry", eventIndex, eventId: event.id, message: `This attack arrived ${Math.round(Math.abs(timing.error!))} ms ${timing.error! > 0 ? "late" : "early"} relative to the opening attack.`, difference: timing.error! });
    }
    return {
      eventIndex, eventId: event.id, status, expectedNotes, actualNotes, exactMatch, shapeMatch,
      spacingMatch, transpositionSteps: eventOffset, timingErrorMs: timing.error, timingMatch: timing.match,
    };
  });

  for (let index = exercise.events.length; index < attacks.length; index += 1) {
    diagnoses.push({ kind: "extra-event", severity: "retry", eventIndex: index, eventId: null, message: "This attack occurs after the notated pattern has ended.", actual: attacks[index].notes });
  }
  const attempted = comparisons.filter((comparison) => comparison.status !== "pending");
  const complete = attacks.length >= exercise.events.length;
  const matchedEventCount = attempted.filter((comparison) => comparison.status === "correct").length;
  const exactCount = attempted.filter((comparison) => comparison.exactMatch).length;
  const shapeCount = attempted.filter((comparison) => comparison.shapeMatch).length;
  const passed = complete && attacks.length === exercise.events.length && matchedEventCount === exercise.events.length;
  const nextEventIndex = passed ? null : Math.min(attacks.length, exercise.events.length - 1);
  const exactAccuracy = attempted.length === 0 ? 0 : exactCount / attempted.length;
  const shapeAccuracy = attempted.length === 0 ? 0 : shapeCount / attempted.length;
  const summary = passed
    ? mode === "exact" ? "The notated pitches and event shapes match." : `The complete shape is preserved${inferredTransposition ? ` at ${Math.abs(inferredTransposition)} semitones ${inferredTransposition > 0 ? "higher" : "lower"}` : " at its written position"}.`
    : attempted.length === 0
      ? "Play the first notated event when ready."
      : comparisons.some((comparison) => comparison.status === "incorrect")
        ? diagnoses.find((diagnosis) => diagnosis.severity === "retry")?.message ?? "Compare the attempted shape with the score."
        : `The first ${attempted.length} event${attempted.length === 1 ? " matches" : "s match"}; keep reading forward.`;
  return {
    mode, complete, passed, inferredTransposition, comparisons, diagnoses,
    attemptedEventCount: attempted.length, matchedEventCount, nextEventIndex,
    exactAccuracy, shapeAccuracy, summary,
  };
}

export function initialScaffoldState(exercise: SightReadingExercise): PracticeScaffoldState {
  return {
    stage: "discover",
    consecutivePasses: 0,
    consecutiveNeedsWork: 0,
    visibleHints: exercise.scaffoldPlan.discover,
    message: "Locate an anchor, then connect written shape with physical distance.",
  };
}

/** Fades help after two complete passes and restores one stage after two misses. */
export function nextScaffoldState(
  exercise: SightReadingExercise,
  current: PracticeScaffoldState,
  evaluation: SightReadingAttemptEvaluation,
): PracticeScaffoldState {
  if (!evaluation.complete) return current;
  let stageIndex = STAGE_ORDER.indexOf(current.stage);
  let consecutivePasses = evaluation.passed ? current.consecutivePasses + 1 : 0;
  let consecutiveNeedsWork = evaluation.passed ? 0 : current.consecutiveNeedsWork + 1;
  if (consecutivePasses >= 2 && stageIndex < STAGE_ORDER.length - 1) {
    stageIndex += 1;
    consecutivePasses = 0;
  } else if (consecutiveNeedsWork >= 2 && stageIndex > 0) {
    stageIndex -= 1;
    consecutiveNeedsWork = 0;
  }
  const stage = STAGE_ORDER[stageIndex];
  const message = evaluation.passed
    ? stage === "read" ? "The structural overlays are quiet; read the score and shape a musical idea." : "The relationship held. Try it with one less layer of help."
    : `Bring back ${exercise.scaffoldPlan[stage][0]?.label.toLowerCase() ?? "the structural cue"} and retry one relationship.`;
  return { stage, consecutivePasses, consecutiveNeedsWork, visibleHints: exercise.scaffoldPlan[stage], message };
}

/** Validates exactly two learner-authored descriptors without interpreting them. */
export function validateTwoWordReflection(input: string | [string, string]): TwoWordReflectionValidation {
  const raw = Array.isArray(input) ? input.join(" ") : input;
  const normalized = raw.trim().replace(/[·,;/]+/gu, " ").replace(/\s+/gu, " ");
  const tokens = normalized ? normalized.split(" ") : [];
  const errors: ReflectionValidationError[] = [];
  if (tokens.length === 0) errors.push("empty");
  if (tokens.length !== 2) errors.push("word-count");
  if (tokens.some((word) => !/^[\p{L}][\p{L}'’\-]*$/u.test(word))) errors.push("invalid-word");
  if (tokens.some((word) => [...word].length > 24)) errors.push("word-too-long");
  const valid = errors.length === 0;
  return {
    valid,
    normalized,
    words: valid ? [tokens[0].toLocaleLowerCase(), tokens[1].toLocaleLowerCase()] : null,
    errors: [...new Set(errors)],
    prompt: "Choose two words for what you intended or heard; they describe your experience, not a property the interval guarantees.",
  };
}
