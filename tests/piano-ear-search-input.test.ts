import assert from "node:assert/strict";
import test from "node:test";
import { freshEarSearchAttacks, receivedEarSearchAttacks, type EarSearchCapturedAttack } from "../lib/piano-ear-search-input.ts";
import { advanceEarSearchTracker, createEarSearchTracker, earSearchFutureProbeNotes } from "../lib/piano-ear-search-model.ts";
import { rearmEarSearchTracker } from "../lib/piano-ear-search-session.ts";

const target = [{ id: "triad", notes: [60, 64, 67], measureIndex: 0, measureNumber: "1" }];
const initial = () => createEarSearchTracker(target, 0);
const boundary = { eventId: 0, atMs: 10_000 };

test("local receipt admits attacks from a positive source clock with another origin", () => {
  const events = [
    { id: 1, note: 60, onsetMs: 100, receivedAtMs: 11_100 },
    { id: 2, note: 64, onsetMs: 180, receivedAtMs: 11_180 },
    { id: 3, note: 67, onsetMs: 260, receivedAtMs: 11_260 },
  ];
  const fresh = freshEarSearchAttacks(events, initial(), boundary);
  assert.deepEqual(fresh.map((event) => event.onsetMs), [11_100, 11_180, 11_260]);
  const result = advanceEarSearchTracker(target, initial(), fresh, { chordWindowMs: 600, nowMs: 11_320 });
  assert.equal(result.complete, true);
});

test("partway listening and probing repeatedly continues even with a differently based MIDI clock", () => {
  const route = Array.from({ length: 8 }, (_, index) => ({ ...target[0], id: `step-${index}`, notes: [60 + index] }));
  let tracker = createEarSearchTracker(route, 0);
  const events: EarSearchCapturedAttack[] = [];
  let eventId = 0;
  for (let index = 0; index < route.length; index += 1) {
    const atMs = 10_000 + index * 2_000;
    // A reference-time key can be published in the same frame as the new key.
    events.push({ id: ++eventId, note: route[index].notes[0], onsetMs: 10 + index * 100, receivedAtMs: atMs - 10 });
    const boundary = { eventId: eventId - 1, atMs };
    tracker = rearmEarSearchTracker(route, tracker, boundary.eventId);
    events.push({ id: ++eventId, note: route[index].notes[0], onsetMs: 20 + index * 100, receivedAtMs: atMs + 10 });
    const fresh = freshEarSearchAttacks(events, tracker, boundary);
    assert.deepEqual(fresh.map(({ id }) => id), [eventId]);
    tracker = advanceEarSearchTracker(route, tracker, fresh, { chordWindowMs: 600, nowMs: atMs + 80 });
    assert.equal(tracker.matchedLandings, index + 1);
    assert.equal(tracker.probeCount, index + 1);
  }
  assert.equal(tracker.complete, true);
});

test("a pre-boundary raw receipt stays excluded even when its view is published later", () => {
  const events = [
    { id: 1, note: 60, onsetMs: 20, receivedAtMs: 980 },
    { id: 2, note: 64, onsetMs: 40, receivedAtMs: 1_020 },
  ];
  assert.deepEqual(freshEarSearchAttacks(events, initial(), { eventId: 0, atMs: 1_000 }), [
    { id: 2, note: 64, onsetMs: 1_020 },
  ]);
});

test("post-reload future orientation ignores negative historical onsets and retains the fresh physical burst", () => {
  for (const historicalCount of [1, 7, 64]) {
    const historical = Array.from({ length: historicalCount }, (_, index) => ({
      id: index + 1,
      note: 48 + index % 12,
      onsetMs: -(historicalCount - index) * 1_000,
      receivedAtMs: 0,
    }));
    const events: EarSearchCapturedAttack[] = [
      ...historical,
      { id: historicalCount + 1, note: 60, onsetMs: 50, receivedAtMs: 980 },
      { id: historicalCount + 2, note: 64, onsetMs: 80, receivedAtMs: 1_020 },
      { id: historicalCount + 3, note: 67, onsetMs: 160, receivedAtMs: 1_100 },
    ];
    // On reload the local score can become ready before the restored history
    // publishes. Receipt gating must therefore work even with an empty ID fence.
    const localBoundary = { eventId: 0, atMs: 1_000 };
    const received = receivedEarSearchAttacks(events, localBoundary);
    assert.deepEqual(received.map(({ id }) => id), [historicalCount + 2, historicalCount + 3]);
    assert.deepEqual(received.map(({ onsetMs }) => onsetMs), [80, 160],
      "future orientation keeps source spacing without validating irrelevant historical input");
    const route = [{ ...target[0], notes: [60] }, { ...target[0], id: "future-dyad", notes: [64, 67] }];
    const empty = createEarSearchTracker(route, 0);
    const fresh = freshEarSearchAttacks(events, empty, localBoundary);
    const tracker = advanceEarSearchTracker(route, empty, fresh, { chordWindowMs: 40, nowMs: 1_100 });
    assert.equal(tracker.probeCount, 2);
    assert.deepEqual(earSearchFutureProbeNotes(tracker, received, 600), [64, 67],
      "a wrong post-reload probe must not throw or lose its future-chord fraction");
    assert.equal(events[0].onsetMs, -historicalCount * 1_000,
      "excluding old history must not clamp away its original relative timing");
  }
});

test("both the checkpoint and the latest raw-event boundary exclude previously seen attacks", () => {
  const tracker = { ...initial(), processedThroughEventId: 5 };
  const events = [5, 6, 7, 8].map((id) => ({ id, note: 60, onsetMs: id, receivedAtMs: 11_000 }));
  assert.deepEqual(freshEarSearchAttacks(events, tracker, { eventId: 7, atMs: 10_000 }).map((event) => event.id), [8]);
  assert.deepEqual(freshEarSearchAttacks(events, { ...tracker, processedThroughEventId: 8 }, boundary), []);
});

