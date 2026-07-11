"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { cyclicOnsetIntervals } from "@/lib/music-math";
import { estimateTapTempo, nestedCyclePhases, pulseHypotheses, syncopationIndex } from "@/lib/rhythm-model";

const PULSE_COUNT = 12;
const ANCHORS = new Set([0, 3, 6, 9]);

const RHYTHM_PRESETS = [
  {
    label: "3:3:3:3",
    note: "low syncopation · equal four-part cycle",
    active: [0, 3, 6, 9],
  },
  {
    label: "3:3:2:2:2",
    note: "medium syncopation · stable uneven motion",
    active: [0, 3, 6, 8, 10],
  },
  {
    label: "5:4:3",
    note: "three asymmetric spans",
    active: [0, 5, 9],
  },
  {
    label: "2:3:2:3:2",
    note: "high syncopation · alternating short and long",
    active: [0, 2, 5, 7, 10],
  },
] as const;

type RhythmEngine = {
  context: AudioContext;
  master: GainNode;
  timer: number;
  nextTime: number;
  nextStep: number;
};

function buildPattern(active: readonly number[]) {
  return Array.from({ length: PULSE_COUNT }, (_, index) => active.includes(index));
}

function scheduleClick(
  context: AudioContext,
  destination: AudioNode,
  time: number,
  anchor: boolean,
) {
  const oscillator = context.createOscillator();
  const gain = context.createGain();
  oscillator.type = "sine";
  oscillator.frequency.setValueAtTime(anchor ? 112 : 172, time);
  oscillator.frequency.exponentialRampToValueAtTime(anchor ? 78 : 124, time + 0.04);
  gain.gain.setValueAtTime(anchor ? 0.2 : 0.13, time);
  gain.gain.exponentialRampToValueAtTime(0.0001, time + 0.055);
  oscillator.connect(gain).connect(destination);
  oscillator.start(time);
  oscillator.stop(time + 0.06);
}

