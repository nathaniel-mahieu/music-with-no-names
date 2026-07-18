import assert from "node:assert/strict";
import test from "node:test";
import {
  IMMERSION_MAX_ANNOTATIONS,
  IMMERSION_MAX_CONTOUR_EVENTS,
  IMMERSION_MAX_FIELD_NOTES,
  IMMERSION_MAX_INTERVAL_LINKS,
  IMMERSION_MAX_TRAIL_EVENTS,
  immersionAttackContour,
  immersionAttackKnowledge,
  immersionChordShape,
  immersionCloudBounds,
  immersionCloudHull,
  immersionCurve,
  immersionDirectionPoint,
  immersionFifthsTide,
  immersionIntervalCharacter,
  immersionIntervalField,
  immersionLatestTransition,
  immersionPhraseNewness,
  immersionPitchPoint,
  immersionRecentPath,
  immersionReleaseProvenSilence,
  immersionRhythmLens,
  immersionScaleSectors,
  immersionSameNoteField,
  immersionTrail,
  planImmersionAnnotations,
} from "../lib/piano-immersion-model.ts";
import { PIANO_SCALES } from "../lib/piano-model.ts";
import { livePulseMirror } from "../lib/rhythm-model.ts";

const brightScale = PIANO_SCALES.find((scale) => scale.id === "bright-seven")!;

test("keeps pitch direction stable while Do reinterprets relational hue", () => {
  const underC = immersionPitchPoint(64, 60);
  const underG = immersionPitchPoint(64, 67);
  assert.equal(underC.angleDegrees, underG.angleDegrees);
  assert.equal(underC.x, underG.x);
  assert.equal(underC.y, underG.y);
  assert.notEqual(underC.relativeFifthStep, underG.relativeFifthStep);
  assert.notEqual(underC.hue, underG.hue);
});

test("octave copies share fifths direction and add equal register depth", () => {
  const lower = immersionPitchPoint(48, 60);
  const middle = immersionPitchPoint(60, 60);
  const upper = immersionPitchPoint(72, 60);
  assert.equal(lower.angleDegrees, middle.angleDegrees);
  assert.equal(middle.angleDegrees, upper.angleDegrees);
  assert.ok(Math.abs((middle.radius - lower.radius) - (upper.radius - middle.radius)) < 1e-12);
  assert.ok(Math.abs(middle.radius - lower.radius - 33) < 1e-12);
});

test("bounds trail and dense interval fields deterministically", () => {
  const events = Array.from({ length: 80 }, (_, index) => ({ id: index + 1, note: 40 + index % 36 }));
  const first = immersionTrail(events, 60);
  const second = immersionTrail(events, 60);
  assert.equal(first.length, IMMERSION_MAX_TRAIL_EVENTS);
  assert.deepEqual(first, second);
  assert.equal(first[0].event.id, 53);

  const field = immersionIntervalField(Array.from({ length: 20 }, (_, index) => 40 + index), 60);
  assert.equal(field.notes.length, IMMERSION_MAX_FIELD_NOTES);
  assert.equal(field.links.length, IMMERSION_MAX_INTERVAL_LINKS);
  assert.equal(field.omittedNoteCount, 12);
  assert.deepEqual(field.notes, [40, 43, 45, 48, 51, 54, 56, 59]);
  assert.equal(field.totalPairCount, 190);
  assert.equal(field.analyzedPairCount, 28);
  assert.equal(field.omittedLinkCount, 178);
});

test("keeps the latest attack visible and puts its nearest semitone relationship first", () => {
  const dense = immersionIntervalField(Array.from({ length: 20 }, (_, index) => 40 + index), 60, 50);
  assert.equal(dense.notes.includes(50), true);
  assert.equal(dense.notes[0], 40);
  assert.equal(dense.notes.at(-1), 59);
  assert.deepEqual([dense.links[0].lower, dense.links[0].upper, dense.links[0].semitones], [48, 50, 2]);

  const compact = immersionIntervalField([60, 61, 67], 60, 67);
  assert.deepEqual(compact.links.map((link) => [link.lower, link.upper, link.semitones]), [
    [61, 67, 6],
    [60, 61, 1],
    [60, 67, 7],
  ]);
  assert.equal(compact.links[0].referenceKind, "geometric-midpoint");
});

