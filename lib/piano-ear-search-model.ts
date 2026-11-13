import {
  chordSpacing,
  selectSheetMusicLoop,
  type PracticeHand,
  type SheetMusicPracticeAttack,
  type SheetMusicScore,
  type SheetPitchCollectionAnalysis,
  type SheetReferencePlanCue,
  type SheetReferencePlanNote,
  type SheetReferencePlan,
  type SheetReadingChunk,
} from "./sheet-music-coach-model.ts";

export const EAR_SEARCH_MAX_LANDINGS = 32;
export const EAR_SEARCH_MAX_PROBES = 4096;
export const EAR_SEARCH_RECENT_PROBES = 64;
export const EAR_SEARCH_CHORD_SETTLE_MS = 60;
export const EAR_SEARCH_MAX_REFERENCE_GAP_MS = 2400;

export type EarSearchVoice = "upper" | "bass" | "staff-anchors" | "full";
export type EarSearchTimeSpan = "half-bar" | "one-bar" | "two-bars";
export type EarSearchStaff = "upper" | "lower" | "both" | "unknown";

export type EarSearchLanding = {
  id: string;
  notes: number[];
  /** Source-note IDs aligned to `notes`, used to keep reference audio exact. */
  sourceNoteIds?: string[];
  measureIndex: number;
  measureNumber: string;
  /** Score-authored staff role. MIDI cannot observe the learner's physical hand. */
  staff?: EarSearchStaff;
};

export type EarSearchPlaybackCue = {
  onsetMs: number;
  notes: ReadonlyArray<{ onsetOffsetMs: number; durationMs: number }>;
};

export type EarSearchHandProgress = {
  upper: { caught: number; total: number };
  lower: { caught: number; total: number };
  shared: { caught: number; total: number };
  nextStaff: EarSearchStaff | null;
};

export type EarSearchFutureEcho = {
  landingId: string;
  landingIndex: number;
  matchedNoteCount: number;
  targetNoteCount: number;
  /** Distinct target-note coverage from zero-exclusive through one-inclusive. */
  coverage: number;
};

/**
 * A reading chunk plus the exact practice-loop context that produced its IDs.
 * Hand-filtered and boundary-tie attacks deliberately do not share IDs with
 * score.attacks, so retaining this source window is what makes reconstruction
 * deterministic.
 */
export type EarSearchChunk = SheetReadingChunk & {
  sourceStartMeasureIndex: number;
  sourceEndMeasureIndex: number;
  hand: PracticeHand;
  /** The score-clock boundary is structural and never inferred from attacks. */
  frameStartBeat: number;
  frameEndBeat: number;
  span: EarSearchTimeSpan;
  /** Stable half-bar origin: 0 is the bar start; 1 is its midpoint. */
  startHalf: 0 | 1;
};

export type EarSearchReferencePlanNote = SheetReferencePlanNote;

export type EarSearchReferencePlanCue = SheetReferencePlanCue & {
  /** A carry is audible at the frame boundary but is not a target attack. */
  kind: "attack" | "carry";
  /** Stable position in the canonical, both-staff attack clock. */
  canonicalAttackIndex: number | null;
  /** Position in the selected target route; null for silence and carries. */
  targetLandingIndex: number | null;
  /** Score-authored staff identity, never an inference about the MIDI hand. */
  staff: EarSearchStaff;
  /** Original attack beat for a sound that began before this frame. */
  carriedFromBeat?: number;
};

export type EarSearchRestSpan = {
  startMs: number;
  endMs: number;
  durationMs: number;
};

export type EarSearchReferencePlan = Omit<SheetReferencePlan, "cues"> & {
  cues: EarSearchReferencePlanCue[];
  /** Exact complement of selected sounding intervals inside the frame. */
  restSpans: EarSearchRestSpan[];
};

export type EarSearchProbe = {
  id: string | number;
  notes: number[];
  onsetMs: number;
};

export type EarSearchAttack = {
  id: number;
  note: number;
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
  texture: "caught" | "same-family" | "fewer-keys" | "more-keys" | "more-compact" | "more-open" | "different";
};

export type EarSearchEvaluation = {
  totalLandings: number;
  matchedLandings: number;
  complete: boolean;
  acceptedProbeIds: Array<string | number>;
  latest: EarSearchProbeFeedback | null;
};

export type EarSearchTracker = EarSearchEvaluation & {
  processedThroughEventId: number;
  probeCount: number;
  recentProbes: EarSearchProbe[];
  pendingAttacks: EarSearchAttack[];
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
    // A two-bar window beginning halfway through a bar touches three authored
    // measures. The frame builder bounds its actual time; the landing cap
    // independently keeps this pitch-only target API browser-safe.
    if (index === normalized.length - 1 && measureIndexes.size > 3) throw new RangeError("Ear-search targets may span at most three measures.");
    return landing;
  });
}

function normalizeProbes(probes: readonly EarSearchProbe[]) {
  if (!Array.isArray(probes)) throw new TypeError("Ear-search probes must be an array.");
  if (probes.length > EAR_SEARCH_MAX_PROBES) throw new RangeError(`Ear-search evaluation is limited to ${EAR_SEARCH_MAX_PROBES} probes.`);
  return probes.map((probe, index) => {
    if (!probe || (typeof probe.id !== "string" && typeof probe.id !== "number")) throw new TypeError(`Probe ${index + 1} needs an ID.`);
    if (!Number.isFinite(probe.onsetMs) || probe.onsetMs < 0) throw new RangeError(`Probe ${index + 1} needs a non-negative finite onset.`);
    return { ...probe, notes: normalizeNotes(probe.notes, `Probe ${index + 1}`) };
  });
}

