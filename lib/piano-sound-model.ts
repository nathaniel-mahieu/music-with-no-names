import type { SonorityVoice } from "./sonority-model.ts";
import {
  aggregateRoughness,
  harmonicSpectrum,
  pairRoughness,
  spectralOverlap,
  type SpectralComponent,
} from "./auditory-model.ts";

export type PianoSoundModelId = "sine" | "harmonic" | "mellow-piano" | "bright-piano";

export type PianoSoundModel = {
  id: PianoSoundModelId;
  label: string;
  shortLabel: string;
  description: string;
  partialCount: number;
  rolloffDbPerOctave: number;
  inharmonicity: number;
  noiseAmount: number;
};

export type PianoPartialPair = {
  lowerPartial: number;
  upperPartial: number;
  lowerHz: number;
  upperHz: number;
  separationHz: number;
  centsApart: number;
  contribution: number;
};

export type PianoPartialInteraction = {
  lowerHz: number;
  upperHz: number;
  modelId: PianoSoundModelId;
  lowerPartials: SpectralComponent[];
  upperPartials: SpectralComponent[];
  alignedPairs: PianoPartialPair[];
  interactionPairs: PianoPartialPair[];
  overlap: number;
  roughness: number;
};

export type PianoPartialInteractionComparison = {
  source: PianoPartialInteraction;
  attempt: PianoPartialInteraction;
  alignedPairDelta: number;
  interactionPairDelta: number;
  overlapDelta: number;
  roughnessDelta: number;
};

export const PIANO_SOUND_MODELS: readonly PianoSoundModel[] = [
  {
    id: "sine",
    label: "Sine · one partial",
    shortLabel: "Sine",
    description: "One frequency per key; isolates spacing without overtone collisions.",
    partialCount: 1,
    rolloffDbPerOctave: 12,
    inharmonicity: 0,
    noiseAmount: 0,
  },
  {
    id: "harmonic",
    label: "Harmonic stack · 9 partials",
    shortLabel: "Harmonic",
    description: "Exact integer overtones; the neutral relationship-first reference.",
    partialCount: 9,
    rolloffDbPerOctave: 7,
    inharmonicity: 0,
    noiseAmount: 0,
  },
  {
    id: "mellow-piano",
    label: "Mellow piano proxy · 12 partials",
    shortLabel: "Mellow piano",
    description: "Faster high-partial decay with slight string stretch and a small noise floor.",
    partialCount: 12,
    rolloffDbPerOctave: 10,
    inharmonicity: 0.00008,
    noiseAmount: 0.01,
  },
  {
    id: "bright-piano",
    label: "Bright piano proxy · 16 partials",
    shortLabel: "Bright piano",
    description: "More upper-partial energy, slightly more string stretch, and a small noise floor.",
    partialCount: 16,
    rolloffDbPerOctave: 5,
    inharmonicity: 0.00016,
    noiseAmount: 0.025,
  },
] as const;

export const DEFAULT_PIANO_SOUND_MODEL_ID: PianoSoundModelId = "harmonic";

export function isPianoSoundModelId(value: unknown): value is PianoSoundModelId {
  return typeof value === "string" && PIANO_SOUND_MODELS.some((model) => model.id === value);
}

export function pianoSoundModel(id: PianoSoundModelId): PianoSoundModel {
  return PIANO_SOUND_MODELS.find((model) => model.id === id) ?? PIANO_SOUND_MODELS[1];
}

export function pianoSoundVoice(frequencyHz: number, amplitude: number, modelId: PianoSoundModelId): SonorityVoice {
  const model = pianoSoundModel(modelId);
  return {
    frequencyHz,
    amplitude,
    partialCount: model.partialCount,
    spectrum: {
      partialCount: model.partialCount,
      rolloffDbPerOctave: model.rolloffDbPerOctave,
      inharmonicity: model.inharmonicity,
      noiseAmount: model.noiseAmount,
    },
  };
}

