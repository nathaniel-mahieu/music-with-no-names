import assert from "node:assert/strict";
import test from "node:test";
import {
  CONTROLLED_SONORITY_FIELDS,
  LANDMARK_PATHS,
  PIANO_SCALES,
  TONAL_GRAVITY_WEIGHTS,
  articulationTimeline,
  chordGapFingerprint,
  chordTransitionEvidence,
  compareChordGapMutation,
  compareChordGestureTiming,
  compareChordMotionEcho,
  compareChordVoicingEcho,
  compareIntervalEcho,
  compareMotifEcho,
  compareMotifFingerprints,
  comparePhraseEndingRipple,
  comparePhrasePauseMutation,
  compareScaleGapMutation,
  compareScaleLandingIntervalRipple,
  comparePhraseLenses,
  phraseChangeProfile,
  controlledSonorityChange,
  detectMotifTransformations,
  evaluateAscendingScaleWalk,
  evaluatePerformedScaleFingerprint,
  fifthStepForPitchClass,
  fifthsCircle,
  fifthsSpiral,
  frequencyFromMidi,
  groupChordGestures,
  identifyChordCandidates,
  interpretedChordNotes,
  inferScaleCandidates,
  intervalLandmark,
  landmarkStepPitchClasses,
  landmarkCounterfactualProfile,
  landmarkTranspositionProfile,
  landmarkTransitionProfile,
  motifReturnArc,
  matchesLandmarkStep,
  matchScaleFingerprint,
  nearbyScaleChords,
  noteContext,
  pairwiseIntervals,
  parseMidiMessage,
  phraseBreathMap,
  scaleCoverage,
  scaleFrameTimeline,
  scaleSemitones,
  pushPhraseEvent,
  pushRollingNoteEvent,
  resolutionForks,
  resolutionLandingEvidence,
  resolutionDirection,
  scaleFingerprint,
  tonalTendency,
  tonalGravityCandidates,
  tonalGravityCounterfactual,
  voiceChordNear,
  voiceLandmarkCounterfactual,
  voiceLandmarkPath,
  voiceLeadingProfile,
  type TonalGravityCandidate,
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

test("walks an ascending scale from Do in any MIDI octave", () => {
  const scale = PIANO_SCALES[0];
  const low = evaluateAscendingScaleWalk([36, 38, 40, 41, 43, 45, 47, 48], 0, scale);
  const high = evaluateAscendingScaleWalk([60, 62, 64, 65, 67, 69, 71, 72], 0, scale);
  assert.equal(low.status, "complete");
  assert.equal(high.status, "complete");
  assert.deepEqual(low.matchedNotes.map((note) => note - low.baseMidi!), high.matchedNotes.map((note) => note - high.baseMidi!));
  assert.deepEqual(high.routeOffsets, [0, 2, 4, 5, 7, 9, 11, 12]);
  assert.equal(high.lastAttempt?.kind, "complete");
});

test("keeps scale-walk progress after a wrong gap and explains the retry", () => {
  const scale = PIANO_SCALES[0];
  const waiting = evaluateAscendingScaleWalk([61], 0, scale);
  assert.equal(waiting.status, "waiting-do");
  assert.equal(waiting.lastAttempt?.kind, "find-do");
  const retry = evaluateAscendingScaleWalk([60, 62, 63], 0, scale);
  assert.equal(retry.status, "walking");
  assert.equal(retry.nextIndex, 2);
  assert.equal(retry.expectedMidi, 64);
  assert.equal(retry.lastAttempt?.expectedGap, 2);
  assert.equal(retry.lastAttempt?.actualGap, 1);
  assert.equal(retry.errorCount, 1);
  const corrected = evaluateAscendingScaleWalk([60, 62, 63, 64], 0, scale);
  assert.equal(corrected.nextIndex, 3);
  assert.deepEqual(corrected.matchedNotes, [60, 62, 64]);
});

test("restarts an active scale walk when Do is played in a new octave", () => {
  const scale = PIANO_SCALES[0];
  const restarted = evaluateAscendingScaleWalk([48, 50, 60], 0, scale);
  assert.equal(restarted.status, "walking");
  assert.equal(restarted.baseMidi, 60);
  assert.equal(restarted.nextIndex, 1);
  assert.deepEqual(restarted.matchedNotes, [60]);
  assert.equal(restarted.lastAttempt?.kind, "restarted");
});

test("builds an unnamed scale fingerprint from an arbitrary performed origin", () => {
  const low = evaluatePerformedScaleFingerprint([48, 50, 52, 53, 55, 57, 59, 60]);
  const high = evaluatePerformedScaleFingerprint([61, 63, 65, 66, 68, 70, 72, 73]);
  assert.equal(low.status, "complete");
  assert.equal(high.status, "complete");
  assert.deepEqual(low.steps, [2, 2, 1, 2, 2, 2, 1]);
  assert.deepEqual(high.steps, low.steps);
  assert.deepEqual(high.positions, low.positions);
  assert.equal(high.octaveRemaining, 0);
});

test("preserves a performed fingerprint after descending or overshooting attacks", () => {
  const result = evaluatePerformedScaleFingerprint([60, 62, 61, 64, 75, 65, 67, 69, 71, 72]);
  assert.equal(result.status, "complete");
  assert.deepEqual(result.matchedNotes, [60, 62, 64, 65, 67, 69, 71, 72]);
  assert.deepEqual(result.steps, [2, 2, 1, 2, 2, 2, 1]);
  assert.equal(result.errorCount, 2);
});

test("repairs only the wrong gap while replaying a fingerprint elsewhere", () => {
  const expected = [2, 2, 1, 2, 2, 2, 1];
  const retry = evaluatePerformedScaleFingerprint([55, 57, 58], expected);
  assert.equal(retry.status, "building");
  assert.deepEqual(retry.steps, [2]);
  assert.equal(retry.expectedGap, 2);
  assert.equal(retry.lastAttempt?.reason, "wrong-gap");
  const repaired = evaluatePerformedScaleFingerprint([55, 57, 58, 59, 60, 62, 64, 66, 67], expected);
  assert.equal(repaired.status, "complete");
  assert.deepEqual(repaired.steps, expected);
  assert.equal(repaired.errorCount, 1);
  assert.deepEqual(evaluatePerformedScaleFingerprint([60, 72], [6, 6, 1]).steps, [12]);
});

test("shows how one changed scale landing trades space between neighboring gaps", () => {
  const source = [2, 2, 1, 2, 2, 2, 1];
  const loweredThird = compareScaleGapMutation(source, [2, 1, 2, 2, 2, 2, 1]);
  assert.equal(loweredThird.kind, "one-position");
  assert.deepEqual(loweredThird.sourcePositions, [0, 2, 4, 5, 7, 9, 11, 12]);
  assert.deepEqual(loweredThird.attemptPositions, [0, 2, 3, 5, 7, 9, 11, 12]);
  assert.deepEqual(loweredThird.sourceOnlyPositions, [4]);
  assert.deepEqual(loweredThird.attemptOnlyPositions, [3]);
  assert.deepEqual(loweredThird.retainedPositions, [0, 2, 5, 7, 9, 11, 12]);
  assert.equal(loweredThird.movedSteps, -1);
  assert.deepEqual(loweredThird.gapDeltas, [0, -1, 1, 0, 0, 0, 0]);
  assert.equal(loweredThird.changedGapCount, 2);
  assert.equal(loweredThird.sourceSteps.reduce((sum, step) => sum + step, 0), 12);
  assert.equal(loweredThird.attemptSteps.reduce((sum, step) => sum + step, 0), 12);

  const same = compareScaleGapMutation(source, source);
  assert.equal(same.kind, "same");
  assert.equal(same.changedPositionCount, 0);
  assert.equal(compareScaleGapMutation(source, [2, 2, 2, 2, 2, 2]).kind, "different-count");
  assert.equal(compareScaleGapMutation(source, [1, 2, 2, 2, 2, 2, 1]).kind, "multiple");
  const wideMove = compareScaleGapMutation(source, [2, 3, 2, 1, 1, 2, 1]);
  assert.equal(wideMove.kind, "wide-position");
  assert.equal(wideMove.movedSteps, 4);
  assert.throws(() => compareScaleGapMutation(source, [2, 2, 1]), RangeError);
  assert.throws(() => compareScaleGapMutation([0, 12], [6, 6]), RangeError);
});

test("shows the global interval ripple caused by one local scale landing move", () => {
  const source = [2, 2, 1, 2, 2, 2, 1];
  const lowered = [2, 1, 2, 2, 2, 2, 1];
  const ripple = compareScaleLandingIntervalRipple(source, lowered)!;
  assert.equal(ripple.sourcePosition, 4);
  assert.equal(ripple.attemptPosition, 3);
  assert.equal(ripple.movedSteps, -1);
  assert.equal(ripple.changedRelationshipCount, 7);
  assert.equal(ripple.retainedRelationshipCount, 21);
  assert.deepEqual(ripple.relationships.map((relationship) => relationship.retainedPosition), [0, 2, 5, 7, 9, 11, 12]);
  assert.deepEqual(ripple.relationships.map((relationship) => relationship.sourceDistanceSteps), [4, 2, 1, 3, 5, 7, 8]);
  assert.deepEqual(ripple.relationships.map((relationship) => relationship.attemptDistanceSteps), [3, 1, 2, 4, 6, 8, 9]);
  assert.ok(ripple.relationships.every((relationship) => Math.abs(relationship.distanceDelta) === 1));
  assert.ok(Math.abs(ripple.relationships[0].sourceFrequencyRatio - 2 ** (4 / 12)) < 1e-12);
  assert.ok(Math.abs(ripple.relationships[0].attemptFrequencyRatio - 2 ** (3 / 12)) < 1e-12);
  assert.equal(compareScaleLandingIntervalRipple(source, source), null);
  assert.equal(compareScaleLandingIntervalRipple(source, [2, 3, 2, 1, 1, 2, 1]), null);
});

test("translates exact and rotated fingerprints only after structure is known", () => {
  const exact = matchScaleFingerprint([2, 2, 1, 2, 2, 2, 1]);
  assert.equal(exact[0].scale.id, "bright-seven");
  assert.equal(exact[0].rotation, 0);
  assert.equal(exact[0].exactFromDo, true);
  const rotated = matchScaleFingerprint([1, 2, 2, 2, 1, 2, 2]);
  assert.equal(rotated[0].scale.id, "bright-seven");
  assert.equal(rotated[0].rotation, 2);
  assert.equal(matchScaleFingerprint([2, 2, 2, 2, 2, 2]).length, 0);
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

test("separates an echoed interval invariant from changed physical coordinates", () => {
  const octaveHigher = compareIntervalEcho([60, 67], [72, 79]);
  assert.equal(octaveHigher.matched, true);
  assert.equal(octaveHigher.directionPreserved, true);
  assert.equal(octaveHigher.uniformShiftSteps, 12);
  assert.equal(octaveHigher.centerShiftSteps, 12);
  assert.ok(Math.abs(octaveHigher.equalKeyboardRatio - 2 ** (7 / 12)) < 1e-12);
  assert.ok(Math.abs(octaveHigher.attemptFrequencyGapHz / octaveHigher.sourceFrequencyGapHz - 2) < 1e-12);

  const reversed = compareIntervalEcho([60, 67], [79, 72]);
  assert.equal(reversed.matched, true);
  assert.equal(reversed.directionPreserved, false);
  assert.equal(reversed.uniformShiftSteps, null);
  assert.equal(compareIntervalEcho([60, 67], [72, 78]).matched, false);
  assert.throws(() => compareIntervalEcho([60, Number.NaN], [72, 79]), RangeError);
});

test("separates a chord relationship from voicing, register, bass role, and doubling", () => {
  const inversion = compareChordVoicingEcho([60, 64, 67], [64, 67, 72]);
  assert.ok(inversion);
  assert.equal(inversion.relationshipPreserved, true);
  assert.equal(inversion.pitchClassIdentityPreserved, true);
  assert.equal(inversion.transpositionSteps, 0);
  assert.equal(inversion.bassRoleChanged, true);
  assert.deepEqual(inversion.sourceBassRelativeShape, [0, 4, 7]);
  assert.deepEqual(inversion.attemptBassRelativeShape, [0, 3, 8]);
  assert.equal(inversion.sourceSpan, 7);
  assert.equal(inversion.attemptSpan, 8);
  assert.equal(inversion.centerShiftSteps, 4);
  assert.equal(inversion.uniformPhysicalShiftSteps, null);

  const transposed = compareChordVoicingEcho([60, 64, 67], [62, 66, 69]);
  assert.ok(transposed);
  assert.equal(transposed.relationshipPreserved, true);
  assert.equal(transposed.pitchClassIdentityPreserved, false);
  assert.equal(transposed.transpositionSteps, 2);
  assert.equal(transposed.bassRoleChanged, false);
  assert.equal(transposed.uniformPhysicalShiftSteps, 2);

  const octave = compareChordVoicingEcho([60, 64, 67], [72, 76, 79]);
  assert.ok(octave);
  assert.equal(octave.pitchClassIdentityPreserved, true);
  assert.equal(octave.uniformPhysicalShiftSteps, 12);

  const doubled = compareChordVoicingEcho([60, 64, 67], [60, 64, 67, 72]);
  assert.ok(doubled);
  assert.equal(doubled.relationshipPreserved, true);
  assert.equal(doubled.voiceCountChanged, true);

  assert.equal(compareChordVoicingEcho([60, 64, 67], [60, 63, 67])?.relationshipPreserved, false);
  assert.equal(compareChordVoicingEcho([60, 72], [62, 74]), null);
  assert.throws(() => compareChordVoicingEcho([60, 64, 128], [62, 66, 69]), RangeError);
});

test("folds a chord into a transposition- and inversion-invariant gap loop", () => {
  const source = chordGapFingerprint([60, 64, 67, 72]);
  const inversion = chordGapFingerprint([64, 67, 72]);
  const transposition = chordGapFingerprint([62, 66, 69]);
  const changedThird = chordGapFingerprint([60, 63, 67]);
  assert.ok(source && inversion && transposition && changedThird);
  assert.deepEqual(source.pitchClasses, [0, 4, 7]);
  assert.deepEqual(source.cyclicGaps, [4, 3, 5]);
  assert.deepEqual(source.canonicalGaps, [3, 5, 4]);
  assert.equal(source.duplicatePitchClassCount, 1);
  assert.deepEqual(inversion.canonicalGaps, source.canonicalGaps);
  assert.deepEqual(transposition.canonicalGaps, source.canonicalGaps);
  assert.notDeepEqual(changedThird.canonicalGaps, source.canonicalGaps);
  assert.equal(chordGapFingerprint([60, 72]), null);
  assert.throws(() => chordGapFingerprint([60, 128]), RangeError);
});

test("shows how one changed chord position redistributes adjacent octave gaps", () => {
  const loweredThird = compareChordGapMutation([60, 64, 67], [60, 63, 67]);
  assert.ok(loweredThird);
  assert.deepEqual(loweredThird.retainedPitchClasses, [0, 7]);
  assert.equal(loweredThird.anchorPitchClass, 0);
  assert.equal(loweredThird.sourceChangedPitchClass, 4);
  assert.equal(loweredThird.attemptChangedPitchClass, 3);
  assert.equal(loweredThird.movedSteps, -1);
  assert.deepEqual(loweredThird.sourceGaps, [4, 3, 5]);
  assert.deepEqual(loweredThird.attemptGaps, [3, 4, 5]);
  assert.deepEqual(loweredThird.gapDeltas, [-1, 1, 0]);
  assert.equal(loweredThird.changedGapCount, 2);
  assert.equal(loweredThird.sourceGaps.reduce((sum, gap) => sum + gap, 0), 12);
  assert.equal(loweredThird.attemptGaps.reduce((sum, gap) => sum + gap, 0), 12);
  assert.equal(compareChordGapMutation([60, 64, 67], [64, 67, 72]), null);
  assert.equal(compareChordGapMutation([60, 64, 67], [60, 65, 69]), null);
  assert.equal(compareChordGapMutation([60, 67], [60, 66]), null);
  assert.throws(() => compareChordGapMutation([60, 64, 128], [60, 63, 67]), RangeError);
});

test("preserves a complete chord move only under one shared transposition", () => {
  const transposedAndRevoiced = compareChordMotionEcho(
    [60, 64, 67], [60, 65, 69],
    [66, 69, 74], [62, 67, 71],
  );
  assert.ok(transposedAndRevoiced);
  assert.equal(transposedAndRevoiced.relationshipPreserved, true);
  assert.equal(transposedAndRevoiced.pitchClassIdentityPreserved, false);
  assert.equal(transposedAndRevoiced.transpositionSteps, 2);
  assert.equal(transposedAndRevoiced.beforeRelationshipPreserved, true);
  assert.equal(transposedAndRevoiced.afterRelationshipPreserved, true);
  assert.deepEqual([
    transposedAndRevoiced.sourceCommonPitchClassCount,
    transposedAndRevoiced.sourceEnteredPitchClassCount,
    transposedAndRevoiced.sourceLeftPitchClassCount,
  ], [1, 2, 2]);
  assert.deepEqual([
    transposedAndRevoiced.attemptCommonPitchClassCount,
    transposedAndRevoiced.attemptEnteredPitchClassCount,
    transposedAndRevoiced.attemptLeftPitchClassCount,
  ], [1, 2, 2]);

  const sameMoveNewRegisters = compareChordMotionEcho(
    [60, 64, 67], [60, 65, 69],
    [64, 67, 72, 76], [65, 69, 72],
  );
  assert.ok(sameMoveNewRegisters);
  assert.equal(sameMoveNewRegisters.relationshipPreserved, true);
  assert.equal(sameMoveNewRegisters.pitchClassIdentityPreserved, true);
  assert.equal(sameMoveNewRegisters.transpositionSteps, 0);

  const endpointsShiftDifferently = compareChordMotionEcho(
    [60, 64, 67], [60, 65, 69],
    [62, 66, 69], [64, 69, 73],
  );
  assert.ok(endpointsShiftDifferently);
  assert.equal(endpointsShiftDifferently.beforeRelationshipPreserved, true);
  assert.equal(endpointsShiftDifferently.afterRelationshipPreserved, true);
  assert.equal(endpointsShiftDifferently.beforeTranspositionSteps, 2);
  assert.equal(endpointsShiftDifferently.afterTranspositionSteps, 4);
  assert.equal(endpointsShiftDifferently.relationshipPreserved, false);

  assert.equal(compareChordMotionEcho([60, 72], [65, 69], [62, 74], [67, 71]), null);
  assert.throws(() => compareChordMotionEcho([60, 64, 67], [60, 65, 128], [62, 66, 69], [62, 67, 71]), RangeError);
});

test("separates a matched chord move's attack and release gesture from its pitch relationships", () => {
  const timing = compareChordGestureTiming(
    [
      { onsetMs: 0, velocity: 70, releaseMs: 650, releaseReason: "pedal" },
      { onsetMs: 40, velocity: 90, releaseMs: 620, releaseReason: "key" },
    ],
    [
      { onsetMs: 600, velocity: 100 },
      { onsetMs: 630, velocity: 80 },
    ],
    [
      { onsetMs: 1_000, velocity: 50, releaseMs: 1_350, releaseReason: "key" },
      { onsetMs: 1_080, velocity: 70, releaseMs: 1_320, releaseReason: "key" },
    ],
    [
      { onsetMs: 1_400, velocity: 110 },
      { onsetMs: 1_410, velocity: 90 },
    ],
  );
  assert.ok(timing);
  assert.deepEqual(timing.source, {
    beforeSpreadMs: 40,
    afterSpreadMs: 30,
    anchorGapMs: 600,
    beforeMeanVelocity: 80,
    afterMeanVelocity: 90,
    bridge: { kind: "overlap", durationMs: 50, pedalExtended: true },
  });
  assert.deepEqual(timing.attempt, {
    beforeSpreadMs: 80,
    afterSpreadMs: 10,
    anchorGapMs: 400,
    beforeMeanVelocity: 60,
    afterMeanVelocity: 100,
    bridge: { kind: "silence", durationMs: 50, pedalExtended: false },
  });
  assert.deepEqual(timing.deltas, {
    beforeSpreadMs: 40,
    afterSpreadMs: -20,
    anchorGapMs: -200,
    beforeMeanVelocity: -20,
    afterMeanVelocity: 10,
  });

  const unknownRelease = compareChordGestureTiming(
    [{ onsetMs: 0, velocity: 80, keyReleaseMs: 200, releaseMs: null, releaseReason: null }],
    [{ onsetMs: 500, velocity: 80 }],
    [{ onsetMs: 1_000, velocity: 80, releaseMs: 1_400, releaseReason: "key" }],
    [{ onsetMs: 1_500, velocity: 80 }],
  );
  assert.equal(unknownRelease?.source.bridge.kind, "unknown");
  assert.equal(compareChordGestureTiming([], [{ onsetMs: 1 }], [{ onsetMs: 2 }], [{ onsetMs: 3 }]), null);
  assert.equal(compareChordGestureTiming([{ onsetMs: 10 }], [{ onsetMs: 5 }], [{ onsetMs: 20 }], [{ onsetMs: 25 }]), null);
  assert.throws(() => compareChordGestureTiming([{ onsetMs: 0, velocity: 128 }], [{ onsetMs: 1 }], [{ onsetMs: 2 }], [{ onsetMs: 3 }]), RangeError);
  assert.throws(() => compareChordGestureTiming([{ onsetMs: 10, releaseMs: 9 }], [{ onsetMs: 20 }], [{ onsetMs: 30 }], [{ onsetMs: 40 }]), RangeError);
});

test("preserves a chord move's selected-context path only when movable Do follows it", () => {
  const scale = PIANO_SCALES[0];
  const sourceFields = [[60, 64, 67], [60, 65, 69]];
  const replayFields = [[62, 66, 69], [62, 67, 71]];
  const sourcePath = sourceFields.map((notes) => tonalTendency(notes, 60, scale));
  const fixedDoReplay = replayFields.map((notes) => tonalTendency(notes, 60, scale));
  const movedDoReplay = replayFields.map((notes) => tonalTendency(notes, 62, scale));
  assert.deepEqual(movedDoReplay, sourcePath);
  assert.notDeepEqual(fixedDoReplay, sourcePath);

  const rolePath = (fields: number[][], doMidi: number) => fields.map((notes) => notes.map((note) => noteContext(note, doMidi, scale).syllable).sort());
  assert.deepEqual(rolePath(replayFields, 62), rolePath(sourceFields, 60));
  assert.notDeepEqual(rolePath(replayFields, 60), rolePath(sourceFields, 60));
});

test("declares controlled sonority fields as physical starting recipes", () => {
  assert.deepEqual(CONTROLLED_SONORITY_FIELDS.map((field) => field.id), ["aligned", "lowered-middle", "held-open", "close-cluster"]);
  assert.ok(CONTROLLED_SONORITY_FIELDS.every((field) => field.offsets.length === 3));
  assert.ok(CONTROLLED_SONORITY_FIELDS.every((field) => field.offsets[0] === 0));
  assert.ok(CONTROLLED_SONORITY_FIELDS.every((field) => !/good|happy|sad|emotion/i.test(`${field.label} ${field.relationship} ${field.instruction}`)));
});

test("attributes exactly one added note to only its new interval relationships", () => {
  const change = controlledSonorityChange([64, 60, 64], [67, 64, 60]);
  assert.equal(change.kind, "one-added");
  assert.equal(change.changedNote, 67);
  assert.deepEqual(change.keptNotes, [60, 64]);
  assert.deepEqual(change.changedIntervals.map((pair) => [pair.lower, pair.upper, pair.distance.semitones]), [[60, 67, 7], [64, 67, 3]]);
  assert.equal(change.baselineSpan, 4);
  assert.equal(change.currentSpan, 7);
  assert.equal(change.spanDelta, 3);
});

test("attributes one removed note but refuses a one-note story for multiple changes", () => {
  const removed = controlledSonorityChange([60, 64, 67], [60, 67]);
  assert.equal(removed.kind, "one-removed");
  assert.equal(removed.changedNote, 64);
  assert.deepEqual(removed.changedIntervals.map((pair) => pair.distance.semitones), [4, 3]);
  const multiple = controlledSonorityChange([60, 64, 67], [62, 65, 69]);
  assert.equal(multiple.kind, "multiple");
  assert.equal(multiple.changedNote, null);
  assert.deepEqual(multiple.changedIntervals, []);
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

test("corrects chord interpretation without erasing the sounding field", () => {
  const gesture = groupChordGestures([
    { id: 1, note: 64, onsetMs: 100, fieldNotes: [60, 64] },
    { id: 2, note: 67, onsetMs: 150, fieldNotes: [60, 64, 67] },
  ], 80, 160)[0];
  assert.deepEqual(interpretedChordNotes(gesture), [60, 64, 67]);
  assert.equal(identifyChordCandidates(interpretedChordNotes(gesture), 1)[0].exact, true);
  assert.deepEqual(interpretedChordNotes(gesture, [60]), [64, 67]);
  assert.equal(identifyChordCandidates(interpretedChordNotes(gesture, [60]), 1)[0].exact, false);
  assert.deepEqual(interpretedChordNotes(gesture, [60, 64, 999, Number.NaN]), [64, 67]);
  assert.deepEqual(gesture.soundingNotesAtClose, [60, 64, 67]);
});

test("propagates corrected membership into chord transition context", () => {
  const previous = groupChordGestures([
    { id: 1, note: 64, onsetMs: 0, fieldNotes: [60, 64] },
    { id: 2, note: 67, onsetMs: 40, fieldNotes: [60, 64, 67] },
  ], 80, 160)[0];
  const current = groupChordGestures([
    { id: 3, note: 65, onsetMs: 500, fieldNotes: [60, 65] },
    { id: 4, note: 69, onsetMs: 540, fieldNotes: [60, 65, 69] },
  ], 80, 160)[0];
  const previousReading = interpretedChordNotes(previous);
  const automaticReading = interpretedChordNotes(current);
  const correctedReading = interpretedChordNotes(current, [60]);
  assert.equal(identifyChordCandidates(automaticReading, 1)[0].exact, true);
  assert.equal(identifyChordCandidates(correctedReading, 1)[0].exact, false);
  const automaticTransition = chordTransitionEvidence(previousReading, automaticReading);
  const correctedTransition = chordTransitionEvidence(previousReading, correctedReading);
  assert.equal(automaticTransition.commonPitchClassCount, 1);
  assert.equal(correctedTransition.commonPitchClassCount, 0);
  assert.ok(correctedTransition.pitchSetNovelty > automaticTransition.pitchSetNovelty);
  assert.notDeepEqual(voiceLeadingProfile(previousReading, automaticReading), voiceLeadingProfile(previousReading, correctedReading));
  assert.deepEqual(current.soundingNotesAtClose, [60, 65, 69]);
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
    assert.ok(path.counterfactual.stepIndex >= 0 && path.counterfactual.stepIndex < path.steps.length);
    assert.ok(path.steps[path.counterfactual.stepIndex].pitchOffsets.includes(path.counterfactual.fromPitchOffset));
    assert.ok(!path.steps[path.counterfactual.stepIndex].pitchOffsets.includes(path.counterfactual.toPitchOffset));
    assert.match(path.counterfactual.question, /\?$/);
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

test("makes landmark transposition changes and invariants explicit", () => {
  const path = LANDMARK_PATHS.find((item) => item.id === "pop-loop")!;
  const profile = landmarkTranspositionProfile(path, 0, 7);
  assert.equal(profile.semitoneShift, 7);
  assert.deepEqual(profile.roles, path.steps.map((step) => step.role));
  assert.deepEqual(profile.rootOffsets, [0, 7, 9, 5]);
  assert.deepEqual(profile.pitchOffsets, path.steps.map((step) => step.pitchOffsets));
  assert.deepEqual(profile.sourcePitchClasses[0], [0, 4, 7]);
  assert.deepEqual(profile.targetPitchClasses[0], [2, 7, 11]);
  for (let step = 0; step < path.steps.length; step += 1) {
    assert.deepEqual(profile.targetPitchClasses[step], profile.sourcePitchClasses[step].map((pitchClass) => (pitchClass + 7) % 12).sort((a, b) => a - b));
  }
  assert.deepEqual(landmarkTranspositionProfile(path, -12, 19).targetPitchClasses, profile.targetPitchClasses);
});

test("changes exactly one declared key in one landmark field", () => {
  for (const path of LANDMARK_PATHS) {
    const source = voiceLandmarkPath(path, 60);
    const changed = voiceLandmarkCounterfactual(path, 60);
    const profile = landmarkCounterfactualProfile(path, 60)!;
    assert.ok(profile);
    assert.equal(profile.stepIndex, path.counterfactual.stepIndex);
    assert.equal(profile.sourceNotes.length, profile.targetNotes.length);
    assert.equal(profile.retainedNotes.length, profile.sourceNotes.length - 1);
    assert.equal(profile.targetNote - profile.sourceNote, profile.keyShift);
    assert.notEqual(profile.keyShift, 0);
    assert.deepEqual(profile.sourceIntervals.length, profile.targetIntervals.length);
    for (let index = 0; index < source.length; index += 1) {
      if (index === path.counterfactual.stepIndex) assert.notDeepEqual(changed[index], source[index]);
      else assert.deepEqual(changed[index], source[index]);
    }
    const flattenedSource = source.flat();
    const flattenedChanged = changed.flat();
    assert.equal(flattenedSource.filter((note, index) => note !== flattenedChanged[index]).length, 1);
  }
  assert.equal(landmarkCounterfactualProfile(LANDMARK_PATHS[0], Number.NaN), null);
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

test("changes exactly one tonal-gravity cue in a frozen counterfactual", () => {
  const phrase = [
    { note: 60, onsetMs: 0, keyReleaseMs: 700, releaseMs: 700, velocity: 96 },
    { note: 64, onsetMs: 800, keyReleaseMs: 1_000, releaseMs: 1_000, velocity: 80 },
    { note: 67, onsetMs: 1_100, keyReleaseMs: 1_350, releaseMs: 1_350, velocity: 84 },
    { note: 60, onsetMs: 1_500, keyReleaseMs: 2_100, releaseMs: 2_100, velocity: 104 },
  ];
  const result = tonalGravityCounterfactual(phrase, 4, "ending", 2_100);
  assert.ok(result);
  assert.equal(result.targetAfter.components.ending, 1);
  assert.ok(result.counterfactual.every((candidate) => candidate.components.ending === (candidate.rootPitchClass === 4 ? 1 : 0)));
  for (const after of result.counterfactual) {
    const baselineCandidate: TonalGravityCandidate = result.baseline.find((candidate) => candidate.rootPitchClass === after.rootPitchClass)!;
    assert.equal(after.components.routeFit, baselineCandidate.components.routeFit);
    assert.equal(after.components.duration, baselineCandidate.components.duration);
    assert.equal(after.components.recurrence, baselineCandidate.components.recurrence);
    assert.equal(after.components.accent, baselineCandidate.components.accent);
    assert.equal(after.components.bass, baselineCandidate.components.bass);
  }
  assert.ok(result.counterfactualRank <= result.baselineRank);
  assert.ok(Math.abs(result.scoreDelta - (1 - result.targetBefore.components.ending) * TONAL_GRAVITY_WEIGHTS.ending) < 1e-12);
});

test("normalizes the counterfactual target and refuses an empty specimen", () => {
  const phrase = [{ note: 60, onsetMs: 0, releaseMs: 500 }];
  assert.equal(tonalGravityCounterfactual(phrase, 16, "duration", 500)?.targetPitchClass, 4);
  assert.equal(tonalGravityCounterfactual([], 0, "duration"), null);
  assert.ok(Math.abs(Object.values(TONAL_GRAVITY_WEIGHTS).reduce((sum, weight) => sum + weight, 0) - 1) < 1e-12);
});

test("keeps relationship and timing shapes invariant under a transposed slower replay", () => {
  const phraseA = [
    { note: 60, onsetMs: 0, releaseMs: 350, velocity: 70 },
    { note: 64, onsetMs: 500, releaseMs: 850, velocity: 80 },
    { note: 67, onsetMs: 1_000, releaseMs: 1_300, velocity: 90 },
  ];
  const phraseB = [
    { note: 62, onsetMs: 0, releaseMs: 700, velocity: 80 },
    { note: 66, onsetMs: 1_000, releaseMs: 1_700, velocity: 90 },
    { note: 69, onsetMs: 2_000, releaseMs: 2_600, velocity: 100 },
  ];
  const comparison = comparePhraseLenses(phraseA, phraseB);
  assert.ok(comparison);
  assert.equal(comparison.relationships.sameIntervalPath, true);
  assert.equal(comparison.relationships.uniformTransposition, 2);
  assert.deepEqual(comparison.relationships.intervalPathA, [4, 3]);
  assert.equal(comparison.motion.sameTimingShape, true);
  assert.equal(comparison.motion.tempoRatio, 2);
  assert.ok(Math.abs(comparison.sound.meanMidiB - comparison.sound.meanMidiA - 2) < 1e-12);
  assert.equal(comparison.sound.meanVelocityB - comparison.sound.meanVelocityA, 10);
  assert.equal(comparison.context.leadingCenterB, (comparison.context.leadingCenterA + 2) % 12);
});

test("keeps changed phrase lenses separate and refuses undersized specimens", () => {
  const phraseA = [
    { note: 60, onsetMs: 0, releaseMs: 650 },
    { note: 64, onsetMs: 500, releaseMs: 900 },
    { note: 67, onsetMs: 1_000, releaseMs: 1_200 },
  ];
  const phraseB = [
    { note: 60, onsetMs: 0, releaseMs: 250 },
    { note: 65, onsetMs: 700, releaseMs: 820 },
    { note: 69, onsetMs: 1_000, releaseMs: 1_100 },
  ];
  const comparison = comparePhraseLenses(phraseA, phraseB);
  assert.ok(comparison);
  assert.equal(comparison.relationships.sameIntervalPath, false);
  assert.equal(comparison.relationships.uniformTransposition, null);
  assert.equal(comparison.relationships.changedMoveCount, 2);
  assert.equal(comparison.motion.sameTimingShape, false);
  assert.equal(comparison.motion.tempoRatio, null);
  assert.equal(comparison.motion.overlapShareA, 0.5);
  assert.equal(comparison.motion.overlapShareB, 0);
  assert.equal(comparePhraseLenses(phraseA.slice(0, 2), phraseB), null);
});

test("separates a declared transposition from its preserved relationship control", () => {
  const phraseA = [
    { note: 60, onsetMs: 0, releaseMs: 300, velocity: 70 },
    { note: 64, onsetMs: 500, releaseMs: 800, velocity: 70 },
    { note: 67, onsetMs: 1_000, releaseMs: 1_300, velocity: 70 },
  ];
  const phraseB = phraseA.map((event) => ({ ...event, note: event.note + 2 }));
  const comparison = comparePhraseLenses(phraseA, phraseB);
  assert.ok(comparison);
  const profile = phraseChangeProfile(comparison, "transpose");
  assert.equal(profile.targetObserved, true);
  assert.equal(profile.controlPreserved, true);
  assert.equal(profile.observations.register, true);
  assert.equal(profile.observations.intervalPath, false);
  assert.ok(profile.changedLenses.includes("sound"));
  assert.ok(profile.invariantLenses.includes("relationships"));
  assert.ok(!profile.otherChangedLenses.includes("sound"));
});

test("keeps intended timing and changed-ending controls inspectable without a score", () => {
  const phraseA = [
    { note: 60, onsetMs: 0, releaseMs: 250, velocity: 64 },
    { note: 64, onsetMs: 500, releaseMs: 750, velocity: 64 },
    { note: 67, onsetMs: 1_000, releaseMs: 1_250, velocity: 64 },
  ];
  const retimed = [
    { note: 60, onsetMs: 0, releaseMs: 250, velocity: 64 },
    { note: 64, onsetMs: 700, releaseMs: 950, velocity: 64 },
    { note: 67, onsetMs: 2_000, releaseMs: 2_250, velocity: 64 },
  ];
  const timingComparison = comparePhraseLenses(phraseA, retimed);
  assert.ok(timingComparison);
  const timingProfile = phraseChangeProfile(timingComparison, "timing");
  assert.equal(timingProfile.targetObserved, true);
  assert.equal(timingProfile.controlPreserved, true);
  assert.deepEqual(timingProfile.changedLenses, ["motion"]);

  const newEnding = phraseA.map((event, index) => index === 2 ? { ...event, note: 69 } : event);
  const endingComparison = comparePhraseLenses(phraseA, newEnding);
  assert.ok(endingComparison);
  const endingProfile = phraseChangeProfile(endingComparison, "ending");
  assert.equal(endingProfile.targetObserved, true);
  assert.equal(endingProfile.controlPreserved, true);
  assert.equal(endingProfile.observations.ending, true);
  assert.ok(endingProfile.otherChangedLenses.includes("context"));
});

test("isolates one changed pause while keeping release evidence separate", () => {
  const source = [
    { note: 60, onsetMs: 0, releaseMs: 180, releaseReason: "key" as const },
    { note: 62, onsetMs: 300, releaseMs: 480, releaseReason: "key" as const },
    { note: 64, onsetMs: 600, releaseMs: 780, releaseReason: "key" as const },
    { note: 67, onsetMs: 900, releaseMs: 1_080, releaseReason: "key" as const },
    { note: 65, onsetMs: 1_200, releaseMs: 1_380, releaseReason: "key" as const },
  ];
  const attempt = [
    { note: 60, onsetMs: 2_000, releaseMs: 2_180, releaseReason: "key" as const },
    { note: 62, onsetMs: 2_320, releaseMs: 2_500, releaseReason: "key" as const },
    { note: 64, onsetMs: 2_630, releaseMs: 2_810, releaseReason: "key" as const },
    { note: 67, onsetMs: 3_330, releaseMs: 3_510, releaseReason: "key" as const },
    { note: 65, onsetMs: 3_640, releaseMs: 3_820, releaseReason: "key" as const },
  ];
  const mutation = comparePhrasePauseMutation(source, attempt);
  assert.ok(mutation);
  assert.equal(mutation.kind, "one-gap");
  assert.equal(mutation.pitchPathPreserved, true);
  assert.equal(mutation.changedGapIndex, 2);
  assert.deepEqual(mutation.changedGapIndices, [2]);
  assert.equal(mutation.controlGapCount, 3);
  assert.deepEqual(mutation.gaps.map((gap) => gap.changed), [false, false, true, false]);
  assert.deepEqual(mutation.gaps[2].sourceBridge, { kind: "silence", durationMs: 120, pedalExtended: false });
  assert.deepEqual(mutation.gaps[2].attemptBridge, { kind: "silence", durationMs: 520, pedalExtended: false });
  assert.equal(mutation.gaps[2].deltaMs, 400);

  const unresolved = comparePhrasePauseMutation(source.map((event, index) => index === 2 ? { ...event, releaseReason: null } : event), attempt);
  assert.ok(unresolved);
  assert.equal(unresolved.gaps[2].sourceBridge.kind, "unknown");

  const subtle = comparePhrasePauseMutation(source, source.map((event, index) => ({ ...event, onsetMs: event.onsetMs + index * 20, releaseMs: event.releaseMs + index * 20 })));
  assert.ok(subtle);
  assert.equal(subtle.kind, "same");

  const scaled = comparePhrasePauseMutation(source, source.map((event) => ({ ...event, onsetMs: event.onsetMs * 1.5, releaseMs: event.releaseMs * 1.5 })));
  assert.ok(scaled);
  assert.equal(scaled.kind, "multiple-gaps");

  const changedPitch = comparePhrasePauseMutation(source, attempt.map((event, index) => index === 3 ? { ...event, note: 66 } : event));
  assert.ok(changedPitch);
  assert.equal(changedPitch.kind, "different-pitches");
  assert.equal(comparePhrasePauseMutation(source.slice(0, 2), attempt), null);
  assert.throws(() => comparePhrasePauseMutation(source, attempt.map((event, index) => index === 1 ? { ...event, onsetMs: 2_000 } : event)), RangeError);
});

test("traces one changed ending through every relationship it joins", () => {
  const phraseA = [
    { note: 60, onsetMs: 0 },
    { note: 64, onsetMs: 400 },
    { note: 67, onsetMs: 800 },
    { note: 65, onsetMs: 1_200 },
  ];
  const phraseB = [
    { note: 62, onsetMs: 0 },
    { note: 66, onsetMs: 430 },
    { note: 69, onsetMs: 860 },
    { note: 69, onsetMs: 1_290 },
  ];
  const ripple = comparePhraseEndingRipple(phraseA, phraseB);
  assert.ok(ripple);
  assert.deepEqual(ripple.sourcePositions, [0, 4, 7, 5]);
  assert.deepEqual(ripple.attemptPositions, [0, 4, 7, 7]);
  assert.equal(ripple.replayTranspositionSteps, 2);
  assert.equal(ripple.movedSteps, 2);
  assert.equal(ripple.changedRelationshipCount, 3);
  assert.equal(ripple.retainedRelationshipCount, 3);
  assert.equal(ripple.sourceFinalApproachSteps, -2);
  assert.equal(ripple.attemptFinalApproachSteps, 0);
  assert.deepEqual(ripple.relationships.map((relationship) => relationship.sourceSignedSteps), [5, 1, -2]);
  assert.deepEqual(ripple.relationships.map((relationship) => relationship.attemptSignedSteps), [7, 3, 0]);
  assert.equal(ripple.relationships[0].sourceFrequencyRatio, 2 ** (5 / 12));
  assert.equal(ripple.relationships[0].attemptFrequencyRatio, 2 ** (7 / 12));

  assert.equal(comparePhraseEndingRipple(phraseA, phraseA), null);
  assert.equal(comparePhraseEndingRipple(phraseA, phraseB.map((event, index) => index === 1 ? { ...event, note: event.note + 1 } : event)), null);
  assert.equal(comparePhraseEndingRipple(phraseA, phraseB.slice(0, 3)), null);
  assert.throws(() => comparePhraseEndingRipple(phraseA, phraseB.map((event, index) => index === 3 ? { ...event, note: Number.NaN } : event)), RangeError);
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

test("separates a resolution intention from the performed landing and any detour", () => {
  const direct = resolutionLandingEvidence([
    { id: 1, note: 60, onsetMs: 0, velocity: 70, keyReleaseMs: 440, releaseMs: 440, releaseReason: "key" },
    { id: 2, note: 67, onsetMs: 500, velocity: 90, keyReleaseMs: 800, releaseMs: 800, releaseReason: "key" },
  ], 1, 7);
  assert.ok(direct);
  assert.equal(direct.sourceEventId, 1);
  assert.equal(direct.landingEventId, 2);
  assert.equal(direct.finalApproachEventId, 1);
  assert.equal(direct.interveningAttackCount, 0);
  assert.equal(direct.sourceToLandingSteps, 7);
  assert.equal(direct.finalApproachSteps, 7);
  assert.equal(direct.sourceToLandingFrequencyRatio, 2 ** (7 / 12));
  assert.equal(direct.sourceToLandingGapMs, 500);
  assert.equal(direct.finalApproachGapMs, 500);
  assert.equal(direct.velocityDelta, 20);
  assert.deepEqual(direct.bridge, { kind: "silence", durationMs: 60, pedalExtended: false });

  const detour = resolutionLandingEvidence([
    { id: 10, note: 64, onsetMs: 1_000, velocity: 80, releaseMs: 1_300, releaseReason: "key" },
    { id: 11, note: 65, onsetMs: 1_400, velocity: 75, releaseMs: 1_780, releaseReason: "pedal" },
    { id: 12, note: 62, onsetMs: 1_700, velocity: 60, releaseMs: 1_900, releaseReason: "key" },
  ], 10, 2);
  assert.ok(detour);
  assert.equal(detour.interveningAttackCount, 1);
  assert.equal(detour.sourceToLandingSteps, -2);
  assert.equal(detour.finalApproachSteps, -3);
  assert.equal(detour.sourceToLandingGapMs, 700);
  assert.equal(detour.finalApproachGapMs, 300);
  assert.deepEqual(detour.bridge, { kind: "overlap", durationMs: 80, pedalExtended: true });

  assert.equal(resolutionLandingEvidence([{ id: 1, note: 60, onsetMs: 0 }], 1, 7), null);
  assert.equal(resolutionLandingEvidence([{ id: 1, note: 60, onsetMs: 0 }], 2, 7), null);
  assert.throws(() => resolutionLandingEvidence([{ id: 1, note: 128, onsetMs: 0 }], 1, 7), RangeError);
  assert.throws(() => resolutionLandingEvidence([{ id: 1, note: 60, onsetMs: 0, releaseMs: -1 }], 1, 7), RangeError);
  assert.throws(() => resolutionLandingEvidence([{ id: 1, note: 60, onsetMs: 0 }], 1, 12), RangeError);
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

test("groups timing islands only across long release-proven silence", () => {
  const events = [
    { id: 1, note: 60, onsetMs: 0, releaseMs: 150, releaseReason: "key" as const },
    { id: 2, note: 62, onsetMs: 200, releaseMs: 350, releaseReason: "key" as const },
    { id: 3, note: 64, onsetMs: 400, releaseMs: 500, releaseReason: "key" as const },
    { id: 4, note: 67, onsetMs: 900, releaseMs: 1_050, releaseReason: "key" as const },
    { id: 5, note: 69, onsetMs: 1_100, releaseMs: 1_250, releaseReason: "key" as const },
    { id: 6, note: 71, onsetMs: 1_300, releaseMs: 1_450, releaseReason: "key" as const },
  ];
  const grouped = phraseBreathMap(events, 1.8);
  assert.ok(grouped);
  assert.equal(grouped.referenceGapMs, 200);
  assert.equal(grouped.thresholdMs, 360);
  assert.equal(grouped.minimumSilenceMs, 120);
  assert.deepEqual(grouped.gaps.map((gap) => gap.candidateBreak), [false, false, true, false, false]);
  assert.equal(grouped.gaps[2].onsetMultiple, 2.5);
  assert.deepEqual(grouped.gaps[2].bridge, { kind: "silence", durationMs: 400, pedalExtended: false });
  assert.deepEqual(grouped.segments.map((segment) => segment.eventIds), [[1, 2, 3], [4, 5, 6]]);
  assert.deepEqual(grouped.segments.map((segment) => segment.intervalPath), [[2, 2], [2, 2]]);
  assert.deepEqual(grouped.segments.map((segment) => segment.pitchSpan), [4, 4]);

  const conservative = phraseBreathMap(events, 3);
  assert.ok(conservative);
  assert.equal(conservative.segments.length, 1);

  const unresolved = phraseBreathMap(events.map((event) => event.id === 3 ? { ...event, releaseMs: null, releaseReason: null } : event), 1.8);
  assert.ok(unresolved);
  assert.equal(unresolved.gaps[2].bridge.kind, "unknown");
  assert.equal(unresolved.segments.length, 1);

  const overlapping = phraseBreathMap(events.map((event) => event.id === 3 ? { ...event, releaseMs: 950, releaseReason: "pedal" as const } : event), 1.8);
  assert.ok(overlapping);
  assert.deepEqual(overlapping.gaps[2].bridge, { kind: "overlap", durationMs: 50, pedalExtended: true });
  assert.equal(overlapping.segments.length, 1);

  const clustered = phraseBreathMap([
    { id: 1, note: 60, onsetMs: 0, releaseMs: 180, fieldNotes: [60] },
    { id: 2, note: 64, onsetMs: 0, releaseMs: 220, fieldNotes: [60, 64] },
    { id: 3, note: 67, onsetMs: 45, releaseMs: 240, fieldNotes: [60, 64, 67] },
    { id: 4, note: 62, onsetMs: 400, releaseMs: 520, fieldNotes: [62] },
    { id: 5, note: 65, onsetMs: 800, releaseMs: 900, fieldNotes: [65] },
    { id: 6, note: 69, onsetMs: 1_500, releaseMs: 1_620, fieldNotes: [69] },
  ], 1.4);
  assert.ok(clustered);
  assert.equal(clustered.attackGroupCount, 4);
  assert.equal(clustered.referenceGapMs, 400);
  assert.equal(clustered.gaps[0].beforeAttackCount, 3);
  assert.equal(clustered.gaps[0].afterAttackCount, 1);
  assert.equal(clustered.gaps[2].candidateBreak, true);
  assert.deepEqual(clustered.segments.map((segment) => segment.eventIds), [[1, 2, 3, 4, 5], [6]]);

  assert.equal(phraseBreathMap(events.slice(0, 2)), null);
  assert.throws(() => phraseBreathMap(events, 1.1), RangeError);
  assert.throws(() => phraseBreathMap(events.map((event) => event.id === 2 ? { ...event, id: 1 } : event)), RangeError);
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

test("makes a motif detector decision inspectable as pitch and timing invariants", () => {
  const transposedEvents = motifEvents([60, 62, 65, 67, 69, 72], [0, 100, 300, 600, 700, 900]);
  const transposed = detectMotifTransformations(transposedEvents)[0];
  const fingerprint = compareMotifFingerprints(transposedEvents, transposed);
  assert.ok(fingerprint);
  assert.deepEqual(fingerprint.sourceRelativePitchPath, [0, 2, 5]);
  assert.deepEqual(fingerprint.targetRelativePitchPath, [0, 2, 5]);
  assert.deepEqual(fingerprint.sourceIntervalPath, [2, 3]);
  assert.deepEqual(fingerprint.targetIntervalPath, [2, 3]);
  assert.deepEqual(fingerprint.sourceTimingShares, [1 / 3, 2 / 3]);
  assert.deepEqual(fingerprint.targetTimingShares, [1 / 3, 2 / 3]);
  assert.equal(fingerprint.startShiftSemitones, 7);
  assert.equal(fingerprint.pitchShapePreserved, true);
  assert.equal(fingerprint.rhythmWithinDetectorTolerance, true);
  assert.deepEqual(fingerprint.changedIntervalIndices, []);

  const rhythmicEvents = motifEvents([60, 62, 65, 67, 60, 62, 65, 67], [0, 100, 200, 500, 800, 820, 900, 1300]);
  const rhythmic = detectMotifTransformations(rhythmicEvents).find((motif) => motif.kind === "rhythmic-variation")!;
  const rhythmicFingerprint = compareMotifFingerprints(rhythmicEvents, rhythmic);
  assert.ok(rhythmicFingerprint);
  assert.equal(rhythmicFingerprint.pitchShapePreserved, true);
  assert.equal(rhythmicFingerprint.rhythmWithinDetectorTolerance, false);
  assert.equal(rhythmicFingerprint.largestTimingChangeGapIndex, 2);
  assert.ok(Math.abs(rhythmicFingerprint.timingShareDeltas[2]) > 0.1);
});

test("rejects contradictory or chronologically invalid motif fingerprint evidence", () => {
  const events = motifEvents([60, 62, 64, 60, 62, 64], [0, 100, 200, 500, 600, 700]);
  const motif = detectMotifTransformations(events)[0];
  assert.throws(() => compareMotifFingerprints(events, { ...motif, targetEventIds: [4, 5, 99] }), RangeError);
  assert.throws(() => compareMotifFingerprints(events.map((event) => event.id === 6 ? { ...event, onsetMs: 550 } : event), motif), RangeError);
});

test("compares the entire learner-bounded motif echo without choosing a smaller match", () => {
  const source = motifEvents([60, 62, 65, 67], [0, 100, 200, 500]);
  const transposed = motifEvents([67, 69, 72, 74], [800, 900, 1000, 1300]).map((event) => ({ ...event, id: event.id + 4 }));
  const transposedResult = compareMotifEcho(source, transposed);
  assert.ok(transposedResult);
  assert.equal(transposedResult.kind, "transposed-repeat");
  assert.equal(transposedResult.startShiftSemitones, 7);
  assert.deepEqual(transposedResult.sourceIntervalPath, [2, 3, 2]);
  assert.deepEqual(transposedResult.targetIntervalPath, [2, 3, 2]);

  const transposedAndRetimed = motifEvents([67, 69, 72, 74], [800, 820, 900, 1300]).map((event) => ({ ...event, id: event.id + 4 }));
  assert.equal(compareMotifEcho(source, transposedAndRetimed)?.kind, "multiple-changes");

  const altered = motifEvents([60, 62, 65, 69], [800, 900, 1000, 1300]).map((event) => ({ ...event, id: event.id + 4 }));
  const alteredResult = compareMotifEcho(source, altered);
  assert.ok(alteredResult);
  assert.equal(alteredResult.kind, "altered-ending");
  assert.deepEqual(alteredResult.changedIntervalIndices, [2]);
  assert.equal(alteredResult.endingDeltaSemitones, 2);

  const multiple = motifEvents([61, 64, 66, 70], [800, 850, 1100, 1300]).map((event) => ({ ...event, id: event.id + 4 }));
  const multipleResult = compareMotifEcho(source, multiple);
  assert.ok(multipleResult);
  assert.equal(multipleResult.kind, "multiple-changes");
  assert.ok(multipleResult.changedIntervalIndices.length > 1);
  assert.equal(compareMotifEcho(source.slice(0, 3), altered), null);
  assert.throws(() => compareMotifEcho(source, transposed.map((event, index) => index === 3 ? { ...event, onsetMs: 850 } : event)), RangeError);
});

test("tracks a local variation followed by a relationship return without claiming form", () => {
  const source = motifEvents([60, 62, 64, 65], [0, 100, 200, 300]);
  const exact = compareMotifEcho(source, motifEvents([60, 62, 64, 65], [500, 600, 700, 800]).map((event) => ({ ...event, id: event.id + 4 })))!;
  const variation = compareMotifEcho(source, motifEvents([60, 62, 64, 67], [900, 1000, 1100, 1200]).map((event) => ({ ...event, id: event.id + 8 })))!;
  const transposedReturn = compareMotifEcho(source, motifEvents([67, 69, 71, 72], [1300, 1400, 1500, 1600]).map((event) => ({ ...event, id: event.id + 12 })))!;

  assert.deepEqual(motifReturnArc([]), { status: "waiting-for-variation", variationIndices: [], returnIndices: [], returnAfterVariationIndex: null });
  assert.equal(motifReturnArc([exact]).status, "waiting-for-variation");
  assert.deepEqual(motifReturnArc([exact, variation]), {
    status: "variation-open",
    variationIndices: [1],
    returnIndices: [0],
    returnAfterVariationIndex: null,
  });
  assert.deepEqual(motifReturnArc([exact, variation, transposedReturn]), {
    status: "return-after-variation",
    variationIndices: [1],
    returnIndices: [0, 2],
    returnAfterVariationIndex: 2,
  });
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
