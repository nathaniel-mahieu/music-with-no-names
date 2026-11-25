"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { configureSafetyCompressor, equalPowerMixGains, SYNTH_COHERENT_PEAK, SYNTH_MASTER_GAIN } from "@/lib/audio-level";
import type { DemoFrame, DemoSequence } from "@/lib/piano-color-texture-model";

type AudioContextWindow = Window & { webkitAudioContext?: typeof AudioContext };
type TransportState = {
  isPlaying: boolean;
  isStarting: boolean;
  beat: number;
  frameIndex: number;
  error: string;
};
type ScheduledVoice = {
  oscillators: OscillatorNode[];
  levels: GainNode[];
  envelope: GainNode;
  cycle: number;
  cancelled: boolean;
  midi: number;
  part: DemoFrame["notes"][number]["voice"];
  startsAt: number;
  endsAt: number;
};
type VoiceOwner = {
  context: AudioContext;
  master: GainNode;
  voices: Set<ScheduledVoice>;
  onEmpty?: () => void;
};
type AuditionBus = VoiceOwner & {
  compressor: DynamicsCompressorNode;
  pending: Array<{ midi: number; requestedAtMs: number }>;
  starting: boolean;
};
type PlaybackSession = {
  context: AudioContext;
  master: GainNode;
  compressor: DynamicsCompressorNode;
  sequence: DemoSequence;
  secondsPerBeat: number;
  initialBeat: number;
  originTime: number;
  started: boolean;
  nextFrame: number;
  cycle: number;
  endCycle: number | null;
  voices: Set<ScheduledVoice>;
  schedulerId: number | null;
  animationId: number | null;
  lastPublishedAt: number;
  lastPublishedFrame: number;
  voiceMixGain: number;
};

const LOOKAHEAD_SECONDS = .18;
const START_LEAD_SECONDS = .025;
const PARTIALS = [1, .23, .08, .025];
const MAX_AUDITION_VOICES = 8;
const AUDITION_SECONDS = 1.5;
const AUDITION_LEAD_SECONDS = .014;
const VOICE_PEAK = .64;
const VOICE_SUSTAIN = .39;

function clamp(value: number, minimum: number, maximum: number) {
  return Math.max(minimum, Math.min(maximum, value));
}

function frameAtBeat(sequence: DemoSequence, beat: number) {
  if (!sequence.frames.length) return 0;
  for (let index = sequence.frames.length - 1; index >= 0; index -= 1) {
    if (beat >= sequence.frames[index].beat - 1e-7) return index;
  }
  return 0;
}

function unwrappedBeat(session: PlaybackSession) {
  if (!session.started) return session.initialBeat;
  return session.initialBeat + Math.max(0, session.context.currentTime - session.originTime) / session.secondsPerBeat;
}

function sessionBeat(session: PlaybackSession) {
  const beat = unwrappedBeat(session);
  const total = session.sequence.totalBeats;
  if (session.endCycle !== null && beat >= (session.endCycle + 1) * total) return total;
  return ((beat % total) + total) % total;
}

function disconnectVoice(session: VoiceOwner, voice: ScheduledVoice) {
  voice.oscillators.forEach((oscillator) => {
    oscillator.onended = null;
    oscillator.disconnect();
  });
  voice.levels.forEach((level) => level.disconnect());
  voice.envelope.disconnect();
  session.voices.delete(voice);
  if (session.voices.size === 0) session.onEmpty?.();
}

function closeAuditionBus(bus: AuditionBus) {
  bus.onEmpty = undefined;
  bus.pending.length = 0;
  bus.context.onstatechange = null;
  const fading = bus.context.state === "running" && bus.voices.size > 0;
  if (bus.context.state !== "closed") {
    const now = bus.context.currentTime;
    bus.master.gain.cancelScheduledValues(now);
    bus.master.gain.setTargetAtTime(0, now, .006);
    bus.voices.forEach((voice) => cancelVoice(voice, now + (fading ? .025 : 0)));
  }
  const release = () => {
    bus.voices.forEach((voice) => disconnectVoice(bus, voice));
    bus.master.disconnect();
    bus.compressor.disconnect();
    if (bus.context.state !== "closed") void bus.context.close().catch(() => {});
  };
  if (fading) window.setTimeout(release, 35);
  else release();
}

