export const MAJOR_SCALE_OFFSETS = [0, 2, 4, 5, 7, 9, 11] as const;
export const MAJOR_SCALE_STEPS = [2, 2, 1, 2, 2, 2, 1] as const;
export const MAJOR_SCALE_SOLFEGE = ["Do", "Re", "Mi", "Fa", "Sol", "La", "Ti"] as const;

export type MajorHarmonyContextId = "IV" | "V" | "I";

export type MajorHarmonyContext = {
  id: MajorHarmonyContextId;
  label: string;
  rootDegree: number;
  rootOffset: number;
  chordOffsets: readonly [number, number, number];
};

export const MAJOR_HARMONY_CONTEXTS: readonly MajorHarmonyContext[] = [
  { id: "IV", label: "IV major", rootDegree: 4, rootOffset: 5, chordOffsets: [5, 9, 0] },
  { id: "V", label: "V major", rootDegree: 5, rootOffset: 7, chordOffsets: [7, 11, 2] },
  { id: "I", label: "I major", rootDegree: 1, rootOffset: 0, chordOffsets: [0, 4, 7] },
] as const;

export const DIATONIC_MODES = [
  { name: "Ionian / major", parentHomeDegree: 1, parallelDifference: "major reference" },
  { name: "Dorian", parentHomeDegree: 2, parallelDifference: "minor with a natural 6" },
  { name: "Phrygian", parentHomeDegree: 3, parallelDifference: "minor with a lowered 2" },
  { name: "Lydian", parentHomeDegree: 4, parallelDifference: "major with a raised 4" },
  { name: "Mixolydian", parentHomeDegree: 5, parallelDifference: "major with a lowered 7" },
  { name: "Aeolian / natural minor", parentHomeDegree: 6, parallelDifference: "minor reference with lowered 3, 6, and 7" },
  { name: "Locrian", parentHomeDegree: 7, parallelDifference: "minor with lowered 2 and 5" },
] as const;

const INTERVAL_NAMES = [
  "unison",
  "minor second",
  "major second",
  "minor third",
  "major third",
  "perfect fourth",
  "tritone",
  "perfect fifth",
  "minor sixth",
  "major sixth",
  "minor seventh",
  "major seventh",
] as const;

const CHORD_ROOT_ROLES = [
  "root",
  "flat ninth / minor second",
  "ninth / major second",
  "minor third",
  "major third",
  "eleventh / perfect fourth",
  "sharp eleventh / tritone",
  "perfect fifth",
  "flat thirteenth / minor sixth",
  "thirteenth / major sixth",
  "minor seventh",
  "major seventh",
] as const;

const TRIAD_ROLES = ["root", "third", "fifth"] as const;

export type ScaleGravityNode = {
  degree: number;
  solfege: string;
  semitonesFromDo: number;
  nominalRatio: number;
  nextGap: number | null;
  halfStepAfter: boolean;
  octaveCopy: boolean;
};

export type DegreeHarmonyReading = {
  degree: number;
  heldOffset: number;
  context: MajorHarmonyContext;
  intervalAboveRoot: number;
  intervalName: string;
  chordRootRole: string;
  isChordTone: boolean;
  triadRole: "root" | "third" | "fifth" | null;
  nearestChordTones: Array<{
    role: "root" | "third" | "fifth";
    offset: number;
    signedSemitones: number;
  }>;
  nearestDistance: number;
  structureCue: string;
  commonPracticeCue: string;
};

export type ModeRotation = {
  modeName: string;
  parentHomeDegree: number;
  parentDegreeOrder: number[];
  steps: number[];
  offsetsFromNewHome: number[];
  parallelDifference: string;
};

export type ScaleGravityJourneyStep = {
  note: number;
  relativeSemitones: number;
  degree: number | null;
  solfege: string | null;
  physicalMoveFromPrevious: number | null;
};

