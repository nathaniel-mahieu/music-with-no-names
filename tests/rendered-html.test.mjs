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
  assert.match(html, />Scale<\/button>/i);
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
  const [page, layout, packageJson, guideLab, ratioLab, scaleLab, earLab, harmonyLab, rhythmLab, journeyLab, recordingLab, atlasLab, personalLab] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/layout.tsx", import.meta.url), "utf8"),
    readFile(new URL("../package.json", import.meta.url), "utf8"),
    readFile(new URL("../app/GuideLab.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/RatioLab.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/ScaleLab.tsx", import.meta.url), "utf8"),
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
  assert.match(guideLab, /Every number has a scope and version/);
  assert.match(guideLab, /Can you predict what the model will say/);
  assert.match(guideLab, /Reasoning holds/);
  assert.match(guideLab, /This is practice, not a grade or a participant study/);
  assert.match(guideLab, /firstAnswerRef\.current\?\.focus/);
  assert.match(ratioLab, /exponentialRampToValueAtTime\(0\.14/);
  assert.match(ratioLab, /linearRampToValueAtTime\(0\.0001/);
  assert.match(ratioLab, /Playback starts only when you choose to listen/);
  assert.match(ratioLab, /ratioShareSearch/);
  assert.match(scaleLab, /Learn the shape of a scale without note letters/);
  assert.match(scaleLab, /Move Do to the next landmark/);
  assert.match(scaleLab, /imagine before reveal/i);
  assert.match(scaleLab, /frequency interaction ≠ structural pull ≠ musical value/);
  assert.match(scaleLab, /Hear Do \+ /);
  assert.match(earLab, /Separate sensory models from musical value/);
  assert.match(earLab, /modelPredictions/);
  assert.match(earLab, /humanRatings/);
  assert.match(earLab, /Controlled auditory A\/B experiments/);
  assert.match(earLab, /Fusion hypothesis/);
  assert.match(harmonyLab, /When relationships become a system/);
  assert.match(harmonyLab, /Shared harmonic basis/);
  assert.match(harmonyLab, /Low-prime coordinates/);
  assert.match(harmonyLab, /Equal-division approximation morph/);
  assert.match(harmonyLab, /One moving voice/);
  assert.match(harmonyLab, /From vibration to felt possibility/);
  assert.match(harmonyLab, /Conditional affordances/);
  assert.match(harmonyLab, /Emotion is not inside a ratio/);
  assert.match(harmonyLab, /three to six simultaneous sources/);
  assert.match(harmonyLab, /Add source/);
  assert.match(rhythmLab, /Time as ratio and resistance/);
  assert.match(rhythmLab, /Anchor resistance/);
  assert.match(rhythmLab, /Competing pulse hypotheses/);
  assert.match(rhythmLab, /Transparent syncopation/);
  assert.match(rhythmLab, /Embodied pulse input/);
  assert.match(journeyLab, /Musical meaning is a path through time/);
  assert.match(journeyLab, /Acoustic Microscope/);
  assert.match(journeyLab, /Expected alternatives/);
  assert.match(journeyLab, /Self-similarity across events/);
  assert.match(journeyLab, /Before uncertainty, after surprise/);
  assert.match(journeyLab, /Matches my listening/);
  assert.match(journeyLab, /Exact repeat/);
  assert.match(journeyLab, /Whole-arc satisfaction/);
  assert.match(journeyLab, /Teach my model/);
  assert.match(journeyLab, /Audible counterfactual A\/B/);
  assert.match(journeyLab, /Blind calibration/);
  assert.match(recordingLab, /Nothing is uploaded/);
  assert.match(recordingLab, /audio-analysis\.worker/);
  assert.match(recordingLab, /Export analysis JSON/);
  assert.match(recordingLab, /Follow microscope/);
  assert.match(recordingLab, /Partial-collision hypothesis/);
  assert.match(recordingLab, /Local performance diagnostics/);
  assert.match(atlasLab, /There is no universal good region/);
  assert.match(atlasLab, /preference proximity/);
  assert.match(atlasLab, /is a path, not a point/);
  assert.match(atlasLab, /LANDMARK_SCHEMA_VERSION/);
  assert.match(atlasLab, /Atlas interpretation layer/);
  assert.match(atlasLab, /Provenance and licensing/);
  assert.match(atlasLab, /Generated 4:5:6 harmonic field/);
  assert.match(atlasLab, /where novelty tends to live/);
  assert.match(atlasLab, /declared profiles/);
  assert.match(personalLab, /predicted fit for this listener and goal/);
  assert.match(personalLab, /localStorage/);
  assert.match(personalLab, /Export JSON/);
  assert.match(personalLab, /Transparent personal response surface/);
  assert.match(personalLab, /learnedPreferenceModel/);
  assert.match(personalLab, /Repeated listening/);

  await assert.rejects(access(new URL("../app/_sites-preview/", import.meta.url)));
  await assert.rejects(access(new URL("../package-lock.json", projectRoot)));
});
