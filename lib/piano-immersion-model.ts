import {
  fifthStepForPitchClass,
  inferScaleCandidates,
  intervalLandmark,
  noteContext,
  pitchClassFromMidi,
  scaleSemitones,
  type PianoScale,
  type ScaleCandidate,
} from "./piano-model.ts";
import {
  liveRhythmPhraseProfile,
  type LivePulseMirror,
  type LiveRhythmPhraseEvent,
} from "./rhythm-model.ts";

export const IMMERSION_VIEWBOX = { width: 1200, height: 700, centerX: 600, centerY: 350 } as const;
export const IMMERSION_MAX_TRAIL_EVENTS = 28;
export const IMMERSION_MAX_FIELD_NOTES = 8;
export const IMMERSION_MAX_INTERVAL_LINKS = 12;
export const IMMERSION_MAX_ANNOTATIONS = 5;
export const IMMERSION_MAX_CONTOUR_EVENTS = 12;

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

export type ImmersionAnnotationInput = {
  id: string;
  anchorX: number;
  anchorY: number;
  lines: string[];
  priority: number;
};

export type ImmersionAnnotation = ImmersionAnnotationInput & {
  x: number;
  y: number;
  textAnchor: "start" | "end";
  leaderX: number;
  leaderY: number;
  bounds: { left: number; top: number; right: number; bottom: number };
};

export type ImmersionFifthsScopeId = "cluster" | "microscope" | "phrase";

export type ImmersionFifthsScope = {
  id: ImmersionFifthsScopeId;
  label: string;
  radius: number;
  eventCount: number;
  uniquePitchClassCount: number;
  countsByFifthStep: number[];
  maximumCount: number;
  concentration: number;
  centerPitchClass: number | null;
  centerPoint: { x: number; y: number } | null;
  densityPath: string;
};

export type ImmersionRhythmLens = {
  source: "learner-pulse" | "local-ruler" | "waiting";
  rulerMs: number | null;
  pulsesPerMinute: number | null;
  clusterCount: number;
  latestGapMs: number | null;
  latestMultiple: number | null;
  nearestRatioLabel: string | null;
  deviationPercent: number | null;
  phaseLabel: string | null;
  phaseDistanceMs: number | null;
  repeatedGapShare: number | null;
};

export type ImmersionRecentPath<T extends { id: number; note: number; onsetMs: number }> = {
  events: T[];
  latestTransition: ImmersionLatestTransition<T> | null;
  completeFive: boolean;
  monophonic: boolean;
  groupCount: number;
  steps: Array<{
    semitones: number;
    landmarkLabel: string;
    sameGroup: boolean;
  }>;
  direction: "rising" | "falling" | "level" | "mixed";
  pitchSpan: number;
  directionTurns: number;
  repeatedIntervalCount: number;
  selectedRouteCount: number;
  catalogCandidates: ScaleCandidate[];
};

export type ImmersionIntervalCharacter = {
  spacingLabel: string;
  listeningPrompt: string;
};

export type ImmersionLatestTransition<T extends { id: number; note: number; onsetMs: number }> = {
  from: T;
  to: T;
  signedSemitones: number;
  absoluteSemitones: number;
  direction: "up" | "down" | "same";
  onsetGapMs: number;
  landmark: ReturnType<typeof intervalLandmark>;
  directionalFrequencyRatio: number;
  spanFrequencyRatio: number;
  octaveCount: number;
  remainderSemitones: number;
  pitchClassDistance: number;
  samePitchClass: boolean;
  context: "between-singletons" | "inside-bouquet" | "after-bouquet";
  sourceGroupAttackCount: number;
  targetGroupAttackCount: number;
  connection: {
    kind: "overlap" | "silence" | "touching" | "unknown";
    durationMs: number | null;
    pedalExtended: boolean;
    basis: "release-time" | "attack-snapshot" | "missing";
  };
  fromRole: ReturnType<typeof noteContext>;
  toRole: ReturnType<typeof noteContext>;
  fromDoPitchClassDistance: number;
  toDoPitchClassDistance: number;
  character: ImmersionIntervalCharacter;
};

