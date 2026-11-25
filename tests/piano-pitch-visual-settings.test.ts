import assert from "node:assert/strict";
import test from "node:test";
import {
  DEFAULT_PITCH_VISUAL_SETTINGS,
  PITCH_VISUAL_SETTINGS_STORAGE_KEY,
  normalizePitchVisualSettings,
  parsePitchVisualSettings,
  serializePitchVisualSettings,
  setAllPitchVisualEffects,
} from "../lib/piano-pitch-visual-settings.ts";

test("site-wide pitch visuals begin with staff placement and all four flashes", () => {
  assert.deepEqual(DEFAULT_PITCH_VISUAL_SETTINGS, {
    mode: "staff", glowFlash: true, noteFlash: true, staffFlash: true, nameFlash: true,
  });
  assert.match(PITCH_VISUAL_SETTINGS_STORAGE_KEY, /:v1$/);
  const initial = parsePitchVisualSettings(null);
  initial.glowFlash = false;
  assert.equal(DEFAULT_PITCH_VISUAL_SETTINGS.glowFlash, true, "fresh settings cannot mutate shared defaults");
});

test("missing, corrupt, and non-object stored values safely use defaults", () => {
  for (const stored of [undefined, null, "", "{", "null", "false", "3", '"vertical"', "[]", '[{"mode":"vertical"}]']) {
    assert.deepEqual(parsePitchVisualSettings(stored), DEFAULT_PITCH_VISUAL_SETTINGS);
  }
});

test("partial settings retain explicit false values while defaulting omitted effects", () => {
  assert.deepEqual(parsePitchVisualSettings('{"mode":"vertical","glowFlash":false}'), {
    mode: "vertical", glowFlash: false, noteFlash: true, staffFlash: true, nameFlash: true,
  });
  assert.deepEqual(normalizePitchVisualSettings({ noteFlash: false, staffFlash: false }), {
    mode: "staff", glowFlash: true, noteFlash: false, staffFlash: false, nameFlash: true,
  });
});

test("settings reject coercion and strip unrecognized fields", () => {
  assert.deepEqual(normalizePitchVisualSettings({
    mode: "diagonal", glowFlash: "false", noteFlash: 0, staffFlash: null, nameFlash: "false", unused: true,
  }), DEFAULT_PITCH_VISUAL_SETTINGS);
  assert.deepEqual(normalizePitchVisualSettings({
    mode: "vertical", glowFlash: false, noteFlash: true, staffFlash: false, futureField: "ignored",
  }), { mode: "vertical", glowFlash: false, noteFlash: true, staffFlash: false, nameFlash: true });
});

test("every flash combination round-trips in both placement modes", () => {
  for (const mode of ["staff", "vertical"] as const) {
    for (let bits = 0; bits < 16; bits += 1) {
      const settings = {
        mode, glowFlash: Boolean(bits & 1), noteFlash: Boolean(bits & 2), staffFlash: Boolean(bits & 4), nameFlash: Boolean(bits & 8),
      };
      assert.deepEqual(parsePitchVisualSettings(serializePitchVisualSettings(settings)), settings);
    }
  }
});

test("all-on and all-off preserve placement without mutating the original preferences", () => {
  const original = { mode: "vertical" as const, glowFlash: true, noteFlash: false, staffFlash: true, nameFlash: false };
  assert.deepEqual(setAllPitchVisualEffects(original, false), {
    mode: "vertical", glowFlash: false, noteFlash: false, staffFlash: false, nameFlash: false,
  });
  assert.deepEqual(setAllPitchVisualEffects(original, true), {
    mode: "vertical", glowFlash: true, noteFlash: true, staffFlash: true, nameFlash: true,
  });
  assert.deepEqual(original, { mode: "vertical", glowFlash: true, noteFlash: false, staffFlash: true, nameFlash: false });
});

test("legacy all-off preferences do not silently enable the new note-name effect", () => {
  const legacyOff = { mode: "vertical", glowFlash: false, noteFlash: false, staffFlash: false };
  assert.deepEqual(normalizePitchVisualSettings(legacyOff), { ...legacyOff, nameFlash: false });
  assert.equal(parsePitchVisualSettings(JSON.stringify(legacyOff)).nameFlash, false);
  assert.equal(normalizePitchVisualSettings({ ...legacyOff, nameFlash: true }).nameFlash, true,
    "an explicit new-layer choice wins over the legacy migration");
  assert.equal(normalizePitchVisualSettings({ ...legacyOff, nameFlash: false }).nameFlash, false);
  assert.equal(normalizePitchVisualSettings({ ...legacyOff, nameFlash: 1 }).nameFlash, false,
    "invalid new values must not undo an explicit old all-off preference");
  assert.equal(normalizePitchVisualSettings({ glowFlash: false, noteFlash: false }).nameFlash, true,
    "only all three explicit old opt-outs establish legacy All off");
});

test("note names can be selected independently in either layout", () => {
  for (const mode of ["staff", "vertical"] as const) {
    const namesOnly = { mode, glowFlash: false, noteFlash: false, staffFlash: false, nameFlash: true };
    assert.deepEqual(parsePitchVisualSettings(serializePitchVisualSettings(namesOnly)), namesOnly);
    assert.equal(normalizePitchVisualSettings({ mode, nameFlash: false }).nameFlash, false);
  }
});
