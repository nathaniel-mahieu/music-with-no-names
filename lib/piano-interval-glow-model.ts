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
    folded: FoldedInterval;
  }>;
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
      return { id: event.id, note: event.note, onsetMs: event.onsetMs };
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

  const transitions = ordered.slice(1).map((event, index) => {
    const previous = ordered[index];
    const signedSemitones = event.note - previous.note;
    return {
      fromId: previous.id,
      toId: event.id,
      signedSemitones,
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
