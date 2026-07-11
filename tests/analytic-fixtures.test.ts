import assert from "node:assert/strict";
import test from "node:test";
import { analyzeMonoAudio } from "../lib/audio-analysis.ts";
import { commonPeriodSeconds, harmonicPartials, normalizedWaveSum, sineSample } from "../lib/music-math.ts";
import { estimateTapTempo, nestedCyclePhases } from "../lib/rhythm-model.ts";

test("waveform samples match closed-form sine values", () => {
  assert.ok(Math.abs(sineSample(1, 0.25) - 1) < 1e-12);
  assert.ok(Math.abs(sineSample(1, 0.5)) < 1e-12);
  assert.ok(Math.abs(normalizedWaveSum([1, 3], 0.25)) < 1e-12);
});

test("ratio repetition and harmonic spectrum match analytic fixtures", () => {
  assert.equal(commonPeriodSeconds(100, 5 / 4), 0.04);
  const eighth = harmonicPartials(125, 8, 1)[7];
  assert.deepEqual(eighth, { index: 8, frequencyHz: 1000, amplitude: 0.125 });
});

test("periodicity proxy identifies a known 200 Hz realization", () => {
  const sampleRate = 12000;
  const samples = Float32Array.from({ length: sampleRate }, (_, index) => sineSample(200, index / sampleRate) * 0.5);
  const frame = analyzeMonoAudio(samples, sampleRate).resolutions[1].frames[2];
  assert.ok(frame.zeroCrossingHz !== null && Math.abs(frame.zeroCrossingHz - 200) < 4);
  assert.ok(frame.periodicityConfidence > 0.8);
});

test("timing fixtures preserve tempo and nested phase", () => {
  const taps = estimateTapTempo([0, 500, 1000, 1500, 2000]);
  assert.equal(taps?.pulsesPerMinute, 120);
  assert.deepEqual(nestedCyclePhases(3, 12), [
    { divisions: 2, phase: 0.5 },
    { divisions: 3, phase: 0.75 },
    { divisions: 4, phase: 0 },
  ]);
});
