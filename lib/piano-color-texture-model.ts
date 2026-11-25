import { CONVENTIONAL_FLAT_PITCH_CLASSES, CONVENTIONAL_PITCH_CLASSES } from "./piano-model.ts";

/** Authored teaching gestures, not measurements of a listener's emotion. */
export type TextureRole = "anchor" | "flow" | "pull" | "suspension" | "friction" | "release";

export type DemoNote = {
  midi: number;
  voice: "bass" | "harmony" | "melody";
  role: TextureRole;
  degree: string;
  /** Continue this same voiced key across the preceding frame boundary. */
  sustainFromPrevious?: boolean;
};

export type DemoFrame = {
  id: string;
  label: string;
  chord: string;
  beat: number;
  durationBeats: number;
  notes: DemoNote[];
  description: string;
  texture: TextureRole;
};

export type DemoSequence = {
  id: string;
  title: string;
  mode: "major" | "minor";
  frames: DemoFrame[];
  totalBeats: number;
};

export const COLOR_TEXTURE_ROLES: Record<TextureRole, { label: string; description: string }> = {
  anchor: { label: "Anchored", description: "An authored resting field in the declared harmony." },
  flow: { label: "Flowing", description: "An authored continuation through the phrase." },
  pull: { label: "Leaning", description: "A directed gesture toward the next written landing." },
  suspension: { label: "Suspended", description: "A retained pitch whose relation changes with the harmony." },
  friction: { label: "Chromatic", description: "An authored chromatic detour, not measured acoustic roughness." },
  release: { label: "Arriving", description: "The written resolution of the preceding gesture." },
};

export const COLOR_TEXTURE_KEYS = [
  { pitchClass: 0, label: "C" },
  { pitchClass: 1, label: "D♭" },
  { pitchClass: 2, label: "D" },
  { pitchClass: 3, label: "E♭" },
  { pitchClass: 4, label: "E" },
  { pitchClass: 5, label: "F" },
  { pitchClass: 6, label: "F♯" },
  { pitchClass: 7, label: "G" },
  { pitchClass: 8, label: "A♭" },
  { pitchClass: 9, label: "A" },
  { pitchClass: 10, label: "B♭" },
  { pitchClass: 11, label: "B" },
] as const;

type FrameSpec = {
  label: string;
  root: number;
  quality: string;
  bass: number;
  harmony: number[];
  melody: number;
  role: TextureRole;
  duration?: number;
  melodyRole?: TextureRole;
  sustainMelody?: boolean;
  description: string;
};

type Construction = {
  id: string;
  title: string;
  subtitle: string;
  mode: "major" | "minor";
  frames: readonly FrameSpec[];
};

