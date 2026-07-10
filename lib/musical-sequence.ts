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
