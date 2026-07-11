export type RatioApproximation = {
  numerator: number;
  denominator: number;
  value: number;
  errorCents: number;
  exact: boolean;
};

export type HarmonicPartial = {
  index: number;
  frequencyHz: number;
  amplitude: number;
};

export type PartialCoincidence = {
  lowerIndex: number;
  upperIndex: number;
  frequencyHz: number;
  errorCents: number;
};

export function sineSample(frequencyHz: number, timeSeconds: number, phaseRadians = 0) {
  if (!Number.isFinite(frequencyHz) || frequencyHz <= 0) throw new RangeError("Frequency must be positive.");
  if (!Number.isFinite(timeSeconds) || !Number.isFinite(phaseRadians)) throw new RangeError("Time and phase must be finite.");
  return Math.sin(2 * Math.PI * frequencyHz * timeSeconds + phaseRadians);
}

export function normalizedWaveSum(frequenciesHz: number[], timeSeconds: number) {
  if (frequenciesHz.length === 0) throw new RangeError("At least one frequency is required.");
  return frequenciesHz.reduce((sum, frequencyHz) => sum + sineSample(frequencyHz, timeSeconds), 0) / frequenciesHz.length;
}

export function greatestCommonDivisor(a: number, b: number): number {
  let x = Math.abs(Math.trunc(a));
  let y = Math.abs(Math.trunc(b));

  while (y !== 0) {
    const remainder = x % y;
    x = y;
    y = remainder;
  }

  return x || 1;
}

export function leastCommonMultiple(a: number, b: number): number {
  const x = Math.abs(Math.trunc(a));
  const y = Math.abs(Math.trunc(b));
  if (x === 0 || y === 0) return 0;
  return (x / greatestCommonDivisor(x, y)) * y;
}

export function centsFromRatio(ratio: number): number {
  if (!Number.isFinite(ratio) || ratio <= 0) {
    throw new RangeError("A frequency ratio must be finite and greater than zero.");
  }

  return 1200 * Math.log2(ratio);
}

export function approximateRatio(
  ratio: number,
  maxDenominator = 32,
): RatioApproximation {
  if (!Number.isFinite(ratio) || ratio <= 0) {
    throw new RangeError("A frequency ratio must be finite and greater than zero.");
  }

  if (!Number.isInteger(maxDenominator) || maxDenominator < 1) {
    throw new RangeError("The maximum denominator must be a positive integer.");
  }

  let bestNumerator = 1;
  let bestDenominator = 1;
  let bestError = Number.POSITIVE_INFINITY;

  for (let denominator = 1; denominator <= maxDenominator; denominator += 1) {
    const numerator = Math.max(1, Math.round(ratio * denominator));
    const candidate = numerator / denominator;
    const error = Math.abs(centsFromRatio(candidate / ratio));

    if (error < bestError) {
      const divisor = greatestCommonDivisor(numerator, denominator);
      bestNumerator = numerator / divisor;
      bestDenominator = denominator / divisor;
      bestError = error;
    }
  }

  const value = bestNumerator / bestDenominator;

  return {
    numerator: bestNumerator,
    denominator: bestDenominator,
    value,
    errorCents: centsFromRatio(value / ratio),
    exact: Math.abs(centsFromRatio(value / ratio)) < 0.01,
  };
}

export function commonPeriodSeconds(
  referenceHz: number,
  ratio: number,
  maxDenominator = 16,
  toleranceCents = 0.2,
): number | null {
  if (!Number.isFinite(referenceHz) || referenceHz <= 0) {
    throw new RangeError("The reference frequency must be greater than zero.");
  }

  const approximation = approximateRatio(ratio, maxDenominator);
  if (Math.abs(approximation.errorCents) > toleranceCents) {
    return null;
  }

  return approximation.denominator / referenceHz;
}

export function harmonicPartials(
  fundamentalHz: number,
  count: number,
  rolloff = 1.15,
): HarmonicPartial[] {
  if (!Number.isFinite(fundamentalHz) || fundamentalHz <= 0) {
    throw new RangeError("The fundamental frequency must be greater than zero.");
  }

  if (!Number.isInteger(count) || count < 1) {
    throw new RangeError("Partial count must be a positive integer.");
  }

  return Array.from({ length: count }, (_, offset) => {
    const index = offset + 1;
    return {
      index,
      frequencyHz: fundamentalHz * index,
      amplitude: 1 / index ** rolloff,
    };
  });
}

