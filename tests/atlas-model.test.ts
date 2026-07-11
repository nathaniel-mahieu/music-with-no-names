import assert from "node:assert/strict";
import test from "node:test";
import { densityRegion, meanValue, valueSpread } from "../lib/atlas-model.ts";

test("computes a corpus center and porous minimum region", () => {
  assert.deepEqual(densityRegion([{ xValue: 20, yValue: 40 }]), { centerX: 20, centerY: 40, width: 20, height: 20, count: 1 });
});

test("region width grows with declared corpus spread", () => {
  const compact = densityRegion([{ xValue: 40, yValue: 40 }, { xValue: 42, yValue: 42 }]);
  const broad = densityRegion([{ xValue: 10, yValue: 10 }, { xValue: 90, yValue: 90 }]);
  assert.ok(broad.width > compact.width);
  assert.ok(broad.height > compact.height);
  assert.equal(broad.centerX, 50);
});

test("mean and spread stay analytically inspectable", () => {
  assert.equal(meanValue([10, 20, 30]), 20);
  assert.ok(Math.abs(valueSpread([10, 20, 30]) - Math.sqrt(200 / 3)) < 1e-12);
});
