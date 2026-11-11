import assert from "node:assert/strict";
import test from "node:test";
import { ORBIT_STUDY_MUSICXML, normalizeImportedMusicXmlScore, parseMusicXml } from "../lib/musicxml-import.ts";
import { analyzeLocalPitchCollections, normalizeSheetMusicScore } from "../lib/sheet-music-coach-model.ts";
import { parseStoredScoreFlowSource } from "../lib/score-flow-storage.ts";
import {
  advanceEarSearchTracker,
  buildEarSearchChunks,
  buildEarSearchReferencePlan,
  compactEarSearchReferencePlan,
  createEarSearchTracker,
  earSearchCollectionFromAnalysis,
  earSearchFutureEchoes,
  earSearchFutureProbeNotes,
  earSearchLandingsForChunk,
  evaluateEarSearch,
  formatEarSearchFrameStart,
  selectEarSearchChunkLoop,
  type EarSearchLanding,
  type EarSearchProbe,
} from "../lib/piano-ear-search-model.ts";

const landing = (id: string, notes: number[], measureIndex = 0): EarSearchLanding => ({ id, notes, measureIndex, measureNumber: String(measureIndex + 1) });
const probe = (id: number, notes: number[], onsetMs = id * 100): EarSearchProbe => ({ id, notes, onsetMs });

test("future echoes exclude the next required landing while naming later single notes", () => {
  const target = [landing("current", [60]), landing("future-a", [62]), landing("future-b", [64])];
  assert.deepEqual(earSearchFutureEchoes(target, 0, [64]), [{
    landingId: "future-b",
    landingIndex: 2,
    matchedNoteCount: 1,
    targetNoteCount: 1,
    coverage: 1,
  }]);
  assert.deepEqual(earSearchFutureEchoes(target, 0, [60]), []);
});

test("future echoes retain repeated-note positions without granting future credit", () => {
  const target = [landing("current", [55]), landing("repeat-a", [60]), landing("other", [62]), landing("repeat-b", [60])];
  assert.deepEqual(earSearchFutureEchoes(target, 0, [60]).map((echo) => [echo.landingId, echo.landingIndex]), [
    ["repeat-a", 1],
    ["repeat-b", 3],
  ]);
  assert.equal(evaluateEarSearch(target, [probe(1, [60])]).matchedLandings, 0,
    "a future echo remains separate from secure-prefix evaluation");
});

test("future chord echoes expose distinct target coverage without extra-note inflation", () => {
  const target = [landing("current", [48]), landing("dyad", [60, 64]), landing("triad", [60, 64, 67])];
  assert.deepEqual(earSearchFutureEchoes(target, 0, [60, 60, 72]), [
    { landingId: "dyad", landingIndex: 1, matchedNoteCount: 1, targetNoteCount: 2, coverage: .5 },
    { landingId: "triad", landingIndex: 2, matchedNoteCount: 1, targetNoteCount: 3, coverage: 1 / 3 },
  ]);
  assert.deepEqual(earSearchFutureEchoes(target, 0, [60, 64, 72]), [
    { landingId: "dyad", landingIndex: 1, matchedNoteCount: 2, targetNoteCount: 2, coverage: 1 },
    { landingId: "triad", landingIndex: 2, matchedNoteCount: 2, targetNoteCount: 3, coverage: 2 / 3 },
  ]);
});

test("future chord orientation reconstructs one physical burst when evaluation splits it", () => {
  const target = [landing("current-single", [48]), landing("future-triad", [60, 64, 67])];
  const attacks = [
    { id: 0, note: 60, onsetMs: 100 },
    { id: 1, note: 64, onsetMs: 110 },
    { id: 2, note: 67, onsetMs: 120 },
  ];
  let tracker = createEarSearchTracker(target);
  tracker = advanceEarSearchTracker(target, tracker, attacks.slice(0, 2), { chordWindowMs: 140, nowMs: 110 });
  assert.deepEqual(tracker.recentProbes.map((item) => item.notes), [[60, 64]],
    "the singleton current target closes evaluation after the second wrong key");
  tracker = advanceEarSearchTracker(target, tracker, attacks.slice(2), { chordWindowMs: 140, nowMs: 300 });
  assert.deepEqual(tracker.recentProbes.map((item) => item.notes), [[60, 64], [67]],
    "evaluation remains target-aware and keeps its existing probe semantics");
  const burst = earSearchFutureProbeNotes(tracker, attacks, 140);
  assert.deepEqual(burst, [60, 64, 67]);
  assert.deepEqual(earSearchFutureEchoes(target, tracker.matchedLandings, burst), [{
    landingId: "future-triad",
    landingIndex: 1,
    matchedNoteCount: 3,
    targetNoteCount: 3,
    coverage: 1,
  }]);
});