/**
 * Describe which later hidden landings contain notes from one exploratory
 * probe. The next required landing is deliberately excluded: this is a brief
 * orientation echo, never evaluation credit and never a way to skip ahead.
 */
export function earSearchFutureEchoes(
  targetInput: readonly EarSearchLanding[],
  matchedLandings: number,
  playedNotesInput: readonly number[],
): EarSearchFutureEcho[] {
  const target = normalizeTarget(targetInput);
  if (!Number.isFinite(matchedLandings) || !Number.isInteger(matchedLandings)) {
    throw new RangeError("Matched ear-search landings must be a finite integer.");
  }
  if (!Array.isArray(playedNotesInput) || !playedNotesInput.length) return [];
  const playedNotes = new Set(playedNotesInput.filter((note) => Number.isInteger(note) && note >= 0 && note <= 127));
  if (!playedNotes.size) return [];
  const futureStart = Math.min(target.length, Math.max(0, matchedLandings)) + 1;
  return target.slice(futureStart).flatMap((landing, offset) => {
    const matchedNoteCount = landing.notes.reduce((count: number, note: number) => count + Number(playedNotes.has(note)), 0);
    if (!matchedNoteCount) return [];
    return [{
      landingId: landing.id,
      landingIndex: futureStart + offset,
      matchedNoteCount,
      targetNoteCount: landing.notes.length,
      coverage: matchedNoteCount / landing.notes.length,
    }];
  });
}

/**
 * Reconstruct the latest physical attack burst independently from the current
 * target's key count. This keeps a later chord's orientation fraction intact
 * when a singleton current target causes evaluation to split that burst into
 * more than one rejected probe.
 */
export function earSearchFutureProbeNotes(
  tracker: EarSearchTracker,
  attackInput: readonly EarSearchAttack[],
  chordWindowMs: number,
) {
  if (!tracker || !Array.isArray(tracker.recentProbes) || !Array.isArray(tracker.acceptedProbeIds)) {
    throw new TypeError("A valid ear-search tracker is required for future orientation.");
  }
  if (!Number.isFinite(chordWindowMs) || chordWindowMs < 40 || chordWindowMs > 1000) {
    throw new RangeError("The future-orientation chord window must be from 40 through 1000 ms.");
  }
  if (!Array.isArray(attackInput) || attackInput.length > EAR_SEARCH_MAX_PROBES) {
    throw new RangeError(`Future orientation is limited to ${EAR_SEARCH_MAX_PROBES} raw attacks.`);
  }
  const latest = tracker.recentProbes.at(-1);
  if (!latest || tracker.acceptedProbeIds.includes(latest.id)) return [];
  const attacks = attackInput.map((attack, index) => {
    if (!attack || !Number.isInteger(attack.id) || attack.id < 0) throw new RangeError(`Future-orientation attack ${index + 1} needs a non-negative integer ID.`);
    assertMidi(attack.note, `Future-orientation attack ${index + 1}`);
    if (!Number.isFinite(attack.onsetMs) || attack.onsetMs < 0) throw new RangeError(`Future-orientation attack ${index + 1} needs a non-negative finite onset.`);
    return attack;
  });
  if (typeof latest.id !== "number") return latest.notes;
  const latestEvent = [...attacks].reverse().find((attack) => attack.id === latest.id);
  if (!latestEvent) return latest.notes;
  const accepted = new Set(tracker.acceptedProbeIds);
  let burstStartMs = latest.onsetMs;
  for (let index = tracker.recentProbes.length - 2; index >= 0; index -= 1) {
    const probe = tracker.recentProbes[index];
    if (accepted.has(probe.id) || latestEvent.onsetMs - probe.onsetMs > chordWindowMs) break;
    burstStartMs = Math.min(burstStartMs, probe.onsetMs);
  }
  const burstNotes = attacks
    .filter((attack) => attack.id <= latestEvent.id && attack.onsetMs >= burstStartMs && attack.onsetMs <= latestEvent.onsetMs)
    .map((attack) => attack.note);
  return burstNotes.length ? normalizeNotes(burstNotes, "Future-orientation burst") : latest.notes;
}

/**
 * Describe one probe relative to the expected landing and, when present, the
 * previous landing. Exported so single-note trainers such as the Anchor Drill
 * can reuse the same direction, register, proximity, family, and width cues.
 */
export function earSearchProbeFeedback(
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
  const sameFamily = pitchClassSignature(probe.notes) === pitchClassSignature(expected.notes);
  const expectedSpan = span(expected.notes);
  const playedSpan = span(probe.notes);
  const texture: EarSearchProbeFeedback["texture"] = probe.notes.length < expected.notes.length
    ? "fewer-keys"
    : probe.notes.length > expected.notes.length
      ? "more-keys"
      : sameFamily
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
    register: delta >= 24 ? "far-below" : delta >= 12 ? "below" : delta <= -24 ? "far-above" : delta <= -12 ? "above" : "same-band",
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
      ? earSearchProbeFeedback(latestProbe, target[Math.max(0, matchedLandings - 1)], matchedLandings > 1 ? target[matchedLandings - 2] : null, collection, true)
      : complete
        ? null
        : earSearchProbeFeedback(latestProbe, target[matchedLandings], matchedLandings ? target[matchedLandings - 1] : null, collection, false);
  return { totalLandings: target.length, matchedLandings, complete, acceptedProbeIds, latest };
}

