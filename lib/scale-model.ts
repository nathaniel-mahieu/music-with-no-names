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

export const SCALE_PRESETS: ScalePreset[] = [
  {
    id: "seven",
    name: "seven-degree orbit",
    character: "Unequal steps create strong landmarks and a small closing step back to Do.",
    steps: [2, 2, 1, 2, 2, 2, 1],
    syllables: ["Do", "Re", "Mi", "Fa", "Sol", "La", "Ti"],
  },
  {
    id: "five",
    name: "five-degree orbit",
    character: "The 3 · 2 · 2 · 3 · 2 fingerprint uses wider gaps and leaves more open space.",
    steps: [3, 2, 2, 3, 2],
    syllables: ["Do", "Re", "Mi", "Sol", "La"],
  },
  {
    id: "whole",
    name: "six-degree even orbit",
    character: "Every step is equal, so the orbit supplies fewer unequal landmarks for a center.",
    steps: [2, 2, 2, 2, 2, 2],
    syllables: ["Do", "Re", "Mi", "Fi", "Si", "Li"],
  },
];

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
  const average = total / steps.length;
  return steps.map((step) => ({
    step,
    share: step / total,
    width: Math.abs(step - average) < 1e-9 ? "even" as const : step < average ? "narrow" as const : "wide" as const,
  }));
}
