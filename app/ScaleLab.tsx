"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import {
  SCALE_PRESETS,
  degreeEvidence,
  rotateScale,
  scaleDegrees,
  scaleFingerprint,
} from "@/lib/scale-model";

const HEARING_PATHS = [
  [0, 2, 1, 4, 3, 0],
  [0, 1, 2, 4, 6, 0],
  [0, 4, 5, 4, 1, 0],
] as const;

function describeInteraction(roughness: number, overlap: number) {
  if (roughness > 0.38) return "more close spectral interaction in this realization";
  if (overlap > 0.24) return "more partial alignment in this realization";
  return "less modeled spectral crowding in this realization";
}

function useScaleAudio(referenceHz: number, ratios: number[]) {
  const contextRef = useRef<AudioContext | null>(null);
  const timersRef = useRef<number[]>([]);
  const [message, setMessage] = useState("Audio is off until you choose to listen.");

  const stop = useCallback(() => {
    timersRef.current.forEach((timer) => window.clearTimeout(timer));
    timersRef.current = [];
    if (contextRef.current) void contextRef.current.close();
    contextRef.current = null;
    setMessage("Audio stopped safely.");
  }, []);

  useEffect(() => stop, [stop]);

  const playSequence = useCallback(async (indices: number[], silentIndex: number | null = null, simultaneous = false) => {
    stop();
    if (!window.AudioContext) {
      setMessage("This browser does not provide the audio features this exercise needs.");
      return;
    }
    const context = new AudioContext();
    contextRef.current = context;
    setMessage(silentIndex === null ? "Preparing the complete path…" : "Preparing a path with one silent degree…");
    try {
      await context.resume();
    } catch {
      contextRef.current = null;
      void context.close();
      setMessage("Sound could not start in this browser. Try the listening action again.");
      return;
    }
    if (contextRef.current !== context || context.state === "closed") return;
    const master = context.createGain();
    const compressor = context.createDynamicsCompressor();
    const now = context.currentTime;
    compressor.threshold.setValueAtTime(-15, now);
    compressor.ratio.setValueAtTime(7, now);
    master.gain.setValueAtTime(0.0001, now);
    master.gain.linearRampToValueAtTime(0.09, now + 0.025);
    master.connect(compressor).connect(context.destination);

    indices.forEach((degreeIndex, sequenceIndex) => {
      if (sequenceIndex === silentIndex) return;
      const start = now + (simultaneous ? 0 : sequenceIndex * 0.44);
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      oscillator.type = "sine";
      oscillator.frequency.setValueAtTime(referenceHz * (ratios[degreeIndex] ?? 1), start);
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.linearRampToValueAtTime(0.72, start + 0.018);
      gain.gain.setValueAtTime(0.72, start + 0.27);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.39);
      oscillator.connect(gain).connect(master);
      oscillator.start(start);
      oscillator.stop(start + 0.41);
    });

    const duration = (simultaneous ? 520 : indices.length * 440) + 120;
    setMessage(simultaneous ? "Playing Do and the selected degree together." : silentIndex === null ? "Playing the complete path." : "One degree is silent. Hear it inwardly in the gap.");
    timersRef.current.push(window.setTimeout(() => {
      if (contextRef.current === context) {
        void context.close();
        contextRef.current = null;
        setMessage("Path complete.");
      }
    }, duration));
  }, [referenceHz, ratios, stop]);

  return { playSequence, stop, message };
}