/** Start a durable search checkpoint at a fresh raw-event boundary. */
export function createEarSearchTracker(
  targetInput: readonly EarSearchLanding[],
  processedThroughEventId = -1,
): EarSearchTracker {
  const target = normalizeTarget(targetInput);
  if (!Number.isInteger(processedThroughEventId) || processedThroughEventId < -1) {
    throw new RangeError("The ear-search event boundary must be an integer at or above -1.");
  }
  return {
    totalLandings: target.length,
    matchedLandings: 0,
    complete: false,
    acceptedProbeIds: [],
    latest: null,
    processedThroughEventId,
    probeCount: 0,
    recentProbes: [],
    pendingAttacks: [],
  };
}

function pendingProbeDueAt(target: readonly EarSearchLanding[], tracker: EarSearchTracker, chordWindowMs: number) {
  if (!tracker.pendingAttacks.length || tracker.complete || tracker.matchedLandings >= target.length) return null;
  const first = tracker.pendingAttacks[0].onsetMs;
  const last = tracker.pendingAttacks.at(-1)!.onsetMs;
  const expectedKeyCount = target[tracker.matchedLandings].notes.length;
  if (expectedKeyCount === 1) return chordWindowMs <= 40 ? last : Math.min(first + chordWindowMs, last + EAR_SEARCH_CHORD_SETTLE_MS);
  return tracker.pendingAttacks.length >= expectedKeyCount
    ? Math.min(first + chordWindowMs, last + EAR_SEARCH_CHORD_SETTLE_MS)
    : first + chordWindowMs;
}

/** The monotonic time at which a partial or just-complete chord probe becomes stable. */
export function earSearchPendingDueAt(
  targetInput: readonly EarSearchLanding[],
  tracker: EarSearchTracker,
  chordWindowMs: number,
) {
  const target = normalizeTarget(targetInput);
  if (!Number.isFinite(chordWindowMs) || chordWindowMs < 40 || chordWindowMs > 1000) {
    throw new RangeError("The chord gathering window must be from 40 through 1000 ms.");
  }
  return pendingProbeDueAt(target, tracker, chordWindowMs);
}

/**
 * Incrementally turn raw key attacks into stable probes. The expected landing's
 * key count starts a short settle period, so near-simultaneous extra tones are
 * still diagnosed while a later melodic attack cannot mutate an already
 * accepted sonority. Accepted progress lives in this checkpoint rather than
 * in the rolling event/probe display window.
 */
export function advanceEarSearchTracker(
  targetInput: readonly EarSearchLanding[],
  tracker: EarSearchTracker,
  attackInput: readonly EarSearchAttack[],
  options: { chordWindowMs: number; nowMs: number; collection?: EarSearchCollection },
): EarSearchTracker {
  const target = normalizeTarget(targetInput);
  if (!tracker || tracker.totalLandings !== target.length || tracker.matchedLandings < 0 || tracker.matchedLandings > target.length) {
    throw new RangeError("The ear-search checkpoint does not match this target.");
  }
  if (!Number.isFinite(options.chordWindowMs) || options.chordWindowMs < 40 || options.chordWindowMs > 1000) {
    throw new RangeError("The chord gathering window must be from 40 through 1000 ms.");
  }
  if (!Number.isFinite(options.nowMs) || options.nowMs < 0) throw new RangeError("Ear-search time must be a non-negative finite value.");
  if (!Array.isArray(attackInput) || attackInput.length > EAR_SEARCH_MAX_PROBES) {
    throw new RangeError(`Ear-search updates are limited to ${EAR_SEARCH_MAX_PROBES} raw attacks.`);
  }
  const fresh = attackInput
    .map((attack, index) => {
      if (!attack || !Number.isInteger(attack.id) || attack.id < 0) throw new RangeError(`Raw attack ${index + 1} needs a non-negative integer ID.`);
      assertMidi(attack.note, `Raw attack ${index + 1}`);
      if (!Number.isFinite(attack.onsetMs) || attack.onsetMs < 0) throw new RangeError(`Raw attack ${index + 1} needs a non-negative finite onset.`);
      return { ...attack };
    })
    .filter((attack) => attack.id > tracker.processedThroughEventId)
    .sort((first, second) => first.id - second.id);
  const existingDueAt = pendingProbeDueAt(target, tracker, options.chordWindowMs);
  const pendingCanClose = existingDueAt !== null && options.nowMs >= existingDueAt;
  if (!fresh.length && !pendingCanClose) return tracker;

  const next: EarSearchTracker = {
    ...tracker,
    acceptedProbeIds: [...tracker.acceptedProbeIds],
    recentProbes: [...tracker.recentProbes],
    pendingAttacks: [...tracker.pendingAttacks],
  };
  const finalizePending = () => {
    if (!next.pendingAttacks.length || next.complete) return;
    const raw = next.pendingAttacks;
    next.pendingAttacks = [];
    const probe: EarSearchProbe = {
      id: raw.at(-1)!.id,
      notes: normalizeNotes(raw.map((attack) => attack.note), `Probe ${next.probeCount + 1}`),
      onsetMs: raw[0].onsetMs,
    };
    const expected = target[next.matchedLandings];
    const previous = next.matchedLandings ? target[next.matchedLandings - 1] : null;
    const caught = sameNotes(probe.notes, expected.notes);
    next.latest = earSearchProbeFeedback(probe, expected, previous, options.collection ?? null, caught);
    next.probeCount += 1;
    next.recentProbes = [...next.recentProbes, probe].slice(-EAR_SEARCH_RECENT_PROBES);
    if (caught) {
      next.acceptedProbeIds.push(probe.id);
      next.matchedLandings += 1;
      next.complete = next.matchedLandings === target.length;
    }
  };

  for (const attack of fresh) {
    next.processedThroughEventId = Math.max(next.processedThroughEventId, attack.id);
    if (next.complete) continue;
    const dueAt = pendingProbeDueAt(target, next, options.chordWindowMs);
    if (dueAt !== null && attack.onsetMs >= dueAt) finalizePending();
    if (next.complete) continue;
    next.pendingAttacks.push(attack);
    const expectedKeyCount = target[next.matchedLandings].notes.length;
    if ((expectedKeyCount === 1 && options.chordWindowMs <= 40) || next.pendingAttacks.length > expectedKeyCount) finalizePending();
  }
  const dueAt = pendingProbeDueAt(target, next, options.chordWindowMs);
  if (dueAt !== null && options.nowMs >= dueAt) finalizePending();
  return next;
}

