import {
  frequencyFromMidi,
  intervalLandmark,
  pitchClassFromMidi,
} from "./piano-model.ts";
import {
  pianoPartialInteraction,
  pianoSoundVoice,
  type PianoSoundModelId,
} from "./piano-sound-model.ts";
import { sonorityPerceptionModel } from "./sonority-model.ts";

export const SCALE_QUALITY_DEFAULT_SPLIT_MIDI = 59;
export const SCALE_QUALITY_MIN_SPLIT_MIDI = 36;
export const SCALE_QUALITY_MAX_SPLIT_MIDI = 71;
export const SCALE_QUALITY_MAX_INPUT_EVENTS = 256;
export const SCALE_QUALITY_MAX_UPPER_EVENTS = 32;
export const SCALE_QUALITY_MAX_TONIC_PULSES = 12;

export type ScaleQualityEvent = {
  id: number;
  note: number;
  onsetMs: number;
  source: "midi" | "screen";
  fieldNotes?: number[];
  midiFieldNotes?: number[];
};

export type ScaleQualityScale = {
  id: string;
  name: string;
  shortName: string;
  offsets: readonly number[];
  solfege: readonly string[];
  character: string;
};

export const SCALE_QUALITY_CATALOG = [
  { id: "major", name: "Major / Ionian", shortName: "major", offsets: [0, 2, 4, 5, 7, 9, 11], solfege: ["Do", "Re", "Mi", "Fa", "Sol", "La", "Ti"], character: "Unequal gaps place one-semitone gates at 3→4 and 7→1." },
  { id: "natural-minor", name: "Natural minor / Aeolian", shortName: "natural minor", offsets: [0, 2, 3, 5, 7, 8, 10], solfege: ["Do", "Re", "Me", "Fa", "Sol", "Le", "Te"], character: "Lowered 3, 6, and 7 reshape the upper route while the tonic remains fixed." },
  { id: "dorian", name: "Dorian", shortName: "Dorian", offsets: [0, 2, 3, 5, 7, 9, 10], solfege: ["Do", "Re", "Me", "Fa", "Sol", "La", "Te"], character: "A minor third with a natural sixth separates this route from natural minor." },
  { id: "mixolydian", name: "Mixolydian", shortName: "Mixolydian", offsets: [0, 2, 4, 5, 7, 9, 10], solfege: ["Do", "Re", "Mi", "Fa", "Sol", "La", "Te"], character: "A major third and lowered seventh weaken the one-key leading-tone gate to tonic." },
  { id: "lydian", name: "Lydian", shortName: "Lydian", offsets: [0, 2, 4, 6, 7, 9, 11], solfege: ["Do", "Re", "Mi", "Fi", "Sol", "La", "Ti"], character: "The raised fourth makes a close 6→7 pair around the tritone and fifth." },
  { id: "phrygian", name: "Phrygian", shortName: "Phrygian", offsets: [0, 1, 3, 5, 7, 8, 10], solfege: ["Do", "Ra", "Me", "Fa", "Sol", "Le", "Te"], character: "A one-semitone step immediately above tonic is the route's clearest landmark." },
  { id: "locrian", name: "Locrian", shortName: "Locrian", offsets: [0, 1, 3, 5, 6, 8, 10], solfege: ["Do", "Ra", "Me", "Fa", "Se", "Le", "Te"], character: "The lowered second and fifth leave no perfect-fifth scale member above tonic." },
  { id: "harmonic-minor", name: "Harmonic minor", shortName: "harmonic minor", offsets: [0, 2, 3, 5, 7, 8, 11], solfege: ["Do", "Re", "Me", "Fa", "Sol", "Le", "Ti"], character: "A raised seventh creates a three-semitone gap from lowered sixth to leading tone." },
  { id: "melodic-minor", name: "Melodic minor · ascending", shortName: "melodic minor", offsets: [0, 2, 3, 5, 7, 9, 11], solfege: ["Do", "Re", "Me", "Fa", "Sol", "La", "Ti"], character: "A minor third coexists with raised sixth and seventh on the ascending reference route." },
  { id: "major-pentatonic", name: "Major pentatonic", shortName: "major pentatonic", offsets: [0, 2, 4, 7, 9], solfege: ["Do", "Re", "Mi", "Sol", "La"], character: "Five wider-spaced positions omit the major route's two one-semitone gates." },
  { id: "minor-pentatonic", name: "Minor pentatonic", shortName: "minor pentatonic", offsets: [0, 3, 5, 7, 10], solfege: ["Do", "Me", "Fa", "Sol", "Te"], character: "Five positions frame the minor third and lowered seventh without adjacent scale steps." },
  { id: "minor-blues", name: "Minor blues", shortName: "minor blues", offsets: [0, 3, 5, 6, 7, 10], solfege: ["Do", "Me", "Fa", "Fi", "Sol", "Te"], character: "The added tritone creates two adjacent one-semitone moves between fourth and fifth." },
  { id: "whole-tone", name: "Whole-tone", shortName: "whole-tone", offsets: [0, 2, 4, 6, 8, 10], solfege: ["Do", "Re", "Mi", "Fi", "Si", "Li"], character: "Every scale gap is two semitones, so gap shape alone supplies no privileged tonic." },
  { id: "octatonic", name: "Octatonic · half–whole", shortName: "octatonic", offsets: [0, 1, 3, 4, 6, 7, 9, 10], solfege: ["Do", "Ra", "Me", "Mi", "Fi", "Sol", "La", "Te"], character: "Alternating one- and two-semitone gaps repeat symmetrically around the octave." },
] as const satisfies readonly ScaleQualityScale[];

