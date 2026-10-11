import assert from "node:assert/strict";
import test from "node:test";

import {
  SCALE_QUALITY_CATALOG,
  SCALE_QUALITY_DEFAULT_SPLIT_MIDI,
  SCALE_QUALITY_MAX_INPUT_EVENTS,
  SCALE_QUALITY_MAX_TONIC_PULSES,
  SCALE_QUALITY_MAX_UPPER_EVENTS,
  rankScaleQualityCandidates,
  scaleQualityEvidenceStatus,
  scaleQualityNoteProfile,
  scaleQualityOverlapProfile,
  splitScaleQualityPerformance,
  type ScaleQualityEvent,
} from "../lib/piano-scale-quality-model.ts";

const event = (
  id: number,
  note: number,
  onsetMs = id * 100,
  extra: Partial<ScaleQualityEvent> = {},
): ScaleQualityEvent => ({ id, note, onsetMs, source: "midi", ...extra });

const catalogScale = (id: string) => {
  const scale = SCALE_QUALITY_CATALOG.find((candidate) => candidate.id === id);
  assert.ok(scale, `missing scale-quality catalog entry ${id}`);
  return scale;
};

test("the visible split belongs to the bass lane and screen input cannot establish the tonic", () => {
  const unknownSource = { id: 0, note: 47, onsetMs: 50 } as ScaleQualityEvent;
  const performance = splitScaleQualityPerformance([
    unknownSource,
    event(1, SCALE_QUALITY_DEFAULT_SPLIT_MIDI + 1),
    event(2, SCALE_QUALITY_DEFAULT_SPLIT_MIDI, 200, { source: "screen" }),
    event(3, SCALE_QUALITY_DEFAULT_SPLIT_MIDI, 300, { source: "midi" }),
    event(4, SCALE_QUALITY_DEFAULT_SPLIT_MIDI + 1, 400, { source: "midi" }),
  ]);

  assert.equal(performance.tonicEvent?.id, 3);
  assert.equal(performance.tonicPitchClass, SCALE_QUALITY_DEFAULT_SPLIT_MIDI % 12);
  assert.deepEqual(performance.tonicPulses.map((item) => item.id), [3]);
  assert.deepEqual(performance.upperEvents.map((item) => item.id), [4]);
  assert.equal(performance.ignoredPreTonicUpperCount, 1);
  assert.equal(performance.inputEventCount, 3, "screen and unknown-provenance attacks are outside this raw-MIDI analysis");
});

test("upper attacks remain unanchored until a valid low MIDI attack supplies tonic", () => {
  const performance = splitScaleQualityPerformance([
    event(1, 60),
    event(2, 64),
    event(3, -1),
    event(4, 128),
    event(5, 67, Number.NaN),
  ], 59);

  assert.equal(performance.tonicEvent, null);
  assert.equal(performance.tonicPitchClass, null);
  assert.deepEqual(performance.tonicPulses, []);
  assert.deepEqual(performance.upperEvents, []);
  assert.equal(performance.ignoredPreTonicUpperCount, 2);
  assert.equal(performance.inputEventCount, 2, "malformed MIDI evidence is discarded before analysis");
});

test("same-onset tonic and upper attacks are classified bass-first independent of input order", () => {
  const bass = event(10, 48, 1_000);
  const upper = event(5, 60, 1_000);
  for (const input of [[upper, bass], [bass, upper]]) {
    const performance = splitScaleQualityPerformance(input, 59);
    assert.equal(performance.tonicEvent?.id, bass.id);
    assert.deepEqual(performance.upperEvents.map((item) => item.id), [upper.id]);
    assert.equal(performance.ignoredPreTonicUpperCount, 0);
  }
});

test("a staggered low dyad stays ambiguous through the raw MIDI field snapshot", () => {
  const performance = splitScaleQualityPerformance([
    event(1, 48, 1_000, { midiFieldNotes: [48] }),
    event(2, 55, 1_027, { midiFieldNotes: [48, 55] }),
    event(3, 64, 1_200, { midiFieldNotes: [64] }),
  ], 59);

  assert.equal(performance.tonicEvent?.id, 2);
  assert.deepEqual(performance.tonicFieldPitchClasses, [0, 7]);
  assert.equal(performance.tonicFieldAmbiguous, true);
});

