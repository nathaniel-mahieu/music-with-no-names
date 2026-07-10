"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type RefObject,
} from "react";
import {
  approximateRatio,
  centsFromRatio,
  commonPeriodSeconds,
  findCoincidingPartials,
  harmonicPartials,
} from "@/lib/music-math";
import { HarmonyLab } from "./HarmonyLab";
import { RhythmLab } from "./RhythmLab";
import { AtlasLab } from "./AtlasLab";

type Timbre = "sine" | "harmonic";
type LabId = "ratio" | "harmony" | "rhythm" | "atlas";

const LABS: { id: LabId; label: string }[] = [
  { id: "ratio", label: "Ratio" },
  { id: "harmony", label: "Harmony" },
  { id: "rhythm", label: "Rhythm" },
  { id: "atlas", label: "Atlas" },
];

const LAB_COPY: Record<
  LabId,
  {
    eyebrow: string;
    title: string;
    description: string;
    principleTop: string;
    principleMain: string;
    principleBottom: string;
  }
> = {
  ratio: {
    eyebrow: "A first-principles music instrument",
    title: "Hear relationships, not labels.",
    description:
      "Start with one vibration. Add another. Change only their relationship, then hear and see why some patterns fuse, shimmer, beat, or refuse to settle.",
    principleTop: "Invariant",
    principleMain: "ratio",
    principleBottom: "embodied in frequency",
  },
  harmony: {
    eyebrow: "A field of simultaneous relationships",
    title: "Build harmony from shared motion.",
    description:
      "Add a third voice and the problem changes. Pairwise distances interact with one global periodic shape, competing centers, and the physical spectrum of every source.",
    principleTop: "Local intervals",
    principleMain: "→ field",
    principleBottom: "one spectrum, many readings",
  },
  rhythm: {
    eyebrow: "Time before meter names",
    title: "Feel ratios unfold in time.",
    description:
      "Place events around a pulse cycle. Keep their spacing ratios fixed while changing tempo and microtiming to reveal where rhythm becomes movement.",
    principleTop: "Relative duration",
    principleMain: "pulse",
    principleBottom: "embodied in seconds",
  },
  atlas: {
    eyebrow: "Existing music as navigational landmarks",
    title: "Map experience, not objective quality.",
    description:
      "Place recordings as trajectories through tension, surprise, drive, repetition, and expression—then change the listener and purpose instead of pretending one region is universally good.",
    principleTop: "Sound + sequence",
    principleMain: "→ response",
    principleBottom: "conditioned by listener and goal",
  },
};

type AudioNodes = {
  context: AudioContext;
  master: GainNode;
  oscillators: [OscillatorNode, OscillatorNode];
};

type CanvasDraw = (
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
  canvas: HTMLCanvasElement,
) => void;

const PRESETS = [
  { label: "1:1", value: 1 },
  { label: "16:15", value: 16 / 15 },
  { label: "6:5", value: 6 / 5 },
  { label: "5:4", value: 5 / 4 },
  { label: "4:3", value: 4 / 3 },
  { label: "3:2", value: 3 / 2 },
  { label: "√2", value: Math.SQRT2 },
  { label: "2:1", value: 2 },
] as const;

function makePeriodicWave(context: AudioContext): PeriodicWave {
  const real = new Float32Array(12);
  const imaginary = new Float32Array(12);

  for (let harmonic = 1; harmonic < imaginary.length; harmonic += 1) {
    imaginary[harmonic] = 1 / harmonic ** 1.2;
  }

  return context.createPeriodicWave(real, imaginary, {
    disableNormalization: false,
  });
}

function applyTimbre(
  context: AudioContext,
  oscillators: [OscillatorNode, OscillatorNode],
  timbre: Timbre,
) {
  if (timbre === "sine") {
    oscillators.forEach((oscillator) => {
      oscillator.type = "sine";
    });
    return;
  }

  const wave = makePeriodicWave(context);
  oscillators.forEach((oscillator) => oscillator.setPeriodicWave(wave));
}