test("future echo input stays bounded and ignores empty or malformed played notes", () => {
  const target = [landing("current", [60]), landing("future", [64])];
  assert.deepEqual(earSearchFutureEchoes(target, 0, []), []);
  assert.deepEqual(earSearchFutureEchoes(target, 0, [-1, 128, 64.5]), []);
  assert.deepEqual(earSearchFutureEchoes(target, 0, [-1, 64, 128]), [{
    landingId: "future", landingIndex: 1, matchedNoteCount: 1, targetNoteCount: 1, coverage: 1,
  }]);
  assert.deepEqual(earSearchFutureEchoes(target, target.length, [64]), []);
  assert.throws(() => earSearchFutureEchoes(target, Number.NaN, [64]), /finite integer/);
  const oversized = Array.from({ length: 33 }, (_, index) => landing(`landing-${index}`, [60 + index % 12], Math.floor(index / 17)));
  assert.throws(() => earSearchFutureEchoes(oversized, 0, [64]), /1 through 32 landings/);
});

function twoStaffRoundTripScore() {
  return normalizeSheetMusicScore({
    id: "two-staff-round-trip",
    title: "Two-staff round trip",
    tempoBpm: 96,
    measures: Array.from({ length: 2 }, (_, measureIndex) => ({
      number: measureIndex + 1,
      durationBeats: 4,
      events: Array.from({ length: 4 }, (_, offset) => [
        { id: `right-${measureIndex}-${offset}`, kind: "note" as const, midi: 60 + measureIndex * 4 + offset, offsetBeats: offset, durationBeats: 1, staff: 1, hand: "right" as const },
        { id: `left-${measureIndex}-${offset}`, kind: "note" as const, midi: 48 + measureIndex * 4 + offset, offsetBeats: offset, durationBeats: 1, staff: 2, hand: "left" as const },
      ]).flat(),
    })),
  });
}

function denseLandingScore(landingCount = 32) {
  const measureCounts = [Math.floor(landingCount / 2), Math.ceil(landingCount / 2)];
  return normalizeSheetMusicScore({
    id: `dense-${landingCount}`,
    title: `Dense ${landingCount}`,
    tempoBpm: 96,
    measures: Array.from({ length: 2 }, (_, measureIndex) => ({
      number: measureIndex + 1,
      durationBeats: 4,
      events: Array.from({ length: measureCounts[measureIndex] }, (_, offset) => ({
        id: `dense-${measureIndex}-${offset}`,
        kind: "note" as const,
        midi: 60 + (measureIndex * measureCounts[0] + offset) % 12,
        offsetBeats: offset * 4 / measureCounts[measureIndex],
        durationBeats: 4 / measureCounts[measureIndex],
        staff: 1,
        hand: "right" as const,
      })),
    })),
  });
}

function boundaryTieScore() {
  return normalizeSheetMusicScore({
    id: "boundary-tie-round-trip",
    title: "Boundary tie round trip",
    tempoBpm: 96,
    measures: [
      { number: 1, durationBeats: 4, events: [
        { id: "opening-a", kind: "note", midi: 55, offsetBeats: 0, durationBeats: 1, staff: 1, hand: "right" },
        { id: "opening-b", kind: "note", midi: 57, offsetBeats: 1, durationBeats: 1, staff: 1, hand: "right" },
      ] },
      { number: 2, durationBeats: 4, events: [
        { id: "tie-start", kind: "note", midi: 60, offsetBeats: 3, durationBeats: 1, staff: 1, hand: "right", voice: "1", tie: { start: true } },
      ] },
      { number: 3, durationBeats: 4, events: [
        { id: "tie-stop", kind: "note", midi: 60, offsetBeats: 0, durationBeats: 1, staff: 1, hand: "right", voice: "1", tie: { stop: true } },
        { id: "boundary-new", kind: "note", midi: 64, offsetBeats: 0, durationBeats: 1, staff: 1, hand: "right" },
        { id: "after-a", kind: "note", midi: 67, offsetBeats: 1, durationBeats: 1, staff: 1, hand: "right" },
        { id: "after-b", kind: "note", midi: 69, offsetBeats: 2, durationBeats: 1, staff: 1, hand: "right" },
      ] },
    ],
  });
}

