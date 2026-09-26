import test from "node:test";
import assert from "node:assert/strict";
import { spotifyEmbedTarget } from "../lib/spotify-embed.ts";

test("normalizes Spotify track links and URIs to an official embed", () => {
  assert.deepEqual(spotifyEmbedTarget("https://open.spotify.com/track/4uLU6hMCjMI75M1A2tKUQC?si=abc"), {
    kind: "track",
    id: "4uLU6hMCjMI75M1A2tKUQC",
    canonicalUrl: "https://open.spotify.com/track/4uLU6hMCjMI75M1A2tKUQC",
    embedUrl: "https://open.spotify.com/embed/track/4uLU6hMCjMI75M1A2tKUQC?utm_source=generator&theme=0",
  });
  assert.equal(spotifyEmbedTarget("spotify:track:4uLU6hMCjMI75M1A2tKUQC")?.id, "4uLU6hMCjMI75M1A2tKUQC");
});

test("supports locale-prefixed Spotify links and rejects non-Spotify URLs", () => {
  assert.equal(spotifyEmbedTarget("https://open.spotify.com/intl-fr/album/1ATL5GLyefJaxhQzSPVrLX")?.kind, "album");
  assert.equal(spotifyEmbedTarget("https://example.com/track/4uLU6hMCjMI75M1A2tKUQC"), null);
  assert.equal(spotifyEmbedTarget("javascript:alert(1)"), null);
  assert.equal(spotifyEmbedTarget("https://open.spotify.com/embed/track/4uLU6hMCjMI75M1A2tKUQC"), null);
});
