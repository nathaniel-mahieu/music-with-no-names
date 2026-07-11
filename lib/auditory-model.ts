export type SpectralComponent = {
  frequencyHz: number;
  amplitude: number;
  kind: "partial" | "noise";
  source: number;
  partialIndex: number | null;
};

export type SpectrumOptions = {
  partialCount: number;
  rolloffDbPerOctave: number;
  inharmonicity: number;
  noiseAmount: number;
};

export type HarmonicityCandidate = {
  fundamentalHz: number;
  confidence: number;
};

export const AUDITORY_BAND_CENTERS_HZ = [80, 125, 200, 315, 500, 800, 1250, 2000, 3150, 5000, 8000, 12500];

function clamp01(value: number) {
  return Math.max(0, Math.min(1, value));
}

export function harmonicSpectrum(
  fundamentalHz: number,
  source: number,
  options: SpectrumOptions,
): SpectralComponent[] {
  if (!Number.isFinite(fundamentalHz) || fundamentalHz <= 0) throw new RangeError("Fundamental frequency must be positive.");
  const partialCount = Math.max(1, Math.min(32, Math.round(options.partialCount)));
  const components: SpectralComponent[] = [];
  for (let index = 1; index <= partialCount; index += 1) {
    const octave = Math.log2(index);
    const amplitude = 10 ** (-(options.rolloffDbPerOctave * octave) / 20);
    const stretchedIndex = index * Math.sqrt(1 + Math.max(0, options.inharmonicity) * index ** 2);
    components.push({
      frequencyHz: fundamentalHz * stretchedIndex,
      amplitude,
      kind: "partial",
      source,
      partialIndex: index,
    });
  }
  const noiseAmount = clamp01(options.noiseAmount);
  if (noiseAmount > 0) {
    [0.72, 1.12, 1.68, 2.45, 3.6, 5.2, 7.4].forEach((multiple, index) => {
      components.push({ frequencyHz: fundamentalHz * multiple, amplitude: noiseAmount * (0.5 + index * 0.04), kind: "noise", source, partialIndex: null });
    });
  }
  return components.filter((component) => component.frequencyHz <= 18000);
}

export function criticalBandRate(frequencyHz: number) {
  return 13 * Math.atan(0.00076 * frequencyHz) + 3.5 * Math.atan((frequencyHz / 7500) ** 2);
}

export function pairRoughness(first: SpectralComponent, second: SpectralComponent) {
  if (first.frequencyHz === second.frequencyHz) return 0;
  const minimumFrequency = Math.min(first.frequencyHz, second.frequencyHz);
  const scale = 0.24 / (0.021 * minimumFrequency + 19);
  const distance = Math.abs(second.frequencyHz - first.frequencyHz);
  const shape = Math.exp(-3.5 * scale * distance) - Math.exp(-5.75 * scale * distance);
  return Math.max(0, first.amplitude * second.amplitude * shape);
}

export function aggregateRoughness(components: SpectralComponent[]) {
  let roughness = 0;
  let normalization = 0;
  for (let first = 0; first < components.length; first += 1) {
    for (let second = first + 1; second < components.length; second += 1) {
      if (components[first].source === components[second].source) continue;
      roughness += pairRoughness(components[first], components[second]);
      normalization += components[first].amplitude * components[second].amplitude;
    }
  }
  return normalization > 0 ? clamp01((roughness / normalization) * 11) : 0;
}

export function auditoryBandEnergy(components: SpectralComponent[]) {
  return AUDITORY_BAND_CENTERS_HZ.map((center) => {
    const centerRate = criticalBandRate(center);
    return components.reduce((sum, component) => {
      const distance = criticalBandRate(component.frequencyHz) - centerRate;
      return sum + component.amplitude ** 2 * Math.exp(-0.5 * (distance / 0.72) ** 2);
    }, 0);
  });
}

export function harmonicityCandidates(components: SpectralComponent[], minimumHz = 30, maximumHz = 500) {
  const tonal = components.filter((component) => component.kind === "partial" && component.amplitude > 0.015);
  if (tonal.length === 0) return [];
  const candidates: HarmonicityCandidate[] = [];
  for (let fundamental = minimumHz; fundamental <= maximumHz; fundamental *= 1.012) {
    let weightedFit = 0;
    let totalWeight = 0;
    for (const component of tonal) {
      const nearest = Math.max(1, Math.round(component.frequencyHz / fundamental));
      const predicted = nearest * fundamental;
      const centsError = Math.abs(1200 * Math.log2(component.frequencyHz / predicted));
      weightedFit += component.amplitude * Math.exp(-0.5 * (centsError / 22) ** 2);
      totalWeight += component.amplitude;
    }
    candidates.push({ fundamentalHz: fundamental, confidence: totalWeight > 0 ? weightedFit / totalWeight : 0 });
  }
  return candidates
    .sort((a, b) => b.confidence - a.confidence)
    .filter((candidate, index, all) => all.slice(0, index).every((other) => Math.abs(1200 * Math.log2(other.fundamentalHz / candidate.fundamentalHz)) > 80))
    .slice(0, 4)
    .map((candidate) => ({ fundamentalHz: Math.round(candidate.fundamentalHz * 10) / 10, confidence: clamp01(candidate.confidence) }));
}

export function spectralOverlap(first: SpectralComponent[], second: SpectralComponent[], toleranceCents = 18) {
  let overlap = 0;
  let possible = 0;
  for (const a of first.filter((component) => component.kind === "partial")) {
    possible += a.amplitude;
    const match = second
      .filter((component) => component.kind === "partial")
      .find((b) => Math.abs(1200 * Math.log2(a.frequencyHz / b.frequencyHz)) <= toleranceCents);
    if (match) overlap += Math.min(a.amplitude, match.amplitude);
  }
  return possible > 0 ? clamp01(overlap / possible) : 0;
}
