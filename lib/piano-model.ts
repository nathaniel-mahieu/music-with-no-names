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

export type RollingNoteEvent = {
  note: number;
};

export type TimedNoteAttack = RollingNoteEvent & {
  id: number;
  onsetMs: number;
  fieldNotes: number[];
};

export type ChordGesture<T extends TimedNoteAttack = TimedNoteAttack> = {
  id: string;
  attacks: T[];
  attackedNotes: number[];
  inheritedNotes: number[];
  soundingNotesAtClose: number[];
  startMs: number;
  endMs: number;
  spreadMs: number;
  temporalCompactness: number;
  kind: "together" | "rolled";
};

export type ChordTransitionEvidence = {
  commonPitchClassCount: number;
  pitchSetNovelty: number;
  voiceMotion: number;
  rootTravel: number;
  rootTravelSteps: number | null;
};

export type ScaleFrameSnapshot = {
  eventIndex: number;
  leading: ScaleCandidate | null;
  runnersUp: ScaleCandidate[];
  stable: ScaleCandidate | null;
  changed: boolean;
  distinctPitchClasses: number;
  evidenceLabel: "no evidence" | "little evidence" | "several compatible frames" | "distinct within this catalog";
};

export type ChordTemplate = {
  id: string;
  name: string;
  symbol: string;
  offsets: readonly number[];
};

export type ChordCandidate = {
  rootPitchClass: number;
  template: ChordTemplate;
  exact: boolean;
  score: number;
  commonPitchClasses: number[];
  missingPitchClasses: number[];
  extraPitchClasses: number[];
  bassPitchClass: number;
  inversion: number;
};

