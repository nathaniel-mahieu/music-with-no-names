import assert from "node:assert/strict";
import test from "node:test";
import {
  ANCHOR_DRILL_BASE_SPACING_MS,
  ANCHOR_DRILL_MAX_COUNT,
  ANCHOR_DRILL_MAX_SPACING_MS,
  anchorDrillAnswerNote,
  anchorDrillClassStatuses,
  anchorDrillDistractors,
  anchorDrillExpectedDirection,
  anchorDrillLevelReady,
  anchorDrillOffset,
  anchorDrillOutcome,
  anchorDrillPromotionReady,
  anchorDrillStorageKey,
  anchorDrillTargets,
  anchorDrillWeakPairs,
  createAnchorDrillState,
  markAnchorDrillPrompted,
  nextAnchorDrillPrompt,
  parseAnchorDrillState,
  recordAnchorDrillAnchorReplay,
  recordAnchorDrillAnswer,
  type AnchorDrillAnswer,
  type AnchorDrillPrompt,
  type AnchorDrillState,
} from "../lib/piano-anchor-drill-model.ts";
import {
  ABSOLUTE_PITCH_PRACTICE_SOUND,
  ABSOLUTE_PITCH_TRANSFER_SOUND,
  absolutePitchMidi,
} from "../lib/piano-absolute-pitch-model.ts";
import { pitchClassFromMidi } from "../lib/piano-model.ts";

const ANCHOR = 5;
const NOW = 1_000_000;
const first = () => 0;

function prompt(targetMidi: number, overrides: Partial<AnchorDrillPrompt> = {}): AnchorDrillPrompt {
  return { id: 0, anchorPitchClass: ANCHOR, targetMidi, sound: ABSOLUTE_PITCH_PRACTICE_SOUND, fromTargets: true, issuedAtMs: NOW, ...overrides };
}

function keyAnswer(targetMidi: number, note: number, overrides: Partial<AnchorDrillPrompt> = {}): AnchorDrillAnswer {
  return { prompt: prompt(targetMidi, overrides), probeNotes: [note], judgedDirection: null, latencyMs: 400 };
}

function buttonAnswer(targetMidi: number, judgedDirection: AnchorDrillAnswer["judgedDirection"]): AnchorDrillAnswer {
  return { prompt: prompt(targetMidi), probeNotes: null, judgedDirection, latencyMs: 400 };
}

function withPrompts(state: AnchorDrillState, count: number) {
  let next = state;
  for (let index = 0; index < count; index += 1) next = markAnchorDrillPrompted(next);
  return next;
}

test("a fresh drill has a zero grid, every class due now, and base spacing", () => {
  const state = createAnchorDrillState(ANCHOR, NOW);
  assert.equal(state.anchorPitchClass, ANCHOR);
  assert.equal(state.startedAtMs, NOW);
  assert.deepEqual(state.confusion.flat(), Array.from({ length: 144 }, () => 0));
  assert.ok(state.dueAtMs.every((dueAt) => dueAt === NOW));
  assert.ok(state.spacingMs.every((spacing) => spacing === ANCHOR_DRILL_BASE_SPACING_MS));
  assert.equal(state.answerCount, 0);
  assert.throws(() => createAnchorDrillState(12, NOW), RangeError);
  assert.throws(() => createAnchorDrillState(ANCHOR, -1), RangeError);
});

test("pitch-class offsets take the shorter way around the octave", () => {
  assert.equal(anchorDrillOffset(ANCHOR, 5), 0);
  assert.equal(anchorDrillOffset(ANCHOR, 10), 5);
  assert.equal(anchorDrillOffset(ANCHOR, 11), -6);
  assert.equal(anchorDrillOffset(ANCHOR, 0), -5);
  assert.equal(anchorDrillExpectedDirection(ANCHOR, absolutePitchMidi(5, 3)), "same");
  assert.equal(anchorDrillExpectedDirection(ANCHOR, absolutePitchMidi(7, 2)), "above");
  assert.equal(anchorDrillExpectedDirection(ANCHOR, absolutePitchMidi(2, 6)), "below");
});

