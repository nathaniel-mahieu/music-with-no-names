/**
 * Pure score/performance model for the uploaded-sheet-music piano coach.
 *
 * Parsing compressed MXL and walking XML are deliberately kept outside this
 * module. A parser supplies measure-local events; this module validates and
 * normalizes them, removes tied re-attacks, groups simultaneous score notes,
 * clusters human MIDI attacks, and evaluates the two timelines.
 *
 * No function here opens files, touches browser APIs, plays audio, or invents
 * fingerings that were not present in the score.
 */

export const MUSIC_XML_STEPS = ["C", "D", "E", "F", "G", "A", "B"] as const;
export const SHEET_HANDS = ["left", "right", "unknown"] as const;

export type MusicXmlStep = (typeof MUSIC_XML_STEPS)[number];
export type SheetHand = (typeof SHEET_HANDS)[number];
export type PracticeHand = SheetHand | "both";
export type SheetArpeggiation = "up" | "down" | "unspecified";

export type TimeSignature = {
  beats: number;
  beatType: number;
};

export type SheetMusicPitch = {
  step: MusicXmlStep;
  alter: number;
  octave: number;
  midi: number;
  label: string;
};

export type SheetMusicTie = {
  start: boolean;
  stop: boolean;
};

type ScoreEventInputBase = {
  id?: string;
  /** Offset from the beginning of this measure, expressed in quarter-note beats. */
  offsetBeats: number;
  durationBeats: number;
  staff?: number;
  voice?: string;
  hand?: SheetHand;
};

export type SheetMusicNoteInput = ScoreEventInputBase & {
  kind: "note";
  midi?: number;
  pitch?: {
    step: MusicXmlStep;
    alter?: number;
    octave: number;
  };
  tie?: Partial<SheetMusicTie>;
  /** MusicXML technical fingering, 1 (thumb) through 5 (little finger). */
  fingering?: number;
  /** MusicXML notations/arpeggiate; true is accepted as direction-unspecified shorthand. */
  arpeggiate?: boolean | SheetArpeggiation;
};

export type SheetMusicRestInput = ScoreEventInputBase & {
  kind: "rest";
  measureRest?: boolean;
};

export type SheetMusicEventInput = SheetMusicNoteInput | SheetMusicRestInput;

export type SheetMusicMeasureInput = {
  id?: string;
  number: string | number;
  durationBeats: number;
  timeSignature?: TimeSignature;
  events: SheetMusicEventInput[];
};

export type SheetTempoChangeInput = {
  /** Absolute quarter-note beat from the start of the score. */
  beat: number;
  bpm: number;
};

export type SheetMusicScoreInput = {
  schemaVersion?: 1;
  id: string;
  title: string;
  composer?: string;
  sourceName?: string;
  tempoBpm: number;
  timeSignature?: TimeSignature;
  keyFifths?: number | null;
  tempoChanges?: SheetTempoChangeInput[];
  measures: SheetMusicMeasureInput[];
};

type NormalizedEventBase = {
  id: string;
  measureIndex: number;
  measureNumber: string;
  offsetBeats: number;
  onsetBeat: number;
  durationBeats: number;
  staff: number;
  voice: string;
  hand: SheetHand;
};

export type SheetMusicNote = NormalizedEventBase & {
  kind: "note";
  pitch: SheetMusicPitch;
  tie: SheetMusicTie;
  fingering: number | null;
  arpeggiate: SheetArpeggiation | null;
  /** False for a tie continuation: the key should remain held, not be attacked again. */
  isAttack: boolean;
  /** Remaining sounding span through contiguous tied segments, in quarter-note beats. */
  soundingDurationBeats: number;
};

export type SheetMusicRest = NormalizedEventBase & {
  kind: "rest";
  measureRest: boolean;
};

export type SheetMusicEvent = SheetMusicNote | SheetMusicRest;

export type SheetMusicMeasure = {
  id: string;
  index: number;
  number: string;
  startBeat: number;
  durationBeats: number;
  timeSignature: TimeSignature;
  /** Convenience aliases for notation renderers. */
  beats: number;
  beatType: number;
  events: SheetMusicEvent[];
};

export type SheetMusicAttack = {
  id: string;
  onsetBeat: number;
  durationBeats: number;
  soundingDurationBeats: number;
  measureIndex: number;
  measureNumber: string;
  notes: SheetMusicNote[];
  midiNotes: number[];
  hands: SheetHand[];
  arpeggiate: SheetArpeggiation | null;
};

export type SheetTempoChange = {
  beat: number;
  bpm: number;
};

export type SheetMusicScore = {
  schemaVersion: 1;
  id: string;
  title: string;
  composer: string | null;
  sourceName: string | null;
  tempoBpm: number;
  timeSignature: TimeSignature;
  keyFifths: number | null;
  tempoChanges: SheetTempoChange[];
  measures: SheetMusicMeasure[];
  events: SheetMusicEvent[];
  attacks: SheetMusicAttack[];
  totalBeats: number;
};

export type SheetMusicLoopSelection = {
  startMeasureIndex?: number;
  endMeasureIndex?: number;
  hand?: PracticeHand;
  /** Make a held tie continuation playable when a loop begins in its measure. */
  includeBoundaryTies?: boolean;
  /**
   * Optional exact attack boundary, resolved after the measure and hand filters.
   * Supply both IDs together; the returned practice loop contains that inclusive
   * attack slice and no surrounding attacks from the containing measures.
   */
  startAttackId?: string;
  endAttackId?: string;
};

export type SheetMusicPracticeAttack = SheetMusicAttack & {
  relativeOnsetBeat: number;
  syntheticBoundaryTie: boolean;
};

export type SheetMusicPracticeLoop = {
  scoreId: string;
  startMeasureIndex: number;
  endMeasureIndex: number;
  startBeat: number;
  endBeat: number;
  hand: PracticeHand;
  measureNumbers: string[];
  attacks: SheetMusicPracticeAttack[];
};

export type MidiPerformanceNote = {
  id?: string | number;
  midi: number;
  onsetMs: number;
  velocity?: number;
  /** Optional note-off time; attack-only MIDI remains fully supported. */
  releaseMs?: number;
};

export type MidiAttackCluster = {
  id: string;
  onsetMs: number;
  notes: number[];
  events: MidiPerformanceNote[];
  duplicateNotes: number[];
};

export type FingerDistance = {
  fromMidi: number;
  toMidi: number;
  signedSemitones: number;
  absoluteSemitones: number;
  direction: "left" | "right" | "same";
  signedWhiteKeyWidths: number;
  whiteKeyWidths: number;
  octaveDisplacement: number;
  fromKeyColor: "white" | "black";
  toKeyColor: "white" | "black";
  reach: "same-key" | "adjacent-key" | "within-position" | "hand-shift" | "octave-shift";
  cue: string;
};

export type PitchCorrection = FingerDistance & {
  expectedMidi: number;
  playedMidi: number;
  expectedFingering: number | null;
};

export type ChordSpacing = {
  adjacentSemitones: number[];
  spanSemitones: number;
};

export type SheetEventComparison = {
  expectedIndex: number;
  expected: SheetMusicPracticeAttack;
  actual: MidiAttackCluster | null;
  status: "pending" | "correct" | "incorrect" | "missed";
  expectedNotes: number[];
  actualNotes: number[];
  missingNotes: number[];
  extraNotes: number[];
  pitchMatch: boolean;
  chordMatch: boolean | null;
  expectedSpacing: ChordSpacing;
  actualSpacing: ChordSpacing | null;
  spacingMatch: boolean | null;
  timingErrorMs: number | null;
  timingMatch: boolean | null;
  durationErrorMs: number | null;
  durationMatch: boolean | null;
  durationNoteMidi: number | null;
  durationNoteLabel: string | null;
  arpeggiationMatch: boolean | null;
  corrections: PitchCorrection[];
};

export type RelationshipComparison = {
  fromExpectedIndex: number;
  toExpectedIndex: number;
  expectedSemitones: number;
  playedSemitones: number;
  expectedDirection: "down" | "same" | "up";
  playedDirection: "down" | "same" | "up";
  contourMatch: boolean;
  intervalMatch: boolean;
};

export type RelationshipMetrics = {
  comparisons: RelationshipComparison[];
  contourCompared: number;
  contourMatches: number;
  contourAccuracy: number | null;
  intervalCompared: number;
  intervalMatches: number;
  intervalAccuracy: number | null;
};

export type MetricCount = {
  compared: number;
  matches: number;
  accuracy: number | null;
};

export type SheetPerformanceMetrics = {
  pitch: MetricCount;
  rhythm: MetricCount;
  duration: MetricCount;
  chords: MetricCount;
  chordSpacing: MetricCount;
  arpeggiation: MetricCount;
  soprano: RelationshipMetrics;
  bass: RelationshipMetrics;
};

export type SheetDivergenceKind =
  | "extra-attack"
  | "missing-attack"
  | "pitch"
  | "chord"
  | "arpeggiation"
  | "rhythm"
  | "duration";

export type SheetPerformanceDivergence = {
  kind: SheetDivergenceKind;
  expectedIndex: number | null;
  actualIndex: number | null;
  measureNumber: string | null;
  expectedNotes: number[];
  actualNotes: number[];
  signedSemitoneCorrection: number | null;
  message: string;
};

export type SheetPracticeProgress = {
  completedAttacks: number;
  totalAttacks: number;
  percent: number;
  secureThroughIndex: number | null;
  nextExpectedIndex: number | null;
  nextMeasureNumber: string | null;
};

export type SheetReadingStrategy =
  | "chord-shapes"
  | "chord-anchor"
  | "scale-fragment"
  | "repeated-shape"
  | "hand-coordination"
  | "interval-chain"
  | "landmark-contour";

export type SheetReadingChordSpacing = ChordSpacing & {
  attackIndex: number;
  noteLabels: string[];
};

/**
 * A short, deterministic unit for reading the page as a shape rather than as
 * a queue of unrelated note names. Attack indexes are local to the selected
 * practice loop, so they line up directly with performance comparisons.
 */
export type SheetReadingChunk = {
  id: string;
  ordinal: number;
  /** Stable boundary IDs from the hand-filtered practice loop. */
  startAttackId: string;
  endAttackId: string;
  attackIndexes: number[];
  startAttackIndex: number;
  endAttackIndex: number;
  attackCount: number;
  noteCount: number;
  measureNumbers: string[];
  startBeat: number;
  endBeat: number;
  durationBeats: number;
  hands: SheetHand[];
  handSummary: string;
  attackLabels: string[];
  noteSummary: string;
  strategy: SheetReadingStrategy;
  label: string;
  cue: string;
  /** Signed movement of the upper note from one attack to the next. */
  semitonePattern: number[];
  /** Score-beat spacing between successive attacks. */
  rhythmPatternBeats: number[];
  chordSpacings: SheetReadingChordSpacing[];
  rangeSemitones: number;
};

export type SheetReadingChunkOptions = SheetMusicLoopSelection & {
  /** Inclusive indexes inside the selected loop. */
  startAttackIndex?: number;
  endAttackIndex?: number;
  /** Bounds are deliberately capped at 2–8 to keep a chunk glanceable. */
  minAttacks?: number;
  maxAttacks?: number;
  targetAttacks?: number;
};

export type SheetReadingChunkProgress = {
  chunkId: string;
  attackIndexes: number[];
  successes: number;
  incorrect: number;
  missed: number;
  pending: number;
  attempted: number;
  needsRepair: number;
  status: "pending" | "in-progress" | "secure" | "repair";
  firstRepairAttackIndex: number | null;
};

export type SheetPitchCollectionKind = "major" | "natural-minor" | "major-pentatonic" | "minor-pentatonic";
export type SheetPitchCollectionEvidence = "thin" | "usable" | "rich";
export type SheetPitchCollectionTonicEvidence = "none" | "present" | "edge" | "edge-and-repeated";

export type SheetAuthoredKeyContext = {
  keyFifths: number | null;
  keyMode: string | null;
  status: "not-encoded" | "signature-only" | "explicit-major" | "explicit-minor" | "other-mode";
  label: string;
  tonicPitchClass: number | null;
  tonicLabel: string | null;
  /** Major/minor collections that share the authored signature; these are possibilities, not a detected key. */
  relativePossibilities: string[];
};

export type SheetPitchCollectionCandidate = {
  kind: SheetPitchCollectionKind;
  label: string;
  tonicPitchClass: number;
  tonicLabel: string;
  pitchClasses: number[];
  matchedPitchClasses: number[];
  outsidePitchClasses: number[];
  occurrenceCoverage: number;
  distinctCoverage: number;
  collectionCompleteness: number;
  tonicEvidence: SheetPitchCollectionTonicEvidence;
  signatureCompatible: boolean;
  fitScore: number;
  fit: "compatible" | "partial" | "thin";
  reason: string;
};

