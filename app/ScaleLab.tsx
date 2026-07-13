"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import {
  SCALE_PRESETS,
  SCALE_HEARING_PATHS,
  degreeEvidence,
  intervalStepRecipe,
  scaleDegrees,
  scaleFingerprint,
  stepFrequencyRatio,
} from "@/lib/scale-model";
import {
  SYNTH_MASTER_GAIN,
  configureSafetyCompressor,
  equalPowerMixGains,
  rmsMatchedHarmonicCoefficients,
} from "@/lib/audio-level";

type LessonId = "home" | "interval" | "pull";
type PresetId = (typeof SCALE_PRESETS)[number]["id"];
type EndingResponse = "finished" | "open" | "unclear";
type PullResponse = "home" | "elsewhere" | "unclear";

const LESSONS: { id: LessonId; number: string; title: string; promise: string }[] = [
  { id: "home", number: "01", title: "Find home", promise: "compare two endings" },
  { id: "interval", number: "02", title: "Build an interval", promise: "join the gaps between two pitches" },
  { id: "pull", number: "03", title: "Hear what comes next", promise: "practice expectation and inner hearing" },
];

const CONTEXT_PATHS: Record<PresetId, number[]> = {
  seven: [0, 2, 4, 3, 6],
  five: [0, 2, 3, 1, 4],
  whole: [0, 2, 4, 3, 5],
};

const THEORY_BRIDGES: Record<PresetId, { commonName: string; degrees: string; note: string }> = {
  seven: { commonName: "major scale / Ionian mode", degrees: "1 · 2 · 3 · 4 · 5 · 6 · 7", note: "One common Western-theory name for this particular gap order." },
  five: { commonName: "minor pentatonic", degrees: "1 · ♭3 · 4 · 5 · ♭7", note: "In one common chromatic movable-Do convention, Me and Te mean lowered Mi and Ti." },
  whole: { commonName: "whole-tone scale", degrees: "six equal medium gaps", note: "Its symmetry gives every degree the same local gap shape." },
};

function describeInteraction(roughness: number, overlap: number) {
  if (roughness > 0.38) return "more overtone crowding";
  if (overlap > 0.24) return "more overtone alignment";
  return "less overtone crowding";
}

function makeHarmonicWave(context: AudioContext) {
  const imaginary = rmsMatchedHarmonicCoefficients(10, 1.1627);
  return context.createPeriodicWave(new Float32Array(imaginary.length), imaginary, { disableNormalization: true });
}

