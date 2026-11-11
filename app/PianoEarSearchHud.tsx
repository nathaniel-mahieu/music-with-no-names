"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
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
  fingerDistance,
  type PracticeHand,
  type SheetMusicScore,
} from "@/lib/sheet-music-coach-model";
import {
  EAR_SEARCH_MAX_LANDINGS,
  advanceEarSearchTracker,
  buildEarSearchChunks,
  buildEarSearchReferencePlan,
  createEarSearchTracker,
  earSearchFutureEchoes,
  earSearchFutureProbeNotes,
  earSearchPlaybackLandingAt,
  earSearchPendingDueAt,
  earSearchCollectionFromAnalysis,
  earSearchLandingsForChunk,
  formatEarSearchFrameStart,
  selectEarSearchChunkLoop,
  summarizeEarSearchHandProgress,
  type EarSearchProbeFeedback,
  type EarSearchFutureEcho,
  type EarSearchLanding,
  type EarSearchStaff,
  type EarSearchTimeSpan,
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
  onResumeCapture: () => void;
  mode?: "classic" | "two-hand";
};

type SearchPhase = "ready" | "playing" | "searching" | "complete";
type HintMode = "blind" | "compass";
type PrimaryCue = "texture" | "interval" | "place" | "direction" | null;

const NOTE_NAMES = ["C", "C♯", "D", "E♭", "E", "F", "F♯", "G", "A♭", "A", "B♭", "B"] as const;
const MAX_EAR_SEARCH_REFERENCE_VOICES = 256;
const PLAYBACK_PROGRESS_FRAME_MS = 50;
const ATTACK_HINT_DURATION_SECONDS = .72;
const FUTURE_ECHO_MS = 850;

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

function timelineStoneLabel(timelineIndex: number, targetIndex: number | null, matched: number, canProbe: boolean, isStaffRest = false) {
  if (isStaffRest) return `Landing ${timelineIndex + 1} · rest in selected staff layer`;
  if (targetIndex === null) return `Landing ${timelineIndex + 1} · hidden; choose a shorter frame to search`;
  return targetIndex < matched ? `Landing ${timelineIndex + 1} caught`
    : targetIndex === matched && canProbe ? `Landing ${timelineIndex + 1} is current`
      : `Landing ${timelineIndex + 1} hidden`;
}

type StaffCue = EarSearchStaff | "silence" | null | undefined;

function staffLabel(staff: StaffCue) {
  return staff === "upper" ? "Upper staff"
    : staff === "lower" ? "Lower staff"
      : staff === "both" ? "Both staffs together"
        : staff === "silence" ? "Silence · next sound approaching"
        : staff === "unknown" ? "Staff not assigned in score"
          : "Phrase complete";
}

function staffGlyph(staff: StaffCue) {
  return staff === "upper" ? "↑" : staff === "lower" ? "↓" : staff === "both" ? "↕" : staff === "silence" ? "·" : staff === "unknown" ? "?" : "✓";
}

