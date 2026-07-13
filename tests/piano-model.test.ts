import assert from "node:assert/strict";
import test from "node:test";
import {
  LANDMARK_PATHS,
  PIANO_SCALES,
  articulationTimeline,
  chordTransitionEvidence,
  detectMotifTransformations,
  fifthStepForPitchClass,
  fifthsCircle,
  fifthsSpiral,
  frequencyFromMidi,
  groupChordGestures,
  identifyChordCandidates,
  inferScaleCandidates,
  intervalLandmark,
  landmarkStepPitchClasses,
  landmarkTransitionProfile,
  matchesLandmarkStep,
  nearbyScaleChords,
  noteContext,
  pairwiseIntervals,
  parseMidiMessage,
  scaleCoverage,
  scaleFrameTimeline,
  scaleSemitones,
  pushPhraseEvent,
  pushRollingNoteEvent,
  resolutionForks,
  resolutionDirection,
  scaleFingerprint,
  tonalTendency,
  tonalGravityCandidates,
  voiceChordNear,
  voiceLandmarkPath,
  voiceLeadingProfile,
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

test("keeps a bounded sixty-second phrase behind the seven-event microscope", () => {
  const attacks = Array.from({ length: 8 }, (_, index) => ({ id: index + 1, note: 60 + index, onsetMs: index * 10_000, fieldNotes: [60 + index] }));
  const phrase = attacks.reduce((current, attack) => pushPhraseEvent(current, attack, 60_000, 256), [] as typeof attacks);
  assert.deepEqual(phrase.map((attack) => attack.id), [2, 3, 4, 5, 6, 7, 8]);
  assert.deepEqual(pushPhraseEvent(phrase, { id: 9, note: 68, onsetMs: 80_000, fieldNotes: [68] }, 0), []);
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

test("lets a player correct automatic chord boundaries", () => {
  const attacks = [
    { id: 1, note: 60, onsetMs: 0, fieldNotes: [60] },
    { id: 2, note: 64, onsetMs: 40, fieldNotes: [60, 64] },
    { id: 3, note: 67, onsetMs: 80, fieldNotes: [60, 64, 67] },
    { id: 4, note: 62, onsetMs: 500, fieldNotes: [62] },
    { id: 5, note: 65, onsetMs: 540, fieldNotes: [62, 65] },
  ];
  const split = groupChordGestures(attacks, 100, 200, { 3: "break" });
  assert.deepEqual(split.map((gesture) => gesture.attackedNotes), [[60, 64], [62, 65]]);

  const joined = groupChordGestures(attacks.slice(0, 4), 100, 200, { 4: "join" });
  assert.deepEqual(joined.map((gesture) => gesture.attackedNotes), [[60, 64, 67, 62]]);
  assert.equal(joined[0].spreadMs, 500);
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

test("draws explicit held, contrary, parallel, and changing voice strands", () => {
  const contrary = voiceLeadingProfile([60, 64, 67], [60, 62, 69]);
  assert.deepEqual(contrary.strands.map((strand) => [strand.from, strand.to, strand.motion]), [
    [60, 60, "held"],
    [64, 62, "down"],
    [67, 69, "up"],
  ]);
  assert.deepEqual(contrary.motionClasses, ["contrary", "oblique"]);
  assert.equal(contrary.largestLeap, 2);
  assert.equal(contrary.totalMotion, 4);
  assert.equal(contrary.bassMotion, 0);

  const parallel = voiceLeadingProfile([60, 64], [62, 66, 69]);
  assert.ok(parallel.motionClasses.includes("parallel"));
  assert.ok(parallel.motionClasses.includes("changing voice count"));
  assert.equal(parallel.strands.filter((strand) => strand.motion === "added").length, 1);
});

test("voices nearby chords near the current hand position", () => {
  assert.deepEqual(voiceChordNear([5, 9, 0], [60, 64, 67], 64), [60, 65, 69]);
  assert.deepEqual(voiceChordNear([7, 11, 2], [60, 64, 67], 64), [59, 62, 67]);
  assert.deepEqual(voiceChordNear([], [60, 64, 67], 64), []);
  assert.deepEqual(voiceChordNear([0, 4, 7], [], Number.NaN), []);
  assert.deepEqual(voiceChordNear([0, 1, 2, 3, 4, 5, 6], [60], 60), []);
  assert.deepEqual(voiceChordNear([Number.NaN], [60], 60), []);
});

test("defines transposable, generated landmark paths without song transcriptions", () => {
  assert.deepEqual(LANDMARK_PATHS.map((path) => path.id), ["pop-loop", "blues-turn", "classical-cadence", "pedal-field"]);
  for (const path of LANDMARK_PATHS) {
    assert.ok(path.steps.length >= 3);
    assert.match(path.provenance, /Generated/);
    for (const step of path.steps) {
      assert.ok(step.pitchOffsets.length >= 3);
      assert.ok(step.pitchOffsets.every((offset) => Number.isInteger(offset) && offset >= 0 && offset < 12));
    }
  }
});

test("transposes a landmark as one relationship-preserving path", () => {
  const path = LANDMARK_PATHS[0];
  const inC = landmarkStepPitchClasses(path, 1, 0);
  const inD = landmarkStepPitchClasses(path, 1, 2);
  assert.deepEqual(inC, [2, 7, 11]);
  assert.deepEqual(inD, [1, 4, 9]);
  assert.deepEqual(landmarkStepPitchClasses(path, 99, 0), []);
});

test("matches landmark targets by pitch class while keeping voicing stable", () => {
  const path = LANDMARK_PATHS.find((item) => item.id === "classical-cadence")!;
  assert.equal(matchesLandmarkStep(path, 0, [50, 53, 57], 0), true);
  assert.equal(matchesLandmarkStep(path, 0, [62, 65], 0), false);
  assert.equal(matchesLandmarkStep(path, 0, [50, 53, 58], 0), false);
  const first = voiceLandmarkPath(path, 60);
  const second = voiceLandmarkPath(path, 60);
  assert.deepEqual(first, second);
  assert.equal(first.length, path.steps.length);
  assert.ok(first.every((voicing) => voicing.every((note) => note >= 48 && note <= 72)));
});

test("explains each landmark transition through shared tones, hand motion, and fifths travel", () => {
  const path = LANDMARK_PATHS.find((item) => item.id === "pedal-field")!;
  const transition = landmarkTransitionProfile(path, 1, 60)!;
  assert.equal(transition.commonPitchClassCount, 1);
  assert.ok(transition.totalVoiceMotion > 0);
  assert.ok(transition.largestLeap > 0);
  assert.equal(transition.rootTravelSteps, 1);
  assert.equal(landmarkTransitionProfile(path, 0, 60), null);
});

test("waits for enough distinct evidence before stabilizing a scale frame", () => {
  const timeline = scaleFrameTimeline([60, 62, 64, 65, 67, 69, 71]);
  assert.equal(timeline[2].stable, null);
  assert.equal(timeline[2].evidenceLabel, "little evidence");
  assert.equal(timeline[3].changed, true);
  assert.equal(timeline.at(-1)?.stable?.scale.id, "bright-seven");
  assert.equal(timeline.at(-1)?.stable?.rootPitchClass, 0);
  const octaveReturn = scaleFrameTimeline([60, 62, 64, 65, 67, 69, 71, 72]);
  assert.equal(octaveReturn.at(-1)?.stable?.scale.id, "bright-seven");
  assert.equal(octaveReturn.at(-1)?.stable?.rootPitchClass, 0);
});

test("keeps a scale fingerprint invariant while rotating its starting gap", () => {
  const scale = PIANO_SCALES[0];
  const original = scaleFingerprint(scale);
  const rotated = scaleFingerprint(scale, 2);
  assert.deepEqual(original.steps, [2, 2, 1, 2, 2, 2, 1]);
  assert.deepEqual(rotated.steps, [1, 2, 2, 2, 1, 2, 2]);
  assert.equal(original.total, 12);
  assert.equal(rotated.total, 12);
  assert.deepEqual(scaleFingerprint(scale, 9).steps, rotated.steps);
});

test("decomposes performed tonal gravity instead of treating pitch membership as a detected key", () => {
  const phrase = [
    { note: 60, onsetMs: 0, keyReleaseMs: 900, releaseMs: 900, velocity: 118 },
    { note: 64, onsetMs: 1_000, keyReleaseMs: 1_220, releaseMs: 1_220, velocity: 76 },
    { note: 67, onsetMs: 1_400, keyReleaseMs: 1_650, releaseMs: 1_650, velocity: 82 },
    { note: 60, onsetMs: 1_900, keyReleaseMs: 2_700, releaseMs: 2_700, velocity: 112 },
  ];
  const candidates = tonalGravityCandidates(phrase, 2_700, 12);
  assert.equal(candidates.length, 12);
  assert.equal(candidates[0].rootPitchClass, 0);
  assert.equal(candidates[0].scale.id, "bright-seven");
  assert.equal(candidates[0].components.recurrence, 1);
  assert.equal(candidates[0].components.ending, 1);
  assert.ok(candidates[0].components.duration > 0.9);
  assert.ok(candidates[0].score > candidates[1].score);
  assert.deepEqual(tonalGravityCandidates([], 0), []);
});

test("offers contrasting unranked resolution forks without entering a note", () => {
  const forks = resolutionForks([{ note: 60 }, { note: 64 }, { note: 71 }], 0, PIANO_SCALES[0], 4);
  assert.equal(forks.length, 4);
  assert.equal(forks[0].id, "center-return");
  assert.equal(forks[0].pitchClass, 0);
  assert.equal(new Set(forks.map((fork) => fork.pitchClass)).size, forks.length);
  assert.ok(forks.some((fork) => fork.id === "fifths-neighbor" && fork.pitchClass === 7));
  assert.deepEqual(resolutionForks([], 0, PIANO_SCALES[0]), []);
});

test("separates finger duration, pedal extension, overlap, and silence", () => {
  const timeline = articulationTimeline([
    { id: 1, note: 60, onsetMs: 0, keyReleaseMs: 200, releaseMs: 200 },
    { id: 2, note: 62, onsetMs: 500, keyReleaseMs: 1_000, releaseMs: 1_000 },
    { id: 3, note: 64, onsetMs: 1_000, keyReleaseMs: 1_300, releaseMs: 1_800 },
    { id: 4, note: 65, onsetMs: 1_500, keyReleaseMs: 2_000, releaseMs: 2_000 },
    { id: 5, note: 67, onsetMs: 1_800, keyReleaseMs: 2_200, releaseMs: 2_200 },
  ], 2_200);
  assert.deepEqual(timeline.map((item) => item.kind), ["detached", "connected", "pedal-joined", "finger-overlap", "phrase-end"]);
  assert.equal(timeline[0].silenceMs, 300);
  assert.equal(timeline[2].fingerMs, 300);
  assert.equal(timeline[2].pedalMs, 500);
  assert.equal(timeline[2].overlapMs, 300);
  assert.equal(articulationTimeline([{ id: 1, note: 60, onsetMs: 0, keyReleaseMs: null, releaseMs: null }], 450)[0].kind, "held");
});

function motifEvents(notes: number[], onsets: number[]) {
  return notes.map((note, index) => ({ id: index + 1, note, onsetMs: onsets[index] }));
}

test("distinguishes exact and transposed motif recurrences", () => {
  const exact = detectMotifTransformations(motifEvents([60, 62, 64, 60, 62, 64], [0, 100, 200, 500, 600, 700]));
  assert.equal(exact[0].kind, "exact-repeat");
  assert.deepEqual(exact[0].sourceEventIds, [1, 2, 3]);
  assert.deepEqual(exact[0].targetEventIds, [4, 5, 6]);
  assert.equal(exact[0].transpositionSemitones, 0);

  const transposed = detectMotifTransformations(motifEvents([60, 62, 64, 67, 69, 71], [0, 100, 200, 500, 600, 700]));
  assert.equal(transposed[0].kind, "transposed-repeat");
  assert.equal(transposed[0].transpositionSemitones, 7);
});

test("distinguishes rhythmic variation, altered endings, and return after intervening material", () => {
  const rhythm = detectMotifTransformations(motifEvents([60, 62, 64, 60, 62, 64], [0, 100, 200, 500, 550, 700]));
  assert.equal(rhythm[0].kind, "rhythmic-variation");
  assert.ok(rhythm[0].rhythmDistance > 0.12);

  const altered = detectMotifTransformations(motifEvents([60, 62, 64, 65, 67, 69, 71, 65], [0, 100, 200, 300, 600, 700, 800, 900]));
  assert.equal(altered[0].kind, "altered-ending");
  assert.notEqual(altered[0].endingDeltaSemitones, 0);

  const returned = detectMotifTransformations(motifEvents([60, 62, 64, 66, 67, 60, 62, 64], [0, 100, 200, 300, 400, 700, 800, 900]));
  assert.equal(returned[0].kind, "exact-repeat");
  assert.equal(returned[0].returnAfterInterveningMaterial, true);
  assert.deepEqual(detectMotifTransformations([]), []);
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

test("morphs a nonclosing pure-fifths spiral into a closing equal-key circle", () => {
  const pure = fifthsSpiral(0);
  const halfway = fifthsSpiral(0.5);
  const equal = fifthsSpiral(1);
  assert.equal(pure.nodes.length, 13);
  assert.equal(pure.nodes[1].foldedRatio, 1.5);
  assert.ok(Math.abs(pure.nodes[12].displayedFoldedCents - 23.46) < 0.02);
  assert.ok(Math.abs(pure.closureDriftCents - 23.46) < 0.02);
  assert.ok(halfway.closureDriftCents > 0 && halfway.closureDriftCents < pure.closureDriftCents);
  assert.ok(Math.abs(equal.displayedFifthCents - 700) < 1e-12);
  assert.ok(Math.abs(equal.nodes[12].displayedFoldedCents) < 1e-10);
  assert.ok(Math.abs(equal.closureDriftCents) < 1e-10);
  assert.deepEqual(equal.nodes.slice(0, 4).map((node) => node.pitchClass), [0, 7, 2, 9]);
});

test("parses note, zero-velocity note-off, and sustain MIDI messages", () => {
  assert.deepEqual(parseMidiMessage([0x91, 60, 100]), { type: "note-on", note: 60, velocity: 100, channel: 1 });
  assert.deepEqual(parseMidiMessage([0x91, 60, 0]), { type: "note-off", note: 60, channel: 1 });
  assert.deepEqual(parseMidiMessage([0x80, 64, 25]), { type: "note-off", note: 64, channel: 0 });
  assert.deepEqual(parseMidiMessage([0xb0, 64, 127]), { type: "sustain", down: true, channel: 0 });
  assert.deepEqual(parseMidiMessage([0xb0, 64, 0]), { type: "sustain", down: false, channel: 0 });
});
