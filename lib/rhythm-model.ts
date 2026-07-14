export type PulseHypothesis = {
  pulsesPerCycle: number;
  confidence: number;
  anchorPositions: number[];
};

export type LivePulseEvent = {
  id: number;
  note: number;
  onsetMs: number;
  velocity?: number;
};

export type LivePulsePlacement = {
  eventIds: number[];
  onsetMs: number;
  attackCount: number;
  pulseIndex: number;
  offsetMs: number;
  phase: number;
  nearestPhase: number;
  phaseLabel: string;
  phaseError: number;
};

export type LivePulseGap = {
  fromEventIds: number[];
  toEventIds: number[];
  gapMs: number;
  pulseMultiple: number;
  nearestMultiple: number;
  ratioLabel: string;
  errorPercent: number;
};

export type LivePulseMirror = {
  status: "waiting" | "capturing" | "invalid" | "tracking";
  tapNote: number | null;
  tapEvents: LivePulseEvent[];
  tapsNeeded: number;
  ignoredDuringCapture: number;
  pulseMs: number | null;
  pulsesPerMinute: number | null;
  tapSpreadMs: number | null;
  anchorOnsetMs: number | null;
  invalidReason: string | null;
  placements: LivePulsePlacement[];
  gaps: LivePulseGap[];
};

const PHASE_LANDMARKS = [
  { value: 0, label: "pulse line" },
  { value: 1 / 4, label: "quarter after" },
  { value: 1 / 3, label: "third after" },
  { value: 1 / 2, label: "halfway" },
  { value: 2 / 3, label: "two-thirds after" },
  { value: 3 / 4, label: "three-quarters after" },
];

const GAP_LANDMARKS = [
  { value: 1 / 4, label: "1:4" },
  { value: 1 / 3, label: "1:3" },
  { value: 1 / 2, label: "1:2" },
  { value: 2 / 3, label: "2:3" },
  { value: 3 / 4, label: "3:4" },
  { value: 1, label: "1:1" },
  { value: 3 / 2, label: "3:2" },
  { value: 2, label: "2:1" },
  { value: 3, label: "3:1" },
  { value: 4, label: "4:1" },
];

