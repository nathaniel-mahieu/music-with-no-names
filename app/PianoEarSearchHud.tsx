"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type CSSProperties,
} from "react";
import styles from "./PianoEarSearchHud.module.css";
import {
  ORBIT_STUDY_MUSICXML,
  importMusicXmlFile,
  normalizeImportedMusicXmlScore,
  parseMusicXml,
  type ImportedMusicXmlScore,
} from "@/lib/musicxml-import";
import {
  analyzeLocalPitchCollections,
  buildScoreReferencePlan,
  fingerDistance,
  selectSheetMusicLoop,
  type PracticeHand,
  type SheetMusicPracticeLoop,
  type SheetMusicScore,
} from "@/lib/sheet-music-coach-model";
import {
  advanceEarSearchTracker,
  buildEarSearchChunks,
  compactEarSearchReferencePlan,
  createEarSearchTracker,
  earSearchPendingDueAt,
  earSearchCollectionFromAnalysis,
  earSearchLandingsForChunk,
  type EarSearchProbeFeedback,
  type EarSearchTracker,
  type EarSearchVoice,
} from "@/lib/piano-ear-search-model";
import { configureSafetyCompressor, loudnessControlGain } from "@/lib/audio-level";
import { frequencyFromMidi } from "@/lib/piano-model";
import { parseStoredScoreFlowSource, SCORE_FLOW_HISTORY_STORAGE_KEY, SCORE_FLOW_STORAGE_KEY } from "@/lib/score-flow-storage";

type EarSearchHudEvent = {
  id: number;
  note: number;
  velocity: number;
  onsetMs: number;
  keyReleaseMs?: number | null;
  releaseMs: number | null;
};

type PianoEarSearchHudProps = {
  events: EarSearchHudEvent[];
  activeNotes: number[];
  chordWindowMs: number;
  showConventions: boolean;
  frozen: boolean;
  midiConnected: boolean;
  midiStatus: string;
  onConnectMidi: () => void;
  onResumeCapture: () => void;
};

type SearchPhase = "ready" | "playing" | "waiting-release" | "searching" | "complete" | "unavailable";
type HintMode = "blind" | "compass";
type LandingLimit = 4 | 6 | 8;
type PrimaryCue = "texture" | "interval" | "place" | "direction" | null;

const NOTE_NAMES = ["C", "C♯", "D", "E♭", "E", "F", "F♯", "G", "A♭", "A", "B♭", "B"] as const;

function cx(...values: Array<string | false | null | undefined>) {
  return values.filter(Boolean).join(" ");
}

function newestEventId(events: EarSearchHudEvent[]) {
  return events.reduce((latest, event) => Math.max(latest, event.id), -1);
}

function midiLabel(note: number) {
  return `${NOTE_NAMES[((note % 12) + 12) % 12]}${Math.floor(note / 12) - 1}`;
}

function signed(value: number) {
  return value > 0 ? `+${value}` : String(value);
}

function referenceGain(percent: number) {
  return percent <= 0 ? 0.0001 : loudnessControlGain(percent);
}

function closeAudio(context: AudioContext | null, master: GainNode | null) {
  if (!context || context.state === "closed") return;
  try {
    const now = context.currentTime;
    if (master) {
      master.gain.cancelScheduledValues(now);
      master.gain.setValueAtTime(Math.max(0.0001, master.gain.value), now);
      master.gain.exponentialRampToValueAtTime(0.0001, now + 0.025);
    }
    window.setTimeout(() => { if (context.state !== "closed") void context.close(); }, 40);
  } catch { void context.close(); }
}

function placeCopy(feedback: EarSearchProbeFeedback | null) {
  if (!feedback) return { title: "No probe yet", body: "Touch a key after the reference releases." };
  if (feedback.status === "caught") return { title: "Place caught", body: "That landing is now held in memory." };
  if (feedback.pitchFamily === "same-family") return {
    title: "Right pitch family",
    body: feedback.pitchDirection === "higher" ? "Shift the same color upward into its heard register."
      : feedback.pitchDirection === "lower" ? "Shift the same color downward into its heard register."
        : "Keep the register and reshape this voicing.",
  };
  const register = feedback.register === "far-below" ? "Far below the heard register"
    : feedback.register === "below" ? "Below the heard register"
      : feedback.register === "far-above" ? "Far above the heard register"
        : feedback.register === "above" ? "Above the heard register"
          : "Inside the heard register band";
  return { title: register, body: feedback.proximity === "near" ? "Very near in pitch." : feedback.proximity === "nearby" ? "Nearby; keep narrowing the search." : "Use a broader hand move." };
}

function directionCopy(feedback: EarSearchProbeFeedback | null) {
  if (!feedback) return { title: "Direction waits", body: "The first probe will light a coarse direction." };
  if (feedback.pitchDirection === "caught") return { title: "Caught", body: "Stay with the sound before moving on." };
  if (feedback.pitchDirection === "same-height") return { title: "Keep this height", body: "The register is close; change the pitch or texture." };
  return feedback.pitchDirection === "higher"
    ? { title: "Move higher", body: "Search to the right on a conventional piano." }
    : { title: "Move lower", body: "Search to the left on a conventional piano." };
}

function intervalCopy(feedback: EarSearchProbeFeedback | null) {
  if (!feedback || feedback.intervalDirection === "unavailable") return { title: "Find the anchor first", body: "Interval feedback begins after one landing is caught." };
  if (feedback.intervalDirection === "opposite") return { title: "Reverse the motion", body: "The new probe moved against the heard contour." };
  if (feedback.intervalDirection === "repeat-mismatch") return { title: "Repeat versus move differs", body: "Listen for whether the sound stayed or traveled." };
  if (feedback.intervalWidth === "narrower") return { title: "Right direction · wider", body: "Keep the direction and increase the reach." };
  if (feedback.intervalWidth === "wider") return { title: "Right direction · narrower", body: "Keep the direction and reduce the reach." };
  if (feedback.intervalWidth === "same-class-other-octave") return { title: "Same interval color · octave span differs", body: "Keep the relationship family and change its register reach." };
  return { title: "Relationship caught", body: "Direction and interval width agree." };
}

