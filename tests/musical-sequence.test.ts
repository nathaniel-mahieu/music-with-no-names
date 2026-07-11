import assert from "node:assert/strict";
import test from "node:test";
import {
  eventsInSelection,
  localGesturePrediction,
  sequenceSurprise,
  transformedRecurrence,
  eventSimilarity,
  incrementalPredictionTrace,
  predictionTraceWithPrior,
  selfSimilarityMatrix,
  type MusicalEvent,
} from "../lib/musical-sequence.ts";

test("keeps synthetic-corpus priors distinct from piece-local learning", () => {
  const events = [
    { id: "a", onsetSeconds: 0, durationSeconds: 1, ratioToReference: 1, amplitude: 1, timbre: "pure" as const, gesture: "anchor" },
    { id: "b", onsetSeconds: 1, durationSeconds: 1, ratioToReference: 1.5, amplitude: 1, timbre: "pure" as const, gesture: "crest" },
  ];
  const local = incrementalPredictionTrace(events);
  const corpus = predictionTraceWithPrior(events, { anchor: { crest: 3, turn: 1 } });
  assert.equal(local[1].probability, null);
  assert.equal(corpus[1].probability, 0.75);
  assert.ok(corpus[1].uncertaintyBits > 0);
});

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

test("builds a symmetric motif self-similarity matrix", () => {
  const events = [event("a", 0, 1, "anchor"), event("b", 1, 1.2, "rise"), event("c", 2, 1, "anchor")];
  const matrix = selfSimilarityMatrix(events);
  assert.equal(matrix.length, 3);
  assert.equal(matrix[0][0], 1);
  assert.equal(matrix[0][2], 1);
  assert.equal(matrix[0][1], matrix[1][0]);
  assert.ok(eventSimilarity(events[0], events[2]) > eventSimilarity(events[0], events[1]));
});

test("keeps uncertainty before and surprise after an event distinct", () => {
  const events = [
    event("a", 0, 1, "anchor"),
    event("b", 1, 1.2, "rise"),
    event("c", 2, 1, "anchor"),
    event("d", 3, 1.2, "rise"),
    event("e", 4, 1.5, "break"),
  ];
  const trace = incrementalPredictionTrace(events);
  assert.equal(trace[3].probability, 1);
  assert.equal(trace[3].surpriseBits, 0);
  assert.equal(trace[4].probability, 0);
  assert.equal(trace[4].surpriseBits, 6);
});
