export type RatioShareState = {
  ratio: number;
  referenceHz: number;
  timbre: "sine" | "harmonic";
};

const DEFAULT_STATE: RatioShareState = {
  ratio: 1.5,
  referenceHz: 220,
  timbre: "harmonic",
};

function boundedNumber(value: string | null, minimum: number, maximum: number, fallback: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= minimum && parsed <= maximum ? parsed : fallback;
}

export function parseRatioShareState(search: string): RatioShareState {
  const params = new URLSearchParams(search);
  const timbre = params.get("timbre");
  return {
    ratio: boundedNumber(params.get("ratio"), 1, 2, DEFAULT_STATE.ratio),
    referenceHz: boundedNumber(params.get("hz"), 80, 480, DEFAULT_STATE.referenceHz),
    timbre: timbre === "sine" || timbre === "harmonic" ? timbre : DEFAULT_STATE.timbre,
  };
}

export function ratioShareSearch(state: RatioShareState): string {
  const params = new URLSearchParams({
    ratio: state.ratio.toFixed(4),
    hz: state.referenceHz.toFixed(1),
    timbre: state.timbre,
  });
  return `?${params.toString()}`;
}
