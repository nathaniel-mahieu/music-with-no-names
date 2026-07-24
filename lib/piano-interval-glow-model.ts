export const INTERVAL_GLOW_NAMES = [
  "same key",
  "neighbor",
  "whole step",
  "compact third",
  "wide third",
  "fourth",
  "half-octave",
  "fifth",
  "compact sixth",
  "wide sixth",
  "compact seventh",
  "near octave",
  "octave",
] as const;

export const INTERVAL_GLOW_LISTENING_CUES = [
  "The same keyboard position repeats. Listen for timing, touch, and register rather than pitch distance.",
  "The closest two keyboard positions. With sustained, overtone-rich sounds this often exposes dense interaction.",
  "A two-key step. Compare it with one semitone and notice the extra pitch space.",
  "The smaller third-size span. Compare it directly with four semitones before attaching a mood word.",
  "The larger third-size span. Its contrast with three semitones is easier to learn than either label alone.",
  "Five equal keyboard steps. Compare it with the neighboring six- and seven-semitone spans.",
  "Exactly halfway through the twelve-step octave. Reversing the pitch classes keeps the same six-step distance.",
  "Seven equal keyboard steps. It is the octave complement of five: 5 + 7 = 12.",
  "Eight steps; the octave complement of four. The same pitch classes can therefore be heard as 4 or 8 depending on direction and register.",
  "Nine steps; the octave complement of three. Compare 3 below with 9 above.",
  "Ten steps; the octave complement of two. Register decides whether the physical span is 2 or 10.",
  "One step short of an octave. Compare it with the neighbor interval after moving one note across the octave.",
  "The frequency reference doubles every twelve equal-tempered steps. Added octaves keep the pitch class while changing register.",
] as const;

export type IntervalGlowName = (typeof INTERVAL_GLOW_NAMES)[number];

export type FoldedInterval = {
  exactSemitones: number;
  ringSemitones: number;
  addedOctaves: number;
  name: IntervalGlowName;
};

export type ChordIntervalPair = FoldedInterval & {
  lowNote: number;
  highNote: number;
};

export type ChordSpacingProfile = {
  notes: number[];
  adjacentGaps: number[];
  pairs: ChordIntervalPair[];
  ringCounts: Array<{ semitones: number; pairCount: number }>;
  exactCounts: Array<{ semitones: number; pairCount: number }>;
  span: number;
};

export type IntervalTimelineEvent = {
  id: number;
  note: number;
  onsetMs: number;
  velocity?: number;
};

export type IntervalTimelineGroup = {
  id: number;
  onsetMs: number;
  endMs: number;
  events: IntervalTimelineEvent[];
  notes: number[];
};

export type IntervalTimeline = {
  events: IntervalTimelineEvent[];
  groups: IntervalTimelineGroup[];
  transitions: Array<{
    fromId: number;
    toId: number;
    signedSemitones: number;
    onsetGapMs: number;
    sameGroup: boolean;
    folded: FoldedInterval;
  }>;
};

export type SequentialIntervalFeeling = {
  gesture: "pulse" | "nudge" | "turn" | "reach" | "vault" | "echo";
  direction: "rising" | "falling" | "repeating";
  pace: "quick" | "flowing" | "spacious";
  phrase: string;
  possibleWords: string;
  listeningPrompt: string;
};

export type TogetherIntervalFeeling = {
  texture: "reinforcement" | "rub" | "color" | "brace" | "split" | "frame" | "bloom" | "edge" | "echo" | "layer";
  phrase: string;
  possibleWords: string;
  listeningPrompt: string;
};

function assertMidiNote(note: number) {
  if (!Number.isInteger(note) || note < 0 || note > 127) {
    throw new RangeError("MIDI notes must be integers from 0 through 127.");
  }
}

function uniqueSorted(notes: number[]) {
  notes.forEach(assertMidiNote);
  return [...new Set(notes)].sort((first, second) => first - second);
}

/**
 * Folds an exact physical keyboard distance onto a ring labeled 0 through 12.
 * Positive octave multiples stay at 12 rather than becoming the same-key 0.
 */
export function foldIntervalForGlow(distance: number): FoldedInterval {
  if (!Number.isInteger(distance) || distance < 0) {
    throw new RangeError("Interval distance must be a non-negative integer.");
  }
  if (distance === 0) {
    return { exactSemitones: 0, ringSemitones: 0, addedOctaves: 0, name: INTERVAL_GLOW_NAMES[0] };
  }
  const ringSemitones = ((distance - 1) % 12) + 1;
  const addedOctaves = Math.floor((distance - 1) / 12);
  return {
    exactSemitones: distance,
    ringSemitones,
    addedOctaves,
    name: INTERVAL_GLOW_NAMES[ringSemitones],
  };
}

