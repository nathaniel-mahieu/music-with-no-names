import assert from "node:assert/strict";
import test from "node:test";
import {
  dimensionProximity,
  experienceProximity,
} from "../lib/experience-model.ts";

test("preference proximity peaks at a listener's selected value", () => {
  assert.equal(dimensionProximity(50, 50), 1);
  assert.ok(dimensionProximity(65, 50) < 1);
});

test("preference distance is symmetric", () => {
  assert.equal(dimensionProximity(35, 50), dimensionProximity(65, 50));
});

test("multi-dimensional proximity rewards nearby experiential positions", () => {
  const preferred = { tension: 40, surprise: 50, drive: 70 };
  const near = experienceProximity(
    { tension: 44, surprise: 46, drive: 74 },
    preferred,
  );
  const far = experienceProximity(
    { tension: 90, surprise: 5, drive: 10 },
    preferred,
  );
  assert.ok(near > far);
});

test("goal weights change which dimensions matter", () => {
  const observed = { tension: 90, surprise: 90, drive: 70 };
  const preferred = { tension: 20, surprise: 20, drive: 70 };
  const driveOnly = experienceProximity(observed, preferred, {
    tension: 0,
    surprise: 0,
    drive: 1,
  });
  assert.equal(driveOnly, 1);
});

test("ignores descriptive metadata on richer landmark objects", () => {
  const landmark = {
    tension: 40,
    surprise: 55,
    drive: 70,
    id: "example-recording",
    title: "Example recording",
  };

  assert.equal(
    experienceProximity(landmark, { tension: 40, surprise: 55, drive: 70 }),
    1,
  );
});