function voiceWeight(voice: DemoFrame["notes"][number]["voice"]) {
  return voice === "melody" ? 1 : voice === "bass" ? .72 : .62;
}

function passageVoiceMixGain(sequence: DemoSequence) {
  return equalPowerMixGains(Array.from({ length: Math.max(1, ...sequence.frames.map((frame) => frame.notes.length)) }, () => 1))[0];
}

function auditionMasterGain(sequence: DemoSequence) {
  // Reserve the study's worst coherent peak before allowing preview overlap.
  // Both buses retain the same waveform and envelope; only their budgets differ.
  const waveformPeak = VOICE_PEAK * PARTIALS.reduce((sum, amplitude) => sum + amplitude, 0) / Math.hypot(...PARTIALS);
  const studyWeights = Math.max(0, ...sequence.frames.map((frame) => frame.notes.reduce((sum, note) => sum + voiceWeight(note.voice), 0)));
  const studyPeak = SYNTH_MASTER_GAIN * passageVoiceMixGain(sequence) * studyWeights * waveformPeak;
  const auditionMixGain = equalPowerMixGains(Array.from({ length: MAX_AUDITION_VOICES }, () => 1))[0];
  const headroom = Math.max(0, SYNTH_COHERENT_PEAK * .9 - studyPeak);
  return Math.min(SYNTH_MASTER_GAIN, headroom / (MAX_AUDITION_VOICES * auditionMixGain * waveformPeak));
}

function synthesizeVoice(owner: VoiceOwner, midi: number, part: ScheduledVoice["part"], cycle: number, when: number, duration: number, mix: number) {
  const fundamental = 440 * 2 ** ((midi - 69) / 12);
  const partials = PARTIALS.map((amplitude, index) => ({ amplitude, multiple: index + 1 }))
    .filter(({ multiple }) => fundamental * multiple < owner.context.sampleRate / 2);
  const normalization = Math.hypot(...partials.map(({ amplitude }) => amplitude));
  if (!normalization) return;
  const envelope = owner.context.createGain();
  const attack = Math.min(.016, duration * .12);
  const decay = Math.min(.18, duration * .35);
  const release = Math.min(.16, duration * .25);
  const peak = VOICE_PEAK * mix;
  const sustain = VOICE_SUSTAIN * mix;
  const end = when + duration;
  envelope.gain.setValueAtTime(.0001, when);
  envelope.gain.exponentialRampToValueAtTime(Math.max(.0001, peak), when + attack);
  envelope.gain.exponentialRampToValueAtTime(Math.max(.0001, sustain), when + attack + decay);
  envelope.gain.setValueAtTime(Math.max(.0001, sustain), Math.max(when + attack + decay, end - release));
  envelope.gain.exponentialRampToValueAtTime(.0001, end);
  envelope.connect(owner.master);
  const voice: ScheduledVoice = { oscillators: [], levels: [], envelope, cycle, cancelled: false, midi, part, startsAt: when, endsAt: end };
  owner.voices.add(voice);
  let remaining = partials.length;
  partials.forEach(({ amplitude, multiple }) => {
    const oscillator = owner.context.createOscillator();
    oscillator.type = "sine";
    oscillator.frequency.value = fundamental * multiple;
    const level = owner.context.createGain();
    level.gain.value = amplitude / normalization;
    oscillator.connect(level).connect(envelope);
    voice.oscillators.push(oscillator);
    voice.levels.push(level);
    oscillator.onended = () => {
      remaining -= 1;
      if (remaining === 0) disconnectVoice(owner, voice);
    };
    oscillator.start(when);
    oscillator.stop(end + .008);
  });
}

function cancelVoice(voice: ScheduledVoice, when: number) {
  if (voice.cancelled) return;
  voice.cancelled = true;
  voice.oscillators.forEach((oscillator) => {
    try { oscillator.stop(when); } catch { /* Already ended. */ }
  });
}

