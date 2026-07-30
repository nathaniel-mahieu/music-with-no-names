import assert from "node:assert/strict";
import test from "node:test";
import {
  analyzeNotatedInterval,
  assignNotesToTargets,
  attacksShareChordWindow,
  chordSpacing,
  displayedAccidentalsForMeasure,
  evaluateSightReadingAttempt,
  generateSightReadingExercise,
  inferUniformTransposition,
  initialScaffoldState,
  makeNotatedPitch,
  nextScaffoldState,
  preferredAccidentalsForShape,
  preferredAccidentalsForTonic,
  reducePattern,
  spellMidiPitch,
  spellShapeRelativePitch,
  transposeNotatedPitchByShape,
  validateTwoWordReflection,
  type SightReadingAttack,
  type SightReadingExercise,
} from "../lib/piano-sight-reading-model.ts";

function attacksFor(
  exercise: SightReadingExercise,
  shift = 0,
  onsetStepMs = 500,
): SightReadingAttack[] {
  return exercise.events.map((event, index) => ({
    id: index,
    onsetMs: 1000 + index * onsetStepMs,
    notes: event.pitches.map((pitch) => pitch.midi + shift),
  }));
}

test("explicit pitch spelling derives MIDI and clef-relative staff position", () => {
  assert.deepEqual(makeNotatedPitch({ letter: "C", accidental: "sharp", octave: 4, clef: "treble" }), {
    letter: "C",
    accidental: "sharp",
    octave: 4,
    midi: 61,
    staffStep: -2,
    clef: "treble",
    label: "C♯4",
  });
  assert.equal(makeNotatedPitch({ letter: "E", octave: 4, clef: "treble" }).staffStep, 0);
  assert.equal(makeNotatedPitch({ letter: "G", octave: 2, clef: "bass" }).staffStep, 0);
  assert.equal(makeNotatedPitch({ letter: "C", octave: 4, clef: "bass" }).staffStep, 10);
});

test("MIDI spelling retains explicit accidentals and supports sharp or flat preference", () => {
  assert.equal(spellMidiPitch(61).label, "C♯4");
  assert.deepEqual(spellMidiPitch(61, { clef: "bass", prefer: "flats" }), {
    letter: "D",
    accidental: "flat",
    octave: 4,
    midi: 61,
    staffStep: 11,
    clef: "bass",
    label: "D♭4",
  });
});

test("movable-Do centers choose practical enharmonic spellings", () => {
  assert.equal(preferredAccidentalsForTonic(61), "flats", "D-flat is simpler than C-sharp for this reader");
  assert.equal(preferredAccidentalsForTonic(63), "flats", "E-flat is simpler than D-sharp");
  assert.equal(preferredAccidentalsForTonic(66), "sharps", "F-sharp is simpler than G-flat");
  assert.equal(preferredAccidentalsForTonic(70), "flats", "B-flat is simpler than A-sharp");
});

test("every authored spacing round-trips across twelve Do positions and three registers", () => {
  const authoredPatterns = [
    [0, 2, 0], [0, 3, 0, 4], [0, 2, 4, 5, 7], [0, 2, 4, 5, 4, 2, 0],
    [0, 4, 7], [0, 3, 8], [0, 4, 7, 12], [0, 7, 0, 5, 0],
    [0, 2, 4, 2, 4, 6], [0, 2, 4, 5, 7, 9, 7], [0, 2, 9],
    [0, 3, 7, 12, 7, 3, 0], [-12, 0, -14, 2, -16, 4, -17, 5],
    [-12, 0, -12, 2, -12, 4, -12, 2, -12, 0], [0, 2, 5, 4, 2, 0],
    [0, 3, 5, 0, 3, 7], [0, 4, 7, 5, 2, 0], [0, 2, 7, 5, 0],
  ];
  for (const register of [48, 60, 72]) {
    for (let pitchClass = 0; pitchClass < 12; pitchClass += 1) {
      const anchor = register + pitchClass;
      for (const offsets of authoredPatterns) {
        const prefer = preferredAccidentalsForShape(anchor, offsets);
        for (const offset of offsets) {
          const notation = spellShapeRelativePitch(anchor, offset, prefer);
          assert.equal(notation.midi, anchor + offset, `anchor ${anchor}, offset ${offset}`);
          assert.notEqual(notation.accidental, "double-flat", `avoid double-flat at anchor ${anchor}, offset ${offset}`);
          assert.notEqual(notation.accidental, "double-sharp", `avoid double-sharp at anchor ${anchor}, offset ${offset}`);
        }
      }
    }
  }
  const risingPreference = preferredAccidentalsForShape(63, [0, 2, 4, 5, 7]);
  assert.deepEqual([0, 2, 4, 5, 7].map((offset) => spellShapeRelativePitch(63, offset, risingPreference).label), ["E♭4", "F4", "G4", "A♭4", "B♭4"]);
});

