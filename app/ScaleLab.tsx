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

type LessonId = "home" | "interval" | "pull";
type PresetId = (typeof SCALE_PRESETS)[number]["id"];
type EndingResponse = "finished" | "open" | "unclear";
type PullResponse = "home" | "elsewhere" | "unclear";

const LESSONS: { id: LessonId; number: string; title: string; promise: string }[] = [
  { id: "home", number: "01", title: "Feel home", promise: "hear a scale close" },
  { id: "interval", number: "02", title: "Walk distance", promise: "build intervals from gaps" },
  { id: "pull", number: "03", title: "Predict motion", promise: "hear context and imagine" },
];

const CONTEXT_PATHS: Record<PresetId, number[]> = {
  seven: [0, 2, 4, 3, 6],
  five: [0, 2, 3, 1, 4],
  whole: [0, 2, 4, 3, 5],
};

const THEORY_BRIDGES: Record<PresetId, { commonName: string; degrees: string; note: string }> = {
  seven: { commonName: "major scale / Ionian mode", degrees: "1 · 2 · 3 · 4 · 5 · 6 · 7", note: "One common Western-theory name for this particular gap order." },
  five: { commonName: "minor pentatonic", degrees: "1 · ♭3 · 4 · 5 · ♭7", note: "In one common chromatic movable-Do convention, Me and Te mean lowered Mi and Ti." },
  whole: { commonName: "whole-tone scale", degrees: "six equal middle gaps", note: "Its symmetry gives every degree the same local gap geometry." },
};

function describeInteraction(roughness: number, overlap: number) {
  if (roughness > 0.38) return "these harmonic spectra interact more strongly";
  if (overlap > 0.24) return "several upper partials align";
  return "these harmonic spectra are less crowded";
}

