export type EchoKeyRoute = "major" | "natural-minor" | "major-pentatonic";
export type EchoKeyAttemptMode = "relative" | "given-start";
export type EchoKeyMismatchKind = "secure" | "anchor" | "contour" | "interval-width" | "incomplete";

export type EchoKeyPhrase = {
  id: string;
  title: string;
  subtitle: string;
  route: EchoKeyRoute;
  offsets: number[];
  beats: number[];
  listenFor: string;
  relationship: string;
  repairPrompt: string;
};

export type EchoKeyDivergence = {
  moveIndex: number;
  expectedFrom: number;
  expectedTo: number;
  performedFrom: number;
  performedTo: number;
  expectedInterval: number;
  performedInterval: number;
  expectedContour: -1 | 0 | 1;
  performedContour: -1 | 0 | 1;
};

export type EchoKeyEvaluation = {
  status: "waiting" | "complete";
  kind: EchoKeyMismatchKind;
  target: number[];
  alignedTarget: number[];
  performed: number[];
  alignmentShift: number;
  targetIntervals: number[];
  performedIntervals: number[];
  contourAccuracy: number;
  intervalAccuracy: number;
  divergence: EchoKeyDivergence | null;
  headline: string;
  explanation: string;
};

export type EchoKeyConfusion = {
  id: string;
  phraseId: string;
  at: number;
  expectedInterval: number;
  performedInterval: number;
  kind: Exclude<EchoKeyMismatchKind, "secure" | "incomplete">;
};

export type EchoKeyConfusionSummary = {
  key: string;
  expectedInterval: number;
  performedInterval: number;
  count: number;
  mostRecentAt: number;
};

export type EchoKeyCaptureIssue = "simultaneous-attacks" | "extra-attacks";
export type EchoKeyCaptureEvent = { id: number; note: number; onsetMs: number };

export const ECHO_KEY_STORAGE_KEY = "music-with-no-names:echo-key-confusions:v1";
export const ECHO_KEY_LESSON_STORAGE_KEY = "music-with-no-names:echo-key-lesson:v1";

export const ECHO_KEY_PHRASES: EchoKeyPhrase[] = [
  {
    id: "neighbor-return",
    title: "Leave and return",
    subtitle: "one whole step around home",
    route: "major",
    offsets: [0, 2, 0],
    beats: [1, 1, 2],
    listenFor: "Keep the first tone alive in memory while the phrase steps away and comes back.",
    relationship: "The two moves are exact opposites: +2 semitones, then −2.",
    repairPrompt: "Make the away-step and return-step feel like one reversible gesture.",
  },
  {
    id: "homeward-arc",
    title: "Homeward arc",
    subtitle: "a fifth opens, steps fold inward, then reopen",
    route: "major",
    offsets: [7, 4, 2, 0, 2, 4, 7],
    beats: [1, 1, 1, 2, 1, 1, 2],
    listenFor: "Hear the low center before it arrives; the second half mirrors the first.",
    relationship: "−3, −2, −2 reaches home; +2, +2, +3 retraces the same arch.",
    repairPrompt: "Compare the compact 2-semitone steps with the wider 3-semitone edge of the arch.",
  },
  {
    id: "major-lantern",
    title: "Bright lantern",
    subtitle: "home unfolds as 4 + 3",
    route: "major",
    offsets: [0, 4, 7, 4, 0],
    beats: [1, 1, 2, 1, 2],
    listenFor: "Hold the earlier tones in memory and notice whether the return retraces what unfolded.",
    relationship: "+4 then +3 builds a major triad; the descent reverses those unequal thirds.",
    repairPrompt: "Contrast the lower 4-semitone span with the upper 3-semitone span from the same anchor.",
  },
  {
    id: "minor-lantern",
    title: "Shadow lantern",
    subtitle: "home unfolds as 3 + 4",
    route: "natural-minor",
    offsets: [0, 3, 7, 3, 0],
    beats: [1, 1, 2, 1, 2],
    listenFor: "Hold the outer shape in memory and notice how its two inner moves differ in width.",
    relationship: "+3 then +4 builds a minor triad; the same 7-semitone shell contains a different interior.",
    repairPrompt: "Alternate 3 and 4 semitones without changing the shared starting tone.",
  },
  {
    id: "pentatonic-wave",
    title: "Open wave",
    subtitle: "five-tone motion without half steps",
    route: "major-pentatonic",
    offsets: [0, 2, 4, 7, 9, 7, 4, 2, 0],
    beats: [1, 1, 1, 1, 2, 1, 1, 1, 2],
    listenFor: "Feel the wave widen and return; notice where one move opens more than its neighbors.",
    relationship: "The path uses 2, 2, 3, 2 semitones and avoids the one-semitone friction of adjacent chromatic keys.",
    repairPrompt: "Isolate the 3-semitone opening in the middle of the otherwise 2-semitone path.",
  },
];