const IMMERSION_INTERVAL_CHARACTERS: readonly ImmersionIntervalCharacter[] = [
  { spacingLabel: "same-key repeat", listeningPrompt: "identity · insistence · pulse" },
  { spacingLabel: "nearest-key · tight", listeningPrompt: "closeness · rub · lean" },
  { spacingLabel: "two-semitone · close", listeningPrompt: "connected motion · glide · suspension" },
  { spacingLabel: "third-sized · compact", listeningPrompt: "contained reach · rounded turn · inward color" },
  { spacingLabel: "third-sized · broader", listeningPrompt: "clear color · contrast · opening" },
  { spacingLabel: "fourth-sized · open mid-span", listeningPrompt: "space · suspension · declaration" },
  { spacingLabel: "half-octave · split", listeningPrompt: "symmetry · edge · ambiguity" },
  { spacingLabel: "fifth-sized · open mid-span", listeningPrompt: "breadth · frame · reinforcement" },
  { spacingLabel: "sixth-sized · broad", listeningPrompt: "reach · yearning · dramatic span" },
  { spacingLabel: "sixth-sized · broader", listeningPrompt: "lyric reach · warmth · openness" },
  { spacingLabel: "seventh-sized · near octave", listeningPrompt: "distance · openness · unfinished edge" },
  { spacingLabel: "octave-edge · one key short", listeningPrompt: "friction · strong lean · almost-return" },
  { spacingLabel: "octave · register echo", listeningPrompt: "identity · expansion · return in a new register" },
] as const;

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

export function immersionArcPath(pitchClassInput: number, radius: number, spanDegrees = 18) {
  const pitchClass = pitchClassFromMidi(pitchClassInput);
  const fifthStep = fifthStepForPitchClass(pitchClass);
  const centerDegrees = fifthStep * 30 - 90;
  const start = (centerDegrees - spanDegrees / 2) * Math.PI / 180;
  const end = (centerDegrees + spanDegrees / 2) * Math.PI / 180;
  const startX = IMMERSION_VIEWBOX.centerX + Math.cos(start) * radius;
  const startY = IMMERSION_VIEWBOX.centerY + Math.sin(start) * radius;
  const endX = IMMERSION_VIEWBOX.centerX + Math.cos(end) * radius;
  const endY = IMMERSION_VIEWBOX.centerY + Math.sin(end) * radius;
  return `M ${startX.toFixed(2)} ${startY.toFixed(2)} A ${radius.toFixed(2)} ${radius.toFixed(2)} 0 0 1 ${endX.toFixed(2)} ${endY.toFixed(2)}`;
}

export function immersionScaleSectors(scale: PianoScale, rootPitchClassInput: number) {
  const rootPitchClass = pitchClassFromMidi(rootPitchClassInput);
  const positions = scaleSemitones(scale);
  const degreeByPitchClass = new Map(positions.map((position, degreeIndex) => [modulo(rootPitchClass + position, 12), degreeIndex]));
  return Array.from({ length: 12 }, (_, fifthStep) => {
    const pitchClass = modulo(fifthStep * 7, 12);
    const degreeIndex = degreeByPitchClass.get(pitchClass) ?? -1;
    return { pitchClass, fifthStep, inRoute: degreeIndex >= 0, degreeIndex };
  });
}

function closedSmoothPath(points: Array<{ x: number; y: number }>) {
  if (points.length < 3) return immersionCurve(points);
  const last = points.at(-1)!;
  const first = points[0];
  let path = `M ${((last.x + first.x) / 2).toFixed(2)} ${((last.y + first.y) / 2).toFixed(2)}`;
  points.forEach((point, index) => {
    const next = points[(index + 1) % points.length];
    path += ` Q ${point.x.toFixed(2)} ${point.y.toFixed(2)} ${((point.x + next.x) / 2).toFixed(2)} ${((point.y + next.y) / 2).toFixed(2)}`;
  });
  return `${path} Z`;
}

