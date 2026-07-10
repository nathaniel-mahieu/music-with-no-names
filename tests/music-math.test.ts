import assert from "node:assert/strict";
import test from "node:test";
import {
  approximateRatio,
  centsFromRatio,
  commonPeriodSeconds,
  findCoincidingPartials,
  greatestCommonDivisor,
  harmonicBasis,
  harmonicPartials,
  cyclicOnsetIntervals,
  leastCommonMultiple,
  primeFactorization,
} from "../lib/music-math.ts";

test("reduces integer relationships", () => {
  assert.equal(greatestCommonDivisor(42, 30), 6);
  assert.equal(greatestCommonDivisor(0, 8), 8);
});

test("finds shared cycle lengths", () => {
  assert.equal(leastCommonMultiple(4, 6), 12);
});

test("finds exact small-integer frequency ratios", () => {
  assert.deepEqual(approximateRatio(1.5, 16), {
    numerator: 3,
    denominator: 2,
    value: 1.5,
    errorCents: 0,
    exact: true,
  });
});

test("keeps irrational relationships approximate", () => {
  const approximation = approximateRatio(Math.SQRT2, 16);
  assert.equal(approximation.exact, false);
  assert.ok(Math.abs(approximation.errorCents) > 1);
});

test("converts multiplicative distance into logarithmic distance", () => {
  assert.equal(centsFromRatio(2), 1200);
  assert.ok(Math.abs(centsFromRatio(3 / 2) - 701.955) < 0.001);
});

test("calculates a short common period only for close rational relationships", () => {
  assert.ok(Math.abs((commonPeriodSeconds(220, 3 / 2) ?? 0) - 2 / 220) < 1e-12);
  assert.equal(commonPeriodSeconds(220, Math.SQRT2), null);
});

test("creates harmonic spectra with predictable rolloff", () => {
  const partials = harmonicPartials(100, 3, 1);
  assert.deepEqual(
    partials.map(({ index, frequencyHz, amplitude }) => ({
      index,
      frequencyHz,
      amplitude,
    })),
    [
      { index: 1, frequencyHz: 100, amplitude: 1 },
      { index: 2, frequencyHz: 200, amplitude: 0.5 },
      { index: 3, frequencyHz: 300, amplitude: 1 / 3 },
    ],
  );
});

test("detects shared partials in a three-to-two relationship", () => {
  const matches = findCoincidingPartials(220, 330, 8, 0.01);
  assert.ok(
    matches.some(
      ({ lowerIndex, upperIndex, frequencyHz }) =>
        lowerIndex === 3 && upperIndex === 2 && frequencyHz === 660,
    ),
  );
});

test("factorizes harmonic coordinates", () => {
  assert.deepEqual(primeFactorization(60), { 2: 2, 3: 1, 5: 1 });
});

test("expresses multi-tone ratios as a shared harmonic basis", () => {
  assert.deepEqual(harmonicBasis([1, 5 / 4, 3 / 2]), [4, 5, 6]);
  assert.deepEqual(harmonicBasis([1, 6 / 5, 3 / 2]), [10, 12, 15]);
  assert.equal(harmonicBasis([1, Math.SQRT2, 3 / 2]), null);
});

test("describes circular rhythms as onset-spacing ratios", () => {
  assert.deepEqual(
    cyclicOnsetIntervals([
      true,
      false,
      false,
      true,
      false,
      false,
      true,
      false,
      true,
      false,
      true,
      false,
    ]),
    [3, 3, 2, 2, 2],
  );
});
