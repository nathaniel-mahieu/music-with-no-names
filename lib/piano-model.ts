import { centsFromRatio } from "./music-math.ts";

export type PianoScale = {
  id: "bright-seven" | "shadow-seven" | "open-five" | "blues-six";
  name: string;
  conventionalName: string;
  character: string;
  steps: number[];
  solfege: string[];
};

export type MidiMessage =
  | { type: "note-on"; note: number; velocity: number; channel: number }
  | { type: "note-off"; note: number; channel: number }
  | { type: "sustain"; down: boolean; channel: number }
  | { type: "other" };

export type ScaleCandidate = {
  scale: PianoScale;
  rootPitchClass: number;
  uniqueNoteCount: number;
  inScaleCount: number;
  routeCoveredCount: number;
  matchFraction: number;
  coverageFraction: number;
  homePresent: boolean;
  fit: number;
};

export type TonalTendency = {
  homePull: number;
  homeEvidence: number;
  hasHome: boolean;
  directNeighborCount: number;
  fifthPresent: boolean;
};

export const CHROMATIC_SOLFEGE = [
  "Do",
  "Di",
  "Re",
  "Ri",
  "Mi",
  "Fa",
  "Fi",
  "Sol",
  "Si",
  "La",
  "Li",
  "Ti",
] as const;

export const CONVENTIONAL_PITCH_CLASSES = [
  "C",
  "C♯",
  "D",
  "D♯",
  "E",
  "F",
  "F♯",
  "G",
  "G♯",
  "A",
  "A♯",
  "B",
] as const;

export const PIANO_SCALES: PianoScale[] = [
  {
    id: "bright-seven",
    name: "Seven-pitch bright route",
    conventionalName: "major scale / Ionian mode",
    character: "Unequal gaps make a strong route back to Do.",
    steps: [2, 2, 1, 2, 2, 2, 1],
    solfege: ["Do", "Re", "Mi", "Fa", "Sol", "La", "Ti"],
  },
  {
    id: "shadow-seven",
    name: "Seven-pitch shadow route",
    conventionalName: "natural minor / Aeolian mode",
    character: "Three lowered positions change the route while Do stays home.",
    steps: [2, 1, 2, 2, 1, 2, 2],
    solfege: ["Do", "Re", "Me", "Fa", "Sol", "Le", "Te"],
  },
  {
    id: "open-five",
    name: "Five-pitch open route",
    conventionalName: "major pentatonic scale",
    character: "Five wider-spaced positions leave fewer close collisions.",
    steps: [2, 2, 3, 2, 3],
    solfege: ["Do", "Re", "Mi", "Sol", "La"],
  },
  {
    id: "blues-six",
    name: "Six-pitch bending route",
    conventionalName: "minor blues scale",
    character: "A close middle pair creates expressive friction and motion.",
    steps: [3, 2, 1, 1, 3, 2],
    solfege: ["Do", "Me", "Fa", "Fi", "Sol", "Te"],
  },
];

const INTERVAL_LANDMARKS = [
  { relationship: "same cycle", conventionalName: "unison", ratio: 1, label: "1:1" },
  { relationship: "closest equal-key step", conventionalName: "minor second", ratio: 16 / 15, label: "16:15" },
  { relationship: "two equal-key steps", conventionalName: "major second", ratio: 9 / 8, label: "9:8" },
  { relationship: "compact 6:5 region", conventionalName: "minor third", ratio: 6 / 5, label: "6:5" },
  { relationship: "compact 5:4 region", conventionalName: "major third", ratio: 5 / 4, label: "5:4" },
  { relationship: "4:3 region", conventionalName: "perfect fourth", ratio: 4 / 3, label: "4:3" },
  { relationship: "octave midpoint √2", conventionalName: "tritone", ratio: Math.SQRT2, label: "√2:1" },
  { relationship: "3:2 region", conventionalName: "perfect fifth", ratio: 3 / 2, label: "3:2" },
  { relationship: "8:5 region", conventionalName: "minor sixth", ratio: 8 / 5, label: "8:5" },
  { relationship: "5:3 region", conventionalName: "major sixth", ratio: 5 / 3, label: "5:3" },
  { relationship: "7:4 region", conventionalName: "minor seventh", ratio: 7 / 4, label: "7:4" },
  { relationship: "near the octave return", conventionalName: "major seventh", ratio: 15 / 8, label: "15:8" },
  { relationship: "frequency doubled", conventionalName: "octave", ratio: 2, label: "2:1" },
] as const;

function modulo(value: number, modulus: number) {
  return ((value % modulus) + modulus) % modulus;
}

export function frequencyFromMidi(note: number, tuningHz = 440) {
  if (!Number.isFinite(note) || !Number.isFinite(tuningHz) || tuningHz <= 0) {
    throw new RangeError("MIDI note and tuning must be finite, and tuning must be positive.");
  }
  return tuningHz * 2 ** ((note - 69) / 12);
}

export function scaleSemitones(scale: PianoScale) {
  const positions = [0];
  let position = 0;
  for (const step of scale.steps.slice(0, -1)) {
    position += step;
    positions.push(position);
  }
  return positions;
}

