import assert from "node:assert/strict";
import test from "node:test";
import {
  appendBoundedSheetTakeHistory,
  sheetTakeEvidenceFromEvaluation,
  summarizeSheetChunkMemory,
  type SheetTakeEvidence,
} from "../lib/sheet-music-practice-memory.ts";
import {
  evaluateSheetMusicPerformance,
  normalizeSheetMusicScore,
} from "../lib/sheet-music-coach-model.ts";

const score = normalizeSheetMusicScore({
  id: "memory-score",
  title: "Memory score",
  tempoBpm: 60,
  measures: [{
    number: 1,
    durationBeats: 4,
    events: [
      { id: "c", kind: "note", midi: 60, offsetBeats: 0, durationBeats: 1, hand: "right" },
      { id: "e", kind: "note", midi: 64, offsetBeats: 1, durationBeats: 1, hand: "right" },
      { id: "g-low", kind: "note", midi: 55, offsetBeats: 2, durationBeats: 1, hand: "left" },
      { id: "g-high", kind: "note", midi: 67, offsetBeats: 2, durationBeats: 1, hand: "right" },
    ],
  }],
});

function take(
  takeId: string,
  finishedAt: number,
  played: Array<{ id: string; midi: number; onsetMs: number; releaseMs?: number }>,
  clockEvidence: "unscored" | "fixed-pulse" = "unscored",
) {
  const evaluation = evaluateSheetMusicPerformance(score, played, { finalize: true, timingToleranceMs: 80, durationToleranceMs: 80 });
  return sheetTakeEvidenceFromEvaluation(evaluation, { scoreId: score.id, takeId, finishedAt, hand: "both", clockEvidence });
}

test("stores separate dimensions and does not fabricate timing for a missed landing", () => {
  const evidence = take("missed", 1, [{ id: "c", midi: 60, onsetMs: 0 }], "fixed-pulse");
  assert.equal(evidence.landings[0].marks.pitch, "matched");
  assert.equal(evidence.landings[1].marks.pitch, "missed");
  assert.equal(evidence.landings[1].marks.timing, "not-observed");
  assert.equal(evidence.landings[2].marks["chord-membership"], "missed");
  assert.equal(evidence.landings[2].marks.duration, "not-observed");
});

test("self-paced takes explicitly exclude timing and duration", () => {
  const evidence = take("self-paced", 2, [
    { id: "c", midi: 60, onsetMs: 0, releaseMs: 100 },
    { id: "e", midi: 64, onsetMs: 4000, releaseMs: 4100 },
    { id: "g-low", midi: 55, onsetMs: 8000, releaseMs: 8100 },
    { id: "g-high", midi: 67, onsetMs: 8000, releaseMs: 8100 },
  ]);
  assert.ok(evidence.landings.every((landing) => landing.marks.timing === "not-observed" && landing.marks.duration === "not-observed"));
  assert.equal(evidence.landings[2].marks["chord-membership"], "matched");
  assert.equal(evidence.landings[2].marks["chord-spacing"], "matched");
});

test("append is idempotent and evicts oldest takes and landing records deterministically", () => {
  const base = take("same", 1, [{ id: "c", midi: 60, onsetMs: 0 }]);
  const replacement = { ...base, finishedAt: 4 };
  const second = take("second", 2, [{ id: "c", midi: 60, onsetMs: 0 }]);
  const third = take("third", 3, [{ id: "c", midi: 60, onsetMs: 0 }]);
  let history = appendBoundedSheetTakeHistory([], base);
  history = appendBoundedSheetTakeHistory(history, second);
  history = appendBoundedSheetTakeHistory(history, replacement);
  assert.equal(history.filter((item) => item.takeId === "same").length, 1);
  assert.equal(history.find((item) => item.takeId === "same")?.finishedAt, 4);
  history = appendBoundedSheetTakeHistory(history, third, { maxTakes: 2 });
  assert.deepEqual(history.map((item) => item.takeId), ["third", "same"]);
  assert.equal(appendBoundedSheetTakeHistory(history, second, { maxLandingRecords: 3 }).length, 1);
});

