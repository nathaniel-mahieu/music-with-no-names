import {
  scoreBeatSpanToMs,
  type SheetMusicPracticeLoop,
  type SheetMusicScore,
  type SheetReferencePlan,
  type SheetReferencePlanCue,
} from "./sheet-music-coach-model.ts";

const EPSILON = 1e-7;

export type ScoreMediaAnchor = {
  scoreBeat: number;
  mediaTimeSeconds: number;
};

export type ScoreMediaReferenceOptions = {
  startIndex?: number;
  maxLandings?: number;
  maxDurationMs?: number;
  maxNoteDurationMs?: number;
  arpeggioStepMs?: number;
};

function assertFinite(value: number, label: string) {
  if (!Number.isFinite(value)) throw new TypeError(`${label} must be finite.`);
}

/**
 * Keep one media time per score beat and require time to move forward. This
 * makes every interpolation reversible and prevents a malformed anchor from
 * sending the playhead backward through the score.
 */
export function normalizeScoreMediaAnchors(
  anchors: ReadonlyArray<ScoreMediaAnchor>,
  totalBeats: number,
): ScoreMediaAnchor[] {
  assertFinite(totalBeats, "Score duration");
  if (totalBeats < 0) throw new RangeError("Score duration cannot be negative.");
  const byBeat = new Map<number, ScoreMediaAnchor>();
  for (const anchor of anchors) {
    assertFinite(anchor.scoreBeat, "Anchor score beat");
    assertFinite(anchor.mediaTimeSeconds, "Anchor media time");
    if (anchor.scoreBeat < -EPSILON || anchor.scoreBeat > totalBeats + EPSILON) {
      throw new RangeError("Anchor score beat falls outside the score.");
    }
    if (anchor.mediaTimeSeconds < 0) throw new RangeError("Anchor media time cannot be negative.");
    byBeat.set(anchor.scoreBeat, { scoreBeat: anchor.scoreBeat, mediaTimeSeconds: anchor.mediaTimeSeconds });
  }
  const normalized = [...byBeat.values()].sort((first, second) => first.scoreBeat - second.scoreBeat);
  normalized.forEach((anchor, index) => {
    const prior = normalized[index - 1];
    if (prior && anchor.mediaTimeSeconds <= prior.mediaTimeSeconds + EPSILON) {
      throw new RangeError("Later score anchors must use later recording times.");
    }
  });
  return normalized;
}

function encodedDeltaSeconds(score: SheetMusicScore, fromBeat: number, toBeat: number) {
  if (toBeat >= fromBeat) return scoreBeatSpanToMs(score, fromBeat, toBeat) / 1_000;
  return -scoreBeatSpanToMs(score, toBeat, fromBeat) / 1_000;
}

/** Map a score beat onto the local recording. One anchor follows the encoded
 * tempo map; two or more anchors interpolate the performed timing, including
 * deliberate rubato between learner-chosen landmarks. */
export function scoreBeatToMediaSeconds(
  score: SheetMusicScore,
  anchors: ReadonlyArray<ScoreMediaAnchor>,
  scoreBeat: number,
) {
  assertFinite(scoreBeat, "Score beat");
  if (scoreBeat < -EPSILON || scoreBeat > score.totalBeats + EPSILON) {
    throw new RangeError("Score beat falls outside the score.");
  }
  const normalized = normalizeScoreMediaAnchors(anchors, score.totalBeats);
  if (!normalized.length) return null;
  const exact = normalized.find((anchor) => Math.abs(anchor.scoreBeat - scoreBeat) <= EPSILON);
  if (exact) return exact.mediaTimeSeconds;
  const rightIndex = normalized.findIndex((anchor) => anchor.scoreBeat > scoreBeat);
  if (rightIndex > 0) {
    const left = normalized[rightIndex - 1];
    const right = normalized[rightIndex];
    const portion = (scoreBeat - left.scoreBeat) / (right.scoreBeat - left.scoreBeat);
    return left.mediaTimeSeconds + portion * (right.mediaTimeSeconds - left.mediaTimeSeconds);
  }
  if (normalized.length === 1) {
    const anchor = normalized[0];
    return anchor.mediaTimeSeconds + encodedDeltaSeconds(score, anchor.scoreBeat, scoreBeat);
  }
  const first = rightIndex === 0 ? normalized[0] : normalized.at(-2)!;
  const second = rightIndex === 0 ? normalized[1] : normalized.at(-1)!;
  const secondsPerBeat = (second.mediaTimeSeconds - first.mediaTimeSeconds) / (second.scoreBeat - first.scoreBeat);
  return first.mediaTimeSeconds + (scoreBeat - first.scoreBeat) * secondsPerBeat;
}

