import assert from "node:assert/strict";
import test from "node:test";
import {
  familiarityResponseTrend,
  learnPreferenceTerrain,
  parsePhraseCharacterObservations,
  phraseRelationshipSignature,
  summarizePhraseCharacter,
  terrainFit,
  type PhraseCharacterObservation,
  type ResponseSample,
} from "../lib/personal-response.ts";

const samples: ResponseSample[] = [
  { position: { tension: 30, surprise: 40, drive: 80 }, liking: 90, interest: 85, familiarity: 20, recordedAt: "2026-01-01" },
  { position: { tension: 35, surprise: 45, drive: 85 }, liking: 88, interest: 90, familiarity: 50, recordedAt: "2026-01-02" },
];

test("learns a transparent preference center and uncertainty", () => {
  const terrain = learnPreferenceTerrain(samples);
  assert.ok(terrain);
  assert.ok(terrain.center.drive > 80 && terrain.center.drive < 86);
  assert.equal(terrain.sampleCount, 2);
  assert.ok(terrain.uncertainty > 6);
});

test("terrain fit rewards nearby positions", () => {
  const terrain = learnPreferenceTerrain(samples)!;
  assert.ok(terrainFit({ tension: 33, surprise: 43, drive: 83 }, terrain) > terrainFit({ tension: 95, surprise: 5, drive: 5 }, terrain));
});

test("tracks familiarity and liking changes separately", () => {
  assert.deepEqual(familiarityResponseTrend(samples), { familiarityChange: 30, likingChange: -2, observations: 2 });
});

const characterEvidence = {
  measured: { attackCount: 6, phraseMs: 1200, pitchSpan: 7, meanVelocity: 92, overlapShare: 0.25 },
  modeled: { meanCrunch: 0.22, endingRepose: 0.74, meanNovelty: 0.38, centerClarity: 0.18 },
};

function characterObservation(id: string, settledness: number, energy: number): PhraseCharacterObservation {
  return {
    id,
    recordedAt: `2026-01-0${id}`,
    phraseSignature: "3|2,2|12,12",
    ratings: { settledness, energy, familiarity: 40 + Number(id), liking: 70 + Number(id) },
    evidence: characterEvidence,
  };
}

test("keeps a phrase relationship signature invariant under transposition and tempo scaling", () => {
  const original = phraseRelationshipSignature([{ note: 60, onsetMs: 0 }, { note: 62, onsetMs: 100 }, { note: 64, onsetMs: 300 }]);
  const moved = phraseRelationshipSignature([{ note: 67, onsetMs: 0 }, { note: 69, onsetMs: 200 }, { note: 71, onsetMs: 600 }]);
  assert.equal(original, moved);
  assert.equal(phraseRelationshipSignature([]), "");
});

test("summarizes explicit phrase reports with sample-dependent uncertainty", () => {
  const first = summarizePhraseCharacter([characterObservation("1", 30, 70)])!;
  const repeated = summarizePhraseCharacter([characterObservation("1", 30, 70), characterObservation("2", 50, 50), characterObservation("3", 40, 60)])!;
  assert.equal(repeated.sampleCount, 3);
  assert.equal(repeated.center.settledness, 40);
  assert.ok(repeated.spread.energy > 0);
  assert.ok(repeated.uncertainty < first.uncertainty);
  assert.equal(summarizePhraseCharacter([]), null);
});

test("parses only complete bounded phrase-character observations", () => {
  const valid = characterObservation("1", 30, 70);
  const invalid = { ...valid, ratings: { ...valid.ratings, liking: 140 } };
  assert.deepEqual(parsePhraseCharacterObservations(JSON.stringify([valid, invalid])), [valid]);
  assert.deepEqual(parsePhraseCharacterObservations("not json"), []);
});