export type SheetPitchCollectionAnalysis = {
  observedPitchClasses: number[];
  observedNoteCount: number;
  evidence: SheetPitchCollectionEvidence;
  authored: SheetAuthoredKeyContext;
  candidates: SheetPitchCollectionCandidate[];
  caveat: string;
};

export type SheetPitchCollectionOptions = {
  keyFifths?: number | null;
  keyMode?: string | null;
  maxCandidates?: number;
};

export type SheetPerformanceEvaluation = {
  loop: SheetMusicPracticeLoop;
  clusters: MidiAttackCluster[];
  comparisons: SheetEventComparison[];
  extraClusters: { actualIndex: number; cluster: MidiAttackCluster }[];
  complete: boolean;
  passed: boolean;
  firstDivergence: SheetPerformanceDivergence | null;
  metrics: SheetPerformanceMetrics;
  progress: SheetPracticeProgress;
};

export type SheetPerformanceEvaluationOptions = SheetMusicLoopSelection & {
  /** Compact window for a written block chord. Retained as the legacy chord-window option. */
  clusterWindowMs?: number;
  /** Very small de-jitter window; sequential written single notes never merge beyond this atom. */
  singleAttackWindowMs?: number;
  /** Wider window used only when the written chord carries arpeggiate metadata. */
  arpeggioWindowMs?: number;
  timingToleranceMs?: number;
  durationToleranceMs?: number;
  /** Replaces all score tempo markings for slow-practice evaluation. */
  tempoBpm?: number;
  /** When false, untouched trailing score events remain pending. */
  finalize?: boolean;
};

const STEP_PITCH_CLASS: Record<MusicXmlStep, number> = {
  C: 0,
  D: 2,
  E: 4,
  F: 5,
  G: 7,
  A: 9,
  B: 11,
};

const FLAT_PITCH_CLASS_SPELLING: ReadonlyArray<{ step: MusicXmlStep; alter: number }> = [
  { step: "C", alter: 0 },
  { step: "D", alter: -1 },
  { step: "D", alter: 0 },
  { step: "E", alter: -1 },
  { step: "E", alter: 0 },
  { step: "F", alter: 0 },
  { step: "G", alter: -1 },
  { step: "G", alter: 0 },
  { step: "A", alter: -1 },
  { step: "A", alter: 0 },
  { step: "B", alter: -1 },
  { step: "B", alter: 0 },
];

const FLAT_NAMES = ["C", "D♭", "D", "E♭", "E", "F", "G♭", "G", "A♭", "A", "B♭", "B"] as const;
const SHARP_NAMES = ["C", "C♯", "D", "D♯", "E", "F", "F♯", "G", "G♯", "A", "A♯", "B"] as const;
const BLACK_PITCH_CLASSES = new Set([1, 3, 6, 8, 10]);
const WHITE_KEY_X = [0, 0.5, 1, 1.5, 2, 3, 3.5, 4, 4.5, 5, 5.5, 6] as const;
const MAX_SCORE_EVENTS = 50_000;
const MAX_MIDI_EVENTS = 10_000;
const MAX_ALIGNMENT_CELLS = 4_000_000;
const MAX_ATOMS_PER_CHORD = 16;
const EPSILON = 1e-7;

const PITCH_COLLECTION_PATTERNS: ReadonlyArray<{ kind: SheetPitchCollectionKind; intervals: readonly number[] }> = [
  { kind: "major", intervals: [0, 2, 4, 5, 7, 9, 11] },
  { kind: "natural-minor", intervals: [0, 2, 3, 5, 7, 8, 10] },
  { kind: "major-pentatonic", intervals: [0, 2, 4, 7, 9] },
  { kind: "minor-pentatonic", intervals: [0, 3, 5, 7, 10] },
] as const;

const MAJOR_KEYS_BY_FIFTHS = [
  { pitchClass: 11, label: "C♭" }, { pitchClass: 6, label: "G♭" }, { pitchClass: 1, label: "D♭" },
  { pitchClass: 8, label: "A♭" }, { pitchClass: 3, label: "E♭" }, { pitchClass: 10, label: "B♭" },
  { pitchClass: 5, label: "F" }, { pitchClass: 0, label: "C" }, { pitchClass: 7, label: "G" },
  { pitchClass: 2, label: "D" }, { pitchClass: 9, label: "A" }, { pitchClass: 4, label: "E" },
  { pitchClass: 11, label: "B" }, { pitchClass: 6, label: "F♯" }, { pitchClass: 1, label: "C♯" },
] as const;

const MINOR_KEYS_BY_FIFTHS = [
  { pitchClass: 8, label: "A♭" }, { pitchClass: 3, label: "E♭" }, { pitchClass: 10, label: "B♭" },
  { pitchClass: 5, label: "F" }, { pitchClass: 0, label: "C" }, { pitchClass: 7, label: "G" },
  { pitchClass: 2, label: "D" }, { pitchClass: 9, label: "A" }, { pitchClass: 4, label: "E" },
  { pitchClass: 11, label: "B" }, { pitchClass: 6, label: "F♯" }, { pitchClass: 1, label: "C♯" },
  { pitchClass: 8, label: "G♯" }, { pitchClass: 3, label: "D♯" }, { pitchClass: 10, label: "A♯" },
] as const;

function assertFinite(value: number, label: string) {
  if (!Number.isFinite(value)) throw new RangeError(`${label} must be finite.`);
}

function assertPositive(value: number, label: string) {
  assertFinite(value, label);
  if (value <= 0) throw new RangeError(`${label} must be greater than zero.`);
}

function assertMidi(value: number, label = "MIDI note") {
  if (!Number.isInteger(value) || value < 0 || value > 127) {
    throw new RangeError(`${label} must be an integer from 0 through 127.`);
  }
}

function boundedText(value: unknown, label: string, required: boolean) {
  if (value === undefined || value === null) {
    if (required) throw new TypeError(`${label} is required.`);
    return null;
  }
  if (typeof value !== "string") throw new TypeError(`${label} must be text.`);
  const normalized = value.trim();
  if (required && !normalized) throw new TypeError(`${label} cannot be blank.`);
  if (normalized.length > 240) throw new RangeError(`${label} is too long.`);
  return normalized || null;
}

function normalizeTimeSignature(value: TimeSignature | undefined): TimeSignature {
  const signature = value ?? { beats: 4, beatType: 4 };
  if (!Number.isInteger(signature.beats) || signature.beats < 1 || signature.beats > 32) {
    throw new RangeError("Time-signature beats must be an integer from 1 through 32.");
  }
  if (!Number.isInteger(signature.beatType) || ![1, 2, 4, 8, 16, 32, 64].includes(signature.beatType)) {
    throw new RangeError("Time-signature beat type must be a standard power-of-two denominator.");
  }
  return { ...signature };
}

function normalizeHand(hand: SheetHand | undefined, staff: number) {
  if (hand !== undefined && !SHEET_HANDS.includes(hand)) throw new RangeError("Unknown score hand.");
  return hand ?? (staff === 1 ? "right" : staff === 2 ? "left" : "unknown");
}

function normalizeArpeggiation(value: SheetMusicNoteInput["arpeggiate"]): SheetArpeggiation | null {
  if (value === true) return "unspecified";
  if (value === false || value === undefined) return null;
  if (value === "up" || value === "down" || value === "unspecified") return value;
  throw new RangeError("Unknown MusicXML arpeggiation direction.");
}

function midiLabel(midi: number) {
  return `${FLAT_NAMES[midi % 12]}${Math.floor(midi / 12) - 1}`;
}

function performedMidiLabel(midi: number, keyFifths: number | null) {
  const names = (keyFifths ?? 0) > 0 ? SHARP_NAMES : FLAT_NAMES;
  return `${names[midi % 12]}${Math.floor(midi / 12) - 1} (performed MIDI ${midi})`;
}

function uniqueSorted(values: number[]) {
  return [...new Set(values)].sort((first, second) => first - second);
}

function equalNumbers(first: number[], second: number[]) {
  return first.length === second.length && first.every((value, index) => value === second[index]);
}

function metric(matches: number, compared: number): MetricCount {
  return { matches, compared, accuracy: compared ? matches / compared : null };
}

function direction(interval: number): "down" | "same" | "up" {
  return interval === 0 ? "same" : interval > 0 ? "up" : "down";
}

/** Convert a written MusicXML pitch to equal-tempered MIDI without respelling it. */
export function musicXmlPitch(step: MusicXmlStep, alter: number, octave: number): SheetMusicPitch {
  if (!MUSIC_XML_STEPS.includes(step)) throw new RangeError("Unknown MusicXML pitch step.");
  if (!Number.isInteger(alter) || alter < -2 || alter > 2) {
    throw new RangeError("MusicXML alter must be an integer from -2 through 2 for MIDI coaching.");
  }
  if (!Number.isInteger(octave) || octave < -1 || octave > 9) throw new RangeError("MusicXML octave is outside MIDI notation range.");
  const midi = (octave + 1) * 12 + STEP_PITCH_CLASS[step] + alter;
  assertMidi(midi, "Written pitch");
  const accidental = alter === -2 ? "𝄫" : alter === -1 ? "♭" : alter === 1 ? "♯" : alter === 2 ? "𝄪" : "";
  return { step, alter, octave, midi, label: `${step}${accidental}${octave}` };
}

/** Convert MusicXML duration divisions to quarter-note beats. */
export function musicXmlDurationToBeats(duration: number, divisions: number) {
  if (!Number.isInteger(duration) || duration < 0) throw new RangeError("MusicXML duration must be a non-negative integer.");
  if (!Number.isInteger(divisions) || divisions < 1) throw new RangeError("MusicXML divisions must be a positive integer.");
  return duration / divisions;
}

/** Conventional grand-staff default; an XML parser may override cross-staff notes explicitly. */
export function handFromMusicXmlStaff(staff: number, staves = 2): SheetHand {
  if (!Number.isInteger(staff) || staff < 1) throw new RangeError("MusicXML staff must be a positive integer.");
  if (!Number.isInteger(staves) || staves < 1) throw new RangeError("MusicXML staves must be a positive integer.");
  if (staves === 2) return staff === 1 ? "right" : staff === 2 ? "left" : "unknown";
  return "unknown";
}

function normalizePitch(input: SheetMusicNoteInput) {
  if (input.pitch) {
    const pitch = musicXmlPitch(input.pitch.step, input.pitch.alter ?? 0, input.pitch.octave);
    if (input.midi !== undefined && input.midi !== pitch.midi) {
      throw new RangeError("Written pitch and supplied MIDI note disagree.");
    }
    return pitch;
  }
  if (input.midi === undefined) throw new TypeError("Score notes need either a written pitch or a MIDI note.");
  assertMidi(input.midi, "Score MIDI note");
  const octave = Math.floor(input.midi / 12) - 1;
  const spelling = FLAT_PITCH_CLASS_SPELLING[input.midi % 12];
  return { ...spelling, octave, midi: input.midi, label: midiLabel(input.midi) };
}

function groupScoreAttacks(notes: SheetMusicNote[]) {
  const attacks = notes.filter((note) => note.isAttack).sort((first, second) => first.onsetBeat - second.onsetBeat || first.pitch.midi - second.pitch.midi || first.id.localeCompare(second.id));
  const grouped: SheetMusicAttack[] = [];
  for (const note of attacks) {
    const previous = grouped.at(-1);
    if (previous && Math.abs(previous.onsetBeat - note.onsetBeat) <= EPSILON) {
      previous.notes.push(note);
      previous.midiNotes = uniqueSorted(previous.notes.map((item) => item.pitch.midi));
      previous.hands = [...new Set(previous.notes.map((item) => item.hand))].sort();
      previous.durationBeats = Math.max(previous.durationBeats, note.soundingDurationBeats);
      previous.soundingDurationBeats = previous.durationBeats;
      previous.arpeggiate ??= note.arpeggiate;
      previous.id = `attack:${previous.notes.map((item) => item.id).sort().join("+")}`;
    } else {
      grouped.push({
        id: `attack:${note.id}`,
        onsetBeat: note.onsetBeat,
        durationBeats: note.soundingDurationBeats,
        soundingDurationBeats: note.soundingDurationBeats,
        measureIndex: note.measureIndex,
        measureNumber: note.measureNumber,
        notes: [note],
        midiNotes: [note.pitch.midi],
        hands: [note.hand],
        arpeggiate: note.arpeggiate,
      });
    }
  }
  return grouped;
}

