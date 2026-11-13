import {
  ABSOLUTE_PITCH_OCTAVES,
  ABSOLUTE_PITCH_PRACTICE_SOUND,
  ABSOLUTE_PITCH_TRANSFER_OCTAVES,
  ABSOLUTE_PITCH_TRANSFER_SOUND,
  absolutePitchMidi,
  absolutePitchPracticeTargets,
} from "./piano-absolute-pitch-model.ts";
import { earSearchProbeFeedback, type EarSearchProbeFeedback } from "./piano-ear-search-model.ts";
import { pitchClassFromMidi } from "./piano-model.ts";
import type { PianoSoundModelId } from "./piano-sound-model.ts";

/**
 * Anchor Drill · `mwno-anchor-1`.
 *
 * One learner-chosen anchor pitch class, short hidden prompts, and a
 * device-local confusion grid that decides what is asked next. The grid is a
 * scheduling record of answers under a declared timbre set and three octaves.
 * It is not a measure of absolute pitch, ability, or progress, and it never
 * reads acoustic pitch from the learner's instrument.
 */

export const ANCHOR_DRILL_STORAGE_KEY = "piano-anchor-drill-v1";
export const ANCHOR_DRILL_VERSION = 1;
export const ANCHOR_DRILL_PITCH_CLASSES = 12;
export const ANCHOR_DRILL_BASE_SPACING_MS = 90_000;
export const ANCHOR_DRILL_MAX_SPACING_MS = 7 * 24 * 60 * 60_000;
export const ANCHOR_DRILL_TRANSFER_EVERY = 4;
export const ANCHOR_DRILL_ANCHOR_OCTAVE = 4;
export const ANCHOR_DRILL_PROMOTION_MIN_ANSWERS = 12;
export const ANCHOR_DRILL_PROMOTION_MIN_TRANSFER = 3;
export const ANCHOR_DRILL_PROMOTION_SHARE = 0.8;
export const ANCHOR_DRILL_LEVEL_MIN_ANSWERS = 4;
export const ANCHOR_DRILL_MAX_LEVEL = 12;
export const ANCHOR_DRILL_DISTRACTOR_STEPS = [-2, -1, 1, 2] as const;
/** Counts are capped so a very long history cannot grow without bound. */
export const ANCHOR_DRILL_MAX_COUNT = 9_999;

export type AnchorDrillJudgment = "same" | "above" | "below";

export type AnchorDrillPrompt = {
  id: number;
  anchorPitchClass: number;
  targetMidi: number;
  sound: PianoSoundModelId;
  /** True when the target was drawn from the level's target set rather than its distractors. */
  fromTargets: boolean;
  issuedAtMs: number;
};

export type AnchorDrillAnswer = {
  prompt: AnchorDrillPrompt;
  /** Key answer from silent MIDI or the on-screen keyboard; null for a button answer. */
  probeNotes: number[] | null;
  /** Button answer relative to the anchor; null for a key answer. */
  judgedDirection: AnchorDrillJudgment | null;
  latencyMs: number;
};

export type AnchorDrillState = {
  version: typeof ANCHOR_DRILL_VERSION;
  anchorPitchClass: number;
  startedAtMs: number;
  /** [heard pitch class][answered pitch class] key-answer counts. */
  confusion: number[][];
  buttonAnswered: number[];
  buttonCorrect: number[];
  transferAnswered: number[];
  transferCorrect: number[];
  dueAtMs: number[];
  spacingMs: number[];
  answerCount: number;
  promptCount: number;
};

export type AnchorDrillOutcome = {
  heardPitchClass: number;
  answeredPitchClass: number | null;
  correct: boolean;
  /** Signed shortest pitch-class route from the anchor to the heard target, from -6 through 5. */
  targetOffset: number;
  expectedDirection: AnchorDrillJudgment;
  feedback: EarSearchProbeFeedback;
};

export type AnchorDrillWeakPair = { heard: number; answered: number; count: number };

export type AnchorDrillColdCheck = {
  timestamp: number;
};

export type AnchorDrillClassStatus = {
  pitchClass: number;
  isAnchor: boolean;
  inTargets: boolean;
  inPool: boolean;
  due: boolean;
  dueInMs: number;
  answered: number;
  correct: number;
};

type Random = () => number;

function assertPitchClass(value: number, label: string) {
  if (!Number.isInteger(value) || value < 0 || value >= ANCHOR_DRILL_PITCH_CLASSES) {
    throw new RangeError(`${label} must be an integer pitch class from 0 through 11.`);
  }
}

