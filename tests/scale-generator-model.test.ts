import assert from "node:assert/strict";
import test from "node:test";
import {
  FIFTH_SHIFT_EXAMPLES,
  MAJOR_FIFTH_WINDOW,
  MAJOR_FIFTH_WINDOW_NEXT,
  MAJOR_GAPS,
  MAJOR_POSITIONS,
  PYTHAGOREAN_COMMA_CENTS,
  REHOMED_MAJOR_WITHOUT_REPAIR,
  REHOMED_UNCHANGED_GAPS,
  SEVEN_PURE_FIFTH_BOUNDARY_CENTS,
  collectionLabel,
  cyclicGapPattern,
  fifthShiftProfile,
  generatorOrbit,
  generatorWindow,
  normalizePitchClass,
  pitchClassSetChange,
  transposePitchClassSet,
} from "../lib/scale-generator-model.ts";

test("a seven-semitone generator visits every octave position before returning", () => {
  const orbit = generatorOrbit(7);
  assert.equal(orbit.cycleLength, 12);
  assert.equal(orbit.componentCount, 1);
  assert.deepEqual(orbit.positions, [0, 7, 2, 9, 4, 11, 6, 1, 8, 3, 10, 5]);
  assert.deepEqual(orbit.unvisitedPositions, []);
});

test("generator loop length follows twelve divided by the greatest common divisor", () => {
  const expectations = [
    { generator: 1, length: 12, components: 1, gaps: Array(12).fill(1) },
    { generator: 2, length: 6, components: 2, gaps: Array(6).fill(2) },
    { generator: 3, length: 4, components: 3, gaps: Array(4).fill(3) },
    { generator: 4, length: 3, components: 4, gaps: Array(3).fill(4) },
    { generator: 5, length: 12, components: 1, gaps: [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1] },
    { generator: 6, length: 2, components: 6, gaps: [6, 6] },
    { generator: 7, length: 12, components: 1, gaps: [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1] },
  ];
  for (const expectation of expectations) {
    const orbit = generatorOrbit(expectation.generator);
    assert.equal(orbit.cycleLength, expectation.length);
    assert.equal(orbit.componentCount, expectation.components);
    assert.deepEqual(cyclicGapPattern(orbit.positions), expectation.gaps);
    assert.equal(cyclicGapPattern(orbit.positions).reduce((sum, gap) => sum + gap, 0), 12);
  }
});

test("negative generators normalize to the equivalent forward octave move", () => {
  assert.equal(normalizePitchClass(-5), 7);
  assert.deepEqual(generatorOrbit(-5).positions, generatorOrbit(7).positions);
  assert.throws(() => generatorOrbit(0), /move to a new octave position/);
  assert.throws(() => generatorOrbit(12), /move to a new octave position/);
  assert.throws(() => generatorOrbit(2.5), /integers/);
});

test("a seven-position fifth window produces major with Do in its second generator slot", () => {
  assert.deepEqual(MAJOR_FIFTH_WINDOW.visits.map((visit) => visit.absolutePosition), [5, 0, 7, 2, 9, 4, 11]);
  assert.deepEqual(MAJOR_FIFTH_WINDOW.relativePositions, [...MAJOR_POSITIONS]);
  assert.deepEqual(MAJOR_FIFTH_WINDOW.gaps, [...MAJOR_GAPS]);
  assert.equal(MAJOR_FIFTH_WINDOW.collectionLabel, "major / Ionian route");
  assert.equal(MAJOR_FIFTH_WINDOW.boundaryRemainder, 1);
  assert.equal(MAJOR_FIFTH_WINDOW.coversFullOrbit, false);
});

test("sliding the major fifth window keeps six positions and replaces Fa with Fi", () => {
  assert.deepEqual(MAJOR_FIFTH_WINDOW.absolutePositions, [0, 2, 4, 5, 7, 9, 11]);
  assert.deepEqual(MAJOR_FIFTH_WINDOW.nextAbsolutePositions, [0, 2, 4, 6, 7, 9, 11]);
  assert.deepEqual(MAJOR_FIFTH_WINDOW.removedPositions, [5]);
  assert.deepEqual(MAJOR_FIFTH_WINDOW.addedPositions, [6]);
  assert.deepEqual(MAJOR_FIFTH_WINDOW.retainedPositions, [0, 2, 4, 7, 9, 11]);
  assert.deepEqual(MAJOR_FIFTH_WINDOW_NEXT.relativePositions, [...MAJOR_POSITIONS]);
  assert.deepEqual(MAJOR_FIFTH_WINDOW.nextRelativePositions, [...MAJOR_POSITIONS]);
});