export function intervalListeningCue(distance: number) {
  return INTERVAL_GLOW_LISTENING_CUES[foldIntervalForGlow(distance).ringSemitones];
}

/**
 * Gives one chronological interval an embodied motion prompt. Direction, size,
 * and onset gap are measured; the words are deliberately invitations to
 * compare experience rather than predictions of emotion.
 */
export function sequentialIntervalFeeling(
  signedSemitones: number,
  onsetGapMs: number,
): SequentialIntervalFeeling {
  if (!Number.isInteger(signedSemitones) || Math.abs(signedSemitones) > 127) {
    throw new RangeError("Sequential interval distance must be an integer from -127 through 127.");
  }
  if (!Number.isFinite(onsetGapMs) || onsetGapMs < 0) {
    throw new RangeError("Sequential onset gap must be a non-negative duration.");
  }
  const distance = Math.abs(signedSemitones);
  const direction = signedSemitones > 0 ? "rising" : signedSemitones < 0 ? "falling" : "repeating";
  const pace = onsetGapMs <= 180 ? "quick" : onsetGapMs <= 620 ? "flowing" : "spacious";
  const profile = distance === 0
    ? { gesture: "pulse", words: "insistence · return · pulse", prompt: "Does the repeated pitch feel like continuation, emphasis, or a fresh event?" }
    : distance <= 2
      ? { gesture: "nudge", words: "lean · brush · continuation", prompt: "Notice whether the close move feels connected or sharply directional at this pace." }
      : distance <= 4
        ? { gesture: "turn", words: "color · curve · answer", prompt: "Compare three and four semitones in the same direction and timing." }
        : distance <= 7
          ? { gesture: "reach", words: "space · declaration · suspension", prompt: "Feel the hand-sized reach, then reverse it without changing its exact span." }
          : distance < 12
            ? { gesture: "vault", words: "yearning · exposure · surprise", prompt: "Compare this broad leap with the same pitch classes folded into a smaller register." }
            : { gesture: "echo", words: "distance · expansion · return", prompt: "Listen for pitch-class echo while the register and physical reach expand." };
  return {
    gesture: profile.gesture as SequentialIntervalFeeling["gesture"],
    direction,
    pace,
    phrase: `${pace} ${direction} ${profile.gesture}`,
    possibleWords: profile.words,
    listeningPrompt: profile.prompt,
  };
}

/**
 * Gives one simultaneously interpreted pair a texture prompt. Exact physical
 * spacing stays primary so a wide 11-semitone pair is never treated as the same
 * acoustic situation as two neighboring keys.
 */
export function togetherIntervalFeeling(distance: number): TogetherIntervalFeeling {
  const folded = foldIntervalForGlow(distance);
  const profile = distance === 0
    ? { texture: "reinforcement", phrase: "one position reinforced", words: "focus · insistence · weight", prompt: "Separate attack strength from the fact that the pitch position is unchanged." }
    : distance % 12 === 0
      ? { texture: "echo", phrase: "octave echo", words: "fusion · expansion · reinforcement", prompt: "Listen for shared pitch identity across a changed register." }
      : distance > 12
        ? { texture: "layer", phrase: "cross-register layer", words: "space · distance · shimmer", prompt: "Move the upper note down an octave and compare the same ring color at a tighter physical span." }
        : distance <= 2
          ? { texture: "rub", phrase: "close-key rub", words: "pressure · shimmer · bite", prompt: "Sustain the pair and notice how register and timbre change its interaction." }
          : distance <= 4
            ? { texture: "color", phrase: "interlocked color", words: "blend · shade · intimacy", prompt: "Hold three semitones, then four, and compare their color without naming a mood first." }
            : distance === 5
              ? { texture: "brace", phrase: "open brace", words: "space · suspension · declaration", prompt: "Compare the five-step brace with its seven-step octave complement." }
              : distance === 6
                ? { texture: "split", phrase: "evenly split field", words: "edge · symmetry · ambiguity", prompt: "Reverse or transpose the pair: the six-step split keeps the same spacing class." }
                : distance === 7
                  ? { texture: "frame", phrase: "open frame", words: "breadth · support · clarity", prompt: "Compare the seven-step frame with five steps while holding the same lower note." }
                  : distance <= 9
                    ? { texture: "bloom", phrase: "wide color bloom", words: "reach · bloom · yearning", prompt: "Bring the upper note down an octave and compare broad versus compact placement." }
                    : { texture: "edge", phrase: "wide octave-edge", words: "exposure · distance · unfinished", prompt: "Move one note through the octave boundary and notice physical span separately from pitch class." };
  return {
    texture: profile.texture as TogetherIntervalFeeling["texture"],
    phrase: `${profile.phrase} · ${folded.exactSemitones} semitone${folded.exactSemitones === 1 ? "" : "s"}`,
    possibleWords: profile.words,
    listeningPrompt: profile.prompt,
  };
}

