"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import {
  conventionalPitchName,
  noteContext,
  type PianoScale,
} from "@/lib/piano-model";
import {
  detectVocalFundamental,
  matchVocalPitch,
  VOCAL_INPUT_MINIMUM_RMS,
  vocalIntervalLabel,
  vocalReferenceFrequency,
  type VocalPitchDetection,
} from "@/lib/vocal-pitch-model";

type VocalPitchCoachProps = {
  anchorMidi: number;
  anchorSource: "latest-piano-attack" | "selected-do" | "voice-lab-reference";
  doMidi: number;
  scale: PianoScale;
  showConventions: boolean;
};

type MicrophoneState = "idle" | "requesting" | "listening" | "denied" | "unsupported" | "error";

type MicrophoneInput = {
  deviceId: string;
  label: string;
};

type AudioContextWindow = Window & typeof globalThis & {
  webkitAudioContext?: typeof AudioContext;
};

const VOCAL_INTERVAL_TARGETS = Array.from({ length: 25 }, (_, index) => index - 12);
const DEFAULT_MICROPHONE_ID = "default";

function formatHz(value: number) {
  return `${value.toFixed(value < 1000 ? 1 : 0)} Hz`;
}

function signedCents(value: number) {
  const rounded = Math.round(value);
  if (rounded === 0) return "0¢";
  return `${rounded > 0 ? "+" : "−"}${Math.abs(rounded)}¢`;
}

function signedSemitoneStep(value: number) {
  if (value === 0) return "target step";
  return `${value > 0 ? "+" : "−"}${Math.abs(value)} st`;
}

function playReferenceTone(context: AudioContext, frequencyHz: number, startsAt: number, durationSeconds: number) {
  const oscillator = context.createOscillator();
  const gain = context.createGain();
  oscillator.type = "sine";
  oscillator.frequency.setValueAtTime(frequencyHz, startsAt);
  gain.gain.setValueAtTime(0.0001, startsAt);
  gain.gain.exponentialRampToValueAtTime(0.026, startsAt + 0.018);
  gain.gain.setValueAtTime(0.026, startsAt + Math.max(0.03, durationSeconds - 0.07));
  gain.gain.exponentialRampToValueAtTime(0.0001, startsAt + durationSeconds);
  oscillator.connect(gain).connect(context.destination);
  oscillator.start(startsAt);
  oscillator.stop(startsAt + durationSeconds + 0.02);
}

