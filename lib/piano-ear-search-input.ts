import type { EarSearchAttack, EarSearchTracker } from "./piano-ear-search-model.ts";

export type EarSearchCapturedAttack = EarSearchAttack & {
  /** Local performance.now() when the raw input callback received this attack. */
  receivedAtMs?: number;
};

export type EarSearchInputBoundary = {
  eventId: number;
  atMs: number;
};

function localReceipt(attack: EarSearchCapturedAttack) {
  return Number.isFinite(attack.receivedAtMs) && attack.receivedAtMs! >= 0
    ? attack.receivedAtMs
    : undefined;
}

/** Raw current-pass input for orientation, excluding old restored history. */
export function receivedEarSearchAttacks(
  events: readonly EarSearchCapturedAttack[],
  boundary: EarSearchInputBoundary,
): EarSearchCapturedAttack[] {
  return events.filter((event) => event.id > boundary.eventId
    && (localReceipt(event) ?? event.onsetMs) >= boundary.atMs);
}

/**
 * Gate raw input by its local receipt, not a device/browser source-clock origin
 * or the later paint that publishes it. Legacy records fall back to onset time.
 * A newly delivered batch shares one offset, preserving queued chord spacing;
 * its tightest receipt bounds that offset so no mapped onset is in the future.
 * While a chord is pending, keep its established offset. A source-clock reset
 * or late cross-batch delivery can then compress spacing at the receipt clamp,
 * deliberately preferring a finite untimed gather over a future timer stall.
 */
export function freshEarSearchAttacks(
  events: readonly EarSearchCapturedAttack[],
  tracker: Pick<EarSearchTracker, "processedThroughEventId" | "pendingAttacks">,
  boundary: EarSearchInputBoundary,
): EarSearchAttack[] {
  const fresh = receivedEarSearchAttacks(events, boundary)
    .filter((event) => event.id > tracker.processedThroughEventId);
  if (!fresh.length) return [];

  const pendingFirst = tracker.pendingAttacks[0];
  const rawPendingFirst = pendingFirst ? events.find((event) => event.id === pendingFirst.id) : undefined;
  const offset = pendingFirst && rawPendingFirst
    ? pendingFirst.onsetMs - rawPendingFirst.onsetMs
    : fresh.reduce((minimum, event) => Math.min(minimum, (localReceipt(event) ?? event.onsetMs) - event.onsetMs), Infinity);

  return fresh.map((event) => ({
    id: event.id,
    note: event.note,
    onsetMs: Math.max(0, Math.min(localReceipt(event) ?? Infinity, event.onsetMs + offset)),
  }));
}
