import assert from "node:assert/strict";
import test from "node:test";
import {
  chordSpacingProfile,
  exactIntervalCopy,
  foldIntervalForGlow,
  intervalListeningCue,
  intervalTimeline,
} from "../lib/piano-interval-glow-model.ts";

test("the glow ring keeps unison distinct from positive octave multiples", () => {
  assert.deepEqual(foldIntervalForGlow(0), {
    exactSemitones: 0,
    ringSemitones: 0,
    addedOctaves: 0,
    name: "same key",
  });
  assert.equal(foldIntervalForGlow(12).ringSemitones, 12);
  assert.equal(foldIntervalForGlow(12).addedOctaves, 0);
  assert.equal(foldIntervalForGlow(24).ringSemitones, 12);
  assert.equal(foldIntervalForGlow(24).addedOctaves, 1);
  assert.equal(foldIntervalForGlow(16).ringSemitones, 4);
  assert.equal(foldIntervalForGlow(16).addedOctaves, 1);
});

test("a voiced major triad exposes both adjacent gaps and every pair", () => {
  const profile = chordSpacingProfile([67, 60, 64, 60]);
  assert.deepEqual(profile.notes, [60, 64, 67]);
  assert.deepEqual(profile.adjacentGaps, [4, 3]);
  assert.deepEqual(profile.pairs.map((pair) => pair.exactSemitones), [4, 7, 3]);
  assert.deepEqual(profile.ringCounts, [
    { semitones: 3, pairCount: 1 },
    { semitones: 4, pairCount: 1 },
    { semitones: 7, pairCount: 1 },
  ]);
  assert.equal(profile.span, 7);
});

test("wide voicings retain exact distance while sharing a ring color family", () => {
  const profile = chordSpacingProfile([48, 64, 79]);
  assert.deepEqual(profile.adjacentGaps, [16, 15]);
  assert.deepEqual(profile.exactCounts, [
    { semitones: 15, pairCount: 1 },
    { semitones: 16, pairCount: 1 },
    { semitones: 31, pairCount: 1 },
  ]);
  assert.equal(profile.pairs.find((pair) => pair.exactSemitones === 16)?.ringSemitones, 4);
  assert.equal(profile.pairs.find((pair) => pair.exactSemitones === 31)?.ringSemitones, 7);
  assert.equal(profile.pairs.find((pair) => pair.exactSemitones === 31)?.addedOctaves, 2);
});

test("the phrase timeline groups tight attacks but preserves every melodic transition", () => {
  const timeline = intervalTimeline([
    { id: 1, note: 60, onsetMs: 1000 },
    { id: 2, note: 64, onsetMs: 1080 },
    { id: 3, note: 67, onsetMs: 1140 },
    { id: 4, note: 69, onsetMs: 1700 },
  ], 160);
  assert.equal(timeline.groups.length, 2);
  assert.deepEqual(timeline.groups[0].notes, [60, 64, 67]);
  assert.deepEqual(timeline.groups[1].notes, [69]);
  assert.deepEqual(timeline.transitions.map((transition) => transition.signedSemitones), [4, 3, 2]);
  assert.deepEqual(timeline.transitions.map((transition) => transition.folded.ringSemitones), [4, 3, 2]);
});

test("a reloaded tab may shift retained monotonic onsets below zero without changing their relationships", () => {
  const timeline = intervalTimeline([
    { id: 1, note: 60, onsetMs: -240 },
    { id: 2, note: 64, onsetMs: -160 },
    { id: 3, note: 67, onsetMs: -80 },
  ], 160);
  assert.equal(timeline.groups.length, 1);
  assert.deepEqual(timeline.transitions.map((transition) => transition.signedSemitones), [4, 3]);
});

test("copy and listening cues teach comparisons without declaring musical quality", () => {
  assert.equal(exactIntervalCopy(19), "19 semitones · 1 octave + 7");
  assert.match(intervalListeningCue(5), /six- and seven-semitone spans/);
  assert.doesNotMatch(intervalListeningCue(3), /happy|sad|good|bad/i);
});
