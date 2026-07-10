import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import test from "node:test";

const projectRoot = new URL("../", import.meta.url);

async function render() {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);

  return worker.fetch(
    new Request("http://localhost/", {
      headers: { accept: "text/html" },
    }),
    {
      ASSETS: {
        fetch: async () => new Response("Not found", { status: 404 }),
      },
    },
    {
      waitUntil() {},
      passThroughOnException() {},
    },
  );
}

test("server-renders the Ratio Lab product surface", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);

  const html = await response.text();
  assert.match(html, /<title>Music With No Names · Sound Labs<\/title>/i);
  assert.match(html, /Hear relationships, not labels\./i);
  assert.match(html, /Two oscillations/i);
  assert.match(html, /Hear relationship/i);
  assert.match(html, /Relationship/i);
  assert.match(html, /Physical register/i);
  assert.match(html, /Pure sine/i);
  assert.match(html, /Harmonic/i);
  assert.match(html, /Motion through time/i);
  assert.match(html, /Energy across frequency/i);
  assert.match(html, /Cycle against cycle/i);
  assert.match(html, /Important:/i);
  assert.match(html, />Ratio<\/button>/i);
  assert.match(html, />Harmony<\/button>/i);
  assert.match(html, />Rhythm<\/button>/i);
  assert.match(html, />Atlas<\/button>/i);
  assert.doesNotMatch(html, /codex-preview|Your site is taking shape|react-loading-skeleton/i);
});

test("removes the disposable starter and keeps audio safety visible in source", async () => {
  const [page, layout, packageJson, ratioLab, harmonyLab, rhythmLab, atlasLab] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/layout.tsx", import.meta.url), "utf8"),
    readFile(new URL("../package.json", import.meta.url), "utf8"),
    readFile(new URL("../app/RatioLab.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/HarmonyLab.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/RhythmLab.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/AtlasLab.tsx", import.meta.url), "utf8"),
  ]);

  assert.match(page, /<RatioLab \/>/);
  assert.match(layout, /Music With No Names/);
  assert.doesNotMatch(layout, /Starter Project|codex-preview/);
  assert.doesNotMatch(packageJson, /react-loading-skeleton/);
  assert.match(ratioLab, /exponentialRampToValueAtTime\(0\.14/);
  assert.match(ratioLab, /linearRampToValueAtTime\(0\.0001/);
  assert.match(ratioLab, /Playback starts only when you choose to listen/);
  assert.match(harmonyLab, /When relationships become a system/);
  assert.match(harmonyLab, /Shared harmonic basis/);
  assert.match(rhythmLab, /Time as ratio and resistance/);
  assert.match(rhythmLab, /Anchor resistance/);
  assert.match(atlasLab, /There is no universal good region/);
  assert.match(atlasLab, /preference proximity/);
  assert.match(atlasLab, /is a path, not a point/);

  await assert.rejects(access(new URL("../app/_sites-preview/", import.meta.url)));
  await assert.rejects(access(new URL("../package-lock.json", projectRoot)));
});