function staggeredStaffScore() {
  return normalizeSheetMusicScore({
    id: "staggered-staff",
    title: "Staggered staff",
    tempoBpm: 60,
    measures: [{
      number: 1,
      durationBeats: 4,
      events: [
        { id: "upper-0", kind: "note", midi: 60, offsetBeats: 0, durationBeats: 1, staff: 1, hand: "unknown" },
        { id: "lower-1", kind: "note", midi: 48, offsetBeats: 1, durationBeats: 1, staff: 2, hand: "unknown" },
        { id: "upper-2", kind: "note", midi: 64, offsetBeats: 2, durationBeats: 1, staff: 1, hand: "unknown" },
        { id: "lower-2", kind: "note", midi: 52, offsetBeats: 2, durationBeats: 1, staff: 2, hand: "unknown" },
        { id: "upper-3", kind: "note", midi: 67, offsetBeats: 3, durationBeats: 1, staff: 1, hand: "unknown" },
      ],
    }],
  });
}

function referenceClockScore() {
  return normalizeSheetMusicScore({
    id: "reference-clock",
    title: "Reference clock",
    tempoBpm: 60,
    measures: [
      { number: 1, durationBeats: 4, events: [
        { id: "held", kind: "note", midi: 60, offsetBeats: 0, durationBeats: 3, staff: 1, hand: "right" },
        { id: "late", kind: "note", midi: 64, offsetBeats: 3.5, durationBeats: 0.25, staff: 1, hand: "right" },
      ] },
      { number: 2, durationBeats: 4, events: [
        { id: "after-leading-rest", kind: "note", midi: 67, offsetBeats: 0.5, durationBeats: 0.25, staff: 1, hand: "right" },
        { id: "after-interior-rest", kind: "note", midi: 69, offsetBeats: 1.25, durationBeats: 0.25, staff: 1, hand: "right" },
        { id: "written-rest", kind: "rest", offsetBeats: 1.5, durationBeats: 2.5, staff: 1, hand: "right" },
      ] },
    ],
  });
}

function oddMeasureScore() {
  return normalizeSheetMusicScore({
    id: "odd-measures",
    title: "Odd measures",
    tempoBpm: 96,
    measures: Array.from({ length: 3 }, (_, index) => ({
      number: index + 1,
      durationBeats: 4,
      events: [{ id: `odd-${index}`, kind: "note" as const, midi: 60 + index, offsetBeats: 0, durationBeats: 1, staff: 1, hand: "right" as const }],
    })),
  });
}

function mixedMeterScore() {
  return normalizeSheetMusicScore({
    id: "mixed-meter-starts",
    title: "Mixed meter starts",
    tempoBpm: 96,
    measures: [3, 4, 5].map((durationBeats, index) => ({
      number: index + 1,
      durationBeats,
      events: [0, durationBeats / 2].map((offsetBeats, half) => ({
        id: `mixed-${index}-${half}`,
        kind: "note" as const,
        midi: 60 + index * 2 + half,
        offsetBeats,
        durationBeats: 0.5,
        staff: half === 0 ? 1 : 2,
        hand: half === 0 ? "right" as const : "left" as const,
      })),
    })),
  });
}

