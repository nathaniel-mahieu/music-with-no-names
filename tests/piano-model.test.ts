import assert from "node:assert/strict";
import test from "node:test";
import {
  PIANO_SCALES,
  chordTransitionEvidence,
  fifthStepForPitchClass,
  fifthsCircle,
  frequencyFromMidi,
  groupChordGestures,
  identifyChordCandidates,
  inferScaleCandidates,
  intervalLandmark,
  nearbyScaleChords,
  noteContext,
  pairwiseIntervals,
  parseMidiMessage,
  scaleCoverage,
  scaleFrameTimeline,
  scaleSemitones,
  pushRollingNoteEvent,
  resolutionDirection,
  tonalTendency,
  voiceChordNear,
} from "../lib/piano-model.ts";

test("maps equal-tempered MIDI notes to physical frequency", () => {
  assert.equal(frequencyFromMidi(69), 440);
  assert.ok(Math.abs(frequencyFromMidi(60) - 261.625565) < 0.00001);
  assert.ok(Math.abs(frequencyFromMidi(72) / frequencyFromMidi(60) - 2) < 1e-12);
});

test("builds each scale as an octave-closing route", () => {
  for (const scale of PIANO_SCALES) {
    assert.equal(scale.steps.reduce((sum, step) => sum + step, 0), 12);
    assert.equal(scaleSemitones(scale).length, scale.solfege.length);
    assert.deepEqual(scaleSemitones(scale).slice(0, 1), [0]);
  }
  assert.deepEqual(scaleSemitones(PIANO_SCALES[0]), [0, 2, 4, 5, 7, 9, 11]);
  assert.deepEqual(scaleSemitones(PIANO_SCALES[3]), [0, 3, 5, 6, 7, 10]);
});

test("keeps movable-Do context invariant under transposition", () => {
  const scale = PIANO_SCALES[0];
  const low = noteContext(67, 60, scale);
  const high = noteContext(74, 67, scale);
  assert.equal(low.syllable, "Sol");
  assert.equal(high.syllable, "Sol");
  assert.equal(low.stepsWithinOctave, high.stepsWithinOctave);
  assert.equal(low.ratioToDo, high.ratioToDo);
});

test("describes keyboard intervals beside nearby physical landmarks", () => {
  const fifth = intervalLandmark(7);
  assert.equal(fifth.relationship, "3:2 region");
  assert.ok(Math.abs(Math.abs(fifth.errorCents) - 1.955) < 0.01);
  const octave = intervalLandmark(12);
  assert.equal(octave.equalKeyboardRatio, 2);
  assert.equal(octave.errorCents, 0);
  assert.equal(pairwiseIntervals([60, 64, 67]).length, 3);
});

test("measures scale membership without turning it into quality", () => {
  const scale = PIANO_SCALES[0];
  const inside = scaleCoverage([60, 64, 67], 60, scale);
  assert.equal(inside.fraction, 1);
  assert.equal(inside.hasHome, true);
  const mixed = scaleCoverage([60, 61, 67], 60, scale);
  assert.equal(mixed.inScaleCount, 2);
  assert.equal(mixed.fraction, 2 / 3);
});

test("ranks compatible scale and center frames without claiming certainty", () => {
  const phrase = [60, 62, 64, 65, 67, 69, 71];
  const candidates = inferScaleCandidates(phrase, 4);
  assert.equal(candidates.length, 4);
  assert.equal(candidates[0].scale.id, "bright-seven");
  assert.equal(candidates[0].rootPitchClass, 0);
  assert.ok(Math.abs(candidates[0].fit - 1) < 1e-12);
  assert.equal(candidates[0].uniqueNoteCount, 7);
  assert.deepEqual(inferScaleCandidates([], 4), []);
});

test("keeps repeated attacks in a strict seven-event rolling trace", () => {
  const events = Array.from({ length: 8 }, (_, index) => ({ note: index === 7 ? 66 : 60 + index, id: index }));
  const trace = events.reduce((current, event) => pushRollingNoteEvent(current, event, 7), [] as typeof events);
  assert.equal(trace.length, 7);
  assert.deepEqual(trace.map((event) => event.id), [1, 2, 3, 4, 5, 6, 7]);
  assert.equal(pushRollingNoteEvent([{ note: 60 }], { note: 60 }, 7).length, 2);
});

test("groups temporally compact attacks without chaining past the maximum span", () => {
  const attacks = [
    { id: 1, note: 60, onsetMs: 0, fieldNotes: [60] },
    { id: 2, note: 64, onsetMs: 70, fieldNotes: [60, 64] },
    { id: 3, note: 67, onsetMs: 140, fieldNotes: [60, 64, 67] },
    { id: 4, note: 62, onsetMs: 210, fieldNotes: [60, 62, 64, 67] },
    { id: 5, note: 65, onsetMs: 280, fieldNotes: [62, 65] },
  ];
  const gestures = groupChordGestures(attacks, 80, 200);
  assert.equal(gestures.length, 2);
  assert.deepEqual(gestures[0].attackedNotes, [60, 64, 67]);
  assert.deepEqual(gestures[1].attackedNotes, [62, 65]);
  assert.equal(gestures[0].spreadMs, 140);
  assert.equal(gestures[0].kind, "rolled");
});

test("keeps inherited sounding tones separate from chord attacks", () => {
  const gestures = groupChordGestures([
    { id: 1, note: 64, onsetMs: 100, fieldNotes: [48, 60, 64] },
    { id: 2, note: 67, onsetMs: 150, fieldNotes: [48, 60, 64, 67] },
  ], 80, 160);
  assert.equal(gestures.length, 1);
  assert.deepEqual(gestures[0].attackedNotes, [64, 67]);
  assert.deepEqual(gestures[0].inheritedNotes, [48, 60]);
  assert.deepEqual(gestures[0].soundingNotesAtClose, [48, 60, 64, 67]);
  assert.equal(gestures[0].kind, "together");
});