export function pitchClassFromMidi(note: number) {
  return modulo(Math.round(note), 12);
}

export function conventionalPitchName(note: number) {
  const rounded = Math.round(note);
  const octave = Math.floor(rounded / 12) - 1;
  return `${CONVENTIONAL_PITCH_CLASSES[pitchClassFromMidi(rounded)]}${octave}`;
}

export function nearestMidiForPitchClass(pitchClass: number, nearMidi = 60) {
  const target = modulo(Math.round(pitchClass), 12);
  let best = Math.round(nearMidi);
  let bestDistance = Number.POSITIVE_INFINITY;
  for (let note = Math.round(nearMidi) - 12; note <= Math.round(nearMidi) + 12; note += 1) {
    if (pitchClassFromMidi(note) !== target) continue;
    const distance = Math.abs(note - nearMidi);
    if (distance < bestDistance) {
      best = note;
      bestDistance = distance;
    }
  }
  return best;
}

export function noteContext(note: number, doMidi: number, scale: PianoScale) {
  const rounded = Math.round(note);
  const roundedDo = Math.round(doMidi);
  const rawStepsFromDo = rounded - roundedDo;
  const stepsWithinOctave = modulo(rawStepsFromDo, 12);
  const positions = scaleSemitones(scale);
  const degreeIndex = positions.indexOf(stepsWithinOctave);
  const octaveOffset = Math.floor(rawStepsFromDo / 12);
  return {
    note: rounded,
    frequencyHz: frequencyFromMidi(rounded),
    rawStepsFromDo,
    stepsWithinOctave,
    centsFromDo: rawStepsFromDo * 100,
    ratioToDo: 2 ** (rawStepsFromDo / 12),
    octaveOffset,
    inScale: degreeIndex >= 0,
    degreeIndex,
    syllable: degreeIndex >= 0 ? scale.solfege[degreeIndex] : CHROMATIC_SOLFEGE[stepsWithinOctave],
  };
}

export function intervalLandmark(semitones: number) {
  const distance = Math.abs(Math.round(semitones));
  const octaves = Math.floor(distance / 12);
  const withinOctave = distance % 12;
  const index = withinOctave === 0 && distance > 0 ? 12 : withinOctave;
  const base = INTERVAL_LANDMARKS[index];
  const extraOctaves = index === 12 ? Math.max(0, octaves - 1) : octaves;
  const landmarkRatio = base.ratio * 2 ** extraOctaves;
  const equalKeyboardRatio = 2 ** (distance / 12);
  return {
    semitones: distance,
    cents: distance * 100,
    equalKeyboardRatio,
    relationship: distance > 12 ? `${octaves} octave${octaves === 1 ? "" : "s"} + ${base.relationship}` : base.relationship,
    conventionalName: distance > 12 ? `compound ${base.conventionalName}` : base.conventionalName,
    landmarkRatio,
    landmarkLabel: extraOctaves > 0 ? `${base.label} × ${2 ** extraOctaves}` : base.label,
    errorCents: centsFromRatio(equalKeyboardRatio / landmarkRatio),
  };
}

export function pairwiseIntervals(notes: number[]) {
  const sorted = [...new Set(notes.map((note) => Math.round(note)))].sort((a, b) => a - b);
  const pairs: Array<{
    lower: number;
    upper: number;
    distance: ReturnType<typeof intervalLandmark>;
  }> = [];
  for (let lowerIndex = 0; lowerIndex < sorted.length; lowerIndex += 1) {
    for (let upperIndex = lowerIndex + 1; upperIndex < sorted.length; upperIndex += 1) {
      pairs.push({
        lower: sorted[lowerIndex],
        upper: sorted[upperIndex],
        distance: intervalLandmark(sorted[upperIndex] - sorted[lowerIndex]),
      });
    }
  }
  return pairs;
}

export function scaleCoverage(notes: number[], doMidi: number, scale: PianoScale) {
  const contexts = notes.map((note) => noteContext(note, doMidi, scale));
  const activePositions = new Set(contexts.map((context) => context.stepsWithinOctave));
  const positions = scaleSemitones(scale);
  const inScaleCount = contexts.filter((context) => context.inScale).length;
  return {
    noteCount: contexts.length,
    inScaleCount,
    fraction: contexts.length > 0 ? inScaleCount / contexts.length : 0,
    hasHome: activePositions.has(0),
    missingSyllables: positions
      .map((position, index) => ({ position, syllable: scale.solfege[index] }))
      .filter((item) => !activePositions.has(item.position))
      .map((item) => item.syllable),
  };
}