function closeSession(session: PlaybackSession) {
  if (session.schedulerId !== null) window.clearInterval(session.schedulerId);
  if (session.animationId !== null) window.cancelAnimationFrame(session.animationId);
  session.schedulerId = null;
  session.animationId = null;
  session.context.onstatechange = null;
  if (session.context.state === "closed") {
    session.voices.forEach((voice) => disconnectVoice(session, voice));
    return;
  }
  const now = session.context.currentTime;
  const fading = session.started && session.context.state === "running";
  session.master.gain.cancelScheduledValues(now);
  session.master.gain.setTargetAtTime(0, now, .006);
  session.voices.forEach((voice) => cancelVoice(voice, now + (fading ? .025 : 0)));
  const release = () => {
    session.voices.forEach((voice) => disconnectVoice(session, voice));
    session.master.disconnect();
    session.compressor.disconnect();
    if (session.context.state !== "closed") void session.context.close().catch(() => {});
  };
  if (fading) window.setTimeout(release, 35);
  else release();
}

function continuationEndBeat(sequence: DemoSequence, frameIndex: number, note: DemoFrame["notes"][number]) {
  let end = sequence.frames[frameIndex].beat + sequence.frames[frameIndex].durationBeats;
  for (let nextIndex = frameIndex + 1; nextIndex < sequence.frames.length; nextIndex += 1) {
    const next = sequence.frames[nextIndex];
    if (Math.abs(next.beat - end) > 1e-7) break;
    const continued = next.notes.some((candidate) => candidate.sustainFromPrevious === true && candidate.midi === note.midi && candidate.voice === note.voice);
    if (!continued) break;
    end = next.beat + next.durationBeats;
  }
  return end;
}

function scheduleFrame(session: PlaybackSession, frameIndex: number, cycle: number, when: number, duration: number) {
  const frame = session.sequence.frames[frameIndex];
  if (duration < .012 || frame.notes.length === 0) return;
  const validNotes = frame.notes.filter(({ midi }) => Number.isInteger(midi) && midi >= 0 && midi <= 127);
  validNotes.forEach((note) => {
    const previous = session.sequence.frames[frameIndex - 1];
    const isContinuation = note.sustainFromPrevious === true && previous
      && Math.abs(previous.beat + previous.durationBeats - frame.beat) < 1e-7
      && previous.notes.some((candidate) => candidate.midi === note.midi && candidate.voice === note.voice);
    // A tie suppresses an onset only if its actual sounding predecessor exists.
    // Seeking/resuming in the middle of a chain still starts its retained voice.
    if (isContinuation && [...session.voices].some((voice) => !voice.cancelled
      && voice.cycle === cycle && voice.midi === note.midi && voice.part === note.voice
      && voice.startsAt <= when + .001 && voice.endsAt >= when + .001)) return;
    const chainEnd = continuationEndBeat(session.sequence, frameIndex, note);
    const noteDuration = duration + (chainEnd - frame.beat - frame.durationBeats) * session.secondsPerBeat;
    synthesizeVoice(session, note.midi, note.voice, cycle, when, noteDuration, voiceWeight(note.voice) * session.voiceMixGain);
  });
}

