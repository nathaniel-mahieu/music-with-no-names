export type VocalPitchTrailSample = {
  atMs: number;
  targetMidi: number;
  targetCents: number;
  clarity: number;
};

export type VocalAccuracyReading = {
  band: "centered" | "fine" | "neighborhood" | "between" | "outside";
  label: string;
};

export type VocalClarityReading = {
  band: "fragile" | "usable" | "clear" | "strong";
  label: string;
};

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(maximum, Math.max(minimum, value));
}

function quantile(sortedValues: number[], share: number) {
  const position = clamp(share, 0, 1) * (sortedValues.length - 1);
  const lowerIndex = Math.floor(position);
  const upperIndex = Math.ceil(position);
  const mix = position - lowerIndex;
  return sortedValues[lowerIndex] * (1 - mix) + sortedValues[upperIndex] * mix;
}

export function vocalPitchLanePosition(targetCentsInput: number) {
  const targetCents = Number.isFinite(targetCentsInput) ? targetCentsInput : 0;
  return clamp(0.5 - targetCents / 200, 0, 1);
}

export function vocalAccuracyReading(targetCentsInput: number): VocalAccuracyReading {
  const distance = Math.abs(Number.isFinite(targetCentsInput) ? targetCentsInput : Number.POSITIVE_INFINITY);
  if (distance <= 5) return { band: "centered", label: "centered within 5¢" };
  if (distance <= 20) return { band: "fine", label: "inside the fine-tuning lane" };
  if (distance <= 50) return { band: "neighborhood", label: "nearest to the target key" };
  if (distance <= 100) return { band: "between", label: "between target and neighbor" };
  return { band: "outside", label: "outside the one-semitone view" };
}

export function vocalClarityReading(clarityInput: number): VocalClarityReading {
  const clarity = clamp(Number.isFinite(clarityInput) ? clarityInput : 0, 0, 1);
  if (clarity >= 0.9) return { band: "strong", label: "strong repeating-pitch trace" };
  if (clarity >= 0.75) return { band: "clear", label: "clear repeating-pitch trace" };
  if (clarity >= 0.6) return { band: "usable", label: "usable repeating-pitch trace" };
  return { band: "fragile", label: "fragile repeating-pitch trace" };
}

export function vocalRecentPitchSpread(samplesInput: VocalPitchTrailSample[], windowMs = 2_000) {
  const samples = samplesInput
    .filter((sample) => Number.isFinite(sample.atMs) && Number.isFinite(sample.targetCents))
    .sort((a, b) => a.atMs - b.atMs);
  if (samples.length < 4) return null;
  const latestAtMs = samples[samples.length - 1].atMs;
  const recent = samples.filter((sample) => sample.atMs >= latestAtMs - Math.max(250, windowMs));
  if (recent.length < 4) return null;
  const cents = recent.map((sample) => sample.targetCents).sort((a, b) => a - b);
  const lower = quantile(cents, 0.1);
  const upper = quantile(cents, 0.9);
  return Math.max(0, upper - lower);
}

export function vocalStabilityLabel(spreadCents: number | null) {
  if (spreadCents == null || !Number.isFinite(spreadCents)) return "building a recent trail";
  if (spreadCents <= 10) return "settled recent center";
  if (spreadCents <= 25) return "gently moving recent center";
  return "wandering recent center";
}

export function vocalEarTrainingCue(targetCentsInput: number, spreadCents: number | null) {
  const targetCents = Number.isFinite(targetCentsInput) ? targetCentsInput : 0;
  const distance = Math.abs(targetCents);
  if (distance <= 5) {
    return spreadCents != null && spreadCents > 20
      ? "Keep the center; make the trail narrower."
      : "Stay here; memorize this pitch center.";
  }
  const direction = targetCents < 0 ? "up" : "down";
  if (distance <= 20) return `Ease ${direction} ${Math.round(distance)}¢.`;
  if (distance <= 100) return `Glide ${direction} ${Math.round(distance)}¢; slow near the center.`;
  return `Replay the target, then approach ${direction} by ${(distance / 100).toFixed(1)} st.`;
}