test("keeps newness local to the retained phrase rather than the seven-attack microscope", () => {
  const phrase = [60, 61, 62, 63, 64, 65, 66, 67, 68, 60].map((note) => ({ note }));
  assert.ok(immersionPhraseNewness(phrase) <= 0.35);
  assert.ok(immersionPhraseNewness(phrase.slice(-7)) >= 0.72);
});

test("requires every retained voice to release before drawing a silence break", () => {
  const held = { id: 1, note: 60, onsetMs: 0, releaseMs: null, fieldNotes: [60] };
  const passing = { id: 2, note: 64, onsetMs: 10, releaseMs: 20, fieldNotes: [60, 64] };
  const underHold = { id: 3, note: 67, onsetMs: 30, releaseMs: null, fieldNotes: [60, 67] };
  assert.deepEqual(immersionReleaseProvenSilence([held, passing, underHold], underHold), { proven: false, durationMs: null });

  const released = { ...held, releaseMs: 12 };
  const afterSilence = { ...underHold, fieldNotes: [67] };
  assert.deepEqual(immersionReleaseProvenSilence([released, passing, afterSilence], afterSilence), { proven: true, durationMs: 10 });
});

test("matches modeled evidence only to the exact displayed note field", () => {
  assert.equal(immersionSameNoteField([60, 64, 67], [67, 60, 64, 64]), true);
  assert.equal(immersionSameNoteField([60, 64, 67], [72]), false);
  assert.equal(immersionSameNoteField([60, 64, 67], [60, 64]), false);
});

test("handles empty, repeated, invalid, and extreme input without invalid geometry", () => {
  assert.deepEqual(immersionIntervalField([], 60), { notes: [], links: [], totalPairCount: 0, analyzedPairCount: 0, omittedNoteCount: 0, omittedLinkCount: 0 });
  assert.equal(immersionIntervalField([60, 60, 60], 60).links.length, 0);
  const extremes = [immersionPitchPoint(Number.NaN, Number.NaN), immersionPitchPoint(-999, 60), immersionPitchPoint(999, 60)];
  extremes.forEach((point) => {
    assert.ok(Number.isFinite(point.x));
    assert.ok(Number.isFinite(point.y));
    assert.ok(Number.isFinite(point.radius));
  });
  assert.ok(immersionCloudBounds([0, 127], 60));
  assert.equal(immersionCloudBounds([], 60), null);
});

test("builds valid one-, two-, and multi-point paths", () => {
  assert.equal(immersionCurve([]), "");
  assert.equal(immersionCurve([{ x: 1, y: 2 }]), "M 1.00 2.00");
  assert.equal(immersionCurve([{ x: 1, y: 2 }, { x: 3, y: 4 }]), "M 1.00 2.00 L 3.00 4.00");
  assert.match(immersionCurve([{ x: 1, y: 2 }, { x: 3, y: 4 }, { x: 5, y: 6 }]), /^M .+ Q .+ T .+$/);
  const direction = immersionDirectionPoint(0, 200);
  assert.ok(Number.isFinite(direction.x) && Number.isFinite(direction.y));
});

test("folds scale membership into deterministic circle-of-fifths sectors", () => {
  const sectors = immersionScaleSectors(brightScale, 0);
  assert.equal(sectors.length, 12);
  assert.deepEqual(sectors.map((sector) => sector.fifthStep), Array.from({ length: 12 }, (_, index) => index));
  assert.deepEqual(sectors.map((sector) => sector.pitchClass), [0, 7, 2, 9, 4, 11, 6, 1, 8, 3, 10, 5]);
  assert.deepEqual(sectors.filter((sector) => sector.inRoute).map((sector) => sector.fifthStep), [0, 1, 2, 3, 4, 5, 11]);
  assert.deepEqual(
    sectors.filter((sector) => sector.inRoute).map((sector) => sector.degreeIndex),
    [0, 4, 1, 5, 2, 6, 3],
  );
  assert.equal(sectors.find((sector) => sector.pitchClass === 6)?.degreeIndex, -1);
  assert.deepEqual(immersionScaleSectors(brightScale, 0), sectors);
});