function assertTime(value: number, label: string) {
  if (!Number.isFinite(value) || value < 0) throw new RangeError(`${label} must be a non-negative finite time.`);
}

function assertLevel(level: number) {
  if (!Number.isInteger(level) || level < 1 || level > ANCHOR_DRILL_MAX_LEVEL) {
    throw new RangeError(`Anchor drill level must be an integer from 1 through ${ANCHOR_DRILL_MAX_LEVEL}.`);
  }
}

function zeros() {
  return Array.from({ length: ANCHOR_DRILL_PITCH_CLASSES }, () => 0);
}

function filled(value: number) {
  return Array.from({ length: ANCHOR_DRILL_PITCH_CLASSES }, () => value);
}

function capCount(value: number) {
  return Math.min(ANCHOR_DRILL_MAX_COUNT, value);
}

function cloneState(state: AnchorDrillState): AnchorDrillState {
  return {
    ...state,
    confusion: state.confusion.map((row) => [...row]),
    buttonAnswered: [...state.buttonAnswered],
    buttonCorrect: [...state.buttonCorrect],
    transferAnswered: [...state.transferAnswered],
    transferCorrect: [...state.transferCorrect],
    dueAtMs: [...state.dueAtMs],
    spacingMs: [...state.spacingMs],
  };
}

/** One bounded record per anchor, so switching anchors never discards another anchor's history. */
export function anchorDrillStorageKey(anchorPitchClass: number) {
  assertPitchClass(anchorPitchClass, "Anchor");
  return `${ANCHOR_DRILL_STORAGE_KEY}:${anchorPitchClass}`;
}

export function createAnchorDrillState(anchorPitchClass: number, nowMs: number): AnchorDrillState {
  assertPitchClass(anchorPitchClass, "Anchor");
  assertTime(nowMs, "Anchor drill start time");
  return {
    version: ANCHOR_DRILL_VERSION,
    anchorPitchClass,
    startedAtMs: nowMs,
    confusion: Array.from({ length: ANCHOR_DRILL_PITCH_CLASSES }, zeros),
    buttonAnswered: zeros(),
    buttonCorrect: zeros(),
    transferAnswered: zeros(),
    transferCorrect: zeros(),
    dueAtMs: filled(nowMs),
    spacingMs: filled(ANCHOR_DRILL_BASE_SPACING_MS),
    answerCount: 0,
    promptCount: 0,
  };
}

/** Signed shortest route around the pitch-class circle, from -6 through 5. */
export function anchorDrillOffset(anchorPitchClass: number, pitchClass: number) {
  return ((pitchClass - anchorPitchClass + 6 + 12 * 4) % 12) - 6;
}

export function anchorDrillExpectedDirection(anchorPitchClass: number, targetMidi: number): AnchorDrillJudgment {
  const offset = anchorDrillOffset(anchorPitchClass, pitchClassFromMidi(targetMidi));
  return offset === 0 ? "same" : offset > 0 ? "above" : "below";
}

function rowAnswered(state: AnchorDrillState, pitchClass: number) {
  return state.confusion[pitchClass].reduce((sum, count) => sum + count, 0) + state.buttonAnswered[pitchClass];
}

function rowCorrect(state: AnchorDrillState, pitchClass: number) {
  return state.confusion[pitchClass][pitchClass] + state.buttonCorrect[pitchClass];
}

function rowMisses(state: AnchorDrillState, pitchClass: number) {
  return rowAnswered(state, pitchClass) - rowCorrect(state, pitchClass);
}

/**
 * The level's target set. Level 1 is the anchor alone. Each further level adds
 * the pitch class with the most recorded misses, counting both directions of
 * a confusion, and falls back to the Absolute Pitch offset ladder on ties.
 */
export function anchorDrillTargets(state: AnchorDrillState, level: number) {
  assertLevel(level);
  const targets = [state.anchorPitchClass];
  const ladder = absolutePitchPracticeTargets(state.anchorPitchClass, ANCHOR_DRILL_MAX_LEVEL)
    .slice()
    .sort((left, right) => Math.abs(anchorDrillOffset(state.anchorPitchClass, left)) - Math.abs(anchorDrillOffset(state.anchorPitchClass, right)) || left - right);
  while (targets.length < level) {
    const remaining = ladder.filter((pitchClass) => !targets.includes(pitchClass));
    if (!remaining.length) break;
    const score = (pitchClass: number) => rowMisses(state, pitchClass)
      + targets.reduce((sum, target) => sum + state.confusion[target][pitchClass] + state.confusion[pitchClass][target], 0);
    let best = remaining[0];
    let bestScore = score(best);
    for (const pitchClass of remaining.slice(1)) {
      const candidateScore = score(pitchClass);
      if (candidateScore > bestScore) {
        best = pitchClass;
        bestScore = candidateScore;
      }
    }
    targets.push(best);
  }
  return targets.sort((left, right) => left - right);
}

