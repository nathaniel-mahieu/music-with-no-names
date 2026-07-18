export const PIANO_SESSION_KEY = "music-with-no-names:piano-session:v2";

export const PIANO_SESSION_LENSES = [
  "explore",
  "immersion",
  "research",
  "intervals",
  "scales",
  "chords",
  "motion",
  "paths",
  "experience",
] as const;

export type PianoSessionLens = (typeof PIANO_SESSION_LENSES)[number];

export type PianoSessionSummary = {
  attackCount: number;
  focusLens: PianoSessionLens;
};

export type PianoPhraseSpecimenEvent = {
  id: number;
  note: number;
  velocity: number;
  onsetMs: number;
  releaseMs: number | null;
};

export type PianoHarmonySpecimen = {
  events: PianoPhraseSpecimenEvent[];
  chordWindowMs: 80 | 160 | 320;
  boundaryCorrections: Record<number, "break" | "join">;
};

function isSafePhraseEvent(value: unknown) {
  if (!value || typeof value !== "object") return false;
  const event = value as Record<string, unknown>;
  return Number.isInteger(event.id)
    && Number.isInteger(event.note)
    && Number(event.note) >= 0
    && Number(event.note) <= 127
    && typeof event.onsetMs === "number"
    && Number.isFinite(event.onsetMs)
    && event.onsetMs >= 0
    && (event.velocity == null || (Number.isInteger(event.velocity) && Number(event.velocity) >= 0 && Number(event.velocity) <= 127))
    && (event.releaseMs == null || (typeof event.releaseMs === "number" && Number.isFinite(event.releaseMs) && event.releaseMs >= event.onsetMs));
}

function parsePhraseEvents(serialized: string | null): Record<string, unknown>[] | null {
  if (!serialized) return null;
  try {
    const session = JSON.parse(serialized) as Record<string, unknown>;
    if (!session || typeof session !== "object" || !Array.isArray(session.phraseEvents)) return null;
    if (session.phraseEvents.length > 512 || !session.phraseEvents.every(isSafePhraseEvent)) return null;
    return session.phraseEvents as Record<string, unknown>[];
  } catch {
    return null;
  }
}

export function parsePianoSessionSummary(serialized: string | null): PianoSessionSummary | null {
  const phraseEvents = parsePhraseEvents(serialized);
  if (!phraseEvents) return null;
  try {
    const session = JSON.parse(serialized!) as Record<string, unknown>;
    const focusLens = PIANO_SESSION_LENSES.includes(session.focusLens as PianoSessionLens)
      ? session.focusLens as PianoSessionLens
      : "explore";
    return { attackCount: phraseEvents.length, focusLens };
  } catch {
    return null;
  }
}

export function parsePianoPhraseSpecimen(serialized: string | null): PianoPhraseSpecimenEvent[] | null {
  const phraseEvents = parsePhraseEvents(serialized);
  if (!phraseEvents) return null;
  return phraseEvents
    .map((event) => ({
      id: Number(event.id),
      note: Number(event.note),
      velocity: event.velocity == null ? 64 : Number(event.velocity),
      onsetMs: Number(event.onsetMs),
      releaseMs: event.releaseMs == null ? null : Number(event.releaseMs),
    }))
    .sort((first, second) => first.onsetMs - second.onsetMs || first.id - second.id);
}

export function parsePianoHarmonySpecimen(serialized: string | null): PianoHarmonySpecimen | null {
  const events = parsePianoPhraseSpecimen(serialized);
  if (!events || !serialized) return null;
  try {
    const session = JSON.parse(serialized) as Record<string, unknown>;
    const chordWindowMs = session.chordWindowMs === 80 || session.chordWindowMs === 320 ? session.chordWindowMs : 160;
    const eventIds = new Set(events.map((event) => event.id));
    const source = session.boundaryCorrections && typeof session.boundaryCorrections === "object" && !Array.isArray(session.boundaryCorrections)
      ? session.boundaryCorrections as Record<string, unknown>
      : {};
    const boundaryCorrections: Record<number, "break" | "join"> = {};
    Object.entries(source).slice(0, 512).forEach(([rawId, correction]) => {
      const id = Number(rawId);
      if (Number.isInteger(id) && eventIds.has(id) && (correction === "break" || correction === "join")) {
        boundaryCorrections[id] = correction;
      }
    });
    return { events, chordWindowMs, boundaryCorrections };
  } catch {
    return null;
  }
}
