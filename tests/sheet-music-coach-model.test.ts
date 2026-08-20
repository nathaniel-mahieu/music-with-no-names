import test from "node:test";
import assert from "node:assert/strict";
import {
  chordSpacing,
  clusterMidiPerformance,
  evaluateSheetMusicPerformance,
  fingerDistance,
  handFromMusicXmlStaff,
  isNormalizedSheetMusicScore,
  musicXmlDurationToBeats,
  musicXmlPitch,
  normalizeSheetMusicScore,
  repairLoopAroundFirstDivergence,
  scoreBeatSpanToMs,
  selectSheetMusicLoop,
  type MidiPerformanceNote,
  type SheetMusicScoreInput,
} from "../lib/sheet-music-coach-model.ts";

function scoreInput(): SheetMusicScoreInput {
  return {
    id: "fixture-score",
    title: "Relationship study",
    composer: "Test Composer",
    sourceName: "fixture.musicxml",
    tempoBpm: 120,
    timeSignature: { beats: 4, beatType: 4 },
    keyFifths: -2,
    measures: [
      {
        number: 1,
        durationBeats: 4,
        events: [
          { kind: "note", id: "c4", offsetBeats: 0, durationBeats: 1, pitch: { step: "C", octave: 4 }, staff: 1, fingering: 1 },
          { kind: "note", id: "e4", offsetBeats: 0, durationBeats: 1, pitch: { step: "E", octave: 4 }, staff: 1, fingering: 3 },
          { kind: "note", id: "g4", offsetBeats: 0, durationBeats: 1, pitch: { step: "G", octave: 4 }, staff: 1, fingering: 5 },
          { kind: "note", id: "d4", offsetBeats: 1, durationBeats: 1, pitch: { step: "D", octave: 4 }, staff: 1, fingering: 2 },
          { kind: "rest", id: "rest-r", offsetBeats: 2, durationBeats: 1, staff: 1 },
          { kind: "note", id: "held-e", offsetBeats: 3, durationBeats: 1, pitch: { step: "E", octave: 4 }, tie: { start: true }, staff: 1 },
        ],
      },
      {
        number: "2",
        durationBeats: 4,
        events: [
          { kind: "note", id: "continued-e", offsetBeats: 0, durationBeats: 1, pitch: { step: "E", octave: 4 }, tie: { stop: true }, staff: 1 },
          { kind: "note", id: "f4", offsetBeats: 1, durationBeats: 1, pitch: { step: "F", octave: 4 }, staff: 1, fingering: 4 },
          { kind: "note", id: "f2", offsetBeats: 2, durationBeats: 1, pitch: { step: "F", octave: 2 }, staff: 2, fingering: 5 },
          { kind: "note", id: "c3", offsetBeats: 2, durationBeats: 1, pitch: { step: "C", octave: 3 }, staff: 2, fingering: 1 },
          { kind: "rest", id: "rest-l", offsetBeats: 3, durationBeats: 1, staff: 2, measureRest: false },
        ],
      },
      {
        number: 3,
        durationBeats: 3,
        timeSignature: { beats: 3, beatType: 4 },
        events: [
          { kind: "note", id: "g-end", offsetBeats: 0, durationBeats: 1, pitch: { step: "G", octave: 4 }, staff: 1 },
          { kind: "note", id: "a-end", offsetBeats: 1, durationBeats: 2, pitch: { step: "A", octave: 4 }, staff: 1 },
        ],
      },
    ],
  };
}

function score() {
  return normalizeSheetMusicScore(scoreInput());
}

function exactTake(): MidiPerformanceNote[] {
  return [
    { midi: 60, onsetMs: 1_000, releaseMs: 1_500 },
    { midi: 64, onsetMs: 1_025, releaseMs: 1_525 },
    { midi: 67, onsetMs: 1_050, releaseMs: 1_550 },
    { midi: 62, onsetMs: 1_500, releaseMs: 2_000 },
    { midi: 64, onsetMs: 2_500, releaseMs: 3_500 },
    { midi: 65, onsetMs: 3_500, releaseMs: 4_000 },
    { midi: 41, onsetMs: 4_000, releaseMs: 4_500 },
    { midi: 48, onsetMs: 4_030, releaseMs: 4_530 },
    { midi: 67, onsetMs: 5_000, releaseMs: 5_500 },
    { midi: 69, onsetMs: 5_500, releaseMs: 6_500 },
  ];
}

