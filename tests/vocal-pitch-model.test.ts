import assert from "node:assert/strict";
import test from "node:test";
import {
  detectVocalFundamental,
  matchVocalPitch,
  vocalIntervalLabel,
  vocalReferenceFrequency,
} from "../lib/vocal-pitch-model.ts";

function sine(frequencyHz: number, sampleRate = 48_000, length = 4096, harmonicShare = 0) {
  return Float32Array.from({ length }, (_, index) => {
    const phase = 2 * Math.PI * frequencyHz * index / sampleRate;
    return 0.55 * Math.sin(phase) + harmonicShare * Math.sin(phase * 2);
  });
}

test("detects a monophonic sung-frequency fixture without choosing its stronger octave", () => {
  const plain = detectVocalFundamental(sine(220), 48_000);
  assert.ok(plain);
  assert.ok(Math.abs(plain.frequencyHz - 220) < 0.8);
  assert.ok(plain.clarity > 0.9);

  const harmonic = detectVocalFundamental(sine(196, 48_000, 4096, 0.42), 48_000);
  assert.ok(harmonic);
  assert.ok(Math.abs(harmonic.frequencyHz - 196) < 1.2);
});

test("withholds pitch for silence, weak input, malformed windows, and noise-like alternation", () => {
  assert.equal(detectVocalFundamental(new Float32Array(4096), 48_000), null);
  assert.equal(detectVocalFundamental(sine(220).map((sample) => sample * 0.001), 48_000), null);
  assert.equal(detectVocalFundamental(new Float32Array(120), 48_000), null);
  const alternating = Float32Array.from({ length: 4096 }, (_, index) => index % 2 ? 0.3 : -0.3);
  assert.equal(detectVocalFundamental(alternating, 48_000), null);
});

test("matches microphone pitch to both its nearest key and a declared piano target", () => {
  const a4 = matchVocalPitch(440, 69);
  assert.ok(a4);
  assert.equal(a4.nearestMidi, 69);
  assert.ok(Math.abs(a4.nearestCents) < 1e-12);
  assert.ok(Math.abs(a4.targetCents) < 1e-12);

  const sharp = matchVocalPitch(440 * 2 ** (17 / 1200), 69);
  assert.ok(sharp);
  assert.ok(Math.abs(sharp.nearestCents - 17) < 1e-9);
  assert.ok(Math.abs(sharp.targetCents - 17) < 1e-9);

  const fifth = matchVocalPitch(vocalReferenceFrequency(76), 69);
  assert.ok(fifth);
  assert.equal(fifth.nearestTargetStep, 7);
  assert.ok(Math.abs(fifth.targetFineCents) < 1e-9);
  assert.equal(matchVocalPitch(Number.NaN, 69), null);
});

test("names interval targets with semitone count kept primary", () => {
  assert.equal(vocalIntervalLabel(0), "0 st · unison");
  assert.equal(vocalIntervalLabel(7), "+7 st · up fifth");
  assert.equal(vocalIntervalLabel(-3), "−3 st · down minor third");
  assert.equal(vocalIntervalLabel(13), "+13 st · up 1 octave + nearest-key step");
});
