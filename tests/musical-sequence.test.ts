import assert from "node:assert/strict";
import test from "node:test";
import {
  eventsInSelection,
  localGesturePrediction,
  sequenceSurprise,
  transformedRecurrence,
  type MusicalEvent,
} from "../lib/musical-sequence.ts";

function event(id: string, onsetSeconds: number, ratioToReference: number, gesture: string): MusicalEvent {
  return { id, onsetSeconds, durationSeconds: 0.5, ratioToReference, amplitude: 0.7, timbre: "harmonic", gesture };
}

test("selects events that overlap a time range", () => {
  const events = [event("a", 0, 1, "anchor"), event("b", 1, 1.5, "rise")];
  assert.deepEqual(eventsInSelection(events, { startSeconds: 0.4, endSeconds: 1.1 }).map((item) => item.id), ["a", "b"]);
});

test("detects a recurrence after time and ratio transposition", () => {
  const first = [event("a", 0, 1, "anchor"), event("b", 1, 1.25, "rise")];
  const second = [event("c", 4, 1.2, "anchor"), event("d", 5, 1.5, "rise")];
  assert.ok(transformedRecurrence(first, second) > 0.99);
});

test("piece-local transitions remain inspectable", () => {
  const predict = localGesturePrediction([
    event("a", 0, 1, "anchor"),
    event("b", 1, 1.2, "rise"),
    event("c", 2, 1, "anchor"),
    event("d", 3, 1.5, "break"),
  ]);
  assert.deepEqual(predict("anchor"), [
    { nextGesture: "rise", probability: 0.5 },
    { nextGesture: "break", probability: 0.5 },
  ]);
});

test("surprise is information in bits", () => {
  assert.equal(sequenceSurprise(0.25), 2);
  assert.equal(sequenceSurprise(1), 0);
});
