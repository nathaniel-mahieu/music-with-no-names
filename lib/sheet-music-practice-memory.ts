import type {
  PracticeHand,
  SheetEventComparison,
  SheetPerformanceEvaluation,
} from "./sheet-music-coach-model";

export const SHEET_PRACTICE_DIMENSIONS = [
  "pitch",
  "chord-membership",
  "chord-spacing",
  "arpeggiation",
  "timing",
  "duration",
] as const;

export type SheetPracticeDimension = (typeof SHEET_PRACTICE_DIMENSIONS)[number];
export type SheetEvidenceMark = "matched" | "mismatched" | "missed" | "not-observed";
export type SheetClockEvidence = "unscored" | "fixed-pulse";

export type SheetTakeLandingEvidence = {
  landingId: string;
  marks: Record<SheetPracticeDimension, SheetEvidenceMark>;
};

export type SheetTakeEvidence = {
  version: 1;
  scoreId: string;
  takeId: string;
  finishedAt: number;
  hand: PracticeHand;
  clockEvidence: SheetClockEvidence;
  landings: SheetTakeLandingEvidence[];
  extraLandingCount: number;
};

export type SheetEvidenceTally = Record<SheetEvidenceMark, number>;

export type SheetChunkTakeTrace = {
  takeId: string;
  finishedAt: number;
  dimensions: Record<SheetPracticeDimension, SheetEvidenceTally>;
  completeCoverage: boolean;
  needsRepair: boolean;
  clean: boolean;
};

export type SheetChunkMemory = {
  landingIds: string[];
  recentTakes: SheetChunkTakeTrace[];
  repeatedRepairLandingIds: string[];
  consecutiveCleanTakes: number;
  evidencePhrases: string[];
};

function emptyTally(): SheetEvidenceTally {
  return { matched: 0, mismatched: 0, missed: 0, "not-observed": 0 };
}

function markFromBoolean(value: boolean | null, missed: boolean, scoreMissed: boolean): SheetEvidenceMark {
  if (scoreMissed) return missed ? "missed" : "not-observed";
  return value == null ? "not-observed" : value ? "matched" : "mismatched";
}

function evidenceForComparison(comparison: SheetEventComparison, clockEvidence: SheetClockEvidence): SheetTakeLandingEvidence {
  const scoreMissed = comparison.status === "missed";
  const isChord = comparison.chordMatch !== null;
  return {
    landingId: comparison.expected.id,
    marks: {
      pitch: markFromBoolean(comparison.pitchMatch, true, scoreMissed),
      "chord-membership": isChord ? markFromBoolean(comparison.chordMatch, true, scoreMissed) : "not-observed",
      "chord-spacing": isChord ? markFromBoolean(comparison.spacingMatch, true, scoreMissed) : "not-observed",
      arpeggiation: comparison.arpeggiationMatch == null ? "not-observed" : markFromBoolean(comparison.arpeggiationMatch, true, scoreMissed),
      timing: clockEvidence === "unscored" ? "not-observed" : markFromBoolean(comparison.timingMatch, false, scoreMissed),
      duration: clockEvidence === "unscored" ? "not-observed" : markFromBoolean(comparison.durationMatch, false, scoreMissed),
    },
  };
}

function assertIdentifier(value: string, label: string) {
  if (!value.trim() || value.length > 512) throw new RangeError(`${label} must be a non-empty bounded string.`);
}

/** Convert one frozen, finalized comparison into inspectable per-landing evidence. */
export function sheetTakeEvidenceFromEvaluation(
  evaluation: SheetPerformanceEvaluation,
  metadata: {
    scoreId: string;
    takeId: string;
    finishedAt: number;
    hand: PracticeHand;
    clockEvidence: SheetClockEvidence;
  },
): SheetTakeEvidence {
  if (!evaluation.complete || evaluation.comparisons.some((comparison) => comparison.status === "pending")) {
    throw new Error("Practice memory accepts only a frozen, finalized evaluation.");
  }
  assertIdentifier(metadata.scoreId, "Score ID");
  assertIdentifier(metadata.takeId, "Take ID");
  if (!Number.isFinite(metadata.finishedAt) || metadata.finishedAt < 0) throw new RangeError("Finished time must be a non-negative finite number.");
  if (!["left", "right", "unknown", "both"].includes(metadata.hand)) throw new RangeError("Unknown practice hand.");
  if (!["unscored", "fixed-pulse"].includes(metadata.clockEvidence)) throw new RangeError("Unknown clock-evidence mode.");
  return {
    version: 1,
    scoreId: metadata.scoreId,
    takeId: metadata.takeId,
    finishedAt: metadata.finishedAt,
    hand: metadata.hand,
    clockEvidence: metadata.clockEvidence,
    landings: evaluation.comparisons.map((comparison) => evidenceForComparison(comparison, metadata.clockEvidence)),
    extraLandingCount: evaluation.extraClusters.length,
  };
}

