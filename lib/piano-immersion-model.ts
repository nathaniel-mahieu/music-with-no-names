import {
  fifthStepForPitchClass,
  intervalLandmark,
  pitchClassFromMidi,
} from "./piano-model.ts";

export const IMMERSION_VIEWBOX = { width: 1200, height: 700, centerX: 600, centerY: 350 } as const;
export const IMMERSION_MAX_TRAIL_EVENTS = 28;
export const IMMERSION_MAX_FIELD_NOTES = 8;
export const IMMERSION_MAX_INTERVAL_LINKS = 12;

export type ImmersionPitchPoint = {
  note: number;
  pitchClass: number;
  fifthStep: number;
  relativeFifthStep: number;
  angleDegrees: number;
  radius: number;
  x: number;
  y: number;
  hue: number;
};

export type ImmersionIntervalLink = {
  lower: number;
  upper: number;
  lowerPoint: ImmersionPitchPoint;
  upperPoint: ImmersionPitchPoint;
  semitones: number;
  landmarkLabel: string;
  relationship: string;
  referenceKind: "integer-ratio" | "geometric-midpoint";
  errorCents: number;
};

function modulo(value: number, divisor: number) {
  return ((value % divisor) + divisor) % divisor;
}

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(maximum, Math.max(minimum, value));
}

function safeMidi(value: number) {
  return clamp(Number.isFinite(value) ? Math.round(value) : 60, 0, 127);
}

export function immersionSameNoteField(first: number[], second: number[]) {
  const firstSet = [...new Set(first.filter(Number.isFinite).map(safeMidi))].sort((a, b) => a - b);
  const secondSet = [...new Set(second.filter(Number.isFinite).map(safeMidi))].sort((a, b) => a - b);
  return firstSet.length === secondSet.length && firstSet.every((note, index) => note === secondSet[index]);
}

/**
 * The sky keeps one fixed circle-of-fifths orientation so a changing frame does
 * not move performed notes. Radius is an equal-key/log-frequency register
 * coordinate; every unclamped octave therefore adds the same radial distance.
 * Hue is relational and can change when the learner moves Do.
 */
export function immersionPitchPoint(noteInput: number, doMidiInput: number): ImmersionPitchPoint {
  const note = safeMidi(noteInput);
  const doMidi = safeMidi(doMidiInput);
  const pitchClass = pitchClassFromMidi(note);
  const fifthStep = fifthStepForPitchClass(pitchClass);
  const doFifthStep = fifthStepForPitchClass(pitchClassFromMidi(doMidi));
  const relativeFifthStep = modulo(fifthStep - doFifthStep, 12);
  const angleDegrees = fifthStep * 30 - 90;
  const angle = angleDegrees * Math.PI / 180;
  const radius = clamp(72 + (note - 21) * 2.75, 42, 326);
  const hue = modulo(42 + relativeFifthStep * 30, 360);
  return {
    note,
    pitchClass,
    fifthStep,
    relativeFifthStep,
    angleDegrees,
    radius,
    x: IMMERSION_VIEWBOX.centerX + Math.cos(angle) * radius,
    y: IMMERSION_VIEWBOX.centerY + Math.sin(angle) * radius,
    hue,
  };
}

export function immersionDirectionPoint(pitchClassInput: number, radius: number) {
  const pitchClass = pitchClassFromMidi(pitchClassInput);
  const fifthStep = fifthStepForPitchClass(pitchClass);
  const angleDegrees = fifthStep * 30 - 90;
  const angle = angleDegrees * Math.PI / 180;
  return {
    pitchClass,
    fifthStep,
    angleDegrees,
    x: IMMERSION_VIEWBOX.centerX + Math.cos(angle) * radius,
    y: IMMERSION_VIEWBOX.centerY + Math.sin(angle) * radius,
  };
}

export function immersionRoleColor(point: ImmersionPitchPoint, inScale: boolean) {
  return `hsl(${point.hue} ${inScale ? 82 : 42}% ${inScale ? 66 : 62}%)`;
}

export function immersionTrail<T extends { id: number; note: number }>(events: T[], doMidi: number) {
  return events
    .filter((event) => Number.isFinite(event.id) && Number.isFinite(event.note))
    .slice(-IMMERSION_MAX_TRAIL_EVENTS)
    .map((event, index, selected) => ({
      event,
      point: immersionPitchPoint(event.note, doMidi),
      recency: selected.length <= 1 ? 1 : index / (selected.length - 1),
    }));
}

export function immersionPhraseNewness<T extends { note: number }>(events: T[]) {
  const valid = events.filter((event) => Number.isFinite(event.note));
  const latest = valid.at(-1);
  const previous = valid.at(-2);
  if (!latest || !previous) return 0;
  const interval = Math.abs(Math.round(latest.note) - Math.round(previous.note));
  const appearedEarlier = valid
    .slice(0, -1)
    .some((event) => pitchClassFromMidi(event.note) === pitchClassFromMidi(latest.note));
  return appearedEarlier
    ? Math.min(0.35, interval / 36)
    : Math.min(1, 0.72 + interval / 48);
}

