import assert from "node:assert/strict";
import test from "node:test";
import {
  aggregateRoughness,
  auditoryBandEnergy,
  harmonicSpectrum,
  harmonicityCandidates,
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
