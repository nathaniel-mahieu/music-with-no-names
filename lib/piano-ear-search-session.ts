import { createEarSearchTracker, type EarSearchLanding, type EarSearchTracker } from "./piano-ear-search-model.ts";

/**
 * Return from listening without forgetting the learner's secure prefix.
 * Unfinished chord attacks cannot bridge playback, and listen-time input must
 * never be replayed as fresh probes. Only an explicit reset clears finds.
 */
export function rearmEarSearchTracker(
  target: readonly EarSearchLanding[],
  checkpoint: EarSearchTracker | null,
  processedThroughEventId: number,
  options: { resetProgress?: boolean } = {},
): EarSearchTracker {
  const fresh = createEarSearchTracker(target, processedThroughEventId);
  if (!checkpoint || options.resetProgress) return fresh;
  if (checkpoint.totalLandings !== target.length
    || !Number.isInteger(checkpoint.matchedLandings)
    || checkpoint.matchedLandings < 0 || checkpoint.matchedLandings > target.length) {
    throw new RangeError("The ear-search checkpoint does not match this target.");
  }
  return {
    ...checkpoint,
    processedThroughEventId: Math.max(checkpoint.processedThroughEventId, processedThroughEventId),
    pendingAttacks: [],
  };
}
