"use client";

import { useEffect, useMemo, useRef, useState, useSyncExternalStore, type CSSProperties } from "react";
import {
  ABSOLUTE_PITCH_ANCHOR_STORAGE_KEY,
  ABSOLUTE_PITCH_COLD_HISTORY_STORAGE_KEY,
  ABSOLUTE_PITCH_PRACTICE_SOUND,
  ABSOLUTE_PITCH_TRANSFER_SOUND,
  absolutePitchMidi,
} from "@/lib/piano-absolute-pitch-model";
import {
  ANCHOR_DRILL_ANCHOR_OCTAVE,
  ANCHOR_DRILL_MAX_LEVEL,
  anchorDrillAnswerNote,
  anchorDrillClassStatuses,
  anchorDrillLevelReady,
  anchorDrillOutcome,
  anchorDrillPromotionReady,
  anchorDrillStorageKey,
  anchorDrillTargets,
  anchorDrillWeakPairs,
  createAnchorDrillState,
  markAnchorDrillPrompted,
  nextAnchorDrillPrompt,
  parseAnchorDrillState,
  recordAnchorDrillAnchorReplay,
  recordAnchorDrillAnswer,
  type AnchorDrillColdCheck,
  type AnchorDrillJudgment,
  type AnchorDrillOutcome,
  type AnchorDrillPrompt,
} from "@/lib/piano-anchor-drill-model";
import { INTERVAL_GLOW_NAMES } from "@/lib/piano-interval-glow-model";
import { conventionalPitchName } from "@/lib/piano-model";
import { PITCH_CLASS_COLORS } from "@/lib/piano-pitch-color";
import type { PianoSoundModelId } from "@/lib/piano-sound-model";
import styles from "./PianoAnchorDrillHud.module.css";

type AnchorDrillHudEvent = { id: number; note: number; onsetMs: number };

type PianoAnchorDrillHudProps = {
  events: AnchorDrillHudEvent[];
  frozen: boolean;
  onResumeCapture: () => void;
  onPlayTone: (midi: number, soundModelId: PianoSoundModelId, revealPitchColor: boolean) => Promise<boolean>;
  onStopTone: () => void;
};

type Phase = "idle" | "starting" | "answering" | "feedback";
type DrillFeedback = {
  prompt: AnchorDrillPrompt;
  outcome: AnchorDrillOutcome;
  answeredMidi: number | null;
  judged: AnchorDrillJudgment | null;
  fromRing: boolean;
};

const LEVELS_KEY = "piano-anchor-drill-levels-v1";
const CHANGE_EVENT = "piano-anchor-drill-storage";
const DEFAULT_ANCHOR = 5;
const FEEDBACK_GAP_MS = 760;
const CADENCES = [
  { ms: 0, label: "When I ask" },
  { ms: 60_000, label: "Every minute" },
  { ms: 180_000, label: "Every 3 minutes" },
  { ms: 300_000, label: "Every 5 minutes" },
] as const;
const JUDGMENTS: { id: AnchorDrillJudgment; label: string }[] = [
  { id: "below", label: "Below" },
  { id: "same", label: "Same" },
  { id: "above", label: "Above" },
];

// Clocks and chance live outside the component so render stays pure.
function wallClock() {
  return Date.now();
}

function responseClock() {
  return performance.now();
}

function drillRandom() {
  return Math.random();
}

function readStorage(key: string) {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeStorage(key: string, value: unknown) {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
    window.dispatchEvent(new Event(CHANGE_EVENT));
  } catch {
    // The current prompt is still usable if storage is blocked.
  }
}

function removeStorage(key: string) {
  try {
    window.localStorage.removeItem(key);
    window.dispatchEvent(new Event(CHANGE_EVENT));
  } catch {
    // Nothing was stored, so there is nothing to clear.
  }
}

function subscribeToStorage(callback: () => void) {
  window.addEventListener("storage", callback);
  window.addEventListener(CHANGE_EVENT, callback);
  return () => {
    window.removeEventListener("storage", callback);
    window.removeEventListener(CHANGE_EVENT, callback);
  };
}