function useRatioAudio(referenceHz: number, ratio: number, timbre: Timbre) {
  const nodesRef = useRef<AudioNodes | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [audioMessage, setAudioMessage] = useState(
    "Audio is off. Playback starts only when you choose to listen.",
  );

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
          // The oscillator may already have stopped during page teardown.
        }
      });
      void nodes.context.close();
    }, 60);

    setIsPlaying(false);
    setAudioMessage("Audio stopped safely.");
  }, []);

  const start = useCallback(async () => {
    if (nodesRef.current) return;

    const AudioContextConstructor = window.AudioContext;
    if (!AudioContextConstructor) {
      setAudioMessage("This browser does not provide the audio features this lab needs.");
      return;
    }

    try {
      const context = new AudioContextConstructor();
      await context.resume();

      const master = context.createGain();
      const compressor = context.createDynamicsCompressor();
      const lowerGain = context.createGain();
      const upperGain = context.createGain();
      const lower = context.createOscillator();
      const upper = context.createOscillator();
      const now = context.currentTime;

      compressor.threshold.setValueAtTime(-12, now);
      compressor.knee.setValueAtTime(18, now);
      compressor.ratio.setValueAtTime(6, now);
      compressor.attack.setValueAtTime(0.003, now);
      compressor.release.setValueAtTime(0.15, now);
      lowerGain.gain.setValueAtTime(0.42, now);
      upperGain.gain.setValueAtTime(0.42, now);
      master.gain.setValueAtTime(0.0001, now);

      lower.frequency.setValueAtTime(referenceHz, now);
      upper.frequency.setValueAtTime(referenceHz * ratio, now);
      applyTimbre(context, [lower, upper], timbre);

      lower.connect(lowerGain).connect(master);
      upper.connect(upperGain).connect(master);
      master.connect(compressor).connect(context.destination);
      lower.start();
      upper.start();
      master.gain.exponentialRampToValueAtTime(0.14, now + 0.055);

      nodesRef.current = {
        context,
        master,
        oscillators: [lower, upper],
      };
      setIsPlaying(true);
      setAudioMessage("Audio playing at a conservative level.");
    } catch {
      setAudioMessage("Audio could not start. Check this browser’s sound permissions.");
    }
  }, [ratio, referenceHz, timbre]);

  useEffect(() => {
    const nodes = nodesRef.current;
    if (!nodes) return;

    const now = nodes.context.currentTime;
    nodes.oscillators[0].frequency.setTargetAtTime(referenceHz, now, 0.018);
    nodes.oscillators[1].frequency.setTargetAtTime(
      referenceHz * ratio,
      now,
      0.018,
    );
    applyTimbre(nodes.context, nodes.oscillators, timbre);
  }, [ratio, referenceHz, timbre]);

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

  return { isPlaying, audioMessage, start, stop };
}

function canvasColors(canvas: HTMLCanvasElement) {
  const styles = getComputedStyle(canvas);
  return {
    grid: styles.getPropertyValue("--line").trim(),
    lower: styles.getPropertyValue("--tone-a").trim(),
    upper: styles.getPropertyValue("--tone-b").trim(),
    sum: styles.getPropertyValue("--accent").trim(),
    muted: styles.getPropertyValue("--muted").trim(),
    foreground: styles.getPropertyValue("--foreground").trim(),
  };
}

function drawGrid(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
  color: string,
) {
  context.save();
  context.strokeStyle = color;
  context.lineWidth = 1;
  context.globalAlpha = 0.55;
  for (let step = 1; step < 4; step += 1) {
    context.beginPath();
    context.moveTo((width * step) / 4, 0);
    context.lineTo((width * step) / 4, height);
    context.stroke();
  }
  for (let step = 1; step < 4; step += 1) {
    context.beginPath();
    context.moveTo(0, (height * step) / 4);
    context.lineTo(width, (height * step) / 4);
    context.stroke();
  }
  context.restore();
}

