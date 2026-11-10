import { CONVENTIONAL_PITCH_CLASSES, pitchClassFromMidi } from "./piano-model.ts";

const LIGHTNESS = 0.7;
const CHROMA = 0.12;
const C_HUE = 245;
const C_AFFECT_ANGLE = 315;
const SEMITONE_ANGLE = 360 / CONVENTIONAL_PITCH_CLASSES.length;

const PALETTE = [
  ["Blue", "Serene"],
  ["Periwinkle", "Content"],
  ["Lavender", "Cheerful"],
  ["Orchid", "Lively"],
  ["Rose red", "Excited"],
  ["Coral", "Tense"],
  ["Amber", "Agitated"],
  ["Gold", "Frustrated"],
  ["Olive green", "Downcast"],
  ["Leaf green", "Somber"],
  ["Teal", "Drowsy"],
  ["Cyan", "Still"],
] as const;

// The hue and feeling wheels share step size, with separate starting angles.
export const PITCH_CLASS_COLORS = CONVENTIONAL_PITCH_CLASSES.map((note, pitchClass) => {
  const [name, association] = PALETTE[pitchClass];
  const hue = (C_HUE + pitchClass * SEMITONE_ANGLE) % 360;

  return {
    pitchClass,
    note,
    name,
    hue,
    color: `oklch(${LIGHTNESS} ${CHROMA} ${hue})`,
    association,
    affectAngle: (C_AFFECT_ANGLE + pitchClass * SEMITONE_ANGLE) % 360,
  } as const;
});

export function getPitchClassColor(midi: number) {
  return PITCH_CLASS_COLORS[pitchClassFromMidi(midi)];
}

export function pitchClassColor(midi: number) {
  return getPitchClassColor(midi).color;
}
