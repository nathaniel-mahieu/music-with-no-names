"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import {
  AUDITORY_BAND_CENTERS_HZ,
  aggregateRoughness,
  auditoryBandEnergy,
  harmonicSpectrum,
  harmonicityCandidates,
  spectralOverlap,
} from "@/lib/auditory-model";
import { configureSafetyCompressor, equalPowerMixGains, loudnessControlGain } from "@/lib/audio-level";
import { liveEarIntervalProfile, type LiveEarIntervalProfile } from "@/lib/live-ear";
import { PIANO_SESSION_KEY, parsePianoPhraseSpecimen, type PianoPhraseSpecimenEvent } from "@/lib/piano-session";

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

const LIVE_EAR_METRICS = [
  { key: "roughness", label: "Sensory friction", shape: "circle" },
  { key: "harmonicity", label: "Harmonic fit", shape: "square" },
  { key: "fusion", label: "Fusion hypothesis", shape: "diamond" },
] as const;

function signedStepLabel(steps: number) {
  if (steps === 0) return "same key position";
  return `${steps > 0 ? "+" : "−"}${Math.abs(steps)} equal-key step${Math.abs(steps) === 1 ? "" : "s"}`;
}

function strongestModelDifference(profile: LiveEarIntervalProfile) {
  return LIVE_EAR_METRICS.map((metric) => {
    const values = profile.modelReadings.map((reading) => reading[metric.key]);
    return { label: metric.label, spread: Math.max(...values) - Math.min(...values) };
  }).sort((first, second) => second.spread - first.spread)[0];
}

