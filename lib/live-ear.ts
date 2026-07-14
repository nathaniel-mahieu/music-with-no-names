import { frequencyFromMidi } from "./piano-model.ts";
import {
  PIANO_SOUND_MODELS,
  pianoPartialInteraction,
  pianoSoundVoice,
  type PianoSoundModelId,
} from "./piano-sound-model.ts";
import { sonorityPerceptionModel } from "./sonority-model.ts";
import type { PianoPhraseSpecimenEvent } from "./piano-session.ts";

export type LiveEarInteractionStatus = "overlap" | "separate" | "unknown";

export type LiveEarModelReading = {
  id: PianoSoundModelId;
  label: string;
  shortLabel: string;
  description: string;
  partialCount: number;
  alignedPairCount: number;
  interactionPairCount: number;
  roughness: number;
  overlap: number;
  harmonicity: number;
  fusion: number;
  brightness: number;
};

export type LiveEarIntervalProfile = {
  first: PianoPhraseSpecimenEvent;
  second: PianoPhraseSpecimenEvent;
  signedSteps: number;
  steps: number;
  cents: number;
  equalFrequencyRatio: number;
  lowerHz: number;
  upperHz: number;
  interactionStatus: LiveEarInteractionStatus;
  overlapMs: number | null;
  modelReadings: LiveEarModelReading[];
};

function safeEvents(events: PianoPhraseSpecimenEvent[]) {
  return events
    .filter((event) => Number.isInteger(event.id)
      && Number.isInteger(event.note)
      && event.note >= 0
      && event.note <= 127
      && Number.isFinite(event.onsetMs)
      && event.onsetMs >= 0
      && (event.releaseMs == null || (Number.isFinite(event.releaseMs) && event.releaseMs >= event.onsetMs)))
    .sort((first, second) => first.onsetMs - second.onsetMs || first.id - second.id);
}

function interactionStatus(first: PianoPhraseSpecimenEvent, second: PianoPhraseSpecimenEvent) {
  if (first.releaseMs == null) return { status: "unknown" as const, overlapMs: null };
  const overlapMs = first.releaseMs - second.onsetMs;
  return overlapMs > 0
    ? { status: "overlap" as const, overlapMs }
    : { status: "separate" as const, overlapMs: 0 };
}

/**
 * Reads the latest performed interval. Spectral evidence is emitted only when
 * release timing proves that both fundamentals overlapped. Every upper partial
 * remains a declared teaching assumption rather than measured keyboard audio.
 */
export function liveEarIntervalProfile(events: PianoPhraseSpecimenEvent[]): LiveEarIntervalProfile | null {
  const usable = safeEvents(events);
  if (usable.length < 2) return null;
  const first = usable.at(-2)!;
  const second = usable.at(-1)!;
  const signedSteps = second.note - first.note;
  const steps = Math.abs(signedSteps);
  const firstHz = frequencyFromMidi(first.note);
  const secondHz = frequencyFromMidi(second.note);
  const lowerHz = Math.min(firstHz, secondHz);
  const upperHz = Math.max(firstHz, secondHz);
  const timing = interactionStatus(first, second);
  const modelReadings = timing.status === "overlap"
    ? PIANO_SOUND_MODELS.map((model) => {
      const interaction = pianoPartialInteraction(lowerHz, upperHz, model.id);
      const perception = sonorityPerceptionModel([
        pianoSoundVoice(lowerHz, 0.72, model.id),
        pianoSoundVoice(upperHz, 0.72, model.id),
      ]);
      return {
        id: model.id,
        label: model.label,
        shortLabel: model.shortLabel,
        description: model.description,
        partialCount: model.partialCount,
        alignedPairCount: interaction.alignedPairs.length,
        interactionPairCount: interaction.interactionPairs.length,
        roughness: interaction.roughness,
        overlap: interaction.overlap,
        harmonicity: perception.harmonicity,
        fusion: perception.fusion,
        brightness: perception.brightness,
      };
    })
    : [];
  return {
    first,
    second,
    signedSteps,
    steps,
    cents: steps * 100,
    equalFrequencyRatio: 2 ** (steps / 12),
    lowerHz,
    upperHz,
    interactionStatus: timing.status,
    overlapMs: timing.overlapMs,
    modelReadings,
  };
}