function earSearchHandSummary(hands: EarSearchChunk["hands"]) {
  const known = hands.filter((hand) => hand !== "unknown");
  if (known.includes("left") && known.includes("right")) return "both hands";
  if (known[0] === "left") return "left hand";
  if (known[0] === "right") return "right hand";
  return "unspecified hand";
}

function earSearchNoteSummary(labels: readonly string[]) {
  if (!labels.length) return "rest";
  if (labels.length <= 5) return labels.join(" → ");
  return `${labels.slice(0, 2).join(" → ")} → … → ${labels.slice(-2).join(" → ")}`;
}

function earSearchAttackLabel(attack: SheetMusicPracticeAttack) {
  return attack.notes
    .slice()
    .sort((first, second) => first.pitch.midi - second.pitch.midi || first.id.localeCompare(second.id))
    .map((note) => note.pitch.label)
    .join(" + ");
}

function createEarSearchFrame(
  score: SheetMusicScore,
  sourceStartMeasureIndex: number,
  sourceEndMeasureIndex: number,
  hand: PracticeHand,
  span: EarSearchTimeSpan,
  frameStartBeat: number,
  frameEndBeat: number,
  structuralIndex: number,
): EarSearchChunk {
  const sourceLoop = selectSheetMusicLoop(score, {
    startMeasureIndex: sourceStartMeasureIndex,
    endMeasureIndex: sourceEndMeasureIndex,
    hand,
    includeBoundaryTies: false,
  });
  const indexed = sourceLoop.attacks
    .map((attack, index) => ({ attack, index }))
    .filter(({ attack }) => attack.onsetBeat >= frameStartBeat - 1e-8 && attack.onsetBeat < frameEndBeat - 1e-8);
  const attacks = indexed.map(({ attack }) => attack);
  const attackIndexes = indexed.map(({ index }) => index);
  const upperNotes = attacks.map((attack) => attack.midiNotes.at(-1)!);
  const attackLabels = attacks.map(earSearchAttackLabel);
  const allNotes = attacks.flatMap((attack) => attack.midiNotes);
  const hands = [...new Set(attacks.flatMap((attack) => attack.hands))].sort();
  const semitonePattern = upperNotes.slice(1).map((note, index) => note - upperNotes[index]);
  const intervalPreview = semitonePattern.slice(0, 8).map((interval) => `${interval > 0 ? "+" : ""}${interval}`).join(" · ");
  const structuralId = `ear-search:${score.id}:${span}:${sourceStartMeasureIndex}-${sourceEndMeasureIndex}:${structuralIndex}:${hand}`;
  const startAttackId = attacks[0]?.id ?? `${structuralId}:rest-start`;
  const endAttackId = attacks.at(-1)?.id ?? `${structuralId}:rest-end`;
  const measureNumbers = score.measures
    .slice(sourceStartMeasureIndex, sourceEndMeasureIndex + 1)
    .map((measure) => measure.number);
  return {
    id: structuralId,
    ordinal: structuralIndex,
    startAttackId,
    endAttackId,
    attackIndexes,
    startAttackIndex: attackIndexes[0] ?? -1,
    endAttackIndex: attackIndexes.at(-1) ?? -1,
    attackCount: attacks.length,
    noteCount: attacks.reduce((sum, attack) => sum + attack.midiNotes.length, 0),
    measureNumbers,
    startBeat: frameStartBeat,
    endBeat: frameEndBeat,
    durationBeats: frameEndBeat - frameStartBeat,
    hands,
    handSummary: earSearchHandSummary(hands),
    attackLabels,
    noteSummary: earSearchNoteSummary(attackLabels),
    strategy: "interval-chain",
    label: attacks.length ? `Hear ${attacks.length} landing${attacks.length === 1 ? "" : "s"} in this frame` : "Hear the silent frame",
    cue: attacks.length
      ? `Keep the written clock${intervalPreview ? `; its opening moves ${intervalPreview} semitones` : ""}.`
      : "Keep the full frame of silence in the phrase clock.",
    semitonePattern,
    rhythmPatternBeats: attacks.slice(1).map((attack, index) => attack.onsetBeat - attacks[index].onsetBeat),
    chordSpacings: indexed.flatMap(({ attack, index }) => attack.midiNotes.length > 1 ? [{
      attackIndex: index,
      noteLabels: attack.notes.slice().sort((first, second) => first.pitch.midi - second.pitch.midi).map((note) => note.pitch.label),
      ...chordSpacing(attack.midiNotes),
    }] : []),
    rangeSemitones: allNotes.length ? Math.max(...allNotes) - Math.min(...allNotes) : 0,
    sourceStartMeasureIndex,
    sourceEndMeasureIndex,
    hand,
    frameStartBeat,
    frameEndBeat,
    span,
    startHalf: frameStartBeat > score.measures[sourceStartMeasureIndex].startBeat + 1e-8 ? 1 : 0,
  };
}

