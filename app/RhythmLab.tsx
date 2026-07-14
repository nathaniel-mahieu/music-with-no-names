"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { cyclicOnsetIntervals } from "@/lib/music-math";
import { estimateTapTempo, liveRhythmPhraseProfile, nestedCyclePhases, pulseHypotheses, syncopationIndex, type LiveRhythmCluster } from "@/lib/rhythm-model";
import { SYNTH_MASTER_GAIN, configureSafetyCompressor } from "@/lib/audio-level";
import { PIANO_SESSION_KEY, parsePianoPhraseSpecimen, type PianoPhraseSpecimenEvent } from "@/lib/piano-session";

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
  gain.gain.setValueAtTime(anchor ? 0.8 : 0.58, time);
  gain.gain.exponentialRampToValueAtTime(0.0001, time + 0.055);
  oscillator.connect(gain).connect(destination);
  oscillator.start(time);
  oscillator.stop(time + 0.06);
}

function durationLabel(milliseconds: number) {
  return milliseconds >= 1_000 ? `${(milliseconds / 1_000).toFixed(1)} s` : `${Math.round(milliseconds)} ms`;
}

function connectionLabel(cluster: LiveRhythmCluster) {
  if (cluster.connection === "ending") return "phrase ending";
  if (cluster.connection === "unknown" || cluster.connectionMs == null) return "release unavailable";
  if (cluster.connection === "overlap") return `${durationLabel(cluster.connectionMs)} overlap`;
  if (cluster.connection === "silence") return `${durationLabel(Math.abs(cluster.connectionMs))} silence`;
  return `edges meet within ${durationLabel(Math.abs(cluster.connectionMs))}`;
}

function LivePhraseRhythmBridge({
  phrase,
  hydrated,
  onNavigateToPiano,
}: {
  phrase: PianoPhraseSpecimenEvent[];
  hydrated: boolean;
  onNavigateToPiano?: () => void;
}) {
  const profile = useMemo(() => liveRhythmPhraseProfile(phrase), [phrase]);
  const recentGaps = profile?.gaps.slice(-6) ?? [];
  const accessibleRatios = profile?.gaps.slice(-12).map((gap) => `${gap.localMultiple.toFixed(2)} times the local unit, nearest ${gap.ratioLabel}`).join(", ") ?? "";
  return (
    <section className="rhythm-live-bridge" aria-labelledby="rhythm-live-title">
      <div className="rhythm-live-heading">
        <div>
          <span className="workspace-label">Live phrase · pitch removed</span>
          <h3 id="rhythm-live-title">What remains when every pitch becomes the same point?</h3>
        </div>
        <p>Onsets become groups. Gaps become ratios. Releases reveal overlap or silence.</p>
      </div>

      {!hydrated ? (
        <p className="rhythm-live-status" role="status">Reading the retained phrase…</p>
      ) : profile ? (
        <>
          <p className="rhythm-live-status">{profile.attackCount} attacks → {profile.clusterCount} onset groups · {durationLabel(profile.elapsedMs)} span · MIDI timing only</p>
          <div
            className="rhythm-live-figure"
            role="img"
            aria-label={`Pitchless timing profile with ${profile.clusterCount} onset groups across ${durationLabel(profile.elapsedMs)}. The median onset gap is ${durationLabel(profile.localUnitMs)}. Recent local gap ratios are ${accessibleRatios}. ${profile.knownConnectionCount} connections include complete release evidence.`}
          >
            <div className="rhythm-live-axis" aria-hidden="true">
              <i />
              {profile.clusters.map((cluster, index) => (
                <span
                  key={cluster.eventIds.join("-")}
                  className={cluster.attackCount > 1 ? "is-cluster" : ""}
                  style={{
                    "--rhythm-left": `${Math.min(98, Math.max(2, cluster.relativeOnset * 100))}%`,
                    "--rhythm-size": `${Math.min(22, 10 + cluster.attackCount * 3)}px`,
                  } as CSSProperties}
                >
                  <b>{index + 1}</b>
                  {cluster.attackCount > 1 ? <small>×{cluster.attackCount}</small> : null}
                </span>
              ))}
              <small>start</small><small>{durationLabel(profile.elapsedMs)}</small>
            </div>
            <div className="rhythm-live-readouts">
              <div><span>Local ruler</span><strong>{durationLabel(profile.localUnitMs)} = 1</strong><small>median onset gap · not a detected beat</small></div>
              <div><span>Returning gap shapes</span><strong>{Math.round(profile.repeatedGapShare * 100)}%</strong><small>share of normalized gap lengths that recur closely</small></div>
              <div><span>MIDI attack range</span><strong>{profile.velocityRange}</strong><small>key-attack values · not acoustic loudness</small></div>
            </div>
            <ol className="rhythm-live-gaps" aria-label="Latest onset gaps">
              {recentGaps.map((gap) => {
                const source = profile.clusters[gap.fromCluster];
                return (
                  <li key={`${gap.fromCluster}-${gap.toCluster}`} className={gap.repeated ? "is-repeated" : ""}>
                    <span>{gap.fromCluster + 1} → {gap.toCluster + 1}</span>
                    <strong>{gap.localMultiple.toFixed(2)}×</strong>
                    <small>{durationLabel(gap.gapMs)} · nearest {gap.ratioLabel}</small>
                    <em>{gap.repeated ? "shape returns" : "new shape"} · {connectionLabel(source)}</em>
                  </li>
                );
              })}
            </ol>
          </div>
          <div className="rhythm-live-boundary">
            <p><strong>Keep the distinction:</strong> the median gap is a phrase-local ruler, not a detected pulse. A repeated ratio can help a gesture feel recognizable, while touch, meter, accent, expectation, and the listener still shape the experience. This is not a groove or quality score.</p>
            {onNavigateToPiano ? <button type="button" onClick={onNavigateToPiano}>Replay these gaps on new keys</button> : null}
          </div>
        </>
      ) : (
        <div className="rhythm-live-empty">
          <div>
            <strong>{phrase.length ? `${phrase.length} retained attack${phrase.length === 1 ? "" : "s"}, but not enough separated timing yet` : "No retained phrase yet"}</strong>
            <p>Play at least four attacks across three distinct onset groups. Notes arriving within 70 ms count as one rhythmic event, so a chord cannot masquerade as a fast rhythm.</p>
          </div>
          {onNavigateToPiano ? <button type="button" onClick={onNavigateToPiano}>Build a phrase in Piano</button> : null}
        </div>
      )}
    </section>
  );
}

