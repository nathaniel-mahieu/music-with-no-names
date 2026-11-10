"use client";

import { useCallback, useEffect, useRef } from "react";
import { configureSafetyCompressor, SYNTH_MASTER_GAIN } from "@/lib/audio-level";
import { frequencyFromMidi } from "@/lib/piano-model";
import { pianoSoundPartialProfile, type PianoSoundModelId } from "@/lib/piano-sound-model";

type TonePlayback = { context: AudioContext; master: GainNode | null };
type AudioContextWindow = Window & { webkitAudioContext?: typeof AudioContext };

function closeTone({ context, master }: TonePlayback) {
  if (context.state === "closed") return;
  if (master && context.state === "running") {
    const now = context.currentTime;
    master.gain.setTargetAtTime(0, now, 0.008);
    window.setTimeout(() => {
      if (context.state !== "closed") void context.close().catch(() => {});
    }, 40);
  } else {
    void context.close().catch(() => {});
  }
}

export function usePianoTrainerTone() {
  const activeRef = useRef<TonePlayback | null>(null);
  const stopTone = useCallback(() => {
    const playback = activeRef.current;
    activeRef.current = null;
    if (playback) closeTone(playback);
  }, []);

  useEffect(() => stopTone, [stopTone]);

  const playTone = useCallback(async (note: number, sound: PianoSoundModelId) => {
    stopTone();
    const AudioContextConstructor = window.AudioContext ?? (window as AudioContextWindow).webkitAudioContext;
    if (!AudioContextConstructor) return false;
    let playback: TonePlayback | null = null;
    try {
      const context = new AudioContextConstructor({ latencyHint: "interactive" });
      playback = { context, master: null };
      activeRef.current = playback;
      if (context.state !== "running") await context.resume();
      if (activeRef.current !== playback) return false;
      if (context.state !== "running") {
        stopTone();
        return false;
      }

      const now = context.currentTime;
      const start = now + 0.012;
      const end = start + 0.62;
      const compressor = context.createDynamicsCompressor();
      configureSafetyCompressor(compressor, now);
      const master = context.createGain();
      playback.master = master;
      master.gain.setValueAtTime(SYNTH_MASTER_GAIN, now);
      master.connect(compressor).connect(context.destination);

      const envelope = context.createGain();
      envelope.gain.setValueAtTime(0.0001, start);
      envelope.gain.exponentialRampToValueAtTime(0.86, start + 0.018);
      envelope.gain.setValueAtTime(0.86, end - 0.12);
      envelope.gain.exponentialRampToValueAtTime(0.0001, end);
      envelope.connect(master);

      const fundamental = frequencyFromMidi(note);
      const partials = pianoSoundPartialProfile(sound).filter((partial) => partial.frequencyMultiple * fundamental < context.sampleRate / 2);
      const norm = Math.hypot(...partials.map((partial) => partial.amplitude));
      if (!norm) {
        stopTone();
        return false;
      }
      partials.forEach((partial, index) => {
        const oscillator = context.createOscillator();
        oscillator.frequency.value = fundamental * partial.frequencyMultiple;
        const level = context.createGain();
        level.gain.value = partial.amplitude / norm;
        oscillator.connect(level).connect(envelope);
        if (index === 0) oscillator.onended = () => {
          if (activeRef.current === playback) stopTone();
        };
        oscillator.start(start);
        oscillator.stop(end + 0.012);
      });
      return true;
    } catch {
      if (playback && activeRef.current === playback) stopTone();
      return false;
    }
  }, [stopTone]);

  return { playTone, stopTone };
}