function median(values: number[]) {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

function circularDistance(first: number, second: number) {
  const distance = Math.abs(first - second);
  return Math.min(distance, 1 - distance);
}

function clusterLiveOnsets(events: LivePulseEvent[], windowMs: number) {
  const clusters: LivePulseEvent[][] = [];
  events.forEach((event) => {
    const current = clusters.at(-1);
    if (current && event.onsetMs - current[0].onsetMs <= windowMs) current.push(event);
    else clusters.push([event]);
  });
  return clusters;
}

/**
 * Builds a learner-declared pulse from four repetitions of one MIDI key, then
 * places later attack clusters against that pulse. It does not infer meter,
 * beat importance, groove quality, or the intended tempo of the phrase.
 */
export function livePulseMirror(events: LivePulseEvent[], anchorEventId = 0, clusterWindowMs = 70): LivePulseMirror {
  const base: LivePulseMirror = {
    status: "waiting",
    tapNote: null,
    tapEvents: [],
    tapsNeeded: 4,
    ignoredDuringCapture: 0,
    pulseMs: null,
    pulsesPerMinute: null,
    tapSpreadMs: null,
    anchorOnsetMs: null,
    invalidReason: null,
    placements: [],
    gaps: [],
  };
  const usable = events
    .filter((event) => event.id > anchorEventId && Number.isInteger(event.note) && event.note >= 0 && event.note <= 127 && Number.isFinite(event.onsetMs))
    .sort((first, second) => first.onsetMs - second.onsetMs || first.id - second.id);
  if (!usable.length) return base;
  const tapNote = usable[0].note;
  const tapEvents = usable.filter((event) => event.note === tapNote).slice(0, 4);
  const fourthTap = tapEvents[3] ?? null;
  const captureEnd = fourthTap?.onsetMs ?? usable.at(-1)!.onsetMs;
  const ignoredDuringCapture = usable.filter((event) => event.onsetMs <= captureEnd && event.note !== tapNote).length;
  if (tapEvents.length < 4) return {
    ...base,
    status: "capturing",
    tapNote,
    tapEvents,
    tapsNeeded: 4 - tapEvents.length,
    ignoredDuringCapture,
  };

  const tapGaps = tapEvents.slice(1).map((event, index) => event.onsetMs - tapEvents[index].onsetMs);
  const tooFast = tapGaps.some((gap) => gap < 180);
  const tooSlow = tapGaps.some((gap) => gap > 2_000);
  if (tooFast || tooSlow) return {
    ...base,
    status: "invalid",
    tapNote,
    tapEvents,
    tapsNeeded: 0,
    ignoredDuringCapture,
    invalidReason: tooFast ? "At least one tap gap was shorter than 180 ms." : "At least one tap gap was longer than 2 seconds.",
  };

  const pulseMs = median(tapGaps);
  const tapSpreadMs = tapGaps.reduce((sum, gap) => sum + Math.abs(gap - pulseMs), 0) / tapGaps.length;
  const anchorOnsetMs = fourthTap.onsetMs;
  const tracked = usable.filter((event) => event.onsetMs > anchorOnsetMs);
  const clusters = clusterLiveOnsets(tracked, Math.max(0, clusterWindowMs));
  const placements = clusters.map((cluster) => {
    const onsetMs = cluster[0].onsetMs;
    const elapsedPulses = (onsetMs - anchorOnsetMs) / pulseMs;
    const pulseIndex = Math.round(elapsedPulses);
    const phase = ((elapsedPulses % 1) + 1) % 1;
    const phaseLandmark = [...PHASE_LANDMARKS].sort((first, second) => circularDistance(phase, first.value) - circularDistance(phase, second.value))[0];
    return {
      eventIds: cluster.map((event) => event.id),
      onsetMs,
      attackCount: cluster.length,
      pulseIndex,
      offsetMs: onsetMs - (anchorOnsetMs + pulseIndex * pulseMs),
      phase,
      nearestPhase: phaseLandmark.value,
      phaseLabel: phaseLandmark.label,
      phaseError: circularDistance(phase, phaseLandmark.value),
    };
  });
  const gaps = placements.slice(1).map((placement, index) => {
    const prior = placements[index];
    const gapMs = placement.onsetMs - prior.onsetMs;
    const pulseMultiple = gapMs / pulseMs;
    const landmark = [...GAP_LANDMARKS].sort((first, second) => Math.abs(Math.log2(pulseMultiple / first.value)) - Math.abs(Math.log2(pulseMultiple / second.value)))[0];
    return {
      fromEventIds: prior.eventIds,
      toEventIds: placement.eventIds,
      gapMs,
      pulseMultiple,
      nearestMultiple: landmark.value,
      ratioLabel: landmark.label,
      errorPercent: (pulseMultiple / landmark.value - 1) * 100,
    };
  });
  return {
    ...base,
    status: "tracking",
    tapNote,
    tapEvents,
    tapsNeeded: 0,
    ignoredDuringCapture,
    pulseMs,
    pulsesPerMinute: 60_000 / pulseMs,
    tapSpreadMs,
    anchorOnsetMs,
    placements,
    gaps,
  };
}

export function pulseHypotheses(pattern: boolean[]): PulseHypothesis[] {
  const length = pattern.length;
  const activeCount = pattern.filter(Boolean).length;
  if (length < 4 || activeCount === 0) return [];
  return [2, 3, 4, 6]
    .filter((pulses) => length % pulses === 0)
    .map((pulsesPerCycle) => {
      const step = length / pulsesPerCycle;
      const anchors = Array.from({ length: pulsesPerCycle }, (_, index) => index * step);
      const hits = anchors.filter((index) => pattern[index]).length;
      const activeOnAnchors = pattern.reduce((count, active, index) => count + (active && anchors.includes(index) ? 1 : 0), 0);
      const precision = activeOnAnchors / activeCount;
      const coverage = hits / anchors.length;
      return { pulsesPerCycle, confidence: precision * 0.62 + coverage * 0.38, anchorPositions: anchors };
    })
    .sort((a, b) => b.confidence - a.confidence);
}

function metricalWeight(index: number, length: number) {
  if (index === 0) return 4;
  if (length % 4 === 0 && index % (length / 4) === 0) return 3;
  if (length % 2 === 0 && index % (length / 2) === 0) return 3;
  if (index % 2 === 0) return 2;
  return 1;
}

export function syncopationIndex(pattern: boolean[]) {
  const activeCount = pattern.filter(Boolean).length;
  if (activeCount === 0) return 0;
  let score = 0;
  let possible = 0;
  for (let index = 0; index < pattern.length; index += 1) {
    if (!pattern[index]) continue;
    const currentWeight = metricalWeight(index, pattern.length);
    for (let lookAhead = 1; lookAhead <= 2; lookAhead += 1) {
      const next = (index + lookAhead) % pattern.length;
      const nextWeight = metricalWeight(next, pattern.length);
      possible += 3;
      if (!pattern[next] && nextWeight > currentWeight) score += nextWeight - currentWeight;
    }
  }
  return Math.max(0, Math.min(1, score / Math.max(1, possible)));
}

export function nestedCyclePhases(step: number, length: number, cycles = [2, 3, 4]) {
  return cycles.map((divisions) => ({
    divisions,
    phase: ((step % length) / length) * divisions % 1,
  }));
}

export function estimateTapTempo(timestampsMs: number[]) {
  if (timestampsMs.length < 2) return null;
  const intervals = timestampsMs.slice(1).map((value, index) => value - timestampsMs[index]).filter((value) => value >= 180 && value <= 2000).sort((a, b) => a - b);
  if (intervals.length === 0) return null;
  const middle = Math.floor(intervals.length / 2);
  const median = intervals.length % 2 ? intervals[middle] : (intervals[middle - 1] + intervals[middle]) / 2;
  const deviations = intervals.map((interval) => Math.abs(interval - median));
  const consistency = 1 - Math.min(1, deviations.reduce((sum, value) => sum + value, 0) / intervals.length / median);
  return { pulsesPerMinute: 60000 / median, consistency };
}
