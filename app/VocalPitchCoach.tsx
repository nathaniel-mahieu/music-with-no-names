"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
import {
  VOCAL_SPECTRUM_MAXIMUM_HZ,
  VOCAL_SPECTRUM_MINIMUM_HZ,
  vocalSpectrumPosition,
  vocalTargetHarmonics,
} from "@/lib/vocal-spectrum-model";
import {
  vocalAccuracyReading,
  vocalClarityReading,
  vocalEarTrainingCue,
  vocalPitchLanePosition,
  vocalRecentPitchSpread,
  vocalStabilityLabel,
  type VocalPitchTrailSample,
} from "@/lib/vocal-training-model";

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
const VOCAL_SPECTRUM_TICKS = [50, 100, 200, 500, 1_000, 2_000, 3_000];
const VOCAL_TRAIL_DURATION_MS = 3_200;
const VOCAL_TRAIL_MAXIMUM_SAMPLES = 28;

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

function clearVoiceSpectrum(canvas: HTMLCanvasElement | null) {
  const context = canvas?.getContext("2d");
  if (canvas && context) context.clearRect(0, 0, canvas.width, canvas.height);
}

function drawVoiceSpectrum(canvas: HTMLCanvasElement | null, analyser: AnalyserNode, frequencyData: Float32Array<ArrayBuffer>) {
  if (!canvas) return null;
  const bounds = canvas.getBoundingClientRect();
  if (bounds.width <= 0 || bounds.height <= 0) return null;
  const pixelRatio = Math.min(2, window.devicePixelRatio || 1);
  const width = Math.max(1, Math.round(bounds.width * pixelRatio));
  const height = Math.max(1, Math.round(bounds.height * pixelRatio));
  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width;
    canvas.height = height;
  }
  const context = canvas.getContext("2d");
  if (!context) return null;
  analyser.getFloatFrequencyData(frequencyData);
  context.clearRect(0, 0, width, height);
  const styles = window.getComputedStyle(canvas);
  const spectrumColor = styles.getPropertyValue("--piano-blue").trim() || styles.color;
  const binWidthHz = analyser.context.sampleRate / analyser.fftSize;
  const decibelFloor = -105;
  const decibelCeiling = -25;
  let peakDecibels = Number.NEGATIVE_INFINITY;
  let peakFrequencyHz: number | null = null;
  context.beginPath();
  for (let x = 0; x < width; x += 1) {
    const share = width <= 1 ? 0 : x / (width - 1);
    const frequencyHz = VOCAL_SPECTRUM_MINIMUM_HZ * (VOCAL_SPECTRUM_MAXIMUM_HZ / VOCAL_SPECTRUM_MINIMUM_HZ) ** share;
    const bin = Math.min(frequencyData.length - 1, Math.max(0, Math.round(frequencyHz / binWidthHz)));
    const decibels = Number.isFinite(frequencyData[bin]) ? frequencyData[bin] : decibelFloor;
    if (decibels > peakDecibels) {
      peakDecibels = decibels;
      peakFrequencyHz = frequencyHz;
    }
    const amplitude = Math.max(0, Math.min(1, (decibels - decibelFloor) / (decibelCeiling - decibelFloor)));
    const y = height - amplitude * height;
    if (x === 0) context.moveTo(x, y);
    else context.lineTo(x, y);
  }
  context.lineTo(width, height);
  context.lineTo(0, height);
  context.closePath();
  context.globalAlpha = 0.16;
  context.fillStyle = spectrumColor;
  context.fill();
  context.globalAlpha = 1;
  context.beginPath();
  for (let x = 0; x < width; x += 1) {
    const share = width <= 1 ? 0 : x / (width - 1);
    const frequencyHz = VOCAL_SPECTRUM_MINIMUM_HZ * (VOCAL_SPECTRUM_MAXIMUM_HZ / VOCAL_SPECTRUM_MINIMUM_HZ) ** share;
    const bin = Math.min(frequencyData.length - 1, Math.max(0, Math.round(frequencyHz / binWidthHz)));
    const decibels = Number.isFinite(frequencyData[bin]) ? frequencyData[bin] : decibelFloor;
    const amplitude = Math.max(0, Math.min(1, (decibels - decibelFloor) / (decibelCeiling - decibelFloor)));
    const y = height - amplitude * height;
    if (x === 0) context.moveTo(x, y);
    else context.lineTo(x, y);
  }
  context.strokeStyle = spectrumColor;
  context.lineWidth = Math.max(1, pixelRatio * 1.25);
  context.stroke();
  return peakDecibels > decibelFloor + 8 ? peakFrequencyHz : null;
}

