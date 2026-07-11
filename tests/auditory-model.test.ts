import assert from "node:assert/strict";
import test from "node:test";
import {
  aggregateRoughness,
  auditoryBandEnergy,
  harmonicSpectrum,
  harmonicityCandidates,
  pairRoughness,
  roughnessPeakSeparationHz,
  spectralOverlap,
} from "../lib/auditory-model.ts";

const options = { partialCount: 10, rolloffDbPerOctave: 6, inharmonicity: 0, noiseAmount: 0 };

test("constructs predictable harmonic and stretched spectra", () => {
  const harmonic = harmonicSpectrum(100, 0, options);
  const stretched = harmonicSpectrum(100, 0, { ...options, inharmonicity: 0.002 });
  assert.equal(harmonic[4].frequencyHz, 500);
  assert.ok(stretched[4].frequencyHz > 500);
});

test("close complex tones are rougher than an octave field", () => {
  const root = harmonicSpectrum(220, 0, options);
  const close = harmonicSpectrum(232, 1, options);
  const octave = harmonicSpectrum(440, 1, options);
  assert.ok(aggregateRoughness([...root, ...close]) > aggregateRoughness([...root, ...octave]));
});

test("shared partials produce more overlap", () => {
  const root = harmonicSpectrum(200, 0, options);
  assert.ok(spectralOverlap(root, harmonicSpectrum(300, 1, options)) > spectralOverlap(root, harmonicSpectrum(283, 1, options)));
});

test("finds a common periodic candidate separately from roughness", () => {
  const components = [...harmonicSpectrum(200, 0, options), ...harmonicSpectrum(300, 1, options)];
  const candidates = harmonicityCandidates(components, 40, 220);
  assert.ok(candidates.some((candidate) => Math.abs(candidate.fundamentalHz - 100) < 3));
});

test("projects a spectrum into declared auditory bands", () => {
  const bands = auditoryBandEnergy(harmonicSpectrum(220, 0, options));
  assert.equal(bands.length, 12);
  assert.ok(bands.every((value) => Number.isFinite(value) && value >= 0));
});

test("simple-tone roughness peaks near the declared critical-band fraction", () => {
  for (const lowerHz of [250, 500, 1000]) {
    const expectedPeak = roughnessPeakSeparationHz(lowerHz);
    let numericalPeak = 1;
    let maximum = -1;
    for (let separation = 1; separation <= 180; separation += 0.25) {
      const value = pairRoughness(
        { frequencyHz: lowerHz, amplitude: 1, kind: "partial", source: 0, partialIndex: 1 },
        { frequencyHz: lowerHz + separation, amplitude: 1, kind: "partial", source: 1, partialIndex: 1 },
      );
      if (value > maximum) { maximum = value; numericalPeak = separation; }
    }
    assert.ok(Math.abs(numericalPeak - expectedPeak) < 0.3);
  }
});
