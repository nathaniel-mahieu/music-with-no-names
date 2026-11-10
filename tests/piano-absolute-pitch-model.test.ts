import assert from "node:assert/strict";
import test from "node:test";
import {
  ABSOLUTE_PITCH_CLASSES,
  ABSOLUTE_PITCH_PRACTICE_SOUND,
  ABSOLUTE_PITCH_TRANSFER_SOUND,
  absolutePitchMidi,
  absolutePitchPracticePassed,
  absolutePitchPracticeTargets,
  createAbsolutePitchColdCheck,
  createAbsolutePitchPractice,
  summarizeAbsolutePitchAnswers,
  type AbsolutePitchTrial,
} from "../lib/piano-absolute-pitch-model.ts";
import { pitchClassFromMidi } from "../lib/piano-model.ts";

test("cold check tests every pitch class in both familiar and held-out sounds", () => {
  const cold = createAbsolutePitchColdCheck(() => .41);
  assert.equal(cold.length, 24);
  const soundRanges = [
    { sound: ABSOLUTE_PITCH_PRACTICE_SOUND, octaves: [3, 4, 5] },
    { sound: ABSOLUTE_PITCH_TRANSFER_SOUND, octaves: [2, 6] },
  ];
  for (const { sound, octaves } of soundRanges) {
    const group = cold.filter((trial) => trial.sound === sound);
    assert.deepEqual(group.map(({ midi }) => pitchClassFromMidi(midi)).sort((a, b) => a - b), ABSOLUTE_PITCH_CLASSES);
    assert.deepEqual([...new Set(group.map(({ midi }) => Math.floor(midi / 12) - 1))].sort((a, b) => a - b), octaves);
  }
});

test("beginning practice balances the anchor with nearby distractors in three octaves", () => {
  const anchor = 5;
  const practice = createAbsolutePitchPractice(anchor, 1, () => .41);
  const pitches = practice.map(({ midi }) => pitchClassFromMidi(midi));
  assert.equal(pitches.filter((pitchClass) => pitchClass === anchor).length, practice.length / 2);
  assert.deepEqual([...new Set(pitches)].sort((a, b) => a - b), [3, 4, 5, 6, 7]);
  assert.deepEqual([...new Set(practice.filter((_, index) => pitches[index] === anchor).map(({ midi }) => Math.floor(midi / 12) - 1))].sort(), [3, 4, 5]);
  assert.deepEqual(absolutePitchPracticeTargets(0, 3), [0, 1, 11]);
  assert.deepEqual(absolutePitchPracticeTargets(11, 12), ABSOLUTE_PITCH_CLASSES);
});

test("practice advances only after the learner recognizes every target", () => {
  const practice = createAbsolutePitchPractice(5, 10, () => .41);
  const targets = absolutePitchPracticeTargets(5, 10);
  const correctAnswers = practice.map((trial, index) => {
    const pitchClass = pitchClassFromMidi(trial.midi);
    return { trial, guess: targets.includes(pitchClass) ? pitchClass : null, latencyMs: 500 + 10 * index };
  });
  assert.equal(absolutePitchPracticePassed(correctAnswers, targets), true);
  const mostlyCorrect = correctAnswers.map((answer) => ({
    ...answer,
    guess: answer.guess === 4 ? null : answer.guess,
  }));
  assert.equal(summarizeAbsolutePitchAnswers(mostlyCorrect, targets).correct, 19);
  assert.equal(absolutePitchPracticePassed(mostlyCorrect, targets), false);
  assert.equal(summarizeAbsolutePitchAnswers(correctAnswers, targets).medianCorrectMs, 595);
});

test("skipped tones count as misses when all pitch classes are targets", () => {
  const trial: AbsolutePitchTrial = { midi: absolutePitchMidi(5, 4), sound: ABSOLUTE_PITCH_PRACTICE_SOUND };
  assert.deepEqual(summarizeAbsolutePitchAnswers([{ trial, guess: null, latencyMs: 400 }]), {
    correct: 0,
    total: 1,
    medianCorrectMs: null,
  });
});