test("shared score restoration accepts only a bounded versioned MusicXML source", () => {
  assert.deepEqual(parseStoredScoreFlowSource(JSON.stringify({ version: 1, fileName: "study.musicxml", xml: "<score-partwise/>" })), {
    version: 1,
    fileName: "study.musicxml",
    xml: "<score-partwise/>",
  });
  assert.equal(parseStoredScoreFlowSource("not json"), null);
  assert.equal(parseStoredScoreFlowSource(JSON.stringify({ version: 2, fileName: "study.musicxml", xml: "<score-partwise/>" })), null);
  assert.equal(parseStoredScoreFlowSource(JSON.stringify({ version: 1, fileName: "", xml: "<score-partwise/>" })), null);
});

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

test("a one-semitone B-to-C boundary stays in the same coarse register band", () => {
  const result = evaluateEarSearch([landing("a", [60])], [probe(1, [59])]);
  assert.equal(result.latest?.register, "same-band");
  assert.equal(result.latest?.proximity, "near");
  assert.equal(result.latest?.pitchDirection, "higher");
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
  assert.throws(() => evaluateEarSearch([], []), /from 1 through 32/);
  assert.equal(evaluateEarSearch(Array.from({ length: 32 }, (_, index) => landing(String(index), [60])), []).totalLandings, 32);
  assert.throws(() => evaluateEarSearch(Array.from({ length: 33 }, (_, index) => landing(String(index), [60])), []), /from 1 through 32/);
  assert.throws(() => evaluateEarSearch([landing("a", [128])], []), /MIDI key/);
  assert.throws(() => evaluateEarSearch([landing("a", [60])], [{ id: 1, notes: [60], onsetMs: Number.NaN }]), /finite onset/);
  assert.equal(evaluateEarSearch([landing("a", [60], 0), landing("b", [62], 1), landing("c", [64], 2)], []).totalLandings, 3,
    "two bars beginning at a midpoint can touch three authored measures");
  assert.throws(() => evaluateEarSearch([landing("a", [60], 0), landing("b", [62], 1), landing("c", [64], 2), landing("d", [65], 3)], []), /at most three measures/);
});

test("durable tracking keeps a caught prefix through long pauses and more than 64 misses", () => {
  const target = [landing("a", [60]), landing("b", [64])];
  let tracker = createEarSearchTracker(target, 0);
  tracker = advanceEarSearchTracker(target, tracker, [{ id: 1, note: 60, onsetMs: 100 }], { chordWindowMs: 40, nowMs: 100 });
  assert.equal(tracker.matchedLandings, 1);
  const wandering = Array.from({ length: 70 }, (_, index) => ({ id: index + 2, note: 61, onsetMs: 200 + index * 500 }));
  tracker = advanceEarSearchTracker(target, tracker, wandering, { chordWindowMs: 40, nowMs: wandering.at(-1)!.onsetMs });
  assert.equal(tracker.matchedLandings, 1);
  assert.equal(tracker.recentProbes.length, 64);
  tracker = advanceEarSearchTracker(target, tracker, [{ id: 72, note: 64, onsetMs: 1_900_000 }], { chordWindowMs: 40, nowMs: 1_900_000 });
  assert.equal(tracker.complete, true);
  assert.equal(tracker.matchedLandings, 2);
  assert.deepEqual(tracker.acceptedProbeIds, [1, 72]);
});

test("target-aware gathering locks an accepted chord before the next fast landing", () => {
  const target = [landing("chord", [60, 64]), landing("next", [67])];
  let tracker = createEarSearchTracker(target, 0);
  tracker = advanceEarSearchTracker(target, tracker, [
    { id: 1, note: 60, onsetMs: 0 },
    { id: 2, note: 64, onsetMs: 80 },
    { id: 3, note: 67, onsetMs: 180 },
  ], { chordWindowMs: 240, nowMs: 250 });
  assert.equal(tracker.complete, true);
  assert.equal(tracker.matchedLandings, 2);
  assert.deepEqual(tracker.recentProbes.map((item) => item.notes), [[60, 64], [67]]);
});

test("a wide chord window never merges two singleton melodic landings", () => {
  const target = [landing("first", [60]), landing("second", [62])];
  const tracker = advanceEarSearchTracker(target, createEarSearchTracker(target, 0), [
    { id: 1, note: 60, onsetMs: 0 },
    { id: 2, note: 62, onsetMs: 100 },
  ], { chordWindowMs: 480, nowMs: 200 });
  assert.equal(tracker.complete, true);
  assert.deepEqual(tracker.recentProbes.map((item) => item.notes), [[60], [62]]);
});