function collectionCopy(feedback: EarSearchProbeFeedback | null) {
  if (!feedback || feedback.collection === "unclear") return { title: "Collection unclear", body: "This short window does not support a reliable in/out cue." };
  if (feedback.collection === "caught") return { title: "Target caught", body: "Exact placement takes precedence over collection shorthand." };
  return feedback.collection === "inside"
    ? { title: "Inside the nearby collection", body: "This is context, not proof that the key is correct." }
    : { title: "Outside the nearby collection", body: "A chromatic target can still be correct; follow pitch direction first." };
}

function textureCopy(feedback: EarSearchProbeFeedback | null) {
  if (!feedback) return { title: "Chord shape waits", body: "Play the gathered keys after the hidden texture ends." };
  if (feedback.texture === "caught") return { title: "Chord shape caught", body: "Key count, members, and voicing all agree." };
  if (feedback.texture === "fewer-keys") return { title: "Add a chord member", body: "This probe has fewer gathered keys than the hidden landing." };
  if (feedback.texture === "more-keys") return { title: "Use fewer chord members", body: "This probe has more gathered keys than the hidden landing." };
  if (feedback.texture === "same-family") return { title: "Right chord family", body: "Keep its pitch colors and reshape the octave placement." };
  if (feedback.texture === "more-compact") return { title: "Open the chord wider", body: "The outer-key span is tighter than the hidden landing." };
  if (feedback.texture === "more-open") return { title: "Draw the chord inward", body: "The outer-key span is wider than the hidden landing." };
  return { title: "Change the chord members", body: "The gathered texture has the right key count but a different pitch-class shape." };
}

function placeGlyph(feedback: EarSearchProbeFeedback | null) {
  if (!feedback) return "○";
  if (feedback.status === "caught") return "✓";
  if (feedback.pitchFamily === "same-family") return "⊙";
  return feedback.proximity === "near" ? "◉" : feedback.proximity === "nearby" ? "◎" : "○";
}

function directionGlyph(feedback: EarSearchProbeFeedback | null) {
  if (!feedback) return "↕";
  return feedback.pitchDirection === "higher" ? "↑" : feedback.pitchDirection === "lower" ? "↓" : feedback.pitchDirection === "caught" ? "✓" : "↕";
}

function intervalGlyph(feedback: EarSearchProbeFeedback | null) {
  if (!feedback || feedback.intervalDirection === "unavailable") return "⌁";
  if (feedback.intervalDirection === "opposite" || feedback.intervalDirection === "repeat-mismatch") return "↶";
  return feedback.intervalWidth === "narrower" ? "⟷" : feedback.intervalWidth === "wider" ? "↔" : feedback.intervalWidth === "matched" ? "✓" : "⇆";
}

function collectionGlyph(feedback: EarSearchProbeFeedback | null) {
  if (!feedback || feedback.collection === "unclear") return "?";
  return feedback.collection === "outside" ? "OUT" : feedback.collection === "inside" ? "IN" : "✓";
}

function textureGlyph(feedback: EarSearchProbeFeedback | null) {
  if (!feedback) return "⌁";
  return feedback.texture === "fewer-keys" ? "+" : feedback.texture === "more-keys" ? "−" : feedback.texture === "caught" ? "✓" : "⌁";
}

function feedbackAnnouncement(
  feedback: EarSearchProbeFeedback | null,
  matched: number,
  total: number,
  complete: boolean,
  phase: SearchPhase,
  hintMode: HintMode,
  probeOrdinal: number,
  primaryCue: PrimaryCue,
) {
  if (phase === "playing") return "Hidden reference is playing. Listen; keyboard probes do not count yet.";
  if (phase === "waiting-release") return "Reference finished. Release every held or sustained key before searching.";
  if (phase === "ready") return "Ready to hear the hidden phrase. Search begins only after playback finishes.";
  if (phase === "unavailable") return "Reference audio needs attention before this search can begin.";
  if (complete) return `Phrase found. ${total} of ${total} hidden landings caught.`;
  if (!feedback) return `Ready for landing ${matched + 1} of ${total}. Timing is not graded.`;
  if (feedback.status === "caught") return `Landing caught. ${matched} of ${total} secure. Timing was not graded.`;
  if (hintMode === "blind") return `Probe ${probeOrdinal} received. ${matched} of ${total} landings secure. Directional hints are held back. Timing is not graded.`;
  if (feedback.texture === "fewer-keys") return `Probe ${probeOrdinal} received. Add a chord member before using pitch-direction or interval hints. ${matched} of ${total} secure. Timing is not graded.`;
  if (feedback.texture === "more-keys") return `Probe ${probeOrdinal} received. Use fewer chord members before using pitch-direction or interval hints. ${matched} of ${total} secure. Timing is not graded.`;
  const direction = feedback.pitchDirection === "higher" ? "Move higher."
    : feedback.pitchDirection === "lower" ? "Move lower."
      : "Keep this height and change the pitch or texture.";
  const relation = feedback.intervalDirection === "opposite" ? "Interval direction is opposite."
    : feedback.intervalWidth === "narrower" ? "Interval is too narrow."
      : feedback.intervalWidth === "wider" ? "Interval is too wide."
      : feedback.intervalWidth === "same-class-other-octave" ? "Interval family agrees but octave span differs."
          : feedback.intervalWidth === "matched" ? "Interval relationship agrees." : "";
  const nextMove = primaryCue === "interval" ? `${relation} ${direction}`
    : primaryCue === "place" ? `Right pitch family. ${direction}`
      : `${direction} ${relation}`;
  return `Probe ${probeOrdinal} received. Next move: ${nextMove} ${matched} of ${total} secure. Timing is not graded.`.replace(/\s+/g, " ").trim();
}