function makeHarmonicWave(context: AudioContext) {
  const real = new Float32Array(11);
  const imaginary = new Float32Array(11);
  for (let partial = 1; partial < imaginary.length; partial += 1) {
    imaginary[partial] = 1 / partial ** 1.1627;
  }
  return context.createPeriodicWave(real, imaginary, { disableNormalization: false });
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
    compressor.threshold.setValueAtTime(-15, now);
    compressor.ratio.setValueAtTime(7, now);
    master.gain.setValueAtTime(0.0001, now);
    master.gain.linearRampToValueAtTime(0.075, now + 0.025);
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
      oscillator.setPeriodicWave(wave);
      oscillator.frequency.setValueAtTime(referenceHz * (ratios[degreeIndex] ?? 1), start);
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.linearRampToValueAtTime(0.65, start + 0.018);
      gain.gain.setValueAtTime(0.65, start + 0.27);
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

export function ScaleLab() {
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
      <ol className="step-fingerprint" aria-label={`Adjacent gap pattern: ${fingerprint.map((segment) => segment.width).join(", ")}`}>
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
          <p className="section-kicker">A guided ear lesson · relationships before names</p>
          <h2 id="scale-title">Hear home. Walk gaps. Predict motion.</h2>
          <p>A scale is an octave-closing route made from unequal frequency gaps. This lesson uses one movable-Do convention to name the home relationship—not an absolute pitch—so the route can move higher or lower without losing its shape.</p>
        </div>
        <div className="scale-rule" role="note">
          <span>The listening rule</span>
          <strong>physical interaction ≠ contextual pull ≠ musical value</strong>
          <p>This lesson lets you hear each layer before opening its measurements. Your response is evidence too; there is no universal goodness score.</p>
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
            <span>01 · Feel home</span>
            <h3 id="home-lesson-title">First hear a route close.</h3>
            <p>Listen once without analyzing. Compare the same route when it returns to Do and when it stops one step early.</p>
          </div>

          <div className="home-lesson-grid">
            <fieldset className="scale-shape-choices">
              <legend>Choose a gap shape</legend>
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
              <p>Bar length is logarithmic frequency distance. The same physical gap keeps the same name everywhere: close (100¢), middle (200¢), or open (300¢).</p>
              <div className="primary-listen-actions">
                <button type="button" onClick={() => void audio.playSequence(fullOrbit, { label: "the complete orbit and return" })}>Hear the complete route</button>
                <button type="button" onClick={() => void audio.playSequence(unfinishedOrbit, { label: "the route stopping before home" })}>Hear it stop before Do</button>
                {audio.isPlaying ? <button type="button" onClick={audio.stop}>Stop sound</button> : null}
              </div>
              <p className="audio-status" role="status" aria-live="polite">{audio.message}</p>
            </div>
          </div>

          <div className="prediction-prompt">
            <div><span>Notice before explanation</span><strong>Which ending felt more complete to you?</strong></div>
            <div className="response-choices" role="group" aria-label="Ending response">
              <button type="button" aria-pressed={endingResponse === "finished"} onClick={() => setEndingResponse("finished")}>Return to Do</button>
              <button type="button" aria-pressed={endingResponse === "open"} onClick={() => setEndingResponse("open")}>Stop before Do</button>
              <button type="button" aria-pressed={endingResponse === "unclear"} onClick={() => setEndingResponse("unclear")}>No clear difference</button>
            </div>
            {endingResponse ? <p className="response-feedback">{endingResponse === "finished" ? "You heard closure after recurrence made Do a reference. That is contextual evidence—not proof that Do is physically better." : endingResponse === "open" ? "You heard the early stop as its own ending. Your response can differ from a style-based expectation; replay and notice what the phrase history changes." : "An unclear center is a valid result. Repetition, duration, rhythm, bass, familiarity, and attention can all strengthen or weaken home."}</p> : null}
          </div>

          <div className="transpose-experiment">
            <div><span>Transposition test</span><h3>Move the whole route. Keep every relationship.</h3><p>This is transposition: only the absolute frequencies change. The gap order, ratios, syllables, and phrase identity stay fixed.</p></div>
            <label>Move Do higher or lower <output>{referenceHz} Hz</output><input type="range" min="140" max="360" step="1" value={referenceHz} onChange={(event) => { audio.stop(); setReferenceHz(Number(event.target.value)); }} /></label>
            <button type="button" onClick={() => void audio.playSequence(fullOrbit, { label: `the same orbit with Do at ${referenceHz} hertz` })}>Replay the same shape here</button>
          </div>

          <details className="theory-bridge physics-details">
            <summary>Optional bridge to conventional theory language</summary>
            <div><span>Common landmark</span><strong>{THEORY_BRIDGES[presetId].commonName}</strong><p>{THEORY_BRIDGES[presetId].degrees}. {THEORY_BRIDGES[presetId].note} The physical gap route remains the primary representation here.</p></div>
          </details>

          <div className="lesson-next"><span>Can you hear closure and explain what stayed invariant?</span><button type="button" onClick={() => chooseLesson("interval")}>Next · walk an interval</button></div>
        </section>
      ) : lesson === "interval" ? (
        <section className="scale-lesson interval-lesson" aria-labelledby="interval-lesson-title">
          <div className="lesson-heading"><span>02 · Walk distance</span><h3 id="interval-lesson-title">An interval is a journey through adjacent gaps.</h3><p>Select a destination. First imagine it from Do, then hear it across time and together. Those two presentations support different explanations.</p></div>

          <div className="scale-workbench">
            <div className="scale-orbit-panel">
              <div className="scale-panel-heading"><span>Choose a destination</span><h3>{preset.name}</h3><p>The orbit chooses frequency doubling (2:1) as its cycle and realizes it in twelve equal logarithmic slices. Useful—not universal.</p></div>
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
                <span>Do → {degree.syllable} crosses</span>
                <strong>{recipe.length === 0 ? "no gap · same degree" : recipe.map((segment) => segment.width).join(" + ")}</strong>
              </div>
            </div>

            <div className="degree-inspector">
              <div className="scale-panel-heading"><span>Listen before measuring</span><h3>Do → {degree.syllable}</h3><p>{degree.index === 0 ? "You selected the reference itself." : `This journey covers ${Math.round(degree.cents / 12)}% of the octave.`}</p></div>
              <div className="presentation-contrast">
                <article><span>Across time · melodic</span><strong>memory + contour + distance</strong><p>The tones do not overlap, so simultaneous spectral roughness is not the explanation.</p><button type="button" onClick={() => void audio.playSequence([0, degree.index], { label: `the melodic interval Do to ${degree.syllable}` })}>Imagine, then hear Do → {degree.syllable}</button></article>
                <article><span>Together · simultaneous</span><strong>{describeInteraction(evidence.roughness, evidence.overlap)}</strong><p>Here the ten-partial harmonic spectra overlap in the ear-model realization.</p><button type="button" onClick={() => void audio.playSequence([0, degree.index], { simultaneous: true, label: `Do and ${degree.syllable} together` })}>Hear Do + {degree.syllable}</button></article>
              </div>
              {audio.isPlaying ? <button type="button" className="stop-audio" onClick={audio.stop}>Stop sound</button> : null}
              <p className="audio-status" role="status" aria-live="polite">{audio.message}</p>

              <div className="neighbor-geometry">
                <span>Local geometry—not tonal pull</span>
                <p><strong>Into {degree.syllable}:</strong> {degree.index === 0 ? "the prior orbit closes from the last degree" : fingerprint[degree.index - 1].width} gap. <strong>Forward:</strong> {fingerprint[degree.index].width} gap toward {degrees[(degree.index + 1) % degrees.length].syllable}. Small motion affords continuation; context decides whether it feels expected.</p>
              </div>

              <details className="physics-details">
                <summary>Inspect the physical realization</summary>
                <dl>
                  <div><dt>log distance</dt><dd><strong>{Math.round(degree.cents)} cents</strong><span>ratio {degree.ratio.toFixed(4)} : 1</span></dd></div>
                  <div><dt>absolute frequencies</dt><dd><strong>{referenceHz} → {evidence.targetHz.toFixed(1)} Hz</strong><span>changes when transposed</span></dd></div>
                  <div><dt>nearby rational approximation</dt><dd><strong>{evidence.approximation.numerator}:{evidence.approximation.denominator}</strong><span>{Math.abs(evidence.approximation.errorCents).toFixed(1)} cents away</span></dd></div>
                  <div><dt>simultaneous teaching model</dt><dd><strong>interaction {Math.round(evidence.roughness * 100)}% · overlap {Math.round(evidence.overlap * 100)}%</strong><span>not calibrated quality or tension scores</span></dd></div>
                </dl>
              </details>
            </div>
          </div>
          <div className="lesson-next"><span>Can you distinguish a melodic interval from overlapping spectra?</span><button type="button" onClick={() => chooseLesson("pull")}>Next · hear contextual pull</button></div>
        </section>
      ) : (
        <section className="scale-lesson pull-lesson" aria-labelledby="pull-lesson-title">
          <div className="lesson-heading"><span>03 · Predict motion</span><h3 id="pull-lesson-title">A pitch becomes meaningful inside a path.</h3><p>The same target can feel different alone, after a home-setting phrase, or when the phrase continues. Listen, report your experience, then inspect the explanation.</p></div>

          <div className="context-experiment">
            <div className="context-path" aria-label={`Context path ${contextPath.map((index) => degrees[index].syllable).join(", ")}, optionally continuing to upper Do`}>
              {contextPath.map((index, position) => <div key={`${index}-${position}`} className={position === contextPath.length - 1 ? "is-target" : ""}><span>{degrees[index].syllable}</span><small>{position === 0 ? "home cue" : position === contextPath.length - 1 ? "same target" : "context"}</small></div>)}
              <i aria-hidden="true">→</i><div className="is-possible"><span>Do?</span><small>one continuation</small></div>
            </div>
            <div className="context-actions">
              <button type="button" onClick={() => void audio.playSequence([pullDegree.index], { label: `${pullDegree.syllable} alone` })}>1 · Hear {pullDegree.syllable} alone</button>
              <button type="button" onClick={() => void audio.playSequence(contextPath, { label: `a phrase stopping on ${pullDegree.syllable}` })}>2 · Hear context stop there</button>
              <button type="button" onClick={() => void audio.playSequence([...contextPath, highDoIndex], { label: "the same phrase continuing to upper Do" })}>3 · Hear one continuation</button>
              {audio.isPlaying ? <button type="button" onClick={audio.stop}>Stop sound</button> : null}
            </div>
            <p className="audio-status" role="status" aria-live="polite">{audio.message}</p>
            <div className="prediction-prompt">
              <div><span>What did you anticipate?</span><strong>After the context stopped on {pullDegree.syllable}, where did your mind go?</strong></div>
              <div className="response-choices" role="group" aria-label="Expected continuation">
                <button type="button" aria-pressed={pullResponse === "home"} onClick={() => setPullResponse("home")}>Toward Do</button>
                <button type="button" aria-pressed={pullResponse === "elsewhere"} onClick={() => setPullResponse("elsewhere")}>Somewhere else</button>
                <button type="button" aria-pressed={pullResponse === "unclear"} onClick={() => setPullResponse("unclear")}>No clear pull</button>
              </div>
              {pullResponse ? <p className="response-feedback">{pullResponse === "home" ? `You heard a homeward possibility. The final ${closingSegment.width} gap makes that motion available, while repetition and learned phrase grammar help turn availability into expectation.` : pullResponse === "elsewhere" ? "You anticipated another route. That is exactly why the app reports context and listener response instead of assigning a fixed function to the interval." : "No clear pull is informative. A scale diagram cannot manufacture a tonal center; recurrence, bass, duration, rhythm, style, and attention help establish it."}</p> : null}
            </div>
          </div>

          <div className="inner-hearing">
            <div className="inner-hearing-copy"><span>Inner hearing · retrieval before reveal</span><h3>Hear the whole phrase, then supply one missing degree.</h3><ol><li>Hear the complete phrase.</li><li>Hear it again with a gap.</li><li>Imagine or hum the missing degree.</li><li>Choose a movable syllable, then replay the answer in context.</li></ol></div>
            <div className="hearing-practice">
              <div className="hearing-path" aria-label="Inner hearing phrase">
                {currentPath.map((degreeIndex, index) => <div key={`${degreeIndex}-${index}`} className={index === missingPosition ? "is-missing" : ""}><span>{index === missingPosition && !revealed ? "?" : degrees[degreeIndex].syllable}</span><small>{index === missingPosition ? "imagine" : index === 0 ? "home" : "hear"}</small></div>)}
              </div>
              <div className="inner-hearing-actions">
                <button type="button" onClick={() => { setRevealed(true); void audio.playSequence(currentPath, { label: "the complete inner-hearing phrase" }); }}>Hear the complete phrase</button>
                <button type="button" onClick={() => { setGuess(null); setRevealed(false); void audio.playSequence(currentPath, { silentIndex: missingPosition, label: "the phrase with one silent degree" }); }}>Hear it with a gap</button>
              </div>
              <fieldset className="degree-guess"><legend>Which degree did you imagine?</legend>{degrees.map((item) => <label key={item.syllable} className={guess === item.index ? "is-selected" : ""}><input type="radio" name="degree-guess" value={item.index} checked={guess === item.index} onChange={() => setGuess(item.index)} />{item.syllable}</label>)}</fieldset>
              <div className="inner-hearing-actions">
                <button type="button" disabled={guess === null} onClick={() => { setRevealed(true); void audio.playSequence(currentPath, { label: "the answer restored inside the phrase" }); }}>Check and hear the answer in context</button>
                {revealed && guess !== null ? <button type="button" onClick={() => void audio.playSequence([guess, missingDegree], { label: "your choice followed by the answer" })}>Compare my choice → answer</button> : null}
                <button type="button" onClick={() => { setPathIndex((value) => (value + 1) % SCALE_HEARING_PATHS[presetId].length); setGuess(null); setRevealed(false); audio.stop(); }}>Try another phrase</button>
              </div>
              {revealed && guess !== null ? <p className="response-feedback" aria-live="polite">{guess === missingDegree ? `Your imagined ${degrees[guess].syllable} matched the restored phrase. Now transpose Do and try to preserve the relationship.` : `You chose ${degrees[guess].syllable}; the phrase restores ${degrees[missingDegree].syllable}. Compare them, keep Do in memory, and try again—this is calibration, not a grade.`}</p> : null}
            </div>
          </div>

          <div className="scale-takeaway"><span>Transfer test</span><strong>Change Do’s height: same route. Change the route or context: different musical possibilities.</strong><p>Physical gap geometry gives you a transposable coordinate system. Sequence builds expectation. Spectrum changes simultaneous interaction. Your history, attention, and purpose shape what the result means.</p></div>
        </section>
      )}
    </section>
  );
}