export type NearbyChord = {
  rootPitchClass: number;
  pitchClasses: number[];
  degreeIndex: number;
  syllable: string;
  commonPitchClasses: number[];
  changedPitchClasses: number;
  instruction: string;
  candidate: ChordCandidate | null;
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

export const CHORD_TEMPLATES: ChordTemplate[] = [
  { id: "major", name: "major triad", symbol: "", offsets: [0, 4, 7] },
  { id: "minor", name: "minor triad", symbol: "m", offsets: [0, 3, 7] },
  { id: "diminished", name: "diminished triad", symbol: "°", offsets: [0, 3, 6] },
  { id: "augmented", name: "augmented triad", symbol: "+", offsets: [0, 4, 8] },
  { id: "sus2", name: "suspended second", symbol: "sus2", offsets: [0, 2, 7] },
  { id: "sus4", name: "suspended fourth", symbol: "sus4", offsets: [0, 5, 7] },
  { id: "major6", name: "major sixth", symbol: "6", offsets: [0, 4, 7, 9] },
  { id: "minor6", name: "minor sixth", symbol: "m6", offsets: [0, 3, 7, 9] },
  { id: "dominant7", name: "dominant seventh", symbol: "7", offsets: [0, 4, 7, 10] },
  { id: "major7", name: "major seventh", symbol: "maj7", offsets: [0, 4, 7, 11] },
  { id: "minor7", name: "minor seventh", symbol: "m7", offsets: [0, 3, 7, 10] },
  { id: "half-diminished7", name: "half-diminished seventh", symbol: "ø7", offsets: [0, 3, 6, 10] },
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

function sameScaleCandidate(first: ScaleCandidate | null, second: ScaleCandidate | null) {
  return Boolean(first && second && first.rootPitchClass === second.rootPitchClass && first.scale.id === second.scale.id);
}

export function scaleFrameTimeline(notes: number[]): ScaleFrameSnapshot[] {
  let stable: ScaleCandidate | null = null;
  let pendingKey = "";
  let pendingWins = 0;

  return notes.map((_, eventIndex) => {
    const prefix = notes.slice(0, eventIndex + 1);
    const candidates = inferScaleCandidates(prefix, 3);
    const leading = candidates[0] ?? null;
    const distinctPitchClasses = new Set(prefix.map((note) => pitchClassFromMidi(note))).size;
    const gap = leading && candidates[1] ? leading.fit - candidates[1].fit : 0;
    let changed = false;

    if (leading && distinctPitchClasses >= 4) {
      const leadingKey = `${leading.rootPitchClass}:${leading.scale.id}`;
      if (sameScaleCandidate(stable, leading)) {
        pendingKey = "";
        pendingWins = 0;
      } else {
        if (pendingKey === leadingKey) pendingWins += 1;
        else {
          pendingKey = leadingKey;
          pendingWins = 1;
        }
        if (stable == null || gap >= 0.08 || pendingWins >= 2) {
          stable = leading;
          changed = true;
          pendingKey = "";
          pendingWins = 0;
        }
      }
    }

    const evidenceLabel = distinctPitchClasses === 0
      ? "no evidence"
      : distinctPitchClasses < 4
        ? "little evidence"
        : gap >= 0.08
          ? "distinct within this catalog"
          : "several compatible frames";

    return {
      eventIndex,
      leading,
      runnersUp: candidates.slice(1),
      stable,
      changed,
      distinctPitchClasses,
      evidenceLabel,
    };
  });
}

export function pushRollingNoteEvent<T extends RollingNoteEvent>(events: T[], event: T, limit = 7) {
  if (!Number.isInteger(limit) || limit <= 0) return [];
  return [...events, event].slice(-limit);
}

function finalizeChordGesture<T extends TimedNoteAttack>(attacks: T[], maximumSpanMs: number): ChordGesture<T> | null {
  const distinctPitchClasses = new Set(attacks.map((attack) => pitchClassFromMidi(attack.note)));
  if (attacks.length < 2 || distinctPitchClasses.size < 2) return null;
  const first = attacks[0];
  const last = attacks.at(-1)!;
  const attackedNotes = attacks.map((attack) => Math.round(attack.note));
  const attackedSet = new Set(attackedNotes);
  const soundingNotesAtClose = [...new Set(last.fieldNotes.map(Math.round))].sort((a, b) => a - b);
  const spreadMs = Math.max(0, last.onsetMs - first.onsetMs);
  return {
    id: `chord-${first.id}-${last.id}`,
    attacks: [...attacks],
    attackedNotes,
    inheritedNotes: soundingNotesAtClose.filter((note) => !attackedSet.has(note)),
    soundingNotesAtClose,
    startMs: first.onsetMs,
    endMs: last.onsetMs,
    spreadMs,
    temporalCompactness: Math.max(0, 1 - spreadMs / maximumSpanMs),
    kind: spreadMs <= 90 ? "together" : "rolled",
  };
}

export function groupChordGestures<T extends TimedNoteAttack>(
  events: T[],
  gapMs: number,
  maximumSpanMs = gapMs * 2,
): ChordGesture<T>[] {
  if (!Number.isFinite(gapMs) || gapMs <= 0 || !Number.isFinite(maximumSpanMs) || maximumSpanMs < gapMs) return [];
  const gestures: ChordGesture<T>[] = [];
  let cluster: T[] = [];

  const closeCluster = () => {
    const gesture = finalizeChordGesture(cluster, maximumSpanMs);
    if (gesture) gestures.push(gesture);
    cluster = [];
  };

  events.forEach((event) => {
    if (!cluster.length) {
      cluster = [event];
      return;
    }
    const first = cluster[0];
    const previous = cluster.at(-1)!;
    const joinsPrevious = event.onsetMs - previous.onsetMs <= gapMs;
    const staysWithinMaximum = event.onsetMs - first.onsetMs <= maximumSpanMs;
    if (joinsPrevious && staysWithinMaximum) cluster.push(event);
    else {
      closeCluster();
      cluster = [event];
    }
  });
  closeCluster();
  return gestures;
}

function nearestVoiceDistance(source: number[], target: number[]) {
  if (!source.length || !target.length) return 0;
  return source.reduce((sum, note) => sum + Math.min(...target.map((targetNote) => Math.abs(note - targetNote))), 0) / source.length;
}

export function chordTransitionEvidence(
  previousNotes: number[] | null,
  currentNotes: number[],
  previousRootPitchClass: number | null = null,
  currentRootPitchClass: number | null = null,
): ChordTransitionEvidence {
  if (!previousNotes?.length || !currentNotes.length) {
    return { commonPitchClassCount: 0, pitchSetNovelty: 0, voiceMotion: 0, rootTravel: 0, rootTravelSteps: null };
  }
  const previousPitchClasses = pitchClassSet(previousNotes);
  const currentPitchClasses = pitchClassSet(currentNotes);
  const commonPitchClasses = currentPitchClasses.filter((pitchClass) => previousPitchClasses.includes(pitchClass));
  const union = new Set([...previousPitchClasses, ...currentPitchClasses]);
  const bidirectionalMotion = (
    nearestVoiceDistance(previousNotes, currentNotes)
    + nearestVoiceDistance(currentNotes, previousNotes)
  ) / 2;
  let rootTravelSteps: number | null = null;
  if (previousRootPitchClass != null && currentRootPitchClass != null) {
    const previousStep = fifthStepForPitchClass(previousRootPitchClass);
    const currentStep = fifthStepForPitchClass(currentRootPitchClass);
    const forward = modulo(currentStep - previousStep, 12);
    rootTravelSteps = Math.min(forward, 12 - forward);
  }
  return {
    commonPitchClassCount: commonPitchClasses.length,
    pitchSetNovelty: union.size ? 1 - commonPitchClasses.length / union.size : 0,
    voiceMotion: Math.min(1, bidirectionalMotion / 12),
    rootTravel: rootTravelSteps == null ? 0 : rootTravelSteps / 6,
    rootTravelSteps,
  };
}

export function voiceChordNear(pitchClasses: number[], sourceNotes: number[] = [], centerMidi = 60) {
  if (!Number.isFinite(centerMidi)) return [];
  const targets = [...new Set(pitchClasses.filter(Number.isFinite).map((pitchClass) => modulo(Math.round(pitchClass), 12)))];
  if (!targets.length || targets.length > 6) return [];
  const center = Math.round(centerMidi);
  const choices = targets.map((pitchClass) => {
    const notes: number[] = [];
    for (let note = center - 24; note <= center + 24; note += 1) {
      if (pitchClassFromMidi(note) === pitchClass) notes.push(note);
    }
    return notes;
  });
  let combinations: number[][] = [[]];
  choices.forEach((notes) => {
    combinations = combinations.flatMap((combination) => notes.map((note) => [...combination, note]));
  });
  const source = sourceNotes.filter(Number.isFinite).map(Math.round).sort((first, second) => first - second);
  const sourceCenter = source.length ? source.reduce((sum, note) => sum + note, 0) / source.length : center;
  const score = (combination: number[]) => {
    const voiced = [...combination].sort((first, second) => first - second);
    const voicedCenter = voiced.reduce((sum, note) => sum + note, 0) / voiced.length;
    const span = voiced.at(-1)! - voiced[0];
    const motion = source.length
      ? (nearestVoiceDistance(source, voiced) + nearestVoiceDistance(voiced, source)) / 2
      : 0;
    const rootInBassPenalty = pitchClassFromMidi(voiced[0]) === targets[0] ? 0 : 0.7;
    return motion * 4
      + Math.abs(voicedCenter - sourceCenter) * 0.15
      + Math.max(0, span - 12) * 0.08
      + (source.length ? 0 : rootInBassPenalty);
  };
  const best = combinations.sort((first, second) => score(first) - score(second))[0];
  return best ? [...best].sort((first, second) => first - second) : [];
}

function pitchClassSet(notes: number[]) {
  return [...new Set(notes.map((note) => pitchClassFromMidi(note)))].sort((first, second) => first - second);
}

export function identifyChordCandidates(notes: number[], limit = 3): ChordCandidate[] {
  if (notes.length < 2 || limit <= 0) return [];
  const active = pitchClassSet(notes);
  const activeSet = new Set(active);
  const bassPitchClass = pitchClassFromMidi(Math.min(...notes));
  const candidates: ChordCandidate[] = [];

  for (let rootPitchClass = 0; rootPitchClass < 12; rootPitchClass += 1) {
    for (const template of CHORD_TEMPLATES) {
      const target = template.offsets.map((offset) => modulo(rootPitchClass + offset, 12)).sort((first, second) => first - second);
      const targetSet = new Set(target);
      const commonPitchClasses = active.filter((pitchClass) => targetSet.has(pitchClass));
      const missingPitchClasses = target.filter((pitchClass) => !activeSet.has(pitchClass));
      const extraPitchClasses = active.filter((pitchClass) => !targetSet.has(pitchClass));
      const templateCoverage = commonPitchClasses.length / target.length;
      const activePurity = commonPitchClasses.length / active.length;
      const exact = missingPitchClasses.length === 0 && extraPitchClasses.length === 0;
      const inversion = target.indexOf(bassPitchClass);
      candidates.push({
        rootPitchClass,
        template,
        exact,
        score: Math.min(1, templateCoverage * 0.6 + activePurity * 0.4),
        commonPitchClasses,
        missingPitchClasses,
        extraPitchClasses,
        bassPitchClass,
        inversion: inversion < 0 ? -1 : inversion,
      });
    }
  }

  return candidates
    .sort((first, second) => (
      Number(second.exact) - Number(first.exact)
      || second.score - first.score
      || first.missingPitchClasses.length - second.missingPitchClasses.length
      || first.extraPitchClasses.length - second.extraPitchClasses.length
      || Number(second.rootPitchClass === bassPitchClass) - Number(first.rootPitchClass === bassPitchClass)
      || first.rootPitchClass - second.rootPitchClass
    ))
    .slice(0, limit);
}

function chordMoveInstruction(current: number[], target: number[], common: number[]) {
  const currentOnly = current.filter((pitchClass) => !common.includes(pitchClass));
  const targetOnly = target.filter((pitchClass) => !common.includes(pitchClass));
  if (currentOnly.length === 1 && targetOnly.length === 1) {
    const upward = modulo(targetOnly[0] - currentOnly[0], 12);
    const downward = modulo(currentOnly[0] - targetOnly[0], 12);
    const direction = upward <= downward ? "up" : "down";
    const distance = Math.min(upward, downward);
    return `keep ${common.length} · move ${CONVENTIONAL_PITCH_CLASSES[currentOnly[0]]} ${direction} ${distance} key${distance === 1 ? "" : "s"}`;
  }
  if (currentOnly.length === 0 && targetOnly.length === 1) {
    return `keep ${common.length} · add ${CONVENTIONAL_PITCH_CLASSES[targetOnly[0]]}`;
  }
  return `keep ${common.length} · change ${Math.max(currentOnly.length, targetOnly.length)} tone${Math.max(currentOnly.length, targetOnly.length) === 1 ? "" : "s"}`;
}

export function nearbyScaleChords(notes: number[], doMidi: number, scale: PianoScale, limit = 3): NearbyChord[] {
  if (limit <= 0) return [];
  const current = pitchClassSet(notes);
  const positions = scaleSemitones(scale);
  const doPitchClass = pitchClassFromMidi(doMidi);
  const results = positions.map((position, degreeIndex) => {
    const degreePositions = [degreeIndex, degreeIndex + 2, degreeIndex + 4].map((index) => positions[index % positions.length] + (index >= positions.length ? 12 : 0));
    const pitchClasses = [...new Set(degreePositions.map((degreePosition) => modulo(doPitchClass + degreePosition, 12)))].sort((first, second) => first - second);
    const commonPitchClasses = current.filter((pitchClass) => pitchClasses.includes(pitchClass));
    const changedPitchClasses = current.filter((pitchClass) => !pitchClasses.includes(pitchClass)).length
      + pitchClasses.filter((pitchClass) => !current.includes(pitchClass)).length;
    const rootPitchClass = modulo(doPitchClass + position, 12);
    const candidate = identifyChordCandidates(pitchClasses, 1)[0] ?? null;
    return {
      rootPitchClass,
      pitchClasses,
      degreeIndex,
      syllable: scale.solfege[degreeIndex],
      commonPitchClasses,
      changedPitchClasses,
      instruction: chordMoveInstruction(current, pitchClasses, commonPitchClasses),
      candidate,
    };
  });

  return results
    .filter((result) => result.changedPitchClasses > 0 || current.length === 0)
    .sort((first, second) => (
      first.changedPitchClasses - second.changedPitchClasses
      || second.commonPitchClasses.length - first.commonPitchClasses.length
      || first.degreeIndex - second.degreeIndex
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