function resolveTiedSoundingDurations(notes: SheetMusicNote[]) {
  type TieChain = { notes: SheetMusicNote[]; endBeat: number };
  const open = new Map<string, TieChain>();
  const ordered = [...notes].sort((first, second) => first.onsetBeat - second.onsetBeat || first.staff - second.staff || first.voice.localeCompare(second.voice) || first.pitch.midi - second.pitch.midi || first.id.localeCompare(second.id));

  const finish = (chain: TieChain) => {
    for (const segment of chain.notes) {
      // Keep segment.durationBeats untouched for notation. Every segment also
      // knows how long the already-sounding key remains held from its own onset,
      // which makes a loop beginning on a continuation independently playable.
      segment.soundingDurationBeats = Math.max(segment.durationBeats, chain.endBeat - segment.onsetBeat);
    }
  };

  for (const note of ordered) {
    const key = `${note.staff}:${note.voice}:${note.pitch.midi}`;
    let chain = open.get(key);
    const contiguousStop = note.tie.stop && chain !== undefined && Math.abs(chain.endBeat - note.onsetBeat) <= EPSILON;
    if (chain && !contiguousStop) {
      finish(chain);
      open.delete(key);
      chain = undefined;
    }

    if (contiguousStop && chain) {
      note.isAttack = false;
      chain.notes.push(note);
      chain.endBeat = note.onsetBeat + note.durationBeats;
    } else {
      // A stop without its earlier segment is a valid truncated import/loop,
      // not an invalid silent event. Treat the visible segment as a new attack.
      note.isAttack = true;
      chain = { notes: [note], endBeat: note.onsetBeat + note.durationBeats };
    }

    if (note.tie.start) open.set(key, chain);
    else {
      finish(chain);
      open.delete(key);
    }
  }
  for (const chain of open.values()) finish(chain);
}

/** Validate parser output and derive score-global timing and attack moments. */
export function normalizeSheetMusicScore(input: SheetMusicScoreInput): SheetMusicScore {
  if (!input || typeof input !== "object") throw new TypeError("A sheet-music score object is required.");
  const id = boundedText(input.id, "Score id", true)!;
  const title = boundedText(input.title, "Score title", true)!;
  const composer = boundedText(input.composer, "Composer", false);
  const sourceName = boundedText(input.sourceName, "Source name", false);
  assertPositive(input.tempoBpm, "Score tempo");
  if (input.tempoBpm > 400) throw new RangeError("Score tempo must not exceed 400 BPM.");
  const timeSignature = normalizeTimeSignature(input.timeSignature);
  if (input.keyFifths !== undefined && input.keyFifths !== null && (!Number.isInteger(input.keyFifths) || input.keyFifths < -7 || input.keyFifths > 7)) {
    throw new RangeError("Key fifths must be an integer from -7 through 7.");
  }
  if (!Array.isArray(input.measures) || input.measures.length === 0) throw new TypeError("A score needs at least one measure.");
  const eventCount = input.measures.reduce((sum, measure) => sum + (Array.isArray(measure.events) ? measure.events.length : 0), 0);
  if (eventCount > MAX_SCORE_EVENTS) throw new RangeError(`Scores are limited to ${MAX_SCORE_EVENTS.toLocaleString()} source events.`);

  const ids = new Set<string>();
  const measures: SheetMusicMeasure[] = [];
  const events: SheetMusicEvent[] = [];
  let startBeat = 0;
  let inheritedSignature = timeSignature;

  input.measures.forEach((measureInput, measureIndex) => {
    assertPositive(measureInput.durationBeats, `Measure ${measureIndex + 1} duration`);
    if (!Array.isArray(measureInput.events)) throw new TypeError(`Measure ${measureIndex + 1} events must be an array.`);
    const measureNumber = String(measureInput.number).trim();
    if (!measureNumber) throw new TypeError(`Measure ${measureIndex + 1} number cannot be blank.`);
    inheritedSignature = measureInput.timeSignature ? normalizeTimeSignature(measureInput.timeSignature) : inheritedSignature;
    const measureId = boundedText(measureInput.id, `Measure ${measureNumber} id`, false) ?? `measure-${measureIndex + 1}`;
    if (ids.has(measureId)) throw new RangeError(`Duplicate score id: ${measureId}.`);
    ids.add(measureId);
    const measureEvents: SheetMusicEvent[] = [];

    measureInput.events.forEach((eventInput, eventIndex) => {
      if (eventInput.kind !== "note" && eventInput.kind !== "rest") throw new RangeError(`Unknown event kind in measure ${measureNumber}.`);
      assertFinite(eventInput.offsetBeats, `Event offset in measure ${measureNumber}`);
      if (eventInput.offsetBeats < 0 || eventInput.offsetBeats > measureInput.durationBeats + EPSILON) {
        throw new RangeError(`Event offset falls outside measure ${measureNumber}.`);
      }
      assertPositive(eventInput.durationBeats, `Event duration in measure ${measureNumber}`);
      if (eventInput.offsetBeats + eventInput.durationBeats > measureInput.durationBeats + EPSILON) {
        throw new RangeError(`Event extends beyond measure ${measureNumber}. Split tied notes at barlines.`);
      }
      const staff = eventInput.staff ?? 1;
      if (!Number.isInteger(staff) || staff < 1 || staff > 16) throw new RangeError("Score staff must be an integer from 1 through 16.");
      const voice = boundedText(eventInput.voice, "Score voice", false) ?? "1";
      const eventId = boundedText(eventInput.id, `Event ${eventIndex + 1} id`, false) ?? `${measureId}-event-${eventIndex + 1}`;
      if (ids.has(eventId)) throw new RangeError(`Duplicate score id: ${eventId}.`);
      ids.add(eventId);
      const base: NormalizedEventBase = {
        id: eventId,
        measureIndex,
        measureNumber,
        offsetBeats: eventInput.offsetBeats,
        onsetBeat: startBeat + eventInput.offsetBeats,
        durationBeats: eventInput.durationBeats,
        staff,
        voice,
        hand: normalizeHand(eventInput.hand, staff),
      };
      const event: SheetMusicEvent = eventInput.kind === "rest"
        ? { ...base, kind: "rest", measureRest: eventInput.measureRest === true }
        : (() => {
          if (eventInput.fingering !== undefined && (!Number.isInteger(eventInput.fingering) || eventInput.fingering < 1 || eventInput.fingering > 5)) {
            throw new RangeError("Score fingering must be an integer from 1 through 5.");
          }
          const tie = { start: eventInput.tie?.start === true, stop: eventInput.tie?.stop === true };
          return {
            ...base,
            kind: "note" as const,
            pitch: normalizePitch(eventInput),
            tie,
            fingering: eventInput.fingering ?? null,
            arpeggiate: normalizeArpeggiation(eventInput.arpeggiate),
            isAttack: !tie.stop,
            soundingDurationBeats: eventInput.durationBeats,
          };
        })();
      measureEvents.push(event);
      events.push(event);
    });
    measureEvents.sort((first, second) => first.onsetBeat - second.onsetBeat || first.staff - second.staff || first.voice.localeCompare(second.voice) || first.id.localeCompare(second.id));
    measures.push({
      id: measureId,
      index: measureIndex,
      number: measureNumber,
      startBeat,
      durationBeats: measureInput.durationBeats,
      timeSignature: { ...inheritedSignature },
      beats: inheritedSignature.beats,
      beatType: inheritedSignature.beatType,
      events: measureEvents,
    });
    startBeat += measureInput.durationBeats;
  });

  const rawTempoChanges = input.tempoChanges ?? [];
  if (!Array.isArray(rawTempoChanges)) throw new TypeError("Score tempo changes must be an array.");
  const tempoChanges = [{ beat: 0, bpm: input.tempoBpm }, ...rawTempoChanges.map((change) => ({ ...change }))]
    .sort((first, second) => first.beat - second.beat);
  const normalizedTempo: SheetTempoChange[] = [];
  for (const change of tempoChanges) {
    assertFinite(change.beat, "Tempo-change beat");
    assertPositive(change.bpm, "Tempo-change BPM");
    if (change.beat < 0 || change.beat > startBeat + EPSILON) throw new RangeError("Tempo change falls outside the score.");
    if (change.bpm > 400) throw new RangeError("Tempo-change BPM must not exceed 400.");
    if (normalizedTempo.at(-1)?.beat === change.beat) normalizedTempo[normalizedTempo.length - 1] = change;
    else normalizedTempo.push(change);
  }

  const notes = events.filter((event): event is SheetMusicNote => event.kind === "note");
  resolveTiedSoundingDurations(notes);
  return {
    schemaVersion: 1,
    id,
    title,
    composer,
    sourceName,
    tempoBpm: input.tempoBpm,
    timeSignature,
    keyFifths: input.keyFifths ?? null,
    tempoChanges: normalizedTempo,
    measures,
    events: [...events].sort((first, second) => first.onsetBeat - second.onsetBeat || first.id.localeCompare(second.id)),
    attacks: groupScoreAttacks(notes),
    totalBeats: startBeat,
  };
}

export function isNormalizedSheetMusicScore(value: unknown): value is SheetMusicScore {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<SheetMusicScore>;
  return candidate.schemaVersion === 1
    && typeof candidate.id === "string"
    && typeof candidate.title === "string"
    && typeof candidate.tempoBpm === "number"
    && Array.isArray(candidate.measures)
    && Array.isArray(candidate.events)
    && Array.isArray(candidate.attacks);
}

function filterAttackForHand(attack: SheetMusicAttack, hand: PracticeHand): SheetMusicAttack | null {
  const notes = hand === "both" ? attack.notes : attack.notes.filter((note) => note.hand === hand);
  if (!notes.length) return null;
  return {
    ...attack,
    id: hand === "both" ? attack.id : `${attack.id}:${hand}`,
    durationBeats: Math.max(...notes.map((note) => note.soundingDurationBeats)),
    soundingDurationBeats: Math.max(...notes.map((note) => note.soundingDurationBeats)),
    notes,
    midiNotes: uniqueSorted(notes.map((note) => note.pitch.midi)),
    hands: [...new Set(notes.map((note) => note.hand))].sort(),
    arpeggiate: notes.find((note) => note.arpeggiate !== null)?.arpeggiate ?? null,
  };
}

