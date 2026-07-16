import assert from "node:assert/strict";
import test from "node:test";
import { SCALE_HEARING_PATHS, SCALE_PRESETS, degreeEvidence, intervalStepRecipe, rotateScale, scaleDegreeFields, scaleDegrees, scaleFingerprint, stepFrequencyRatio } from "../lib/scale-model.ts";

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
  assert.deepEqual(fingerprint.map((segment) => segment.width), ["large", "medium", "medium", "large", "medium"]);
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
  assert.deepEqual(intervalStepRecipe([2, 2, 1, 2, 2, 2, 1], 4).map((segment) => segment.width), ["medium", "medium", "small", "medium"]);
});

test("the same physical gap keeps the same label across scales", () => {
  const seven = scaleFingerprint([2, 2, 1, 2, 2, 2, 1]);
  const five = scaleFingerprint([3, 2, 2, 3, 2]);
  assert.equal(seven[0].width, "medium");
  assert.equal(five[1].width, "medium");
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

test("alternate degrees produce the familiar major-scale triad field", () => {
  const preset = SCALE_PRESETS.find((item) => item.id === "seven")!;
  const fields = scaleDegreeFields(preset.steps, preset.syllables);
  assert.deepEqual(fields.map((field) => field.semitoneShape), [
    [0, 4, 7],
    [0, 3, 7],
    [0, 3, 7],
    [0, 4, 7],
    [0, 4, 7],
    [0, 3, 7],
    [0, 3, 6],
  ]);
  assert.deepEqual(fields.map((field) => field.triadReading?.quality), ["major", "minor", "minor", "major", "major", "minor", "diminished"]);
  assert.ok(fields.every((field) => field.triadReading?.inversion === "root position"));
});

test("minor pentatonic fields expose fourth-stacks and inverted familiar triads", () => {
  const preset = SCALE_PRESETS.find((item) => item.id === "five")!;
  const fields = scaleDegreeFields(preset.steps, preset.syllables);
  assert.deepEqual(fields.map((field) => field.semitoneShape), [
    [0, 5, 10],
    [0, 4, 9],
    [0, 5, 10],
    [0, 5, 10],
    [0, 5, 9],
  ]);
  assert.deepEqual(fields.map((field) => field.shape.id), ["even-fourths", "third-then-fourth", "even-fourths", "even-fourths", "fourth-then-third"]);
  assert.equal(fields[1].triadReading?.quality, "minor");
  assert.equal(fields[1].triadReading?.rootSyllable, "Do");
  assert.equal(fields[1].triadReading?.inversion, "first inversion");
  assert.equal(fields[4].triadReading?.quality, "major");
  assert.equal(fields[4].triadReading?.rootSyllable, "Me");
  assert.equal(fields[4].triadReading?.inversion, "second inversion");
  assert.equal(fields[0].triadReading, null);
});

test("whole-tone alternate-degree stacks repeat one symmetric augmented geometry", () => {
  const preset = SCALE_PRESETS.find((item) => item.id === "whole")!;
  const fields = scaleDegreeFields(preset.steps, preset.syllables);
  assert.equal(fields.length, 6);
  assert.ok(fields.every((field) => field.semitoneShape.join("-") === "0-4-8"));
  assert.ok(fields.every((field) => field.shape.id === "augmented-thirds"));
  assert.ok(fields.every((field) => field.triadReading?.inversion === "symmetric root reading"));
});

test("scale-degree fields preserve octave wraps and exact local scale gaps", () => {
  const preset = SCALE_PRESETS.find((item) => item.id === "five")!;
  const fields = scaleDegreeFields(preset.steps, preset.syllables);
  assert.deepEqual(fields[4].tones.map((tone) => [tone.degreeNumber, tone.octave, tone.semitonesFromDo]), [
    [5, 0, 10],
    [2, 1, 15],
    [4, 1, 19],
  ]);
  assert.deepEqual(fields.map((field) => [field.incomingGap, field.outgoingGap]), [[2, 3], [3, 2], [2, 2], [2, 3], [3, 2]]);
});

test("scale-degree field labels reject non-keyboard octave routes", () => {
  assert.throws(() => scaleDegreeFields([2, 2, 2], ["Do", "Re", "Mi"]), /totaling twelve/);
  assert.throws(() => scaleDegreeFields([2.5, 2.5, 2.5, 2.5, 2], ["Do", "Re", "Mi", "Fa", "Sol"]), /integer semitone/);
});