function RevealedMap({ notes, showConventions }: { notes: Array<{ notes: number[] }>; showConventions: boolean }) {
  const all = notes.flatMap((landing) => landing.notes);
  const minimum = Math.min(...all);
  const maximum = Math.max(...all);
  const span = Math.max(1, maximum - minimum);
  return <div className={styles.revealMap}>
    <div className={styles.revealPlot} role="img" aria-label={`Revealed pitch-height map with ${notes.length} landings from MIDI key ${minimum} through ${maximum}.`}>
      {Array.from({ length: 13 }, (_, index) => <i key={index} style={{ bottom: `${index / 12 * 100}%` }} />)}
      {notes.map((landing, landingIndex) => landing.notes.map((note) => <b key={`${landingIndex}-${note}`} style={{ left: `${(landingIndex + .5) / notes.length * 100}%`, bottom: `${(note - minimum) / span * 84 + 8}%` } as CSSProperties}><span>{showConventions ? midiLabel(note) : note}</span></b>))}
    </div>
    <div className={styles.revealSteps}>
      {notes.map((landing, index) => {
        const prior = notes[index - 1];
        const move = prior ? landing.notes.at(-1)! - prior.notes.at(-1)! : null;
        const internal = landing.notes.slice(1).map((note, noteIndex) => note - landing.notes[noteIndex]);
        const travel = prior ? fingerDistance(prior.notes.at(-1)!, landing.notes.at(-1)!) : null;
        return <article key={index}>
          <span>landing {index + 1}</span>
          <strong>{showConventions ? landing.notes.map(midiLabel).join(" + ") : landing.notes.map((note) => `key ${note}`).join(" + ")}</strong>
          <small>{move == null ? "anchor" : `${signed(move)} semitones · ${travel?.reach.replaceAll("-", " ")}`}{internal.length ? ` · inside ${internal.join(" / ")} st` : ""}</small>
        </article>;
      })}
    </div>
    <p>This exact map appears only because you chose Reveal. Height is a chromatic semitone ladder, not engraved staff notation.</p>
  </div>;
}

