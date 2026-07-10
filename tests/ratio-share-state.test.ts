import assert from "node:assert/strict";
import test from "node:test";
import { parseRatioShareState, ratioShareSearch } from "../lib/ratio-share-state.ts";

test("round-trips a shareable ratio experiment", () => {
  const search = ratioShareSearch({ ratio: 5 / 4, referenceHz: 196, timbre: "sine" });
  assert.deepEqual(parseRatioShareState(search), {
    ratio: 1.25,
    referenceHz: 196,
    timbre: "sine",
  });
});

test("rejects out-of-range and unknown share state", () => {
  assert.deepEqual(parseRatioShareState("?ratio=9&hz=-1&timbre=metal"), {
    ratio: 1.5,
    referenceHz: 220,
    timbre: "harmonic",
  });
});