export function pianoSoundPartialProfile(modelId: PianoSoundModelId) {
  const model = pianoSoundModel(modelId);
  return Array.from({ length: model.partialCount }, (_, offset) => {
    const partialIndex = offset + 1;
    return {
      partialIndex,
      frequencyMultiple: partialIndex * Math.sqrt((1 + model.inharmonicity * partialIndex ** 2) / (1 + model.inharmonicity)),
      amplitude: 10 ** (-(model.rolloffDbPerOctave * Math.log2(partialIndex)) / 20),
    };
  });
}

/**
 * Exposes the partial pairs behind one assumed two-note spectrum. Alignment and
 * interaction zones are teaching coordinates, not measurements of a keyboard,
 * DAW patch, room, or listener.
 */
export function pianoPartialInteraction(
  firstHz: number,
  secondHz: number,
  modelId: PianoSoundModelId,
): PianoPartialInteraction {
  if (!Number.isFinite(firstHz) || firstHz <= 0 || !Number.isFinite(secondHz) || secondHz <= 0) {
    throw new RangeError("Partial interaction frequencies must be positive.");
  }
  const lowerHz = Math.min(firstHz, secondHz);
  const upperHz = Math.max(firstHz, secondHz);
  const model = pianoSoundModel(modelId);
  const options = {
    partialCount: model.partialCount,
    rolloffDbPerOctave: model.rolloffDbPerOctave,
    inharmonicity: model.inharmonicity,
    noiseAmount: model.noiseAmount,
  };
  const lowerPartials = harmonicSpectrum(lowerHz, 0, options).filter((component) => component.kind === "partial");
  const upperPartials = harmonicSpectrum(upperHz, 1, options).filter((component) => component.kind === "partial");
  const pairs: Array<PianoPartialPair & { normalizedInteraction: number }> = [];
  for (const lower of lowerPartials) {
    for (const upper of upperPartials) {
      const amplitudeProduct = lower.amplitude * upper.amplitude;
      const contribution = pairRoughness(lower, upper);
      pairs.push({
        lowerPartial: lower.partialIndex!,
        upperPartial: upper.partialIndex!,
        lowerHz: lower.frequencyHz,
        upperHz: upper.frequencyHz,
        separationHz: Math.abs(lower.frequencyHz - upper.frequencyHz),
        centsApart: Math.abs(1200 * Math.log2(lower.frequencyHz / upper.frequencyHz)),
        contribution,
        normalizedInteraction: amplitudeProduct > 0 ? contribution / amplitudeProduct : 0,
      });
    }
  }
  const alignedPairs = pairs
    .filter((pair) => pair.centsApart <= 18)
    .sort((first, second) => first.lowerHz - second.lowerHz)
    .map(({ normalizedInteraction: _normalizedInteraction, ...pair }) => pair);
  const interactionPairs = pairs
    .filter((pair) => pair.centsApart > 18 && pair.normalizedInteraction >= 0.035)
    .sort((first, second) => second.contribution - first.contribution)
    .slice(0, 6)
    .map(({ normalizedInteraction: _normalizedInteraction, ...pair }) => pair);
  return {
    lowerHz,
    upperHz,
    modelId,
    lowerPartials,
    upperPartials,
    alignedPairs,
    interactionPairs,
    overlap: spectralOverlap(lowerPartials, upperPartials),
    roughness: aggregateRoughness([...lowerPartials, ...upperPartials]),
  };
}

/**
 * Compares two two-frequency counterfactuals under one declared spectrum.
 * Deltas describe this model only; they are not consonance or preference scores.
 */
export function comparePianoPartialInteractions(
  sourceFrequenciesHz: readonly [number, number],
  attemptFrequenciesHz: readonly [number, number],
  modelId: PianoSoundModelId,
): PianoPartialInteractionComparison {
  const source = pianoPartialInteraction(sourceFrequenciesHz[0], sourceFrequenciesHz[1], modelId);
  const attempt = pianoPartialInteraction(attemptFrequenciesHz[0], attemptFrequenciesHz[1], modelId);
  return {
    source,
    attempt,
    alignedPairDelta: attempt.alignedPairs.length - source.alignedPairs.length,
    interactionPairDelta: attempt.interactionPairs.length - source.interactionPairs.length,
    overlapDelta: attempt.overlap - source.overlap,
    roughnessDelta: attempt.roughness - source.roughness,
  };
}
