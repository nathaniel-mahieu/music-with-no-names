"use client";

import { useEffect, useRef, useState, useSyncExternalStore, type CSSProperties } from "react";
import {
  ABSOLUTE_PITCH_CLASSES,
  ABSOLUTE_PITCH_OCTAVES,
  ABSOLUTE_PITCH_PRACTICE_SOUND,
  ABSOLUTE_PITCH_TRANSFER_SOUND,
  absolutePitchAnswerCorrect,
  absolutePitchMidi,
  absolutePitchPracticePassed,
  absolutePitchPracticeTargets,
  createAbsolutePitchColdCheck,
  createAbsolutePitchPractice,
  summarizeAbsolutePitchAnswers,
  type AbsolutePitchAnswer,
  type AbsolutePitchTrial,
} from "@/lib/piano-absolute-pitch-model";
import { conventionalPitchName, frequencyFromMidi } from "@/lib/piano-model";
import { getPitchClassColor, PITCH_CLASS_COLORS } from "@/lib/piano-pitch-color";
import { PIANO_SOUND_MODELS, isPianoSoundModelId, type PianoSoundModelId } from "@/lib/piano-sound-model";
import { PitchAnchorCapture } from "./PitchAnchorCapture";
import styles from "./PianoAbsolutePitchHud.module.css";

type Mode = "cold" | "practice" | "explore" | "anchor";
type Round = {
  mode: "cold" | "practice";
  trials: AbsolutePitchTrial[];
  answers: AbsolutePitchAnswer[];
  targets: number[];
};
type Result = ReturnType<typeof summarizeAbsolutePitchAnswers>;
type ColdRecord = {
  timestamp: number;
  overall: Result;
  familiar: Result;
  transfer: Result;
};

type PianoAbsolutePitchHudProps = {
  onPlayTone: (midi: number, soundModelId: PianoSoundModelId, revealPitchColor: boolean) => Promise<boolean>;
  onStopTone: () => void;
};

const MODES: { id: Mode; label: string }[] = [
  { id: "cold", label: "Cold check" },
  { id: "practice", label: "Recall practice" },
  { id: "explore", label: "Color wheel" },
  { id: "anchor", label: "Hum an anchor" },
];
const HISTORY_KEY = "piano-absolute-pitch-cold-history-v1";
const LEVELS_KEY = "piano-absolute-pitch-practice-levels-v1";
const ANCHOR_KEY = "piano-absolute-pitch-anchor-v1";
const CHANGE_EVENT = "piano-absolute-pitch-storage";

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
    // The current round is still usable if storage is blocked.
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