test("single-measure accidental carry suppresses repeats and prints cancellations", () => {
  const c = makeNotatedPitch({ letter: "C", octave: 4 });
  const eFlat = makeNotatedPitch({ letter: "E", accidental: "flat", octave: 4 });
  const e = makeNotatedPitch({ letter: "E", octave: 4 });
  const eFlatHigh = makeNotatedPitch({ letter: "E", accidental: "flat", octave: 5 });

  assert.deepEqual(
    displayedAccidentalsForMeasure([c, eFlat, c, eFlat, e, e, eFlatHigh]),
    [null, "flat", null, null, "natural", null, "flat"],
  );
});

test("unordered chord packets map to written members and infer one shared transfer", () => {
  assert.deepEqual(assignNotesToTargets([67, 60, 64], [60, 64, 67]), [2, 0, 1]);
  assert.equal(inferUniformTransposition([60, 64, 67], [69, 62, 66]), 2);
  assert.equal(inferUniformTransposition([60, 64, 67], [62, 65, 69]), null);
});

test("sight chord grouping mirrors adjacent-gap and maximum-span rules", () => {
  assert.equal(attacksShareChordWindow([1_000, 1_150, 1_300], 160, 320), true);
  assert.equal(attacksShareChordWindow([1_000, 1_170, 1_300], 160, 320), false);
  assert.equal(attacksShareChordWindow([1_000, 1_160, 1_330], 170, 320), false);
});

test("written generic distance stays distinct from exact and signed semitones", () => {
  const cSharp = makeNotatedPitch({ letter: "C", accidental: "sharp", octave: 4 });
  const dFlat = makeNotatedPitch({ letter: "D", accidental: "flat", octave: 4 });
  const enharmonic = analyzeNotatedInterval(cSharp, dFlat);
  assert.equal(enharmonic.genericNumber, 2);
  assert.equal(enharmonic.signedStaffSteps, 1);
  assert.equal(enharmonic.signedSemitones, 0);
  assert.equal(enharmonic.notationDirection, "up");
  assert.equal(enharmonic.soundingDirection, "stationary");

  const descendingTenth = analyzeNotatedInterval(
    makeNotatedPitch({ letter: "E", octave: 5 }),
    makeNotatedPitch({ letter: "C", octave: 4 }),
  );
  assert.equal(descendingTenth.genericNumber, 10);
  assert.equal(descendingTenth.simpleGenericNumber, 3);
  assert.equal(descendingTenth.writtenOctaves, 1);
  assert.equal(descendingTenth.signedStaffSteps, -9);
  assert.equal(descendingTenth.signedSemitones, -16);
  assert.match(descendingTenth.label, /10th · 16 semitones/);
});

test("shape-first spelling keeps the same written third across three- and four-semitone interiors", () => {
  const c = makeNotatedPitch({ letter: "C", octave: 4 });
  const eFlat = transposeNotatedPitchByShape(c, 2, 3);
  const e = transposeNotatedPitchByShape(c, 2, 4);
  assert.equal(eFlat.label, "E♭4");
  assert.equal(e.label, "E4");
  assert.equal(analyzeNotatedInterval(c, eFlat).genericNumber, 3);
  assert.equal(analyzeNotatedInterval(c, e).genericNumber, 3);
  assert.equal(analyzeNotatedInterval(c, eFlat).exactSemitones, 3);
  assert.equal(analyzeNotatedInterval(c, e).exactSemitones, 4);

  const d = makeNotatedPitch({ letter: "D", octave: 4 });
  const f = transposeNotatedPitchByShape(d, 2, 3);
  assert.equal(f.label, "F4");
  assert.equal(analyzeNotatedInterval(d, f).genericNumber, 3);
});