test("level one is the anchor plus nearby distractors; later levels add the most-confused class", () => {
  const state = createAnchorDrillState(ANCHOR, NOW);
  assert.deepEqual(anchorDrillTargets(state, 1), [ANCHOR]);
  assert.deepEqual(anchorDrillDistractors([ANCHOR]), [3, 4, 6, 7]);
  assert.deepEqual(anchorDrillTargets(state, 2), [4, 5], "a zero grid falls back to the offset ladder");
  const confused = recordAnchorDrillAnswer(
    recordAnchorDrillAnswer(state, keyAnswer(absolutePitchMidi(5, 4), absolutePitchMidi(7, 4)), NOW),
    keyAnswer(absolutePitchMidi(5, 4), absolutePitchMidi(7, 4)),
    NOW,
  );
  assert.deepEqual(anchorDrillTargets(confused, 2), [5, 7], "the class most confused with a target is added first");
  assert.deepEqual(anchorDrillTargets(state, 12).length, 12);
  assert.throws(() => anchorDrillTargets(state, 0), RangeError);
});

test("prompts alternate targets and distractors, prefer due and most-missed classes, and avoid an immediate repeat", () => {
  const state = createAnchorDrillState(ANCHOR, NOW);
  const firstPrompt = nextAnchorDrillPrompt(state, 1, NOW, first);
  assert.equal(pitchClassFromMidi(firstPrompt.targetMidi), ANCHOR);
  assert.equal(firstPrompt.fromTargets, true);

  const second = nextAnchorDrillPrompt(withPrompts(state, 1), 1, NOW, first);
  assert.equal(second.fromTargets, false);
  assert.equal(pitchClassFromMidi(second.targetMidi), 3);
  const avoided = nextAnchorDrillPrompt(withPrompts(state, 1), 1, NOW, first, absolutePitchMidi(3, 4));
  assert.equal(pitchClassFromMidi(avoided.targetMidi), 4, "the previous target class is skipped when another is due");

  const partlyDue: AnchorDrillState = { ...withPrompts(state, 1), dueAtMs: state.dueAtMs.map((dueAt, pitchClass) => pitchClass === 3 || pitchClass === 4 ? NOW + 60_000 : dueAt) };
  assert.equal(pitchClassFromMidi(nextAnchorDrillPrompt(partlyDue, 1, NOW, first).targetMidi), 6);

  const missedSeven = recordAnchorDrillAnswer(withPrompts(state, 1), keyAnswer(absolutePitchMidi(7, 4), absolutePitchMidi(9, 4)), NOW - ANCHOR_DRILL_BASE_SPACING_MS);
  assert.equal(pitchClassFromMidi(nextAnchorDrillPrompt(missedSeven, 1, NOW, first).targetMidi), 7, "the most-missed due class comes first");

  const noneDue: AnchorDrillState = { ...withPrompts(state, 1), dueAtMs: state.dueAtMs.map((_, pitchClass) => NOW + 1_000 * (12 - pitchClass)) };
  assert.equal(pitchClassFromMidi(nextAnchorDrillPrompt(noneDue, 1, NOW, first).targetMidi), 7, "with nothing due the soonest class is chosen");
});