/** An explicit-play transport for authored passages; no live input is read. */
export function useColorTexturePlayback(sequence: DemoSequence, tempo: number, loop: boolean) {
  const configRef = useRef({ sequence, tempo, loop });
  configRef.current = { sequence, tempo, loop };
  const sessionRef = useRef<PlaybackSession | null>(null);
  const auditionRef = useRef<AuditionBus | null>(null);
  const auditionGenerationRef = useRef(0);
  const positionRef = useRef(0);
  const generationRef = useRef(0);
  const mountedRef = useRef(false);
  const [state, setState] = useState<TransportState>({ isPlaying: false, isStarting: false, beat: 0, frameIndex: 0, error: "" });
  const [auditionError, setAuditionError] = useState("");

  const closeAuditions = useCallback(() => {
    auditionGenerationRef.current += 1;
    const bus = auditionRef.current;
    auditionRef.current = null;
    if (bus) closeAuditionBus(bus);
  }, []);

  const auditionNote = useCallback((midi: number) => {
    if (!mountedRef.current || document.hidden || !Number.isInteger(midi) || midi < 0 || midi > 127) return;
    setAuditionError("");
    let bus = auditionRef.current;
    if (!bus) {
      const AudioContextConstructor = window.AudioContext ?? (window as AudioContextWindow).webkitAudioContext;
      if (!AudioContextConstructor) {
        setAuditionError("Preview sound is unavailable in this browser.");
        return;
      }
      let context: AudioContext | null = null;
      try {
        context = new AudioContextConstructor({ latencyHint: "interactive" });
        const compressor = context.createDynamicsCompressor();
        configureSafetyCompressor(compressor, context.currentTime);
        const master = context.createGain();
        master.gain.setValueAtTime(auditionMasterGain(configRef.current.sequence), context.currentTime);
        master.connect(compressor).connect(context.destination);
        bus = { context, master, compressor, voices: new Set(), pending: [], starting: false };
        auditionRef.current = bus;
      } catch {
        if (context && context.state !== "closed") void context.close().catch(() => {});
        setAuditionError("Preview sound could not start. Tap a note to try again.");
        return;
      }
    }
    const owner = bus;
    const requestedAtMs = window.performance?.now?.() ?? Date.now();
    owner.pending.push({ midi, requestedAtMs });
    if (owner.pending.length > MAX_AUDITION_VOICES) owner.pending.shift();
    const generation = auditionGenerationRef.current;
    const flush = () => {
      if (!mountedRef.current || auditionRef.current !== owner || auditionGenerationRef.current !== generation) return;
      if (document.hidden || owner.context.state !== "running") {
        closeAuditions();
        return;
      }
      owner.starting = false;
      owner.onEmpty = () => {
        if (auditionRef.current === owner && !owner.starting && owner.pending.length === 0) closeAuditions();
      };
      owner.context.onstatechange = () => {
        if (auditionRef.current === owner && owner.context.state !== "running") closeAuditions();
      };
      const pending = owner.pending.splice(0);
      const earliestRequest = pending[0]?.requestedAtMs ?? requestedAtMs;
      const voiceMixGain = equalPowerMixGains(Array.from({ length: MAX_AUDITION_VOICES }, () => 1))[0];
      pending.forEach((request) => {
        const now = owner.context.currentTime;
        const live = [...owner.voices].filter((voice) => !voice.cancelled);
        if (live.length >= MAX_AUDITION_VOICES) {
          const oldest = live.reduce((first, voice) => voice.startsAt < first.startsAt ? voice : first);
          oldest.envelope.gain.cancelScheduledValues(now);
          oldest.envelope.gain.setTargetAtTime(0, now, .0025);
          // The stolen note is silent before the replacement's short lead-in.
          cancelVoice(oldest, now + .010);
        }
        const when = now + AUDITION_LEAD_SECONDS + Math.max(0, request.requestedAtMs - earliestRequest) / 1000;
        synthesizeVoice(owner, request.midi, "melody", 0, when, AUDITION_SECONDS, voiceMixGain);
      });
    };
    if (owner.starting) return;
    if (owner.context.state === "running") {
      flush();
      return;
    }
    owner.starting = true;
    void owner.context.resume().then(flush).catch(() => {
      if (auditionRef.current !== owner || auditionGenerationRef.current !== generation) return;
      closeAuditions();
      if (mountedRef.current) setAuditionError("Preview sound could not start. Tap a note to try again.");
    });
  }, [closeAuditions]);

  const dispose = useCallback(() => {
    generationRef.current += 1;
    const session = sessionRef.current;
    sessionRef.current = null;
    if (session) closeSession(session);
  }, []);

  const stop = useCallback(() => {
    dispose();
    closeAuditions();
    positionRef.current = 0;
    if (mountedRef.current) setState((current) => ({ ...current, isPlaying: false, isStarting: false, beat: 0, frameIndex: 0 }));
  }, [closeAuditions, dispose]);

  const pause = useCallback(() => {
    const session = sessionRef.current;
    const position = session ? sessionBeat(session) : positionRef.current;
    const currentSequence = session?.sequence ?? configRef.current.sequence;
    positionRef.current = position;
    dispose();
    closeAuditions();
    if (mountedRef.current) setState((current) => ({ ...current, isPlaying: false, isStarting: false, beat: position, frameIndex: frameAtBeat(currentSequence, position) }));
  }, [closeAuditions, dispose]);

  const startAt = useCallback(async (requestedBeat: number) => {
    dispose();
    const generation = generationRef.current;
    const current = configRef.current;
    const passage = current.sequence;
    const startBeat = clamp(Number.isFinite(requestedBeat) ? requestedBeat : 0, 0, passage.totalBeats);
    positionRef.current = startBeat;
    if (passage.frames.length === 0 || !Number.isFinite(passage.totalBeats) || passage.totalBeats <= 0) {
      if (mountedRef.current) setState((previous) => ({ ...previous, error: "Choose a passage with notes to play." }));
      return;
    }
    const AudioContextConstructor = window.AudioContext ?? (window as AudioContextWindow).webkitAudioContext;
    if (!AudioContextConstructor) {
      if (mountedRef.current) setState((previous) => ({ ...previous, error: "Audio playback is unavailable in this browser." }));
      return;
    }
    if (mountedRef.current) setState({ isPlaying: false, isStarting: true, beat: startBeat, frameIndex: frameAtBeat(passage, startBeat), error: "" });
    let session: PlaybackSession | null = null;
    let openedContext: AudioContext | null = null;
    try {
      const context = new AudioContextConstructor({ latencyHint: "interactive" });
      openedContext = context;
      const compressor = context.createDynamicsCompressor();
      configureSafetyCompressor(compressor, context.currentTime);
      const master = context.createGain();
      master.gain.setValueAtTime(SYNTH_MASTER_GAIN, context.currentTime);
      master.connect(compressor).connect(context.destination);
      session = {
        context, master, compressor, sequence: passage,
        secondsPerBeat: 60 / clamp(Number.isFinite(current.tempo) ? current.tempo : 72, 30, 200),
        initialBeat: startBeat, originTime: 0, started: false,
        nextFrame: 0, cycle: 0, endCycle: current.loop ? null : 0,
        voices: new Set(), schedulerId: null, animationId: null,
        lastPublishedAt: -Infinity, lastPublishedFrame: -1,
        // A passage-wide budget lets a tied voice keep its level as chords
        // change, without increasing the maximum coherent output budget.
        voiceMixGain: passageVoiceMixGain(passage),
      };
      sessionRef.current = session;
      if (context.state !== "running") await context.resume();
      if (!mountedRef.current || generationRef.current !== generation || sessionRef.current !== session) return;
      if (context.state !== "running" || document.hidden) {
        pause();
        if (mountedRef.current && !document.hidden) setState((previous) => ({ ...previous, error: "Sound could not start. Press Play to try again." }));
        return;
      }
      const playback = session;
      playback.originTime = context.currentTime + START_LEAD_SECONDS;
      playback.started = true;
      const frameIndex = frameAtBeat(passage, startBeat);
      const initialFrame = passage.frames[frameIndex];
      const insideFrame = startBeat >= initialFrame.beat && startBeat < initialFrame.beat + initialFrame.durationBeats;
      if (insideFrame && startBeat > initialFrame.beat + 1e-7) {
        scheduleFrame(playback, frameIndex, 0, playback.originTime, (initialFrame.beat + initialFrame.durationBeats - startBeat) * playback.secondsPerBeat);
        playback.nextFrame = frameIndex + 1;
      } else {
        playback.nextFrame = passage.frames.findIndex((frame) => frame.beat >= startBeat - 1e-7);
        if (playback.nextFrame < 0) playback.nextFrame = passage.frames.length;
      }
      if (playback.nextFrame === passage.frames.length) { playback.nextFrame = 0; playback.cycle = 1; }

      const schedule = () => {
        if (sessionRef.current !== playback) return;
        const now = context.currentTime;
        const currentCycle = Math.floor(unwrappedBeat(playback) / passage.totalBeats);
        if (playback.cycle < currentCycle) { playback.cycle = currentCycle; playback.nextFrame = 0; }
        // A delayed event loop skips expired frames instead of bursting old notes.
        for (let attempts = 0; attempts < passage.frames.length * 2 + 1; attempts += 1) {
          if (playback.endCycle !== null && playback.cycle > playback.endCycle) break;
          const frame = passage.frames[playback.nextFrame];
          const absoluteBeat = playback.cycle * passage.totalBeats + frame.beat;
          const target = playback.originTime + (absoluteBeat - startBeat) * playback.secondsPerBeat;
          if (target > now + LOOKAHEAD_SECONDS) break;
          const end = target + frame.durationBeats * playback.secondsPerBeat;
          const actualStart = Math.max(target, now + .004);
          if (end > actualStart + .012) scheduleFrame(playback, playback.nextFrame, playback.cycle, actualStart, end - actualStart);
          playback.nextFrame += 1;
          if (playback.nextFrame === passage.frames.length) { playback.nextFrame = 0; playback.cycle += 1; }
        }
      };
      const tick = (timestamp: number) => {
        if (sessionRef.current !== playback) return;
        const position = sessionBeat(playback);
        const currentFrameIndex = frameAtBeat(passage, position);
        if (position >= passage.totalBeats && playback.endCycle !== null) {
          positionRef.current = passage.totalBeats;
          dispose();
          if (mountedRef.current) setState({ isPlaying: false, isStarting: false, beat: passage.totalBeats, frameIndex: passage.frames.length - 1, error: "" });
          return;
        }
        positionRef.current = position;
        if (timestamp - playback.lastPublishedAt >= 1000 / 30 || currentFrameIndex !== playback.lastPublishedFrame) {
          playback.lastPublishedAt = timestamp;
          playback.lastPublishedFrame = currentFrameIndex;
          if (mountedRef.current) setState({ isPlaying: true, isStarting: false, beat: position, frameIndex: currentFrameIndex, error: "" });
        }
        playback.animationId = window.requestAnimationFrame(tick);
      };
      context.onstatechange = () => {
        if (sessionRef.current === playback && playback.started && context.state !== "running") pause();
      };
      schedule();
      playback.schedulerId = window.setInterval(schedule, 25);
      playback.animationId = window.requestAnimationFrame(tick);
      if (mountedRef.current) setState({ isPlaying: true, isStarting: false, beat: startBeat, frameIndex, error: "" });
    } catch {
      const currentAttempt = generationRef.current === generation && (!session || sessionRef.current === session);
      if (session && sessionRef.current === session) dispose();
      else if (!session && openedContext && openedContext.state !== "closed") void openedContext.close().catch(() => {});
      if (mountedRef.current && currentAttempt) {
        setState((previous) => ({ ...previous, isPlaying: false, isStarting: false, error: "Sound could not start. Press Play to try again." }));
      }
    }
  }, [dispose, pause]);

  const play = useCallback(async () => {
    if (sessionRef.current) return;
    const total = configRef.current.sequence.totalBeats;
    await startAt(positionRef.current >= total - 1e-7 ? 0 : positionRef.current);
  }, [startAt]);

  const seek = useCallback((requestedBeat: number) => {
    const passage = configRef.current.sequence;
    const position = clamp(Number.isFinite(requestedBeat) ? requestedBeat : 0, 0, passage.totalBeats);
    const wasPlaying = Boolean(sessionRef.current);
    positionRef.current = position;
    if (wasPlaying && position < passage.totalBeats) {
      void startAt(position);
    } else {
      dispose();
      if (mountedRef.current) setState((previous) => ({ ...previous, isPlaying: false, isStarting: false, beat: position, frameIndex: frameAtBeat(passage, position) }));
    }
  }, [dispose, startAt]);

  useEffect(() => {
    mountedRef.current = true;
    const onVisibility = () => { if (document.hidden) pause(); };
    const onPageHide = () => pause();
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pagehide", onPageHide);
    return () => {
      mountedRef.current = false;
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pagehide", onPageHide);
      dispose();
      closeAuditions();
    };
  }, [closeAuditions, dispose, pause]);

  useEffect(() => { stop(); }, [sequence, tempo, stop]);

  useEffect(() => {
    const session = sessionRef.current;
    if (!session || !session.started) return;
    session.endCycle = loop ? null : Math.floor(unwrappedBeat(session) / session.sequence.totalBeats);
    if (session.endCycle !== null) {
      session.voices.forEach((voice) => {
        if (voice.cycle > session.endCycle!) cancelVoice(voice, session.context.currentTime);
      });
      // If looping is switched back on before this cycle ends, re-schedule
      // the cancelled future cycle from its beginning rather than skipping it.
      if (session.cycle > session.endCycle) {
        session.cycle = session.endCycle + 1;
        session.nextFrame = 0;
      }
    }
  }, [loop]);

  return { ...state, error: auditionError || state.error, play, pause, stop, seek, auditionNote };
}
