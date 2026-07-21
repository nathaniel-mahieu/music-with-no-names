import assert from "node:assert/strict";
import test from "node:test";
import {
  VOCAL_SPECTRUM_MAXIMUM_HZ,
  VOCAL_SPECTRUM_MINIMUM_HZ,
  vocalSpectrumPosition,
  vocalTargetHarmonics,
} from "../lib/vocal-spectrum-model.ts";

test("places voice-spectrum frequencies on one bounded logarithmic axis", () => {
  assert.equal(vocalSpectrumPosition(VOCAL_SPECTRUM_MINIMUM_HZ), 0);
  assert.equal(vocalSpectrumPosition(VOCAL_SPECTRUM_MAXIMUM_HZ), 1);
  assert.ok(Math.abs(vocalSpectrumPosition(Math.sqrt(VOCAL_SPECTRUM_MINIMUM_HZ * VOCAL_SPECTRUM_MAXIMUM_HZ)) - 0.5) < 1e-12);
  assert.equal(vocalSpectrumPosition(0), 0);
  assert.equal(vocalSpectrumPosition(Number.POSITIVE_INFINITY), 0);
});

test("builds only target harmonics visible inside the voice spectrum", () => {
  const harmonics = vocalTargetHarmonics(220);
  assert.equal(harmonics[0].harmonic, 1);
  assert.equal(harmonics[0].frequencyHz, 220);
  assert.equal(harmonics.at(-1)?.harmonic, 13);
  assert.ok(harmonics.every((harmonic) => harmonic.frequencyHz >= 50 && harmonic.frequencyHz <= 3_000));
  assert.ok(harmonics.every((harmonic, index) => index === 0 || harmonic.position > harmonics[index - 1].position));
  assert.deepEqual(vocalTargetHarmonics(0), []);
});
