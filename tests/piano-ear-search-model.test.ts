import assert from "node:assert/strict";
import test from "node:test";
import { ORBIT_STUDY_MUSICXML, normalizeImportedMusicXmlScore, parseMusicXml } from "../lib/musicxml-import.ts";
import { analyzeLocalPitchCollections, selectSheetMusicLoop } from "../lib/sheet-music-coach-model.ts";
import {
  buildEarSearchChunks,
  earSearchCollectionFromAnalysis,
  earSearchLandingsForChunk,
  evaluateEarSearch,
  type EarSearchLanding,
  type EarSearchProbe,
} from "../lib/piano-ear-search-model.ts";

const landing = (id: string, notes: number[], measureIndex = 0): EarSearchLanding => ({ id, notes, measureIndex, measureNumber: String(measureIndex + 1) });
const probe = (id: number, notes: number[], onsetMs = id * 100): EarSearchProbe => ({ id, notes, onsetMs });

test("a complete exact sequence catches every hidden landing", () => {
  const result = evaluateEarSearch(
    [landing("a", [60]), landing("b", [64]), landing("c", [67])],
    [probe(1, [60]), probe(2, [64]), probe(3, [67])],
  );
  assert.equal(result.complete, true);
  assert.equal(result.matchedLandings, 3);
  assert.deepEqual(result.acceptedProbeIds, [1, 2, 3]);
});

test("wrong exploratory probes neither consume nor erase a secure prefix", () => {
  const result = evaluateEarSearch(
    [landing("a", [60]), landing("b", [64]), landing("c", [67])],
    [probe(1, [60]), probe(2, [63]), probe(3, [64]), probe(4, [66]), probe(5, [67])],
  );
  assert.equal(result.complete, true);
  assert.deepEqual(result.acceptedProbeIds, [1, 3, 5]);
});

test("future notes cannot skip the next hidden landing", () => {
  const result = evaluateEarSearch(
    [landing("a", [60]), landing("b", [64]), landing("c", [67])],
    [probe(1, [64]), probe(2, [67])],
  );
  assert.equal(result.matchedLandings, 0);
  assert.equal(result.complete, false);
});

test("one attack cannot satisfy two repeated targets", () => {
  const result = evaluateEarSearch([landing("a", [60]), landing("b", [60])], [probe(1, [60])]);
  assert.equal(result.matchedLandings, 1);
  assert.equal(result.complete, false);
});

test("pitch feedback is invariant to a long performance delay", () => {
  const target = [landing("a", [60]), landing("b", [64])];
  const immediate = evaluateEarSearch(target, [probe(1, [60], 100), probe(2, [62], 300)]);
  const delayed = evaluateEarSearch(target, [probe(1, [60], 30_100), probe(2, [62], 90_300)]);
  assert.deepEqual(delayed, immediate);
});

test("octave-family matches guide register without becoming success", () => {
  const low = evaluateEarSearch([landing("a", [60])], [probe(1, [48])]);
  assert.equal(low.complete, false);
  assert.equal(low.latest?.pitchFamily, "same-family");
  assert.equal(low.latest?.pitchDirection, "higher");
  assert.equal(low.latest?.register, "below");

  const high = evaluateEarSearch([landing("a", [60])], [probe(1, [72])]);
  assert.equal(high.complete, false);
  assert.equal(high.latest?.pitchFamily, "same-family");
  assert.equal(high.latest?.pitchDirection, "lower");
  assert.equal(high.latest?.register, "above");
});

test("interval guidance stays anchored to the last accepted landing", () => {
  const target = [landing("a", [60]), landing("b", [64])];
  const narrow = evaluateEarSearch(target, [probe(1, [60]), probe(2, [63])]);
  assert.equal(narrow.latest?.intervalDirection, "matched");
  assert.equal(narrow.latest?.intervalWidth, "narrower");
  const exactAfterWrong = evaluateEarSearch(target, [probe(1, [60]), probe(2, [63]), probe(3, [64])]);
  assert.equal(exactAfterWrong.complete, true);
  assert.deepEqual(exactAfterWrong.acceptedProbeIds, [1, 3]);
});

