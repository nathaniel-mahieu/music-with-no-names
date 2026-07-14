export const PIANO_SESSION_KEY = "music-with-no-names:piano-session:v2";

export const PIANO_SESSION_LENSES = [
  "explore",
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

function isSafePhraseEvent(value: unknown) {
  if (!value || typeof value !== "object") return false;
  const event = value as Record<string, unknown>;
  return Number.isInteger(event.id)
    && Number.isInteger(event.note)
    && Number(event.note) >= 0
    && Number(event.note) <= 127
    && typeof event.onsetMs === "number"
    && Number.isFinite(event.onsetMs);
}

export function parsePianoSessionSummary(serialized: string | null): PianoSessionSummary | null {
  if (!serialized) return null;
  try {
    const session = JSON.parse(serialized) as Record<string, unknown>;
    if (!session || typeof session !== "object" || !Array.isArray(session.phraseEvents)) return null;
    if (session.phraseEvents.length > 512 || !session.phraseEvents.every(isSafePhraseEvent)) return null;
    const focusLens = PIANO_SESSION_LENSES.includes(session.focusLens as PianoSessionLens)
      ? session.focusLens as PianoSessionLens
      : "explore";
    return { attackCount: session.phraseEvents.length, focusLens };
  } catch {
    return null;
  }
}