test("requires two distinct pitch classes before naming a temporal chord", () => {
  const repeated = groupChordGestures([
    { id: 1, note: 60, onsetMs: 0, fieldNotes: [60] },
    { id: 2, note: 60, onsetMs: 40, fieldNotes: [60] },
  ], 80, 160);
  assert.deepEqual(repeated, []);
  assert.deepEqual(groupChordGestures([], 0, 0), []);
});

test("separates chord pitch-set novelty, voice motion, and fifths travel", () => {
  const sameShapeMoved = chordTransitionEvidence([60, 64, 67], [62, 65, 69], 0, 2);
  assert.equal(sameShapeMoved.commonPitchClassCount, 0);
  assert.equal(sameShapeMoved.pitchSetNovelty, 1);
  assert.ok(sameShapeMoved.voiceMotion > 0);
  assert.equal(sameShapeMoved.rootTravelSteps, 2);
  assert.equal(sameShapeMoved.rootTravel, 2 / 6);
  assert.deepEqual(chordTransitionEvidence(null, [60, 64, 67]), {
    commonPitchClassCount: 0,
    pitchSetNovelty: 0,
    voiceMotion: 0,
    rootTravel: 0,
    rootTravelSteps: null,
  });
});

test("voices nearby chords near the current hand position", () => {
  assert.deepEqual(voiceChordNear([5, 9, 0], [60, 64, 67], 64), [60, 65, 69]);
  assert.deepEqual(voiceChordNear([7, 11, 2], [60, 64, 67], 64), [59, 62, 67]);
  assert.deepEqual(voiceChordNear([], [60, 64, 67], 64), []);
  assert.deepEqual(voiceChordNear([0, 4, 7], [], Number.NaN), []);
  assert.deepEqual(voiceChordNear([0, 1, 2, 3, 4, 5, 6], [60], 60), []);
  assert.deepEqual(voiceChordNear([Number.NaN], [60], 60), []);
});

test("waits for enough distinct evidence before stabilizing a scale frame", () => {
  const timeline = scaleFrameTimeline([60, 62, 64, 65, 67, 69, 71]);
  assert.equal(timeline[2].stable, null);
  assert.equal(timeline[2].evidenceLabel, "little evidence");
  assert.equal(timeline[3].changed, true);
  assert.equal(timeline.at(-1)?.stable?.scale.id, "bright-seven");
  assert.equal(timeline.at(-1)?.stable?.rootPitchClass, 0);
});

test("separates exact chord identity, inversion, and incomplete outlines", () => {
  const candidates = identifyChordCandidates([64, 67, 72, 72], 3);
  assert.equal(candidates[0].exact, true);
  assert.equal(candidates[0].template.id, "major");
  assert.equal(candidates[0].rootPitchClass, 0);
  assert.equal(candidates[0].inversion, 1);
  assert.equal(candidates[1].exact, false);
  assert.ok(candidates[1].missingPitchClasses.length > 0);
});

test("ranks nearby scale chords by retained tones and names the concrete move", () => {
  const neighbors = nearbyScaleChords([60, 64, 67], 60, PIANO_SCALES[0], 3);
  assert.equal(neighbors.length, 3);
  assert.equal(neighbors[0].commonPitchClasses.length, 2);
  assert.match(neighbors[0].instruction, /^keep 2 · move /);
  assert.equal(neighbors[0].candidate?.exact, true);
});

test("separates pull toward Do from evidence that Do has arrived", () => {
  const scale = PIANO_SCALES[0];
  const away = tonalTendency([67, 71, 74], 60, scale);
  const home = tonalTendency([60, 64, 67], 60, scale);
  assert.equal(away.hasHome, false);
  assert.equal(away.directNeighborCount, 1);
  assert.ok(away.homePull > home.homePull);
  assert.ok(home.homeEvidence > away.homeEvidence);

  assert.equal(resolutionDirection(null, 0.5).label, "first field · building a baseline");
  assert.equal(resolutionDirection(0.4, 0.52).label, "tending toward repose");
  assert.equal(resolutionDirection(0.6, 0.49).label, "moving away from repose");
});

test("derives the circle from stacked fifths and exposes its closure mismatch", () => {
  const circle = fifthsCircle();
  assert.equal(circle.nodes.length, 12);
  assert.deepEqual(circle.nodes.slice(0, 4).map((node) => node.syllable), ["Do", "Sol", "Re", "La"]);
  assert.ok(Math.abs(circle.nodes[1].foldedRatio - 1.5) < 1e-12);
  assert.ok(Math.abs(circle.nodes[1].driftCents - 1.955) < 0.01);
  assert.ok(Math.abs(circle.closureDriftCents - 23.46) < 0.02);
  for (const node of circle.nodes) assert.equal(fifthStepForPitchClass(node.pitchClass), node.step);
});

test("parses note, zero-velocity note-off, and sustain MIDI messages", () => {
  assert.deepEqual(parseMidiMessage([0x91, 60, 100]), { type: "note-on", note: 60, velocity: 100, channel: 1 });
  assert.deepEqual(parseMidiMessage([0x91, 60, 0]), { type: "note-off", note: 60, channel: 1 });
  assert.deepEqual(parseMidiMessage([0x80, 64, 25]), { type: "note-off", note: 64, channel: 0 });
  assert.deepEqual(parseMidiMessage([0xb0, 64, 127]), { type: "sustain", down: true, channel: 0 });
  assert.deepEqual(parseMidiMessage([0xb0, 64, 0]), { type: "sustain", down: false, channel: 0 });
});
