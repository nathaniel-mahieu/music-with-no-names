export const AUDIO_ANALYSIS_SCHEMA = "music-with-no-names.analysis.v1" as const;
export const AUDIO_ANALYSIS_VERSION = "mwno-audio-0.1.0" as const;

export type AnalysisFrame = {
  timeSeconds: number;
  durationSeconds: number;
  loudnessDb: number;
  brightness: number;
  spectralFlux: number;
  onsetStrength: number;
  zeroCrossingHz: number | null;
  periodicityConfidence: number;
  auditoryBandEnergy: number[];
};

export type AnalysisResolution = {
  windowSeconds: number;
  hopSeconds: number;
  frames: AnalysisFrame[];
};

export type PulseCandidate = {
  pulsesPerMinute: number;
  confidence: number;
};

export type RecordingAnalysis = {
  schema: typeof AUDIO_ANALYSIS_SCHEMA;
  analysisVersion: typeof AUDIO_ANALYSIS_VERSION;
  createdAt: string;
  source: {
    filename: string;
    durationSeconds: number;
    sampleRateHz: number;
    channelCount: number;
    audioIncluded: false;
  };
  limitations: string[];
  auditoryBandCentersHz: number[];
  resolutions: AnalysisResolution[];
  pulseCandidates: PulseCandidate[];
  sectionBoundariesSeconds: number[];
};

export type AnalyzeAudioOptions = {
  filename?: string;
  channelCount?: number;
  createdAt?: string;
  maxFineFrames?: number;
};

const BAND_CENTERS_HZ = [125, 250, 500, 1000, 2000, 4000, 8000];

function clamp01(value: number) {
  return Math.max(0, Math.min(1, value));
}

function rmsDb(samples: Float32Array, start: number, end: number) {
  let energy = 0;
  for (let index = start; index < end; index += 1) energy += samples[index] ** 2;
  const rms = Math.sqrt(energy / Math.max(1, end - start));
  return Math.max(-96, 20 * Math.log10(Math.max(1e-8, rms)));
}

function timeDomainFeatures(samples: Float32Array, start: number, end: number, sampleRate: number) {
  let crossings = 0;
  let absoluteDifference = 0;
  let absoluteLevel = 0;
  let previous = samples[start] ?? 0;
  for (let index = start + 1; index < end; index += 1) {
    const value = samples[index];
    if ((previous < 0 && value >= 0) || (previous >= 0 && value < 0)) crossings += 1;
    absoluteDifference += Math.abs(value - previous);
    absoluteLevel += Math.abs(value);
    previous = value;
  }
  const duration = Math.max(1 / sampleRate, (end - start) / sampleRate);
  const zeroCrossingHz = crossings >= 2 ? crossings / (2 * duration) : null;
  const brightness = clamp01(absoluteDifference / Math.max(1e-8, absoluteLevel * 1.8));
  const periodicityConfidence = zeroCrossingHz && zeroCrossingHz >= 35 && zeroCrossingHz <= 2400
    ? clamp01(1 - brightness * 0.72)
    : 0;
  return { zeroCrossingHz, brightness, periodicityConfidence };
}

function proxyAuditoryBands(samples: Float32Array, start: number, end: number, sampleRate: number) {
  const length = Math.max(1, end - start);
  return BAND_CENTERS_HZ.map((center) => {
    const lag = Math.max(1, Math.round(sampleRate / center));
    let correlation = 0;
    let energy = 0;
    for (let index = start + lag; index < end; index += 1) {
      correlation += samples[index] * samples[index - lag];
      energy += samples[index] ** 2;
    }
    return clamp01(Math.abs(correlation) / Math.max(1e-8, energy) * Math.min(1, length / (lag * 3)));
  });
}

function analyzeResolution(
  samples: Float32Array,
  sampleRate: number,
  windowSeconds: number,
  hopSeconds: number,
  maxFrames: number,
): AnalysisResolution {
  const windowSize = Math.max(64, Math.round(windowSeconds * sampleRate));
  let hopSize = Math.max(32, Math.round(hopSeconds * sampleRate));
  const naturalFrames = Math.max(1, Math.ceil(Math.max(1, samples.length - windowSize) / hopSize) + 1);
  if (naturalFrames > maxFrames) hopSize = Math.ceil(Math.max(1, samples.length - windowSize) / (maxFrames - 1));
  const frames: AnalysisFrame[] = [];
  let previousDb = -96;
  let previousBrightness = 0;

  for (let start = 0; start < samples.length; start += hopSize) {
    const end = Math.min(samples.length, start + windowSize);
    if (end <= start) break;
    const loudnessDb = rmsDb(samples, start, end);
    const physical = timeDomainFeatures(samples, start, end, sampleRate);
    const spectralFlux = clamp01(Math.abs(physical.brightness - previousBrightness) * 1.6);
    const onsetStrength = clamp01(Math.max(0, loudnessDb - previousDb) / 18 + spectralFlux * 0.35);
    frames.push({
      timeSeconds: start / sampleRate,
      durationSeconds: (end - start) / sampleRate,
      loudnessDb,
      brightness: physical.brightness,
      spectralFlux,
      onsetStrength,
      zeroCrossingHz: physical.zeroCrossingHz,
      periodicityConfidence: physical.periodicityConfidence,
      auditoryBandEnergy: proxyAuditoryBands(samples, start, end, sampleRate),
    });
    previousDb = loudnessDb;
    previousBrightness = physical.brightness;
    if (end === samples.length) break;
  }

  return { windowSeconds, hopSeconds: hopSize / sampleRate, frames };
}

