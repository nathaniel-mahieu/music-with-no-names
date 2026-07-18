import { greatestCommonDivisor } from "./music-math.ts";

export const RESEARCH_PITCH_CLASS_COUNT = 12;

export const RESEARCH_INTERVAL_NAMES = [
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

export type ResearchIntervalName = (typeof RESEARCH_INTERVAL_NAMES)[number];

export type ChromaticClockNode = {
  index: number;
  pitchClass: number;
  relativeSemitones: number;
  intervalName: ResearchIntervalName;
  angleDegrees: number;
  x: number;
  y: number;
};

export type GeneratorComponent = {
  index: number;
  startPitchClass: number;
  pitchClasses: number[];
  relativePositions: number[];
};

export type GeneratorPattern = {
  step: number;
  divisor: number;
  loopLength: number;
  componentCount: number;
  components: GeneratorComponent[];
};

export type ThirdsLatticeCell = {
  x: number;
  y: number;
  pitchClass: number;
  relativeSemitones: number;
  intervalName: ResearchIntervalName;
};

export type IntervalMatrixCell = {
  sourceIndex: number;
  targetIndex: number;
  sourcePitchClass: number;
  targetPitchClass: number;
  semitones: number;
  intervalName: ResearchIntervalName;
};

function assertInteger(value: number, label: string) {
  if (!Number.isInteger(value)) throw new RangeError(`${label} must be an integer.`);
}

export function normalizeResearchPitchClass(value: number) {
  assertInteger(value, "Pitch class");
  return ((value % RESEARCH_PITCH_CLASS_COUNT) + RESEARCH_PITCH_CLASS_COUNT) % RESEARCH_PITCH_CLASS_COUNT;
}

/** The upward, octave-folded distance from one pitch class to another. */
export function directedPitchClassSemitones(fromPitchClass: number, toPitchClass: number) {
  return normalizeResearchPitchClass(
    normalizeResearchPitchClass(toPitchClass) - normalizeResearchPitchClass(fromPitchClass),
  );
}

/**
 * The smallest octave-folded move from one pitch class to another.
 * A tritone has no shorter direction, so its tie is represented as +6.
 */
export function shortestSignedPitchClassDistance(fromPitchClass: number, toPitchClass: number) {
  const upward = directedPitchClassSemitones(fromPitchClass, toPitchClass);
  return upward > RESEARCH_PITCH_CLASS_COUNT / 2 ? upward - RESEARCH_PITCH_CLASS_COUNT : upward;
}

export function researchIntervalName(semitones: number): ResearchIntervalName {
  return RESEARCH_INTERVAL_NAMES[normalizeResearchPitchClass(semitones)];
}

/**
 * Places all pitch classes on a fixed semitone clock. Coordinates are on a
 * unit circle centered at (0, 0), with the anchor at twelve o'clock.
 */
export function chromaticClock(anchorPitchClass: number): ChromaticClockNode[] {
  const anchor = normalizeResearchPitchClass(anchorPitchClass);
  return Array.from({ length: RESEARCH_PITCH_CLASS_COUNT }, (_, index) => {
    const angleDegrees = index * (360 / RESEARCH_PITCH_CLASS_COUNT) - 90;
    const angleRadians = angleDegrees * Math.PI / 180;
    const rawX = Math.cos(angleRadians);
    const rawY = Math.sin(angleRadians);
    return {
      index,
      pitchClass: normalizeResearchPitchClass(anchor + index),
      relativeSemitones: index,
      intervalName: RESEARCH_INTERVAL_NAMES[index],
      angleDegrees,
      x: Math.abs(rawX) < Number.EPSILON ? 0 : rawX,
      y: Math.abs(rawY) < Number.EPSILON ? 0 : rawY,
    };
  });
}

/**
 * Partitions the twelve fixed clock positions into every disjoint orbit made
 * by repeatedly adding one interval-generator step.
 */
export function generatorComponents(stepInput: number, anchorPitchClass = 0): GeneratorPattern {
  assertInteger(stepInput, "Generator step");
  const step = normalizeResearchPitchClass(stepInput);
  if (step === 0) throw new RangeError("A generator step must move to another pitch class.");
  const anchor = normalizeResearchPitchClass(anchorPitchClass);
  const divisor = greatestCommonDivisor(step, RESEARCH_PITCH_CLASS_COUNT);
  const loopLength = RESEARCH_PITCH_CLASS_COUNT / divisor;
  const unvisited = new Set(Array.from({ length: RESEARCH_PITCH_CLASS_COUNT }, (_, relative) => relative));
  const components: GeneratorComponent[] = [];

  while (unvisited.size > 0) {
    const startRelative = Array.from(unvisited).sort((first, second) => first - second)[0];
    const relativePositions = Array.from(
      { length: loopLength },
      (_, index) => normalizeResearchPitchClass(startRelative + index * step),
    );
    relativePositions.forEach((relative) => unvisited.delete(relative));
    const pitchClasses = relativePositions.map((relative) => normalizeResearchPitchClass(anchor + relative));
    components.push({
      index: components.length,
      startPitchClass: pitchClasses[0],
      pitchClasses,
      relativePositions,
    });
  }

  return {
    step,
    divisor,
    loopLength,
    componentCount: divisor,
    components,
  };
}

/**
 * A 4 × 3 pitch-class lattice: right is +3 semitones, down is +4, and the
 * combined down-right diagonal is +7. Every pitch class appears once.
 */
export function thirdsLattice(anchorPitchClass: number): ThirdsLatticeCell[] {
  const anchor = normalizeResearchPitchClass(anchorPitchClass);
  return Array.from({ length: 3 }, (_, y) => (
    Array.from({ length: 4 }, (_, x): ThirdsLatticeCell => {
      const relativeSemitones = normalizeResearchPitchClass(3 * x + 4 * y);
      return {
        x,
        y,
        pitchClass: normalizeResearchPitchClass(anchor + relativeSemitones),
        relativeSemitones,
        intervalName: RESEARCH_INTERVAL_NAMES[relativeSemitones],
      };
    })
  )).flat();
}

/** A complete source-row by target-column table of directed pitch-class intervals. */
export function intervalMatrix(anchorPitchClass: number): IntervalMatrixCell[][] {
  const anchor = normalizeResearchPitchClass(anchorPitchClass);
  return Array.from({ length: RESEARCH_PITCH_CLASS_COUNT }, (_, sourceIndex) => {
    const sourcePitchClass = normalizeResearchPitchClass(anchor + sourceIndex);
    return Array.from({ length: RESEARCH_PITCH_CLASS_COUNT }, (_, targetIndex) => {
      const targetPitchClass = normalizeResearchPitchClass(anchor + targetIndex);
      const semitones = directedPitchClassSemitones(sourcePitchClass, targetPitchClass);
      return {
        sourceIndex,
        targetIndex,
        sourcePitchClass,
        targetPitchClass,
        semitones,
        intervalName: RESEARCH_INTERVAL_NAMES[semitones],
      };
    });
  });
}