function validateTake(take: SheetTakeEvidence) {
  if (take.version !== 1 || !Array.isArray(take.landings)) throw new TypeError("Practice take has an unsupported shape.");
  assertIdentifier(take.scoreId, "Score ID");
  assertIdentifier(take.takeId, "Take ID");
  if (!Number.isFinite(take.finishedAt) || take.finishedAt < 0) throw new RangeError("Finished time must be a non-negative finite number.");
  if (!Number.isInteger(take.extraLandingCount) || take.extraLandingCount < 0) throw new RangeError("Extra-landing count must be a non-negative integer.");
  for (const landing of take.landings) {
    assertIdentifier(landing.landingId, "Landing ID");
    for (const dimension of SHEET_PRACTICE_DIMENSIONS) {
      if (!["matched", "mismatched", "missed", "not-observed"].includes(landing.marks[dimension])) {
        throw new RangeError(`Unknown ${dimension} evidence mark.`);
      }
    }
  }
}

/** Append or replace one take, then evict oldest evidence deterministically. */
export function appendBoundedSheetTakeHistory(
  history: readonly SheetTakeEvidence[],
  take: SheetTakeEvidence,
  options: { maxTakes?: number; maxLandingRecords?: number } = {},
): SheetTakeEvidence[] {
  const maxTakes = options.maxTakes ?? 12;
  const maxLandingRecords = options.maxLandingRecords ?? 2048;
  if (!Number.isInteger(maxTakes) || maxTakes < 1 || maxTakes > 32) throw new RangeError("Take history bound must be from 1 through 32.");
  if (!Number.isInteger(maxLandingRecords) || maxLandingRecords < 1 || maxLandingRecords > 8192) throw new RangeError("Landing-record bound must be from 1 through 8192.");
  validateTake(take);
  history.forEach(validateTake);
  const identity = (item: SheetTakeEvidence) => `${item.scoreId}\u0000${item.hand}\u0000${item.takeId}`;
  const next = [...history.filter((item) => identity(item) !== identity(take)), take]
    .sort((first, second) => first.finishedAt - second.finishedAt || first.takeId.localeCompare(second.takeId));
  while (next.length > maxTakes || next.reduce((total, item) => total + item.landings.length, 0) > maxLandingRecords) next.shift();
  return next;
}

function isRepair(mark: SheetEvidenceMark) {
  return mark === "mismatched" || mark === "missed";
}

function landingNeedsRepair(landing: SheetTakeLandingEvidence) {
  return SHEET_PRACTICE_DIMENSIONS.some((dimension) => isRepair(landing.marks[dimension]));
}

function takeHasCompleteEvidence(take: SheetTakeEvidence, selected: readonly SheetTakeLandingEvidence[], expectedLandingCount: number) {
  if (selected.length !== expectedLandingCount) return false;
  if (take.clockEvidence !== "fixed-pulse") return true;
  return selected.every((landing) => landing.marks.timing !== "not-observed" && landing.marks.duration !== "not-observed");
}

function takeIsClean(take: SheetTakeEvidence, landingIds: Set<string>) {
  const selected = take.landings.filter((landing) => landingIds.has(landing.landingId));
  return takeHasCompleteEvidence(take, selected, landingIds.size)
    // Extra clusters do not yet carry a stable aligned landing ID. They can
    // invalidate an exact chunk take, but must not taint every chunk inside a
    // longer measure-loop take when their location is unknowable.
    && (take.landings.length !== landingIds.size || take.extraLandingCount === 0)
    && selected.every((landing) => !landingNeedsRepair(landing));
}

