import { pitchClassFromMidi } from "./piano-model.ts";
import type { PianoSoundModelId } from "./piano-sound-model.ts";

export const ABSOLUTE_PITCH_CLASSES = Array.from({ length: 12 }, (_, pitchClass) => pitchClass);
export const ABSOLUTE_PITCH_OCTAVES = [3, 4, 5] as const;
export const ABSOLUTE_PITCH_PRACTICE_SOUND = "harmonic" satisfies PianoSoundModelId;
export const ABSOLUTE_PITCH_TRANSFER_SOUND = "mellow-piano" satisfies PianoSoundModelId;
export const ABSOLUTE_PITCH_TRANSFER_OCTAVES = [2, 6] as const;
/** Device-local keys shared by the Absolute Pitch trainer and the Anchor Drill. */
export const ABSOLUTE_PITCH_ANCHOR_STORAGE_KEY = "piano-absolute-pitch-anchor-v1";
export const ABSOLUTE_PITCH_COLD_HISTORY_STORAGE_KEY = "piano-absolute-pitch-cold-history-v1";

export type AbsolutePitchTrial = {
  midi: number;
  sound: PianoSoundModelId;
};

export type AbsolutePitchAnswer = {
  trial: AbsolutePitchTrial;
  guess: number | null;
  latencyMs: number;
};

type Random = () => number;

export function absolutePitchMidi(pitchClass: number, octave: number) {
  return (octave + 1) * 12 + pitchClassFromMidi(pitchClass);
}

function shuffled<T>(values: readonly T[], random: Random) {
  const result = [...values];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const other = Math.floor(random() * (index + 1));
    [result[index], result[other]] = [result[other], result[index]];
  }
  return result;
}

export function absolutePitchPracticeTargets(anchor: number, level: number) {
  return [0, -1, 1, -2, 2, -3, 3, -4, 4, -5, 5, 6]
    .slice(0, level)
    .map((offset) => pitchClassFromMidi(anchor + offset))
    .sort((left, right) => left - right);
}

export function createAbsolutePitchPractice(anchor: number, level: number, random: Random = Math.random): AbsolutePitchTrial[] {
  const targets = absolutePitchPracticeTargets(anchor, level);
  const targetSet = new Set(targets);
  const distractorSet = new Set(targets.flatMap((target) => [-2, -1, 1, 2].map((step) => pitchClassFromMidi(target + step))));
  const distractors = shuffled([...distractorSet].filter((pitchClass) => !targetSet.has(pitchClass)), random);
  const copies = Math.ceil(6 / targets.length);
  const targetDeck: AbsolutePitchTrial[] = targets.flatMap((target) => {
    const octaves = shuffled(ABSOLUTE_PITCH_OCTAVES, random);
    return Array.from({ length: copies }, (_, index) => ({
      midi: absolutePitchMidi(target, octaves[index % octaves.length]),
      sound: ABSOLUTE_PITCH_PRACTICE_SOUND,
    }));
  });
  const octaves = shuffled(ABSOLUTE_PITCH_OCTAVES, random);
  const distractorDeck: AbsolutePitchTrial[] = distractors.length
    ? Array.from({ length: targetDeck.length }, (_, index) => distractors[index % distractors.length])
      .map((pitchClass, index) => ({
        midi: absolutePitchMidi(pitchClass, octaves[index % octaves.length]),
        sound: ABSOLUTE_PITCH_PRACTICE_SOUND,
      }))
    : [];
  return shuffled([...targetDeck, ...distractorDeck], random);
}

export function createAbsolutePitchColdCheck(random: Random = Math.random): AbsolutePitchTrial[] {
  const familiarOctaves = shuffled(ABSOLUTE_PITCH_OCTAVES, random);
  const familiar: AbsolutePitchTrial[] = shuffled(ABSOLUTE_PITCH_CLASSES, random).map((pitchClass, index) => ({
    midi: absolutePitchMidi(pitchClass, familiarOctaves[index % familiarOctaves.length]),
    sound: ABSOLUTE_PITCH_PRACTICE_SOUND,
  }));
  const transfer: AbsolutePitchTrial[] = shuffled(ABSOLUTE_PITCH_CLASSES, random).map((pitchClass, index) => ({
    midi: absolutePitchMidi(pitchClass, index % 2 === 0 ? 2 : 6),
    sound: ABSOLUTE_PITCH_TRANSFER_SOUND,
  }));
  const remaining = shuffled([...familiar, ...transfer], random);
  const trials: AbsolutePitchTrial[] = [];
  while (remaining.length > 0) {
    const previous = trials.at(-1);
    const nextIndex = previous
      ? remaining.findIndex(({ midi }) => pitchClassFromMidi(midi) !== pitchClassFromMidi(previous.midi) && Math.abs(midi - previous.midi) >= 6)
      : 0;
    trials.push(remaining.splice(nextIndex < 0 ? 0 : nextIndex, 1)[0]);
  }
  return trials;
}

export function absolutePitchAnswerCorrect(answer: AbsolutePitchAnswer, targets = ABSOLUTE_PITCH_CLASSES) {
  const pitchClass = pitchClassFromMidi(answer.trial.midi);
  return answer.guess === (targets.includes(pitchClass) ? pitchClass : null);
}

export function summarizeAbsolutePitchAnswers(answers: readonly AbsolutePitchAnswer[], targets = ABSOLUTE_PITCH_CLASSES) {
  const correct = answers.filter((answer) => absolutePitchAnswerCorrect(answer, targets));
  const latencies = correct.map(({ latencyMs }) => latencyMs).sort((left, right) => left - right);
  const middle = Math.floor(latencies.length / 2);
  return {
    correct: correct.length,
    total: answers.length,
    medianCorrectMs: latencies.length === 0 ? null : Math.round((latencies[middle] + latencies[Math.floor((latencies.length - 1) / 2)]) / 2),
  };
}

export function absolutePitchPracticePassed(answers: readonly AbsolutePitchAnswer[], targets: number[]) {
  const summary = summarizeAbsolutePitchAnswers(answers, targets);
  return summary.total > 0
    && summary.correct / summary.total >= .8
    && targets.every((target) => answers.some((answer) => answer.guess === target && pitchClassFromMidi(answer.trial.midi) === target));
}
