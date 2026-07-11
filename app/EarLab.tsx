"use client";

import { useCallback, useMemo, useRef, useState, type CSSProperties } from "react";
import {
  AUDITORY_BAND_CENTERS_HZ,
  aggregateRoughness,
  auditoryBandEnergy,
  harmonicSpectrum,
  harmonicityCandidates,
  spectralOverlap,
} from "@/lib/auditory-model";

type EarConfig = {
  referenceHz: number;
  ratio: number;
  partialCount: number;
  rolloffDbPerOctave: number;
  inharmonicity: number;
  noiseAmount: number;
  loudness: number;
  attackMs: number;
  durationMs: number;
};

type RatingKey = "smoothness" | "fusion" | "tension" | "liking";
type EarPlayback = { context: AudioContext; master: GainNode; sources: AudioScheduledSourceNode[]; timer: number };

const EAR_STORAGE_KEY = "music-with-no-names.ear-observations.v1";

const DEFAULT_CONFIG: EarConfig = {
  referenceHz: 220,
  ratio: 1.5,
  partialCount: 10,
  rolloffDbPerOctave: 7,
  inharmonicity: 0,
  noiseAmount: 0,
  loudness: 46,
  attackMs: 55,
  durationMs: 1400,
};

const CONTROLLED_EXPERIMENTS: { factor: string; variants: { label: string; note: string; config: Partial<EarConfig> }[] }[] = [
  { factor: "Timbre · same 3:2", variants: [
    { label: "A · sine", note: "one partial", config: { ratio: 1.5, partialCount: 1, inharmonicity: 0, noiseAmount: 0 } },
    { label: "B · harmonic", note: "ten aligned partials", config: { ratio: 1.5, partialCount: 10, rolloffDbPerOctave: 7, inharmonicity: 0, noiseAmount: 0 } },
    { label: "C · stretched", note: "same fundamentals", config: { ratio: 1.5, partialCount: 10, inharmonicity: 0.0024, noiseAmount: 0 } },
  ] },
  { factor: "Register · same spectrum", variants: [
    { label: "A · low", note: "110 Hz anchor", config: { referenceHz: 110, ratio: 1.5, partialCount: 10, inharmonicity: 0 } },
    { label: "B · middle", note: "220 Hz anchor", config: { referenceHz: 220, ratio: 1.5, partialCount: 10, inharmonicity: 0 } },
    { label: "C · high", note: "440 Hz anchor", config: { referenceHz: 440, ratio: 1.5, partialCount: 10, inharmonicity: 0 } },
  ] },
  { factor: "Partial balance", variants: [
    { label: "A · bright", note: "4 dB/oct rolloff", config: { partialCount: 14, rolloffDbPerOctave: 4, inharmonicity: 0 } },
    { label: "B · dark", note: "14 dB/oct rolloff", config: { partialCount: 14, rolloffDbPerOctave: 14, inharmonicity: 0 } },
  ] },
  { factor: "Envelope · same spectrum", variants: [
    { label: "A · brief", note: "fast 450 ms gesture", config: { attackMs: 8, durationMs: 450 } },
    { label: "B · sustained", note: "slow 2.4 s gesture", config: { attackMs: 180, durationMs: 2400 } },
  ] },
];

function makeNoiseBuffer(context: AudioContext) {
  const buffer = context.createBuffer(1, context.sampleRate * 2, context.sampleRate);
  const data = buffer.getChannelData(0);
  for (let index = 0; index < data.length; index += 1) data[index] = Math.random() * 2 - 1;
  return buffer;
}

function modelScale(value: number) {
  return Math.round(Math.max(0, Math.min(1, value)) * 100);
}