function buildVocalPitchTrailPlot(samples: VocalPitchTrailSample[]) {
  const latestAtMs = samples.at(-1)?.atMs ?? 0;
  const beginsAtMs = latestAtMs - VOCAL_TRAIL_DURATION_MS;
  const visible = samples.filter((sample) => sample.atMs >= beginsAtMs);
  let priorAtMs: number | null = null;
  const commands: string[] = [];
  const points = visible.map((sample) => {
    const x = Math.max(0, Math.min(1, (sample.atMs - beginsAtMs) / VOCAL_TRAIL_DURATION_MS));
    const y = vocalPitchLanePosition(sample.targetCents);
    commands.push(`${priorAtMs == null || sample.atMs - priorAtMs > 420 ? "M" : "L"}${(x * 1_000).toFixed(1)},${(y * 100).toFixed(1)}`);
    priorAtMs = sample.atMs;
    return { ...sample, x, y };
  });
  return { path: commands.join(" "), points };
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
  const [spectrumPeakHz, setSpectrumPeakHz] = useState<number | null>(null);
  const [pitchTrail, setPitchTrail] = useState<VocalPitchTrailSample[]>([]);
  const [previewNotice, setPreviewNotice] = useState("Reference is silent until you choose to hear it.");
  const streamRef = useRef<MediaStream | null>(null);
  const contextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const spectrumCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const spectrumFrameRef = useRef(0);
  const analysisTimerRef = useRef<number | null>(null);
  const previewContextRef = useRef<AudioContext | null>(null);
  const previewTimerRef = useRef<number | null>(null);
  const smoothedFrequencyRef = useRef<number | null>(null);
  const missingFramesRef = useRef(0);
  const ignoreMicrophoneUntilRef = useRef(0);
  const targetMidi = Math.max(0, Math.min(127, anchorMidi + intervalSemitones));
  const targetReferenceHz = vocalReferenceFrequency(targetMidi);
  const targetFrequencyRef = useRef(targetReferenceHz);
  const targetMidiRef = useRef(targetMidi);
  const targetHarmonics = useMemo(() => vocalTargetHarmonics(targetReferenceHz), [targetReferenceHz]);
  const visibleTargetHarmonics = targetHarmonics.slice(0, 12);
  const pitchMatch = useMemo(() => detection ? matchVocalPitch(detection.frequencyHz, targetMidi) : null, [detection, targetMidi]);
  const nearestContext = pitchMatch ? noteContext(pitchMatch.nearestMidi, doMidi, scale) : null;
  const targetContext = noteContext(targetMidi, doMidi, scale);
  const anchorContext = noteContext(anchorMidi, doMidi, scale);
  const noteLabel = (midi: number, syllable: string) => showConventions ? conventionalPitchName(midi) : syllable;
  const targetLabel = noteLabel(targetMidi, targetContext.syllable);
  const anchorLabel = noteLabel(anchorMidi, anchorContext.syllable);
  const sungLabel = pitchMatch && nearestContext ? noteLabel(pitchMatch.nearestMidi, nearestContext.syllable) : "—";
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
  const spectrumSummary = `Live microphone magnitude spectrum from ${VOCAL_SPECTRUM_MINIMUM_HZ} to ${VOCAL_SPECTRUM_MAXIMUM_HZ} hertz on a logarithmic frequency axis. Target ${targetLabel} has visible ideal harmonic guides at ${targetHarmonics.slice(0, 8).map((harmonic) => `${harmonic.harmonic} times, ${harmonic.frequencyHz.toFixed(1)} hertz`).join("; ") || "none in range"}.${pitchMatch ? ` Detected fundamental is ${pitchMatch.detectedFrequencyHz.toFixed(1)} hertz.` : spectrumPeakHz ? ` The strongest visible spectrum band is near ${spectrumPeakHz.toFixed(0)} hertz; this is not necessarily the fundamental.` : " No reliable fundamental is currently detected."}`;
  const currentPitchTrail = useMemo(() => pitchTrail.filter((sample) => sample.targetMidi === targetMidi), [pitchTrail, targetMidi]);
  const recentPitchSpread = useMemo(() => vocalRecentPitchSpread(currentPitchTrail), [currentPitchTrail]);
  const accuracyReading = pitchMatch ? vocalAccuracyReading(pitchMatch.targetCents) : null;
  const clarityReading = detection ? vocalClarityReading(detection.clarity) : null;
  const stabilityLabel = vocalStabilityLabel(recentPitchSpread);
  const earTrainingCue = pitchMatch
    ? vocalEarTrainingCue(pitchMatch.targetCents, recentPitchSpread)
    : microphoneState === "listening" && inputLevel >= VOCAL_INPUT_MINIMUM_RMS
      ? "Keep one vowel steady until a trail appears."
      : microphoneState === "listening"
        ? "Sing the target and let the input activity rise."
        : "Hear the target, sing it from memory, then check the map.";
  const pitchTrailPlot = useMemo(() => buildVocalPitchTrailPlot(currentPitchTrail), [currentPitchTrail]);
  const pitchTraceSummary = `${visualSummary} The vertical map spans one semitone below to one semitone above the target; higher pitch is higher on the page. ${accuracyReading ? `Current pitch center is ${accuracyReading.label}.` : "No current pitch center is plotted."} ${clarityReading ? `Detector periodicity is ${Math.round((detection?.clarity ?? 0) * 100)} percent, a ${clarityReading.label}.` : "No repeating-pitch trace is currently available."} Recent steadiness is ${stabilityLabel}${recentPitchSpread == null ? "." : ` with an approximately ${Math.round(recentPitchSpread)} cent 10th-to-90th-percentile spread.`}`;

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
    spectrumFrameRef.current = 0;
    clearVoiceSpectrum(spectrumCanvasRef.current);
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
    setPitchTrail([]);
    setInputLevel(0);
    setActiveInputLabel("");
    setSpectrumPeakHz(null);
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
    setPitchTrail([]);
    setInputLevel(0);
    setActiveInputLabel("");
    setSpectrumPeakHz(null);
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
      analyser.minDecibels = -105;
      analyser.maxDecibels = -25;
      analyser.smoothingTimeConstant = 0.62;
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
          setPitchTrail([]);
          setInputLevel(0);
          setMicrophoneNotice("The selected microphone stopped sending samples. Check the browser's input choice or reconnect the device.");
        };
        inputTrack.onunmute = () => setMicrophoneNotice("Microphone input resumed. Hold one steady vowel.");
        inputTrack.onended = () => {
          setDetection(null);
          setPitchTrail([]);
          setInputLevel(0);
          setSelectedMicrophoneId(DEFAULT_MICROPHONE_ID);
          setMicrophoneState("error");
          setMicrophoneNotice("The selected microphone disconnected. Reconnect it, then start the microphone again.");
          void refreshMicrophoneInputs();
        };
      }
      const samples = new Float32Array(analyser.fftSize);
      const frequencyData = new Float32Array(analyser.frequencyBinCount);
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
        const peakHz = drawVoiceSpectrum(spectrumCanvasRef.current, activeAnalyser, frequencyData);
        spectrumFrameRef.current += 1;
        if (spectrumFrameRef.current % 5 === 0) setSpectrumPeakHz(peakHz);
        const next = detectVocalFundamental(samples, activeContext.sampleRate, {
          minimumHz: 35,
          maximumHz: Math.min(2_400, Math.max(1_600, targetFrequencyRef.current * 2)),
        });
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
        if (spectrumFrameRef.current % 2 === 0) {
          const trailMatch = matchVocalPitch(smoothedFrequency, targetMidiRef.current);
          if (trailMatch) {
            const atMs = performance.now();
            setPitchTrail((current) => [...current.filter((sample) => sample.atMs >= atMs - VOCAL_TRAIL_DURATION_MS), {
              atMs,
              targetMidi: targetMidiRef.current,
              targetCents: trailMatch.targetCents,
              clarity: next.clarity,
            }].slice(-VOCAL_TRAIL_MAXIMUM_SAMPLES));
          }
        }
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
      setPitchTrail([]);
      setInputLevel(0);
      setActiveInputLabel("");
      setSpectrumPeakHz(null);
      setMicrophoneNotice(denied
        ? "Allow microphone access for this site in your browser's address-bar settings, then try again."
        : unavailable
          ? "That microphone is no longer available. System default is selected; start the microphone again."
          : "The microphone could not start. Check the browser's selected input, then try again.");
    }
  }, [disposeMicrophoneResources, refreshMicrophoneInputs, selectedMicrophoneId]);

  useEffect(() => {
    targetFrequencyRef.current = targetReferenceHz;
    targetMidiRef.current = targetMidi;
  }, [targetMidi, targetReferenceHz]);

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

    <section className="piano-voice-ear-training" aria-labelledby="voice-ear-training-title">
      <header>
        <div><span>Ear-training map</span><strong id="voice-ear-training-title">Center the pitch. Then steady the trail.</strong></div>
        <ol aria-label="Suggested ear-training loop"><li>Hear target</li><li>Sing from memory</li><li>Check direction</li><li>Repeat without looking</li></ol>
      </header>
      <div className="piano-voice-ear-layout">
        <figure>
          <div className="piano-voice-trace-frame" role="img" aria-label={pitchTraceSummary}>
            <ol className="piano-voice-trace-scale" aria-hidden="true">
              <li><strong>+1 st</strong><small>higher</small></li>
              <li><strong>+50¢</strong><small>neighbor edge</small></li>
              <li><strong>target</strong><small>0¢</small></li>
              <li><strong>−50¢</strong><small>neighbor edge</small></li>
              <li><strong>−1 st</strong><small>lower</small></li>
            </ol>
            <div className="piano-voice-trace-stage" aria-hidden="true">
              <i className="is-target-neighborhood" />
              <i className="is-center-lane" />
              <i className="is-upper-boundary" />
              <i className="is-target-line" />
              <i className="is-lower-boundary" />
              <svg viewBox="0 0 1000 100" preserveAspectRatio="none">
                {pitchTrailPlot.path ? <path className={clarityReading ? `is-${clarityReading.band}` : "is-waiting"} d={pitchTrailPlot.path} /> : null}
              </svg>
              {pitchTrailPlot.points.map((sample, index) => {
                const pointClass = Math.abs(sample.targetCents) <= 5 ? "is-centered" : sample.targetCents < 0 ? "is-flat" : "is-sharp";
                return <b key={`${sample.atMs}-${index}`} className={`${pointClass}${index === pitchTrailPlot.points.length - 1 ? " is-current" : ""}`} style={{ left: `${sample.x * 100}%`, top: `${sample.y * 100}%`, opacity: 0.35 + sample.clarity * 0.65 }} />;
              })}
              {!pitchTrailPlot.points.length ? <em>recent pitch trail appears here</em> : null}
              {pitchMatch && Math.abs(pitchMatch.targetCents) > 100 ? <strong className={pitchMatch.targetCents > 0 ? "is-above" : "is-below"}>{pitchMatch.targetCents > 0 ? "voice continues higher ↑" : "voice continues lower ↓"}</strong> : null}
            </div>
          </div>
          <div className="piano-voice-trace-time" aria-hidden="true"><span>recent</span><span>now</span></div>
          <figcaption>Height is pitch: up means sharper, down means flatter. The broad gold lane is the ±50¢ nearest-key neighborhood; its narrow center is ±5¢. Trail solidity is detector periodicity, not vocal quality.</figcaption>
        </figure>

        <div className="piano-voice-ear-readings">
          <p className="is-action"><span>Do next</span><strong>{earTrainingCue}</strong><small>Use the direction, then look away and try again from memory.</small></p>
          <p><span>Accuracy · pitch center</span><strong>{targetDistanceCopy}</strong><small>{pitchMatch && accuracyReading ? `${accuracyReading.label} · ${pitchMatch.frequencyDifferenceHz >= 0 ? "+" : "−"}${Math.abs(pitchMatch.frequencyDifferenceHz).toFixed(1)} Hz from ${targetLabel}` : "Cents measure logarithmic distance from the selected target; they do not grade the voice."}</small></p>
          <p><span>Clarity · can one pitch be tracked?</span><strong>{clarityReading ? clarityReading.label : "no repeating-pitch trace yet"}</strong><meter aria-label={`Detector periodicity ${Math.round((detection?.clarity ?? 0) * 100)} percent`} min={0} max={1} low={0.6} high={0.85} optimum={0.95} value={detection?.clarity ?? 0}>{Math.round((detection?.clarity ?? 0) * 100)}%</meter><small>{detection ? `${Math.round(detection.clarity * 100)}% periodic repeatability · not tone quality, diction, or musical correctness` : "A steady vowel usually makes the waveform repeat more clearly than breath, speech, or a changing pitch."}</small></p>
          <p><span>Steadiness · recent trail width</span><strong>{stabilityLabel}</strong><small>{recentPitchSpread == null ? "Keep singing to build about two seconds of evidence." : `Middle 80% of the recent trail spans about ${Math.round(recentPitchSpread)}¢. Narrower means the tracked pitch moved less.`}</small></p>
        </div>
      </div>
    </section>

    <section className="piano-voice-spectrum" aria-labelledby="voice-spectrum-title">
      <header><div><span>Physical sound detail</span><strong id="voice-spectrum-title">Voice energy × target harmonics</strong></div><small>{spectrumPeakHz ? `strongest visible band ≈ ${formatHz(spectrumPeakHz)}` : "waiting for microphone energy"}</small></header>
      <div className="piano-voice-spectrum-plot" role="img" aria-label={spectrumSummary}>
        <canvas ref={spectrumCanvasRef} aria-hidden="true" />
        <div className="piano-voice-spectrum-guides" aria-hidden="true">
          {visibleTargetHarmonics.map((harmonic) => <i key={harmonic.harmonic} style={{ left: `${harmonic.position * 100}%` }}>{harmonic.harmonic <= 4 ? <span>{harmonic.harmonic}×</span> : null}</i>)}
          {pitchMatch ? <b style={{ left: `${vocalSpectrumPosition(pitchMatch.detectedFrequencyHz) * 100}%` }}><span>voice</span></b> : null}
        </div>
      </div>
      <ol className="piano-voice-spectrum-axis" aria-hidden="true">{VOCAL_SPECTRUM_TICKS.map((frequencyHz) => <li key={frequencyHz} style={{ left: `${vocalSpectrumPosition(frequencyHz) * 100}%` }}>{frequencyHz >= 1_000 ? `${frequencyHz / 1_000}k` : frequencyHz}</li>)}</ol>
      <footer><span><i className="is-voice" />live microphone magnitude</span><span><i className="is-target" />ideal target harmonics</span><small>Log-frequency view · target guides are integer multiples, not predicted vocal loudness. Formants can make an upper harmonic taller than the fundamental.</small></footer>
    </section>

    <footer>
      <p role="status" aria-live="polite"><strong>{microphoneStatusCopy}</strong><small>{microphoneNotice}</small></p>
      <p><strong>{previewNotice}</strong><small>Use headphones if the reference tone would leak back into the microphone.</small></p>
      <small>The microphone estimates one periodic fundamental, not vocal quality, correctness, timbre, harmony, emotion, or the acoustic tuning of a connected piano.</small>
    </footer>
  </section>;
}
