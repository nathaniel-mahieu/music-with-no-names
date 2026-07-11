"use client";

import { useCallback, useMemo, useRef, useState, type ChangeEvent } from "react";
import {
  AUDIO_ANALYSIS_VERSION,
  isRecordingAnalysis,
  type AnalysisFrame,
  type RecordingAnalysis,
} from "@/lib/audio-analysis";

type Status = "idle" | "decoding" | "analyzing" | "ready" | "error";
type Playback = { context: AudioContext; source: AudioBufferSourceNode; gain: GainNode };
type Corrections = {
  pulseBpm: number | null;
  centerHz: number | null;
  sectionBoundariesSeconds: number[];
  sourceEventsSeconds: number[];
};
type TimeRange = { start: number; end: number };

function formatTime(seconds: number) {
  const minutes = Math.floor(seconds / 60);
  return `${minutes}:${Math.floor(seconds % 60).toString().padStart(2, "0")}`;
}

function clamp(value: number, minimum: number, maximum: number) {
  return Math.max(minimum, Math.min(maximum, value));
}

function frameMean(frames: AnalysisFrame[], read: (frame: AnalysisFrame) => number) {
  if (frames.length === 0) return 0;
  return frames.reduce((sum, frame) => sum + read(frame), 0) / frames.length;
}

function downsample<T>(values: T[], maximum = 120) {
  if (values.length <= maximum) return values;
  return Array.from({ length: maximum }, (_, index) => values[Math.floor((index / maximum) * values.length)]);
}

