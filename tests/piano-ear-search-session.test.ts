import assert from "node:assert/strict";
import test from "node:test";
import { advanceEarSearchTracker, createEarSearchTracker, type EarSearchAttack, type EarSearchLanding } from "../lib/piano-ear-search-model.ts";
import { rearmEarSearchTracker } from "../lib/piano-ear-search-session.ts";

const landing = (id: string, notes: number[]): EarSearchLanding => ({ id, notes, measureIndex: 0, measureNumber: "1" });
const attack = (id: number, note: number, onsetMs: number): EarSearchAttack => ({ id, note, onsetMs });

test("repeated reference listens retain the secure prefix and continue at the next attack", () => {
  const target = Array.from({ length: 8 }, (_, index) => landing(`step-${index}`, [60 + index]));
  let tracker = createEarSearchTracker(target, 0);
  let eventId = 0;
  for (let index = 0; index < target.length; index += 1) {
    const probe = attack(++eventId, target[index].notes[0], eventId * 100);
    tracker = advanceEarSearchTracker(target, tracker, [probe], { chordWindowMs: 40, nowMs: probe.onsetMs });
    assert.equal(tracker.matchedLandings, index + 1);
    const beforeListen = tracker;
    // Two keys were explored while the reference was sounding, so the next
    // probing session starts after those raw IDs without replaying them.
    eventId += 2;
    tracker = rearmEarSearchTracker(target, tracker, eventId);
    assert.equal(tracker.matchedLandings, beforeListen.matchedLandings);
    assert.deepEqual(tracker.acceptedProbeIds, beforeListen.acceptedProbeIds);
    assert.deepEqual(tracker.recentProbes, beforeListen.recentProbes);
    assert.equal(tracker.probeCount, beforeListen.probeCount);
    assert.deepEqual(tracker.latest, beforeListen.latest);
    assert.equal(tracker.processedThroughEventId, eventId);
    assert.deepEqual(tracker.pendingAttacks, []);
  }
  assert.equal(tracker.complete, true);
  assert.equal(tracker.probeCount, target.length);
});

test("a replay preserves a completed route while an explicit reset clears it", () => {
  const target = [landing("only", [60])];
  const complete = advanceEarSearchTracker(target, createEarSearchTracker(target, 0), [attack(1, 60, 100)], { chordWindowMs: 40, nowMs: 100 });
  const replayed = rearmEarSearchTracker(target, complete, 7);
  assert.equal(replayed.complete, true);
  assert.equal(replayed.matchedLandings, 1);
  assert.equal(replayed.probeCount, 1);
  assert.deepEqual(replayed.acceptedProbeIds, [1]);
  const reset = rearmEarSearchTracker(target, replayed, 9, { resetProgress: true });
  assert.equal(reset.complete, false);
  assert.equal(reset.matchedLandings, 0);
  assert.equal(reset.probeCount, 0);
  assert.deepEqual(reset.acceptedProbeIds, []);
  assert.deepEqual(reset.recentProbes, []);
  assert.equal(reset.latest, null);
  assert.equal(reset.processedThroughEventId, 9);
});

test("an unfinished pre-listen chord cannot join a post-listen key", () => {
  const target = [landing("start", [60]), landing("dyad", [62, 65])];
  let tracker = advanceEarSearchTracker(target, createEarSearchTracker(target, 0), [attack(1, 60, 100)], { chordWindowMs: 240, nowMs: 180 });
  tracker = advanceEarSearchTracker(target, tracker, [attack(2, 62, 250)], { chordWindowMs: 240, nowMs: 250 });
  assert.equal(tracker.matchedLandings, 1);
  assert.deepEqual(tracker.pendingAttacks.map(({ note }) => note), [62]);
  const beforeListen = tracker;
  tracker = rearmEarSearchTracker(target, tracker, 7);
  assert.deepEqual(tracker.pendingAttacks, []);
  assert.deepEqual(beforeListen.pendingAttacks.map(({ note }) => note), [62], "rearming must not mutate the saved checkpoint");
  tracker = advanceEarSearchTracker(target, tracker, [attack(8, 65, 800)], { chordWindowMs: 240, nowMs: 1100 });
  assert.equal(tracker.matchedLandings, 1, "the old 62 must not complete this new partial chord");
  assert.deepEqual(tracker.recentProbes.at(-1)?.notes, [65]);
  tracker = advanceEarSearchTracker(target, tracker, [attack(9, 62, 1200), attack(10, 65, 1205)], { chordWindowMs: 240, nowMs: 1300 });
  assert.equal(tracker.complete, true);
  assert.equal(tracker.matchedLandings, 2);
});