/**
 * True when every pitch in play has enough answers with a high enough
 * recognised share to suggest adding one more. The learner still decides.
 */
export function anchorDrillLevelReady(state: AnchorDrillState, level: number) {
  if (level >= ANCHOR_DRILL_MAX_LEVEL) return false;
  return anchorDrillTargets(state, level).every((pitchClass) => {
    const answered = rowAnswered(state, pitchClass);
    return answered >= ANCHOR_DRILL_LEVEL_MIN_ANSWERS && rowCorrect(state, pitchClass) / answered >= ANCHOR_DRILL_PROMOTION_SHARE;
  });
}

/**
 * Place a pitch-class answer, which has no octave of its own, on the key
 * nearest the hidden tone so higher, lower, and proximity cues stay meaningful.
 */
export function anchorDrillAnswerNote(targetMidi: number, answeredPitchClass: number) {
  assertPitchClass(answeredPitchClass, "Answered pitch class");
  if (!Number.isInteger(targetMidi) || targetMidi < 0 || targetMidi > 127) {
    throw new RangeError("Prompt target must be a MIDI note from 0 through 127.");
  }
  const note = targetMidi + anchorDrillOffset(pitchClassFromMidi(targetMidi), answeredPitchClass);
  return note < 0 ? note + 12 : note > 127 ? note - 12 : note;
}

/** Targets plus their one- and two-semitone neighbours, which act as distractors. */
export function anchorDrillDistractors(targets: readonly number[]) {
  const targetSet = new Set(targets);
  const distractors = new Set<number>();
  for (const target of targets) {
    for (const step of ANCHOR_DRILL_DISTRACTOR_STEPS) {
      const pitchClass = pitchClassFromMidi(target + step);
      if (!targetSet.has(pitchClass)) distractors.add(pitchClass);
    }
  }
  return [...distractors].sort((left, right) => left - right);
}

function pickPitchClass(
  state: AnchorDrillState,
  candidates: readonly number[],
  nowMs: number,
  random: Random,
  previousPitchClass: number | null,
) {
  let pool = candidates;
  if (previousPitchClass != null && pool.length > 1) pool = pool.filter((pitchClass) => pitchClass !== previousPitchClass);
  const due = pool.filter((pitchClass) => state.dueAtMs[pitchClass] <= nowMs);
  if (due.length) {
    const maximum = Math.max(...due.map((pitchClass) => rowMisses(state, pitchClass)));
    const weakest = due.filter((pitchClass) => rowMisses(state, pitchClass) === maximum);
    return weakest[Math.min(weakest.length - 1, Math.floor(random() * weakest.length))];
  }
  return pool.reduce((soonest, pitchClass) => state.dueAtMs[pitchClass] < state.dueAtMs[soonest] ? pitchClass : soonest, pool[0]);
}

/**
 * Choose the next hidden tone. Prompts alternate between the target set and
 * its distractors, prefer due pitch classes, then the most-missed, and every
 * fourth prompt uses the transfer timbre in an outer octave.
 */
export function nextAnchorDrillPrompt(
  state: AnchorDrillState,
  level: number,
  nowMs: number,
  random: Random = Math.random,
  previousTargetMidi: number | null = null,
): AnchorDrillPrompt {
  assertLevel(level);
  assertTime(nowMs, "Anchor drill prompt time");
  const targets = anchorDrillTargets(state, level);
  const distractors = anchorDrillDistractors(targets);
  const fromTargets = state.promptCount % 2 === 0 || !distractors.length;
  const previousPitchClass = previousTargetMidi == null ? null : pitchClassFromMidi(previousTargetMidi);
  const pitchClass = pickPitchClass(state, fromTargets ? targets : distractors, nowMs, random, previousPitchClass);
  const transfer = state.promptCount % ANCHOR_DRILL_TRANSFER_EVERY === ANCHOR_DRILL_TRANSFER_EVERY - 1;
  const octave = transfer
    ? ABSOLUTE_PITCH_TRANSFER_OCTAVES[Math.floor(state.promptCount / ANCHOR_DRILL_TRANSFER_EVERY) % ABSOLUTE_PITCH_TRANSFER_OCTAVES.length]
    : ABSOLUTE_PITCH_OCTAVES[state.promptCount % ABSOLUTE_PITCH_OCTAVES.length];
  return {
    id: state.promptCount,
    anchorPitchClass: state.anchorPitchClass,
    targetMidi: absolutePitchMidi(pitchClass, octave),
    sound: transfer ? ABSOLUTE_PITCH_TRANSFER_SOUND : ABSOLUTE_PITCH_PRACTICE_SOUND,
    fromTargets,
    issuedAtMs: nowMs,
  };
}

