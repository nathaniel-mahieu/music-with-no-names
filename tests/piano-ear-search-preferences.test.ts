import assert from "node:assert/strict";
import test from "node:test";
import {
  DEFAULT_EAR_SEARCH_CHORD_WINDOW,
  EAR_SEARCH_CHORD_WINDOWS,
  EAR_SEARCH_GATHER_STORAGE_KEY,
  parseEarSearchChordWindow,
} from "../lib/piano-ear-search-preferences.ts";

test("untimed Sound Finder offers bounded 300, 600, and 1000 millisecond chord windows", () => {
  assert.deepEqual(EAR_SEARCH_CHORD_WINDOWS, [300, 600, 1000]);
  assert.equal(Object.isFrozen(EAR_SEARCH_CHORD_WINDOWS), true);
  for (const windowMs of EAR_SEARCH_CHORD_WINDOWS) {
    assert.equal(Number.isInteger(windowMs), true);
    assert.ok(windowMs >= 40 && windowMs <= 1000, "every preference stays inside the matching model's bounds");
  }
});

test("missing gather preferences use the independent forgiving 600 millisecond default", () => {
  assert.equal(DEFAULT_EAR_SEARCH_CHORD_WINDOW, 600);
  for (const value of [undefined, null, ""]) assert.equal(parseEarSearchChordWindow(value), 600);
});

test("canonical stored selector values round-trip exactly", () => {
  for (const windowMs of EAR_SEARCH_CHORD_WINDOWS) {
    assert.equal(parseEarSearchChordWindow(String(windowMs)), windowMs);
  }
});

test("legacy, corrupt, oversized, and coerced-looking preferences safely reset to 600 milliseconds", () => {
  for (const value of [
    "140", "240", "480", "40", "299", "601", "999", "1001", "0", "-300", "Infinity", "NaN",
    " 300", "300 ", "\t300", "\n1000", "300.0", "3e2", "+300", "0300", '"300"', "null", "false", "{}", "[]",
  ]) {
    assert.equal(parseEarSearchChordWindow(value), 600, JSON.stringify(value));
  }
  for (const value of [300, 1000, true, {}, [], Number.NaN]) {
    assert.equal(parseEarSearchChordWindow(value as unknown as string), 600, "non-string values must not be coerced");
  }
});

test("the gather preference has a stable, feature-specific storage key", () => {
  assert.equal(EAR_SEARCH_GATHER_STORAGE_KEY, "music-with-no-names:ear-search-gather:v1");
});
