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

export type PhraseCharacterRatings = {
  settledness: number;
  energy: number;
  familiarity: number;
  liking: number;
};

export type PhraseCharacterEvidence = {
  measured: {
    attackCount: number;
    phraseMs: number;
    pitchSpan: number;
    meanVelocity: number;
    overlapShare: number;
  };
  modeled: {
    meanCrunch: number;
    endingRepose: number;
    meanNovelty: number;
    centerClarity: number;
  };
};

export type PhraseCharacterObservation = {
  id: string;
  recordedAt: string;
  phraseSignature: string;
  ratings: PhraseCharacterRatings;
  evidence: PhraseCharacterEvidence;
};

export type PhraseCharacterSummary = {
  sampleCount: number;
  center: PhraseCharacterRatings;
  spread: PhraseCharacterRatings;
  uncertainty: number;
};

export const PHRASE_CHARACTER_STORAGE_KEY = "music-with-no-names.phrase-character.v1";

const CHARACTER_KEYS: Array<keyof PhraseCharacterRatings> = ["settledness", "energy", "familiarity", "liking"];

function boundedNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 100;
}

function validRatings(value: unknown): value is PhraseCharacterRatings {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<PhraseCharacterRatings>;
  return CHARACTER_KEYS.every((key) => boundedNumber(candidate[key]));
}

function validEvidence(value: unknown): value is PhraseCharacterEvidence {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<PhraseCharacterEvidence>;
  if (!candidate.measured || !candidate.modeled) return false;
  return Object.values(candidate.measured).every((item) => typeof item === "number" && Number.isFinite(item))
    && Object.values(candidate.modeled).every((item) => typeof item === "number" && Number.isFinite(item));
}

export function parsePhraseCharacterObservations(value: string | null): PhraseCharacterObservation[] {
  if (!value) return [];
  try {
    const parsed: unknown = JSON.parse(value);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item): item is PhraseCharacterObservation => {
      if (!item || typeof item !== "object") return false;
      const candidate = item as Partial<PhraseCharacterObservation>;
      return typeof candidate.id === "string"
        && typeof candidate.recordedAt === "string"
        && typeof candidate.phraseSignature === "string"
        && candidate.phraseSignature.length > 0
        && validRatings(candidate.ratings)
        && validEvidence(candidate.evidence);
    });
  } catch {
    return [];
  }
}

/** A compact transposition- and tempo-scale-invariant relationship signature. */
export function phraseRelationshipSignature(events: Array<{ note: number; onsetMs: number }>) {
  const usable = events.filter((event) => Number.isFinite(event.note) && Number.isFinite(event.onsetMs)).slice(-32);
  if (!usable.length) return "";
  const intervals = usable.slice(1).map((event, index) => Math.round(event.note) - Math.round(usable[index].note));
  const gaps = usable.slice(1).map((event, index) => Math.max(0, event.onsetMs - usable[index].onsetMs));
  const totalGap = gaps.reduce((sum, gap) => sum + gap, 0);
  const rhythm = gaps.map((gap) => totalGap > 0 ? Math.round(gap / totalGap * 24) : 0);
  return `${usable.length}|${intervals.join(",")}|${rhythm.join(",")}`;
}

export function summarizePhraseCharacter(observations: PhraseCharacterObservation[]): PhraseCharacterSummary | null {
  if (!observations.length) return null;
  const center = {} as PhraseCharacterRatings;
  const spread = {} as PhraseCharacterRatings;
  CHARACTER_KEYS.forEach((key) => {
    const mean = observations.reduce((sum, observation) => sum + observation.ratings[key], 0) / observations.length;
    center[key] = mean;
    spread[key] = Math.sqrt(observations.reduce((sum, observation) => sum + (observation.ratings[key] - mean) ** 2, 0) / observations.length);
  });
  return {
    sampleCount: observations.length,
    center,
    spread,
    uncertainty: Math.max(5, 30 / Math.sqrt(observations.length)),
  };
}

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
