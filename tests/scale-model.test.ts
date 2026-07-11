import assert from "node:assert/strict";
import test from "node:test";
import { SCALE_PRESETS, degreeEvidence, rotateScale, scaleDegrees, scaleFingerprint } from "../lib/scale-model.ts";

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
  assert.deepEqual(fingerprint.map((segment) => segment.width), ["wide", "narrow", "narrow", "wide", "narrow"]);
});