test("keeps fifths-tide centers continuous across the circular wrap", () => {
  const events = [
    { id: 1, note: 65, onsetMs: 900 }, // F is fifth-step 11.
    { id: 2, note: 60, onsetMs: 1000 }, // C is fifth-step 0.
    { id: 3, note: 72, onsetMs: 1050 }, // A second C keeps the circular mean on step 0.
  ];
  const scopes = immersionFifthsTide(events, events, 160);
  assert.deepEqual(scopes.map((scope) => scope.id), ["cluster", "microscope", "phrase"]);
  for (const scope of scopes) {
    assert.equal(scope.eventCount, 3);
    assert.equal(scope.uniquePitchClassCount, 2);
    assert.equal(scope.countsByFifthStep[11], 1);
    assert.equal(scope.countsByFifthStep[0], 2);
    assert.ok(scope.concentration > 0.96);
    assert.equal(scope.centerPitchClass, 0);
    assert.ok(scope.centerPoint && Number.isFinite(scope.centerPoint.x) && Number.isFinite(scope.centerPoint.y));
    assert.match(scope.densityPath, /^M .+ Z$/);
    assert.doesNotMatch(scope.densityPath, /NaN|Infinity/);
  }
});

test("withholds a fifths-tide center for evenly opposed evidence", () => {
  const events = [
    { id: 1, note: 60, onsetMs: 0 }, // fifth-step 0
    { id: 2, note: 66, onsetMs: 100 }, // fifth-step 6
  ];
  const scopes = immersionFifthsTide(events, events, 160);
  for (const scope of scopes) {
    assert.ok(scope.concentration < 1e-12);
    assert.equal(scope.centerPitchClass, null);
    assert.equal(scope.centerPoint, null);
  }
});

test("describes the latest attack move and pitch-class recurrence", () => {
  const events = [
    { id: 1, note: 60, onsetMs: 0 },
    { id: 2, note: 64, onsetMs: 100 },
    { id: 3, note: 72, onsetMs: 220 },
  ];
  const knowledge = immersionAttackKnowledge(events, 60, brightScale);
  assert.ok(knowledge);
  assert.equal(knowledge.event.id, 3);
  assert.equal(knowledge.previous?.id, 2);
  assert.equal(knowledge.context.syllable, "Do");
  assert.equal(knowledge.context.octaveOffset, 1);
  assert.equal(knowledge.stepsFromDo, 12);
  assert.equal(knowledge.relationToDo.semitones, 12);
  assert.equal(knowledge.moveSteps, 8);
  assert.equal(knowledge.moveLandmark?.semitones, 8);
  assert.equal(knowledge.onsetGapMs, 120);
  assert.equal(knowledge.pitchClassOccurrenceCount, 2);
  assert.equal(knowledge.attacksSincePreviousPitchClass, 1);
  assert.equal(immersionAttackKnowledge([], 60, brightScale), null);
});

test("groups close attacks in the contour and connects only singleton groups", () => {
  const events = [
    { id: 1, note: 60, onsetMs: 0 },
    { id: 2, note: 64, onsetMs: 50 },
    { id: 3, note: 67, onsetMs: 260 },
    { id: 4, note: 69, onsetMs: 450 },
  ];
  const contour = immersionAttackContour(events, 100);
  assert.equal(contour.groupCount, 3);
  assert.equal(contour.monophonic, false);
  assert.deepEqual(contour.points.map((point) => point.groupIndex), [0, 0, 1, 2]);
  assert.deepEqual(contour.segments.map((segment) => segment.sameGroup), [true, false, false]);
  assert.deepEqual(contour.segments.map((segment) => segment.connectAsLine), [false, false, true]);
  assert.equal(contour.points[0].x, 350);
  assert.equal(contour.points.at(-1)?.x, 850);
  contour.points.forEach((point) => assert.ok(Number.isFinite(point.x) && Number.isFinite(point.y)));
});

test("keeps contour bouquets inside the declared maximum chord span", () => {
  const events = [
    { id: 1, note: 60, onsetMs: 0 },
    { id: 2, note: 62, onsetMs: 90 },
    { id: 3, note: 64, onsetMs: 180 },
    { id: 4, note: 65, onsetMs: 270 },
  ];
  const contour = immersionAttackContour(events, 100);
  assert.deepEqual(contour.points.map((point) => point.groupIndex), [0, 0, 0, 1]);
  assert.equal(contour.groupCount, 2);
  assert.deepEqual(contour.segments.map((segment) => segment.sameGroup), [true, true, false]);
});

