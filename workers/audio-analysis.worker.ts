/// <reference lib="webworker" />

import { analyzeMonoAudio } from "../lib/audio-analysis";

type AnalyzeMessage = {
  samples: Float32Array;
  sampleRate: number;
  filename: string;
  channelCount: number;
};

self.onmessage = (event: MessageEvent<AnalyzeMessage>) => {
  try {
    const analysis = analyzeMonoAudio(event.data.samples, event.data.sampleRate, {
      filename: event.data.filename,
      channelCount: event.data.channelCount,
    });
    self.postMessage({ ok: true, analysis });
  } catch (error) {
    self.postMessage({
      ok: false,
      message: error instanceof Error ? error.message : "Analysis failed.",
    });
  }
};

export {};