export function RhythmLab() {
  const [pattern, setPattern] = useState(() => buildPattern(RHYTHM_PRESETS[1].active));
  const [pulseRate, setPulseRate] = useState(180);
  const [oddDelayMs, setOddDelayMs] = useState(18);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentStep, setCurrentStep] = useState<number | null>(null);
  const [tapTimes, setTapTimes] = useState<number[]>([]);
  const engineRef = useRef<RhythmEngine | null>(null);
  const patternRef = useRef(pattern);
  const pulseRateRef = useRef(pulseRate);
  const oddDelayRef = useRef(oddDelayMs);

  useEffect(() => {
    patternRef.current = pattern;
  }, [pattern]);
  useEffect(() => {
    pulseRateRef.current = pulseRate;
  }, [pulseRate]);
  useEffect(() => {
    oddDelayRef.current = oddDelayMs;
  }, [oddDelayMs]);

  const intervals = useMemo(() => cyclicOnsetIntervals(pattern), [pattern]);
  const activeCount = pattern.filter(Boolean).length;
  const offAnchorCount = pattern.filter(
    (isActive, index) => isActive && !ANCHORS.has(index),
  ).length;
  const resistance = activeCount === 0 ? 0 : offAnchorCount / activeCount;
  const syncopation = useMemo(() => syncopationIndex(pattern), [pattern]);
  const hypotheses = useMemo(() => pulseHypotheses(pattern), [pattern]);
  const nestedPhases = useMemo(() => nestedCyclePhases(currentStep ?? 0, PULSE_COUNT), [currentStep]);
  const tapEstimate = useMemo(() => estimateTapTempo(tapTimes), [tapTimes]);
  const pulseSeconds = 60 / pulseRate;
  const cycleSeconds = pulseSeconds * PULSE_COUNT;

  const selectedPreset = RHYTHM_PRESETS.find((preset) =>
    buildPattern(preset.active).every((isActive, index) => isActive === pattern[index]),
  );

  const stop = useCallback(() => {
    const engine = engineRef.current;
    if (!engine) return;
    engineRef.current = null;
    window.clearInterval(engine.timer);
    const now = engine.context.currentTime;
    engine.master.gain.cancelScheduledValues(now);
    engine.master.gain.setValueAtTime(engine.master.gain.value, now);
    engine.master.gain.linearRampToValueAtTime(0.0001, now + 0.04);
    window.setTimeout(() => void engine.context.close(), 60);
    setIsPlaying(false);
    setCurrentStep(null);
  }, []);

  const start = useCallback(async () => {
    if (engineRef.current) return;
    try {
      const context = new AudioContext();
      await context.resume();
      const master = context.createGain();
      const compressor = context.createDynamicsCompressor();
      const now = context.currentTime;
      master.gain.setValueAtTime(0.0001, now);
      compressor.threshold.setValueAtTime(-14, now);
      compressor.ratio.setValueAtTime(8, now);
      master.connect(compressor).connect(context.destination);
      master.gain.exponentialRampToValueAtTime(0.16, now + 0.05);

      const engine: RhythmEngine = {
        context,
        master,
        timer: 0,
        nextTime: now + 0.08,
        nextStep: 0,
      };

      const scheduler = () => {
        const current = engineRef.current;
        if (!current) return;
        while (current.nextTime < context.currentTime + 0.12) {
          const step = current.nextStep;
          const delayed = step % 2 === 1 ? oddDelayRef.current / 1000 : 0;
          if (patternRef.current[step]) {
            scheduleClick(context, master, current.nextTime + delayed, ANCHORS.has(step));
          }
          const visualDelay = Math.max(0, (current.nextTime - context.currentTime) * 1000);
          window.setTimeout(() => setCurrentStep(step), visualDelay);
          current.nextTime += 60 / pulseRateRef.current;
          current.nextStep = (step + 1) % PULSE_COUNT;
        }
      };

      engine.timer = window.setInterval(scheduler, 25);
      engineRef.current = engine;
      scheduler();
      setIsPlaying(true);
    } catch {
      setIsPlaying(false);
    }
  }, []);

  useEffect(() => stop, [stop]);

  const toggleStep = (index: number) => {
    setPattern((current) => {
      const next = current.map((isActive, currentIndex) =>
        currentIndex === index ? !isActive : isActive,
      );
      return next.some(Boolean) ? next : current;
    });
  };

  const registerTap = () => {
    const now = performance.now();
    setTapTimes((current) => {
      const recent = current.length && now - current[current.length - 1] <= 2200 ? current : [];
      return [...recent, now].slice(-9);
    });
  };

  return (
    <section className="advanced-lab rhythm-lab" aria-labelledby="rhythm-title">
      <div className="lab-intro">
        <div>
          <p className="section-kicker">Rhythm field · one cycle, twelve pulse positions</p>
          <h2 id="rhythm-title">Time as ratio and resistance</h2>
        </div>
        <p>
          Rhythm begins with a pulse hypothesis, then gains character from where events
          confirm it, avoid it, or arrive slightly late. The grid is a measuring tool—not
          the music itself.
        </p>
      </div>

      <div className="lab-workspace rhythm-workspace">
        <div className="lab-controls">
          <div className="workspace-heading">
            <div>
              <span className="workspace-label">Onset spacing</span>
              <strong>{intervals.length ? intervals.join(" : ") : "—"}</strong>
              <small>{selectedPreset?.note ?? "custom circular pattern"}</small>
            </div>
            <button
              className={isPlaying ? "listen-button is-playing" : "listen-button"}
              type="button"
              onClick={isPlaying ? stop : () => void start()}
              aria-pressed={isPlaying}
            >
              <span aria-hidden="true">{isPlaying ? "■" : "▶"}</span>
              {isPlaying ? "Stop cycle" : "Hear cycle"}
            </button>
          </div>

          <span className="ab-label">Same twelve-pulse cycle · syncopation A/B</span>
          <div className="harmony-presets rhythm-presets" aria-label="Rhythm presets">
            {RHYTHM_PRESETS.map((preset) => {
              const selected = preset === selectedPreset;
              return (
                <button
                  key={preset.label}
                  type="button"
                  className={selected ? "harmony-preset is-selected" : "harmony-preset"}
                  onClick={() => setPattern(buildPattern(preset.active))}
                  aria-pressed={selected}
                >
                  <strong>{preset.label}</strong>
                  <span>{preset.note}</span>
                </button>
              );
            })}
          </div>

          <label className="control-field" htmlFor="pulse-rate">
            <span>
              Absolute pulse rate
              <output>{pulseRate} pulses/min</output>
            </span>
            <input
              id="pulse-rate"
              type="range"
              min="90"
              max="260"
              value={pulseRate}
              onChange={(event) => setPulseRate(Number(event.target.value))}
            />
          </label>

          <label className="control-field" htmlFor="odd-delay">
            <span>
              Odd-pulse timing bias
              <output>{oddDelayMs} ms late</output>
            </span>
            <input
              id="odd-delay"
              type="range"
              min="0"
              max="60"
              value={oddDelayMs}
              onChange={(event) => setOddDelayMs(Number(event.target.value))}
            />
          </label>

          <div className="tap-input">
            <div><span>Embodied pulse input</span><strong>{tapEstimate ? `${tapEstimate.pulsesPerMinute.toFixed(1)} /min` : tapTimes.length ? `${tapTimes.length} tap${tapTimes.length === 1 ? "" : "s"}` : "waiting"}</strong><small>{tapEstimate ? `${Math.round(tapEstimate.consistency * 100)}% timing consistency` : "Tap at least twice at a comfortable pulse."}</small></div>
            <button type="button" onClick={registerTap}>Tap pulse</button>
            <button type="button" onClick={() => setTapTimes([])} disabled={tapTimes.length === 0}>Reset</button>
          </div>
        </div>

        <div className="lab-observations rhythm-observations">
          <article className="analysis-card pulse-cycle-card">
            <div className="analysis-heading">
              <div>
                <span>A · Pulse cycle</span>
                <h3>Place and remove onsets</h3>
              </div>
              <small>{activeCount} events in {cycleSeconds.toFixed(2)} s</small>
            </div>

            <div className="pulse-rail" aria-label="Twelve-position pulse cycle">
              {pattern.map((isActive, index) => (
                <button
                  key={index}
                  type="button"
                  className={`${isActive ? "is-active" : ""} ${
                    currentStep === index ? "is-current" : ""
                  } ${ANCHORS.has(index) ? "is-anchor" : ""}`}
                  onClick={() => toggleStep(index)}
                  aria-pressed={isActive}
                  aria-label={`Pulse ${index + 1}${ANCHORS.has(index) ? ", reference anchor" : ""}`}
                >
                  <span>{index + 1}</span>
                </button>
              ))}
            </div>

            <div className="interval-ribbon" aria-label={`Onset spacings ${intervals.join(" to ")}`}>
              {intervals.map((interval, index) => (
                <span key={`${index}-${interval}`} style={{ flex: interval }}>
                  {interval}
                </span>
              ))}
            </div>
          </article>

          <article className="analysis-card pulse-hypotheses-card">
            <div className="analysis-heading"><div><span>B · Competing pulse hypotheses</span><h3>One pattern, several plausible clocks</h3></div><small>confidence is pattern-relative</small></div>
            <div className="pulse-hypothesis-grid">
              {hypotheses.map((hypothesis) => <div key={hypothesis.pulsesPerCycle}><span><strong>{hypothesis.pulsesPerCycle}</strong> pulses/cycle</span><i><b style={{ width: `${Math.round(hypothesis.confidence * 100)}%` }} /></i><output>{Math.round(hypothesis.confidence * 100)}%</output><small>{hypothesis.anchorPositions.map((position) => position + 1).join(" · ")}</small></div>)}
            </div>
            <div className="nested-phases" role="img" aria-label={`Current pulse ${currentStep === null ? 1 : currentStep + 1} within two-, three-, and four-part nested cycles`}>
              {nestedPhases.map((phase) => <div key={phase.divisions}><span>{phase.divisions}-part phase</span><i><b style={{ left: `${phase.phase * 100}%` }} /></i><output>{phase.phase.toFixed(2)}</output></div>)}
            </div>
          </article>

          <div className="rhythm-metrics">
            <article>
              <span>Cycle duration</span>
              <strong>{cycleSeconds.toFixed(2)} s</strong>
              <p>
                The ratio pattern is unchanged when tempo moves, but the body’s ability
                to entrain changes with absolute time.
              </p>
            </article>
            <article>
              <span>Anchor resistance</span>
              <strong>{Math.round(resistance * 100)}%</strong>
              <p>
                This model counts onsets away from four reference anchors. It describes
                conflict with this grid, not an objective groove score.
              </p>
            </article>
            <article>
              <span>Timing bias</span>
              <strong>{oddDelayMs} ms</strong>
              <p>
                Delaying alternate pulse positions changes feel without changing the
                written spacing ratios.
              </p>
            </article>
            <article>
              <span>Transparent syncopation</span>
              <strong>{Math.round(syncopation * 100)}%</strong>
              <p>Weak-position onsets gain weight when they precede silent stronger positions. This declared metrical model is not groove.</p>
            </article>
            <article>
              <span>Pulse clarity</span>
              <strong>{hypotheses[0] ? `${Math.round(hypotheses[0].confidence * 100)}%` : "open"}</strong>
              <p>Best pattern-relative pulse hypothesis. Groove remains a separate embodied report that this scalar does not compute.</p>
            </article>
          </div>
        </div>
      </div>

      <div className="lab-learning-note">
        <strong>Try this:</strong> keep the 3:3:2:2:2 pattern and sweep the pulse rate.
        Then add timing bias. The symbolic ratios stay fixed while movement, urgency,
        and groove change in the body.
      </div>
    </section>
  );
}
