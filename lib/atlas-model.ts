import { incrementalPredictionTrace, type MusicalEvent } from "./musical-sequence.ts";

export type AtlasPoint = { xValue: number; yValue: number };

export const LIVE_PHRASE_ATLAS_MODEL_VERSION = "music-with-no-names.live-atlas.v1" as const;

export type LivePhraseEvent = {
  id: number;
  note: number;
  onsetMs: number;
  velocity?: number;
  releaseMs?: number | null;
};

export type LivePhraseLandmarkProfile = {
  modelVersion: typeof LIVE_PHRASE_ATLAS_MODEL_VERSION;
  attackCount: number;
  elapsedMs: number;
  pitchRecurrence: number;
  shapeRecurrence: number;
  repetition: number;
  surprise: number | null;
  surpriseBits: number | null;
  surpriseEvidenceCount: number;
  timingActivity: number | null;
  attacksPerSecond: number | null;
  timingRegularity: number | null;
};

function clampPercent(value: number) {
  return Math.max(0, Math.min(100, value));
}

function repeatRate(values: Array<string | number>) {
  if (values.length < 2) return 0;
  return (values.length - new Set(values).size) / (values.length - 1);
}

function median(values: number[]) {
  if (!values.length) return 0;
  const sorted = [...values].sort((first, second) => first - second);
  const midpoint = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[midpoint] : (sorted[midpoint - 1] + sorted[midpoint]) / 2;
}

export function livePhraseLandmarkProfile(events: LivePhraseEvent[]): LivePhraseLandmarkProfile | null {
  const usable = events
    .filter((event) => Number.isInteger(event.id)
      && Number.isInteger(event.note)
      && event.note >= 0
      && event.note <= 127
      && Number.isFinite(event.onsetMs)
      && event.onsetMs >= 0)
    .sort((first, second) => first.onsetMs - second.onsetMs || first.id - second.id);
  if (usable.length < 4) return null;

  const moves = usable.slice(1).map((event, index) => event.note - usable[index].note);
  const twoMoveShapes = moves.slice(1).map((move, index) => `${moves[index]},${move}`);
  const pitchRecurrence = repeatRate(usable.map((event) => ((event.note % 12) + 12) % 12));
  const shapeRecurrence = repeatRate(twoMoveShapes);
  const repetition = clampPercent((pitchRecurrence * 0.4 + shapeRecurrence * 0.6) * 100);

  const predictionEvents: MusicalEvent[] = usable.map((event, index) => ({
    id: String(event.id),
    onsetSeconds: (event.onsetMs - usable[0].onsetMs) / 1000,
    durationSeconds: Math.max(0.05, ((event.releaseMs ?? event.onsetMs + 100) - event.onsetMs) / 1000),
    ratioToReference: 2 ** ((event.note - usable[0].note) / 12),
    amplitude: Math.max(0, Math.min(1, (event.velocity ?? 64) / 127)),
    timbre: "harmonic",
    gesture: index === 0 ? "start" : `${moves[index - 1] >= 0 ? "+" : ""}${moves[index - 1]}`,
  }));
  const surpriseTrace = incrementalPredictionTrace(predictionEvents)
    .map((point) => point.surpriseBits)
    .filter((value): value is number => value != null);
  const surpriseBits = surpriseTrace.length ? meanValue(surpriseTrace) : null;
  const surprise = surpriseBits == null ? null : clampPercent(surpriseBits / 6 * 100);

  const elapsedMs = Math.max(0, usable.at(-1)!.onsetMs - usable[0].onsetMs);
  const positiveGaps = usable.slice(1)
    .map((event, index) => event.onsetMs - usable[index].onsetMs)
    .filter((gap) => gap > 0);
  const typicalGap = median(positiveGaps);
  const timingRegularity = positiveGaps.length >= 2 && typicalGap > 0
    ? Math.max(0, Math.min(1, 1 - median(positiveGaps.map((gap) => Math.abs(gap - typicalGap))) / typicalGap))
    : null;
  const attacksPerSecond = elapsedMs > 0 ? (usable.length - 1) / (elapsedMs / 1000) : null;
  const timingActivity = attacksPerSecond == null || timingRegularity == null
    ? null
    : clampPercent((Math.min(1, attacksPerSecond / 4) * 0.55 + timingRegularity * 0.45) * 100);

  return {
    modelVersion: LIVE_PHRASE_ATLAS_MODEL_VERSION,
    attackCount: usable.length,
    elapsedMs,
    pitchRecurrence: clampPercent(pitchRecurrence * 100),
    shapeRecurrence: clampPercent(shapeRecurrence * 100),
    repetition,
    surprise,
    surpriseBits,
    surpriseEvidenceCount: surpriseTrace.length,
    timingActivity,
    attacksPerSecond,
    timingRegularity: timingRegularity == null ? null : timingRegularity * 100,
  };
}

export function meanValue(values: number[]) {
  if (values.length === 0) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

export function valueSpread(values: number[]) {
  if (values.length === 0) return 0;
  const center = meanValue(values);
  return Math.sqrt(meanValue(values.map((value) => (value - center) ** 2)));
}

export function densityRegion(points: AtlasPoint[]) {
  if (points.length === 0) throw new RangeError("A density region needs at least one point.");
  const centerX = meanValue(points.map((point) => point.xValue));
  const centerY = meanValue(points.map((point) => point.yValue));
  const width = Math.max(20, Math.min(72, 18 + valueSpread(points.map((point) => point.xValue)) * 3.4));
  const height = Math.max(20, Math.min(72, 18 + valueSpread(points.map((point) => point.yValue)) * 3.4));
  return { centerX, centerY, width, height, count: points.length };
}
