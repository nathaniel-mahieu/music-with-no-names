export const VOCAL_SPECTRUM_MINIMUM_HZ = 50;
export const VOCAL_SPECTRUM_MAXIMUM_HZ = 3_000;

export type VocalTargetHarmonic = {
  harmonic: number;
  frequencyHz: number;
  position: number;
};

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(maximum, Math.max(minimum, value));
}

export function vocalSpectrumPosition(
  frequencyHzInput: number,
  minimumHz = VOCAL_SPECTRUM_MINIMUM_HZ,
  maximumHz = VOCAL_SPECTRUM_MAXIMUM_HZ,
) {
  const minimum = Math.max(1, Number.isFinite(minimumHz) ? minimumHz : VOCAL_SPECTRUM_MINIMUM_HZ);
  const maximum = Math.max(minimum + 1, Number.isFinite(maximumHz) ? maximumHz : VOCAL_SPECTRUM_MAXIMUM_HZ);
  const frequencyHz = clamp(Number.isFinite(frequencyHzInput) ? frequencyHzInput : minimum, minimum, maximum);
  return Math.log(frequencyHz / minimum) / Math.log(maximum / minimum);
}

export function vocalTargetHarmonics(
  fundamentalHzInput: number,
  minimumHz = VOCAL_SPECTRUM_MINIMUM_HZ,
  maximumHz = VOCAL_SPECTRUM_MAXIMUM_HZ,
) {
  if (!Number.isFinite(fundamentalHzInput) || fundamentalHzInput <= 0) return [];
  const minimum = Math.max(1, minimumHz);
  const maximum = Math.max(minimum + 1, maximumHz);
  const harmonics: VocalTargetHarmonic[] = [];
  for (let harmonic = 1; harmonic * fundamentalHzInput <= maximum; harmonic += 1) {
    const frequencyHz = harmonic * fundamentalHzInput;
    if (frequencyHz < minimum) continue;
    harmonics.push({
      harmonic,
      frequencyHz,
      position: vocalSpectrumPosition(frequencyHz, minimum, maximum),
    });
  }
  return harmonics;
}