test("chord decomposition exposes sorted adjacent and every pairwise spacing", () => {
  assert.deepEqual(chordSpacing([67, 60, 64, 60]), {
    notes: [60, 64, 67],
    adjacent: [
      { lowerMidi: 60, upperMidi: 64, semitones: 4 },
      { lowerMidi: 64, upperMidi: 67, semitones: 3 },
    ],
    pairwise: [
      { lowerMidi: 60, upperMidi: 64, semitones: 4 },
      { lowerMidi: 60, upperMidi: 67, semitones: 7 },
      { lowerMidi: 64, upperMidi: 67, semitones: 3 },
    ],
    adjacentSemitones: [4, 3],
    pairwiseSemitones: [4, 7, 3],
    spanSemitones: 7,
  });
});

test("exercise generation is deterministic and safe across every pattern family", () => {
  const families = ["interval", "contour", "triad", "inversion", "arpeggio", "anchor", "transform"] as const;
  for (const family of families) {
    const first = generateSightReadingExercise({ seed: "same seed", family, clef: "treble", difficulty: "developing" });
    const second = generateSightReadingExercise({ seed: "same seed", family, clef: "treble", difficulty: "developing" });
    assert.deepEqual(second, first, `${family} must be deterministic`);
    assert.equal(first.schemaVersion, 1);
    assert.ok(first.events.length >= 1);
    assert.ok(first.events.every((event) => event.pitches.every((pitch) => pitch.midi >= 60 && pitch.midi <= 79)));
    assert.ok(first.events.every((event) => event.pitches.every((pitch) => pitch.clef === "treble")));
    assert.ok(first.scaffoldPlan.discover.length > first.scaffoldPlan.read.length);
  }
  assert.notDeepEqual(
    generateSightReadingExercise({ seed: "one", family: "contour" }).events,
    generateSightReadingExercise({ seed: "two", family: "contour" }).events,
  );
});

test("each exercise family retains the structural role its UI needs", () => {
  const triad = generateSightReadingExercise({ seed: 3, family: "triad" });
  assert.equal(triad.events.length, 1);
  assert.equal(triad.events[0].pitches.length, 3);
  assert.equal(triad.focus.chordSpacings.length, 1);

  const inversion = generateSightReadingExercise({ seed: 3, family: "inversion" });
  assert.deepEqual(inversion.events.map((event) => event.pitches.length), [3, 3]);
  assert.notDeepEqual(inversion.focus.chordSpacings[0].adjacentSemitones, inversion.focus.chordSpacings[1].adjacentSemitones);

  const anchor = generateSightReadingExercise({ seed: 3, family: "anchor" });
  assert.deepEqual(anchor.events.map((event) => event.role), ["anchor", "moving-tone", "anchor", "moving-tone", "anchor"]);
  assert.equal(anchor.reductions.anchors[0].occurrenceCount, 3);

  const transform = generateSightReadingExercise({ seed: 3, family: "transform" });
  assert.ok(transform.events.some((event) => event.groupId === "motif-a"));
  assert.ok(transform.events.some((event) => event.groupId === "motif-b"));
});