/** Advance the prompt counter after a prompt has actually sounded. */
export function markAnchorDrillPrompted(state: AnchorDrillState): AnchorDrillState {
  return { ...cloneState(state), promptCount: capCount(state.promptCount + 1) };
}

function reachCues(
  targetOffset: number,
  answeredOffset: number,
): Pick<EarSearchProbeFeedback, "intervalDirection" | "intervalWidth"> {
  if (answeredOffset === targetOffset) return { intervalDirection: "matched", intervalWidth: "matched" };
  if (Math.sign(answeredOffset) !== Math.sign(targetOffset)) {
    return {
      intervalDirection: targetOffset === 0 || answeredOffset === 0 ? "repeat-mismatch" : "opposite",
      intervalWidth: "unavailable",
    };
  }
  return {
    intervalDirection: "matched",
    intervalWidth: Math.abs(answeredOffset) < Math.abs(targetOffset) ? "narrower" : "wider",
  };
}

/**
 * Describe an answer relative to the anchor. Height, register, proximity, and
 * pitch-family cues reuse the Sound Finder probe feedback against the real
 * key. Reach from the anchor is judged octave-free, by the shorter way around
 * the pitch-class circle, because the anchor is a pitch family held in memory
 * rather than one key. Button answers report width as unavailable.
 */
export function anchorDrillOutcome(answer: AnchorDrillAnswer): AnchorDrillOutcome {
  const { prompt } = answer;
  assertPitchClass(prompt.anchorPitchClass, "Prompt anchor");
  if (!Number.isInteger(prompt.targetMidi) || prompt.targetMidi < 0 || prompt.targetMidi > 127) {
    throw new RangeError("Prompt target must be a MIDI note from 0 through 127.");
  }
  const heardPitchClass = pitchClassFromMidi(prompt.targetMidi);
  const targetOffset = anchorDrillOffset(prompt.anchorPitchClass, heardPitchClass);
  const expectedDirection = anchorDrillExpectedDirection(prompt.anchorPitchClass, prompt.targetMidi);
  const target = { id: "target", notes: [prompt.targetMidi], measureIndex: 0, measureNumber: "1" };

  if (answer.probeNotes && answer.probeNotes.length) {
    const notes = [...new Set(answer.probeNotes)].sort((left, right) => left - right);
    for (const note of notes) {
      if (!Number.isInteger(note) || note < 0 || note > 127) throw new RangeError("Key answers must be MIDI notes from 0 through 127.");
    }
    const answeredPitchClass = pitchClassFromMidi(notes[0]);
    const caught = notes.length === 1 && notes[0] === prompt.targetMidi;
    const feedback = earSearchProbeFeedback({ id: prompt.id, notes, onsetMs: 0 }, target, null, null, caught);
    return {
      heardPitchClass,
      answeredPitchClass,
      correct: notes.length === 1 && answeredPitchClass === heardPitchClass,
      targetOffset,
      expectedDirection,
      feedback: { ...feedback, ...reachCues(targetOffset, anchorDrillOffset(prompt.anchorPitchClass, answeredPitchClass)) },
    };
  }

  if (!answer.judgedDirection) throw new RangeError("An anchor drill answer needs key notes or a judged direction.");
  // A direction answer has no key, so stand one semitone from the anchor-family key nearest the hidden tone.
  const nearestAnchor = prompt.targetMidi - targetOffset;
  const step = answer.judgedDirection === "same" ? 0 : answer.judgedDirection === "above" ? 1 : -1;
  const syntheticNote = Math.min(127, Math.max(0, nearestAnchor + step));
  const correct = answer.judgedDirection === expectedDirection;
  const feedback = earSearchProbeFeedback({ id: prompt.id, notes: [syntheticNote], onsetMs: 0 }, target, null, null, false);
  return {
    heardPitchClass,
    answeredPitchClass: null,
    correct,
    targetOffset,
    expectedDirection,
    feedback: {
      ...feedback,
      status: correct ? "caught" : "searching",
      ...reachCues(targetOffset, step),
      intervalDirection: correct ? "matched" : reachCues(targetOffset, step).intervalDirection,
      intervalWidth: "unavailable",
    },
  };
}

