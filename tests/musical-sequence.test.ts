import assert from "node:assert/strict";
import test from "node:test";
import {
  eventsInSelection,
  localGesturePrediction,
  liveJourneyPhraseProfile,
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

test("builds a piece-local expectation trail from field shape and bass motion", () => {
  const profile = liveJourneyPhraseProfile([
    { id: 1, note: 60, onsetMs: 0 },
    { id: 2, note: 62, onsetMs: 500 },
    { id: 3, note: 64, onsetMs: 1_000 },
    { id: 4, note: 63, onsetMs: 1_500 },
    { id: 5, note: 65, onsetMs: 2_000 },
    { id: 6, note: 64, onsetMs: 2_500 },
  ]);
  assert.ok(profile);
  assert.equal(profile.localUnitMs, 500);
  assert.deepEqual(profile.steps.map((step) => step.bassMove), [null, 2, 2, -1, 2, -1]);
  assert.equal(profile.steps[3].expectationState, "new");
  assert.equal(profile.steps[5].expectationState, "known");
  assert.equal(profile.steps[5].actualProbability, 0.5);
  assert.equal(profile.steps[5].alternativeCount, 2);
  assert.equal(profile.returningGestureCount, 3);
});

test("keeps live journey relationships invariant under transposition and proportional time scaling", () => {
  const source = [
    { id: 1, note: 60, onsetMs: 0 },
    { id: 2, note: 64, onsetMs: 20 },
    { id: 3, note: 62, onsetMs: 400 },
    { id: 4, note: 65, onsetMs: 800 },
    { id: 5, note: 67, onsetMs: 1_600 },
    { id: 6, note: 70, onsetMs: 2_000 },
  ];
  const moved = source.map((event) => ({ ...event, note: event.note + 9 }));
  const slower = source.map((event) => ({ ...event, onsetMs: event.onsetMs * 2 }));
  const sourceProfile = liveJourneyPhraseProfile(source);
  const movedProfile = liveJourneyPhraseProfile(moved);
  const slowerProfile = liveJourneyPhraseProfile(slower);
  assert.ok(sourceProfile && movedProfile && slowerProfile);
  assert.equal(sourceProfile.groupCount, 5);
  assert.deepEqual(movedProfile.steps.map((step) => step.gestureKey), sourceProfile.steps.map((step) => step.gestureKey));
  assert.deepEqual(slowerProfile.steps.map((step) => step.gapMultiple), sourceProfile.steps.map((step) => step.gapMultiple));
  assert.deepEqual(slowerProfile.steps.map((step) => step.expectationState), sourceProfile.steps.map((step) => step.expectationState));
  assert.equal(slowerProfile.localUnitMs, sourceProfile.localUnitMs * 2);
});

test("does not manufacture expectation from a chord or a never-repeated context", () => {
  assert.equal(liveJourneyPhraseProfile([
    { id: 1, note: 60, onsetMs: 0 },
    { id: 2, note: 64, onsetMs: 20 },
    { id: 3, note: 67, onsetMs: 40 },
    { id: 4, note: 72, onsetMs: 60 },
  ]), null);
  const open = liveJourneyPhraseProfile([
    { id: 1, note: 60, onsetMs: 0 },
    { id: 2, note: 62, onsetMs: 400 },
    { id: 3, note: 65, onsetMs: 800 },
    { id: 4, note: 69, onsetMs: 1_200 },
  ]);
  assert.ok(open);
  assert.equal(open.learnedStepCount, 0);
  assert.deepEqual(open.steps.map((step) => step.expectationState), ["opening", "open", "open", "open"]);
});