export function EarLab() {
  const [config, setConfig] = useState(DEFAULT_CONFIG);
  const [isPlaying, setIsPlaying] = useState(false);
  const [audioMessage, setAudioMessage] = useState("Audio is off until you choose to hear this field.");
  const [ratings, setRatings] = useState<Record<RatingKey, number>>({ smoothness: 55, fusion: 55, tension: 45, liking: 55 });
  const [savedCount, setSavedCount] = useState(0);
  const playbackRef = useRef<EarPlayback | null>(null);

  const spectrumOptions = useMemo(() => ({
    partialCount: config.partialCount,
    rolloffDbPerOctave: config.rolloffDbPerOctave,
    inharmonicity: config.inharmonicity,
    noiseAmount: config.noiseAmount,
  }), [config.inharmonicity, config.noiseAmount, config.partialCount, config.rolloffDbPerOctave]);
  const firstSpectrum = useMemo(() => harmonicSpectrum(config.referenceHz, 0, spectrumOptions), [config.referenceHz, spectrumOptions]);
  const secondSpectrum = useMemo(() => harmonicSpectrum(config.referenceHz * config.ratio, 1, spectrumOptions), [config.ratio, config.referenceHz, spectrumOptions]);
  const combined = useMemo(() => [...firstSpectrum, ...secondSpectrum], [firstSpectrum, secondSpectrum]);
  const roughness = useMemo(() => aggregateRoughness(combined), [combined]);
  const overlap = useMemo(() => spectralOverlap(firstSpectrum, secondSpectrum), [firstSpectrum, secondSpectrum]);
  const harmonicity = useMemo(() => harmonicityCandidates(combined, 30, Math.min(500, config.referenceHz)), [combined, config.referenceHz]);
  const fusionHypothesis = Math.max(0, Math.min(1, overlap * 0.42 + (harmonicity[0]?.confidence ?? 0) * 0.45 + (1 - roughness) * 0.13));
  const bandEnergy = useMemo(() => auditoryBandEnergy(combined), [combined]);
  const maxBandEnergy = Math.max(1e-8, ...bandEnergy);

  const stop = useCallback(() => {
    const playback = playbackRef.current;
    if (!playback) return;
    playbackRef.current = null;
    window.clearTimeout(playback.timer);
    const now = playback.context.currentTime;
    playback.master.gain.cancelScheduledValues(now);
    playback.master.gain.setValueAtTime(playback.master.gain.value, now);
    playback.master.gain.linearRampToValueAtTime(0.0001, now + 0.045);
    window.setTimeout(() => {
      playback.sources.forEach((source) => { try { source.stop(); } catch { /* Already stopped. */ } });
      void playback.context.close();
    }, 60);
    setIsPlaying(false);
    setAudioMessage("Audio stopped safely.");
  }, []);

  const start = async () => {
    if (playbackRef.current) return;
    try {
      const context = new AudioContext();
      await context.resume();
      const master = context.createGain();
      const compressor = context.createDynamicsCompressor();
      const now = context.currentTime;
      const targetGain = 0.025 + (config.loudness / 100) * 0.055;
      master.gain.setValueAtTime(0.0001, now);
      master.gain.exponentialRampToValueAtTime(targetGain, now + config.attackMs / 1000);
      compressor.threshold.setValueAtTime(-14, now);
      compressor.ratio.setValueAtTime(8, now);
      master.connect(compressor).connect(context.destination);
      const sources: AudioScheduledSourceNode[] = [];
      const tonal = combined.filter((component) => component.kind === "partial").slice(0, 28);
      tonal.forEach((component) => {
        const oscillator = context.createOscillator();
        const gain = context.createGain();
        oscillator.frequency.setValueAtTime(component.frequencyHz, now);
        gain.gain.setValueAtTime(component.amplitude / Math.max(4, tonal.length * 0.45), now);
        oscillator.connect(gain).connect(master);
        oscillator.start();
        sources.push(oscillator);
      });
      if (config.noiseAmount > 0) {
        [config.referenceHz, config.referenceHz * config.ratio].forEach((fundamental) => {
          const noise = context.createBufferSource();
          const filter = context.createBiquadFilter();
          const gain = context.createGain();
          noise.buffer = makeNoiseBuffer(context);
          noise.loop = true;
          filter.type = "bandpass";
          filter.frequency.setValueAtTime(Math.min(12000, fundamental * 2.4), now);
          filter.Q.setValueAtTime(0.65, now);
          gain.gain.setValueAtTime(config.noiseAmount * 0.12, now);
          noise.connect(filter).connect(gain).connect(master);
          noise.start();
          sources.push(noise);
        });
      }
      const endAt = now + Math.max(config.durationMs, config.attackMs + 100) / 1000;
      master.gain.setValueAtTime(targetGain, Math.max(now + config.attackMs / 1000, endAt - 0.06));
      master.gain.linearRampToValueAtTime(0.0001, endAt);
      sources.forEach((source) => source.stop(endAt + 0.02));
      const playback: EarPlayback = { context, master, sources, timer: 0 };
      playback.timer = window.setTimeout(() => {
        if (playbackRef.current !== playback) return;
        playbackRef.current = null;
        setIsPlaying(false);
        setAudioMessage("Gesture complete.");
        void context.close();
      }, Math.max(config.durationMs, config.attackMs + 100) + 90);
      playbackRef.current = playback;
      setIsPlaying(true);
      setAudioMessage("Audio playing at a conservative level.");
    } catch {
      setAudioMessage("Audio could not start. Check this browser’s sound permission.");
    }
  };

  const updateConfig = (key: keyof EarConfig, value: number) => {
    if (isPlaying) stop();
    setConfig((current) => ({ ...current, [key]: value }));
  };

  const chooseExperiment = (experiment: (typeof CONTROLLED_EXPERIMENTS)[number]["variants"][number]) => {
    if (isPlaying) stop();
    setConfig((current) => ({ ...current, ...experiment.config }));
  };

  const saveObservation = () => {
    const current = (() => {
      try { return JSON.parse(window.localStorage.getItem(EAR_STORAGE_KEY) ?? "[]") as unknown[]; } catch { return []; }
    })();
    current.push({
      recordedAt: new Date().toISOString(),
      physicalConfig: config,
      modelPredictions: { roughness, spectralOverlap: overlap, harmonicityCandidates: harmonicity, fusionHypothesis },
      humanRatings: ratings,
    });
    window.localStorage.setItem(EAR_STORAGE_KEY, JSON.stringify(current));
    setSavedCount(current.length);
  };

  const roughnessCurve = useMemo(() => Array.from({ length: 44 }, (_, index) => {
    const ratio = 1 + index / 43;
    const other = harmonicSpectrum(config.referenceHz * ratio, 1, spectrumOptions);
    return aggregateRoughness([...firstSpectrum, ...other]);
  }), [config.referenceHz, firstSpectrum, spectrumOptions]);
  const maxFrequency = Math.max(2000, ...combined.map((component) => component.frequencyHz));

  return (
    <section className="advanced-lab ear-lab" aria-labelledby="ear-title">
      <div className="lab-intro ear-intro">
        <div><p className="section-kicker">Ear Lab · the spectrum is not the listener</p><h2 id="ear-title">Separate sensory models from musical value.</h2></div>
        <p>Change spacing, spectrum, register, inharmonicity, noise, level, and attack. Roughness and harmonicity respond independently; your own ratings remain a separate observation.</p>
      </div>

      <div className="ear-experiments" aria-label="Controlled auditory A/B experiments">
        {CONTROLLED_EXPERIMENTS.map((experiment) => <article key={experiment.factor}><span>{experiment.factor}</span><div>{experiment.variants.map((variant) => <button key={variant.label} type="button" onClick={() => chooseExperiment(variant)}><strong>{variant.label}</strong><small>{variant.note}</small></button>)}</div></article>)}
      </div>

      <div className="ear-workspace">
        <div className="ear-controls">
          <div className="ear-playback"><div><span>Current field</span><strong>{config.ratio.toFixed(3)}× at {config.referenceHz.toFixed(0)} Hz</strong></div><button type="button" className={isPlaying ? "listen-button is-playing" : "listen-button"} onClick={isPlaying ? stop : () => void start()} aria-pressed={isPlaying}>{isPlaying ? "■ Stop field" : "▶ Hear field"}</button></div>
          <p className="sr-only" aria-live="polite">{audioMessage}</p>
          {[
            ["ratio", "Frequency spacing", 1, 2, 0.001, config.ratio.toFixed(3) + "×"],
            ["referenceHz", "Physical register", 80, 600, 1, config.referenceHz.toFixed(0) + " Hz"],
            ["partialCount", "Partial count", 1, 16, 1, String(config.partialCount)],
            ["rolloffDbPerOctave", "Spectral rolloff", 3, 18, 0.5, config.rolloffDbPerOctave.toFixed(1) + " dB/oct"],
            ["inharmonicity", "Inharmonic stretch", 0, 0.004, 0.0001, config.inharmonicity.toFixed(4)],
            ["noiseAmount", "Noise component", 0, 0.6, 0.01, Math.round(config.noiseAmount * 100) + "%"],
            ["loudness", "Playback level", 10, 80, 1, String(config.loudness)],
            ["attackMs", "Attack time", 8, 300, 1, config.attackMs.toFixed(0) + " ms"],
            ["durationMs", "Gesture duration", 300, 3000, 50, config.durationMs.toFixed(0) + " ms"],
          ].map(([key, label, min, max, step, output]) => <label className="ear-control" key={key as string}><span><strong>{label as string}</strong><output>{output as string}</output></span><input type="range" aria-label={label as string} min={min as number} max={max as number} step={step as number} value={config[key as keyof EarConfig]} onChange={(event) => updateConfig(key as keyof EarConfig, Number(event.target.value))} /></label>)}
        </div>

        <div className="ear-models">
          <div className="model-score-grid">
            <article><span>Roughness hypothesis</span><strong>{modelScale(roughness)}</strong><p>Pairwise interaction inside critical-band spacing.</p></article>
            <article><span>Spectral overlap</span><strong>{modelScale(overlap)}</strong><p>Aligned partial energy, not a liking score.</p></article>
            <article><span>Best periodic candidate</span><strong>{harmonicity[0] ? `${harmonicity[0].fundamentalHz.toFixed(1)} Hz` : "open"}</strong><p>{harmonicity[0] ? `${modelScale(harmonicity[0].confidence)}% template fit.` : "No compact candidate."}</p></article>
            <article><span>Fusion hypothesis</span><strong>{modelScale(fusionHypothesis)}</strong><p>Declared blend of overlap, template fit, and low roughness—not your report or liking.</p></article>
          </div>

          <div className="ear-view-grid">
            <article><div className="view-heading"><span>A · Physical spectrum</span><strong>{combined.length} components</strong></div><div className="partial-field" role="img" aria-label="Physical partial and noise spectrum for both sources">{combined.map((component, index) => <i key={`${component.source}-${component.partialIndex}-${index}`} className={`source-${component.source} kind-${component.kind}`} style={{ left: `${(Math.log2(component.frequencyHz / 60) / Math.log2(maxFrequency / 60)) * 100}%`, height: `${Math.max(3, component.amplitude * 100)}%` } as CSSProperties} />)}</div><p>Horizontal position is logarithmic frequency. Noise markers are visually distinct from tonal partials.</p></article>
            <article><div className="view-heading"><span>B · Auditory bands</span><strong>critical-band proxy</strong></div><div className="ear-band-field" role="img" aria-label="Energy projected into twelve ear-relative frequency bands">{bandEnergy.map((energy, index) => <i key={AUDITORY_BAND_CENTERS_HZ[index]} style={{ height: `${(energy / maxBandEnergy) * 100}%` }}><b>{AUDITORY_BAND_CENTERS_HZ[index] >= 1000 ? `${AUDITORY_BAND_CENTERS_HZ[index] / 1000}k` : AUDITORY_BAND_CENTERS_HZ[index]}</b></i>)}</div><p>Gaussian energy projection in critical-band-rate space. It approximates spectral crowding, not cochlear output.</p></article>
          </div>

          <div className="roughness-landscape"><div className="view-heading"><span>C · Roughness across the octave</span><strong>current spacing marked</strong></div><div role="img" aria-label="Modeled roughness for the current spectrum as frequency spacing moves from unison to octave">{roughnessCurve.map((value, index) => <i key={index} className={Math.abs(1 + index / 43 - config.ratio) < 0.018 ? "is-current" : ""} style={{ height: `${Math.max(2, value * 100)}%` }} />)}</div><p>This curve changes when spectrum or register changes. There is no universal interval roughness independent of realization.</p></div>

          <div className="candidate-field"><span>Competing periodic interpretations</span>{harmonicity.map((candidate) => <div key={candidate.fundamentalHz}><strong>{candidate.fundamentalHz.toFixed(1)} Hz</strong><i><b style={{ width: `${modelScale(candidate.confidence)}%` }} /></i><output>{modelScale(candidate.confidence)}%</output></div>)}</div>
        </div>
      </div>

      <div className="ear-response">
        <div><span>Human report · not inferred from the models</span><h3>What did this field become for you?</h3><p>Rate each quality independently. A field can be rough and liked, fused and tense, or smooth and uninteresting.</p></div>
        <div className="ear-ratings">{([
          ["smoothness", "Sensory smoothness"], ["fusion", "Perceived fusion"], ["tension", "Felt tension"], ["liking", "Liking"],
        ] as [RatingKey, string][]).map(([key, label]) => <label key={key}><span>{label}<output>{ratings[key]}</output></span><input type="range" min="0" max="100" aria-label={label} value={ratings[key]} onChange={(event) => setRatings((current) => ({ ...current, [key]: Number(event.target.value) }))} /></label>)}</div>
        <button type="button" className="save-ear-observation" onClick={saveObservation}>Save model + report separately{savedCount ? ` · ${savedCount}` : ""}</button>
      </div>

      <div className="ear-boundary"><strong>Model boundary</strong><p>The roughness equation is a documented Plomp–Levelt/Sethares-style interaction curve. Harmonicity uses a separate template search. The fusion number is an intentionally simple, inspectable hypothesis; your fusion and liking reports remain independent evidence. None of these establishes musical goodness.</p></div>
    </section>
  );
}