test("same-pitch-class bass restatements retain an epoch while a changed bass re-homes it", () => {
  const retained = splitScaleQualityPerformance([
    event(1, 36),
    event(2, 60),
    event(3, 64),
    event(4, 48),
    event(5, 67),
  ], 48);
  assert.equal(retained.tonicEvent?.note, 48);
  assert.deepEqual(retained.tonicPulses.map((item) => item.note), [36, 48]);
  assert.deepEqual(retained.upperEvents.map((item) => item.note), [60, 64, 67]);

  const rehomed = splitScaleQualityPerformance([
    event(1, 48),
    event(2, 60),
    event(3, 64),
    event(4, 50),
    event(5, 62),
    event(6, 66),
  ], 55);
  assert.equal(rehomed.tonicPitchClass, 2);
  assert.deepEqual(rehomed.tonicPulses.map((item) => item.note), [50]);
  assert.deepEqual(rehomed.upperEvents.map((item) => item.note), [62, 66]);
  assert.equal(rehomed.ignoredPreTonicUpperCount, 2);
});

test("the split and retained histories are strictly bounded", () => {
  const history = Array.from({ length: 400 }, (_, index) => (
    index % 2 === 0
      ? event(index, 48, index * 10)
      : event(index, 60 + (index % 12), index * 10)
  ));
  const performance = splitScaleQualityPerformance(history, 59);

  assert.equal(performance.truncatedInput, true);
  assert.equal(performance.inputEventCount, SCALE_QUALITY_MAX_INPUT_EVENTS);
  assert.equal(performance.tonicPulses.length, SCALE_QUALITY_MAX_TONIC_PULSES);
  assert.equal(performance.upperEvents.length, SCALE_QUALITY_MAX_UPPER_EVENTS);
  assert.equal(performance.tonicEvent?.id, 398);
  assert.equal(performance.upperEvents.at(-1)?.id, 399);
});

test("split validation rejects hidden or unusable keyboard boundaries", () => {
  assert.throws(() => splitScaleQualityPerformance([], 35), /integer MIDI key from 36 through 71/);
  assert.throws(() => splitScaleQualityPerformance([], 72), /integer MIDI key from 36 through 71/);
  assert.throws(() => splitScaleQualityPerformance([], 59.5), /integer MIDI key from 36 through 71/);
});

test("complete upper collections rank their matching scale first without counting bass pulses", () => {
  const fixtures = [
    { id: "major", upper: [60, 62, 64, 65, 67, 69, 71] },
    { id: "natural-minor", upper: [60, 62, 63, 65, 67, 68, 70] },
    { id: "major-pentatonic", upper: [60, 62, 64, 67, 69] },
    { id: "minor-blues", upper: [60, 63, 65, 66, 67, 70] },
  ];

  fixtures.forEach((fixture) => {
    const source = [
      event(1, 48),
      ...fixture.upper.flatMap((note, index) => [event(index * 2 + 2, note), event(index * 2 + 3, 48)]),
    ];
    const performance = splitScaleQualityPerformance(source, 59);
    const candidates = rankScaleQualityCandidates(performance.upperEvents.map((item) => item.note), performance.tonicEvent!.note);
    assert.equal(candidates[0].scale.id, fixture.id);
    assert.equal(candidates[0].completeCollection, true);
    assert.deepEqual(candidates[0].outsideOffsets, []);
    assert.equal(candidates[0].distinctEvidenceCount, new Set(fixture.upper.map((note) => note % 12)).size);
    assert.equal(scaleQualityEvidenceStatus(candidates).id, "complete");
  });
});

