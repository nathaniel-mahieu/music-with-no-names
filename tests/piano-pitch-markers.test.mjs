import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

const readSource = (path) => readFile(new URL(path, import.meta.url), "utf8");

function markerAnimator(source, reducedMotion) {
  const body = source.match(/const animateMarker = \(element:[^\n]+\) => \{([\s\S]*?)\n    \};/)?.[1];
  assert.ok(body, "staff markers need a dedicated, inspectable opacity envelope");
  return new Function("reducedMotion", `return (element) => {${body}\n};`)(reducedMotion);
}

function recordingElement(previous = []) {
  const calls = [];
  const order = [];
  const element = {
    getAnimations: () => previous.map((name) => ({ cancel: () => order.push(`cancel:${name}`) })),
    animate: (frames, options) => {
      order.push("animate");
      calls.push({ frames, options });
      return { frames, options };
    },
  };
  return { element, calls, order };
}

test("staff note markers stay fully opaque through the main flash before a short exit fade", async () => {
  const source = await readSource("../app/PitchVisuals.tsx");
  const animateMarker = markerAnimator(source, false);
  const { element, calls } = recordingElement();
  animateMarker(element);
  assert.deepEqual(calls, [{
    frames: [{ opacity: 1 }, { opacity: 1, offset: .8 }, { opacity: 0 }],
    options: { duration: 820, easing: "linear" },
  }]);
  assert.equal(calls[0].options.duration * calls[0].frames[1].offset, 656,
    "the colored note and spike must remain solid for most of the cue, not dim with the background wash");
});

test("reduced-motion staff markers remain solid without an animated fade", async () => {
  const source = await readSource("../app/PitchVisuals.tsx");
  const animateMarker = markerAnimator(source, true);
  const { element, calls } = recordingElement();
  animateMarker(element);
  assert.deepEqual(calls, [{
    frames: [{ opacity: 1 }, { opacity: 1 }],
    options: { duration: 330, easing: "linear" },
  }]);
});

test("fresh marker attacks cancel old fades before restarting at full opacity", async () => {
  const source = await readSource("../app/PitchVisuals.tsx");
  const animateMarker = markerAnimator(source, false);
  const { element, calls, order } = recordingElement(["previous", "queued"]);
  animateMarker(element);
  assert.deepEqual(order, ["cancel:previous", "cancel:queued", "animate"]);
  assert.equal(calls[0].frames[0].opacity, 1);
  assert.doesNotThrow(() => animateMarker(null));
  assert.doesNotThrow(() => animateMarker(undefined));
  assert.doesNotThrow(() => animateMarker({}));
});

test("quarter notes and tapered spikes share the dedicated per-pitch marker animation", async () => {
  const source = await readSource("../app/PitchVisuals.tsx");
  assert.match(source, /if \(staffMode && current.noteFlash\) valid.forEach\(\(note\) => animateMarker\(noteRef.current\?\.children.item\(note\)\)\)/);
  assert.doesNotMatch(source, /animate\(noteRef.current\?\.children.item\(note\),\s*\.86,\s*\.65\)/,
    "the old translucent marker envelope must not return");
  const layer = source.match(/<div ref=\{noteRef\}[\s\S]*?<\/div>/)?.[0] ?? "";
  assert.match(layer, /hidden=\{settings.mode !== "staff" \|\| !settings.noteFlash\}/);
  assert.match(layer, /STAFF_NOTES.map\(\(\{ midi, pitchClass, color, step, ledgerSteps \}\)/);
  assert.match(layer, /<span key=\{midi\} data-midi-note=\{midi\} data-staff-step=\{step\}/);
  assert.match(layer, /"--pitch-glow-color": color, "--pitch-staff-position": step/);
  assert.match(layer, /className=\{styles.quarterNote\} data-quarter-note=\{midi\}/);
  assert.match(layer, /className=\{styles.taperedNote\}[\s\S]*d=\{TAPERED_NOTE_PATH\}/);
  assert.match(layer, /className=\{styles.quarterLedger\}/);
  assert.match(layer, /className=\{styles.quarterAccidental\}/);
  assert.match(layer, /className=\{styles.notehead\}/);
});

test("solid markers stay above the wash without changing the other visual envelopes", async () => {
  const [source, css] = await Promise.all([
    readSource("../app/PitchVisuals.tsx"),
    readSource("../app/PitchVisuals.module.css"),
  ]);
  assert.match(source, /animate\(glowRef.current\?\.children.item\(note\), \.42, \.31\)/);
  assert.match(source, /animate\(foregroundStaffRef.current, \.62, \.42\)/);
  assert.match(source, /animateEdge\(halo\);\s*animateEdge\(rim\)/);
  assert.match(source, /const animation = animateEdge\(label\)/);
  assert.match(css, /\.glow \{ z-index: 8; \}/);
  assert.match(css, /\.edgeGlow \{ z-index: 8; \}/);
  assert.match(css, /\.notes \{ z-index: 9; \}/);
  for (const selector of ["taperedNote", "quarterNote", "quarterStem", "notehead"]) {
    const rule = css.match(new RegExp(`\\.${selector} \\{([^}]+)\\}`))?.[1] ?? "";
    assert.ok(rule, `${selector} needs a readable CSS rule`);
    assert.doesNotMatch(rule, /(?:fill-|stroke-)?opacity\s*:|filter\s*:/,
      "marker parts must inherit full opacity from their shared animated pitch layer");
  }
});

test("stronger marker flashes retain cancellation and hidden-reference protection", async () => {
  const [source, piano] = await Promise.all([
    readSource("../app/PitchVisuals.tsx"),
    readSource("../app/PianoLab.tsx"),
  ]);
  const clear = source.slice(source.indexOf("const clearFlashes ="), source.indexOf("const setSettings ="));
  assert.match(clear, /for \(const ref of \[[^\]]*noteRef[^\]]*\]\)/);
  assert.match(clear, /getAnimations\?\.\(\{ subtree: true \}\)\.forEach\(\(animation\) => animation.cancel\(\)\)/);
  assert.match(piano, /if \(!revealPitchColor\) clearFlashes\(\)/);
  assert.match(piano, /if \(played && revealPitchColor && token === toneVisualTokenRef.current\) showPitchAttacks\(\[note\]\)/);
});
