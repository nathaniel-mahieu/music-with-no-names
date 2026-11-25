import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { getPitchClassColor, PITCH_CLASS_COLORS } from "../lib/piano-pitch-color.ts";
import { CONVENTIONAL_PITCH_CLASSES } from "../lib/piano-model.ts";

const readSource = (path) => readFile(new URL(path, import.meta.url), "utf8");

function nameEffect(source) {
  const start = source.indexOf("if (current.nameFlash) {");
  const end = source.indexOf("}, []);", start);
  assert.ok(start >= 0 && end > start, "the name cue needs its own inspectable settings boundary");
  return source.slice(start, end);
}

test("bold note labels use the canonical name and color for every MIDI key and octave", () => {
  assert.equal(PITCH_CLASS_COLORS.length, 12);
  for (let midi = 0; midi <= 127; midi += 1) {
    const entry = getPitchClassColor(midi);
    const canonical = PITCH_CLASS_COLORS[midi % 12];
    assert.equal(entry.pitchClass, midi % 12);
    assert.equal(entry.note, CONVENTIONAL_PITCH_CLASSES[midi % 12]);
    assert.equal(entry.color, canonical.color);
    assert.equal(entry.alternateNote, canonical.alternateNote);
    if (midi + 12 <= 127) assert.deepEqual(getPitchClassColor(midi + 12), entry);
  }
});

test("common flat aliases do not invent score-specific E sharp or other unsupported spellings", () => {
  const aliases = new Map([[1, "D♭"], [3, "E♭"], [6, "G♭"], [8, "A♭"], [10, "B♭"]]);
  for (const entry of PITCH_CLASS_COLORS) {
    assert.equal(entry.alternateNote, aliases.get(entry.pitchClass) ?? null);
    assert.notEqual(entry.note, entry.alternateNote);
  }
  assert.equal(getPitchClassColor(64).note, "E");
  assert.equal(getPitchClassColor(65).note, "F", "MIDI cannot distinguish F from a score-authored E sharp");
  assert.equal(getPitchClassColor(63).note, "D♯", "the primary label must match the background staff's sharp spelling");
  assert.equal(getPitchClassColor(63).alternateNote, "E♭");
  assert.doesNotMatch(PITCH_CLASS_COLORS.flatMap(({ note, alternateNote }) => [note, alternateNote ?? ""]).join(" "), /E♯|B♯|C♭|F♭/);
});