test("converts MusicXML pitch, duration, and grand-staff hand facts", () => {
  assert.deepEqual(musicXmlPitch("B", -1, 4), { step: "B", alter: -1, octave: 4, midi: 70, label: "B♭4" });
  assert.equal(musicXmlDurationToBeats(4, 12), 1 / 3);
  assert.equal(handFromMusicXmlStaff(1), "right");
  assert.equal(handFromMusicXmlStaff(2), "left");
  assert.equal(handFromMusicXmlStaff(3), "unknown");
  assert.equal(handFromMusicXmlStaff(1, 1), "unknown");
});

test("normalizes measures, notes, chords, rests, ties, hands, and supplied fingerings", () => {
  const normalized = score();
  assert.equal(isNormalizedSheetMusicScore(normalized), true);
  assert.equal(normalized.totalBeats, 11);
  assert.deepEqual(normalized.measures.map((measure) => measure.startBeat), [0, 4, 8]);
  assert.deepEqual(normalized.measures.map((measure) => measure.timeSignature), [
    { beats: 4, beatType: 4 },
    { beats: 4, beatType: 4 },
    { beats: 3, beatType: 4 },
  ]);
  assert.deepEqual(normalized.attacks[0].midiNotes, [60, 64, 67]);
  assert.deepEqual(normalized.attacks[0].notes.map((note) => note.fingering), [1, 3, 5]);
  assert.equal(normalized.attacks.some((attack) => attack.notes.some((note) => note.id === "continued-e")), false);
  const tieStart = normalized.events.find((event): event is Extract<(typeof normalized.events)[number], { kind: "note" }> => event.kind === "note" && event.id === "held-e");
  const tieStop = normalized.events.find((event): event is Extract<(typeof normalized.events)[number], { kind: "note" }> => event.kind === "note" && event.id === "continued-e");
  assert.equal(tieStart?.durationBeats, 1, "notation retains the first written segment");
  assert.equal(tieStart?.soundingDurationBeats, 2, "the attack sounds through the contiguous tie");
  assert.equal(tieStop?.durationBeats, 1);
  assert.equal(tieStop?.soundingDurationBeats, 1, "a boundary loop uses the remaining tied span");
  assert.equal(tieStop?.isAttack, false);
  assert.equal(normalized.events.find((event) => event.id === "rest-r")?.kind, "rest");
  assert.equal(normalized.events.find((event) => event.id === "f2")?.hand, "left");
});

test("preserves explicit spelling while checking supplied MIDI against it", () => {
  const input = scoreInput();
  const first = input.measures[0].events[0];
  if (first.kind !== "note") throw new Error("fixture changed");
  first.pitch = { step: "D", alter: -1, octave: 4 };
  first.midi = 61;
  assert.equal(normalizeSheetMusicScore(input).attacks[0].notes[0].pitch.label, "D♭4");
  first.midi = 60;
  assert.throws(() => normalizeSheetMusicScore(input), /disagree/);
});

test("rejects malformed score evidence rather than silently clamping it", () => {
  const outside = scoreInput();
  outside.measures[0].events[0].offsetBeats = 5;
  assert.throws(() => normalizeSheetMusicScore(outside), /outside measure/);

  const duplicate = scoreInput();
  duplicate.measures[0].events[1].id = "c4";
  assert.throws(() => normalizeSheetMusicScore(duplicate), /Duplicate score id/);

  const finger = scoreInput();
  const first = finger.measures[0].events[0];
  if (first.kind !== "note") throw new Error("fixture changed");
  first.fingering = 6;
  assert.throws(() => normalizeSheetMusicScore(finger), /fingering/);

  assert.throws(() => musicXmlPitch("C", 0.5, 4), /alter/);
  assert.throws(() => musicXmlDurationToBeats(1, 0), /divisions/);
});