test("re-homing the unchanged pitches gives Mixolydian gaps before one-position repair", () => {
  assert.deepEqual(REHOMED_MAJOR_WITHOUT_REPAIR, [0, 2, 4, 5, 7, 9, 10]);
  assert.deepEqual(cyclicGapPattern(REHOMED_MAJOR_WITHOUT_REPAIR), [...REHOMED_UNCHANGED_GAPS]);
  const repair = pitchClassSetChange(REHOMED_MAJOR_WITHOUT_REPAIR, MAJOR_POSITIONS);
  assert.deepEqual(repair.removed, [10]);
  assert.deepEqual(repair.added, [11]);
  assert.equal(repair.replacements, 1);
});

test("seven-visit alternative windows expose both named equal divisions and repetitions", () => {
  const expected = [
    { generator: 1, distinct: 7, label: "seven-position chromatic cluster", stable: false },
    { generator: 2, distinct: 6, label: "whole-tone collection", stable: true },
    { generator: 3, distinct: 4, label: "diminished-seventh equal division", stable: true },
    { generator: 4, distinct: 3, label: "augmented-triad equal division", stable: true },
    { generator: 5, distinct: 7, label: "Phrygian diatonic route", stable: false },
    { generator: 6, distinct: 2, label: "tritone pair", stable: true },
    { generator: 7, distinct: 7, label: "major / Ionian route", stable: false },
  ];
  for (const item of expected) {
    const window = generatorWindow(item.generator, 7);
    assert.equal(window.distinctCount, item.distinct);
    assert.equal(window.collectionLabel, item.label);
    assert.equal(window.stableAfterShift, item.stable);
    assert.equal(window.gaps.reduce((sum, gap) => sum + gap, 0), 12);
  }
});

test("changing window size changes the boundary arithmetic rather than preserving a one-sharp myth", () => {
  const pentatonicWindow = generatorWindow(7, 5);
  assert.equal(pentatonicWindow.boundaryRemainder, 11);
  assert.equal(pentatonicWindow.removedPositions.length, 1);
  assert.equal(pentatonicWindow.addedPositions.length, 1);
  const fullFifthsOrbit = generatorWindow(7, 12);
  assert.equal(fullFifthsOrbit.boundaryRemainder, 0);
  assert.equal(fullFifthsOrbit.collectionLabel, "chromatic aggregate");
  assert.equal(fullFifthsOrbit.stableAfterShift, true);
  assert.throws(() => generatorWindow(7, 1), /between two/);
  assert.throws(() => generatorWindow(7, 13), /between two/);
});

test("a fifth transposes every scale shape but does not preserve one-note membership universally", () => {
  const profiles = Object.fromEntries(FIFTH_SHIFT_EXAMPLES.map((example) => [example.id, fifthShiftProfile(example)]));
  assert.equal(profiles.diatonic.replacements, 1);
  assert.equal(profiles["natural-minor"].replacements, 1);
  assert.equal(profiles["major-pentatonic"].replacements, 1);
  assert.deepEqual(profiles["major-pentatonic"].removed, [0]);
  assert.deepEqual(profiles["major-pentatonic"].added, [11]);
  assert.equal(profiles["harmonic-minor"].replacements, 3);
  assert.equal(profiles["whole-tone"].replacements, 6);
  assert.equal(profiles.octatonic.replacements, 4);
  assert.equal(profiles.chromatic.replacements, 0);
  assert.deepEqual(transposePitchClassSet(MAJOR_POSITIONS, 7), [0, 2, 4, 6, 7, 9, 11]);
});

test("equal-tempered closure remains separate from the nonclosing pure-ratio spiral", () => {
  assert.ok(Math.abs(PYTHAGOREAN_COMMA_CENTS - 23.46) < 0.02);
  assert.ok(Math.abs(SEVEN_PURE_FIFTH_BOUNDARY_CENTS - 113.685) < 0.01);
  assert.equal(collectionLabel(Array.from({ length: 12 }, (_, position) => position)), "chromatic aggregate");
});