function ResponsiveCanvas({
  draw,
  label,
  canvasRef,
}: {
  draw: CanvasDraw;
  label: string;
  canvasRef?: RefObject<HTMLCanvasElement | null>;
}) {
  const localRef = useRef<HTMLCanvasElement>(null);
  const resolvedRef = canvasRef ?? localRef;

  useEffect(() => {
    const canvas = resolvedRef.current;
    if (!canvas) return;

    const render = () => {
      const bounds = canvas.getBoundingClientRect();
      const width = Math.max(280, Math.round(bounds.width));
      const height = Math.max(190, Math.round(bounds.height));
      const pixelRatio = Math.min(window.devicePixelRatio || 1, 2);

      canvas.width = Math.round(width * pixelRatio);
      canvas.height = Math.round(height * pixelRatio);
      const context = canvas.getContext("2d");
      if (!context) return;
      context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
      context.clearRect(0, 0, width, height);
      draw(context, width, height, canvas);
    };

    render();
    const observer = new ResizeObserver(render);
    observer.observe(canvas);
    return () => observer.disconnect();
  }, [draw, resolvedRef]);

  return <canvas ref={resolvedRef} role="img" aria-label={label} />;
}

function formatHertz(value: number) {
  return `${value >= 1000 ? (value / 1000).toFixed(2) : value.toFixed(1)} ${
    value >= 1000 ? "kHz" : "Hz"
  }`;
}