test("selects inclusive measure loops, isolates hands, and re-attacks a boundary tie for practice", () => {
  const normalized = score();
  const right = selectSheetMusicLoop(normalized, { startMeasureIndex: 1, endMeasureIndex: 1, hand: "right" });
  assert.equal(right.startBeat, 4);
  assert.equal(right.endBeat, 8);
  assert.deepEqual(right.attacks.map((attack) => attack.midiNotes), [[64], [65]]);
  assert.equal(right.attacks[0].syntheticBoundaryTie, true);
  assert.equal(right.attacks[0].relativeOnsetBeat, 0);
  assert.equal(right.attacks[0].durationBeats, 1);

  const left = selectSheetMusicLoop(normalized, { startMeasureIndex: 1, endMeasureIndex: 1, hand: "left" });
  assert.deepEqual(left.attacks.map((attack) => attack.midiNotes), [[41, 48]]);

  const withoutTie = selectSheetMusicLoop(normalized, { startMeasureIndex: 1, endMeasureIndex: 1, hand: "right", includeBoundaryTies: false });
  assert.deepEqual(withoutTie.attacks.map((attack) => attack.midiNotes), [[65]]);
});

test("integrates score tempo changes and permits a fixed slow-practice tempo", () => {
  const input = scoreInput();
  input.tempoChanges = [{ beat: 2, bpm: 60 }];
  const normalized = normalizeSheetMusicScore(input);
  assert.equal(scoreBeatSpanToMs(normalized, 0, 4), 3_000);
  assert.equal(scoreBeatSpanToMs(normalized, 1, 3), 1_500);
  assert.equal(scoreBeatSpanToMs(normalized, 0, 4, 120), 2_000);
  assert.throws(() => scoreBeatSpanToMs(normalized, -1, 1), /outside/);
});

test("clusters rolled chord attacks without transitive window creep", () => {
  const clusters = clusterMidiPerformance([
    { id: "c", midi: 60, onsetMs: 100 },
    { id: "e", midi: 64, onsetMs: 150 },
    { id: "duplicate-e", midi: 64, onsetMs: 155 },
    { id: "g-late", midi: 67, onsetMs: 171 },
  ], 70);
  assert.equal(clusters.length, 2, "171 ms is outside 70 ms of the cluster anchor at 100 ms");
  assert.deepEqual(clusters[0].notes, [60, 64]);
  assert.deepEqual(clusters[0].duplicateNotes, [64]);
  assert.deepEqual(clusters[1].notes, [67]);
});

test("target-aware grouping keeps adjacent written 16ths separate inside a wide chord window", () => {
  const fastSingles = normalizeSheetMusicScore({
    id: "fast-singles",
    title: "Two fast landings",
    tempoBpm: 300,
    measures: [{
      number: 1,
      durationBeats: 1,
      events: [
        { kind: "note", id: "first", offsetBeats: 0, durationBeats: 0.25, midi: 60 },
        { kind: "note", id: "second", offsetBeats: 0.25, durationBeats: 0.25, midi: 62 },
      ],
    }],
  });
  const result = evaluateSheetMusicPerformance(fastSingles, [
    { midi: 60, onsetMs: 100 },
    { midi: 62, onsetMs: 150 },
  ], { clusterWindowMs: 180, arpeggioWindowMs: 240, finalize: true, timingToleranceMs: 20 });
  assert.equal(result.passed, true);
  assert.equal(result.clusters.length, 2);
  assert.deepEqual(result.comparisons.map((comparison) => comparison.actualNotes), [[60], [62]]);
});

