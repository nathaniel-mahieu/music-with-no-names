import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { advanceEarSearchTracker, createEarSearchTracker } from "../lib/piano-ear-search-model.ts";
import { rearmEarSearchTracker } from "../lib/piano-ear-search-session.ts";
import { EAR_SEARCH_GATHER_STORAGE_KEY } from "../lib/piano-ear-search-preferences.ts";

const readHud = () => readFile(new URL("../app/PianoEarSearchHud.tsx", import.meta.url), "utf8");

function gatherChangeBody(source) {
  const start = source.indexOf("const changeGatherWindow = (value: EarSearchChordWindow) => {");
  const end = source.indexOf("\n  };", start);
  assert.ok(start >= 0 && end > start, "the gather preference needs one inspectable change boundary");
  return source.slice(source.indexOf("{", start) + 1, end);
}

test("Sound Finder uses its own forgiving gather preference rather than the live MIDI analysis window", async () => {
  const source = await readHud();
  assert.match(source, /useState<EarSearchChordWindow>\(DEFAULT_EAR_SEARCH_CHORD_WINDOW\)/);
  const signature = source.match(/export function PianoEarSearchHud\(([^\n]+)\)/)?.[1] ?? "";
  assert.doesNotMatch(signature, /chordWindowMs/,
    "the untimed gather window must not inherit the live HUD's much tighter grouping choice");
  assert.doesNotMatch(source, /useState<140 \| 240 \| 480>|chordWindowMs <= 80/);
  assert.match(source, /chordWindowMs: gathersTexture \? clusterWindow : 40/,
    "single-note reductions retain their immediate input path");
  assert.match(source, /<span>Chord gather<\/span><select value=\{clusterWindow\}/);
  assert.match(source, /changeGatherWindow\(parseEarSearchChordWindow\(event.target.value\)\)/);
  assert.match(source, /EAR_SEARCH_CHORD_WINDOWS.map\(\(windowMs\) => <option key=\{windowMs\} value=\{windowMs\}/);
  assert.match(source, /windowMs === 300 \? "Close" : windowMs === 600 \? "Forgiving" : "Slow build"/);
  assert.match(source, /Time from the first played key, separate from live HUD grouping\. Saved for this tab; rhythm is not graded\./);
});

test("gather choices load from tab storage and are written only after an explicit selection", async () => {
  const source = await readHud();
  assert.match(source, /setClusterWindow\(parseEarSearchChordWindow\(window.sessionStorage.getItem\(EAR_SEARCH_GATHER_STORAGE_KEY\)\)\)/);
  const change = gatherChangeBody(source);
  assert.match(change, /window.sessionStorage.setItem\(EAR_SEARCH_GATHER_STORAGE_KEY, String\(value\)\)/);
  assert.equal((source.match(/sessionStorage.setItem\(EAR_SEARCH_GATHER_STORAGE_KEY/g) ?? []).length, 1,
    "mounting the HUD must not overwrite a stored choice with the initial default");
  assert.doesNotMatch(source, /localStorage/,
    "Sound Finder score and gather preferences remain scoped to this browser tab");
});

test("changing tolerance clears only unfinished input without resetting finds, resuming capture, or stopping reference audio", async () => {
  const change = gatherChangeBody(await readHud());
  assert.match(change, /captureProbeBoundary\(\)/);
  assert.match(change, /clearFutureEchoes\(\)/);
  assert.match(change, /rearmEarSearchTracker\(searchLandings, current, boundaryId\)/);
  assert.match(change, /setClusterClockMs\(0\)/);
  assert.match(change, /setClusterWindow\(value\)/);
  assert.match(change, /if \(phase !== "playing"\) setAudioNotice/,
    "reference playback must retain its current playback message");
  assert.doesNotMatch(change, /onResumeCapture|setFrozen|setPhase|beginProbeSearch|prepareTargetChange|resetProgress|stopAudio|disposeAudio|setTracker\(null\)/,
    "preference changes must preserve paused capture, completed progress, and explicit listening");
});

test("the tolerance-change handler preserves an accepted prefix and drops only the partial chord", async () => {
  const body = gatherChangeBody(await readHud());
  const change = new Function(
    "captureProbeBoundary", "clearFutureEchoes", "probeBoundaryRef", "setTracker", "searchLandings",
    "rearmEarSearchTracker", "setClusterClockMs", "setClusterWindow", "phase", "setAudioNotice",
    "window", "EAR_SEARCH_GATHER_STORAGE_KEY", "value", body,
  );
  const target = [
    { id: "first", notes: [60], measureIndex: 0, measureNumber: "1" },
    { id: "chord", notes: [64, 67], measureIndex: 0, measureNumber: "1" },
  ];
  for (const phase of ["searching", "playing"]) {
    let tracker = advanceEarSearchTracker(target, createEarSearchTracker(target, 0), [
      { id: 1, note: 60, onsetMs: 100 },
      { id: 2, note: 64, onsetMs: 1000 },
    ], { chordWindowMs: 600, nowMs: 1000 });
    assert.equal(tracker.matchedLandings, 1);
    assert.equal(tracker.pendingAttacks.length, 1);
    const boundary = { current: { eventId: -1 } };
    let captured = 0;
    let cleared = 0;
    let clock = 1000;
    let chosen = 600;
    let notice = "Reference is playing";
    const writes = [];
    change(
      () => { captured += 1; boundary.current.eventId = 2; },
      () => { cleared += 1; }, boundary, (update) => { tracker = update(tracker); }, target,
      rearmEarSearchTracker, (value) => { clock = value; }, (value) => { chosen = value; }, phase,
      (value) => { notice = value; }, { sessionStorage: { setItem: (...args) => writes.push(args) } },
      EAR_SEARCH_GATHER_STORAGE_KEY, 1000,
    );
    assert.equal(captured, 1);
    assert.equal(cleared, 1);
    assert.equal(tracker.matchedLandings, 1);
    assert.deepEqual(tracker.acceptedProbeIds, [1]);
    assert.deepEqual(tracker.pendingAttacks, []);
    assert.equal(tracker.latest, null);
    assert.equal(tracker.processedThroughEventId, 2);
    assert.equal(clock, 0);
    assert.equal(chosen, 1000);
    assert.deepEqual(writes, [[EAR_SEARCH_GATHER_STORAGE_KEY, "1000"]]);
    assert.equal(phase === "playing" ? notice === "Reference is playing" : notice.includes("Your finds are kept"), true);
  }
});

test("pending chord feedback acknowledges distinct played keys without leaking the hidden target", async () => {
  const source = await readHud();
  assert.match(source, /const canProbe = visiblePhase === "searching" && !frozen/);
  assert.match(source, /const gatheringKeys = canProbe \? new Set\(tracker\?\.pendingAttacks.map\(\(attack\) => attack.note\) \?\? \[\]\).size : 0/);
  assert.match(source, /const feedback = !frozen && !gathering &&/,
    "a stale wrong-direction cue must not masquerade as feedback on an unfinished chord");
  const summary = source.match(/const gatherSummary = ([^\n]+)/)?.[1] ?? "";
  assert.match(summary, /distinct played key/);
  assert.match(summary, /from the first key; rhythm is not graded/);
  assert.doesNotMatch(summary, /expected|searchLandings|targetLandings|midiLabel|pitchClass|noteLabel|\.notes|total|matched/,
    "the receipt may count the player's input, never name or count the hidden chord");
  for (const channel of ["place", "direction", "interval", "collectionCue", "texture"]) {
    assert.match(source, new RegExp(`const ${channel} = hintsPaused \\? pausedCue : gathering \\? gatheringCue`));
  }
  assert.match(source, /gathering \? `Gathering chord · \$\{gatheringKeys\} played key/);
  assert.match(source, /gathering \? `\$\{gatherSummary\} Repeating a key does not add another chord member\.`/);
  assert.match(source, /data-gathering=\{gathering \|\| undefined\}/);
  assert.match(source, /gathering \? `\$\{gatheringKeys\} played key\$\{gatheringKeys === 1 \? "" : "s"\} gathering · not yet judged`/);
  assert.match(source, /className="sr-only" role="status" aria-live="polite" aria-atomic="true">\{hintsPaused \?[\s\S]*? : gathering \? gatherSummary/);
});

test("an unfinished chord cannot revive a historical future echo", async () => {
  const source = await readHud();
  const start = source.indexOf("const latest = tracker?.recentProbes.at(-1)");
  const end = source.indexOf("if (tracker.latest.probeId", start);
  assert.ok(start >= 0 && end > start);
  const gate = source.slice(start, end);
  assert.match(gate, /frozen \|\| phase !== "searching"/);
  assert.match(gate, /tracker.pendingAttacks.length > 0/);
  assert.match(gate, /clearFutureEchoes\(\);\s*return/);
});