/**
 * Record one answer. A correct answer doubles the heard class's spacing up to
 * the cap; a miss resets it and also halves the spacing of the answered class,
 * since confusion runs both ways.
 */
export function recordAnchorDrillAnswer(state: AnchorDrillState, answer: AnchorDrillAnswer, nowMs: number): AnchorDrillState {
  assertTime(nowMs, "Anchor drill answer time");
  if (answer.prompt.anchorPitchClass !== state.anchorPitchClass) {
    throw new RangeError("The anchor drill answer belongs to a different anchor.");
  }
  const outcome = anchorDrillOutcome(answer);
  const next = cloneState(state);
  const heard = outcome.heardPitchClass;
  if (outcome.answeredPitchClass != null) {
    next.confusion[heard][outcome.answeredPitchClass] = capCount(next.confusion[heard][outcome.answeredPitchClass] + 1);
  } else {
    next.buttonAnswered[heard] = capCount(next.buttonAnswered[heard] + 1);
    if (outcome.correct) next.buttonCorrect[heard] = capCount(next.buttonCorrect[heard] + 1);
  }
  if (answer.prompt.sound === ABSOLUTE_PITCH_TRANSFER_SOUND) {
    next.transferAnswered[heard] = capCount(next.transferAnswered[heard] + 1);
    if (outcome.correct) next.transferCorrect[heard] = capCount(next.transferCorrect[heard] + 1);
  }
  if (outcome.correct) {
    next.spacingMs[heard] = Math.min(ANCHOR_DRILL_MAX_SPACING_MS, next.spacingMs[heard] * 2);
  } else {
    next.spacingMs[heard] = ANCHOR_DRILL_BASE_SPACING_MS;
    const answered = outcome.answeredPitchClass;
    if (answered != null && answered !== heard) {
      next.spacingMs[answered] = Math.max(ANCHOR_DRILL_BASE_SPACING_MS, Math.floor(next.spacingMs[answered] / 2));
      next.dueAtMs[answered] = Math.min(next.dueAtMs[answered], nowMs + next.spacingMs[answered]);
    }
  }
  next.dueAtMs[heard] = nowMs + next.spacingMs[heard];
  next.answerCount = capCount(next.answerCount + 1);
  return next;
}

/** Replaying the anchor resets its own spacing so the memory is re-tested soon. */
export function recordAnchorDrillAnchorReplay(state: AnchorDrillState, nowMs: number): AnchorDrillState {
  assertTime(nowMs, "Anchor replay time");
  const next = cloneState(state);
  next.spacingMs[state.anchorPitchClass] = ANCHOR_DRILL_BASE_SPACING_MS;
  next.dueAtMs[state.anchorPitchClass] = nowMs + ANCHOR_DRILL_BASE_SPACING_MS;
  return next;
}

/** Off-diagonal key-answer confusions, most frequent first. */
export function anchorDrillWeakPairs(state: AnchorDrillState, limit = 3): AnchorDrillWeakPair[] {
  const pairs: AnchorDrillWeakPair[] = [];
  state.confusion.forEach((row, heard) => row.forEach((count, answered) => {
    if (heard !== answered && count > 0) pairs.push({ heard, answered, count });
  }));
  return pairs
    .sort((left, right) => right.count - left.count || left.heard - right.heard || left.answered - right.answered)
    .slice(0, Math.max(0, limit));
}

export function anchorDrillClassStatuses(state: AnchorDrillState, level: number, nowMs: number): AnchorDrillClassStatus[] {
  assertTime(nowMs, "Anchor drill status time");
  const targets = anchorDrillTargets(state, level);
  const pool = new Set([...targets, ...anchorDrillDistractors(targets)]);
  return Array.from({ length: ANCHOR_DRILL_PITCH_CLASSES }, (_, pitchClass) => ({
    pitchClass,
    isAnchor: pitchClass === state.anchorPitchClass,
    inTargets: targets.includes(pitchClass),
    inPool: pool.has(pitchClass),
    due: state.dueAtMs[pitchClass] <= nowMs,
    dueInMs: Math.max(0, state.dueAtMs[pitchClass] - nowMs),
    answered: rowAnswered(state, pitchClass),
    correct: rowCorrect(state, pitchClass),
  }));
}

