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

export type ScaleStackTone = {
  degreeIndex: number;
  degreeNumber: number;
  syllable: string;
  octave: number;
  semitonesFromDo: number;
  semitonesAboveBass: number;
};

export type ScaleStackShape = {
  id: "major-thirds" | "minor-thirds" | "diminished-thirds" | "augmented-thirds" | "even-fourths" | "third-then-fourth" | "fourth-then-third" | "other";
  label: string;
  character: string;
};

export type ScaleStackTriadReading = {
  quality: "major" | "minor" | "diminished" | "augmented";
  rootDegreeIndex: number | null;
  rootSyllable: string | null;
  bassRole: "root" | "third" | "fifth" | "symmetric";
  inversion: "root position" | "first inversion" | "second inversion" | "symmetric root reading";
};

export type ScaleDegreeField = {
  degreeIndex: number;
  degreeNumber: number;
  syllable: string;
  semitonesFromDo: number;
  incomingGap: number;
  outgoingGap: number;
  tones: [ScaleStackTone, ScaleStackTone, ScaleStackTone];
  adjacentGaps: [number, number];
  semitoneShape: [0, number, number];
  totalSpan: number;
  shape: ScaleStackShape;
  triadReading: ScaleStackTriadReading | null;
};

export const SCALE_PRESETS: ScalePreset[] = [
  {
    id: "seven",
    name: "Seven-pitch unequal path",
    character: "The 2–2–1–2–2–2–1 semitone route supplies unequal landmarks; its final one-semitone move makes Do nearby without forcing a return.",
    steps: [2, 2, 1, 2, 2, 2, 1],
    syllables: ["Do", "Re", "Mi", "Fa", "Sol", "La", "Ti"],
  },
  {
    id: "five",
    name: "Five-pitch spacious path",
    character: "The 3–2–2–3–2 semitone route leaves wider gaps; its final two-semitone move keeps more physical space before Do.",
    steps: [3, 2, 2, 3, 2],
    syllables: ["Do", "Me", "Fa", "Sol", "Te"],
  },
  {
    id: "whole",
    name: "Six-pitch equal path",
    character: "Every gap is two semitones, so local spacing alone does not distinguish one pitch as home.",
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
    width: (1200 * step) / total <= 125 ? "small" as const : (1200 * step) / total <= 225 ? "medium" as const : "large" as const,
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

const TERTIAN_TRIADS = [
  { quality: "major" as const, offsets: [0, 4, 7], roles: ["root", "third", "fifth"] as const },
  { quality: "minor" as const, offsets: [0, 3, 7], roles: ["root", "third", "fifth"] as const },
  { quality: "diminished" as const, offsets: [0, 3, 6], roles: ["root", "third", "fifth"] as const },
  { quality: "augmented" as const, offsets: [0, 4, 8], roles: ["root", "third", "fifth"] as const },
];

function modulo(value: number, divisor: number) {
  return ((value % divisor) + divisor) % divisor;
}

function scaleStackShape(firstGap: number, secondGap: number): ScaleStackShape {
  const key = `${firstGap}-${secondGap}`;
  if (key === "4-3") return { id: "major-thirds", label: "major-triad spacing", character: "Two unequal third-sized gaps: 4 semitones below and 3 above." };
  if (key === "3-4") return { id: "minor-thirds", label: "minor-triad spacing", character: "Two unequal third-sized gaps: 3 semitones below and 4 above." };
  if (key === "3-3") return { id: "diminished-thirds", label: "diminished spacing", character: "Two compact, equal 3-semitone gaps make a symmetric stack." };
  if (key === "4-4") return { id: "augmented-thirds", label: "augmented spacing", character: "Two equal 4-semitone gaps—and another 4 back around the octave—make the pitch-class set symmetric." };
  if (key === "5-5") return { id: "even-fourths", label: "even fourth-stack", character: "Two wide, equal 5-semitone gaps make an open, root-flexible voicing." };
  if (key === "4-5") return { id: "third-then-fourth", label: "third → fourth", character: "A 4-semitone third-sized gap opens into a wider 5-semitone fourth." };
  if (key === "5-4") return { id: "fourth-then-third", label: "fourth → third", character: "A wide 5-semitone fourth closes to a 4-semitone third-sized gap." };
  return { id: "other", label: `${firstGap} + ${secondGap} semitone stack`, character: `The selected voicing places ${firstGap} semitones below and ${secondGap} semitones above.` };
}

function exactTertianReading(
  tones: [ScaleStackTone, ScaleStackTone, ScaleStackTone],
  degrees: ScaleDegree[],
): ScaleStackTriadReading | null {
  const pitchClasses = [...new Set(tones.map((tone) => modulo(tone.semitonesFromDo, 12)))].sort((first, second) => first - second);
  if (pitchClasses.length !== 3) return null;

  for (const template of TERTIAN_TRIADS) {
    const roots = pitchClasses.filter((root) => {
      const normalized = pitchClasses.map((pitchClass) => modulo(pitchClass - root, 12)).sort((first, second) => first - second);
      return normalized.every((offset, index) => offset === template.offsets[index]);
    });
    if (roots.length === 0) continue;
    if (template.quality === "augmented") {
      return {
        quality: template.quality,
        rootDegreeIndex: null,
        rootSyllable: null,
        bassRole: "symmetric",
        inversion: "symmetric root reading",
      };
    }

    const rootPitchClass = roots[0];
    const rootDegree = degrees.find((degree) => modulo(degree.stepsFromDo, 12) === rootPitchClass) ?? null;
    const bassOffset = modulo(tones[0].semitonesFromDo - rootPitchClass, 12);
    const bassRoleIndex = template.offsets.indexOf(bassOffset);
    const bassRole = template.roles[bassRoleIndex] ?? "root";
    return {
      quality: template.quality,
      rootDegreeIndex: rootDegree?.index ?? null,
      rootSyllable: rootDegree?.syllable ?? null,
      bassRole,
      inversion: bassRole === "third" ? "first inversion" : bassRole === "fifth" ? "second inversion" : "root position",
    };
  }
  return null;
}

/**
 * Builds one three-note field on every degree by taking a scale tone, skipping
 * the next scale tone, and repeating. The route is unfolded upward so exact
 * semitone gaps remain visible across the octave boundary.
 *
 * This helper is intentionally limited to twelve-semitone octave routes. Its
 * structural labels describe spacing, not consonance, emotion, or harmonic
 * function.
 */
export function scaleDegreeFields(steps: number[], syllables: string[]): ScaleDegreeField[] {
  assertSteps(steps);
  if (steps.some((step) => !Number.isInteger(step)) || steps.reduce((sum, step) => sum + step, 0) !== 12) {
    throw new RangeError("Scale-degree fields require integer semitone steps totaling twelve.");
  }
  const degrees = scaleDegrees(steps, syllables);
  const degreeCount = degrees.length;

  return degrees.map((degree) => {
    const tones = [0, 1, 2].map((stackPosition) => {
      const unfoldedIndex = degree.index + stackPosition * 2;
      const degreeIndex = modulo(unfoldedIndex, degreeCount);
      const octave = Math.floor(unfoldedIndex / degreeCount);
      const stackedDegree = degrees[degreeIndex];
      const semitonesFromDo = stackedDegree.stepsFromDo + octave * 12;
      return {
        degreeIndex,
        degreeNumber: degreeIndex + 1,
        syllable: stackedDegree.syllable,
        octave,
        semitonesFromDo,
        semitonesAboveBass: semitonesFromDo - degree.stepsFromDo,
      };
    }) as [ScaleStackTone, ScaleStackTone, ScaleStackTone];
    const adjacentGaps: [number, number] = [
      tones[1].semitonesAboveBass - tones[0].semitonesAboveBass,
      tones[2].semitonesAboveBass - tones[1].semitonesAboveBass,
    ];
    const semitoneShape: [0, number, number] = [0, tones[1].semitonesAboveBass, tones[2].semitonesAboveBass];

    return {
      degreeIndex: degree.index,
      degreeNumber: degree.index + 1,
      syllable: degree.syllable,
      semitonesFromDo: degree.stepsFromDo,
      incomingGap: steps[modulo(degree.index - 1, degreeCount)],
      outgoingGap: steps[degree.index],
      tones,
      adjacentGaps,
      semitoneShape,
      totalSpan: semitoneShape[2],
      shape: scaleStackShape(...adjacentGaps),
      triadReading: exactTertianReading(tones, degrees),
    };
  });
}
