import assert from "node:assert/strict";
import test from "node:test";
import { estimateTapTempo, livePulseMirror, nestedCyclePhases, pulseHypotheses, syncopationIndex } from "../lib/rhythm-model.ts";

function pattern(active: number[]) {
  return Array.from({ length: 12 }, (_, index) => active.includes(index));
}

test("ranks a four-part pulse hypothesis for four equal onsets", () => {
  const hypotheses = pulseHypotheses(pattern([0, 3, 6, 9]));
  assert.equal(hypotheses[0].pulsesPerCycle, 4);
  assert.equal(hypotheses[0].confidence, 1);
});

test("distinguishes weak-position syncopation from an anchored pattern", () => {
  assert.ok(syncopationIndex(pattern([0, 2, 5, 7, 10])) > syncopationIndex(pattern([0, 3, 6, 9])));
});

test("expresses one step in several nested phases", () => {
  assert.deepEqual(nestedCyclePhases(3, 12), [
    { divisions: 2, phase: 0.5 },
    { divisions: 3, phase: 0.75 },
    { divisions: 4, phase: 0 },
  ]);
});

test("estimates embodied pulse from consistent taps", () => {
  const result = estimateTapTempo([0, 500, 1000, 1500, 2000]);
  assert.ok(result && Math.abs(result.pulsesPerMinute - 120) < 0.01);
  assert.equal(result?.consistency, 1);
});

test("captures one repeated key as a declared pulse and ignores other capture notes", () => {
  const mirror = livePulseMirror([
    { id: 1, note: 60, onsetMs: 1_000 },
    { id: 2, note: 64, onsetMs: 1_200 },
    { id: 3, note: 60, onsetMs: 1_500 },
    { id: 4, note: 60, onsetMs: 2_000 },
    { id: 5, note: 60, onsetMs: 2_500 },
  ]);
  assert.equal(mirror.status, "tracking");
  assert.equal(mirror.tapNote, 60);
  assert.equal(mirror.ignoredDuringCapture, 1);
  assert.equal(mirror.pulseMs, 500);
  assert.equal(mirror.pulsesPerMinute, 120);
  assert.equal(mirror.tapSpreadMs, 0);
});

test("clusters chord attacks before mapping pulse phase and gap ratios", () => {
  const mirror = livePulseMirror([
    { id: 1, note: 60, onsetMs: 0 },
    { id: 2, note: 60, onsetMs: 500 },
    { id: 3, note: 60, onsetMs: 1_000 },
    { id: 4, note: 60, onsetMs: 1_500 },
    { id: 5, note: 64, onsetMs: 2_000 },
    { id: 6, note: 67, onsetMs: 2_040 },
    { id: 7, note: 69, onsetMs: 2_250 },
    { id: 8, note: 71, onsetMs: 2_500 },
  ]);
  assert.equal(mirror.placements.length, 3);
  assert.deepEqual(mirror.placements[0].eventIds, [5, 6]);
  assert.equal(mirror.placements[0].attackCount, 2);
  assert.equal(mirror.placements[0].phaseLabel, "pulse line");
  assert.equal(mirror.placements[1].phaseLabel, "halfway");
  assert.deepEqual(mirror.gaps.map((gap) => gap.ratioLabel), ["1:2", "1:2"]);
});

test("refuses implausibly fast or slow four-tap anchors", () => {
  const fast = livePulseMirror([0, 100, 200, 300].map((onsetMs, index) => ({ id: index + 1, note: 60, onsetMs })));
  const slow = livePulseMirror([0, 2_100, 4_200, 6_300].map((onsetMs, index) => ({ id: index + 1, note: 60, onsetMs })));
  assert.equal(fast.status, "invalid");
  assert.match(fast.invalidReason ?? "", /shorter than 180/);
  assert.equal(slow.status, "invalid");
  assert.match(slow.invalidReason ?? "", /longer than 2 seconds/);
});
