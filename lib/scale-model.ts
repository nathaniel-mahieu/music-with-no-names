import {
  aggregateRoughness,
  harmonicSpectrum,
  spectralOverlap,
} from "./auditory-model.ts";
import { approximateRatio } from "./music-math.ts";

export type ScalePreset = {
  id: "seven" | "five" | "whole";
  name: string;
  character: string;
  steps: number[];
  syllables: string[];
};

export type ScaleDegree = {
  index: number;
  syllable: string;
  stepsFromDo: number;
  cents: number;
  ratio: number;
};

export type ScaleHearingChallenge = { path: number[]; missingPosition: number };

export const SCALE_PRESETS: ScalePreset[] = [
  {
    id: "seven",
    name: "seven-step asymmetric orbit",
    character: "Unequal steps create strong landmarks and a small closing step back to Do.",
    steps: [2, 2, 1, 2, 2, 2, 1],
    syllables: ["Do", "Re", "Mi", "Fa", "Sol", "La", "Ti"],
  },
  {
    id: "five",
    name: "five-step open orbit",
    character: "Open · middle · middle · open · middle leaves more space and a broad return to Do.",
    steps: [3, 2, 2, 3, 2],
    syllables: ["Do", "Me", "Fa", "Sol", "Te"],
  },
  {
    id: "whole",
    name: "six-step even orbit",
    character: "Every step is equal, so the orbit supplies fewer unequal landmarks for a center.",
    steps: [2, 2, 2, 2, 2, 2],
    syllables: ["Do", "Re", "Mi", "Fi", "Si", "Li"],
  },
];

export const SCALE_HEARING_PATHS: Record<ScalePreset["id"], ScaleHearingChallenge[]> = {
  seven: [
    { path: [0, 2, 1, 4, 3, 0], missingPosition: 4 },
    { path: [0, 1, 3, 5, 6, 0], missingPosition: 2 },
    { path: [0, 4, 5, 2, 1, 0], missingPosition: 3 },
  ],
  five: [
    { path: [0, 2, 1, 3, 4, 0], missingPosition: 4 },
    { path: [0, 1, 3, 2, 1, 0], missingPosition: 2 },
    { path: [0, 3, 2, 4, 3, 0], missingPosition: 3 },
  ],
  whole: [
    { path: [0, 2, 1, 4, 3, 0], missingPosition: 4 },
    { path: [0, 1, 3, 2, 5, 0], missingPosition: 2 },
    { path: [0, 4, 2, 3, 1, 0], missingPosition: 3 },
  ],
};

function assertSteps(steps: number[]) {
  if (steps.length < 2 || steps.some((step) => !Number.isFinite(step) || step <= 0)) {
    throw new RangeError("A scale needs at least two positive step sizes.");
  }
}

export function rotateScale<T>(values: T[], amount: number) {
  if (values.length === 0) return [];
  const offset = ((Math.trunc(amount) % values.length) + values.length) % values.length;
  return [...values.slice(offset), ...values.slice(0, offset)];
}

export function scaleDegrees(steps: number[], syllables: string[]): ScaleDegree[] {
  assertSteps(steps);
  if (syllables.length !== steps.length) throw new RangeError("Every scale degree needs one syllable.");
  const octaveUnits = steps.reduce((sum, step) => sum + step, 0);
  let position = 0;
  return steps.map((step, index) => {
    const degree = {
      index,
      syllable: syllables[index],
      stepsFromDo: position,
      cents: (position / octaveUnits) * 1200,
      ratio: 2 ** (position / octaveUnits),
    };
    position += step;
    return degree;
  });
}

export function degreeEvidence(referenceHz: number, degree: ScaleDegree) {
  if (!Number.isFinite(referenceHz) || referenceHz <= 0) throw new RangeError("Reference frequency must be positive.");
  const targetHz = referenceHz * degree.ratio;
  const options = { partialCount: 10, rolloffDbPerOctave: 7, inharmonicity: 0, noiseAmount: 0 };
  const rootSpectrum = harmonicSpectrum(referenceHz, 0, options);
  const degreeSpectrum = harmonicSpectrum(targetHz, 1, options);
  const approximation = approximateRatio(degree.ratio, 16);
  return {
    targetHz,
    roughness: aggregateRoughness([...rootSpectrum, ...degreeSpectrum]),
    overlap: spectralOverlap(rootSpectrum, degreeSpectrum, 18),
    approximation,
  };
}

export function scaleFingerprint(steps: number[]) {
  assertSteps(steps);
  const total = steps.reduce((sum, step) => sum + step, 0);
  return steps.map((step) => ({
    step,
    share: step / total,
    width: (1200 * step) / total <= 125 ? "close" as const : (1200 * step) / total <= 225 ? "middle" as const : "open" as const,
  }));
}

export function stepFrequencyRatio(step: number, octaveUnits = 12) {
  if (!Number.isFinite(step) || step <= 0) throw new RangeError("Step size must be positive.");
  if (!Number.isFinite(octaveUnits) || octaveUnits <= 0) throw new RangeError("Octave units must be positive.");
  return 2 ** (step / octaveUnits);
}

export function intervalStepRecipe(steps: number[], degreeIndex: number) {
  assertSteps(steps);
  if (!Number.isInteger(degreeIndex) || degreeIndex < 0 || degreeIndex >= steps.length) {
    throw new RangeError("Degree index must identify a degree in the scale.");
  }
  return scaleFingerprint(steps).slice(0, degreeIndex);
}