/** Exact adjacent and all-pairs semitone decompositions of one voiced field. */
export function chordSpacingProfile(notesInput: number[]): ChordSpacingProfile {
  const notes = uniqueSorted(notesInput);
  const adjacentGaps = notes.slice(1).map((note, index) => note - notes[index]);
  const pairs: ChordIntervalPair[] = [];
  for (let lowIndex = 0; lowIndex < notes.length; lowIndex += 1) {
    for (let highIndex = lowIndex + 1; highIndex < notes.length; highIndex += 1) {
      const lowNote = notes[lowIndex];
      const highNote = notes[highIndex];
      pairs.push({ lowNote, highNote, ...foldIntervalForGlow(highNote - lowNote) });
    }
  }
  const countBy = (values: number[]) => [...new Set(values)]
    .sort((first, second) => first - second)
    .map((semitones) => ({ semitones, pairCount: values.filter((value) => value === semitones).length }));
  return {
    notes,
    adjacentGaps,
    pairs,
    ringCounts: countBy(pairs.map((pair) => pair.ringSemitones)),
    exactCounts: countBy(pairs.map((pair) => pair.exactSemitones)),
    span: notes.length > 1 ? notes.at(-1)! - notes[0] : 0,
  };
}

/**
 * Retains a small phrase and groups attacks that begin within a learner-chosen
 * chord window. The grouping is a timing interpretation, not chord identity.
 */
export function intervalTimeline(
  eventsInput: IntervalTimelineEvent[],
  chordWindowMs: number,
  maximumEvents = 24,
): IntervalTimeline {
  if (!Number.isFinite(chordWindowMs) || chordWindowMs <= 0) {
    throw new RangeError("Chord window must be a positive duration.");
  }
  if (!Number.isInteger(maximumEvents) || maximumEvents < 2) {
    throw new RangeError("Timeline capacity must be an integer of at least two.");
  }
  const ordered = eventsInput
    .map((event) => {
      assertMidiNote(event.note);
      if (!Number.isInteger(event.id) || !Number.isFinite(event.onsetMs)) {
        throw new RangeError("Timeline events require an integer id and finite onset.");
      }
      if (event.velocity != null && (!Number.isFinite(event.velocity) || event.velocity < 0 || event.velocity > 127)) {
        throw new RangeError("Timeline event velocity must be from 0 through 127 when supplied.");
      }
      return {
        id: event.id,
        note: event.note,
        onsetMs: event.onsetMs,
        ...(event.velocity == null ? {} : { velocity: event.velocity }),
      };
    })
    .sort((first, second) => first.onsetMs - second.onsetMs || first.id - second.id)
    .slice(-maximumEvents);

  const groups: IntervalTimelineGroup[] = [];
  ordered.forEach((event) => {
    const current = groups.at(-1);
    const shouldJoin = current
      && event.onsetMs - current.endMs <= chordWindowMs
      && event.onsetMs - current.onsetMs <= chordWindowMs * 2;
    if (!shouldJoin) {
      groups.push({
        id: event.id,
        onsetMs: event.onsetMs,
        endMs: event.onsetMs,
        events: [event],
        notes: [event.note],
      });
      return;
    }
    current.endMs = event.onsetMs;
    current.events.push(event);
    current.notes = uniqueSorted([...current.notes, event.note]);
  });

  const groupByEventId = new Map<number, number>();
  groups.forEach((group) => group.events.forEach((event) => groupByEventId.set(event.id, group.id)));
  const transitions = ordered.slice(1).map((event, index) => {
    const previous = ordered[index];
    const signedSemitones = event.note - previous.note;
    return {
      fromId: previous.id,
      toId: event.id,
      signedSemitones,
      onsetGapMs: Math.max(0, event.onsetMs - previous.onsetMs),
      sameGroup: groupByEventId.get(previous.id) === groupByEventId.get(event.id),
      folded: foldIntervalForGlow(Math.abs(signedSemitones)),
    };
  });

  return { events: ordered, groups, transitions };
}

export function exactIntervalCopy(distance: number) {
  const folded = foldIntervalForGlow(distance);
  if (distance === 0) return "0 semitones · same key";
  if (!folded.addedOctaves) return `${distance} semitone${distance === 1 ? "" : "s"} · ${folded.name}`;
  const octaveCount = Math.floor(distance / 12);
  const remainder = distance % 12;
  return `${distance} semitones · ${octaveCount} octave${octaveCount === 1 ? "" : "s"}${remainder ? ` + ${remainder}` : ""}`;
}
