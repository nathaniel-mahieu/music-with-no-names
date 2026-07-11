import assert from "node:assert/strict";
import test from "node:test";
import { analyzeMonoAudio, isRecordingAnalysis } from "../lib/audio-analysis.ts";

function sine(frequency: number, seconds: number, sampleRate = 12000) {
  return Float32Array.from({ length: Math.round(seconds * sampleRate) }, (_, index) => Math.sin((2 * Math.PI * frequency * index) / sampleRate) * 0.4);
}

test("creates versioned multi-resolution analysis without embedding audio", () => {
  const result = analyzeMonoAudio(sine(220, 2), 12000, { filename: "fixture.wav", createdAt: "2026-01-01T00:00:00.000Z" });
  assert.equal(result.source.filename, "fixture.wav");
  assert.equal(result.source.audioIncluded, false);
  assert.equal(result.resolutions.length, 3);
  assert.ok(result.resolutions.every((resolution) => resolution.frames.length > 0));
  assert.equal(isRecordingAnalysis(result), true);
  assert.ok(result.resolutions[0].frames.every((frame) => frame.roughness >= 0 && frame.harmonicity >= 0 && frame.pitchSalience >= 0));
  assert.ok(result.resolutions[0].frames.every((frame) => Object.values(frame.featureConfidence).every((value) => value >= 0 && value <= 1)));
});

test("preserves continuous frequency evidence for a simple tone", () => {
  const result = analyzeMonoAudio(sine(237, 1), 12000);
  const estimate = result.resolutions[0].frames[2].zeroCrossingHz;
  assert.ok(estimate !== null && Math.abs(estimate - 237) < 6);
});

test("finds onset evidence in a pulsed signal", () => {
  const sampleRate = 12000;
  const samples = new Float32Array(sampleRate * 3);
  for (let pulse = 0; pulse < 6; pulse += 1) {
    const start = Math.round(pulse * 0.5 * sampleRate);
    for (let index = start; index < Math.min(samples.length, start + 300); index += 1) samples[index] = Math.sin((2 * Math.PI * 180 * index) / sampleRate) * 0.8;
  }
  const result = analyzeMonoAudio(samples, sampleRate);
  assert.ok(result.resolutions[1].frames.some((frame) => frame.onsetStrength > 0.5));
  assert.ok(result.pulseCandidates.length > 0);
  assert.ok(result.structural.onsetPhases.length > 0);
  assert.ok(result.structural.syncopation >= 0 && result.structural.syncopation <= 1);
});

test("rejects malformed imported profiles", () => {
  assert.equal(isRecordingAnalysis({ schema: "unknown" }), false);
});