test("reductions preserve contour, fold sequential pitch classes, and expose fixed points", () => {
  const arpeggio = generateSightReadingExercise({ seed: 11, family: "arpeggio" });
  assert.ok(arpeggio.reductions.contourSignature.length > 0);
  assert.ok(arpeggio.reductions.foldedArpeggio);
  assert.equal(arpeggio.reductions.foldedArpeggio?.pitchClasses.length, 3);
  assert.deepEqual(
    arpeggio.reductions.foldedArpeggio?.spacing.adjacentSemitones,
    arpeggio.reductions.foldedArpeggio?.offsetsFromBass.slice(1).map((offset, index, offsets) => offset - (index === 0 ? 0 : offsets[index - 1])),
  );

  const anchor = generateSightReadingExercise({ seed: 9, family: "anchor" });
  const reducedAgain = reducePattern(anchor.events);
  assert.deepEqual(reducedAgain, anchor.reductions);
  assert.equal(reducedAgain.anchors[0].explicit, true);
  assert.equal(reducedAgain.anchors[0].eventIds.length, 3);
});

test("exact evaluation is incremental and does not accept a uniformly shifted copy", () => {
  const exercise = generateSightReadingExercise({ seed: 22, family: "contour" });
  const partial = evaluateSightReadingAttempt(exercise, attacksFor(exercise).slice(0, 2), { mode: "exact" });
  assert.equal(partial.complete, false);
  assert.equal(partial.matchedEventCount, 2);
  assert.equal(partial.nextEventIndex, 2);
  assert.match(partial.summary, /first 2 events match/);

  const shifted = evaluateSightReadingAttempt(exercise, attacksFor(exercise, 2), { mode: "exact" });
  assert.equal(shifted.passed, false);
  assert.equal(shifted.shapeAccuracy, 1);
  assert.equal(shifted.exactAccuracy, 0);
  assert.ok(shifted.diagnoses.every((diagnosis) => diagnosis.kind === "correct-shape-different-start"));
});

test("transposable-shape mode accepts one common shift but diagnoses drift", () => {
  const exercise = generateSightReadingExercise({ seed: 14, family: "transform" });
  const copy = evaluateSightReadingAttempt(exercise, attacksFor(exercise, -3), { mode: "transposable-shape" });
  assert.equal(copy.inferredTransposition, -3);
  assert.equal(copy.passed, true);
  assert.equal(copy.exactAccuracy, 0);
  assert.equal(copy.shapeAccuracy, 1);

  const driftingAttacks = attacksFor(exercise, -3);
  driftingAttacks[3].notes = driftingAttacks[3].notes.map((note) => note + 1);
  const drift = evaluateSightReadingAttempt(exercise, driftingAttacks, { mode: "transposable-shape" });
  assert.equal(drift.passed, false);
  assert.ok(drift.diagnoses.some((diagnosis) => diagnosis.kind === "transposition-drift" && diagnosis.eventIndex === 3));
});

test("melodic diagnoses distinguish direction, width, and an abandoned anchor", () => {
  const contour = generateSightReadingExercise({ seed: "direction", family: "contour" });
  const attacks = attacksFor(contour);
  const expectedMove = contour.events[1].pitches[0].midi - contour.events[0].pitches[0].midi;
  attacks[1].notes = [attacks[0].notes[0] - Math.sign(expectedMove || 1) * Math.max(1, Math.abs(expectedMove))];
  const wrongWay = evaluateSightReadingAttempt(contour, attacks);
  assert.ok(wrongWay.diagnoses.some((diagnosis) => diagnosis.kind === "wrong-direction"));

  const interval = generateSightReadingExercise({ seed: "width", family: "interval" });
  const tooWide = attacksFor(interval);
  const direction = Math.sign(interval.events[1].pitches[0].midi - interval.events[0].pitches[0].midi);
  tooWide[1].notes[0] += direction || 1;
  assert.ok(evaluateSightReadingAttempt(interval, tooWide).diagnoses.some((diagnosis) => diagnosis.kind === "interval-too-wide"));

  const anchor = generateSightReadingExercise({ seed: "anchor", family: "anchor" });
  const lost = attacksFor(anchor);
  lost[2].notes[0] += 1;
  assert.ok(evaluateSightReadingAttempt(anchor, lost).diagnoses.some((diagnosis) => diagnosis.kind === "anchor-lost"));
});