/** Select an inclusive measure loop and optionally isolate one hand. */
export function selectSheetMusicLoop(score: SheetMusicScore, selection: SheetMusicLoopSelection = {}): SheetMusicPracticeLoop {
  if (!isNormalizedSheetMusicScore(score)) throw new TypeError("Select a loop from a normalized sheet-music score.");
  const startMeasureIndex = selection.startMeasureIndex ?? 0;
  const endMeasureIndex = selection.endMeasureIndex ?? score.measures.length - 1;
  if (!Number.isInteger(startMeasureIndex) || !Number.isInteger(endMeasureIndex)
    || startMeasureIndex < 0 || endMeasureIndex >= score.measures.length || startMeasureIndex > endMeasureIndex) {
    throw new RangeError("Loop measure indexes must form a valid inclusive range.");
  }
  const hand = selection.hand ?? "both";
  if (![...SHEET_HANDS, "both"].includes(hand)) throw new RangeError("Unknown practice hand.");
  const startMeasure = score.measures[startMeasureIndex];
  const endMeasure = score.measures[endMeasureIndex];
  const startBeat = startMeasure.startBeat;
  const endBeat = endMeasure.startBeat + endMeasure.durationBeats;
  let attacks = score.attacks
    .filter((attack) => attack.onsetBeat >= startBeat - EPSILON && attack.onsetBeat < endBeat - EPSILON)
    .map((attack) => filterAttackForHand(attack, hand))
    .filter((attack): attack is SheetMusicAttack => attack !== null)
    .map((attack): SheetMusicPracticeAttack => ({ ...attack, relativeOnsetBeat: attack.onsetBeat - startBeat, syntheticBoundaryTie: false }));

  if (selection.includeBoundaryTies !== false) {
    const boundaryTies = startMeasure.events
      .filter((event): event is SheetMusicNote => event.kind === "note" && event.tie.stop && !event.isAttack && Math.abs(event.onsetBeat - startBeat) <= EPSILON)
      .filter((note) => hand === "both" || note.hand === hand);
    if (boundaryTies.length) {
      const existingBoundary = attacks.find((attack) => Math.abs(attack.onsetBeat - startBeat) <= EPSILON);
      if (existingBoundary) {
        const mergedNotes = [...existingBoundary.notes, ...boundaryTies].filter((note, index, all) => all.findIndex((candidate) => candidate.id === note.id) === index);
        existingBoundary.notes = mergedNotes;
        existingBoundary.midiNotes = uniqueSorted(mergedNotes.map((note) => note.pitch.midi));
        existingBoundary.hands = [...new Set(mergedNotes.map((note) => note.hand))].sort();
        existingBoundary.durationBeats = Math.max(...mergedNotes.map((note) => note.soundingDurationBeats));
        existingBoundary.soundingDurationBeats = existingBoundary.durationBeats;
        existingBoundary.arpeggiate = mergedNotes.find((note) => note.arpeggiate !== null)?.arpeggiate ?? null;
        existingBoundary.id = `boundary-attack:${mergedNotes.map((note) => note.id).sort().join("+")}`;
        existingBoundary.syntheticBoundaryTie = true;
      } else {
        attacks.unshift({
          id: `boundary-tie:${boundaryTies.map((note) => note.id).join("+")}`,
          onsetBeat: startBeat,
          relativeOnsetBeat: 0,
          durationBeats: Math.max(...boundaryTies.map((note) => note.soundingDurationBeats)),
          soundingDurationBeats: Math.max(...boundaryTies.map((note) => note.soundingDurationBeats)),
          measureIndex: startMeasureIndex,
          measureNumber: startMeasure.number,
          notes: boundaryTies,
          midiNotes: uniqueSorted(boundaryTies.map((note) => note.pitch.midi)),
          hands: [...new Set(boundaryTies.map((note) => note.hand))].sort(),
          arpeggiate: boundaryTies.find((note) => note.arpeggiate !== null)?.arpeggiate ?? null,
          syntheticBoundaryTie: true,
        });
      }
    }
  }
  attacks.sort((first, second) => first.onsetBeat - second.onsetBeat || first.id.localeCompare(second.id));
  const hasStartAttackId = selection.startAttackId !== undefined;
  const hasEndAttackId = selection.endAttackId !== undefined;
  if (hasStartAttackId !== hasEndAttackId) {
    throw new RangeError("Exact attack selection requires both startAttackId and endAttackId.");
  }
  if (hasStartAttackId && hasEndAttackId) {
    const startAttackId = selection.startAttackId;
    const endAttackId = selection.endAttackId;
    if (typeof startAttackId !== "string" || !startAttackId.trim() || typeof endAttackId !== "string" || !endAttackId.trim()) {
      throw new TypeError("Exact attack selection IDs must be non-empty text.");
    }
    const startAttackIndex = attacks.findIndex((attack) => attack.id === startAttackId);
    const endAttackIndex = attacks.findIndex((attack) => attack.id === endAttackId);
    if (startAttackIndex < 0 || endAttackIndex < 0) {
      throw new RangeError("Exact attack selection IDs must exist after the measure and hand filters.");
    }
    if (startAttackIndex > endAttackIndex) {
      throw new RangeError("Exact attack selection must run from an earlier attack ID through a later attack ID.");
    }
    attacks = attacks.slice(startAttackIndex, endAttackIndex + 1);
  }
  return {
    scoreId: score.id,
    startMeasureIndex,
    endMeasureIndex,
    startBeat,
    endBeat,
    hand,
    measureNumbers: score.measures.slice(startMeasureIndex, endMeasureIndex + 1).map((measure) => measure.number),
    attacks,
  };
}

function attackUpperNote(attack: SheetMusicAttack) {
  return attack.midiNotes.at(-1)!;
}

function attackLowerNote(attack: SheetMusicAttack) {
  return attack.midiNotes[0];
}

function attackLabel(attack: SheetMusicAttack) {
  return attack.notes
    .slice()
    .sort((first, second) => first.pitch.midi - second.pitch.midi || first.id.localeCompare(second.id))
    .map((note) => note.pitch.label)
    .join(" + ");
}

function shortAttackSequence(labels: string[]) {
  if (labels.length <= 5) return labels.join(" → ");
  return `${labels.slice(0, 2).join(" → ")} → … → ${labels.slice(-2).join(" → ")}`;
}

function stableReadingChunkId(scoreId: string, hand: PracticeHand, startAttackId: string, endAttackId: string) {
  const value = `${scoreId}\u001f${hand}\u001f${startAttackId}\u001f${endAttackId}`;
  let first = 0x811c9dc5;
  let second = 0x9e3779b9;
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    first = Math.imul(first ^ code, 0x01000193);
    second = Math.imul(second ^ code, 0x85ebca6b);
  }
  return `reading-chunk-${(first >>> 0).toString(36)}-${(second >>> 0).toString(36)}`;
}

function handSummary(hands: SheetHand[]) {
  const known = hands.filter((hand) => hand !== "unknown");
  if (known.includes("left") && known.includes("right")) return "both hands";
  if (known[0] === "left") return "left hand";
  if (known[0] === "right") return "right hand";
  return "hand not encoded";
}

function repeatedShapePeriod(attacks: SheetMusicAttack[]) {
  if (attacks.length < 4) return null;
  const shape = (block: SheetMusicAttack[]) => {
    const firstUpper = attackUpperNote(block[0]);
    const firstLower = attackLowerNote(block[0]);
    return JSON.stringify(block.map((attack) => ({
      upper: attackUpperNote(attack) - firstUpper,
      lower: attackLowerNote(attack) - firstLower,
      chord: chordSpacing(attack.midiNotes).adjacentSemitones,
      hands: [...attack.hands].sort(),
    })));
  };
  for (let period = 2; period <= Math.floor(attacks.length / 2); period += 1) {
    if (attacks.length % period !== 0) continue;
    const source = shape(attacks.slice(0, period));
    let repeated = true;
    for (let start = period; start < attacks.length; start += period) {
      if (shape(attacks.slice(start, start + period)) !== source) {
        repeated = false;
        break;
      }
    }
    if (repeated) return period;
  }
  return null;
}

function readingStrategy(attacks: SheetMusicAttack[], semitones: number[]) {
  const chordCount = attacks.filter((attack) => attack.midiNotes.length > 1).length;
  const compactChordCount = attacks.filter((attack) => {
    const spacing = chordSpacing(attack.midiNotes);
    return attack.midiNotes.length > 1 && spacing.spanSemitones <= 12;
  }).length;
  const repeatedPeriod = repeatedShapePeriod(attacks);
  const movingIntervals = semitones.filter((interval) => interval !== 0);
  const stepwise = movingIntervals.length >= 2
    && movingIntervals.every((interval) => Math.abs(interval) <= 2)
    && movingIntervals.every((interval) => Math.sign(interval) === Math.sign(movingIntervals[0]));
  const hands = new Set(attacks.flatMap((attack) => attack.hands).filter((hand) => hand !== "unknown"));
  const coordinated = hands.has("left") && hands.has("right");
  const intervalText = semitones.length ? semitones.map((interval) => `${interval > 0 ? "+" : ""}${interval}`).join(" · ") : "hold the same landing";

  if (chordCount >= 2 && chordCount >= Math.ceil(attacks.length / 2)) {
    return {
      strategy: "chord-shapes" as const,
      label: "Read the chord shapes",
      cue: `Land ${chordCount} chord attacks as spacing shapes; the upper path moves ${intervalText} semitones.`,
    };
  }
  if (compactChordCount) {
    const anchorIndex = attacks.findIndex((attack) => attack.midiNotes.length > 1 && chordSpacing(attack.midiNotes).spanSemitones <= 12);
    return {
      strategy: "chord-anchor" as const,
      label: "Anchor on the compact chord",
      cue: `Set the ${anchorIndex === 0 ? "opening" : `attack ${anchorIndex + 1}`} chord shape, then read the path around it.`,
    };
  }
  if (repeatedPeriod !== null) {
    return {
      strategy: "repeated-shape" as const,
      label: `Repeat the ${repeatedPeriod}-attack shape`,
      cue: "Notice the same contour and chord spacing returning from a new or repeated landing.",
    };
  }
  if (stepwise) {
    const rising = movingIntervals[0] > 0;
    return {
      strategy: "scale-fragment" as const,
      label: `Read one ${rising ? "rising" : "falling"} step shape`,
      cue: `Keep the direction; the successive moves are ${intervalText} semitones.`,
    };
  }
  if (coordinated) {
    return {
      strategy: "hand-coordination" as const,
      label: "Pair the two hand landmarks",
      cue: "See each upper and lower landing as one coordinated attack, then trace their shared motion.",
    };
  }
  if (semitones.length) {
    return {
      strategy: "interval-chain" as const,
      label: "Read the interval chain",
      cue: `Move the upper line ${intervalText} semitones instead of decoding every note again.`,
    };
  }
  return {
    strategy: "landmark-contour" as const,
    label: "Place one landmark",
    cue: "Locate this landing on the staff and keyboard before looking ahead.",
  };
}

function readingBoundaryScore(
  restBoundaryPositions: Set<number>,
  indexed: Array<{ attack: SheetMusicPracticeAttack; index: number }>,
  position: number,
) {
  const previous = indexed[position - 1].attack;
  const next = indexed[position].attack;
  let value = 0;
  if (previous.measureIndex !== next.measureIndex) value += 10;
  if (restBoundaryPositions.has(position)) value += 8;
  const silence = next.onsetBeat - (previous.onsetBeat + previous.soundingDurationBeats);
  if (silence >= 0.5 - EPSILON) value += 6;
  else if (next.onsetBeat - previous.onsetBeat >= 2 - EPSILON) value += 2;
  const previousHands = previous.hands.filter((hand) => hand !== "unknown");
  const nextHands = next.hands.filter((hand) => hand !== "unknown");
  if (previousHands.length === 1 && nextHands.length === 1 && previousHands[0] !== nextHands[0]) value += 5;
  if (next.midiNotes.length > 1 && previous.midiNotes.length === 1) value += 3;
  if (position >= 2) {
    const earlier = indexed[position - 2].attack;
    const before = attackUpperNote(previous) - attackUpperNote(earlier);
    const after = attackUpperNote(next) - attackUpperNote(previous);
    if (before !== 0 && after !== 0 && Math.sign(before) !== Math.sign(after)) value += 1;
  }
  return value;
}

function readingChunkSegments(
  restBoundaryPositions: Set<number>,
  indexed: Array<{ attack: SheetMusicPracticeAttack; index: number }>,
  minAttacks: number,
  maxAttacks: number,
  targetAttacks: number,
) {
  const segments: Array<Array<{ attack: SheetMusicPracticeAttack; index: number }>> = [];
  let start = 0;
  while (start < indexed.length) {
    const remaining = indexed.length - start;
    if (remaining === 1) {
      const previous = segments.at(-1);
      if (previous && previous.length < maxAttacks) previous.push(indexed[start]);
      else segments.push([indexed[start]]);
      break;
    }

    const upper = Math.min(indexed.length - minAttacks, start + maxAttacks);
    const lower = start + minAttacks;
    const candidates: Array<{ position: number; boundary: number; targetDistance: number }> = [];
    for (let position = lower; position <= upper; position += 1) {
      candidates.push({
        position,
        boundary: readingBoundaryScore(restBoundaryPositions, indexed, position),
        targetDistance: Math.abs(position - start - targetAttacks),
      });
    }

    if (remaining <= maxAttacks) {
      const strong = candidates
        .filter((candidate) => candidate.boundary >= 6)
        .sort((first, second) => second.boundary - first.boundary || first.targetDistance - second.targetDistance || first.position - second.position)[0];
      if (!strong) {
        segments.push(indexed.slice(start));
        break;
      }
      segments.push(indexed.slice(start, strong.position));
      start = strong.position;
      continue;
    }

    const chosen = candidates.sort((first, second) => second.boundary - first.boundary || first.targetDistance - second.targetDistance || first.position - second.position)[0];
    if (!chosen) throw new Error("Unable to divide score attacks into readable chunks.");
    segments.push(indexed.slice(start, chosen.position));
    start = chosen.position;
  }
  return segments;
}

/**
 * Divide a selected practice loop into short reading shapes. Bar lines, real
 * rests, hand changes, and chord anchors influence the boundaries, while the
 * 2–8 attack bounds prevent either isolated glyphs or cognitively heavy runs.
 */
