export type PitchVisualMode = "staff" | "vertical";

export type PitchVisualSettings = {
  mode: PitchVisualMode;
  glowFlash: boolean;
  noteFlash: boolean;
  staffFlash: boolean;
};

/** Browser-local preferences shared by every view, not by one Piano HUD. */
export const PITCH_VISUAL_SETTINGS_STORAGE_KEY = "music-with-no-names:pitch-visuals:v1";

export const DEFAULT_PITCH_VISUAL_SETTINGS: Readonly<PitchVisualSettings> = Object.freeze({
  mode: "staff",
  glowFlash: true,
  noteFlash: true,
  staffFlash: true,
});

/** Retain valid individual choices; do not coerce strings or truthy values. */
export function normalizePitchVisualSettings(value: unknown): PitchVisualSettings {
  const source = value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
  return {
    mode: source.mode === "staff" || source.mode === "vertical" ? source.mode : DEFAULT_PITCH_VISUAL_SETTINGS.mode,
    glowFlash: typeof source.glowFlash === "boolean" ? source.glowFlash : DEFAULT_PITCH_VISUAL_SETTINGS.glowFlash,
    noteFlash: typeof source.noteFlash === "boolean" ? source.noteFlash : DEFAULT_PITCH_VISUAL_SETTINGS.noteFlash,
    staffFlash: typeof source.staffFlash === "boolean" ? source.staffFlash : DEFAULT_PITCH_VISUAL_SETTINGS.staffFlash,
  };
}

export function parsePitchVisualSettings(value: string | null | undefined): PitchVisualSettings {
  if (value == null) return { ...DEFAULT_PITCH_VISUAL_SETTINGS };
  try {
    return normalizePitchVisualSettings(JSON.parse(value));
  } catch {
    return { ...DEFAULT_PITCH_VISUAL_SETTINGS };
  }
}

export function serializePitchVisualSettings(settings: PitchVisualSettings): string {
  return JSON.stringify(normalizePitchVisualSettings(settings));
}

/** Turning every flash off does not lose the selected placement mode. */
export function setAllPitchVisualEffects(settings: PitchVisualSettings, enabled: boolean): PitchVisualSettings {
  return {
    ...normalizePitchVisualSettings(settings),
    glowFlash: enabled,
    noteFlash: enabled,
    staffFlash: enabled,
  };
}