test("full-texture settle rejects overfull chords independently of attack order", () => {
  const target = [landing("chord", [60, 64])];
  for (const notes of [[60, 64, 67], [67, 60, 64]]) {
    const attacks = notes.map((note, index) => ({ id: index + 1, note, onsetMs: index * 20 }));
    const tracker = advanceEarSearchTracker(target, createEarSearchTracker(target, 0), attacks, { chordWindowMs: 240, nowMs: 40 });
    assert.equal(tracker.complete, false);
    assert.equal(tracker.matchedLandings, 0);
    assert.equal(tracker.latest?.texture, "more-keys");
  }
});

test("full-texture settle rejects a dyad for a singleton landing", () => {
  const target = [landing("single", [60])];
  const tracker = advanceEarSearchTracker(target, createEarSearchTracker(target, 0), [
    { id: 1, note: 60, onsetMs: 0 },
    { id: 2, note: 64, onsetMs: 20 },
  ], { chordWindowMs: 240, nowMs: 20 });
  assert.equal(tracker.complete, false);
  assert.equal(tracker.latest?.texture, "more-keys");
});

test("reference compaction shortens only silence and never creates a false overlap", () => {
  const compact = compactEarSearchReferencePlan({
    startIndex: 0,
    baseBeat: 0,
    tempoBpm: 36,
    truncated: false,
    totalDurationMs: 11_080,
    cues: [
      { expectedIndex: 0, attackId: "a", measureNumber: "1", scoreBeat: 0, onsetMs: 0, endMs: 4_080, notes: [{ noteId: "a-note", midi: 60, onsetOffsetMs: 0, durationMs: 4_000 }] },
      { expectedIndex: 1, attackId: "b", measureNumber: "2", scoreBeat: 8, onsetMs: 10_000, endMs: 11_080, notes: [{ noteId: "b-note", midi: 64, onsetOffsetMs: 0, durationMs: 1_000 }] },
    ],
  });
  assert.equal(compact.cues.length, 2);
  assert.equal(compact.cues[1].onsetMs, 6_480);
  assert.equal(compact.cues[1].onsetMs - compact.cues[0].endMs, 2_400);
  assert.equal(compact.cues[0].endMs, 4_080);
  assert.equal(compact.truncated, false);
});

test("time spans map dense music to structural half-, one-, and two-bar frames", () => {
  const score = denseLandingScore();
  const halves = buildEarSearchChunks(score, { hand: "right", span: "half-bar" });
  const bars = buildEarSearchChunks(score, { hand: "right", span: "one-bar" });
  const pairs = buildEarSearchChunks(score, { hand: "right", span: "two-bars" });
  assert.deepEqual(halves.map((chunk) => chunk.attackCount), [8, 8, 8, 8]);
  assert.deepEqual(bars.map((chunk) => chunk.attackCount), [16, 16, 16, 8]);
  assert.deepEqual(pairs.map((chunk) => chunk.attackCount), [32, 24, 16, 8]);
  assert.deepEqual(halves.map((chunk) => [chunk.frameStartBeat, chunk.frameEndBeat]), [[0, 2], [2, 4], [4, 6], [6, 8]]);
  assert.deepEqual(bars.map((chunk) => [chunk.frameStartBeat, chunk.frameEndBeat]), [[0, 4], [2, 6], [4, 8], [6, 8]]);
  assert.deepEqual(pairs.map((chunk) => [chunk.frameStartBeat, chunk.frameEndBeat]), [[0, 8], [2, 8], [4, 8], [6, 8]]);
});