export function buildSheetMusicReadingChunks(score: SheetMusicScore, options: SheetReadingChunkOptions = {}): SheetReadingChunk[] {
  const minAttacks = options.minAttacks ?? 2;
  const maxAttacks = options.maxAttacks ?? 6;
  const targetAttacks = options.targetAttacks ?? 4;
  if (!Number.isInteger(minAttacks) || !Number.isInteger(maxAttacks) || minAttacks < 2 || maxAttacks > 8 || minAttacks > maxAttacks) {
    throw new RangeError("Reading chunks need integer bounds from 2 through 8 attacks.");
  }
  if (!Number.isInteger(targetAttacks) || targetAttacks < minAttacks || targetAttacks > maxAttacks) {
    throw new RangeError("Reading-chunk target must fall inside its minimum and maximum bounds.");
  }
  const hasStartAttackId = options.startAttackId !== undefined;
  const hasEndAttackId = options.endAttackId !== undefined;
  if (hasStartAttackId !== hasEndAttackId) {
    throw new RangeError("Exact attack selection requires both startAttackId and endAttackId.");
  }
  const hasExactIdRange = hasStartAttackId && hasEndAttackId;
  const hasLocalIndexRange = options.startAttackIndex !== undefined || options.endAttackIndex !== undefined;
  if (hasExactIdRange && hasLocalIndexRange) {
    throw new RangeError("Reading chunks accept either stable attack IDs or loop-local attack indexes, not both.");
  }
  const loop = selectSheetMusicLoop(score, options);
  if (!loop.attacks.length) return [];
  const startAttackIndex = options.startAttackIndex ?? 0;
  const endAttackIndex = options.endAttackIndex ?? loop.attacks.length - 1;
  if (!Number.isInteger(startAttackIndex) || !Number.isInteger(endAttackIndex)
    || startAttackIndex < 0 || endAttackIndex >= loop.attacks.length || startAttackIndex > endAttackIndex) {
    throw new RangeError("Reading-chunk attack indexes must form a valid inclusive range inside the selected loop.");
  }
  const indexed = loop.attacks
    .map((attack, index) => ({ attack, index }))
    .slice(startAttackIndex, endAttackIndex + 1);
  const relevantRests = score.events.filter((event): event is SheetMusicRest => event.kind === "rest"
    && event.onsetBeat >= loop.startBeat - EPSILON
    && event.onsetBeat < loop.endBeat - EPSILON
    && (loop.hand === "both" || event.hand === loop.hand || event.hand === "unknown"))
    .sort((first, second) => first.onsetBeat - second.onsetBeat || first.id.localeCompare(second.id));
  const restBoundaryPositions = new Set<number>();
  let restIndex = 0;
  for (let position = 1; position < indexed.length; position += 1) {
    const previous = indexed[position - 1].attack;
    const next = indexed[position].attack;
    if (next.onsetBeat - previous.onsetBeat <= 0.5 + EPSILON) continue;
    while (restIndex < relevantRests.length && relevantRests[restIndex].onsetBeat <= previous.onsetBeat + EPSILON) restIndex += 1;
    let candidate = restIndex;
    while (candidate < relevantRests.length && relevantRests[candidate].onsetBeat < next.onsetBeat - EPSILON) {
      const rest = relevantRests[candidate];
      if (rest.onsetBeat + rest.durationBeats <= next.onsetBeat + EPSILON) {
        restBoundaryPositions.add(position);
        break;
      }
      candidate += 1;
    }
  }
  const segments = readingChunkSegments(restBoundaryPositions, indexed, minAttacks, maxAttacks, targetAttacks);
  return segments.map((segment, ordinal): SheetReadingChunk => {
    const attacks = segment.map((item) => item.attack);
    const attackIndexes = segment.map((item) => item.index);
    const labels = attacks.map(attackLabel);
    const semitonePattern = attacks.slice(1).map((attack, index) => attackUpperNote(attack) - attackUpperNote(attacks[index]));
    const rhythmPatternBeats = attacks.slice(1).map((attack, index) => attack.onsetBeat - attacks[index].onsetBeat);
    const strategy = readingStrategy(attacks, semitonePattern);
    const hands = [...new Set(attacks.flatMap((attack) => attack.hands))].sort();
    const allNotes = attacks.flatMap((attack) => attack.midiNotes);
    const startBeat = attacks[0].onsetBeat;
    const endBeat = Math.max(...attacks.map((attack) => attack.onsetBeat + attack.soundingDurationBeats));
    const startAttackId = attacks[0].id;
    const endAttackId = attacks.at(-1)!.id;
    return {
      id: stableReadingChunkId(loop.scoreId, loop.hand, startAttackId, endAttackId),
      ordinal,
      startAttackId,
      endAttackId,
      attackIndexes,
      startAttackIndex: attackIndexes[0],
      endAttackIndex: attackIndexes.at(-1)!,
      attackCount: attacks.length,
      noteCount: attacks.reduce((sum, attack) => sum + attack.midiNotes.length, 0),
      measureNumbers: [...new Set(attacks.map((attack) => attack.measureNumber))],
      startBeat,
      endBeat,
      durationBeats: endBeat - startBeat,
      hands,
      handSummary: handSummary(hands),
      attackLabels: labels,
      noteSummary: shortAttackSequence(labels),
      strategy: strategy.strategy,
      label: strategy.label,
      cue: strategy.cue,
      semitonePattern,
      rhythmPatternBeats,
      chordSpacings: segment.flatMap(({ attack, index }) => attack.midiNotes.length > 1 ? [{
        attackIndex: index,
        noteLabels: attack.notes.slice().sort((first, second) => first.pitch.midi - second.pitch.midi).map((note) => note.pitch.label),
        ...chordSpacing(attack.midiNotes),
      }] : []),
      rangeSemitones: allNotes.length ? Math.max(...allNotes) - Math.min(...allNotes) : 0,
    };
  });
}

/** Keep success, repair, and pending evidence separate instead of blending a score. */
export function summarizeSheetReadingChunkProgress(
  chunks: SheetReadingChunk[],
  comparisons: ReadonlyArray<Pick<SheetEventComparison, "expectedIndex" | "status">>,
): SheetReadingChunkProgress[] {
  const byIndex = new Map(comparisons.map((comparison) => [comparison.expectedIndex, comparison.status]));
  return chunks.map((chunk) => {
    const statuses = chunk.attackIndexes.map((index) => byIndex.get(index) ?? "pending");
    const successes = statuses.filter((status) => status === "correct").length;
    const incorrect = statuses.filter((status) => status === "incorrect").length;
    const missed = statuses.filter((status) => status === "missed").length;
    const pending = statuses.filter((status) => status === "pending").length;
    const needsRepair = incorrect + missed;
    const firstRepairOffset = statuses.findIndex((status) => status === "incorrect" || status === "missed");
    const status: SheetReadingChunkProgress["status"] = needsRepair
      ? "repair"
      : pending === 0 && successes === chunk.attackCount
        ? "secure"
        : successes > 0
          ? "in-progress"
          : "pending";
    return {
      chunkId: chunk.id,
      attackIndexes: [...chunk.attackIndexes],
      successes,
      incorrect,
      missed,
      pending,
      attempted: successes + incorrect + missed,
      needsRepair,
      status,
      firstRepairAttackIndex: firstRepairOffset < 0 ? null : chunk.attackIndexes[firstRepairOffset],
    };
  });
}

function pitchClass(value: number) {
  return ((value % 12) + 12) % 12;
}

function authoredKeyContext(keyFifths: number | null, rawMode: string | null): SheetAuthoredKeyContext {
  if (keyFifths === null) {
    return {
      keyFifths: null,
      keyMode: rawMode,
      status: "not-encoded",
      label: rawMode ? `${rawMode} mode text is present, but no key signature was encoded` : "key signature and mode not encoded",
      tonicPitchClass: null,
      tonicLabel: null,
      relativePossibilities: [],
    };
  }
  const major = MAJOR_KEYS_BY_FIFTHS[keyFifths + 7];
  const minor = MINOR_KEYS_BY_FIFTHS[keyFifths + 7];
  const count = Math.abs(keyFifths);
  const signature = keyFifths === 0
    ? "no-sharp/no-flat signature"
    : `${count}-${keyFifths > 0 ? "sharp" : "flat"} signature`;
  const mode = rawMode?.trim().toLowerCase() || null;
  const relativePossibilities = [`${major.label} major`, `${minor.label} natural minor`];
  if (mode === "major") {
    return {
      keyFifths, keyMode: mode, status: "explicit-major", label: `${signature} · ${major.label} major encoded`,
      tonicPitchClass: major.pitchClass, tonicLabel: major.label, relativePossibilities,
    };
  }
  if (mode === "minor" || mode === "natural minor") {
    return {
      keyFifths, keyMode: mode, status: "explicit-minor", label: `${signature} · ${minor.label} minor encoded`,
      tonicPitchClass: minor.pitchClass, tonicLabel: minor.label, relativePossibilities,
    };
  }
  if (mode) {
    return {
      keyFifths, keyMode: mode, status: "other-mode", label: `${signature} · ${mode} mode encoded`,
      tonicPitchClass: null, tonicLabel: null, relativePossibilities,
    };
  }
  return {
    keyFifths, keyMode: null, status: "signature-only", label: `${signature} · mode not encoded`,
    tonicPitchClass: null, tonicLabel: null, relativePossibilities,
  };
}

function collectionKindLabel(kind: SheetPitchCollectionKind) {
  return kind === "natural-minor" ? "natural minor" : kind.replace("-", " ");
}

/**
 * Rank collections compatible with a short attack window. This deliberately
 * does not return a detected key: an unordered pitch subset cannot establish
 * tonic, mode, harmonic function, or musical quality by itself.
 */
