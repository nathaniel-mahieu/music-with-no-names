"use client";

import { useEffect, useRef, useState } from "react";
import { absolutePitchMidi } from "@/lib/piano-absolute-pitch-model";
import { conventionalPitchName } from "@/lib/piano-model";
import { detectVocalFundamental, matchVocalPitch } from "@/lib/vocal-pitch-model";
import styles from "./PianoAbsolutePitchHud.module.css";

type Phase = "ready" | "requesting" | "listening";
type AnchorResult = { nearestMidi: number; targetMidi: number; cents: number };

export function PitchAnchorCapture({ anchor, onStartCapture, onPlayReference }: {
  anchor: number;
  onStartCapture: () => void;
  onPlayReference: (midi: number) => void;
}) {
  const [phase, setPhase] = useState<Phase>("ready");
  const [notice, setNotice] = useState("");
  const [result, setResult] = useState<AnchorResult | null>(null);
  const cancel = useRef<(() => void) | null>(null);

  useEffect(() => () => { cancel.current?.(); }, []);

  async function captureHum() {
    const Context = window.AudioContext || (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!navigator.mediaDevices?.getUserMedia || !Context) {
      setNotice("This browser does not offer microphone analysis. Try humming into a tuner.");
      return;
    }
    cancel.current?.();
    onStartCapture();
    setPhase("requesting");
    setNotice("Waiting for microphone permission.");
    setResult(null);
    let context: AudioContext | undefined;
    let stream: MediaStream | undefined;
    let timer: number | undefined;
    let stopped = false;

    function dispose() {
      stopped = true;
      if (timer != null) window.clearInterval(timer);
      stream?.getTracks().forEach((track) => track.stop());
      if (context && context.state !== "closed") void context.close().catch(() => {});
      if (cancel.current === dispose) cancel.current = null;
    }

    cancel.current = dispose;

    try {
      context = new Context({ latencyHint: "interactive" });
      await context.resume();
      if (stopped) return;
      stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: true },
        video: false,
      });
      if (stopped) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }
      const source = context.createMediaStreamSource(stream);
      const analyser = context.createAnalyser();
      analyser.fftSize = 4096;
      source.connect(analyser);
      const samples = new Float32Array(analyser.fftSize);
      const sampleRate = context.sampleRate;
      const expires = performance.now() + 8_000;
      let stable: number[] = [];
      setPhase("listening");
      setNotice("Listening locally. Hold a steady hum for about one second.");
      timer = window.setInterval(() => {
        if (performance.now() > expires) {
          dispose();
          setPhase("ready");
          setNotice("No steady pitch detected. Move closer to the microphone and try again.");
          return;
        }
        analyser.getFloatTimeDomainData(samples);
        const pitch = detectVocalFundamental(samples, sampleRate);
        if (!pitch || pitch.clarity < .7) {
          stable = [];
          return;
        }
        const frequency = pitch.frequencyHz;
        if (stable.length > 0 && Math.abs(1200 * Math.log2(frequency / stable[0])) > 45) stable = [];
        stable.push(frequency);
        if (stable.length < 7) return;

        const medianHz = stable.sort((left, right) => left - right)[3];
        const match = matchVocalPitch(medianHz, absolutePitchMidi(anchor, 4));
        dispose();
        setPhase("ready");
        setNotice("");
        if (match) {
          const octaveOffset = Math.round(match.targetSemitones / 12);
          setResult({
            nearestMidi: match.nearestMidi,
            targetMidi: match.targetMidi + octaveOffset * 12,
            cents: Math.round(match.targetCents - octaveOffset * 1200),
          });
        }
      }, 100);
    } catch (error) {
      if (stopped) return;
      dispose();
      setPhase("ready");
      const denied = error instanceof DOMException && (error.name === "NotAllowedError" || error.name === "SecurityError");
      setNotice(denied ? "Allow microphone access in your browser, then try again." : "The microphone could not start. Check your browser input and try again.");
    }
  }

  const targetMidi = result?.targetMidi ?? absolutePitchMidi(anchor, 4);
  const cents = result?.cents ?? 0;
  const distance = cents === 0 ? "centered" : `${Math.abs(cents)} cents ${cents > 0 ? "above" : "below"}`;

  return <section className={styles.round} aria-label="Hum measurement">
    <p>Only the pitch is measured. No recording is saved or sent.</p>
    <div className={styles.roundControls}>
      {phase === "ready"
        ? <button type="button" className={styles.primary} onClick={() => void captureHum()}>Measure my hum</button>
        : <button type="button" onClick={() => {
          cancel.current?.();
          setPhase("ready");
          setNotice("Microphone stopped.");
        }}>Cancel microphone</button>}
      <button type="button" disabled={result == null || phase !== "ready"} onClick={() => onPlayReference(targetMidi)}>
        Hear {conventionalPitchName(targetMidi)} reference
      </button>
    </div>
    {notice ? <p className={styles.counter} role="status">{notice}</p> : null}
    {result ? <p className={styles.outcome} role="status">
      <strong>You hummed {conventionalPitchName(result.nearestMidi)}</strong>
      <span>{distance === "centered" ? `Centered on ${conventionalPitchName(targetMidi)}.` : `${distance} ${conventionalPitchName(targetMidi)}.`} Target measured in your nearest octave.</span>
    </p> : null}
  </section>;
}
