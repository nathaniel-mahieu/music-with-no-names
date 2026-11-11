import assert from "node:assert/strict";
import test from "node:test";
import {
  advanceEarSearchTracker,
  buildEarSearchChunks,
  buildEarSearchReferencePlan,
  createEarSearchTracker,
  earSearchPlaybackLandingAt,
  earSearchLandingsForChunk,
  summarizeEarSearchHandProgress,
  type EarSearchLanding,
} from "../lib/piano-ear-search-model.ts";
import { normalizeSheetMusicScore } from "../lib/sheet-music-coach-model.ts";
import { ORBIT_STUDY_MUSICXML, normalizeImportedMusicXmlScore, parseMusicXml } from "../lib/musicxml-import.ts";

function landing(id: string, staff: EarSearchLanding["staff"]): EarSearchLanding {
  return {
    id,
    notes: [60],
    measureIndex: 0,
    measureNumber: "1",
    staff,
  };
}

function staffRouteScore() {
  return normalizeSheetMusicScore({
    id: "staff-route",
    title: "Staff route",
    tempoBpm: 96,
    measures: [{
      number: 1,
      durationBeats: 4,
      events: [
        // Deliberately cross pitch range and supplied hand metadata: routing
        // must follow the authored score staff and never infer a physical hand.
        { id: "upper-low", kind: "note" as const, midi: 48, offsetBeats: 0, durationBeats: 1, staff: 1, hand: "left" as const },
        { id: "lower-high", kind: "note" as const, midi: 72, offsetBeats: 1, durationBeats: 1, staff: 2, hand: "right" as const },
        { id: "shared-upper", kind: "note" as const, midi: 67, offsetBeats: 2, durationBeats: 1, staff: 1, hand: "left" as const },
        { id: "shared-lower", kind: "note" as const, midi: 55, offsetBeats: 2, durationBeats: 1, staff: 2, hand: "right" as const },
        { id: "unassigned", kind: "note" as const, midi: 60, offsetBeats: 3, durationBeats: 1, staff: 3, hand: "unknown" as const },
      ],
    }],
  });
}

function staffAnchorScore() {
  return normalizeSheetMusicScore({
    id: "staff-anchors",
    title: "Staff anchors",
    tempoBpm: 96,
    measures: [{
      number: 1,
      durationBeats: 4,
      events: [
        ...[60, 67].map((midi, index) => ({ id: `right-a-${index}`, kind: "note" as const, midi, offsetBeats: 0, durationBeats: 1, staff: 1, hand: "right" as const })),
        ...[48, 55].map((midi, index) => ({ id: `left-a-${index}`, kind: "note" as const, midi, offsetBeats: 0, durationBeats: 1, staff: 2, hand: "left" as const })),
        ...[62, 69].map((midi, index) => ({ id: `right-b-${index}`, kind: "note" as const, midi, offsetBeats: 1, durationBeats: 1, staff: 1, hand: "right" as const })),
        ...[50, 57].map((midi, index) => ({ id: `left-b-${index}`, kind: "note" as const, midi, offsetBeats: 1, durationBeats: 1, staff: 2, hand: "left" as const })),
      ],
    }],
  });
}

function mixedTextureScore() {
  const notes = (id: string, midiNotes: number[], offsetBeats: number, staff: number) => midiNotes.map((midi, index) => ({
    id: `${id}-${index}`, kind: "note" as const, midi, offsetBeats, durationBeats: .5, staff,
    hand: staff === 1 ? "right" as const : "left" as const,
  }));
  return normalizeSheetMusicScore({
    id: "mixed-texture-progression",
    title: "Mixed texture progression",
    tempoBpm: 96,
    measures: [
      { number: 1, durationBeats: 4, events: [
        ...notes("opening-upper", [60, 64, 67], 0, 1),
        ...notes("opening-lower", [48, 55], 0, 2),
        ...notes("upper-only-a", [60, 64], 1, 1),
        ...notes("upper-only-repeat", [60, 64], 2, 1),
        ...notes("lower-only", [50], 3, 2),
      ] },
      { number: 2, durationBeats: 4, events: [
        ...notes("single-upper", [69], 0, 1),
        ...notes("lower-triad", [50, 53, 57], 0, 2),
        ...notes("upper-only-b", [62, 65, 69], 1, 1),
        ...notes("return-upper", [60, 64, 67], 2, 1),
        ...notes("return-lower", [48, 55], 2, 2),
      ] },
    ],
  });
}

