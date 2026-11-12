import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import "./piano-pitch-visual-settings.test.ts";

const LABS = ["GuideLab", "ScaleLab", "PianoLab", "VoiceLab", "EarLab", "HarmonyLab", "RhythmLab", "JourneyLab", "RecordingLab", "AtlasLab", "PersonalLab", "TechnicalNotesLab"];

test("every learning lab exposes a named semantic region", async () => {
  for (const lab of LABS) {
    const source = await readFile(new URL(`../app/${lab}.tsx`, import.meta.url), "utf8");
    assert.match(source, /<section[^>]+aria-labelledby=/, `${lab} needs aria-labelledby`);
  }
});

test("site-wide pitch flashes stay vivid, transient, persistent, and interaction-safe", async () => {
  const [visuals, css, layout, ratio, settings] = await Promise.all([
    readFile(new URL("../app/PitchVisuals.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/PitchVisuals.module.css", import.meta.url), "utf8"),
    readFile(new URL("../app/layout.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/RatioLab.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/PitchVisualSettings.tsx", import.meta.url), "utf8"),
  ]);

  assert.match(layout, /<PitchVisualProvider>\{children\}<\/PitchVisualProvider>/,
    "one provider must sit outside the changing lab/HUD subtree");
  assert.match(ratio, /<PitchVisualSettingsMenu\s*\/>/);
  assert.match(visuals, /\? \[\{ opacity: peak \* \.72 \}, \{ opacity: peak \* \.72 \}\]/,
    "reduced-motion users should receive a fixed cue without a moving fade");
  assert.match(visuals, /\[\{ opacity: peak \}, \{ opacity: hold, offset: \.22 \}, \{ opacity: 0 \}\]/);
  assert.match(visuals, /animate\(glowRef\.current\?\.children\.item\(note\), \.42, \.31\)/);
  assert.match(visuals, /duration: reducedMotion \? 330 : 820, easing: "ease-out"/);
  assert.match(visuals, /window\.localStorage\.getItem\(PITCH_VISUAL_SETTINGS_STORAGE_KEY\)/);
  assert.match(visuals, /window\.localStorage\.setItem\(PITCH_VISUAL_SETTINGS_STORAGE_KEY, serializePitchVisualSettings\(normalized\)\)/);
  assert.match(visuals, /window\.addEventListener\("storage", sync\)/,
    "saved visual preferences should also synchronize across open tabs");
  assert.match(settings, /aria-label="Site-wide pitch visual settings"/);
  assert.match(settings, /setAllPitchVisualEffects\(settings, true\)/);
  assert.match(settings, /setAllPitchVisualEffects\(settings, false\)/);
  for (const layer of ["glowFlash", "noteFlash", "staffFlash"]) {
    assert.match(settings, new RegExp(`type="checkbox"[^>\\n]*checked=\\{settings\\.${layer}\\}`));
  }
  assert.match(settings, /<option value="vertical">Vertical glow · original<\/option>/);
  assert.match(visuals, /data-pitch-visual="glow"[^>]*aria-hidden="true"/);
  assert.match(css, /\.staff,\s*\.glow,\s*\.notes \{[^}]*position: fixed;[^}]*inset: 0;[^}]*pointer-events: none/,
    "the inert visual layer must cover the viewport beyond the HUD");
  assert.doesNotMatch(css, /backdrop-filter|filter: blur|will-change/,
    "full-screen flashes should not reserve expensive permanent compositor layers");
  assert.match(css, /@media \(forced-colors: active\) \{\s*\.staff, \.glow, \.notes \{ display: none; \}/);
});