test("one queued batch retains source intervals even when all callbacks share a receipt time", () => {
  const events = [1_000, 1_100, 1_200].map((onsetMs, index) => ({ id: index + 1, note: target[0].notes[index], onsetMs, receivedAtMs: 1_400 }));
  const fresh = freshEarSearchAttacks(events, initial(), { eventId: 0, atMs: 900 });
  assert.deepEqual(fresh.map((event) => event.onsetMs), [1_200, 1_300, 1_400]);
  assert.deepEqual(fresh.slice(1).map((event, index) => event.onsetMs - fresh[index].onsetMs), [100, 100]);
});

test("incremental chord input retains the pending attack's established source offset", () => {
  const events = [
    { id: 1, note: 60, onsetMs: 100, receivedAtMs: 11_100 },
    { id: 2, note: 64, onsetMs: 180, receivedAtMs: 11_230 },
  ];
  const first = freshEarSearchAttacks(events.slice(0, 1), initial(), boundary);
  const tracker = advanceEarSearchTracker(target, initial(), first, { chordWindowMs: 600, nowMs: 11_100 });
  assert.deepEqual(freshEarSearchAttacks(events, tracker, boundary), [{ id: 2, note: 64, onsetMs: 11_180 }]);
});

test("a forward source-clock reset is clamped to receipt and cannot create a future settle deadline", () => {
  const dyad = [{ ...target[0], notes: [60, 64] }];
  const events = [
    { id: 1, note: 60, onsetMs: 100, receivedAtMs: 1_100 },
    { id: 2, note: 64, onsetMs: 100_000, receivedAtMs: 1_120 },
  ];
  const localBoundary = { eventId: 0, atMs: 1_000 };
  const first = freshEarSearchAttacks(events.slice(0, 1), initial(), localBoundary);
  let tracker = advanceEarSearchTracker(dyad, createEarSearchTracker(dyad, 0), first, { chordWindowMs: 600, nowMs: 1_100 });
  const second = freshEarSearchAttacks(events, tracker, localBoundary);
  assert.deepEqual(second, [{ id: 2, note: 64, onsetMs: 1_120 }]);
  tracker = advanceEarSearchTracker(dyad, tracker, second, { chordWindowMs: 600, nowMs: 1_180 });
  assert.equal(tracker.complete, true);
});

test("late cross-batch delivery may compress spacing but never waits on an onset after receipt", () => {
  const events = [
    { id: 1, note: 60, onsetMs: 1_000, receivedAtMs: 1_400 },
    { id: 2, note: 64, onsetMs: 1_100, receivedAtMs: 1_410 },
  ];
  const localBoundary = { eventId: 0, atMs: 900 };
  const first = freshEarSearchAttacks(events.slice(0, 1), initial(), localBoundary);
  const tracker = advanceEarSearchTracker(target, initial(), first, { chordWindowMs: 600, nowMs: 1_400 });
  assert.deepEqual(freshEarSearchAttacks(events, tracker, localBoundary), [{ id: 2, note: 64, onsetMs: 1_410 }]);
});

test("legacy events without receipts retain their original onset and boundary behavior", () => {
  const events = [{ id: 1, note: 60, onsetMs: 100 }, { id: 2, note: 64, onsetMs: 200 }];
  assert.deepEqual(freshEarSearchAttacks(events, initial(), { eventId: 0, atMs: 150 }), [events[1]]);
  assert.deepEqual(freshEarSearchAttacks(events, initial(), { eventId: 0, atMs: 0 }), events);
});

test("invalid receipt metadata falls back to legacy onset time", () => {
  for (const receivedAtMs of [Number.NaN, Infinity, -1]) {
    assert.deepEqual(freshEarSearchAttacks([{ id: 1, note: 60, onsetMs: 100, receivedAtMs }], initial(), { eventId: 0, atMs: 0 }), [
      { id: 1, note: 60, onsetMs: 100 },
    ]);
  }
});

test("a new group after a long gap reanchors instead of retaining the old clock origin", () => {
  const events = [{ id: 2, note: 64, onsetMs: 20, receivedAtMs: 30_000 }];
  const tracker = { ...initial(), processedThroughEventId: 1, pendingAttacks: [] };
  assert.deepEqual(freshEarSearchAttacks(events, tracker, boundary), [{ id: 2, note: 64, onsetMs: 30_000 }]);
});

test("missing retained anchor input safely reanchors the next fresh batch", () => {
  const tracker = { ...initial(), processedThroughEventId: 1, pendingAttacks: [{ id: 1, note: 60, onsetMs: 11_100 }] };
  const events = [{ id: 2, note: 64, onsetMs: 180, receivedAtMs: 11_180 }];
  assert.deepEqual(freshEarSearchAttacks(events, tracker, boundary), [{ id: 2, note: 64, onsetMs: 11_180 }]);
});

test("receipt boundaries are inclusive and input arrays, records, and checkpoints remain unchanged", () => {
  const events: readonly EarSearchCapturedAttack[] = Object.freeze([
    Object.freeze({ id: 1, note: 60, onsetMs: 100, receivedAtMs: 10_000 }),
  ]);
  const tracker = initial();
  const before = structuredClone(tracker);
  const fresh = freshEarSearchAttacks(events, tracker, boundary);
  assert.deepEqual(fresh, [{ id: 1, note: 60, onsetMs: 10_000 }]);
  assert.notEqual(fresh[0], events[0]);
  assert.deepEqual(tracker, before);
  assert.deepEqual(events[0], { id: 1, note: 60, onsetMs: 100, receivedAtMs: 10_000 });
});