test("only a written arpeggiation receives the wider rolled-chord window", () => {
  const rolledInput: SheetMusicScoreInput = {
    id: "rolled",
    title: "Written roll",
    tempoBpm: 80,
    measures: [{
      number: 1,
      durationBeats: 4,
      events: [60, 64, 67].map((midi, index) => ({
        kind: "note" as const,
        id: `roll-${index}`,
        offsetBeats: 0,
        durationBeats: 2,
        midi,
        arpeggiate: "up" as const,
      })),
    }],
  };
  const take = [
    { midi: 60, onsetMs: 100 },
    { midi: 64, onsetMs: 180 },
    { midi: 67, onsetMs: 260 },
  ];
  const writtenRoll = normalizeSheetMusicScore(rolledInput);
  assert.equal(writtenRoll.attacks[0].arpeggiate, "up");
  const accepted = evaluateSheetMusicPerformance(writtenRoll, take, { clusterWindowMs: 70, arpeggioWindowMs: 180, finalize: true });
  assert.equal(accepted.passed, true);
  assert.equal(accepted.clusters.length, 1);
  assert.deepEqual(accepted.clusters[0].notes, [60, 64, 67]);
  assert.deepEqual(accepted.metrics.arpeggiation, { compared: 1, matches: 1, accuracy: 1 });

  const wrongDirection = evaluateSheetMusicPerformance(writtenRoll, [
    { midi: 67, onsetMs: 100 },
    { midi: 64, onsetMs: 180 },
    { midi: 60, onsetMs: 260 },
  ], { clusterWindowMs: 70, arpeggioWindowMs: 180, finalize: true });
  assert.equal(wrongDirection.comparisons[0].pitchMatch, true);
  assert.equal(wrongDirection.comparisons[0].arpeggiationMatch, false);
  assert.equal(wrongDirection.firstDivergence?.kind, "arpeggiation");
  assert.match(wrongDirection.firstDivergence?.message ?? "", /change only their attack order/);

  const blockInput = rolledInput.measures[0].events.map((event) => ({ ...event, arpeggiate: false }));
  const blockChord = normalizeSheetMusicScore({ ...rolledInput, id: "block", measures: [{ ...rolledInput.measures[0], events: blockInput }] });
  const rejected = evaluateSheetMusicPerformance(blockChord, take, { clusterWindowMs: 70, arpeggioWindowMs: 180, finalize: true });
  assert.equal(rejected.passed, false);
  assert.equal(rejected.firstDivergence?.kind, "chord");
});

test("validates MIDI capture values and release ordering", () => {
  assert.throws(() => clusterMidiPerformance([{ midi: 128, onsetMs: 0 }]), /0 through 127/);
  assert.throws(() => clusterMidiPerformance([{ midi: 60, onsetMs: -1 }]), /non-negative/);
  assert.throws(() => clusterMidiPerformance([{ midi: 60, onsetMs: 1, releaseMs: 0 }]), /no earlier/);
  assert.throws(() => clusterMidiPerformance([], 501), /0 through 500/);
});

test("expresses corrections as semitones and approximate physical key travel", () => {
  const up = fingerDistance(63, 64);
  assert.equal(up.signedSemitones, 1);
  assert.equal(up.direction, "right");
  assert.equal(up.fromKeyColor, "black");
  assert.equal(up.toKeyColor, "white");
  assert.match(up.cue, /right 1 semitone/);

  const down = fingerDistance(72, 60);
  assert.equal(down.signedSemitones, -12);
  assert.equal(down.direction, "left");
  assert.equal(down.whiteKeyWidths, 7);
  assert.equal(down.octaveDisplacement, -1);
  assert.equal(down.reach, "octave-shift");
  assert.deepEqual(chordSpacing([67, 60, 64]), { adjacentSemitones: [4, 3], spanSemitones: 7 });
});

test("passes an exact complete performance with independent pitch, rhythm, duration, chord, and relationship metrics", () => {
  const result = evaluateSheetMusicPerformance(score(), exactTake(), { finalize: true });
  assert.equal(result.complete, true);
  assert.equal(result.passed, true);
  assert.equal(result.firstDivergence, null);
  assert.deepEqual(result.metrics.pitch, { compared: 7, matches: 7, accuracy: 1 });
  assert.deepEqual(result.metrics.chords, { compared: 2, matches: 2, accuracy: 1 });
  assert.equal(result.metrics.rhythm.accuracy, 1);
  assert.equal(result.metrics.duration.accuracy, 1);
  assert.equal(result.metrics.soprano.contourAccuracy, 1);
  assert.equal(result.metrics.soprano.intervalAccuracy, 1);
  assert.equal(result.progress.percent, 1);
  assert.equal(result.progress.secureThroughIndex, 6);
  assert.equal("score" in result, false, "the model must not blend unlike skills into one score");
});

test("keeps untouched trailing score attacks pending during a live take", () => {
  const result = evaluateSheetMusicPerformance(score(), exactTake().slice(0, 4));
  assert.equal(result.complete, false);
  assert.equal(result.passed, false);
  assert.deepEqual(result.comparisons.slice(0, 2).map((comparison) => comparison.status), ["correct", "correct"]);
  assert.equal(result.comparisons[2].status, "pending");
  assert.equal(result.firstDivergence, null);
  assert.equal(result.progress.completedAttacks, 2);
  assert.equal(result.progress.nextExpectedIndex, 2);
});