const CONSTRUCTIONS: readonly Construction[] = [
  {
    id: "homecoming", title: "The way home", subtitle: "I · IV · V7 · I", mode: "major",
    frames: [
      { label: "I", root: 0, quality: "", bass: 0, harmony: [12, 16, 19], melody: 24, role: "anchor", description: "A tonic field establishes the point of return." },
      { label: "IV", root: 5, quality: "", bass: 5, harmony: [12, 17, 21], melody: 29, role: "flow", description: "The subdominant opens the phrase while retaining a shared tonic pitch." },
      { label: "V7", root: 7, quality: "7", bass: 7, harmony: [11, 17, 19], melody: 26, role: "pull", description: "The dominant seventh sets up the written return; the third and seventh change at the landing." },
      { label: "I", root: 0, quality: "", bass: 0, harmony: [12, 16, 19], melody: 24, role: "release", description: "The tonic returns and the authored strands gather into an arrival." },
    ],
  },
  {
    id: "suspension", title: "A thread held open", subtitle: "I · V7sus4 · V7 · I", mode: "major",
    frames: [
      { label: "I", root: 0, quality: "", bass: 0, harmony: [12, 16, 19], melody: 24, role: "anchor", description: "Hear the top tonic pitch before the harmony moves beneath it." },
      { label: "V7sus4", root: 7, quality: "7sus4", bass: 7, harmony: [14, 17, 19], melody: 24, role: "suspension", sustainMelody: true, description: "The same top pitch now forms the fourth above the dominant; the written third is withheld." },
      { label: "V7", root: 7, quality: "7", bass: 7, harmony: [14, 17, 19], melody: 23, role: "pull", description: "The top voice steps down a semitone into the dominant third." },
      { label: "I", root: 0, quality: "", bass: 0, harmony: [12, 16, 19], melody: 24, role: "release", description: "The leading tone rises into the tonic at the final landing." },
    ],
  },
  {
    id: "held-color", title: "One note, changing roles", subtitle: "One top pitch through I · IV · V7 · I", mode: "major",
    frames: [
      { label: "I", root: 0, quality: "", bass: 0, harmony: [12, 16, 19], melody: 24, role: "anchor", description: "The top pitch is the tonic, heard as a root-family member of this chord." },
      { label: "IV", root: 5, quality: "", bass: 5, harmony: [12, 17, 21], melody: 24, role: "flow", sustainMelody: true, description: "The top pitch stays the same and becomes the fifth of the new chord." },
      { label: "V7 + 4", root: 7, quality: "7(add11)", bass: 7, harmony: [11, 14, 17], melody: 24, role: "suspension", sustainMelody: true, description: "The unchanged top pitch sits above a dominant seventh as an added fourth; color identity remains fixed while its contextual texture changes." },
      { label: "I", root: 0, quality: "", bass: 0, harmony: [12, 16, 19], melody: 24, role: "release", sustainMelody: true, description: "The same top pitch returns to a tonic chord without changing its octave or hue." },
    ],
  },
  {
    id: "leading-tone", title: "A melody finding home", subtitle: "Tonic · passing motion · 7 → 1", mode: "major",
    frames: [
      { label: "I · 1", root: 0, quality: "", bass: 0, harmony: [12, 16, 19], melody: 24, role: "anchor", duration: 2, description: "The melody begins at the established tonic." },
      { label: "I · 3", root: 0, quality: "", bass: 0, harmony: [12, 16, 19], melody: 28, role: "flow", duration: 2, description: "The melody opens upward to the third over the same harmony." },
      { label: "ii7 · 2", root: 2, quality: "m7", bass: 2, harmony: [17, 21, 24], melody: 26, role: "flow", duration: 2, description: "A predominant field carries the melody toward the cadence." },
      { label: "V7 · 7", root: 7, quality: "7", bass: 7, harmony: [14, 17, 19], melody: 23, role: "pull", duration: 2, description: "The leading tone sits one semitone below the next written tonic." },
      { label: "I · 1", root: 0, quality: "", bass: 0, harmony: [12, 16, 19], melody: 24, role: "release", duration: 2, description: "A one-semitone melodic step completes the first arrival." },
      { label: "vi7 · 6", root: 9, quality: "m7", bass: -3, harmony: [12, 16, 19], melody: 21, role: "flow", duration: 2, description: "The relative-minor seventh field gives the melody another place to continue." },
      { label: "V7 · 7", root: 7, quality: "7", bass: 7, harmony: [14, 17, 19], melody: 23, role: "pull", duration: 2, description: "The same leading-tone gesture returns with a familiar destination." },
      { label: "I · 1", root: 0, quality: "", bass: 0, harmony: [12, 16, 19], melody: 24, role: "release", duration: 2, description: "The final tonic answers the melody's repeated approach." },
    ],
  },
  {
    id: "minor-cadence", title: "A homecoming in minor", subtitle: "i · iv · V7 · i", mode: "minor",
    frames: [
      { label: "i", root: 0, quality: "m", bass: 0, harmony: [12, 15, 19], melody: 24, role: "anchor", description: "A minor tonic establishes this construction's point of return." },
      { label: "iv", root: 5, quality: "m", bass: 5, harmony: [12, 17, 20], melody: 29, role: "flow", description: "The minor subdominant continues with the lowered sixth of the declared minor collection." },
      { label: "V7", root: 7, quality: "7", bass: 7, harmony: [14, 17, 19], melody: 23, role: "pull", description: "A raised seventh supplies the leading-tone step used by this minor cadence." },
      { label: "i", root: 0, quality: "m", bass: 0, harmony: [12, 15, 19], melody: 24, role: "release", description: "The minor tonic returns with its lowered third intact." },
    ],
  },
  {
    id: "chromatic-detour", title: "A glint outside the key", subtitle: "I · IV · V/V · V · V7 · I", mode: "major",
    frames: [
      { label: "I", root: 0, quality: "", bass: 0, harmony: [12, 16, 19], melody: 28, role: "anchor", duration: 2, description: "The tonic third starts the rising melodic line." },
      { label: "IV", root: 5, quality: "", bass: 5, harmony: [12, 17, 21], melody: 29, role: "flow", duration: 2, description: "The melody rises to the fourth above the declared tonic." },
      { label: "V/V", root: 2, quality: "7", bass: 2, harmony: [12, 18, 21], melody: 30, role: "friction", duration: 2, description: "A secondary dominant introduces the raised fourth before its step into the dominant root." },
      { label: "V", root: 7, quality: "", bass: 7, harmony: [14, 19, 23], melody: 31, role: "flow", duration: 2, description: "The chromatic step reaches the dominant root, giving the detour a local destination." },
      { label: "V7", root: 7, quality: "7", bass: 7, harmony: [14, 17, 19], melody: 23, role: "pull", description: "The dominant seventh prepares the construction's final tonic." },
      { label: "I", root: 0, quality: "", bass: 0, harmony: [12, 16, 19], melody: 24, role: "release", description: "The cadence returns to the original tonic after the chromatic turn." },
    ],
  },
];

