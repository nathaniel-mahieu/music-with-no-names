import assert from "node:assert/strict";
import test from "node:test";

import {
  COLOR_TEXTURE_CONSTRUCTIONS,
  COLOR_TEXTURE_KEYS,
  COLOR_TEXTURE_ROLES,
  colorTextureFrameAtBeat,
  getColorTextureSequence,
  getDemoPitchColor,
} from "../lib/piano-color-texture-model.ts";

test("the constructions cover six different authored musical questions", () => {
  assert.equal(new Set(COLOR_TEXTURE_CONSTRUCTIONS.map((construction) => construction.id)).size, 6);
  assert.deepEqual(new Set(COLOR_TEXTURE_CONSTRUCTIONS.map((construction) => construction.mode)), new Set(["major", "minor"]));
  assert.equal(new Set(COLOR_TEXTURE_KEYS.map((key) => key.pitchClass)).size, 12);
  assert.deepEqual(Object.keys(COLOR_TEXTURE_ROLES).sort(), ["anchor", "flow", "friction", "pull", "release", "suspension"]);
});

test("every transposition and register keeps a contiguous finite score inside the piano range", () => {
  for (const construction of COLOR_TEXTURE_CONSTRUCTIONS) {
    for (const key of COLOR_TEXTURE_KEYS) {
      for (const shift of [-1, 0, 1]) {
        const sequence = getColorTextureSequence(construction.id, key.pitchClass, shift);
        let expectedBeat = 0;
        assert.equal(sequence.totalBeats, 16);
        assert.equal(sequence.frames[0].texture, "anchor");
        assert.equal(sequence.frames.at(-1)?.texture, "release");
        for (const frame of sequence.frames) {
          assert.equal(frame.beat, expectedBeat);
          assert.ok(Number.isFinite(frame.durationBeats) && frame.durationBeats > 0);
          assert.equal(frame.notes.filter((note) => note.voice === "bass").length, 1);
          assert.equal(frame.notes.filter((note) => note.voice === "melody").length, 1);
          assert.equal(new Set(frame.notes.map((note) => note.midi)).size, frame.notes.length);
          assert.ok(frame.notes.every((note) => Number.isInteger(note.midi) && note.midi >= 21 && note.midi <= 108));
          assert.ok(frame.notes.every((note) => note.role in COLOR_TEXTURE_ROLES));
          expectedBeat += frame.durationBeats;
        }
        assert.equal(expectedBeat, sequence.totalBeats);
      }
    }
  }
});

test("transposition preserves degrees, texture roles, score time, and every voiced interval", () => {
  for (const construction of COLOR_TEXTURE_CONSTRUCTIONS) {
    const source = getColorTextureSequence(construction.id, 0);
    for (let pc = 1; pc < 12; pc += 1) {
      const transposed = getColorTextureSequence(construction.id, pc);
      source.frames.forEach((frame, index) => {
        const other = transposed.frames[index];
        assert.equal(other.beat, frame.beat);
        assert.equal(other.durationBeats, frame.durationBeats);
        assert.equal(other.texture, frame.texture);
        frame.notes.forEach((note, noteIndex) => {
          assert.equal(other.notes[noteIndex].midi - note.midi, pc);
          assert.equal(other.notes[noteIndex].degree, note.degree);
          assert.equal(other.notes[noteIndex].role, note.role);
          assert.equal(other.notes[noteIndex].sustainFromPrevious, note.sustainFromPrevious);
        });
      });
    }
  }
});

test("the same pitch changes contextual role without changing color or register", () => {
  const sequence = getColorTextureSequence("held-color", 0);
  const melody = sequence.frames.map((frame) => frame.notes.find((note) => note.voice === "melody")!);
  assert.deepEqual(melody.map((note) => note.midi), [72, 72, 72, 72]);
  assert.deepEqual(melody.map((note) => note.role), ["anchor", "flow", "suspension", "release"]);
  assert.equal(new Set(melody.map((note) => getDemoPitchColor(note.midi).color)).size, 1);
  assert.deepEqual(sequence.frames.map((frame) => frame.chord), ["C", "F", "G7(add11)", "C"]);
});

test("the suspended fourth moves down to the third before the leading-tone return", () => {
  const sequence = getColorTextureSequence("suspension", 0);
  assert.deepEqual(sequence.frames.map((frame) => frame.notes.find((note) => note.voice === "melody")!.midi), [72, 72, 71, 72]);
  const suspended = sequence.frames[1];
  assert.equal(suspended.texture, "suspension");
  assert.equal(suspended.chord, "G7sus4");
  assert.equal(suspended.notes.filter((note) => note.role === "suspension").length, 1);
  assert.equal(suspended.notes.find((note) => note.voice === "bass")!.role, "anchor");
  assert.ok(!suspended.notes.some((note) => note.midi % 12 === 11));
  assert.ok(sequence.frames[2].notes.some((note) => note.midi % 12 === 11));
});

test("sustains continue only the same authored melody voice and never cross a loop boundary", () => {
  for (const construction of COLOR_TEXTURE_CONSTRUCTIONS) {
    for (const key of COLOR_TEXTURE_KEYS) {
      const sequence = getColorTextureSequence(construction.id, key.pitchClass);
      assert.ok(sequence.frames[0].notes.every((note) => !note.sustainFromPrevious));
      sequence.frames.forEach((frame, index) => {
        for (const note of frame.notes.filter((entry) => entry.sustainFromPrevious)) {
          assert.equal(note.voice, "melody");
          assert.ok(index > 0);
          assert.ok(sequence.frames[index - 1].notes.some((previous) => previous.voice === note.voice && previous.midi === note.midi));
        }
      });
      const sustainedFrames = sequence.frames.filter((frame) => frame.notes.some((note) => note.sustainFromPrevious)).map((frame) => frame.id);
      const expected = construction.id === "held-color" ? ["held-color-1", "held-color-2", "held-color-3"] : construction.id === "suspension" ? ["suspension-1"] : [];
      assert.deepEqual(sustainedFrames, expected);
    }
  }
});