function downloadJson(filename: string, value: unknown) {
  const blob = new Blob([JSON.stringify(value, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

function analyzeInWorker(samples: Float32Array, sampleRate: number, filename: string, channelCount: number) {
  return new Promise<RecordingAnalysis>((resolve, reject) => {
    const worker = new Worker(new URL("../workers/audio-analysis.worker.ts", import.meta.url), { type: "module" });
    worker.onmessage = (message: MessageEvent<{ ok: boolean; analysis?: RecordingAnalysis; message?: string }>) => {
      worker.terminate();
      if (message.data.ok && message.data.analysis) resolve(message.data.analysis);
      else reject(new Error(message.data.message ?? "Analysis failed."));
    };
    worker.onerror = () => {
      worker.terminate();
      reject(new Error("The background analysis worker stopped unexpectedly."));
    };
    worker.postMessage({ samples, sampleRate, filename, channelCount }, [samples.buffer]);
  });
}

export function RecordingLab() {
  const [status, setStatus] = useState<Status>("idle");
  const [statusMessage, setStatusMessage] = useState("Choose an audio file from this device. Nothing is uploaded.");
  const [analysis, setAnalysis] = useState<RecordingAnalysis | null>(null);
  const [corrections, setCorrections] = useState<Corrections>({ pulseBpm: null, centerHz: null, sectionBoundariesSeconds: [], sourceEventsSeconds: [] });
  const [boundaryDraft, setBoundaryDraft] = useState(0);
  const [sourceEventDraft, setSourceEventDraft] = useState(0);
  const [selection, setSelection] = useState<TimeRange>({ start: 0, end: 0 });
  const [selectedSection, setSelectedSection] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [hasAudio, setHasAudio] = useState(false);
  const bufferRef = useRef<AudioBuffer | null>(null);
  const playbackRef = useRef<Playback | null>(null);

  const acceptAnalysis = (result: RecordingAnalysis) => {
    const pulseBpm = result.pulseCandidates[0]?.pulsesPerMinute ?? null;
    const frequencyEvidence = result.resolutions[1].frames.map((frame) => frame.zeroCrossingHz).filter((value): value is number => value !== null && value >= 35 && value <= 4000);
    const centerHz = frequencyEvidence.length ? frequencyEvidence.reduce((sum, value) => sum + value, 0) / frequencyEvidence.length : null;
    setAnalysis(result);
    setCorrections({ pulseBpm, centerHz, sectionBoundariesSeconds: result.sectionBoundariesSeconds, sourceEventsSeconds: [] });
    setBoundaryDraft(Math.min(result.source.durationSeconds, Math.max(0, result.source.durationSeconds / 2)));
    setSourceEventDraft(Math.min(result.source.durationSeconds, 1));
    setSelection({ start: 0, end: result.sectionBoundariesSeconds[1] ?? result.source.durationSeconds });
    setSelectedSection(0);
    setStatus("ready");
    setStatusMessage("Analysis ready. Model hypotheses remain editable and separate from the audio.");
  };

  const stop = useCallback(() => {
    const playback = playbackRef.current;
    if (!playback) return;
    playbackRef.current = null;
    const now = playback.context.currentTime;
    playback.gain.gain.cancelScheduledValues(now);
    playback.gain.gain.setValueAtTime(playback.gain.gain.value, now);
    playback.gain.gain.linearRampToValueAtTime(0.0001, now + 0.04);
    window.setTimeout(() => {
      try { playback.source.stop(); } catch { /* Already stopped. */ }
      void playback.context.close();
    }, 55);
    setIsPlaying(false);
  }, []);

  const play = async () => {
    if (!bufferRef.current || playbackRef.current) return;
    try {
      const context = new AudioContext();
      await context.resume();
      const source = context.createBufferSource();
      const gain = context.createGain();
      const compressor = context.createDynamicsCompressor();
      const now = context.currentTime;
      source.buffer = bufferRef.current;
      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.exponentialRampToValueAtTime(0.42, now + 0.06);
      compressor.threshold.setValueAtTime(-10, now);
      compressor.ratio.setValueAtTime(8, now);
      source.connect(gain).connect(compressor).connect(context.destination);
      source.start();
      source.onended = () => {
        if (playbackRef.current?.source === source) {
          playbackRef.current = null;
          setIsPlaying(false);
          void context.close();
        }
      };
      playbackRef.current = { context, source, gain };
      setIsPlaying(true);
    } catch {
      setStatusMessage("Playback could not start. Check this browser’s sound permission.");
    }
  };

  const analyzeFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    stop();
    if (file.size > 250 * 1024 * 1024) {
      setStatus("error");
      setStatusMessage("This prototype accepts local audio files up to 250 MB.");
      return;
    }

    setStatus("decoding");
    setStatusMessage(`Decoding ${file.name} locally…`);
    try {
      const context = new AudioContext();
      const decoded = await context.decodeAudioData(await file.arrayBuffer());
      await context.close();
      bufferRef.current = decoded;
      setHasAudio(true);
      const mono = new Float32Array(decoded.length);
      for (let channel = 0; channel < decoded.numberOfChannels; channel += 1) {
        const data = decoded.getChannelData(channel);
        for (let index = 0; index < data.length; index += 1) mono[index] += data[index] / decoded.numberOfChannels;
      }

      setStatus("analyzing");
      setStatusMessage("Analyzing physical and temporal evidence in a background worker…");
      const result = await analyzeInWorker(mono, decoded.sampleRate, file.name, decoded.numberOfChannels);
      acceptAnalysis(result);
    } catch (error) {
      bufferRef.current = null;
      setHasAudio(false);
      setStatus("error");
      setStatusMessage(error instanceof Error ? error.message : "This audio file could not be decoded.");
    }
  };

  const analyzeDemo = async () => {
    stop();
    setStatus("analyzing");
    setStatusMessage("Generating and analyzing an eight-second recurrence-and-rupture fixture…");
    try {
      const sampleRate = 12000;
      const durationSeconds = 8;
      const samples = new Float32Array(sampleRate * durationSeconds);
      for (let index = 0; index < samples.length; index += 1) {
        const time = index / sampleRate;
        const pulse = time % 0.5 < 0.12 ? 1 : 0;
        const upperFrequency = time < 4 ? 330 : 277;
        samples[index] = (Math.sin(2 * Math.PI * 220 * time) * 0.35 + Math.sin(2 * Math.PI * upperFrequency * time) * 0.2) * pulse * (time < 4 ? 1 : 0.72);
      }
      const playbackSamples = samples.slice();
      const buffer = new AudioBuffer({ length: playbackSamples.length, numberOfChannels: 1, sampleRate });
      buffer.copyToChannel(playbackSamples, 0);
      bufferRef.current = buffer;
      setHasAudio(true);
      const result = await analyzeInWorker(samples, sampleRate, "generated recurrence + rupture.wav", 1);
      acceptAnalysis(result);
    } catch (error) {
      bufferRef.current = null;
      setHasAudio(false);
      setStatus("error");
      setStatusMessage(error instanceof Error ? error.message : "The generated fixture could not be analyzed.");
    }
  };

  const importProfile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    try {
      const parsed: unknown = JSON.parse(await file.text());
      if (!isRecordingAnalysis(parsed)) throw new Error("This is not a compatible Music With No Names analysis profile.");
      const extras = parsed as RecordingAnalysis & { corrections?: Partial<Corrections> };
      setAnalysis(parsed);
      setCorrections({
        pulseBpm: typeof extras.corrections?.pulseBpm === "number" ? extras.corrections.pulseBpm : parsed.pulseCandidates[0]?.pulsesPerMinute ?? null,
        centerHz: typeof extras.corrections?.centerHz === "number" ? extras.corrections.centerHz : null,
        sectionBoundariesSeconds: Array.isArray(extras.corrections?.sectionBoundariesSeconds) ? extras.corrections.sectionBoundariesSeconds : parsed.sectionBoundariesSeconds,
        sourceEventsSeconds: Array.isArray(extras.corrections?.sourceEventsSeconds) ? extras.corrections.sourceEventsSeconds : [],
      });
      bufferRef.current = null;
      setHasAudio(false);
      setStatus("ready");
      setStatusMessage("Portable analysis loaded. Audio is intentionally absent; load the matching local recording to hear it.");
      setSelectedSection(0);
      setSelection({ start: 0, end: parsed.sectionBoundariesSeconds[1] ?? parsed.source.durationSeconds });
    } catch (error) {
      setStatus("error");
      setStatusMessage(error instanceof Error ? error.message : "The analysis profile could not be read.");
    }
  };

  const boundaries = corrections.sectionBoundariesSeconds;
  const sectionRanges = useMemo(() => boundaries.slice(0, -1).map((start, index) => ({ start, end: boundaries[index + 1] })), [boundaries]);
  const currentRange = selection.end > selection.start ? selection : sectionRanges[clamp(selectedSection, 0, Math.max(0, sectionRanges.length - 1))] ?? { start: 0, end: analysis?.source.durationSeconds ?? 0 };
  const fineFrames = analysis?.resolutions[0].frames ?? [];
  const mediumFrames = analysis?.resolutions[1].frames ?? [];
  const coarseFrames = analysis?.resolutions[2].frames ?? [];
  const rangeDuration = currentRange.end - currentRange.start;
  const selectedResolution = rangeDuration <= 2 ? analysis?.resolutions[0] : rangeDuration <= 15 ? analysis?.resolutions[1] : analysis?.resolutions[2];
  const selectedFrames = (selectedResolution?.frames ?? []).filter((frame) => frame.timeSeconds >= currentRange.start && frame.timeSeconds < currentRange.end);
  const overviewFrames = downsample(coarseFrames);
  const selectedHz = selectedFrames.map((frame) => frame.zeroCrossingHz).filter((value): value is number => value !== null && value >= 35 && value <= 4000);
  const averageHz = selectedHz.length ? selectedHz.reduce((sum, value) => sum + value, 0) / selectedHz.length : null;
  const averageBands = analysis?.auditoryBandCentersHz.map((_, index) => frameMean(selectedFrames, (frame) => frame.auditoryBandEnergy[index] ?? 0)) ?? [];
  const rangeOnsets = analysis?.structural.onsetPhases.filter((onset) => onset.timeSeconds >= currentRange.start && onset.timeSeconds < currentRange.end) ?? [];
  const rangeRecurrences = analysis?.structural.recurrencePairs.filter((pair) => (pair.firstSeconds >= currentRange.start && pair.firstSeconds < currentRange.end) || (pair.secondSeconds >= currentRange.start && pair.secondSeconds < currentRange.end)) ?? [];

  const addBoundary = () => {
    if (!analysis) return;
    const value = Math.round(clamp(boundaryDraft, 0.5, analysis.source.durationSeconds - 0.5) * 100) / 100;
    setCorrections((current) => ({ ...current, sectionBoundariesSeconds: [...new Set([...current.sectionBoundariesSeconds, value])].sort((a, b) => a - b) }));
  };

  const removeBoundary = (value: number) => {
    if (!analysis || value === 0 || value === analysis.source.durationSeconds) return;
    setCorrections((current) => ({ ...current, sectionBoundariesSeconds: current.sectionBoundariesSeconds.filter((item) => item !== value) }));
    setSelectedSection(0);
  };

  const chooseSection = (range: TimeRange, index: number) => {
    setSelectedSection(index);
    setSelection(range);
  };

  const setRangeEdge = (edge: keyof TimeRange, value: number) => {
    if (!analysis) return;
    setSelectedSection(-1);
    setSelection((current) => edge === "start"
      ? { start: Math.min(value, current.end - 0.05), end: current.end }
      : { start: current.start, end: Math.max(value, current.start + 0.05) });
  };

  const addSourceEvent = () => {
    if (!analysis) return;
    const value = Math.round(clamp(sourceEventDraft, 0, analysis.source.durationSeconds) * 100) / 100;
    setCorrections((current) => ({ ...current, sourceEventsSeconds: [...new Set([...current.sourceEventsSeconds, value])].sort((a, b) => a - b) }));
  };

  return (
    <section className="advanced-lab recording-lab" aria-labelledby="recording-title">
      <div className="lab-intro recording-intro">
        <div>
          <p className="section-kicker">Recording · private analysis workspace</p>
          <h2 id="recording-title">Bring your own sound. Keep the audio here.</h2>
        </div>
        <p>Decode and analyze a recording entirely in this browser. Exported profiles contain measurements and hypotheses—not copyrighted audio.</p>
      </div>

      <div className="recording-import">
        <label className="file-action primary-file">
          <span>Choose local audio</span>
          <small>WAV, MP3, M4A, OGG, FLAC where supported · 250 MB maximum</small>
          <input type="file" accept="audio/*,.wav,.mp3,.m4a,.ogg,.flac" onChange={(event) => void analyzeFile(event)} />
        </label>
        <label className="file-action">
          <span>Open analysis JSON</span>
          <small>Portable evidence profile · audio never included</small>
          <input type="file" accept="application/json,.json" onChange={(event) => void importProfile(event)} />
        </label>
        <button type="button" className="demo-analysis" onClick={() => void analyzeDemo()}>
          <span>Try generated demo</span>
          <small>Eight-second recurrence, rupture, and return fixture</small>
        </button>
        <div className={`analysis-status status-${status}`} role="status" aria-live="polite">
          <i aria-hidden="true" />
          <div><strong>{status}</strong><span>{statusMessage}</span></div>
        </div>
      </div>

      {analysis ? (
        <>
          <div className="recording-summary">
            <div><span>Source</span><strong>{analysis.source.filename}</strong></div>
            <div><span>Duration</span><strong>{formatTime(analysis.source.durationSeconds)}</strong></div>
            <div><span>Physical realization</span><strong>{analysis.source.sampleRateHz.toLocaleString()} Hz · {analysis.source.channelCount} ch</strong></div>
            <div><span>Analysis</span><strong>{AUDIO_ANALYSIS_VERSION}</strong></div>
            <button type="button" className={isPlaying ? "listen-button is-playing" : "listen-button"} disabled={!hasAudio} onClick={isPlaying ? stop : () => void play()} aria-pressed={isPlaying}>
              {hasAudio ? (isPlaying ? "■ Stop local audio" : "▶ Hear local audio") : "Audio not loaded"}
            </button>
          </div>

          <div className="recording-journey">
            <div className="recording-heading"><div><span>Recording Journey</span><h3>Physical and perceptual evidence over time</h3></div><p>{fineFrames.length.toLocaleString()} fine frames · {mediumFrames.length.toLocaleString()} medium · {coarseFrames.length.toLocaleString()} whole-form</p></div>
            <div className="recording-overview" role="img" aria-label={`Overview of loudness, brightness, onset strength, harmonicity, roughness, and periodicity confidence for ${analysis.source.filename}`}>
              {[
                ["Loudness", (frame: AnalysisFrame) => clamp((frame.loudnessDb + 72) / 72, 0, 1), "var(--recording-gold)"],
                ["Brightness proxy", (frame: AnalysisFrame) => frame.brightness, "var(--recording-cyan)"],
                ["Onset strength", (frame: AnalysisFrame) => frame.onsetStrength, "var(--recording-coral)"],
                ["Roughness proxy", (frame: AnalysisFrame) => frame.roughness, "#ea8c74"],
                ["Harmonicity proxy", (frame: AnalysisFrame) => frame.harmonicity, "#7ecfb7"],
                ["Periodicity confidence", (frame: AnalysisFrame) => frame.periodicityConfidence, "#b8a5e8"],
              ].map(([label, read, color]) => (
                <div className="recording-lane" key={label as string}>
                  <span>{label as string}</span>
                  <div>{overviewFrames.map((frame, index) => <i key={index} style={{ height: `${(read as (frame: AnalysisFrame) => number)(frame) * 100}%`, background: color as string }} />)}</div>
                </div>
              ))}
              <div className="boundary-lines" aria-hidden="true">{boundaries.slice(1, -1).map((time) => <i key={time} style={{ left: `${(time / analysis.source.durationSeconds) * 100}%` }} />)}</div>
            </div>
            <div className="recording-sections" aria-label="Candidate recording sections">
              {sectionRanges.map((range, index) => <button key={`${range.start}-${range.end}`} type="button" aria-pressed={selectedSection === index} onClick={() => chooseSection(range, index)}><strong>{String(index + 1).padStart(2, "0")}</strong><span>{formatTime(range.start)}–{formatTime(range.end)}</span></button>)}
            </div>
          </div>

          <div className="recording-microscope">
            <div className="recording-heading"><div><span>Acoustic Microscope · {selectedSection >= 0 ? `section ${selectedSection + 1}` : "custom range"}</span><h3>{formatTime(currentRange.start)}–{formatTime(currentRange.end)}</h3></div><p>{selectedFrames.length} {selectedResolution?.windowSeconds.toFixed(3)}s evidence frames</p></div>
            <div className="range-editor" aria-label="Acoustic microscope time range">
              <label><span>Range start</span><input type="range" min="0" max={Math.max(0.05, currentRange.end - 0.05)} step="0.05" value={currentRange.start} onInput={(event) => setRangeEdge("start", Number(event.currentTarget.value))} /><output>{currentRange.start.toFixed(2)}s</output></label>
              <label><span>Range end</span><input type="range" min={Math.min(analysis.source.durationSeconds, currentRange.start + 0.05)} max={analysis.source.durationSeconds} step="0.05" value={currentRange.end} onInput={(event) => setRangeEdge("end", Number(event.currentTarget.value))} /><output>{currentRange.end.toFixed(2)}s</output></label>
            </div>
            <div className="recording-microscope-grid">
              <article><span>Mean loudness</span><strong>{frameMean(selectedFrames, (frame) => frame.loudnessDb).toFixed(1)} dBFS</strong><p>Windowed root-mean-square level. This is not calibrated perceived loudness.</p></article>
              <article><span>Continuous frequency evidence</span><strong>{averageHz ? `${averageHz.toFixed(1)} Hz` : "unresolved"}</strong><p>Zero-crossing evidence remains continuous. Dense mixtures can make this estimate unreliable.</p></article>
              <article><span>Pulse hypothesis</span><strong>{corrections.pulseBpm ? `${corrections.pulseBpm.toFixed(1)} /min` : "uncertain"}</strong><p>{analysis.pulseCandidates.length ? `${Math.round(analysis.pulseCandidates[0].confidence * 100)}% relative autocorrelation confidence.` : "No stable onset recurrence was found."}</p></article>
              <article><span>Harmonicity · salience</span><strong>{Math.round(frameMean(selectedFrames, (frame) => frame.harmonicity) * 100)} · {Math.round(frameMean(selectedFrames, (frame) => frame.pitchSalience) * 100)}</strong><p>Transparent periodicity-derived proxies, separate from confidence and preference.</p></article>
              <article><span>Roughness proxy</span><strong>{Math.round(frameMean(selectedFrames, (frame) => frame.roughness) * 100)}</strong><p>Brightness and local spectral change provide a declared first-order sensory-conflict proxy.</p></article>
              <article><span>Timing structure</span><strong>{rangeOnsets.length} · {rangeRecurrences.length}</strong><p>Onset-phase events · coarse recurrence links. Whole-recording syncopation: {Math.round(analysis.structural.syncopation * 100)}.</p></article>
            </div>
            <div className="auditory-bands"><span>Ear-relative band evidence</span><div>{analysis.auditoryBandCentersHz.map((center, index) => <i key={center} style={{ height: `${(averageBands[index] ?? 0) * 100}%` }}><b>{center >= 1000 ? `${center / 1000}k` : center}</b></i>)}</div><p>Transparent lag-correlation proxies at declared center frequencies—not a calibrated cochlear filterbank.</p></div>
          </div>

          <div className="hypothesis-editor">
            <div><span>Correct the pulse hypothesis</span><label><input type="range" min="40" max="220" step="0.1" aria-label="Corrected pulse rate" value={corrections.pulseBpm ?? 120} onChange={(event) => setCorrections((current) => ({ ...current, pulseBpm: Number(event.target.value) }))} /><output>{(corrections.pulseBpm ?? 120).toFixed(1)} /min</output></label></div>
            <div><span>Correct the frequency center</span><label><input type="range" min="35" max="2000" step="1" aria-label="Corrected frequency center" value={corrections.centerHz ?? 220} onChange={(event) => setCorrections((current) => ({ ...current, centerHz: Number(event.target.value) }))} /><output>{(corrections.centerHz ?? 220).toFixed(0)} Hz</output></label></div>
            <div><span>Add or remove section evidence</span><label><input type="range" min="0.5" max={Math.max(1, analysis.source.durationSeconds - 0.5)} step="0.1" aria-label="New section boundary time" value={boundaryDraft} onChange={(event) => setBoundaryDraft(Number(event.target.value))} /><output>{formatTime(boundaryDraft)}</output></label><button type="button" onClick={addBoundary}>Add boundary</button><div className="boundary-chips">{boundaries.map((value) => <button key={value} type="button" disabled={value === 0 || value === analysis.source.durationSeconds} onClick={() => removeBoundary(value)}>{formatTime(value)}{value !== 0 && value !== analysis.source.durationSeconds ? " ×" : ""}</button>)}</div></div>
            <div><span>Mark listener-heard source events</span><label><input type="range" min="0" max={analysis.source.durationSeconds} step="0.05" aria-label="Source event time" value={sourceEventDraft} onChange={(event) => setSourceEventDraft(Number(event.target.value))} /><output>{sourceEventDraft.toFixed(2)}s</output></label><button type="button" onClick={addSourceEvent}>Add event</button><div className="boundary-chips">{corrections.sourceEventsSeconds.map((value) => <button key={value} type="button" onClick={() => setCorrections((current) => ({ ...current, sourceEventsSeconds: current.sourceEventsSeconds.filter((item) => item !== value) }))}>{value.toFixed(2)}s ×</button>)}</div></div>
          </div>

          <div className="recording-export"><div><span>Portable evidence</span><strong>Measurements + corrections · no audio</strong><p>Measured frames, model candidates, listener corrections, analysis version, and limitations stay distinguishable.</p></div><button type="button" onClick={() => downloadJson(`${analysis.source.filename.replace(/\.[^.]+$/, "") || "recording"}.mwno-analysis.json`, { ...analysis, corrections })}>Export analysis JSON</button></div>
          <div className="recording-limitations"><strong>Interpretation boundary</strong>{analysis.limitations.map((limitation) => <p key={limitation}>{limitation}</p>)}</div>
        </>
      ) : (
        <div className="recording-empty"><i aria-hidden="true" /><strong>Audio remains on your device</strong><p>The first view will appear after decoding and background analysis. No account, upload endpoint, or remote storage is involved.</p></div>
      )}
    </section>
  );
}