function useScaleAudio(referenceHz: number, ratios: number[]) {
  const playbackRef = useRef<{ context: AudioContext; master: GainNode } | null>(null);
  const timersRef = useRef<number[]>([]);
  const [message, setMessage] = useState("Audio is off until you choose to listen.");
  const [isPlaying, setIsPlaying] = useState(false);
  const [activeDegrees, setActiveDegrees] = useState<number[]>([]);

  const shutdown = useCallback((updateState: boolean, messageText = "Audio stopped safely.") => {
    timersRef.current.forEach((timer) => window.clearTimeout(timer));
    timersRef.current = [];
    const playback = playbackRef.current;
    playbackRef.current = null;
    if (playback) {
      const now = playback.context.currentTime;
      playback.master.gain.cancelScheduledValues(now);
      playback.master.gain.setValueAtTime(Math.max(0.0001, playback.master.gain.value), now);
      playback.master.gain.exponentialRampToValueAtTime(0.0001, now + 0.035);
      window.setTimeout(() => void playback.context.close(), 45);
    }
    if (updateState) {
      setIsPlaying(false);
      setActiveDegrees([]);
      setMessage(messageText);
    }
  }, []);

  const stop = useCallback(() => shutdown(true), [shutdown]);
  useEffect(() => () => shutdown(false), [shutdown]);

  const playSequence = useCallback(async (
    indices: number[],
    options: { silentIndex?: number | null; simultaneous?: boolean; label: string },
  ) => {
    shutdown(true, `Preparing ${options.label}…`);
    if (!window.AudioContext) {
      setMessage("This browser does not provide the audio features this exercise needs.");
      return;
    }
    const context = new AudioContext();
    const master = context.createGain();
    master.gain.setValueAtTime(0.0001, context.currentTime);
    playbackRef.current = { context, master };
    setIsPlaying(true);
    try {
      await context.resume();
    } catch {
      if (playbackRef.current?.context !== context) return;
      playbackRef.current = null;
      void context.close();
      setIsPlaying(false);
      setMessage("Sound could not start in this browser. Try the listening action again.");
      return;
    }
    if (playbackRef.current?.context !== context || context.state === "closed") return;

    const compressor = context.createDynamicsCompressor();
    const wave = makeHarmonicWave(context);
    const now = context.currentTime;
    const audibleCount = Math.max(1, indices.length - (options.silentIndex == null ? 0 : 1));
    const simultaneousSourceGain = equalPowerMixGains(Array.from({ length: audibleCount }, () => 1))[0];
    configureSafetyCompressor(compressor, now);
    master.gain.setValueAtTime(0.0001, now);
    master.gain.linearRampToValueAtTime(SYNTH_MASTER_GAIN, now + 0.025);
    master.connect(compressor).connect(context.destination);

    indices.forEach((degreeIndex, sequenceIndex) => {
      const startOffset = options.simultaneous ? 0 : sequenceIndex * 0.44;
      if (sequenceIndex === options.silentIndex) {
        timersRef.current.push(window.setTimeout(() => setActiveDegrees([]), startOffset * 1000));
        return;
      }
      const start = now + startOffset;
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      const sourceGain = options.simultaneous ? simultaneousSourceGain : 1;
      oscillator.setPeriodicWave(wave);
      oscillator.frequency.setValueAtTime(referenceHz * (ratios[degreeIndex] ?? 1), start);
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.linearRampToValueAtTime(sourceGain, start + 0.018);
      gain.gain.setValueAtTime(sourceGain, start + 0.27);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.39);
      oscillator.connect(gain).connect(master);
      oscillator.start(start);
      oscillator.stop(start + 0.41);
      if (!options.simultaneous) {
        timersRef.current.push(window.setTimeout(() => {
          setActiveDegrees(sequenceIndex === options.silentIndex ? [] : [degreeIndex % (ratios.length - 1)]);
        }, startOffset * 1000));
      }
    });

    if (options.simultaneous) setActiveDegrees(indices.map((index) => index % (ratios.length - 1)));
    const duration = (options.simultaneous ? 520 : indices.length * 440) + 100;
    setMessage(`Playing ${options.label}.`);
    timersRef.current.push(window.setTimeout(() => {
      if (playbackRef.current?.context === context) {
        void context.close();
        playbackRef.current = null;
        setIsPlaying(false);
        setActiveDegrees([]);
        setMessage(`${options.label} complete.`);
      }
    }, duration));
  }, [referenceHz, ratios, shutdown]);

  return { activeDegrees, isPlaying, message, playSequence, stop };
}

