import {
  aggregateRoughness,
  harmonicityCandidates,
  harmonicSpectrum,
  spectralOverlap,
  type SpectralComponent,
  type SpectrumOptions,
} from "./auditory-model.ts";

export type SonorityVoice = {
  frequencyHz: number;
  amplitude: number;
  partialCount: number;
  spectrum?: Partial<SpectrumOptions>;
};

export type SonorityPerception = {
  roughness: number;
  harmonicity: number;
  ambiguity: number;
  fusion: number;
  openness: number;
  brightness: number;
  motion: number;
  repose: number;
  tension: number;
  candidateFundamentalHz: number | null;
};

export type AffordanceKey = "repose" | "friction" | "openness" | "brightness";

export type SonorityAffordance = {
  key: AffordanceKey;
  label: string;
  value: number;
  direction: string;
  drivers: string;
};

function clamp01(value: number) {
  return Math.max(0, Math.min(1, value));
}

function weightedSpectralCentroid(components: SpectralComponent[]) {
  const tonal = components.filter((component) => component.kind === "partial");
  const total = tonal.reduce((sum, component) => sum + component.amplitude, 0);
  return total > 0
    ? tonal.reduce((sum, component) => sum + component.frequencyHz * component.amplitude, 0) / total
    : 0;
}

export function sonorityPerceptionModel(
  voices: SonorityVoice[],
  voiceLeadingCents = 0,
): SonorityPerception {
  if (voices.length === 0) {
    return {
      roughness: 0,
      harmonicity: 0,
      ambiguity: 1,
      fusion: 0,
      openness: 0,
      brightness: 0,
      motion: 0,
      repose: 0,
      tension: 0,
      candidateFundamentalHz: null,
    };
  }

  const spectra = voices.map((voice, source) =>
    harmonicSpectrum(voice.frequencyHz, source, {
      partialCount: voice.spectrum?.partialCount ?? voice.partialCount,
      rolloffDbPerOctave: voice.spectrum?.rolloffDbPerOctave ?? 7,
      inharmonicity: voice.spectrum?.inharmonicity ?? 0,
      noiseAmount: voice.spectrum?.noiseAmount ?? 0,
    }).map((component) => ({ ...component, amplitude: component.amplitude * voice.amplitude })),
  );
  const components = spectra.flat();
  const candidates = harmonicityCandidates(
    components,
    Math.max(20, Math.min(...voices.map((voice) => voice.frequencyHz)) / 12),
    Math.min(500, Math.max(...voices.map((voice) => voice.frequencyHz))),
  );
  const harmonicity = candidates[0]?.confidence ?? 0;
  const leadingCandidate = candidates[0];
  const competingCandidate = candidates.slice(1).find((candidate) => {
    if (!leadingCandidate) return true;
    const ratio = Math.max(candidate.fundamentalHz, leadingCandidate.fundamentalHz)
      / Math.min(candidate.fundamentalHz, leadingCandidate.fundamentalHz);
    const nearestHarmonic = Math.max(1, Math.round(ratio));
    return Math.abs(1200 * Math.log2(ratio / nearestHarmonic)) > 40;
  });
  const candidateGap = harmonicity - (competingCandidate?.confidence ?? 0);
  const ambiguity = clamp01(1 - candidateGap * 4);
  const roughness = aggregateRoughness(components);
  const pairOverlaps: number[] = [];
  for (let first = 0; first < spectra.length; first += 1) {
    for (let second = first + 1; second < spectra.length; second += 1) {
      pairOverlaps.push(spectralOverlap(spectra[first], spectra[second]));
    }
  }
  const overlap = pairOverlaps.length > 0
    ? pairOverlaps.reduce((sum, value) => sum + value, 0) / pairOverlaps.length
    : 0;
  const minimum = Math.min(...voices.map((voice) => voice.frequencyHz));
  const maximum = Math.max(...voices.map((voice) => voice.frequencyHz));
  const openness = clamp01(Math.log2(maximum / minimum) / 2.2);
  const brightness = clamp01((Math.log2(Math.max(80, weightedSpectralCentroid(components)) / 180) - 1) / 4.2);
  const motion = clamp01(voiceLeadingCents / 360);
  const fusion = clamp01(harmonicity * 0.5 + overlap * 0.27 + (1 - roughness) * 0.23);
  const repose = clamp01(harmonicity * 0.42 + (1 - roughness) * 0.33 + (1 - motion) * 0.25);
  const tension = clamp01(roughness * 0.42 + ambiguity * 0.24 + motion * 0.22 + brightness * 0.12);

  return {
    roughness,
    harmonicity,
    ambiguity,
    fusion,
    openness,
    brightness,
    motion,
    repose,
    tension,
    candidateFundamentalHz: candidates[0]?.fundamentalHz ?? null,
  };
}

export function sonorityAffordances(model: SonorityPerception): SonorityAffordance[] {
  return [
    {
      key: "repose",
      label: "Repose / groundedness",
      value: model.repose,
      direction: "may support rest or arrival",
      drivers: "periodic fit + low roughness + little recent motion",
    },
    {
      key: "friction",
      label: "Friction / activation",
      value: model.tension,
      direction: "may support urgency, bite, or instability",
      drivers: "roughness + competing centers + motion + brightness",
    },
    {
      key: "openness",
      label: "Openness / spaciousness",
      value: model.openness,
      direction: "may support breadth, distance, or exposure",
      drivers: "log-frequency span between outer voices",
    },
    {
      key: "brightness",
      label: "Brightness / lift",
      value: model.brightness,
      direction: "may support lightness, energy, or sharpness",
      drivers: "amplitude-weighted spectral height",
    },
  ];
}
