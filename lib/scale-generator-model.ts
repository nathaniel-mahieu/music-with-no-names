import { centsFromRatio, greatestCommonDivisor } from "./music-math.ts";

export const OCTAVE_DIVISIONS = 12;

export const CHROMATIC_DEGREE_ADDRESSES = [
  { syllable: "Do", degree: "1" },
  { syllable: "Di / Ra", degree: "♯1 / ♭2" },
  { syllable: "Re", degree: "2" },
  { syllable: "Ri / Me", degree: "♯2 / ♭3" },
  { syllable: "Mi", degree: "3" },
  { syllable: "Fa", degree: "4" },
  { syllable: "Fi / Se", degree: "♯4 / ♭5" },
  { syllable: "Sol", degree: "5" },
  { syllable: "Si / Le", degree: "♯5 / ♭6" },
  { syllable: "La", degree: "6" },
  { syllable: "Li / Te", degree: "♯6 / ♭7" },
  { syllable: "Ti", degree: "7" },
] as const;

export const MAJOR_POSITIONS = [0, 2, 4, 5, 7, 9, 11] as const;
export const MAJOR_GAPS = [2, 2, 1, 2, 2, 2, 1] as const;
export const REHOMED_UNCHANGED_GAPS = [2, 2, 1, 2, 2, 1, 2] as const;

export type GeneratorOrbit = {
  generator: number;
  divisions: number;
  divisor: number;
  cycleLength: number;
  componentCount: number;
  positions: number[];
  unvisitedPositions: number[];
};

export type GeneratorVisit = {
  generatorIndex: number;
  absolutePosition: number;
  relativePosition: number;
  repeated: boolean;
};

export type GeneratorWindow = {
  generator: number;
  divisions: number;
  count: number;
  homeMove: number;
  homePosition: number;
  nextHomePosition: number;
  visits: GeneratorVisit[];
  absolutePositions: number[];
  relativePositions: number[];
  nextAbsolutePositions: number[];
  nextRelativePositions: number[];
  gaps: number[];
  distinctCount: number;
  collectionLabel: string;
  removedPositions: number[];
  addedPositions: number[];
  retainedPositions: number[];
  boundaryRemainder: number;
  coversFullOrbit: boolean;
  stableAfterShift: boolean;
};

export type PitchClassSetChange = {
  source: number[];
  target: number[];
  retained: number[];
  removed: number[];
  added: number[];
  replacements: number;
};

export type FifthShiftExample = {
  id: "diatonic" | "natural-minor" | "major-pentatonic" | "harmonic-minor" | "whole-tone" | "octatonic" | "chromatic";
  label: string;
  positions: readonly number[];
  reason: string;
};

function assertDivisions(divisions: number) {
  if (!Number.isInteger(divisions) || divisions < 2) {
    throw new RangeError("Octave divisions must be an integer greater than one.");
  }
}

export function normalizePitchClass(value: number, divisions = OCTAVE_DIVISIONS) {
  assertDivisions(divisions);
  if (!Number.isInteger(value)) throw new RangeError("Pitch-class positions must be integers.");
  return ((value % divisions) + divisions) % divisions;
}

function normalizedDistinct(values: readonly number[], divisions = OCTAVE_DIVISIONS) {
  return [...new Set(values.map((value) => normalizePitchClass(value, divisions)))].sort((first, second) => first - second);
}

export function cyclicGapPattern(values: readonly number[], divisions = OCTAVE_DIVISIONS) {
  assertDivisions(divisions);
  const positions = normalizedDistinct(values, divisions);
  if (positions.length === 0) throw new RangeError("A cyclic gap pattern needs at least one position.");
  return positions.map((position, index) => {
    const next = positions[(index + 1) % positions.length];
    return normalizePitchClass(next - position, divisions) || divisions;
  });
}