test("frame boundaries are invariant to density and retain an odd final measure", () => {
  const sparse = buildEarSearchChunks(denseLandingScore(10), { span: "half-bar" });
  const dense = buildEarSearchChunks(denseLandingScore(66), { span: "half-bar" });
  assert.deepEqual(sparse.map((chunk) => [chunk.frameStartBeat, chunk.frameEndBeat]), dense.map((chunk) => [chunk.frameStartBeat, chunk.frameEndBeat]));
  assert.equal(buildEarSearchChunks(denseLandingScore(66), { span: "two-bars" })[0].attackCount, 66,
    "32 remains a search safety limit, not a frame boundary");

  const odd = buildEarSearchChunks(oddMeasureScore(), { span: "two-bars" });
  assert.deepEqual(odd.map((chunk) => [chunk.sourceStartMeasureIndex, chunk.sourceEndMeasureIndex]), [[0, 1], [0, 2], [1, 2], [1, 2], [2, 2], [2, 2]]);
  assert.deepEqual(odd.map((chunk) => [chunk.frameStartBeat, chunk.frameEndBeat]), [[0, 8], [2, 10], [4, 12], [6, 12], [8, 12], [10, 12]]);
});

test("frame starts keep one stable address through length changes, including even bars and midpoint origins", () => {
  const score = oddMeasureScore();
  const spans = ["half-bar", "one-bar", "two-bars", "half-bar"] as const;
  for (const origin of [2, 3, 5]) {
    const frames = spans.map((span) => buildEarSearchChunks(score, { span })[origin]);
    assert.deepEqual(frames.map((chunk) => chunk.ordinal), [origin, origin, origin, origin]);
    assert.deepEqual(frames.map((chunk) => chunk.frameStartBeat), Array(4).fill(origin * 2));
    assert.deepEqual(frames.map((chunk) => chunk.startHalf), Array(4).fill(origin % 2));
    assert.equal(new Set(frames.map(formatEarSearchFrameStart)).size, 1);
  }
  assert.equal(formatEarSearchFrameStart(buildEarSearchChunks(score, { span: "two-bars" })[2]), "3 · bar 2 · first half");
  assert.equal(formatEarSearchFrameStart(buildEarSearchChunks(score, { span: "one-bar" })[3]), "4 · bar 2 · second half");
  for (const span of spans) {
    const chunks = buildEarSearchChunks(score, { span });
    assert.equal(chunks.length, 6);
    assert.deepEqual([chunks[5].frameStartBeat, chunks[5].frameEndBeat], [10, 12], "only the final end is clipped");
  }
});

test("mixed meters retain authored half-bar boundaries and allow a two-bar window touching three measures", () => {
  const score = mixedMeterScore();
  const spans = ["half-bar", "one-bar", "two-bars"] as const;
  const framesBySpan = spans.map((span) => buildEarSearchChunks(score, { span }));
  for (const chunks of framesBySpan) {
    assert.deepEqual(chunks.map((chunk) => chunk.frameStartBeat), [0, 1.5, 3, 5, 7, 9.5]);
    assert.deepEqual(chunks.map((chunk) => chunk.ordinal), [0, 1, 2, 3, 4, 5]);
  }
  assert.deepEqual(framesBySpan.map((chunks) => chunks[1].frameEndBeat), [3, 5, 9.5]);
  const window = framesBySpan[2][1];
  assert.deepEqual(window.measureNumbers, ["1", "2", "3"]);
  const target = earSearchLandingsForChunk(score, window, { voice: "full" });
  assert.deepEqual([...new Set(target.map((item) => item.measureIndex))], [0, 1, 2]);
  assert.equal(evaluateEarSearch(target, target.map((item, index) => probe(index + 1, item.notes))).complete, true);
  for (const hand of ["right", "left", "both"] as const) {
    const projected = selectEarSearchChunkLoop(score, window, hand);
    assert.deepEqual([projected.startBeat, projected.endBeat], [1.5, 9.5]);
    assert.ok(projected.attacks.every((attack) => attack.onsetBeat >= 1.5 && attack.onsetBeat < 9.5));
    const handFrames = buildEarSearchChunks(score, { hand, span: "two-bars" });
    assert.deepEqual(handFrames.map((chunk) => [chunk.ordinal, chunk.frameStartBeat, chunk.frameEndBeat]),
      framesBySpan[2].map((chunk) => [chunk.ordinal, chunk.frameStartBeat, chunk.frameEndBeat]));
  }
});

