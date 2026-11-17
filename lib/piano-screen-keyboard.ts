export const DEFAULT_PIANO_SCREEN_START = 48;
export const PIANO_SCREEN_KEY_COUNT = 25;
export const MAX_PIANO_SCREEN_START = 120;

const WHITE_PITCH_CLASSES = new Set([0, 2, 4, 5, 7, 9, 11]);

export type PianoScreenKeyboardWindow = {
  start: number;
  notes: number[];
  whiteNotes: number[];
  canMoveLower: boolean;
  canMoveHigher: boolean;
  octavesFromCenter: number;
};

/** Manual octave windows only: no score, expected note, or target enters here. */
export function pianoScreenKeyboardWindow(requestedStart = DEFAULT_PIANO_SCREEN_START): PianoScreenKeyboardWindow {
  const start = Number.isFinite(requestedStart)
    ? Math.max(0, Math.min(MAX_PIANO_SCREEN_START, Math.floor(requestedStart / 12) * 12))
    : DEFAULT_PIANO_SCREEN_START;
  const notes = Array.from({ length: Math.min(PIANO_SCREEN_KEY_COUNT, 128 - start) }, (_, index) => start + index);
  return {
    start,
    notes,
    whiteNotes: notes.filter((note) => WHITE_PITCH_CLASSES.has(note % 12)),
    canMoveLower: start > 0,
    canMoveHigher: start < MAX_PIANO_SCREEN_START,
    octavesFromCenter: (start - DEFAULT_PIANO_SCREEN_START) / 12,
  };
}

/** Physical key widths remain proportional when the top MIDI window is clipped. */
export function pianoScreenKeyPlacement(note: number, window: PianoScreenKeyboardWindow) {
  const index = window.notes.indexOf(note);
  if (index < 0) throw new RangeError("The key is outside this on-screen keyboard window.");
  const black = !WHITE_PITCH_CLASSES.has(note % 12);
  const whiteWidthPercent = 100 / window.whiteNotes.length;
  return {
    black,
    leftPercent: (black ? window.whiteNotes.filter((white) => white < note).length : window.whiteNotes.indexOf(note)) * whiteWidthPercent,
    widthPercent: whiteWidthPercent * (black ? .63 : 1),
    whiteWidthPercent,
    physicalPosition: index + 1,
    totalKeys: window.notes.length,
  };
}

export function pianoScreenRangeLabel(octavesFromCenter: number) {
  if (octavesFromCenter === 0) return "Centered range";
  const distance = Math.abs(octavesFromCenter);
  return `${distance} octave${distance === 1 ? "" : "s"} ${octavesFromCenter < 0 ? "lower" : "higher"}`;
}