test("every staff and texture projection advances using only its selected keys", () => {
  const scores = [
    normalizeImportedMusicXmlScore(parseMusicXml(ORBIT_STUDY_MUSICXML, "orbit-study.musicxml")),
    staffRouteScore(),
    mixedTextureScore(),
  ];
  let projectedEmptySlots = 0;
  let reducedTargets = 0;
  for (const score of scores) {
    for (const span of ["half-bar", "one-bar", "two-bars"] as const) {
      for (const chunk of buildEarSearchChunks(score, { hand: "both", span })) {
        const canonical = earSearchLandingsForChunk(score, chunk, { hand: "both", voice: "full" });
        for (const hand of ["both", "right", "left"] as const) {
          for (const voice of ["upper", "bass", "staff-anchors", "full"] as const) {
            const context = `${score.id} ${span} ${chunk.frameStartBeat} ${hand} ${voice}`;
            const targets = earSearchLandingsForChunk(score, chunk, { hand, voice });
            const reference = buildEarSearchReferencePlan(score, chunk, targets, { hand, voice, tempoBpm: 60 });
            const attacks = reference.cues.filter((cue) => cue.kind === "attack");
            projectedEmptySlots += attacks.filter((cue) => cue.targetLandingIndex === null).length;
            for (const target of targets) {
              const cue = attacks.find((candidate) => candidate.attackId === target.id);
              assert.ok(cue, context);
              assert.deepEqual([...new Set(cue.notes.map((note) => note.midi))].sort((a, b) => a - b), target.notes, context);
              const original = canonical.find((candidate) => candidate.id === target.id);
              assert.ok(original, context);
              if (target.notes.length < original.notes.length) reducedTargets += 1;
            }
            assert.ok(attacks.filter((cue) => cue.targetLandingIndex === null).every((cue) => cue.notes.length === 0), context);
            if (!targets.length) continue;

            let tracker = createEarSearchTracker(targets);
            let eventId = 1;
            for (const [index, target] of targets.entries()) {
              // Long exploratory pauses do not matter; reversed chord attacks
              // remain one selected landing, even as its key count changes.
              const onsetMs = 1_000 + index * 17_000;
              const raw = [...target.notes].reverse().map((note, noteIndex) => ({
                id: eventId++, note, onsetMs: onsetMs + noteIndex * 8,
              }));
              tracker = advanceEarSearchTracker(targets, tracker, raw, {
                chordWindowMs: voice === "upper" || voice === "bass" ? 40 : 240,
                nowMs: onsetMs + 500,
              });
              assert.equal(tracker.matchedLandings, index + 1, context);
            }
            assert.equal(tracker.complete, true, context);
            assert.equal(tracker.acceptedProbeIds.length, targets.length, context);
          }
        }
      }
    }
  }
  assert.ok(projectedEmptySlots > 0, "excluded staff-only attacks must remain silent timeline slots, not required probes");
  assert.ok(reducedTargets > 0, "the matrix must actually exercise truncated score chords");
});

test("full texture requires every selected-staff key but never requires omitted-staff keys", () => {
  const score = mixedTextureScore();
  const chunk = buildEarSearchChunks(score, { hand: "both", span: "one-bar" })[0];
  for (const hand of ["both", "right", "left"] as const) {
    const targets = earSearchLandingsForChunk(score, chunk, { hand, voice: "full" });
    const expected = targets[0].notes;
    assert.ok(expected.length > 1);
    const subset = expected.slice(0, -1);
    let tracker = createEarSearchTracker(targets);
    tracker = advanceEarSearchTracker(targets, tracker, subset.map((note, index) => ({ id: index + 1, note, onsetMs: 1_000 + index * 8 })), {
      chordWindowMs: 240, nowMs: 1_500,
    });
    assert.equal(tracker.matchedLandings, 0, `${hand}: a strict subset must not count as full texture`);
    assert.equal(tracker.latest?.texture, "fewer-keys");
    const wrong = [...expected.slice(0, -1), 100];
    tracker = advanceEarSearchTracker(targets, tracker, wrong.map((note, index) => ({ id: 100 + index, note, onsetMs: 4_000 + index * 8 })), {
      chordWindowMs: 240, nowMs: 4_500,
    });
    assert.equal(tracker.matchedLandings, 0, `${hand}: an unrelated replacement must not count`);
    tracker = advanceEarSearchTracker(targets, tracker, expected.map((note, index) => ({ id: 200 + index, note, onsetMs: 8_000 + index * 8 })), {
      chordWindowMs: 240, nowMs: 8_500,
    });
    assert.equal(tracker.matchedLandings, 1, `${hand}: only the projected full texture should be required`);
  }
});

test("two-hand landings retain upper, lower, shared, and unknown staff identity", () => {
  const score = staffRouteScore();
  const chunk = buildEarSearchChunks(score, { hand: "both", span: "one-bar" })[0];
  assert.ok(chunk);

  const route = earSearchLandingsForChunk(score, chunk, { hand: "both", voice: "full" });
  assert.deepEqual(route.map((item) => item.staff), ["upper", "lower", "both", "unknown"]);
  assert.deepEqual(route.map((item) => item.notes), [[48], [72], [55, 67], [60]]);
});