test("caps the attack contour at the newest deterministic event window", () => {
  const events = Array.from({ length: 20 }, (_, index) => ({ id: index + 1, note: 48 + index, onsetMs: index * 200 }));
  const contour = immersionAttackContour(events, 100);
  assert.equal(contour.points.length, IMMERSION_MAX_CONTOUR_EVENTS);
  assert.equal(contour.points[0].event.id, 9);
  assert.equal(contour.points.at(-1)?.event.id, 20);
  assert.equal(contour.groupCount, IMMERSION_MAX_CONTOUR_EVENTS);
  assert.equal(contour.monophonic, true);
});

test("keeps an unanchored rhythm reading on a local onset ruler rather than inventing beat accuracy", () => {
  const events = [
    { id: 1, note: 60, onsetMs: 0 },
    { id: 2, note: 62, onsetMs: 500 },
    { id: 3, note: 64, onsetMs: 750 },
    { id: 4, note: 65, onsetMs: 1250 },
  ];
  const lens = immersionRhythmLens(events, null);
  assert.equal(lens.source, "local-ruler");
  assert.equal(lens.rulerMs, 500);
  assert.equal(lens.pulsesPerMinute, null);
  assert.equal(lens.latestGapMs, 500);
  assert.equal(lens.latestMultiple, 1);
  assert.equal(lens.nearestRatioLabel, "1:1");
  assert.equal(lens.deviationPercent, 0);
  assert.equal(lens.phaseLabel, null);
});

test("uses exact learner-declared pulse landmarks when a four-tap mirror is active", () => {
  const events = [
    { id: 1, note: 60, onsetMs: 0 },
    { id: 2, note: 60, onsetMs: 500 },
    { id: 3, note: 60, onsetMs: 1000 },
    { id: 4, note: 60, onsetMs: 1500 },
    { id: 5, note: 64, onsetMs: 1760 },
    { id: 6, note: 67, onsetMs: 2010 },
  ];
  const mirror = livePulseMirror(events);
  const lens = immersionRhythmLens(events, mirror);
  assert.equal(lens.source, "learner-pulse");
  assert.equal(lens.rulerMs, 500);
  assert.equal(lens.pulsesPerMinute, 120);
  assert.equal(lens.latestGapMs, 250);
  assert.equal(lens.latestMultiple, 0.5);
  assert.equal(lens.nearestRatioLabel, "1:2");
  assert.equal(lens.deviationPercent, 0);
  assert.equal(lens.phaseLabel, "pulse line");
  assert.ok(lens.phaseDistanceMs != null && Math.abs(lens.phaseDistanceMs - 10) < 1e-9);
});

test("names every one-octave semitone spacing without replacing the exact key count", () => {
  assert.deepEqual(Array.from({ length: 13 }, (_, semitones) => immersionIntervalCharacter(semitones).spacingLabel), [
    "same-key repeat",
    "nearest-key · tight",
    "two-semitone · close",
    "third-sized · compact",
    "third-sized · broader",
    "fourth-sized · open mid-span",
    "half-octave · split",
    "fifth-sized · open mid-span",
    "sixth-sized · broad",
    "sixth-sized · broader",
    "seventh-sized · near octave",
    "octave-edge · one key short",
    "octave · register echo",
  ]);
  assert.equal(immersionIntervalCharacter(-3).spacingLabel, "third-sized · compact");
  assert.equal(immersionIntervalCharacter(13).spacingLabel, "1 octave + nearest-key · tight");
  assert.equal(immersionIntervalCharacter(24).spacingLabel, "2 octaves · register echo");
});

test("keeps compound physical motion, signed ratio, and folded pitch-class distance separate", () => {
  const upward = immersionLatestTransition([
    { id: 1, note: 60, onsetMs: 0, releaseMs: 100, releaseReason: "key" as const, fieldNotes: [60] },
    { id: 2, note: 73, onsetMs: 240, releaseMs: null, releaseReason: null, fieldNotes: [73] },
  ], 100, 60, brightScale);
  assert.ok(upward);
  assert.equal(upward.signedSemitones, 13);
  assert.equal(upward.absoluteSemitones, 13);
  assert.equal(upward.direction, "up");
  assert.equal(upward.landmark.semitones, 13);
  assert.equal(upward.octaveCount, 1);
  assert.equal(upward.remainderSemitones, 1);
  assert.equal(upward.pitchClassDistance, 1);
  assert.equal(upward.samePitchClass, false);
  assert.ok(Math.abs(upward.directionalFrequencyRatio - 2 ** (13 / 12)) < 1e-12);
  assert.equal(upward.connection.kind, "silence");
  assert.equal(upward.connection.durationMs, 140);

  const downward = immersionLatestTransition([
    { id: 1, note: 72, onsetMs: 0 },
    { id: 2, note: 64, onsetMs: 220 },
  ], 100, 60, brightScale);
  assert.ok(downward);
  assert.equal(downward.signedSemitones, -8);
  assert.equal(downward.direction, "down");
  assert.equal(downward.pitchClassDistance, 4);
  assert.ok(Math.abs(downward.directionalFrequencyRatio * downward.spanFrequencyRatio - 1) < 1e-12);
});