export function analyzeLocalPitchCollections(
  attacks: ReadonlyArray<Pick<SheetMusicAttack, "midiNotes">>,
  options: SheetPitchCollectionOptions = {},
): SheetPitchCollectionAnalysis {
  if (!Array.isArray(attacks)) throw new TypeError("Local collection analysis needs an array of score attacks.");
  const keyFifths = options.keyFifths ?? null;
  if (keyFifths !== null && (!Number.isInteger(keyFifths) || keyFifths < -7 || keyFifths > 7)) {
    throw new RangeError("Collection context key fifths must be an integer from -7 through 7.");
  }
  if (options.keyMode !== undefined && options.keyMode !== null && typeof options.keyMode !== "string") {
    throw new TypeError("Collection context mode must be text when supplied.");
  }
  const maxCandidates = options.maxCandidates ?? 3;
  if (!Number.isInteger(maxCandidates) || maxCandidates < 1 || maxCandidates > 8) {
    throw new RangeError("Return from 1 through 8 local collection candidates.");
  }
  const authored = authoredKeyContext(keyFifths, options.keyMode?.trim() || null);
  const occurrences = attacks.flatMap((attack, attackIndex) => {
    if (!Array.isArray(attack.midiNotes)) throw new TypeError(`Attack ${attackIndex + 1} needs a MIDI-note array.`);
    return (attack.midiNotes as number[]).map((midi) => {
      assertMidi(midi, `Attack ${attackIndex + 1} MIDI note`);
      return pitchClass(midi);
    });
  });
  const observedPitchClasses = uniqueSorted(occurrences);
  const evidence: SheetPitchCollectionEvidence = observedPitchClasses.length <= 2 ? "thin" : observedPitchClasses.length <= 4 ? "usable" : "rich";
  if (!occurrences.length) {
    return {
      observedPitchClasses,
      observedNoteCount: 0,
      evidence,
      authored,
      candidates: [],
      caveat: "No played or written pitches are present in this window, so no pitch-collection candidates are shown.",
    };
  }
  const firstPitchClasses = new Set(attacks[0]?.midiNotes.map(pitchClass) ?? []);
  const lastPitchClasses = new Set(attacks.at(-1)?.midiNotes.map(pitchClass) ?? []);
  const preferredNames = (keyFifths ?? 0) > 0 ? SHARP_NAMES : FLAT_NAMES;
  const majorSignature = keyFifths === null ? null : MAJOR_KEYS_BY_FIFTHS[keyFifths + 7];
  const minorSignature = keyFifths === null ? null : MINOR_KEYS_BY_FIFTHS[keyFifths + 7];

  const candidates = PITCH_COLLECTION_PATTERNS.flatMap(({ kind, intervals }) => Array.from({ length: 12 }, (_, tonicPitchClass): SheetPitchCollectionCandidate => {
    const pitchClasses = intervals.map((interval) => pitchClass(tonicPitchClass + interval));
    const pitchClassSet = new Set(pitchClasses);
    const matchedPitchClasses = observedPitchClasses.filter((value) => pitchClassSet.has(value));
    const outsidePitchClasses = observedPitchClasses.filter((value) => !pitchClassSet.has(value));
    const matchedOccurrences = occurrences.filter((value) => pitchClassSet.has(value)).length;
    const occurrenceCoverage = matchedOccurrences / occurrences.length;
    const distinctCoverage = matchedPitchClasses.length / observedPitchClasses.length;
    const collectionCompleteness = matchedPitchClasses.length / pitchClasses.length;
    const tonicOccurrences = occurrences.filter((value) => value === tonicPitchClass).length;
    const tonicAtEdge = firstPitchClasses.has(tonicPitchClass) || lastPitchClasses.has(tonicPitchClass);
    const tonicEvidence: SheetPitchCollectionTonicEvidence = tonicAtEdge && tonicOccurrences > 1
      ? "edge-and-repeated"
      : tonicAtEdge
        ? "edge"
        : tonicOccurrences
          ? "present"
          : "none";
    const signatureCompatible = (kind === "major" || kind === "major-pentatonic")
      ? majorSignature?.pitchClass === tonicPitchClass
      : minorSignature?.pitchClass === tonicPitchClass;
    const tonicScore = tonicOccurrences ? 0.05 : 0;
    const edgeScore = tonicAtEdge ? 0.08 : 0;
    const fitScore = Math.round((occurrenceCoverage * 0.56
      + distinctCoverage * 0.14
      + collectionCompleteness * 0.13
      + tonicScore
      + edgeScore
      + (signatureCompatible ? 0.04 : 0)) * 10_000) / 10_000;
    const tonicLabel = tonicPitchClass === majorSignature?.pitchClass
      ? majorSignature.label
      : tonicPitchClass === minorSignature?.pitchClass
        ? minorSignature.label
        : preferredNames[tonicPitchClass];
    const coverageText = outsidePitchClasses.length
      ? `${matchedPitchClasses.length} of ${observedPitchClasses.length} local pitch classes fit`
      : `all ${observedPitchClasses.length} local pitch classes fit`;
    const tonicText = tonicEvidence === "edge-and-repeated"
      ? "the candidate tonic occurs at an edge and repeats"
      : tonicEvidence === "edge"
        ? "the candidate tonic occurs at a window edge"
        : tonicEvidence === "present"
          ? "the candidate tonic is present away from the edges"
          : "the candidate tonic is not present";
    return {
      kind,
      label: `${tonicLabel} ${collectionKindLabel(kind)}`,
      tonicPitchClass,
      tonicLabel,
      pitchClasses,
      matchedPitchClasses,
      outsidePitchClasses,
      occurrenceCoverage,
      distinctCoverage,
      collectionCompleteness,
      tonicEvidence,
      signatureCompatible,
      fitScore,
      fit: evidence === "thin" ? "thin" : outsidePitchClasses.length === 0 ? "compatible" : "partial",
      reason: `${coverageText}; ${tonicText}${signatureCompatible ? "; it also agrees with the authored signature" : ""}.`,
    };
  })).sort((first, second) => second.fitScore - first.fitScore
    || first.outsidePitchClasses.length - second.outsidePitchClasses.length
    || second.collectionCompleteness - first.collectionCompleteness
    || first.kind.localeCompare(second.kind)
    || first.tonicPitchClass - second.tonicPitchClass)
    .slice(0, maxCandidates);

  return {
    observedPitchClasses,
    observedNoteCount: occurrences.length,
    evidence,
    authored,
    candidates,
    caveat: "These are pitch-collection candidates for this short window—not a detected key, tonal center, or judgment of musical quality.",
  };
}

/** Convert a score beat span to milliseconds, integrating tempo changes. */
export function scoreBeatSpanToMs(score: SheetMusicScore, startBeat: number, endBeat: number, fixedTempoBpm?: number) {
  assertFinite(startBeat, "Start beat");
  assertFinite(endBeat, "End beat");
  if (startBeat < 0 || endBeat < startBeat || endBeat > score.totalBeats + EPSILON) throw new RangeError("Beat span falls outside the score.");
  if (fixedTempoBpm !== undefined) {
    assertPositive(fixedTempoBpm, "Practice tempo");
    if (fixedTempoBpm > 400) throw new RangeError("Practice tempo must not exceed 400 BPM.");
    return (endBeat - startBeat) * 60_000 / fixedTempoBpm;
  }
  let total = 0;
  let cursor = startBeat;
  while (cursor < endBeat - EPSILON) {
    const current = [...score.tempoChanges].reverse().find((change) => change.beat <= cursor + EPSILON) ?? { beat: 0, bpm: score.tempoBpm };
    const next = score.tempoChanges.find((change) => change.beat > cursor + EPSILON);
    const segmentEnd = Math.min(endBeat, next?.beat ?? endBeat);
    total += (segmentEnd - cursor) * 60_000 / current.bpm;
    cursor = segmentEnd;
  }
  return total;
}

function scoreTempoAtBeat(score: SheetMusicScore, beat: number) {
  return [...score.tempoChanges].reverse().find((change) => change.beat <= beat + EPSILON)?.bpm ?? score.tempoBpm;
}

/** Group near-simultaneous note-ons into deliberate chords (anchored to each cluster's first attack). */
export function clusterMidiPerformance(events: MidiPerformanceNote[], windowMs = 70): MidiAttackCluster[] {
  if (!Array.isArray(events)) throw new TypeError("MIDI performance events must be an array.");
  if (events.length > MAX_MIDI_EVENTS) throw new RangeError(`Performance capture is limited to ${MAX_MIDI_EVENTS.toLocaleString()} note attacks.`);
  assertFinite(windowMs, "Chord cluster window");
  if (windowMs < 0 || windowMs > 500) throw new RangeError("Chord cluster window must be from 0 through 500 ms.");
  const sorted = events.map((event, index) => {
    assertMidi(event.midi, `MIDI event ${index + 1} note`);
    assertFinite(event.onsetMs, `MIDI event ${index + 1} onset`);
    if (event.onsetMs < 0) throw new RangeError("MIDI event onsets must be non-negative.");
    if (event.velocity !== undefined && (!Number.isInteger(event.velocity) || event.velocity < 0 || event.velocity > 127)) {
      throw new RangeError("MIDI velocity must be an integer from 0 through 127.");
    }
    if (event.releaseMs !== undefined && (!Number.isFinite(event.releaseMs) || event.releaseMs < event.onsetMs)) {
      throw new RangeError("MIDI release must be finite and no earlier than its attack.");
    }
    return { ...event, id: event.id ?? `midi-${index + 1}` };
  }).sort((first, second) => first.onsetMs - second.onsetMs || first.midi - second.midi || String(first.id).localeCompare(String(second.id)));

  const clusters: MidiAttackCluster[] = [];
  for (const event of sorted) {
    const last = clusters.at(-1);
    if (last && event.onsetMs - last.onsetMs <= windowMs + EPSILON) {
      last.events.push(event);
      last.notes = uniqueSorted(last.events.map((item) => item.midi));
      last.duplicateNotes = uniqueSorted(last.notes.filter((note) => last.events.filter((item) => item.midi === note).length > 1));
    } else {
      clusters.push({ id: `cluster-${clusters.length + 1}`, onsetMs: event.onsetMs, notes: [event.midi], events: [event], duplicateNotes: [] });
    }
  }
  return clusters;
}

function pianoKeyX(midi: number) {
  return Math.floor(midi / 12) * 7 + WHITE_KEY_X[midi % 12];
}

/** Physicalized correction: chromatic keys plus approximate white-key-width travel. */
export function fingerDistance(fromMidi: number, toMidi: number): FingerDistance {
  assertMidi(fromMidi, "Starting MIDI note");
  assertMidi(toMidi, "Target MIDI note");
  const signedSemitones = toMidi - fromMidi;
  const absoluteSemitones = Math.abs(signedSemitones);
  const signedWhiteKeyWidths = pianoKeyX(toMidi) - pianoKeyX(fromMidi);
  const whiteKeyWidths = Math.abs(signedWhiteKeyWidths);
  const directionLabel = signedSemitones === 0 ? "same" : signedSemitones > 0 ? "right" : "left";
  const reach: FingerDistance["reach"] = absoluteSemitones === 0
    ? "same-key"
    : absoluteSemitones <= 2
      ? "adjacent-key"
      : whiteKeyWidths <= 4
        ? "within-position"
        : absoluteSemitones < 12
          ? "hand-shift"
          : "octave-shift";
  const roundedWidths = Math.round(whiteKeyWidths * 10) / 10;
  const cue = absoluteSemitones === 0
    ? "Keep the same key."
    : `Move ${directionLabel} ${absoluteSemitones} semitone${absoluteSemitones === 1 ? "" : "s"} — about ${roundedWidths} white-key width${roundedWidths === 1 ? "" : "s"}.`;
  return {
    fromMidi,
    toMidi,
    signedSemitones,
    absoluteSemitones,
    direction: directionLabel,
    signedWhiteKeyWidths,
    whiteKeyWidths,
    octaveDisplacement: Math.trunc(signedSemitones / 12),
    fromKeyColor: BLACK_PITCH_CLASSES.has(fromMidi % 12) ? "black" : "white",
    toKeyColor: BLACK_PITCH_CLASSES.has(toMidi % 12) ? "black" : "white",
    reach,
    cue,
  };
}

export function chordSpacing(notes: number[]): ChordSpacing {
  if (!Array.isArray(notes) || notes.some((note) => !Number.isInteger(note) || note < 0 || note > 127)) {
    throw new RangeError("Chord spacing needs valid MIDI notes.");
  }
  const sorted = uniqueSorted(notes);
  const adjacentSemitones = sorted.slice(1).map((note, index) => note - sorted[index]);
  return { adjacentSemitones, spanSemitones: sorted.length > 1 ? sorted.at(-1)! - sorted[0] : 0 };
}

type AlignmentOperation = {
  kind: "paired" | "missing" | "extra";
  expectedIndex: number | null;
  actualIndex: number | null;
};

function pitchSubstitutionCost(expected: number[], actual: number[]) {
  const missing = expected.filter((note) => !actual.includes(note)).length;
  const extra = actual.filter((note) => !expected.includes(note)).length;
  if (missing === 0 && extra === 0) return 0;
  return Math.min(1.6, 0.35 + (missing + extra) / Math.max(expected.length, actual.length, 1));
}

type AtomicAlignmentOperation = {
  kind: "paired" | "missing" | "extra";
  expectedIndex: number | null;
  atomStart: number | null;
  atomEnd: number | null;
};

function mergeMidiAtoms(atoms: MidiAttackCluster[], id: string): MidiAttackCluster {
  if (!atoms.length) throw new Error("Cannot merge an empty MIDI-attack range.");
  const events = atoms.flatMap((atom) => atom.events).sort((first, second) => first.onsetMs - second.onsetMs || first.midi - second.midi);
  const notes = uniqueSorted(events.map((event) => event.midi));
  return {
    id,
    onsetMs: events[0].onsetMs,
    notes,
    events,
    duplicateNotes: notes.filter((note) => events.filter((event) => event.midi === note).length > 1),
  };
}

