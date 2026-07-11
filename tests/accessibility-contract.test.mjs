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
  const [css, ratio] = await Promise.all([
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
    readFile(new URL("../app/RatioLab.tsx", import.meta.url), "utf8"),
  ]);
  assert.match(css, /select:focus-visible/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)/);
  assert.match(css, /animation-duration: 0\.01ms !important/);
  assert.match(css, /cloud-blues[\s\S]*border-style: dotted/);
  assert.match(css, /cloud-classical[\s\S]*border-style: double/);
  assert.match(css, /\.atlas-point[\s\S]*width: max\(50px, var\(--point-size\)\)/);
  assert.match(css, /\.lab-nav[\s\S]*grid-template-columns: repeat\(3, minmax\(0, 1fr\)\)/);
  assert.match(ratio, /matchMedia\("\(prefers-reduced-motion: reduce\)"\)/);
  assert.match(ratio, /behavior: prefersReducedMotion \? "auto" : "smooth"/);
  assert.match(ratio, /className="skip-link" href="#lab-stage" onClick=\{skipToActiveLab\}/);
  assert.match(ratio, /id="lab-stage" className="lab-stage" tabIndex=\{-1\}/);
  assert.match(css, /@media \(forced-colors: active\)/);
  assert.match(css, /\.atlas-point\.is-selected > i[\s\S]*outline: 4px solid Highlight/);
  assert.match(css, /\.spectrum-partial\.voice-6[\s\S]*border: 3px double Canvas/);
  assert.doesNotMatch(ratio, /tabIndex=\{?[1-9]/);
});
