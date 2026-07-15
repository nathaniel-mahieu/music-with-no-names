import assert from "node:assert/strict";
import test from "node:test";
import {
  IMMERSION_MAX_FIELD_NOTES,
  IMMERSION_MAX_INTERVAL_LINKS,
  IMMERSION_MAX_TRAIL_EVENTS,
  immersionCloudBounds,
  immersionCurve,
  immersionDirectionPoint,
  immersionIntervalField,
  immersionPhraseNewness,
  immersionPitchPoint,
  immersionReleaseProvenSilence,
  immersionSameNoteField,
  immersionTrail,
} from "../lib/piano-immersion-model.ts";

test("keeps pitch direction stable while Do reinterprets relational hue", () => {
  const underC = immersionPitchPoint(64, 60);
  const underG = immersionPitchPoint(64, 67);
  assert.equal(underC.angleDegrees, underG.angleDegrees);
  assert.equal(underC.x, underG.x);
  assert.equal(underC.y, underG.y);
  assert.notEqual(underC.relativeFifthStep, underG.relativeFifthStep);
  assert.notEqual(underC.hue, underG.hue);
});

test("octave copies share fifths direction and add equal register depth", () => {
  const lower = immersionPitchPoint(48, 60);
  const middle = immersionPitchPoint(60, 60);
  const upper = immersionPitchPoint(72, 60);
  assert.equal(lower.angleDegrees, middle.angleDegrees);
  assert.equal(middle.angleDegrees, upper.angleDegrees);
  assert.ok(Math.abs((middle.radius - lower.radius) - (upper.radius - middle.radius)) < 1e-12);
  assert.ok(Math.abs(middle.radius - lower.radius - 33) < 1e-12);
});

test("bounds trail and dense interval fields deterministically", () => {
  const events = Array.from({ length: 80 }, (_, index) => ({ id: index + 1, note: 40 + index % 36 }));
  const first = immersionTrail(events, 60);
  const second = immersionTrail(events, 60);
  assert.equal(first.length, IMMERSION_MAX_TRAIL_EVENTS);
  assert.deepEqual(first, second);
  assert.equal(first[0].event.id, 53);

  const field = immersionIntervalField(Array.from({ length: 20 }, (_, index) => 40 + index), 60);
  assert.equal(field.notes.length, IMMERSION_MAX_FIELD_NOTES);
  assert.equal(field.links.length, IMMERSION_MAX_INTERVAL_LINKS);
  assert.equal(field.omittedNoteCount, 12);
  assert.deepEqual(field.notes, [40, 43, 45, 48, 51, 54, 56, 59]);
  assert.equal(field.totalPairCount, 190);
  assert.equal(field.analyzedPairCount, 28);
  assert.equal(field.omittedLinkCount, 178);
});

test("keeps newness local to the retained phrase rather than the seven-attack microscope", () => {
  const phrase = [60, 61, 62, 63, 64, 65, 66, 67, 68, 60].map((note) => ({ note }));
  assert.ok(immersionPhraseNewness(phrase) <= 0.35);
  assert.ok(immersionPhraseNewness(phrase.slice(-7)) >= 0.72);
});

test("requires every retained voice to release before drawing a silence break", () => {
  const held = { id: 1, note: 60, onsetMs: 0, releaseMs: null, fieldNotes: [60] };
  const passing = { id: 2, note: 64, onsetMs: 10, releaseMs: 20, fieldNotes: [60, 64] };
  const underHold = { id: 3, note: 67, onsetMs: 30, releaseMs: null, fieldNotes: [60, 67] };
  assert.deepEqual(immersionReleaseProvenSilence([held, passing, underHold], underHold), { proven: false, durationMs: null });

  const released = { ...held, releaseMs: 12 };
  const afterSilence = { ...underHold, fieldNotes: [67] };
  assert.deepEqual(immersionReleaseProvenSilence([released, passing, afterSilence], afterSilence), { proven: true, durationMs: 10 });
});

test("matches modeled evidence only to the exact displayed note field", () => {
  assert.equal(immersionSameNoteField([60, 64, 67], [67, 60, 64, 64]), true);
  assert.equal(immersionSameNoteField([60, 64, 67], [72]), false);
  assert.equal(immersionSameNoteField([60, 64, 67], [60, 64]), false);
});

test("handles empty, repeated, invalid, and extreme input without invalid geometry", () => {
  assert.deepEqual(immersionIntervalField([], 60), { notes: [], links: [], totalPairCount: 0, analyzedPairCount: 0, omittedNoteCount: 0, omittedLinkCount: 0 });
  assert.equal(immersionIntervalField([60, 60, 60], 60).links.length, 0);
  const extremes = [immersionPitchPoint(Number.NaN, Number.NaN), immersionPitchPoint(-999, 60), immersionPitchPoint(999, 60)];
  extremes.forEach((point) => {
    assert.ok(Number.isFinite(point.x));
    assert.ok(Number.isFinite(point.y));
    assert.ok(Number.isFinite(point.radius));
  });
  assert.ok(immersionCloudBounds([0, 127], 60));
  assert.equal(immersionCloudBounds([], 60), null);
});

test("builds valid one-, two-, and multi-point paths", () => {
  assert.equal(immersionCurve([]), "");
  assert.equal(immersionCurve([{ x: 1, y: 2 }]), "M 1.00 2.00");
  assert.equal(immersionCurve([{ x: 1, y: 2 }, { x: 3, y: 4 }]), "M 1.00 2.00 L 3.00 4.00");
  assert.match(immersionCurve([{ x: 1, y: 2 }, { x: 3, y: 4 }, { x: 5, y: 6 }]), /^M .+ Q .+ T .+$/);
  const direction = immersionDirectionPoint(0, 200);
  assert.ok(Number.isFinite(direction.x) && Number.isFinite(direction.y));
});