export const COLOR_TEXTURE_CONSTRUCTIONS = CONSTRUCTIONS.map(({ id, title, subtitle, mode }) => ({ id, title, subtitle, mode }));

const DEGREE_LABELS = ["1", "♭2", "2", "♭3", "3", "4", "♯4", "5", "♭6", "6", "♭7", "7"];
const FLAT_TONICS = new Set([1, 3, 5, 8, 10]);

function pitchClass(value: number) {
  return ((value % 12) + 12) % 12;
}

function innerVoiceRole(spec: FrameSpec, offset: number, voice: "bass" | "harmony"): TextureRole {
  if (spec.role === "anchor" || spec.role === "release" || spec.role === "flow") return spec.role;
  if (voice === "bass") return "anchor";
  const degree = pitchClass(offset);
  if (spec.role === "friction") return degree === 6 ? "friction" : degree === 0 ? "pull" : "flow";
  // In these authored dominant fields, the leading tone and chordal seventh
  // carry the directed cue; other members need not share the melody's texture.
  return degree === 11 || degree === 5 ? "pull" : "flow";
}

/** The selected construction provides all context. No live input is consulted. */
export function getColorTextureSequence(id: string, tonicPitchClass: number, octaveShift = 0): DemoSequence {
  const construction = CONSTRUCTIONS.find((candidate) => candidate.id === id) ?? CONSTRUCTIONS[0];
  const tonic = pitchClass(Number.isFinite(tonicPitchClass) ? Math.round(tonicPitchClass) : 0);
  const shift = Number.isFinite(octaveShift) ? Math.max(-1, Math.min(1, Math.round(octaveShift))) : 0;
  const base = 48 + tonic + shift * 12;
  const spellings = FLAT_TONICS.has(tonic) ? CONVENTIONAL_FLAT_PITCH_CLASSES : CONVENTIONAL_PITCH_CLASSES;
  let beat = 0;
  const frames = construction.frames.map((spec, index): DemoFrame => {
    const durationBeats = spec.duration ?? 4;
    const note = (offset: number, voice: DemoNote["voice"], role: TextureRole): DemoNote => ({ midi: base + offset, voice, role, degree: DEGREE_LABELS[pitchClass(offset)] });
    const melody = note(spec.melody, "melody", spec.melodyRole ?? spec.role);
    if (spec.sustainMelody && index > 0) melody.sustainFromPrevious = true;
    const frame: DemoFrame = {
      id: `${construction.id}-${index}`,
      label: spec.label,
      chord: `${spellings[pitchClass(tonic + spec.root)]}${spec.quality}`,
      beat,
      durationBeats,
      notes: [note(spec.bass, "bass", innerVoiceRole(spec, spec.bass, "bass")), ...spec.harmony.map((offset) => note(offset, "harmony", innerVoiceRole(spec, offset, "harmony"))), melody],
      description: spec.description,
      texture: spec.role,
    };
    beat += durationBeats;
    return frame;
  });
  return { id: construction.id, title: construction.title, mode: construction.mode, frames, totalBeats: beat };
}