export function generatorOrbit(generator: number, divisions = OCTAVE_DIVISIONS): GeneratorOrbit {
  assertDivisions(divisions);
  const normalizedGenerator = normalizePitchClass(generator, divisions);
  if (normalizedGenerator === 0) throw new RangeError("A generator must move to a new octave position.");
  const divisor = greatestCommonDivisor(normalizedGenerator, divisions);
  const cycleLength = divisions / divisor;
  const positions = Array.from({ length: cycleLength }, (_, index) => normalizePitchClass(index * normalizedGenerator, divisions));
  const visited = new Set(positions);
  return {
    generator: normalizedGenerator,
    divisions,
    divisor,
    cycleLength,
    componentCount: divisor,
    positions,
    unvisitedPositions: Array.from({ length: divisions }, (_, position) => position).filter((position) => !visited.has(position)),
  };
}

export function transposePitchClassSet(values: readonly number[], amount: number, divisions = OCTAVE_DIVISIONS) {
  return normalizedDistinct(values.map((value) => value + amount), divisions);
}

export function pitchClassSetChange(source: readonly number[], target: readonly number[], divisions = OCTAVE_DIVISIONS): PitchClassSetChange {
  const normalizedSource = normalizedDistinct(source, divisions);
  const normalizedTarget = normalizedDistinct(target, divisions);
  const sourceSet = new Set(normalizedSource);
  const targetSet = new Set(normalizedTarget);
  const retained = normalizedSource.filter((position) => targetSet.has(position));
  const removed = normalizedSource.filter((position) => !targetSet.has(position));
  const added = normalizedTarget.filter((position) => !sourceSet.has(position));
  return {
    source: normalizedSource,
    target: normalizedTarget,
    retained,
    removed,
    added,
    replacements: Math.max(removed.length, added.length),
  };
}

export function collectionLabel(values: readonly number[], divisions = OCTAVE_DIVISIONS) {
  const positions = normalizedDistinct(values, divisions);
  const key = positions.join("-");
  if (divisions === 12) {
    if (key === "0-1-2-3-4-5-6-7-8-9-10-11") return "chromatic aggregate";
    if (key === "0-2-4-5-7-9-11") return "major / Ionian route";
    if (key === "0-1-3-5-7-8-10") return "Phrygian diatonic route";
    if (key === "0-1-2-3-4-5-11") return "seven-position chromatic cluster";
    if (key === "0-2-4-6-8-10") return "whole-tone collection";
    if (key === "0-3-6-9") return "diminished-seventh equal division";
    if (key === "0-4-8") return "augmented-triad equal division";
    if (key === "0-6") return "tritone pair";
  }
  const gaps = cyclicGapPattern(positions, divisions);
  if (gaps.every((gap) => gap === gaps[0])) return `${positions.length}-way equal division`;
  return `${positions.length}-position collection`;
}

export function generatorWindow(
  generator: number,
  count: number,
  homeMove = 0,
  divisions = OCTAVE_DIVISIONS,
): GeneratorWindow {
  if (!Number.isInteger(count) || count < 2 || count > divisions) {
    throw new RangeError("A generator window must contain between two and one octave's worth of visits.");
  }
  if (!Number.isInteger(homeMove)) throw new RangeError("The home move must be an integer.");
  const orbit = generatorOrbit(generator, divisions);
  const homePosition = normalizePitchClass(homeMove * orbit.generator, divisions);
  const nextHomePosition = normalizePitchClass((homeMove + 1) * orbit.generator, divisions);
  const seen = new Set<number>();
  const visits = Array.from({ length: count }, (_, visitIndex): GeneratorVisit => {
    const generatorIndex = homeMove - 1 + visitIndex;
    const absolutePosition = normalizePitchClass(generatorIndex * orbit.generator, divisions);
    const repeated = seen.has(absolutePosition);
    seen.add(absolutePosition);
    return {
      generatorIndex,
      absolutePosition,
      relativePosition: normalizePitchClass(absolutePosition - homePosition, divisions),
      repeated,
    };
  });
  const absolutePositions = normalizedDistinct(visits.map((visit) => visit.absolutePosition), divisions);
  const relativePositions = normalizedDistinct(visits.map((visit) => visit.relativePosition), divisions);
  const nextVisits = Array.from({ length: count }, (_, visitIndex) => normalizePitchClass((homeMove + visitIndex) * orbit.generator, divisions));
  const nextAbsolutePositions = normalizedDistinct(nextVisits, divisions);
  const nextRelativePositions = normalizedDistinct(nextVisits.map((position) => position - nextHomePosition), divisions);
  const change = pitchClassSetChange(absolutePositions, nextAbsolutePositions, divisions);
  const distinctCount = absolutePositions.length;
  return {
    generator: orbit.generator,
    divisions,
    count,
    homeMove,
    homePosition,
    nextHomePosition,
    visits,
    absolutePositions,
    relativePositions,
    nextAbsolutePositions,
    nextRelativePositions,
    gaps: cyclicGapPattern(relativePositions, divisions),
    distinctCount,
    collectionLabel: collectionLabel(relativePositions, divisions),
    removedPositions: change.removed,
    addedPositions: change.added,
    retainedPositions: change.retained,
    boundaryRemainder: normalizePitchClass(count * orbit.generator, divisions),
    coversFullOrbit: distinctCount === orbit.cycleLength,
    stableAfterShift: change.replacements === 0,
  };
}

