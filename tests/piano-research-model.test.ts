import assert from "node:assert/strict";
import test from "node:test";
import {
  RESEARCH_INTERVAL_NAMES,
  chromaticClock,
  directedPitchClassSemitones,
  generatorComponents,
  intervalMatrix,
  shortestSignedPitchClassDistance,
  thirdsLattice,
} from "../lib/piano-research-model.ts";

test("the chromatic clock contains twelve unique pitch classes one semitone apart", () => {
  const clock = chromaticClock(5);
  assert.equal(clock.length, 12);
  assert.equal(new Set(clock.map((node) => node.pitchClass)).size, 12);
  assert.deepEqual(clock.map((node) => node.relativeSemitones), [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
  assert.deepEqual(clock.map((node) => node.pitchClass), [5, 6, 7, 8, 9, 10, 11, 0, 1, 2, 3, 4]);
  assert.equal(clock[0].x, 0, "the anchor is centered horizontally at twelve o'clock");
  assert.equal(clock[0].y, -1);
  clock.forEach((node, index) => {
    const next = clock[(index + 1) % clock.length];
    assert.equal(directedPitchClassSemitones(node.pitchClass, next.pitchClass), 1);
  });
});

test("transposition changes clock labels but preserves all relative geometry", () => {
  const source = chromaticClock(0);
  const transposed = chromaticClock(7);
  source.forEach((node, index) => {
    const moved = transposed[index];
    assert.equal(moved.pitchClass, (node.pitchClass + 7) % 12);
    assert.equal(moved.relativeSemitones, node.relativeSemitones);
    assert.equal(moved.intervalName, node.intervalName);
    assert.equal(moved.angleDegrees, node.angleDegrees);
    assert.equal(moved.x, node.x);
    assert.equal(moved.y, node.y);
  });
});

test("directed and shortest distances state their different octave-folding rules", () => {
  assert.equal(directedPitchClassSemitones(11, 1), 2);
  assert.equal(directedPitchClassSemitones(1, 11), 10);
  assert.equal(shortestSignedPitchClassDistance(11, 1), 2);
  assert.equal(shortestSignedPitchClassDistance(1, 11), -2);
  assert.equal(shortestSignedPitchClassDistance(0, 6), 6, "a tritone tie uses the positive direction");
  assert.equal(shortestSignedPitchClassDistance(6, 0), 6);
  assert.equal(RESEARCH_INTERVAL_NAMES[7], "perfect fifth");
});

test("generator component count and loop length follow gcd arithmetic for steps one through seven", () => {
  const expected = [
    { step: 1, loopLength: 12, componentCount: 1 },
    { step: 2, loopLength: 6, componentCount: 2 },
    { step: 3, loopLength: 4, componentCount: 3 },
    { step: 4, loopLength: 3, componentCount: 4 },
    { step: 5, loopLength: 12, componentCount: 1 },
    { step: 6, loopLength: 2, componentCount: 6 },
    { step: 7, loopLength: 12, componentCount: 1 },
  ];

  expected.forEach((item) => {
    const pattern = generatorComponents(item.step, 9);
    assert.equal(pattern.loopLength, item.loopLength);
    assert.equal(pattern.componentCount, item.componentCount);
    assert.equal(pattern.divisor, item.componentCount);
    assert.equal(pattern.components.length, item.componentCount);
    assert.ok(pattern.components.every((component) => component.pitchClasses.length === item.loopLength));
    assert.equal(new Set(pattern.components.flatMap((component) => component.pitchClasses)).size, 12);
  });
});

test("the +7 fifth generator makes one complete twelve-position cycle", () => {
  const fifths = generatorComponents(7, 0);
  assert.equal(fifths.componentCount, 1);
  assert.equal(fifths.loopLength, 12);
  assert.deepEqual(fifths.components[0].pitchClasses, [0, 7, 2, 9, 4, 11, 6, 1, 8, 3, 10, 5]);
  assert.equal(new Set(fifths.components[0].pitchClasses).size, 12);
});

test("the thirds lattice visits every pitch class with +3, +4, and +7 axes", () => {
  const lattice = thirdsLattice(2);
  const byCoordinate = new Map(lattice.map((cell) => [`${cell.x},${cell.y}`, cell]));
  assert.equal(lattice.length, 12);
  assert.equal(new Set(lattice.map((cell) => cell.pitchClass)).size, 12);

  lattice.forEach((cell) => {
    if (cell.x < 3) {
      assert.equal(directedPitchClassSemitones(cell.pitchClass, byCoordinate.get(`${cell.x + 1},${cell.y}`)!.pitchClass), 3);
    }
    if (cell.y < 2) {
      assert.equal(directedPitchClassSemitones(cell.pitchClass, byCoordinate.get(`${cell.x},${cell.y + 1}`)!.pitchClass), 4);
    }
    if (cell.x < 3 && cell.y < 2) {
      assert.equal(directedPitchClassSemitones(cell.pitchClass, byCoordinate.get(`${cell.x + 1},${cell.y + 1}`)!.pitchClass), 7);
    }
  });
});

test("the interval matrix reports every exact directed source-to-target distance", () => {
  const matrix = intervalMatrix(4);
  assert.equal(matrix.length, 12);
  assert.ok(matrix.every((row) => row.length === 12));
  assert.equal(matrix[0][0].semitones, 0);
  assert.equal(matrix[0][7].semitones, 7);
  assert.equal(matrix[7][0].semitones, 5);
  assert.equal(matrix[11][1].semitones, 2);
  assert.equal(matrix[11][1].sourcePitchClass, 3);
  assert.equal(matrix[11][1].targetPitchClass, 5);

  matrix.forEach((row, sourceIndex) => {
    row.forEach((cell, targetIndex) => {
      assert.equal(cell.sourceIndex, sourceIndex);
      assert.equal(cell.targetIndex, targetIndex);
      assert.equal(cell.semitones, (targetIndex - sourceIndex + 12) % 12);
      assert.equal(cell.intervalName, RESEARCH_INTERVAL_NAMES[cell.semitones]);
    });
  });
});
