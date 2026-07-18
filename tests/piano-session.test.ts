import assert from "node:assert/strict";
import test from "node:test";
import { parsePianoHarmonySpecimen, parsePianoPhraseSpecimen, parsePianoSessionSummary } from "../lib/piano-session.ts";

const phraseEvent = (id: number, note: number, onsetMs: number) => ({ id, note, onsetMs });

test("summarizes a valid tab-scoped piano phrase", () => {
  assert.deepEqual(parsePianoSessionSummary(JSON.stringify({
    version: 12,
    focusLens: "chords",
    phraseEvents: [phraseEvent(1, 60, 100), phraseEvent(2, 64, 180)],
  })), { attackCount: 2, focusLens: "chords" });
});

test("preserves the immersive relationship-sky lens in the tab summary", () => {
  assert.deepEqual(parsePianoSessionSummary(JSON.stringify({
    version: 25,
    focusLens: "immersion",
    phraseEvents: [phraseEvent(1, 60, 100), phraseEvent(2, 67, 240)],
  })), { attackCount: 2, focusLens: "immersion" });
});

test("preserves the research HUD lens in the tab summary", () => {
  assert.deepEqual(parsePianoSessionSummary(JSON.stringify({
    version: 25,
    focusLens: "research",
    phraseEvents: [phraseEvent(1, 60, 100), phraseEvent(2, 61, 240)],
  })), { attackCount: 2, focusLens: "research" });
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

test("projects only bounded chord grouping settings for cross-lab harmony", () => {
  const specimen = parsePianoHarmonySpecimen(JSON.stringify({
    version: 15,
    chordWindowMs: 320,
    boundaryCorrections: { 2: "join", 3: "break", 4: "invalid", 999: "join" },
    phraseEvents: [
      { id: 1, note: 60, velocity: 90, onsetMs: 0, releaseMs: 400 },
      { id: 2, note: 64, velocity: 80, onsetMs: 120, releaseMs: 450 },
      { id: 3, note: 67, velocity: 70, onsetMs: 600, releaseMs: 900 },
    ],
  }));
  assert.ok(specimen);
  assert.equal(specimen.chordWindowMs, 320);
  assert.deepEqual(specimen.boundaryCorrections, { 2: "join", 3: "break" });
  assert.deepEqual(specimen.events.map((event) => event.note), [60, 64, 67]);

  const fallback = parsePianoHarmonySpecimen(JSON.stringify({ chordWindowMs: 999, phraseEvents: specimen.events }));
  assert.equal(fallback?.chordWindowMs, 160);
});