export function immersionFifthsTide<T extends { id: number; note: number; onsetMs: number }>(
  phraseEventsInput: T[],
  microscopeEventsInput: T[],
  chordWindowMs: number,
): ImmersionFifthsScope[] {
  const phraseEvents = phraseEventsInput
    .filter((event) => Number.isFinite(event.id) && Number.isFinite(event.note) && Number.isFinite(event.onsetMs))
    .sort((first, second) => first.onsetMs - second.onsetMs || first.id - second.id);
  const microscopeEvents = microscopeEventsInput
    .filter((event) => Number.isFinite(event.id) && Number.isFinite(event.note) && Number.isFinite(event.onsetMs))
    .slice(-7);
  const latestOnset = phraseEvents.at(-1)?.onsetMs ?? 0;
  const safeWindow = clamp(Number.isFinite(chordWindowMs) ? chordWindowMs : 160, 40, 1000);
  const inputs: Array<{ id: ImmersionFifthsScopeId; label: string; radius: number; events: T[]; bulge: number }> = [
    { id: "cluster", label: `latest ${Math.round(safeWindow)} ms`, radius: 268, events: phraseEvents.filter((event) => latestOnset - event.onsetMs <= safeWindow), bulge: 12 },
    { id: "microscope", label: "last seven attacks", radius: 288, events: microscopeEvents, bulge: 11 },
    { id: "phrase", label: "retained phrase", radius: 308, events: phraseEvents, bulge: 10 },
  ];

  return inputs.map((input) => {
    const countsByFifthStep = Array.from({ length: 12 }, () => 0);
    input.events.forEach((event) => {
      countsByFifthStep[fifthStepForPitchClass(pitchClassFromMidi(event.note))] += 1;
    });
    const maximumCount = Math.max(...countsByFifthStep, 0);
    const points = countsByFifthStep.map((count, fifthStep) => {
      const strength = maximumCount > 0 ? count / maximumCount : 0;
      const radius = input.radius + strength * input.bulge;
      const angle = (fifthStep * 30 - 90) * Math.PI / 180;
      return {
        x: IMMERSION_VIEWBOX.centerX + Math.cos(angle) * radius,
        y: IMMERSION_VIEWBOX.centerY + Math.sin(angle) * radius,
      };
    });
    const vector = countsByFifthStep.reduce((result, count, fifthStep) => {
      const angle = (fifthStep * 30 - 90) * Math.PI / 180;
      return { x: result.x + Math.cos(angle) * count, y: result.y + Math.sin(angle) * count, total: result.total + count };
    }, { x: 0, y: 0, total: 0 });
    const concentration = vector.total > 0 ? Math.hypot(vector.x, vector.y) / vector.total : 0;
    const centerAngle = vector.total > 0 ? Math.atan2(vector.y, vector.x) : 0;
    const centerStep = modulo(Math.round((centerAngle * 180 / Math.PI + 90) / 30), 12);
    const centerPitchClass = vector.total > 0 && concentration >= 0.15 ? modulo(centerStep * 7, 12) : null;
    return {
      id: input.id,
      label: input.label,
      radius: input.radius,
      eventCount: input.events.length,
      uniquePitchClassCount: countsByFifthStep.filter((count) => count > 0).length,
      countsByFifthStep,
      maximumCount,
      concentration,
      centerPitchClass,
      centerPoint: centerPitchClass == null ? null : immersionDirectionPoint(centerPitchClass, input.radius),
      densityPath: closedSmoothPath(points),
    };
  });
}

export function immersionAttackKnowledge<T extends { id: number; note: number; onsetMs: number }>(eventsInput: T[], doMidi: number, scale: PianoScale) {
  const events = eventsInput.filter((event) => Number.isFinite(event.id) && Number.isFinite(event.note) && Number.isFinite(event.onsetMs));
  const latest = events.at(-1);
  if (!latest) return null;
  const previous = events.at(-2) ?? null;
  const priorSamePitchClassIndex = events.slice(0, -1).findLastIndex((event) => pitchClassFromMidi(event.note) === pitchClassFromMidi(latest.note));
  const moveSteps = previous ? Math.round(latest.note - previous.note) : null;
  return {
    event: latest,
    context: noteContext(latest.note, doMidi, scale),
    stepsFromDo: Math.round(latest.note - doMidi),
    relationToDo: intervalLandmark(latest.note - doMidi),
    previous,
    moveSteps,
    moveLandmark: moveSteps == null ? null : intervalLandmark(moveSteps),
    onsetGapMs: previous ? Math.max(0, latest.onsetMs - previous.onsetMs) : null,
    pitchClassOccurrenceCount: events.filter((event) => pitchClassFromMidi(event.note) === pitchClassFromMidi(latest.note)).length,
    attacksSincePreviousPitchClass: priorSamePitchClassIndex < 0 ? null : events.length - 2 - priorSamePitchClassIndex,
  };
}

