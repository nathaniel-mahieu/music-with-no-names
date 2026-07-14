export type MusicalEvent = {
  id: string;
  onsetSeconds: number;
  durationSeconds: number;
  ratioToReference: number;
  amplitude: number;
  timbre: "pure" | "harmonic" | "noise";
  gesture: string;
};

export type EventSelection = {
  startSeconds: number;
  endSeconds: number;
};

export type LiveJourneyPhraseEvent = {
  id: number;
  note: number;
  onsetMs: number;
  velocity?: number;
  releaseMs?: number | null;
};

export type LiveJourneyExpectationState = "opening" | "open" | "known" | "new";

export type LiveJourneyStep = {
  index: number;
  eventIds: number[];
  onsetMs: number;
  relativeOnset: number;
  attackCount: number;
  pitchOffsets: number[];
  bassMove: number | null;
  gapMs: number | null;
  gapMultiple: number | null;
  gestureKey: string;
  priorOccurrences: number;
  expectationState: LiveJourneyExpectationState;
  actualProbability: number | null;
  alternativeCount: number;
  alternatives: { gesture: string; probability: number }[];
};

export type LiveJourneyPhraseProfile = {
  attackCount: number;
  groupCount: number;
  elapsedMs: number;
  localUnitMs: number;
  returningGestureCount: number;
  learnedStepCount: number;
  newContinuationCount: number;
  steps: LiveJourneyStep[];
  nextAlternatives: { gesture: string; probability: number }[];
};

function assertFiniteNonNegative(value: number, label: string) {
  if (!Number.isFinite(value) || value < 0) {
    throw new RangeError(`${label} must be finite and non-negative.`);
  }
}

export function eventsInSelection(
  events: MusicalEvent[],
  selection: EventSelection,
): MusicalEvent[] {
  assertFiniteNonNegative(selection.startSeconds, "Selection start");
  assertFiniteNonNegative(selection.endSeconds, "Selection end");
  if (selection.endSeconds <= selection.startSeconds) {
    throw new RangeError("Selection end must be after its start.");
  }

  return events.filter(
    (event) =>
      event.onsetSeconds < selection.endSeconds &&
      event.onsetSeconds + event.durationSeconds > selection.startSeconds,
  );
}

export function transformedRecurrence(
  first: MusicalEvent[],
  second: MusicalEvent[],
): number {
  if (first.length === 0 || first.length !== second.length) return 0;
  const firstOrigin = first[0].onsetSeconds;
  const secondOrigin = second[0].onsetSeconds;
  const firstRatioOrigin = first[0].ratioToReference;
  const secondRatioOrigin = second[0].ratioToReference;
  let distance = 0;

  for (let index = 0; index < first.length; index += 1) {
    const timeA = first[index].onsetSeconds - firstOrigin;
    const timeB = second[index].onsetSeconds - secondOrigin;
    const ratioA = Math.log2(first[index].ratioToReference / firstRatioOrigin);
    const ratioB = Math.log2(second[index].ratioToReference / secondRatioOrigin);
    distance += Math.abs(timeA - timeB) * 0.35;
    distance += Math.abs(ratioA - ratioB) * 2.2;
    distance += Math.abs(first[index].durationSeconds - second[index].durationSeconds) * 0.25;
  }

  return Math.exp(-distance / first.length);
}

export function localGesturePrediction(events: MusicalEvent[]) {
  const transitions = new Map<string, Map<string, number>>();
  for (let index = 0; index < events.length - 1; index += 1) {
    const current = events[index].gesture;
    const next = events[index + 1].gesture;
    const row = transitions.get(current) ?? new Map<string, number>();
    row.set(next, (row.get(next) ?? 0) + 1);
    transitions.set(current, row);
  }

  return (gesture: string) => {
    const row = transitions.get(gesture);
    if (!row) return [];
    const total = [...row.values()].reduce((sum, count) => sum + count, 0);
    return [...row.entries()]
      .map(([nextGesture, count]) => ({
        nextGesture,
        probability: count / total,
      }))
      .sort((a, b) => b.probability - a.probability);
  };
}

export function sequenceSurprise(probability: number): number {
  if (!Number.isFinite(probability) || probability <= 0 || probability > 1) {
    throw new RangeError("Probability must be greater than zero and at most one.");
  }
  return probability === 1 ? 0 : -Math.log2(probability);
}

