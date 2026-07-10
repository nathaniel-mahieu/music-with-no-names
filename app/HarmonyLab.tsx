"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  centsFromRatio,
  findCoincidingPartials,
  harmonicBasis,
  harmonicPartials,
} from "@/lib/music-math";

type HarmonyAudioNodes = {
  context: AudioContext;
  master: GainNode;
  oscillators: OscillatorNode[];
};

const HARMONY_PRESETS = [
  {
    label: "4:5:6",
    ratios: [1, 5 / 4, 3 / 2],
    note: "consecutive harmonics",
  },
  {
    label: "10:12:15",
    ratios: [1, 6 / 5, 3 / 2],
    note: "shared but wider basis",
  },
  {
    label: "8:9:12",
    ratios: [1, 9 / 8, 3 / 2],
    note: "open, center-light field",
  },
  {
    label: "1:√2:3/2",
    ratios: [1, Math.SQRT2, 3 / 2],
    note: "no short common basis",
  },
] as const;

const VOICE_NAMES = ["Reference", "Voice two", "Voice three"];

function createHarmonicWave(context: AudioContext) {
  const real = new Float32Array(10);
  const imaginary = new Float32Array(10);
  for (let index = 1; index < imaginary.length; index += 1) {
    imaginary[index] = 1 / index ** 1.2;
  }
  return context.createPeriodicWave(real, imaginary);
}

function useHarmonyAudio(referenceHz: number, ratios: number[]) {
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
      const wave = createHarmonicWave(context);
      const now = context.currentTime;
      const oscillators = ratios.map((ratio) => {
        const oscillator = context.createOscillator();
        const gain = context.createGain();
        oscillator.frequency.setValueAtTime(referenceHz * ratio, now);
        oscillator.setPeriodicWave(wave);
        gain.gain.setValueAtTime(0.28, now);
        oscillator.connect(gain).connect(master);
        oscillator.start();
        return oscillator;
      });

      master.gain.setValueAtTime(0.0001, now);
      compressor.threshold.setValueAtTime(-14, now);
      compressor.knee.setValueAtTime(20, now);
      compressor.ratio.setValueAtTime(7, now);
      master.connect(compressor).connect(context.destination);
      master.gain.exponentialRampToValueAtTime(0.105, now + 0.06);
      nodesRef.current = { context, master, oscillators };
      setIsPlaying(true);
    } catch {
      setIsPlaying(false);
    }
  }, [ratios, referenceHz]);

  useEffect(() => {
    const nodes = nodesRef.current;
    if (!nodes) return;
    const now = nodes.context.currentTime;
    nodes.oscillators.forEach((oscillator, index) => {
      oscillator.frequency.setTargetAtTime(
        referenceHz * ratios[index],
        now,
        0.018,
      );
    });
  }, [ratios, referenceHz]);

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
  const [ratios, setRatios] = useState<number[]>([1, 5 / 4, 3 / 2]);
  const { isPlaying, start, stop } = useHarmonyAudio(referenceHz, ratios);
  const basis = useMemo(() => harmonicBasis(ratios, 20, 1), [ratios]);
  const voicesHz = ratios.map((ratio) => referenceHz * ratio);

  const pairwise = useMemo(
    () => [
      centsFromRatio(ratios[1] / ratios[0]),
      centsFromRatio(ratios[2] / ratios[1]),
      centsFromRatio(ratios[2] / ratios[0]),
    ],
    [ratios],
  );

  const spectrum = useMemo(() => {
    const partials = voicesHz.flatMap((frequencyHz, voiceIndex) =>
      harmonicPartials(frequencyHz, 9).map((partial) => ({
        ...partial,
        voiceIndex,
      })),
    );
    const maxHz = Math.max(...partials.map((partial) => partial.frequencyHz));
    const minHz = referenceHz;
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
      maxHz,
      alignments: Array.from(alignments.entries()).map(([frequencyHz, strength]) => ({
        frequencyHz,
        strength,
        position:
          (Math.log2(frequencyHz / minHz) / Math.log2(maxHz / minHz)) * 100,
      })),
    };
  }, [referenceHz, voicesHz]);

  const selectedPreset = HARMONY_PRESETS.find((preset) =>
    preset.ratios.every((value, index) => Math.abs(value - ratios[index]) < 0.0005),
  );

  const setVoice = (index: number, value: number) => {
    setRatios((current) =>
      current.map((ratio, voiceIndex) => (voiceIndex === index ? value : ratio)),
    );
  };

  return (
    <section className="advanced-lab harmony-lab" aria-labelledby="harmony-title">
      <div className="lab-intro">
        <div>
          <p className="section-kicker">Harmony field · three simultaneous voices</p>
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
                  onClick={() => setRatios([...preset.ratios])}
                  aria-pressed={selected}
                >
                  <strong>{preset.label}</strong>
                  <span>{preset.note}</span>
                </button>
              );
            })}
          </div>

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
            {ratios.map((ratio, index) => (
              <label className="voice-control" key={VOICE_NAMES[index]}>
                <span>
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
                />
              </label>
            ))}
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
              aria-label={`Three voices at ratios ${ratios.map((value) => value.toFixed(3)).join(", ")}`}
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
              aria-label={`Harmonic spectrum for three voices with ${spectrum.alignments.length} alignment zones.`}
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
              <span className="spectrum-min">{formatFrequency(referenceHz)}</span>
              <span className="spectrum-max">{formatFrequency(spectrum.maxHz)}</span>
            </div>
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
          </div>
        </div>
      </div>

      <div className="lab-learning-note">
        <strong>Try this:</strong> begin at 4:5:6, then move only the middle voice. Notice
        how a tiny change can dissolve global alignment even when both neighboring
        distances remain individually familiar.
      </div>
    </section>
  );
}
