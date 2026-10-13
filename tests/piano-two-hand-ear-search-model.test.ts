import assert from "node:assert/strict";
import test from "node:test";
import {
  buildEarSearchChunks,
  earSearchPlaybackLandingAt,
  earSearchLandingsForChunk,
  summarizeEarSearchHandProgress,
  type EarSearchLanding,
} from "../lib/piano-ear-search-model.ts";
import { normalizeSheetMusicScore } from "../lib/sheet-music-coach-model.ts";

function landing(id: string, staff: EarSearchLanding["staff"]): EarSearchLanding {
  return {
    id,
    notes: [60],
    measureIndex: 0,
    measureNumber: "1",
    staff,
  };
}

function staffRouteScore() {
  return normalizeSheetMusicScore({
    id: "staff-route",
    title: "Staff route",
    tempoBpm: 96,
    measures: [{
      number: 1,
      durationBeats: 4,
      events: [
        // Deliberately cross pitch range and supplied hand metadata: routing
        // must follow the authored score staff and never infer a physical hand.
        { id: "upper-low", kind: "note" as const, midi: 48, offsetBeats: 0, durationBeats: 1, staff: 1, hand: "left" as const },
        { id: "lower-high", kind: "note" as const, midi: 72, offsetBeats: 1, durationBeats: 1, staff: 2, hand: "right" as const },
        { id: "shared-upper", kind: "note" as const, midi: 67, offsetBeats: 2, durationBeats: 1, staff: 1, hand: "left" as const },
        { id: "shared-lower", kind: "note" as const, midi: 55, offsetBeats: 2, durationBeats: 1, staff: 2, hand: "right" as const },
        { id: "unassigned", kind: "note" as const, midi: 60, offsetBeats: 3, durationBeats: 1, staff: 3, hand: "unknown" as const },
      ],
    }],
  });
}

function staffAnchorScore() {
  return normalizeSheetMusicScore({
    id: "staff-anchors",
    title: "Staff anchors",
    tempoBpm: 96,
    measures: [{
      number: 1,
      durationBeats: 4,
      events: [
        ...[60, 67].map((midi, index) => ({ id: `right-a-${index}`, kind: "note" as const, midi, offsetBeats: 0, durationBeats: 1, staff: 1, hand: "right" as const })),
        ...[48, 55].map((midi, index) => ({ id: `left-a-${index}`, kind: "note" as const, midi, offsetBeats: 0, durationBeats: 1, staff: 2, hand: "left" as const })),
        ...[62, 69].map((midi, index) => ({ id: `right-b-${index}`, kind: "note" as const, midi, offsetBeats: 1, durationBeats: 1, staff: 1, hand: "right" as const })),
        ...[50, 57].map((midi, index) => ({ id: `left-b-${index}`, kind: "note" as const, midi, offsetBeats: 1, durationBeats: 1, staff: 2, hand: "left" as const })),
      ],
    }],
  });
}

test("two-hand landings retain upper, lower, shared, and unknown staff identity", () => {
  const score = staffRouteScore();
  const chunk = buildEarSearchChunks(score, { hand: "both", maxLandings: 4 })[0];
  assert.ok(chunk);

  const route = earSearchLandingsForChunk(score, chunk, { hand: "both", voice: "full" });
  assert.deepEqual(route.map((item) => item.staff), ["upper", "lower", "both", "unknown"]);
  assert.deepEqual(route.map((item) => item.notes), [[48], [72], [55, 67], [60]]);
});

test("top-note and bass-note routes name the staff that authored the selected pitch", () => {
  const score = staffRouteScore();
  const chunk = buildEarSearchChunks(score, { hand: "both", maxLandings: 4 })[0];
  assert.ok(chunk);

  const upperVoice = earSearchLandingsForChunk(score, chunk, { hand: "both", voice: "upper" });
  const bassVoice = earSearchLandingsForChunk(score, chunk, { hand: "both", voice: "bass" });
  assert.deepEqual(upperVoice.map((item) => item.staff), ["upper", "lower", "upper", "unknown"]);
  assert.deepEqual(bassVoice.map((item) => item.staff), ["upper", "lower", "lower", "unknown"]);
});

