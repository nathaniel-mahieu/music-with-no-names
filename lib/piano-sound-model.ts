import type { SonorityVoice } from "./sonority-model.ts";

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