/** A frame's start address stays the same when its selected length changes. */
export function formatEarSearchFrameStart(chunk: EarSearchChunk) {
  return `${chunk.ordinal + 1} · bar ${chunk.measureNumbers[0] ?? chunk.sourceStartMeasureIndex + 1} · ${chunk.startHalf === 0 ? "first" : "second"} half`;
}

/**
 * Build every length on the same half-bar origin grid, independent of note
 * density. Longer windows extend the end, never move or renumber the start.
 */
export function buildEarSearchChunks(
  score: SheetMusicScore,
  options: { hand?: PracticeHand; span?: EarSearchTimeSpan } = {},
): EarSearchChunk[] {
  const hand = options.hand ?? "both";
  const span = options.span ?? "half-bar";
  if (!["half-bar", "one-bar", "two-bars"].includes(span)) throw new RangeError("Ear-search span must be half-bar, one-bar, or two-bars.");
  if (!score.measures.length) return [];
  const boundaries = score.measures.flatMap((measure) => [measure.startBeat, measure.startBeat + measure.durationBeats / 2]);
  const lastMeasure = score.measures.at(-1)!;
  boundaries.push(lastMeasure.startBeat + lastMeasure.durationBeats);
  const halfBarCount = span === "half-bar" ? 1 : span === "one-bar" ? 2 : 4;
  return boundaries.slice(0, -1).map((startBeat, originIndex) => {
    const endBoundaryIndex = Math.min(boundaries.length - 1, originIndex + halfBarCount);
    return createEarSearchFrame(
      score,
      Math.floor(originIndex / 2),
      Math.ceil(endBoundaryIndex / 2) - 1,
      hand,
      span,
      startBeat,
      boundaries[endBoundaryIndex],
      originIndex,
    );
  });
}

function projectEarSearchAttackToStaff(attack: SheetMusicPracticeAttack, hand: PracticeHand): SheetMusicPracticeAttack | null {
  if (hand === "both") return attack;
  const staff = hand === "right" ? 1 : 2;
  const notes = attack.notes.filter((note) => note.staff === staff);
  if (!notes.length) return null;
  return {
    ...attack,
    // Keep the canonical attack identity so every staff layer maps back onto
    // the same score landing and reference-playback cue.
    id: attack.id,
    durationBeats: Math.max(...notes.map((note) => note.soundingDurationBeats)),
    soundingDurationBeats: Math.max(...notes.map((note) => note.soundingDurationBeats)),
    notes,
    midiNotes: [...new Set(notes.map((note) => note.pitch.midi))].sort((first, second) => first - second),
    hands: [...new Set(notes.map((note) => note.hand))].sort(),
    arpeggiate: notes.find((note) => note.arpeggiate !== null)?.arpeggiate ?? null,
  };
}

/**
 * Recreate the exact boundary-tie-aware loop that minted a chunk's IDs, then
 * optionally project one written staff into that canonical phrase frame.
 * Projection may contain fewer playable attacks, but it never changes the
 * phrase's measure window, attack boundaries, ordinal, or score clock.
 */
export function selectEarSearchChunkLoop(
  score: SheetMusicScore,
  chunk: EarSearchChunk,
  practiceLayer: PracticeHand = chunk.hand,
) {
  if (practiceLayer !== chunk.hand && chunk.hand !== "both") {
    throw new RangeError("Only a canonical both-staff ear-search chunk can be projected to another staff layer.");
  }
  const canonical = selectSheetMusicLoop(score, {
    startMeasureIndex: chunk.sourceStartMeasureIndex,
    endMeasureIndex: chunk.sourceEndMeasureIndex,
    hand: chunk.hand,
    includeBoundaryTies: false,
  });
  const frameAttacks = canonical.attacks
    .filter((attack) => attack.onsetBeat >= chunk.frameStartBeat - 1e-8 && attack.onsetBeat < chunk.frameEndBeat - 1e-8)
    .map((attack) => ({ ...attack, relativeOnsetBeat: attack.onsetBeat - chunk.frameStartBeat }));
  if (frameAttacks.length !== chunk.attackCount) {
    throw new RangeError(`Ear-search chunk is stale or mismatched: expected ${chunk.attackCount} landings but reconstructed ${frameAttacks.length}.`);
  }
  const framed = {
    ...canonical,
    startBeat: chunk.frameStartBeat,
    endBeat: chunk.frameEndBeat,
    measureNumbers: [...chunk.measureNumbers],
    attacks: frameAttacks,
  };
  if (practiceLayer === chunk.hand) return framed;
  return {
    ...framed,
    hand: practiceLayer,
    attacks: frameAttacks.flatMap((attack) => {
      const projected = projectEarSearchAttackToStaff(attack, practiceLayer);
      return projected ? [projected] : [];
    }),
  };
}

