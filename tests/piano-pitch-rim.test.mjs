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
  assert.match(visuals, /const rimInset = `\$\{slot \* 3\}px`/);
  assert.match(visuals, /rim\.style\.setProperty\("--pitch-rim-inset", rimInset\)/);
  assert.match(visuals, /halo\??\.style\.setProperty\("--pitch-rim-inset", rimInset\)/,
    "a chord member's wash must begin at the exact same inset as its crisp band");
  assert.match(visuals, /\? \[\{ opacity: 1 \}, \{ opacity: 1 \}\][\s\S]*\{ opacity: 1, offset: \.22 \}[\s\S]*duration: reducedMotion \? 330 : 820/);
  assert.match(css, /\.edgeRim > span \{[^}]*inset: var\(--pitch-rim-inset, 0\);[^}]*border: 3px solid var\(--pitch-glow-color\);[^}]*opacity: 0/);
});

test("the wide edge wash rolls continuously from the solid band with one shared fade", async () => {
  const [visuals, css] = await Promise.all([
    readFile(new URL("../app/PitchVisuals.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/PitchVisuals.module.css", import.meta.url), "utf8"),
  ]);
  const edgeEffects = visuals.slice(visuals.indexOf("if (current.glowFlash) {"), visuals.indexOf("if (staffMode && current.noteFlash)"));
  assert.match(visuals, /const animateEdge = \(element:/);
  assert.match(edgeEffects, /animateEdge\(halo\)/);
  assert.match(edgeEffects, /animateEdge\(rim\)/,
    "rim and halo must use the same full-opacity keyframes, hold, duration, and reduced-motion behavior");
  assert.doesNotMatch(edgeEffects, /\.46,\s*\.31/,
    "the old lower-opacity halo creates a visible brightness step behind the opaque border");

  const halo = css.match(/\.edgeGlow > span \{([^}]+)\}/)?.[1] ?? "";
  assert.match(halo, /inset: var\(--pitch-rim-inset, 0\)/);
  assert.doesNotMatch(halo, /border-radius|box-shadow|--edge-glow-width|vmin/,
    "rounded or narrow halo geometry must not leave a seam against the rectangular border");
  for (const [token, alpha] of [["shoulder", 74], ["middle", 38], ["tail", 12]]) {
    assert.match(halo, new RegExp(`--edge-glow-${token}:\\s*color-mix\\(in srgb, var\\(--pitch-glow-color\\) ${alpha}%, transparent\\)`));
  }
  const gradients = [...halo.matchAll(/linear-gradient\((90|180)deg,\s*([^;]+?)\)(?=,\s*linear-gradient|;)/g)];
  assert.equal(gradients.length, 2, "each screen axis needs the same broad percentage-based rolloff");
  for (const [, , stops] of gradients) {
    assert.match(stops, /var\(--pitch-glow-color\)(?: 0)? 3px/,
      "the wash must remain fully opaque through the hard border before beginning its rolloff");
    assert.match(stops, /var\(--edge-glow-shoulder\) 6%,\s*var\(--edge-glow-middle\) 14%,\s*var\(--edge-glow-tail\) 24%,\s*transparent 32%,\s*transparent 68%,\s*var\(--edge-glow-tail\) 76%,\s*var\(--edge-glow-middle\) 86%,\s*var\(--edge-glow-shoulder\) 94%,\s*var\(--pitch-glow-color\) calc\(100% - 3px\)/,
      "opacity must decrease monotonically to 32% of each axis and mirror smoothly at the far edge");
  }
});
