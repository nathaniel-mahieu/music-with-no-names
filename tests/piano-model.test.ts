import assert from "node:assert/strict";
import test from "node:test";
import {
  PIANO_SCALES,
  fifthsCircle,
  frequencyFromMidi,
  intervalLandmark,
  noteContext,
  pairwiseIntervals,
  parseMidiMessage,
  scaleCoverage,
  scaleSemitones,
} from "../lib/piano-model.ts";

test("maps equal-tempered MIDI notes to physical frequency", () => {
  assert.equal(frequencyFromMidi(69), 440);
  assert.ok(Math.abs(frequencyFromMidi(60) - 261.625565) < 0.00001);
  assert.ok(Math.abs(frequencyFromMidi(72) / frequencyFromMidi(60) - 2) < 1e-12);
});

test("builds each scale as an octave-closing route", () => {
  for (const scale of PIANO_SCALES) {
    assert.equal(scale.steps.reduce((sum, step) => sum + step, 0), 12);
    assert.equal(scaleSemitones(scale).length, scale.solfege.length);
    assert.deepEqual(scaleSemitones(scale).slice(0, 1), [0]);
  }
  assert.deepEqual(scaleSemitones(PIANO_SCALES[0]), [0, 2, 4, 5, 7, 9, 11]);
  assert.deepEqual(scaleSemitones(PIANO_SCALES[3]), [0, 3, 5, 6, 7, 10]);
});

test("keeps movable-Do context invariant under transposition", () => {
  const scale = PIANO_SCALES[0];
  const low = noteContext(67, 60, scale);
  const high = noteContext(74, 67, scale);
  assert.equal(low.syllable, "Sol");
  assert.equal(high.syllable, "Sol");
  assert.equal(low.stepsWithinOctave, high.stepsWithinOctave);
  assert.equal(low.ratioToDo, high.ratioToDo);
});

test("describes keyboard intervals beside nearby physical landmarks", () => {
  const fifth = intervalLandmark(7);
  assert.equal(fifth.relationship, "3:2 region");
  assert.ok(Math.abs(Math.abs(fifth.errorCents) - 1.955) < 0.01);
  const octave = intervalLandmark(12);
  assert.equal(octave.equalKeyboardRatio, 2);
  assert.equal(octave.errorCents, 0);
  assert.equal(pairwiseIntervals([60, 64, 67]).length, 3);
});

test("measures scale membership without turning it into quality", () => {
  const scale = PIANO_SCALES[0];
  const inside = scaleCoverage([60, 64, 67], 60, scale);
  assert.equal(inside.fraction, 1);
  assert.equal(inside.hasHome, true);
  const mixed = scaleCoverage([60, 61, 67], 60, scale);
  assert.equal(mixed.inScaleCount, 2);
  assert.equal(mixed.fraction, 2 / 3);
});

test("derives the circle from stacked fifths and exposes its closure mismatch", () => {
  const circle = fifthsCircle();
  assert.equal(circle.nodes.length, 12);
  assert.deepEqual(circle.nodes.slice(0, 4).map((node) => node.syllable), ["Do", "Sol", "Re", "La"]);
  assert.ok(Math.abs(circle.nodes[1].foldedRatio - 1.5) < 1e-12);
  assert.ok(Math.abs(circle.nodes[1].driftCents - 1.955) < 0.01);
  assert.ok(Math.abs(circle.closureDriftCents - 23.46) < 0.02);
});

test("parses note, zero-velocity note-off, and sustain MIDI messages", () => {
  assert.deepEqual(parseMidiMessage([0x91, 60, 100]), { type: "note-on", note: 60, velocity: 100, channel: 1 });
  assert.deepEqual(parseMidiMessage([0x91, 60, 0]), { type: "note-off", note: 60, channel: 1 });
  assert.deepEqual(parseMidiMessage([0x80, 64, 25]), { type: "note-off", note: 64, channel: 0 });
  assert.deepEqual(parseMidiMessage([0xb0, 64, 127]), { type: "sustain", down: true, channel: 0 });
  assert.deepEqual(parseMidiMessage([0xb0, 64, 0]), { type: "sustain", down: false, channel: 0 });
});
