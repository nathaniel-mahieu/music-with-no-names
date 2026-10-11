import {
  buildSheetMusicReadingChunks,
  selectSheetMusicLoop,
  type PracticeHand,
  type SheetMusicScore,
  type SheetPitchCollectionAnalysis,
  type SheetReadingChunk,
} from "./sheet-music-coach-model.ts";

export const EAR_SEARCH_MAX_LANDINGS = 8;
export const EAR_SEARCH_MAX_PROBES = 64;

export type EarSearchVoice = "upper" | "bass" | "full";

export type EarSearchLanding = {
  id: string;
  notes: number[];
  measureIndex: number;
  measureNumber: string;
};

export type EarSearchProbe = {
  id: string | number;
  notes: number[];
  onsetMs: number;
};

export type EarSearchCollection = {
  source: "authored" | "local-candidate";
  pitchClasses: number[];
} | null;

export type EarSearchProbeFeedback = {
  probeId: string | number;
  status: "caught" | "searching";
  pitchDirection: "caught" | "higher" | "lower" | "same-height";
  register: "caught" | "far-below" | "below" | "same-band" | "above" | "far-above";
  proximity: "caught" | "near" | "nearby" | "far";
  pitchFamily: "exact" | "same-family" | "different";
  intervalDirection: "unavailable" | "matched" | "opposite" | "repeat-mismatch";
  intervalWidth: "unavailable" | "matched" | "narrower" | "wider" | "same-class-other-octave";
  collection: "caught" | "inside" | "outside" | "unclear";
  texture: "caught" | "same-family" | "more-compact" | "more-open" | "different";
};

export type EarSearchEvaluation = {
  totalLandings: number;
  matchedLandings: number;
  complete: boolean;
  acceptedProbeIds: Array<string | number>;
  latest: EarSearchProbeFeedback | null;
};

function assertMidi(value: number, label: string) {
  if (!Number.isInteger(value) || value < 0 || value > 127) throw new RangeError(`${label} must be an integer MIDI key from 0 through 127.`);
}

function normalizeNotes(notes: readonly number[], label: string) {
  if (!Array.isArray(notes) || !notes.length || notes.length > 16) throw new RangeError(`${label} needs from 1 through 16 keys.`);
  notes.forEach((note, index) => assertMidi(note, `${label} key ${index + 1}`));
  return [...new Set(notes)].sort((first, second) => first - second);
}

function sameNotes(first: readonly number[], second: readonly number[]) {
  return first.length === second.length && first.every((note, index) => note === second[index]);
}

function pitchClass(note: number) {
  return ((note % 12) + 12) % 12;
}

function pitchClassSignature(notes: readonly number[]) {
  return notes.map(pitchClass).sort((first, second) => first - second).join(":");
}

function center(notes: readonly number[]) {
  return notes.reduce((total, note) => total + note, 0) / notes.length;
}

function span(notes: readonly number[]) {
  return notes.at(-1)! - notes[0];
}

function representative(notes: readonly number[]) {
  return notes.at(-1)!;
}

function normalizeTarget(target: readonly EarSearchLanding[]) {
  if (!Array.isArray(target) || !target.length || target.length > EAR_SEARCH_MAX_LANDINGS) {
    throw new RangeError(`Ear-search targets need from 1 through ${EAR_SEARCH_MAX_LANDINGS} landings.`);
  }
  const measureIndexes = new Set<number>();
  return target.map((landing, index) => {
    if (!landing || typeof landing.id !== "string" || !landing.id.trim()) throw new TypeError(`Target landing ${index + 1} needs an ID.`);
    if (!Number.isInteger(landing.measureIndex) || landing.measureIndex < 0) throw new RangeError(`Target landing ${index + 1} needs a valid measure index.`);
    measureIndexes.add(landing.measureIndex);
    return { ...landing, notes: normalizeNotes(landing.notes, `Target landing ${index + 1}`) };
  }).map((landing, index, normalized) => {
    if (index === normalized.length - 1 && measureIndexes.size > 2) throw new RangeError("Ear-search targets may span at most two measures.");
    return landing;
  });
}

function normalizeProbes(probes: readonly EarSearchProbe[]) {
  if (!Array.isArray(probes)) throw new TypeError("Ear-search probes must be an array.");
  return probes.slice(-EAR_SEARCH_MAX_PROBES).map((probe, index) => {
    if (!probe || (typeof probe.id !== "string" && typeof probe.id !== "number")) throw new TypeError(`Probe ${index + 1} needs an ID.`);
    if (!Number.isFinite(probe.onsetMs) || probe.onsetMs < 0) throw new RangeError(`Probe ${index + 1} needs a non-negative finite onset.`);
    return { ...probe, notes: normalizeNotes(probe.notes, `Probe ${index + 1}`) };
  });
}