function selectEarSearchMidiNotes(attack: Pick<SheetMusicPracticeAttack, "midiNotes" | "notes">, voice: EarSearchVoice) {
  const ordered = [...attack.midiNotes].sort((first, second) => first - second);
  if (!ordered.length) return [];
  const upperStaffNotes = attack.notes.filter((note) => note.staff === 1).map((note) => note.pitch.midi);
  const lowerStaffNotes = attack.notes.filter((note) => note.staff === 2).map((note) => note.pitch.midi);
  const staffAnchors = [
    ...(upperStaffNotes.length ? [Math.max(...upperStaffNotes)] : []),
    ...(lowerStaffNotes.length ? [Math.min(...lowerStaffNotes)] : []),
  ];
  return voice === "upper" ? [ordered.at(-1)!]
    : voice === "bass" ? [ordered[0]]
      : voice === "staff-anchors" ? [...new Set(staffAnchors.length ? staffAnchors : [ordered.at(-1)!])].sort((first, second) => first - second)
        : ordered.slice(0, 16);
}

export function earSearchLandingsForChunk(
  score: SheetMusicScore,
  chunk: EarSearchChunk,
  options: { hand?: PracticeHand; voice?: EarSearchVoice } = {},
): EarSearchLanding[] {
  const practiceLayer = options.hand ?? chunk.hand;
  const voice = options.voice ?? "upper";
  const loop = selectEarSearchChunkLoop(score, chunk, practiceLayer);
  return loop.attacks.map((attack) => {
    const notes = selectEarSearchMidiNotes(attack, voice);
    const selectedPitches = new Set(notes);
    const sourceNoteIds = notes.flatMap((midi) => {
      const source = attack.notes.find((note) => note.pitch.midi === midi);
      return source ? [source.id] : [];
    });
    const selectedStaves = new Set(attack.notes
      .filter((note) => selectedPitches.has(note.pitch.midi))
      .map((note) => note.staff));
    const staff: EarSearchStaff = selectedStaves.has(1) && selectedStaves.has(2)
      ? "both"
      : selectedStaves.has(1)
        ? "upper"
        : selectedStaves.has(2)
          ? "lower"
          : "unknown";
    return { id: attack.id, notes, sourceNoteIds, measureIndex: attack.measureIndex, measureNumber: attack.measureNumber, staff };
  });
}

function earSearchStaffForNotes(notes: ReadonlyArray<{ staff: number }>): EarSearchStaff {
  const staves = new Set(notes.map((note) => note.staff));
  return staves.has(1) && staves.has(2) ? "both" : staves.has(1) ? "upper" : staves.has(2) ? "lower" : "unknown";
}

function complementEarSearchSoundingIntervals(
  intervals: ReadonlyArray<{ startMs: number; endMs: number }>,
  totalDurationMs: number,
): EarSearchRestSpan[] {
  const merged: Array<{ startMs: number; endMs: number }> = [];
  intervals
    .filter((interval) => interval.endMs > interval.startMs)
    .map((interval) => ({
      startMs: Math.max(0, interval.startMs),
      endMs: Math.min(totalDurationMs, interval.endMs),
    }))
    .filter((interval) => interval.endMs > interval.startMs)
    .sort((first, second) => first.startMs - second.startMs || first.endMs - second.endMs)
    .forEach((interval) => {
      const previous = merged.at(-1);
      if (previous && interval.startMs <= previous.endMs + 1e-8) previous.endMs = Math.max(previous.endMs, interval.endMs);
      else merged.push({ ...interval });
    });
  const rests: EarSearchRestSpan[] = [];
  let cursor = 0;
  for (const interval of merged) {
    if (interval.startMs > cursor + 1e-8) rests.push({ startMs: cursor, endMs: interval.startMs, durationMs: interval.startMs - cursor });
    cursor = Math.max(cursor, interval.endMs);
  }
  if (cursor < totalDurationMs - 1e-8) rests.push({ startMs: cursor, endMs: totalDurationMs, durationMs: totalDurationMs - cursor });
  return rests;
}

/**
 * Build Sound Finder's literal frame-clock playback plan. Unlike the generic
 * reference preview, this keeps every written gap and release, and represents
 * a note already sounding at the boundary as a non-target carry cue.
 */
