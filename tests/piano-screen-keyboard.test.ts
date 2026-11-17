import assert from "node:assert/strict";
import test from "node:test";
import {
  DEFAULT_PIANO_SCREEN_START,
  MAX_PIANO_SCREEN_START,
  pianoScreenKeyboardWindow,
  pianoScreenKeyPlacement,
  pianoScreenRangeLabel,
} from "../lib/piano-screen-keyboard.ts";

test("the blank screen keyboard begins with the unchanged 25 physical keys", () => {
  const window = pianoScreenKeyboardWindow();
  assert.equal(window.start, DEFAULT_PIANO_SCREEN_START);
  assert.deepEqual(window.notes, Array.from({ length: 25 }, (_, index) => 48 + index));
  assert.equal(window.whiteNotes.length, 15);
  assert.equal(window.octavesFromCenter, 0);
  assert.equal(pianoScreenKeyPlacement(48, window).physicalPosition, 1);
  assert.equal(pianoScreenKeyPlacement(72, window).physicalPosition, 25);
});

test("manual octave windows can reach every MIDI key without leaving MIDI bounds", () => {
  const reached = new Set<number>();
  for (let start = 0; start <= MAX_PIANO_SCREEN_START; start += 12) {
    const window = pianoScreenKeyboardWindow(start);
    assert.equal(window.start, start);
    assert.equal(window.canMoveLower, start > 0);
    assert.equal(window.canMoveHigher, start < MAX_PIANO_SCREEN_START);
    assert.ok(window.notes.length <= 25 && window.notes.length > 0);
    window.notes.forEach((note) => {
      assert.ok(Number.isInteger(note) && note >= 0 && note <= 127);
      reached.add(note);
    });
  }
  assert.deepEqual([...reached].sort((a, b) => a - b), Array.from({ length: 128 }, (_, index) => index));
});

test("window boundaries clamp safely and clip only the high end", () => {
  assert.equal(pianoScreenKeyboardWindow(-120).start, 0);
  assert.equal(pianoScreenKeyboardWindow(400).start, 120);
  assert.equal(pianoScreenKeyboardWindow(53).start, 48);
  for (const start of [Number.NaN, Infinity, -Infinity]) assert.equal(pianoScreenKeyboardWindow(start).start, 48);
  assert.deepEqual(pianoScreenKeyboardWindow(108).notes, Array.from({ length: 20 }, (_, index) => 108 + index));
  assert.deepEqual(pianoScreenKeyboardWindow(120).notes, Array.from({ length: 8 }, (_, index) => 120 + index));
});

test("white keys tile the range and every raised key remains correctly between neighbors", () => {
  for (let start = 0; start <= 120; start += 12) {
    const window = pianoScreenKeyboardWindow(start);
    window.whiteNotes.forEach((note, index) => {
      const key = pianoScreenKeyPlacement(note, window);
      assert.equal(key.black, false);
      assert.ok(Math.abs(key.leftPercent - index * 100 / window.whiteNotes.length) < 1e-10);
      assert.ok(key.leftPercent >= 0 && key.leftPercent + key.widthPercent <= 100 + 1e-10);
    });
    window.notes.filter((note) => !window.whiteNotes.includes(note)).forEach((note) => {
      const key = pianoScreenKeyPlacement(note, window);
      const before = pianoScreenKeyPlacement(note - 1, window);
      const after = pianoScreenKeyPlacement(note + 1, window);
      assert.equal(key.black, true);
      assert.ok(Math.abs(key.leftPercent - (before.leftPercent + before.widthPercent)) < 1e-10);
      assert.ok(Math.abs(key.leftPercent - after.leftPercent) < 1e-10);
      assert.ok(key.leftPercent - key.widthPercent / 2 >= 0);
      assert.ok(key.leftPercent + key.widthPercent / 2 <= 100);
      assert.equal(key.physicalPosition, window.notes.indexOf(note) + 1);
    });
  }
  assert.throws(() => pianoScreenKeyPlacement(127, pianoScreenKeyboardWindow()), /outside/);
});

test("range orientation remains relative and reveals no note names or hidden target", () => {
  assert.equal(pianoScreenRangeLabel(0), "Centered range");
  assert.equal(pianoScreenRangeLabel(-1), "1 octave lower");
  assert.equal(pianoScreenRangeLabel(-4), "4 octaves lower");
  assert.equal(pianoScreenRangeLabel(6), "6 octaves higher");
});
