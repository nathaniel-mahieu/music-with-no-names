import type { ExperiencePosition } from "./experience-model";

export type ResponseSample = {
  position: ExperiencePosition;
  liking: number;
  interest: number;
  familiarity: number;
  recordedAt: string;
};

export type PreferenceTerrain = {
  center: ExperiencePosition;
  bandwidth: ExperiencePosition;
  sampleCount: number;
  uncertainty: number;
  meanLiking: number;
};

function weightedMean(samples: ResponseSample[], read: (sample: ResponseSample) => number) {
  let total = 0;
  let weightTotal = 0;
  for (const sample of samples) {
    const weight = 0.15 + (sample.liking / 100) * 0.58 + (sample.interest / 100) * 0.27;
    total += read(sample) * weight;
    weightTotal += weight;
  }
  return weightTotal > 0 ? total / weightTotal : 50;
}

export function learnPreferenceTerrain(samples: ResponseSample[]): PreferenceTerrain | null {
  if (samples.length === 0) return null;
  const center: ExperiencePosition = {
    tension: weightedMean(samples, (sample) => sample.position.tension),
    surprise: weightedMean(samples, (sample) => sample.position.surprise),
    drive: weightedMean(samples, (sample) => sample.position.drive),
  };
  const spread = (dimension: keyof ExperiencePosition) => Math.sqrt(weightedMean(samples, (sample) => (sample.position[dimension] - center[dimension]) ** 2));
  return {
    center,
    bandwidth: {
      tension: Math.max(12, spread("tension") + 12),
      surprise: Math.max(12, spread("surprise") + 12),
      drive: Math.max(12, spread("drive") + 12),
    },
    sampleCount: samples.length,
    uncertainty: Math.max(6, 30 / Math.sqrt(samples.length)),
    meanLiking: samples.reduce((sum, sample) => sum + sample.liking, 0) / samples.length,
  };
}

export function terrainFit(position: ExperiencePosition, terrain: PreferenceTerrain) {
  const squaredDistance = (Object.keys(position) as (keyof ExperiencePosition)[]).reduce((sum, dimension) => {
    const normalized = (position[dimension] - terrain.center[dimension]) / terrain.bandwidth[dimension];
    return sum + normalized ** 2;
  }, 0) / 3;
  return Math.exp(-0.5 * squaredDistance);
}

export function familiarityResponseTrend(samples: ResponseSample[]) {
  if (samples.length < 2) return null;
  const ordered = [...samples].sort((a, b) => a.recordedAt.localeCompare(b.recordedAt));
  const first = ordered[0];
  const last = ordered[ordered.length - 1];
  return {
    familiarityChange: last.familiarity - first.familiarity,
    likingChange: last.liking - first.liking,
    observations: ordered.length,
  };
}