test("chunk memory follows stable landing IDs and keeps hand scopes separate", () => {
  const clean = take("clean", 3, [
    { id: "c", midi: 60, onsetMs: 0 },
    { id: "e", midi: 64, onsetMs: 1000 },
    { id: "g-low", midi: 55, onsetMs: 2000 },
    { id: "g-high", midi: 67, onsetMs: 2000 },
  ]);
  const earlier = { ...clean, takeId: "earlier", finishedAt: 2 };
  const otherHand: SheetTakeEvidence = { ...clean, takeId: "upper", hand: "right", finishedAt: 4 };
  const memory = summarizeSheetChunkMemory(["attack:c", "attack:e"], [earlier, clean, otherHand], { scoreId: score.id, hand: "both" });
  assert.equal(memory.recentTakes.length, 2);
  assert.equal(memory.consecutiveCleanTakes, 2);
  assert.match(memory.evidencePhrases[0], /2 recent takes/);
});

test("recurring repairs remain atomic evidence without blended status fields", () => {
  const first = take("first", 1, [
    { id: "c", midi: 61, onsetMs: 0 },
    { id: "e", midi: 64, onsetMs: 1000 },
    { id: "g-low", midi: 55, onsetMs: 2000 },
    { id: "g-high", midi: 67, onsetMs: 2000 },
  ]);
  const second = { ...first, takeId: "second", finishedAt: 2 };
  const memory = summarizeSheetChunkMemory(["attack:c", "attack:e"], [first, second], { scoreId: score.id, hand: "both" });
  assert.deepEqual(memory.repeatedRepairLandingIds, ["attack:c"]);
  const serialized = JSON.stringify(memory);
  assert.doesNotMatch(serialized, /mastery|musicality|confidence|accuracy/);
});

test("partial overlap remains neutral instead of becoming a failed chunk repetition", () => {
  const full = take("full", 1, [
    { id: "c", midi: 60, onsetMs: 0 },
    { id: "e", midi: 64, onsetMs: 1000 },
    { id: "g-low", midi: 55, onsetMs: 2000 },
    { id: "g-high", midi: 67, onsetMs: 2000 },
  ]);
  const partial: SheetTakeEvidence = { ...full, takeId: "partial", finishedAt: 2, landings: full.landings.slice(0, 1) };
  const memory = summarizeSheetChunkMemory(["attack:c", "attack:e"], [partial], { scoreId: score.id, hand: "both" });
  assert.equal(memory.recentTakes[0].completeCoverage, false);
  assert.equal(memory.recentTakes[0].needsRepair, false);
  assert.equal(memory.recentTakes[0].clean, false);
  assert.equal(memory.consecutiveCleanTakes, 0);
  assert.match(memory.evidencePhrases[0], /no complete repetition is claimed/i);
});

test("fixed-pulse evidence without every key release stays partial rather than clean", () => {
  const unfinished = take("unfinished-release", 3, [
    { id: "c", midi: 60, onsetMs: 0 },
    { id: "e", midi: 64, onsetMs: 1000 },
    { id: "g-low", midi: 55, onsetMs: 2000 },
    { id: "g-high", midi: 67, onsetMs: 2000 },
  ], "fixed-pulse");
  const memory = summarizeSheetChunkMemory(["attack:c", "attack:e"], [unfinished], { scoreId: score.id, hand: "both" });
  assert.equal(memory.recentTakes[0].completeCoverage, false);
  assert.equal(memory.recentTakes[0].needsRepair, false);
  assert.equal(memory.recentTakes[0].clean, false);
  assert.equal(memory.consecutiveCleanTakes, 0);
  assert.match(memory.evidencePhrases[0], /no complete repetition is claimed/i);
});

test("an extra landing marks an exact chunk repetition for repair", () => {
  const clean = take("exact-extra", 4, [
    { id: "c", midi: 60, onsetMs: 0 },
    { id: "e", midi: 64, onsetMs: 1000 },
    { id: "g-low", midi: 55, onsetMs: 2000 },
    { id: "g-high", midi: 67, onsetMs: 2000 },
  ]);
  const withExtra: SheetTakeEvidence = { ...clean, extraLandingCount: 1 };
  const landingIds = withExtra.landings.map((landing) => landing.landingId);
  const memory = summarizeSheetChunkMemory(landingIds, [withExtra], { scoreId: score.id, hand: "both" });
  assert.equal(memory.recentTakes[0].completeCoverage, true);
  assert.equal(memory.recentTakes[0].needsRepair, true);
  assert.equal(memory.recentTakes[0].clean, false);
});
