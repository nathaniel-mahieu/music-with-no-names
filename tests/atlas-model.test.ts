import assert from "node:assert/strict";
import test from "node:test";
import { densityRegion, livePhraseLandmarkProfile, meanValue, valueSpread } from "../lib/atlas-model.ts";

test("computes a corpus center and porous minimum region", () => {
  assert.deepEqual(densityRegion([{ xValue: 20, yValue: 40 }]), { centerX: 20, centerY: 40, width: 20, height: 20, count: 1 });
});

test("region width grows with declared corpus spread", () => {
  const compact = densityRegion([{ xValue: 40, yValue: 40 }, { xValue: 42, yValue: 42 }]);
  const broad = densityRegion([{ xValue: 10, yValue: 10 }, { xValue: 90, yValue: 90 }]);
  assert.ok(broad.width > compact.width);
  assert.ok(broad.height > compact.height);
  assert.equal(broad.centerX, 50);
});

test("mean and spread stay analytically inspectable", () => {
  assert.equal(meanValue([10, 20, 30]), 20);
  assert.ok(Math.abs(valueSpread([10, 20, 30]) - Math.sqrt(200 / 3)) < 1e-12);
});

const phrase = (notes: number[], gaps: number[]) => {
  let onsetMs = 0;
  return notes.map((note, index) => {
    if (index > 0) onsetMs += gaps[index - 1];
    return { id: index + 1, note, onsetMs, velocity: 88, releaseMs: onsetMs + 120 };
  });
};

test("repeated relative shapes project as more repetitive and less locally surprising", () => {
  const repeated = livePhraseLandmarkProfile(phrase([60, 62, 64, 60, 62, 64, 60, 62, 64], Array(8).fill(250)))!;
  const changing = livePhraseLandmarkProfile(phrase([60, 62, 64, 60, 62, 61, 63, 65, 60], Array(8).fill(250)))!;
  assert.ok(repeated.repetition > changing.repetition);
  assert.ok(repeated.surprise! < changing.surprise!);
  assert.ok(repeated.surpriseEvidenceCount > 0);
});

test("pitch relationship measures are invariant under transposition", () => {
  const source = phrase([60, 62, 64, 60, 62, 64, 60], [240, 260, 250, 240, 260, 250]);
  const transposed = source.map((event) => ({ ...event, note: event.note + 5 }));
  const first = livePhraseLandmarkProfile(source)!;
  const second = livePhraseLandmarkProfile(transposed)!;
  assert.equal(first.repetition, second.repetition);
  assert.equal(first.surprise, second.surprise);
});

test("timing activity responds to tempo while relationship measures stay fixed", () => {
  const fast = livePhraseLandmarkProfile(phrase([60, 62, 64, 65, 67, 69], Array(5).fill(180)))!;
  const slow = livePhraseLandmarkProfile(phrase([60, 62, 64, 65, 67, 69], Array(5).fill(600)))!;
  assert.equal(fast.timingRegularity, 100);
  assert.ok(fast.timingActivity! > slow.timingActivity!);
  assert.equal(fast.repetition, slow.repetition);
  assert.equal(fast.surprise, slow.surprise);
});

test("short phrases and simultaneous attacks do not manufacture evidence", () => {
  assert.equal(livePhraseLandmarkProfile(phrase([60, 62, 64], [200, 200])), null);
  const chord = livePhraseLandmarkProfile(phrase([60, 64, 67, 72], [0, 0, 0]))!;
  assert.equal(chord.timingActivity, null);
  assert.equal(chord.timingRegularity, null);
});