test("separates bouquet chronology from isolated note-to-note transitions", () => {
  const inside = immersionLatestTransition([
    { id: 1, note: 60, onsetMs: 0 },
    { id: 2, note: 64, onsetMs: 50 },
  ], 100, 60, brightScale);
  assert.ok(inside);
  assert.equal(inside.context, "inside-bouquet");
  assert.equal(inside.sourceGroupAttackCount, 2);
  assert.equal(inside.targetGroupAttackCount, 2);

  const after = immersionLatestTransition([
    { id: 1, note: 60, onsetMs: 0 },
    { id: 2, note: 64, onsetMs: 50 },
    { id: 3, note: 67, onsetMs: 300 },
  ], 100, 60, brightScale);
  assert.ok(after);
  assert.equal(after.context, "after-bouquet");
  assert.equal(after.sourceGroupAttackCount, 2);
  assert.equal(after.targetGroupAttackCount, 1);
  assert.equal(after.signedSemitones, 3);
});

test("gates pair-sound context on release or attack-snapshot overlap evidence", () => {
  const releaseOverlap = immersionLatestTransition([
    { id: 1, note: 60, onsetMs: 0, releaseMs: 260, releaseReason: "pedal" as const, fieldNotes: [60] },
    { id: 2, note: 67, onsetMs: 220, releaseMs: null, releaseReason: null, fieldNotes: [60, 67] },
  ], 100, 60, brightScale);
  assert.ok(releaseOverlap);
  assert.deepEqual(releaseOverlap.connection, { kind: "overlap", durationMs: 40, pedalExtended: true, basis: "release-time" });

  const snapshotOverlap = immersionLatestTransition([
    { id: 1, note: 60, onsetMs: 0, releaseMs: null, releaseReason: null, fieldNotes: [60] },
    { id: 2, note: 64, onsetMs: 220, releaseMs: null, releaseReason: null, fieldNotes: [60, 64] },
  ], 100, 60, brightScale);
  assert.ok(snapshotOverlap);
  assert.deepEqual(snapshotOverlap.connection, { kind: "overlap", durationMs: null, pedalExtended: false, basis: "attack-snapshot" });

  const sameKeyUnknown = immersionLatestTransition([
    { id: 1, note: 60, onsetMs: 0, releaseMs: null, releaseReason: null, fieldNotes: [60] },
    { id: 2, note: 60, onsetMs: 220, releaseMs: null, releaseReason: null, fieldNotes: [60] },
  ], 100, 60, brightScale);
  assert.ok(sameKeyUnknown);
  assert.equal(sameKeyUnknown.signedSemitones, 0);
  assert.equal(sameKeyUnknown.samePitchClass, true);
  assert.equal(sameKeyUnknown.connection.kind, "unknown");
  assert.equal(immersionLatestTransition([], 100, 60, brightScale), null);
});

test("summarizes a transposition-stable five-note line with inspectable route and interval evidence", () => {
  const events = [60, 62, 64, 65, 67].map((note, index) => ({ id: index + 1, note, onsetMs: index * 220 }));
  const path = immersionRecentPath(events, 100, 60, brightScale);
  assert.equal(path.completeFive, true);
  assert.equal(path.monophonic, true);
  assert.equal(path.groupCount, 5);
  assert.deepEqual(path.steps.map((step) => step.semitones), [2, 2, 1, 2]);
  assert.equal(path.direction, "rising");
  assert.equal(path.pitchSpan, 7);
  assert.equal(path.directionTurns, 0);
  assert.equal(path.repeatedIntervalCount, 3);
  assert.equal(path.selectedRouteCount, 5);
  assert.equal(path.catalogCandidates.length, 2);
  assert.equal(path.latestTransition?.signedSemitones, 2);
  assert.equal(path.latestTransition?.context, "between-singletons");

  const transposed = immersionRecentPath(events.map((event) => ({ ...event, note: event.note + 5 })), 100, 65, brightScale);
  assert.deepEqual(transposed.steps, path.steps);
  assert.equal(transposed.direction, path.direction);
  assert.equal(transposed.pitchSpan, path.pitchSpan);
  assert.equal(transposed.selectedRouteCount, path.selectedRouteCount);
});

