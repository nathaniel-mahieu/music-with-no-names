import assert from "node:assert/strict";
import test from "node:test";
import { parsePianoSessionSummary } from "../lib/piano-session.ts";

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