test("staff-anchor listening keeps one landmark from each authored score staff", () => {
  const score = staffAnchorScore();
  const chunk = buildEarSearchChunks(score, { hand: "both", maxLandings: 4 })[0];
  assert.ok(chunk);

  const anchors = earSearchLandingsForChunk(score, chunk, { hand: "both", voice: "staff-anchors" });
  const full = earSearchLandingsForChunk(score, chunk, { hand: "both", voice: "full" });
  assert.deepEqual(anchors.map((item) => item.notes), [[48, 67], [50, 69]]);
  assert.deepEqual(anchors.map((item) => item.staff), ["both", "both"]);
  assert.deepEqual(full.map((item) => item.notes), [[48, 55, 60, 67], [50, 57, 62, 69]]);
});

test("playback staff cues go neutral through written or compacted silence", () => {
  const cues = [
    { onsetMs: 0, notes: [{ onsetOffsetMs: 0, durationMs: 200 }] },
    { onsetMs: 1_000, notes: [{ onsetOffsetMs: 50, durationMs: 180 }] },
  ];

  assert.equal(earSearchPlaybackLandingAt(cues, 0), 0);
  assert.equal(earSearchPlaybackLandingAt(cues, 199), 0);
  assert.equal(earSearchPlaybackLandingAt(cues, 200), null);
  assert.equal(earSearchPlaybackLandingAt(cues, 1_049), null);
  assert.equal(earSearchPlaybackLandingAt(cues, 1_050), 1);
  assert.equal(earSearchPlaybackLandingAt(cues, 1_229), 1);
  assert.equal(earSearchPlaybackLandingAt(cues, 1_230), null);
  assert.throws(() => earSearchPlaybackLandingAt(cues, -1), /non-negative/i);
});

test("hand progress counts a shared landing in both lanes while preserving a shared total", () => {
  const route = [
    landing("upper-a", "upper"),
    landing("lower-a", "lower"),
    landing("shared-a", "both"),
    landing("unknown-a", "unknown"),
  ];

  assert.deepEqual(summarizeEarSearchHandProgress(route, 0), {
    upper: { caught: 0, total: 2 },
    lower: { caught: 0, total: 2 },
    shared: { caught: 0, total: 1 },
    nextStaff: "upper",
  });
  assert.deepEqual(summarizeEarSearchHandProgress(route, 2), {
    upper: { caught: 1, total: 2 },
    lower: { caught: 1, total: 2 },
    shared: { caught: 0, total: 1 },
    nextStaff: "both",
  });
  assert.deepEqual(summarizeEarSearchHandProgress(route, 3), {
    upper: { caught: 2, total: 2 },
    lower: { caught: 2, total: 2 },
    shared: { caught: 1, total: 1 },
    nextStaff: "unknown",
  });
});

test("hand progress clamps completed-prefix bounds without inventing staff credit", () => {
  const route = [landing("upper-a", "upper"), landing("unknown-a", "unknown"), landing("lower-a", "lower")];

  assert.deepEqual(summarizeEarSearchHandProgress(route, -20), {
    upper: { caught: 0, total: 1 },
    lower: { caught: 0, total: 1 },
    shared: { caught: 0, total: 0 },
    nextStaff: "upper",
  });
  assert.deepEqual(summarizeEarSearchHandProgress(route, 99), {
    upper: { caught: 1, total: 1 },
    lower: { caught: 1, total: 1 },
    shared: { caught: 0, total: 0 },
    nextStaff: null,
  });
});

test("hand progress rejects ambiguous non-integer and non-finite prefix positions", () => {
  const route = [landing("upper-a", "upper")];
  for (const value of [0.5, Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]) {
    assert.throws(() => summarizeEarSearchHandProgress(route, value), /integer|finite/i);
  }
});
