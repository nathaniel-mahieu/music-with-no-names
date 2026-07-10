export type ExperiencePosition = {
  tension: number;
  surprise: number;
  drive: number;
};

export type ExperienceWeights = Partial<Record<keyof ExperiencePosition, number>>;

function assertScaleValue(value: number, label: string) {
  if (!Number.isFinite(value) || value < 0 || value > 100) {
    throw new RangeError(`${label} must be between 0 and 100.`);
  }
}

export function dimensionProximity(
  observed: number,
  preferred: number,
  tolerance = 34,
): number {
  assertScaleValue(observed, "Observed value");
  assertScaleValue(preferred, "Preferred value");
  if (!Number.isFinite(tolerance) || tolerance <= 0) {
    throw new RangeError("Tolerance must be greater than zero.");
  }

  const normalizedDistance = (observed - preferred) / tolerance;
  return Math.exp(-0.5 * normalizedDistance ** 2);
}

export function experienceProximity(
  observed: ExperiencePosition,
  preferred: ExperiencePosition,
  weights: ExperienceWeights = {},
): number {
  // Structural typing allows callers to provide richer objects (for example, a
  // recording landmark with title and genre metadata). Only the model's three
  // declared dimensions belong in this distance calculation.
  const dimensions: (keyof ExperiencePosition)[] = [
    "tension",
    "surprise",
    "drive",
  ];
  let weightedDistance = 0;
  let totalWeight = 0;

  for (const dimension of dimensions) {
    assertScaleValue(observed[dimension], `Observed ${dimension}`);
    assertScaleValue(preferred[dimension], `Preferred ${dimension}`);
    const weight = weights[dimension] ?? 1;
    if (!Number.isFinite(weight) || weight < 0) {
      throw new RangeError("Experience weights must be finite and non-negative.");
    }
    weightedDistance +=
      weight * ((observed[dimension] - preferred[dimension]) / 34) ** 2;
    totalWeight += weight;
  }

  if (totalWeight === 0) return 1;
  return Math.exp(-0.5 * (weightedDistance / totalWeight));
}