test("an upper octave tonic remains evidence while repeated bass tonic pulses do not inflate it", () => {
  const once = splitScaleQualityPerformance([
    event(1, 48),
    event(2, 60),
    event(3, 62),
    event(4, 64),
  ], 59);
  const repeated = splitScaleQualityPerformance([
    event(1, 48),
    event(2, 60),
    event(3, 48),
    event(4, 62),
    event(5, 48),
    event(6, 64),
    event(7, 48),
  ], 59);
  const rank = (performance: ReturnType<typeof splitScaleQualityPerformance>) => rankScaleQualityCandidates(
    performance.upperEvents.map((item) => item.note),
    performance.tonicEvent!.note,
    SCALE_QUALITY_CATALOG.length,
  );
  const first = rank(once);
  const second = rank(repeated);

  assert.deepEqual(first.map((candidate) => candidate.scale.id), second.map((candidate) => candidate.scale.id));
  assert.deepEqual(first.map((candidate) => candidate.evidenceOffsets), second.map((candidate) => candidate.evidenceOffsets));
  assert.deepEqual(first[0].evidenceOffsets, [0, 2, 4], "the upper tonic octave is retained as offset zero");
});

test("candidate ranking is transposition invariant and duplicate upper notes add no false evidence", () => {
  const sourceNotes = [60, 62, 64, 65, 67, 69, 71, 71, 64];
  const shiftedNotes = sourceNotes.map((note) => note + 5);
  const source = rankScaleQualityCandidates(sourceNotes, 48, SCALE_QUALITY_CATALOG.length);
  const shifted = rankScaleQualityCandidates(shiftedNotes, 53, SCALE_QUALITY_CATALOG.length);

  assert.deepEqual(source.map((candidate) => candidate.scale.id), shifted.map((candidate) => candidate.scale.id));
  assert.deepEqual(source.map((candidate) => candidate.evidenceOffsets), shifted.map((candidate) => candidate.evidenceOffsets));
  assert.deepEqual(source.map((candidate) => candidate.matchFraction), shifted.map((candidate) => candidate.matchFraction));
  assert.equal(source[0].distinctEvidenceCount, 7);
});

test("thin and tied evidence stays explicitly uncertain instead of becoming a detected scale", () => {
  const thin = rankScaleQualityCandidates([60, 60], 48);
  assert.equal(scaleQualityEvidenceStatus(thin).id, "gathering");
  assert.equal(thin[0].distinctEvidenceCount, 1);

  const tied = rankScaleQualityCandidates([60, 62, 63], 48);
  assert.deepEqual(tied.slice(0, 2).map((candidate) => candidate.scale.id), ["natural-minor", "dorian"]);
  assert.equal(scaleQualityEvidenceStatus(tied).id, "ambiguous");

  const chromatic = rankScaleQualityCandidates(Array.from({ length: 12 }, (_, offset) => 60 + offset), 48);
  assert.equal(scaleQualityEvidenceStatus(chromatic).id, "contradicted");
  assert.ok(chromatic.every((candidate) => candidate.outsideOffsets.length > 0));
});

test("candidate inputs and limits stay validated and bounded", () => {
  assert.deepEqual(rankScaleQualityCandidates([], 48), []);
  assert.deepEqual(rankScaleQualityCandidates([60], 48, 0), []);
  assert.throws(() => rankScaleQualityCandidates([60], -1), /tonic must be a MIDI key/);
  assert.throws(() => rankScaleQualityCandidates([60], 128), /tonic must be a MIDI key/);
  assert.throws(() => rankScaleQualityCandidates([60], 48, -1), /non-negative integer/);
  const candidates = rankScaleQualityCandidates([60, 61, Number.NaN, 128, 62.5], 48, 3);
  assert.equal(candidates.length, 3);
  assert.deepEqual(candidates[0].evidenceOffsets, [0, 1]);
});