export function RhythmLab({ onNavigateToPiano }: { onNavigateToPiano?: () => void }) {
  const [pattern, setPattern] = useState(() => buildPattern(RHYTHM_PRESETS[1].active));
  const [pulseRate, setPulseRate] = useState(180);
  const [oddDelayMs, setOddDelayMs] = useState(18);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentStep, setCurrentStep] = useState<number | null>(null);
  const [tapTimes, setTapTimes] = useState<number[]>([]);
  const [phraseSpecimen, setPhraseSpecimen] = useState<PianoPhraseSpecimenEvent[]>([]);
  const [phraseHydrated, setPhraseHydrated] = useState(false);
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
      configureSafetyCompressor(compressor, now);
      master.connect(compressor).connect(context.destination);
      master.gain.exponentialRampToValueAtTime(SYNTH_MASTER_GAIN, now + 0.05);

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

  useEffect(() => {
    try {
      setPhraseSpecimen(parsePianoPhraseSpecimen(window.sessionStorage.getItem(PIANO_SESSION_KEY)) ?? []);
    } catch {
      setPhraseSpecimen([]);
    }
    setPhraseHydrated(true);
  }, []);

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
          <p className="section-kicker">Rhythm Lab · the same phrase, heard as time</p>
          <h2 id="rhythm-title">See the timing shape before naming the beat.</h2>
        </div>
        <p>
          Begin with what your hands played. Remove pitch identity, group chord attacks, and compare every gap with a local ruler before opening a pulse grid.
        </p>
      </div>

      <LivePhraseRhythmBridge phrase={phraseSpecimen} hydrated={phraseHydrated} onNavigateToPiano={onNavigateToPiano} />

      <details className="rhythm-authoring-disclosure">
        <summary><strong>Build or hear an authored cycle</strong><span>optional twelve-position grid, pulse hypotheses, timing bias, and click playback</span></summary>
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
      </details>
    </section>
  );
}