export function ScaleLab() {
  const [presetId, setPresetId] = useState<(typeof SCALE_PRESETS)[number]["id"]>("seven");
  const [rotation, setRotation] = useState(0);
  const [referenceHz, setReferenceHz] = useState(220);
  const [selectedDegree, setSelectedDegree] = useState(4);
  const [pathIndex, setPathIndex] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const preset = SCALE_PRESETS.find((item) => item.id === presetId) ?? SCALE_PRESETS[0];
  const steps = useMemo(() => rotateScale(preset.steps, rotation), [preset.steps, rotation]);
  const syllables = preset.syllables;
  const degrees = useMemo(() => scaleDegrees(steps, syllables), [steps, syllables]);
  const fingerprint = useMemo(() => scaleFingerprint(steps), [steps]);
  const degree = degrees[Math.min(selectedDegree, degrees.length - 1)];
  const evidence = useMemo(() => degreeEvidence(referenceHz, degree), [referenceHz, degree]);
  const path = HEARING_PATHS[pathIndex].map((index) => index % degrees.length);
  const missingPosition = Math.min(4, path.length - 2);
  const audio = useScaleAudio(referenceHz, degrees.map((item) => item.ratio));

  const changePreset = (id: (typeof SCALE_PRESETS)[number]["id"]) => {
    setPresetId(id);
    setRotation(0);
    setSelectedDegree(0);
    setRevealed(false);
    audio.stop();
  };

  return (
    <section className="advanced-lab scale-lab" aria-labelledby="scale-title">
      <div className="scale-intro">
        <div>
          <p className="section-kicker">Movable Do · a coordinate system, not a fixed pitch</p>
          <h2 id="scale-title">Learn the shape of a scale without note letters.</h2>
          <p>Do is wherever you place home. Re, Mi, Fa, Sol, La, and Ti name relationships to that home, so the same pattern survives transposition. The orbit shows the unequal physical frequency gaps that make a scale recognizable.</p>
        </div>
        <div className="scale-rule" role="note">
          <span>Keep three layers separate</span>
          <strong>frequency interaction ≠ structural pull ≠ musical value</strong>
          <p>Sensory interaction depends on spectrum and register. Pull depends on what came before and what feels like home. “Good” depends on listener, style, and purpose.</p>
        </div>
      </div>

      <div className="scale-controls" aria-label="Scale controls">
        <fieldset>
          <legend>Choose an orbit</legend>
          {SCALE_PRESETS.map((item) => (
            <button key={item.id} type="button" className={presetId === item.id ? "is-selected" : ""} aria-pressed={presetId === item.id} onClick={() => changePreset(item.id)}>{item.name}</button>
          ))}
        </fieldset>
        <label>
          Place Do in your range
          <span><strong>{referenceHz} Hz</strong> changes embodiment, not the interval pattern</span>
          <input type="range" min="140" max="360" step="1" value={referenceHz} onChange={(event) => setReferenceHz(Number(event.target.value))} />
        </label>
        <button type="button" onClick={() => {
          setRotation((value) => (value + 1) % steps.length);
          setSelectedDegree(0);
        }}>Move Do to the next landmark</button>
      </div>

      <div className="scale-workbench">
        <div className="scale-orbit-panel">
          <div className="scale-panel-heading">
            <span>Octave orbit</span>
            <h3>{preset.name}</h3>
            <p>{preset.character}</p>
          </div>
          <div className="scale-orbit" role="group" aria-label={`${preset.name}. Select a movable scale degree.`}>
            <div className="orbit-center"><span>same pattern</span><strong>×2 frequency</strong><small>returns as Do</small></div>
            {degrees.map((item) => {
              const angle = item.cents / 1200 * 360;
              return (
                <button
                  key={`${item.syllable}-${item.index}`}
                  type="button"
                  className={degree.index === item.index ? "is-selected" : ""}
                  aria-pressed={degree.index === item.index}
                  aria-label={`${item.syllable}, ${Math.round(item.cents)} cents above Do`}
                  style={{ "--orbit-angle": `${angle}deg` } as CSSProperties}
                  onClick={() => setSelectedDegree(item.index)}
                >
                  <strong>{item.syllable}</strong><span>{item.index === 0 ? "home" : `${Math.round(item.cents)}¢`}</span>
                </button>
              );
            })}
          </div>
          <div className="step-fingerprint" aria-label={`Step fingerprint ${steps.join(", ")}`}>
            {fingerprint.map((segment, index) => (
              <div key={`${segment.step}-${index}`} style={{ flexGrow: segment.step }}>
                <span>{segment.width}</span>
                <i aria-hidden="true" />
                <small>{syllables[index]} → {syllables[(index + 1) % syllables.length]}</small>
              </div>
            ))}
          </div>
          <p className="fingerprint-note">The rail replaces “{steps.join("-")}” with physical geometry: segment length is proportional to logarithmic frequency distance. Rotating Do changes the starting point, not the cyclic shape.</p>
        </div>

        <div className="degree-inspector" aria-live="polite">
          <div className="scale-panel-heading"><span>Selected relationship</span><h3>{degree.syllable} relative to Do</h3><p>One equal-division realization, plus a nearby small-integer landmark.</p></div>
          <dl>
            <div><dt>transposable relation</dt><dd><strong>{Math.round(degree.cents)} cents</strong><span>ratio {degree.ratio.toFixed(4)} : 1</span></dd></div>
            <div><dt>this embodiment</dt><dd><strong>{evidence.targetHz.toFixed(1)} Hz</strong><span>Do is {referenceHz} Hz</span></dd></div>
            <div><dt>nearby harmonic landmark</dt><dd><strong>{evidence.approximation.numerator}:{evidence.approximation.denominator}</strong><span>{Math.abs(evidence.approximation.errorCents).toFixed(1)} cents away</span></dd></div>
          </dl>
          <div className="causal-reading">
            <div><span>physical model</span><strong>{describeInteraction(evidence.roughness, evidence.overlap)}</strong><p>Harmonic-spectrum roughness {Math.round(evidence.roughness * 100)}% · partial overlap {Math.round(evidence.overlap * 100)}%. These are teaching-model outputs, not quality scores.</p></div>
            <i aria-hidden="true">→</i>
            <div><span>scale context</span><strong>{degree.index === 0 ? "the declared home" : steps[degree.index - 1] <= 1 ? "arrives by a narrow step" : "arrives across a wider step"}</strong><p>Its felt stability can change when the melody, bass, rhythm, style, or learned expectations change.</p></div>
            <i aria-hidden="true">→</i>
            <div><span>musical judgment</span><strong>listen for fit, not a goodness number</strong><p>Friction can be beautiful; smoothness can be dull. Musicality lives in how a relationship behaves through time.</p></div>
          </div>
          <div className="degree-actions">
            <button type="button" onClick={() => void audio.playSequence([0, degree.index])}>Hear Do → {degree.syllable}</button>
            <button type="button" onClick={() => void audio.playSequence([0, degree.index], null, true)}>Hear Do + {degree.syllable}</button>
          </div>
        </div>
      </div>

      <div className="inner-hearing">
        <div className="inner-hearing-copy">
          <span>Inner hearing · imagine before reveal</span>
          <h3>Can you continue the orbit silently?</h3>
          <p>Hear the path with one degree missing. Keep Do as the felt center, imagine the tone in the gap, then reveal and compare. Accuracy grows from prediction and correction—not from memorizing letters.</p>
          <p className="audio-status" role="status">{audio.message}</p>
        </div>
        <div className="hearing-path" aria-label="Inner hearing path">
          {path.map((degreeIndex, index) => (
            <div key={`${degreeIndex}-${index}`} className={index === missingPosition ? "is-missing" : ""}>
              <span>{index === missingPosition && !revealed ? "?" : degrees[degreeIndex].syllable}</span>
              <small>{index === missingPosition ? "imagine" : index === 0 ? "home" : "hear"}</small>
            </div>
          ))}
        </div>
        <div className="inner-hearing-actions">
          <button type="button" onClick={() => { setRevealed(false); void audio.playSequence(path, missingPosition); }}>Hear with a gap</button>
          <button type="button" onClick={() => { setRevealed(true); void audio.playSequence([path[missingPosition]]); }}>Reveal the missing degree</button>
          <button type="button" onClick={() => { setPathIndex((value) => (value + 1) % HEARING_PATHS.length); setRevealed(false); audio.stop(); }}>Try another path</button>
        </div>
      </div>

      <div className="scale-takeaway">
        <span>Transfer test</span>
        <strong>Move Do, change the absolute frequencies, and the orbit’s relationships remain.</strong>
        <p>That invariance is the theory. The changed register and spectrum are the embodiment. The melody’s history supplies expectation. Your response supplies the final layer.</p>
      </div>
    </section>
  );
}
