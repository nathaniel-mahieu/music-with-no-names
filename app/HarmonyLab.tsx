"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  centsFromRatio,
  findCoincidingPartials,
  harmonicBasis,
  harmonicPartials,
  equalDivisionApproximation,
  interpolateRatioLogarithmically,
  primeExponentCoordinates,
  voiceLeadingDistance,
} from "@/lib/music-math";
import {
  sonorityAffordances,
  sonorityPerceptionModel,
} from "@/lib/sonority-model";

type HarmonyAudioNodes = {
  context: AudioContext;
  master: GainNode;
  oscillators: OscillatorNode[];
  gains: GainNode[];
};

type VoiceSetting = { octave: number; amplitude: number; partialCount: number };

const HARMONY_PRESETS = [
  {
    label: "4:5:6:7",
    ratios: [1, 5 / 4, 3 / 2, 7 / 4],
    note: "dense shared origin · colored glow",
  },
  {
    label: "4:5:6",
    ratios: [1, 5 / 4, 3 / 2],
    note: "compact shared origin · grounded blend",
  },
  {
    label: "10:12:15",
    ratios: [1, 6 / 5, 3 / 2],
    note: "wider shared origin · stable and open",
  },
  {
    label: "8:9:12",
    ratios: [1, 9 / 8, 3 / 2],
    note: "competing centers · suspended openness",
  },
  {
    label: "1:√2:3/2",
    ratios: [1, Math.SQRT2, 3 / 2],
    note: "weak shared origin · exposed ambiguity",
  },
] as const;

const VOICE_NAMES = ["Reference", "Voice two", "Voice three", "Voice four", "Voice five", "Voice six"];

const MOTION_STEPS = [
  { label: "Origin", ratios: [1, 5 / 4, 3 / 2], note: "globally aligned" },
  { label: "Lean", ratios: [1, 1.29, 3 / 2], note: "middle voice leaves the template" },
  { label: "Open", ratios: [1, 4 / 3, 3 / 2], note: "locally familiar, globally changed" },
  { label: "Return", ratios: [1, 5 / 4, 3 / 2], note: "short basis restored" },
] as const;

function createHarmonicWave(context: AudioContext, partialCount: number) {
  const real = new Float32Array(partialCount + 1);
  const imaginary = new Float32Array(partialCount + 1);
  for (let index = 1; index < imaginary.length; index += 1) {
    imaginary[index] = 1 / index ** 1.2;
  }
  return context.createPeriodicWave(real, imaginary);
}