test("chord attempts diagnose voice count and internal spacing independently", () => {
  const triad = generateSightReadingExercise({ seed: 18, family: "triad" });
  const missingVoice = attacksFor(triad);
  missingVoice[0].notes.pop();
  const voiceResult = evaluateSightReadingAttempt(triad, missingVoice);
  assert.ok(voiceResult.diagnoses.some((diagnosis) => diagnosis.kind === "voice-count"));

  const bentChord = attacksFor(triad);
  bentChord[0].notes[1] += 1;
  const spacingResult = evaluateSightReadingAttempt(triad, bentChord);
  assert.ok(spacingResult.diagnoses.some((diagnosis) => diagnosis.kind === "chord-spacing"));
});

test("relative timing is optional and measured from the first attack", () => {
  const exercise = generateSightReadingExercise({ seed: 7, family: "interval" });
  const attacks = attacksFor(exercise, 0, 740);
  const withoutTempo = evaluateSightReadingAttempt(exercise, attacks);
  assert.equal(withoutTempo.passed, true);
  assert.equal(withoutTempo.comparisons[1].timingMatch, null);

  const withTempo = evaluateSightReadingAttempt(exercise, attacks, { beatDurationMs: 500, timingToleranceMs: 80 });
  assert.equal(withTempo.passed, false);
  assert.equal(withTempo.comparisons[1].timingErrorMs, 240);
  assert.ok(withTempo.diagnoses.some((diagnosis) => diagnosis.kind === "timing"));
});

test("scaffolds fade after repeated complete passes and return after repeated misses", () => {
  const exercise = generateSightReadingExercise({ seed: 4, family: "triad" });
  const pass = evaluateSightReadingAttempt(exercise, attacksFor(exercise));
  const failAttacks = attacksFor(exercise);
  failAttacks[0].notes[0] += 1;
  const fail = evaluateSightReadingAttempt(exercise, failAttacks);

  const initial = initialScaffoldState(exercise);
  const once = nextScaffoldState(exercise, initial, pass);
  assert.equal(once.stage, "discover");
  const connected = nextScaffoldState(exercise, once, pass);
  assert.equal(connected.stage, "connect");
  assert.ok(connected.visibleHints.some((hint) => hint.kind === "chord-gaps"));
  const oneMiss = nextScaffoldState(exercise, connected, fail);
  assert.equal(oneMiss.stage, "connect");
  const restored = nextScaffoldState(exercise, oneMiss, fail);
  assert.equal(restored.stage, "discover");
});

test("two-word reflection accepts personal language without interpreting it", () => {
  assert.deepEqual(validateTwoWordReflection("Tender, suspended"), {
    valid: true,
    normalized: "Tender suspended",
    words: ["tender", "suspended"],
    errors: [],
    prompt: "Choose two words for what you intended or heard; they describe your experience, not a property the interval guarantees.",
  });
  assert.equal(validateTwoWordReflection(["bright-edged", "restless"]).valid, true);
  assert.deepEqual(validateTwoWordReflection("too many listening words").errors, ["word-count"]);
  assert.deepEqual(validateTwoWordReflection("clear 7th").errors, ["invalid-word"]);
  assert.deepEqual(validateTwoWordReflection("").errors, ["empty", "word-count"]);
});

test("invalid pitches, ranges, attacks, and timing fail early", () => {
  assert.throws(() => spellMidiPitch(128), /0 through 127/);
  assert.throws(
    () => generateSightReadingExercise({ seed: 1, family: "interval", range: { lowestMidi: 60, highestMidi: 67 } }),
    /at least twelve/,
  );
  const exercise = generateSightReadingExercise({ seed: 1, family: "interval" });
  assert.throws(() => evaluateSightReadingAttempt(exercise, [{ onsetMs: 0, notes: [] }]), /at least one note/);
  assert.throws(() => evaluateSightReadingAttempt(exercise, [
    { onsetMs: 20, notes: [60] },
    { onsetMs: 10, notes: [62] },
  ]), /ordered by onset/);
  assert.throws(() => evaluateSightReadingAttempt(exercise, attacksFor(exercise), { beatDurationMs: 0 }), /positive finite/);
});