test("live prefix alignment cannot jump a repeated motif to later matching targets", () => {
  const repeated = normalizeSheetMusicScore({
    id: "repeated-prefix",
    title: "C D, C D",
    tempoBpm: 120,
    measures: [{
      number: 1,
      durationBeats: 4,
      events: [60, 62, 60, 62].map((midi, index) => ({
        kind: "note" as const,
        id: `repeat-${index}`,
        offsetBeats: index,
        durationBeats: 1,
        midi,
      })),
    }],
  });
  const take = [{ midi: 60, onsetMs: 100 }, { midi: 62, onsetMs: 600 }];
  const live = evaluateSheetMusicPerformance(repeated, take);
  assert.deepEqual(live.comparisons.map((comparison) => comparison.status), ["correct", "correct", "pending", "pending"]);
  assert.equal(live.firstDivergence, null);
  assert.equal(live.progress.nextExpectedIndex, 2);

  const final = evaluateSheetMusicPerformance(repeated, take, { finalize: true });
  assert.deepEqual(final.comparisons.map((comparison) => comparison.status), ["correct", "correct", "missed", "missed"]);
  assert.equal(final.firstDivergence?.kind, "missing-attack");
  assert.equal(final.firstDivergence?.expectedIndex, 2, "the omitted suffix starts at the third landing");
});

test("finalization reports the earliest omitted score attack", () => {
  const result = evaluateSheetMusicPerformance(score(), exactTake().slice(0, 4), { finalize: true });
  assert.equal(result.complete, true);
  assert.equal(result.passed, false);
  assert.equal(result.firstDivergence?.kind, "missing-attack");
  assert.equal(result.firstDivergence?.expectedIndex, 2);
  assert.match(result.firstDivergence?.message ?? "", /skipped/);
});

test("diagnoses a chord tone by signed semitone and score-authored finger number", () => {
  const take = exactTake();
  take[1] = { midi: 63, onsetMs: 1_025, releaseMs: 1_525 };
  const result = evaluateSheetMusicPerformance(score(), take, { finalize: true });
  const first = result.comparisons[0];
  assert.equal(result.firstDivergence?.kind, "chord");
  assert.deepEqual(first.missingNotes, [64]);
  assert.deepEqual(first.extraNotes, [63]);
  assert.deepEqual(first.expectedSpacing.adjacentSemitones, [4, 3]);
  assert.deepEqual(first.actualSpacing?.adjacentSemitones, [3, 4]);
  assert.equal(first.spacingMatch, false);
  assert.equal(first.corrections[0].signedSemitones, 1);
  assert.equal(first.corrections[0].direction, "right");
  assert.equal(first.corrections[0].expectedFingering, 3);
});

test("a missing-only chord tone never tells a correct finger to move", () => {
  const take = exactTake();
  take.splice(2, 1);
  const result = evaluateSheetMusicPerformance(score(), take, { finalize: true });
  const first = result.comparisons[0];
  assert.equal(result.firstDivergence?.kind, "chord");
  assert.deepEqual(first.actualNotes, [60, 64]);
  assert.deepEqual(first.missingNotes, [67]);
  assert.deepEqual(first.extraNotes, []);
  assert.deepEqual(first.corrections, []);
  assert.equal(result.firstDivergence?.signedSemitoneCorrection, null);
  assert.doesNotMatch(result.firstDivergence?.message ?? "", /Move (left|right)/);
});

test("divergence copy preserves authored spelling and disambiguates performed MIDI", () => {
  const spelled = normalizeSheetMusicScore({
    id: "spelling",
    title: "Authored sharp",
    tempoBpm: 100,
    keyFifths: -2,
    measures: [{
      number: 1,
      durationBeats: 1,
      events: [{ kind: "note", offsetBeats: 0, durationBeats: 1, pitch: { step: "F", alter: 1, octave: 4 } }],
    }],
  });
  const result = evaluateSheetMusicPerformance(spelled, [{ midi: 68, onsetMs: 100 }], { finalize: true });
  assert.equal(result.firstDivergence?.kind, "pitch");
  assert.match(result.firstDivergence?.message ?? "", /Expected F♯4/);
  assert.match(result.firstDivergence?.message ?? "", /A♭4 \(performed MIDI 68\)/);
  assert.doesNotMatch(result.firstDivergence?.message ?? "", /G♯4/);
});