function feedbackForProbe(
  probe: EarSearchProbe,
  expected: EarSearchLanding,
  previous: EarSearchLanding | null,
  collection: EarSearchCollection,
  caught: boolean,
): EarSearchProbeFeedback {
  if (caught) return {
    probeId: probe.id,
    status: "caught",
    pitchDirection: "caught",
    register: "caught",
    proximity: "caught",
    pitchFamily: "exact",
    intervalDirection: previous ? "matched" : "unavailable",
    intervalWidth: previous ? "matched" : "unavailable",
    collection: "caught",
    texture: "caught",
  };

  const playedCenter = center(probe.notes);
  const targetCenter = center(expected.notes);
  const delta = targetCenter - playedCenter;
  const absoluteDelta = Math.abs(delta);
  const playedBand = Math.floor(playedCenter / 12);
  const targetBand = Math.floor(targetCenter / 12);
  const bandDelta = targetBand - playedBand;
  const sameFamily = pitchClassSignature(probe.notes) === pitchClassSignature(expected.notes);
  const expectedSpan = span(expected.notes);
  const playedSpan = span(probe.notes);
  const texture: EarSearchProbeFeedback["texture"] = sameFamily
    ? "same-family"
    : expected.notes.length === probe.notes.length && playedSpan < expectedSpan
      ? "more-compact"
      : expected.notes.length === probe.notes.length && playedSpan > expectedSpan
        ? "more-open"
        : "different";
  let intervalDirection: EarSearchProbeFeedback["intervalDirection"] = "unavailable";
  let intervalWidth: EarSearchProbeFeedback["intervalWidth"] = "unavailable";
  if (previous) {
    const targetMove = representative(expected.notes) - representative(previous.notes);
    const playedMove = representative(probe.notes) - representative(previous.notes);
    const targetDirection = Math.sign(targetMove);
    const playedDirection = Math.sign(playedMove);
    if (targetDirection !== playedDirection) {
      intervalDirection = targetDirection === 0 || playedDirection === 0 ? "repeat-mismatch" : "opposite";
    } else {
      intervalDirection = "matched";
      const targetWidth = Math.abs(targetMove);
      const playedWidth = Math.abs(playedMove);
      intervalWidth = targetWidth === playedWidth
        ? "matched"
        : targetWidth % 12 === playedWidth % 12
          ? "same-class-other-octave"
          : playedWidth < targetWidth
            ? "narrower"
            : "wider";
    }
  }
  const normalizedCollection = collection?.pitchClasses.map((value) => ((value % 12) + 12) % 12) ?? [];
  const collectionSet = new Set(normalizedCollection);
  const collectionCue: EarSearchProbeFeedback["collection"] = !collection || !collectionSet.size
    ? "unclear"
    : probe.notes.every((note) => collectionSet.has(pitchClass(note)))
      ? "inside"
      : "outside";

  return {
    probeId: probe.id,
    status: "searching",
    pitchDirection: delta > 0 ? "higher" : delta < 0 ? "lower" : "same-height",
    register: bandDelta >= 2 ? "far-below" : bandDelta === 1 ? "below" : bandDelta <= -2 ? "far-above" : bandDelta === -1 ? "above" : "same-band",
    proximity: absoluteDelta <= 2 ? "near" : absoluteDelta <= 7 ? "nearby" : "far",
    pitchFamily: sameFamily ? "same-family" : "different",
    intervalDirection,
    intervalWidth,
    collection: collectionCue,
    texture,
  };
}

/**
 * Match a slow exploratory performance without using onset timing as a score.
 * Non-matching probes are ignored rather than accumulated as errors, so an
 * accepted prefix remains secure while the learner searches for the next key.
 */
