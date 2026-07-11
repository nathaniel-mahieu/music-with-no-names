import assert from "node:assert/strict";
import test from "node:test";
import { familiarityResponseTrend, learnPreferenceTerrain, terrainFit, type ResponseSample } from "../lib/personal-response.ts";

const samples: ResponseSample[] = [
  { position: { tension: 30, surprise: 40, drive: 80 }, liking: 90, interest: 85, familiarity: 20, recordedAt: "2026-01-01" },
  { position: { tension: 35, surprise: 45, drive: 85 }, liking: 88, interest: 90, familiarity: 50, recordedAt: "2026-01-02" },
];

test("learns a transparent preference center and uncertainty", () => {
  const terrain = learnPreferenceTerrain(samples);
  assert.ok(terrain);
  assert.ok(terrain.center.drive > 80 && terrain.center.drive < 86);
  assert.equal(terrain.sampleCount, 2);
  assert.ok(terrain.uncertainty > 6);
});

test("terrain fit rewards nearby positions", () => {
  const terrain = learnPreferenceTerrain(samples)!;
  assert.ok(terrainFit({ tension: 33, surprise: 43, drive: 83 }, terrain) > terrainFit({ tension: 95, surprise: 5, drive: 5 }, terrain));
});

test("tracks familiarity and liking changes separately", () => {
  assert.deepEqual(familiarityResponseTrend(samples), { familiarityChange: 30, likingChange: -2, observations: 2 });
});
