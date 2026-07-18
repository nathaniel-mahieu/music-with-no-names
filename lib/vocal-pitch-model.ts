export type VocalPitchDetection = {
  frequencyHz: number;
  rms: number;
  clarity: number;
  periodSamples: number;
};

export type VocalPitchMatch = {
  detectedFrequencyHz: number;
  detectedMidi: number;
  nearestMidi: number;
  nearestReferenceHz: number;
  nearestCents: number;
  targetMidi: number;
  targetReferenceHz: number;
  targetSemitones: number;
  targetCents: number;
  nearestTargetStep: number;
  targetFineCents: number;
  frequencyDifferenceHz: number;
};

export const VOCAL_INTERVAL_NAMES = [
  "unison",
  "nearest-key step",
  "whole step",
  "minor third",
  "major third",
  "fourth",
  "half-octave",
  "fifth",
  "minor sixth",
  "major sixth",
  "minor seventh",
  "major seventh",
  "octave",
] as const;

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(maximum, Math.max(minimum, value));
}

export function vocalReferenceFrequency(midiInput: number) {
  const midi = Number.isFinite(midiInput) ? midiInput : 69;
  return 440 * 2 ** ((midi - 69) / 12);
}

export function vocalIntervalLabel(semitonesInput: number) {
  const semitones = Number.isFinite(semitonesInput) ? Math.round(semitonesInput) : 0;
  const distance = Math.abs(semitones);
  const direction = semitones > 0 ? "up" : semitones < 0 ? "down" : "match";
  const octaveCount = Math.floor(distance / 12);
  const remainder = distance % 12;
  const name = distance <= 12
    ? VOCAL_INTERVAL_NAMES[distance]
    : remainder === 0
      ? `${octaveCount} octaves`
      : `${octaveCount} octave${octaveCount === 1 ? "" : "s"} + ${VOCAL_INTERVAL_NAMES[remainder]}`;
  return semitones === 0 ? `0 st · ${name}` : `${semitones > 0 ? "+" : "−"}${distance} st · ${direction} ${name}`;
}

/**
 * Estimates one periodic fundamental with the YIN cumulative-mean normalized
 * difference method. This is deliberately monophonic and returns null for a
 * weak or insufficiently periodic window rather than inventing a pitch.
 */
export function detectVocalFundamental(
  samplesInput: Float32Array,
  sampleRateInput: number,
  options: { minimumHz?: number; maximumHz?: number; minimumRms?: number; threshold?: number } = {},
): VocalPitchDetection | null {
  const sampleRate = Number.isFinite(sampleRateInput) ? clamp(sampleRateInput, 8_000, 192_000) : 48_000;
  const minimumHz = clamp(options.minimumHz ?? 65, 40, 600);
  const maximumHz = clamp(options.maximumHz ?? 1_000, minimumHz + 1, 2_400);
  const minimumRms = clamp(options.minimumRms ?? 0.008, 0.0001, 1);
  const threshold = clamp(options.threshold ?? 0.13, 0.02, 0.5);
  if (!(samplesInput instanceof Float32Array) || samplesInput.length < 256) return null;

  const samples = samplesInput;
  let mean = 0;
  for (let index = 0; index < samples.length; index += 1) mean += Number.isFinite(samples[index]) ? samples[index] : 0;
  mean /= samples.length;
  let squareSum = 0;
  for (let index = 0; index < samples.length; index += 1) {
    const centered = (Number.isFinite(samples[index]) ? samples[index] : 0) - mean;
    squareSum += centered * centered;
  }
  const rms = Math.sqrt(squareSum / samples.length);
  if (!Number.isFinite(rms) || rms < minimumRms) return null;

  const minimumLag = Math.max(2, Math.floor(sampleRate / maximumHz));
  const maximumLag = Math.min(Math.floor(sampleRate / minimumHz), Math.floor(samples.length / 2) - 1);
  if (maximumLag <= minimumLag + 2) return null;
  const comparisonLength = samples.length - maximumLag;
  const difference = new Float64Array(maximumLag + 1);
  const normalized = new Float64Array(maximumLag + 1);
  normalized[0] = 1;
  let runningDifference = 0;
  for (let lag = 1; lag <= maximumLag; lag += 1) {
    let sum = 0;
    for (let index = 0; index < comparisonLength; index += 1) {
      const delta = (samples[index] - mean) - (samples[index + lag] - mean);
      sum += delta * delta;
    }
    difference[lag] = sum;
    runningDifference += sum;
    normalized[lag] = runningDifference > 0 ? sum * lag / runningDifference : 1;
  }

  let selectedLag = -1;
  for (let lag = minimumLag; lag < maximumLag; lag += 1) {
    if (normalized[lag] >= threshold) continue;
    while (lag + 1 <= maximumLag && normalized[lag + 1] < normalized[lag]) lag += 1;
    selectedLag = lag;
    break;
  }
  if (selectedLag < 0) {
    let bestValue = Number.POSITIVE_INFINITY;
    for (let lag = minimumLag; lag <= maximumLag; lag += 1) {
      if (normalized[lag] < bestValue) {
        bestValue = normalized[lag];
        selectedLag = lag;
      }
    }
    if (selectedLag < 0 || bestValue > 0.34) return null;
  }

  const before = normalized[Math.max(minimumLag, selectedLag - 1)];
  const center = normalized[selectedLag];
  const after = normalized[Math.min(maximumLag, selectedLag + 1)];
  const denominator = before - 2 * center + after;
  const correction = Math.abs(denominator) > 1e-12 ? clamp(0.5 * (before - after) / denominator, -1, 1) : 0;
  const periodSamples = selectedLag + correction;
  const frequencyHz = sampleRate / periodSamples;
  const clarity = clamp(1 - center, 0, 1);
  if (!Number.isFinite(frequencyHz) || frequencyHz < minimumHz || frequencyHz > maximumHz || clarity < 0.55) return null;
  return { frequencyHz, rms, clarity, periodSamples };
}

export function matchVocalPitch(frequencyHzInput: number, targetMidiInput: number): VocalPitchMatch | null {
  if (!Number.isFinite(frequencyHzInput) || frequencyHzInput <= 0) return null;
  const detectedFrequencyHz = frequencyHzInput;
  const detectedMidi = 69 + 12 * Math.log2(detectedFrequencyHz / 440);
  const nearestMidi = Math.round(detectedMidi);
  const nearestReferenceHz = vocalReferenceFrequency(nearestMidi);
  const nearestCents = (detectedMidi - nearestMidi) * 100;
  const targetMidi = Number.isFinite(targetMidiInput) ? Math.round(targetMidiInput) : 69;
  const targetReferenceHz = vocalReferenceFrequency(targetMidi);
  const targetSemitones = 12 * Math.log2(detectedFrequencyHz / targetReferenceHz);
  const nearestTargetStep = Math.round(targetSemitones);
  const targetFineCents = (targetSemitones - nearestTargetStep) * 100;
  return {
    detectedFrequencyHz,
    detectedMidi,
    nearestMidi,
    nearestReferenceHz,
    nearestCents,
    targetMidi,
    targetReferenceHz,
    targetSemitones,
    targetCents: targetSemitones * 100,
    nearestTargetStep,
    targetFineCents,
    frequencyDifferenceHz: detectedFrequencyHz - targetReferenceHz,
  };
}