test("the global name tray preallocates twelve canonical colored labels instead of a live HUD render loop", async () => {
  const source = await readSource("../app/PitchVisuals.tsx");
  const tray = source.match(/<div ref=\{nameRef\}[\s\S]*?<\/div>/)?.[0] ?? "";
  assert.match(tray, /className=\{styles.names\} data-pitch-visual="names" hidden=\{!settings.nameFlash\} aria-hidden="true"/);
  assert.match(tray, /PITCH_CLASS_COLORS.map\(\(\{ pitchClass, color, note, alternateNote \}\)/);
  assert.match(tray, /data-pitch-class=\{pitchClass\} hidden style=\{\{ "--pitch-glow-color": color \}/);
  assert.match(tray, /<strong>\{note\}<\/strong>/);
  assert.match(tray, /alternateNote \? <small>= \{alternateNote\}<\/small> : null/);
  assert.doesNotMatch(tray, /STAFF_NOTES.map|Array.from|onClick|tabIndex/,
    "the decorative overlay should not allocate one name per octave or intercept practice controls");
});

test("names-only mode responds immediately in either layout and folds octave doublings", async () => {
  const source = await readSource("../app/PitchVisuals.tsx");
  const effect = nameEffect(source);
  assert.match(source, /if \(!current.glowFlash && !current.noteFlash && !current.staffFlash && !current.nameFlash\) return/);
  assert.match(effect, /const pitchClasses = new Set\(\[\.\.\.valid\].map\(\(note\) => note % 12\)\)/);
  assert.match(effect, /nameRef.current\?\.children.item\(pitchClass\)/);
  assert.match(effect, /label.hidden = false;\s*const animation = animateEdge\(label\)/);
  assert.doesNotMatch(effect, /staffMode|current.glowFlash|setState\(|setSettingsState\(|setTimeout\(|requestAnimationFrame\(/,
    "name flashes must not wait for chord analysis, React state, or a staff-only branch");
});

test("name flashes share the edge cue's reduced-motion and temporal fade envelope", async () => {
  const source = await readSource("../app/PitchVisuals.tsx");
  const start = source.indexOf("const animateEdge =");
  const end = source.indexOf("const staffMode =", start);
  assert.ok(start >= 0 && end > start);
  const envelope = source.slice(start, end);
  assert.match(envelope, /\? \[\{ opacity: 1 \}, \{ opacity: 1 \}\]/);
  assert.match(envelope, /\[\{ opacity: 1 \}, \{ opacity: 1, offset: .22 \}, \{ opacity: 0 \}\]/);
  assert.match(envelope, /return element.animate\(frames, \{ duration: reducedMotion \? 330 : 820, easing: "ease-out" \}\)/);
  assert.match(nameEffect(source), /const animation = animateEdge\(label\)/);
});

test("an old name animation cannot hide a retriggered cue or undo a clear", async () => {
  const source = await readSource("../app/PitchVisuals.tsx");
  const body = nameEffect(source).match(/animation.onfinish = \(\) => \{([\s\S]*?)\n\s*\};/)?.[1];
  assert.ok(body, "name completion needs an identity-guarded cleanup callback");
  const finish = new Function("nameAnimationsRef", "pitchClass", "animation", "label", body);
  const oldAnimation = {};
  const newAnimation = {};
  const label = { hidden: false };
  const animations = { current: new Map([[3, newAnimation]]) };

  finish(animations, 3, oldAnimation, label);
  assert.equal(label.hidden, false, "a stale completion must leave the new cue visible");
  assert.equal(animations.current.get(3), newAnimation);

  finish(animations, 3, newAnimation, label);
  assert.equal(label.hidden, true);
  assert.equal(animations.current.has(3), false);

  label.hidden = true;
  animations.current.clear();
  finish(animations, 3, oldAnimation, label);
  assert.equal(label.hidden, true, "a queued completion after All off must not recreate a cue");
  assert.equal(animations.current.size, 0);
});

test("clearing flashes removes name animations and hides every pooled label", async () => {
  const source = await readSource("../app/PitchVisuals.tsx");
  const clear = source.slice(source.indexOf("const clearFlashes ="), source.indexOf("const setSettings ="));
  assert.match(clear, /for \(const ref of \[[^\]]*nameRef[^\]]*\]\)/);
  assert.match(clear, /animation.cancel\(\)/);
  assert.match(clear, /nameAnimationsRef.current.clear\(\)/);
  assert.match(clear, /Array.from\(nameRef.current\?\.children \?\? \[\]\)/);
  assert.match(clear, /\.hidden = true/);
  assert.match(source, /const setSettings =[\s\S]*?clearFlashes\(\)/);
  assert.match(source, /const sync = \(event: StorageEvent\) => \{[\s\S]*?clearFlashes\(\)/);
});

test("name labels inherit deliberate raw input and never add an ungated hidden-reference path", async () => {
  const [piano, absolutePitch, scoreFlow, echoKey] = await Promise.all([
    readSource("../app/PianoLab.tsx"),
    readSource("../app/PianoAbsolutePitchHud.tsx"),
    readSource("../app/PianoScoreFlowHud.tsx"),
    readSource("../app/PianoEchoKeyHud.tsx"),
  ]);
  assert.match(piano, /showPitchAttacks\(\[note\]\);\s*if \(frozenRef.current\) return/,
    "a played key should identify itself immediately, even when analysis capture is paused");
  assert.match(piano, /if \(!revealPitchColor\) clearFlashes\(\)/);
  assert.match(piano, /if \(played && revealPitchColor && token === toneVisualTokenRef.current\) showPitchAttacks\(\[note\]\)/);
  assert.match(absolutePitch, /const played = await playTone\(trial, false\)/,
    "unanswered recall and cold-check reference tones must not reveal a note name");
  assert.match(scoreFlow, /const publishPitchAttack = notationLocked \? undefined : onPitchAttack/);
  assert.match(echoKey, /if \(showPitch && onPitchAttack\) pitchAttacks.push/);
});

test("the centered name tray wraps without catching input and retains text in forced colors", async () => {
  const css = await readSource("../app/PitchVisuals.module.css");
  const tray = css.match(/\.names \{([^}]+)\}/)?.[1] ?? "";
  assert.match(tray, /position: fixed/);
  assert.match(tray, /top: clamp\(/);
  assert.match(tray, /left: 50%/);
  assert.match(tray, /display: flex/);
  assert.match(tray, /flex-wrap: wrap/);
  assert.match(tray, /justify-content: center/);
  assert.match(tray, /max-width: calc\(100vw - 40px\)/);
  assert.match(tray, /pointer-events: none/);
  assert.match(css, /\.names\[hidden\], \.names > span\[hidden\] \{ display: none; \}/,
    "expired labels must release layout space so a single live name stays centered");
  assert.match(css, /\.names strong \{ font-weight: 900/);
  assert.match(css, /\.names > span \{[^}]*color: var\(--pitch-glow-color\);[^}]*font-size: clamp\(/);
  assert.match(css, /@media \(forced-colors: active\)[\s\S]*\.names > span \{ color: CanvasText; text-shadow: none; \}/);
});