test("a correct answer doubles spacing to a cap; a miss resets it and halves the answered class", () => {
  const state = createAnchorDrillState(ANCHOR, NOW);
  const target = absolutePitchMidi(ANCHOR, 4);
  const correct = recordAnchorDrillAnswer(state, keyAnswer(target, target), NOW);
  assert.equal(correct.spacingMs[ANCHOR], ANCHOR_DRILL_BASE_SPACING_MS * 2);
  assert.equal(correct.dueAtMs[ANCHOR], NOW + ANCHOR_DRILL_BASE_SPACING_MS * 2);
  assert.equal(correct.confusion[ANCHOR][ANCHOR], 1);
  assert.equal(correct.answerCount, 1);

  let capped = correct;
  for (let round = 0; round < 24; round += 1) capped = recordAnchorDrillAnswer(capped, keyAnswer(target, target), NOW);
  assert.equal(capped.spacingMs[ANCHOR], ANCHOR_DRILL_MAX_SPACING_MS);

  const sevenGrown = recordAnchorDrillAnswer(capped, keyAnswer(absolutePitchMidi(7, 4), absolutePitchMidi(7, 4)), NOW);
  const missed = recordAnchorDrillAnswer(sevenGrown, keyAnswer(target, absolutePitchMidi(7, 4)), NOW);
  assert.equal(missed.spacingMs[ANCHOR], ANCHOR_DRILL_BASE_SPACING_MS);
  assert.equal(missed.dueAtMs[ANCHOR], NOW + ANCHOR_DRILL_BASE_SPACING_MS);
  assert.equal(missed.spacingMs[7], ANCHOR_DRILL_BASE_SPACING_MS, "the answered class halves back toward the base");
  assert.equal(missed.confusion[ANCHOR][7], 1);
  assert.deepEqual(anchorDrillWeakPairs(missed), [{ heard: ANCHOR, answered: 7, count: 1 }]);
  assert.equal(state.spacingMs[ANCHOR], ANCHOR_DRILL_BASE_SPACING_MS, "recording never mutates the input state");

  const replayed = recordAnchorDrillAnchorReplay(capped, NOW);
  assert.equal(replayed.spacingMs[ANCHOR], ANCHOR_DRILL_BASE_SPACING_MS);
  assert.throws(() => recordAnchorDrillAnswer(state, keyAnswer(target, target, { anchorPitchClass: 0 }), NOW), RangeError);
});

test("key answers reuse the Sound Finder cues relative to the anchor; button answers report width as unavailable", () => {
  const target = absolutePitchMidi(7, 4);
  const wide = anchorDrillOutcome(keyAnswer(target, target + 2));
  assert.equal(wide.correct, false);
  assert.equal(wide.answeredPitchClass, 9);
  assert.equal(wide.feedback.pitchDirection, "lower");
  assert.equal(wide.feedback.proximity, "near");
  assert.equal(wide.feedback.intervalDirection, "matched");
  assert.equal(wide.feedback.intervalWidth, "wider");

  const anchorBelow = anchorDrillOutcome(keyAnswer(absolutePitchMidi(ANCHOR, 3), absolutePitchMidi(7, 3)));
  assert.equal(anchorBelow.feedback.intervalDirection, "repeat-mismatch", "an anchor-family tone in another octave is still zero reach");
  assert.equal(anchorBelow.feedback.intervalWidth, "unavailable");
  const lowKey = anchorDrillOutcome(keyAnswer(target, absolutePitchMidi(9, 2)));
  assert.equal(lowKey.feedback.pitchDirection, "higher", "height follows the real key");
  assert.equal(lowKey.feedback.intervalDirection, "matched", "reach from the anchor ignores octave");
  assert.equal(lowKey.feedback.intervalWidth, "wider");
  assert.equal(anchorDrillOutcome(keyAnswer(target, absolutePitchMidi(6, 4))).feedback.intervalWidth, "narrower");
  assert.equal(anchorDrillOutcome(keyAnswer(target, absolutePitchMidi(3, 4))).feedback.intervalDirection, "opposite");

  const octave = anchorDrillOutcome(keyAnswer(target, target + 12));
  assert.equal(octave.correct, true, "pitch class decides correctness");
  assert.equal(octave.feedback.status, "searching", "an octave copy is still not the exact key");
  assert.equal(octave.feedback.pitchFamily, "same-family");

  const exact = anchorDrillOutcome(keyAnswer(target, target));
  assert.equal(exact.feedback.status, "caught");

  const button = anchorDrillOutcome(buttonAnswer(target, "above"));
  assert.equal(button.correct, true);
  assert.equal(button.answeredPitchClass, null);
  assert.equal(button.feedback.intervalWidth, "unavailable");
  assert.equal(button.feedback.intervalDirection, "matched");
  const wrongButton = anchorDrillOutcome(buttonAnswer(target, "below"));
  assert.equal(wrongButton.correct, false);
  assert.equal(wrongButton.feedback.intervalDirection, "opposite");
  assert.equal(anchorDrillOutcome(buttonAnswer(absolutePitchMidi(ANCHOR, 3), "same")).correct, true);
  assert.equal(anchorDrillOutcome(buttonAnswer(absolutePitchMidi(ANCHOR, 3), "above")).feedback.intervalDirection, "repeat-mismatch");
  const lowest = anchorDrillOutcome({ prompt: prompt(0, { anchorPitchClass: 0 }), probeNotes: null, judgedDirection: "below", latencyMs: 400 });
  assert.equal(lowest.feedback.pitchDirection, "same-height", "a synthetic key stays inside the MIDI range");
  assert.equal(lowest.correct, false);
  assert.throws(() => anchorDrillOutcome({ ...buttonAnswer(target, null), probeNotes: [] }), RangeError);
});

