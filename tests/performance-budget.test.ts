import assert from "node:assert/strict";
import test from "node:test";
import { performance } from "node:perf_hooks";
import { analyzeMonoAudio } from "../lib/audio-analysis.ts";

test("two-minute analysis stays bounded in time, memory, and frame count", () => {
  const sampleRate = 12000;
  const durationSeconds = 120;
  const samples = new Float32Array(sampleRate * durationSeconds);
  for (let index = 0; index < samples.length; index += 1) {
    const time = index / sampleRate;
    const envelope = time % 0.5 < 0.11 ? 0.45 : 0.08;
    samples[index] = Math.sin(2 * Math.PI * 180 * time) * envelope;
  }
  const heapBefore = process.memoryUsage().heapUsed;
  const started = performance.now();
  const result = analyzeMonoAudio(samples, sampleRate, { maxFineFrames: 2400, createdAt: "2026-01-01T00:00:00.000Z" });
  const elapsed = performance.now() - started;
  const heapGrowth = process.memoryUsage().heapUsed - heapBefore;

  assert.ok(elapsed < 5000, `analysis took ${elapsed.toFixed(0)} ms`);
  assert.ok(heapGrowth < 256 * 1024 * 1024, `heap grew by ${(heapGrowth / 1024 / 1024).toFixed(1)} MB`);
  assert.ok(result.resolutions[0].frames.length <= 2400);
  assert.ok(result.resolutions[1].frames.length <= 1800);
  assert.ok(result.resolutions[2].frames.length <= 900);
});