function pulseCandidates(frames: AnalysisFrame[], hopSeconds: number): PulseCandidate[] {
  if (frames.length < 8) return [];
  const minimumBpm = 55;
  const maximumBpm = 190;
  const minimumLag = Math.max(1, Math.floor(60 / maximumBpm / hopSeconds));
  const maximumLag = Math.min(frames.length - 2, Math.ceil(60 / minimumBpm / hopSeconds));
  const scored: PulseCandidate[] = [];
  let best = 1e-8;
  for (let lag = minimumLag; lag <= maximumLag; lag += 1) {
    let score = 0;
    for (let index = lag; index < frames.length; index += 1) {
      score += frames[index].onsetStrength * frames[index - lag].onsetStrength;
    }
    best = Math.max(best, score);
    scored.push({ pulsesPerMinute: 60 / (lag * hopSeconds), confidence: score });
  }
  return scored
    .sort((a, b) => b.confidence - a.confidence)
    .slice(0, 3)
    .map((item) => ({
      pulsesPerMinute: Math.round(item.pulsesPerMinute * 10) / 10,
      confidence: clamp01(item.confidence / best),
    }));
}

function sectionBoundaries(frames: AnalysisFrame[], durationSeconds: number) {
  if (frames.length < 6) return [0, durationSeconds];
  const candidates = frames
    .slice(2, -2)
    .map((frame) => ({
      time: frame.timeSeconds,
      novelty: frame.spectralFlux * 0.55 + frame.onsetStrength * 0.3 + Math.max(0, frame.loudnessDb + 48) / 48 * 0.15,
    }))
    .filter((item) => item.time > 3 && item.time < durationSeconds - 3)
    .sort((a, b) => b.novelty - a.novelty);
  const boundaries = [0];
  for (const candidate of candidates) {
    if (boundaries.every((time) => Math.abs(time - candidate.time) >= 4)) boundaries.push(candidate.time);
    if (boundaries.length >= 7) break;
  }
  boundaries.push(durationSeconds);
  return boundaries.sort((a, b) => a - b).map((value) => Math.round(value * 100) / 100);
}

export function analyzeMonoAudio(
  samples: Float32Array,
  sampleRate: number,
  options: AnalyzeAudioOptions = {},
): RecordingAnalysis {
  if (!(samples instanceof Float32Array) || samples.length === 0) throw new RangeError("Audio samples are required.");
  if (!Number.isFinite(sampleRate) || sampleRate < 8000 || sampleRate > 384000) throw new RangeError("Sample rate is outside the supported range.");
  const durationSeconds = samples.length / sampleRate;
  const maxFineFrames = Math.max(128, options.maxFineFrames ?? 3600);
  const resolutions = [
    analyzeResolution(samples, sampleRate, 0.05, 0.025, maxFineFrames),
    analyzeResolution(samples, sampleRate, 0.25, 0.125, 1800),
    analyzeResolution(samples, sampleRate, 1, 0.5, 900),
  ];
  const pulse = pulseCandidates(resolutions[1].frames, resolutions[1].hopSeconds);
  return {
    schema: AUDIO_ANALYSIS_SCHEMA,
    analysisVersion: AUDIO_ANALYSIS_VERSION,
    createdAt: options.createdAt ?? new Date().toISOString(),
    source: {
      filename: options.filename ?? "local recording",
      durationSeconds,
      sampleRateHz: sampleRate,
      channelCount: options.channelCount ?? 1,
      audioIncluded: false,
    },
    limitations: [
      "Brightness and band energy are transparent time-domain proxies, not a calibrated cochlear model.",
      "Zero-crossing frequency is unreliable for dense polyphonic or noisy material.",
      "Pulse and section candidates are hypotheses and should be corrected by the listener.",
    ],
    auditoryBandCentersHz: BAND_CENTERS_HZ,
    resolutions,
    pulseCandidates: pulse,
    sectionBoundariesSeconds: sectionBoundaries(resolutions[2].frames, durationSeconds),
  };
}

export function isRecordingAnalysis(value: unknown): value is RecordingAnalysis {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<RecordingAnalysis>;
  return candidate.schema === AUDIO_ANALYSIS_SCHEMA && candidate.analysisVersion === AUDIO_ANALYSIS_VERSION && Array.isArray(candidate.resolutions) && candidate.source?.audioIncluded === false;
}