export function eventSimilarity(first: MusicalEvent, second: MusicalEvent) {
  const ratioDistance = Math.abs(Math.log2(first.ratioToReference / second.ratioToReference));
  const durationDistance = Math.abs(first.durationSeconds - second.durationSeconds) / Math.max(0.05, first.durationSeconds, second.durationSeconds);
  const gesturePenalty = first.gesture === second.gesture ? 0 : 0.42;
  const timbrePenalty = first.timbre === second.timbre ? 0 : 0.18;
  return Math.exp(-(ratioDistance * 2.4 + durationDistance * 0.7 + gesturePenalty + timbrePenalty));
}

export function selfSimilarityMatrix(events: MusicalEvent[]) {
  return events.map((first) => events.map((second) => eventSimilarity(first, second)));
}

function distributionEntropy(probabilities: number[]) {
  return probabilities.reduce((sum, probability) => sum - (probability > 0 ? probability * Math.log2(probability) : 0), 0);
}

export type PredictionTracePoint = {
  eventId: string;
  previousGesture: string | null;
  actualGesture: string;
  probability: number | null;
  uncertaintyBits: number;
  surpriseBits: number | null;
  alternatives: { gesture: string; probability: number }[];
};

export type GestureTransitionCorpus = Record<string, Record<string, number>>;

export function predictionTraceWithPrior(events: MusicalEvent[], prior: GestureTransitionCorpus = {}): PredictionTracePoint[] {
  const transitions = new Map<string, Map<string, number>>();
  Object.entries(prior).forEach(([from, row]) => {
    const counts = new Map<string, number>();
    Object.entries(row).forEach(([to, count]) => {
      if (Number.isFinite(count) && count > 0) counts.set(to, count);
    });
    if (counts.size) transitions.set(from, counts);
  });
  return events.map((event, index) => {
    const previous = index > 0 ? events[index - 1].gesture : null;
    const row = previous ? transitions.get(previous) : undefined;
    const total = row ? [...row.values()].reduce((sum, count) => sum + count, 0) : 0;
    const alternatives = row && total > 0
      ? [...row.entries()].map(([gesture, count]) => ({ gesture, probability: count / total })).sort((a, b) => b.probability - a.probability)
      : [];
    const probability = row && total > 0 ? (row.get(event.gesture) ?? 0) / total : null;
    const point: PredictionTracePoint = {
      eventId: event.id,
      previousGesture: previous,
      actualGesture: event.gesture,
      probability,
      uncertaintyBits: distributionEntropy(alternatives.map((alternative) => alternative.probability)),
      surpriseBits: probability === null ? null : probability === 0 ? 6 : sequenceSurprise(probability),
      alternatives,
    };
    if (index > 0) {
      const from = events[index - 1].gesture;
      const to = event.gesture;
      const transitionRow = transitions.get(from) ?? new Map<string, number>();
      transitionRow.set(to, (transitionRow.get(to) ?? 0) + 1);
      transitions.set(from, transitionRow);
    }
    return point;
  });
}

export function incrementalPredictionTrace(events: MusicalEvent[]): PredictionTracePoint[] {
  return predictionTraceWithPrior(events);
}

function median(values: number[]) {
  const ordered = [...values].sort((first, second) => first - second);
  const middle = Math.floor(ordered.length / 2);
  return ordered.length % 2 ? ordered[middle] : (ordered[middle - 1] + ordered[middle]) / 2;
}

function groupLiveJourneyOnsets<T extends LiveJourneyPhraseEvent>(events: T[], windowMs: number) {
  const groups: T[][] = [];
  events.forEach((event) => {
    const current = groups.at(-1);
    if (current && event.onsetMs - current[0].onsetMs <= windowMs) current.push(event);
    else groups.push([event]);
  });
  return groups;
}

/**
 * Projects a retained MIDI phrase into transposition-invariant field shapes,
 * bass motion, and phrase-relative timing. Prediction counts are learned only
 * from earlier grouped events inside this phrase; they do not model a listener.
 */
