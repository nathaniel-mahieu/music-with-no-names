import test from "node:test";
import assert from "node:assert/strict";
import {
  ECHO_KEY_PHRASES,
  confusionFromEvaluation,
  echoKeyCaptureIssue,
  echoKeyIntervalName,
  echoKeyRepairPairs,
  echoKeyTargetNotes,
  evaluateEchoKeyAttempt,
  parseEchoKeyConfusions,
  signedSemitoneLabel,
  summarizeEchoKeyConfusions,
  type EchoKeyPhrase,
} from "../lib/echo-key-model.ts";

const neighbor = ECHO_KEY_PHRASES.find((phrase) => phrase.id === "neighbor-return")!;

test("accepts an exact phrase and a uniform transposition in relative mode", () => {
  assert.equal(evaluateEchoKeyAttempt(neighbor, 60, [60, 62, 60]).kind, "secure");
  const moved = evaluateEchoKeyAttempt(neighbor, 60, [67, 69, 67]);
  assert.equal(moved.kind, "secure");
  assert.equal(moved.alignmentShift, 7);
});

test("given-start mode separates an anchor miss from interval understanding", () => {
  const result = evaluateEchoKeyAttempt(neighbor, 60, [61, 63, 61], "given-start");
  assert.equal(result.kind, "anchor");
  assert.equal(result.alignmentShift, 1);
  assert.deepEqual(result.alignedTarget, [60, 62, 60]);
  assert.equal(result.intervalAccuracy, 1);
  assert.equal(result.divergence, null, "an anchor displacement is not an interval divergence");
  assert.equal(confusionFromEvaluation(result, neighbor.id, 100), null);
  assert.match(result.headline, /starting place/);
});

test("diagnoses contour before interval width and exposes an anchored repair pair", () => {
  const result = evaluateEchoKeyAttempt(neighbor, 60, [65, 63, 65]);
  assert.equal(result.kind, "contour");
  assert.equal(result.divergence?.moveIndex, 0);
  assert.deepEqual(echoKeyRepairPairs(result), { expected: [65, 67], performed: [65, 63] });
});

test("retains a correct contour while isolating interval width", () => {
  const result = evaluateEchoKeyAttempt(neighbor, 60, [65, 68, 65]);
  assert.equal(result.kind, "interval-width");
  assert.equal(result.contourAccuracy, 1);
  assert.equal(result.intervalAccuracy, 0);
});

test("withholds a judgment until the whole phrase is present", () => {
  const result = evaluateEchoKeyAttempt(neighbor, 60, [60, 62]);
  assert.equal(result.status, "waiting");
  assert.equal(result.kind, "incomplete");
  assert.match(result.headline, /2 of 3/);
});

test("handles repeated tones without erasing zero-sized moves", () => {
  const repeated: EchoKeyPhrase = {
    ...neighbor,
    id: "repeat-then-rise",
    offsets: [0, 0, 2, 2, 0],
    beats: [1, 1, 1, 1, 2],
  };
  assert.equal(evaluateEchoKeyAttempt(repeated, 60, [67, 67, 69, 69, 67]).kind, "secure");

  const lostRepeat = evaluateEchoKeyAttempt(repeated, 60, [67, 68, 69, 69, 67]);
  assert.equal(lostRepeat.kind, "contour");
  assert.equal(lostRepeat.divergence?.moveIndex, 0);
  assert.equal(lostRepeat.divergence?.expectedInterval, 0);
  assert.equal(lostRepeat.divergence?.performedInterval, 1);
  assert.match(lostRepeat.headline, /repeating and moving/);
});

test("rejects chord-like and extra attacks before a monophonic phrase is scored", () => {
  assert.equal(echoKeyCaptureIssue([
    { id: 1, note: 60, onsetMs: 100 },
    { id: 2, note: 64, onsetMs: 145 },
    { id: 3, note: 62, onsetMs: 500 },
  ], 3), "simultaneous-attacks");
  assert.equal(echoKeyCaptureIssue([
    { id: 1, note: 60, onsetMs: 100 },
    { id: 2, note: 62, onsetMs: 400 },
    { id: 3, note: 60, onsetMs: 700 },
    { id: 4, note: 65, onsetMs: 1_000 },
  ], 3), "extra-attacks");
  assert.equal(echoKeyCaptureIssue([
    { id: 1, note: 60, onsetMs: 100 },
    { id: 2, note: 62, onsetMs: 400 },
    { id: 3, note: 60, onsetMs: 700 },
  ], 3), null);
  assert.equal(echoKeyCaptureIssue([
    { id: 1, note: 60, onsetMs: -500 },
    { id: 2, note: 62, onsetMs: -200 },
    { id: 3, note: 60, onsetMs: 100 },
  ], 3), null, "tab restoration may translate valid monotonic onsets below zero");
});

test("reports the earliest move deterministically when several moves differ", () => {
  const result = evaluateEchoKeyAttempt(neighbor, 60, [65, 68, 69]);
  assert.equal(result.divergence?.moveIndex, 0);
  assert.deepEqual(result.performedIntervals, [3, 1]);
  assert.equal(result.kind, "interval-width");
});