export function ScaleLab({ onNavigate }: { onNavigate?: (destination: "piano") => void }) {
  const [lesson, setLesson] = useState<LessonId>("home");
  const [presetId, setPresetId] = useState<PresetId>("seven");
  const [referenceHz, setReferenceHz] = useState(220);
  const [selectedDegree, setSelectedDegree] = useState(4);
  const [endingResponse, setEndingResponse] = useState<EndingResponse | null>(null);
  const [pullResponse, setPullResponse] = useState<PullResponse | null>(null);
  const [pathIndex, setPathIndex] = useState(0);
  const [guess, setGuess] = useState<number | null>(null);
  const [revealed, setRevealed] = useState(false);
  const degreeRefs = useRef<Array<HTMLInputElement | null>>([]);

  const preset = SCALE_PRESETS.find((item) => item.id === presetId) ?? SCALE_PRESETS[0];
  const degrees = useMemo(() => scaleDegrees(preset.steps, preset.syllables), [preset]);
  const fingerprint = useMemo(() => scaleFingerprint(preset.steps), [preset]);
  const playbackRatios = useMemo(() => [...degrees.map((item) => item.ratio), 2], [degrees]);
  const audio = useScaleAudio(referenceHz, playbackRatios);
  const highDoIndex = degrees.length;
  const degree = degrees[Math.min(selectedDegree, degrees.length - 1)];
  const evidence = useMemo(() => degreeEvidence(referenceHz, degree), [referenceHz, degree]);
  const recipe = useMemo(() => intervalStepRecipe(preset.steps, degree.index), [preset.steps, degree.index]);
  const ascending = degrees.map((_, index) => index);
  const descending = [...ascending].reverse();
  const fullOrbit = [...ascending, highDoIndex, ...descending];
  const unfinishedOrbit = [...ascending, highDoIndex, ...descending.slice(0, -1)];
  const contextPath = CONTEXT_PATHS[presetId];
  const pullDegree = degrees[contextPath.at(-1) ?? degrees.length - 1];
  const currentChallenge = SCALE_HEARING_PATHS[presetId][pathIndex % SCALE_HEARING_PATHS[presetId].length];
  const currentPath = currentChallenge.path;
  const missingPosition = currentChallenge.missingPosition;
  const missingDegree = currentPath[missingPosition];
  const closingSegment = fingerprint.at(-1)!;

  const choosePreset = (id: PresetId) => {
    const nextPreset = SCALE_PRESETS.find((item) => item.id === id) ?? SCALE_PRESETS[0];
    setPresetId(id);
    setSelectedDegree(Math.min(4, nextPreset.steps.length - 1));
    setEndingResponse(null);
    setPullResponse(null);
    setPathIndex(0);
    setGuess(null);
    setRevealed(false);
    audio.stop();
  };

  const chooseLesson = (id: LessonId) => {
    setLesson(id);
    audio.stop();
  };

  const moveDegreeSelection = (current: number, direction: -1 | 1) => {
    const next = (current + direction + degrees.length) % degrees.length;
    audio.stop();
    setSelectedDegree(next);
    window.requestAnimationFrame(() => degreeRefs.current[next]?.focus());
  };

  const renderFingerprint = (highlightCount = -1) => (
    <div className="fingerprint-wrap">
      <ol className="step-fingerprint" aria-label={`Gap pattern from Do: ${fingerprint.map((segment, index) => `${segment.width} from ${preset.syllables[index]} to ${preset.syllables[(index + 1) % preset.syllables.length]}`).join("; ")}`}>
        {fingerprint.map((segment, index) => (
          <li key={`${segment.step}-${index}`} className={highlightCount >= 0 && index < highlightCount ? "is-on-path" : ""} style={{ flexGrow: segment.step }} aria-label={`${preset.syllables[index]} to ${preset.syllables[(index + 1) % preset.syllables.length]}: ${segment.width} gap, frequency multiplied by ${stepFrequencyRatio(segment.step).toFixed(3)}`}>
            <span>{segment.width}</span>
            <i aria-hidden="true" />
            <small>{preset.syllables[index]} → {preset.syllables[(index + 1) % preset.syllables.length]}</small>
          </li>
        ))}
      </ol>
      <p className="fingerprint-summary"><strong>Gap route:</strong> {fingerprint.map((segment) => segment.width).join(" · ")}</p>
    </div>
  );

  return (
    <section className="advanced-lab scale-lab learning-scale" aria-labelledby="scale-title">
      <div className="scale-intro">
        <div>
          <p className="section-kicker">Guided lesson · hear first, explain second</p>
          <h2 id="scale-title">Hear home. Build intervals. Predict what comes next.</h2>
          <p>A scale is a repeating path through pitch space. Each path starts on Do and reaches the next Do—twice the frequency—through its own pattern of gaps. Do means home in this path, not one fixed pitch. The syllables are a movable memory aid; the gaps are the physical map.</p>
        </div>
        <div className="scale-rule" role="note">
          <span>Keep three questions separate</span>
          <strong>How do the sounds interact? Where does the phrase seem to go? What do you like?</strong>
          <p>These answers can disagree. A rough sound can feel right; a smooth sound can feel unfinished. Listen before opening the measurements.</p>
        </div>
      </div>

      <nav className="scale-lesson-nav" aria-label="Scale lesson stages">
        {LESSONS.map((item) => (
          <button key={item.id} type="button" className={lesson === item.id ? "is-selected" : ""} aria-current={lesson === item.id ? "step" : undefined} onClick={() => chooseLesson(item.id)}>
            <span>{item.number}</span><strong>{item.title}</strong><small>{item.promise}</small>
          </button>
        ))}
      </nav>

      {lesson === "home" ? (
        <section className="scale-lesson home-lesson" aria-labelledby="home-lesson-title">
          <div className="lesson-heading">
            <span>01 · Find home</span>
            <h3 id="home-lesson-title">First, find home by ear.</h3>
            <p>The path rises to upper Do, then comes back down. Compare an ending on low Do with the same descent stopping one gap above it.</p>
          </div>

          <div className="home-lesson-grid">
            <fieldset className="scale-shape-choices">
              <legend>Choose a scale shape</legend>
              {SCALE_PRESETS.map((item) => (
                <label key={item.id} className={presetId === item.id ? "is-selected" : ""}>
                  <input type="radio" name="scale-shape" value={item.id} checked={presetId === item.id} onChange={() => choosePreset(item.id)} />
                  <strong>{item.name}</strong><small>{item.character}</small>
                </label>
              ))}
            </fieldset>

            <div className="home-route">
              <div className="home-route-line" aria-label={`${preset.name}: ${degrees.map((item) => item.syllable).join(", ")}, upper Do, then return`}>
                <strong>Do</strong><span aria-hidden="true">→</span><em>{degrees.slice(1).map((item) => item.syllable).join(" · ")}</em><span aria-hidden="true">→</span><strong>Do</strong>
              </div>
              <div className="home-playhead"><span>{audio.isPlaying ? "Now sounding" : "Route ready"}</span><strong>{audio.activeDegrees.length ? degrees[audio.activeDegrees[0]]?.syllable ?? "Do" : "Do"}</strong></div>
              {renderFingerprint()}
              <p>Longer bars mean larger pitch jumps. The full row spans one octave, from Do to the next Do.</p>
              <div className="primary-listen-actions">
                <button type="button" onClick={() => void audio.playSequence(fullOrbit, { label: "the scale ending on low Do" })}>Hear it end on low Do</button>
                <button type="button" onClick={() => void audio.playSequence(unfinishedOrbit, { label: "the scale stopping one gap above Do" })}>Hear it stop one gap above Do</button>
                {audio.isPlaying ? <button type="button" onClick={audio.stop}>Stop sound</button> : null}
              </div>
              <p className="audio-status" role="status" aria-live="polite">{audio.message}</p>
            </div>
          </div>

          <div className="prediction-prompt">
            <div><span>Notice before explanation</span><strong>Which ending felt more complete to you?</strong></div>
            <div className="response-choices" role="group" aria-label="Ending response">
              <button type="button" aria-pressed={endingResponse === "finished"} onClick={() => setEndingResponse("finished")}>Ends on low Do</button>
              <button type="button" aria-pressed={endingResponse === "open"} onClick={() => setEndingResponse("open")}>Stops above Do</button>
              <button type="button" aria-pressed={endingResponse === "unclear"} onClick={() => setEndingResponse("unclear")}>No clear difference</button>
            </div>
            {endingResponse ? <p className="response-feedback">{endingResponse === "finished" ? "Do sounded like home in this phrase. Repetition made it a reference point; that frequency is not inherently home." : endingResponse === "open" ? "The early stop felt complete to you. Home is shaped by phrase, style, and listener—not forced by the diagram." : "No strong home emerged. Try again; rhythm, duration, bass, repetition, and familiarity can make a center clearer."}</p> : null}
          </div>

          <div className="transpose-experiment">
            <div><span>Transposition test</span><h3>Move the whole route. Keep every relationship.</h3><p>Transposition moves every pitch together. The gap pattern and syllables stay the same; only the hertz values change.</p></div>
            <label>Move Do higher or lower <output>{referenceHz} Hz</output><input type="range" min="140" max="360" step="1" value={referenceHz} onChange={(event) => { audio.stop(); setReferenceHz(Number(event.target.value)); }} /></label>
            <button type="button" onClick={() => void audio.playSequence(fullOrbit, { label: `the same scale with Do at ${referenceHz} hertz` })}>Hear the same scale at this height</button>
          </div>

          <details className="theory-bridge physics-details">
            <summary>Optional bridge to conventional theory language</summary>
            <div><span>Common landmark</span><strong>{THEORY_BRIDGES[presetId].commonName}</strong><p>{THEORY_BRIDGES[presetId].degrees}. {THEORY_BRIDGES[presetId].note} The physical gap route remains the primary representation here.</p></div>
          </details>

          <div className="lesson-next"><span>Can you hear both endings and tell what stayed the same?</span><button type="button" onClick={() => chooseLesson("interval")}>Next: build an interval</button></div>
        </section>
      ) : lesson === "interval" ? (
        <section className="scale-lesson interval-lesson" aria-labelledby="interval-lesson-title">
          <div className="lesson-heading"><span>02 · Build an interval</span><h3 id="interval-lesson-title">An interval is the distance from one pitch to another.</h3><p>Select a second pitch and follow the highlighted gaps from Do. Try to hear the destination in your mind, then play the pitches one after another and at the same time.</p></div>

          <div className="scale-workbench">
            <div className="scale-orbit-panel">
              <div className="scale-panel-heading"><span>Choose a destination</span><h3>{preset.name}</h3><p>This circle spans one octave: frequency doubles from Do to the next Do. Each marker is a pitch in the chosen scale.</p></div>
              <fieldset className="scale-orbit">
                <legend className="sr-only">Select a movable scale degree</legend>
                <div className="orbit-center"><span>one octave</span><strong>×2</strong><small>returns as Do</small></div>
                {degrees.map((item) => {
                  const angle = item.cents / 1200 * 360;
                  return (
                    <label key={`${item.syllable}-${item.index}`} className={`${degree.index === item.index ? "is-selected" : ""} ${audio.activeDegrees.includes(item.index) ? "is-sounding" : ""}`} style={{ "--orbit-angle": `${angle}deg` } as CSSProperties}>
                      <input
                        ref={(node) => { degreeRefs.current[item.index] = node; }}
                        type="radio"
                        name="scale-degree"
                        value={item.index}
                        checked={degree.index === item.index}
                        onChange={() => { audio.stop(); setSelectedDegree(item.index); }}
                        onKeyDown={(event) => {
                          if (event.key === "ArrowLeft" || event.key === "ArrowUp") { event.preventDefault(); moveDegreeSelection(item.index, -1); }
                          if (event.key === "ArrowRight" || event.key === "ArrowDown") { event.preventDefault(); moveDegreeSelection(item.index, 1); }
                        }}
                      />
                      <strong>{item.syllable}</strong><span>{item.index === 0 ? "home" : `${Math.round(item.cents)}¢`}</span>
                    </label>
                  );
                })}
              </fieldset>
              {renderFingerprint(degree.index)}
              <div className="interval-recipe">
                <span>From Do to {degree.syllable}</span>
                <strong>{recipe.length === 0 ? "same pitch" : recipe.map((segment) => segment.width).join(" + ")}</strong>
              </div>
            </div>

            <div className="degree-inspector">
              <div className="scale-panel-heading"><span>Listen before measuring</span><h3>Do → {degree.syllable}</h3><p>{degree.index === 0 ? "You selected Do itself." : `Follow the highlighted gaps from Do to ${degree.syllable}.`}</p></div>
              <div className="presentation-contrast">
                <article><span>One after another</span><strong>compare through memory</strong><p>Your ear compares the second pitch with its memory of the first. Direction and distance shape what you hear.</p><button type="button" onClick={() => void audio.playSequence([0, degree.index], { label: `Do followed by ${degree.syllable}` })}>Hear Do, then {degree.syllable}</button></article>
                <article><span>At the same time</span><strong>{describeInteraction(evidence.roughness, evidence.overlap)}</strong><p>Now the sounds overlap, so their overtones can reinforce or crowd one another.</p><button type="button" onClick={() => void audio.playSequence([0, degree.index], { simultaneous: true, label: `Do and ${degree.syllable} together` })}>Hear Do and {degree.syllable} together</button></article>
              </div>
              {audio.isPlaying ? <button type="button" className="stop-audio" onClick={audio.stop}>Stop sound</button> : null}
              <p className="audio-status" role="status" aria-live="polite">{audio.message}</p>

              <div className="neighbor-geometry">
                <span>A nearby gap does not decide what comes next</span>
                <p><strong>Into {degree.syllable}:</strong> {degree.index === 0 ? "the path returns from the last pitch" : fingerprint[degree.index - 1].width} gap. <strong>Forward:</strong> {fingerprint[degree.index].width} gap toward {degrees[(degree.index + 1) % degrees.length].syllable}. A smaller next gap makes a shorter move available. The phrase decides whether it feels expected.</p>
              </div>

              <details className="physics-details">
                <summary>Show the numbers and sound model</summary>
                <dl>
                  <div><dt>pitch distance</dt><dd><strong>{Math.round(degree.cents)} cents</strong><span>ratio {degree.ratio.toFixed(4)} : 1</span></dd></div>
                  <div><dt>frequencies played</dt><dd><strong>{referenceHz} → {evidence.targetHz.toFixed(1)} Hz</strong><span>changes when transposed</span></dd></div>
                  <div><dt>nearest simple ratio</dt><dd><strong>{evidence.approximation.numerator}:{evidence.approximation.denominator}</strong><span>{Math.abs(evidence.approximation.errorCents).toFixed(1)} cents away</span></dd></div>
                  <div><dt>overtone-interaction model</dt><dd><strong>crowding {Math.round(evidence.roughness * 100)}% · alignment {Math.round(evidence.overlap * 100)}%</strong><span>not a quality or tension score</span></dd></div>
                </dl>
              </details>
            </div>
          </div>
          <div className="lesson-next"><span>Can you hear the difference between pitches in sequence and pitches together?</span><button type="button" onClick={() => chooseLesson("pull")}>Next: hear what comes next</button></div>
        </section>
      ) : (
        <section className="scale-lesson pull-lesson" aria-labelledby="pull-lesson-title">
          <div className="lesson-heading"><span>03 · Hear what comes next</span><h3 id="pull-lesson-title">A pitch gets its musical role from what comes before and after.</h3><p>Hear the same pitch alone, at the end of a phrase, and with one possible continuation. Then report what you expected.</p></div>

          <div className="context-experiment">
            <div className="context-path" aria-label={`Context path ${contextPath.map((index) => degrees[index].syllable).join(", ")}, optionally continuing to upper Do`}>
              {contextPath.map((index, position) => <div key={`${index}-${position}`} className={position === contextPath.length - 1 ? "is-target" : ""}><span>{degrees[index].syllable}</span><small>{position === 0 ? "home cue" : position === contextPath.length - 1 ? "same target" : "context"}</small></div>)}
              <i aria-hidden="true">→</i><div className="is-possible"><span>Do?</span><small>one continuation</small></div>
            </div>
            <div className="context-actions">
              <button type="button" onClick={() => void audio.playSequence([pullDegree.index], { label: `${pullDegree.syllable} alone` })}>1 · Hear {pullDegree.syllable} alone</button>
              <button type="button" onClick={() => void audio.playSequence(contextPath, { label: `a phrase stopping on ${pullDegree.syllable}` })}>2 · Hear the phrase stop on {pullDegree.syllable}</button>
              <button type="button" onClick={() => void audio.playSequence([...contextPath, highDoIndex], { label: "the same phrase continuing to upper Do" })}>3 · Hear the phrase continue to Do</button>
              {audio.isPlaying ? <button type="button" onClick={audio.stop}>Stop sound</button> : null}
            </div>
            <p className="audio-status" role="status" aria-live="polite">{audio.message}</p>
            <div className="prediction-prompt">
              <div><span>What did you anticipate?</span><strong>After the phrase stopped on {pullDegree.syllable}, what did you expect next?</strong></div>
              <div className="response-choices" role="group" aria-label="Expected continuation">
                <button type="button" aria-pressed={pullResponse === "home"} onClick={() => setPullResponse("home")}>Toward Do</button>
                <button type="button" aria-pressed={pullResponse === "elsewhere"} onClick={() => setPullResponse("elsewhere")}>Somewhere else</button>
                <button type="button" aria-pressed={pullResponse === "unclear"} onClick={() => setPullResponse("unclear")}>No clear pull</button>
              </div>
              {pullResponse ? <p className="response-feedback">{pullResponse === "home" ? `Do is only one ${closingSegment.width} gap away, but distance alone does not create the pull. Repetition and learned phrase patterns help make Do feel expected.` : pullResponse === "elsewhere" ? "You expected another route. A pitch has no fixed destination; the phrase, style, and your listening history shape what feels likely." : "No clear pull is informative. Repetition, bass, duration, rhythm, style, and attention can make a center clearer."}</p> : null}
            </div>
          </div>

          <div className="inner-hearing">
            <div className="inner-hearing-copy"><span>Inner hearing · hear it in your mind first</span><h3>Imagine the missing pitch before the app answers.</h3><ol><li>Play the full phrase.</li><li>Play it again with a gap.</li><li>Imagine or hum the missing pitch.</li><li>Choose the matching movable syllable, then hear it restored in the phrase.</li></ol></div>
            <div className="hearing-practice">
              <div className="hearing-path" aria-label="Inner hearing phrase">
                {currentPath.map((degreeIndex, index) => <div key={`${degreeIndex}-${index}`} className={index === missingPosition ? "is-missing" : ""}><span>{index === missingPosition && !revealed ? "?" : degrees[degreeIndex].syllable}</span><small>{index === missingPosition ? "imagine" : index === 0 ? "home" : "hear"}</small></div>)}
              </div>
              <div className="inner-hearing-actions">
                <button type="button" onClick={() => { setRevealed(true); void audio.playSequence(currentPath, { label: "the complete inner-hearing phrase" }); }}>Play the full phrase</button>
                <button type="button" onClick={() => { setGuess(null); setRevealed(false); void audio.playSequence(currentPath, { silentIndex: missingPosition, label: "the phrase with one silent degree" }); }}>Play it with a gap</button>
              </div>
              <fieldset className="degree-guess"><legend>Which degree did you imagine?</legend>{degrees.map((item) => <label key={item.syllable} className={guess === item.index ? "is-selected" : ""}><input type="radio" name="degree-guess" value={item.index} checked={guess === item.index} onChange={() => setGuess(item.index)} />{item.syllable}</label>)}</fieldset>
              <div className="inner-hearing-actions">
                <button type="button" disabled={guess === null} onClick={() => { setRevealed(true); void audio.playSequence(currentPath, { label: "the answer restored inside the phrase" }); }}>Reveal and replay the answer</button>
                {revealed && guess !== null ? <button type="button" onClick={() => void audio.playSequence([guess, missingDegree], { label: "your choice followed by the answer" })}>Hear my choice, then the answer</button> : null}
                <button type="button" onClick={() => { setPathIndex((value) => (value + 1) % SCALE_HEARING_PATHS[presetId].length); setGuess(null); setRevealed(false); audio.stop(); }}>New phrase</button>
              </div>
              {revealed && guess !== null ? <p className="response-feedback" aria-live="polite">{guess === missingDegree ? `Your imagined ${degrees[guess].syllable} matched the restored phrase. Move Do and try to keep the same relationship in mind.` : `You imagined ${degrees[guess].syllable}; the phrase restores ${degrees[missingDegree].syllable}. Listen to how each pitch relates to Do, then try the gap again.`}</p> : null}
            </div>
          </div>

          <div className="scale-takeaway"><span>What carries into other music</span><strong>Move every pitch together and the scale is transposed. Change the gap pattern or phrase, and its musical role can change.</strong><p>The gaps describe pitch relationships. The phrase builds expectation. Overlapping overtones shape simultaneous sound. Your listening history and purpose shape your response.</p>{onNavigate ? <button type="button" onClick={() => onNavigate("piano")}>Bring these relationships to a piano</button> : null}</div>
        </section>
      )}
    </section>
  );
}