export function liveJourneyPhraseProfile(
  events: LiveJourneyPhraseEvent[],
  clusterWindowMs = 70,
): LiveJourneyPhraseProfile | null {
  const usable = events
    .filter((event) => Number.isInteger(event.id)
      && Number.isInteger(event.note)
      && event.note >= 0
      && event.note <= 127
      && Number.isFinite(event.onsetMs)
      && event.onsetMs >= 0
      && (event.velocity == null || (Number.isInteger(event.velocity) && event.velocity >= 0 && event.velocity <= 127))
      && (event.releaseMs == null || (Number.isFinite(event.releaseMs) && event.releaseMs >= event.onsetMs)))
    .sort((first, second) => first.onsetMs - second.onsetMs || first.id - second.id);
  if (usable.length < 4) return null;
  const groups = groupLiveJourneyOnsets(usable, Math.max(0, clusterWindowMs));
  if (groups.length < 4) return null;

  const gaps = groups.slice(1).map((group, index) => group[0].onsetMs - groups[index][0].onsetMs);
  const localUnitMs = median(gaps);
  const elapsedMs = groups.at(-1)![0].onsetMs - groups[0][0].onsetMs;
  if (!Number.isFinite(localUnitMs) || localUnitMs <= 0 || elapsedMs <= 0) return null;
  const firstBass = Math.min(...groups[0].map((event) => event.note));
  let priorBass: number | null = null;
  const gestureEvents = groups.map((group, index): MusicalEvent => {
    const notes = [...new Set(group.map((event) => event.note))].sort((first, second) => first - second);
    const bass = notes[0];
    const offsets = notes.map((note) => note - bass);
    const bassMove = priorBass == null ? null : bass - priorBass;
    priorBass = bass;
    const releases = group.map((event) => event.releaseMs).filter((release): release is number => release != null);
    const durationSeconds = releases.length === group.length
      ? Math.max(0.05, (Math.max(...releases) - group[0].onsetMs) / 1_000)
      : 0.1;
    return {
      id: `live-${index + 1}`,
      onsetSeconds: (group[0].onsetMs - groups[0][0].onsetMs) / 1_000,
      durationSeconds,
      ratioToReference: 2 ** ((bass - firstBass) / 12),
      amplitude: group.reduce((sum, event) => sum + (event.velocity ?? 64), 0) / group.length / 127,
      timbre: "harmonic",
      gesture: `${offsets.join(".")}|${bassMove == null ? "start" : bassMove}`,
    };
  });
  const trace = incrementalPredictionTrace(gestureEvents);
  const seenGestures = new Map<string, number>();
  const steps = groups.map((group, index): LiveJourneyStep => {
    const notes = [...new Set(group.map((event) => event.note))].sort((first, second) => first - second);
    const bass = notes[0];
    const priorNotes = index > 0 ? [...new Set(groups[index - 1].map((event) => event.note))].sort((first, second) => first - second) : [];
    const gestureKey = gestureEvents[index].gesture;
    const priorOccurrences = seenGestures.get(gestureKey) ?? 0;
    seenGestures.set(gestureKey, priorOccurrences + 1);
    const point = trace[index];
    const expectationState: LiveJourneyExpectationState = index === 0
      ? "opening"
      : point.probability == null
        ? "open"
        : point.probability === 0
          ? "new"
          : "known";
    return {
      index,
      eventIds: group.map((event) => event.id),
      onsetMs: group[0].onsetMs,
      relativeOnset: (group[0].onsetMs - groups[0][0].onsetMs) / elapsedMs,
      attackCount: group.length,
      pitchOffsets: notes.map((note) => note - bass),
      bassMove: index === 0 ? null : bass - priorNotes[0],
      gapMs: index === 0 ? null : gaps[index - 1],
      gapMultiple: index === 0 ? null : gaps[index - 1] / localUnitMs,
      gestureKey,
      priorOccurrences,
      expectationState,
      actualProbability: point.probability,
      alternativeCount: point.alternatives.length,
      alternatives: point.alternatives,
    };
  });
  const predictNext = localGesturePrediction(gestureEvents);
  return {
    attackCount: usable.length,
    groupCount: groups.length,
    elapsedMs,
    localUnitMs,
    returningGestureCount: steps.filter((step) => step.priorOccurrences > 0).length,
    learnedStepCount: steps.filter((step) => step.actualProbability != null).length,
    newContinuationCount: steps.filter((step) => step.expectationState === "new").length,
    steps,
    nextAlternatives: predictNext(gestureEvents.at(-1)!.gesture).map((alternative) => ({ gesture: alternative.nextGesture, probability: alternative.probability })),
  };
}