test("one-attack and rest-only frames remain first-class chunks", () => {
  const score = referenceClockScore();
  const chunks = buildEarSearchChunks(score, { span: "half-bar" });
  assert.deepEqual(chunks.map((chunk) => chunk.attackCount), [1, 1, 2, 0]);
  assert.equal(chunks[3].noteSummary, "rest");
  assert.deepEqual(selectEarSearchChunkLoop(score, chunks[3]).attacks, []);
  assert.deepEqual(earSearchLandingsForChunk(score, chunks[3]), []);
});

test("canonical Orbit frames keep bar starts fixed while staff projections change", () => {
  const score = normalizeImportedMusicXmlScore(parseMusicXml(ORBIT_STUDY_MUSICXML, "orbit-study.musicxml"));
  const canonical = buildEarSearchChunks(score, { hand: "both", span: "one-bar" });
  assert.deepEqual(canonical.map((chunk) => chunk.frameStartBeat), [0, 2, 4, 6, 8, 10, 12, 14]);
  const phraseTwo = canonical[2];
  const upper = selectEarSearchChunkLoop(score, phraseTwo, "right");
  const lower = selectEarSearchChunkLoop(score, phraseTwo, "left");
  const both = selectEarSearchChunkLoop(score, phraseTwo, "both");
  for (const loop of [upper, lower, both]) {
    assert.equal(loop.startBeat, 4);
    assert.equal(loop.endBeat, 8);
    assert.ok(loop.attacks.every((attack) => attack.onsetBeat >= 4 && attack.onsetBeat < 8));
  }
  assert.deepEqual(earSearchLandingsForChunk(score, phraseTwo, { hand: "left", voice: "full" }).flatMap((item) => item.notes), [53, 60]);
});

test("staff projections retain the canonical frame and silent attack slots", () => {
  const score = staggeredStaffScore();
  const chunk = buildEarSearchChunks(score, { hand: "both", span: "one-bar" })[0];
  const canonicalLoop = selectEarSearchChunkLoop(score, chunk);
  const upperLoop = selectEarSearchChunkLoop(score, chunk, "right");
  const lowerLoop = selectEarSearchChunkLoop(score, chunk, "left");
  assert.deepEqual(canonicalLoop.attacks.map((attack) => attack.onsetBeat), [0, 1, 2, 3]);
  assert.deepEqual(upperLoop.attacks.map((attack) => attack.onsetBeat), [0, 2, 3]);
  assert.deepEqual(lowerLoop.attacks.map((attack) => attack.onsetBeat), [1, 2]);
  assert.deepEqual([upperLoop.startBeat, upperLoop.endBeat], [0, 4]);
  assert.deepEqual([lowerLoop.startBeat, lowerLoop.endBeat], [0, 4]);

  const lower = earSearchLandingsForChunk(score, chunk, { hand: "left", voice: "full" });
  const plan = buildEarSearchReferencePlan(score, chunk, lower, { hand: "left", voice: "full", tempoBpm: 60 });
  const attacks = plan.cues.filter((cue) => cue.kind === "attack");
  assert.equal(attacks.length, 4, "the canonical attack clock is never projected away");
  assert.deepEqual(attacks.map((cue) => cue.notes.length), [0, 1, 1, 0]);
  assert.deepEqual(attacks.map((cue) => cue.targetLandingIndex), [null, 0, 1, null]);
  assert.deepEqual(plan.restSpans, [
    { startMs: 0, endMs: 1_000, durationMs: 1_000 },
    { startMs: 3_000, endMs: 4_000, durationMs: 1_000 },
  ]);
});