test("note profiles keep physical register, folded scale role, local gaps, and motion separate", () => {
  const major = catalogScale("major");
  const upperDo = scaleQualityNoteProfile(60, 48, major);
  assert.equal(upperDo.physicalSemitones, 12);
  assert.equal(upperDo.foldedOffset, 0);
  assert.equal(upperDo.degreeNumber, 1);
  assert.equal(upperDo.incomingGap, 1);
  assert.equal(upperDo.outgoingGap, 2);
  assert.deepEqual(upperDo.shortestHomeMoves, [0]);
  assert.equal(upperDo.frequencyRatio, 2);

  const mi = scaleQualityNoteProfile(64, 48, major, 62);
  assert.equal(mi.physicalSemitones, 16);
  assert.equal(mi.foldedOffset, 4);
  assert.equal(mi.degreeNumber, 3);
  assert.equal(mi.solfege, "Mi");
  assert.equal(mi.incomingGap, 2);
  assert.equal(mi.outgoingGap, 1);
  assert.equal(mi.moveFromPreviousUpper, 2);
  assert.ok(Math.abs(mi.frequencyRatio - 2 ** (16 / 12)) < 1e-12);

  const ti = scaleQualityNoteProfile(71, 48, major);
  assert.equal(ti.physicalSemitones, 23);
  assert.equal(ti.foldedOffset, 11);
  assert.equal(ti.intervalName, "compound major seventh");
  assert.deepEqual(ti.shortestHomeMoves, [1]);
  assert.equal(ti.outgoingGap, 1);
});

test("an unframed note still exposes exact interval geometry without inventing scale membership", () => {
  const profile = scaleQualityNoteProfile(67, 48, null, 64);

  assert.equal(profile.physicalSemitones, 19);
  assert.equal(profile.foldedOffset, 7);
  assert.equal(profile.moveFromPreviousUpper, 3);
  assert.equal(profile.inScale, false);
  assert.equal(profile.degreeNumber, null);
  assert.equal(profile.solfege, null);
  assert.deepEqual(profile.nearestScaleMoves, []);
});

test("an outside scale note preserves both equally near routes and both tritone home directions", () => {
  const major = catalogScale("major");
  const profile = scaleQualityNoteProfile(66, 48, major);
  assert.equal(profile.foldedOffset, 6);
  assert.equal(profile.inScale, false);
  assert.equal(profile.degreeNumber, null);
  assert.equal(profile.incomingGap, null);
  assert.equal(profile.outgoingGap, null);
  assert.deepEqual(profile.nearestScaleMoves, [-1, 1]);
  assert.deepEqual(profile.shortestHomeMoves, [-6, 6]);
});

test("spectral qualities exist only for exact simultaneous tonic and upper keys", () => {
  assert.equal(scaleQualityOverlapProfile(48, 64, [], "bright-piano"), null);
  assert.equal(scaleQualityOverlapProfile(48, 64, [48], "bright-piano"), null);
  assert.equal(scaleQualityOverlapProfile(48, 64, [60, 64], "bright-piano"), null, "an octave-equivalent tonic is not evidence that the low tonic is sounding");

  const bright = scaleQualityOverlapProfile(48, 64, [48, 64, 67], "bright-piano");
  const sine = scaleQualityOverlapProfile(48, 64, [48, 64], "sine");
  assert.ok(bright);
  assert.ok(sine);
  assert.equal(bright.tonicHz, sine.tonicHz);
  assert.equal(bright.upperHz, sine.upperHz);
  for (const value of [bright.overlap, bright.roughness, bright.harmonicity, bright.ambiguity, bright.fusion, bright.openness, bright.brightness]) {
    assert.ok(Number.isFinite(value));
    assert.ok(value >= 0 && value <= 1);
  }
  assert.notEqual(Math.round(bright.roughness * 10_000), Math.round(sine.roughness * 10_000));
  assert.notEqual(Math.round(bright.brightness * 10_000), Math.round(sine.brightness * 10_000));
});

test("note-profile validation rejects non-MIDI physical coordinates", () => {
  const major = catalogScale("major");
  assert.throws(() => scaleQualityNoteProfile(-1, 48, major), /valid MIDI keys/);
  assert.throws(() => scaleQualityNoteProfile(60.5, 48, major), /valid MIDI keys/);
  assert.throws(() => scaleQualityNoteProfile(60, 128, major), /valid MIDI keys/);
});
