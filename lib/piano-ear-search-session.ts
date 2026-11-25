import { createEarSearchTracker, type EarSearchLanding, type EarSearchTracker } from "./piano-ear-search-model.ts";

/**
 * Return from listening without forgetting the learner's secure prefix.
 * Unfinished chord attacks cannot bridge playback, and listen-time input must
 * never be replayed as fresh probes. Explicit reset clears finds; an explicit
 * reference replay may also open a fresh pass once the whole target is found.
 */
export function rearmEarSearchTracker(
  target: readonly EarSearchLanding[],
  checkpoint: EarSearchTracker | null,
  processedThroughEventId: number,
  options: { resetProgress?: boolean; restartCompleted?: boolean } = {},
): EarSearchTracker {
  const fresh = createEarSearchTracker(target, processedThroughEventId);
  if (!checkpoint || options.resetProgress || (options.restartCompleted && checkpoint.complete)) return fresh;
  if (checkpoint.totalLandings !== target.length
    || !Number.isInteger(checkpoint.matchedLandings)
    || checkpoint.matchedLandings < 0 || checkpoint.matchedLandings > target.length) {
    throw new RangeError("The ear-search checkpoint does not match this target.");
  }
  return {
    ...checkpoint,
    processedThroughEventId: Math.max(checkpoint.processedThroughEventId, processedThroughEventId),
    pendingAttacks: [],
    // The checkpoint remembers finds, not a live instruction about a key
    // played before listening or pausing. Completed success stays truthful.
    latest: checkpoint.complete ? checkpoint.latest : null,
  };
}