function parseStorage<T>(raw: string | null, fallback: T): T {
  if (raw == null) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function validResult(result: Result | null) {
  return result != null && Number.isFinite(result.correct) && Number.isFinite(result.total)
    && (result.medianCorrectMs === null || Number.isFinite(result.medianCorrectMs));
}

function scoreLine(result: Result) {
  return `${result.correct}/${result.total}`;
}

function timingLine(result: Result) {
  return result.medianCorrectMs == null ? "—" : `${(result.medianCorrectMs / 1000).toFixed(2)} s`;
}

function responseClock() {
  return performance.now();
}

function recordColdRound(answers: AbsolutePitchAnswer[]): ColdRecord {
  return {
    timestamp: Date.now(),
    overall: summarizeAbsolutePitchAnswers(answers),
    familiar: summarizeAbsolutePitchAnswers(answers.filter(({ trial }) => trial.sound === ABSOLUTE_PITCH_PRACTICE_SOUND)),
    transfer: summarizeAbsolutePitchAnswers(answers.filter(({ trial }) => trial.sound === ABSOLUTE_PITCH_TRANSFER_SOUND)),
  };
}

function PitchSwatch({ midi }: { midi: number }) {
  const { color } = getPitchClassColor(midi);
  return <i className={styles.swatch} style={{ backgroundColor: color }} aria-hidden="true" />;
}

function ColdResults({ record }: { record: ColdRecord }) {
  const rows = [
    { label: "All 24 tones", value: record.overall },
    { label: "Practice sound · octaves 3–5", value: record.familiar },
    { label: "Transfer sound · octaves 2 and 6", value: record.transfer },
  ];
  return <table className={styles.results}>
    <caption>Cold check results</caption>
    <thead><tr><th scope="col">Tones</th><th scope="col">Correct</th><th scope="col">Median correct response</th></tr></thead>
    <tbody>{rows.map(({ label, value }) => <tr key={label}>
      <th scope="row">{label}</th><td>{scoreLine(value)}</td><td>{timingLine(value)}</td>
    </tr>)}</tbody>
  </table>;
}

function ColorWheel({ selected, octave, onPlay }: { selected: number; octave: number; onPlay: (note: number) => void }) {
  const midi = absolutePitchMidi(selected, octave);
  const entry = getPitchClassColor(midi);
  return <div className={styles.wheel} role="group" aria-label="Chromatic color wheel">
    <div className={styles.ring} aria-hidden="true" />
    <div className={styles.wheelCenter} aria-live="polite">
      <PitchSwatch midi={midi} />
      <strong>{conventionalPitchName(midi)}</strong>
      <span>{frequencyFromMidi(midi).toFixed(1)} Hz</span>
      <span>{entry.name} · {entry.association}</span>
    </div>
    {PITCH_CLASS_COLORS.map(({ pitchClass, note }) => {
      const angle = pitchClass * Math.PI / 6;
      return <button key={note} className={styles.wheelNote} type="button" aria-pressed={pitchClass === selected}
        onClick={() => onPlay(pitchClass)}
        style={{
          "--note-left": `${50 + 39 * Math.sin(angle)}%`,
          "--note-top": `${50 - 39 * Math.cos(angle)}%`,
        } as CSSProperties}>
        <PitchSwatch midi={pitchClass} />{note}
      </button>;
    })}
  </div>;
}

export function PianoAbsolutePitchHud({ onPlayTone, onStopTone }: PianoAbsolutePitchHudProps) {
  const [mode, setMode] = useState<Mode>("cold");
  const [anchorChoice, setAnchorChoice] = useState<number | null>(null);
  const [sessionLevels, setSessionLevels] = useState<Record<number, number>>({});
  const [round, setRound] = useState<Round | null>(null);
  const [heardAt, setHeardAt] = useState<number | null>(null);
  const [playing, setPlaying] = useState(false);
  const [audioError, setAudioError] = useState(false);
  const [coldResult, setColdResult] = useState<ColdRecord | null>(null);
  const [exploreNote, setExploreNote] = useState(0);
  const [exploreOctave, setExploreOctave] = useState(4);
  const [exploreSound, setExploreSound] = useState<PianoSoundModelId>(ABSOLUTE_PITCH_PRACTICE_SOUND);
  const request = useRef(0);
  const playButton = useRef<HTMLButtonElement>(null);
  const firstGuess = useRef<HTMLButtonElement>(null);
  const rawHistory = useSyncExternalStore(subscribeToStorage, () => readStorage(HISTORY_KEY), () => null);
  const rawLevels = useSyncExternalStore(subscribeToStorage, () => readStorage(LEVELS_KEY), () => null);
  const rawAnchor = useSyncExternalStore(subscribeToStorage, () => readStorage(ANCHOR_KEY), () => null);
  const savedAnchor = parseStorage(rawAnchor, 5);
  const anchor = anchorChoice ?? (ABSOLUTE_PITCH_CLASSES.includes(savedAnchor) ? savedAnchor : 5);
  const storedHistory = parseStorage<(ColdRecord | null)[]>(rawHistory, []);
  const history = Array.isArray(storedHistory) ? storedHistory.filter((entry): entry is ColdRecord => entry != null
    && Number.isFinite(entry.timestamp) && validResult(entry.overall) && validResult(entry.familiar) && validResult(entry.transfer)) : [];
  const levels = parseStorage<Record<number, number> | null>(rawLevels, {});
  const level = sessionLevels[anchor] ?? levels?.[anchor];
  const practiceLevel = level != null && Number.isInteger(level) && level >= 1 && level <= 12 ? level : 1;
  const practiceTargets = absolutePitchPracticeTargets(anchor, practiceLevel);
  const practiceNames = practiceTargets.map((pitchClass) => PITCH_CLASS_COLORS[pitchClass].note).join(", ");
  const current = round?.trials[round.answers.length];
  const latestPracticeAnswer = round?.mode === "practice" ? round.answers.at(-1) : undefined;
  const practiceResult = round?.mode === "practice" && !current ? summarizeAbsolutePitchAnswers(round.answers, round.targets) : null;
  const practicePassed = round?.mode === "practice" && practiceResult != null && absolutePitchPracticePassed(round.answers, round.targets);
  const practiceAdvanced = practicePassed && round.targets.length < 12;

  useEffect(() => () => { request.current += 1; }, []);

  useEffect(() => {
    if (heardAt != null) firstGuess.current?.focus();
  }, [heardAt]);

  function clearRound() {
    request.current += 1;
    onStopTone();
    setRound(null);
    setHeardAt(null);
    setPlaying(false);
    setAudioError(false);
    setColdResult(null);
  }

  function selectMode(next: Mode) {
    if (next === mode) return;
    clearRound();
    setMode(next);
  }

  async function playTone(trial: AbsolutePitchTrial, reveal: boolean) {
    const ticket = ++request.current;
    setAudioError(false);
    let played = false;
    try {
      played = await onPlayTone(trial.midi, trial.sound, reveal);
    } catch {
      played = false;
    }
    if (request.current !== ticket) return null;
    setAudioError(!played);
    return played;
  }

  async function playTrial() {
    if (playing || heardAt != null) return;
    const nextRound = current && round ? round : mode === "practice"
      ? {
        mode: "practice" as const,
        trials: createAbsolutePitchPractice(anchor, practiceLevel),
        answers: [],
        targets: practiceTargets,
      }
      : {
        mode: "cold" as const,
        trials: createAbsolutePitchColdCheck(),
        answers: [],
        targets: ABSOLUTE_PITCH_CLASSES,
      };
    const trial = nextRound.trials[nextRound.answers.length];
    setPlaying(true);
    const played = await playTone(trial, false);
    if (played == null) return;
    setPlaying(false);
    if (played) {
      setColdResult(null);
      setRound(nextRound);
      setHeardAt(responseClock());
    }
  }

  function answer(guess: number | null) {
    if (!round || !current || heardAt == null) return;
    const answers = [...round.answers, { trial: current, guess, latencyMs: responseClock() - heardAt }];
    setHeardAt(null);
    setRound({ ...round, answers });
    playButton.current?.focus();
    if (answers.length !== round.trials.length) return;
    if (round.mode === "cold") {
      const result = recordColdRound(answers);
      setColdResult(result);
      writeStorage(HISTORY_KEY, [result, ...history].slice(0, 8));
    } else if (round.targets.length < 12 && absolutePitchPracticePassed(answers, round.targets)) {
      const nextLevel = round.targets.length + 1;
      setSessionLevels({ ...sessionLevels, [anchor]: nextLevel });
      writeStorage(LEVELS_KEY, { ...levels, ...sessionLevels, [anchor]: nextLevel });
    }
  }

  function hearExploreNote(pitchClass: number, octave: number) {
    setExploreNote(pitchClass);
    setExploreOctave(octave);
    void playTone({ midi: absolutePitchMidi(pitchClass, octave), sound: exploreSound }, true);
  }

  const choosing = heardAt != null;
  const canSelectTarget = !playing && !current;
  const targetSelect = <label className={styles.control}>Anchor note
    <select value={anchor} disabled={mode === "practice" && !canSelectTarget}
      onChange={(event) => {
        clearRound();
        const choice = Number(event.target.value);
        setAnchorChoice(choice);
        writeStorage(ANCHOR_KEY, choice);
      }}>
      {PITCH_CLASS_COLORS.map(({ pitchClass, note }) => <option key={note} value={pitchClass}>{note}</option>)}
    </select>
  </label>;
  const headerHistory = coldResult ? history.filter((entry) => entry?.timestamp !== coldResult.timestamp) : history;

  return <section className={styles.shell} aria-labelledby="piano-absolute-pitch-title">
    <header className={styles.header}>
      <span>Pitch memory</span>
      <h3 id="piano-absolute-pitch-title">Absolute pitch</h3>
      <p>Hear a tone, name its pitch class, and see what you can recall before the next warm-up.</p>
    </header>

    <div className={styles.modes} role="group" aria-label="Absolute pitch exercises">
      {MODES.map(({ id, label }) => <button key={id} type="button" aria-pressed={id === mode}
        onClick={() => selectMode(id)}>{label}</button>)}
    </div>

    {mode === "cold" || mode === "practice" ? <div className={styles.stage}>
      <section className={styles.instructions} aria-label={mode === "cold" ? "Cold check setup" : "Recall practice setup"}>
        <h4>{mode === "cold" ? "Listen before you warm up" : "Learn a note by ear"}</h4>
        {mode === "cold" ? <p>Identify 24 tones across two sounds. You hear each tone once, with no color or answer feedback. Try the check before playing anything today.</p> : <>
          <p>Practice {practiceNames} across octaves 3–5. Nearby pitches sharpen the distinction. Get at least 80% and recognize each target to add another note.</p>
          {targetSelect}
          <button type="button" disabled={!canSelectTarget} onClick={() => {
            void playTone({ midi: absolutePitchMidi(anchor, 4), sound: ABSOLUTE_PITCH_PRACTICE_SOUND }, true);
          }}>Hear {PITCH_CLASS_COLORS[anchor].note}4</button>
        </>}
        {mode === "cold" && headerHistory.length > 0 ? <div className={styles.history}>
          <h5>Recent checks on this device</h5>
          <ul>{headerHistory.slice(0, 3).map((entry) => <li key={entry.timestamp}>
            <span>{new Date(entry.timestamp).toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}</span>
            <strong>{scoreLine(entry.overall)}</strong>
          </li>)}</ul>
        </div> : null}
      </section>

      <section className={styles.round} aria-label={mode === "cold" ? "Cold check tones" : "Practice tones"}>
        <div className={styles.roundControls}>
          <button ref={playButton} type="button" className={styles.primary} aria-disabled={playing || choosing} onClick={() => void playTrial()}>
            {playing ? "Starting audio…" : choosing ? "Choose the note below" : current ? "Play next tone" : mode === "cold" ? "Start cold check" : "Start practice"}
          </button>
          {current ? <button type="button" onClick={clearRound}>End round</button> : null}
        </div>

        {round && current ? <p className={styles.counter} role="status">Tone {round.answers.length + 1} of {round.trials.length}</p> : null}
        {round && current ? <div className={styles.guesses} role="group" aria-label="Name the tone">
          {round.targets.map((pitchClass, index) => <button ref={index === 0 ? firstGuess : undefined} type="button" key={pitchClass} disabled={!choosing}
            onClick={() => answer(pitchClass)}>{PITCH_CLASS_COLORS[pitchClass].note}</button>)}
          {round.mode === "practice" && round.targets.length < 12
            ? <button type="button" disabled={!choosing} onClick={() => answer(null)}>Other</button>
            : <button type="button" disabled={!choosing} onClick={() => answer(null)}>Skip</button>}
        </div> : null}

        {latestPracticeAnswer && !choosing && !playing ? <p className={styles.reveal} role="status">
          <PitchSwatch midi={latestPracticeAnswer.trial.midi} />
          <span><strong>{absolutePitchAnswerCorrect(latestPracticeAnswer, round?.targets) ? "Correct" : "You heard"} · {conventionalPitchName(latestPracticeAnswer.trial.midi)}</strong>
            <small>{getPitchClassColor(latestPracticeAnswer.trial.midi).name} · {getPitchClassColor(latestPracticeAnswer.trial.midi).association}</small></span>
        </p> : null}
        {practiceResult ? <p className={styles.outcome} role="status">
          <strong>{scoreLine(practiceResult)} correct</strong>
          <span>{practiceAdvanced ? `Next round adds a note. Targets: ${practiceNames}.` : practicePassed ? "You met the goal for all twelve pitch classes." : "The next round keeps the same targets."}</span>
        </p> : null}
        {coldResult ? <ColdResults record={coldResult} /> : null}
      </section>
    </div> : null}

    {mode === "explore" ? <div className={styles.stage}>
      <section className={styles.instructions}>
        <h4>Same color, different octave</h4>
        <p>Each semitone advances one position around the wheel. An octave returns to the same position and color.</p>
        <div className={styles.octaves} role="group" aria-label="Octave">
          {ABSOLUTE_PITCH_OCTAVES.map((octave) => <button key={octave} type="button"
            aria-pressed={octave === exploreOctave} onClick={() => hearExploreNote(exploreNote, octave)}>Octave {octave}</button>)}
        </div>
        <label className={styles.control}>Sound
          <select value={exploreSound} onChange={(event) => {
            const sound = event.target.value;
            if (isPianoSoundModelId(sound)) setExploreSound(sound);
          }}>
            {PIANO_SOUND_MODELS.filter(({ id }) => id !== ABSOLUTE_PITCH_TRANSFER_SOUND).map(({ id, shortLabel }) => <option key={id} value={id}>{shortLabel}</option>)}
          </select>
        </label>
        <a href="?lab=technical#technical-pitch-associations">Pitch associations in the Technical Appendix</a>
      </section>
      <ColorWheel selected={exploreNote} octave={exploreOctave} onPlay={(pitchClass) => hearExploreNote(pitchClass, exploreOctave)} />
    </div> : null}

    {mode === "anchor" ? <div className={styles.stage}>
      <section className={styles.instructions}>
        <h4>Recall a note with your voice</h4>
        <p>Choose a note from a recording you know well. Imagine the recording and hum that note in a comfortable octave before playing a reference.</p>
        {targetSelect}
        <p className={styles.reveal}><PitchSwatch midi={anchor} />
          <span>{getPitchClassColor(anchor).name} · {getPitchClassColor(anchor).association}</span></p>
      </section>
      <PitchAnchorCapture key={anchor} anchor={anchor} onStartCapture={onStopTone} onPlayReference={(midi) => {
        void playTone({ midi, sound: ABSOLUTE_PITCH_PRACTICE_SOUND }, true);
      }} />
    </div> : null}
    {audioError ? <p className={styles.error} role="alert">Audio could not start. Check your browser sound settings and try again.</p> : null}
  </section>;
}