function useHarmonyAudio(voices: { frequencyHz: number; amplitude: number; partialCount: number }[]) {
  const nodesRef = useRef<HarmonyAudioNodes | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);

  const stop = useCallback(() => {
    const nodes = nodesRef.current;
    if (!nodes) return;
    nodesRef.current = null;
    const now = nodes.context.currentTime;
    nodes.master.gain.cancelScheduledValues(now);
    nodes.master.gain.setValueAtTime(nodes.master.gain.value, now);
    nodes.master.gain.linearRampToValueAtTime(0.0001, now + 0.045);
    window.setTimeout(() => {
      nodes.oscillators.forEach((oscillator) => {
        try {
          oscillator.stop();
        } catch {
          // Already stopped.
        }
      });
      void nodes.context.close();
    }, 60);
    setIsPlaying(false);
  }, []);

  const start = useCallback(async () => {
    if (nodesRef.current) return;
    try {
      const context = new AudioContext();
      await context.resume();
      const master = context.createGain();
      const compressor = context.createDynamicsCompressor();
      const now = context.currentTime;
      const gains: GainNode[] = [];
      const oscillators = voices.map((voice) => {
        const oscillator = context.createOscillator();
        const gain = context.createGain();
        oscillator.frequency.setValueAtTime(voice.frequencyHz, now);
        oscillator.setPeriodicWave(createHarmonicWave(context, voice.partialCount));
        gain.gain.setValueAtTime(voice.amplitude / Math.max(3, voices.length), now);
        oscillator.connect(gain).connect(master);
        oscillator.start();
        gains.push(gain);
        return oscillator;
      });

      master.gain.setValueAtTime(0.0001, now);
      compressor.threshold.setValueAtTime(-14, now);
      compressor.knee.setValueAtTime(20, now);
      compressor.ratio.setValueAtTime(7, now);
      master.connect(compressor).connect(context.destination);
      master.gain.exponentialRampToValueAtTime(0.105, now + 0.06);
      nodesRef.current = { context, master, oscillators, gains };
      setIsPlaying(true);
    } catch {
      setIsPlaying(false);
    }
  }, [voices]);

  useEffect(() => {
    const nodes = nodesRef.current;
    if (!nodes) return;
    const now = nodes.context.currentTime;
    nodes.oscillators.forEach((oscillator, index) => {
      oscillator.frequency.setTargetAtTime(
        voices[index].frequencyHz,
        now,
        0.018,
      );
      nodes.gains[index].gain.setTargetAtTime(voices[index].amplitude / Math.max(3, voices.length), now, 0.018);
    });
  }, [voices]);

  useEffect(() => {
    return () => {
      const nodes = nodesRef.current;
      nodesRef.current = null;
      if (!nodes) return;
      nodes.oscillators.forEach((oscillator) => {
        try {
          oscillator.stop();
        } catch {
          // Already stopped.
        }
      });
      void nodes.context.close();
    };
  }, []);

  return { isPlaying, start, stop };
}

function formatFrequency(value: number) {
  return `${value.toFixed(value < 1000 ? 1 : 0)} Hz`;
}