test("opposite contour takes precedence over interval width", () => {
  const result = evaluateEarSearch(
    [landing("a", [60]), landing("b", [64])],
    [probe(1, [60]), probe(2, [56])],
  );
  assert.equal(result.latest?.intervalDirection, "opposite");
  assert.equal(result.latest?.intervalWidth, "unavailable");
});

test("compound versions retain an interval-family cue without exact credit", () => {
  const result = evaluateEarSearch(
    [landing("a", [60]), landing("b", [64])],
    [probe(1, [60]), probe(2, [76])],
  );
  assert.equal(result.complete, false);
  assert.equal(result.latest?.intervalDirection, "matched");
  assert.equal(result.latest?.intervalWidth, "same-class-other-octave");
});

test("chord matching is order independent but inversion and octave shifts stay exploratory", () => {
  const target = [landing("a", [60, 64, 67])];
  assert.equal(evaluateEarSearch(target, [probe(1, [67, 60, 64])]).complete, true);
  const octave = evaluateEarSearch(target, [probe(1, [72, 76, 79])]);
  assert.equal(octave.complete, false);
  assert.equal(octave.latest?.pitchFamily, "same-family");
  const inversion = evaluateEarSearch(target, [probe(1, [64, 67, 72])]);
  assert.equal(inversion.complete, false);
  assert.equal(inversion.latest?.pitchFamily, "same-family");
});

test("collection cues stay categorical and exact chromatic targets still win", () => {
  const collection = { source: "authored" as const, pitchClasses: [0, 2, 4, 5, 7, 9, 11] };
  const outside = evaluateEarSearch([landing("a", [60])], [probe(1, [61])], collection);
  assert.equal(outside.latest?.collection, "outside");
  const chromaticTarget = evaluateEarSearch([landing("a", [61])], [probe(1, [61])], collection);
  assert.equal(chromaticTarget.complete, true);
  assert.equal(chromaticTarget.latest?.collection, "caught");
});

test("thin pitch evidence refuses to claim a nearby collection", () => {
  const analysis = analyzeLocalPitchCollections([{ midiNotes: [60] }, { midiNotes: [64] }]);
  assert.equal(earSearchCollectionFromAnalysis(analysis), null);
});

test("blind evaluation exposes categories and progress but no target pitch payload", () => {
  const result = evaluateEarSearch([landing("secret", [73])], [probe(1, [70])]);
  const serialized = JSON.stringify(result);
  assert.doesNotMatch(serialized, /73|secret|C#|D♭|semitone/i);
  assert.equal(result.latest?.pitchDirection, "higher");
});

test("target and probe inputs are strictly bounded", () => {
  assert.throws(() => evaluateEarSearch([], []), /from 1 through 8/);
  assert.throws(() => evaluateEarSearch(Array.from({ length: 9 }, (_, index) => landing(String(index), [60])), []), /from 1 through 8/);
  assert.throws(() => evaluateEarSearch([landing("a", [128])], []), /MIDI key/);
  assert.throws(() => evaluateEarSearch([landing("a", [60])], [{ id: 1, notes: [60], onsetMs: Number.NaN }]), /finite onset/);
  assert.throws(() => evaluateEarSearch([landing("a", [60], 0), landing("b", [62], 1), landing("c", [64], 2)], []), /at most two measures/);
});

test("score chunks and derived targets stay within eight landings and two measures", () => {
  const score = normalizeImportedMusicXmlScore(parseMusicXml(ORBIT_STUDY_MUSICXML, "orbit-study.musicxml"));
  const chunks = buildEarSearchChunks(score, { maxLandings: 8 });
  assert.ok(chunks.length > 0);
  chunks.forEach((chunk) => {
    assert.ok(chunk.attackCount <= 8);
    assert.ok(chunk.measureNumbers.length <= 2);
  });
  const first = chunks[0];
  const targets = earSearchLandingsForChunk(score, first, { voice: "upper" });
  assert.equal(targets.length, first.attackCount);
  assert.ok(targets.every((target) => target.notes.length === 1));
  const loop = selectSheetMusicLoop(score, { startAttackId: first.startAttackId, endAttackId: first.endAttackId });
  assert.equal(loop.attacks.length, targets.length);
});