export const ECHO_KEY_VARIATION_SHIFTS = [5, -3, 7, -5] as const;

const MIDI_MIN = 0;
const MIDI_MAX = 127;
const MAX_CONFUSION_RECORDS = 80;
const MAX_HISTORY_TEXT_LENGTH = 160;

function contour(interval: number): -1 | 0 | 1 {
  return interval === 0 ? 0 : interval > 0 ? 1 : -1;
}

function intervals(notes: number[]) {
  return notes.slice(1).map((note, index) => note - notes[index]);
}

function proportion(matches: number, total: number) {
  return total ? matches / total : 1;
}

function isMidiNote(value: number) {
  return Number.isInteger(value) && value >= MIDI_MIN && value <= MIDI_MAX;
}

function compareText(first: string, second: string) {
  return first < second ? -1 : first > second ? 1 : 0;
}

export function echoKeyCaptureIssue(events: EchoKeyCaptureEvent[], targetLength: number, collisionWindowMs = 70): EchoKeyCaptureIssue | null {
  if (!Number.isInteger(targetLength) || targetLength < 1) throw new RangeError("EchoKey capture needs a positive target length.");
  if (!Number.isFinite(collisionWindowMs) || collisionWindowMs < 0) throw new RangeError("EchoKey collision windows must be finite and non-negative.");
  const sorted = [...events].sort((first, second) => first.onsetMs - second.onsetMs || first.id - second.id);
  if (sorted.some((event) => !Number.isInteger(event.id) || !isMidiNote(event.note) || !Number.isFinite(event.onsetMs))) {
    throw new RangeError("EchoKey capture events need safe IDs, MIDI notes, and finite onset times.");
  }
  if (sorted.some((event, index) => index > 0 && event.onsetMs - sorted[index - 1].onsetMs <= collisionWindowMs)) return "simultaneous-attacks";
  return sorted.length > targetLength ? "extra-attacks" : null;
}

export function echoKeyTargetNotes(phrase: EchoKeyPhrase, tonicMidi: number) {
  if (!isMidiNote(tonicMidi)) throw new RangeError("EchoKey tonic must be an integer MIDI note from 0 through 127.");
  if (!Array.isArray(phrase.offsets) || phrase.offsets.length === 0 || phrase.offsets.some((offset) => !Number.isInteger(offset))) {
    throw new RangeError("EchoKey phrases need at least one integer semitone offset.");
  }
  const target = phrase.offsets.map((offset) => tonicMidi + offset);
  if (target.some((note) => !isMidiNote(note))) {
    throw new RangeError("The EchoKey phrase does not fit on the MIDI keyboard from this tonic.");
  }
  return target;
}