export function VocalPitchCoach({ anchorMidi, anchorSource, doMidi, scale, showConventions }: VocalPitchCoachProps) {
  const [microphoneState, setMicrophoneState] = useState<MicrophoneState>("idle");
  const [microphoneNotice, setMicrophoneNotice] = useState("Microphone is off. Audio stays in this browser tab and is not recorded.");
  const [intervalSemitones, setIntervalSemitones] = useState(0);
  const [detection, setDetection] = useState<VocalPitchDetection | null>(null);
  const [inputLevel, setInputLevel] = useState(0);
  const [activeInputLabel, setActiveInputLabel] = useState("");
  const [microphoneInputs, setMicrophoneInputs] = useState<MicrophoneInput[]>([]);
  const [selectedMicrophoneId, setSelectedMicrophoneId] = useState(DEFAULT_MICROPHONE_ID);
  const [previewNotice, setPreviewNotice] = useState("Reference is silent until you choose to hear it.");
  const streamRef = useRef<MediaStream | null>(null);
  const contextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const analysisTimerRef = useRef<number | null>(null);
  const previewContextRef = useRef<AudioContext | null>(null);
  const previewTimerRef = useRef<number | null>(null);
  const smoothedFrequencyRef = useRef<number | null>(null);
  const missingFramesRef = useRef(0);
  const ignoreMicrophoneUntilRef = useRef(0);
  const targetMidi = Math.max(0, Math.min(127, anchorMidi + intervalSemitones));
  const targetReferenceHz = vocalReferenceFrequency(targetMidi);
  const pitchMatch = useMemo(() => detection ? matchVocalPitch(detection.frequencyHz, targetMidi) : null, [detection, targetMidi]);
  const nearestContext = pitchMatch ? noteContext(pitchMatch.nearestMidi, doMidi, scale) : null;
  const targetContext = noteContext(targetMidi, doMidi, scale);
  const anchorContext = noteContext(anchorMidi, doMidi, scale);
  const noteLabel = (midi: number, syllable: string) => showConventions ? conventionalPitchName(midi) : syllable;
  const targetLabel = noteLabel(targetMidi, targetContext.syllable);
  const anchorLabel = noteLabel(anchorMidi, anchorContext.syllable);
  const sungLabel = pitchMatch && nearestContext ? noteLabel(pitchMatch.nearestMidi, nearestContext.syllable) : "—";
  const railPosition = pitchMatch ? Math.max(0, Math.min(1, (pitchMatch.targetSemitones + 2.5) / 5)) : 0.5;
  const targetDistanceClass = !pitchMatch
    ? "is-waiting"
    : Math.abs(pitchMatch.targetCents) <= 5
      ? "is-centered"
      : pitchMatch.targetCents < 0
        ? "is-flat"
        : "is-sharp";
  const targetDistanceCopy = !pitchMatch
    ? "Sing a steady vowel to place your voice"
    : pitchMatch.nearestTargetStep === 0
      ? `${signedCents(pitchMatch.targetCents)} · ${pitchMatch.targetCents < -0.5 ? "below" : pitchMatch.targetCents > 0.5 ? "above" : "at"} target`
      : `${signedSemitoneStep(pitchMatch.nearestTargetStep)} from target · ${signedCents(pitchMatch.targetFineCents)} from that neighboring key`;
  const microphoneStatusCopy = microphoneState === "listening"
    ? detection
      ? "Pitch detected · keep the vowel steady"
      : inputLevel >= VOCAL_INPUT_MINIMUM_RMS
        ? "Voice signal detected · finding a stable pitch"
        : "Listening locally · waiting for your voice"
    : microphoneState === "requesting"
      ? "Opening your microphone"
      : microphoneState === "denied"
        ? "Microphone access is blocked"
        : microphoneState === "unsupported"
          ? "Microphone analysis is unavailable"
          : microphoneState === "error"
            ? "Microphone could not start"
            : "Microphone is off";
  const visualSummary = pitchMatch
    ? `Sung fundamental estimate ${pitchMatch.detectedFrequencyHz.toFixed(1)} hertz, nearest A4 equals 440 piano reference ${sungLabel} at ${pitchMatch.nearestReferenceHz.toFixed(1)} hertz, ${signedCents(pitchMatch.nearestCents)} from that key. Declared target ${targetLabel} at ${pitchMatch.targetReferenceHz.toFixed(1)} hertz. Voice is ${targetDistanceCopy}.`
    : `Voice pitch meter waiting. Declared target ${targetLabel} at ${targetReferenceHz.toFixed(1)} hertz from ${anchorSource === "latest-piano-attack" ? "the latest piano attack" : anchorSource === "voice-lab-reference" ? "the chosen Voice reference" : "selected Do"} plus ${intervalSemitones} semitones.`;

  const disposeMicrophoneResources = useCallback(() => {
    if (analysisTimerRef.current != null) window.clearInterval(analysisTimerRef.current);
    analysisTimerRef.current = null;
    analyserRef.current?.disconnect();
    analyserRef.current = null;
    streamRef.current?.getTracks().forEach((track) => {
      track.onmute = null;
      track.onunmute = null;
      track.onended = null;
      track.stop();
    });
    streamRef.current = null;
    const context = contextRef.current;
    contextRef.current = null;
    if (context && context.state !== "closed") void context.close();
    smoothedFrequencyRef.current = null;
    missingFramesRef.current = 0;
  }, []);

  const refreshMicrophoneInputs = useCallback(async () => {
    if (!navigator.mediaDevices?.enumerateDevices) return;
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      const inputs = devices
        .filter((device) => device.kind === "audioinput" && Boolean(device.deviceId) && device.deviceId !== DEFAULT_MICROPHONE_ID)
        .map((device, index) => ({
          deviceId: device.deviceId,
          label: device.label || `Microphone ${index + 1}`,
        }));
      setMicrophoneInputs(inputs);
      setSelectedMicrophoneId((current) => current === DEFAULT_MICROPHONE_ID || inputs.some((input) => input.deviceId === current)
        ? current
        : DEFAULT_MICROPHONE_ID);
    } catch {
      // The default input remains available even when a browser withholds the
      // device list. Permission errors are handled by startMicrophone.
    }
  }, []);

  const stopMicrophone = useCallback(() => {
    disposeMicrophoneResources();
    setDetection(null);
    setInputLevel(0);
    setActiveInputLabel("");
    setMicrophoneState("idle");
    setMicrophoneNotice("Microphone stopped. No audio or pitch history was retained.");
  }, [disposeMicrophoneResources]);

  const startMicrophone = useCallback(async (microphoneId = selectedMicrophoneId) => {
    const AudioContextConstructor = window.AudioContext || (window as AudioContextWindow).webkitAudioContext;
    if (!navigator.mediaDevices?.getUserMedia || !AudioContextConstructor) {
      setMicrophoneState("unsupported");
      setMicrophoneNotice("This browser does not expose local microphone analysis.");
      return;
    }
    disposeMicrophoneResources();
    setDetection(null);
    setInputLevel(0);
    setActiveInputLabel("");
    setMicrophoneState("requesting");
    setMicrophoneNotice("Waiting for microphone permission…");
    let context: AudioContext | null = null;
    let stream: MediaStream | null = null;
    try {
      context = new AudioContextConstructor({ latencyHint: "interactive" });
      await context.resume();
      stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: { ideal: 1 },
          echoCancellation: { ideal: false },
          noiseSuppression: { ideal: false },
          autoGainControl: { ideal: true },
          ...(microphoneId === DEFAULT_MICROPHONE_ID ? {} : { deviceId: { exact: microphoneId } }),
        },
        video: false,
      });
      await context.resume();
      const source = context.createMediaStreamSource(stream);
      const analyser = context.createAnalyser();
      analyser.fftSize = 4096;
      analyser.smoothingTimeConstant = 0;
      source.connect(analyser);
      streamRef.current = stream;
      contextRef.current = context;
      analyserRef.current = analyser;
      const inputTrack = stream.getAudioTracks()[0];
      setActiveInputLabel(inputTrack?.label || "browser-selected microphone");
      void refreshMicrophoneInputs();
      if (inputTrack) {
        inputTrack.onmute = () => {
          setDetection(null);
          setInputLevel(0);
          setMicrophoneNotice("The selected microphone stopped sending samples. Check the browser's input choice or reconnect the device.");
        };
        inputTrack.onunmute = () => setMicrophoneNotice("Microphone input resumed. Hold one steady vowel.");
        inputTrack.onended = () => {
          setDetection(null);
          setInputLevel(0);
          setSelectedMicrophoneId(DEFAULT_MICROPHONE_ID);
          setMicrophoneState("error");
          setMicrophoneNotice("The selected microphone disconnected. Reconnect it, then start the microphone again.");
          void refreshMicrophoneInputs();
        };
      }
      const samples = new Float32Array(analyser.fftSize);
      analysisTimerRef.current = window.setInterval(() => {
        if (performance.now() < ignoreMicrophoneUntilRef.current) return;
        const activeAnalyser = analyserRef.current;
        const activeContext = contextRef.current;
        if (!activeAnalyser || !activeContext || activeContext.state === "closed") return;
        if (activeContext.state === "suspended") void activeContext.resume();
        activeAnalyser.getFloatTimeDomainData(samples);
        let energy = 0;
        for (const sample of samples) energy += sample * sample;
        setInputLevel(Math.sqrt(energy / samples.length));
        const next = detectVocalFundamental(samples, activeContext.sampleRate);
        if (!next) {
          missingFramesRef.current += 1;
          if (missingFramesRef.current >= 4) {
            smoothedFrequencyRef.current = null;
            setDetection(null);
          }
          return;
        }
        missingFramesRef.current = 0;
        const prior = smoothedFrequencyRef.current;
        const distanceCents = prior == null ? Number.POSITIVE_INFINITY : Math.abs(1200 * Math.log2(next.frequencyHz / prior));
        const smoothedFrequency = prior != null && distanceCents < 70
          ? Math.exp(Math.log(prior) * 0.68 + Math.log(next.frequencyHz) * 0.32)
          : next.frequencyHz;
        smoothedFrequencyRef.current = smoothedFrequency;
        setDetection({ ...next, frequencyHz: smoothedFrequency });
      }, 80);
      setMicrophoneState("listening");
      setMicrophoneNotice(`Listening locally through ${inputTrack?.label || "the browser-selected microphone"}. Hold an ‘ah’ near the target for about one second.`);
    } catch (error) {
      if (analysisTimerRef.current != null) window.clearInterval(analysisTimerRef.current);
      analysisTimerRef.current = null;
      stream?.getTracks().forEach((track) => track.stop());
      if (context && context.state !== "closed") void context.close();
      streamRef.current = null;
      contextRef.current = null;
      analyserRef.current = null;
      const denied = error instanceof DOMException && (error.name === "NotAllowedError" || error.name === "SecurityError");
      const unavailable = error instanceof DOMException && (error.name === "NotFoundError" || error.name === "OverconstrainedError");
      if (unavailable) {
        setSelectedMicrophoneId(DEFAULT_MICROPHONE_ID);
        void refreshMicrophoneInputs();
      }
      setMicrophoneState(denied ? "denied" : "error");
      setInputLevel(0);
      setActiveInputLabel("");
      setMicrophoneNotice(denied
        ? "Allow microphone access for this site in your browser's address-bar settings, then try again."
        : unavailable
          ? "That microphone is no longer available. System default is selected; start the microphone again."
          : "The microphone could not start. Check the browser's selected input, then try again.");
    }
  }, [disposeMicrophoneResources, refreshMicrophoneInputs, selectedMicrophoneId]);

  const hearInterval = useCallback(async () => {
    const AudioContextConstructor = window.AudioContext || (window as AudioContextWindow).webkitAudioContext;
    if (!AudioContextConstructor) {
      setPreviewNotice("Reference playback is unavailable in this browser.");
      return;
    }
    if (previewTimerRef.current != null) window.clearTimeout(previewTimerRef.current);
    const priorContext = previewContextRef.current;
    if (priorContext && priorContext.state !== "closed") void priorContext.close();
    try {
      const context = new AudioContextConstructor({ latencyHint: "interactive" });
      previewContextRef.current = context;
      await context.resume();
      const startsAt = context.currentTime + 0.035;
      ignoreMicrophoneUntilRef.current = performance.now() + (intervalSemitones === 0 ? 800 : 1_300);
      playReferenceTone(context, vocalReferenceFrequency(anchorMidi), startsAt, 0.38);
      if (intervalSemitones !== 0) playReferenceTone(context, targetReferenceHz, startsAt + 0.52, 0.48);
      setPreviewNotice(intervalSemitones === 0 ? `Playing ${anchorLabel} quietly.` : `Playing ${anchorLabel}, then ${targetLabel}, quietly.`);
      previewTimerRef.current = window.setTimeout(() => {
        if (context.state !== "closed") void context.close();
        if (previewContextRef.current === context) previewContextRef.current = null;
        setPreviewNotice("Reference finished. Sing the target from memory or against your piano.");
      }, intervalSemitones === 0 ? 650 : 1_250);
    } catch {
      setPreviewNotice("Reference playback could not start. Your physical piano can still supply the target.");
    }
  }, [anchorLabel, anchorMidi, intervalSemitones, targetLabel, targetReferenceHz]);

  useEffect(() => () => {
    disposeMicrophoneResources();
    if (previewTimerRef.current != null) window.clearTimeout(previewTimerRef.current);
    const context = previewContextRef.current;
    if (context && context.state !== "closed") void context.close();
  }, [disposeMicrophoneResources]);

  useEffect(() => {
    const mediaDevices = navigator.mediaDevices;
    if (!mediaDevices?.addEventListener) return;
    const handleDeviceChange = () => {
      if (streamRef.current) void refreshMicrophoneInputs();
    };
    mediaDevices.addEventListener("devicechange", handleDeviceChange);
    return () => mediaDevices.removeEventListener("devicechange", handleDeviceChange);
  }, [refreshMicrophoneInputs]);

  return <section className={`piano-voice-coach ${targetDistanceClass}`} aria-labelledby="voice-coach-title">
    <header>
      <div><span>Voice match · local microphone</span><strong id="voice-coach-title">Sing the interval in semitones</strong><small>One monophonic fundamental estimate · no recording · no upload</small></div>
      <div className="piano-voice-actions">
        <label className="piano-voice-source" htmlFor="voice-input-source"><span>Microphone source</span><select id="voice-input-source" value={selectedMicrophoneId} disabled={microphoneState === "requesting"} onChange={(event) => {
          const microphoneId = event.target.value;
          setSelectedMicrophoneId(microphoneId);
          if (microphoneState === "listening") void startMicrophone(microphoneId);
        }}><option value={DEFAULT_MICROPHONE_ID}>System default{selectedMicrophoneId === DEFAULT_MICROPHONE_ID && activeInputLabel ? ` · ${activeInputLabel}` : ""}</option>{microphoneInputs.map((input) => <option key={input.deviceId} value={input.deviceId}>{input.label}</option>)}</select></label>
        <button type="button" aria-pressed={microphoneState === "listening"} disabled={microphoneState === "requesting"} onClick={microphoneState === "listening" ? stopMicrophone : () => void startMicrophone(selectedMicrophoneId)}>{microphoneState === "requesting" ? "Opening microphone…" : microphoneState === "listening" ? "Stop microphone" : "Start microphone"}</button>
        <button type="button" onClick={() => void hearInterval()}>{intervalSemitones === 0 ? "Hear target" : "Hear anchor → target"}</button>
      </div>
    </header>

    <div className="piano-voice-controls">
      <p><span>Anchor</span><strong>{anchorLabel} · {formatHz(vocalReferenceFrequency(anchorMidi))}</strong><small>{anchorSource === "latest-piano-attack" ? "latest piano attack" : anchorSource === "voice-lab-reference" ? "chosen on this Voice page" : "selected Do until you play a key"}</small></p>
      <label htmlFor="voice-interval"><span>Target interval</span><select id="voice-interval" value={intervalSemitones} onChange={(event) => setIntervalSemitones(Number(event.target.value))}>{VOCAL_INTERVAL_TARGETS.map((semitones) => <option key={semitones} value={semitones}>{vocalIntervalLabel(semitones)}</option>)}</select><small>Every choice is an exact equal-key distance from the anchor.</small></label>
      <p className="is-target"><span>Target piano reference</span><strong>{targetLabel} · {formatHz(targetReferenceHz)}</strong><small>A4=440 12-TET coordinate, not measured piano audio.</small></p>
    </div>

    <div className="piano-voice-input">
      <label htmlFor="voice-input-level"><span>Microphone input activity</span><meter id="voice-input-level" min={0} max={0.03} low={VOCAL_INPUT_MINIMUM_RMS} high={0.015} optimum={0.008} value={Math.min(0.03, inputLevel)}>{Math.round(inputLevel * 10_000) / 100}% RMS</meter></label>
      <strong>{microphoneState !== "listening" ? "microphone off" : detection ? "pitch detected" : inputLevel < 0.0004 ? "no input yet" : inputLevel < VOCAL_INPUT_MINIMUM_RMS ? "voice is very quiet · move closer" : "voice heard · hold one vowel steady"}</strong>
      <small>{activeInputLabel ? `Using ${activeInputLabel}. ` : ""}The level only confirms that samples are arriving; it is not a singing-quality score.</small>
    </div>

    <div className="piano-voice-reading">
      <div className="piano-voice-detected">
        <span>Live sung estimate</span>
        <strong>{pitchMatch ? `${sungLabel} · ${formatHz(pitchMatch.detectedFrequencyHz)}` : "—"}</strong>
        <small>{pitchMatch && detection ? `nearest piano reference ${formatHz(pitchMatch.nearestReferenceHz)} · ${signedCents(pitchMatch.nearestCents)} · clarity ${Math.round(detection.clarity * 100)}%` : microphoneState === "listening" && inputLevel >= VOCAL_INPUT_MINIMUM_RMS ? "Your voice is arriving. Hold an ‘ah’ steadily for about one second; breath noise and changing pitch are withheld." : microphoneState === "listening" ? "Sing closer to the microphone and watch the input activity move." : "Start the microphone when you are ready to sing."}</small>
      </div>
      <div className="piano-voice-distance">
        <span>Distance from target</span>
        <strong>{targetDistanceCopy}</strong>
        <small>{pitchMatch ? `${pitchMatch.frequencyDifferenceHz >= 0 ? "+" : "−"}${Math.abs(pitchMatch.frequencyDifferenceHz).toFixed(1)} Hz from the target reference` : "Semitone error stays coarse; cents show the fine position."}</small>
      </div>
      <div className="piano-voice-rail" role="img" aria-label={visualSummary}>
        <div aria-hidden="true"><i /><i /><i className="is-target" /><i /><i />{pitchMatch ? <b style={{ "--voice-position": `${railPosition * 100}%` } as CSSProperties} /> : null}</div>
        <ol aria-hidden="true"><li>−2 st</li><li>−1</li><li>target</li><li>+1</li><li>+2 st</li></ol>
        <small>{pitchMatch && Math.abs(pitchMatch.targetSemitones) > 2.5 ? `Marker pinned; exact distance is ${pitchMatch.targetSemitones > 0 ? "+" : "−"}${Math.abs(pitchMatch.targetSemitones).toFixed(2)} st.` : "Marker moves continuously: one full segment = one piano-key semitone."}</small>
      </div>
    </div>

    <footer>
      <p role="status" aria-live="polite"><strong>{microphoneStatusCopy}</strong><small>{microphoneNotice}</small></p>
      <p><strong>{previewNotice}</strong><small>Use headphones if the reference tone would leak back into the microphone.</small></p>
      <small>The microphone estimates one periodic fundamental, not vocal quality, correctness, timbre, harmony, emotion, or the acoustic tuning of a connected piano.</small>
    </footer>
  </section>;
}