export function evaluateEarSearch(
  targetInput: readonly EarSearchLanding[],
  probeInput: readonly EarSearchProbe[],
  collection: EarSearchCollection = null,
): EarSearchEvaluation {
  const target = normalizeTarget(targetInput);
  const probes = normalizeProbes(probeInput);
  const acceptedProbeIds: Array<string | number> = [];
  let matchedLandings = 0;
  let latestCaught = false;
  for (const probe of probes) {
    if (matchedLandings >= target.length) break;
    if (sameNotes(probe.notes, target[matchedLandings].notes)) {
      acceptedProbeIds.push(probe.id);
      matchedLandings += 1;
      latestCaught = probe === probes.at(-1);
    } else if (probe === probes.at(-1)) {
      latestCaught = false;
    }
  }
  const latestProbe = probes.at(-1) ?? null;
  const complete = matchedLandings === target.length;
  const latest = !latestProbe
    ? null
    : latestCaught
      ? feedbackForProbe(latestProbe, target[Math.max(0, matchedLandings - 1)], matchedLandings > 1 ? target[matchedLandings - 2] : null, collection, true)
      : complete
        ? null
        : feedbackForProbe(latestProbe, target[matchedLandings], matchedLandings ? target[matchedLandings - 1] : null, collection, false);
  return { totalLandings: target.length, matchedLandings, complete, acceptedProbeIds, latest };
}

/** Build non-overlapping cognitive units, each bounded to two measures. */
export function buildEarSearchChunks(
  score: SheetMusicScore,
  options: { hand?: PracticeHand; maxLandings?: 4 | 6 | 8 } = {},
): SheetReadingChunk[] {
  const maxLandings = options.maxLandings ?? 4;
  const hand = options.hand ?? "both";
  if (![4, 6, 8].includes(maxLandings)) throw new RangeError("Ear-search chunk size must be 4, 6, or 8 landings.");
  const chunks: SheetReadingChunk[] = [];
  for (let startMeasureIndex = 0; startMeasureIndex < score.measures.length; startMeasureIndex += 2) {
    const endMeasureIndex = Math.min(score.measures.length - 1, startMeasureIndex + 1);
    const windowChunks = buildSheetMusicReadingChunks(score, {
      startMeasureIndex,
      endMeasureIndex,
      hand,
      minAttacks: 2,
      maxAttacks: maxLandings,
      targetAttacks: maxLandings,
    });
    chunks.push(...windowChunks.filter((chunk) => chunk.attackCount <= maxLandings && chunk.measureNumbers.length <= 2));
  }
  return chunks.map((chunk, ordinal) => ({ ...chunk, ordinal }));
}

export function earSearchLandingsForChunk(
  score: SheetMusicScore,
  chunk: SheetReadingChunk,
  options: { hand?: PracticeHand; voice?: EarSearchVoice } = {},
): EarSearchLanding[] {
  const hand = options.hand ?? "both";
  const voice = options.voice ?? "upper";
  const firstAttack = score.attacks.find((attack) => attack.id === chunk.startAttackId);
  const lastAttack = score.attacks.find((attack) => attack.id === chunk.endAttackId);
  if (!firstAttack || !lastAttack) throw new RangeError("Ear-search chunk attack IDs must exist in the score.");
  const loop = selectSheetMusicLoop(score, {
    startMeasureIndex: firstAttack.measureIndex,
    endMeasureIndex: lastAttack.measureIndex,
    startAttackId: chunk.startAttackId,
    endAttackId: chunk.endAttackId,
    hand,
  });
  return loop.attacks.map((attack) => {
    const ordered = [...attack.midiNotes].sort((first, second) => first - second);
    const notes = voice === "upper" ? [ordered.at(-1)!] : voice === "bass" ? [ordered[0]] : ordered;
    return { id: attack.id, notes, measureIndex: attack.measureIndex, measureNumber: attack.measureNumber };
  });
}

/**
 * Choose a cautious pitch collection for categorical feedback. Ambiguous short
 * windows remain unclear; this never claims to detect a key.
 */
export function earSearchCollectionFromAnalysis(analysis: SheetPitchCollectionAnalysis): EarSearchCollection {
  const authoredKind = analysis.authored.status === "explicit-major"
    ? "major"
    : analysis.authored.status === "explicit-minor"
      ? "natural-minor"
      : null;
  if (authoredKind) {
    const authored = analysis.candidates.find((candidate) => candidate.kind === authoredKind && candidate.signatureCompatible);
    if (authored) return { source: "authored", pitchClasses: [...authored.pitchClasses] };
  }
  if (analysis.evidence !== "rich") return null;
  const [first, second] = analysis.candidates;
  if (!first || first.fit !== "compatible" || (second && first.fitScore - second.fitScore < 0.04)) return null;
  return { source: "local-candidate", pitchClasses: [...first.pitchClasses] };
}
