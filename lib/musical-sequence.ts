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
