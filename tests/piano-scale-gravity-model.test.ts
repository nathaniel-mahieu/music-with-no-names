import assert from "node:assert/strict";
import test from "node:test";

import {
  DIATONIC_MODES,
  MAJOR_HARMONY_CONTEXTS,
  MAJOR_SCALE_OFFSETS,
  MAJOR_SCALE_STEPS,
  majorDegreeContextProfile,
  majorDegreeForRelativeSemitones,
  majorDegreeHarmonyReading,
  majorScaleLandscape,
  physicalScaleGravityWindowOffset,
  recognizeMajorHarmonyContext,
  relativeSemitonesFromDo,
  rotateMajorMode,
  scaleGravityJourney,
} from "../lib/piano-scale-gravity-model.ts";

test("the major landscape keeps all twelve semitone slots and unequal scale gaps visible", () => {
  const landscape = majorScaleLandscape();
  assert.deepEqual(landscape.map((node) => node.semitonesFromDo), [...MAJOR_SCALE_OFFSETS, 12]);
  assert.deepEqual(landscape.slice(0, 7).map((node) => node.nextGap), [...MAJOR_SCALE_STEPS]);
  assert.deepEqual(landscape.filter((node) => node.halfStepAfter).map((node) => node.degree), [3, 7]);
  assert.equal(landscape[0].nominalRatio, 1);
  assert.equal(landscape[7].nominalRatio, 2);
});

test("degree location is invariant under transposition in the selected Do frame", () => {
  assert.equal(relativeSemitonesFromDo(64, 60), 4);
  assert.equal(relativeSemitonesFromDo(70, 66), 4);
  assert.equal(majorDegreeForRelativeSemitones(4), 3);
  assert.equal(majorDegreeForRelativeSemitones(16), 3);
  assert.equal(majorDegreeForRelativeSemitones(1), null);
});

test("the physical runway distinguishes the octave endpoint from folded pitch class", () => {
  assert.equal(physicalScaleGravityWindowOffset(60, 60), 0);
  assert.equal(physicalScaleGravityWindowOffset(72, 60), 12);
  assert.equal(physicalScaleGravityWindowOffset(59, 60), null);
  assert.equal(physicalScaleGravityWindowOffset(73, 60), null);
});

test("degree three changes exact role while the held pitch stays fixed through IV V I", () => {
  const [four, five, one] = majorDegreeContextProfile(3);
  assert.deepEqual([four.context.id, five.context.id, one.context.id], ["IV", "V", "I"]);
  assert.deepEqual([four.intervalAboveRoot, five.intervalAboveRoot, one.intervalAboveRoot], [11, 9, 4]);
  assert.deepEqual([four.isChordTone, five.isChordTone, one.isChordTone], [false, false, true]);
  assert.equal(four.nearestChordTones[0].signedSemitones, 1);
  assert.equal(one.triadRole, "third");
  assert.match(four.commonPracticeCue, /stays fixed/);
});

test("degree two exposes structure behind the source listening prompt without assigning a score", () => {
  const profile = majorDegreeContextProfile(2);
  assert.deepEqual(profile.map((reading) => reading.intervalAboveRoot), [9, 7, 2]);
  assert.deepEqual(profile.map((reading) => reading.isChordTone), [false, true, false]);
  assert.equal(profile[1].triadRole, "fifth");
  assert.deepEqual(profile[2].nearestChordTones.map((tone) => [tone.role, tone.signedSemitones]), [["root", -2], ["third", 2]]);
});

test("every degree-context pair reports one exact interval and bounded triad membership", () => {
  const readings = Array.from({ length: 7 }, (_, index) => majorDegreeContextProfile(index + 1)).flat();
  assert.equal(readings.length, 7 * MAJOR_HARMONY_CONTEXTS.length);
  assert.ok(readings.every((reading) => reading.intervalAboveRoot >= 0 && reading.intervalAboveRoot < 12));
  assert.ok(readings.every((reading) => reading.nearestDistance >= 0 && reading.nearestDistance <= 3));
  assert.equal(readings.filter((reading) => reading.isChordTone).length, 9);
});

test("dominant cues distinguish the V triad from the optional V7 field", () => {
  const fourOverFive = majorDegreeHarmonyReading(4, "V");
  const sevenOverFive = majorDegreeHarmonyReading(7, "V");
  assert.equal(fourOverFive.isChordTone, false);
  assert.match(fourOverFive.commonPracticeCue, /outside the plain V triad/);
  assert.match(fourOverFive.commonPracticeCue, /V7/);
  assert.equal(sevenOverFive.triadRole, "third");
  assert.match(sevenOverFive.commonPracticeCue, /often moves \+1 semitone/);
});

test("live fields recognize complete I IV V triads across inversions and one held color tone", () => {
  assert.equal(recognizeMajorHarmonyContext([60, 64, 67], 60), "I");
  assert.equal(recognizeMajorHarmonyContext([69, 72, 65], 60), "IV");
  assert.equal(recognizeMajorHarmonyContext([74, 79, 71, 72], 60), "V");
  assert.equal(recognizeMajorHarmonyContext([62, 66, 69], 62), "I");
  assert.equal(recognizeMajorHarmonyContext([60, 64], 60), null);
  assert.equal(recognizeMajorHarmonyContext([60, 62, 64, 65, 67], 60), null);
});

test("natural minor is the sixth rotation of one major collection", () => {
  const aeolian = rotateMajorMode(6);
  assert.equal(aeolian.modeName, "Aeolian / natural minor");
  assert.deepEqual(aeolian.parentDegreeOrder, [6, 7, 1, 2, 3, 4, 5, 6]);
  assert.deepEqual(aeolian.steps, [2, 1, 2, 2, 1, 2, 2]);
  assert.deepEqual(aeolian.offsetsFromNewHome, [0, 2, 3, 5, 7, 8, 10]);
});

test("all seven diatonic modes rotate the same step inventory and close at twelve", () => {
  assert.equal(DIATONIC_MODES.length, 7);
  for (let degree = 1; degree <= 7; degree += 1) {
    const mode = rotateMajorMode(degree);
    assert.equal(mode.steps.reduce((sum, step) => sum + step, 0), 12);
    assert.deepEqual([...mode.steps].sort((first, second) => first - second), [...MAJOR_SCALE_STEPS].sort((first, second) => first - second));
    assert.equal(new Set(mode.offsetsFromNewHome).size, 7);
  }
});

test("the recent journey keeps chromatic positions and unfolded physical movement separate", () => {
  const journey = scaleGravityJourney([
    { note: 60 },
    { note: 64 },
    { note: 65 },
    { note: 66 },
    { note: 72 },
    { note: 71 },
  ], 60, 5);
  assert.deepEqual(journey.map((step) => step.note), [64, 65, 66, 72, 71]);
  assert.deepEqual(journey.map((step) => step.degree), [3, 4, null, 1, 7]);
  assert.deepEqual(journey.map((step) => step.relativeSemitones), [4, 5, 6, 0, 11]);
  assert.deepEqual(journey.map((step) => step.physicalMoveFromPrevious), [null, 1, 1, 6, -1]);
});