test("aligns an inserted attack without shifting every later score comparison", () => {
  const take = exactTake();
  take.splice(3, 0, { midi: 80, onsetMs: 1_300 });
  const result = evaluateSheetMusicPerformance(score(), take, { finalize: true });
  assert.equal(result.extraClusters.length, 1);
  assert.equal(result.firstDivergence?.kind, "extra-attack");
  assert.equal(result.comparisons[1].expectedNotes[0], 62);
  assert.equal(result.comparisons[1].actualNotes[0], 62);
  assert.equal(result.metrics.pitch.accuracy, 1);
});

test("separates right-note rhythm errors from pitch correctness", () => {
  const take = exactTake();
  take[3] = { ...take[3], onsetMs: 1_900, releaseMs: 2_400 };
  const result = evaluateSheetMusicPerformance(score(), take, { finalize: true, timingToleranceMs: 100 });
  assert.equal(result.comparisons[1].pitchMatch, true);
  assert.equal(result.comparisons[1].timingMatch, false);
  assert.equal(result.firstDivergence?.kind, "rhythm");
  assert.equal(result.metrics.pitch.accuracy, 1);
  assert.ok((result.metrics.rhythm.accuracy ?? 1) < 1);
});

test("assesses note length only when MIDI release evidence exists", () => {
  const take = exactTake();
  take[3] = { ...take[3], releaseMs: 1_650 };
  const result = evaluateSheetMusicPerformance(score(), take, { finalize: true, durationToleranceMs: 100 });
  assert.equal(result.comparisons[1].durationMatch, false);
  assert.equal(result.firstDivergence?.kind, "duration");

  const attacksOnly = exactTake().map((event) => ({ ...event, releaseMs: undefined }));
  const noLengths = evaluateSheetMusicPerformance(score(), attacksOnly, { finalize: true });
  assert.deepEqual(noLengths.metrics.duration, { compared: 0, matches: 0, accuracy: null });
});

test("opposite chord release errors cannot cancel into a false duration pass", () => {
  const chord = normalizeSheetMusicScore({
    id: "release-chord",
    title: "Release together",
    tempoBpm: 120,
    measures: [{
      number: 1,
      durationBeats: 1,
      events: [
        { kind: "note", id: "low", offsetBeats: 0, durationBeats: 1, midi: 60 },
        { kind: "note", id: "high", offsetBeats: 0, durationBeats: 1, midi: 64 },
      ],
    }],
  });
  const result = evaluateSheetMusicPerformance(chord, [
    { midi: 60, onsetMs: 1_000, releaseMs: 1_200 },
    { midi: 64, onsetMs: 1_000, releaseMs: 1_800 },
  ], { finalize: true, durationToleranceMs: 100 });
  assert.equal(result.comparisons[0].durationErrorMs, -300);
  assert.equal(result.comparisons[0].durationMatch, false);
  assert.equal(result.comparisons[0].durationNoteMidi, 60);
  assert.equal(result.comparisons[0].durationNoteLabel, "C4");
  assert.equal(result.firstDivergence?.kind, "duration");
  assert.match(result.firstDivergence?.message ?? "", /C4 was held 300 ms shorter/);
});