function alignTargetAwareAttacks(
  expected: SheetMusicPracticeAttack[],
  atoms: MidiAttackCluster[],
  chordWindowMs: number,
  arpeggioWindowMs: number,
  finalize: boolean,
): { operations: AlignmentOperation[]; clusters: MidiAttackCluster[] } {
  const rows = expected.length + 1;
  const columns = atoms.length + 1;
  if (rows * columns > MAX_ALIGNMENT_CELLS) throw new RangeError("This take is too large to align at once. Select a shorter measure loop.");
  const directions = new Uint8Array(rows * columns); // 1 pair, 2 missing, 3 extra
  const atomTakes = new Uint8Array(rows * columns);
  const endCosts = new Float64Array(rows);
  let previous = new Float64Array(columns);
  for (let column = 1; column < columns; column += 1) {
    previous[column] = column;
    directions[column] = 3;
  }
  endCosts[0] = previous[columns - 1];
  for (let row = 1; row < rows; row += 1) {
    const current = new Float64Array(columns);
    current[0] = row;
    directions[row * columns] = 2;
    for (let column = 1; column < columns; column += 1) {
      const missing = previous[column] + 1;
      const extra = current[column - 1] + 1;
      if (missing <= extra + EPSILON) {
        current[column] = missing;
        directions[row * columns + column] = 2;
      } else {
        current[column] = extra;
        directions[row * columns + column] = 3;
      }
      const target = expected[row - 1];
      const targetIsChord = target.midiNotes.length > 1;
      const allowedWindow = targetIsChord ? target.arpeggiate ? arpeggioWindowMs : chordWindowMs : 0;
      const maxTake = targetIsChord ? Math.min(column, MAX_ATOMS_PER_CHORD) : 1;
      let candidateNotes: number[] = [];
      for (let take = 1; take <= maxTake; take += 1) {
        const atomStart = column - take;
        if (atoms[column - 1].onsetMs - atoms[atomStart].onsetMs > allowedWindow + EPSILON) break;
        candidateNotes = uniqueSorted([...atoms[atomStart].notes, ...candidateNotes]);
        const pair = previous[atomStart] + pitchSubstitutionCost(target.midiNotes, candidateNotes);
        // A strict improvement pairs. On a true edit-cost tie, keep the existing
        // missing transition: that places omissions in the untouched suffix
        // instead of jumping a repeated played motif to its later occurrence.
        // Within paired candidates, the first (smallest) atom range keeps ties.
        if (pair < current[column] - EPSILON) {
          current[column] = pair;
          directions[row * columns + column] = 1;
          atomTakes[row * columns + column] = take;
        }
      }
    }
    endCosts[row] = current[columns - 1];
    previous = current;
  }
  const atomicOperations: AtomicAlignmentOperation[] = [];
  let row = expected.length;
  if (!finalize && expected.length) {
    if (!atoms.length) row = 0;
    else {
      // Semi-global live alignment: consume every played atom but stop at the
      // cheapest *earliest* score prefix. The untouched suffix has zero cost,
      // so a repeated C–D later in the page cannot steal the live C–D cursor.
      row = 1;
      for (let candidate = 2; candidate < rows; candidate += 1) {
        if (endCosts[candidate] < endCosts[row] - EPSILON) row = candidate;
      }
    }
  }
  const consumedExpectedCount = row;
  let column = atoms.length;
  while (row > 0 || column > 0) {
    const move = directions[row * columns + column];
    if (move === 1) {
      const take = atomTakes[row * columns + column];
      if (!take) throw new Error("Performance alignment lost its chord-group width.");
      atomicOperations.push({ kind: "paired", expectedIndex: row - 1, atomStart: column - take, atomEnd: column });
      row -= 1;
      column -= take;
    } else if (move === 2) {
      atomicOperations.push({ kind: "missing", expectedIndex: row - 1, atomStart: null, atomEnd: null });
      row -= 1;
    } else if (move === 3) {
      atomicOperations.push({ kind: "extra", expectedIndex: null, atomStart: column - 1, atomEnd: column });
      column -= 1;
    } else {
      throw new Error("Performance alignment reached an impossible state.");
    }
  }
  atomicOperations.reverse();
  for (let expectedIndex = consumedExpectedCount; expectedIndex < expected.length; expectedIndex += 1) {
    atomicOperations.push({ kind: "missing", expectedIndex, atomStart: null, atomEnd: null });
  }
  // Attach every inserted performance attack to the nearest adjacent written
  // landing. Operation distance works for self-paced takes and for neighboring
  // missing attacks; an exact middle tie deliberately points forward. The two
  // passes stay linear even when a capture contains a long run of extras.
  type ExpectedAnchor = { position: number; expectedIndex: number };
  const previousExpectedAnchors = new Array<ExpectedAnchor | null>(atomicOperations.length).fill(null);
  const nextExpectedAnchors = new Array<ExpectedAnchor | null>(atomicOperations.length).fill(null);
  let previousExpectedAnchor: ExpectedAnchor | null = null;
  atomicOperations.forEach((operation, position) => {
    previousExpectedAnchors[position] = previousExpectedAnchor;
    if (operation.kind !== "extra" && operation.expectedIndex !== null) {
      previousExpectedAnchor = { position, expectedIndex: operation.expectedIndex };
    }
  });
  let nextExpectedAnchor: ExpectedAnchor | null = null;
  for (let index = atomicOperations.length - 1; index >= 0; index -= 1) {
    nextExpectedAnchors[index] = nextExpectedAnchor;
    const operation = atomicOperations[index];
    if (operation.kind !== "extra" && operation.expectedIndex !== null) {
      nextExpectedAnchor = { position: index, expectedIndex: operation.expectedIndex };
    }
  }
  atomicOperations.forEach((operation, position) => {
    if (operation.kind !== "extra") return;
    const previous = previousExpectedAnchors[position];
    const next = nextExpectedAnchors[position];
    const nearest = previous && (!next || position - previous.position < next.position - position) ? previous : next;
    operation.expectedIndex = nearest?.expectedIndex ?? null;
  });
  const clusters: MidiAttackCluster[] = [];
  const operations = atomicOperations.map((operation): AlignmentOperation => {
    if (operation.kind === "missing") return { kind: "missing", expectedIndex: operation.expectedIndex, actualIndex: null };
    const cluster = mergeMidiAtoms(atoms.slice(operation.atomStart!, operation.atomEnd!), `cluster-${clusters.length + 1}`);
    const actualIndex = clusters.push(cluster) - 1;
    return { kind: operation.kind, expectedIndex: operation.expectedIndex, actualIndex };
  });
  return { operations, clusters };
}

function pairCorrections(expected: SheetMusicPracticeAttack, actualNotes: number[]): PitchCorrection[] {
  const missing = expected.midiNotes.filter((note) => !actualNotes.includes(note));
  const unusedExtra = actualNotes.filter((note) => !expected.midiNotes.includes(note));
  const corrections: PitchCorrection[] = [];
  for (const expectedMidi of missing) {
    // A motion correction is justified only by a one-for-one substituted tone.
    // If the learner played a correct subset of a chord, those fingers should
    // stay put; the missing tone needs an additive cue in the UI, not “move.”
    if (!unusedExtra.length) continue;
    const playedMidi = [...unusedExtra].sort((first, second) => Math.abs(expectedMidi - first) - Math.abs(expectedMidi - second) || first - second)[0];
    const extraIndex = unusedExtra.indexOf(playedMidi);
    if (extraIndex >= 0) unusedExtra.splice(extraIndex, 1);
    const sourceNote = expected.notes.find((note) => note.pitch.midi === expectedMidi);
    corrections.push({ ...fingerDistance(playedMidi, expectedMidi), expectedMidi, playedMidi, expectedFingering: sourceNote?.fingering ?? null });
  }
  return corrections;
}

function clusterDurationError(expected: SheetMusicPracticeAttack, actual: MidiAttackCluster, score: SheetMusicScore, fixedTempoBpm?: number) {
  const errors: { errorMs: number; midi: number; label: string }[] = [];
  for (const expectedNote of expected.notes) {
    const performed = actual.events.find((event) => event.midi === expectedNote.pitch.midi && event.releaseMs !== undefined);
    if (performed?.releaseMs === undefined) continue;
    const expectedMs = scoreBeatSpanToMs(score, expectedNote.onsetBeat, expectedNote.onsetBeat + expectedNote.soundingDurationBeats, fixedTempoBpm);
    // All notes in a notated chord share its written release point, including
    // notes rolled a little later by an arpeggiation. Anchor that release to
    // the cluster's first attack instead of granting each rolled tone a fresh
    // full written duration.
    errors.push({
      errorMs: performed.releaseMs - (actual.onsetMs + expectedMs),
      midi: expectedNote.pitch.midi,
      label: expectedNote.pitch.label,
    });
  }
  // A mean can let one early chord release cancel one equally late release.
  // Preserve the most consequential signed miss so the repair direction remains true.
  return errors.length
    ? errors.reduce((worst, value) => Math.abs(value.errorMs) > Math.abs(worst.errorMs) ? value : worst)
    : null;
}

function arpeggiationMatch(expected: SheetMusicPracticeAttack, actual: MidiAttackCluster, pitchMatch: boolean) {
  if (!expected.arpeggiate || !pitchMatch) return null;
  const events = [...actual.events].sort((first, second) => first.onsetMs - second.onsetMs || String(first.id ?? "").localeCompare(String(second.id ?? "")));
  const orderedNotes = events.filter((event, index, all) => all.findIndex((candidate) => candidate.midi === event.midi) === index);
  if (orderedNotes.length < 2 || orderedNotes.at(-1)!.onsetMs - orderedNotes[0].onsetMs <= EPSILON) return false;
  if (expected.arpeggiate === "unspecified") return true;
  const intervals = orderedNotes.slice(1).map((event, index) => event.midi - orderedNotes[index].midi);
  return expected.arpeggiate === "up" ? intervals.every((interval) => interval > 0) : intervals.every((interval) => interval < 0);
}

function relationshipTrack(comparisons: SheetEventComparison[], anchor: "bass" | "soprano"): RelationshipMetrics {
  const paired = comparisons.filter((comparison) => comparison.actual && comparison.status !== "pending" && comparison.status !== "missed");
  const relationships: RelationshipComparison[] = [];
  for (let index = 1; index < paired.length; index += 1) {
    const previous = paired[index - 1];
    const current = paired[index];
    if (current.expectedIndex !== previous.expectedIndex + 1 || !previous.actual || !current.actual) continue;
    const expectedFrom = anchor === "bass" ? previous.expectedNotes[0] : previous.expectedNotes.at(-1)!;
    const expectedTo = anchor === "bass" ? current.expectedNotes[0] : current.expectedNotes.at(-1)!;
    const actualFrom = anchor === "bass" ? previous.actualNotes[0] : previous.actualNotes.at(-1)!;
    const actualTo = anchor === "bass" ? current.actualNotes[0] : current.actualNotes.at(-1)!;
    const expectedSemitones = expectedTo - expectedFrom;
    const playedSemitones = actualTo - actualFrom;
    relationships.push({
      fromExpectedIndex: previous.expectedIndex,
      toExpectedIndex: current.expectedIndex,
      expectedSemitones,
      playedSemitones,
      expectedDirection: direction(expectedSemitones),
      playedDirection: direction(playedSemitones),
      contourMatch: direction(expectedSemitones) === direction(playedSemitones),
      intervalMatch: expectedSemitones === playedSemitones,
    });
  }
  const contourMatches = relationships.filter((item) => item.contourMatch).length;
  const intervalMatches = relationships.filter((item) => item.intervalMatch).length;
  return {
    comparisons: relationships,
    contourCompared: relationships.length,
    contourMatches,
    contourAccuracy: relationships.length ? contourMatches / relationships.length : null,
    intervalCompared: relationships.length,
    intervalMatches,
    intervalAccuracy: relationships.length ? intervalMatches / relationships.length : null,
  };
}

