const EMBEDDABLE_SPOTIFY_TYPES = new Set(["track", "album", "playlist", "episode", "show"]);

export type SpotifyEmbedTarget = {
  kind: string;
  id: string;
  canonicalUrl: string;
  embedUrl: string;
};

/** Accept only canonical Spotify content links. The embed deliberately remains
 * an independent listening surface and never feeds Score Flow timing. */
export function spotifyEmbedTarget(input: string): SpotifyEmbedTarget | null {
  const trimmed = input.trim();
  if (!trimmed) return null;
  let kind = "";
  let id = "";
  if (trimmed.startsWith("spotify:")) {
    const parts = trimmed.split(":");
    if (parts.length !== 3) return null;
    [, kind, id] = parts;
  } else {
    let url: URL;
    try { url = new URL(trimmed); }
    catch { return null; }
    if (url.protocol !== "https:" || url.hostname !== "open.spotify.com") return null;
    const parts = url.pathname.split("/").filter(Boolean);
    if (parts[0]?.startsWith("intl-")) parts.shift();
    if (parts.length !== 2) return null;
    [kind, id] = parts;
  }
  if (!EMBEDDABLE_SPOTIFY_TYPES.has(kind) || !/^[A-Za-z0-9]+$/.test(id)) return null;
  return {
    kind,
    id,
    canonicalUrl: `https://open.spotify.com/${kind}/${id}`,
    embedUrl: `https://open.spotify.com/embed/${kind}/${id}?utm_source=generator&theme=0`,
  };
}