test("the minor cadence explicitly raises its leading tone and keeps the minor tonic", () => {
  const sequence = getColorTextureSequence("minor-cadence", 0);
  assert.equal(sequence.mode, "minor");
  assert.deepEqual(sequence.frames.map((frame) => frame.chord), ["Cm", "Fm", "G7", "Cm"]);
  assert.ok(sequence.frames[0].notes.some((note) => note.midi % 12 === 3));
  assert.equal(sequence.frames[2].notes.find((note) => note.voice === "melody")!.degree, "7");
});

test("the chromatic detour is an actual secondary dominant with its local resolution", () => {
  const sequence = getColorTextureSequence("chromatic-detour", 0);
  const secondary = sequence.frames[2];
  assert.equal(secondary.chord, "D7");
  assert.equal(secondary.texture, "friction");
  assert.deepEqual(new Set(secondary.notes.map((note) => note.midi % 12)), new Set([2, 0, 6, 9]));
  assert.equal(secondary.notes.find((note) => note.voice === "melody")!.degree, "♯4");
  assert.equal(sequence.frames[3].chord, "G");
});

test("frame boundaries use the same half-open score clock including score end", () => {
  const sequence = getColorTextureSequence("homecoming", 0);
  assert.equal(colorTextureFrameAtBeat(sequence, 0)?.label, "I");
  assert.equal(colorTextureFrameAtBeat(sequence, 3.999)?.label, "I");
  assert.equal(colorTextureFrameAtBeat(sequence, 4)?.label, "IV");
  assert.equal(colorTextureFrameAtBeat(sequence, 8)?.label, "V7");
  assert.equal(colorTextureFrameAtBeat(sequence, 15.999)?.label, "I");
  assert.equal(colorTextureFrameAtBeat(sequence, 16), null);
  assert.equal(colorTextureFrameAtBeat(sequence, -1), null);
  assert.equal(colorTextureFrameAtBeat(sequence, NaN), null);
});

test("all twelve pitches share octave lightness while hue repeats in every register", () => {
  for (let octave = 0; octave <= 8; octave += 1) {
    const colors = Array.from({ length: 12 }, (_, pc) => getDemoPitchColor((octave + 1) * 12 + pc));
    assert.equal(new Set(colors.map((color) => color.lightness)).size, 1);
    assert.equal(new Set(colors.map((color) => color.gray)).size, 1);
    assert.ok(Math.abs(colors[0].lightness - (.64 + .015 * octave)) < 1e-12);
    assert.ok(Math.abs(colors[0].grayLightness - (.20 + .08 * octave)) < 1e-12);
    colors.forEach((color, pc) => assert.equal(color.hue, (245 + pc * 30) % 360));
  }
  assert.equal(getDemoPitchColor(60).note, "C4");
  assert.equal(getDemoPitchColor(61).note, "C♯4");
  assert.ok(getDemoPitchColor(60).chroma > .15);
});

test("vivid colors stay inside sRGB even at extreme octaves without changing shared lightness", () => {
  for (let midi = 0; midi < 128; midi += 1) {
    const { lightness: L, chroma: C, hue: h } = getDemoPitchColor(midi);
    const a = C * Math.cos(h * Math.PI / 180), b = C * Math.sin(h * Math.PI / 180);
    const l = (L + .3963377774 * a + .2158037573 * b) ** 3;
    const m = (L - .1055613458 * a - .0638541728 * b) ** 3;
    const s = (L - .0894841775 * a - 1.291485548 * b) ** 3;
    const channels = [4.0767416621 * l - 3.3077115913 * m + .2309699292 * s, -1.2684380046 * l + 2.6097574011 * m - .3413193965 * s, -.0041960863 * l - .7034186147 * m + 1.707614701 * s];
    assert.ok(channels.every((channel) => channel >= 0 && channel <= 1), `MIDI ${midi}: ${channels}`);
  }
});

test("invalid selection values recover to a finite reproducible demo", () => {
  assert.equal(getColorTextureSequence("unknown", NaN, Infinity).id, "homecoming");
  assert.deepEqual(getColorTextureSequence("homecoming", -1), getColorTextureSequence("homecoming", 11));
  assert.deepEqual(getColorTextureSequence("homecoming", 0, 99), getColorTextureSequence("homecoming", 0, 1));
  assert.equal(getDemoPitchColor(NaN).note, "C4");
  assert.equal(getDemoPitchColor(-30).note, "C-1");
  assert.equal(getDemoPitchColor(1000).note, "G9");
});

test("callers receive independent score notes rather than mutating authored templates", () => {
  const first = getColorTextureSequence("homecoming", 0);
  first.frames[0].notes[0].midi = 99;
  first.frames[0].notes.push({ midi: 80, role: "friction", voice: "melody", degree: "♭6" });
  const second = getColorTextureSequence("homecoming", 0);
  assert.equal(second.frames[0].notes[0].midi, 48);
  assert.equal(second.frames[0].notes.length, 5);
});
