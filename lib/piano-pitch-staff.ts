import { spellMidiPitch } from "./piano-sight-reading-model.ts";

export type PitchStaffSpelling = "sharps" | "flats";
export type PitchStaffClef = "treble" | "bass";

export const MIDDLE_C_MIDI = 60;

const GRAND_STAFF_TOP_STEP = -10; // F5, the treble staff's top line.
const GRAND_STAFF_BOTTOM_STEP = 10; // G2, the bass staff's bottom line.

/** Written staff steps below middle C; one line-to-space move is one step. */
export function pitchStaffStep(midi: number, spelling: PitchStaffSpelling = "sharps") {
  const written = spellMidiPitch(midi, { clef: "treble", prefer: spelling });
  return -written.staffStep - 2;
}

/** Only real ledger lines: middle C, then every second step outside either staff. */
export function pitchStaffLedgerSteps(midi: number, spelling: PitchStaffSpelling = "sharps") {
  const step = pitchStaffStep(midi, spelling);
  if (step === 0) return [0];
  const lines: number[] = [];
  if (step <= -12) {
    for (let line = -12; line >= step; line -= 2) lines.push(line);
  } else if (step >= 12) {
    for (let line = 12; line <= step; line += 2) lines.push(line);
  }
  return lines;
}

/** F5=0, middle C=0.5, G2=1. Ledger notes deliberately extend beyond 0–1. */
export function grandStaffPosition(midi: number, spelling: PitchStaffSpelling = "sharps") {
  return (pitchStaffStep(midi, spelling) - GRAND_STAFF_TOP_STEP)
    / (GRAND_STAFF_BOTTOM_STEP - GRAND_STAFF_TOP_STEP);
}

const STAFF_MIDI_LINES = {
  treble: [64, 67, 71, 74, 77], // E4 G4 B4 D5 F5, bottom to top.
  bass: [43, 47, 50, 53, 57], // G2 B2 D3 F3 A3, bottom to top.
} as const;

export const GRAND_STAFF_LINES = (["treble", "bass"] as const).flatMap((clef) => (
  STAFF_MIDI_LINES[clef].map((midi) => ({ clef, midi, step: pitchStaffStep(midi) }))
));

