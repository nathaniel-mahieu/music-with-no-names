/** Sound Finder is untimed; these windows gather one rolled chord, not rhythm. */
export const EAR_SEARCH_CHORD_WINDOWS = Object.freeze([300, 600, 1000] as const);
export type EarSearchChordWindow = (typeof EAR_SEARCH_CHORD_WINDOWS)[number];

export const DEFAULT_EAR_SEARCH_CHORD_WINDOW: EarSearchChordWindow = 600;
export const EAR_SEARCH_GATHER_STORAGE_KEY = "music-with-no-names:ear-search-gather:v1";

/** Accept only values written by the gather selector; never coerce stored input. */
export function parseEarSearchChordWindow(value: string | null | undefined): EarSearchChordWindow {
  switch (value) {
    case "300": return 300;
    case "600": return 600;
    case "1000": return 1000;
    default: return DEFAULT_EAR_SEARCH_CHORD_WINDOW;
  }
}