function assertInteger(value: number, label: string) {
  if (!Number.isInteger(value)) throw new RangeError(`${label} must be an integer.`);
}

export function normalizeGravityPitchClass(value: number) {
  assertInteger(value, "Pitch class");
  return ((value % 12) + 12) % 12;
}

export function shortestGravityDistance(fromOffset: number, toOffset: number) {
  const upward = normalizeGravityPitchClass(toOffset - fromOffset);
  return upward > 6 ? upward - 12 : upward;
}

export function majorScaleLandscape(): ScaleGravityNode[] {
  return [...MAJOR_SCALE_OFFSETS, 12].map((offset, index) => ({
    degree: index === 7 ? 1 : index + 1,
    solfege: index === 7 ? `${MAJOR_SCALE_SOLFEGE[0]}′` : MAJOR_SCALE_SOLFEGE[index],
    semitonesFromDo: offset,
    nominalRatio: 2 ** (offset / 12),
    nextGap: index < 7 ? MAJOR_SCALE_STEPS[index] : null,
    halfStepAfter: index < 7 && MAJOR_SCALE_STEPS[index] === 1,
    octaveCopy: index === 7,
  }));
}

export function majorDegreeForRelativeSemitones(relativeSemitones: number) {
  const normalized = normalizeGravityPitchClass(relativeSemitones);
  const index = MAJOR_SCALE_OFFSETS.indexOf(normalized as (typeof MAJOR_SCALE_OFFSETS)[number]);
  return index < 0 ? null : index + 1;
}

export function relativeSemitonesFromDo(note: number, doMidi: number) {
  assertInteger(note, "MIDI note");
  assertInteger(doMidi, "Do MIDI note");
  return normalizeGravityPitchClass(note - doMidi);
}

export function physicalScaleGravityWindowOffset(note: number, doMidi: number) {
  assertInteger(note, "MIDI note");
  assertInteger(doMidi, "Do MIDI note");
  const offset = note - doMidi;
  return offset >= 0 && offset <= 12 ? offset : null;
}

function commonPracticeCue(degree: number, context: MajorHarmonyContext, isChordTone: boolean, nearestDistance: number) {
  if (context.id === "V" && degree === 7) return "In common-practice V→I, degree 7 often moves +1 semitone to 1; the motion is stylistic, not compulsory.";
  if (context.id === "V" && degree === 4) return "Degree 4 is outside the plain V triad. In V7 it becomes the seventh and often moves −1 semitone to 3.";
  if (context.id === "IV" && degree === 3) return "The held note is a major seventh above IV. If harmony changes to I while it stays fixed, it becomes I's chordal third.";
  if (isChordTone) return "The held note is inside this triad; register, voicing, duration, and phrase still shape what it does next.";
  if (nearestDistance === 1) return "A triad tone is one semitone away. Nearby motion is available, but harmony and style decide whether it behaves like a target.";
  return "No triad tone is one semitone away in this field; likely motion depends on voicing, bass, phrase, meter, and style.";
}