export function immersionAttackContour<T extends { id: number; note: number; onsetMs: number }>(eventsInput: T[], chordWindowMs: number) {
  const events = eventsInput
    .filter((event) => Number.isFinite(event.id) && Number.isFinite(event.note) && Number.isFinite(event.onsetMs))
    .slice(-IMMERSION_MAX_CONTOUR_EVENTS);
  if (!events.length) return { points: [], segments: [], groupCount: 0, monophonic: false };
  const firstOnset = events[0].onsetMs;
  const lastOnset = events.at(-1)!.onsetMs;
  const timeSpan = Math.max(1, lastOnset - firstOnset);
  const minimumNote = Math.min(...events.map((event) => event.note));
  const maximumNote = Math.max(...events.map((event) => event.note));
  const pitchCenter = (minimumNote + maximumNote) / 2;
  const pitchSpan = Math.max(12, maximumNote - minimumNote);
  let groupIndex = 0;
  const safeWindow = clamp(Number.isFinite(chordWindowMs) ? chordWindowMs : 160, 40, 1000);
  let groupStartOnset = events[0].onsetMs;
  const points = events.map((event, index) => {
    if (index > 0) {
      const gapFromPrevious = event.onsetMs - events[index - 1].onsetMs;
      const spanFromGroupStart = event.onsetMs - groupStartOnset;
      if (gapFromPrevious > safeWindow || spanFromGroupStart > safeWindow * 2) {
        groupIndex += 1;
        groupStartOnset = event.onsetMs;
      }
    }
    return {
      event,
      groupIndex,
      x: 350 + (event.onsetMs - firstOnset) / timeSpan * 500,
      y: 570 - (event.note - pitchCenter) / pitchSpan * 48,
    };
  });
  const groupSizes = new Map<number, number>();
  points.forEach((point) => groupSizes.set(point.groupIndex, (groupSizes.get(point.groupIndex) ?? 0) + 1));
  const segments = points.slice(1).map((point, index) => {
    const previous = points[index];
    const steps = point.event.note - previous.event.note;
    return {
      from: previous,
      to: point,
      steps,
      gapMs: point.event.onsetMs - previous.event.onsetMs,
      sameGroup: point.groupIndex === previous.groupIndex,
      connectAsLine: (groupSizes.get(point.groupIndex) ?? 0) === 1 && (groupSizes.get(previous.groupIndex) ?? 0) === 1,
    };
  });
  return {
    points,
    segments,
    groupCount: groupSizes.size,
    monophonic: [...groupSizes.values()].every((size) => size === 1),
  };
}

/**
 * Summarizes live timing against either a learner-declared four-tap pulse or,
 * when no such pulse is active, the recent phrase's own median onset gap. The
 * fallback ruler is deliberately not promoted to a beat, meter, or accuracy
 * judgment because no intended grid has been supplied.
 */
export function immersionRhythmLens<T extends LiveRhythmPhraseEvent>(
  eventsInput: T[],
  pulseMirror: LivePulseMirror | null,
): ImmersionRhythmLens {
  if (pulseMirror?.status === "tracking" && pulseMirror.pulseMs != null) {
    const latestGap = pulseMirror.gaps.at(-1) ?? null;
    const latestPlacement = pulseMirror.placements.at(-1) ?? null;
    return {
      source: "learner-pulse",
      rulerMs: pulseMirror.pulseMs,
      pulsesPerMinute: pulseMirror.pulsesPerMinute,
      clusterCount: pulseMirror.placements.length,
      latestGapMs: latestGap?.gapMs ?? null,
      latestMultiple: latestGap?.pulseMultiple ?? null,
      nearestRatioLabel: latestGap?.ratioLabel ?? null,
      deviationPercent: latestGap?.errorPercent ?? null,
      phaseLabel: latestPlacement?.phaseLabel ?? null,
      phaseDistanceMs: latestPlacement ? latestPlacement.phaseError * pulseMirror.pulseMs : null,
      repeatedGapShare: null,
    };
  }

  const profile = liveRhythmPhraseProfile(eventsInput.slice(-16));
  const latestGap = profile?.gaps.at(-1) ?? null;
  if (!profile) {
    return {
      source: "waiting",
      rulerMs: null,
      pulsesPerMinute: null,
      clusterCount: 0,
      latestGapMs: null,
      latestMultiple: null,
      nearestRatioLabel: null,
      deviationPercent: null,
      phaseLabel: null,
      phaseDistanceMs: null,
      repeatedGapShare: null,
    };
  }
  return {
    source: "local-ruler",
    rulerMs: profile.localUnitMs,
    pulsesPerMinute: null,
    clusterCount: profile.clusterCount,
    latestGapMs: latestGap?.gapMs ?? null,
    latestMultiple: latestGap?.localMultiple ?? null,
    nearestRatioLabel: latestGap?.ratioLabel ?? null,
    deviationPercent: latestGap?.errorPercent ?? null,
    phaseLabel: null,
    phaseDistanceMs: null,
    repeatedGapShare: profile.repeatedGapShare,
  };
}

