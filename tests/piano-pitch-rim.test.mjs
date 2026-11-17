import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

test("raw MIDI attacks retain separate bounded pitch-color rim slots", async () => {
  const [visuals, css] = await Promise.all([
    readFile(new URL("../app/PitchVisuals.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/PitchVisuals.module.css", import.meta.url), "utf8"),
  ]);

  assert.match(visuals, /const EDGE_RIM_SLOTS = 12/);
  assert.match(visuals, /const activeRimSlots = new Set\(rimLayers[\s\S]*\.filter\(isRimAnimating\)[\s\S]*\.map\(readRimSlot\)/,
    "each one-note MIDI message must account for rims still fading from adjacent attacks");
  assert.match(visuals, /const retainedSlot = isRimAnimating\(rim\) \? readRimSlot\(rim\) : null/,
    "a repeated pitch should restart its own color band instead of consuming another slot");
  assert.match(visuals, /find\(\(candidate\) => !activeRimSlots\.has\(candidate\)\)/,
    "a new concurrent pitch should use the first free concentric band");
  assert.match(visuals, /rim\.dataset\.rimSlot = String\(slot\)/);
  assert.match(visuals, /rim\.style\.setProperty\("--pitch-rim-inset", `\$\{slot \* 3\}px`\)/);
  assert.match(visuals, /\? \[\{ opacity: 1 \}, \{ opacity: 1 \}\][\s\S]*\{ opacity: 1, offset: \.22 \}[\s\S]*duration: reducedMotion \? 330 : 820/);
  assert.match(css, /\.edgeRim > span \{[^}]*inset: var\(--pitch-rim-inset, 0\);[^}]*border: 3px solid var\(--pitch-glow-color\);[^}]*opacity: 0/);
});
