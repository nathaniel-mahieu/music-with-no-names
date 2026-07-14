import assert from "node:assert/strict";
import test from "node:test";
import { estimateTapTempo, livePulseMirror, liveRhythmPhraseProfile, nestedCyclePhases, pulseHypotheses, syncopationIndex } from "../lib/rhythm-model.ts";

function pattern(active: number[]) {
  return Array.from({ length: 12 }, (_, index) => active.includes(index));
}

test("ranks a four-part pulse hypothesis for four equal onsets", () => {
  const hypotheses = pulseHypotheses(pattern([0, 3, 6, 9]));
  assert.equal(hypotheses[0].pulsesPerCycle, 4);
  assert.equal(hypotheses[0].confidence, 1);
});

test("distinguishes weak-position syncopation from an anchored pattern", () => {
  assert.ok(syncopationIndex(pattern([0, 2, 5, 7, 10])) > syncopationIndex(pattern([0, 3, 6, 9])));
});

test("expresses one step in several nested phases", () => {
  assert.deepEqual(nestedCyclePhases(3, 12), [
    { divisions: 2, phase: 0.5 },
    { divisions: 3, phase: 0.75 },
    { divisions: 4, phase: 0 },
  ]);
});

test("estimates embodied pulse from consistent taps", () => {
  const result = estimateTapTempo([0, 500, 1000, 1500, 2000]);
  assert.ok(result && Math.abs(result.pulsesPerMinute - 120) < 0.01);
  assert.equal(result?.consistency, 1);
});

test("captures one repeated key as a declared pulse and ignores other capture notes", () => {
  const mirror = livePulseMirror([
    { id: 1, note: 60, onsetMs: 1_000 },
    { id: 2, note: 64, onsetMs: 1_200 },
    { id: 3, note: 60, onsetMs: 1_500 },
    { id: 4, note: 60, onsetMs: 2_000 },
    { id: 5, note: 60, onsetMs: 2_500 },
  ]);
  assert.equal(mirror.status, "tracking");
  assert.equal(mirror.tapNote, 60);
  assert.equal(mirror.ignoredDuringCapture, 1);
  assert.equal(mirror.pulseMs, 500);
  assert.equal(mirror.pulsesPerMinute, 120);
  assert.equal(mirror.tapSpreadMs, 0);
});

test("clusters chord attacks before mapping pulse phase and gap ratios", () => {
  const mirror = livePulseMirror([
    { id: 1, note: 60, onsetMs: 0 },
    { id: 2, note: 60, onsetMs: 500 },
    { id: 3, note: 60, onsetMs: 1_000 },
    { id: 4, note: 60, onsetMs: 1_500 },
    { id: 5, note: 64, onsetMs: 2_000 },
    { id: 6, note: 67, onsetMs: 2_040 },
    { id: 7, note: 69, onsetMs: 2_250 },
    { id: 8, note: 71, onsetMs: 2_500 },
  ]);
  assert.equal(mirror.placements.length, 3);
  assert.deepEqual(mirror.placements[0].eventIds, [5, 6]);
  assert.equal(mirror.placements[0].attackCount, 2);
  assert.equal(mirror.placements[0].phaseLabel, "pulse line");
  assert.equal(mirror.placements[1].phaseLabel, "halfway");
  assert.deepEqual(mirror.gaps.map((gap) => gap.ratioLabel), ["1:2", "1:2"]);
});

test("refuses implausibly fast or slow four-tap anchors", () => {
  const fast = livePulseMirror([0, 100, 200, 300].map((onsetMs, index) => ({ id: index + 1, note: 60, onsetMs })));
  const slow = livePulseMirror([0, 2_100, 4_200, 6_300].map((onsetMs, index) => ({ id: index + 1, note: 60, onsetMs })));
  assert.equal(fast.status, "invalid");
  assert.match(fast.invalidReason ?? "", /shorter than 180/);
  assert.equal(slow.status, "invalid");
  assert.match(slow.invalidReason ?? "", /longer than 2 seconds/);
});

