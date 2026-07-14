import assert from "node:assert/strict";
import test from "node:test";
import { parsePianoPhraseSpecimen, parsePianoSessionSummary } from "../lib/piano-session.ts";

const phraseEvent = (id: number, note: number, onsetMs: number) => ({ id, note, onsetMs });

test("summarizes a valid tab-scoped piano phrase", () => {
  assert.deepEqual(parsePianoSessionSummary(JSON.stringify({
    version: 12,
    focusLens: "chords",
    phraseEvents: [phraseEvent(1, 60, 100), phraseEvent(2, 64, 180)],
  })), { attackCount: 2, focusLens: "chords" });
});

test("falls back to the whole-phrase lens for older sessions", () => {
  assert.deepEqual(parsePianoSessionSummary(JSON.stringify({
    version: 2,
    phraseEvents: [phraseEvent(1, 60, 100)],
  })), { attackCount: 1, focusLens: "explore" });
});

test("rejects malformed or implausibly large session data", () => {
  assert.equal(parsePianoSessionSummary(null), null);
  assert.equal(parsePianoSessionSummary("not json"), null);
  assert.equal(parsePianoSessionSummary(JSON.stringify({ phraseEvents: [{ note: 200 }] })), null);
  assert.equal(parsePianoSessionSummary(JSON.stringify({
    phraseEvents: Array.from({ length: 513 }, (_, id) => phraseEvent(id, 60, id)),
  })), null);
});

test("extracts a sorted, minimal phrase specimen without exposing session controls", () => {
  assert.deepEqual(parsePianoPhraseSpecimen(JSON.stringify({
    focusLens: "motion",
    phraseEvents: [
      { ...phraseEvent(2, 64, 180), velocity: 96, releaseMs: 260, fieldNotes: [60, 64] },
      { ...phraseEvent(1, 60, 100), releaseMs: null, fieldNotes: [60] },
    ],
  })), [
    { id: 1, note: 60, velocity: 64, onsetMs: 100, releaseMs: null },
    { id: 2, note: 64, velocity: 96, onsetMs: 180, releaseMs: 260 },
  ]);
});

test("rejects impossible velocity and release data before projection", () => {
  assert.equal(parsePianoPhraseSpecimen(JSON.stringify({ phraseEvents: [{ ...phraseEvent(1, 60, 100), velocity: 180 }] })), null);
  assert.equal(parsePianoPhraseSpecimen(JSON.stringify({ phraseEvents: [{ ...phraseEvent(1, 60, 100), releaseMs: 50 }] })), null);
});