export function immersionIntervalCharacter(semitonesInput: number): ImmersionIntervalCharacter {
  const distance = Math.abs(Number.isFinite(semitonesInput) ? Math.round(semitonesInput) : 0);
  if (distance <= 12) return IMMERSION_INTERVAL_CHARACTERS[distance];
  const octaveCount = Math.floor(distance / 12);
  const remainderSemitones = distance % 12;
  if (remainderSemitones === 0) {
    return {
      spacingLabel: `${octaveCount} octaves · register echo`,
      listeningPrompt: "identity · expansion · compound register reach",
    };
  }
  const base = IMMERSION_INTERVAL_CHARACTERS[remainderSemitones];
  return {
    spacingLabel: `${octaveCount} octave${octaveCount === 1 ? "" : "s"} + ${base.spacingLabel}`,
    listeningPrompt: `compound reach · ${base.listeningPrompt}`,
  };
}

/**
 * Promotes the newest exact MIDI-key subtraction without mistaking packet order
 * inside a close-time bouquet for an isolated melody. Frequency ratios are
 * A4=440 12-TET coordinates; overlap is claimed only from note-off timing or a
 * later attack-time sounding snapshot that still contains the earlier key.
 */
export function immersionLatestTransition<T extends {
  id: number;
  note: number;
  onsetMs: number;
  releaseMs?: number | null;
  releaseReason?: "key" | "pedal" | null;
  fieldNotes?: number[];
}>(
  eventsInput: T[],
  chordWindowMs: number,
  doMidi: number,
  scale: PianoScale,
): ImmersionLatestTransition<T> | null {
  const events = eventsInput
    .filter((event) => Number.isFinite(event.id) && Number.isFinite(event.note) && Number.isFinite(event.onsetMs))
    .sort((first, second) => first.onsetMs - second.onsetMs || first.id - second.id);
  if (events.length < 2) return null;

  const contour = immersionAttackContour(events, chordWindowMs);
  const fromPoint = contour.points.at(-2);
  const toPoint = contour.points.at(-1);
  const segment = contour.segments.at(-1);
  if (!fromPoint || !toPoint || !segment) return null;

  const from = fromPoint.event as T;
  const to = toPoint.event as T;
  const groupSizes = contour.points.reduce((sizes, point) => {
    sizes.set(point.groupIndex, (sizes.get(point.groupIndex) ?? 0) + 1);
    return sizes;
  }, new Map<number, number>());
  const sourceGroupAttackCount = groupSizes.get(fromPoint.groupIndex) ?? 1;
  const targetGroupAttackCount = groupSizes.get(toPoint.groupIndex) ?? 1;
  const context = segment.sameGroup
    ? "inside-bouquet"
    : sourceGroupAttackCount > 1 || targetGroupAttackCount > 1
      ? "after-bouquet"
      : "between-singletons";

  const signedSemitones = safeMidi(to.note) - safeMidi(from.note);
  const absoluteSemitones = Math.abs(signedSemitones);
  const direction = signedSemitones > 0 ? "up" : signedSemitones < 0 ? "down" : "same";
  const fromPitchClass = pitchClassFromMidi(from.note);
  const toPitchClass = pitchClassFromMidi(to.note);
  const forwardPitchClassDistance = modulo(toPitchClass - fromPitchClass, 12);
  const pitchClassDistance = Math.min(forwardPitchClassDistance, 12 - forwardPitchClassDistance);
  const doPitchClass = pitchClassFromMidi(doMidi);
  const pitchClassDistanceToDo = (note: number) => {
    const forward = modulo(pitchClassFromMidi(note) - doPitchClass, 12);
    return Math.min(forward, 12 - forward);
  };

  const knownRelease = Number.isFinite(from.releaseMs) ? Number(from.releaseMs) : null;
  const snapshotOverlap = knownRelease == null
    && from.note !== to.note
    && Array.isArray(to.fieldNotes)
    && to.fieldNotes.some((note) => safeMidi(note) === safeMidi(from.note));
  const connection: ImmersionLatestTransition<T>["connection"] = knownRelease == null
    ? snapshotOverlap
      ? { kind: "overlap", durationMs: null, pedalExtended: false, basis: "attack-snapshot" }
      : { kind: "unknown", durationMs: null, pedalExtended: false, basis: "missing" }
    : knownRelease > to.onsetMs
      ? { kind: "overlap", durationMs: knownRelease - to.onsetMs, pedalExtended: from.releaseReason === "pedal", basis: "release-time" }
      : knownRelease === to.onsetMs
        ? { kind: "touching", durationMs: 0, pedalExtended: false, basis: "release-time" }
        : { kind: "silence", durationMs: to.onsetMs - knownRelease, pedalExtended: false, basis: "release-time" };

  return {
    from,
    to,
    signedSemitones,
    absoluteSemitones,
    direction,
    onsetGapMs: Math.max(0, to.onsetMs - from.onsetMs),
    landmark: intervalLandmark(signedSemitones),
    directionalFrequencyRatio: 2 ** (signedSemitones / 12),
    spanFrequencyRatio: 2 ** (absoluteSemitones / 12),
    octaveCount: Math.floor(absoluteSemitones / 12),
    remainderSemitones: absoluteSemitones % 12,
    pitchClassDistance,
    samePitchClass: fromPitchClass === toPitchClass,
    context,
    sourceGroupAttackCount,
    targetGroupAttackCount,
    connection,
    fromRole: noteContext(from.note, doMidi, scale),
    toRole: noteContext(to.note, doMidi, scale),
    fromDoPitchClassDistance: pitchClassDistanceToDo(from.note),
    toDoPitchClassDistance: pitchClassDistanceToDo(to.note),
    character: immersionIntervalCharacter(signedSemitones),
  };
}