test("top-note and bass-note routes name the staff that authored the selected pitch", () => {
  const score = staffRouteScore();
  const chunk = buildEarSearchChunks(score, { hand: "both", span: "one-bar" })[0];
  assert.ok(chunk);

  const upperVoice = earSearchLandingsForChunk(score, chunk, { hand: "both", voice: "upper" });
  const bassVoice = earSearchLandingsForChunk(score, chunk, { hand: "both", voice: "bass" });
  assert.deepEqual(upperVoice.map((item) => item.staff), ["upper", "lower", "upper", "unknown"]);
  assert.deepEqual(bassVoice.map((item) => item.staff), ["upper", "lower", "lower", "unknown"]);
});

test("staff-anchor listening keeps one landmark from each authored score staff", () => {
  const score = staffAnchorScore();
  const chunk = buildEarSearchChunks(score, { hand: "both", span: "one-bar" })[0];
  assert.ok(chunk);

  const anchors = earSearchLandingsForChunk(score, chunk, { hand: "both", voice: "staff-anchors" });
  const full = earSearchLandingsForChunk(score, chunk, { hand: "both", voice: "full" });
  assert.deepEqual(anchors.map((item) => item.notes), [[48, 67], [50, 69]]);
  assert.deepEqual(anchors.map((item) => item.staff), ["both", "both"]);
  assert.deepEqual(full.map((item) => item.notes), [[48, 55, 60, 67], [50, 57, 62, 69]]);
});

test("playback staff cues go neutral through written or compacted silence", () => {
  const cues = [
    { onsetMs: 0, notes: [{ onsetOffsetMs: 0, durationMs: 200 }] },
    { onsetMs: 1_000, notes: [{ onsetOffsetMs: 50, durationMs: 180 }] },
  ];

  assert.equal(earSearchPlaybackLandingAt(cues, 0), 0);
  assert.equal(earSearchPlaybackLandingAt(cues, 199), 0);
  assert.equal(earSearchPlaybackLandingAt(cues, 200), null);
  assert.equal(earSearchPlaybackLandingAt(cues, 1_049), null);
  assert.equal(earSearchPlaybackLandingAt(cues, 1_050), 1);
  assert.equal(earSearchPlaybackLandingAt(cues, 1_229), 1);
  assert.equal(earSearchPlaybackLandingAt(cues, 1_230), null);
  assert.throws(() => earSearchPlaybackLandingAt(cues, -1), /non-negative/i);
});

test("hand progress counts a shared landing in both lanes while preserving a shared total", () => {
  const route = [
    landing("upper-a", "upper"),
    landing("lower-a", "lower"),
    landing("shared-a", "both"),
    landing("unknown-a", "unknown"),
  ];

  assert.deepEqual(summarizeEarSearchHandProgress(route, 0), {
    upper: { caught: 0, total: 2 },
    lower: { caught: 0, total: 2 },
    shared: { caught: 0, total: 1 },
    nextStaff: "upper",
  });
  assert.deepEqual(summarizeEarSearchHandProgress(route, 2), {
    upper: { caught: 1, total: 2 },
    lower: { caught: 1, total: 2 },
    shared: { caught: 0, total: 1 },
    nextStaff: "both",
  });
  assert.deepEqual(summarizeEarSearchHandProgress(route, 3), {
    upper: { caught: 2, total: 2 },
    lower: { caught: 2, total: 2 },
    shared: { caught: 1, total: 1 },
    nextStaff: "unknown",
  });
});

test("hand progress clamps completed-prefix bounds without inventing staff credit", () => {
  const route = [landing("upper-a", "upper"), landing("unknown-a", "unknown"), landing("lower-a", "lower")];

  assert.deepEqual(summarizeEarSearchHandProgress(route, -20), {
    upper: { caught: 0, total: 1 },
    lower: { caught: 0, total: 1 },
    shared: { caught: 0, total: 0 },
    nextStaff: "upper",
  });
  assert.deepEqual(summarizeEarSearchHandProgress(route, 99), {
    upper: { caught: 1, total: 1 },
    lower: { caught: 1, total: 1 },
    shared: { caught: 0, total: 0 },
    nextStaff: null,
  });
});

test("hand progress rejects ambiguous non-integer and non-finite prefix positions", () => {
  const route = [landing("upper-a", "upper")];
  for (const value of [0.5, Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]) {
    assert.throws(() => summarizeEarSearchHandProgress(route, value), /integer|finite/i);
  }
});