test("refuses to turn a close-time bouquet into an isolated melody", () => {
  const events = [
    { id: 1, note: 60, onsetMs: 0 },
    { id: 2, note: 64, onsetMs: 50 },
    { id: 3, note: 67, onsetMs: 300 },
    { id: 4, note: 69, onsetMs: 520 },
    { id: 5, note: 71, onsetMs: 740 },
  ];
  const path = immersionRecentPath(events, 100, 60, brightScale);
  assert.equal(path.completeFive, true);
  assert.equal(path.monophonic, false);
  assert.equal(path.groupCount, 4);
  assert.equal(path.steps[0].sameGroup, true);
});

test("builds valid closed cloud hulls for one, two, and three notes", () => {
  const hulls = [
    immersionCloudHull([60], 60),
    immersionCloudHull([60, 64], 60),
    immersionCloudHull([60, 64, 67], 60),
  ];
  assert.deepEqual(hulls.map((hull) => hull?.pointCount), [1, 2, 3]);
  hulls.forEach((hull) => {
    assert.ok(hull);
    assert.ok(Number.isFinite(hull.centerX) && Number.isFinite(hull.centerY));
    assert.match(hull.path, /^M .+ Z$/);
    assert.doesNotMatch(hull.path, /NaN|Infinity/);
  });
  assert.match(hulls[0]!.path, / A /);
  assert.match(hulls[1]!.path, / L .+ A /);
  assert.match(hulls[2]!.path, / Q /);
  assert.equal(immersionCloudHull([], 60), null);
});

test("reduces dense same-direction registers to their boundary while retaining source count", () => {
  const notes = [24, 36, 48, 60, 72, 84, 96, 108];
  const hull = immersionCloudHull(notes, 60);
  assert.ok(hull);
  assert.equal(hull.pointCount, notes.length);
  assert.match(hull.path, / L .+ A /);
  assert.doesNotMatch(hull.path, / Q /);
});

test("separates chord bass shape, cyclic gaps, physical gaps, and doubling", () => {
  const shape = immersionChordShape([60, 64, 67, 72]);
  assert.deepEqual(shape, {
    bass: 60,
    bassPitchClass: 0,
    noteCount: 4,
    pitchClassCount: 3,
    bassRelativePositions: [0, 4, 7],
    cyclicGaps: [4, 3, 5],
    physicalGaps: [4, 3, 5],
    span: 12,
    doublingCount: 1,
  });
  assert.equal(immersionChordShape([60]), null);
});

test("plans annotations by priority, respects its hard cap, and avoids collisions", () => {
  const sameAnchor = [
    { id: "low", anchorX: 720, anchorY: 350, lines: ["low"], priority: 1 },
    { id: "high", anchorX: 720, anchorY: 350, lines: ["high"], priority: 3 },
    { id: "middle", anchorX: 720, anchorY: 350, lines: ["middle"], priority: 2 },
  ];
  const prioritized = planImmersionAnnotations(sameAnchor, 2);
  assert.deepEqual(prioritized.map((annotation) => annotation.id), ["high", "middle"]);
  const [first, second] = prioritized;
  const separated = first.bounds.right + 8 < second.bounds.left
    || second.bounds.right + 8 < first.bounds.left
    || first.bounds.bottom + 6 < second.bounds.top
    || second.bounds.bottom + 6 < first.bounds.top;
  assert.equal(separated, true);

  const spread = Array.from({ length: 8 }, (_, index) => {
    const angle = index / 8 * Math.PI * 2;
    return {
      id: `annotation-${index}`,
      anchorX: 600 + Math.cos(angle) * 220,
      anchorY: 350 + Math.sin(angle) * 220,
      lines: [`annotation ${index}`],
      priority: 8 - index,
    };
  });
  const capped = planImmersionAnnotations(spread, 99);
  assert.equal(capped.length, IMMERSION_MAX_ANNOTATIONS);
  assert.deepEqual(capped, planImmersionAnnotations(spread, 99));
});