export type ScaleQualityCandidate = {
  scale: ScaleQualityScale;
  evidenceOffsets: number[];
  matchedOffsets: number[];
  outsideOffsets: number[];
  missingOffsets: number[];
  distinctEvidenceCount: number;
  matchFraction: number;
  coverageFraction: number;
  completeCollection: boolean;
};

export type ScaleQualityPerformance = {
  tonicEvent: ScaleQualityEvent | null;
  tonicPitchClass: number | null;
  tonicFieldPitchClasses: number[];
  tonicFieldAmbiguous: boolean;
  tonicPulses: ScaleQualityEvent[];
  upperEvents: ScaleQualityEvent[];
  ignoredPreTonicUpperCount: number;
  inputEventCount: number;
  truncatedInput: boolean;
};

function modulo(value: number, divisor = 12) {
  return ((value % divisor) + divisor) % divisor;
}

function validEvent(event: ScaleQualityEvent) {
  return Number.isInteger(event.id)
    && Number.isInteger(event.note)
    && event.note >= 0
    && event.note <= 127
    && Number.isFinite(event.onsetMs)
    && event.onsetMs >= 0;
}

function validateSplit(splitMidi: number) {
  if (!Number.isInteger(splitMidi) || splitMidi < SCALE_QUALITY_MIN_SPLIT_MIDI || splitMidi > SCALE_QUALITY_MAX_SPLIT_MIDI) {
    throw new RangeError(`Scale-quality split must be an integer MIDI key from ${SCALE_QUALITY_MIN_SPLIT_MIDI} through ${SCALE_QUALITY_MAX_SPLIT_MIDI}.`);
  }
}

/**
 * Divides a bounded MIDI history into a low tonic lane and an upper evidence
 * lane. The split key belongs to the bass lane. Same-pitch-class bass pulses
 * preserve the current epoch; a different bass pitch class starts a new one.
 */
