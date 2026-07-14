import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

const LABS = ["GuideLab", "ScaleLab", "PianoLab", "EarLab", "HarmonyLab", "RhythmLab", "JourneyLab", "RecordingLab", "AtlasLab", "PersonalLab"];

test("every learning lab exposes a named semantic region", async () => {
  for (const lab of LABS) {
    const source = await readFile(new URL(`../app/${lab}.tsx`, import.meta.url), "utf8");
    assert.match(source, /<section[^>]+aria-labelledby=/, `${lab} needs aria-labelledby`);
  }
});

test("dynamic visuals and status changes expose nonvisual descriptions", async () => {
  const [ratio, scale, piano, harmony, rhythm, recording, journey, atlas] = await Promise.all([
    readFile(new URL("../app/RatioLab.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/ScaleLab.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/PianoLab.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/HarmonyLab.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/RhythmLab.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/RecordingLab.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/JourneyLab.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/AtlasLab.tsx", import.meta.url), "utf8"),
  ]);
  assert.match(ratio, /<canvas[^>]+role="img"[^>]+aria-label=/);
  assert.match(scale, /name="scale-degree"/);
  assert.match(scale, /aria-live="polite"/);
  assert.match(scale, /<ol className="step-fingerprint"/);
  assert.match(piano, /aria-label="Silent two-octave on-screen piano/);
  assert.match(piano, /aria-live="polite"/);
  assert.match(piano, /Grand staff showing/);
  assert.match(piano, /Evidence traces across/);
  assert.match(piano, /Choose movable Do around the circle of fifths/);
  assert.match(piano, /Repeated fifths morphing from a nonclosing pure-ratio spiral/);
  assert.match(piano, /id="hud-fifths-stack"/);
  assert.match(piano, /id="hud-fifths-temper"/);
  assert.match(piano, /Select an event across every view/);
  assert.match(piano, /Chord gestures grouped by attack timing/);
  assert.match(piano, /aria-label="Selected chord evidence"/);
  assert.match(piano, /aria-label="Correct inherited chord membership"/);
  assert.match(piano, /Restore.*Exclude.*inherited/);
  assert.match(piano, /id="hud-chord-window"/);
  assert.match(piano, /aria-label="Guided ascending scale walk"/);
  assert.match(piano, /aria-label="Performed scale fingerprint builder"/);
  assert.match(piano, /aria-label="Choose one scale experiment"/);
  assert.match(piano, /silent performed fingerprint target/);
  assert.match(piano, /aria-label="Tonal gravity counterfactual microscope"/);
  assert.match(piano, /aria-label="Counterfactual evidence separation"/);
  assert.match(piano, /aria-labelledby="hud-phrase-compare-entry-title"/);
  assert.match(piano, /aria-label="Choose one phrase change to investigate"/);
  assert.match(piano, /aria-label="Five separate phrase comparison lenses"/);
  assert.match(piano, /aria-labelledby="hud-partial-title"/);
  assert.match(piano, /role="img" aria-label=\{summary\}/);
  assert.match(piano, /role="img" aria-label=\{comparisonSummary\}/);
  assert.match(piano, /aria-label="Five separate lenses for the selected attack change"/);
  assert.match(piano, /hud-last-attack-reading[\s\S]*role="status" aria-live="polite"/);
  assert.match(piano, /hud-phrase-change-reading[\s\S]*role="status" aria-live="polite"/);
  assert.match(piano, /role="group" aria-label=\{row\.label\}/);
  assert.match(piano, /role="status" aria-live="polite"/);
  assert.match(piano, /silent guided scale-walk target/);
  assert.match(piano, /aria-labelledby="hud-sonority-title"/);
  assert.match(piano, /aria-label="Separate conditional affordance changes"/);
  assert.match(piano, /silent controlled sonority reference/);
  assert.match(piano, /aria-label="Original versus one-key path comparison across five lenses"/);
  assert.match(piano, /aria-label="Report which landmark path felt more directed"/);
  assert.match(piano, /aria-label="Motion learning question"/);
  assert.match(piano, /aria-labelledby="hud-pulse-title"/);
  assert.match(piano, /Later MIDI attack clusters placed against the learner’s four-tap pulse/);
  assert.match(harmony, /aria-labelledby="live-harmony-title"/);
  assert.match(harmony, /role="img" aria-label=\{accessibleSummary\}/);
  assert.match(harmony, /aria-label="Five separate evidence lenses for the chord change"/);
  assert.match(harmony, /<details className="harmony-authoring-disclosure"/);
  assert.match(rhythm, /aria-labelledby="rhythm-live-title"/);
  assert.match(rhythm, /role="img"/);
  assert.match(rhythm, /Pitchless timing profile with/);
  assert.match(rhythm, /<details className="rhythm-authoring-disclosure"/);
  assert.match(recording, /aria-live="polite"/);
  assert.match(journey, /role="img" aria-label=/);
  assert.match(journey, /aria-labelledby="journey-live-title"/);
  assert.match(journey, /Piece-local expectation trail/);
  assert.match(journey, /<details className="journey-generated-disclosure"/);
  assert.match(atlas, /aria-label=\{`Music landmarks positioned/);
});

test("focus, reduced-motion, and non-color contracts are present", async () => {
  const [css, ratio, scale, piano, harmony, rhythm, journey] = await Promise.all([
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
    readFile(new URL("../app/RatioLab.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/ScaleLab.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/PianoLab.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/HarmonyLab.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/RhythmLab.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/JourneyLab.tsx", import.meta.url), "utf8"),
  ]);
  assert.match(css, /select:focus-visible/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)/);
  assert.match(css, /animation-duration: 0\.01ms !important/);
  assert.match(css, /cloud-blues[\s\S]*border-style: dotted/);
  assert.match(css, /cloud-classical[\s\S]*border-style: double/);
  assert.match(css, /\.atlas-point[\s\S]*width: max\(50px, var\(--point-size\)\)/);
  assert.match(css, /\.lab-nav-primary[\s\S]*grid-template-columns: repeat\(3, minmax\(0, 1fr\)\)/);
  assert.match(ratio, /<details className="lab-nav-more"/);
  assert.match(ratio, /aria-label="Live piano phrase available"/);
  assert.match(ratio, /matchMedia\("\(prefers-reduced-motion: reduce\)"\)/);
  assert.match(ratio, /behavior: prefersReducedMotion \? "auto" : "smooth"/);
  assert.match(ratio, /className="skip-link" href="#lab-stage" onClick=\{skipToActiveLab\}/);
  assert.match(ratio, /id="lab-stage" className="lab-stage" tabIndex=\{-1\}/);
  assert.match(css, /@media \(forced-colors: active\)/);
  assert.match(css, /\.atlas-point\.is-selected > i[\s\S]*outline: 4px solid Highlight/);
  assert.match(css, /\.spectrum-partial\.voice-6[\s\S]*border: 3px double Canvas/);
  assert.match(css, /\.learning-scale \.step-fingerprint > li span/);
  assert.doesNotMatch(ratio, /tabIndex=\{?[1-9]/);
  assert.doesNotMatch(scale, /className="degree-inspector"[^>]*aria-live/);
  assert.doesNotMatch(piano, /tabIndex=\{?[1-9]/);
  assert.match(css, /\.piano-key\.is-circle-target/);
  assert.match(css, /\.piano-key\.is-scale-walk-target/);
  assert.match(css, /\.piano-key\.is-scale-builder-target/);
  assert.match(css, /\.hud-gravity-counterfactual-chart > span\.is-target/);
  assert.match(css, /\.hud-gravity-counterfactual-chart i\.is-before[\s\S]*LinkText/);
  assert.match(css, /\.hud-phrase-lens-profile > article\.is-invariant[\s\S]*border-left/);
  assert.match(css, /\.hud-phrase-change-reading\.has-target[\s\S]*LinkText/);
  assert.match(css, /\.hud-partial-link\.is-aligned[\s\S]*LinkText/);
  assert.match(css, /\.hud-partial-link\.is-interaction[\s\S]*Highlight/);
  assert.match(css, /\.hud-echo-span\.is-source[\s\S]*LinkText/);
  assert.match(css, /\.hud-echo-span\.is-attempt[\s\S]*Highlight/);
  assert.match(css, /\.hud-last-attack-reading\.is-attributable[\s\S]*LinkText/);
  assert.match(css, /\.hud-last-lenses article\.is-modeled[\s\S]*Highlight/);
  assert.match(css, /\.hud-phrase-report-rows button\[aria-pressed="true"\][\s\S]*Highlight/);
  assert.match(css, /\.hud-landmark-counterfactual-report button\[aria-pressed="true"\][\s\S]*Highlight/);
  assert.match(css, /\.piano-key\.is-sonority-target/);
  assert.match(css, /\.hud-sonority-question\.has-change[\s\S]*border-left/);
  assert.match(css, /\.hud-pulse-status\.is-ready[\s\S]*border-left/);
  assert.match(css, /\.hud-pulse-onset[\s\S]*Highlight/);
  assert.match(css, /\.hud-walk-route li\.is-current[\s\S]*box-shadow/);
  assert.match(css, /\.piano-key\.is-active,[\s\S]*Highlight/);
  assert.match(css, /\.rhythm-live-axis > span[\s\S]*background: LinkText/);
  assert.doesNotMatch(rhythm, /tabIndex=\{?[1-9]/);
  assert.match(css, /\.journey-live-thread > li\.is-known[\s\S]*border-color: LinkText/);
  assert.match(css, /\.journey-live-thread > li\.is-new[\s\S]*border-color: Highlight/);
  assert.match(css, /\.live-harmony-note\.is-previous[\s\S]*stroke: LinkText/);
  assert.match(css, /\.live-harmony-note\.is-current[\s\S]*fill: Highlight/);
  assert.doesNotMatch(harmony, /tabIndex=\{?[1-9]/);
  assert.doesNotMatch(journey, /tabIndex=\{?[1-9]/);
});
