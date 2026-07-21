import assert from "node:assert/strict";
import test from "node:test";
import {
  vocalAccuracyReading,
  vocalClarityReading,
  vocalEarTrainingCue,
  vocalPitchLanePosition,
  vocalRecentPitchSpread,
  vocalStabilityLabel,
  type VocalPitchTrailSample,
} from "../lib/vocal-training-model.ts";

function trail(cents: number[]): VocalPitchTrailSample[] {
  return cents.map((targetCents, index) => ({ atMs: index * 160, targetMidi: 60, targetCents, clarity: 0.86 }));
}

test("maps lower, target, and higher pitch onto a bounded vertical lane", () => {
  assert.equal(vocalPitchLanePosition(100), 0);
  assert.equal(vocalPitchLanePosition(0), 0.5);
  assert.equal(vocalPitchLanePosition(-100), 1);
  assert.equal(vocalPitchLanePosition(400), 0);
  assert.equal(vocalPitchLanePosition(-400), 1);
});

test("keeps cent accuracy zones descriptive and anchored to key boundaries", () => {
  assert.deepEqual(vocalAccuracyReading(4.9), { band: "centered", label: "centered within 5¢" });
  assert.equal(vocalAccuracyReading(18).band, "fine");
  assert.equal(vocalAccuracyReading(-49).band, "neighborhood");
  assert.equal(vocalAccuracyReading(75).band, "between");
  assert.equal(vocalAccuracyReading(130).band, "outside");
});

test("separates periodic trace strength from recent pitch steadiness", () => {
  assert.equal(vocalClarityReading(0.94).band, "strong");
  assert.equal(vocalClarityReading(0.8).band, "clear");
  assert.equal(vocalClarityReading(0.66).band, "usable");
  assert.equal(vocalClarityReading(0.51).band, "fragile");
  assert.equal(vocalRecentPitchSpread(trail([1, 3, 2, 4, 2, 1])), 2.5);
  assert.equal(vocalRecentPitchSpread(trail([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 100])), 8);
  assert.equal(vocalStabilityLabel(3), "settled recent center");
  assert.equal(vocalStabilityLabel(18), "gently moving recent center");
  assert.equal(vocalStabilityLabel(42), "wandering recent center");
});

test("turns target distance into a direction-first ear-training cue", () => {
  assert.equal(vocalEarTrainingCue(-16, null), "Ease up 16¢.");
  assert.equal(vocalEarTrainingCue(38, null), "Glide down 38¢; slow near the center.");
  assert.equal(vocalEarTrainingCue(145, null), "Replay the target, then approach down by 1.4 st.");
  assert.equal(vocalEarTrainingCue(3, 28), "Keep the center; make the trail narrower.");
  assert.equal(vocalEarTrainingCue(3, 8), "Stay here; memorize this pitch center.");
});