/** Half-open score-time frames; score-end itself has no sounding frame. */
export function colorTextureFrameAtBeat(sequence: DemoSequence, beat: number): DemoFrame | null {
  if (!Number.isFinite(beat) || beat < 0 || beat >= sequence.totalBeats) return null;
  return sequence.frames.find((frame) => beat >= frame.beat && beat < frame.beat + frame.durationBeats) ?? null;
}

export type DemoPitchColor = {
  color: string;
  gray: string;
  lightness: number;
  grayLightness: number;
  chroma: number;
  hue: number;
  note: string;
  octave: number;
};

function inSrgbGamut(lightness: number, chroma: number, hue: number) {
  const a = chroma * Math.cos(hue * Math.PI / 180);
  const b = chroma * Math.sin(hue * Math.PI / 180);
  const l = (lightness + .3963377774 * a + .2158037573 * b) ** 3;
  const m = (lightness - .1055613458 * a - .0638541728 * b) ** 3;
  const s = (lightness - .0894841775 * a - 1.291485548 * b) ** 3;
  const channels = [4.0767416621 * l - 3.3077115913 * m + .2309699292 * s, -1.2684380046 * l + 2.6097574011 * m - .3413193965 * s, -.0041960863 * l - .7034186147 * m + 1.707614701 * s];
  return channels.every((channel) => channel >= 0 && channel <= 1);
}

const COLOR_CACHE = new Map<number, DemoPitchColor>();

/** A vivid demo palette; it deliberately leaves the site's learned palette unchanged. */
export function getDemoPitchColor(midi: number): DemoPitchColor {
  const safeMidi = Number.isFinite(midi) ? Math.max(0, Math.min(127, Math.round(midi))) : 60;
  const cached = COLOR_CACHE.get(safeMidi);
  if (cached) return cached;
  const pc = pitchClass(safeMidi);
  const octave = Math.floor(safeMidi / 12) - 1;
  const register = Math.max(0, Math.min(8, octave));
  const lightness = .64 + .015 * register;
  const grayLightness = .20 + .08 * register;
  const hue = (245 + 30 * pc) % 360;
  let low = 0, high = .5;
  for (let step = 0; step < 30; step += 1) {
    const middle = (low + high) / 2;
    if (inSrgbGamut(lightness, middle, hue)) low = middle;
    else high = middle;
  }
  const chroma = Math.min(.98 * low, Math.max(.12, .95 * low));
  const result: DemoPitchColor = {
    color: `oklch(${lightness} ${chroma} ${hue})`,
    gray: `oklch(${grayLightness} 0 0)`,
    lightness, grayLightness, chroma, hue,
    note: `${CONVENTIONAL_PITCH_CLASSES[pc]}${octave}`,
    octave,
  };
  COLOR_CACHE.set(safeMidi, result);
  return result;
}
