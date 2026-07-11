import assert from "node:assert/strict";
import test from "node:test";
import {
  sonorityAffordances,
  sonorityPerceptionModel,
} from "../lib/sonority-model.ts";

function voices(ratios: number[], referenceHz = 160) {
  return ratios.map((ratio) => ({
    frequencyHz: referenceHz * ratio,
    amplitude: 0.7,
    partialCount: 9,
  }));
}

test("keeps perceptual dimensions separate and bounded", () => {
  const model = sonorityPerceptionModel(voices([1, 5 / 4, 3 / 2]));
  for (const key of ["roughness", "harmonicity", "ambiguity", "fusion", "openness", "brightness", "motion", "repose", "tension"] as const) {
    assert.ok(model[key] >= 0 && model[key] <= 1, `${key} must be normalized`);
  }
  assert.notEqual(model.fusion, model.repose);
  assert.notEqual(model.tension, 1 - model.repose);
});

test("a compact harmonic field has a clearer center than an irrational field", () => {
  const compact = sonorityPerceptionModel(voices([1, 5 / 4, 3 / 2]));
  const irrational = sonorityPerceptionModel(voices([1, Math.SQRT2, 3 / 2]));
  assert.ok(compact.harmonicity > irrational.harmonicity);
  assert.ok(compact.ambiguity < irrational.ambiguity);
  assert.ok(compact.repose > irrational.repose);
});

test("register, spacing, and recent motion affect different affordances", () => {
  const low = sonorityPerceptionModel(voices([1, 5 / 4, 3 / 2], 120));
  const high = sonorityPerceptionModel(voices([1, 5 / 4, 3 / 2], 480));
  const spread = sonorityPerceptionModel([
    { frequencyHz: 120, amplitude: 0.7, partialCount: 9 },
    { frequencyHz: 400, amplitude: 0.7, partialCount: 9 },
    { frequencyHz: 960, amplitude: 0.7, partialCount: 9 },
  ]);
  const moving = sonorityPerceptionModel(voices([1, 5 / 4, 3 / 2]), 360);
  assert.ok(high.brightness > low.brightness);
  assert.ok(spread.openness > low.openness);
  assert.ok(moving.tension > low.tension);
  assert.ok(moving.repose < low.repose);
});

test("affordances explain direction and physical drivers without claiming emotions", () => {
  const affordances = sonorityAffordances(sonorityPerceptionModel(voices([1, 5 / 4, 3 / 2])));
  assert.deepEqual(affordances.map((item) => item.key), ["repose", "friction", "openness", "brightness"]);
  assert.ok(affordances.every((item) => item.direction.startsWith("may support")));
  assert.ok(affordances.every((item) => item.drivers.length > 10));
});