export const FIFTH_SHIFT_EXAMPLES: FifthShiftExample[] = [
  {
    id: "diatonic",
    label: "Major or a fixed diatonic mode",
    positions: MAJOR_POSITIONS,
    reason: "Seven consecutive fifth positions: the window drops one endpoint and admits one.",
  },
  {
    id: "natural-minor",
    label: "Natural minor / Aeolian",
    positions: [0, 2, 3, 5, 7, 8, 10],
    reason: "Another diatonic mode: old Le rises to La; from the new home, Ra rises to Re.",
  },
  {
    id: "major-pentatonic",
    label: "Major pentatonic",
    positions: [0, 2, 4, 7, 9],
    reason: "Five consecutive fifths still exchange one endpoint, but 5 × 7 ≡ −1: old Do leaves and old Ti enters. One replacement survives; the one-sharp direction does not.",
  },
  {
    id: "harmonic-minor",
    label: "Harmonic minor",
    positions: [0, 2, 3, 5, 7, 8, 11],
    reason: "Its raised Ti breaks the single consecutive-fifths window, so three positions are replaced.",
  },
  {
    id: "whole-tone",
    label: "Whole-tone",
    positions: [0, 2, 4, 6, 8, 10],
    reason: "A fifth crosses to the complementary whole-tone loop; none of the six positions remain.",
  },
  {
    id: "octatonic",
    label: "Octatonic whole–half",
    positions: [0, 2, 3, 5, 6, 8, 9, 11],
    reason: "It is the union of two +3 diminished-seventh loops, equivalently an alternating 2–1 gap pattern; +7 retains four positions and replaces four.",
  },
  {
    id: "chromatic",
    label: "Chromatic aggregate",
    positions: Array.from({ length: 12 }, (_, position) => position),
    reason: "Every octave position is already present, so transposition changes no membership.",
  },
];

export function fifthShiftProfile(example: FifthShiftExample) {
  return pitchClassSetChange(example.positions, transposePitchClassSet(example.positions, 7));
}

export const MAJOR_FIFTH_WINDOW = generatorWindow(7, 7);
export const MAJOR_FIFTH_WINDOW_NEXT = generatorWindow(7, 7, 1);

export const REHOMED_MAJOR_WITHOUT_REPAIR = transposePitchClassSet(MAJOR_POSITIONS, -7);
export const REPAIRED_MAJOR_FROM_NEW_DO = [...MAJOR_POSITIONS];

export const PURE_FIFTH_CENTS = centsFromRatio(3 / 2);
export const EQUAL_TEMPERED_FIFTH_CENTS = 700;
export const PYTHAGOREAN_COMMA_CENTS = centsFromRatio((3 / 2) ** 12 / 2 ** 7);
export const SEVEN_PURE_FIFTH_BOUNDARY_CENTS = centsFromRatio((3 / 2) ** 7 / 2 ** 4);