/**
 * Keeps a five-attack window inspectable without silently treating close-time
 * chord bouquets as one isolated melody. Catalog results are compatibility
 * matches over pitch classes, not claims about origin, key, or harmony.
 */
export function immersionRecentPath<T extends { id: number; note: number; onsetMs: number }>(
  eventsInput: T[],
  chordWindowMs: number,
  doMidi: number,
  scale: PianoScale,
): ImmersionRecentPath<T> {
  const events = eventsInput
    .filter((event) => Number.isFinite(event.id) && Number.isFinite(event.note) && Number.isFinite(event.onsetMs))
    .slice(-5);
  const contour = immersionAttackContour(events, chordWindowMs);
  const steps = events.slice(1).map((event, index) => {
    const semitones = event.note - events[index].note;
    const segment = contour.segments[index];
    return {
      semitones,
      landmarkLabel: intervalLandmark(semitones).landmarkLabel,
      sameGroup: segment?.sameGroup ?? false,
    };
  });
  const nonzeroDirections = steps.map((step) => Math.sign(step.semitones)).filter((direction) => direction !== 0);
  const direction = nonzeroDirections.length === 0
    ? "level"
    : nonzeroDirections.every((value) => value > 0)
      ? "rising"
      : nonzeroDirections.every((value) => value < 0)
        ? "falling"
        : "mixed";
  const directionTurns = nonzeroDirections.slice(1).filter((directionValue, index) => directionValue !== nonzeroDirections[index]).length;
  const intervalSizes = steps.map((step) => Math.abs(step.semitones));
  const repeatedIntervalCount = intervalSizes.filter((size, index) => intervalSizes.some((other, otherIndex) => otherIndex !== index && other === size)).length;
  const selectedRouteCount = events.filter((event) => noteContext(event.note, doMidi, scale).inScale).length;
  const notes = events.map((event) => event.note);

  return {
    events,
    latestTransition: immersionLatestTransition(eventsInput, chordWindowMs, doMidi, scale),
    completeFive: events.length === 5,
    monophonic: contour.monophonic,
    groupCount: contour.groupCount,
    steps,
    direction,
    pitchSpan: notes.length ? Math.max(...notes) - Math.min(...notes) : 0,
    directionTurns,
    repeatedIntervalCount,
    selectedRouteCount,
    catalogCandidates: new Set(notes.map(pitchClassFromMidi)).size >= 3 ? inferScaleCandidates(notes, 2) : [],
  };
}

export function immersionChordShape(notesInput: number[]) {
  const notes = [...new Set(notesInput.filter(Number.isFinite).map(safeMidi))].sort((first, second) => first - second);
  if (notes.length < 2) return null;
  const bass = notes[0];
  const bassPitchClass = pitchClassFromMidi(bass);
  const bassRelativePositions = [...new Set(notes.map((note) => modulo(pitchClassFromMidi(note) - bassPitchClass, 12)))].sort((first, second) => first - second);
  const cyclicGaps = bassRelativePositions.map((position, index) => {
    const next = bassRelativePositions[(index + 1) % bassRelativePositions.length] + (index === bassRelativePositions.length - 1 ? 12 : 0);
    return next - position;
  });
  return {
    bass,
    bassPitchClass,
    noteCount: notes.length,
    pitchClassCount: bassRelativePositions.length,
    bassRelativePositions,
    cyclicGaps,
    physicalGaps: notes.slice(1).map((note, index) => note - notes[index]),
    span: notes.at(-1)! - notes[0],
    doublingCount: notes.length - bassRelativePositions.length,
  };
}