function LiveEarBridge({ events, hydrated, onNavigateToPiano }: {
  events: PianoPhraseSpecimenEvent[] | null;
  hydrated: boolean;
  onNavigateToPiano?: () => void;
}) {
  const profile = useMemo(() => liveEarIntervalProfile(events ?? []), [events]);
  const interactionReady = profile?.interactionStatus === "overlap";
  const strongestDifference = interactionReady ? strongestModelDifference(profile) : null;
  const summary = interactionReady
    ? `${profile.steps} equal-key steps and a ${profile.equalFrequencyRatio.toFixed(3)} to one frequency ratio stay fixed. Four assumed sound models produce ${LIVE_EAR_METRICS.map((metric) => `${metric.label.toLowerCase()} values ${profile.modelReadings.map((reading) => modelScale(reading[metric.key])).join(", ")}`).join("; ")}.`
    : profile
      ? `${profile.steps} equal-key steps and a ${profile.equalFrequencyRatio.toFixed(3)} to one frequency ratio were measured, but ${profile.interactionStatus === "separate" ? "the first attack ended before the second began" : "release timing is missing"}, so no simultaneous spectral-interaction result is shown.`
      : "Play two attacks in Piano to compare one interval relationship with its physical realization.";

  return <section className="live-ear-bridge" aria-labelledby="live-ear-title">
    <div className="live-ear-heading">
      <div><span>Latest Piano interval · one question</span><h3 id="live-ear-title">Which conclusions survive when only the assumed sound changes?</h3></div>
      <p>MIDI supplies two fundamentals and timing—not overtones. The relationship can be measured directly; every auditory result below must declare a spectrum.</p>
    </div>

    {!hydrated ? <p className="live-ear-loading" role="status">Looking for the retained Piano phrase…</p> : profile ? <>
      <div className="live-ear-invariants" aria-label="Measured interval invariants">
        <span><small>hand movement</small><strong>{signedStepLabel(profile.signedSteps)}</strong></span>
        <span><small>frequency relationship</small><strong>{profile.equalFrequencyRatio.toFixed(3)} : 1</strong></span>
        <span><small>physical realization</small><strong>{profile.lowerHz.toFixed(1)} → {profile.upperHz.toFixed(1)} Hz</strong></span>
        <span><small>simultaneous evidence</small><strong>{profile.interactionStatus === "overlap" ? `${Math.round(profile.overlapMs ?? 0)} ms overlap` : profile.interactionStatus === "separate" ? "separated in time" : "release unknown"}</strong></span>
      </div>

      {interactionReady ? <>
        <div className="live-ear-comparison">
          <svg viewBox="0 0 780 300" role="img" aria-label={summary}>
            <title>One performed interval under four assumed spectra</title>
            <desc>{summary}</desc>
            {profile.modelReadings.map((reading, index) => {
              const x = 180 + index * 170;
              return <g key={reading.id}>
                <text x={x} y="24" className="live-ear-model-label">{reading.shortLabel}</text>
                <text x={x} y="42" className="live-ear-partial-label">{reading.partialCount} partial{reading.partialCount === 1 ? "" : "s"}</text>
              </g>;
            })}
            {LIVE_EAR_METRICS.map((metric, row) => {
              const baseline = 104 + row * 88;
              const points = profile.modelReadings.map((reading, index) => ({ x: 180 + index * 170, y: baseline - reading[metric.key] * 52, value: modelScale(reading[metric.key]) }));
              return <g key={metric.key} className={`live-ear-metric live-ear-${metric.key}`}>
                <text x="8" y={baseline - 18} className="live-ear-metric-label">{metric.label}</text>
                <line x1="180" x2="690" y1={baseline} y2={baseline} className="live-ear-rail" />
                <polyline points={points.map((point) => `${point.x},${point.y}`).join(" ")} className="live-ear-profile-line" />
                {points.map((point, index) => <g key={profile.modelReadings[index].id}>
                  {metric.shape === "circle" ? <circle cx={point.x} cy={point.y} r="7" /> : metric.shape === "square" ? <rect x={point.x - 7} y={point.y - 7} width="14" height="14" /> : <path d={`M ${point.x} ${point.y - 9} L ${point.x + 9} ${point.y} L ${point.x} ${point.y + 9} L ${point.x - 9} ${point.y} Z`} />}
                  <text x={point.x} y={point.y - 13} className="live-ear-value">{point.value}</text>
                </g>)}
              </g>;
            })}
          </svg>
          <div className="live-ear-model-notes" aria-label="Declared spectrum details">
            {profile.modelReadings.map((reading) => <article key={reading.id}><span>{reading.shortLabel}</span><strong>{reading.alignedPairCount} aligned · {reading.interactionPairCount} near</strong><small>{reading.description}</small></article>)}
          </div>
        </div>

        <div className="live-ear-lenses" role="group" aria-label="Five separate lenses for this interval and its assumed sounds">
          <article><span>Sound</span><em>measured MIDI</em><strong>{profile.lowerHz.toFixed(1)} + {profile.upperHz.toFixed(1)} Hz</strong><small>{Math.round(profile.overlapMs ?? 0)} ms of overlap is proven by attack and release timing. MIDI attack strength is not acoustic loudness.</small></article>
          <article><span>Relationships</span><em>measured</em><strong>{profile.steps} steps · {profile.equalFrequencyRatio.toFixed(3)} : 1</strong><small>This equal-key relationship survives every spectrum assumption shown here.</small></article>
          <article><span>Motion</span><em>measured</em><strong>{signedStepLabel(profile.signedSteps)}</strong><small>The second attack began {Math.round(profile.second.onsetMs - profile.first.onsetMs)} ms later. Changing an assumed spectrum does not change that gesture.</small></article>
          <article><span>Auditory</span><em>modeled</em><strong>{strongestDifference?.label ?? "Model-dependent"}</strong><small>{strongestDifference ? `Largest displayed model spread: ${Math.round(strongestDifference.spread * 100)} points.` : "The model readings remain separate."} These are teaching proxies, not the connected instrument.</small></article>
          <article><span>Experience</span><em>listener only</em><strong>Not inferred</strong><small>Friction, fit, and fusion do not determine tension, beauty, liking, or what this interval meant in your phrase.</small></article>
        </div>
      </> : <div className="live-ear-timing-boundary" role="status">
        <div><strong>{profile.interactionStatus === "separate" ? "This was a melodic interval, not a simultaneous field." : "The interval is known; overlap is not."}</strong><p>{profile.interactionStatus === "separate" ? "The first attack ended before the second began. Its distance and contour remain meaningful, but a simultaneous roughness or partial-collision reading would answer the wrong question." : "The first attack has no complete release time. The bridge will not assume that the two spectra overlapped."}</p></div>
        {onNavigateToPiano ? <button type="button" onClick={onNavigateToPiano}>Hold the first key into the second</button> : null}
      </div>}

      <div className="live-ear-boundary">
        <p><strong>What changed here:</strong> only the assumed overtone pattern. <strong>What stayed fixed:</strong> MIDI keys, fundamentals, interval, timing, and your actual response. None of the four models measures a keyboard patch, DAW, speaker, room, or ear.</p>
        {onNavigateToPiano && interactionReady ? <button type="button" onClick={onNavigateToPiano}>Replay with different overlap or register</button> : null}
      </div>
    </> : <div className="live-ear-empty">
      <div><strong>No retained interval yet</strong><p>Play two attacks in Piano. Their physical spacing can be compared immediately; simultaneous auditory evidence appears only when release timing proves that the sounds overlapped.</p></div>
      {onNavigateToPiano ? <button type="button" onClick={onNavigateToPiano}>Play two attacks in Piano</button> : null}
    </div>}
  </section>;
}