/** Reverse the anchor map for a media-driven playhead. */
export function mediaSecondsToScoreBeat(
  score: SheetMusicScore,
  anchors: ReadonlyArray<ScoreMediaAnchor>,
  mediaTimeSeconds: number,
) {
  assertFinite(mediaTimeSeconds, "Media time");
  const normalized = normalizeScoreMediaAnchors(anchors, score.totalBeats);
  if (!normalized.length) return null;
  let low = 0;
  let high = score.totalBeats;
  for (let iteration = 0; iteration < 52; iteration += 1) {
    const middle = (low + high) / 2;
    const mapped = scoreBeatToMediaSeconds(score, normalized, middle)!;
    if (mapped < mediaTimeSeconds) low = middle;
    else high = middle;
  }
  return Math.max(0, Math.min(score.totalBeats, (low + high) / 2));
}

/**
 * Build the same cue shape used by synthesized playback, but measure every cue
 * from the recording's own time map. The media element remains the master
 * clock; this plan only translates its currentTime into score landings.
 */
export function buildScoreMediaReferencePlan(
  score: SheetMusicScore,
  loop: SheetMusicPracticeLoop,
  anchors: ReadonlyArray<ScoreMediaAnchor>,
  options: ScoreMediaReferenceOptions = {},
): SheetReferencePlan {
  const normalized = normalizeScoreMediaAnchors(anchors, score.totalBeats);
  if (!normalized.length) throw new RangeError("A local recording needs at least one score sync anchor.");
  const startIndex = options.startIndex ?? 0;
  if (!Number.isInteger(startIndex) || startIndex < 0 || startIndex >= Math.max(1, loop.attacks.length)) {
    throw new RangeError("Recording start index must identify a landing in the selected loop.");
  }
  const maxLandings = options.maxLandings ?? 96;
  const maxDurationMs = options.maxDurationMs ?? 120_000;
  const maxNoteDurationMs = options.maxNoteDurationMs ?? 30_000;
  const arpeggioStepMs = options.arpeggioStepMs ?? 55;
  if (!Number.isInteger(maxLandings) || maxLandings < 1) throw new RangeError("Recording landing limit must be positive.");
  [maxDurationMs, maxNoteDurationMs].forEach((value) => {
    assertFinite(value, "Recording duration bound");
    if (value <= 0) throw new RangeError("Recording duration bounds must be positive.");
  });

  const source = loop.attacks.slice(startIndex, startIndex + maxLandings);
  if (!source.length) {
    return { startIndex: 0, baseBeat: loop.startBeat, tempoBpm: score.tempoBpm, cues: [], totalDurationMs: 0, truncated: false };
  }
  const baseBeat = source[0].onsetBeat;
  const baseMediaSeconds = scoreBeatToMediaSeconds(score, normalized, baseBeat)!;
  const cues: SheetReferencePlanCue[] = [];
  for (let sourceIndex = 0; sourceIndex < source.length; sourceIndex += 1) {
    const attack = source[sourceIndex];
    const mediaSeconds = scoreBeatToMediaSeconds(score, normalized, attack.onsetBeat)!;
    const onsetMs = Math.max(0, (mediaSeconds - baseMediaSeconds) * 1_000);
    if (onsetMs > maxDurationMs && cues.length) break;
    const ordered = [...attack.notes].sort((first, second) => first.pitch.midi - second.pitch.midi);
    if (attack.arpeggiate === "down") ordered.reverse();
    const notes = ordered.map((note, noteIndex) => {
      const onsetOffsetMs = attack.arpeggiate ? noteIndex * arpeggioStepMs : 0;
      const releaseBeat = Math.min(score.totalBeats, note.onsetBeat + note.soundingDurationBeats);
      const releaseMediaSeconds = scoreBeatToMediaSeconds(score, normalized, releaseBeat)!;
      const mappedDurationMs = Math.max(140, (releaseMediaSeconds - mediaSeconds) * 1_000 - onsetOffsetMs);
      return {
        noteId: note.id,
        midi: note.pitch.midi,
        onsetOffsetMs,
        durationMs: Math.min(maxNoteDurationMs, mappedDurationMs),
      };
    });
    const endMs = onsetMs + Math.max(80, ...notes.map((note) => note.onsetOffsetMs + note.durationMs + 80));
    cues.push({
      expectedIndex: startIndex + sourceIndex,
      attackId: attack.id,
      measureNumber: attack.measureNumber,
      scoreBeat: attack.onsetBeat,
      onsetMs,
      endMs,
      notes,
    });
  }
  const available = Math.max(0, loop.attacks.length - startIndex);
  return {
    startIndex,
    baseBeat,
    tempoBpm: score.tempoBpm,
    cues,
    totalDurationMs: cues.length ? Math.max(...cues.map((cue) => cue.endMs)) : 0,
    truncated: cues.length < available,
  };
}