export function evaluateEchoKeyAttempt(phrase: EchoKeyPhrase, tonicMidi: number, performedInput: number[], mode: EchoKeyAttemptMode = "relative"): EchoKeyEvaluation {
  const target = echoKeyTargetNotes(phrase, tonicMidi);
  if (mode !== "relative" && mode !== "given-start") throw new RangeError("Unknown EchoKey attempt mode.");
  if (!Array.isArray(performedInput) || performedInput.some((note) => !isMidiNote(note))) {
    throw new RangeError("EchoKey attempts require integer MIDI notes from 0 through 127.");
  }
  if (performedInput.length > target.length) {
    throw new RangeError("EchoKey attempts cannot contain more attacks than the target phrase.");
  }
  const performed = [...performedInput];
  // Retain the observed anchor displacement in both modes. Only relative mode
  // applies it to the comparison target; given-start mode deliberately does not.
  const alignmentShift = performed.length ? performed[0] - target[0] : 0;
  const alignedTarget = mode === "relative" ? target.map((note) => note + alignmentShift) : [...target];
  const targetIntervals = intervals(target);
  const performedIntervals = intervals(performed);
  const comparedMoves = Math.min(targetIntervals.length, performedIntervals.length);
  const intervalMatches = targetIntervals.slice(0, comparedMoves).filter((value, index) => value === performedIntervals[index]).length;
  const contourMatches = targetIntervals.slice(0, comparedMoves).filter((value, index) => contour(value) === contour(performedIntervals[index])).length;
  const intervalAccuracy = proportion(intervalMatches, targetIntervals.length);
  const contourAccuracy = proportion(contourMatches, targetIntervals.length);

  if (performed.length < target.length) {
    return {
      status: "waiting", kind: "incomplete", target, alignedTarget, performed, alignmentShift, targetIntervals, performedIntervals,
      contourAccuracy, intervalAccuracy, divergence: null,
      headline: performed.length ? `${performed.length} of ${target.length} tones captured` : "Waiting for your first tone",
      explanation: "The attempt stays unscored until the complete relationship path is present.",
    };
  }

  const firstMoveMismatch = targetIntervals.findIndex((value, index) => value !== performedIntervals[index]);
  if (firstMoveMismatch >= 0) {
    const expectedInterval = targetIntervals[firstMoveMismatch];
    const performedInterval = performedIntervals[firstMoveMismatch];
    const expectedContour = contour(expectedInterval);
    const performedContour = contour(performedInterval);
    const kind: EchoKeyMismatchKind = expectedContour === performedContour ? "interval-width" : "contour";
    const divergence: EchoKeyDivergence = {
      moveIndex: firstMoveMismatch,
      expectedFrom: alignedTarget[firstMoveMismatch], expectedTo: alignedTarget[firstMoveMismatch + 1],
      performedFrom: performed[firstMoveMismatch], performedTo: performed[firstMoveMismatch + 1],
      expectedInterval, performedInterval, expectedContour, performedContour,
    };
    return {
      status: "complete", kind, target, alignedTarget, performed, alignmentShift, targetIntervals, performedIntervals,
      contourAccuracy, intervalAccuracy, divergence,
      headline: kind === "contour" ? expectedContour === 0 || performedContour === 0
        ? `Move ${firstMoveMismatch + 1} changed between repeating and moving.`
        : `The path first turned the other way at move ${firstMoveMismatch + 1}.`
        : `The direction held; move ${firstMoveMismatch + 1} had a different width.`,
      explanation: kind === "contour"
        ? `Expected ${signedSemitoneLabel(expectedInterval)}; received ${signedSemitoneLabel(performedInterval)} from MIDI. Repair the repeat, rise, or fall category before judging the whole phrase.`
        : `Expected ${signedSemitoneLabel(expectedInterval)}; received ${signedSemitoneLabel(performedInterval)} from MIDI. The contour survived, so isolate only the spacing.`,
    };
  }

  const exactAnchor = performed[0] === target[0];
  if (mode === "given-start" && !exactAnchor) {
    return {
      status: "complete", kind: "anchor", target, alignedTarget, performed, alignmentShift, targetIntervals, performedIntervals,
      contourAccuracy: 1, intervalAccuracy: 1,
      // An anchor displacement is not an interval divergence. Keeping this null
      // also makes one-tone given-start exercises representable without invented
      // or undefined second notes.
      divergence: null,
      headline: "The relationship is secure; only the given starting place moved.",
      explanation: `Every interval matched, but the phrase began ${signedSemitoneLabel(performed[0] - target[0])} from the supplied anchor.`,
    };
  }

  return {
    status: "complete", kind: "secure", target, alignedTarget, performed, alignmentShift, targetIntervals, performedIntervals,
    contourAccuracy: 1, intervalAccuracy: 1, divergence: null,
    headline: alignmentShift === 0 ? "The complete relationship landed." : `The relationship survived a ${signedSemitoneLabel(alignmentShift)} transposition.`,
    explanation: "Direction and exact semitone width matched at every move.",
  };
}

export function echoKeyRepairPairs(evaluation: EchoKeyEvaluation): { expected: [number, number]; performed: [number, number] } | null {
  const divergence = evaluation.divergence;
  if (!divergence || evaluation.kind === "anchor") return null;
  // Prefer the performed register, but move both contrasting pairs by octaves
  // when the corrected endpoint would otherwise fall beyond the keyboard.
  const octaveShifts = Array.from({ length: 23 }, (_, index) => (index - 11) * 12)
    .sort((first, second) => Math.abs(first) - Math.abs(second) || first - second);
  for (const shift of octaveShifts) {
    const anchor = divergence.performedFrom + shift;
    const expectedTo = anchor + divergence.expectedInterval;
    const performedTo = anchor + divergence.performedInterval;
    if ([anchor, expectedTo, performedTo].every(isMidiNote)) {
      return { expected: [anchor, expectedTo], performed: [anchor, performedTo] };
    }
  }
  return null;
}

