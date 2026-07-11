import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

const LABS = ["GuideLab", "EarLab", "HarmonyLab", "RhythmLab", "JourneyLab", "RecordingLab", "AtlasLab", "PersonalLab"];

test("every learning lab exposes a named semantic region", async () => {
  for (const lab of LABS) {
    const source = await readFile(new URL(`../app/${lab}.tsx`, import.meta.url), "utf8");
    assert.match(source, /<section[^>]+aria-labelledby=/, `${lab} needs aria-labelledby`);
  }
});

test("dynamic visuals and status changes expose nonvisual descriptions", async () => {
  const [ratio, recording, journey, atlas] = await Promise.all([
    readFile(new URL("../app/RatioLab.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/RecordingLab.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/JourneyLab.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/AtlasLab.tsx", import.meta.url), "utf8"),
  ]);
  assert.match(ratio, /<canvas[^>]+role="img"[^>]+aria-label=/);
  assert.match(recording, /aria-live="polite"/);
  assert.match(journey, /role="img" aria-label=/);
  assert.match(atlas, /aria-label=\{`Music landmarks positioned/);
});

test("focus, reduced-motion, and non-color contracts are present", async () => {
  const css = await readFile(new URL("../app/globals.css", import.meta.url), "utf8");
  assert.match(css, /select:focus-visible/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)/);
  assert.match(css, /animation-duration: 0\.01ms !important/);
  assert.match(css, /cloud-blues[\s\S]*border-style: dotted/);
  assert.match(css, /cloud-classical[\s\S]*border-style: double/);
});