test("Sound Finder reference plans preserve carries, full releases, and every kind of silence", () => {
  const score = referenceClockScore();
  const frames = buildEarSearchChunks(score, { hand: "both", span: "half-bar" });

  const openingTargets = earSearchLandingsForChunk(score, frames[0], { hand: "right", voice: "full" });
  const opening = buildEarSearchReferencePlan(score, frames[0], openingTargets, { hand: "right", voice: "full", tempoBpm: 60 });
  assert.equal(opening.totalDurationMs, 2_000);
  assert.equal(opening.cues[0].notes[0].durationMs, 2_000, "the written hold is clipped only by the frame end");
  assert.deepEqual(opening.restSpans, []);

  const carriedTargets = earSearchLandingsForChunk(score, frames[1], { hand: "right", voice: "full" });
  const carried = buildEarSearchReferencePlan(score, frames[1], carriedTargets, { hand: "right", voice: "full", tempoBpm: 60 });
  assert.deepEqual(carried.cues.map((cue) => cue.kind), ["carry", "attack"]);
  assert.equal(carried.cues[0].targetLandingIndex, null);
  assert.equal(carried.cues[0].carriedFromBeat, 0);
  assert.equal(carried.cues[0].notes[0].durationMs, 1_000);
  assert.equal(carried.cues[1].notes[0].durationMs, 250);
  assert.deepEqual(carried.restSpans, [
    { startMs: 1_000, endMs: 1_500, durationMs: 500 },
    { startMs: 1_750, endMs: 2_000, durationMs: 250 },
  ]);

  const restsTargets = earSearchLandingsForChunk(score, frames[2], { hand: "right", voice: "full" });
  const rests = buildEarSearchReferencePlan(score, frames[2], restsTargets, { hand: "right", voice: "full", tempoBpm: 60 });
  assert.deepEqual(rests.restSpans, [
    { startMs: 0, endMs: 500, durationMs: 500 },
    { startMs: 750, endMs: 1_250, durationMs: 500 },
    { startMs: 1_500, endMs: 2_000, durationMs: 500 },
  ]);
  const silent = buildEarSearchReferencePlan(score, frames[3], [], { hand: "right", voice: "full", tempoBpm: 60 });
  assert.deepEqual(silent.cues, []);
  assert.deepEqual(silent.restSpans, [{ startMs: 0, endMs: 2_000, durationMs: 2_000 }]);
});

test("hand-filtered chunks and IDs round-trip on the same structural clock", () => {
  const score = twoStaffRoundTripScore();
  for (const hand of ["left", "right", "both"] as const) {
    const chunk = buildEarSearchChunks(score, { hand, span: "two-bars" })[0];
    assert.equal(chunk.hand, hand);
    assert.deepEqual([chunk.sourceStartMeasureIndex, chunk.sourceEndMeasureIndex], [0, 1]);
    if (hand !== "both") assert.match(chunk.startAttackId, new RegExp(`:${hand}$`));
    const loop = selectEarSearchChunkLoop(score, chunk);
    const targets = earSearchLandingsForChunk(score, chunk, { hand, voice: hand === "left" ? "bass" : "upper" });
    assert.equal(loop.attacks.length, chunk.attackCount, hand);
    assert.equal(targets.length, chunk.attackCount, hand);
  }
});

test("a tied note crossing a frame boundary is carry audio, never a target attack", () => {
  const score = boundaryTieScore();
  const measureThree = buildEarSearchChunks(score, { hand: "both", span: "one-bar" })[4];
  const targets = earSearchLandingsForChunk(score, measureThree, { hand: "right", voice: "full" });
  assert.ok(targets.every((target) => !target.sourceNoteIds?.includes("tie-stop")));
  const plan = buildEarSearchReferencePlan(score, measureThree, targets, { hand: "right", voice: "full", tempoBpm: 60 });
  const carry = plan.cues.find((cue) => cue.kind === "carry");
  assert.ok(carry);
  assert.equal(carry.targetLandingIndex, null);
  assert.equal(carry.notes[0].midi, 60);
});

test("chunk-loop reconstruction rejects stale attack-count metadata even for empty frames", () => {
  const score = referenceClockScore();
  const sounding = buildEarSearchChunks(score, { span: "half-bar" })[0];
  assert.throws(
    () => selectEarSearchChunkLoop(score, { ...sounding, attackCount: sounding.attackCount + 1 }),
    /stale or mismatched: expected 2 landings but reconstructed 1/,
  );
  const silent = buildEarSearchChunks(score, { span: "half-bar" })[3];
  assert.throws(
    () => selectEarSearchChunkLoop(score, { ...silent, attackCount: 1 }),
    /stale or mismatched: expected 1 landings but reconstructed 0/,
  );
});