test("turns a retained phrase into pitchless local gap ratios", () => {
  const profile = liveRhythmPhraseProfile([
    { id: 1, note: 60, onsetMs: 0, releaseMs: 300, velocity: 48 },
    { id: 2, note: 64, onsetMs: 500, releaseMs: 730, velocity: 70 },
    { id: 3, note: 67, onsetMs: 750, releaseMs: 900, velocity: 82 },
    { id: 4, note: 72, onsetMs: 1_250, releaseMs: 1_500, velocity: 60 },
  ]);
  assert.ok(profile);
  assert.equal(profile.localUnitMs, 500);
  assert.deepEqual(profile.gaps.map((gap) => gap.ratioLabel), ["1:1", "1:2", "1:1"]);
  assert.deepEqual(profile.gaps.map((gap) => gap.repeated), [true, false, true]);
  assert.equal(profile.repeatedGapShare, 2 / 3);
  assert.equal(profile.velocityRange, 34);
  assert.deepEqual(profile.clusters.slice(0, 3).map((cluster) => cluster.connection), ["silence", "connected", "silence"]);
});

test("pitch changes and proportional tempo changes preserve the gap fingerprint", () => {
  const source = [0, 400, 800, 1_600].map((onsetMs, index) => ({ id: index + 1, note: 60 + index * 2, onsetMs, releaseMs: onsetMs + 200 }));
  const moved = source.map((event) => ({ ...event, note: event.note + 11 }));
  const slower = source.map((event) => ({ ...event, onsetMs: event.onsetMs * 2, releaseMs: event.releaseMs * 2 }));
  const sourceProfile = liveRhythmPhraseProfile(source);
  const movedProfile = liveRhythmPhraseProfile(moved);
  const slowerProfile = liveRhythmPhraseProfile(slower);
  assert.ok(sourceProfile && movedProfile && slowerProfile);
  assert.deepEqual(movedProfile.gaps.map((gap) => gap.ratioLabel), sourceProfile.gaps.map((gap) => gap.ratioLabel));
  assert.deepEqual(slowerProfile.gaps.map((gap) => gap.ratioLabel), sourceProfile.gaps.map((gap) => gap.ratioLabel));
  assert.equal(slowerProfile.localUnitMs, sourceProfile.localUnitMs * 2);
  assert.equal(slowerProfile.repeatedGapShare, sourceProfile.repeatedGapShare);
});

test("clusters chord attacks before measuring rhythm and refuses insufficient timing evidence", () => {
  const profile = liveRhythmPhraseProfile([
    { id: 1, note: 60, onsetMs: 0 },
    { id: 2, note: 64, onsetMs: 30 },
    { id: 3, note: 67, onsetMs: 500 },
    { id: 4, note: 72, onsetMs: 1_000 },
  ]);
  assert.ok(profile);
  assert.equal(profile.clusterCount, 3);
  assert.equal(profile.clusters[0].attackCount, 2);
  assert.deepEqual(profile.gaps.map((gap) => gap.ratioLabel), ["1:1", "1:1"]);
  assert.equal(liveRhythmPhraseProfile([
    { id: 1, note: 60, onsetMs: 0 },
    { id: 2, note: 64, onsetMs: 20 },
    { id: 3, note: 67, onsetMs: 40 },
    { id: 4, note: 72, onsetMs: 60 },
  ]), null);
});

test("does not call distant gap lengths repetitions just because they share a nearest landmark", () => {
  const onsets = [0, 100, 600, 3_600, 9_600, 10_100];
  const profile = liveRhythmPhraseProfile(onsets.map((onsetMs, index) => ({ id: index + 1, note: 60 + index, onsetMs })));
  assert.ok(profile);
  assert.equal(profile.localUnitMs, 500);
  assert.equal(profile.gaps[2].ratioLabel, "4:1");
  assert.equal(profile.gaps[3].ratioLabel, "4:1");
  assert.equal(profile.gaps[2].repeated, false);
  assert.equal(profile.gaps[3].repeated, false);
});