export function EarLab({ onNavigateToPiano }: { onNavigateToPiano?: () => void }) {
  const [phraseEvents, setPhraseEvents] = useState<PianoPhraseSpecimenEvent[] | null>(null);
  const [phraseHydrated, setPhraseHydrated] = useState(false);
  const [config, setConfig] = useState(DEFAULT_CONFIG);
  const [isPlaying, setIsPlaying] = useState(false);
  const [audioMessage, setAudioMessage] = useState("Audio is off until you choose to hear this field.");
  const [ratings, setRatings] = useState<Record<RatingKey, number>>({ smoothness: 55, fusion: 55, tension: 45, liking: 55 });
  const [savedCount, setSavedCount] = useState(0);
  const playbackRef = useRef<EarPlayback | null>(null);

  useEffect(() => {
    const hydrationTimer = window.setTimeout(() => {
      try {
        setPhraseEvents(parsePianoPhraseSpecimen(window.sessionStorage.getItem(PIANO_SESSION_KEY)) ?? []);
      } catch {
        setPhraseEvents([]);
      }
      setPhraseHydrated(true);
    }, 0);
    return () => window.clearTimeout(hydrationTimer);
  }, []);

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
      const targetGain = loudnessControlGain(config.loudness);
      master.gain.setValueAtTime(0.0001, now);
      master.gain.exponentialRampToValueAtTime(targetGain, now + config.attackMs / 1000);
      configureSafetyCompressor(compressor, now);
      master.connect(compressor).connect(context.destination);
      const sources: AudioScheduledSourceNode[] = [];
      const tonal = combined.filter((component) => component.kind === "partial").slice(0, 28);
      const noiseShare = Math.min(0.35, config.noiseAmount * 0.35);
      const tonalShare = Math.sqrt(1 - noiseShare ** 2);
      const tonalGains = equalPowerMixGains(tonal.map((component) => component.amplitude));
      tonal.forEach((component, index) => {
        const oscillator = context.createOscillator();
        const gain = context.createGain();
        oscillator.frequency.setValueAtTime(component.frequencyHz, now);
        gain.gain.setValueAtTime(tonalGains[index] * tonalShare, now);
        oscillator.connect(gain).connect(master);
        oscillator.start();
        sources.push(oscillator);
      });
      if (config.noiseAmount > 0) {
        const noiseGains = equalPowerMixGains([1, 1]);
        [config.referenceHz, config.referenceHz * config.ratio].forEach((fundamental, index) => {
          const noise = context.createBufferSource();
          const filter = context.createBiquadFilter();
          const gain = context.createGain();
          noise.buffer = makeNoiseBuffer(context);
          noise.loop = true;
          filter.type = "bandpass";
          filter.frequency.setValueAtTime(Math.min(12000, fundamental * 2.4), now);
          filter.Q.setValueAtTime(0.65, now);
          gain.gain.setValueAtTime(noiseGains[index] * noiseShare, now);
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
        <div><p className="section-kicker">Ear Lab · your interval under declared assumptions</p><h2 id="ear-title">Keep the relationship. Change the imagined sound.</h2></div>
        <p>Begin with the latest two Piano attacks. See which facts come from MIDI, which sensory readings depend on an assumed spectrum, and which answers belong only to you.</p>
      </div>

      <LiveEarBridge events={phraseEvents} hydrated={phraseHydrated} onNavigateToPiano={onNavigateToPiano} />

      <details className="ear-authoring-disclosure" onToggle={(event) => { if (!event.currentTarget.open && isPlaying) stop(); }}>
        <summary><span>Explore the generated hearing instrument</span><small>Optional synthesis, controlled variants, nine sound controls, detailed models, and listener reports</small></summary>
        <div className="ear-authoring-content">

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
        </div>
      </details>
    </section>
  );
}