export function findCoincidingPartials(
  lowerHz: number,
  upperHz: number,
  count = 12,
  toleranceCents = 3,
): PartialCoincidence[] {
  const lowerPartials = harmonicPartials(lowerHz, count);
  const upperPartials = harmonicPartials(upperHz, count);
  const matches: PartialCoincidence[] = [];

  for (const lower of lowerPartials) {
    for (const upper of upperPartials) {
      const errorCents = centsFromRatio(upper.frequencyHz / lower.frequencyHz);
      if (Math.abs(errorCents) <= toleranceCents) {
        matches.push({
          lowerIndex: lower.index,
          upperIndex: upper.index,
          frequencyHz: (lower.frequencyHz + upper.frequencyHz) / 2,
          errorCents,
        });
      }
    }
  }

  return matches;
}

export function primeFactorization(value: number): Record<number, number> {
  if (!Number.isInteger(value) || value < 1) {
    throw new RangeError("Prime factorization requires a positive integer.");
  }

  const factors: Record<number, number> = {};
  let remainder = value;
  let divisor = 2;

  while (remainder > 1) {
    while (remainder % divisor === 0) {
      factors[divisor] = (factors[divisor] ?? 0) + 1;
      remainder /= divisor;
    }
    divisor += 1;
  }

  return factors;
}

export function primeExponentCoordinates(ratio: number, maximumDenominator = 32) {
  const approximation = approximateRatio(ratio, maximumDenominator);
  const numerator = primeFactorization(approximation.numerator);
  const denominator = primeFactorization(approximation.denominator);
  const coordinates = [2, 3, 5, 7].reduce<Record<number, number>>((result, prime) => {
    result[prime] = (numerator[prime] ?? 0) - (denominator[prime] ?? 0);
    return result;
  }, {});
  const explained = Object.entries(numerator).every(([prime]) => Number(prime) <= 7) && Object.entries(denominator).every(([prime]) => Number(prime) <= 7);
  return { ...approximation, coordinates, explained };
}

export function equalDivisionApproximation(ratio: number, divisions = 12) {
  if (!Number.isFinite(ratio) || ratio <= 0) throw new RangeError("Ratio must be positive.");
  if (!Number.isInteger(divisions) || divisions <= 0) throw new RangeError("Divisions must be a positive integer.");
  const steps = Math.round(divisions * Math.log2(ratio));
  const approximatedRatio = 2 ** (steps / divisions);
  return { steps, ratio: approximatedRatio, errorCents: centsFromRatio(approximatedRatio / ratio) };
}

export function interpolateRatioLogarithmically(first: number, second: number, amount: number) {
  if (first <= 0 || second <= 0) throw new RangeError("Ratios must be positive.");
  const bounded = Math.max(0, Math.min(1, amount));
  return 2 ** (Math.log2(first) * (1 - bounded) + Math.log2(second) * bounded);
}

export function voiceLeadingDistance(first: number[], second: number[]) {
  if (first.length !== second.length) throw new RangeError("Voice sets must contain the same number of voices.");
  return first.reduce((sum, ratio, index) => sum + Math.abs(centsFromRatio(second[index] / ratio)), 0);
}

export function harmonicBasis(
  ratios: number[],
  maxDenominator = 16,
  toleranceCents = 1,
): number[] | null {
  if (ratios.length === 0) return null;

  const approximations = ratios.map((ratio) =>
    approximateRatio(ratio, maxDenominator),
  );
  if (
    approximations.some(
      (approximation) => Math.abs(approximation.errorCents) > toleranceCents,
    )
  ) {
    return null;
  }

  const commonDenominator = approximations.reduce(
    (current, approximation) =>
      leastCommonMultiple(current, approximation.denominator),
    1,
  );
  const harmonics = approximations.map(
    (approximation) =>
      approximation.numerator *
      (commonDenominator / approximation.denominator),
  );
  const sharedDivisor = harmonics.reduce(
    (current, harmonic) => greatestCommonDivisor(current, harmonic),
    harmonics[0],
  );

  return harmonics.map((harmonic) => harmonic / sharedDivisor);
}

export function cyclicOnsetIntervals(pattern: boolean[]): number[] {
  if (pattern.length === 0) return [];
  const active = pattern
    .map((isActive, index) => (isActive ? index : -1))
    .filter((index) => index >= 0);

  if (active.length === 0) return [];
  if (active.length === 1) return [pattern.length];

  return active.map((index, activeIndex) => {
    const next = active[(activeIndex + 1) % active.length];
    return next > index ? next - index : pattern.length - index + next;
  });
}