test("preserves relative relationships through octave crossings and multi-octave shifts", () => {
  const crossing: EchoKeyPhrase = {
    ...neighbor,
    id: "octave-crossing",
    offsets: [0, 1, 13, 12],
    beats: [1, 1, 1, 2],
  };
  assert.deepEqual(echoKeyTargetNotes(crossing, 71), [71, 72, 84, 83]);
  const moved = evaluateEchoKeyAttempt(crossing, 71, [47, 48, 60, 59]);
  assert.equal(moved.kind, "secure");
  assert.equal(moved.alignmentShift, -24);
  assert.deepEqual(moved.targetIntervals, [1, 12, -1]);
});

test("supports one-tone phrases and treats only a supplied anchor as assessable", () => {
  const oneTone: EchoKeyPhrase = { ...neighbor, id: "one-tone", offsets: [0], beats: [2] };
  assert.equal(evaluateEchoKeyAttempt(oneTone, 60, [72]).kind, "secure");
  const anchored = evaluateEchoKeyAttempt(oneTone, 60, [72], "given-start");
  assert.equal(anchored.kind, "anchor");
  assert.equal(anchored.alignmentShift, 12);
  assert.equal(anchored.divergence, null);
  assert.equal(anchored.contourAccuracy, 1);
  assert.equal(anchored.intervalAccuracy, 1);
});

test("rejects malformed or out-of-keyboard MIDI evidence without clamping relationships", () => {
  assert.throws(() => echoKeyTargetNotes(neighbor, -1), /integer MIDI note/);
  assert.throws(() => echoKeyTargetNotes({ ...neighbor, offsets: [] }, 60), /at least one/);
  assert.throws(() => echoKeyTargetNotes({ ...neighbor, offsets: [0, 8] }, 123), /does not fit/);
  assert.throws(() => evaluateEchoKeyAttempt(neighbor, 60, [60, 128, 60]), /integer MIDI notes/);
  assert.throws(() => evaluateEchoKeyAttempt(neighbor, 60, [60, 62.5, 60]), /integer MIDI notes/);
  assert.throws(() => evaluateEchoKeyAttempt(neighbor, 60, [60, 62, 60, 65]), /more attacks than the target/);
  assert.throws(() => signedSemitoneLabel(Number.NaN), /integer distance/);
  assert.throws(() => echoKeyIntervalName(3.5), /integer semitone/);
});

test("moves a repair contrast by octaves when the corrected move would leave MIDI range", () => {
  const highTurn: EchoKeyPhrase = { ...neighbor, id: "high-turn", offsets: [0, 2], beats: [1, 1] };
  const result = evaluateEchoKeyAttempt(highTurn, 60, [127, 126]);
  assert.equal(result.kind, "contour");
  assert.deepEqual(echoKeyRepairPairs(result), { expected: [115, 117], performed: [115, 114] });
});

test("persists only validated bounded confusion records and ranks repeated substitutions", () => {
  const width = evaluateEchoKeyAttempt(neighbor, 60, [60, 63, 60]);
  const first = confusionFromEvaluation(width, neighbor.id, 100)!;
  const second = { ...first, id: "second", at: 200 };
  const parsed = parseEchoKeyConfusions(JSON.stringify([first, { nope: true }, second]));
  assert.equal(parsed.length, 2);
  assert.deepEqual(summarizeEchoKeyConfusions(parsed)[0], {
    key: "2:3", expectedInterval: 2, performedInterval: 3, count: 2, mostRecentAt: 200,
  });
  assert.deepEqual(parseEchoKeyConfusions("not-json"), []);
});

test("history retains the eighty most recent valid records and tie ordering is stable", () => {
  const records = Array.from({ length: 90 }, (_, index) => ({
    id: `record-${String(index).padStart(2, "0")}`,
    phraseId: neighbor.id,
    at: index,
    expectedInterval: index % 2 ? 2 : -2,
    performedInterval: index % 2 ? 3 : -3,
    kind: "interval-width" as const,
  })).reverse();
  records.push({ ...records[0], id: "invalid-range", at: 1_000, expectedInterval: 128 });
  const parsed = parseEchoKeyConfusions(JSON.stringify(records));
  assert.equal(parsed.length, 80);
  assert.equal(parsed[0].at, 10);
  assert.equal(parsed.at(-1)?.at, 89);

  const tie = summarizeEchoKeyConfusions([
    { id: "b", phraseId: "p", at: 50, expectedInterval: 3, performedInterval: 2, kind: "interval-width" },
    { id: "a", phraseId: "p", at: 50, expectedInterval: 2, performedInterval: 1, kind: "interval-width" },
  ]);
  assert.deepEqual(tie.map((summary) => summary.key), ["2:1", "3:2"]);
});

test("legacy anchor records do not become interval-confusion evidence", () => {
  assert.deepEqual(summarizeEchoKeyConfusions([
    { id: "legacy", phraseId: "p", at: 1, expectedInterval: 2, performedInterval: 2, kind: "anchor" },
  ]), []);
});

test("keeps diagnostic dimensions separate and exposes no blended overall score", () => {
  const result = evaluateEchoKeyAttempt(neighbor, 60, [60, 63, 60]);
  assert.equal(result.contourAccuracy, 1);
  assert.equal(result.intervalAccuracy, 0);
  assert.equal("score" in result, false);
  assert.equal("accuracy" in result, false);
});