export function RatioLab() {
  const [activeLab, setActiveLab] = useState<LabId>("ratio");
  const [referenceHz, setReferenceHz] = useState(220);
  const [ratio, setRatio] = useState(3 / 2);
  const [timbre, setTimbre] = useState<Timbre>("harmonic");
  const { isPlaying, audioMessage, start, stop } = useRatioAudio(
    referenceHz,
    ratio,
    timbre,
  );
  const activeCopy = LAB_COPY[activeLab];

  const selectLab = (lab: LabId) => {
    if (activeLab === "ratio" && isPlaying) stop();
    setActiveLab(lab);
    window.requestAnimationFrame(() => {
      document.getElementById("lab-stage")?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    });
  };

  const approximation = useMemo(() => approximateRatio(ratio, 16), [ratio]);
  const period = useMemo(
    () => commonPeriodSeconds(referenceHz, ratio, 16, 0.2),
    [ratio, referenceHz],
  );
  const partialCount = timbre === "sine" ? 1 : 10;
  const coincidences = useMemo(
    () =>
      findCoincidingPartials(
        referenceHz,
        referenceHz * ratio,
        partialCount,
        3,
      ),
    [partialCount, ratio, referenceHz],
  );

  const exactShortRatio =
    Math.abs(approximation.errorCents) <= 0.2 &&
    approximation.denominator <= 16;
  const ratioHeading = exactShortRatio
    ? `${approximation.numerator}:${approximation.denominator}`
    : `${ratio.toFixed(4)}×`;
  const approximationNote = exactShortRatio
    ? "short integer relationship"
    : `nearest short ratio ${approximation.numerator}:${approximation.denominator} · ${Math.abs(
        approximation.errorCents,
      ).toFixed(1)}¢ away`;

  const waveformDraw = useCallback<CanvasDraw>(
    (context, width, height, canvas) => {
      const colors = canvasColors(canvas);
      drawGrid(context, width, height, colors.grid);
      const duration = period ? Math.min(period * 2, 8 / referenceHz) : 6 / referenceHz;
      const samples = Math.max(500, Math.round(width * 1.4));

      const drawTone = (
        color: string,
        amplitude: number,
        valueAt: (time: number) => number,
        lineWidth: number,
      ) => {
        context.beginPath();
        context.strokeStyle = color;
        context.lineWidth = lineWidth;
        for (let sample = 0; sample <= samples; sample += 1) {
          const time = (sample / samples) * duration;
          const x = (sample / samples) * width;
          const y = height / 2 - valueAt(time) * amplitude;
          if (sample === 0) context.moveTo(x, y);
          else context.lineTo(x, y);
        }
        context.stroke();
      };

      context.globalAlpha = 0.52;
      drawTone(
        colors.lower,
        height * 0.19,
        (time) => Math.sin(2 * Math.PI * referenceHz * time),
        1.4,
      );
      drawTone(
        colors.upper,
        height * 0.19,
        (time) => Math.sin(2 * Math.PI * referenceHz * ratio * time),
        1.4,
      );
      context.globalAlpha = 1;
      drawTone(
        colors.sum,
        height * 0.31,
        (time) =>
          (Math.sin(2 * Math.PI * referenceHz * time) +
            Math.sin(2 * Math.PI * referenceHz * ratio * time)) /
          2,
        2.2,
      );
    },
    [period, ratio, referenceHz],
  );

  const spectrumDraw = useCallback<CanvasDraw>(
    (context, width, height, canvas) => {
      const colors = canvasColors(canvas);
      drawGrid(context, width, height, colors.grid);
      const lower = harmonicPartials(referenceHz, partialCount);
      const upper = harmonicPartials(referenceHz * ratio, partialCount);
      const minHz = referenceHz * 0.9;
      const maxHz = Math.max(
        lower.at(-1)?.frequencyHz ?? referenceHz,
        upper.at(-1)?.frequencyHz ?? referenceHz * ratio,
      );
      const top = 18;
      const bottom = height - 30;
      const xForFrequency = (frequencyHz: number) =>
        16 +
        (Math.log2(frequencyHz / minHz) / Math.log2(maxHz / minHz)) *
          (width - 32);

      const drawPartial = (
        frequencyHz: number,
        amplitude: number,
        color: string,
        offset: number,
      ) => {
        const x = xForFrequency(frequencyHz) + offset;
        context.beginPath();
        context.strokeStyle = color;
        context.lineWidth = 2;
        context.moveTo(x, bottom);
        context.lineTo(x, bottom - amplitude * (bottom - top));
        context.stroke();
      };

      lower.forEach((partial) =>
        drawPartial(partial.frequencyHz, partial.amplitude, colors.lower, -1.5),
      );
      upper.forEach((partial) =>
        drawPartial(partial.frequencyHz, partial.amplitude, colors.upper, 1.5),
      );

      context.strokeStyle = colors.sum;
      context.fillStyle = colors.sum;
      coincidences.forEach((match) => {
        const x = xForFrequency(match.frequencyHz);
        context.beginPath();
        context.lineWidth = 4;
        context.moveTo(x, bottom + 2);
        context.lineTo(x, bottom - 12);
        context.stroke();
        context.beginPath();
        context.arc(x, bottom - 18, 3.5, 0, Math.PI * 2);
        context.fill();
      });

      context.fillStyle = colors.muted;
      context.font = "12px ui-monospace, monospace";
      context.textAlign = "left";
      context.fillText(formatHertz(minHz / 0.9), 16, height - 9);
      context.textAlign = "right";
      context.fillText(formatHertz(maxHz), width - 16, height - 9);
    },
    [coincidences, partialCount, ratio, referenceHz],
  );

  const lissajousDraw = useCallback<CanvasDraw>(
    (context, width, height, canvas) => {
      const colors = canvasColors(canvas);
      drawGrid(context, width, height, colors.grid);
      const radiusX = width * 0.39;
      const radiusY = height * 0.39;
      const duration = period ?? 16 / referenceHz;
      const samples = 900;

      context.beginPath();
      context.strokeStyle = colors.sum;
      context.lineWidth = 2;
      for (let sample = 0; sample <= samples; sample += 1) {
        const time = (sample / samples) * duration;
        const x = width / 2 + Math.sin(2 * Math.PI * referenceHz * time) * radiusX;
        const y =
          height / 2 +
          Math.sin(2 * Math.PI * referenceHz * ratio * time) * radiusY;
        if (sample === 0) context.moveTo(x, y);
        else context.lineTo(x, y);
      }
      context.stroke();

      context.fillStyle = colors.lower;
      context.beginPath();
      context.arc(width / 2 + radiusX, height / 2, 4, 0, Math.PI * 2);
      context.fill();
      context.fillStyle = colors.upper;
      context.beginPath();
      context.arc(width / 2, height / 2 + radiusY, 4, 0, Math.PI * 2);
      context.fill();
    },
    [period, ratio, referenceHz],
  );

  const relationshipCopy = exactShortRatio
    ? `The lower cycle repeats ${approximation.denominator} time${
        approximation.denominator === 1 ? "" : "s"
      } while the upper repeats ${approximation.numerator}. Their combined motion closes into one short shape.`
    : "These cycles do not close into a short integer pattern. The trace keeps drifting, so the relationship feels less like one fused repeating object.";

  const overlapCopy =
    timbre === "sine"
      ? "Pure sine tones have no upper partials to align or collide. You are hearing only the relationship between two fundamentals."
      : coincidences.length > 0
        ? `${coincidences.length} partial alignment${
            coincidences.length === 1 ? " is" : "s are"
          } visible in this range. The earliest aligns lower partial ${
            coincidences[0].lowerIndex
          } with upper partial ${coincidences[0].upperIndex}.`
        : "No partials align within this visible range. Near-misses can create beating or spectral tension depending on register and timbre.";

  return (
    <main className="app-shell">
      <header className="site-header">
        <a className="brand" href="#top" aria-label="Music With No Names home">
          <span className="brand-mark" aria-hidden="true">
            ∿
          </span>
          <span>Music With No Names</span>
        </a>
        <nav className="lab-nav" aria-label="Learning labs">
          {LABS.map((lab) => (
            <button
              key={lab.id}
              type="button"
              className={activeLab === lab.id ? "is-selected" : ""}
              onClick={() => selectLab(lab.id)}
              aria-pressed={activeLab === lab.id}
            >
              {lab.label}
            </button>
          ))}
        </nav>
        <div className="header-status">
          <span className="status-dot" aria-hidden="true" />
          {activeLab} lab · v0.3
        </div>
      </header>

      <section className="hero" id="top">
        <div className="hero-copy">
          <p className="eyebrow">{activeCopy.eyebrow}</p>
          <h1>{activeCopy.title}</h1>
          <p className="hero-description">{activeCopy.description}</p>
        </div>
        <div className="hero-principle" aria-label="Core principle">
          <span>{activeCopy.principleTop}</span>
          <strong>{activeLab === "ratio" ? ratioHeading : activeCopy.principleMain}</strong>
          <span>
            {activeLab === "ratio"
              ? `Embodied at ${formatHertz(referenceHz)}`
              : activeCopy.principleBottom}
          </span>
        </div>
      </section>

      <div id="lab-stage" className="lab-stage">
        {activeLab === "ratio" ? (
          <>
            <section className="instrument" aria-labelledby="instrument-title">
        <div className="control-panel">
          <div className="panel-heading">
            <div>
              <p className="section-kicker">01 · Relationship</p>
              <h2 id="instrument-title">Two oscillations</h2>
            </div>
            <button
              className={isPlaying ? "listen-button is-playing" : "listen-button"}
              type="button"
              onClick={isPlaying ? stop : () => void start()}
              aria-pressed={isPlaying}
            >
              <span className="listen-icon" aria-hidden="true">
                {isPlaying ? "■" : "▶"}
              </span>
              {isPlaying ? "Stop sound" : "Hear relationship"}
            </button>
          </div>

          <p className="sr-only" aria-live="polite">
            {audioMessage}
          </p>

          <div className="ratio-readout" aria-live="polite">
            <div>
              <span className="ratio-label">Frequency ratio</span>
              <strong>{ratioHeading}</strong>
            </div>
            <div className="ratio-physical">
              <span>{formatHertz(referenceHz)}</span>
              <span className="ratio-arrow" aria-hidden="true">
                →
              </span>
              <span>{formatHertz(referenceHz * ratio)}</span>
            </div>
          </div>
          <p className="approximation-note">{approximationNote}</p>

          <label className="control-field" htmlFor="ratio-control">
            <span>
              Relationship
              <output>{ratio.toFixed(4)}×</output>
            </span>
            <input
              id="ratio-control"
              type="range"
              min="1"
              max="2"
              step="0.001"
              value={ratio}
              onChange={(event) => setRatio(Number(event.target.value))}
            />
          </label>

          <div className="preset-row" aria-label="Ratio landmarks">
            {PRESETS.map((preset) => {
              const selected = Math.abs(ratio - preset.value) < 0.0005;
              return (
                <button
                  key={preset.label}
                  type="button"
                  className={selected ? "preset is-selected" : "preset"}
                  onClick={() => setRatio(preset.value)}
                  aria-pressed={selected}
                >
                  {preset.label}
                </button>
              );
            })}
          </div>

          <div className="secondary-controls">
            <label className="control-field" htmlFor="reference-control">
              <span>
                Physical register
                <output>{formatHertz(referenceHz)}</output>
              </span>
              <input
                id="reference-control"
                type="range"
                min="80"
                max="480"
                step="1"
                value={referenceHz}
                onChange={(event) => setReferenceHz(Number(event.target.value))}
              />
            </label>

            <div className="timbre-control">
              <span>Sound spectrum</span>
              <div className="segmented" role="group" aria-label="Sound spectrum">
                {(["sine", "harmonic"] as const).map((option) => (
                  <button
                    key={option}
                    type="button"
                    className={timbre === option ? "is-selected" : ""}
                    onClick={() => setTimbre(option)}
                    aria-pressed={timbre === option}
                  >
                    {option === "sine" ? "Pure sine" : "Harmonic"}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>

        <div className="observation-panel">
          <div className="panel-heading observation-heading">
            <div>
              <p className="section-kicker">02 · Observation</p>
              <h2>One relationship, three views</h2>
            </div>
            <div className="legend" aria-label="Visualization legend">
              <span><i className="legend-a" /> reference</span>
              <span><i className="legend-b" /> upper</span>
              <span><i className="legend-sum" /> combined</span>
            </div>
          </div>

          <div className="visual-grid">
            <article className="visual-card waveform-card">
              <div className="visual-card-heading">
                <div>
                  <span className="visual-number">A</span>
                  <h3>Motion through time</h3>
                </div>
                <span>{period ? `${(period * 1000).toFixed(2)} ms repeat` : "no short repeat"}</span>
              </div>
              <ResponsiveCanvas
                draw={waveformDraw}
                label={`Waveforms for frequencies ${referenceHz.toFixed(1)} hertz and ${(
                  referenceHz * ratio
                ).toFixed(1)} hertz, plus their combined waveform.`}
              />
            </article>

            <article className="visual-card spectrum-card">
              <div className="visual-card-heading">
                <div>
                  <span className="visual-number">B</span>
                  <h3>Energy across frequency</h3>
                </div>
                <span>{coincidences.length} aligned partial{coincidences.length === 1 ? "" : "s"}</span>
              </div>
              <ResponsiveCanvas
                draw={spectrumDraw}
                label={`Spectrum showing ${partialCount} partials per tone and ${coincidences.length} alignments.`}
              />
            </article>

            <article className="visual-card orbit-card">
              <div className="visual-card-heading">
                <div>
                  <span className="visual-number">C</span>
                  <h3>Cycle against cycle</h3>
                </div>
                <span>{exactShortRatio ? "closed path" : "drifting path"}</span>
              </div>
              <ResponsiveCanvas
                draw={lissajousDraw}
                label={`Cycle-against-cycle trace for ratio ${ratioHeading}. ${
                  exactShortRatio ? "The path closes." : "The path does not close quickly."
                }`}
              />
            </article>
          </div>
        </div>
            </section>

            <section className="explanation" aria-labelledby="explanation-title">
        <div className="explanation-heading">
          <p className="section-kicker">03 · Interpretation</p>
          <h2 id="explanation-title">What your ear may organize</h2>
        </div>
        <div className="explanation-grid">
          <article>
            <span className="concept-index">01</span>
            <h3>Common period</h3>
            <p>{relationshipCopy}</p>
          </article>
          <article>
            <span className="concept-index">02</span>
            <h3>Spectral overlap</h3>
            <p>{overlapCopy}</p>
          </article>
          <article>
            <span className="concept-index">03</span>
            <h3>What remains invariant</h3>
            <p>
              The relationship stays at {centsFromRatio(ratio).toFixed(1)} logarithmic
              units per octave while the absolute frequencies—and therefore the body’s
              response—change with register.
            </p>
          </article>
        </div>
        <div className="truth-note">
          <strong>Important:</strong> a short ratio can encourage fusion, but it is not a
          goodness score. Timbre, register, timing, expectation, familiarity, and purpose
          all change what this relationship becomes as music.
        </div>
            </section>
          </>
        ) : activeLab === "harmony" ? (
          <HarmonyLab />
        ) : activeLab === "rhythm" ? (
          <RhythmLab />
        ) : (
          <AtlasLab />
        )}
      </div>

      <footer>
        <span>Built from frequency, time, and listening.</span>
        <span>Roadmap phases R1 · H3 · T4 · L8 · G9</span>
      </footer>
    </main>
  );
}