test("every fourth prompt uses the transfer timbre in an outer octave while practice octaves cycle", () => {
  const state = createAnchorDrillState(ANCHOR, NOW);
  const prompts = Array.from({ length: 8 }, (_, index) => nextAnchorDrillPrompt(withPrompts(state, index), 1, NOW, first));
  assert.deepEqual(prompts.map(({ sound }) => sound), [
    ABSOLUTE_PITCH_PRACTICE_SOUND, ABSOLUTE_PITCH_PRACTICE_SOUND, ABSOLUTE_PITCH_PRACTICE_SOUND, ABSOLUTE_PITCH_TRANSFER_SOUND,
    ABSOLUTE_PITCH_PRACTICE_SOUND, ABSOLUTE_PITCH_PRACTICE_SOUND, ABSOLUTE_PITCH_PRACTICE_SOUND, ABSOLUTE_PITCH_TRANSFER_SOUND,
  ]);
  assert.deepEqual(prompts.map(({ targetMidi }) => Math.floor(targetMidi / 12) - 1), [3, 4, 5, 2, 4, 5, 3, 6]);
  assert.deepEqual(prompts.map(({ id }) => id), [0, 1, 2, 3, 4, 5, 6, 7]);
});

test("promotion needs enough recognised answers, transfer answers, and a cold check after the drill began", () => {
  const target = absolutePitchMidi(ANCHOR, 4);
  let state = createAnchorDrillState(ANCHOR, NOW);
  const coldAfter = [{ timestamp: NOW + 1 }];
  for (let index = 0; index < 11; index += 1) state = recordAnchorDrillAnswer(state, keyAnswer(target, target), NOW);
  assert.equal(anchorDrillPromotionReady(state, coldAfter), false, "fewer than twelve answers");
  state = recordAnchorDrillAnswer(state, keyAnswer(target, target), NOW);
  assert.equal(anchorDrillPromotionReady(state, coldAfter), false, "no transfer answers yet");
  for (let index = 0; index < 3; index += 1) {
    state = recordAnchorDrillAnswer(state, keyAnswer(absolutePitchMidi(ANCHOR, 2), absolutePitchMidi(ANCHOR, 2), { sound: ABSOLUTE_PITCH_TRANSFER_SOUND }), NOW);
  }
  assert.equal(anchorDrillPromotionReady(state, []), false, "no cold check");
  assert.equal(anchorDrillPromotionReady(state, [{ timestamp: NOW - 1 }]), false, "cold check predates the drill");
  assert.equal(anchorDrillPromotionReady(state, coldAfter), true);
  let weak = state;
  for (let index = 0; index < 8; index += 1) weak = recordAnchorDrillAnswer(weak, keyAnswer(target, target + 2), NOW);
  assert.equal(anchorDrillPromotionReady(weak, coldAfter), false, "recognised share fell below the threshold");
});

test("stored state round-trips and malformed records are discarded", () => {
  const state = recordAnchorDrillAnswer(createAnchorDrillState(ANCHOR, NOW), buttonAnswer(absolutePitchMidi(ANCHOR, 4), "same"), NOW);
  assert.deepEqual(parseAnchorDrillState(JSON.stringify(state)), state);
  assert.equal(parseAnchorDrillState(null), null);
  assert.equal(parseAnchorDrillState("{"), null);
  assert.equal(parseAnchorDrillState(JSON.stringify({ ...state, version: 2 })), null);
  assert.equal(parseAnchorDrillState(JSON.stringify({ ...state, anchorPitchClass: 12 })), null);
  assert.equal(parseAnchorDrillState(JSON.stringify({ ...state, confusion: state.confusion.slice(0, 11) })), null);
  assert.equal(parseAnchorDrillState(JSON.stringify({ ...state, confusion: state.confusion.map((row) => row.map(() => -1)) })), null);
  assert.equal(parseAnchorDrillState(JSON.stringify({ ...state, dueAtMs: state.dueAtMs.map(() => "soon") })), null);
  assert.equal(parseAnchorDrillState(JSON.stringify({ ...state, spacingMs: state.spacingMs.map(() => 1) })), null);
  assert.equal(parseAnchorDrillState(JSON.stringify({ ...state, buttonCorrect: state.buttonCorrect.map(() => 5) })), null, "correct cannot exceed answered");
});

