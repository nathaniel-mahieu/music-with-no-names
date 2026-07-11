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

test("server-renders the guided learning product surface", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);

  const html = await response.text();
  assert.match(html, /<title>Music With No Names · Sound Labs<\/title>/i);
  assert.match(html, /Begin with relationships\. End with experience\./i);
  assert.match(html, /Music without names begins with one question/i);
  assert.match(html, /Begin with two vibrations/i);
  assert.match(html, /Build intuition by changing one factor/i);
  assert.match(html, /Hearing safety/i);
  assert.match(html, /Goodness is conditional/i);
  assert.match(html, />Start<\/button>/i);
  assert.match(html, />Ratio<\/button>/i);
  assert.match(html, />Ear<\/button>/i);
  assert.match(html, />Harmony<\/button>/i);
  assert.match(html, />Rhythm<\/button>/i);
  assert.match(html, />Journey<\/button>/i);
  assert.match(html, />Recording<\/button>/i);
  assert.match(html, />Atlas<\/button>/i);
  assert.match(html, />Personal Lens<\/button>/i);
  assert.doesNotMatch(html, /codex-preview|Your site is taking shape|react-loading-skeleton/i);
});

test("removes the disposable starter and keeps audio safety visible in source", async () => {
  const [page, layout, packageJson, guideLab, ratioLab, earLab, harmonyLab, rhythmLab, journeyLab, recordingLab, atlasLab, personalLab] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/layout.tsx", import.meta.url), "utf8"),
    readFile(new URL("../package.json", import.meta.url), "utf8"),
    readFile(new URL("../app/GuideLab.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/RatioLab.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/EarLab.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/HarmonyLab.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/RhythmLab.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/JourneyLab.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/RecordingLab.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/AtlasLab.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/PersonalLab.tsx", import.meta.url), "utf8"),
  ]);

  assert.match(page, /<RatioLab \/>/);
  assert.match(layout, /Music With No Names/);
  assert.doesNotMatch(layout, /Starter Project|codex-preview/);
  assert.doesNotMatch(packageJson, /react-loading-skeleton/);
  assert.match(guideLab, /manipulation before terminology/);
  assert.match(guideLab, /Calibrate low\. Compare briefly/);
  assert.match(ratioLab, /exponentialRampToValueAtTime\(0\.14/);
  assert.match(ratioLab, /linearRampToValueAtTime\(0\.0001/);
  assert.match(ratioLab, /Playback starts only when you choose to listen/);
  assert.match(ratioLab, /ratioShareSearch/);
  assert.match(earLab, /Separate sensory models from musical value/);
  assert.match(earLab, /modelPredictions/);
  assert.match(earLab, /humanRatings/);
  assert.match(harmonyLab, /When relationships become a system/);
  assert.match(harmonyLab, /Shared harmonic basis/);
  assert.match(harmonyLab, /Low-prime coordinates/);
  assert.match(harmonyLab, /Equal-division approximation morph/);
  assert.match(harmonyLab, /One moving voice/);
  assert.match(harmonyLab, /Contextual stability is separate/);
  assert.match(rhythmLab, /Time as ratio and resistance/);
  assert.match(rhythmLab, /Anchor resistance/);
  assert.match(journeyLab, /Musical meaning is a path through time/);
  assert.match(journeyLab, /Acoustic Microscope/);
  assert.match(journeyLab, /Expected alternatives/);
  assert.match(recordingLab, /Nothing is uploaded/);
  assert.match(recordingLab, /audio-analysis\.worker/);
  assert.match(recordingLab, /Export analysis JSON/);
  assert.match(atlasLab, /There is no universal good region/);
  assert.match(atlasLab, /preference proximity/);
  assert.match(atlasLab, /is a path, not a point/);
  assert.match(personalLab, /predicted fit for this listener and goal/);
  assert.match(personalLab, /localStorage/);
  assert.match(personalLab, /Export JSON/);

  await assert.rejects(access(new URL("../app/_sites-preview/", import.meta.url)));
  await assert.rejects(access(new URL("../package-lock.json", projectRoot)));
});
