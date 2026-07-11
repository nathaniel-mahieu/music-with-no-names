export type PulseHypothesis = {
  pulsesPerCycle: number;
  confidence: number;
  anchorPositions: number[];
};

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
