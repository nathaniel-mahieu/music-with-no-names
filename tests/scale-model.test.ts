import assert from "node:assert/strict";
import test from "node:test";
import { SCALE_HEARING_PATHS, SCALE_PRESETS, degreeEvidence, intervalStepRecipe, rotateScale, scaleDegrees, scaleFingerprint, stepFrequencyRatio } from "../lib/scale-model.ts";

test("every preset closes exactly at one octave", () => {
  for (const preset of SCALE_PRESETS) {
    const degrees = scaleDegrees(preset.steps, preset.syllables);
    const finalRatio = degrees.at(-1)!.ratio * 2 ** (preset.steps.at(-1)! / preset.steps.reduce((sum, step) => sum + step, 0));
    assert.ok(Math.abs(finalRatio - 2) < 1e-12);
  }
});

test("rotation preserves the cyclic step inventory", () => {
  const steps = [3, 2, 2, 3, 2];
  assert.deepEqual(rotateScale(steps, 2), [2, 3, 2, 3, 2]);
  assert.deepEqual([...rotateScale(steps, 2)].sort(), [...steps].sort());
});

test("degree relationships transpose while absolute frequency changes", () => {
  const degree = scaleDegrees([2, 2, 1, 2, 2, 2, 1], ["Do", "Re", "Mi", "Fa", "Sol", "La", "Ti"])[4];
  const low = degreeEvidence(180, degree);
  const high = degreeEvidence(360, degree);
  assert.equal(low.targetHz * 2, high.targetHz);
  assert.equal(low.approximation.numerator, high.approximation.numerator);
  assert.equal(low.approximation.denominator, high.approximation.denominator);
});

test("fingerprint width is proportional to octave share", () => {
  const fingerprint = scaleFingerprint([3, 2, 2, 3, 2]);
  assert.ok(Math.abs(fingerprint.reduce((sum, segment) => sum + segment.share, 0) - 1) < 1e-12);
  assert.deepEqual(fingerprint.map((segment) => segment.width), ["open", "middle", "middle", "open", "middle"]);
});

test("the five-step solfege overlay matches its home-relative offsets", () => {
  const preset = SCALE_PRESETS.find((item) => item.id === "five")!;
  const degrees = scaleDegrees(preset.steps, preset.syllables);
  assert.deepEqual(degrees.map((degree) => degree.cents), [0, 300, 500, 700, 1000]);
  assert.deepEqual(degrees.map((degree) => degree.syllable), ["Do", "Me", "Fa", "Sol", "Te"]);
});

test("step ratios and interval recipes expose physical gap accumulation", () => {
  assert.ok(Math.abs(stepFrequencyRatio(12) - 2) < 1e-12);
  assert.ok(Math.abs(stepFrequencyRatio(2) - 2 ** (2 / 12)) < 1e-12);
  assert.deepEqual(intervalStepRecipe([2, 2, 1, 2, 2, 2, 1], 4).map((segment) => segment.width), ["middle", "middle", "close", "middle"]);
});

test("the same physical gap keeps the same label across scales", () => {
  const seven = scaleFingerprint([2, 2, 1, 2, 2, 2, 1]);
  const five = scaleFingerprint([3, 2, 2, 3, 2]);
  assert.equal(seven[0].width, "middle");
  assert.equal(five[1].width, "middle");
});

test("inner-hearing challenges are scale-specific and valid without modulo wrapping", () => {
  for (const preset of SCALE_PRESETS) {
    const challenges = SCALE_HEARING_PATHS[preset.id];
    assert.ok(challenges.length >= 3);
    assert.ok(new Set(challenges.map((challenge) => challenge.missingPosition)).size > 1);
    for (const challenge of challenges) {
      assert.ok(challenge.missingPosition > 0 && challenge.missingPosition < challenge.path.length - 1);
      assert.ok(challenge.path.every((index) => Number.isInteger(index) && index >= 0 && index < preset.steps.length));
      const missingDegree = challenge.path[challenge.missingPosition];
      assert.notEqual(missingDegree, challenge.path[challenge.missingPosition - 1]);
      assert.notEqual(missingDegree, challenge.path[challenge.missingPosition + 1]);
    }
  }
});
