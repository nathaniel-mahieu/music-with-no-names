import test from "node:test";
import assert from "node:assert/strict";
import {
  PIANO_SOUND_MODELS,
  isPianoSoundModelId,
  pianoPartialInteraction,
  pianoSoundPartialProfile,
  pianoSoundVoice,
} from "../lib/piano-sound-model.ts";
import { sonorityPerceptionModel } from "../lib/sonority-model.ts";

test("declares bounded, inspectable teaching spectra", () => {
  assert.deepEqual(PIANO_SOUND_MODELS.map((model) => model.id), ["sine", "harmonic", "mellow-piano", "bright-piano"]);
  for (const model of PIANO_SOUND_MODELS) {
    const profile = pianoSoundPartialProfile(model.id);
    assert.equal(profile.length, model.partialCount);
    assert.equal(profile[0].frequencyMultiple, 1);
    assert.equal(profile[0].amplitude, 1);
    assert.ok(profile.every((partial, index) => index === 0 || partial.frequencyMultiple > profile[index - 1].frequencyMultiple));
    assert.ok(profile.every((partial) => partial.amplitude > 0 && partial.amplitude <= 1));
  }
  assert.equal(isPianoSoundModelId("bright-piano"), true);
  assert.equal(isPianoSoundModelId("actual-daw-audio"), false);
});

test("changes the assumed spectrum without changing played fundamentals", () => {
  const fundamentals = [261.6256, 277.1826, 391.9954];
  const sineVoices = fundamentals.map((frequencyHz) => pianoSoundVoice(frequencyHz, 0.72, "sine"));
  const brightVoices = fundamentals.map((frequencyHz) => pianoSoundVoice(frequencyHz, 0.72, "bright-piano"));
  assert.deepEqual(sineVoices.map((voice) => voice.frequencyHz), brightVoices.map((voice) => voice.frequencyHz));
  assert.ok(sineVoices.every((voice) => voice.partialCount === 1));
  assert.ok(brightVoices.every((voice) => voice.partialCount === 16));
  const sine = sonorityPerceptionModel(sineVoices);
  const bright = sonorityPerceptionModel(brightVoices);
  assert.notEqual(Math.round(sine.roughness * 10_000), Math.round(bright.roughness * 10_000));
  assert.notEqual(Math.round(sine.brightness * 10_000), Math.round(bright.brightness * 10_000));
});

test("exposes aligned partials separately from near interaction zones", () => {
  const simple = pianoPartialInteraction(200, 300, "harmonic");
  const offset = pianoPartialInteraction(200, 283, "harmonic");
  assert.ok(simple.alignedPairs.some((pair) => pair.lowerPartial === 3 && pair.upperPartial === 2));
  assert.ok(simple.alignedPairs.length > offset.alignedPairs.length);
  assert.ok(offset.interactionPairs.length > 0);
  assert.ok(simple.overlap > offset.overlap);
  assert.ok(simple.lowerPartials.every((partial) => partial.kind === "partial" && partial.source === 0));
  assert.ok(simple.upperPartials.every((partial) => partial.kind === "partial" && partial.source === 1));
});

test("keeps a sine assumption to one physical component per note", () => {
  const sine = pianoPartialInteraction(220, 233, "sine");
  assert.equal(sine.lowerPartials.length, 1);
  assert.equal(sine.upperPartials.length, 1);
  assert.equal(sine.alignedPairs.length, 0);
  assert.ok(sine.interactionPairs.length <= 1);
  assert.ok(sine.roughness >= 0 && sine.roughness <= 1);
  assert.throws(() => pianoPartialInteraction(0, 220, "harmonic"), RangeError);
});
