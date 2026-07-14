import assert from "node:assert/strict";
import test from "node:test";
import { liveEarIntervalProfile } from "../lib/live-ear.ts";
import type { PianoPhraseSpecimenEvent } from "../lib/piano-session.ts";

function event(id: number, note: number, onsetMs: number, releaseMs: number | null): PianoPhraseSpecimenEvent {
  return { id, note, onsetMs, releaseMs, velocity: 72 };
}

test("keeps one performed interval fixed while declared sound models change", () => {
  const profile = liveEarIntervalProfile([
    event(1, 60, 0, 700),
    event(2, 67, 120, 760),
  ]);
  assert.ok(profile);
  assert.equal(profile.signedSteps, 7);
  assert.equal(profile.steps, 7);
  assert.equal(profile.cents, 700);
  assert.ok(Math.abs(profile.equalFrequencyRatio - 2 ** (7 / 12)) < 1e-12);
  assert.equal(profile.interactionStatus, "overlap");
  assert.equal(profile.overlapMs, 580);
  assert.equal(profile.modelReadings.length, 4);
  assert.equal(profile.modelReadings[0].id, "sine");
  assert.equal(profile.modelReadings[0].alignedPairCount, 0);
  assert.ok(profile.modelReadings[1].alignedPairCount > 0);
  assert.notEqual(profile.modelReadings[0].fusion, profile.modelReadings[3].fusion);
});

test("refuses simultaneous spectral evidence for a sequential interval", () => {
  const profile = liveEarIntervalProfile([
    event(1, 60, 0, 220),
    event(2, 67, 420, 700),
  ]);
  assert.ok(profile);
  assert.equal(profile.interactionStatus, "separate");
  assert.equal(profile.overlapMs, 0);
  assert.deepEqual(profile.modelReadings, []);
});

test("keeps missing release evidence unknown instead of assuming overlap", () => {
  const profile = liveEarIntervalProfile([
    event(1, 60, 0, null),
    event(2, 64, 100, 500),
  ]);
  assert.ok(profile);
  assert.equal(profile.interactionStatus, "unknown");
  assert.equal(profile.overlapMs, null);
  assert.deepEqual(profile.modelReadings, []);
});

test("transposition preserves the relationship while register-dependent evidence may move", () => {
  const lower = liveEarIntervalProfile([event(1, 48, 0, 700), event(2, 55, 100, 760)]);
  const higher = liveEarIntervalProfile([event(1, 72, 0, 700), event(2, 79, 100, 760)]);
  assert.ok(lower && higher);
  assert.equal(lower.signedSteps, higher.signedSteps);
  assert.equal(lower.equalFrequencyRatio, higher.equalFrequencyRatio);
  assert.ok(higher.lowerHz > lower.lowerHz);
  assert.ok(higher.modelReadings[1].brightness > lower.modelReadings[1].brightness);
});

test("uses the latest two valid attacks and refuses undersized input", () => {
  assert.equal(liveEarIntervalProfile([event(1, 60, 0, 200)]), null);
  const profile = liveEarIntervalProfile([
    event(1, 48, 0, 80),
    event(2, 60, 100, 500),
    event(3, 63, 200, 600),
  ]);
  assert.ok(profile);
  assert.equal(profile.first.note, 60);
  assert.equal(profile.second.note, 63);
  assert.equal(profile.steps, 3);
});