function parseJson<T>(raw: string | null, fallback: T): T {
  if (raw == null) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function isPitchClass(value: unknown): value is number {
  return Number.isInteger(value) && Number(value) >= 0 && Number(value) < 12;
}

function newestEventId(events: readonly AnchorDrillHudEvent[]) {
  return events.reduce((newest, event) => Math.max(newest, event.id), -1);
}

function formatCountdown(ms: number) {
  const seconds = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

function formatDueIn(ms: number) {
  if (ms <= 0) return "due now";
  const minutes = Math.ceil(ms / 60_000);
  if (minutes < 60) return `due in ${minutes} min`;
  const hours = Math.round(minutes / 60);
  if (hours < 48) return `due in ${hours} h`;
  return `due in ${Math.round(hours / 24)} days`;
}

function describeOffset(offset: number) {
  if (offset === 0) return "no distance from the anchor";
  const size = Math.abs(offset);
  return `${size} semitone${size === 1 ? "" : "s"} ${offset > 0 ? "above" : "below"} the anchor by the shorter way · ${INTERVAL_GLOW_NAMES[size]}`;
}

function feedbackTitle({ outcome, answeredMidi, judged, fromRing }: DrillFeedback) {
  const { feedback, expectedDirection } = outcome;
  if (judged) {
    const where = expectedDirection === "same" ? "the anchor's own pitch family" : `${expectedDirection} the anchor`;
    return outcome.correct ? `Yes · ${where}` : `It was ${where}`;
  }
  if (answeredMidi == null) return "";
  if (fromRing && outcome.correct) return "Yes · that is its place on the ring";
  if (feedback.status === "caught") return "Found the exact key";
  if (outcome.correct) return "Right pitch family, different octave";
  const height = feedback.pitchDirection === "higher" ? "higher than" : feedback.pitchDirection === "lower" ? "lower than" : "level with";
  const distance = feedback.proximity === "near" ? "very close" : feedback.proximity === "nearby" ? "within a fifth" : "far away";
  const reach = feedback.intervalDirection === "opposite"
    ? " It lies on the other side of the anchor."
    : feedback.intervalDirection === "repeat-mismatch"
      ? expectedDirection === "same" ? " It was the anchor's own pitch family." : " You played the anchor; this tone is somewhere else."
      : feedback.intervalWidth === "wider"
        ? " From the anchor, you reached too far."
        : feedback.intervalWidth === "narrower"
          ? " From the anchor, you did not reach far enough."
          : "";
  return `The hidden tone is ${height} your key · ${distance}.${reach}`;
}

function PitchSwatch({ pitchClass }: { pitchClass: number }) {
  return <i className={styles.swatch} style={{ backgroundColor: PITCH_CLASS_COLORS[pitchClass].color }} aria-hidden="true" />;
}

export function PianoAnchorDrillHud({ events, frozen, onResumeCapture, onPlayTone, onStopTone }: PianoAnchorDrillHudProps) {
  const [anchorChoice, setAnchorChoice] = useState<number | null>(null);
  const [phase, setPhase] = useState<Phase>("idle");
  const [prompt, setPrompt] = useState<AnchorDrillPrompt | null>(null);
  const [feedback, setFeedback] = useState<DrillFeedback | null>(null);
  const [audioError, setAudioError] = useState(false);
  const [cadenceMs, setCadenceMs] = useState(0);
  const [nextPromptAtMs, setNextPromptAtMs] = useState<number | null>(null);
  const [nowMs, setNowMs] = useState(0);
  const [clearArmed, setClearArmed] = useState(false);
  const request = useRef(0);
  const heardAt = useRef(0);
  const boundaryId = useRef(-1);
  const lastTargetMidi = useRef<number | null>(null);
  const eventsRef = useRef(events);
  const issuePromptRef = useRef<() => void>(() => {});
  const submitRef = useRef<(notes: number[] | null, judged: AnchorDrillJudgment | null, fromRing?: boolean) => void>(() => {});
  const promptButton = useRef<HTMLButtonElement>(null);

  const rawAnchor = useSyncExternalStore(subscribeToStorage, () => readStorage(ABSOLUTE_PITCH_ANCHOR_STORAGE_KEY), () => null);
  const savedAnchor = parseJson<unknown>(rawAnchor, DEFAULT_ANCHOR);
  const anchor = anchorChoice ?? (isPitchClass(savedAnchor) ? savedAnchor : DEFAULT_ANCHOR);
  const storageKey = anchorDrillStorageKey(anchor);
  const rawState = useSyncExternalStore(subscribeToStorage, () => readStorage(storageKey), () => null);
  const rawLevels = useSyncExternalStore(subscribeToStorage, () => readStorage(LEVELS_KEY), () => null);
  const rawCold = useSyncExternalStore(subscribeToStorage, () => readStorage(ABSOLUTE_PITCH_COLD_HISTORY_STORAGE_KEY), () => null);

  const stored = useMemo(() => {
    const parsed = parseAnchorDrillState(rawState);
    return parsed && parsed.anchorPitchClass === anchor ? parsed : null;
  }, [rawState, anchor]);
  const state = useMemo(() => stored ?? createAnchorDrillState(anchor, 0), [stored, anchor]);
  const levels = parseJson<Record<number, unknown> | null>(rawLevels, null);
  const savedLevel = levels?.[anchor];
  const level = Number.isInteger(savedLevel) && Number(savedLevel) >= 1 && Number(savedLevel) <= ANCHOR_DRILL_MAX_LEVEL ? Number(savedLevel) : 1;
  const coldChecks = useMemo(() => {
    const history = parseJson<unknown>(rawCold, []);
    return Array.isArray(history)
      ? history.filter((entry): entry is AnchorDrillColdCheck => entry != null && typeof entry === "object" && Number.isFinite((entry as AnchorDrillColdCheck).timestamp))
      : [];
  }, [rawCold]);

  const targets = useMemo(() => anchorDrillTargets(state, level), [state, level]);
  const statuses = useMemo(() => anchorDrillClassStatuses(state, level, nowMs), [state, level, nowMs]);
  const weakPairs = useMemo(() => anchorDrillWeakPairs(state, 3), [state]);
  const levelReady = anchorDrillLevelReady(state, level);
  const promotionReady = anchorDrillPromotionReady(state, coldChecks);
  const maximumCount = Math.max(1, ...state.confusion.flat());
  const anchorEntry = PITCH_CLASS_COLORS[anchor];
  const anchorMidi = absolutePitchMidi(anchor, ANCHOR_DRILL_ANCHOR_OCTAVE);
  const answering = phase === "answering";
  const busy = phase === "starting" || answering;

  useEffect(() => { eventsRef.current = events; }, [events]);

  useEffect(() => {
    const tick = () => setNowMs(wallClock());
    const first = window.setTimeout(tick, 0);
    const timer = window.setInterval(tick, 1000);
    return () => {
      window.clearTimeout(first);
      window.clearInterval(timer);
    };
  }, []);

  useEffect(() => () => {
    request.current += 1;
    onStopTone();
  }, [onStopTone]);

  async function issuePrompt(replay: AnchorDrillPrompt | null = null) {
    if (!replay && busy) return;
    const ticket = ++request.current;
    const base = stored ?? createAnchorDrillState(anchor, wallClock());
    const next = replay ?? nextAnchorDrillPrompt(base, level, wallClock(), drillRandom, lastTargetMidi.current);
    setAudioError(false);
    setClearArmed(false);
    if (!replay) {
      setFeedback(null);
      setPhase("starting");
    }
    let played = false;
    try {
      played = await onPlayTone(next.targetMidi, next.sound, false);
    } catch {
      played = false;
    }
    if (request.current !== ticket) return;
    if (!played) {
      setAudioError(true);
      if (!replay) setPhase("idle");
      return;
    }
    if (replay) return;
    writeStorage(storageKey, markAnchorDrillPrompted(base));
    lastTargetMidi.current = next.targetMidi;
    boundaryId.current = newestEventId(eventsRef.current);
    heardAt.current = responseClock();
    setPrompt(next);
    setNextPromptAtMs(null);
    setPhase("answering");
  }

  async function replayFeedback(heard: AnchorDrillPrompt, answeredMidi: number | null) {
    // The learner's own choice sounds first, so the hidden tone lands last as the correction to keep.
    const ticket = ++request.current;
    const sequence = answeredMidi == null || answeredMidi === heard.targetMidi
      ? [heard.targetMidi]
      : [answeredMidi, heard.targetMidi];
    for (const [index, midi] of sequence.entries()) {
      if (index > 0) {
        await new Promise((resolve) => window.setTimeout(resolve, FEEDBACK_GAP_MS));
        if (request.current !== ticket) return;
      }
      let played = false;
      try {
        played = await onPlayTone(midi, heard.sound, true);
      } catch {
        played = false;
      }
      if (request.current !== ticket) return;
      if (!played) {
        setAudioError(true);
        return;
      }
    }
  }

  function submit(notes: number[] | null, judged: AnchorDrillJudgment | null, fromRing = false) {
    if (!answering || !prompt) return;
    const answer = { prompt, probeNotes: notes, judgedDirection: judged, latencyMs: responseClock() - heardAt.current };
    const now = wallClock();
    const base = stored ?? markAnchorDrillPrompted(createAnchorDrillState(anchor, now));
    const outcome = anchorDrillOutcome(answer);
    const answeredMidi = notes?.[0] ?? null;
    writeStorage(storageKey, recordAnchorDrillAnswer(base, answer, now));
    setFeedback({ prompt, outcome, answeredMidi, judged, fromRing });
    setPhase("feedback");
    if (cadenceMs) setNextPromptAtMs(now + cadenceMs);
    promptButton.current?.focus();
    void replayFeedback(prompt, answeredMidi);
  }

  useEffect(() => {
    issuePromptRef.current = () => { void issuePrompt(); };
    submitRef.current = submit;
  });

  // The first fresh key attack after the hidden tone is the answer.
  useEffect(() => {
    if (phase !== "answering") return;
    const attack = events.reduce<AnchorDrillHudEvent | null>((earliest, event) => (
      event.id > boundaryId.current && (!earliest || event.id < earliest.id) ? event : earliest
    ), null);
    if (!attack) return;
    const task = window.setTimeout(() => submitRef.current([attack.note], null), 0);
    return () => window.clearTimeout(task);
  }, [events, phase]);

  // A timed prompt fires only after the learner chose a cadence, and never over an open prompt.
  useEffect(() => {
    if (nextPromptAtMs == null || (phase !== "idle" && phase !== "feedback")) return;
    const task = window.setTimeout(() => issuePromptRef.current(), Math.max(0, nextPromptAtMs - wallClock()));
    return () => window.clearTimeout(task);
  }, [nextPromptAtMs, phase]);

  function resetRound() {
    request.current += 1;
    onStopTone();
    setPhase("idle");
    setPrompt(null);
    setFeedback(null);
    setAudioError(false);
    setClearArmed(false);
    lastTargetMidi.current = null;
  }

  function skipPrompt() {
    request.current += 1;
    onStopTone();
    setPhase("idle");
    setPrompt(null);
    if (cadenceMs) setNextPromptAtMs(wallClock() + cadenceMs);
    promptButton.current?.focus();
  }

  async function hearAnchor() {
    if (busy) return;
    const ticket = ++request.current;
    setAudioError(false);
    let played = false;
    try {
      played = await onPlayTone(anchorMidi, ABSOLUTE_PITCH_PRACTICE_SOUND, true);
    } catch {
      played = false;
    }
    if (request.current !== ticket) return;
    setAudioError(!played);
    if (played && stored && stored.answerCount > 0) writeStorage(storageKey, recordAnchorDrillAnchorReplay(stored, wallClock()));
  }

  function chooseCadence(ms: number) {
    setCadenceMs(ms);
    setNextPromptAtMs(ms && !busy ? wallClock() + ms : null);
  }

  function chooseLevel(next: number) {
    if (busy || next < 1 || next > ANCHOR_DRILL_MAX_LEVEL) return;
    writeStorage(LEVELS_KEY, { ...(levels ?? {}), [anchor]: next });
  }

  function clearHistory() {
    if (!clearArmed) {
      setClearArmed(true);
      return;
    }
    resetRound();
    setNextPromptAtMs(cadenceMs ? wallClock() + cadenceMs : null);
    removeStorage(storageKey);
  }

  const countdown = nextPromptAtMs != null && nowMs > 0 && !busy ? formatCountdown(nextPromptAtMs - nowMs) : null;
  const targetNames = targets.map((pitchClass) => PITCH_CLASS_COLORS[pitchClass].note).join(", ");
  const feedbackTarget = feedback ? feedback.outcome.heardPitchClass : null;
  const feedbackAnswered = feedback ? feedback.outcome.answeredPitchClass : null;
  const weakPairCopy = weakPairs.length
    ? weakPairs.map(({ heard, answered, count }) => `${PITCH_CLASS_COLORS[heard].note} answered as ${PITCH_CLASS_COLORS[answered].note} ×${count}`).join(" · ")
    : state.answerCount ? "No key or ring answer has landed on a different pitch family yet." : "Answers will appear here as you go.";

  return <section className={styles.shell} aria-labelledby="piano-anchor-drill-title">
    <header className={styles.header}>
      <span>Spaced pitch memory</span>
      <h3 id="piano-anchor-drill-title">Anchor Drill</h3>
      <p>Hold one pitch in memory. Hidden tones arrive over time; answer on your keyboard, on the ring, or with below, same, or above. Your instrument makes the sound of your answer. This page sounds only the hidden tone and the feedback.</p>
    </header>

    <div className={styles.stage}>
      <section className={styles.setup} aria-label="Anchor and schedule">
        <h4>Your anchor</h4>
        <p className={styles.anchorLine}><PitchSwatch pitchClass={anchor} />
          <span><strong>{anchorEntry.note}</strong> · {anchorEntry.name} · {anchorEntry.association}</span></p>
        <label className={styles.control}>Anchor note
          <select value={anchor} disabled={busy} onChange={(event) => {
            const choice = Number(event.target.value);
            resetRound();
            setNextPromptAtMs(cadenceMs ? wallClock() + cadenceMs : null);
            setAnchorChoice(choice);
            writeStorage(ABSOLUTE_PITCH_ANCHOR_STORAGE_KEY, choice);
          }}>
            {PITCH_CLASS_COLORS.map(({ pitchClass, note }) => <option key={note} value={pitchClass}>{note}</option>)}
          </select>
        </label>
        <button type="button" disabled={busy} onClick={() => void hearAnchor()}>Hear {conventionalPitchName(anchorMidi)}</button>
        <p>Hear it once, then carry it. Hearing it again later brings the anchor back sooner.</p>

        <h4>Pitches in play</h4>
        <div className={styles.stepper} role="group" aria-label="Pitches in play">
          <button type="button" disabled={busy || level <= 1} aria-label="Remove a pitch" onClick={() => chooseLevel(level - 1)}>−</button>
          <output aria-live="polite">{level}</output>
          <button type="button" className={levelReady ? styles.primary : undefined} disabled={busy || level >= ANCHOR_DRILL_MAX_LEVEL} aria-label="Add a pitch" onClick={() => chooseLevel(level + 1)}>+</button>
        </div>
        <p>{targetNames}. Nearby pitches are mixed in as contrast.{levelReady ? " These are well recognised so far; the next pitch added is the one most often confused with them." : ""}</p>

        <h4>Prompts</h4>
        <label className={styles.control}>Hidden tone
          <select value={cadenceMs} onChange={(event) => chooseCadence(Number(event.target.value))}>
            {CADENCES.map(({ ms, label }) => <option key={ms} value={ms}>{label}</option>)}
          </select>
        </label>
        <p role="status">{cadenceMs
          ? countdown ? `Next hidden tone in ${countdown}. Choose “When I ask” to stop.` : "The timer waits while a prompt is open."
          : "No tone plays until you ask."}</p>
        {frozen ? <p className={styles.notice}>Capture is paused, so key answers are not received. <button type="button" onClick={onResumeCapture}>Resume capture</button></p> : null}
      </section>

      <section className={styles.round} aria-label="Hidden tone">
        <div className={styles.roundControls}>
          <button ref={promptButton} type="button" className={styles.primary} aria-disabled={busy} onClick={() => void issuePrompt()}>
            {phase === "starting" ? "Starting audio…" : answering ? "Answer below" : feedback ? "Next hidden tone" : "Hidden tone now"}
          </button>
          {answering && prompt ? <>
            <button type="button" onClick={() => void issuePrompt(prompt)}>Hear it again</button>
            <button type="button" onClick={skipPrompt}>Skip</button>
          </> : null}
        </div>

        <div className={styles.judgments} role="group" aria-label="Relative to your anchor, by the shorter way around the octave">
          {JUDGMENTS.map(({ id, label }) => <button key={id} type="button" disabled={!answering} onClick={() => submit(null, id)}>{label}</button>)}
        </div>

        <div className={styles.wheel} role="group" aria-label="Pitch ring. While a hidden tone is open, choose its place.">
          <div className={styles.ring} aria-hidden="true" />
          <div className={styles.wheelCenter} aria-hidden="true">
            <PitchSwatch pitchClass={anchor} />
            <strong>{anchorEntry.note}</strong>
            <span>anchor</span>
          </div>
          {statuses.map(({ pitchClass, isAnchor, inTargets, inPool, due, dueInMs, answered, correct }) => {
            const entry = PITCH_CLASS_COLORS[pitchClass];
            const angle = pitchClass * Math.PI / 6;
            const role = isAnchor ? "anchor" : inTargets ? "in play" : inPool ? "nearby contrast" : "not in play";
            const mark = feedbackTarget === pitchClass ? "✓" : feedbackAnswered === pitchClass ? "✕" : "";
            const result = feedbackTarget === pitchClass ? ", the hidden tone" : feedbackAnswered === pitchClass ? ", your answer" : "";
            return <button key={entry.note} type="button" className={styles.wheelNote} disabled={!answering}
              data-role={inPool ? "pool" : "rest"}
              data-result={feedbackTarget === pitchClass ? "target" : feedbackAnswered === pitchClass ? "answered" : undefined}
              aria-label={`${entry.note}, ${entry.name}, ${role}${inPool && nowMs > 0 ? `, ${due ? "due now" : formatDueIn(dueInMs)}` : ""}${answered ? `, recognised ${correct} of ${answered}` : ""}${result}`}
              onClick={() => prompt && submit([anchorDrillAnswerNote(prompt.targetMidi, pitchClass)], null, true)}
              style={{
                "--note-left": `${50 + 40 * Math.sin(angle)}%`,
                "--note-top": `${50 - 40 * Math.cos(angle)}%`,
              } as CSSProperties}>
              <PitchSwatch pitchClass={pitchClass} />{entry.note}{mark ? <b aria-hidden="true">{mark}</b> : null}
            </button>;
          })}
        </div>
        <p className={styles.legend}>✓ hidden tone · ✕ your answer</p>

        {answering ? <p role="status">Press the key you think it is, choose its place on the ring, or choose below, same, or above.</p> : null}
        {feedback && !answering ? <p className={styles.reveal} role="status">
          <PitchSwatch pitchClass={feedback.outcome.heardPitchClass} />
          <span><strong>{feedbackTitle(feedback)}</strong>{" "}
            <small>{conventionalPitchName(feedback.prompt.targetMidi)} · {PITCH_CLASS_COLORS[feedback.outcome.heardPitchClass].name} · {describeOffset(feedback.outcome.targetOffset)}{feedback.prompt.sound === ABSOLUTE_PITCH_TRANSFER_SOUND ? " · transfer sound, outer octave" : ""}.</small>{" "}
            <small>{feedback.answeredMidi != null && feedback.answeredMidi !== feedback.prompt.targetMidi ? "You hear your answer, then the hidden tone." : "You hear the hidden tone once more."}</small></span>
        </p> : null}
        {audioError ? <p className={styles.error} role="alert">Audio could not start. Choose “Hidden tone now” to try again; some browsers need a click before each sound.</p> : null}
      </section>
    </div>

    <section className={styles.record} aria-labelledby="piano-anchor-drill-record-title">
      <h4 id="piano-anchor-drill-record-title">What has been heard as what</h4>
      <p>{state.answerCount} answer{state.answerCount === 1 ? "" : "s"} for this anchor on this device. {weakPairCopy}</p>
      {promotionReady
        ? <p className={styles.notice}>This anchor has met the practice gate, including a cold check taken since you began. You could start a second anchor; this one keeps its own history.</p>
        : null}
      <div className={styles.gridViewport} role="region" tabIndex={0} aria-label="Scrollable table of hidden tones against answers">
        <table className={styles.grid}>
          <caption>Rows are the hidden tone. Columns are your key or ring answer. Below, same, and above answers are counted in the last column.</caption>
          <thead><tr>
            <td />
            {PITCH_CLASS_COLORS.map(({ note, pitchClass }) => <th key={note} scope="col"><PitchSwatch pitchClass={pitchClass} />{note}</th>)}
            <th scope="col">Direction</th>
          </tr></thead>
          <tbody>{state.confusion.map((row, heard) => <tr key={heard} data-anchor={heard === anchor || undefined}>
            <th scope="row"><PitchSwatch pitchClass={heard} />{PITCH_CLASS_COLORS[heard].note}</th>
            {row.map((count, answered) => <td key={answered} data-diagonal={heard === answered || undefined}
              style={count ? { "--cell-strength": count / maximumCount } as CSSProperties : undefined}>{count || "·"}</td>)}
            <td>{state.buttonAnswered[heard] ? `${state.buttonCorrect[heard]}/${state.buttonAnswered[heard]}` : "·"}</td>
          </tr>)}</tbody>
        </table>
      </div>
      <p>These counts choose what is asked next. They cover one timbre set and five octaves, and are not a measure of absolute pitch or ability.</p>
      <button type="button" disabled={!stored} onClick={clearHistory} onBlur={() => setClearArmed(false)}>
        {clearArmed ? "Select again to clear" : `Clear this device’s ${anchorEntry.note} history`}
      </button>
    </section>
  </section>;
}