export function buildEarSearchReferencePlan(
  score: SheetMusicScore,
  chunk: EarSearchChunk,
  targetLandings: readonly EarSearchLanding[],
  options: {
    hand?: PracticeHand;
    voice?: EarSearchVoice;
    tempoBpm: number;
    arpeggioStepMs?: number;
  },
): EarSearchReferencePlan {
  if (!score || !chunk || !Array.isArray(targetLandings)) throw new TypeError("Sound Finder reference playback needs a score, frame, and target route.");
  const practiceLayer = options.hand ?? chunk.hand;
  const voice = options.voice ?? "upper";
  if (!["upper", "bass", "staff-anchors", "full"].includes(voice)) throw new RangeError("Unknown Sound Finder reference voice.");
  if (!Number.isFinite(options.tempoBpm) || options.tempoBpm <= 0 || options.tempoBpm > 400) {
    throw new RangeError("Reference tempo must be greater than zero and no more than 400 BPM.");
  }
  const arpeggioStepMs = options.arpeggioStepMs ?? 55;
  if (!Number.isFinite(arpeggioStepMs) || arpeggioStepMs < 0 || arpeggioStepMs > 500) {
    throw new RangeError("Reference arpeggio step must be from 0 through 500 ms.");
  }
  const canonicalLoop = selectEarSearchChunkLoop(score, chunk, chunk.hand);
  const selectedLoop = selectEarSearchChunkLoop(score, chunk, practiceLayer);
  const selectedAttacks = new Map(selectedLoop.attacks.map((attack) => [attack.id, attack]));
  const targetIndexes = new Map<string, number>();
  targetLandings.forEach((landing, index) => {
    if (!landing || typeof landing.id !== "string" || !landing.id.trim()) throw new TypeError(`Target landing ${index + 1} needs an ID.`);
    if (targetIndexes.has(landing.id)) throw new RangeError("Sound Finder target landing IDs must be unique.");
    targetIndexes.set(landing.id, index);
  });
  const targetById = new Map<string, EarSearchLanding>(targetLandings.map((landing) => [landing.id, landing]));
  const millisecondsPerBeat = 60_000 / options.tempoBpm;
  const totalDurationMs = (chunk.frameEndBeat - chunk.frameStartBeat) * millisecondsPerBeat;
  const soundingIntervals: Array<{ startMs: number; endMs: number }> = [];

  const referenceNotes = (
    attack: Pick<SheetMusicPracticeAttack, "notes" | "arpeggiate">,
    selectedNoteIds: ReadonlySet<string>,
    selectedMidi: ReadonlySet<number>,
    onsetMs: number,
  ): EarSearchReferencePlanNote[] => {
    const ordered = attack.notes.slice().sort((first, second) => first.pitch.midi - second.pitch.midi || first.id.localeCompare(second.id));
    if (attack.arpeggiate === "down") ordered.reverse();
    return ordered.flatMap((note, noteIndex) => {
      if (selectedNoteIds.size ? !selectedNoteIds.has(note.id) : !selectedMidi.has(note.pitch.midi)) return [];
      const onsetOffsetMs = attack.arpeggiate ? noteIndex * arpeggioStepMs : 0;
      const writtenDurationMs = note.soundingDurationBeats * millisecondsPerBeat - onsetOffsetMs;
      const clippedDurationMs = Math.min(writtenDurationMs, totalDurationMs - onsetMs - onsetOffsetMs);
      if (clippedDurationMs <= 1e-8) return [];
      const startMs = onsetMs + onsetOffsetMs;
      soundingIntervals.push({ startMs, endMs: startMs + clippedDurationMs });
      return [{ noteId: note.id, midi: note.pitch.midi, onsetOffsetMs, durationMs: clippedDurationMs }];
    });
  };

  const carryCues: EarSearchReferencePlanCue[] = score.attacks
    .filter((attack) => attack.onsetBeat < chunk.frameStartBeat - 1e-8)
    .flatMap((sourceAttack) => {
      let carriedNotes = sourceAttack.notes.filter((note) => note.onsetBeat + note.soundingDurationBeats > chunk.frameStartBeat + 1e-8);
      if (chunk.hand !== "both") carriedNotes = carriedNotes.filter((note) => note.hand === chunk.hand);
      if (practiceLayer !== chunk.hand) {
        const staff = practiceLayer === "right" ? 1 : 2;
        carriedNotes = carriedNotes.filter((note) => note.staff === staff);
      }
      if (!carriedNotes.length) return [];
      const carriedMidi = selectEarSearchMidiNotes({
        notes: carriedNotes,
        midiNotes: [...new Set(carriedNotes.map((note) => note.pitch.midi))].sort((first, second) => first - second),
      }, voice);
      const selectedMidi = new Set(carriedMidi);
      const notes = carriedNotes
        .filter((note) => selectedMidi.has(note.pitch.midi))
        .sort((first, second) => first.pitch.midi - second.pitch.midi || first.id.localeCompare(second.id))
        .flatMap((note): EarSearchReferencePlanNote[] => {
          const durationMs = Math.min(
            totalDurationMs,
            (note.onsetBeat + note.soundingDurationBeats - chunk.frameStartBeat) * millisecondsPerBeat,
          );
          if (durationMs <= 1e-8) return [];
          soundingIntervals.push({ startMs: 0, endMs: durationMs });
          return [{ noteId: note.id, midi: note.pitch.midi, onsetOffsetMs: 0, durationMs }];
        });
      if (!notes.length) return [];
      return [{
        expectedIndex: -1,
        attackId: sourceAttack.id,
        measureNumber: sourceAttack.measureNumber,
        scoreBeat: chunk.frameStartBeat,
        onsetMs: 0,
        endMs: Math.max(...notes.map((note) => note.durationMs)),
        notes,
        kind: "carry" as const,
        canonicalAttackIndex: null,
        targetLandingIndex: null,
        staff: earSearchStaffForNotes(carriedNotes.filter((note) => selectedMidi.has(note.pitch.midi))),
        carriedFromBeat: sourceAttack.onsetBeat,
      }];
    });

  const attackCues: EarSearchReferencePlanCue[] = canonicalLoop.attacks.map((attack, canonicalAttackIndex) => {
    const target = targetById.get(attack.id);
    const selectedAttack = selectedAttacks.get(attack.id);
    const selectedNoteIds = new Set<string>(target?.sourceNoteIds ?? []);
    const selectedMidi = new Set<number>(target?.notes ?? []);
    const onsetMs = (attack.onsetBeat - chunk.frameStartBeat) * millisecondsPerBeat;
    const notes = selectedAttack && target
      ? referenceNotes(selectedAttack, selectedNoteIds, selectedMidi, onsetMs)
      : [];
    return {
      expectedIndex: canonicalAttackIndex,
      attackId: attack.id,
      measureNumber: attack.measureNumber,
      scoreBeat: attack.onsetBeat,
      onsetMs,
      endMs: notes.length ? Math.max(...notes.map((note) => onsetMs + note.onsetOffsetMs + note.durationMs)) : onsetMs,
      notes,
      kind: "attack",
      canonicalAttackIndex,
      targetLandingIndex: targetIndexes.get(attack.id) ?? null,
      staff: target?.staff ?? earSearchStaffForNotes(attack.notes),
    };
  });
  const cues = [...carryCues, ...attackCues].sort((first, second) => first.onsetMs - second.onsetMs
    || (first.kind === second.kind ? 0 : first.kind === "carry" ? -1 : 1)
    || first.attackId.localeCompare(second.attackId));
  return {
    startIndex: 0,
    baseBeat: chunk.frameStartBeat,
    tempoBpm: options.tempoBpm,
    cues,
    totalDurationMs,
    truncated: false,
    restSpans: complementEarSearchSoundingIntervals(soundingIntervals, totalDurationMs),
  };
}