export function signedSemitoneLabel(value: number) {
  if (!Number.isInteger(value)) throw new RangeError("A semitone label requires an integer distance.");
  if (value === 0) return "0 semitones";
  return `${value > 0 ? "+" : "−"}${Math.abs(value)} semitone${Math.abs(value) === 1 ? "" : "s"}`;
}

export function echoKeyIntervalName(semitones: number) {
  if (!Number.isInteger(semitones)) throw new RangeError("An interval name requires an integer semitone distance.");
  const names = ["unison", "minor 2nd", "major 2nd", "minor 3rd", "major 3rd", "perfect 4th", "tritone", "perfect 5th", "minor 6th", "major 6th", "minor 7th", "major 7th", "octave"];
  const absolute = Math.abs(semitones);
  const octaves = Math.floor(absolute / 12);
  const remainder = absolute % 12;
  if (absolute === 12) return "octave";
  if (absolute < names.length) return names[absolute];
  return remainder === 0 ? `${octaves} octaves` : `${octaves} octave${octaves === 1 ? "" : "s"} + ${names[remainder]}`;
}

export function confusionFromEvaluation(evaluation: EchoKeyEvaluation, phraseId: string, at = Date.now()): EchoKeyConfusion | null {
  if (!evaluation.divergence || evaluation.kind === "secure" || evaluation.kind === "incomplete") return null;
  if (!phraseId.trim() || phraseId.length > MAX_HISTORY_TEXT_LENGTH) throw new RangeError("EchoKey phrase IDs must be short, non-empty text.");
  if (!Number.isFinite(at) || at < 0) throw new RangeError("EchoKey history timestamps must be finite and non-negative.");
  return {
    id: `${at}-${phraseId}-${evaluation.divergence.moveIndex}`, phraseId, at,
    expectedInterval: evaluation.divergence.expectedInterval,
    performedInterval: evaluation.divergence.performedInterval,
    kind: evaluation.kind,
  };
}

export function summarizeEchoKeyConfusions(records: EchoKeyConfusion[]): EchoKeyConfusionSummary[] {
  const summaries = new Map<string, EchoKeyConfusionSummary>();
  for (const record of records) {
    // Legacy v1 could encode an anchor miss as a duplicated interval. That is
    // starting-position evidence, not an interval substitution, so omit it from
    // this interval confusion matrix.
    if (record.kind === "anchor") continue;
    const key = `${record.expectedInterval}:${record.performedInterval}`;
    const current = summaries.get(key);
    summaries.set(key, current
      ? { ...current, count: current.count + 1, mostRecentAt: Math.max(current.mostRecentAt, record.at) }
      : { key, expectedInterval: record.expectedInterval, performedInterval: record.performedInterval, count: 1, mostRecentAt: record.at });
  }
  return [...summaries.values()].sort((first, second) => second.count - first.count
    || second.mostRecentAt - first.mostRecentAt
    || compareText(first.key, second.key));
}

export function parseEchoKeyConfusions(raw: string | null): EchoKeyConfusion[] {
  if (!raw) return [];
  try {
    const value: unknown = JSON.parse(raw);
    if (!Array.isArray(value)) return [];
    return value.filter((record): record is EchoKeyConfusion => {
      if (!record || typeof record !== "object") return false;
      const item = record as Record<string, unknown>;
      return typeof item.id === "string" && item.id.length > 0 && item.id.length <= MAX_HISTORY_TEXT_LENGTH
        && typeof item.phraseId === "string" && item.phraseId.length > 0 && item.phraseId.length <= MAX_HISTORY_TEXT_LENGTH
        && typeof item.at === "number" && Number.isFinite(item.at) && item.at >= 0
        && typeof item.expectedInterval === "number" && Number.isInteger(item.expectedInterval)
        && Math.abs(item.expectedInterval) <= MIDI_MAX
        && typeof item.performedInterval === "number" && Number.isInteger(item.performedInterval)
        && Math.abs(item.performedInterval) <= MIDI_MAX
        && (item.kind === "anchor" || item.kind === "contour" || item.kind === "interval-width");
    }).sort((first, second) => first.at - second.at
      || compareText(first.id, second.id)
      || compareText(first.phraseId, second.phraseId))
      .slice(-MAX_CONFUSION_RECORDS);
  } catch {
    return [];
  }
}