export function majorDegreeHarmonyReading(degree: number, contextId: MajorHarmonyContextId): DegreeHarmonyReading {
  assertInteger(degree, "Scale degree");
  if (degree < 1 || degree > 7) throw new RangeError("Scale degree must be between 1 and 7.");
  const context = MAJOR_HARMONY_CONTEXTS.find((candidate) => candidate.id === contextId)!;
  const heldOffset = MAJOR_SCALE_OFFSETS[degree - 1];
  const intervalAboveRoot = normalizeGravityPitchClass(heldOffset - context.rootOffset);
  const chordToneIndex = context.chordOffsets.indexOf(heldOffset);
  const orderedNeighbors = context.chordOffsets
    .map((offset, index) => ({
      offset,
      role: TRIAD_ROLES[index],
      signed: shortestGravityDistance(heldOffset, offset),
    }))
    .sort((first, second) => Math.abs(first.signed) - Math.abs(second.signed) || first.signed - second.signed);
  const nearestDistance = Math.abs(orderedNeighbors[0].signed);
  const nearestChordTones = orderedNeighbors
    .filter((candidate) => Math.abs(candidate.signed) === nearestDistance)
    .map((candidate) => ({ role: candidate.role, offset: candidate.offset, signedSemitones: candidate.signed }));
  const isChordTone = chordToneIndex >= 0;
  const triadRole = isChordTone ? TRIAD_ROLES[chordToneIndex] : null;
  return {
    degree,
    heldOffset,
    context,
    intervalAboveRoot,
    intervalName: INTERVAL_NAMES[intervalAboveRoot],
    chordRootRole: CHORD_ROOT_ROLES[intervalAboveRoot],
    isChordTone,
    triadRole,
    nearestChordTones,
    nearestDistance,
    structureCue: isChordTone
      ? `${TRIAD_ROLES[chordToneIndex]} of the ${context.id} triad`
      : `${CHORD_ROOT_ROLES[intervalAboveRoot]} above ${context.id} root · outside the triad`,
    commonPracticeCue: commonPracticeCue(degree, context, isChordTone, nearestDistance),
  };
}

export function majorDegreeContextProfile(degree: number) {
  return MAJOR_HARMONY_CONTEXTS.map((context) => majorDegreeHarmonyReading(degree, context.id));
}

export function recognizeMajorHarmonyContext(notes: number[], doMidi: number): MajorHarmonyContextId | null {
  if (!notes.every(Number.isInteger) || !Number.isInteger(doMidi)) return null;
  const field = new Set(notes.map((note) => relativeSemitonesFromDo(note, doMidi)));
  if (field.size < 3 || field.size > 4) return null;
  const matches = MAJOR_HARMONY_CONTEXTS.filter((context) => (
    context.chordOffsets.every((offset) => field.has(offset))
    && [...field].filter((offset) => !context.chordOffsets.some((chordOffset) => chordOffset === offset)).length <= 1
  ));
  return matches.length === 1 ? matches[0].id : null;
}

export function rotateMajorMode(parentHomeDegree: number): ModeRotation {
  assertInteger(parentHomeDegree, "Parent home degree");
  if (parentHomeDegree < 1 || parentHomeDegree > 7) throw new RangeError("Parent home degree must be between 1 and 7.");
  const start = parentHomeDegree - 1;
  const steps = Array.from({ length: 7 }, (_, index) => MAJOR_SCALE_STEPS[(start + index) % 7]);
  const parentDegreeOrder = Array.from({ length: 8 }, (_, index) => ((start + index) % 7) + 1);
  const offsetsFromNewHome = [0];
  steps.slice(0, 6).forEach((step) => offsetsFromNewHome.push(offsetsFromNewHome.at(-1)! + step));
  const mode = DIATONIC_MODES[start];
  return {
    modeName: mode.name,
    parentHomeDegree,
    parentDegreeOrder,
    steps,
    offsetsFromNewHome,
    parallelDifference: mode.parallelDifference,
  };
}

export function scaleGravityJourney(events: Array<{ note: number }>, doMidi: number, limit = 5): ScaleGravityJourneyStep[] {
  assertInteger(limit, "Journey limit");
  if (limit < 1) throw new RangeError("Journey limit must be positive.");
  const retained = events.filter((event) => Number.isInteger(event.note)).slice(-limit);
  return retained.map((event, index) => {
    const relativeSemitones = relativeSemitonesFromDo(event.note, doMidi);
    const degree = majorDegreeForRelativeSemitones(relativeSemitones);
    return {
      note: event.note,
      relativeSemitones,
      degree,
      solfege: degree == null ? null : MAJOR_SCALE_SOLFEGE[degree - 1],
      physicalMoveFromPrevious: index ? event.note - retained[index - 1].note : null,
    };
  });
}
