import assert from "node:assert/strict";
import test from "node:test";
import {
  RECORDED_AUDIO_PEAK_TARGET,
  RECORDED_AUDIO_RMS_TARGET,
  SYNTH_COHERENT_PEAK,
  SYNTH_MASTER_GAIN,
  SYNTH_USER_MAX_GAIN,
  equalPowerMixGains,
  loudnessControlGain,
  recordingPlaybackGain,
  rmsMatchedHarmonicCoefficients,
  samplePeak,
  sampleRms,
} from "../lib/audio-level.ts";

test("mix weights preserve one equal-power source budget", () => {
  const equal = equalPowerMixGains([1, 1, 1, 1]);
  assert.deepEqual(equal, [0.5, 0.5, 0.5, 0.5]);
  const weighted = equalPowerMixGains([1, 2, 1]);
  assert.ok(Math.abs(weighted[0] - 1 / Math.sqrt(6)) < 1e-12);
  assert.ok(Math.abs(weighted[1] - 2 / Math.sqrt(6)) < 1e-12);
  assert.ok(Math.abs(weighted.reduce((sum, gain) => sum + gain ** 2, 0) - 1) < 1e-12);
  assert.deepEqual(equalPowerMixGains([0, Number.NaN, -1]), [0, 0, 0]);
  assert.deepEqual(equalPowerMixGains([]), []);
  const bright = equalPowerMixGains(Array.from({ length: 28 }, () => 1));
  assert.ok(SYNTH_MASTER_GAIN * bright.reduce((sum, gain) => sum + gain, 0) <= SYNTH_COHERENT_PEAK + 1e-12);
});

test("harmonic timbres are RMS-matched to a sine before the master stage", () => {
  const coefficients = rmsMatchedHarmonicCoefficients(10, 1.2);
  const power = coefficients.reduce((sum, value) => sum + value ** 2, 0);
  assert.ok(Math.abs(power - 1) < 1e-6);
});

test("the shared loudness control never exceeds the synth ceiling", () => {
  assert.equal(loudnessControlGain(46), SYNTH_MASTER_GAIN);
  assert.ok(Math.abs(loudnessControlGain(100) - SYNTH_USER_MAX_GAIN) < 1e-12);
  assert.ok(Math.abs(loudnessControlGain(0) - 0.025) < 1e-12);
  assert.ok(loudnessControlGain(50) > loudnessControlGain(25));
});

test("recorded audio follows both RMS and peak ceilings without boosting", () => {
  assert.equal(recordingPlaybackGain(1, RECORDED_AUDIO_RMS_TARGET), RECORDED_AUDIO_PEAK_TARGET);
  assert.equal(recordingPlaybackGain(0.08, 0.02), 1);
  assert.equal(recordingPlaybackGain(0.5, 0.5), RECORDED_AUDIO_RMS_TARGET / 0.5);
  const channels = [new Float32Array([-0.2, 0.7]), new Float32Array([0.4])];
  assert.ok(Math.abs(samplePeak(channels) - 0.7) < 1e-6);
  assert.ok(Math.abs(sampleRms(channels) - Math.sqrt((0.04 + 0.49 + 0.16) / 3)) < 1e-6);
});