export function immersionCloudHull(notesInput: number[], doMidi: number, padding = 30) {
  const notes = [...new Set(notesInput.filter(Number.isFinite).map(safeMidi))].sort((first, second) => first - second);
  const boundaryNotes = [...notes.reduce((groups, note) => {
    const pitchClass = pitchClassFromMidi(note);
    const group = groups.get(pitchClass) ?? [];
    group.push(note);
    groups.set(pitchClass, group);
    return groups;
  }, new Map<number, number[]>()).values()].flatMap((group) => group.length <= 2 ? group : [group[0], group.at(-1)!]);
  const points = boundaryNotes.map((note) => immersionPitchPoint(note, doMidi));
  if (!points.length) return null;
  const centerX = points.reduce((sum, point) => sum + point.x, 0) / points.length;
  const centerY = points.reduce((sum, point) => sum + point.y, 0) / points.length;
  if (points.length === 1) {
    const point = points[0];
    const radius = padding + 12;
    return {
      centerX,
      centerY,
      pointCount: notes.length,
      path: `M ${(point.x - radius).toFixed(2)} ${point.y.toFixed(2)} A ${radius} ${radius} 0 1 0 ${(point.x + radius).toFixed(2)} ${point.y.toFixed(2)} A ${radius} ${radius} 0 1 0 ${(point.x - radius).toFixed(2)} ${point.y.toFixed(2)} Z`,
    };
  }
  if (points.length === 2) {
    const [first, second] = points;
    const length = Math.max(1, Math.hypot(second.x - first.x, second.y - first.y));
    const normalX = -(second.y - first.y) / length * padding;
    const normalY = (second.x - first.x) / length * padding;
    return {
      centerX,
      centerY,
      pointCount: notes.length,
      path: `M ${(first.x + normalX).toFixed(2)} ${(first.y + normalY).toFixed(2)} L ${(second.x + normalX).toFixed(2)} ${(second.y + normalY).toFixed(2)} A ${padding} ${padding} 0 0 1 ${(second.x - normalX).toFixed(2)} ${(second.y - normalY).toFixed(2)} L ${(first.x - normalX).toFixed(2)} ${(first.y - normalY).toFixed(2)} A ${padding} ${padding} 0 0 1 ${(first.x + normalX).toFixed(2)} ${(first.y + normalY).toFixed(2)} Z`,
    };
  }
  const expanded = points.map((point, index) => {
    const distance = Math.hypot(point.x - centerX, point.y - centerY);
    const angle = distance > 1 ? Math.atan2(point.y - centerY, point.x - centerX) : index / points.length * Math.PI * 2;
    return { x: point.x + Math.cos(angle) * padding, y: point.y + Math.sin(angle) * padding };
  }).sort((first, second) => Math.atan2(first.y - centerY, first.x - centerX) - Math.atan2(second.y - centerY, second.x - centerX));
  return { centerX, centerY, pointCount: notes.length, path: closedSmoothPath(expanded) };
}

function boxesOverlap(first: ImmersionAnnotation["bounds"], second: ImmersionAnnotation["bounds"]) {
  return !(first.right + 8 < second.left || second.right + 8 < first.left || first.bottom + 6 < second.top || second.bottom + 6 < first.top);
}

function wrapAnnotationLines(lines: string[], maximumCharacters = 40) {
  return lines.flatMap((line) => {
    if (line.length <= maximumCharacters) return [line];
    const words = line.split(/\s+/).filter(Boolean);
    const wrapped: string[] = [];
    let current = "";
    words.forEach((word) => {
      if (!current) {
        current = word;
        return;
      }
      if (`${current} ${word}`.length <= maximumCharacters) current += ` ${word}`;
      else {
        wrapped.push(current);
        current = word;
      }
    });
    if (current) wrapped.push(current);
    return wrapped.length ? wrapped : [line.slice(0, maximumCharacters)];
  });
}