export function HarmonyLab() {
  const [referenceHz, setReferenceHz] = useState(160);
  const [justRatios, setJustRatios] = useState<number[]>([1, 5 / 4, 3 / 2]);
  const [voiceSettings, setVoiceSettings] = useState<VoiceSetting[]>([
    { octave: 0, amplitude: 0.75, partialCount: 9 },
    { octave: 0, amplitude: 0.68, partialCount: 9 },
    { octave: 0, amplitude: 0.72, partialCount: 9 },
  ]);
  const [temperamentMorph, setTemperamentMorph] = useState(0);
  const [foldOctaves, setFoldOctaves] = useState(true);
  const [motionStep, setMotionStep] = useState(0);
  const [previousRatios, setPreviousRatios] = useState<number[]>([1, 5 / 4, 3 / 2]);
  const ratios = useMemo(
    () =>
      justRatios.map((ratio) => {
        const equal = equalDivisionApproximation(ratio, 12).ratio;
        return interpolateRatioLogarithmically(ratio, equal, temperamentMorph);
      }),
    [justRatios, temperamentMorph],
  );
  const basis = useMemo(() => harmonicBasis(ratios, 20, 1), [ratios]);
  const voicesHz = useMemo(() => ratios.map((ratio, index) => referenceHz * ratio * 2 ** (voiceSettings[index]?.octave ?? 0)), [ratios, referenceHz, voiceSettings]);
  const audioVoices = useMemo(() => voicesHz.map((frequencyHz, index) => ({ frequencyHz, amplitude: voiceSettings[index]?.amplitude ?? 0.7, partialCount: voiceSettings[index]?.partialCount ?? 9 })), [voiceSettings, voicesHz]);
  const { isPlaying, start, stop } = useHarmonyAudio(audioVoices);

  const pairwise = useMemo(() => ratios.slice(1).map((ratio, index) => centsFromRatio(ratio / ratios[index])), [ratios]);
  const motionDistance = useMemo(() => previousRatios.length === ratios.length ? voiceLeadingDistance(previousRatios, ratios) : 0, [previousRatios, ratios]);
  const primeCoordinates = useMemo(() => justRatios.map((ratio) => primeExponentCoordinates(ratio, 32)), [justRatios]);
  const perception = useMemo(() => sonorityPerceptionModel(audioVoices, motionDistance), [audioVoices, motionDistance]);
  const previousPerception = useMemo(() => sonorityPerceptionModel(
    previousRatios.map((ratio, index) => ({
      frequencyHz: referenceHz * ratio * 2 ** (voiceSettings[index]?.octave ?? 0),
      amplitude: voiceSettings[index]?.amplitude ?? 0.7,
      partialCount: voiceSettings[index]?.partialCount ?? 9,
    })),
    0,
  ), [previousRatios, referenceHz, voiceSettings]);
  const affordances = useMemo(() => sonorityAffordances(perception), [perception]);
  const landmarkModels = useMemo(() => HARMONY_PRESETS.map((preset) => ({
    ...preset,
    model: sonorityPerceptionModel(preset.ratios.map((ratio) => ({
      frequencyHz: referenceHz * ratio,
      amplitude: 0.7,
      partialCount: 9,
    }))),
  })), [referenceHz]);

  const spectrum = useMemo(() => {
    const partials = voicesHz.flatMap((frequencyHz, voiceIndex) =>
      harmonicPartials(frequencyHz, voiceSettings[voiceIndex]?.partialCount ?? 9).map((partial) => ({
        ...partial,
        amplitude: partial.amplitude * (voiceSettings[voiceIndex]?.amplitude ?? 0.7),
        voiceIndex,
      })),
    );
    const maxHz = Math.max(...partials.map((partial) => partial.frequencyHz));
    const minHz = Math.min(...voicesHz);
    const marks = partials.map((partial) => ({
      ...partial,
      position:
        (Math.log2(partial.frequencyHz / minHz) /
          Math.log2(maxHz / minHz)) *
        100,
    }));

    const alignments = new Map<number, number>();
    for (let first = 0; first < voicesHz.length; first += 1) {
      for (let second = first + 1; second < voicesHz.length; second += 1) {
        findCoincidingPartials(voicesHz[first], voicesHz[second], 9, 3).forEach(
          (match) => {
            const rounded = Math.round(match.frequencyHz);
            alignments.set(rounded, (alignments.get(rounded) ?? 0) + 1);
          },
        );
      }
    }

    return {
      marks,
      minHz,
      maxHz,
      alignments: Array.from(alignments.entries()).map(([frequencyHz, strength]) => ({
        frequencyHz,
        strength,
        position:
          (Math.log2(frequencyHz / minHz) / Math.log2(maxHz / minHz)) * 100,
      })),
    };
  }, [voiceSettings, voicesHz]);

  const selectedPreset = HARMONY_PRESETS.find((preset) =>
    preset.ratios.length === justRatios.length && preset.ratios.every((value, index) => Math.abs(value - justRatios[index]) < 0.0005),
  );

  const setVoice = (index: number, value: number) => {
    setPreviousRatios(ratios);
    setJustRatios((current) =>
      current.map((ratio, voiceIndex) => (voiceIndex === index ? value : ratio)),
    );
  };

  const setVoiceSetting = (index: number, patch: Partial<VoiceSetting>) => {
    if (isPlaying) stop();
    setVoiceSettings((current) => current.map((setting, voiceIndex) => voiceIndex === index ? { ...setting, ...patch } : setting));
  };

  const resizeVoiceSettings = (length: number) => {
    setVoiceSettings((current) => Array.from({ length }, (_, index) => current[index] ?? { octave: 0, amplitude: 0.65, partialCount: 7 }));
  };

  const choosePreset = (preset: (typeof HARMONY_PRESETS)[number]) => {
    if (isPlaying) stop();
    setPreviousRatios(ratios);
    setJustRatios([...preset.ratios]);
    resizeVoiceSettings(preset.ratios.length);
    setTemperamentMorph(0);
    setMotionStep(0);
  };

  const chooseMotionStep = (index: number) => {
    if (isPlaying) stop();
    setPreviousRatios([...MOTION_STEPS[motionStep].ratios]);
    setJustRatios([...MOTION_STEPS[index].ratios]);
    resizeVoiceSettings(MOTION_STEPS[index].ratios.length);
    setTemperamentMorph(0);
    setMotionStep(index);
  };

  const addVoice = () => {
    if (justRatios.length >= 6) return;
    if (isPlaying) stop();
    setPreviousRatios(ratios);
    setJustRatios((current) => [...current, 1.75]);
    resizeVoiceSettings(justRatios.length + 1);
  };

  const removeVoice = () => {
    if (justRatios.length <= 3) return;
    if (isPlaying) stop();
    setPreviousRatios(ratios);
    setJustRatios((current) => current.slice(0, -1));
    resizeVoiceSettings(justRatios.length - 1);
  };

  return (
    <section className="advanced-lab harmony-lab" aria-labelledby="harmony-title">
      <div className="lab-intro">
        <div>
          <p className="section-kicker">Harmony field · three to six simultaneous sources</p>
          <h2 id="harmony-title">When relationships become a system</h2>
        </div>
        <p>
          A multi-tone field is more than a list of intervals. The ear can infer a
          shared periodic origin, separate streams, or hold several possible centers at
          once.
        </p>
      </div>

      <div className="lab-workspace">
        <div className="lab-controls">
          <div className="workspace-heading">
            <div>
              <span className="workspace-label">Current field</span>
              <strong>{basis ? basis.join(" : ") : "no short basis"}</strong>
              <small>{selectedPreset?.note ?? "continuous relationship"}</small>
            </div>
            <button
              className={isPlaying ? "listen-button is-playing" : "listen-button"}
              type="button"
              onClick={isPlaying ? stop : () => void start()}
              aria-pressed={isPlaying}
            >
              <span aria-hidden="true">{isPlaying ? "■" : "▶"}</span>
              {isPlaying ? "Stop field" : "Hear field"}
            </button>
          </div>

          <div className="harmony-presets" aria-label="Harmony field presets">
            {HARMONY_PRESETS.map((preset) => {
              const selected = preset === selectedPreset;
              return (
                <button
                  key={preset.label}
                  type="button"
                  className={selected ? "harmony-preset is-selected" : "harmony-preset"}
                  onClick={() => choosePreset(preset)}
                  aria-pressed={selected}
                >
                  <strong>{preset.label}</strong>
                  <span>{preset.note}</span>
                </button>
              );
            })}
          </div>

          <label className="control-field temperament-control">
            <span>
              Just relationship → equal-division approximation
              <output>{Math.round(temperamentMorph * 100)}%</output>
            </span>
            <input
              type="range"
              min="0"
              max="1"
              step="0.01"
              aria-label="Equal-division approximation morph"
              value={temperamentMorph}
              onChange={(event) => {
                setPreviousRatios(ratios);
                setTemperamentMorph(Number(event.target.value));
              }}
            />
          </label>

          <label className="control-field" htmlFor="harmony-reference">
            <span>
              Embodied reference
              <output>{formatFrequency(referenceHz)}</output>
            </span>
            <input
              id="harmony-reference"
              type="range"
              min="80"
              max="320"
              value={referenceHz}
              onChange={(event) => setReferenceHz(Number(event.target.value))}
            />
          </label>

          <div className="voice-controls">
            <div className="voice-count-control"><span>{ratios.length} active sources</span><div><button type="button" onClick={removeVoice} disabled={ratios.length <= 3}>Remove source</button><button type="button" onClick={addVoice} disabled={ratios.length >= 6}>Add source</button></div></div>
            {ratios.map((ratio, index) => (
              <div className="voice-control" key={VOICE_NAMES[index]}>
                <label><span>
                  <i className={`voice-swatch voice-${index + 1}`} />
                  {VOICE_NAMES[index]}
                  <output>{ratio.toFixed(4)}×</output>
                </span>
                <input
                  type="range"
                  min="1"
                  max="2"
                  step="0.001"
                  value={ratio}
                  disabled={index === 0}
                  onChange={(event) => setVoice(index, Number(event.target.value))}
                  aria-label={`${VOICE_NAMES[index]} frequency ratio`}
                /></label>
                <div className="voice-realization">
                  <label><span>Register</span><select aria-label={`${VOICE_NAMES[index]} register`} value={voiceSettings[index]?.octave ?? 0} onChange={(event) => setVoiceSetting(index, { octave: Number(event.target.value) })}><option value="-1">½×</option><option value="0">1×</option><option value="1">2×</option></select></label>
                  <label><span>Amplitude <output>{Math.round((voiceSettings[index]?.amplitude ?? 0.7) * 100)}</output></span><input type="range" min="0.15" max="1" step="0.01" aria-label={`${VOICE_NAMES[index]} amplitude`} value={voiceSettings[index]?.amplitude ?? 0.7} onChange={(event) => setVoiceSetting(index, { amplitude: Number(event.target.value) })} /></label>
                  <label><span>Partials <output>{voiceSettings[index]?.partialCount ?? 9}</output></span><input type="range" min="1" max="12" step="1" aria-label={`${VOICE_NAMES[index]} partial count`} value={voiceSettings[index]?.partialCount ?? 9} onChange={(event) => setVoiceSetting(index, { partialCount: Number(event.target.value) })} /></label>
                </div>
              </div>
            ))}
          </div>

          <div className="sequence-control">
            <span>One moving voice · sequence mode</span>
            <div>{MOTION_STEPS.map((step, index) => <button key={`${step.label}-${index}`} type="button" onClick={() => chooseMotionStep(index)} aria-pressed={motionStep === index}><strong>{step.label}</strong><small>{step.note}</small></button>)}</div>
          </div>
        </div>

        <div className="lab-observations">
          <article className="analysis-card harmonic-ladder-card">
            <div className="analysis-heading">
              <div>
                <span>A · Octave field</span>
                <h3>Voices on logarithmic space</h3>
              </div>
              <small>equal distance = equal ratio</small>
            </div>
            <div
              className="harmonic-ladder"
              role="img"
              aria-label={`${ratios.length} voices at ratios ${ratios.map((value) => value.toFixed(3)).join(", ")}`}
            >
              <div className="ladder-axis" />
              {[1, 4 / 3, 3 / 2, 2].map((landmark) => (
                <span
                  className="ladder-landmark"
                  key={landmark}
                  style={{ left: `${Math.log2(landmark) * 100}%` }}
                >
                  {landmark === 1 ? "1" : landmark === 2 ? "2" : landmark.toFixed(2)}×
                </span>
              ))}
              {ratios.map((value, index) => (
                <span
                  className={`ladder-voice voice-${index + 1}`}
                  key={`${index}-${value}`}
                  style={{ left: `${Math.log2(value) * 100}%` }}
                >
                  <i />
                  <strong>{formatFrequency(referenceHz * value)}</strong>
                </span>
              ))}
            </div>
          </article>

          <article className="analysis-card spectrum-field-card">
            <div className="analysis-heading">
              <div>
                <span>B · Aggregate spectrum</span>
                <h3>Where partials meet</h3>
              </div>
              <small>{spectrum.alignments.length} visible alignment zones</small>
            </div>
            <div
              className="spectrum-field"
              role="img"
              aria-label={`Harmonic spectrum for ${ratios.length} sources with ${spectrum.alignments.length} alignment zones.`}
            >
              {[25, 50, 75].map((position) => (
                <i className="spectrum-gridline" key={position} style={{ left: `${position}%` }} />
              ))}
              {spectrum.marks.map((mark) => (
                <i
                  key={`${mark.voiceIndex}-${mark.index}`}
                  className={`spectrum-partial voice-${mark.voiceIndex + 1}`}
                  style={{
                    left: `${mark.position}%`,
                    height: `${Math.max(7, mark.amplitude * 74)}%`,
                  }}
                />
              ))}
              {spectrum.alignments.map((alignment) => (
                <i
                  key={alignment.frequencyHz}
                  className="spectrum-alignment"
                  style={{ left: `${alignment.position}%` }}
                />
              ))}
              <span className="spectrum-min">{formatFrequency(spectrum.minHz)}</span>
              <span className="spectrum-max">{formatFrequency(spectrum.maxHz)}</span>
            </div>
          </article>

          <article className="analysis-card sonority-meaning-card">
            <div className="analysis-heading">
              <div>
                <span>C · From vibration to felt possibility</span>
                <h3>Trace the chain—do not skip a layer</h3>
              </div>
              <small>transparent educational model · not an emotion verdict</small>
            </div>

            <div className="causal-chain" aria-label="Causal explanation from physical sound to emotional affordance">
              <div>
                <span>1 · physical</span>
                <strong>{ratios.length} sources · {Math.log2(Math.max(...voicesHz) / Math.min(...voicesHz)).toFixed(2)} octaves</strong>
                <p>{spectrum.alignments.length} partial-alignment zones in this realization.</p>
              </div>
              <i aria-hidden="true">→</i>
              <div>
                <span>2 · auditory evidence</span>
                <strong>{Math.round(perception.roughness * 100)} friction · {Math.round(perception.fusion * 100)} fusion</strong>
                <p>The same ratios change here with register, amplitude, and partial count.</p>
              </div>
              <i aria-hidden="true">→</i>
              <div>
                <span>3 · structural reading</span>
                <strong>{basis ? `${basis.join(":")} shared origin` : "several plausible origins"}</strong>
                <p>{Math.round(perception.ambiguity * 100)} ambiguity · {motionDistance.toFixed(0)}¢ recent motion.</p>
              </div>
              <i aria-hidden="true">→</i>
              <div>
                <span>4 · felt possibility</span>
                <strong>{affordances.slice().sort((first, second) => second.value - first.value)[0].label}</strong>
                <p>What it becomes still depends on sequence, memory, style, body, and purpose.</p>
              </div>
            </div>

            <div className="meaning-map-layout">
              <div>
                <div className="meaning-map-heading">
                  <span>Sonority field</span>
                  <strong>where this realization sits</strong>
                </div>
                <div
                  className="sonority-map"
                  role="img"
                  aria-label={`Current field: ${Math.round(perception.tension * 100)} percent tension and ${Math.round(perception.fusion * 100)} percent fusion. Preset landmarks show comparison fields.`}
                >
                  <span className="map-axis map-axis-top">more activated ↑</span>
                  <span className="map-axis map-axis-bottom">more restful</span>
                  <span className="map-axis map-axis-left">← more fused</span>
                  <span className="map-axis map-axis-right">more separated →</span>
                  {landmarkModels.map((landmark) => (
                    <i
                      className="map-landmark"
                      key={landmark.label}
                      style={{
                        left: `${8 + (1 - landmark.model.fusion) * 84}%`,
                        bottom: `${10 + landmark.model.tension * 78}%`,
                      }}
                    >
                      <b>{landmark.label}</b>
                    </i>
                  ))}
                  <i
                    className="map-current"
                    style={{
                      left: `${8 + (1 - perception.fusion) * 84}%`,
                      bottom: `${10 + perception.tension * 78}%`,
                    }}
                  >
                    <b>you are here</b>
                  </i>
                </div>
              </div>

              <div className="affordance-field">
                <div className="meaning-map-heading">
                  <span>Conditional affordances</span>
                  <strong>what this sound may make available</strong>
                </div>
                {affordances.map((affordance) => (
                  <div key={affordance.key}>
                    <span><strong>{affordance.label}</strong><output>{Math.round(affordance.value * 100)}</output></span>
                    <i><b style={{ width: `${Math.round(affordance.value * 100)}%` }} /></i>
                    <p>{affordance.direction} · {affordance.drivers}</p>
                  </div>
                ))}
              </div>
            </div>

            <div className="meaning-delta" aria-live="polite">
              <span>Compared with the previous field</span>
              <strong>
                tension {perception.tension - previousPerception.tension >= 0 ? "+" : ""}{Math.round((perception.tension - previousPerception.tension) * 100)} · fusion {perception.fusion - previousPerception.fusion >= 0 ? "+" : ""}{Math.round((perception.fusion - previousPerception.fusion) * 100)}
              </strong>
              <p>Move one ratio, register, amplitude, or partial control and watch which link in the chain changes first.</p>
            </div>
          </article>

          <article className="analysis-card prime-lattice-card">
            <div className="analysis-heading">
              <div><span>D · Low-prime coordinates</span><h3>Relationships as exponent vectors</h3></div>
              <div className="fold-choice" role="group" aria-label="Octave folding view"><button type="button" aria-pressed={foldOctaves} onClick={() => setFoldOctaves(true)}>fold octaves</button><button type="button" aria-pressed={!foldOctaves} onClick={() => setFoldOctaves(false)}>show octave axis</button></div>
            </div>
            <div className={`prime-lattice ${foldOctaves ? "is-folded" : ""}`} role="img" aria-label={`Prime exponent coordinates for ${justRatios.length} voices; octave axis ${foldOctaves ? "folded" : "visible"}`}>
              <i className="prime-axis-x" /><i className="prime-axis-y" />
              {primeCoordinates.map((coordinate, index) => {
                const x = 50 + coordinate.coordinates[3] * 17 + coordinate.coordinates[7] * 8;
                const y = 52 - coordinate.coordinates[5] * 22 - (foldOctaves ? 0 : coordinate.coordinates[2] * 7);
                return <span key={`${index}-${justRatios[index]}`} className={`voice-${index + 1}`} style={{ left: `${Math.max(7, Math.min(93, x))}%`, top: `${Math.max(8, Math.min(92, y))}%` }}><i /><strong>{justRatios[index].toFixed(3)}×</strong><small>2^{coordinate.coordinates[2]} · 3^{coordinate.coordinates[3]} · 5^{coordinate.coordinates[5]} · 7^{coordinate.coordinates[7]}</small></span>;
              })}
              <b className="axis-three">3-exponent →</b><b className="axis-five">5-exponent ↑</b>
            </div>
            <p className="lattice-note">Octave folding is a view choice. The stored relationships retain their 2-exponents either way.</p>
          </article>

          <div className="harmony-metrics">
            <article>
              <span>Shared harmonic basis</span>
              <strong>{basis ? basis.join(" · ") : "unresolved"}</strong>
              <p>
                {basis
                  ? `The field can be heard as harmonics ${basis.join(", ")} of a lower implied periodicity.`
                  : "No small integer template explains every voice at once."}
              </p>
            </article>
            <article>
              <span>Pairwise motion</span>
              <strong>{pairwise.slice(0, 2).map((value) => Math.abs(value).toFixed(0)).join(" · ")}¢</strong>
              <p>
                Pairwise distances describe local spacing, while the shared basis describes
                the field as one global object.
              </p>
            </article>
            <article>
              <span>Voice-leading distance</span>
              <strong>{motionDistance.toFixed(1)}¢</strong>
              <p>Sum of continuous log-frequency movement from the previous field. Zero means no voice moved.</p>
            </article>
          </div>
        </div>
      </div>

      <div className="lab-learning-note">
        <strong>Emotion is not inside a ratio:</strong> the map predicts sensory and structural
        affordances, not what you must feel. Use Origin → Open → Return to hear how the same
        instant can become departure, suspense, or arrival through memory. Cultural familiarity,
        timbre, tempo, dynamics, lyrics, personal association, and listening purpose can reverse
        or outweigh the static-field tendencies.
      </div>
    </section>
  );
}