test("release evaluation follows a complete tie chain while truncated ties remain playable", () => {
  const normalized = score();
  const earlyTake = exactTake();
  earlyTake[4] = { ...earlyTake[4], releaseMs: 3_000 };
  const early = evaluateSheetMusicPerformance(normalized, earlyTake, { finalize: true, durationToleranceMs: 100 });
  const tiedAttack = early.comparisons.find((comparison) => comparison.expected.notes.some((note) => note.id === "held-e"));
  assert.equal(tiedAttack?.expected.durationBeats, 2);
  assert.equal(tiedAttack?.durationErrorMs, -500);
  assert.equal(tiedAttack?.durationMatch, false);

  const threeSegmentChain = normalizeSheetMusicScore({
    id: "three-ties",
    title: "One sounding key",
    tempoBpm: 120,
    measures: [
      { number: 1, durationBeats: 1, events: [{ kind: "note", id: "chain-start", offsetBeats: 0, durationBeats: 1, midi: 60, tie: { start: true } }] },
      { number: 2, durationBeats: 1, events: [{ kind: "note", id: "chain-middle", offsetBeats: 0, durationBeats: 1, midi: 60, tie: { stop: true, start: true } }] },
      { number: 3, durationBeats: 1, events: [{ kind: "note", id: "chain-end", offsetBeats: 0, durationBeats: 1, midi: 60, tie: { stop: true } }] },
    ],
  });
  const chainNotes = threeSegmentChain.events.filter((event) => event.kind === "note");
  assert.deepEqual(chainNotes.map((note) => note.durationBeats), [1, 1, 1]);
  assert.deepEqual(chainNotes.map((note) => note.soundingDurationBeats), [3, 2, 1]);
  assert.equal(threeSegmentChain.attacks.length, 1);
  assert.equal(threeSegmentChain.attacks[0].durationBeats, 3);
  assert.equal(evaluateSheetMusicPerformance(threeSegmentChain, [{ midi: 60, onsetMs: 100, releaseMs: 1_600 }], { finalize: true }).passed, true);
  assert.equal(selectSheetMusicLoop(threeSegmentChain, { startMeasureIndex: 1, endMeasureIndex: 2 }).attacks[0].durationBeats, 2);

  const truncated = normalizeSheetMusicScore({
    id: "truncated-ties",
    title: "Visible fragments",
    tempoBpm: 120,
    measures: [{
      number: 1,
      durationBeats: 2,
      events: [
        { kind: "note", id: "orphan-stop", offsetBeats: 0, durationBeats: 1, midi: 60, tie: { stop: true } },
        { kind: "note", id: "open-start", offsetBeats: 1, durationBeats: 1, midi: 62, tie: { start: true } },
      ],
    }],
  });
  assert.deepEqual(truncated.attacks.map((attack) => attack.midiNotes), [[60], [62]]);
  assert.deepEqual(truncated.attacks.map((attack) => attack.durationBeats), [1, 1]);
});

test("keeps contour and exact interval width separate for a near miss", () => {
  const take = exactTake();
  take[3] = { midi: 61, onsetMs: 1_500, releaseMs: 2_000 };
  const result = evaluateSheetMusicPerformance(score(), take, { finalize: true });
  assert.equal(result.metrics.soprano.comparisons[0].expectedSemitones, -5);
  assert.equal(result.metrics.soprano.comparisons[0].playedSemitones, -6);
  assert.equal(result.metrics.soprano.comparisons[0].contourMatch, true);
  assert.equal(result.metrics.soprano.comparisons[0].intervalMatch, false);
  assert.ok((result.metrics.soprano.contourAccuracy ?? 0) > (result.metrics.soprano.intervalAccuracy ?? 1));
});

test("suggests a bounded measure loop around the first repair point", () => {
  const result = evaluateSheetMusicPerformance(score(), exactTake().slice(0, 4), { finalize: true });
  assert.deepEqual(repairLoopAroundFirstDivergence(score(), result, 1), {
    startMeasureIndex: 0,
    endMeasureIndex: 1,
    hand: "both",
    includeBoundaryTies: true,
  });
  assert.throws(() => repairLoopAroundFirstDivergence(score(), result, 9), /0 through 8/);
  assert.equal(repairLoopAroundFirstDivergence(score(), evaluateSheetMusicPerformance(score(), exactTake(), { finalize: true })), null);
});

test("a rest-only loop is a valid empty exercise", () => {
  const restScore = normalizeSheetMusicScore({
    id: "rests",
    title: "Rest",
    tempoBpm: 80,
    measures: [{ number: 1, durationBeats: 4, events: [{ kind: "rest", offsetBeats: 0, durationBeats: 4, measureRest: true }] }],
  });
  const result = evaluateSheetMusicPerformance(restScore, [], { finalize: true });
  assert.equal(result.complete, true);
  assert.equal(result.passed, true);
  assert.equal(result.progress.percent, 1);
  assert.equal(result.metrics.pitch.accuracy, null);
});