function firstDivergence(
  score: SheetMusicScore,
  operations: AlignmentOperation[],
  comparisons: SheetEventComparison[],
  clusters: MidiAttackCluster[],
): SheetPerformanceDivergence | null {
  for (let operationIndex = 0; operationIndex < operations.length; operationIndex += 1) {
    const operation = operations[operationIndex];
    if (operation.kind === "extra") {
      const cluster = clusters[operation.actualIndex!];
      const adjacent = operation.expectedIndex === null ? null : comparisons[operation.expectedIndex];
      const hasPreviousLanding = operations.slice(0, operationIndex).some((candidate) => candidate.kind !== "extra" && candidate.expectedIndex !== null);
      const hasNextLanding = operations.slice(operationIndex + 1).some((candidate) => candidate.kind !== "extra" && candidate.expectedIndex !== null);
      const placement = hasPreviousLanding && hasNextLanding
        ? "arrived between written landings"
        : hasNextLanding
          ? "arrived before the first written landing"
          : hasPreviousLanding
            ? "arrived after the final written landing"
            : "arrived outside an empty written loop";
      return {
        kind: "extra-attack", expectedIndex: operation.expectedIndex, actualIndex: operation.actualIndex, measureNumber: adjacent?.expected.measureNumber ?? null,
        expectedNotes: [], actualNotes: cluster.notes, signedSemitoneCorrection: null,
        message: `An extra attack (${cluster.notes.map((note) => performedMidiLabel(note, score.keyFifths)).join(" + ")}) ${placement}.`,
      };
    }
    const comparison = comparisons[operation.expectedIndex!];
    const expectedLabels = comparison.expectedNotes.map((midi) => comparison.expected.notes.find((note) => note.pitch.midi === midi)?.pitch.label ?? midiLabel(midi));
    const actualLabels = comparison.actualNotes.map((midi) => {
      const authored = comparison.expected.notes.find((note) => note.pitch.midi === midi)?.pitch.label;
      return authored ?? performedMidiLabel(midi, score.keyFifths);
    });
    if (comparison.status === "pending") continue;
    if (operation.kind === "missing") {
      return {
        kind: "missing-attack", expectedIndex: comparison.expectedIndex, actualIndex: null, measureNumber: comparison.expected.measureNumber,
        expectedNotes: comparison.expectedNotes, actualNotes: [], signedSemitoneCorrection: null,
        message: `The written landing ${expectedLabels.join(" + ")} was skipped.`,
      };
    }
    if (!comparison.pitchMatch) {
      const isChord = comparison.expectedNotes.length > 1 || comparison.actualNotes.length > 1;
      const duplicated = comparison.actual?.duplicateNotes ?? [];
      return {
        kind: isChord ? "chord" : "pitch", expectedIndex: comparison.expectedIndex, actualIndex: operation.actualIndex,
        measureNumber: comparison.expected.measureNumber, expectedNotes: comparison.expectedNotes, actualNotes: comparison.actualNotes,
        signedSemitoneCorrection: comparison.corrections[0]?.signedSemitones ?? null,
        message: duplicated.length
          ? `${duplicated.map((midi) => comparison.expected.notes.find((note) => note.pitch.midi === midi)?.pitch.label ?? performedMidiLabel(midi, score.keyFifths)).join(" + ")} was attacked more than once inside one chord window.`
          : `Expected ${expectedLabels.join(" + ")}; received ${actualLabels.join(" + ")}.${comparison.corrections[0] ? ` ${comparison.corrections[0].cue}` : ""}`,
      };
    }
    if (comparison.arpeggiationMatch === false) {
      const writtenDirection = comparison.expected.arpeggiate === "up" ? "rise" : comparison.expected.arpeggiate === "down" ? "fall" : "unfold";
      return {
        kind: "arpeggiation", expectedIndex: comparison.expectedIndex, actualIndex: operation.actualIndex,
        measureNumber: comparison.expected.measureNumber, expectedNotes: comparison.expectedNotes, actualNotes: comparison.actualNotes,
        signedSemitoneCorrection: null,
        message: `The written ${expectedLabels.join(" + ")} chord should ${writtenDirection} as a roll; keep the pitches and change only their attack order.`,
      };
    }
    if (comparison.timingMatch === false) {
      const timing = comparison.timingErrorMs!;
      return {
        kind: "rhythm", expectedIndex: comparison.expectedIndex, actualIndex: operation.actualIndex,
        measureNumber: comparison.expected.measureNumber, expectedNotes: comparison.expectedNotes, actualNotes: comparison.actualNotes,
        signedSemitoneCorrection: null,
        message: `The right landing arrived ${Math.round(Math.abs(timing))} ms ${timing < 0 ? "early" : "late"}.`,
      };
    }
    if (comparison.durationMatch === false) {
      const timing = comparison.durationErrorMs!;
      return {
        kind: "duration", expectedIndex: comparison.expectedIndex, actualIndex: operation.actualIndex,
        measureNumber: comparison.expected.measureNumber, expectedNotes: comparison.expectedNotes, actualNotes: comparison.actualNotes,
        signedSemitoneCorrection: null,
        message: `${comparison.durationNoteLabel ?? "The landing"} was held ${Math.round(Math.abs(timing))} ms ${timing < 0 ? "shorter" : "longer"} than written.`,
      };
    }
  }
  return null;
}

/**
 * Align a MIDI take to the selected score loop. Metrics stay separate: there is
 * intentionally no blended “musicality score” that could hide the repairable fact.
 */
export function evaluateSheetMusicPerformance(
  score: SheetMusicScore,
  midiEvents: MidiPerformanceNote[],
  options: SheetPerformanceEvaluationOptions = {},
): SheetPerformanceEvaluation {
  if (!isNormalizedSheetMusicScore(score)) throw new TypeError("Evaluate against a normalized sheet-music score.");
  const loop = selectSheetMusicLoop(score, options);
  const chordWindowMs = options.clusterWindowMs ?? 70;
  const arpeggioWindowMs = options.arpeggioWindowMs ?? Math.min(500, Math.max(180, chordWindowMs + 100));
  assertFinite(chordWindowMs, "Block-chord window");
  assertFinite(arpeggioWindowMs, "Arpeggio window");
  if (chordWindowMs < 0 || chordWindowMs > 500) throw new RangeError("Block-chord window must be from 0 through 500 ms.");
  if (arpeggioWindowMs < chordWindowMs || arpeggioWindowMs > 500) {
    throw new RangeError("Arpeggio window must be at least the block-chord window and no more than 500 ms.");
  }
  // Atomize only exact/small-jitter simultaneities. The alignment then decides
  // whether several atoms belong together from the expected target: written
  // single notes consume one atom, compact chords use the block window, and
  // marked arpeggios alone receive the wider roll window.
  const atoms = clusterMidiPerformance(midiEvents, options.singleAttackWindowMs ?? 0);
  const aligned = alignTargetAwareAttacks(loop.attacks, atoms, chordWindowMs, arpeggioWindowMs, options.finalize === true);
  const { clusters, operations } = aligned;
  const paired = operations.filter((operation) => operation.kind === "paired");
  const firstPair = paired[0];
  const timingAnchor = firstPair
    ? clusters[firstPair.actualIndex!].onsetMs - scoreBeatSpanToMs(score, loop.startBeat, loop.attacks[firstPair.expectedIndex!].onsetBeat, options.tempoBpm)
    : 0;
  const baseBeatMs = 60_000 / (options.tempoBpm ?? scoreTempoAtBeat(score, loop.startBeat));
  const timingToleranceMs = options.timingToleranceMs ?? Math.max(85, baseBeatMs * 0.18);
  const durationToleranceMs = options.durationToleranceMs ?? Math.max(120, baseBeatMs * 0.25);
  assertPositive(timingToleranceMs, "Timing tolerance");
  assertPositive(durationToleranceMs, "Duration tolerance");

  const operationByExpected = new Map<number, AlignmentOperation>();
  for (const operation of operations) {
    if (operation.kind !== "extra" && operation.expectedIndex !== null) operationByExpected.set(operation.expectedIndex, operation);
  }
  const lastPairedExpected = paired.length ? Math.max(...paired.map((operation) => operation.expectedIndex!)) : -1;
  const comparisons = loop.attacks.map((expected, expectedIndex): SheetEventComparison => {
    const operation = operationByExpected.get(expectedIndex)!;
    const pending = operation.kind === "missing" && options.finalize !== true && expectedIndex > lastPairedExpected;
    const actual = operation.actualIndex === null ? null : clusters[operation.actualIndex];
    const actualNotes = actual?.notes ?? [];
    const expectedNotes = expected.midiNotes;
    const missingNotes = expectedNotes.filter((note) => !actualNotes.includes(note));
    const extraNotes = actualNotes.filter((note) => !expectedNotes.includes(note));
    const pitchMatch = actual !== null && equalNumbers(expectedNotes, actualNotes) && actual.duplicateNotes.length === 0;
    const expectedSpacing = chordSpacing(expectedNotes);
    const actualSpacing = actual ? chordSpacing(actualNotes) : null;
    const isChord = expectedNotes.length > 1;
    const spacingMatch = isChord && actualSpacing ? equalNumbers(expectedSpacing.adjacentSemitones, actualSpacing.adjacentSemitones) : isChord ? false : null;
    const expectedMs = scoreBeatSpanToMs(score, loop.startBeat, expected.onsetBeat, options.tempoBpm) + timingAnchor;
    const timingErrorMs = actual ? actual.onsetMs - expectedMs : null;
    const timingMatch = timingErrorMs === null ? null : Math.abs(timingErrorMs) <= timingToleranceMs;
    const durationDetail = actual ? clusterDurationError(expected, actual, score, options.tempoBpm) : null;
    const durationErrorMs = durationDetail?.errorMs ?? null;
    const durationMatch = durationErrorMs === null ? null : Math.abs(durationErrorMs) <= durationToleranceMs;
    const rollMatch = actual ? arpeggiationMatch(expected, actual, pitchMatch) : null;
    const status: SheetEventComparison["status"] = pending
      ? "pending"
      : !actual
        ? "missed"
        : pitchMatch && rollMatch !== false && timingMatch !== false && durationMatch !== false
          ? "correct"
          : "incorrect";
    return {
      expectedIndex, expected, actual, status, expectedNotes, actualNotes, missingNotes, extraNotes, pitchMatch,
      chordMatch: isChord ? pitchMatch : null,
      expectedSpacing, actualSpacing, spacingMatch, timingErrorMs, timingMatch, durationErrorMs, durationMatch,
      durationNoteMidi: durationDetail?.midi ?? null,
      durationNoteLabel: durationDetail?.label ?? null,
      arpeggiationMatch: rollMatch,
      corrections: actual ? pairCorrections(expected, actualNotes) : [],
    };
  });
  const extraClusters = operations
    .filter((operation) => operation.kind === "extra")
    .map((operation) => ({ actualIndex: operation.actualIndex!, cluster: clusters[operation.actualIndex!] }));
  const pitchComparisons = comparisons.filter((comparison) => comparison.status !== "pending");
  const pitchCompared = pitchComparisons.length;
  const pitchMatches = pitchComparisons.filter((comparison) => comparison.pitchMatch).length;
  const rhythmCompared = comparisons.filter((comparison) => comparison.timingMatch !== null).length;
  const rhythmMatches = comparisons.filter((comparison) => comparison.timingMatch === true).length;
  const durationCompared = comparisons.filter((comparison) => comparison.durationMatch !== null).length;
  const durationMatches = comparisons.filter((comparison) => comparison.durationMatch === true).length;
  const chordComparisons = comparisons.filter((comparison) => comparison.status !== "pending" && comparison.chordMatch !== null);
  const spacingComparisons = comparisons.filter((comparison) => comparison.status !== "pending" && comparison.spacingMatch !== null);
  const arpeggioComparisons = comparisons.filter((comparison) => comparison.status !== "pending" && comparison.arpeggiationMatch !== null);
  const metrics: SheetPerformanceMetrics = {
    pitch: metric(pitchMatches, pitchCompared),
    rhythm: metric(rhythmMatches, rhythmCompared),
    duration: metric(durationMatches, durationCompared),
    chords: metric(chordComparisons.filter((comparison) => comparison.chordMatch).length, chordComparisons.length),
    chordSpacing: metric(spacingComparisons.filter((comparison) => comparison.spacingMatch).length, spacingComparisons.length),
    arpeggiation: metric(arpeggioComparisons.filter((comparison) => comparison.arpeggiationMatch).length, arpeggioComparisons.length),
    soprano: relationshipTrack(comparisons, "soprano"),
    bass: relationshipTrack(comparisons, "bass"),
  };
  const divergence = firstDivergence(score, operations, comparisons, clusters);
  const completedAttacks = comparisons.filter((comparison) => comparison.status !== "pending").length;
  const secureThroughIndex = comparisons.findIndex((comparison) => comparison.status !== "correct") - 1;
  const firstPending = comparisons.find((comparison) => comparison.status === "pending");
  const progress: SheetPracticeProgress = {
    completedAttacks,
    totalAttacks: comparisons.length,
    percent: comparisons.length ? completedAttacks / comparisons.length : 1,
    secureThroughIndex: secureThroughIndex >= 0 ? secureThroughIndex : comparisons.every((comparison) => comparison.status === "correct") && comparisons.length ? comparisons.length - 1 : null,
    nextExpectedIndex: firstPending?.expectedIndex ?? null,
    nextMeasureNumber: firstPending?.expected.measureNumber ?? null,
  };
  const complete = comparisons.every((comparison) => comparison.status !== "pending");
  return {
    loop,
    clusters,
    comparisons,
    extraClusters,
    complete,
    passed: complete && divergence === null,
    firstDivergence: divergence,
    metrics,
    progress,
  };
}

/** Suggest a compact inclusive-measure repair loop around the first score divergence. */
export function repairLoopAroundFirstDivergence(
  score: SheetMusicScore,
  evaluation: SheetPerformanceEvaluation,
  contextMeasures = 1,
): SheetMusicLoopSelection | null {
  if (!Number.isInteger(contextMeasures) || contextMeasures < 0 || contextMeasures > 8) {
    throw new RangeError("Repair-loop context must be an integer from 0 through 8 measures.");
  }
  const divergence = evaluation.firstDivergence;
  if (!divergence) return null;
  const expectedIndex = divergence.expectedIndex ?? Math.min(evaluation.progress.completedAttacks, evaluation.loop.attacks.length - 1);
  const attack = evaluation.loop.attacks[Math.max(0, expectedIndex)];
  if (!attack) return null;
  return {
    startMeasureIndex: Math.max(0, attack.measureIndex - contextMeasures),
    endMeasureIndex: Math.min(score.measures.length - 1, attack.measureIndex + contextMeasures),
    hand: evaluation.loop.hand,
    includeBoundaryTies: true,
  };
}
