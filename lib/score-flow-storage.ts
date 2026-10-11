export const SCORE_FLOW_STORAGE_KEY = "music-with-no-names:score-flow:v1";
export const SCORE_FLOW_HISTORY_STORAGE_KEY = "music-with-no-names:score-flow-history:v1";

export type StoredScoreFlowSource = {
  version: 1;
  fileName: string;
  xml: string;
};

export function parseStoredScoreFlowSource(serialized: string | null): StoredScoreFlowSource | null {
  if (!serialized || serialized.length > 17 * 1024 * 1024) return null;
  try {
    const value = JSON.parse(serialized) as { version?: unknown; fileName?: unknown; xml?: unknown };
    if (value.version !== 1 || typeof value.fileName !== "string" || !value.fileName.trim() || value.fileName.length > 512) return null;
    if (typeof value.xml !== "string" || !value.xml.trim() || value.xml.length > 16 * 1024 * 1024) return null;
    return { version: 1, fileName: value.fileName, xml: value.xml };
  } catch {
    return null;
  }
}