export function PianoEarSearchHud({ events, activeNotes, chordWindowMs, showConventions, frozen, midiConnected, midiStatus, onConnectMidi, onResumeCapture }: PianoEarSearchHudProps) {
  const [imported, setImported] = useState<ImportedMusicXmlScore | null>(null);
  const [score, setScore] = useState<SheetMusicScore | null>(null);
  const [fileState, setFileState] = useState<"empty" | "loading" | "ready" | "error">("empty");
  const [fileNotice, setFileNotice] = useState("Use the score already loaded in Score Flow, choose MusicXML, or try the original demo.");
  const [maxLandings, setMaxLandings] = useState<LandingLimit>(4);
  const [practiceHand, setPracticeHand] = useState<PracticeHand>("both");
  const [voice, setVoice] = useState<EarSearchVoice>("upper");
  const [chunkIndex, setChunkIndex] = useState(0);
  const [hintMode, setHintMode] = useState<HintMode>("compass");
  const [clusterWindow, setClusterWindow] = useState<140 | 240 | 480>(chordWindowMs <= 80 ? 140 : chordWindowMs >= 320 ? 480 : 240);
  const [tempoPercent, setTempoPercent] = useState(72);
  const [referenceVolume, setReferenceVolume] = useState(88);
  const [phase, setPhase] = useState<SearchPhase>("ready");
  const [hasHeard, setHasHeard] = useState(false);
  const [revealed, setRevealed] = useState(false);
  const [tracker, setTracker] = useState<EarSearchTracker | null>(null);
  const [clusterClockMs, setClusterClockMs] = useState(0);
  const [playbackProgress, setPlaybackProgress] = useState(0);
  const [playbackLanding, setPlaybackLanding] = useState<number | null>(null);
  const [audioNotice, setAudioNotice] = useState("Reference audio plays only after an explicit button press. MIDI input remains silent.");
  const eventsRef = useRef(events);
  const activeNotesRef = useRef(activeNotes);
  const audioContextRef = useRef<AudioContext | null>(null);
  const audioMasterRef = useRef<GainNode | null>(null);
  const audioTimerRef = useRef<number | null>(null);
  const audioFrameRef = useRef<number | null>(null);
  const audioTokenRef = useRef(0);
  const revealButtonRef = useRef<HTMLButtonElement | null>(null);
  const revealCloseRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => { eventsRef.current = events; }, [events]);
  useEffect(() => { activeNotesRef.current = activeNotes; }, [activeNotes]);

  const stopAudio = useCallback((notice = "Reference stopped. No target was revealed.", nextPhase: SearchPhase = "ready") => {
    audioTokenRef.current += 1;
    if (audioTimerRef.current != null) window.clearTimeout(audioTimerRef.current);
    if (audioFrameRef.current != null) window.cancelAnimationFrame(audioFrameRef.current);
    audioTimerRef.current = null;
    audioFrameRef.current = null;
    closeAudio(audioContextRef.current, audioMasterRef.current);
    audioContextRef.current = null;
    audioMasterRef.current = null;
    setPlaybackProgress(0);
    setPlaybackLanding(null);
    setPhase(nextPhase);
    setAudioNotice(notice);
  }, []);

  useEffect(() => () => {
    audioTokenRef.current += 1;
    if (audioTimerRef.current != null) window.clearTimeout(audioTimerRef.current);
    if (audioFrameRef.current != null) window.cancelAnimationFrame(audioFrameRef.current);
    closeAudio(audioContextRef.current, audioMasterRef.current);
    audioContextRef.current = null;
    audioMasterRef.current = null;
  }, []);

  const closeReveal = useCallback((restoreFocus = true) => {
    setRevealed(false);
    if (restoreFocus) window.setTimeout(() => revealButtonRef.current?.focus(), 0);
  }, []);

  useEffect(() => {
    if (!revealed) return;
    const task = window.setTimeout(() => revealCloseRef.current?.focus(), 0);
    return () => window.clearTimeout(task);
  }, [revealed]);

  const installScore = useCallback((nextImported: ImportedMusicXmlScore, xml: string, persist: boolean) => {
    if (nextImported.partNames.length !== 1) throw new Error(`Sound Finder evaluates one MusicXML part at a time. This file contains ${nextImported.partNames.length}; export the piano part alone first.`);
    const normalized = normalizeImportedMusicXmlScore(nextImported);
    stopAudio("New score ready. Hear a hidden phrase when you are ready.");
    setImported(nextImported);
    setScore(normalized);
    setFileState("ready");
    setFileNotice(`${nextImported.measureCount} measures available locally. Targets stay hidden until you reveal them.`);
    setChunkIndex(0);
    setHasHeard(false);
    setRevealed(false);
    setTracker(null);
    if (persist) {
      try {
        window.sessionStorage.removeItem(SCORE_FLOW_STORAGE_KEY);
        window.sessionStorage.removeItem(SCORE_FLOW_HISTORY_STORAGE_KEY);
        window.sessionStorage.setItem(SCORE_FLOW_STORAGE_KEY, JSON.stringify({ version: 1, fileName: nextImported.fileName, xml }));
      } catch {
        try { window.sessionStorage.removeItem(SCORE_FLOW_STORAGE_KEY); window.sessionStorage.removeItem(SCORE_FLOW_HISTORY_STORAGE_KEY); } catch { /* The in-memory score remains available. */ }
        setFileNotice("Score loaded in memory; this browser could not retain it after navigation.");
      }
    }
  }, [stopAudio]);

  useEffect(() => {
    const task = window.setTimeout(() => {
      try {
        const saved = parseStoredScoreFlowSource(window.sessionStorage.getItem(SCORE_FLOW_STORAGE_KEY));
        if (!saved) return;
        installScore(parseMusicXml(saved.xml, saved.fileName), saved.xml, false);
      } catch {
        setFileState("error");
        setFileNotice("The retained score could not be reopened here. Choose the MusicXML file again.");
      }
    }, 0);
    return () => window.clearTimeout(task);
  }, [installScore]);

  const onFileChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setFileState("loading");
    setFileNotice("Reading the score locally…");
    try {
      const result = await importMusicXmlFile(file);
      installScore(result.score, result.xml, true);
    } catch (error) {
      setFileState("error");
      setFileNotice(error instanceof Error ? error.message : "This score could not be read.");
    }
  };

  const loadDemo = () => {
    try { installScore(parseMusicXml(ORBIT_STUDY_MUSICXML, "orbit-study.musicxml"), ORBIT_STUDY_MUSICXML, true); }
    catch (error) { setFileState("error"); setFileNotice(error instanceof Error ? error.message : "The demo could not be opened."); }
  };

  const chunks = useMemo(() => score ? buildEarSearchChunks(score, { hand: practiceHand, maxLandings }) : [], [maxLandings, practiceHand, score]);
  const safeChunkIndex = Math.min(Math.max(0, chunkIndex), Math.max(0, chunks.length - 1));
  const chunk = chunks[safeChunkIndex] ?? null;
  const targetLandings = useMemo(() => score && chunk ? earSearchLandingsForChunk(score, chunk, { hand: practiceHand, voice }) : [], [chunk, practiceHand, score, voice]);
  const loop = useMemo<SheetMusicPracticeLoop | null>(() => {
    if (!score || !chunk) return null;
    const first = score.attacks.find((attack) => attack.id === chunk.startAttackId);
    const last = score.attacks.find((attack) => attack.id === chunk.endAttackId);
    if (!first || !last) return null;
    return selectSheetMusicLoop(score, { startMeasureIndex: first.measureIndex, endMeasureIndex: last.measureIndex, startAttackId: chunk.startAttackId, endAttackId: chunk.endAttackId, hand: practiceHand });
  }, [chunk, practiceHand, score]);
  const referencePlan = useMemo(() => {
    if (!score || !loop || !targetLandings.length) return null;
    const tempoBpm = Math.max(36, Math.min(220, score.tempoBpm * tempoPercent / 100));
    return compactEarSearchReferencePlan(buildScoreReferencePlan(loop, { tempoBpm, maxLandings: targetLandings.length, maxDurationMs: 3_600_000, noteDurationScale: .9, maxNoteDurationMs: 4_000 }));
  }, [loop, score, targetLandings.length, tempoPercent]);
  const searchLandings = useMemo(() => {
    if (!referencePlan) return [];
    const byId = new Map(targetLandings.map((landing) => [landing.id, landing]));
    return referencePlan.cues.flatMap((cue) => {
      const landing = byId.get(cue.attackId);
      return landing ? [landing] : [];
    });
  }, [referencePlan, targetLandings]);
  const collection = useMemo(() => {
    if (!loop || !imported || !searchLandings.length) return null;
    const firstMeasure = imported.measures[loop.startMeasureIndex];
    return earSearchCollectionFromAnalysis(analyzeLocalPitchCollections(searchLandings.map((landing) => ({ midiNotes: landing.notes })), {
      keyFifths: firstMeasure?.keyFifths ?? imported.keyFifths,
      keyMode: firstMeasure?.keyMode ?? imported.keyMode,
    }));
  }, [imported, loop, searchLandings]);

  useEffect(() => {
    if (phase !== "searching" || !searchLandings.length) return;
    const task = window.setTimeout(() => setTracker((current) => {
      if (!current) return current;
      const fresh = events
        .filter((event) => event.id > current.processedThroughEventId)
        .map((event) => ({ id: event.id, note: event.note, onsetMs: event.onsetMs }));
      const newestOnset = fresh.at(-1)?.onsetMs ?? current.pendingAttacks.at(-1)?.onsetMs ?? 0;
      return advanceEarSearchTracker(searchLandings, current, fresh, {
        chordWindowMs: voice === "full" ? clusterWindow : 40,
        nowMs: Math.max(clusterClockMs, newestOnset),
        collection,
      });
    }), 0);
    return () => window.clearTimeout(task);
  }, [clusterClockMs, clusterWindow, collection, events, phase, searchLandings, voice]);

  useEffect(() => {
    if (phase !== "searching" || !tracker?.pendingAttacks.length) return;
    const windowMs = voice === "full" ? clusterWindow : 40;
    const dueAt = earSearchPendingDueAt(searchLandings, tracker, windowMs);
    if (dueAt === null) return;
    const task = window.setTimeout(() => setClusterClockMs(performance.now()), Math.max(0, dueAt - performance.now() + 8));
    return () => window.clearTimeout(task);
  }, [clusterWindow, phase, searchLandings, tracker, voice]);

  const clusters = tracker?.recentProbes ?? [];
  const evaluation = tracker;

  useEffect(() => {
    if (phase !== "waiting-release" || activeNotes.length) return;
    if (searchLandings.length) setTracker(createEarSearchTracker(searchLandings, newestEventId(eventsRef.current)));
    setClusterClockMs(0);
    setPhase("searching");
    setAudioNotice("All keys released. Search at your own pace; onset timing is ignored.");
  }, [activeNotes.length, phase, searchLandings]);

  const resetSearch = () => {
    if (frozen) onResumeCapture();
    if (searchLandings.length) setTracker(createEarSearchTracker(searchLandings, newestEventId(eventsRef.current)));
    setClusterClockMs(0);
    setRevealed(false);
    setPhase(activeNotes.length ? "waiting-release" : "searching");
    setAudioNotice(activeNotes.length ? "Release every key to begin a clean search." : "Fresh search. The phrase remains hidden and timing is not graded.");
  };

  const prepareTargetChange = () => {
    stopAudio("Phrase changed. Hear the new hidden unit before searching.");
    setHasHeard(false);
    setRevealed(false);
    setTracker(null);
    setClusterClockMs(0);
  };

  const playReference = useCallback(async () => {
    if (!score || !loop || !referencePlan || !searchLandings.length) return;
    if (frozen) onResumeCapture();
    stopAudio("Preparing the hidden reference…", "ready");
    setRevealed(false);
    setHasHeard(false);
    setTracker(null);
    setClusterClockMs(0);
    const AudioContextConstructor = window.AudioContext ?? (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextConstructor) {
      setPhase("unavailable");
      setAudioNotice("Reference audio is unavailable in this browser. Try a current Chrome, Edge, Safari, or Firefox release.");
      return;
    }
    const token = audioTokenRef.current + 1;
    audioTokenRef.current = token;
    let context: AudioContext | null = null;
    let master: GainNode | null = null;
    try {
      const playbackCues = referencePlan.cues.map((cue) => {
        const ordered = [...cue.notes].sort((first, second) => first.midi - second.midi);
        const notes = voice === "upper" ? [ordered.at(-1)!] : voice === "bass" ? [ordered[0]] : ordered.slice(0, 16);
        return { ...cue, notes, endMs: cue.onsetMs + Math.max(80, ...notes.map((note) => note.onsetOffsetMs + note.durationMs + 80)) };
      });
      const totalDurationMs = Math.max(...playbackCues.map((cue) => cue.endMs));
      context = new AudioContextConstructor({ latencyHint: "interactive" });
      audioContextRef.current = context;
      await context.resume();
      if (audioTokenRef.current !== token) { closeAudio(context, null); return; }
      const now = context.currentTime;
      const compressor = context.createDynamicsCompressor();
      configureSafetyCompressor(compressor, now);
      master = context.createGain();
      audioMasterRef.current = master;
      master.gain.setValueAtTime(referenceGain(referenceVolume), now);
      master.connect(compressor).connect(context.destination);
      const audioStart = now + .12;
      let latestStop = audioStart + .1;
      playbackCues.forEach((cue) => {
        const voiceGain = .72 / Math.sqrt(Math.max(1, cue.notes.length));
        cue.notes.forEach((note) => {
          const start = audioStart + (cue.onsetMs + note.onsetOffsetMs) / 1_000;
          const duration = Math.max(.14, note.durationMs / 1_000);
          const oscillator = context!.createOscillator();
          const envelope = context!.createGain();
          oscillator.type = "triangle";
          oscillator.frequency.setValueAtTime(frequencyFromMidi(note.midi), start);
          envelope.gain.setValueAtTime(.0001, start);
          envelope.gain.exponentialRampToValueAtTime(voiceGain, start + .014);
          envelope.gain.setValueAtTime(voiceGain, start + Math.max(.04, duration - .08));
          envelope.gain.exponentialRampToValueAtTime(.0001, start + duration);
          oscillator.connect(envelope).connect(master!);
          oscillator.start(start);
          oscillator.stop(start + duration + .04);
          latestStop = Math.max(latestStop, start + duration + .08);
        });
      });
      setPhase("playing");
      setAudioNotice(`Hidden ${voice === "upper" ? "top note at each landing" : voice === "bass" ? "bottom note at each landing" : "full texture"} is playing. Watch the neutral pulse; no pitch, staff position, or target key is shown.`);
      const startedAt = performance.now() + 120;
      const updateFrame = () => {
        if (audioTokenRef.current !== token) return;
        const elapsed = Math.max(0, performance.now() - startedAt);
        const current = playbackCues.findLastIndex((cue) => cue.onsetMs <= elapsed);
        setPlaybackProgress(Math.min(1, elapsed / totalDurationMs));
        setPlaybackLanding(current >= 0 ? current : null);
        if (elapsed < totalDurationMs) audioFrameRef.current = window.requestAnimationFrame(updateFrame);
      };
      audioFrameRef.current = window.requestAnimationFrame(updateFrame);
      audioTimerRef.current = window.setTimeout(() => {
        if (audioTokenRef.current !== token) return;
        closeAudio(audioContextRef.current, audioMasterRef.current);
        audioContextRef.current = null;
        audioMasterRef.current = null;
        audioFrameRef.current = null;
        audioTimerRef.current = null;
        setPlaybackProgress(1);
        setPlaybackLanding(null);
        setHasHeard(true);
        const boundary = newestEventId(eventsRef.current);
        setTracker(createEarSearchTracker(searchLandings, boundary));
        setClusterClockMs(0);
        if (activeNotesRef.current.length) {
          setPhase("waiting-release");
          setAudioNotice("Reference finished. Release every held or sustained key before the search begins.");
        } else {
          setPhase("searching");
          setAudioNotice(referencePlan.truncated
            ? "Reference finished. This unusually long unit was shortened to the landings you actually heard; take your time and search."
            : "Reference finished. Take your time and probe the keyboard; timing is not graded.");
        }
      }, Math.max(80, (latestStop - context.currentTime) * 1_000));
    } catch {
      closeAudio(context, master);
      if (audioTokenRef.current !== token) return;
      if (audioContextRef.current === context) audioContextRef.current = null;
      if (audioMasterRef.current === master) audioMasterRef.current = null;
      setPhase("unavailable");
      setAudioNotice("Reference playback could not start. Check this site's audio permission and try again.");
    }
  }, [frozen, loop, onResumeCapture, referencePlan, referenceVolume, score, searchLandings, stopAudio, voice]);

  if (!score || !imported) return <section className={styles.shell} aria-labelledby="ear-search-title">
    <header className={styles.emptyHeader}>
      <div><span>Sound Finder · beginner ear search</span><h3 id="ear-search-title">Hear a tiny phrase. Find it without seeing the answer.</h3><p>A separate untimed HUD for the slow, useful work of poking around until register, pitch, interval, and local collection line up. MIDI stays silent.</p></div>
    </header>
    <div className={styles.importPanel}>
      <div className={styles.importOrbit} aria-hidden="true"><i /><i /><i /><b /></div>
      <div><strong>No local score is ready.</strong><p>Sound Finder reuses the MusicXML retained by Score Flow when available. You can also choose the score here; it remains in this browser tab.</p><div><label htmlFor="ear-search-upload">Choose score<input id="ear-search-upload" type="file" accept=".mxl,.musicxml,.xml,application/vnd.recordare.musicxml,application/vnd.recordare.musicxml+xml,application/xml,text/xml" onChange={onFileChange} /></label><button type="button" onClick={loadDemo}>Try original Orbit Study</button></div><small role={fileState === "error" ? "alert" : "status"}>{fileNotice}</small></div>
    </div>
  </section>;

  const visiblePhase: SearchPhase = phase === "searching" && evaluation?.complete ? "complete" : phase;
  const feedback = visiblePhase === "searching" || visiblePhase === "complete" ? evaluation?.latest ?? null : null;
  const matched = visiblePhase === "searching" || visiblePhase === "complete" ? evaluation?.matchedLandings ?? 0 : 0;
  const total = searchLandings.length;
  const place = placeCopy(feedback);
  const direction = directionCopy(feedback);
  const interval = intervalCopy(feedback);
  const collectionCue = collectionCopy(feedback);
  const texture = textureCopy(feedback);
  const chordCountMismatch = voice === "full" && (feedback?.texture === "fewer-keys" || feedback?.texture === "more-keys");
  const primaryCue: PrimaryCue = hintMode === "blind" ? null
    : chordCountMismatch ? "texture"
      : feedback?.status !== "searching" ? null
      : feedback.intervalDirection === "opposite" || feedback.intervalDirection === "repeat-mismatch" || (feedback.intervalWidth !== "unavailable" && feedback.intervalWidth !== "matched") ? "interval"
        : feedback.pitchFamily === "same-family" ? "place" : "direction";
  const accepted = new Set(evaluation?.acceptedProbeIds ?? []);
  const phaseTitle = visiblePhase === "playing" ? "Listen · the phrase is sounding"
    : visiblePhase === "waiting-release" ? "Release the keyboard to open a clean search"
      : visiblePhase === "searching" ? "Your time · there is no clock"
        : visiblePhase === "complete" ? "Phrase found · hold the shape in memory"
          : visiblePhase === "unavailable" ? "Audio needs attention"
            : "Hear first · then search from memory";

  return <section className={styles.shell} aria-labelledby="ear-search-title" data-phase={visiblePhase}>
    <header className={styles.commandDeck}>
      <div className={styles.identity}><span>Sound Finder · untimed score phrase</span><h3 id="ear-search-title">{imported.title}</h3><p>Chunk {chunks.length ? safeChunkIndex + 1 : 0} of {chunks.length} · at most {maxLandings} landings / two measures · target notes locked</p></div>
      <div className={styles.controls}>
        <label><span>Memory</span><select value={maxLandings} onChange={(event) => { prepareTargetChange(); setMaxLandings(Number(event.target.value) as LandingLimit); setChunkIndex(0); }}><option value={4}>4 landings</option><option value={6}>6 landings</option><option value={8}>8 landings</option></select></label>
        <label><span>Listen for</span><select value={voice} onChange={(event) => { prepareTargetChange(); setVoice(event.target.value as EarSearchVoice); }}><option value="upper">Top note each landing</option><option value="bass">Bottom note each landing</option><option value="full">Full texture</option></select></label>
        <label><span>Staff</span><select value={practiceHand} onChange={(event) => { prepareTargetChange(); setPracticeHand(event.target.value as PracticeHand); setChunkIndex(0); }}><option value="both">Both staffs</option><option value="right">Upper staff</option><option value="left">Lower staff</option></select></label>
        <label><span>Hints</span><select value={hintMode} onChange={(event) => setHintMode(event.target.value as HintMode)}><option value="compass">Beginner compass</option><option value="blind">Progress only</option></select></label>
      </div>
      <div className={styles.transport}>
        <div className={styles.chunkStepper}><button type="button" disabled={safeChunkIndex <= 0} onClick={() => { prepareTargetChange(); setChunkIndex(Math.max(0, safeChunkIndex - 1)); }} aria-label="Previous hidden phrase">←</button><span>phrase {chunks.length ? safeChunkIndex + 1 : 0}</span><button type="button" disabled={safeChunkIndex >= chunks.length - 1} onClick={() => { prepareTargetChange(); setChunkIndex(Math.min(chunks.length - 1, safeChunkIndex + 1)); }} aria-label="Next hidden phrase">→</button></div>
        {visiblePhase === "playing" ? <button type="button" className={styles.stopButton} onClick={() => stopAudio()}>Stop</button> : <button type="button" className={styles.listenButton} disabled={!chunk || !searchLandings.length} onClick={() => void playReference()}>{hasHeard ? "Hear again" : "Hear hidden phrase"}</button>}
        {hasHeard && visiblePhase !== "playing" ? <button type="button" onClick={resetSearch}>Reset probes</button> : null}
      </div>
    </header>

    {!chunks.length ? <div className={styles.noChunks}><strong>No 2–8-landing unit exists for this staff choice.</strong><p>Try Both staffs or another score section. Empty measures and isolated final notes are not expanded into invented material.</p></div> : <>
      <div className={styles.statusStrip}>
        <span className={cx(styles.phaseLamp, styles[`phase_${visiblePhase}`])} aria-hidden="true" />
        <div><strong>{phaseTitle}</strong><small>{audioNotice}</small></div>
        <div className={styles.readiness}><span>{midiConnected ? "MIDI ready" : "MIDI not connected"}</span><strong>{midiStatus}</strong>{!midiConnected ? <button type="button" onClick={onConnectMidi}>Connect</button> : frozen ? <button type="button" onClick={onResumeCapture}>Resume</button> : null}</div>
      </div>

      <div className={styles.stage}>
        <aside className={styles.memoryRail} aria-label="Hidden phrase memory">
          <div><span>Memory stones</span><strong>{matched} / {total} caught</strong><small>One stone is one landing. A chord still counts as one.</small></div>
          <ol>{searchLandings.map((_, index) => <li key={index} className={cx(index < matched && styles.isCaught, index === matched && !evaluation?.complete && hasHeard && styles.isCurrent)}><i aria-hidden="true" /><span>{index < matched ? `Landing ${index + 1} caught` : index === matched && hasHeard ? `Landing ${index + 1} is current` : `Landing ${index + 1} hidden`}</span></li>)}</ol>
          <div className={styles.memoryFooter}><strong>{chunk?.measureNumbers.length === 1 ? "1 measure" : "≤ 2 measures"}</strong><span>{voice === "full" ? `Chord probes gather for up to ${clusterWindow} ms` : "One key attack per probe"}</span><small>No early, late, or tempo judgment. Very long written rests are shortened to 2.4 seconds for memory practice.</small></div>
        </aside>

        <main className={styles.compassField}>
          <div className={styles.playbackLine} role="progressbar" aria-label="Hidden reference playback" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(playbackProgress * 100)}><i style={{ width: `${playbackProgress * 100}%` }} /><span>{visiblePhase === "playing" ? `sound ${playbackLanding == null ? "approaching" : playbackLanding + 1} / ${total}` : visiblePhase === "complete" ? "all hidden landings caught" : hasHeard ? "reference held in memory" : "reference has not played"}</span></div>
          <div className={cx(styles.compass, hintMode === "blind" && styles.isBlind)}>
            <article className={styles.placeChannel} data-active={Boolean(feedback) && hintMode !== "blind" && !chordCountMismatch} data-primary={primaryCue === "place"} aria-current={primaryCue === "place" ? "step" : undefined} data-caught={feedback?.status === "caught"}><b className={styles.cueGlyph} aria-hidden="true">{hintMode === "blind" || chordCountMismatch ? "·" : placeGlyph(feedback)}</b><span>Place / octave{primaryCue === "place" ? <em className={styles.nextMove}>Next move</em> : null}</span><strong>{hintMode === "blind" ? "Held back" : chordCountMismatch ? "Chord shape first" : place.title}</strong><small>{hintMode === "blind" ? "Progress only mode withholds register proximity." : chordCountMismatch ? "Match the number of gathered keys before using chord-center or octave guidance." : place.body}</small></article>
            <article className={styles.directionChannel} data-active={Boolean(feedback) && hintMode !== "blind" && !chordCountMismatch} data-primary={primaryCue === "direction"} aria-current={primaryCue === "direction" ? "step" : undefined} data-caught={feedback?.status === "caught"}><b className={styles.cueGlyph} aria-hidden="true">{hintMode === "blind" || chordCountMismatch ? "·" : directionGlyph(feedback)}</b><span>Pitch direction{primaryCue === "direction" ? <em className={styles.nextMove}>Next move</em> : null}</span><strong>{hintMode === "blind" ? "Held back" : chordCountMismatch ? "Chord shape first" : direction.title}</strong><small>{hintMode === "blind" ? "No higher/lower cue in this mode." : chordCountMismatch ? "A partial chord's center can point the hand the wrong way, so this cue waits." : direction.body}</small></article>
            <div className={styles.soundCore} aria-hidden="true"><i /><i /><i /><b>{visiblePhase === "playing" ? "listen" : visiblePhase === "complete" ? "found" : visiblePhase === "searching" ? "probe" : "ready"}</b></div>
            <article className={styles.intervalChannel} data-active={Boolean(feedback) && hintMode !== "blind"} data-primary={primaryCue === "interval" || primaryCue === "texture"} aria-current={primaryCue === "interval" || primaryCue === "texture" ? "step" : undefined} data-caught={feedback?.status === "caught"}><b className={styles.cueGlyph} aria-hidden="true">{hintMode === "blind" ? "·" : chordCountMismatch ? textureGlyph(feedback) : intervalGlyph(feedback)}</b><span>{hintMode === "blind" ? "Relationship feedback" : chordCountMismatch ? "Chord key count first" : "Relationship from last caught landing"}{primaryCue === "interval" || primaryCue === "texture" ? <em className={styles.nextMove}>Next move</em> : null}</span><strong>{hintMode === "blind" ? "Held back" : chordCountMismatch ? texture.title : interval.title}</strong><small>{hintMode === "blind" ? "No contour or width cue in this mode." : chordCountMismatch ? texture.body : `${interval.body}${voice === "full" ? ` Chord shape: ${texture.title}. ${texture.body}` : ""}`}</small></article>
            <article className={styles.collectionChannel} data-active={Boolean(feedback) && hintMode !== "blind" && !chordCountMismatch} data-tertiary="true" data-caught={feedback?.status === "caught"}><b className={styles.cueGlyph} aria-hidden="true">{hintMode === "blind" || chordCountMismatch ? "·" : collectionGlyph(feedback)}</b><span>Collection context</span><strong>{hintMode === "blind" ? "Held back" : chordCountMismatch ? "Wait for chord shape" : collectionCue.title}</strong><small>{hintMode === "blind" ? "No local collection cue in this mode." : chordCountMismatch ? "Collection membership is secondary until the gathered key count matches." : collectionCue.body}</small></article>
          </div>
          <div className={styles.centralInstruction}><strong>{phaseTitle}</strong><p>{visiblePhase === "playing" ? "Let the neutral pulses bind what you hear to a short memory unit. Pitch remains absent from the display." : visiblePhase === "searching" ? feedback?.status === "caught" ? "Pause for an instant, remember the accepted sound, then search for the next relationship." : "Wrong probes do not consume a slot or erase earlier progress. Look down at your hands for as long as you need." : visiblePhase === "complete" ? "Replay it from memory before revealing. Success does not open notation automatically." : "Press Hear hidden phrase. Notes played before the reference ends cannot satisfy the target."}</p></div>
        </main>

        <aside className={styles.probeDock}>
          <div><span>Recent probes</span><strong>{clusters.length ? `${evaluation?.probeCount ?? clusters.length} explored · latest ${clusters.length} shown` : "Waiting for your hands"}</strong><small>The latest 64 probes stay visible; caught progress persists independently and seconds between probes do not matter.</small></div>
          <ol>{clusters.slice(-8).map((cluster, index) => <li key={`${cluster.id}-${index}`} className={accepted.has(cluster.id) ? styles.isAccepted : undefined}><i aria-hidden="true">{accepted.has(cluster.id) ? "✓" : "·"}</i><div><strong>{accepted.has(cluster.id) ? "caught" : "exploring"}</strong><small>{cluster.notes.length > 1 ? `${cluster.notes.length} played keys together` : "one played key"}</small></div></li>)}</ol>
          <div className={styles.probeRules}><p><b>Sound:</b> your piano or DAW</p><p><b>Data:</b> attacks only</p><p><b>Clock:</b> deliberately ignored</p><p><b>Meaning:</b> separate cues, never a musicality score</p></div>
        </aside>
      </div>

      <footer className={styles.footerDeck}>
        <div><strong>MIDI remains silent.</strong><span>The explicit reference button is the only sound this HUD creates. Sustain and held keys do not become new attacks.</span></div>
        <label><span>Reference level · {referenceVolume}%</span><input type="range" min={0} max={100} value={referenceVolume} aria-label="Sound Finder reference level" aria-valuetext={`${referenceVolume} percent`} onChange={(event) => { const value = Number(event.target.value); setReferenceVolume(value); const context = audioContextRef.current; const master = audioMasterRef.current; if (context && master && context.state !== "closed") master.gain.setTargetAtTime(referenceGain(value), context.currentTime, .025); }} /></label>
        <label><span>Tempo · {tempoPercent}%</span><input type="range" min={45} max={100} step={1} value={tempoPercent} aria-label="Hidden phrase tempo" aria-valuetext={`${tempoPercent} percent of score tempo`} onChange={(event) => { prepareTargetChange(); setTempoPercent(Number(event.target.value)); }} /></label>
        {voice === "full" ? <label><span>Chord gather</span><select value={clusterWindow} onChange={(event) => setClusterWindow(Number(event.target.value) as 140 | 240 | 480)}><option value={140}>Close · 140 ms</option><option value={240}>Beginner · 240 ms</option><option value={480}>Build slowly · 480 ms</option></select></label> : null}
        <button ref={revealButtonRef} type="button" className={styles.revealButton} disabled={!hasHeard} aria-pressed={revealed} onClick={() => revealed ? closeReveal(false) : setRevealed(true)}>{revealed ? "Hide exact map" : "Reveal exact map"}</button>
      </footer>

      {revealed ? <section className={styles.revealDrawer} role="dialog" aria-modal="true" aria-labelledby="ear-search-reveal-title" onKeyDown={(event) => { if (event.key === "Escape") { event.preventDefault(); closeReveal(); } else if (event.key === "Tab") { event.preventDefault(); revealCloseRef.current?.focus(); } }}><header><div><span>Chosen disclosure · after listening</span><h4 id="ear-search-reveal-title">Connect the remembered sound to exact semitone places.</h4></div><button ref={revealCloseRef} type="button" onClick={() => closeReveal()}>Close exact map</button></header><RevealedMap notes={searchLandings} showConventions={showConventions} /></section> : null}
      <p className="sr-only" role="status" aria-live="polite" aria-atomic="true">{feedbackAnnouncement(feedback, matched, total, Boolean(evaluation?.complete), visiblePhase, hintMode, evaluation?.probeCount ?? 0, primaryCue)}</p>
    </>}
  </section>;
}