/** Summarize recent repetitions without inventing mastery or a blended score. */
export function summarizeSheetChunkMemory(
  landingIds: readonly string[],
  history: readonly SheetTakeEvidence[],
  options: { scoreId: string; hand: PracticeHand; recentTakeLimit?: number },
): SheetChunkMemory {
  if (!landingIds.length || landingIds.length > 64) throw new RangeError("Chunk memory needs from 1 through 64 landing IDs.");
  const uniqueLandingIds = [...new Set(landingIds)];
  if (uniqueLandingIds.length !== landingIds.length) throw new RangeError("Chunk landing IDs must be unique.");
  uniqueLandingIds.forEach((id) => assertIdentifier(id, "Landing ID"));
  const recentTakeLimit = options.recentTakeLimit ?? 3;
  if (!Number.isInteger(recentTakeLimit) || recentTakeLimit < 1 || recentTakeLimit > 8) throw new RangeError("Recent-take limit must be from 1 through 8.");
  const landingSet = new Set(uniqueLandingIds);
  const relevant = history
    .filter((take) => take.scoreId === options.scoreId && take.hand === options.hand && take.landings.some((landing) => landingSet.has(landing.landingId)))
    .sort((first, second) => second.finishedAt - first.finishedAt || second.takeId.localeCompare(first.takeId))
    .slice(0, recentTakeLimit);
  const traces = relevant.map((take): SheetChunkTakeTrace => {
    const dimensions = Object.fromEntries(SHEET_PRACTICE_DIMENSIONS.map((dimension) => [dimension, emptyTally()])) as Record<SheetPracticeDimension, SheetEvidenceTally>;
    for (const landing of take.landings) {
      if (!landingSet.has(landing.landingId)) continue;
      for (const dimension of SHEET_PRACTICE_DIMENSIONS) dimensions[dimension][landing.marks[dimension]] += 1;
    }
    const selected = take.landings.filter((landing) => landingSet.has(landing.landingId));
    const completeCoverage = takeHasCompleteEvidence(take, selected, landingSet.size);
    const exactScope = selected.length === landingSet.size && take.landings.length === landingSet.size;
    const needsRepair = selected.some(landingNeedsRepair) || (exactScope && take.extraLandingCount > 0);
    return { takeId: take.takeId, finishedAt: take.finishedAt, dimensions, completeCoverage, needsRepair, clean: takeIsClean(take, landingSet) };
  });
  const repairCounts = new Map<string, number>();
  for (const take of relevant) for (const landing of take.landings) {
    if (landingSet.has(landing.landingId) && landingNeedsRepair(landing)) repairCounts.set(landing.landingId, (repairCounts.get(landing.landingId) ?? 0) + 1);
  }
  const repeatedRepairLandingIds = uniqueLandingIds.filter((id) => (repairCounts.get(id) ?? 0) >= 2);
  let consecutiveCleanTakes = 0;
  for (const trace of traces) {
    if (!trace.clean) break;
    consecutiveCleanTakes += 1;
  }
  const evidencePhrases: string[] = [];
  if (consecutiveCleanTakes >= 2) evidencePhrases.push(`All selected evidence aligned in ${consecutiveCleanTakes} recent takes in a row.`);
  else if (consecutiveCleanTakes === 1) evidencePhrases.push("All selected evidence aligned in the latest take.");
  if (repeatedRepairLandingIds.length) evidencePhrases.push(`The same repair returned at ${repeatedRepairLandingIds.length} landing${repeatedRepairLandingIds.length === 1 ? "" : "s"}.`);
  if (traces.length >= 2 && traces[0].needsRepair && traces[1].clean) evidencePhrases.push("A previously aligned take needs repair on this repetition.");
  if (traces.length >= 2 && traces[0].clean && traces[1].needsRepair) evidencePhrases.push("A repair from the previous take is absent in the latest take.");
  if (!evidencePhrases.length && traces.some((trace) => !trace.completeCoverage && !trace.needsRepair)) evidencePhrases.push("This is partial evidence: not every chunk landing and required key-up was observed, so no complete repetition is claimed.");
  return { landingIds: uniqueLandingIds, recentTakes: traces, repeatedRepairLandingIds, consecutiveCleanTakes, evidencePhrases };
}