export function splitScaleQualityPerformance(
  input: readonly ScaleQualityEvent[],
  splitMidi = SCALE_QUALITY_DEFAULT_SPLIT_MIDI,
): ScaleQualityPerformance {
  validateSplit(splitMidi);
  const valid = input.filter((event) => event.source === "midi" && validEvent(event));
  const bounded = valid.slice(-SCALE_QUALITY_MAX_INPUT_EVENTS);
  const sorted = bounded.map((event, sourceIndex) => ({ event, sourceIndex })).sort((first, second) => (
    first.event.onsetMs - second.event.onsetMs
    || Number(first.event.note > splitMidi) - Number(second.event.note > splitMidi)
    || first.event.id - second.event.id
    || first.sourceIndex - second.sourceIndex
  ));
  const latestBassIndex = sorted.findLastIndex(({ event }) => event.note <= splitMidi);
  if (latestBassIndex < 0) {
    return {
      tonicEvent: null,
      tonicPitchClass: null,
      tonicFieldPitchClasses: [],
      tonicFieldAmbiguous: false,
      tonicPulses: [],
      upperEvents: [],
      ignoredPreTonicUpperCount: sorted.filter(({ event }) => event.note > splitMidi).length,
      inputEventCount: bounded.length,
      truncatedInput: valid.length > bounded.length,
    };
  }

  const tonicEvent = sorted[latestBassIndex].event;
  const tonicPitchClass = pitchClassFromMidi(tonicEvent.note);
  const sameOnsetBassNotes = sorted
    .filter(({ event }) => event.onsetMs === tonicEvent.onsetMs && event.note <= splitMidi)
    .map(({ event }) => event.note);
  // New captures retain the exact raw-MIDI field that existed after this attack.
  // The same-onset fallback keeps older sessions deterministic without treating
  // screen-latched notes as hardware evidence.
  const capturedBassNotes = tonicEvent.midiFieldNotes?.filter((note) => (
    Number.isInteger(note) && note >= 0 && note <= splitMidi
  )) ?? sameOnsetBassNotes;
  const tonicFieldPitchClasses = [...new Set([
    tonicEvent.note,
    ...capturedBassNotes,
  ].map(pitchClassFromMidi))].sort((first, second) => first - second);
  let epochStartIndex = latestBassIndex;
  for (let index = latestBassIndex - 1; index >= 0; index -= 1) {
    const event = sorted[index].event;
    if (event.note > splitMidi) continue;
    if (pitchClassFromMidi(event.note) !== tonicPitchClass) break;
    epochStartIndex = index;
  }
  const epoch = sorted.slice(epochStartIndex).map(({ event }) => event);
  const tonicPulses = epoch
    .filter((event) => event.note <= splitMidi && pitchClassFromMidi(event.note) === tonicPitchClass)
    .slice(-SCALE_QUALITY_MAX_TONIC_PULSES);
  const upperEvents = epoch
    .filter((event) => event.note > splitMidi)
    .slice(-SCALE_QUALITY_MAX_UPPER_EVENTS);
  const ignoredPreTonicUpperCount = sorted.slice(0, epochStartIndex).filter(({ event }) => event.note > splitMidi).length;
  return {
    tonicEvent,
    tonicPitchClass,
    tonicFieldPitchClasses,
    tonicFieldAmbiguous: tonicFieldPitchClasses.length > 1,
    tonicPulses,
    upperEvents,
    ignoredPreTonicUpperCount,
    inputEventCount: bounded.length,
    truncatedInput: valid.length > bounded.length,
  };
}