test("listen-time and delayed-published attacks earn no credit but the first fresh key does", () => {
  const target = [landing("first", [60]), landing("next", [62])];
  let tracker = advanceEarSearchTracker(target, createEarSearchTracker(target, 0), [attack(10, 60, 100)], { chordWindowMs: 40, nowMs: 100 });
  const boundary = { eventId: 20, atMs: 1000 };
  tracker = rearmEarSearchTracker(target, tracker, boundary.eventId);
  const events = [
    attack(19, 62, 1020), // already captured at the listen boundary
    attack(21, 62, 980), // delivered in a later paint, attacked before Stop
    attack(22, 62, 1010), // the first genuinely fresh post-Stop key
  ];
  // Keep both gates used by the HUD: a frame-batched ID boundary alone cannot
  // reject MIDI events attacked before Stop but published afterward.
  const fresh = events.filter((event) => event.id > tracker.processedThroughEventId && event.onsetMs >= boundary.atMs);
  assert.deepEqual(fresh.map(({ id }) => id), [22]);
  tracker = advanceEarSearchTracker(target, tracker, fresh, { chordWindowMs: 40, nowMs: 1020 });
  assert.equal(tracker.complete, true);
  assert.deepEqual(tracker.acceptedProbeIds, [10, 22]);
  assert.equal(tracker.probeCount, 2);
});

test("rearming never moves the raw-event high-water mark backward", () => {
  const target = [landing("one", [60]), landing("two", [62])];
  const checkpoint = advanceEarSearchTracker(target, createEarSearchTracker(target, 0), [attack(30, 60, 100)], { chordWindowMs: 40, nowMs: 100 });
  const rearmed = rearmEarSearchTracker(target, checkpoint, 12);
  assert.equal(rearmed.processedThroughEventId, 30);
  assert.equal(rearmed.matchedLandings, 1);
  const replayed = advanceEarSearchTracker(target, rearmed, [attack(29, 62, 200)], { chordWindowMs: 40, nowMs: 200 });
  assert.equal(replayed.matchedLandings, 1);
  assert.equal(replayed.probeCount, 1);
});

test("rearming validates the target, checkpoint count, and new event boundary", () => {
  const target = [landing("one", [60]), landing("two", [62])];
  const checkpoint = createEarSearchTracker(target, 0);
  assert.deepEqual(rearmEarSearchTracker(target, null, 3), createEarSearchTracker(target, 3));
  for (const eventId of [-2, .5, Number.NaN, Number.POSITIVE_INFINITY]) {
    assert.throws(() => rearmEarSearchTracker(target, checkpoint, eventId), /event boundary/);
  }
  for (const malformed of [
    { ...checkpoint, totalLandings: 1 },
    { ...checkpoint, matchedLandings: -1 },
    { ...checkpoint, matchedLandings: 3 },
    { ...checkpoint, matchedLandings: .5 },
    { ...checkpoint, matchedLandings: Number.NaN },
  ]) assert.throws(() => rearmEarSearchTracker(target, malformed, 4), /checkpoint does not match/);
  assert.throws(() => rearmEarSearchTracker([], null, 0), /1 through 32 landings/);
});
