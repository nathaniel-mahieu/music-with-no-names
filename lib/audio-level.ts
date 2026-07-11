// One conservative output budget shared by every synthesized lab. Individual
// voices are mixed by equal power before they reach this gain stage.
export const SYNTH_MASTER_GAIN = 0.065;
export const SYNTH_USER_MAX_GAIN = 0.085;
export const SYNTH_COHERENT_PEAK = 0.24;
export const SYNTH_COMPRESSOR_THRESHOLD_DB = -12.5;
export const RECORDED_AUDIO_RMS_TARGET = 0.045;
export const RECORDED_AUDIO_PEAK_TARGET = 0.2;

export function configureSafetyCompressor(compressor: DynamicsCompressorNode, now: number) {
  compressor.threshold.setValueAtTime(SYNTH_COMPRESSOR_THRESHOLD_DB, now);
  compressor.knee.setValueAtTime(18, now);
  compressor.ratio.setValueAtTime(8, now);
  compressor.attack.setValueAtTime(0.003, now);
  compressor.release.setValueAtTime(0.15, now);
}

function clamp(value: number, minimum: number, maximum: number) {
  return Math.max(minimum, Math.min(maximum, value));
}

export function equalPowerMixGains(weights: number[]) {
  if (weights.length === 0) return [];
  const safe = weights.map((weight) => Number.isFinite(weight) ? Math.max(0, weight) : 0);
  const power = Math.sqrt(safe.reduce((sum, weight) => sum + weight ** 2, 0));
  if (power <= 0) return safe.map(() => 0);
  const equalPower = safe.map((weight) => weight / power);
  const coherentPeak = SYNTH_MASTER_GAIN * equalPower.reduce((sum, gain) => sum + gain, 0);
  const trim = coherentPeak > 0 ? Math.min(1, SYNTH_COHERENT_PEAK / coherentPeak) : 1;
  return equalPower.map((gain) => gain * trim);
}

export function rmsMatchedHarmonicCoefficients(partialCount: number, rolloffExponent: number) {
  const count = Math.max(1, Math.floor(partialCount));
  const coefficients = new Float32Array(count + 1);
  let power = 0;
  for (let partial = 1; partial <= count; partial += 1) {
    const amplitude = 1 / partial ** rolloffExponent;
    coefficients[partial] = amplitude;
    power += amplitude ** 2;
  }
  const normalization = Math.sqrt(power);
  for (let partial = 1; partial <= count; partial += 1) coefficients[partial] /= normalization;
  return coefficients;
}

export function loudnessControlGain(percent: number) {
  const position = clamp(Number.isFinite(percent) ? percent : 0, 0, 100);
  if (position === 46) return SYNTH_MASTER_GAIN;
  if (position < 46) return SYNTH_MASTER_GAIN * (0.025 / SYNTH_MASTER_GAIN) ** ((46 - position) / 46);
  return SYNTH_MASTER_GAIN * (SYNTH_USER_MAX_GAIN / SYNTH_MASTER_GAIN) ** ((position - 46) / 54);
}

export function recordingPlaybackGain(peak: number, rms: number) {
  const peakGain = Number.isFinite(peak) && peak > 0 ? RECORDED_AUDIO_PEAK_TARGET / peak : 1;
  const rmsGain = Number.isFinite(rms) && rms > 0 ? RECORDED_AUDIO_RMS_TARGET / rms : 1;
  return clamp(Math.min(peakGain, rmsGain), 0.05, 1);
}

export function samplePeak(channels: Float32Array[]) {
  let peak = 0;
  for (const channel of channels) {
    for (let index = 0; index < channel.length; index += 1) {
      peak = Math.max(peak, Math.abs(channel[index]));
    }
  }
  return peak;
}

export function sampleRms(channels: Float32Array[]) {
  let sumOfSquares = 0;
  let sampleCount = 0;
  for (const channel of channels) {
    for (let index = 0; index < channel.length; index += 1) {
      sumOfSquares += channel[index] ** 2;
      sampleCount += 1;
    }
  }
  return sampleCount > 0 ? Math.sqrt(sumOfSquares / sampleCount) : 0;
}