function timeSpanLabel(span: EarSearchTimeSpan) {
  return span === "half-bar" ? "½ bar" : span === "one-bar" ? "1 bar" : "2 bars";
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
  if (!feedback) return { title: "No probe yet", body: "Touch a key. Listening to the reference is optional." };
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
  if (!feedback) return { title: "Chord shape waits", body: "Play the gathered keys together; listening is optional." };
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
  if (phase === "playing") return "Hidden reference is playing. Press Stop to start probing immediately.";
  if (phase === "ready") return "Choose a searchable frame, or listen to its holds and rests. Reference playback is optional.";
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

function RevealedMap({ notes, timelineLength, showConventions, showStaff = false }: { notes: Array<{ notes: number[]; staff?: EarSearchStaff; timelineIndex?: number }>; timelineLength: number; showConventions: boolean; showStaff?: boolean }) {
  const all = notes.flatMap((landing) => landing.notes);
  const minimum = Math.min(...all);
  const maximum = Math.max(...all);
  const span = Math.max(1, maximum - minimum);
  const slotCount = Math.max(1, timelineLength);
  const revealMinWidth = Math.max(680, slotCount * 38);
  return <div className={styles.revealMap}>
    <div className={styles.revealPlotViewport} role="region" tabIndex={0} aria-label="Scrollable revealed phrase pitch map">
      <div className={styles.revealPlot} style={{ "--reveal-min-width": `${revealMinWidth}px` } as CSSProperties} role="img" aria-label={`Revealed pitch-height map with ${notes.length} sounding landings across ${slotCount} timeline slots, from MIDI key ${minimum} through ${maximum}. Scroll horizontally to inspect an extended phrase.`}>
        {Array.from({ length: 13 }, (_, index) => <i key={index} style={{ bottom: `${index / 12 * 100}%` }} />)}
        {notes.map((landing, landingIndex) => {
          const slot = Math.min(slotCount, Math.max(1, landing.timelineIndex ?? landingIndex + 1));
          return landing.notes.map((note) => <b key={`${landingIndex}-${note}`} style={{ left: `${(slot - .5) / slotCount * 100}%`, bottom: `${(note - minimum) / span * 84 + 8}%` } as CSSProperties}>{notes.length <= 12 || note === landing.notes.at(-1) ? <span>{showConventions ? midiLabel(note) : note}</span> : null}</b>);
        })}
      </div>
    </div>
    <div className={styles.revealSteps}>
      {notes.map((landing, index) => {
        const prior = notes[index - 1];
        const move = prior ? landing.notes.at(-1)! - prior.notes.at(-1)! : null;
        const internal = landing.notes.slice(1).map((note, noteIndex) => note - landing.notes[noteIndex]);
        const travel = prior ? fingerDistance(prior.notes.at(-1)!, landing.notes.at(-1)!) : null;
        return <article key={index} data-staff={landing.staff ?? "unknown"}>
          <span>landing {landing.timelineIndex ?? index + 1}{showStaff ? ` · ${staffLabel(landing.staff)}` : ""}</span>
          <strong>{showConventions ? landing.notes.map(midiLabel).join(" + ") : landing.notes.map((note) => `key ${note}`).join(" + ")}</strong>
          <small>{move == null ? "anchor" : `${signed(move)} semitones · ${travel?.reach.replaceAll("-", " ")}`}{internal.length ? ` · inside ${internal.join(" / ")} st` : ""}</small>
        </article>;
      })}
    </div>
    <p>This exact map appears only because you chose Reveal. Height is a chromatic semitone ladder, not engraved staff notation.</p>
  </div>;
}

export function PianoEarSearchHud({ events, chordWindowMs, showConventions, frozen, onResumeCapture, mode = "classic" }: PianoEarSearchHudProps) {
  const twoHand = mode === "two-hand";
  const [imported, setImported] = useState<ImportedMusicXmlScore | null>(null);
  const [score, setScore] = useState<SheetMusicScore | null>(null);
  const [fileState, setFileState] = useState<"empty" | "loading" | "ready" | "error">("empty");
  const [fileNotice, setFileNotice] = useState("Use the score already loaded in Score Flow, choose MusicXML, or try the original demo.");
  const [timeSpan, setTimeSpan] = useState<EarSearchTimeSpan>("half-bar");
  const [practiceHand, setPracticeHand] = useState<PracticeHand>("both");
  const [voice, setVoice] = useState<EarSearchVoice>(twoHand ? "staff-anchors" : "upper");
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
  const [playbackSoundingLanding, setPlaybackSoundingLanding] = useState<number | null>(null);
  const [auditioningAttackId, setAuditioningAttackId] = useState<string | null>(null);
  const [futureEchoes, setFutureEchoes] = useState<EarSearchFutureEcho[]>([]);
  const [futureEchoAnnouncement, setFutureEchoAnnouncement] = useState("");
  const [audioNotice, setAudioNotice] = useState("Reference frames and attack hints play only after explicit controls. MIDI input remains silent.");
  const gathersTexture = voice === "full" || voice === "staff-anchors";
  const eventsRef = useRef(events);
  const probeBoundaryRef = useRef({ eventId: newestEventId(events), atMs: 0 });
  const audioContextRef = useRef<AudioContext | null>(null);
  const audioMasterRef = useRef<GainNode | null>(null);
  const audioTimerRef = useRef<number | null>(null);
  const audioFrameRef = useRef<number | null>(null);
  const audioTokenRef = useRef(0);
  const futureEchoTimerRef = useRef<number | null>(null);
  const lastEchoProbeIdRef = useRef<string | number | null>(null);
  const revealButtonRef = useRef<HTMLButtonElement | null>(null);
  const revealCloseRef = useRef<HTMLButtonElement | null>(null);
  const memoryListRef = useRef<HTMLOListElement | null>(null);

  useEffect(() => { eventsRef.current = events; }, [events]);
  const captureProbeBoundary = useCallback(() => {
    probeBoundaryRef.current = { eventId: newestEventId(eventsRef.current), atMs: performance.now() };
  }, []);

  const disposeAudio = useCallback((clearAudition = true) => {
    audioTokenRef.current += 1;
    if (audioTimerRef.current != null) window.clearTimeout(audioTimerRef.current);
    if (audioFrameRef.current != null) window.cancelAnimationFrame(audioFrameRef.current);
    audioTimerRef.current = null;
    audioFrameRef.current = null;
    closeAudio(audioContextRef.current, audioMasterRef.current);
    audioContextRef.current = null;
    audioMasterRef.current = null;
    if (clearAudition) setAuditioningAttackId(null);
  }, []);

  const clearFutureEchoes = useCallback((forgetProbe = true) => {
    if (futureEchoTimerRef.current != null) window.clearTimeout(futureEchoTimerRef.current);
    futureEchoTimerRef.current = null;
    setFutureEchoes([]);
    setFutureEchoAnnouncement("");
    if (forgetProbe) lastEchoProbeIdRef.current = null;
  }, []);

  const stopAudio = useCallback((notice = "Reference stopped. No target was revealed.", nextPhase: SearchPhase = "ready") => {
    disposeAudio();
    setPlaybackProgress(0);
    setPlaybackSoundingLanding(null);
    setPhase(nextPhase);
    setAudioNotice(notice);
  }, [disposeAudio]);

  useEffect(() => () => {
    disposeAudio(false);
    if (futureEchoTimerRef.current != null) window.clearTimeout(futureEchoTimerRef.current);
  }, [disposeAudio]);

  const closeReveal = useCallback((restoreFocus = true) => {
    setRevealed(false);
    if (restoreFocus) window.setTimeout(() => revealButtonRef.current?.focus(), 0);
  }, []);

  const handleRevealKeyDown = useCallback((event: ReactKeyboardEvent<HTMLElement>) => {
    if (event.key === "Escape") {
      event.preventDefault();
      closeReveal();
      return;
    }
    if (event.key !== "Tab") return;
    const focusable = Array.from(event.currentTarget.querySelectorAll<HTMLElement>(
      'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
    ));
    if (!focusable.length) return;
    const currentIndex = focusable.indexOf(document.activeElement as HTMLElement);
    const destination = event.shiftKey && currentIndex <= 0
      ? focusable.at(-1)
      : !event.shiftKey && (currentIndex < 0 || currentIndex === focusable.length - 1)
        ? focusable[0]
        : null;
    if (destination) {
      event.preventDefault();
      destination.focus();
    }
  }, [closeReveal]);

  useEffect(() => {
    if (!revealed) return;
    const task = window.setTimeout(() => revealCloseRef.current?.focus(), 0);
    return () => window.clearTimeout(task);
  }, [revealed]);

  const installScore = useCallback((nextImported: ImportedMusicXmlScore, xml: string, persist: boolean) => {
    if (nextImported.partNames.length !== 1) throw new Error(`Sound Finder evaluates one MusicXML part at a time. This file contains ${nextImported.partNames.length}; export the piano part alone first.`);
    const normalized = normalizeImportedMusicXmlScore(nextImported);
    captureProbeBoundary();
    stopAudio("Score ready. Start probing now, or listen to the hidden reference.");
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
  }, [captureProbeBoundary, stopAudio]);

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

  // Phrase navigation always follows one canonical both-staff score clock. The
  // staff selector projects notes inside that frame without moving its edges.
  const chunks = useMemo(() => score ? buildEarSearchChunks(score, { hand: "both", span: timeSpan }) : [], [score, timeSpan]);
  const safeChunkIndex = Math.min(Math.max(0, chunkIndex), Math.max(0, chunks.length - 1));
  const chunk = chunks[safeChunkIndex] ?? null;
  const requestedHalfBars = timeSpan === "half-bar" ? 1 : timeSpan === "one-bar" ? 2 : 4;
  const clippedAtScoreEnd = Boolean(chunk && safeChunkIndex + requestedHalfBars > chunks.length);
  const targetLandings = useMemo(() => score && chunk ? earSearchLandingsForChunk(score, chunk, { hand: practiceHand, voice }) : [], [chunk, practiceHand, score, voice]);
  const loop = useMemo(() => score && chunk ? selectEarSearchChunkLoop(score, chunk, practiceHand) : null, [chunk, practiceHand, score]);
  const referencePlan = useMemo(() => {
    if (!score || !chunk) return null;
    const tempoBpm = Math.max(36, Math.min(220, score.tempoBpm * tempoPercent / 100));
    return buildEarSearchReferencePlan(score, chunk, targetLandings, { hand: practiceHand, voice, tempoBpm });
  }, [chunk, practiceHand, score, targetLandings, tempoPercent, voice]);
  const tooDense = targetLandings.length > EAR_SEARCH_MAX_LANDINGS;
  const searchLandings = useMemo(() => tooDense ? [] : targetLandings, [targetLandings, tooDense]);
  const timelineLandings = useMemo(() => {
    if (!referencePlan) return [];
    const targetIndexById = new Map(searchLandings.map((landing, index) => [landing.id, index]));
    const landingById = new Map(targetLandings.map((landing) => [landing.id, landing]));
    return referencePlan.cues.filter((cue) => cue.kind === "attack").map((cue, timelineIndex) => {
      const landing = landingById.get(cue.attackId) ?? null;
      const targetIndex = targetIndexById.get(cue.attackId) ?? null;
      return {
        id: cue.attackId,
        timelineIndex,
        targetIndex,
        landing,
        isStaffRest: landing === null,
      };
    });
  }, [referencePlan, searchLandings, targetLandings]);
  const collection = useMemo(() => {
    if (!loop || !imported || !searchLandings.length) return null;
    const firstMeasure = imported.measures[loop.startMeasureIndex];
    return earSearchCollectionFromAnalysis(analyzeLocalPitchCollections(searchLandings.map((landing) => ({ midiNotes: landing.notes })), {
      keyFifths: firstMeasure?.keyFifths ?? imported.keyFifths,
      keyMode: firstMeasure?.keyMode ?? imported.keyMode,
    }));
  }, [imported, loop, searchLandings]);

  // Readiness is independent of listening. The boundary is captured in the
  // initiating action, not here, so the first post-selection key cannot vanish.
  useEffect(() => {
    if (phase !== "ready" || !searchLandings.length) return;
    setTracker(createEarSearchTracker(searchLandings, probeBoundaryRef.current.eventId));
    setClusterClockMs(0);
    setPhase("searching");
  }, [phase, searchLandings]);

  const beginProbeSearch = useCallback((notice: string) => {
    if (frozen) onResumeCapture();
    captureProbeBoundary();
    clearFutureEchoes();
    setTracker(searchLandings.length ? createEarSearchTracker(searchLandings, probeBoundaryRef.current.eventId) : null);
    setClusterClockMs(0);
    setPhase(searchLandings.length ? "searching" : "ready");
    setAudioNotice(notice);
  }, [captureProbeBoundary, clearFutureEchoes, frozen, onResumeCapture, searchLandings]);

  const stopReferenceAndProbe = useCallback(() => {
    stopAudio();
    beginProbeSearch("Reference stopped. New key attacks count now; the notes stay hidden.");
  }, [beginProbeSearch, stopAudio]);

  useEffect(() => {
    if (phase !== "searching" || !searchLandings.length) return;
    const task = window.setTimeout(() => setTracker((current) => {
      if (!current) return current;
      const fresh = events
        .filter((event) => event.id > current.processedThroughEventId && event.onsetMs >= probeBoundaryRef.current.atMs)
        .map((event) => ({ id: event.id, note: event.note, onsetMs: event.onsetMs }));
      const newestOnset = fresh.at(-1)?.onsetMs ?? current.pendingAttacks.at(-1)?.onsetMs ?? 0;
      return advanceEarSearchTracker(searchLandings, current, fresh, {
        chordWindowMs: gathersTexture ? clusterWindow : 40,
        nowMs: Math.max(clusterClockMs, newestOnset),
        collection,
      });
    }), 0);
    return () => window.clearTimeout(task);
  }, [clusterClockMs, clusterWindow, collection, events, gathersTexture, phase, searchLandings]);

  useEffect(() => {
    if (phase !== "searching" || !tracker?.pendingAttacks.length) return;
    const windowMs = gathersTexture ? clusterWindow : 40;
    const dueAt = earSearchPendingDueAt(searchLandings, tracker, windowMs);
    if (dueAt === null) return;
    const task = window.setTimeout(() => setClusterClockMs(performance.now()), Math.max(0, dueAt - performance.now() + 8));
    return () => window.clearTimeout(task);
  }, [clusterWindow, gathersTexture, phase, searchLandings, tracker]);

  const clusters = tracker?.recentProbes ?? [];
  const evaluation = tracker;

  useEffect(() => {
    const task = window.setTimeout(() => {
      const latest = tracker?.recentProbes.at(-1);
      if (phase !== "searching" || !tracker || !latest || !searchLandings.length) {
        clearFutureEchoes();
        return;
      }
      if (latest.id === lastEchoProbeIdRef.current) return;
      lastEchoProbeIdRef.current = latest.id;
      if (futureEchoTimerRef.current != null) window.clearTimeout(futureEchoTimerRef.current);
      futureEchoTimerRef.current = null;
      if (tracker.acceptedProbeIds.includes(latest.id)) {
        setFutureEchoes([]);
        setFutureEchoAnnouncement("");
        return;
      }
      const echoNotes = earSearchFutureProbeNotes(tracker, eventsRef.current, gathersTexture ? clusterWindow : 40);
      const echoes = earSearchFutureEchoes(searchLandings, tracker.matchedLandings, echoNotes);
      setFutureEchoes(echoes);
      if (!echoes.length) {
        setFutureEchoAnnouncement("");
        return;
      }
      const locations = echoes.slice(0, 4).map((echo) => {
        const timelineIndex = timelineLandings.find((item) => item.id === echo.landingId)?.timelineIndex ?? echo.landingIndex;
        return `attack ${timelineIndex + 1}, ${echo.matchedNoteCount} of ${echo.targetNoteCount} present`;
      });
      const remainder = echoes.length > locations.length ? `, plus ${echoes.length - locations.length} more` : "";
      setFutureEchoAnnouncement(`Future orientation only: ${locations.join("; ")}${remainder}. Search progress did not change.`);
      futureEchoTimerRef.current = window.setTimeout(() => {
        futureEchoTimerRef.current = null;
        setFutureEchoes([]);
        setFutureEchoAnnouncement("");
      }, FUTURE_ECHO_MS);
    }, 0);
    return () => window.clearTimeout(task);
  }, [clearFutureEchoes, clusterWindow, gathersTexture, phase, searchLandings, timelineLandings, tracker]);

  const resetSearch = () => {
    disposeAudio();
    setRevealed(false);
    beginProbeSearch("Fresh search. New key attacks count now; listening is optional.");
  };

  const prepareTargetChange = (notice = "Frame changed. Start probing now, or listen to the reference.") => {
    captureProbeBoundary();
    clearFutureEchoes();
    stopAudio(notice);
    setHasHeard(false);
    setRevealed(false);
    setTracker(null);
    setClusterClockMs(0);
  };

  const playReference = useCallback(async () => {
    if (!score || !referencePlan || referencePlan.totalDurationMs <= 0) return;
    const scheduledVoiceCount = referencePlan.cues.reduce((count, cue) => count + cue.notes.length, 0);
    if (scheduledVoiceCount > MAX_EAR_SEARCH_REFERENCE_VOICES) {
      // Refusing oversized audio must not reopen an old input boundary or
      // erase progress in the still-valid silent search.
      setAudioNotice(`This texture would schedule ${scheduledVoiceCount} synthesized voices for one playback; the browser-safe limit is ${MAX_EAR_SEARCH_REFERENCE_VOICES}. Silent probing is unchanged. Choose staff anchors, a single outer voice, or a shorter time frame to listen.`);
      return;
    }
    if (frozen) onResumeCapture();
    clearFutureEchoes();
    // Gate preparation too: context.resume() can await a browser gesture.
    stopAudio("Preparing the hidden reference… Stop at any time to start probing.", "playing");
    setRevealed(false);
    setHasHeard(false);
    setTracker(null);
    setClusterClockMs(0);
    const AudioContextConstructor = window.AudioContext ?? (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextConstructor) {
      beginProbeSearch("Reference audio is unavailable. Silent keyboard probing is still ready.");
      return;
    }
    const token = audioTokenRef.current + 1;
    audioTokenRef.current = token;
    let context: AudioContext | null = null;
    let master: GainNode | null = null;
    try {
      const playbackCues = referencePlan.cues;
      const totalDurationMs = referencePlan.totalDurationMs;
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
      const carryCopy = playbackCues.some((cue) => cue.kind === "carry") ? " A held sound enters at the frame boundary." : "";
      const restCopy = referencePlan.restSpans.length ? ` ${referencePlan.restSpans.length} silent region${referencePlan.restSpans.length === 1 ? " stays" : "s stay"} on the clock.` : "";
      setAudioNotice(`Hidden ${voice === "upper" ? "top voice" : voice === "bass" ? "bottom voice" : voice === "staff-anchors" ? "one anchor for each active score staff" : "full texture"} is playing across the whole frame.${carryCopy}${restCopy} ${twoHand ? "The staff lane may pulse, but pitch height and target keys stay hidden." : "No pitch, pending staff, or target key is shown."}`);
      const startedAt = performance.now() + 120;
      let lastProgressUpdateMs = Number.NEGATIVE_INFINITY;
      const updateFrame = () => {
        if (audioTokenRef.current !== token) return;
        const elapsed = Math.max(0, performance.now() - startedAt);
        if (elapsed - lastProgressUpdateMs >= PLAYBACK_PROGRESS_FRAME_MS || elapsed >= totalDurationMs) {
          const sounding = earSearchPlaybackLandingAt(playbackCues, elapsed);
          setPlaybackProgress(Math.min(1, elapsed / Math.max(1, totalDurationMs)));
          setPlaybackSoundingLanding(sounding);
          lastProgressUpdateMs = elapsed;
        }
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
        setPlaybackSoundingLanding(null);
        setHasHeard(true);
        if (tooDense) {
          setPhase("complete");
          setAudioNotice(`Full ${timeSpanLabel(timeSpan)} frame heard. It contains ${targetLandings.length} attacks, above the ${EAR_SEARCH_MAX_LANDINGS}-attack search limit; choose a shorter frame to probe it safely.`);
        } else if (!searchLandings.length) {
          setPhase("complete");
          setAudioNotice(referencePlan.cues.some((cue) => cue.notes.length)
            ? "Full frame heard, including the carried or held sound. This layer has no new attack to find; replay it or choose another frame."
            : "Full rest frame heard on its written clock. There is no attack to find in this layer; replay it or choose another frame.");
        } else {
          beginProbeSearch("Full frame finished. New key attacks count now; timing is not graded.");
        }
      }, Math.max(80, (Math.max(latestStop, audioStart + totalDurationMs / 1_000) - context.currentTime) * 1_000));
    } catch {
      closeAudio(context, master);
      if (audioTokenRef.current !== token) return;
      if (audioContextRef.current === context) audioContextRef.current = null;
      if (audioMasterRef.current === master) audioMasterRef.current = null;
      beginProbeSearch("Reference playback could not start. Silent probing is ready; check audio permission if you want to listen.");
    }
  }, [beginProbeSearch, clearFutureEchoes, frozen, onResumeCapture, referencePlan, referenceVolume, score, searchLandings, stopAudio, targetLandings.length, timeSpan, tooDense, twoHand, voice]);

  const playAttackHint = useCallback(async (landing: EarSearchLanding, timelineIndex: number) => {
    if (phase === "playing" || !landing.notes.length) return;
    disposeAudio();
    const AudioContextConstructor = window.AudioContext ?? (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextConstructor) {
      setAudioNotice("This browser cannot play the selected attack hint. Try a current Chrome, Edge, Safari, or Firefox release.");
      return;
    }
    const token = audioTokenRef.current + 1;
    audioTokenRef.current = token;
    let context: AudioContext | null = null;
    let master: GainNode | null = null;
    try {
      context = new AudioContextConstructor({ latencyHint: "interactive" });
      audioContextRef.current = context;
      await context.resume();
      if (audioTokenRef.current !== token) { closeAudio(context, null); return; }
      const now = context.currentTime;
      const start = now + .035;
      const stop = start + ATTACK_HINT_DURATION_SECONDS;
      const compressor = context.createDynamicsCompressor();
      configureSafetyCompressor(compressor, now);
      master = context.createGain();
      audioMasterRef.current = master;
      master.gain.setValueAtTime(referenceGain(referenceVolume), now);
      master.connect(compressor).connect(context.destination);
      const voiceGain = .72 / Math.sqrt(Math.max(1, landing.notes.length));
      landing.notes.forEach((note) => {
        const oscillator = context!.createOscillator();
        const envelope = context!.createGain();
        oscillator.type = "triangle";
        oscillator.frequency.setValueAtTime(frequencyFromMidi(note), start);
        envelope.gain.setValueAtTime(.0001, start);
        envelope.gain.exponentialRampToValueAtTime(voiceGain, start + .014);
        envelope.gain.setValueAtTime(voiceGain, stop - .09);
        envelope.gain.exponentialRampToValueAtTime(.0001, stop);
        oscillator.connect(envelope).connect(master!);
        oscillator.start(start);
        oscillator.stop(stop + .04);
      });
      setAuditioningAttackId(landing.id);
      setAudioNotice(`Ear hint: hidden attack ${timelineIndex + 1} sounded. Search progress did not change.`);
      audioTimerRef.current = window.setTimeout(() => {
        if (audioTokenRef.current !== token) return;
        closeAudio(audioContextRef.current, audioMasterRef.current);
        audioContextRef.current = null;
        audioMasterRef.current = null;
        audioTimerRef.current = null;
        setAuditioningAttackId(null);
      }, (ATTACK_HINT_DURATION_SECONDS + .14) * 1_000);
    } catch {
      closeAudio(context, master);
      if (audioTokenRef.current !== token) return;
      if (audioContextRef.current === context) audioContextRef.current = null;
      if (audioMasterRef.current === master) audioMasterRef.current = null;
      setAuditioningAttackId(null);
      setAudioNotice("The selected attack hint could not play. Check this site's audio permission and try again.");
    }
  }, [disposeAudio, phase, referenceVolume]);

  const memoryTargetIndex = Math.min(tracker?.matchedLandings ?? 0, Math.max(0, searchLandings.length - 1));
  const memoryTargetId = searchLandings[memoryTargetIndex]?.id;
  const locatedMemoryIndex = memoryTargetId ? timelineLandings.findIndex((item) => item.id === memoryTargetId) : -1;
  const memoryProgressIndex = locatedMemoryIndex >= 0 ? locatedMemoryIndex : Math.max(0, timelineLandings.length - 1);
  useEffect(() => {
    const list = memoryListRef.current;
    const item = list?.children.item(memoryProgressIndex) as HTMLElement | null;
    if (!list || !item) return;
    const itemTop = item.offsetTop;
    const itemBottom = itemTop + item.offsetHeight;
    if (itemTop < list.scrollTop) list.scrollTop = itemTop;
    else if (itemBottom > list.scrollTop + list.clientHeight) list.scrollTop = itemBottom - list.clientHeight;
  }, [chunk?.id, memoryProgressIndex, timelineLandings.length]);

  if (!score || !imported) return <section className={cx(styles.shell, twoHand && styles.twoHandShell)} aria-labelledby="ear-search-title" data-mode={mode}>
    <header className={styles.emptyHeader}>
      <div><span>{twoHand ? "Sound Finder · two-staff ear search" : "Sound Finder · beginner ear search"}</span><h3 id="ear-search-title">{twoHand ? "Hear both staffs. Find their route through the score." : "Hear a hidden score span. Find it without seeing the answer."}</h3><p>{twoHand ? "The notes stay hidden, while the score tells you whether the next landing belongs to the upper staff, lower staff, or both together. Reference playback is optional. MIDI stays silent and never guesses which physical hand you used." : "Choose half a bar, one bar, or two bars of written time and start probing immediately. Listen when useful; Stop returns to probing. MIDI stays silent."}</p></div>
    </header>
    <div className={styles.importPanel}>
      <div className={styles.importOrbit} aria-hidden="true"><i /><i /><i /><b /></div>
      <div><strong>No local score is ready.</strong><p>Sound Finder reuses the MusicXML retained by Score Flow when available. You can also choose the score here; it remains in this browser tab.</p><div><label htmlFor="ear-search-upload">Choose score<input id="ear-search-upload" type="file" accept=".mxl,.musicxml,.xml,application/vnd.recordare.musicxml,application/vnd.recordare.musicxml+xml,application/xml,text/xml" onChange={onFileChange} /></label><button type="button" onClick={loadDemo}>Try original Orbit Study</button></div><small role={fileState === "error" ? "alert" : "status"}>{fileNotice}</small></div>
    </div>
  </section>;

  const visiblePhase: SearchPhase = phase === "searching" && evaluation?.complete ? "complete" : phase;
  const canProbe = visiblePhase === "searching";
  const feedback = visiblePhase === "searching" || visiblePhase === "complete" ? evaluation?.latest ?? null : null;
  const matched = visiblePhase === "searching" || visiblePhase === "complete" ? evaluation?.matchedLandings ?? 0 : 0;
  const total = searchLandings.length;
  const timelineTotal = timelineLandings.length;
  const staffRestCount = timelineLandings.filter((item) => item.isStaffRest).length;
  const restSpanCount = referencePlan?.restSpans.length ?? 0;
  const restDurationMs = referencePlan?.restSpans.reduce((sum, rest) => sum + rest.durationMs, 0) ?? 0;
  const frameHasSound = Boolean(referencePlan?.cues.some((cue) => cue.notes.length));
  const listeningOnly = tooDense || !targetLandings.length;
  const place = placeCopy(feedback);
  const direction = directionCopy(feedback);
  const interval = intervalCopy(feedback);
  const collectionCue = collectionCopy(feedback);
  const texture = textureCopy(feedback);
  const chordCountMismatch = gathersTexture && (feedback?.texture === "fewer-keys" || feedback?.texture === "more-keys");
  const primaryCue: PrimaryCue = hintMode === "blind" ? null
    : chordCountMismatch ? "texture"
      : feedback?.status !== "searching" ? null
      : feedback.intervalDirection === "opposite" || feedback.intervalDirection === "repeat-mismatch" || (feedback.intervalWidth !== "unavailable" && feedback.intervalWidth !== "matched") ? "interval"
        : feedback.pitchFamily === "same-family" ? "place" : "direction";
  const accepted = new Set(evaluation?.acceptedProbeIds ?? []);
  const phaseTitle = visiblePhase === "playing" ? frameHasSound ? "Listen · the whole frame is sounding" : "Listen · hold the written silence"
      : visiblePhase === "searching" ? "Your time · there is no clock"
        : visiblePhase === "complete" ? listeningOnly ? tooDense ? "Frame heard · shorten it to begin searching" : "Frame heard · no new attack to search" : "Phrase found · hold the shape in memory"
            : listeningOnly ? "Hear the complete score-time frame" : "Start probing · listening is optional";
  const handProgress = summarizeEarSearchHandProgress(searchLandings, matched);
  const playbackCue = playbackSoundingLanding == null ? null : referencePlan?.cues[playbackSoundingLanding] ?? null;
  const currentStaff: StaffCue = visiblePhase === "playing"
    ? playbackCue?.staff ?? "silence"
    : handProgress.nextStaff;
  const handCueVerb = visiblePhase === "playing" ? playbackCue == null ? "Between sounds" : playbackCue.kind === "carry" ? "Held into frame" : "Sounding now"
    : visiblePhase === "complete" ? "Route complete"
      : canProbe ? "Next landing" : "Opening landing";
  const centralInstruction = visiblePhase === "playing"
    ? "Listen while the hidden reference plays, or press Stop to probe now. Keys played during reference playback do not count."
    : visiblePhase === "searching"
      ? feedback?.status === "caught"
        ? twoHand ? `That score landing is secure. The next belongs to ${staffLabel(handProgress.nextStaff).toLowerCase()}.` : "That attack is found; its chip now shows the score-authored staff. Hold the accepted sound, then search for the next relationship."
        : "Wrong probes do not consume a slot or erase earlier progress. Look down at your hands for as long as you need."
      : visiblePhase === "complete" && !listeningOnly
        ? "The route is found. Replay it, reset your probes, or choose Reveal. No notation opens automatically."
        : listeningOnly
          ? tooDense ? "Choose a shorter window to probe this frame, or listen to its complete texture."
            : "This layer has no new attack to match. You can listen to its holds and rests, change the layer, or select another start."
          : "Play a fresh key attack to begin. Listening to the reference is optional; Stop always returns to probing.";

  return <section className={cx(styles.shell, twoHand && styles.twoHandShell)} aria-labelledby="ear-search-title" data-phase={visiblePhase} data-mode={mode}>
    <header className={styles.commandDeck}>
      <div className={styles.identity}><span>{twoHand ? "Sound Finder · two-staff path" : "Sound Finder · untimed score phrase"}</span><h3 id="ear-search-title">{imported.title}</h3><p title="Start numbers mark fixed half-bar positions. Changing the window length keeps the same starting point.">Start {chunk ? formatEarSearchFrameStart(chunk) : "—"} · {timeSpanLabel(timeSpan)} window{clippedAtScoreEnd ? " · ends at score end" : ""} · {twoHand ? "staff route visible · pitch locked" : "pitch locked · pending staff hidden"}</p></div>
      <div className={cx(styles.controls, twoHand && styles.twoHandControls)}>
        <label><span>Window length</span><select value={timeSpan} onChange={(event) => { prepareTargetChange("Same starting point. Probe the resized window now, or listen first."); setTimeSpan(event.target.value as EarSearchTimeSpan); }}><option value="half-bar">½ bar · short</option><option value="one-bar">1 bar · medium</option><option value="two-bars">2 bars · long</option></select></label>
        {twoHand ? <label><span>Target texture</span><select value={voice} onChange={(event) => { prepareTargetChange(); setVoice(event.target.value as EarSearchVoice); }}><option value="staff-anchors">One anchor per staff</option><option value="full">All written keys</option></select></label> : <>
          <label><span>Target notes</span><select value={voice} onChange={(event) => { prepareTargetChange("Target notes changed at the same start. Only this reduction is required; probes are ready now."); setVoice(event.target.value as EarSearchVoice); }}><option value="upper">Top note each landing</option><option value="bass">Bottom note each landing</option><option value="full">Full texture</option></select></label>
          <label><span>Score staff</span><select value={practiceHand} onChange={(event) => { const next = event.target.value as PracticeHand; prepareTargetChange(`Same phrase timeline · ${next === "right" ? "upper" : next === "left" ? "lower" : "both"}-staff layer selected. Only this layer is required; probes are ready now.`); setPracticeHand(next); }}><option value="both">Both staffs</option><option value="right">Upper staff</option><option value="left">Lower staff</option></select></label>
        </>}
        <label><span>Hints</span><select value={hintMode} onChange={(event) => setHintMode(event.target.value as HintMode)}><option value="compass">Beginner compass</option><option value="blind">Progress only</option></select></label>
      </div>
      <div className={styles.transport}>
        <div className={styles.chunkStepper}><button type="button" disabled={safeChunkIndex <= 0} onClick={() => { prepareTargetChange(); setChunkIndex(Math.max(0, safeChunkIndex - 1)); }} aria-label="Previous frame start">←</button><select aria-label="Frame start" title="Fixed half-bar starts; window length does not change these numbers" value={safeChunkIndex} onChange={(event) => { prepareTargetChange(); setChunkIndex(Number(event.target.value)); }}>{chunks.map((candidate, index) => <option key={candidate.ordinal} value={index}>Start {formatEarSearchFrameStart(candidate)}</option>)}</select><button type="button" disabled={safeChunkIndex >= chunks.length - 1} onClick={() => { prepareTargetChange(); setChunkIndex(Math.min(chunks.length - 1, safeChunkIndex + 1)); }} aria-label="Next frame start">→</button></div>
        {visiblePhase === "playing" ? <button type="button" className={styles.stopButton} onClick={stopReferenceAndProbe}>Stop</button> : <button type="button" className={styles.listenButton} disabled={!chunk || !referencePlan || referencePlan.totalDurationMs <= 0} onClick={() => void playReference()}>{hasHeard ? "Hear whole frame again" : "Hear hidden phrase"}</button>}
        {visiblePhase !== "playing" && !listeningOnly ? <button type="button" onClick={resetSearch}>Reset probes</button> : null}
      </div>
    </header>

    {!chunks.length ? <div className={styles.noChunks}><strong>No score-time frame exists here.</strong><p>Try another score. Sound Finder keeps authored time and does not invent material outside it.</p></div> : <>
      <div className={styles.statusStrip}>
        <span className={cx(styles.phaseLamp, styles[`phase_${visiblePhase}`])} aria-hidden="true" />
        <div><strong>{phaseTitle}</strong><small role="status" aria-live="polite">{frozen ? "Capture is paused in the Piano input bar. " : ""}{audioNotice}</small></div>
      </div>

      <div className={styles.stage}>
        <aside className={cx(styles.memoryRail, styles.memoryRailDense, twoHand && styles.twoHandMemory)} aria-label={twoHand ? "Two-staff hidden phrase memory" : "Hidden phrase memory"} data-density="dense">
          <div><span>{twoHand ? "Two-staff route" : "Shared score clock"}</span><strong>{listeningOnly ? tooDense ? `${targetLandings.length} attacks · listening only` : "No new attack · listening only" : `${matched} / ${total} attacks found`}</strong><small>{twoHand ? "↑ upper · ↓ lower · ↕ both together · — rest. Pitch stays hidden." : `${timelineTotal} written attack${timelineTotal === 1 ? "" : "s"}${staffRestCount ? ` · ${staffRestCount} rest${staffRestCount === 1 ? "" : "s"} in this layer` : ""} · ${restSpanCount} silence span${restSpanCount === 1 ? "" : "s"}. Staff appears only after a find.`} Select ▶ for an attack ear hint. Gold ↗ or n/m is a future echo, never credit.</small>{!targetLandings.length ? <small role="status">This frame has no new attack in the {practiceHand === "right" ? "upper" : practiceHand === "left" ? "lower" : "selected"} staff. Hear its holds and rests on the unchanged score clock.</small> : tooDense ? <small role="status">This frame exceeds the {EAR_SEARCH_MAX_LANDINGS}-attack search limit. Hear it intact, then choose a shorter time frame for probing.</small> : null}{twoHand ? <div className={styles.handTotals}>
            <span data-staff="upper" role="progressbar" aria-label="Upper staff landings caught" aria-valuemin={0} aria-valuemax={handProgress.upper.total} aria-valuenow={handProgress.upper.caught}><b>U</b><em>upper</em><strong>{handProgress.upper.caught}/{handProgress.upper.total}</strong></span>
            <span data-staff="lower" role="progressbar" aria-label="Lower staff landings caught" aria-valuemin={0} aria-valuemax={handProgress.lower.total} aria-valuenow={handProgress.lower.caught}><b>L</b><em>lower</em><strong>{handProgress.lower.caught}/{handProgress.lower.total}</strong></span>
          </div> : null}</div>
          <ol ref={memoryListRef}>{timelineLandings.length ? timelineLandings.map((item) => {
            const label = timelineStoneLabel(item.timelineIndex, item.targetIndex, matched, canProbe, item.isStaffRest);
            const caught = item.targetIndex !== null && item.targetIndex < matched;
            const current = item.targetIndex !== null && item.targetIndex === matched && !evaluation?.complete && canProbe;
            const showStaff = twoHand || caught;
            const visibleStaff = showStaff ? item.landing?.staff ?? "unknown" : item.isStaffRest ? "rest" : "hidden";
            const futureEcho = futureEchoes.find((echo) => echo.landingId === item.id);
            const futureFraction = futureEcho ? `${futureEcho.matchedNoteCount}/${futureEcho.targetNoteCount}` : null;
            const auditioning = auditioningAttackId === item.id;
            const futureStyle = futureEcho ? ({
              "--future-strength": String(futureEcho.coverage),
              "--future-fill": `rgba(255, 209, 122, ${(.1 + futureEcho.coverage * .38).toFixed(3)})`,
              "--future-halo": `0 0 ${(7 + futureEcho.coverage * 14).toFixed(1)}px rgba(255, 209, 122, ${(.14 + futureEcho.coverage * .5).toFixed(3)})`,
            } as CSSProperties) : undefined;
            return <li key={item.id} data-staff={visibleStaff} data-future-echo={futureEcho ? "true" : undefined} data-auditioning={auditioning ? "true" : undefined} style={futureStyle} aria-label={item.isStaffRest ? label : undefined} className={cx(item.isStaffRest && styles.isRest, item.landing && styles.hasAttackButton, caught && styles.isCaught, current && styles.isCurrent)}>{item.landing ? <button type="button" className={styles.memoryChipButton} disabled={visiblePhase === "playing"} onClick={() => void playAttackHint(item.landing!, item.timelineIndex)} aria-label={`Play hidden attack ${item.timelineIndex + 1} as an ear hint.${futureEcho ? ` ${futureEcho.matchedNoteCount} of ${futureEcho.targetNoteCount} notes in this later attack were present in your last probe.` : ""}${showStaff ? ` ${staffLabel(item.landing.staff)}.` : ""}`}><i aria-hidden="true">{auditioning ? "♪" : futureEcho ? futureEcho.targetNoteCount === 1 ? "↗" : futureFraction : showStaff ? staffGlyph(item.landing.staff) : "▶"}</i><span className="sr-only">{futureEcho ? `${item.timelineIndex + 1} · future ${futureFraction} present` : showStaff ? `${item.timelineIndex + 1} · ${staffLabel(item.landing.staff)}` : `${item.timelineIndex + 1} · hear attack`}</span></button> : <><i aria-hidden="true">—</i><span className="sr-only">{`${item.timelineIndex + 1} · staff rest`}</span></>}</li>;
          }) : <li data-staff="rest" aria-label="Full frame rest; no written attack" className={styles.isRest}><i aria-hidden="true">—</i><span className="sr-only">full frame · rest</span></li>}</ol>
          <div className={styles.memoryFooter}><strong>{timeSpanLabel(timeSpan)} score-time frame{twoHand && handProgress.shared.total ? ` · ${handProgress.shared.total} together` : ""}</strong><span>{restSpanCount ? `${restSpanCount} silence span${restSpanCount === 1 ? "" : "s"} · ${(restDurationMs / 1_000).toFixed(1)} s at this tempo` : "Sound continues across the full frame"}</span><small>{twoHand ? "Staff lanes come from the uploaded score. MIDI reports keys, not which hand pressed them. " : ""}No early, late, or tempo judgment. Leading, interior, and trailing rests plus written holds use the whole selected frame.</small></div>
        </aside>

        <main className={cx(styles.compassField, twoHand && styles.twoHandCompassField)}>
          <div className={styles.playbackLine} role="progressbar" aria-label="Hidden reference playback" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(playbackProgress * 100)}><i style={{ width: `${playbackProgress * 100}%` }} /><span>{visiblePhase === "playing" ? `${Math.round(playbackProgress * 100)}% of ${timeSpanLabel(timeSpan)} · ${playbackCue ? playbackCue.kind === "carry" ? "held sound" : "new attack sounding" : "rest / silence"}` : visiblePhase === "complete" ? listeningOnly ? "whole score-time frame heard" : "all selected-staff attacks found" : hasHeard ? "whole frame heard · probing is ready" : canProbe ? "probes ready · reference optional" : "reference optional"}</span></div>
          {twoHand ? <div className={styles.handCue} data-staff={currentStaff ?? "complete"} role="group" aria-label={`${handCueVerb}: ${staffLabel(currentStaff)}. Pitch remains hidden.`}>
            <div className={styles.handLane} data-lane="upper" data-active={currentStaff === "upper" || currentStaff === "both"}><span>Upper staff</span><strong>written score lane</strong><small>{handProgress.upper.caught} of {handProgress.upper.total} caught</small></div>
            <div className={styles.handCueCore}><i aria-hidden="true">{staffGlyph(currentStaff)}</i><span>{handCueVerb}</span><strong>{staffLabel(currentStaff)}</strong><small>{currentStaff === "both" ? "One landing · gather both staff anchors" : currentStaff === "silence" ? "Hold the gap; the next pitch stays hidden" : currentStaff == null ? "Replay before revealing" : "Pitch remains hidden"}</small></div>
            <div className={styles.handLane} data-lane="lower" data-active={currentStaff === "lower" || currentStaff === "both"}><span>Lower staff</span><strong>written score lane</strong><small>{handProgress.lower.caught} of {handProgress.lower.total} caught</small></div>
          </div> : null}
          <div className={cx(styles.compass, hintMode === "blind" && styles.isBlind)}>
            <article className={styles.placeChannel} data-active={Boolean(feedback) && hintMode !== "blind" && !chordCountMismatch} data-primary={primaryCue === "place"} aria-current={primaryCue === "place" ? "step" : undefined} data-caught={feedback?.status === "caught"}><b className={styles.cueGlyph} aria-hidden="true">{hintMode === "blind" || chordCountMismatch ? "·" : placeGlyph(feedback)}</b><span>Place / octave{primaryCue === "place" ? <em className={styles.nextMove}>Next move</em> : null}</span><strong>{hintMode === "blind" ? "Held back" : chordCountMismatch ? "Chord shape first" : place.title}</strong><small>{hintMode === "blind" ? "Progress only mode withholds register proximity." : chordCountMismatch ? "Match the number of gathered keys before using chord-center or octave guidance." : place.body}</small></article>
            <article className={styles.directionChannel} data-active={Boolean(feedback) && hintMode !== "blind" && !chordCountMismatch} data-primary={primaryCue === "direction"} aria-current={primaryCue === "direction" ? "step" : undefined} data-caught={feedback?.status === "caught"}><b className={styles.cueGlyph} aria-hidden="true">{hintMode === "blind" || chordCountMismatch ? "·" : directionGlyph(feedback)}</b><span>Pitch direction{primaryCue === "direction" ? <em className={styles.nextMove}>Next move</em> : null}</span><strong>{hintMode === "blind" ? "Held back" : chordCountMismatch ? "Chord shape first" : direction.title}</strong><small>{hintMode === "blind" ? "No higher/lower cue in this mode." : chordCountMismatch ? "A partial chord's center can point the hand the wrong way, so this cue waits." : direction.body}</small></article>
            <div className={styles.soundCore} aria-hidden="true"><i /><i /><i /><b>{visiblePhase === "playing" ? "listen" : visiblePhase === "complete" ? "found" : visiblePhase === "searching" ? "probe" : "ready"}</b></div>
            <article className={styles.intervalChannel} data-active={Boolean(feedback) && hintMode !== "blind"} data-primary={primaryCue === "interval" || primaryCue === "texture"} aria-current={primaryCue === "interval" || primaryCue === "texture" ? "step" : undefined} data-caught={feedback?.status === "caught"}><b className={styles.cueGlyph} aria-hidden="true">{hintMode === "blind" ? "·" : chordCountMismatch ? textureGlyph(feedback) : intervalGlyph(feedback)}</b><span>{hintMode === "blind" ? "Relationship feedback" : chordCountMismatch ? "Chord key count first" : "Relationship from last caught landing"}{primaryCue === "interval" || primaryCue === "texture" ? <em className={styles.nextMove}>Next move</em> : null}</span><strong>{hintMode === "blind" ? "Held back" : chordCountMismatch ? texture.title : interval.title}</strong><small>{hintMode === "blind" ? "No contour or width cue in this mode." : chordCountMismatch ? texture.body : `${interval.body}${gathersTexture ? ` Texture: ${texture.title}. ${texture.body}` : ""}`}</small></article>
            <article className={styles.collectionChannel} data-active={Boolean(feedback) && hintMode !== "blind" && !chordCountMismatch} data-tertiary="true" data-caught={feedback?.status === "caught"}><b className={styles.cueGlyph} aria-hidden="true">{hintMode === "blind" || chordCountMismatch ? "·" : collectionGlyph(feedback)}</b><span>Collection context</span><strong>{hintMode === "blind" ? "Held back" : chordCountMismatch ? "Wait for chord shape" : collectionCue.title}</strong><small>{hintMode === "blind" ? "No local collection cue in this mode." : chordCountMismatch ? "Collection membership is secondary until the gathered key count matches." : collectionCue.body}</small></article>
          </div>
          <div className={styles.centralInstruction}><strong>{phaseTitle}</strong><p>{centralInstruction}</p></div>
        </main>

        <aside className={styles.probeDock}>
          <div><span>Recent probes</span><strong>{listeningOnly ? "Listen to this frame; no probe target is active" : clusters.length ? `${evaluation?.probeCount ?? clusters.length} explored · latest ${clusters.length} shown` : twoHand ? "Waiting for keyboard probes" : "Waiting for your hands"}</strong><small>{listeningOnly ? "A rest-only or over-dense frame remains audible and navigable instead of disappearing." : "The latest 64 probes stay visible; caught progress persists independently and seconds between probes do not matter."}</small></div>
          <ol>{clusters.slice(-8).map((cluster, index) => <li key={`${cluster.id}-${index}`} className={accepted.has(cluster.id) ? styles.isAccepted : undefined}><i aria-hidden="true">{accepted.has(cluster.id) ? "✓" : "·"}</i><div><strong>{accepted.has(cluster.id) ? "caught" : "exploring"}</strong><small>{cluster.notes.length > 1 ? `${cluster.notes.length} played keys together` : "one played key"}</small></div></li>)}</ol>
          <div className={styles.probeRules}><p><b>Sound:</b> your piano or DAW</p><p><b>Data:</b> attacks only</p><p><b>Clock:</b> deliberately ignored</p><p><b>{twoHand ? "Staff:" : "Meaning:"}</b> {twoHand ? "from MusicXML, never inferred from MIDI pitch" : "separate cues, never a musicality score"}</p></div>
        </aside>
      </div>

      <footer className={styles.footerDeck}>
        <div><strong>MIDI remains silent.</strong><span>Only explicit frame and chip ear-hint controls create sound. {twoHand ? "Upper/lower labels describe the score; MIDI cannot see which physical hand played. " : ""}Sustain and held keys do not become new attacks.</span></div>
        <label><span>Frame + hint level · {referenceVolume}%</span><input type="range" min={0} max={100} value={referenceVolume} aria-label="Sound Finder frame and hint level" aria-valuetext={`${referenceVolume} percent`} onChange={(event) => { const value = Number(event.target.value); setReferenceVolume(value); const context = audioContextRef.current; const master = audioMasterRef.current; if (context && master && context.state !== "closed") master.gain.setTargetAtTime(referenceGain(value), context.currentTime, .025); }} /></label>
        <label><span>Tempo · {tempoPercent}%</span><input type="range" min={45} max={100} step={1} value={tempoPercent} aria-label="Hidden phrase tempo" aria-valuetext={`${tempoPercent} percent of score tempo`} onChange={(event) => { prepareTargetChange(); setTempoPercent(Number(event.target.value)); }} /></label>
        {gathersTexture ? <label><span>Multi-key gather</span><select value={clusterWindow} onChange={(event) => setClusterWindow(Number(event.target.value) as 140 | 240 | 480)}><option value={140}>Close · 140 ms</option><option value={240}>Beginner · 240 ms</option><option value={480}>Build slowly · 480 ms</option></select></label> : null}
        <button ref={revealButtonRef} type="button" className={styles.revealButton} disabled={visiblePhase === "playing" || !searchLandings.length} aria-pressed={revealed} onClick={() => revealed ? closeReveal(false) : setRevealed(true)}>{revealed ? "Hide exact map" : "Reveal exact map"}</button>
      </footer>

      {revealed ? <section className={styles.revealDrawer} role="dialog" aria-modal="true" aria-labelledby="ear-search-reveal-title" onKeyDown={handleRevealKeyDown}><header><div><span>Chosen disclosure · after listening</span><h4 id="ear-search-reveal-title">Connect the remembered sound to exact semitone places.</h4></div><button ref={revealCloseRef} type="button" onClick={() => closeReveal()}>Close exact map</button></header><RevealedMap notes={searchLandings.map((landing) => ({ ...landing, timelineIndex: (timelineLandings.find((item) => item.id === landing.id)?.timelineIndex ?? 0) + 1 }))} timelineLength={timelineTotal} showConventions={showConventions} showStaff /></section> : null}
      <p className="sr-only" role="status" aria-live="polite" aria-atomic="true">{listeningOnly && visiblePhase === "complete" ? tooDense ? `Full frame heard. ${targetLandings.length} attacks exceed the ${EAR_SEARCH_MAX_LANDINGS}-attack search limit; choose a shorter frame.` : "Full frame heard. This selected staff has no new attack to search." : feedbackAnnouncement(feedback, matched, total, Boolean(evaluation?.complete), visiblePhase, hintMode, evaluation?.probeCount ?? 0, primaryCue)}{twoHand && visiblePhase !== "complete" ? ` ${handCueVerb}: ${staffLabel(currentStaff)}. Pitch remains hidden.` : ""}</p>
      <p className="sr-only" role="status" aria-live="polite" aria-atomic="true">{futureEchoAnnouncement}</p>
    </>}
  </section>;
}