test("counts stay bounded however long the history grows", () => {
  const target = absolutePitchMidi(ANCHOR, 4);
  const saturated: AnchorDrillState = {
    ...createAnchorDrillState(ANCHOR, NOW),
    answerCount: ANCHOR_DRILL_MAX_COUNT,
    promptCount: ANCHOR_DRILL_MAX_COUNT,
  };
  saturated.confusion[ANCHOR][ANCHOR] = ANCHOR_DRILL_MAX_COUNT;
  const next = recordAnchorDrillAnswer(markAnchorDrillPrompted(saturated), keyAnswer(target, target), NOW);
  assert.equal(next.answerCount, ANCHOR_DRILL_MAX_COUNT);
  assert.equal(next.promptCount, ANCHOR_DRILL_MAX_COUNT);
  assert.equal(next.confusion[ANCHOR][ANCHOR], ANCHOR_DRILL_MAX_COUNT);
  assert.equal(JSON.stringify(next).length < 4_000, true, "the whole record stays small");
  const statuses = anchorDrillClassStatuses(next, 1, NOW);
  assert.equal(statuses.length, 12);
  assert.equal(statuses[ANCHOR].isAnchor, true);
  assert.equal(statuses[ANCHOR].due, false);
  assert.equal(statuses[3].inPool, true);
  assert.equal(statuses[0].inPool, false);
});

test("each anchor has its own storage key and ring answers land on the key nearest the hidden tone", () => {
  assert.equal(anchorDrillStorageKey(ANCHOR), "piano-anchor-drill-v1:5");
  assert.notEqual(anchorDrillStorageKey(0), anchorDrillStorageKey(11));
  assert.throws(() => anchorDrillStorageKey(12), RangeError);
  const target = absolutePitchMidi(7, 4);
  assert.equal(anchorDrillAnswerNote(target, 7), target);
  assert.equal(anchorDrillAnswerNote(target, 9), target + 2);
  assert.equal(anchorDrillAnswerNote(target, 2), target - 5);
  assert.equal(anchorDrillAnswerNote(target, 1), target - 6);
  assert.equal(anchorDrillAnswerNote(0, 11), 11, "answers stay inside the MIDI range");
  assert.equal(anchorDrillAnswerNote(127, 8), 116);
  const ring = anchorDrillOutcome(keyAnswer(target, anchorDrillAnswerNote(target, 9)));
  assert.equal(ring.feedback.pitchDirection, "lower");
  assert.equal(ring.answeredPitchClass, 9);
});

test("adding a pitch is suggested only after every pitch in play is well recognised", () => {
  const target = absolutePitchMidi(ANCHOR, 4);
  let state = createAnchorDrillState(ANCHOR, NOW);
  assert.equal(anchorDrillLevelReady(state, 1), false);
  for (let index = 0; index < 4; index += 1) state = recordAnchorDrillAnswer(state, keyAnswer(target, target), NOW);
  assert.equal(anchorDrillLevelReady(state, 1), true);
  assert.equal(anchorDrillLevelReady(state, 2), false, "the newly added pitch has no answers yet");
  assert.equal(anchorDrillLevelReady(state, 12), false, "there is nothing left to add");
  const slipped = recordAnchorDrillAnswer(recordAnchorDrillAnswer(state, keyAnswer(target, target + 1), NOW), keyAnswer(target, target + 1), NOW);
  assert.equal(anchorDrillLevelReady(slipped, 1), false);
});