export function inferScaleCandidates(notes: number[], limit = 4): ScaleCandidate[] {
  const pitchClasses = [...new Set(notes.map((note) => pitchClassFromMidi(note)))];
  if (pitchClasses.length === 0 || limit <= 0) return [];

  const candidates: ScaleCandidate[] = [];
  for (let rootPitchClass = 0; rootPitchClass < 12; rootPitchClass += 1) {
    for (const scale of PIANO_SCALES) {
      const route = new Set(scaleSemitones(scale).map((position) => modulo(rootPitchClass + position, 12)));
      const inScaleCount = pitchClasses.filter((pitchClass) => route.has(pitchClass)).length;
      const routeCoveredCount = [...route].filter((pitchClass) => pitchClasses.includes(pitchClass)).length;
      const matchFraction = inScaleCount / pitchClasses.length;
      const coverageFraction = routeCoveredCount / route.size;
      const homePresent = pitchClasses.includes(rootPitchClass);
      const fit = Math.min(1, matchFraction * 0.72 + coverageFraction * 0.18 + (homePresent ? 0.1 : 0));
      candidates.push({
        scale,
        rootPitchClass,
        uniqueNoteCount: pitchClasses.length,
        inScaleCount,
        routeCoveredCount,
        matchFraction,
        coverageFraction,
        homePresent,
        fit,
      });
    }
  }

  return candidates
    .sort((first, second) => (
      second.fit - first.fit
      || second.matchFraction - first.matchFraction
      || second.coverageFraction - first.coverageFraction
      || Number(second.homePresent) - Number(first.homePresent)
      || PIANO_SCALES.indexOf(first.scale) - PIANO_SCALES.indexOf(second.scale)
      || first.rootPitchClass - second.rootPitchClass
    ))
    .slice(0, limit);
}

const HOME_PULL_BY_POSITION = [0, 1, 0.58, 0.38, 0.32, 0.48, 0.42, 0.75, 0.38, 0.32, 0.52, 1] as const;

export function tonalTendency(notes: number[], doMidi: number, scale: PianoScale): TonalTendency {
  const positions = [...new Set(notes.map((note) => noteContext(note, doMidi, scale).stepsWithinOctave))];
  if (positions.length === 0) {
    return { homePull: 0, homeEvidence: 0, hasHome: false, directNeighborCount: 0, fifthPresent: false };
  }

  const hasHome = positions.includes(0);
  const fifthPresent = positions.includes(7);
  const directNeighborCount = positions.filter((position) => position === 1 || position === 11).length;
  const nonHomePositions = positions.filter((position) => position !== 0);
  const rawPull = nonHomePositions.length > 0
    ? nonHomePositions.reduce((sum, position) => sum + HOME_PULL_BY_POSITION[position], 0) / nonHomePositions.length
    : 0;
  const coverage = scaleCoverage(notes, doMidi, scale);

  return {
    homePull: Math.min(1, rawPull * (hasHome ? 0.45 : 1)),
    homeEvidence: Math.min(1, (hasHome ? 0.55 : 0) + (fifthPresent ? 0.2 : 0) + coverage.fraction * 0.25),
    hasHome,
    directNeighborCount,
    fifthPresent,
  };
}

export function resolutionDirection(previousArrival: number | null, currentArrival: number) {
  if (previousArrival == null) {
    return { delta: null, label: "first field · building a baseline" };
  }
  const delta = currentArrival - previousArrival;
  if (delta >= 0.08) return { delta, label: "tending toward repose" };
  if (delta <= -0.08) return { delta, label: "moving away from repose" };
  return { delta, label: "holding a similar repose level" };
}

export function fifthStepForPitchClass(pitchClass: number) {
  const target = modulo(Math.round(pitchClass), 12);
  for (let step = 0; step < 12; step += 1) {
    if (modulo(step * 7, 12) === target) return step;
  }
  return 0;
}

export function fifthsCircle() {
  const nodes = Array.from({ length: 12 }, (_, step) => {
    const unfoldedRatio = (3 / 2) ** step;
    const octavesRemoved = Math.floor(Math.log2(unfoldedRatio));
    const foldedRatio = unfoldedRatio / 2 ** octavesRemoved;
    const pitchClass = modulo(step * 7, 12);
    const pureCents = centsFromRatio(foldedRatio);
    const keyboardCents = pitchClass * 100;
    let driftCents = pureCents - keyboardCents;
    if (driftCents > 600) driftCents -= 1200;
    if (driftCents < -600) driftCents += 1200;
    return {
      step,
      pitchClass,
      syllable: CHROMATIC_SOLFEGE[pitchClass],
      foldedRatio,
      pureCents,
      keyboardCents,
      driftCents,
    };
  });
  return {
    nodes,
    closureDriftCents: centsFromRatio((3 / 2) ** 12 / 2 ** 7),
  };
}

export function parseMidiMessage(data: ArrayLike<number>): MidiMessage {
  if (data.length < 1) return { type: "other" };
  const status = Number(data[0]);
  const command = status & 0xf0;
  const channel = status & 0x0f;
  const first = Number(data[1] ?? 0);
  const second = Number(data[2] ?? 0);
  if (command === 0x90 && second > 0) {
    return { type: "note-on", note: first, velocity: second, channel };
  }
  if (command === 0x80 || (command === 0x90 && second === 0)) {
    return { type: "note-off", note: first, channel };
  }
  if (command === 0xb0 && first === 64) {
    return { type: "sustain", down: second >= 64, channel };
  }
  return { type: "other" };
}
