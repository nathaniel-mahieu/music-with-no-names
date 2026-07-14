import {
  frequencyFromMidi,
  groupChordGestures,
  pairwiseIntervals,
  voiceLeadingProfile,
  type ChordBoundaryCorrection,
  type ChordGesture,
  type TimedNoteAttack,
  type VoiceLeadingProfile,
} from "./piano-model.ts";
import {
  sonorityAffordances,
  sonorityPerceptionModel,
  type SonorityAffordance,
  type SonorityPerception,
  type SonorityVoice,
} from "./sonority-model.ts";

export type LiveHarmonyPhraseEvent = {
  id: number;
  note: number;
  velocity?: number;
  onsetMs: number;
  releaseMs?: number | null;
};

export type LiveHarmonyField = {
  id: string;
  index: number;
  eventIds: number[];
  notes: number[];
  offsetsFromBass: number[];
  equalKeyRatios: number[];
  onsetMs: number;
  spreadMs: number;
  kind: "together" | "rolled";
  intervals: ReturnType<typeof pairwiseIntervals>;
  perception: SonorityPerception;
};

export type LiveHarmonyAffordanceDelta = SonorityAffordance & {
  before: number;
  after: number;
  delta: number;
};

export type LiveHarmonyTransition = {
  voiceLeading: VoiceLeadingProfile;
  currentWithMotion: SonorityPerception;
  sensoryDelta: {
    roughness: number;
    harmonicity: number;
    fusion: number;
    openness: number;
    brightness: number;
  };
  affordanceDelta: LiveHarmonyAffordanceDelta[];
};

export type LiveHarmonyPhraseProfile = {
  attackCount: number;
  gestureCount: number;
  groupingMs: number;
  previous: LiveHarmonyField | null;
  current: LiveHarmonyField;
  transition: LiveHarmonyTransition | null;
};

function fixedHarmonicVoices(notes: number[]): SonorityVoice[] {
  return notes.map((note) => ({
    frequencyHz: frequencyFromMidi(note),
    amplitude: 0.7,
    partialCount: 9,
    spectrum: { rolloffDbPerOctave: 7, inharmonicity: 0, noiseAmount: 0 },
  }));
}

function validEvent(event: LiveHarmonyPhraseEvent) {
  return Number.isInteger(event.id)
    && Number.isInteger(event.note)
    && event.note >= 0
    && event.note <= 127
    && Number.isFinite(event.onsetMs)
    && event.onsetMs >= 0
    && (event.velocity == null || (Number.isInteger(event.velocity) && event.velocity >= 0 && event.velocity <= 127))
    && (event.releaseMs == null || (Number.isFinite(event.releaseMs) && event.releaseMs >= event.onsetMs));
}

function fieldFromGesture(
  gesture: ChordGesture<TimedNoteAttack>,
  index: number,
): LiveHarmonyField {
  const notes = [...new Set(gesture.attackedNotes)].sort((first, second) => first - second);
  const bass = notes[0];
  const voices = fixedHarmonicVoices(notes);
  return {
    id: gesture.id,
    index,
    eventIds: gesture.attacks.map((attack) => attack.id),
    notes,
    offsetsFromBass: notes.map((note) => note - bass),
    equalKeyRatios: notes.map((note) => 2 ** ((note - bass) / 12)),
    onsetMs: gesture.startMs,
    spreadMs: gesture.spreadMs,
    kind: gesture.kind,
    intervals: pairwiseIntervals(notes),
    perception: sonorityPerceptionModel(voices),
  };
}

/**
 * Projects the latest two compact, attacked MIDI fields into physical interval,
 * assumed-auditory, voice-motion, and conditional-affordance evidence. This
 * deliberately ignores actual instrument audio and does not infer experience.
 */
export function liveHarmonyPhraseProfile(
  events: LiveHarmonyPhraseEvent[],
  groupingMs = 160,
  boundaryCorrections: Readonly<Record<number, ChordBoundaryCorrection>> = {},
): LiveHarmonyPhraseProfile | null {
  const usable = events
    .filter(validEvent)
    .sort((first, second) => first.onsetMs - second.onsetMs || first.id - second.id);
  const windowMs = Number.isFinite(groupingMs) && groupingMs > 0 ? groupingMs : 160;
  const attacks: TimedNoteAttack[] = usable.map((event) => ({
    id: event.id,
    note: event.note,
    onsetMs: event.onsetMs,
    fieldNotes: [event.note],
  }));
  const gestures = groupChordGestures(attacks, windowMs, windowMs * 2, boundaryCorrections);
  if (!gestures.length) return null;
  const fields = gestures.map(fieldFromGesture);
  const current = fields.at(-1)!;
  const previous = fields.length > 1 ? fields.at(-2)! : null;
  if (!previous) {
    return {
      attackCount: usable.length,
      gestureCount: fields.length,
      groupingMs: windowMs,
      previous: null,
      current,
      transition: null,
    };
  }

  const voiceLeading = voiceLeadingProfile(previous.notes, current.notes);
  const currentWithMotion = sonorityPerceptionModel(
    fixedHarmonicVoices(current.notes),
    voiceLeading.totalMotion * 100,
  );
  const beforeAffordances = sonorityAffordances(previous.perception);
  const afterAffordances = sonorityAffordances(currentWithMotion);
  const affordanceDelta = afterAffordances.map((after) => {
    const before = beforeAffordances.find((item) => item.key === after.key)?.value ?? 0;
    return { ...after, before, after: after.value, delta: after.value - before };
  });
  return {
    attackCount: usable.length,
    gestureCount: fields.length,
    groupingMs: windowMs,
    previous,
    current,
    transition: {
      voiceLeading,
      currentWithMotion,
      sensoryDelta: {
        roughness: current.perception.roughness - previous.perception.roughness,
        harmonicity: current.perception.harmonicity - previous.perception.harmonicity,
        fusion: current.perception.fusion - previous.perception.fusion,
        openness: current.perception.openness - previous.perception.openness,
        brightness: current.perception.brightness - previous.perception.brightness,
      },
      affordanceDelta,
    },
  };
}