export function rankScaleQualityCandidates(
  upperNotes: readonly number[],
  tonicMidi: number,
  limit = 5,
): ScaleQualityCandidate[] {
  if (!Number.isInteger(tonicMidi) || tonicMidi < 0 || tonicMidi > 127) throw new RangeError("Scale-quality tonic must be a MIDI key from 0 through 127.");
  if (!Number.isInteger(limit) || limit < 0) throw new RangeError("Scale-quality candidate limit must be a non-negative integer.");
  const evidenceOffsets = [...new Set(upperNotes
    .filter((note) => Number.isInteger(note) && note >= 0 && note <= 127)
    .map((note) => modulo(note - tonicMidi)))]
    .sort((first, second) => first - second);
  if (!evidenceOffsets.length || limit === 0) return [];
  return SCALE_QUALITY_CATALOG.map((scale) => {
    const route = new Set<number>(scale.offsets);
    const matchedOffsets = evidenceOffsets.filter((offset) => route.has(offset));
    const outsideOffsets = evidenceOffsets.filter((offset) => !route.has(offset));
    const missingOffsets = scale.offsets.filter((offset) => !evidenceOffsets.includes(offset));
    return {
      scale,
      evidenceOffsets,
      matchedOffsets,
      outsideOffsets,
      missingOffsets: [...missingOffsets],
      distinctEvidenceCount: evidenceOffsets.length,
      matchFraction: matchedOffsets.length / evidenceOffsets.length,
      coverageFraction: matchedOffsets.length / scale.offsets.length,
      completeCollection: outsideOffsets.length === 0 && missingOffsets.length === 0,
    };
  }).sort((first, second) => (
    first.outsideOffsets.length - second.outsideOffsets.length
    || second.matchFraction - first.matchFraction
    || second.coverageFraction - first.coverageFraction
    || SCALE_QUALITY_CATALOG.findIndex((scale) => scale.id === first.scale.id) - SCALE_QUALITY_CATALOG.findIndex((scale) => scale.id === second.scale.id)
  )).slice(0, limit);
}

const OFFSET_ROLES = [
  "tonic class · octave copies reinforce the selected home position",
  "one-key upper neighbor · a downward semitone to tonic is physically available",
  "whole-step upper neighbor · stepwise motion can continue in either direction",
  "minor-third color · often chord-defining rather than directly home-seeking",
  "major-third color · often chord-defining rather than directly home-seeking",
  "fourth position · often heard against the third or fifth in tonal styles",
  "tritone position · six keys from tonic in either direction, so context must choose a path",
  "fifth anchor · a low-order interval landmark that often reinforces the frame",
  "minor-sixth color · its role changes strongly with scale and harmony",
  "major-sixth color · often connective, chordal, or modal depending on context",
  "whole-step-below tonic · an upward whole step is available without a leading semitone",
  "one-key below tonic · an upward semitone tendency is common in tonal styles, not compulsory",
] as const;

function signed(value: number) {
  return value > 0 ? `+${value}` : String(value);
}

function circularMove(from: number, to: number) {
  const up = modulo(to - from);
  const down = up - 12;
  if (Math.abs(up) < Math.abs(down)) return up;
  if (Math.abs(down) < Math.abs(up)) return down;
  return up;
}

export function scaleQualityNoteProfile(
  note: number,
  tonicMidi: number,
  scale: ScaleQualityScale | null,
  previousUpperNote: number | null = null,
) {
  if (!Number.isInteger(note) || note < 0 || note > 127 || !Number.isInteger(tonicMidi) || tonicMidi < 0 || tonicMidi > 127) {
    throw new RangeError("Scale-quality note profile requires valid MIDI keys.");
  }
  const physicalSemitones = note - tonicMidi;
  const foldedOffset = modulo(physicalSemitones);
  const degreeIndex = scale?.offsets.indexOf(foldedOffset) ?? -1;
  const inScale = scale != null && degreeIndex >= 0;
  const nearestScaleMoves = !scale ? [] : inScale ? [0] : scale.offsets
    .map((offset) => circularMove(foldedOffset, offset))
    .sort((first, second) => Math.abs(first) - Math.abs(second) || first - second)
    .filter((move, index, moves) => index === 0 || Math.abs(move) === Math.abs(moves[0]));
  const incomingGap = inScale && scale
    ? modulo(foldedOffset - scale.offsets[modulo(degreeIndex - 1, scale.offsets.length)]) || 12
    : null;
  const outgoingGap = inScale && scale
    ? modulo(scale.offsets[(degreeIndex + 1) % scale.offsets.length] - foldedOffset) || 12
    : null;
  const upwardToTonic = modulo(-foldedOffset);
  const downwardToTonic = upwardToTonic - 12;
  const shortestHomeMoves = [upwardToTonic, downwardToTonic]
    .filter((move, index, moves) => index === 0 || move !== moves[0])
    .sort((first, second) => Math.abs(first) - Math.abs(second) || first - second)
    .filter((move, index, moves) => index === 0 || Math.abs(move) === Math.abs(moves[0]));
  const landmark = intervalLandmark(physicalSemitones);
  return {
    note,
    tonicMidi,
    physicalSemitones,
    foldedOffset,
    centsFromTonic: physicalSemitones * 100,
    frequencyRatio: 2 ** (physicalSemitones / 12),
    intervalName: landmark.conventionalName,
    intervalLandmark: landmark.landmarkLabel,
    inScale,
    degreeIndex,
    degreeNumber: inScale ? degreeIndex + 1 : null,
    solfege: inScale && scale ? scale.solfege[degreeIndex] : null,
    incomingGap,
    outgoingGap,
    nearestScaleMoves,
    shortestHomeMoves,
    roleCue: OFFSET_ROLES[foldedOffset],
    moveFromPreviousUpper: previousUpperNote == null ? null : note - previousUpperNote,
    signedPhysicalSemitones: signed(physicalSemitones),
  };
}

