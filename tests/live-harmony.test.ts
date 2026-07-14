import assert from "node:assert/strict";
import test from "node:test";
import { liveHarmonyPhraseProfile } from "../lib/live-harmony.ts";

const twoFields = [
  { id: 1, note: 60, onsetMs: 0 },
  { id: 2, note: 64, onsetMs: 30 },
  { id: 3, note: 67, onsetMs: 55 },
  { id: 4, note: 60, onsetMs: 800 },
  { id: 5, note: 63, onsetMs: 830 },
  { id: 6, note: 67, onsetMs: 860 },
];

test("turns two compact MIDI fields into an inspectable sonority change", () => {
  const profile = liveHarmonyPhraseProfile(twoFields);
  assert.ok(profile?.previous && profile.transition);
  assert.equal(profile.gestureCount, 2);
  assert.deepEqual(profile.previous.offsetsFromBass, [0, 4, 7]);
  assert.deepEqual(profile.current.offsetsFromBass, [0, 3, 7]);
  assert.deepEqual(profile.previous.intervals.map((pair) => pair.distance.semitones), [4, 7, 3]);
  assert.deepEqual(profile.current.intervals.map((pair) => pair.distance.semitones), [3, 7, 4]);
  assert.equal(profile.transition.voiceLeading.totalMotion, 1);
  assert.equal(profile.transition.voiceLeading.largestLeap, 1);
  assert.deepEqual(profile.transition.voiceLeading.motionClasses, ["oblique"]);
  assert.equal(profile.transition.affordanceDelta.length, 4);
});

test("keeps chord relationships under transposition while physical realization can change", () => {
  const source = liveHarmonyPhraseProfile(twoFields);
  const moved = liveHarmonyPhraseProfile(twoFields.map((event) => ({ ...event, note: event.note + 12 })));
  assert.ok(source?.previous && source.transition && moved?.previous && moved.transition);
  assert.deepEqual(moved.previous.offsetsFromBass, source.previous.offsetsFromBass);
  assert.deepEqual(moved.current.offsetsFromBass, source.current.offsetsFromBass);
  assert.deepEqual(
    moved.current.intervals.map((pair) => pair.distance.semitones),
    source.current.intervals.map((pair) => pair.distance.semitones),
  );
  assert.equal(moved.transition.voiceLeading.totalMotion, source.transition.voiceLeading.totalMotion);
  assert.ok(moved.current.perception.brightness > source.current.perception.brightness);
});

test("uses the declared grouping window and explicit chord-boundary corrections", () => {
  const rolled = [
    { id: 1, note: 60, onsetMs: 0 },
    { id: 2, note: 64, onsetMs: 140 },
    { id: 3, note: 67, onsetMs: 280 },
  ];
  const profile = liveHarmonyPhraseProfile(rolled, 160);
  assert.ok(profile);
  assert.equal(profile.gestureCount, 1);
  assert.equal(profile.current.kind, "rolled");
  assert.equal(profile.current.spreadMs, 280);
  const corrected = liveHarmonyPhraseProfile(rolled, 160, { 2: "break" });
  assert.ok(corrected);
  assert.deepEqual(corrected.current.notes, [64, 67]);
  assert.deepEqual(corrected.current.eventIds, [2, 3]);
});

test("does not manufacture harmony from a separated melody or one pitch class", () => {
  assert.equal(liveHarmonyPhraseProfile([
    { id: 1, note: 60, onsetMs: 0 },
    { id: 2, note: 62, onsetMs: 500 },
    { id: 3, note: 64, onsetMs: 1_000 },
  ]), null);
  assert.equal(liveHarmonyPhraseProfile([
    { id: 1, note: 60, onsetMs: 0 },
    { id: 2, note: 72, onsetMs: 30 },
  ]), null);
});