test("site-wide staff flashes overlay content with synchronized left quarter notes and hidden-reference safety", async () => {
  const [piano, visuals, hud, css] = await Promise.all([
    readFile(new URL("../app/PianoLab.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/PitchVisuals.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/PianoAbsolutePitchHud.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/PitchVisuals.module.css", import.meta.url), "utf8"),
  ]);
  assert.match(visuals, /const STAFF_NOTES = Array\.from\(\{ length: 128 \}/);
  assert.match(visuals, /staffMode \? valid : new Set\(\[\.\.\.valid\]\.map\(\(note\) => note % 12\)\)/,
    "same-color octave attacks must stay separate on the staff");
  assert.match(visuals, /data-midi-note=\{midi\}/);
  assert.match(visuals, /data-staff-step=\{step\}/);
  assert.match(visuals, /ledgerSteps\.map/);
  assert.match(visuals, /className=\{styles\.accidental\}>♯/);
  assert.match(visuals, /<svg className=\{styles\.taperedNote\}[^>]*><path d=\{TAPERED_NOTE_PATH\}/,
    "a crisp pointed note marker should be distinct from the diffuse wash");
  assert.match(visuals, /data-pitch-staff="background"/);
  assert.match(visuals, /\{children\}[\s\S]*ref=\{foregroundStaffRef\}[\s\S]*data-pitch-staff="foreground-flash"/);
  assert.doesNotMatch(visuals, /clip-path|ResizeObserver|marginStaffRef/,
    "flashing staff lines must cross the HUD and page content, without an occlusion mask");
  assert.match(css, /\.foregroundStaff \{ z-index: 7; opacity: 0; \}/);
  assert.match(visuals, /animate\(foregroundStaffRef\.current, \.62, \.42\)/);
  assert.match(visuals, /<span key=\{midi\} data-midi-note=\{midi\}[^>]*>[\s\S]*data-quarter-note=\{midi\}[\s\S]*className=\{styles\.taperedNote\}/,
    "quarter note and tapered marker must share the same animated per-note layer");
  assert.match(visuals, /viewBox="-2\.3 -8 4\.6 16"/);
  assert.match(visuals, /<ellipse cx="0" cy="0"/,
    "the notehead, not the stem's bounding box, must sit at the exact staff pitch");
  assert.match(visuals, /y1=\{ledgerStep - step\} y2=\{ledgerStep - step\}/);
  assert.match(visuals, /"M-1 \.24V7" : "M1 -\.24V-7"/);
  assert.match(css, /\.notes > span > \.quarterNote \{ left: clamp\(112px, 11vw, 180px\)/);
  assert.match(css, /--pitch-staff-step-size: clamp\(5px, 1\.6svh, 20px\)/);
  assert.match(css, /top: calc\(var\(--pitch-staff-middle-c\) \+ var\(--pitch-staff-position\) \* var\(--pitch-staff-step-size\)\)/);
  assert.match(css, /\.staffGlow > span > \*, \.notes > span > \* \{[^}]*left: 50%/);
  assert.match(css, /\.wash \{[^}]*width: 100vw/);
  assert.match(css, /\.glow \{ z-index: 8; \}/);
  assert.match(piano, /if \(!revealPitchColor\) clearFlashes\(\);[\s\S]*if \(played && revealPitchColor && token === toneVisualTokenRef\.current\) showPitchAttacks\(\[note\]\)/,
    "hidden reference playback must clear existing flashes and never reveal its pitch");
  assert.match(visuals, /!pianoActiveRef\.current && data\.length >= 3/,
    "the remembered site-wide MIDI listener must not duplicate Piano's immediate flashes");
  assert.match(piano, /rememberMidiInput\(input \?\? null\)/);
  assert.match(visuals, /getAnimations\?\.\(\{ subtree: true \}\)\.forEach\(\(animation\) => animation\.cancel\(\)\)/,
    "cold-reference cancellation must clear every independently animated flash layer");
  assert.match(hud, /seven written steps higher on the background staff/);
});

test("raw MIDI chord feedback precedes frame-batched analysis without losing device timing", async () => {
  const piano = await readFile(new URL("../app/PianoLab.tsx", import.meta.url), "utf8");
  const attack = piano.slice(piano.indexOf("  const addEvent = useCallback("), piano.indexOf("  const captureArmedDoAttack ="));
  assert.match(attack, /showPitchAttacks\(\[note\]\);\s*if \(frozenRef\.current\) return/);
  assert.match(attack, /phraseEventsRef\.current = nextPhraseEvents;[\s\S]*eventsRef\.current = nextEvents;[\s\S]*publishEvents\(\)/);
  assert.doesNotMatch(attack, /setPhraseEvents|setEvents\(|scaleFrameTimeline|setTimeout|await /,
    "raw note-on must not wait for analysis, rendering, audio, or a chord grouping timer");
  assert.match(piano, /midiMessageTimeStamp\(event\.timeStamp, performance\.now\(\)\)/);
  assert.match(piano, /const skipHiddenAnalysis = isAbsolutePitchFocus \|\| isEarSearchFocus/);
  assert.match(piano, /const phraseSnapshots = useMemo\(\(\) => skipHiddenAnalysis \? \[\]/);
  assert.match(piano, /const motifTransformations = useMemo\(\(\) => skipHiddenAnalysis \? \[\]/);
  assert.match(piano, /const measures = useMemo<EventMeasure\[\]>\(\(\) => skipHiddenAnalysis \? \[\]/);
  const publication = piano.slice(piano.indexOf("const publishEventsNow ="), piano.indexOf("const updateEvents ="));
  assert.match(publication, /if \(skipHiddenAnalysis\) return;[\s\S]*scaleFrameTimeline/,
    "long Sound Finder histories must not trigger hidden full-phrase analysis on each attack");
  assert.match(piano, /const latestSession = \{ \.\.\.session, phraseEvents: phraseEventsRef\.current \}/,
    "page-hide persistence should include attacks waiting for the next paint");
});

test("Sound Finder replay and Stop preserve finds while explicit Reset clears them", async () => {
  const finder = await readFile(new URL("../app/PianoEarSearchHud.tsx", import.meta.url), "utf8");
  const playback = finder.slice(finder.indexOf("const playReference ="), finder.indexOf("const playAttackHint ="));
  assert.doesNotMatch(playback, /setTracker\(null\)/,
    "listening again must not silently return the expected attack to the beginning");
  assert.match(finder, /const beginProbeSearch = useCallback\(\(notice: string, resetProgress = false\)/);
  assert.match(finder, /rearmEarSearchTracker\(searchLandings, current, boundaryId, \{ resetProgress \}\)/);
  assert.match(finder, /const matched = evaluation\?\.matchedLandings \?\? 0/,
    "the shared score clock must keep its caught chips visible during replay too");
  const reset = finder.slice(finder.indexOf("const resetSearch ="), finder.indexOf("const prepareTargetChange ="));
  assert.match(reset, /beginProbeSearch\([^\n]*, true\)/);
  const selection = finder.slice(finder.indexOf("const prepareTargetChange ="), finder.indexOf("const playReference ="));
  assert.match(selection, /setTracker\(null\)/,
    "a changed target must still discard the previous phrase's checkpoint");
  assert.match(playback, /Your finds are kept\. Continue probing, or choose Reset probes/);
});

test("Sound Finder opens probing without a reference and Stop cancels listening before rearming", async () => {
  const finder = await readFile(new URL("../app/PianoEarSearchHud.tsx", import.meta.url), "utf8");
  assert.match(finder, /if \(phase !== "ready" \|\| !searchLandings\.length\) return;[\s\S]*createEarSearchTracker\(searchLandings, probeBoundaryRef\.current\.eventId\)/);
  assert.match(finder, /const captureProbeBoundary = useCallback\(\(\) => \{\s*probeBoundaryRef\.current = \{ eventId: newestEventId\(eventsRef\.current\), atMs: performance\.now\(\) \}/);
  const stopStart = finder.indexOf("const stopReferenceAndProbe =");
  const stopEnd = finder.indexOf("useEffect", stopStart);
  assert.match(finder.slice(stopStart, stopEnd), /stopAudio\(\);\s*beginProbeSearch\(/,
    "Stop must invalidate audio before arming fresh keyboard input");
  assert.match(finder, /onClick=\{stopReferenceAndProbe\}>Stop/);
  assert.match(finder, /event\.onsetMs >= probeBoundaryRef\.current\.atMs/,
    "pre-Stop events published in a later paint must not receive retroactive credit");
  assert.match(finder, /stopAudio\("Preparing the hidden reference[^\n]*"playing"\)/,
    "asynchronous audio preparation must not reopen probes before playback");
  assert.match(finder, /disabled=\{visiblePhase === "playing" \|\| !searchLandings\.length\}/,
    "Reveal should remain explicit without requiring a whole-frame listen");
  assert.doesNotMatch(finder, /waiting-release|Search begins only after playback finishes|Hear the whole frame first/);
  assert.match(finder, /probes ready · reference optional/);
  const oversizeStart = finder.indexOf("if (scheduledVoiceCount > MAX_EAR_SEARCH_REFERENCE_VOICES)");
  const oversizeEnd = finder.indexOf("if (frozen)", oversizeStart);
  assert.ok(oversizeStart >= 0 && oversizeEnd > oversizeStart);
  assert.doesNotMatch(finder.slice(oversizeStart, oversizeEnd), /stopAudio\(|setPhase\(|setTracker\(/,
    "refusing oversized reference audio must preserve the active search and its event boundary");
});

test("Sight Shapes keeps notation, interval, keyboard, and learner-report channels explicit and silent", async () => {
  const [piano, sight, sightCss, model] = await Promise.all([
    readFile(new URL("../app/PianoLab.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/PianoSightReadingHud.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/PianoSightReadingHud.module.css", import.meta.url), "utf8"),
    readFile(new URL("../lib/piano-sight-reading-model.ts", import.meta.url), "utf8"),
  ]);

  assert.match(piano, /focusLens === "sight-shapes" \? <PianoSightReadingHud/);
  assert.match(piano, /scale=\{scale\}[\s\S]*chordWindowMs=\{chordWindowMs\}/);
  assert.match(sight, /<section className=\{styles\.shell\} aria-labelledby="sight-shapes-title">/);
  assert.match(sight, /role="img" aria-labelledby="sight-score-title sight-score-description"/);
  assert.match(sight, /role="img" aria-labelledby="sight-keyboard-svg-title sight-keyboard-svg-description"/);
  assert.match(sight, /generic thirds[\s\S]*three or four semitones/i);
  assert.match(sight, /Relational diagnosis/);
  assert.match(sight, /Personal words are observations to test/);
  assert.match(sight, /not inferred from MIDI/);
  assert.match(sight, /noteNeedsFlag\(frame\)/);
  assert.match(sight, /noteNeedsDot\(frame\)/);
  assert.match(sight, /selected \$\{chordWindowMs\} ms reading window/);
  assert.match(sight, /aria-live="polite"/);
  assert.match(sight, /aria-pressed=\{practiceMode === "transfer"\}/);
  assert.doesNotMatch(sight, /onResumeCapture|>Resume capture<\/button>/, "Sight Shapes must recover capture from the shared Piano input bar");
  assert.doesNotMatch(sight, /AudioContext|createOscillator|OscillatorNode|tabIndex=\{?[1-9]/);
  assert.match(model, /written distance \(staff steps \/ generic interval\)/);
  assert.match(model, /export function analyzeNotatedInterval/);
  assert.match(model, /export function evaluateSightReadingAttempt/);
  assert.doesNotMatch(model, /emotionScore|goodnessScore|musicalityScore/);
  assert.match(sightCss, /@media \(prefers-reduced-motion: reduce\)/);
  assert.match(sightCss, /@media \(forced-colors: active\)/);
  assert.match(sightCss, /\.flag[\s\S]*\.durationDot/);
  assert.match(sightCss, /\.workbenchActions button[\s\S]*min-height: 44px/);
});

test("Score Flow keeps local score practice, silent MIDI, and diagnostic evidence explicit", async () => {
  const [piano, scoreFlow, scoreFlowCss, importer, model, memory, session, ratio] = await Promise.all([
    readFile(new URL("../app/PianoLab.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/PianoScoreFlowHud.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/PianoScoreFlowHud.module.css", import.meta.url), "utf8"),
    readFile(new URL("../lib/musicxml-import.ts", import.meta.url), "utf8"),
    readFile(new URL("../lib/sheet-music-coach-model.ts", import.meta.url), "utf8"),
    readFile(new URL("../lib/sheet-music-practice-memory.ts", import.meta.url), "utf8"),
    readFile(new URL("../lib/piano-session.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/RatioLab.tsx", import.meta.url), "utf8"),
  ]);

  assert.match(piano, /\{ id: "score-flow", label: "Score Flow", description: "Upload and align a MusicXML score", tier: "secondary", group: "practice" \}/);
  assert.match(piano, /focusLens === "score-flow" \? <PianoScoreFlowHud/);
  assert.match(piano, /events=\{phraseEvents\}[\s\S]*activeNotes=\{activeNoteNumbers\}[\s\S]*frozen=\{frozen\}[\s\S]*onResumeCapture=\{resumeTrace\}/);
  assert.match(piano, /pressedNotes=\{pressedNoteNumbers\}/);
  assert.match(piano, /focusLens === "score-flow"[\s\S]*pushPhraseEvent\(phraseEventsRef\.current, event, 30 \* 60_000, 4096\)/);
  assert.match(piano, /Silent MIDI maps each attack to interval, score, scale, and harmonic context\. Your instrument or DAW supplies the sound\./);
  assert.doesNotMatch(scoreFlow, /midiConnected|midiStatus|onConnectMidi|Connect \/ retry MIDI/, "Score Flow must use the shared Piano input bar for device setup");
  assert.match(session, /"score-flow"/);
  assert.match(ratio, /"score-flow": "uploaded-score coach"/);

  assert.match(scoreFlow, /<section className=\{styles\.shell\} aria-labelledby="score-flow-title">/);
  assert.match(scoreFlow, /<label htmlFor="score-flow-upload">Choose score<input id="score-flow-upload" type="file"/);
  assert.match(scoreFlow, /accept="\.mxl,\.musicxml,\.xml,[^"]+" onChange=\{onFileChange\}/);
  assert.match(scoreFlow, /role=\{fileState === "error" \? "alert" : "status"\}/);
  assert.match(scoreFlow, /role="status" aria-live="polite" aria-atomic="true"/);
  assert.match(scoreFlow, /Nothing leaves this browser tab/);
  assert.match(scoreFlow, /window\.sessionStorage\.setItem\(SCORE_FLOW_STORAGE_KEY/);
  assert.match(scoreFlow, /window\.sessionStorage\.removeItem\(SCORE_FLOW_STORAGE_KEY/);
  assert.match(scoreFlow, /window\.sessionStorage\.setItem\(SCORE_FLOW_HISTORY_STORAGE_KEY/);
  assert.match(scoreFlow, /historyRaw\.length > 2 \* 1024 \* 1024/);
  assert.ok(scoreFlow.indexOf("window.sessionStorage.removeItem(SCORE_FLOW_STORAGE_KEY);") < scoreFlow.indexOf("window.sessionStorage.setItem(SCORE_FLOW_STORAGE_KEY"), "a failed replacement cannot leave a stale score behind");
  assert.match(importer, /new Uint8Array\(await file\.arrayBuffer\(\)\)/);
  assert.ok(importer.indexOf("if (file.size > MAX_ARCHIVE_BYTES)") < importer.indexOf("await file.arrayBuffer()"), "oversized score files must fail before browser allocation");
  assert.doesNotMatch(scoreFlow, /localStorage|fetch\(|XMLHttpRequest|navigator\.sendBeacon|new FormData/);

  assert.match(scoreFlow, /Synthesized score reference is ready\. MIDI input remains silent\./);
  assert.match(scoreFlow, /Review take started\.[^"`]*MIDI remains silent\./);
  assert.match(scoreFlow, /const \[readingMode, setReadingMode\] = useState<ReadingMode>\("ear"\)/, "Score Flow must begin from an ear-first, notation-locked posture");
  assert.match(scoreFlow, />Listen · notes locked<\/button>/);
  assert.match(scoreFlow, />Play \+ compare<\/button>/);
  assert.match(scoreFlow, /aria-pressed=\{reviewRevealed\}[\s\S]*"Hide notation" : "Reveal heard passage"/, "notation review must be an explicit learner choice after listening");
  assert.match(scoreFlow, /const playReference = useCallback\(async \(voice: ReferenceVoice = "full", playAlong = voice === "full"\) => \{[\s\S]*new AudioContextConstructor[\s\S]*createOscillator\(\)/);
  assert.match(scoreFlow, /captureState === "review" \? selectedChunk \? "Record chunk without audio" : "Record loop without audio"/);
  assert.match(scoreFlow, /function PlayAlongField\(/);
  assert.match(scoreFlow, /function ListeningStaff\(/);
  assert.match(scoreFlow, /Listening staff: notation follows the selected disclosure policy/);
  assert.match(scoreFlow, /The grand staff stays visible while every pitch-bearing landing remains covered\./);
  assert.match(scoreFlow, /view\.startIndex != null && view\.cursorIndex != null[\s\S]*index >= view\.startIndex && index <= view\.cursorIndex/, "the listening staff must reveal only the scheduled heard prefix");
  assert.match(scoreFlow, /if \(!started \|\| !insideScheduledRange \|\| !cursorHasSounded\) return "veiled"/, "count-in and pre-audio frames must not expose pitch");
  assert.match(scoreFlow, /if \(reviewRevealed\) return "revealed";[\s\S]*if \(view\.notationLocked\) return "veiled";/, "completion alone must not reveal notation; review requires an explicit learner action");
  assert.match(scoreFlow, /readingMode === "memory" && view\.phase === "playing"[\s\S]*index === view\.memoryRevealIndex \? "memory" : "veiled"/, "Memory disclosure must be bounded by the shared audio clock and re-cover every other landing");
  assert.match(scoreFlow, /const exact = disclosure === "revealed" \|\| disclosure === "memory"[\s\S]*\{exact \? notes\.map/, "hidden staff slots must omit exact note positions from the rendered staff");
  assert.match(scoreFlow, /disclosure === "memory" \? "◌" : "·"/, "concealed staff slots must use position- and cardinality-neutral markers");
  assert.doesNotMatch(scoreFlow, /`\$\{notes\.length\}×`/, "a notation-locked staff must not disclose chord cardinality");
  assert.match(scoreFlow, /Listening and stopping do not reveal pitch, note count, staff height, or target keys\. Reveal is a separate choice\./);
  assert.match(scoreFlow, /function referenceNotesForAttack\([\s\S]*voice === "upper"[\s\S]*voice === "bass"/, "staff disclosure must follow the exact upper or bass preview voice");
  assert.match(scoreFlow, /Shared musical now · \{sourceLabel\}/);
  assert.match(scoreFlow, /role="progressbar" aria-label="Reference playback position"/);
  assert.match(scoreFlow, /Hidden · ear only/);
  assert.match(scoreFlow, /Follow · heard notes stay/);
  assert.match(scoreFlow, /timingClock: referenceTimingClock \?\? undefined/);
  assert.match(scoreFlow, /timingMap: referenceTimingMap \?\? undefined/);
  assert.match(scoreFlow, /const hasTimingEvidence = Boolean\(referenceTimingClock \|\| referenceTimingMap \|\| timingMode === "pulse"\)/, "synchronized play-along timing must remain visible even when the setup lens says self-paced");
  assert.match(scoreFlow, /master\.connect\(compressor\)\.connect\(context\.destination\)/);
  assert.match(scoreFlow, /referenceLevelGain\(referenceVolume\)/);
  assert.match(scoreFlow, /setTargetAtTime\(referenceLevelGain\(value\)/, "the live level control must share the same true-mute mapping as playback start");
  assert.match(scoreFlow, /pressedNotes\.length \|\| \(audioState === "playing" && referencePlayback\.playAlong\)/, "active Play along must stay live until its audio ends or the learner stops it");
  assert.match(scoreFlow, /scoreReferenceFrameAt\(playbackPlan, audibleElapsed \+ 8\)/, "the visible reveal must use the same bounded cue plan as the audible reference");
  assert.match(scoreFlow, /currentIndex: frame\.cursorIndex[\s\S]*cursorIndex: frame\.cursorIndex[\s\S]*soundingIndex: frame\.soundingIndex[\s\S]*sounding: frame\.soundingIndex != null/, "the ear's onset identity must not regress when an older polyphonic tone keeps sounding");
  assert.match(scoreFlow, /startIndex: playbackPlan\.cues\[0\]\.expectedIndex[\s\S]*currentIndex: null[\s\S]*cursorIndex: playbackPlan\.cues\[0\]\.expectedIndex[\s\S]*sounding: false/, "the staff must remain covered during the audio lead-in");
  assert.match(scoreFlow, /audibleElapsed - cursorCue\.onsetMs < 1_450[\s\S]*memoryRevealIndex/, "Memory's brief reveal must expire from the audible clock rather than animation alone");
  assert.match(scoreFlow, /startAttackId: playbackPlan\.cues\[0\]\.attackId[\s\S]*endAttackId: playbackPlan\.cues\.at\(-1\)!\.attackId/, "frozen review must cover only the cues that were actually scheduled");
  assert.match(scoreFlow, /const freezeListeningPrefix = Boolean\(preserveReviewRange[\s\S]*!session\.playAlong[\s\S]*session\.heardEndAttackId\)/, "stopping a blind listen pass must retain only the clock-reached prefix for an optional reveal");
  assert.match(scoreFlow, /cancelledPlayAlongBeforeSound[\s\S]*!freezePracticePrefix[\s\S]*if \(!preserveClock \|\| cancelledPlayAlongBeforeSound\) \{[\s\S]*setReferenceTimingClock\(null\);[\s\S]*setReferenceTimingMap\(null\);[\s\S]*\}/, "count-in cancellation must clear every stale timing map without erasing an existing review during previews");
  assert.match(scoreFlow, /timingError < 0 \? 24 : 76/);
  assert.match(scoreFlow, /const pressedTargetCount = handExactReveal \?/);
  assert.match(model, /export function buildScoreReferencePlan/);
  assert.match(scoreFlow, /const \[referenceSource, setReferenceSource\] = useState<ReferenceSource>\("synth"\)/);
  assert.match(scoreFlow, /\$\{file\.name\} is local to this tab\./, "a chosen recording must be described as tab-local rather than uploaded");
  assert.match(scoreFlow, /Spotify is embedded for independent reference listening\. It does not move, reveal, or grade the score\./);
  assert.match(scoreFlow, /Spotify is listen-only here and never drives notation or performance evaluation\./, "Spotify must remain an independent player rather than pretending to share the score clock");
  assert.match(scoreFlow, /event\.keyReleaseMs \?\? event\.releaseMs/);
  assert.match(scoreFlow, /const deadlineMs = anchor\.onsetMs \+ clusterWindow/);
  assert.match(scoreFlow, /!evaluation\?\.extraClusters\.length/);
  assert.match(scoreFlow, /evaluation\?\.complete \|\| pressedNotes\.length/);
  assert.match(scoreFlow, /const restartFromBeginning = currentIndex >= loop\.attacks\.length/);
  assert.match(scoreFlow, /MAX_LIVE_FEEDBACK_ATTACKS = 160[\s\S]*live alignment pauses/);
  assert.match(scoreFlow, /This piano release evaluates one MusicXML part at a time/);

  assert.match(scoreFlow, /function FocusLanding\(/);
  assert.match(scoreFlow, /One landing = one or more notes that begin together\./);
  assert.match(scoreFlow, /attack\.midiNotes\.length >= 3 \? "Chord shape" : attack\.midiNotes\.length === 2 \? "Vertical shape" : "Attack shape"/);
  assert.match(scoreFlow, /<span>Smallest correction<\/span>/);

  assert.match(scoreFlow, /function ReadingChunkFocus\(/);
  assert.match(scoreFlow, /Suggested chunk \{chunk\.ordinal \+ 1\}/);
  assert.match(scoreFlow, /"--rhythm-space": Math\.max\(1, Math\.min\(4,/);
  assert.match(scoreFlow, /aria-label="Choose one way to read this chunk"/);
  assert.match(scoreFlow, /\["landmark", "Landmark"\]/);
  assert.match(scoreFlow, /\["motion", "Motion"\]/);
  assert.match(scoreFlow, /\["vertical", "Vertical"\]/);
  assert.match(scoreFlow, /\["rhythm", "Rhythm"\]/);
  assert.match(scoreFlow, /recommendedLens === lens \? "suggested" : "view"/);
  assert.match(scoreFlow, /disabled=\{unavailableWhileVeiled\}/);

  assert.match(scoreFlow, /function CollectionFocus\(/);
  assert.match(scoreFlow, /analysis\.evidence === "thin"/);
  assert.match(scoreFlow, /Scale context hidden during this pass/);
  assert.match(scoreFlow, /Pitch collection is veiled\./);
  assert.match(scoreFlow, /note coverage—not confidence/);
  assert.match(scoreFlow, /const contextAttack = nextAttack \?\? loop\?\.attacks\.at\(-1\)/);
  assert.match(scoreFlow, /const localMeasureContext = imported\?\.measures\[currentMeasureIndex\]/);
  assert.match(scoreFlow, /keyFifths: localMeasureContext\?\.keyFifths \?\? null, keyMode: localMeasureContext\?\.keyMode \?\? null/);

  assert.match(scoreFlow, /evaluation\?\.progress\.nextExpectedIndex \?\? \(evaluation\?\.complete \? loop\?\.attacks\.length/);
  assert.match(scoreFlow, /if \(scoreVeiled\) return \[\]/);
  assert.match(scoreFlow, /\{veiled \? <article role="listitem"[\s\S]*: ordered\.map\(\(note, index\) => \{/);
  assert.match(scoreFlow, /matched && styles\.isMatched/);
  assert.match(scoreFlow, /Pitch and chord size locked/);
  assert.match(scoreFlow, /previousNotes=\{scoreVeiled \? \[\] : previousNotes\}/);

  assert.match(scoreFlow, /function ScoreJourney\(/);
  assert.match(scoreFlow, /✓ \{successCount\} right/);
  assert.match(scoreFlow, /× \{missCount\} repair/);
  assert.match(scoreFlow, /○ \{Math\.max\(0, loop\.attacks\.length - successCount - missCount\)\} waiting/);
  assert.match(scoreFlow, /aria-label=\{`\$\{successCount\} correct, \$\{missCount\} needing repair/);
  assert.match(scoreFlow, /aria-label="Select a reading chunk to practice"/);
  assert.match(scoreFlow, /aria-pressed=\{selected\}/);
  assert.match(scoreFlow, /aria-current=\{live \? "step" : undefined\}/);
  assert.match(scoreFlow, /const chunkPageSize = 40/);
  assert.match(scoreFlow, /aria-label="Reading chunk pages"/);
  assert.match(scoreFlow, /startAttackId: selectedChunk\?\.startAttackId/);
  assert.match(scoreFlow, /Surrounding notes will not be counted as misses/);
  assert.match(scoreFlow, /sheetTakeEvidenceFromEvaluation/);
  assert.match(scoreFlow, /appendBoundedSheetTakeHistory/);
  assert.match(scoreFlow, /const finishedAt = Date\.now\(\)/);
  assert.match(memory, /SHEET_PRACTICE_DIMENSIONS/);
  assert.match(memory, /summarizeSheetChunkMemory/);
  assert.doesNotMatch(memory, /\b(?:mastery|musicality|confidence|overallScore|blendedScore)\s*:/);

  assert.match(scoreFlow, /<details className=\{styles\.reviewEvidence\} open=\{captureState === "review"\}>/);
  assert.match(scoreFlow, /Right keys, note relationships, pulse, and release remain separate/);
  assert.match(scoreFlow, /eyebrow="Notes \+ chords"/);
  assert.match(scoreFlow, /eyebrow="Motion"/);
  assert.match(scoreFlow, /eyebrow="Time \+ journey"/);

  assert.match(scoreFlow, /<span>Staff focus<\/span><select value=\{practiceHand\}/);
  assert.match(scoreFlow, /<option value="both">Both staves<\/option>/);
  assert.match(scoreFlow, /<option value="right">Upper staff<\/option>/);
  assert.match(scoreFlow, /<option value="left">Lower staff<\/option>/);
  assert.match(piano, /<header className="piano-workspace-header">[\s\S]*<PianoFocusNavigation focusLens=\{focusLens\} onSelect=\{selectFocusLens\} \/>/);
  assert.doesNotMatch(piano, /compact-hud-view/, "the unified navigation replaces the focused-HUD-only duplicate select");
  assert.match(piano, /focusLens !== "echo-key" && focusLens !== "score-flow" && !isEarSearchFocus && focusLens !== "scale-quality" \? <RouteSelector/);

  assert.match(scoreFlow, /aria-label=\{`Measure \$\{measure\.number\}[\s\S]*\$\{state\}`\}/);
  assert.match(scoreFlow, /const navigatorStart = Math\.max\(0, loopStart - 6\)/);
  assert.match(scoreFlow, /const navigatorEnd = Math\.min\(score\.measures\.length - 1, loopEnd \+ 6\)/);
  assert.match(scoreFlow, /Latest upper link[\s\S]*Latest bass link/);
  assert.match(scoreFlow, /This is not a musicality or expression score/);
  assert.ok(scoreFlow.indexOf('divergence.kind === "extra-attack"') < scoreFlow.indexOf("divergence.signedSemitoneCorrection != null"), "extra attacks must keep their own repair instruction before adjacent chord evidence");
  assert.match(scoreFlow, /synchronized attack map rather than authoritative engraving/);
  assert.match(model, /Metrics stay separate:[\s\S]*no blended “musicality score”/);
  assert.doesNotMatch(model, /emotionScore|goodnessScore|musicalityScore|overallScore|blendedScore/);

  assert.match(scoreFlow, /if \(comparison\?\.status === "correct"\) return "✓ right landing"/);
  assert.match(scoreFlow, /if \(comparison\?\.status === "missed"\) return "− missed landing"/);
  assert.match(scoreFlow, /return "× wrong key set"/);
  assert.match(scoreFlowCss, /\.landingNote\.isMatched::after[^}]*content: "✓"/);
  assert.match(scoreFlowCss, /\.landingNote\.isMissing::after[^}]*content: "−"/);
  assert.match(scoreFlowCss, /\.landingNote\.isExtra::after[^}]*content: "\+"/);
  assert.match(scoreFlowCss, /\.chunkAttackPair[^}]*var\(--rhythm-space\)/);
  assert.match(scoreFlowCss, /\.readingLensSelectors button[^}]*min-height: 44px/);
  assert.match(scoreFlowCss, /\.chunkJourney > button[^}]*min-height: 44px/);
  assert.match(scoreFlowCss, /\.shell button,[\s\S]*\.shell label:has\(input\[type="file"\]\) \{ min-height: 44px; \}/);
  assert.match(scoreFlowCss, /\.practiceSetup > summary[^}]*min-height: 52px/);
  assert.match(scoreFlowCss, /\.reviewEvidence > summary[^}]*min-height: 48px/);
  assert.match(scoreFlow, /<div className=\{styles\.commandDeck\}>[\s\S]*<header className=\{styles\.scoreHeader\}>/,
    "desktop playing controls should share one compact command deck");
  assert.match(scoreFlow, /aria-controls="score-flow-source-drawer"[\s\S]*sourceDrawerOpen \? "Close source"/,
    "large source players need an explicit collapsible drawer");
  assert.match(scoreFlowCss, /@media \(min-width: 1181px\)[\s\S]*\.commandDeck \{[\s\S]*grid-template-areas:[\s\S]*"score source"[\s\S]*"setup session"/,
    "desktop score identity, source, setup, and input state should be arranged beside one another");
  assert.match(scoreFlowCss, /\.sourceBody:not\(\.isSourceBodyCollapsed\) \{[\s\S]*position: absolute;[\s\S]*max-height: min\(62dvh, 560px\);[\s\S]*overflow: auto;/,
    "source setup should overlay the playing surface without growing the page");
  assert.match(scoreFlowCss, /\.practiceDrawer \{[\s\S]*position: absolute;[\s\S]*max-height: min\(64dvh, 570px\);[\s\S]*overflow: auto;/,
    "practice setup should remain keyboard-reachable in a bounded desktop drawer");
  assert.match(scoreFlowCss, /\.shell button:focus-visible,/);
  assert.match(scoreFlowCss, /\.shell select:focus-visible,/);
  assert.match(scoreFlowCss, /\.shell summary:focus-visible,/);
  assert.match(scoreFlowCss, /\.shell label:has\(input\[type="file"\]:focus-visible\) \{ outline: 3px/);
  assert.match(scoreFlowCss, /@media \(prefers-reduced-motion: reduce\)/);
  assert.match(scoreFlowCss, /\.listeningLanding\[data-disclosure="memory"\] \.staffSlotVeil \{ opacity: 0; \}/, "reduced motion must show the brief note without an animated fade");
  assert.match(scoreFlowCss, /\.listeningLanding\[data-disclosure="memory"\] \.listeningNote \{ opacity: 1; \}/);
  assert.match(scoreFlowCss, /@media \(forced-colors: active\)/);
  assert.match(scoreFlowCss, /\.listeningTrebleLines,[\s\S]*\.listeningBassLines::after \{ border-color: CanvasText; \}/, "forced-color staff lines must use five real system-color borders rather than gradients or shadows");
  assert.match(scoreFlowCss, /\.staffSlotVeil \{[^}]*border: 2px dashed CanvasText;[^}]*background: transparent;/);
  assert.doesNotMatch(scoreFlowCss, /forced-color-adjust:\s*none/);
});

test("Sound Finder keeps slow hidden-target search untimed, bounded, and non-leaking", async () => {
  const [piano, finder, finderCss, globalCss, model, session, ratio] = await Promise.all([
    readFile(new URL("../app/PianoLab.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/PianoEarSearchHud.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/PianoEarSearchHud.module.css", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
    readFile(new URL("../lib/piano-ear-search-model.ts", import.meta.url), "utf8"),
    readFile(new URL("../lib/piano-session.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/RatioLab.tsx", import.meta.url), "utf8"),
  ]);

  assert.match(piano, /\{ id: "ear-search", label: "Sound Finder", description: "Untimed ear search", tier: "primary" \}/);
  assert.doesNotMatch(piano, /\{ id: "ear-search-hands", label:/, "the retired two-staff route must not appear in navigation metadata");
  assert.match(piano, /function normalizeFocusLens[\s\S]*lens === "ear-search-hands"\) return "ear-search"/);
  assert.match(piano, /linkedLens === "ear-search-hands"[\s\S]*canonicalUrl\.searchParams\.set\("pianoLens", "ear-search"\)/);
  assert.match(piano, /const FOCUS_LENSES[\s\S]*id: "immersion"[\s\S]*id: "ear-search"[\s\S]*id: "explore"[\s\S]*id: "interval-glow"[\s\S]*id: "sight-shapes"[\s\S]*id: "scales"/,
    "the six primary views need one stable, learner-facing order");
  assert.match(piano, /id: "explore"[^\n]*status: "todo"/);
  assert.match(piano, /id: "sight-shapes"[^\n]*status: "todo"/);
  assert.match(piano, /id: "scales"[^\n]*status: "todo"/);
  assert.match(piano, /const SECONDARY_FOCUS_GROUPS[\s\S]*label: "Practice"[\s\S]*label: "Develop & reflect"/);
  assert.match(piano, /<details className="piano-focus-more"[\s\S]*<summary><span>\{activeSecondary\?\.label \?\? "More views"\}<\/span>/);
  assert.match(piano, /open=\{moreOpen\} onToggle=\{\(event\) => setMoreOpen\(event\.currentTarget\.open\)\}/,
    "the native disclosure needs explicit state so its overlay can close after navigation");
  assert.match(piano, /onClick=\{\(\) => \{ setMoreOpen\(false\); onSelect\(lens\.id\); \}\}/,
    "choosing any view must dismiss the secondary overlay");
  assert.match(piano, /aria-current=\{focusLens === lens\.id \? "page" : undefined\}/);
  assert.match(piano, /function isEarSearchLens\(lens: FocusLens\)[\s\S]*lens === "ear-search" \|\| lens === "ear-search-hands"/);
  assert.match(piano, /const isEarSearchFocus = isEarSearchLens\(focusLens\)/);
  assert.match(piano, /\{isEarSearchFocus \? <PianoEarSearchHud[\s\S]*key=\{focusLens\}[\s\S]*mode=\{focusLens === "ear-search-hands" \? "two-hand" : "classic"\}/,
    "classic and two-staff Sound Finder need distinct keyed state boundaries");
  assert.match(piano, /focusLens === "score-flow" \|\| isEarSearchFocus[\s\S]*pushPhraseEvent\(phraseEventsRef\.current, event, 30 \* 60_000, 4096\)/);
  assert.match(piano, /const relationshipBlind = echoKeyBlind \|\| scoreFlowInput \|\| earSearchInput/);
  assert.match(piano, /className="piano-input-console" role="group" aria-label="MIDI input and Piano settings"/);
  assert.doesNotMatch(piano, /compact-hud-view/);
  assert.match(piano, /isEarSearchFocus \? "Names in exact reveal" : "Theory names"/);
  assert.match(session, /"ear-search"/);
  assert.match(session, /"ear-search-hands"/);
  assert.match(ratio, /"ear-search": "untimed sound finder"/);
  assert.match(ratio, /"ear-search-hands": "two-staff sound finder"/);

  assert.match(finder, /<section className=\{cx\(styles\.shell, twoHand && styles\.twoHandShell\)\} aria-labelledby="ear-search-title"/);
  assert.match(finder, /"Hear hidden phrase"/);
  assert.match(finder, /Wrong probes do not consume a slot or erase earlier progress/);
  assert.match(finder, /Timing is not graded/);
  assert.match(finder, /MIDI remains silent/);
  assert.match(finder, /No pitch, pending staff, or target key is shown/);
  assert.match(finder, /hintMode === "blind"/);
  assert.match(finder, /if \(hintMode === "blind"\) return `Probe \$\{probeOrdinal\} received/);
  assert.match(finder, /const primaryCue: PrimaryCue = hintMode === "blind" \? null/, "progress-only mode must not expose which target-relative cue would be primary");
  assert.match(finder, /hintMode === "blind" \? "Relationship feedback" : chordCountMismatch \? "Chord key count first"/, "progress-only mode must not reveal a chord key-count mismatch through the interval heading");
  assert.match(finder, /className=\{styles\.nextMove\}>Next move<\/em>/, "the prioritized cue needs a visible non-color label");
  assert.match(finder, /aria-current=\{primaryCue === "place" \? "step" : undefined\}/, "the prioritized cue needs semantic state as well as styling");
  assert.match(finder, /timelineLandings\.length \? timelineLandings\.map\(\(item\) =>/);
  assert.match(finder, /revealed \? <section className=\{styles\.revealDrawer\}/);
  assert.match(finder, /<RevealedMap[\s\S]*timelineLength=\{timelineTotal\}/, "the exact reveal must retain the canonical phrase width when a selected staff has rests");
  assert.match(finder, /\(slot - \.5\) \/ slotCount \* 100/, "revealed pitches must use canonical timeline slots instead of filtered landing order");
  assert.match(finder, /role="dialog" aria-modal="true"/);
  assert.match(finder, /role="region" tabIndex=\{0\} aria-label="Scrollable revealed phrase pitch map"/);
  assert.match(finder, /role="status" aria-live="polite" aria-atomic="true"/);
  assert.match(finder, /<small role="status" aria-live="polite">\{frozen \? "Capture is paused in the Piano input bar\. " : ""\}\{audioNotice\}<\/small>/);
  assert.doesNotMatch(finder, /midiConnected|midiStatus|onConnectMidi|MIDI not connected/, "Sound Finder must use the shared Piano input bar for device setup");
  assert.match(finder, /role="progressbar" aria-label="Hidden reference playback"/);
  assert.match(finder, /<option value="half-bar">/);
  assert.match(finder, /<option value="one-bar">/);
  assert.match(finder, /<option value="two-bars">/);
  assert.match(finder, /MAX_EAR_SEARCH_REFERENCE_VOICES = 256/);
  assert.match(finder, /cx\(styles\.memoryRail, styles\.memoryRailDense, twoHand && styles\.twoHandMemory\)/,
    "every Shared score clock must use the compact chip grid, even for short frames");
  assert.match(finder, /data-density="dense"/);
  assert.doesNotMatch(finder, /timelineTotal > 8/,
    "short frames must not switch back to text rows");
  assert.match(finder, /parseStoredScoreFlowSource/);
  assert.match(finder, /window\.sessionStorage\.setItem\(SCORE_FLOW_STORAGE_KEY/);
  assert.doesNotMatch(finder, /localStorage|fetch\(|XMLHttpRequest|navigator\.sendBeacon|new FormData/);

  assert.match(finder, /mode\?: "classic" \| "two-hand"/);
  assert.match(finder, /<option value="staff-anchors">One anchor per staff<\/option>/);
  assert.match(finder, /buildEarSearchChunks\(score, \{ hand: "both", span: timeSpan \}\)/,
    "phrase navigation must use one canonical both-staff score-time frame list");
  assert.doesNotMatch(finder, /buildEarSearchChunks\(score, \{ hand: practiceHand/,
    "staff changes must not regenerate different phrase boundaries");
  assert.match(finder, /selectEarSearchChunkLoop\(score, chunk, practiceHand\)/,
    "the selected staff must be projected inside the canonical phrase");
  assert.match(finder, /Same phrase timeline/);
  assert.doesNotMatch(finder, /setPracticeHand\(next\); setChunkIndex\(0\)/,
    "a staff-layer change must keep the current phrase index");
  const lengthHandlerStart = finder.indexOf("<select value={timeSpan}");
  const lengthHandlerEnd = finder.indexOf("<option", lengthHandlerStart);
  assert.ok(lengthHandlerStart >= 0 && lengthHandlerEnd > lengthHandlerStart);
  assert.doesNotMatch(finder.slice(lengthHandlerStart, lengthHandlerEnd), /setChunkIndex/,
    "changing the window length must keep the selected half-bar start index");
  assert.match(finder, /aria-label="Frame start"/,
    "a native start selector must expose the stable score addresses");
  assert.match(finder, /Start \{formatEarSearchFrameStart\(candidate\)\}/);
  assert.match(finder, /<span>Target notes<\/span>/,
    "the voice reduction changes matching as well as reference listening");
  assert.match(finder, /Only this layer is required/);
  assert.match(finder, /earSearchLandingsForChunk\(score, chunk, \{ hand: practiceHand, voice \}\)/);
  assert.match(finder, /advanceEarSearchTracker\(searchLandings, current, fresh/,
    "progression must match the selected reduction, not all canonical score notes");
  assert.match(finder, /buildEarSearchReferencePlan\(score, chunk, targetLandings/,
    "reference audio must retain the structural score-time frame rather than rebasing itself on attacks");
  assert.doesNotMatch(finder, /compactEarSearchReferencePlan/,
    "Sound Finder must not shorten authored holds or rest spans");
  assert.match(finder, /referencePlan\?\.restSpans/,
    "the HUD must expose silence from the selected score-time frame rather than discarding it");
  assert.match(finder, /This frame has no new attack in the \{practiceHand/,
    "an empty selected staff must remain on the same phrase instead of auto-advancing");
  assert.match(finder, /const handProgress = summarizeEarSearchHandProgress\(searchLandings, matched\)/);
  assert.match(finder, /className=\{styles\.handLane\} data-lane="upper"/);
  assert.match(finder, /className=\{styles\.handLane\} data-lane="lower"/);
  assert.match(finder, /Staff lanes come from the uploaded score\. MIDI reports keys, not which hand pressed them/);
  assert.match(finder, /Pitch remains hidden/);
  assert.match(finder, /const showStaff = twoHand \|\| caught/,
    "a classic Sound Finder chip may disclose authored staff only after that hidden attack is caught");
  assert.match(finder, /showStaff \? staffGlyph/,
    "caught staff color must be reinforced by a visible non-color glyph");
  const memoryChipStart = finder.indexOf("<ol ref={memoryListRef}");
  const memoryChipEnd = finder.indexOf("<div className={styles.memoryFooter}", memoryChipStart);
  assert.ok(memoryChipStart >= 0 && memoryChipEnd > memoryChipStart, "Sound Finder needs one inspectable attack-chip rail");
  const memoryChipContract = finder.slice(memoryChipStart, memoryChipEnd);
  assert.match(memoryChipContract, /<span className="sr-only">full frame · rest<\/span>/);
  assert.equal((memoryChipContract.match(/<span className="sr-only">/g) ?? []).length, 3,
    "attack, selected-staff rest, and full-frame rest labels must all stay visually compact");
  assert.match(memoryChipContract, /<button type="button" className=\{styles\.memoryChipButton\}/,
    "each sounding attack chip must be a native, keyboard-reachable button");
  assert.match(memoryChipContract, /disabled=\{visiblePhase === "playing"\}/,
    "single-attack ear hints are optional at any time except during full reference playback");
  assert.doesNotMatch(memoryChipContract, /!hasHeard|Hear the whole frame first/,
    "ear hints must not force a whole-frame listen");
  assert.match(memoryChipContract, /onClick=\{\(\) => void playAttackHint\(item\.landing!, item\.timelineIndex\)\}/);
  assert.match(memoryChipContract, /Play hidden attack/,
    "pending chip names must describe the ear-hint action without naming the pitch");
  assert.doesNotMatch(memoryChipContract, /midiLabel|NOTE_NAMES|\.notes\.map/,
    "the hidden attack rail must not leak exact pitch through visible or accessible chip copy");
  assert.match(finder, /const playAttackHint = useCallback\(async \(landing: EarSearchLanding, timelineIndex: number\) => \{/);
  assert.match(finder, /ATTACK_HINT_DURATION_SECONDS = \.72/);
  assert.match(finder, /configureSafetyCompressor\(compressor, now\)/);
  assert.match(finder, /\.72 \/ Math\.sqrt\(Math\.max\(1, landing\.notes\.length\)\)/,
    "polyphonic ear hints need the same bounded loudness normalization as the phrase reference");
  assert.match(finder, /Ear hint:[^`]*Search progress did not change/,
    "audition feedback must make its progress-neutral behavior explicit");
  const hintStart = finder.indexOf("const playAttackHint = useCallback");
  const hintEnd = finder.indexOf("const memoryTargetIndex", hintStart);
  assert.ok(hintStart >= 0 && hintEnd > hintStart, "the chip-audition callback needs an inspectable lifecycle boundary");
  const hintContract = finder.slice(hintStart, hintEnd);
  assert.doesNotMatch(hintContract, /setTracker\(|advanceEarSearchTracker\(/,
    "hearing a chip must never award credit or mutate the untimed search tracker");

  assert.match(finder, /const latest = tracker\?\.recentProbes\.at\(-1\)/,
    "future echoes must derive from finalized probe clusters rather than raw held keys");
  assert.match(finder, /tracker\.acceptedProbeIds\.includes\(latest\.id\)[\s\S]*setFutureEchoes\(\[\]\)[\s\S]*return/,
    "a correctly accepted probe must not also illuminate repeated future occurrences");
  assert.match(finder, /const echoNotes = earSearchFutureProbeNotes\(tracker, eventsRef\.current, gathersTexture \? clusterWindow : 40\)/,
    "future chord fractions need a physical attack burst independent from the current target's key count");
  assert.match(finder, /earSearchFutureEchoes\(searchLandings, tracker\.matchedLandings, echoNotes\)/);
  assert.match(finder, /FUTURE_ECHO_MS = 850/);
  assert.match(memoryChipContract, /data-future-echo=\{futureEcho \? "true" : undefined\}/);
  assert.match(memoryChipContract, /futureEcho\.matchedNoteCount[^\n]*futureEcho\.targetNoteCount/,
    "a future chord echo must expose a visible matched-over-total fraction rather than a binary chord claim");
  assert.match(finder, /futureEchoAnnouncement/);
  assert.match(finder, /Only explicit frame and chip ear-hint controls create sound/,
    "the footer must describe both intentional audio paths without implying that MIDI is synthesized");
  assert.match(piano, /saved\.version === 27/);
  assert.match(piano, /const session: PersistedPianoSession = \{ version: 27,/);

  assert.match(model, /EAR_SEARCH_MAX_LANDINGS = 32/);
  assert.match(model, /EarSearchTimeSpan = "half-bar" \| "one-bar" \| "two-bars"/);
  assert.match(model, /EarSearchVoice = "upper" \| "bass" \| "staff-anchors" \| "full"/);
  assert.match(model, /EarSearchStaff = "upper" \| "lower" \| "both" \| "unknown"/);
  assert.match(model, /const selectedStaves = new Set\(attack\.notes[\s\S]*selectedPitches\.has\(note\.pitch\.midi\)/,
    "staff identity must follow selected authored score staffs rather than pitch height or inferred hands");
  assert.match(finder, /earSearchPlaybackLandingAt\(playbackCues, elapsed\)/,
    "playback staff cues must become neutral during silence rather than holding the preceding lane");
  assert.doesNotMatch(finder, /right-hand lane|left-hand lane|hands together/,
    "score-staff provenance must not be presented as observed physical hand identity");
  assert.match(model, /export function summarizeEarSearchHandProgress/);
  assert.match(model, /staff === "upper" \|\| staff === "both"/);
  assert.match(model, /staff === "lower" \|\| staff === "both"/);
  assert.match(model, /sourceStartMeasureIndex/);
  assert.match(model, /frameStartBeat/);
  assert.match(model, /frameEndBeat/);
  assert.match(model, /kind: "attack" \| "carry"/,
    "notes already sounding at a frame boundary need explicit carry semantics without becoming attacks");
  assert.match(model, /restSpans: EarSearchRestSpan\[\]/,
    "leading, interior, and trailing silence must remain first-class score-time data");
  assert.match(model, /export function buildEarSearchReferencePlan/);
  assert.match(model, /export function earSearchFutureEchoes/);
  assert.match(model, /export function earSearchFutureProbeNotes/);
  assert.match(model, /const futureStart = Math\.min\(target\.length, Math\.max\(0, matchedLandings\)\) \+ 1/,
    "the current required landing must remain evaluation feedback, not a future-chip echo");
  assert.match(model, /coverage: matchedNoteCount \/ landing\.notes\.length/,
    "future chord glow strength must be proportional to exact target-note coverage");
  assert.match(model, /selectEarSearchChunkLoop/);
  assert.match(model, /span === "half-bar"/);
  assert.match(model, /Non-matching probes are ignored rather than accumulated as errors/);
  assert.match(model, /intervalDirection/);
  assert.match(model, /intervalWidth/);
  assert.doesNotMatch(model, /goodnessScore|musicalityScore|overallScore/);
  assert.match(finderCss, /min-height: 44px/);
  assert.match(finderCss, /\.memoryRailDense ol/);
  assert.match(finderCss, /\.revealPlotViewport/);
  assert.match(finderCss, /\.twoHandShell/);
  assert.match(finderCss, /\.handCue/);
  assert.match(finderCss, /\.handLane\[data-lane="upper"\]/);
  assert.match(finderCss, /\.handLane\[data-lane="lower"\]/);
  assert.match(finderCss, /\.memoryRail li\.isCaught\[data-staff="upper"\]/);
  assert.match(finderCss, /\.memoryRail li\.isCaught\[data-staff="lower"\]/);
  assert.match(finderCss, /\.memoryRail li\.isCaught\[data-staff="both"\]/);
  assert.match(finderCss, /\.memoryRail \.memoryChipButton/);
  assert.match(finderCss, /\.memoryRail li\[data-future-echo="true"\] i::after[\s\S]*opacity: var\(--future-strength\)/,
    "future chord brightness must preserve fractional note coverage");
  assert.match(finderCss, /\.memoryRail li\[data-auditioning="true"\] i/);
  assert.match(finderCss, /\.footerDeck input\[type="range"\][\s\S]*min-height: 44px/);
  assert.match(finderCss, /@media \(max-width: 1120px\) \{[\s\S]*\.transport \{ grid-column: 1 \/ -1;/, "the command transport must wrap before a 1024px desktop clips it");
  assert.match(finderCss, /@media \(prefers-reduced-motion: reduce\)/);
  assert.match(finderCss, /@media \(forced-colors: active\)/);
  assert.match(finderCss, /@media \(forced-colors: active\)[\s\S]*\.memoryRail li\[data-future-echo="true"\] i/,
    "future echoes need a system-color outline when glow and color are unavailable");
  assert.match(globalCss, /\.piano-hud\.is-ear-search \{[\s\S]*overflow: visible;[\s\S]*border: 0;[\s\S]*background: transparent;/);
  assert.match(globalCss, /\.piano-workspace-header \{[\s\S]*min-height: 82px;/);
  assert.match(globalCss, /\.piano-input-console \.midi-status strong,[\s\S]*white-space: nowrap;/);
  assert.doesNotMatch(piano, /up to 4, 6, or 8 landings/);
});

test("Score Flow follows raw MIDI in study and capture while keeping review frozen", async () => {
  const [piano, scoreFlow] = await Promise.all([
    readFile(new URL("../app/PianoLab.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/PianoScoreFlowHud.tsx", import.meta.url), "utf8"),
  ]);

  const takeEventsStart = scoreFlow.indexOf("const takeEvents = useMemo");
  const takeEventsEnd = scoreFlow.indexOf("const scoreVeiled", takeEventsStart);
  assert.ok(takeEventsStart >= 0 && takeEventsEnd > takeEventsStart, "Score Flow needs one inspectable live/review event boundary");
  const takeEventsContract = scoreFlow.slice(takeEventsStart, takeEventsEnd);
  assert.match(takeEventsContract, /captureState\s*===\s*["']review["'][\s\S]*reviewTakeEvents/, "review must read its frozen event copy");
  assert.match(takeEventsContract, /liveTakeEvents/, "study and armed modes must continue following post-boundary live events");
  assert.doesNotMatch(takeEventsContract, /:\s*\[\]\s*,?\s*\[/, "idle study must not silently replace fresh MIDI with an empty take");

  assert.match(scoreFlow, /function capturedScoreEvents[\s\S]*\.filter\(\(event\) => event\.id > afterId && event\.onsetMs >= earliestOnsetMs && event\.onsetMs <= latestOnsetMs\)/, "only events strictly after the current attempt boundary and inside the audible session may enter the live view");
  assert.match(scoreFlow, /function\s+LiveAttackEcho\s*\(/, "raw key receipt needs a dedicated view independent of formal diagnosis");
  const echoStart = scoreFlow.indexOf("function LiveAttackEcho");
  const echoEnd = scoreFlow.indexOf("function ", echoStart + "function LiveAttackEcho".length);
  const echoContract = scoreFlow.slice(echoStart, echoEnd > echoStart ? echoEnd : scoreFlow.length);
  for (const state of ["received", "gathering", "aligned", "repair"]) {
    assert.match(echoContract, new RegExp(`\\b${state}\\b`, "i"), `LiveAttackEcho needs a visible ${state} label, not color alone`);
  }
  assert.match(echoContract, /role=["']status["']/, "raw attack receipt needs status semantics");
  assert.match(echoContract, /aria-live=["']polite["']/, "raw attack receipt must be announced without moving focus");
  assert.match(echoContract, /veil/i, "LiveAttackEcho must explicitly handle concealed-score practice");
  assert.match(echoContract, /veil(?:ed)?\s*\?[\s\S]{0,320}(?:anonymous|identity\s+(?:is\s+)?hidden|pitch(?:es)?\s+(?:is\s+|are\s+)?hidden|key attack)/i, "the veiled branch must acknowledge input without exposing pitch identity");

  const echoUseStart = scoreFlow.indexOf("<LiveAttackEcho");
  const echoUseEnd = scoreFlow.indexOf("/>", echoUseStart);
  assert.ok(echoUseStart >= 0 && echoUseEnd > echoUseStart, "the raw attack echo must be mounted in the Score Flow HUD");
  const echoUseContract = scoreFlow.slice(echoUseStart, echoUseEnd + 2);
  assert.match(echoUseContract, /liveTakeEvents|liveAttack|received/i, "the receipt view must consume raw post-boundary input rather than review-only evaluation");

  const controlsStart = piano.indexOf('<div className="piano-input-console"');
  const controlsEnd = piano.indexOf('</header>', controlsStart);
  assert.ok(controlsStart >= 0 && controlsEnd > controlsStart, "the shared HUD needs a central controls region");
  const midiControls = piano.slice(controlsStart, controlsEnd);
  assert.match(midiControls, /role=["']status["']/, "MIDI connection state must be exposed centrally");
  assert.match(midiControls, /onClick=\{midi\.connect\}/, "the central HUD must offer MIDI permission/connection");
  assert.match(midiControls, /Retry MIDI[\s\S]*Connect MIDI|Connect MIDI[\s\S]*Retry MIDI/, "the same central affordance must support first connection and retry");
  assert.match(midiControls, /Resume capture[\s\S]*Pause capture|Pause capture[\s\S]*Resume capture/, "capture state must be controlled from the shared input bar");
  assert.equal((piano.match(/onClick=\{midi\.connect\}/g) ?? []).length, 1, "device connection needs exactly one owner");
  assert.match(piano, /const finalizeActiveNotes = useCallback\(\(\) => \{[\s\S]*callbacksRef\.current\.onSustain\(false,[\s\S]*callbacksRef\.current\.onRelease\([\s\S]*clear\(\);/,
    "switching or losing a MIDI input must close captured pedal and key durations before clearing visual state");
  assert.match(piano, /if \(inputId !== selectedInputIdRef\.current\) finalizeActiveNotes\(\)/,
    "manual MIDI input changes must use the same duration-finalization boundary as hot unplug");
  assert.doesNotMatch(scoreFlow, /onConnectMidi|midiStatus|Connect \/ retry MIDI/, "Score Flow must not duplicate device setup");
});

test("EchoKey preserves an ear-first boundary while keeping every later representation explicit", async () => {
  const [piano, echo, echoCss, model, session] = await Promise.all([
    readFile(new URL("../app/PianoLab.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/PianoEchoKeyHud.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/PianoEchoKeyHud.module.css", import.meta.url), "utf8"),
    readFile(new URL("../lib/echo-key-model.ts", import.meta.url), "utf8"),
    readFile(new URL("../lib/piano-session.ts", import.meta.url), "utf8"),
  ]);

  assert.match(piano, /focusLens === "echo-key" \? <PianoEchoKeyHud/);
  assert.match(piano, /Silent MIDI maps each attack/);
  assert.match(echo, /MIDI tells us which keys arrived—not why/);
  assert.match(piano, /physical position \$\{echoKeyPosition\} of \$\{VISIBLE_NOTES\.length\} from the left/);
  assert.match(piano, /EchoKey reveals relationship labels in its Read step/);
  assert.match(piano, /VISIBLE_NOTES\.map\(\(note\) => renderKey\(note, !WHITE_PITCH_CLASSES\.has/);
  assert.match(piano, /relationshipBlind \? strikeEchoScreenKey\(note\) : toggleScreenKey\(note\)/);
  assert.match(piano, /isPersistedHudEventList\(saved\.phraseEvents\)/);
  assert.match(piano, /sessionStorage\.removeItem\(ECHO_KEY_LESSON_STORAGE_KEY\)/);
  assert.match(session, /"echo-key"/);
  assert.match(echo, /type EchoPhase = "hear" \| "sing" \| "find" \| "diagnose" \| "repair" \| "read" \| "vary"/);
  assert.match(echo, /phase === "read" \? <section[\s\S]*?<CompactStaff/);
  assert.match(echo, /<CompactStaff spellings=\{scoreSpellings\} beats=\{phrase\.beats\}/);
  assert.match(echo, /<ReadKeyboard notes=\{scoreNotes\} spellings=\{scoreSpellings\}/);
  assert.match(echo, /relationalReveal \? ` · \$\{candidate\.subtitle\}` : ""/);
  assert.match(echo, /Math\.sign\(value - offsets\[index - 1\]\)/);
  assert.match(echo, /Direction only: every rise and fall has equal visual height/);
  assert.match(echo, /event\.id > attemptBoundaryId/);
  assert.match(echo, /attempt begins after event \{attemptBoundaryId\}/);
  assert.match(echo, /restoredFind \? newestEventId\(events\) : persisted\.attemptBoundaryId/);
  assert.match(echo, /captureNeedsRelease/);
  assert.match(echo, /Release every sounding key/);
  assert.match(echo, /echoKeyCaptureIssue\(latestEvents, phrase\.offsets\.length\)/);
  assert.match(echo, /More than one attack arrived together/);
  assert.match(echo, /More attacks arrived than this phrase contains/);
  assert.match(model, /export function echoKeyCaptureIssue/);
  assert.match(echo, /displayedAccidentalsForMeasure/);
  assert.match(echo, /configureSafetyCompressor\(compressor, now\)/);
  assert.match(echo, /master\.gain\.setValueAtTime\(SYNTH_MASTER_GAIN, now\)/);
  assert.match(echo, /no microphone is opened, recorded, or scored/i);
  assert.match(echo, /window\.sessionStorage/);
  assert.match(echo, /History veiled during blind recall/);
  assert.match(echo, /Clear this tab’s history/);
  assert.match(echo, /role="status" aria-live="polite" aria-atomic="true"/);
  assert.match(echo, /phasePanelRef\.current\?\.focus\(\)/);
  assert.doesNotMatch(echo, /<main className=\{styles\.workbench\}/);
  assert.doesNotMatch(echo, /localStorage/);
  assert.doesNotMatch(model, /emotionScore|goodnessScore|musicalityScore|overallScore/);
  assert.match(echoCss, /min-height: 44px/);
  assert.match(echoCss, /@media \(prefers-reduced-motion: reduce\)/);
  assert.match(echoCss, /@media \(forced-colors: active\)/);
  assert.match(echoCss, /\.openNotehead/);
  assert.match(echoCss, /\.readKeyboardKeys/);
});

test("immersive piano HUDs plus vocal pitch match keep visual channels named, bounded, and non-color-only", async () => {
  const [piano, immersion, intervalGlow, research, gravity, scaleQuality, scaleQualityCss, voiceLab, vocal, model, researchModel, gravityModel, vocalModel, vocalSpectrumModel, vocalTrainingModel, css] = await Promise.all([
    readFile(new URL("../app/PianoLab.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/PianoImmersion.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/PianoIntervalGlowHud.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/PianoResearchHud.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/PianoScaleGravityHud.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/PianoScaleQualityHud.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/PianoScaleQualityHud.module.css", import.meta.url), "utf8"),
    readFile(new URL("../app/VoiceLab.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/VocalPitchCoach.tsx", import.meta.url), "utf8"),
    readFile(new URL("../lib/piano-immersion-model.ts", import.meta.url), "utf8"),
    readFile(new URL("../lib/piano-research-model.ts", import.meta.url), "utf8"),
    readFile(new URL("../lib/piano-scale-gravity-model.ts", import.meta.url), "utf8"),
    readFile(new URL("../lib/vocal-pitch-model.ts", import.meta.url), "utf8"),
    readFile(new URL("../lib/vocal-spectrum-model.ts", import.meta.url), "utf8"),
    readFile(new URL("../lib/vocal-training-model.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
  ]);
  assert.match(piano, /focusLens === "immersion" \? <PianoImmersion/);
  assert.match(piano, /focusLens === "interval-glow" \? <PianoIntervalGlowHud/);
  assert.match(piano, /focusLens === "research" \? <PianoResearchHud/);
  assert.match(piano, /focusLens === "gravity" \? <PianoScaleGravityHud/);
  assert.match(piano, /focusLens === "scale-quality" \? <PianoScaleQualityHud/);
  assert.match(piano, /events=\{immersionHistoryEvents\}/);
  assert.match(piano, /const isShortHudFocus = isAbsolutePitchFocus \|\| focusLens === "echo-key" \|\| focusLens === "score-flow" \|\| isEarSearchFocus \|\| focusLens === "immersion" \|\| focusLens === "scale-quality" \|\| focusLens === "interval-glow" \|\| focusLens === "sight-shapes" \|\| focusLens === "research" \|\| focusLens === "gravity"/);
  assert.match(intervalGlow, /aria-labelledby="piano-interval-glow-title"/);
  assert.match(intervalGlow, /role="img" aria-labelledby="interval-glow-svg-title interval-glow-svg-desc"/);
  assert.match(intervalGlow, /octave layers shrink inward/);
  assert.match(intervalGlow, /traveling arc/);
  assert.match(intervalGlow, /woven bloom/);
  assert.match(intervalGlow, /From low to high:/);
  assert.match(intervalGlow, /Pair textures:/);
  assert.match(intervalGlow, /one spacing · two lives/i);
  assert.match(intervalGlow, /htmlFor="interval-glow-sound-model"/);
  assert.match(intervalGlow, /Changes the modeled bloom—not your MIDI or audio/);
  assert.match(intervalGlow, /MIDI key number, attack direction, onset gap, and grouping time/);
  assert.match(intervalGlow, /not measured[\s\S]*emotion, consonance, or musical quality/i);
  assert.match(intervalGlow, /intervalClass\(latestInterval\.ringSemitones\)/);
  assert.match(intervalGlow, /transition\.sameGroup \? "is-together" : "is-sequential"/);
  assert.match(intervalGlow, /markerEnd=\{transition\.sameGroup \? undefined : "url\(#interval-gesture-arrow\)"\}/);
  assert.match(piano, /soundModelId=\{soundModelId\}[\s\S]*showConventions=\{showConventions\}/);
  assert.match(css, /\.interval-glow-node\.is-lit[\s\S]*var\(--interval-color\)/);
  assert.match(css, /\.interval-glow-pair[\s\S]*fill: var\(--interval-color\)/);
  assert.match(css, /\.interval-together-contour[\s\S]*stroke: rgba/);
  assert.match(css, /\.is-together > \.interval-thread-link[\s\S]*stroke-dasharray/);
  assert.match(css, /@keyframes interval-gesture-draw/);
  assert.match(css, /@media \(max-width: 620px\)[\s\S]*\.interval-glow-readings article/);
  assert.match(css, /@media \(forced-colors: active\)[\s\S]*\.piano-interval-glow/);
  assert.match(piano, /pulseMirror=\{pulseMirrorModel\}/);
  assert.match(piano, /<details className="piano-immersion-keyboard">/);
  assert.doesNotMatch(piano, /VocalPitchCoach/);
  assert.match(piano, /Your instrument or DAW supplies the sound/);
  assert.match(voiceLab, /<VocalPitchCoach/);
  assert.match(voiceLab, /anchorSource="voice-lab-reference"/);
  assert.match(voiceLab, /id="voice-anchor-key"/);
  assert.match(voiceLab, /Local microphone analysis estimates one sustained pitch and its spectrum/);
  assert.match(voiceLab, /className="voice-workspace-header"/);
  assert.match(voiceLab, /className="voice-focus-navigation"/);
  assert.match(voiceLab, /href="#voice-match"/);
  assert.match(voiceLab, /href="#voice-ear-map"/);
  assert.match(voiceLab, /href="#voice-spectrum"/);
  assert.match(piano, /<RouteSelector scale=\{scale\}/);
  assert.match(piano, /doCaptureArmed=\{doCaptureArmed\}/);
  assert.match(piano, /onToggleDoCapture=\{toggleDoCapture\}/);
  assert.match(piano, /frameLearningActive=\{frameMode === "discover" && frameLearningAnchorId != null\}/);
  assert.match(piano, /frameLearningDistinctPitchClasses=\{frameLearningDistinctPitchClasses\}/);
  assert.match(piano, /onResetFrameFromPlaying=\{resetFrameFromPlaying\}/);
  assert.match(piano, /const resetFrameFromPlaying = \(\) =>/);
  assert.match(piano, /frameLearningAnchorIdRef\.current = anchorId/);
  assert.match(piano, /phraseEvents\.filter\(\(event\) => event\.id > frameLearningAnchorId\)/);
  assert.match(piano, /url\.searchParams\.delete\("pianoDo"\)/);
  assert.match(piano, /url\.searchParams\.delete\("pianoScale"\)/);
  assert.match(piano, /id="piano-route-choice"/);
  assert.match(piano, /Set Do from next note/);
  assert.match(piano, /Cancel · waiting for Do/);
  assert.match(piano, /Play one new MIDI or on-screen attack/);
  assert.match(piano, /Available in every Piano focus/);
  assert.match(piano, /function RouteSelector\(\{ scale, doMidi, frameMode, showConventions, doCaptureArmed/);
  assert.match(piano, /const captureArmedDoAttack = useCallback/);
  assert.match(piano, /captureArmedDoAttack\(note\);[\s\S]*addEvent\(note, velocity/);
  assert.match(piano, /captureArmedDoAttack\(note\);[\s\S]*addEvent\(note, 104/);
  assert.match(piano, /url\.searchParams\.set\("pianoDo", String\(pitchClass\)\)/);
  assert.match(piano, /How to select a route/);
  assert.match(piano, /Play while discovering/);
  assert.match(piano, /Adopt a candidate/);
  assert.match(piano, /The fifths compass changes Do while retaining the selected route/);
  assert.match(piano, /const selectScaleRoute/);
  assert.doesNotMatch(piano, /immersionChordGestures\.slice\(-5\)/);
  assert.match(piano, /const immersionHistoryEvents = useMemo\(\(\) => skipHiddenAnalysis \? \[\] : immersionHistory\(phraseEvents\)/);
  assert.match(piano, /groupChordGestures\(immersionHistoryEvents[\s\S]*measureChordGestures\(immersionChordGestures[\s\S]*IMMERSION_MAX_FIELD_NOTES\)\.slice\(-4\)/);
  assert.match(piano, /phraseEvents=\{immersionHistoryEvents\}/);
  assert.match(piano, /\$\{immersionHistoryEvents\.length\}\/\$\{IMMERSION_HISTORY_ATTACKS\} attacks/);
  assert.match(piano, /if \(!isShortHudFocus\)[\s\S]*window\.setInterval\(\(\) => setNowMs\(currentHudTime\(\)\), 120\)/);
  assert.match(piano, /window\.setTimeout\(\(\) => setNowMs\(currentHudTime\(\)\), remainingMs\)/);
  assert.match(immersion, /<section className="piano-immersion" aria-labelledby="piano-immersion-title">/);
  assert.match(immersion, /role="img" aria-labelledby="piano-immersion-svg-title piano-immersion-svg-description"/);
  assert.match(immersion, /<desc id="piano-immersion-svg-description">\{visualSummary\}<\/desc>/);
  assert.match(immersion, /role="status" aria-live="polite" aria-atomic="true"/);
  assert.match(immersion, /window\.setTimeout\(\(\) => setAnnouncedSummary\(liveSummary\), 280\)/);
  assert.match(immersion, /className="piano-immersion-edge-hud"/);
  assert.match(immersion, /className="piano-immersion-lens is-scale"/);
  assert.match(immersion, /className="piano-immersion-scale-grid" role="img" aria-label=\{scaleLensSummary\}/);
  assert.match(immersion, /Array\.from\(\{ length: 12 \}/);
  assert.match(immersion, /each cell = 1 semitone/);
  assert.match(immersion, /Filled cell = selected route degree · dot = recent five-attack position · double dot = latest · outline = sounding/);
  assert.match(immersion, /This is the chosen scale coordinate, not a detected key/);
  assert.match(immersion, /aria-label="Quick scale-frame controls"/);
  assert.match(immersion, /Reset Do · next note/);
  assert.match(immersion, /Reset frame · play scale/);
  assert.match(immersion, /role="status" aria-live="polite"/);
  assert.match(immersion, /the next new MIDI or on-screen note becomes Do/);
  assert.match(immersion, /distinct notes since reset/);
  assert.match(immersion, /className="piano-immersion-lens is-rhythm" aria-labelledby=/);
  assert.match(immersion, /className="piano-immersion-lens is-harmony" aria-labelledby=/);
  assert.match(immersion, /className="piano-immersion-lens is-melody" aria-labelledby=/);
  assert.match(immersion, /piano-immersion-latest-transition[\s\S]*role="group" aria-label=\{latestTransitionSummary\}/);
  assert.match(immersion, /className="piano-immersion-interval-context-bar" aria-labelledby=/);
  assert.match(immersion, /Latest sequential key interval/);
  assert.match(immersion, /exact attack-to-attack MIDI-key differences/);
  assert.match(immersion, /exact chronological attack spacing, not an isolated melody interval/);
  assert.match(immersion, /not whole-field voice leading/);
  assert.match(immersion, /simultaneous roughness withheld/);
  assert.match(immersion, /Prompts, not a prediction of emotion, consonance, preference, or meaning/);
  assert.match(immersion, /viewBox="0 0 112 112" role="img" aria-label=\{ringSummary\}/);
  assert.match(immersion, /Local onset ruler · not a beat/);
  assert.match(immersion, /Grid distance is descriptive—not timing accuracy, groove quality, or inferred meter/);
  assert.match(immersion, /aria-label="Declared meter and metronome controls"/);
  assert.match(immersion, /Lock meter now/);
  assert.match(immersion, /Unlock meter/);
  assert.match(immersion, /Start metronome/);
  assert.match(immersion, /className=\{`piano-immersion-rhythm-track/);
  assert.match(immersion, /Lock captures the downbeat you supplied/);
  assert.match(immersion, /Change cues · no resolution verdict/);
  assert.match(immersion, /listener only · unreported/);
  assert.match(immersion, /Scale frames this five-note span may fit/);
  assert.match(immersion, /compatible pitch containers, not proof of key, origin, harmony, or intention/);
  assert.match(immersion, />Current chord</);
  assert.match(immersion, /Exact catalog name/);
  assert.match(immersion, /Exact catalog name · inversion/);
  assert.match(immersion, /function chordInversionLabel/);
  assert.match(immersion, /first inversion/);
  assert.match(immersion, /is the bass over/);
  assert.match(immersion, /is both root and bass · root position/);
  assert.match(immersion, /function ChordFingeringGraphic/);
  assert.match(immersion, /Suggested \{handLabel\} hand/);
  assert.match(immersion, /voicing center below middle C/);
  assert.match(immersion, /voicing center at or above middle C/);
  assert.match(immersion, /1 thumb · 5 pinky/);
  assert.match(immersion, /One common \$\{handLabel\}-hand fingering for/);
  assert.match(immersion, /center below middle C suggests left hand/);
  assert.match(immersion, /center at or above it suggests right/);
  assert.match(immersion, /Hand size, black keys, crossing, accompaniment, and the next chord may favor another choice/);
  assert.match(immersion, /function ScaleFingeringCue/);
  assert.match(immersion, /Suggested \{handLabel\} hand · ascending/);
  assert.match(immersion, /role="img"[\s\S]*Suggested \$\{handLabel\}-hand ascending octave fingering/);
  assert.match(immersion, /octave centered below middle C/);
  assert.match(immersion, /octave centered at or above middle C/);
  assert.match(immersion, /thumb under after route degree/);
  assert.match(immersion, /black-key layout, direction, hand size, and the surrounding passage can favor another fingering/);
  assert.match(immersion, /melody and accompaniment are not isolated/);
  assert.match(immersion, /planImmersionAnnotations\(annotationInputs, 1/);
  assert.match(immersion, /<select id="immersion-sound-model"/);
  assert.match(immersion, /dash density shows 12-TET mismatch to the named reference/);
  assert.match(immersion, /long dash = incomplete catalog fit · dotted overtrace = rolled timing/);
  assert.match(immersion, /broken wake needs release-proven silence/);
  assert.match(immersion, /These channels are never collapsed into correctness, emotion, preference, or musical goodness/);
  assert.match(immersion, /latest attack-time snapshot/);
  assert.match(immersion, /<details className="piano-immersion-guide">/);
  assert.match(immersion, /preserveAspectRatio="xMidYMid slice"/);
  assert.match(immersion, /Pitch bend, keyboard or DAW tuning, acoustic pitch, audio spectrum, and acoustic loudness are not captured/);
  assert.match(immersion, /modeled crunch pauses above/);
  assert.match(immersion, /Semitone horizon\. Octave-folded field pair counts/);
  assert.match(immersion, /selected-Do pull heuristic/);
  assert.match(immersion, /contextual, not a physical force or felt-resolution prediction/);
  assert.match(immersion, /aria-label="Persistent circle-of-fifths visual key"/);
  assert.match(immersion, /One fifths crown/);
  assert.match(immersion, /no attack-density bars/);
  assert.match(immersion, /Attack circle/);
  assert.doesNotMatch(immersion, /feGaussianBlur|<filter /);
  assert.doesNotMatch(immersion, /tabIndex=\{?[1-9]/);
  assert.match(research, /<section className="piano-research-hud" aria-labelledby="piano-research-title">/);
  assert.match(research, /aria-label="Research HUD note arrangement"/);
  assert.match(research, /aria-pressed=\{layout === option\.id\}/);
  assert.match(research, /id="piano-research-generator"/);
  assert.match(research, /role="img" aria-labelledby="piano-research-clock-title piano-research-clock-description"/);
  assert.match(research, /<desc id="piano-research-clock-description">\{clockSummary\}<\/desc>/);
  assert.match(research, /one neighboring position is one semitone/);
  assert.match(research, /Do = \{doLabel\}/);
  assert.match(research, /const anchorNote = doMidi;/);
  assert.doesNotMatch(research, /const anchorNote = latest\?\.note \?\? doMidi/);
  assert.match(research, /Loop length = 12 ÷ gcd\(12, \{generator\.step\}\)/);
  assert.match(research, /className="piano-research-lattice" role="list"/);
  assert.match(research, /className=\{classes\} role="listitem"/);
  assert.match(research, /→ \+3 st · minor third/);
  assert.match(research, /↓ \+4 st · major third/);
  assert.match(research, /↘ \+7 st · perfect fifth/);
  assert.match(research, /major-triad pitch-class shape uses the anchor, one step down \(\+4\), and one step down-right \(\+7\)/);
  assert.match(research, /minor-triad shape uses the anchor, one step right \(\+3\)/);
  assert.match(research, /<div className="piano-research-matrix-layout">/);
  assert.doesNotMatch(research, /className="piano-research-matrix-layout" role="img"/);
  assert.match(research, /<table className="piano-research-matrix" aria-describedby="piano-research-matrix-reading">/);
  assert.match(research, /Latest sequential movement/);
  assert.match(research, /exact attack-to-attack MIDI-key distance/);
  assert.match(research, /fifth steps, not generic note affinity, consonance, harmonic function, resolution, emotion, or quality/);
  assert.match(research, /pure 3:2 fifths do not close exactly after twelve steps/);
  assert.match(research, /do not measure acoustic pitch, piano tuning, overtones, loudness, or listening experience/);
  assert.doesNotMatch(research, /tabIndex=\{?[1-9]/);
  assert.match(gravity, /<section className="piano-scale-gravity-hud" aria-labelledby="piano-scale-gravity-title">/);
  assert.match(gravity, /A composer’s choir warm-up becomes a live map/);
  assert.match(gravity, /className="piano-scale-gravity-slots" role="group"/);
  assert.match(gravity, /Array\.from\(\{ length: 13 \}/);
  assert.match(gravity, /className="piano-scale-gravity-degree-picker" role="group"/);
  assert.match(gravity, /aria-pressed=\{pinnedDegree === node\.degree\}/);
  assert.match(gravity, /This runway is an exact physical window from selected Do to Do′/);
  assert.match(gravity, /latestWindowOffset === offset/);
  assert.match(gravity, /latest captured field matched/);
  assert.match(gravity, /Equally nearest triad tones/);
  assert.match(gravity, /className="piano-scale-gravity-contexts" role="group"/);
  assert.match(gravity, /Exact structure/);
  assert.match(gravity, /Style-bound tendency/);
  assert.match(gravity, /Listening prompt/);
  assert.match(gravity, /id="piano-scale-gravity-mode-home"/);
  assert.match(gravity, /This moves a listening frame, not the pitches or the app’s selected Do/);
  assert.match(gravity, /not the basis of all music/);
  assert.match(gravity, /Natural minor is its sixth rotation/);
  assert.match(gravity, /floating or pastel[\s\S]*listening prompt/);
  assert.doesNotMatch(gravity, /tabIndex=\{?[1-9]/);
  assert.match(gravityModel, /MAJOR_SCALE_OFFSETS = \[0, 2, 4, 5, 7, 9, 11\]/);
  assert.match(gravityModel, /MAJOR_SCALE_STEPS = \[2, 2, 1, 2, 2, 2, 1\]/);
  assert.match(gravityModel, /export function majorDegreeHarmonyReading/);
  assert.match(gravityModel, /export function physicalScaleGravityWindowOffset/);
  assert.match(gravityModel, /export function recognizeMajorHarmonyContext/);
  assert.match(gravityModel, /export function rotateMajorMode/);
  assert.match(scaleQuality, /aria-labelledby="piano-scale-quality-title"/);
  assert.match(scaleQuality, /role="img"[\s\S]{0,180}aria-labelledby=/);
  assert.match(scaleQuality, /aria-live="polite"/);
  assert.match(scaleQuality, /role="status" aria-live="polite" aria-atomic="true"/);
  assert.match(scaleQuality, /htmlFor="scale-quality-split"/);
  assert.match(scaleQuality, /<output id="scale-quality-split-reading" htmlFor="scale-quality-split">/);
  assert.match(scaleQuality, /raw MIDI/i);
  assert.match(scaleQuality, /silent/i);
  assert.match(scaleQuality, /const liveOverlap[\s\S]*scaleQualityOverlapProfile\(tonicEvent\.note, latestUpper\.note, activeNotes, soundModelId\)/);
  assert.match(scaleQuality, /only while raw MIDI proves exact overlap/);
  assert.doesNotMatch(scaleQuality, /capturedOverlap|latestUpper\.fieldNotes/);
  assert.doesNotMatch(scaleQuality, /\?\? SCALE_QUALITY_CATALOG\[0\]/);
  assert.match(scaleQuality, /candidateEvidence\.id === "suggestive" \|\| candidateEvidence\.id === "complete"/);
  assert.match(scaleQuality, /<button[\s\S]{0,260}aria-pressed=/);
  assert.match(scaleQuality, /role="group"[\s\S]{0,320}(listener|feel)/i);
  assert.doesNotMatch(scaleQuality, /AudioContext|webkitAudioContext|createOscillator|\.play\(\)/);
  assert.doesNotMatch(scaleQuality, /tabIndex=\{?[1-9]/);
  assert.match(scaleQualityCss, /min-height:\s*44px/);
  assert.match(scaleQualityCss, /@media \(max-width:/);
  assert.match(scaleQualityCss, /@media \(prefers-reduced-motion: reduce\)/);
  assert.match(scaleQualityCss, /@media \(forced-colors: active\)/);
  assert.match(css, /\.piano-scale-gravity-slots[\s\S]*grid-template-columns: repeat\(13, minmax\(0, 1fr\)\)/);
  assert.match(css, /@media \(max-width: 900px\)[\s\S]*\.piano-scale-gravity-intro/);
  assert.match(css, /@media \(max-width: 620px\)[\s\S]*\.piano-scale-gravity-slots/);
  assert.match(css, /@media \(max-width: 620px\)[\s\S]*\.piano-scale-gravity-degree-picker[\s\S]*repeat\(4, minmax\(0, 1fr\)\)/);
  assert.match(css, /@media \(forced-colors: active\)[\s\S]*\.piano-scale-gravity-hud/);
  assert.match(css, /\.piano-focus-primary[\s\S]*repeat\(7, minmax\(0, 1fr\)\)/);
  assert.match(model, /IMMERSION_HISTORY_ATTACKS = 12/);
  assert.match(model, /export function immersionHistory[\s\S]*slice\(-IMMERSION_HISTORY_ATTACKS\)/);
  assert.match(model, /IMMERSION_MAX_FIELD_NOTES = 8/);
  assert.match(model, /IMMERSION_MAX_INTERVAL_LINKS = 12/);
  assert.match(model, /IMMERSION_MAX_ANNOTATIONS = 5/);
  assert.match(model, /export function immersionRhythmLens/);
  assert.match(model, /export function immersionMeterGrid/);
  assert.match(model, /learner-declared meter/);
  assert.match(model, /fallback ruler is deliberately not promoted to a beat, meter, or accuracy/);
  assert.match(model, /export function immersionIntervalCharacter/);
  assert.match(model, /export function immersionLatestTransition/);
  assert.match(model, /directionalFrequencyRatio: 2 \*\* \(signedSemitones \/ 12\)/);
  assert.match(model, /snapshotOverlap[\s\S]*from\.note !== to\.note/);
  assert.match(model, /export function immersionRecentPath/);
  assert.match(model, /Catalog results are compatibility[\s\S]*matches over pitch classes/);
  assert.match(researchModel, /export function chromaticClock/);
  assert.match(researchModel, /export function generatorComponents/);
  assert.match(researchModel, /const divisor = greatestCommonDivisor\(step, RESEARCH_PITCH_CLASS_COUNT\)/);
  assert.match(researchModel, /export function thirdsLattice/);
  assert.match(researchModel, /3 \* x \+ 4 \* y/);
  assert.match(researchModel, /export function intervalMatrix/);
  assert.match(vocal, /id="voice-interval"/);
  assert.match(vocal, /id="voice-input-level"/);
  assert.match(vocal, /id="voice-input-source"/);
  assert.match(vocal, /Microphone source/);
  assert.match(vocal, /System default/);
  assert.match(vocal, /enumerateDevices/);
  assert.match(vocal, /deviceId: \{ exact: microphoneId \}/);
  assert.match(vocal, /addEventListener\("devicechange"/);
  assert.match(vocal, /Microphone input activity/);
  assert.match(vocal, /voice is very quiet · move closer/);
  assert.match(vocal, /voice heard · hold one vowel steady/);
  assert.match(vocal, /pitch detected/);
  assert.match(vocal, /activeInputLabel/);
  assert.match(vocalModel, /VOCAL_INPUT_MINIMUM_RMS = 0\.0015/);
  assert.match(vocal, /Start microphone/);
  assert.match(vocal, /Stop microphone/);
  assert.match(vocal, /Hear anchor → target/);
  assert.match(vocal, /navigator\.mediaDevices\.getUserMedia/);
  assert.match(vocal, /source\.connect\(analyser\)/);
  assert.match(vocal, /getTracks\(\)\.forEach\(\(track\) => track\.stop\(\)\)/);
  assert.match(vocal, /inputTrack\.onended = \(\) => \{[\s\S]*disposeMicrophoneResources\(\)/,
    "an unplugged active input must release its timer, track, and AudioContext before showing recovery UI");
  assert.match(vocal, /const createdContext = new AudioContextConstructor[\s\S]*catch \{[\s\S]*context && context\.state !== "closed"[\s\S]*context\.close\(\)/,
    "a failed reference start must close the newly created AudioContext");
  assert.doesNotMatch(vocal, /MediaRecorder|localStorage|sessionStorage|fetch\(/);
  assert.match(vocal, /<section id="voice-match"/);
  assert.match(vocal, /<section id="voice-ear-map"/);
  assert.match(vocal, /<section id="voice-spectrum"/);
  assert.match(vocal, /className="voice-input-console"/);
  assert.match(vocal, /className="voice-microphone-status"/);
  assert.match(vocal, /className="piano-voice-trace-frame" role="img" aria-label=\{pitchTraceSummary\}/);
  assert.match(vocal, /Center the pitch\. Then steady the trail\./);
  assert.match(vocal, /Hear target[\s\S]*Sing from memory[\s\S]*Check direction[\s\S]*Repeat without looking/);
  assert.match(vocal, /\+1 st[\s\S]*higher[\s\S]*\+50¢[\s\S]*target[\s\S]*−50¢[\s\S]*−1 st[\s\S]*lower/);
  assert.match(vocal, /VOCAL_TRAIL_DURATION_MS = 3_200/);
  assert.match(vocal, /VOCAL_TRAIL_MAXIMUM_SAMPLES = 28/);
  assert.match(vocal, /className="piano-voice-ear-readings"/);
  assert.match(vocal, /Accuracy · pitch center/);
  assert.match(vocal, /Clarity · can one pitch be tracked\?/);
  assert.match(vocal, /Steadiness · recent trail width/);
  assert.match(vocal, /<meter aria-label=\{`Detector periodicity/);
  assert.match(vocal, /not tone quality, diction, or musical correctness/);
  assert.match(vocal, /className="piano-voice-spectrum-plot" role="img" aria-label=\{spectrumSummary\}/);
  assert.match(vocal, /<canvas ref=\{spectrumCanvasRef\} aria-hidden="true" \/>/);
  assert.match(vocal, /Voice energy × target harmonics/);
  assert.match(vocal, /ideal target harmonics/);
  assert.match(vocal, /Formants can make an upper harmonic taller/);
  assert.match(voiceLab, /Nothing is recorded or uploaded/);
  assert.match(vocal, /not measured piano audio/);
  assert.match(vocal, /not vocal quality, correctness, timbre, harmony, emotion/);
  assert.match(vocalModel, /export function detectVocalFundamental/);
  assert.match(vocalModel, /export function matchVocalPitch/);
  assert.match(vocalModel, /export function vocalTargetRailPosition/);
  assert.match(vocalModel, /returns null for a[\s\S]*weak or insufficiently periodic window/);
  assert.match(vocalSpectrumModel, /export function vocalSpectrumPosition/);
  assert.match(vocalSpectrumModel, /export function vocalTargetHarmonics/);
  assert.match(vocalTrainingModel, /export function vocalPitchLanePosition/);
  assert.match(vocalTrainingModel, /export function vocalAccuracyReading/);
  assert.match(vocalTrainingModel, /export function vocalClarityReading/);
  assert.match(vocalTrainingModel, /export function vocalRecentPitchSpread/);
  assert.match(vocalTrainingModel, /export function vocalEarTrainingCue/);
  assert.match(css, /\.piano-voice-source select/);
  assert.match(css, /\.piano-voice-spectrum-guides i \{ border-left: 1px dashed/);
  assert.match(css, /\.piano-voice-spectrum-guides b \{ border-left: 2px solid/);
  assert.match(css, /\.piano-voice-trace-stage path\.is-fragile \{ stroke-dasharray/);
  assert.match(css, /\.piano-voice-trace-stage path\.is-usable \{ stroke-dasharray/);
  assert.match(css, /\.piano-voice-trace-stage path\.is-clear \{ stroke-dasharray/);
  assert.match(css, /@media \(max-width: 900px\)[\s\S]*\.piano-immersion-intro/);
  assert.match(css, /\.piano-research-layout-controls \{[^}]*grid-template-columns: repeat\(3/);
  assert.match(css, /\.piano-research-lattice \{[^}]*grid-template-columns: repeat\(4/);
  assert.match(css, /\.piano-research-matrix \{[^}]*table-layout: fixed/);
  assert.match(css, /@media \(max-width: 900px\)[\s\S]*\.piano-research-clock-layout \{ grid-template-columns: 1fr/);
  assert.match(css, /@media \(max-width: 620px\)[\s\S]*\.piano-research-boundaries \{ grid-template-columns: 1fr/);
  assert.match(css, /@media \(forced-colors: active\)[\s\S]*\.piano-research-clock-node\.is-latest circle/);
  assert.match(css, /@media \(max-width: 900px\)[\s\S]*\.piano-voice-ear-layout \{ grid-template-columns: 1fr/);
  assert.match(css, /\.voice-workspace-header/);
  assert.match(css, /\.voice-focus-navigation/);
  assert.match(css, /\.voice-input-console/);
  assert.match(css, /@media \(max-width: 980px\) \{\s*\.voice-workspace-header \{ grid-template-columns: 1fr; \}/,
    "Voice should match Piano's compact workspace breakpoint before its fixed desktop tracks can overflow");
  assert.match(css, /@media \(max-width: 900px\)[\s\S]*\.piano-route-selector \{ grid-template-columns: 1fr 1fr/);
  assert.match(css, /\.piano-do-capture button\[aria-pressed="true"\]/);
  assert.match(css, /@media \(max-width: 900px\)[\s\S]*\.piano-immersion-edge-hud[\s\S]*position: relative/);
  assert.match(css, /\.piano-immersion-lens\.is-scale \{[\s\S]*grid-column: 3;[\s\S]*grid-row: 3/);
  assert.match(css, /@media \(max-width: 900px\)[\s\S]*\.piano-immersion-lens\.is-scale \{ grid-column: 2; grid-row: 2/);
  assert.match(css, /\.piano-immersion-scale-grid \{[\s\S]*grid-template-columns: repeat\(12/);
  assert.match(css, /\.piano-immersion-scale-grid > span\.is-latest b/);
  assert.match(css, /\.piano-immersion-scale-grid > span\.is-active/);
  assert.match(css, /\.piano-immersion-scale-actions \{[\s\S]*pointer-events: auto/);
  assert.match(css, /\.piano-immersion-scale-actions button\[aria-pressed="true"\]/);
  assert.match(css, /\.piano-immersion-scale-fingering ol \{[\s\S]*grid-template-columns: repeat\(auto-fit, minmax\(22px, 1fr\)\)/);
  assert.match(css, /@media \(forced-colors: active\)[\s\S]*\.piano-immersion-scale-fingering/);
  assert.match(css, /\.piano-immersion-fingering \.is-finger-marker circle/);
  assert.match(css, /@media \(max-width: 620px\)[\s\S]*\.piano-immersion-reading \{ grid-template-columns: 1fr/);
  assert.match(css, /@media \(max-width: 620px\)[\s\S]*\.piano-voice-trace-frame \{ grid-template-columns: 58px minmax\(0, 1fr\)/);
  assert.match(css, /@media \(max-width: 620px\)[\s\S]*\.piano-voice-actions \{ display: grid; grid-template-columns: 1fr/);
  assert.match(css, /@media \(max-width: 620px\)[\s\S]*\.piano-route-methods ol \{ grid-template-columns: 1fr/);
  assert.match(css, /@media \(max-width: 620px\)[\s\S]*\.piano-immersion-edge-hud \{ grid-template-columns: 1fr/);
  assert.match(css, /@media \(max-width: 620px\)[\s\S]*\.piano-immersion-lens\.is-scale \{ grid-column: 1; grid-row: auto/);
  assert.match(css, /@media \(max-width: 620px\)[\s\S]*\.piano-immersion-interval-context-bar > div \{ grid-template-columns: 1fr/);
  assert.match(css, /@media \(forced-colors: active\)[\s\S]*\.piano-immersion-stage \* \{ filter: none/);
  assert.match(css, /@media \(forced-colors: active\)[\s\S]*\.piano-voice-trace-stage path/);
  assert.match(css, /@media \(forced-colors: active\)[\s\S]*\.piano-voice-spectrum-guides i/);
  assert.match(css, /@media \(forced-colors: active\)[\s\S]*\.piano-route-selector select/);
  assert.match(css, /@media \(forced-colors: active\)[\s\S]*\.piano-do-capture button\[aria-pressed="true"\]/);
  assert.match(css, /@media \(forced-colors: active\)[\s\S]*\.piano-immersion-character \.is-roughness \{ stroke-dasharray/);
  assert.match(css, /@media \(forced-colors: active\)[\s\S]*\.piano-immersion-latest-transition\.is-down[\s\S]*border-left-style: dashed/);
  assert.match(css, /@media \(forced-colors: active\)[\s\S]*\.piano-immersion-meter-controls input/);
  assert.match(css, /@media \(forced-colors: active\)[\s\S]*\.piano-immersion-map-key i/);
  assert.match(css, /\.piano-immersion-note \.cosmos-node\.is-outside-route[\s\S]*stroke-dasharray/);
  assert.match(css, /\.immersion-pedal-ring[\s\S]*stroke-dasharray/);
  assert.match(css, /\.piano-immersion-stage \{[^}]*contain: layout paint/);
});

test("dynamic visuals and status changes expose nonvisual descriptions", async () => {
  const [ratio, scale, piano, ear, harmony, rhythm, recording, journey, atlas, personal] = await Promise.all([
    readFile(new URL("../app/RatioLab.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/ScaleLab.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/PianoLab.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/EarLab.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/HarmonyLab.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/RhythmLab.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/RecordingLab.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/JourneyLab.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/AtlasLab.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/PersonalLab.tsx", import.meta.url), "utf8"),
  ]);
  assert.match(ratio, /<canvas[^>]+role="img"[^>]+aria-label=/);
  assert.match(scale, /name="scale-degree"/);
  assert.match(scale, /aria-live="polite"/);
  assert.match(scale, /<ol className="step-fingerprint"/);
  assert.match(scale, /aria-labelledby="degree-field-title"/);
  assert.match(scale, /aria-controls="degree-field-reading"/);
  assert.match(scale, /className="degree-stack-plot"[\s\S]*role="img"[\s\S]*aria-label=/);
  assert.match(scale, /className="sr-only degree-field-live-summary"[\s\S]*aria-live="polite"[\s\S]*aria-atomic="true"/);
  assert.match(piano, /aria-label="Silent two-octave on-screen piano/);
  assert.match(piano, /aria-live="polite"/);
  assert.match(piano, /Grand staff showing/);
  assert.match(piano, /Evidence traces across/);
  assert.match(piano, /Choose movable Do around the circle of fifths/);
  assert.match(piano, /Repeated fifths morphing from a nonclosing pure-ratio spiral/);
  assert.match(piano, /id="hud-fifths-stack"/);
  assert.match(piano, /id="hud-fifths-temper"/);
  assert.match(piano, /Select an event across every view/);
  assert.match(piano, /Chord gestures grouped by attack timing/);
  assert.match(piano, /aria-label="Selected chord evidence"/);
  assert.match(piano, /aria-labelledby="hud-chord-semitone-atlas-title"/);
  assert.match(piano, /Root-position examples begin at/);
  assert.match(piano, /every card shares one logarithmic Hz axis and shows \{partialScopeCopy\}/);
  assert.match(piano, /Major and minor share the same unordered pair sizes/);
  assert.match(piano, /Read the arrows as available one-voice moves among these three types, not as forces/);
  assert.match(piano, /bass \+1 st → diminished rooted above/);
  assert.match(piano, /Chord type alone does not choose up, down, or rest/);
  assert.match(piano, /chordCrunchReading = selectedChordMeasure\?\.crunch \?\? liveHeldPerception\?\.roughness/);
  assert.match(piano, /aria-label="Correct inherited chord membership"/);
  assert.match(piano, /Restore.*Exclude.*inherited/);
  assert.match(piano, /id="hud-chord-window"/);
  assert.match(piano, /aria-label="Guided ascending scale walk"/);
  assert.match(piano, /aria-label="Performed scale fingerprint builder"/);
  assert.match(piano, /aria-label="Scale landing mutation comparison"/);
  assert.match(piano, />Change one landing<\/button>/);
  assert.match(piano, /Change one landing, keep the octave/);
  assert.match(piano, /aria-label="Choose one consequence of the moved scale landing"/);
  assert.match(piano, />Every connected interval<\/button>/);
  assert.match(piano, /hud-scale-ripple-summary" role="img" aria-label=\{summary\}/);
  assert.match(piano, /Global consequence/);
  assert.match(piano, /hud-scale-ripple-reading" role="status" aria-live="polite"/);
  assert.match(piano, /aria-label="Assumed spectral consequence of one changed interval"/);
  assert.match(piano, /hud-scale-spectrum-summary" role="img" aria-label=\{summary\}/);
  assert.match(piano, /hud-scale-spectrum-reading" role="status" aria-live="polite"/);
  assert.match(piano, /MIDI contains no instrument spectrum/);
  assert.match(piano, /hud-scale-mutation-reading[\s\S]*role="status" aria-live="polite"/);
  assert.match(piano, /`Δ\$\{signed\(delta\)\}`/);
  assert.match(piano, /More than one landing moved, so no single-position explanation is justified/);
  assert.match(piano, /aria-label="Choose one scale experiment"/);
  assert.match(piano, /silent performed fingerprint target/);
  assert.match(piano, /aria-label="Tonal gravity counterfactual microscope"/);
  assert.match(piano, /aria-label="Counterfactual evidence separation"/);
  assert.match(piano, /aria-labelledby="hud-phrase-compare-entry-title"/);
  assert.match(piano, /aria-label="Choose one phrase change to investigate"/);
  assert.match(piano, /aria-label="Five separate phrase comparison lenses"/);
  assert.match(piano, /aria-labelledby="hud-partial-title"/);
  assert.match(piano, /role="img" aria-label=\{summary\}/);
  assert.match(piano, /role="img" aria-label=\{comparisonSummary\}/);
  assert.match(piano, /aria-label="Five separate lenses for the selected attack change"/);
  assert.match(piano, /hud-last-attack-reading[\s\S]*role="status" aria-live="polite"/);
  assert.match(piano, /hud-phrase-change-status" role="status" aria-live="polite"/);
  assert.match(piano, /aria-label="Ending relationship ripple"/);
  assert.match(piano, /hud-ending-ripple-summary" role="img" aria-label=\{summary\}/);
  assert.match(piano, /Trace every ending relationship/);
  assert.match(piano, /hud-ending-ripple-reading" role="status" aria-live="polite"/);
  assert.match(piano, /role="group" aria-label=\{row\.label\}/);
  assert.match(piano, /role="status" aria-live="polite"/);
  assert.match(piano, /silent guided scale-walk target/);
  assert.match(piano, /aria-labelledby="hud-sonority-title"/);
  assert.match(piano, /aria-label="Separate conditional affordance changes"/);
  assert.match(piano, /silent controlled sonority reference/);
  assert.match(piano, /aria-label="Original versus one-key path comparison across five lenses"/);
  assert.match(piano, /aria-label="Report which landmark path felt more directed"/);
  assert.match(piano, /aria-label="Motion learning question"/);
  assert.match(piano, /Show what survived/);
  assert.match(piano, /aria-controls="hud-motif-fingerprint-detail"/);
  assert.match(piano, /hud-motif-fingerprint-grid" role="img" aria-label=\{summary\}/);
  assert.match(piano, /Set each statement’s first key to 0/);
  assert.match(piano, /does not infer intended motif, formal function, emotion, quality, or correctness/);
  assert.match(piano, /aria-labelledby="hud-motif-echo-title"/);
  assert.match(piano, /aria-label="Choose motif source length"/);
  assert.match(piano, /Freeze last 3/);
  assert.match(piano, /No smaller sub-match can replace your chosen boundary/);
  assert.match(piano, /Every chosen attack entered this comparison/);
  assert.match(piano, /Local sequence · source → change → return/);
  assert.match(piano, /The variation is open—try bringing the relationship back/);
  assert.match(piano, /not a detected section, theme, compositional intention, style, listener recognition, or quality judgment/);
  assert.match(piano, /Did the last statement feel like a return to you\?/);
  assert.match(piano, /aria-label="Modeled relationship and listener report kept separate"/);
  assert.match(piano, /aria-label="Report whether the last statement felt like a return"/);
  assert.match(piano, /Agreement with the relationship detector is not a goal/);
  assert.match(piano, /Your report does not turn that relationship into detected form, universal recognition, emotion, correctness, or musical quality/);
  assert.match(piano, /Particular performances · no average/);
  assert.match(piano, /Did moving the relationship change your experience\?/);
  assert.match(piano, /They do not establish your recognition threshold or a general law about transposition/);
  assert.match(piano, />Reflect on the whole arc<\/button>/);
  assert.match(piano, /motifReturnArcEventIds\(session\.sourceEvents\.map/);
  assert.match(piano, /The source aged out of the sixty-second phrase\. Start a new arc to reflect on its exact timing/);
  assert.match(piano, /holdBoundedExperienceSpecimen\("motif-return", specimen\)/);
  assert.match(piano, /prompt\s*\.replace\("this phrase", "this source–variation–return arc"\)/);
  assert.match(piano, /replace\("this relationship path", "this source–variation–return arc"\)/);
  assert.match(piano, /replace\("this particular experience", "this source–variation–return experience"\)/);
  assert.match(piano, /origin === "motif-return" \? "motif source \+ variation \+ return"/);
  assert.match(piano, /The exact source, latest variation, and relationship return are frozen together/);
  assert.match(piano, /Save this return-arc report/);
  assert.match(piano, />Reflect on performed path<\/button>/);
  assert.match(piano, /How did this whole performed route feel\?/);
  assert.match(piano, /landmarkPerformanceEventIds\(landmarkPerformanceCapture\.fieldEventIds, landmarkPath\.steps\.length\)/);
  assert.match(piano, /Every exact attack used to complete this generated path is frozen in its original chronology/);
  assert.match(piano, /holdBoundedExperienceSpecimen\("landmark-path", specimen/);
  assert.match(piano, /Save this landmark-path report/);
  assert.match(piano, /this performed landmark path/);
  assert.match(piano, /relationship fingerprint · Do factored out/);
  assert.match(piano, /The whole route inside one octave/);
  assert.match(piano, /className="hud-landmark-fingerprint-plot"[\s\S]*role="img" aria-label=\{summary\}/);
  assert.match(piano, /aria-label="Select one transition to inspect what changed"/);
  assert.match(piano, /aria-pressed=\{selectedTransitionIndex === transition\.toStepIndex\}/);
  assert.match(piano, /What did field \{change\.toField\.stepIndex \+ 1\} change\?/);
  assert.match(piano, /className="hud-landmark-change-plot"[\s\S]*role="img" aria-label=\{summary\}/);
  assert.match(piano, /aria-label="Five evidence lenses for the selected route transition"/);
  assert.match(piano, /Sound · authored \+ modeled/);
  assert.match(piano, /Experience · yours/);
  assert.match(piano, /no other lane supplies this answer/);
  assert.match(piano, /timing, velocity, releases, pedal, balance, actual instrument spectrum, fingering, intention, emotion, and musical goodness remain outside it/i);
  assert.match(piano, /Transposing the whole route leaves this folded pattern unchanged/);
  assert.match(piano, /register, timing, the assumed sound, tonal interpretation, and your experience remain separate evidence/i);
  assert.match(piano, /Which underlying route property changes\?/);
  assert.match(piano, /route A held · now perform B/);
  assert.match(piano, /function isLandmarkRouteCompareSession/);
  assert.match(piano, /session\.sourcePathId !== session\.targetPathId/);
  assert.match(piano, /version: 27[\s\S]*landmarkRouteCompareSession/);
  assert.match(piano, /Two routes in the same underlying coordinate/);
  assert.match(piano, /className="hud-landmark-compare-plot"[\s\S]*role="img" aria-label=\{summary\}/);
  assert.match(piano, /role="table" aria-label="Route structure comparison"/);
  assert.match(piano, /Dashed capsules mark exact field shapes present in both routes/);
  assert.match(piano, /It is not a style match/);
  assert.match(piano, /Timing, articulation, register, actual sound, tonal hearing, emotional response, familiarity, and goodness remain separate evidence/);
  assert.match(personal, /Latest performed landmark:/);
  assert.match(personal, /latestLandmarkCharacterContrast\(phraseObservations\)/);
  assert.match(personal, /What changed when you played this route again\?/);
  assert.match(personal, /aria-label="Four listener reports shown separately"/);
  assert.match(personal, /aria-label="Measured MIDI and modeled teaching evidence kept separate"/);
  assert.match(personal, /The reports and evidence are aligned, not causally joined/);
  assert.match(piano, /aria-labelledby="hud-pulse-title"/);
  assert.match(piano, /Later MIDI attack clusters placed against the learner’s four-tap pulse/);
  assert.match(piano, /aria-labelledby="hud-phrase-breath-title"/);
  assert.match(piano, /Mark a candidate break after/);
  assert.match(piano, /Performed pitch path divided only at long onset-group gaps containing release-proven silence/);
  assert.match(piano, /hud-breath-reading" role="status" aria-live="polite"/);
  assert.match(piano, /Unknown releases, overlaps, and merely long held notes never become quiet-space boundaries/);
  assert.match(piano, /does not detect intended phrasing, breath, meter, form, expressiveness, correctness, or musical goodness/);
  assert.match(piano, />Compare one pause<\/button>/);
  assert.match(piano, /onComparePause=\{\(\) => beginPhraseCompare\("timing"\)\}/);
  assert.match(piano, /modeled crunch/);
  assert.match(piano, /MIDI contains no acoustic roughness measurement/);
  assert.match(ear, /aria-labelledby="live-ear-title"/);
  assert.match(ear, /role="img" aria-label=\{summary\}/);
  assert.match(ear, /aria-label="Five separate lenses for this interval and its assumed sounds"/);
  assert.match(ear, /<details className="ear-authoring-disclosure"/);
  assert.match(harmony, /aria-labelledby="live-harmony-title"/);
  assert.match(harmony, /role="img" aria-label=\{accessibleSummary\}/);
  assert.match(harmony, /aria-label="Five separate evidence lenses for the chord change"/);
  assert.match(harmony, /<details className="harmony-authoring-disclosure"/);
  assert.match(rhythm, /aria-labelledby="rhythm-live-title"/);
  assert.match(rhythm, /role="img"/);
  assert.match(rhythm, /Pitchless timing profile with/);
  assert.match(rhythm, /<details className="rhythm-authoring-disclosure"/);
  assert.match(recording, /aria-live="polite"/);
  assert.match(journey, /role="img" aria-label=/);
  assert.match(journey, /aria-labelledby="journey-live-title"/);
  assert.match(journey, /Piece-local expectation trail/);
  assert.match(journey, /<details className="journey-generated-disclosure"/);
  assert.match(atlas, /aria-label=\{`Music landmarks positioned/);
});

test("scale generator keeps orbit, window, home, and bounded meaning accessible", async () => {
  const [generator, model, css] = await Promise.all([
    readFile(new URL("../app/ScaleGeneratorExplainer.tsx", import.meta.url), "utf8"),
    readFile(new URL("../lib/scale-generator-model.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
  ]);
  assert.match(generator, /<section className="scale-lesson generator-lesson" aria-labelledby="generator-lesson-title">/);
  assert.match(generator, /The fifth is not sharpened\. The fifth becomes home/);
  assert.match(generator, /role="group" aria-label="Circle of fifths major-scale derivation stages"/);
  assert.match(generator, /aria-controls="generator-derivation-reading"/);
  assert.match(generator, /className="sr-only generator-derivation-live-summary" role="status" aria-live="polite" aria-atomic="true"/);
  assert.match(generator, /className="generator-degree-rail" role="img" aria-label=/);
  assert.match(generator, /className="fifths-window-comparison" role="img" aria-label=/);
  assert.match(generator, /<fieldset className="generator-options">/);
  assert.match(generator, /id="generator-window-size" type="range"/);
  assert.match(generator, /className="generator-clock" role="img" aria-label=\{description\}/);
  assert.match(generator, /className="sr-only generator-workbench-live-summary" role="status" aria-live="polite" aria-atomic="true"/);
  assert.match(generator, /The full \+7 orbit is chromatic; major appears only after selecting a seven-stop window and where Do sits/);
  assert.match(generator, /Transposition always preserves the shape\. One-out\/one-in membership does not/);
  assert.match(generator, /Contingent at the boundary; exact inside it/);
  assert.match(generator, /tonic detection · function · resolution · consonance · emotion · quality/);
  assert.match(generator, /Pure 3:2 spiral/);
  assert.match(model, /cycleLength = divisions \/ divisor/);
  assert.match(model, /boundaryRemainder: normalizePitchClass\(count \* orbit\.generator, divisions\)/);
  assert.match(css, /@media \(max-width: 680px\)[\s\S]*\.generator-stability-ledger,[\s\S]*\.generator-boundary-grid \{ grid-template-columns: 1fr/);
  assert.match(css, /@media \(max-width: 380px\)[\s\S]*\.generator-degree-rail \{ grid-template-columns: repeat\(4/);
  assert.match(css, /@media \(forced-colors: active\)[\s\S]*\.generator-clock g\.is-leaving circle/);
  assert.match(css, /\.generator-gap-strip > li \{[^}]*flex-basis: 0/);
  assert.match(css, /\.generator-options button:nth-of-type\(4n\)/);
  assert.match(css, /\.generator-comparison-table \.generator-table-head \{ position: absolute; width: 1px/);
  assert.doesNotMatch(generator, /tabIndex=\{?[1-9]/);
});

test("focus, reduced-motion, and non-color contracts are present", async () => {
  const [css, ratio, technical, scale, piano, ear, harmony, rhythm, journey] = await Promise.all([
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
    readFile(new URL("../app/RatioLab.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/TechnicalNotesLab.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/ScaleLab.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/PianoLab.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/EarLab.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/HarmonyLab.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/RhythmLab.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/JourneyLab.tsx", import.meta.url), "utf8"),
  ]);
  assert.match(css, /select:focus-visible/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)/);
  assert.match(css, /animation-duration: 0\.01ms !important/);
  assert.match(css, /cloud-blues[\s\S]*border-style: dotted/);
  assert.match(css, /cloud-classical[\s\S]*border-style: double/);
  assert.match(css, /\.atlas-point[\s\S]*width: max\(50px, var\(--point-size\)\)/);
  assert.match(css, /\.personal-landmark-axis > i b,[\s\S]*border-radius: 50%/);
  assert.match(css, /\.personal-landmark-axis > i em[\s\S]*transform: rotate\(45deg\)/);
  assert.match(css, /@media \(max-width: 640px\)[\s\S]*\.personal-landmark-pair \{ grid-template-columns: 1fr; \}/);
  assert.match(css, /@media \(forced-colors: active\)[\s\S]*\.personal-landmark-axis > i em \{ border-color: Highlight/);
  assert.match(css, /\.hud-landmark-fingerprint-node\.is-root[\s\S]*\.hud-landmark-fingerprint-node\.is-changed/);
  assert.match(css, /\.hud-landmark-fingerprint-held[\s\S]*stroke: var\(--piano-blue\)/);
  assert.match(css, /@media \(max-width: 620px\)[\s\S]*\.hud-landmark-fingerprint-transitions \{ grid-template-columns: 1fr; \}/);
  assert.match(css, /@media \(forced-colors: active\)[\s\S]*\.hud-landmark-fingerprint-node\.is-changed \{ fill: Highlight/);
  assert.match(css, /\.hud-landmark-change-lenses[\s\S]*grid-template-columns: repeat\(5, minmax\(0, 1fr\)\)/);
  assert.match(css, /@media \(max-width: 620px\)[\s\S]*\.hud-landmark-change-lenses \{ grid-template-columns: 1fr; \}/);
  assert.match(css, /@media \(forced-colors: active\)[\s\S]*\.hud-landmark-change-node\.is-after \{ fill: LinkText/);
  assert.match(css, /@media \(forced-colors: active\)[\s\S]*\.degree-field-degree-grid button\[aria-pressed="true"\]/);
  assert.match(css, /@media \(max-width: 380px\)[\s\S]*\.degree-field-degree-grid \{ grid-template-columns: repeat\(3/);
  assert.match(css, /\.hud-landmark-compare-field > rect:first-child[\s\S]*stroke-dasharray: 3 3/);
  assert.match(css, /@media \(max-width: 620px\)[\s\S]*\.hud-landmark-compare-table > div \{ grid-template-columns: 1fr 1fr; \}/);
  assert.match(css, /@media \(forced-colors: active\)[\s\S]*\.hud-landmark-compare-field > rect:first-child \{ stroke: Highlight/);
  assert.match(css, /\.lab-nav-primary[\s\S]*grid-template-columns: repeat\(3, minmax\(0, 1fr\)\)/);
  assert.doesNotMatch(css, /@media \(max-width: 1180px\) \{\s*\.site-header/,
    "the compact global navigation must not consume a second desktop row at laptop widths");
  assert.match(css, /@media \(max-width: 980px\) \{[\s\S]*\.piano-workspace-header \{ grid-template-columns: 1fr; \}/,
    "the Piano identity and input console must stack before their fixed minimum tracks can overflow");
  assert.match(ratio, /<details className="lab-nav-more"/);
  assert.match(ratio, /const PRIMARY_LAB_IDS: LabId\[\] = \["guide", "piano", "voice"\]/);
  assert.match(ratio, /const WORKSPACE_LAB_IDS = new Set<LabId>\(\["guide", "piano", "voice", "technical"\]\)/);
  assert.match(ratio, /\{ label: "Music and reference", labs: \["recording", "atlas", "personal", "technical"\] \}/);
  assert.match(ratio, /\{!WORKSPACE_LAB_IDS\.has\(activeLab\) \? <section className="hero">/);
  assert.match(ratio, /activeLab === "technical" \?[\s\S]{0,80}<TechnicalNotesLab/);
  assert.doesNotMatch(ratio, /className="header-status"/, "release state must not compete with primary navigation");
  assert.match(ratio, /aria-label="Live piano phrase available"/);
  assert.match(ratio, /matchMedia\("\(prefers-reduced-motion: reduce\)"\)/);
  assert.match(ratio, /behavior: prefersReducedMotion \? "auto" : "smooth"/);
  assert.match(ratio, /className="skip-link" href="#lab-stage" onClick=\{skipToActiveLab\}/);
  assert.match(ratio, /id="lab-stage" className=\{`lab-stage\$\{activeLab === "guide"[\s\S]*activeLab === "technical" \? " is-technical"/);
  assert.match(technical, /aria-labelledby="technical-notes-title"/);
  assert.match(technical, /Browser-observed/);
  assert.match(technical, /Declared coordinate/);
  assert.match(technical, /Teaching model/);
  assert.match(technical, /Human report/);
  assert.match(technical, /mwno-prediction-2/);
  assert.match(technical, /music-with-no-names\.live-atlas\.v1/);
  assert.match(technical, /MIDI is data, not audio/);
  assert.match(technical, /Spotify is not synchronized/);
  assert.doesNotMatch(technical, /technical-safety|>Safety<|Hearing safety/);
  assert.match(css, /\.technical-jump-nav \{ display: grid; grid-template-columns: repeat\(4, minmax\(0, 1fr\)\)/);
  assert.doesNotMatch(css, /\.technical-jump-nav \{[^}]*position: sticky/,
    "Technical Notes should use the document scroll instead of a second persistent navigation layer");
  assert.match(css, /@media \(min-width: 761px\) and \(min-height: 680px\)[\s\S]*\.start-landing \{ min-height: calc\(100svh - 66px\); \}/);
  assert.match(css, /@media \(max-width: 760px\)[\s\S]*\.start-landing \{ display: block; min-height: 0; \}/);
  assert.match(piano, /focusLens === "scale-quality" \? "Web MIDI unavailable" : "Screen keys only"/,
    "Scale Quality cannot advertise screen keys because it intentionally has no on-screen keyboard");
  assert.match(css, /@media \(forced-colors: active\)/);
  assert.match(css, /\.atlas-point\.is-selected > i[\s\S]*outline: 4px solid Highlight/);
  assert.match(css, /\.spectrum-partial\.voice-6[\s\S]*border: 3px double Canvas/);
  assert.match(css, /\.learning-scale \.step-fingerprint > li span/);
  assert.doesNotMatch(ratio, /tabIndex=\{?[1-9]/);
  assert.doesNotMatch(scale, /className="degree-inspector"[^>]*aria-live/);
  assert.doesNotMatch(piano, /tabIndex=\{?[1-9]/);
  assert.match(css, /\.piano-key\.is-circle-target/);
  assert.match(css, /\.piano-key\.is-scale-walk-target/);
  assert.match(css, /\.piano-key\.is-scale-builder-target/);
  assert.match(css, /\.hud-gravity-counterfactual-chart > span\.is-target/);
  assert.match(css, /\.hud-gravity-counterfactual-chart i\.is-before[\s\S]*LinkText/);
  assert.match(css, /\.hud-phrase-lens-profile > article\.is-invariant[\s\S]*border-left/);
  assert.match(css, /\.hud-phrase-change-reading\.has-target[\s\S]*LinkText/);
  assert.match(css, /\.hud-phrase-change-reading > button\[aria-pressed="true"\]/);
  assert.match(css, /\.hud-ending-ripple-spoke \.is-attempt i b[\s\S]*border: 1px dashed/);
  assert.match(css, /\.hud-ending-ripple-reading \{ border-left-color: LinkText/);
  assert.match(css, /\.hud-motif-fingerprint-entry button\[aria-expanded="true"\]/);
  assert.match(css, /\.hud-motif-time-bar i[\s\S]*flex: var\(--motif-gap-share\)/);
  assert.match(css, /\.hud-motif-fingerprint-grid \{ grid-template-columns: minmax\(76px/);
  assert.match(css, /\.hud-motif-echo-start \{ grid-template-columns: 1fr/);
  assert.match(css, /\.hud-motif-return-trail ol \{ grid-template-columns: 1fr/);
  assert.match(css, /\.hud-motif-return-trail li\.is-variation[\s\S]*border-top-style: dashed/);
  assert.match(css, /\.hud-motif-return-trail li\.is-return[\s\S]*border-top-style: double/);
  assert.match(css, /\.hud-motif-return-trail li\.is-return \{ border-top-color: LinkText/);
  assert.match(css, /\.hud-motif-experience-options button\[aria-pressed="true"\]/);
  assert.match(css, /\.hud-motif-experience-options \{ grid-template-columns: 1fr/);
  assert.match(css, /\.hud-motif-experience-options button\[aria-pressed="true"\][\s\S]*HighlightText/);
  assert.match(css, /\.hud-motif-return-contrast li\.is-shifted[\s\S]*border-top-style: dashed/);
  assert.match(css, /\.hud-motif-return-contrast ol \{ grid-template-columns: 1fr/);
  assert.match(css, /\.hud-motif-return-contrast li\.is-shifted \{ border-top-color: LinkText/);
  assert.match(css, /\.hud-motif-echo button \{ color: ButtonText/);
  assert.match(css, /\.hud-partial-link\.is-aligned[\s\S]*LinkText/);
  assert.match(css, /\.hud-partial-link\.is-interaction[\s\S]*Highlight/);
  assert.match(css, /\.hud-echo-span\.is-source[\s\S]*LinkText/);
  assert.match(css, /\.hud-echo-span\.is-attempt[\s\S]*Highlight/);
  assert.match(css, /\.hud-scale-mutation-routes \.is-source \.is-present i[\s\S]*border-radius: 50%/);
  assert.match(css, /\.hud-scale-mutation-routes \.is-attempt \.is-present i[\s\S]*border-style: dashed/);
  assert.match(css, /\.hud-scale-mutation-routes \.is-present\.is-changed i[\s\S]*border: 3px double/);
  assert.match(css, /\.hud-scale-mutation-gaps \{ grid-template-columns: repeat\(4, minmax\(0, 1fr\)\)/);
  assert.match(css, /\.hud-scale-mutation-reading \{ border-left-color: LinkText/);
  assert.match(css, /\.hud-scale-mutation-view button\[aria-pressed="true"\]/);
  assert.match(css, /\.hud-scale-ripple-spoke \.is-attempt i b[\s\S]*border: 1px dashed/);
  assert.match(css, /\.hud-scale-ripple-spoke \.is-attempt i b[\s\S]*border-color: Highlight/);
  assert.match(css, /\.hud-scale-ripple-reading \{ border-left-color: LinkText/);
  assert.match(css, /\.hud-scale-ripple-spoke\[aria-pressed="true"\]/);
  assert.match(css, /\.hud-scale-spectrum-partial\.is-upper[\s\S]*stroke-dasharray/);
  assert.match(css, /\.hud-scale-spectrum-interaction[\s\S]*fill: var\(--piano-gold\)/);
  assert.match(css, /\.hud-scale-spectrum-reading \{ border-left-color: LinkText/);
  assert.match(piano, /aria-label="Interval context lesson"/);
  assert.match(piano, /aria-label="Five separate lenses for the source and echoed interval"/);
  assert.match(piano, />Reflect on source \+ echo<\/button>/);
  assert.match(piano, /origin === "interval-echo" \? "interval source \+ echo"/);
  assert.match(piano, /replace\("this phrase", "this source-and-echo comparison"\)/);
  assert.match(piano, /"Use whole live phrase"/);
  assert.match(piano, /aria-label="Five separate lenses for the selected chord change"/);
  assert.match(piano, />Reflect on chord change<\/button>/);
  assert.match(piano, /holdBoundedExperienceSpecimen\("chord-change", specimen\)/);
  assert.match(piano, /prompt\.replace\("this phrase", "this chord change"\)/);
  assert.match(piano, /aria-label="Choose one chord-learning question"/);
  assert.match(piano, /aria-label="Five separate lenses for the source chord and new voicing"/);
  assert.match(piano, /<svg className="hud-chord-echo-figure"[\s\S]*role="img"/);
  assert.match(piano, />Freeze this relationship<\/button>/);
  assert.match(piano, />Reflect on source \+ voicing<\/button>/);
  assert.match(piano, /What remains if register, doubling, and starting pitch disappear\?/);
  assert.match(piano, /Fold into one octave/);
  assert.match(piano, /How did changing one position reshape the chord\?/);
  assert.match(piano, /Compare changed gaps/);
  assert.match(piano, /Delta labels show exactly which adjacent gaps gained or lost space/);
  assert.match(piano, /both closed loops still total 12/);
  assert.match(piano, /aria-pressed=\{octaveFoldRevealed\}/);
  assert.match(piano, /<svg className="hud-chord-fold-figure"[\s\S]*role="img"/);
  assert.match(piano, /comparison start is a canonical rotation, not a chord root or movable Do/);
  assert.match(piano, /This display-only view changes no MIDI, frequency, voicing, model, or listener report/);
  assert.match(piano, /holdBoundedExperienceSpecimen\("chord-voicing-echo", specimen\)/);
  assert.match(piano, /prompt\.replace\("this phrase", "this source-and-revoicing comparison"\)/);
  assert.match(piano, /sourceEvents: saved\.chordVoicingEchoSession\.sourceEvents\.map/);
  assert.match(piano, /aria-label="Five separate lenses for the source and replayed chord move"/);
  assert.match(piano, /<svg className="hud-chord-motion-figure"[\s\S]*role="img"/);
  assert.match(piano, />Freeze this two-chord move<\/button>/);
  assert.match(piano, />Reflect on source \+ replayed move<\/button>/);
  assert.match(piano, /holdBoundedExperienceSpecimen\("chord-motion-echo", specimen\)/);
  assert.match(piano, /prompt\.replace\("this phrase", "this source-and-replayed chord move"\)/);
  assert.match(piano, /sourceBeforeEvents: saved\.chordMotionEchoSession\.sourceBeforeEvents\.map/);
  assert.match(piano, /aria-label="Choose the replay's movable Do reference frame"/);
  assert.match(piano, />Does the tonal job travel when the reference frame travels\?</);
  assert.match(piano, />Keep Do fixed<\/button>/);
  assert.match(piano, />Move Do \{formatSemitones\(comparison\.transpositionSteps!, 0, true\)\}<\/button>/);
  assert.match(piano, /This is a display-only context counterfactual and never enters or sounds a note/);
  assert.match(piano, /replay Do moved \+ same route/);
  assert.match(piano, /restored the same relative-role path under this model; it did not prove the same heard function/);
  assert.match(piano, /The display-only Do counterfactual never supplies your report/);
  assert.match(piano, />What did this intended landing actually do\?</);
  assert.match(piano, /"Trace this landing"/);
  assert.match(piano, /aria-expanded=\{landingRevealed\}/);
  assert.match(piano, /aria-controls="hud-resolution-landing-panel"/);
  assert.match(piano, /<p className="sr-only" role="status" aria-live="polite">\{targetMatched/);
  assert.match(piano, /aria-label="Five separate lenses for the performed resolution landing"/);
  assert.match(piano, /The fork label named an intention, not a detected function or felt resolution/);
  assert.match(piano, /No lens proves that the fork resolved, caused a feeling, was stylistically correct, or was musically good/);
  assert.match(piano, /Pull is modeled distance still left before Do, so zero can mean arrival—not indifference/);
  assert.match(piano, /sourceEvent: \{ \.\.\.sourceEvent, fieldNotes: \[\.\.\.sourceEvent\.fieldNotes\] \}/);
  assert.match(piano, /!phraseEvents\.some\(\(event\) => event\.id === resolutionTarget\.sourceEvent!/);
  assert.match(piano, /holdBoundedExperienceSpecimen\("resolution-fork", specimen\)/);
  assert.match(piano, /prompt\.replace\("this phrase", "this intended landing in context"\)/);
  assert.match(piano, /aria-label="One-pause timing comparison"/);
  assert.match(piano, /Two performances of the same pitch path with one onset gap changed/);
  assert.match(piano, /hud-pause-reading" role="status" aria-live="polite"/);
  assert.match(piano, /"Trace the changed pause"/);
  assert.match(piano, /aria-expanded=\{pauseRevealed\}/);
  assert.match(piano, /aria-controls="hud-pause-mutation-detail"/);
  assert.match(piano, /Onset spacing and release-proven silence are separate/);
  assert.match(piano, /does not prove a phrase boundary, meter, expressive intention, emotion, preference, quality, or causal effect/);
  assert.match(piano, />Did the hands make the same time-shape\?</);
  assert.match(piano, /"Compare gesture timing"/);
  assert.match(piano, /aria-expanded=\{gestureTimingRevealed\}/);
  assert.match(piano, /aria-controls="hud-chord-gesture-detail"/);
  assert.match(piano, /<svg viewBox="0 0 720 150" role="img"/);
  assert.match(piano, /Missing releases remain unknown\. Velocity is an attack control, not measured acoustic loudness/);
  assert.match(piano, /does not infer meter, groove, intention, feeling, preference, or quality/);
  assert.match(piano, /sourceBeforeAttackEventIds: before\.gesture\.attacks\.map/);
  assert.match(piano, /version: 27/);
  assert.match(piano, /experienceOrigin === "phrase" \|\| experiencePhrase\.length < 3/);
  assert.match(piano, /landmarkLastMatchIdRef\.current = 0;\s+setExperienceOrigin\("phrase"\);\s+setExperienceContext\(null\);\s+setExperiencePhrase\(\[\]\);/);
  assert.match(piano, /<details className="hud-interval-tools">/);
  assert.match(piano, /Could these pitches nearly repeat inside one longer cycle\?/);
  assert.match(piano, />Find shared cycles<\/button>/);
  assert.match(piano, /role="img" aria-label=\{summary\}/);
  assert.match(piano, /Phases are reset together only for this visual comparison/);
  assert.match(piano, /Not a detected root, chord name, tonal function, acoustic fusion, consonance, emotion, or goodness/);
  assert.match(piano, /Reference-frequency height/);
  assert.match(piano, /Derived from MIDI key number at A4=440 Hz/);
  assert.match(piano, /pitch bend, instrument tuning, and audio pitch are not captured/);
  assert.match(piano, /Candidate shared periodicity · derived reference frequencies/);
  assert.match(ear, /MIDI supplies two key numbers and timing—not acoustic pitch or overtones/);
  assert.match(ear, /Pitch bend, instrument tuning, audio pitch, and your response are not captured/);
  assert.match(piano, /simultaneous partial-interaction comparison would answer the wrong question/);
  assert.match(css, /\.hud-echo-reading[\s\S]*grid-template-columns: repeat\(3/);
  assert.match(css, /\.hud-echo-experience button \{ justify-self: start/);
  assert.match(css, /\.hud-shared-cycle-choices button\[aria-pressed="true"\]/);
  assert.match(css, /@media \(max-width: 620px\)[\s\S]*\.hud-shared-cycle-reading \{ grid-template-columns: 1fr/);
  assert.match(css, /@media \(forced-colors: active\)[\s\S]*\.hud-shared-cycle-voice path \{ stroke: LinkText/);
  assert.match(css, /\.hud-chord-change-lenses,[\s\S]*\.hud-chord-echo,[\s\S]*\.hud-chord-motion-echo \{ min-width: 0/);
  assert.match(css, /\.hud-chord-question-options button\[aria-pressed="true"\]/);
  assert.match(css, /\.hud-chord-echo-node\.is-source[\s\S]*LinkText/);
  assert.match(css, /\.hud-chord-fold-test > button\[aria-pressed="true"\][\s\S]*background: var\(--foreground\)/);
  assert.match(css, /@media \(max-width: 620px\)[\s\S]*\.hud-chord-fold-test > button \{ width: 100%/);
  assert.match(css, /@media \(forced-colors: active\)[\s\S]*\.hud-chord-fold-figure \.is-attempt \.hud-chord-fold-node[\s\S]*HighlightText/);
  assert.match(css, /\.hud-chord-fold-segment\.is-changed[\s\S]*stroke-dasharray: 2 2/);
  assert.match(css, /@media \(forced-colors: active\)[\s\S]*\.hud-chord-fold-segment\.is-changed \{ stroke: Highlight/);
  assert.match(css, /\.hud-chord-motion-node\.is-source\.is-before[\s\S]*CanvasText/);
  assert.match(css, /\.hud-chord-motion-node\.is-attempt\.is-after[\s\S]*HighlightText/);
  assert.match(css, /\.hud-resolution-landing-node\.is-landing rect[\s\S]*var\(--piano-gold\)/);
  assert.match(css, /@media \(max-width: 620px\)[\s\S]*\.hud-resolution-feedback-actions button \{ width: 100%/);
  assert.match(css, /@media \(forced-colors: active\)[\s\S]*\.hud-resolution-landing-node\.is-landing rect \{ fill: Highlight/);
  assert.match(css, /\.hud-pause-link \.is-attempt \{ stroke-dasharray/);
  assert.match(css, /\.hud-pause-link\.is-changed line[\s\S]*var\(--piano-gold\)/);
  assert.match(css, /@media \(max-width: 620px\)[\s\S]*\.hud-pause-entry > button \{ width: 100%/);
  assert.match(css, /@media \(forced-colors: active\)[\s\S]*\.hud-pause-link\.is-changed line,[\s\S]*stroke: Highlight/);
  assert.match(css, /@media \(forced-colors: active\)[\s\S]*\.hud-pause-node\.is-attempt rect \{ stroke: LinkText/);
  assert.match(css, /\.hud-chord-gesture-test > button\[aria-expanded="true"\]/);
  assert.match(css, /\.hud-chord-gesture-hold\.is-pedal[\s\S]*stroke-dasharray/);
  assert.match(css, /@media \(max-width: 620px\)[\s\S]*\.hud-chord-gesture-test > button \{ width: 100%/);
  assert.match(css, /@media \(forced-colors: active\)[\s\S]*\.hud-chord-gesture-attack\.is-after \{ fill: Highlight/);
  assert.match(css, /\.hud-chord-frame-options button\[aria-pressed="true"\][\s\S]*background: var\(--foreground\)/);
  assert.match(css, /@media \(max-width: 620px\)[\s\S]*\.hud-chord-question-options \{ grid-template-columns: 1fr/);
  assert.match(css, /@media \(max-width: 620px\)[\s\S]*\.hud-chord-motion-actions button \{ width: 100%/);
  assert.match(css, /@media \(max-width: 620px\)[\s\S]*\.hud-chord-frame-options \{ width: 100%/);
  assert.match(css, /@media \(forced-colors: active\)[\s\S]*\.hud-chord-frame-options button\[aria-pressed="true"\][\s\S]*background: Highlight/);
  assert.match(css, /\.hud-last-lenses button:disabled/);
  assert.match(css, /@media \(max-width: 620px\)[\s\S]*\.hud-echo-reading \{ grid-template-columns: 1fr/);
  assert.match(css, /\.hud-last-attack-reading\.is-attributable[\s\S]*LinkText/);
  assert.match(css, /\.hud-last-lenses article\.is-modeled[\s\S]*Highlight/);
  assert.match(css, /\.hud-phrase-report-rows button\[aria-pressed="true"\][\s\S]*Highlight/);
  assert.match(css, /\.hud-landmark-counterfactual-report button\[aria-pressed="true"\][\s\S]*Highlight/);
  assert.match(css, /\.piano-key\.is-sonority-target/);
  assert.match(css, /\.hud-sonority-question\.has-change[\s\S]*border-left/);
  assert.match(css, /\.hud-pulse-status\.is-ready[\s\S]*border-left/);
  assert.match(css, /\.hud-pulse-onset[\s\S]*Highlight/);
  assert.match(css, /\.hud-breath-gate line[\s\S]*stroke-dasharray/);
  assert.match(css, /@media \(max-width: 620px\)[\s\S]*\.hud-motion-mode-nav button:last-child \{ grid-column: 1 \/ -1/);
  assert.match(css, /@media \(max-width: 620px\)[\s\S]*\.hud-breath-segments \{ grid-template-columns: 1fr/);
  assert.match(css, /@media \(forced-colors: active\)[\s\S]*\.hud-breath-gate line \{ stroke: Highlight/);
  assert.match(css, /@media \(forced-colors: active\)[\s\S]*\.hud-breath-event circle \{ fill: Canvas; stroke: CanvasText/);
  assert.match(css, /@media \(max-width: 620px\)[\s\S]*\.hud-breath-next > button \{ width: 100%/);
  assert.match(css, /@media \(forced-colors: active\)[\s\S]*\.hud-breath-next \{ border-left-color: LinkText/);
  assert.match(css, /\.hud-walk-route li\.is-current[\s\S]*box-shadow/);
  assert.match(css, /\.piano-key\.is-active,[\s\S]*Highlight/);
  assert.match(css, /\.rhythm-live-axis > span[\s\S]*background: LinkText/);
  assert.doesNotMatch(rhythm, /tabIndex=\{?[1-9]/);
  assert.match(css, /\.journey-live-thread > li\.is-known[\s\S]*border-color: LinkText/);
  assert.match(css, /\.journey-live-thread > li\.is-new[\s\S]*border-color: Highlight/);
  assert.match(css, /\.live-harmony-note\.is-previous[\s\S]*stroke: LinkText/);
  assert.match(css, /\.live-harmony-note\.is-current[\s\S]*fill: Highlight/);
  assert.match(css, /\.live-ear-roughness circle[\s\S]*stroke: Highlight/);
  assert.match(css, /\.live-ear-harmonicity rect[\s\S]*stroke: LinkText/);
  assert.match(css, /\.live-ear-fusion path[\s\S]*fill: Highlight/);
  assert.doesNotMatch(ear, /tabIndex=\{?[1-9]/);
  assert.doesNotMatch(harmony, /tabIndex=\{?[1-9]/);
  assert.doesNotMatch(journey, /tabIndex=\{?[1-9]/);
});