/**
 * A second anchor is offered when the current anchor's row has enough answers
 * with a high enough recognised share, including under the transfer timbre,
 * and a cold check has been recorded since this drill started. This is a
 * practice-flow gate, not a certification.
 */
export function anchorDrillPromotionReady(state: AnchorDrillState, coldChecks: readonly AnchorDrillColdCheck[]) {
  const anchor = state.anchorPitchClass;
  const answered = rowAnswered(state, anchor);
  if (answered < ANCHOR_DRILL_PROMOTION_MIN_ANSWERS) return false;
  if (rowCorrect(state, anchor) / answered < ANCHOR_DRILL_PROMOTION_SHARE) return false;
  const transfer = state.transferAnswered[anchor];
  if (transfer < ANCHOR_DRILL_PROMOTION_MIN_TRANSFER) return false;
  if (state.transferCorrect[anchor] / transfer < ANCHOR_DRILL_PROMOTION_SHARE) return false;
  return coldChecks.some((check) => Number.isFinite(check?.timestamp) && check.timestamp >= state.startedAtMs);
}

function isCountVector(value: unknown): value is number[] {
  return Array.isArray(value)
    && value.length === ANCHOR_DRILL_PITCH_CLASSES
    && value.every((count) => Number.isInteger(count) && count >= 0 && count <= ANCHOR_DRILL_MAX_COUNT);
}

function isTimeVector(value: unknown): value is number[] {
  return Array.isArray(value)
    && value.length === ANCHOR_DRILL_PITCH_CLASSES
    && value.every((time) => typeof time === "number" && Number.isFinite(time) && time >= 0);
}

/** Validate a stored state; any malformed field discards the whole record. */
export function parseAnchorDrillState(serialized: string | null): AnchorDrillState | null {
  if (!serialized) return null;
  let raw: unknown;
  try {
    raw = JSON.parse(serialized);
  } catch {
    return null;
  }
  if (!raw || typeof raw !== "object") return null;
  const record = raw as Record<string, unknown>;
  if (record.version !== ANCHOR_DRILL_VERSION) return null;
  const anchor = record.anchorPitchClass;
  if (!Number.isInteger(anchor) || Number(anchor) < 0 || Number(anchor) >= ANCHOR_DRILL_PITCH_CLASSES) return null;
  if (typeof record.startedAtMs !== "number" || !Number.isFinite(record.startedAtMs) || record.startedAtMs < 0) return null;
  const confusion = record.confusion;
  if (!Array.isArray(confusion) || confusion.length !== ANCHOR_DRILL_PITCH_CLASSES || !confusion.every(isCountVector)) return null;
  if (!isCountVector(record.buttonAnswered) || !isCountVector(record.buttonCorrect)) return null;
  if (!isCountVector(record.transferAnswered) || !isCountVector(record.transferCorrect)) return null;
  if (!isTimeVector(record.dueAtMs)) return null;
  const spacing = record.spacingMs;
  if (!isTimeVector(spacing) || spacing.some((value) => value < ANCHOR_DRILL_BASE_SPACING_MS || value > ANCHOR_DRILL_MAX_SPACING_MS)) return null;
  if (!Number.isInteger(record.answerCount) || Number(record.answerCount) < 0 || Number(record.answerCount) > ANCHOR_DRILL_MAX_COUNT) return null;
  if (!Number.isInteger(record.promptCount) || Number(record.promptCount) < 0 || Number(record.promptCount) > ANCHOR_DRILL_MAX_COUNT) return null;
  for (let pitchClass = 0; pitchClass < ANCHOR_DRILL_PITCH_CLASSES; pitchClass += 1) {
    if (record.buttonCorrect[pitchClass] > record.buttonAnswered[pitchClass]) return null;
    if (record.transferCorrect[pitchClass] > record.transferAnswered[pitchClass]) return null;
  }
  return {
    version: ANCHOR_DRILL_VERSION,
    anchorPitchClass: Number(anchor),
    startedAtMs: record.startedAtMs,
    confusion: confusion.map((row) => [...row]),
    buttonAnswered: [...record.buttonAnswered],
    buttonCorrect: [...record.buttonCorrect],
    transferAnswered: [...record.transferAnswered],
    transferCorrect: [...record.transferCorrect],
    dueAtMs: [...record.dueAtMs],
    spacingMs: [...spacing],
    answerCount: Number(record.answerCount),
    promptCount: Number(record.promptCount),
  };
}