/** Models a pair only when the MIDI evidence says both exact keys overlapped. */
export function scaleQualityOverlapProfile(
  tonicMidi: number,
  upperMidi: number,
  soundingNotes: readonly number[],
  soundModelId: PianoSoundModelId,
) {
  const sounding = new Set(soundingNotes.filter((note) => Number.isInteger(note) && note >= 0 && note <= 127));
  if (!sounding.has(tonicMidi) || !sounding.has(upperMidi)) return null;
  const tonicHz = frequencyFromMidi(tonicMidi);
  const upperHz = frequencyFromMidi(upperMidi);
  const interaction = pianoPartialInteraction(tonicHz, upperHz, soundModelId);
  const perception = sonorityPerceptionModel([
    pianoSoundVoice(tonicHz, 0.72, soundModelId),
    pianoSoundVoice(upperHz, 0.72, soundModelId),
  ]);
  return {
    tonicHz,
    upperHz,
    alignedPartialCount: interaction.alignedPairs.length,
    interactionPairCount: interaction.interactionPairs.length,
    overlap: interaction.overlap,
    roughness: interaction.roughness,
    harmonicity: perception.harmonicity,
    ambiguity: perception.ambiguity,
    fusion: perception.fusion,
    openness: perception.openness,
    brightness: perception.brightness,
  };
}

export function scaleQualityEvidenceStatus(candidates: readonly ScaleQualityCandidate[]) {
  const leading = candidates[0] ?? null;
  if (!leading) return { id: "gathering" as const, label: "Play upper notes to build a collection." };
  if (leading.distinctEvidenceCount < 3) return { id: "gathering" as const, label: `${leading.distinctEvidenceCount} distinct upper position${leading.distinctEvidenceCount === 1 ? "" : "s"} · evidence is still thin.` };
  if (leading.completeCollection) return { id: "complete" as const, label: `The played pitch classes exactly cover ${leading.scale.name}.` };
  const compatible = candidates.filter((candidate) => candidate.outsideOffsets.length === 0);
  if (compatible.length > 1) return { id: "ambiguous" as const, label: `${compatible[0].scale.name} and ${compatible[1].scale.name}${compatible.length > 2 ? ` plus ${compatible.length - 2} more` : ""} still contain every heard position; keep listening.` };
  if (leading.outsideOffsets.length) return { id: "contradicted" as const, label: `Every catalog frame has at least one outside position; treat the ranking as comparison, not detection.` };
  return { id: "suggestive" as const, label: `${leading.scale.name} currently fits every played pitch class, with ${leading.matchedOffsets.length} of ${leading.scale.offsets.length} positions covered.` };
}