/**
 * Return the latest landing with a note that is physically sounding at this
 * playback instant. Written and compacted rests therefore remain visually
 * silent instead of inheriting the preceding staff cue.
 */
export function earSearchPlaybackLandingAt(
  cues: readonly EarSearchPlaybackCue[],
  elapsedMs: number,
): number | null {
  if (!Number.isFinite(elapsedMs) || elapsedMs < 0) {
    throw new RangeError("Ear-search playback time must be finite and non-negative.");
  }
  const active = cues.findLastIndex((cue) => cue.notes.some((note) => {
    const startMs = cue.onsetMs + note.onsetOffsetMs;
    const durationMs = Math.max(0, note.durationMs);
    return elapsedMs >= startMs && elapsedMs < startMs + durationMs;
  }));
  return active >= 0 ? active : null;
}

/**
 * Summarize the same ordered secure prefix as two score-staff lanes. A shared
 * landing advances both lanes once; this is not a claim about the player's
 * physical fingering or which hand produced an incoming MIDI message.
 */
export function summarizeEarSearchHandProgress(
  target: readonly EarSearchLanding[],
  matchedLandings: number,
): EarSearchHandProgress {
  if (!Number.isFinite(matchedLandings) || !Number.isInteger(matchedLandings)) {
    throw new RangeError("Matched ear-search landings must be a finite integer.");
  }
  const caughtLandings = Math.min(target.length, Math.max(0, matchedLandings));
  const summary: EarSearchHandProgress = {
    upper: { caught: 0, total: 0 },
    lower: { caught: 0, total: 0 },
    shared: { caught: 0, total: 0 },
    nextStaff: caughtLandings < target.length ? target[caughtLandings].staff ?? "unknown" : null,
  };
  target.forEach((landing, index) => {
    const caught = index < caughtLandings;
    const staff = landing.staff ?? "unknown";
    if (staff === "upper" || staff === "both") {
      summary.upper.total += 1;
      if (caught) summary.upper.caught += 1;
    }
    if (staff === "lower" || staff === "both") {
      summary.lower.total += 1;
      if (caught) summary.lower.caught += 1;
    }
    if (staff === "both") {
      summary.shared.total += 1;
      if (caught) summary.shared.caught += 1;
    }
  });
  return summary;
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

/**
 * Legacy compatibility helper for callers that still request a compact pitch
 * preview. The Sound Finder HUD uses buildEarSearchReferencePlan instead so
 * its written frame, holds, and silence remain literal.
 */
export function compactEarSearchReferencePlan(
  plan: SheetReferencePlan,
  maxGapMs = EAR_SEARCH_MAX_REFERENCE_GAP_MS,
): SheetReferencePlan {
  if (!plan || !Array.isArray(plan.cues)) throw new TypeError("A score reference plan is required.");
  if (!Number.isFinite(maxGapMs) || maxGapMs < 250 || maxGapMs > 10_000) throw new RangeError("The ear-search gap cap must be from 250 through 10000 ms.");
  if (!plan.cues.length) return { ...plan, cues: [], totalDurationMs: 0 };
  const sourceOriginMs = plan.cues[0].onsetMs;
  let removedSilenceMs = 0;
  let sourceSoundingEndMs = sourceOriginMs;
  const cues = plan.cues.map((cue, index) => {
    if (!Number.isFinite(cue.onsetMs) || !Number.isFinite(cue.endMs) || cue.endMs < cue.onsetMs) throw new RangeError("Reference cues need ordered finite timing.");
    if (index && cue.onsetMs < plan.cues[index - 1].onsetMs) throw new RangeError("Reference cues must be ordered by onset.");
    const sourceSilenceMs = Math.max(0, cue.onsetMs - sourceSoundingEndMs);
    removedSilenceMs += Math.max(0, sourceSilenceMs - maxGapMs);
    const compactOnsetMs = cue.onsetMs - sourceOriginMs - removedSilenceMs;
    const soundingSpanMs = cue.endMs - cue.onsetMs;
    sourceSoundingEndMs = Math.max(sourceSoundingEndMs, cue.endMs);
    return { ...cue, onsetMs: compactOnsetMs, endMs: compactOnsetMs + soundingSpanMs, notes: cue.notes.map((note) => ({ ...note })) };
  });
  return { ...plan, cues, totalDurationMs: Math.max(...cues.map((cue) => cue.endMs)) };
}
