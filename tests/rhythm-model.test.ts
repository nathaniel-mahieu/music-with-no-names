import assert from "node:assert/strict";
import test from "node:test";
import { estimateTapTempo, nestedCyclePhases, pulseHypotheses, syncopationIndex } from "../lib/rhythm-model.ts";

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