export function planImmersionAnnotations(
  inputs: ImmersionAnnotationInput[],
  limit = IMMERSION_MAX_ANNOTATIONS,
  reservedBounds: ImmersionAnnotation["bounds"][] = [],
) {
  const placed: ImmersionAnnotation[] = [];
  const safeLimit = clamp(Number.isFinite(limit) ? Math.floor(limit) : IMMERSION_MAX_ANNOTATIONS, 0, IMMERSION_MAX_ANNOTATIONS);
  const sorted = inputs
    .filter((input) => input.lines.length > 0 && input.lines.every((line) => typeof line === "string"))
    .sort((first, second) => second.priority - first.priority || first.id.localeCompare(second.id));

  for (const input of sorted) {
    if (placed.length >= safeLimit) break;
    const wrappedLines = wrapAnnotationLines(input.lines);
    const dx = input.anchorX - IMMERSION_VIEWBOX.centerX;
    const dy = input.anchorY - IMMERSION_VIEWBOX.centerY;
    const length = Math.max(1, Math.hypot(dx, dy));
    const radial = { x: dx / length, y: dy / length };
    const tangent = { x: -radial.y, y: radial.x };
    const offsets = [
      { x: radial.x * 58, y: radial.y * 58 },
      { x: tangent.x * 70, y: tangent.y * 70 },
      { x: -tangent.x * 70, y: -tangent.y * 70 },
      { x: -radial.x * 62, y: -radial.y * 62 },
      { x: 0, y: -72 },
    ];
    const width = Math.min(292, Math.max(...wrappedLines.map((line) => line.length), 8) * 6.4 + 16);
    const height = wrappedLines.length * 15 + 6;
    let chosen: ImmersionAnnotation | null = null;
    for (const offset of offsets) {
      const rawX = clamp(input.anchorX + offset.x, 318, 882);
      const rawY = clamp(input.anchorY + offset.y, 66, 640 - height);
      const textAnchor: ImmersionAnnotation["textAnchor"] = rawX >= input.anchorX ? "start" : "end";
      const bounds = {
        left: textAnchor === "start" ? rawX : rawX - width,
        right: textAnchor === "start" ? rawX + width : rawX,
        top: rawY - 12,
        bottom: rawY - 12 + height,
      };
      if (bounds.left < 300 || bounds.right > 900
        || reservedBounds.some((reserved) => boxesOverlap(bounds, reserved))
        || placed.some((annotation) => boxesOverlap(bounds, annotation.bounds))) continue;
      chosen = {
        ...input,
        lines: wrappedLines,
        x: rawX,
        y: rawY,
        textAnchor,
        leaderX: rawX + (textAnchor === "start" ? -6 : 6),
        leaderY: rawY - 4,
        bounds,
      };
      break;
    }
    if (chosen) placed.push(chosen);
  }
  return placed;
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

export function immersionIntervalField(notesInput: number[], doMidi: number, primaryNoteInput: number | null = null) {
  const unique = [...new Set(notesInput.filter(Number.isFinite).map(safeMidi))].sort((first, second) => first - second);
  let visibleNotes = unique.length <= IMMERSION_MAX_FIELD_NOTES
    ? unique
    : Array.from({ length: IMMERSION_MAX_FIELD_NOTES }, (_, index) => unique[Math.round(index * (unique.length - 1) / (IMMERSION_MAX_FIELD_NOTES - 1))]);
  const primaryNote = primaryNoteInput == null || !Number.isFinite(primaryNoteInput) ? null : safeMidi(primaryNoteInput);
  if (primaryNote != null && unique.includes(primaryNote) && !visibleNotes.includes(primaryNote) && visibleNotes.length > 2) {
    const replacementIndex = visibleNotes.slice(1, -1)
      .map((note, index) => ({ index: index + 1, distance: Math.abs(note - primaryNote) }))
      .sort((first, second) => first.distance - second.distance || first.index - second.index)[0].index;
    visibleNotes = visibleNotes.map((note, index) => index === replacementIndex ? primaryNote : note).sort((first, second) => first - second);
  }
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
  if (primaryNote != null && visibleNotes.includes(primaryNote) && visibleNotes.length > 1) {
    const nearest = visibleNotes
      .filter((note) => note !== primaryNote)
      .sort((first, second) => Math.abs(first - primaryNote) - Math.abs(second - primaryNote) || first - second)[0];
    const primaryLower = Math.min(primaryNote, nearest);
    const primaryUpper = Math.max(primaryNote, nearest);
    allPairs.sort((first, second) => Number(!(first.lower === primaryLower && first.upper === primaryUpper)) - Number(!(second.lower === primaryLower && second.upper === primaryUpper)));
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