export function immersionReleaseProvenSilence<T extends {
  id: number;
  note: number;
  onsetMs: number;
  releaseMs: number | null;
  fieldNotes: number[];
}>(events: T[], current: T) {
  const earlierEvents = events.filter((candidate) => candidate.id !== current.id
    && (candidate.onsetMs < current.onsetMs || (candidate.onsetMs === current.onsetMs && candidate.id < current.id)));
  const knownReleaseTimes = earlierEvents
    .map((candidate) => candidate.releaseMs)
    .filter((release): release is number => release != null);
  const onlyCurrentAttackSounds = current.fieldNotes.length > 0
    && current.fieldNotes.every((note) => note === current.note);
  const proven = earlierEvents.length > 0
    && knownReleaseTimes.length === earlierEvents.length
    && knownReleaseTimes.every((release) => release < current.onsetMs)
    && onlyCurrentAttackSounds;
  return {
    proven,
    durationMs: proven ? current.onsetMs - Math.max(...knownReleaseTimes) : null,
  };
}

export function immersionCurve(points: Array<{ x: number; y: number }>) {
  if (!points.length) return "";
  if (points.length === 1) return `M ${points[0].x.toFixed(2)} ${points[0].y.toFixed(2)}`;
  if (points.length === 2) return `M ${points[0].x.toFixed(2)} ${points[0].y.toFixed(2)} L ${points[1].x.toFixed(2)} ${points[1].y.toFixed(2)}`;
  let path = `M ${points[0].x.toFixed(2)} ${points[0].y.toFixed(2)}`;
  for (let index = 1; index < points.length - 1; index += 1) {
    const current = points[index];
    const next = points[index + 1];
    const middleX = (current.x + next.x) / 2;
    const middleY = (current.y + next.y) / 2;
    path += ` Q ${current.x.toFixed(2)} ${current.y.toFixed(2)} ${middleX.toFixed(2)} ${middleY.toFixed(2)}`;
  }
  const final = points.at(-1)!;
  path += ` T ${final.x.toFixed(2)} ${final.y.toFixed(2)}`;
  return path;
}

export function immersionIntervalField(notesInput: number[], doMidi: number) {
  const unique = [...new Set(notesInput.filter(Number.isFinite).map(safeMidi))].sort((first, second) => first - second);
  const visibleNotes = unique.length <= IMMERSION_MAX_FIELD_NOTES
    ? unique
    : Array.from({ length: IMMERSION_MAX_FIELD_NOTES }, (_, index) => unique[Math.round(index * (unique.length - 1) / (IMMERSION_MAX_FIELD_NOTES - 1))]);
  const allPairs: ImmersionIntervalLink[] = [];
  for (let lowerIndex = 0; lowerIndex < visibleNotes.length; lowerIndex += 1) {
    for (let upperIndex = lowerIndex + 1; upperIndex < visibleNotes.length; upperIndex += 1) {
      const lower = visibleNotes[lowerIndex];
      const upper = visibleNotes[upperIndex];
      const landmark = intervalLandmark(upper - lower);
      allPairs.push({
        lower,
        upper,
        lowerPoint: immersionPitchPoint(lower, doMidi),
        upperPoint: immersionPitchPoint(upper, doMidi),
        semitones: landmark.semitones,
        landmarkLabel: landmark.landmarkLabel,
        relationship: landmark.relationship,
        referenceKind: landmark.landmarkLabel.includes("√") ? "geometric-midpoint" : "integer-ratio",
        errorCents: landmark.errorCents,
      });
    }
  }
  const links = allPairs.length <= IMMERSION_MAX_INTERVAL_LINKS
    ? allPairs
    : Array.from({ length: IMMERSION_MAX_INTERVAL_LINKS }, (_, index) => allPairs[Math.round(index * (allPairs.length - 1) / (IMMERSION_MAX_INTERVAL_LINKS - 1))]);
  const totalPairCount = unique.length < 2 ? 0 : unique.length * (unique.length - 1) / 2;
  return {
    notes: visibleNotes,
    links,
    totalPairCount,
    analyzedPairCount: allPairs.length,
    omittedNoteCount: Math.max(0, unique.length - visibleNotes.length),
    omittedLinkCount: Math.max(0, totalPairCount - links.length),
  };
}

export function immersionCloudBounds(notesInput: number[], doMidi: number) {
  const points = [...new Set(notesInput.filter(Number.isFinite).map(safeMidi))]
    .map((note) => immersionPitchPoint(note, doMidi));
  if (!points.length) return null;
  const centerX = points.reduce((sum, point) => sum + point.x, 0) / points.length;
  const centerY = points.reduce((sum, point) => sum + point.y, 0) / points.length;
  return {
    centerX,
    centerY,
    radiusX: Math.min(285, Math.max(42, ...points.map((point) => Math.abs(point.x - centerX) + 34))),
    radiusY: Math.min(240, Math.max(36, ...points.map((point) => Math.abs(point.y - centerY) + 28))),
    pointCount: points.length,
  };
}
