import test from "node:test";
import assert from "node:assert/strict";
import {
  buildScoreMediaReferencePlan,
  mediaSecondsToScoreBeat,
  normalizeScoreMediaAnchors,
  scoreBeatToMediaSeconds,
} from "../lib/score-media-sync.ts";
import {
  normalizeSheetMusicScore,
  selectSheetMusicLoop,
  type SheetMusicScoreInput,
} from "../lib/sheet-music-coach-model.ts";

function score() {
  const input: SheetMusicScoreInput = {
    id: "media-sync-score",
    title: "Media sync",
    sourceName: "media-sync.musicxml",
    tempoBpm: 120,
    tempoChanges: [{ beat: 4, bpm: 60 }],
    timeSignature: { beats: 4, beatType: 4 },
    keyFifths: 0,
    measures: [
      {
        number: 1,
        durationBeats: 4,
        events: [
          { kind: "note", id: "c4", offsetBeats: 0, durationBeats: 1, pitch: { step: "C", octave: 4 }, staff: 1 },
          { kind: "note", id: "d4", offsetBeats: 2, durationBeats: 1, pitch: { step: "D", octave: 4 }, staff: 1 },
        ],
      },
      {
        number: 2,
        durationBeats: 4,
        events: [
          { kind: "note", id: "e4", offsetBeats: 0, durationBeats: 1, pitch: { step: "E", octave: 4 }, staff: 1 },
          { kind: "note", id: "f4", offsetBeats: 2, durationBeats: 1, pitch: { step: "F", octave: 4 }, staff: 1 },
        ],
      },
    ],
  };
  return normalizeSheetMusicScore(input);
}

test("one recording anchor follows the encoded score tempo map", () => {
  const normalized = score();
  const anchors = [{ scoreBeat: 0, mediaTimeSeconds: 3.5 }];
  assert.equal(scoreBeatToMediaSeconds(normalized, anchors, 4), 5.5);
  assert.equal(scoreBeatToMediaSeconds(normalized, anchors, 6), 7.5);
  assert.ok(Math.abs(mediaSecondsToScoreBeat(normalized, anchors, 7.5)! - 6) < 1e-6);
});

test("two and three anchors model performed drift piecewise", () => {
  const normalized = score();
  const anchors = normalizeScoreMediaAnchors([
    { scoreBeat: 8, mediaTimeSeconds: 13 },
    { scoreBeat: 0, mediaTimeSeconds: 1 },
    { scoreBeat: 4, mediaTimeSeconds: 5 },
  ], normalized.totalBeats);
  assert.deepEqual(anchors.map((anchor) => anchor.scoreBeat), [0, 4, 8]);
  assert.equal(scoreBeatToMediaSeconds(normalized, anchors, 2), 3);
  assert.equal(scoreBeatToMediaSeconds(normalized, anchors, 6), 9);
  assert.ok(Math.abs(mediaSecondsToScoreBeat(normalized, anchors, 9)! - 6) < 1e-6);
});

test("rejects anchors that would make recording time run backward", () => {
  const normalized = score();
  assert.throws(() => normalizeScoreMediaAnchors([
    { scoreBeat: 0, mediaTimeSeconds: 5 },
    { scoreBeat: 4, mediaTimeSeconds: 4 },
  ], normalized.totalBeats), /Later score anchors/);
});

test("builds a media-clock cue plan from score anchors", () => {
  const normalized = score();
  const loop = selectSheetMusicLoop(normalized, { startMeasureIndex: 0, endMeasureIndex: 1 });
  const plan = buildScoreMediaReferencePlan(normalized, loop, [
    { scoreBeat: 0, mediaTimeSeconds: 10 },
    { scoreBeat: 4, mediaTimeSeconds: 14 },
    { scoreBeat: 8, mediaTimeSeconds: 22 },
  ]);
  assert.deepEqual(plan.cues.map((cue) => cue.onsetMs), [0, 2_000, 4_000, 8_000]);
  assert.equal(plan.cues[0].notes[0].durationMs, 1_000);
  assert.equal(plan.cues[2].notes[0].durationMs, 2_000);
  assert.equal(plan.truncated, false);
});
