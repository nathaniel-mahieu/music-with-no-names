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
  assert.match(html, /Start with what you can hear and change\./i);
  assert.match(html, /Music begins with relationships you can hear/i);
  assert.match(html, /Compare two pitches/i);
  assert.match(html, /Learn by changing one thing at a time/i);
  assert.match(html, /Hearing safety/i);
  assert.match(html, /Good for whom—and for what/i);
  assert.match(html, />Start<\/button>/i);
  assert.match(html, />Ratio<\/button>/i);
  assert.match(html, />Scale<\/button>/i);
  assert.match(html, />Piano<\/button>/i);
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
  const [page, layout, packageJson, guideLab, ratioLab, scaleLab, pianoLab, earLab, harmonyLab, rhythmLab, journeyLab, recordingLab, atlasLab, personalLab, pianoModel, pianoSoundModel] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/layout.tsx", import.meta.url), "utf8"),
    readFile(new URL("../package.json", import.meta.url), "utf8"),
    readFile(new URL("../app/GuideLab.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/RatioLab.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/ScaleLab.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/PianoLab.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/EarLab.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/HarmonyLab.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/RhythmLab.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/JourneyLab.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/RecordingLab.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/AtlasLab.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/PersonalLab.tsx", import.meta.url), "utf8"),
    readFile(new URL("../lib/piano-model.ts", import.meta.url), "utf8"),
    readFile(new URL("../lib/piano-sound-model.ts", import.meta.url), "utf8"),
  ]);

  assert.match(page, /<RatioLab \/>/);
  assert.match(layout, /Music With No Names/);
  assert.doesNotMatch(layout, /Starter Project|codex-preview/);
  assert.doesNotMatch(packageJson, /react-loading-skeleton/);
  assert.match(guideLab, /change one thing, then listen/);
  assert.match(guideLab, /Calibrate low\. Compare briefly/);
  assert.match(guideLab, /Know what each number can—and cannot—tell you/);
  assert.match(guideLab, /Can you tell what changed/);
  assert.match(guideLab, /That fits the model here/);
  assert.match(guideLab, /self-check, not a test of musical ability/);
  assert.match(guideLab, /firstAnswerRef\.current\?\.focus/);
  assert.match(ratioLab, /exponentialRampToValueAtTime\(SYNTH_MASTER_GAIN/);
  assert.match(ratioLab, /linearRampToValueAtTime\(0\.0001/);
  assert.match(ratioLab, /Playback starts only when you choose to listen/);
  assert.match(ratioLab, /ratioShareSearch/);
  assert.match(scaleLab, /Hear home\. Build intervals\. Predict what comes next/);
  assert.match(scaleLab, /Transposition moves every pitch together/);
  assert.match(scaleLab, /hear it in your mind first/i);
  assert.match(scaleLab, /Keep three questions separate/);
  assert.match(scaleLab, /Hear Do and /);
  assert.match(scaleLab, /makeHarmonicWave/);
  assert.match(scaleLab, /answer restored inside the phrase/);
  assert.match(scaleLab, /minor pentatonic/);
  assert.match(scaleLab, /A nearby gap does not decide what comes next/);
  assert.doesNotMatch(scaleLab, /Move Do to the next landmark/);
  assert.match(pianoLab, /Connect MIDI/);
  assert.match(pianoLab, /Attack history/);
  assert.match(pianoLab, /Interval texture/);
  assert.match(pianoLab, /No overall goodness score/);
  assert.match(pianoLab, /near-3:2 relation/);
  assert.match(pianoLab, /Chord grouping/);
  assert.match(pianoLab, /maximum span/);
  assert.match(pianoLab, /diamonds summarize grouped chords/);
  assert.match(pianoLab, /first chord gesture sets the transition baseline/);
  assert.match(pianoLab, /already-held and pedal tones remain visible as inherited context/);
  assert.match(pianoLab, /sustain/);
  assert.match(pianoLab, /no sound, recording, or upload/i);
  assert.match(pianoLab, /No sound is generated or recorded/);
  assert.match(pianoLab, /Scale lens/);
  assert.match(pianoLab, /Assumed spectrum/);
  assert.match(pianoSoundModel, /Sine · one partial/);
  assert.match(pianoLab, /Changes:/);
  assert.match(pianoLab, /Stays fixed:/);
  assert.match(pianoLab, /no audio analysis/i);
  assert.match(pianoLab, /Live phrase ribbon/);
  assert.match(pianoLab, /Interval Echo/);
  assert.match(pianoLab, /Causal chord view/);
  assert.match(pianoLab, /pianoSoundVoice/);
  assert.match(pianoLab, /Start new chord/);
  assert.match(pianoLab, /sessionStorage/);
  assert.match(pianoLab, /60-second phrase memory/);
  assert.match(pianoLab, /phraseSnapshots/);
  assert.match(pianoLab, /Voice-leading coach/);
  assert.match(pianoLab, /Silent ghost targets/);
  assert.match(pianoLab, /silent chord target/);
  assert.match(pianoLab, /silent resolution target/);
  assert.match(pianoLab, /Scale fingerprint \+ tonal gravity/);
  assert.match(pianoLab, /Resolution forks/);
  assert.match(pianoLab, /Duration \+ articulation lane/);
  assert.match(pianoLab, /Motif transformation trail/);
  assert.match(pianoLab, /repeat → change one property → return/);
  assert.match(pianoLab, /blue source · gold later statement · exact · transposed · rhythm changed · ending changed · return/);
  assert.match(pianoLab, /Playable landmark paths/);
  assert.match(pianoLab, /HUD advances only after an exact pitch-class match in any octave/);
  assert.match(pianoLab, /Generated · silent · transposable/);
  assert.match(pianoLab, /same relationships, more embodied/);
  assert.match(pianoLab, /silent landmark path target/);
  assert.match(pianoLab, /Personal character map/);
  assert.match(pianoLab, /Listener-reported · local · uncertain/);
  assert.match(pianoLab, /The map never derives emotion, liking, or familiarity from MIDI/);
  assert.match(pianoLab, /dot size = reported liking/);
  assert.match(pianoLab, /measured from MIDI/);
  assert.match(pianoLab, /modeled from assumptions/);
  assert.match(pianoLab, /reported by you/);
  assert.match(pianoLab, /same relationship signature/);
  assert.match(pianoModel, /Pop loop/);
  assert.match(pianoModel, /Blues cycle/);
  assert.match(pianoModel, /Classical cadence/);
  assert.match(pianoModel, /Pedal point/);
  assert.match(pianoModel, /no song or recording is reproduced/i);
  assert.match(pianoLab, /Route fit \+ held time \+ recurrence \+ attack \+ low register \+ ending · named candidates were sounded/);
  assert.match(pianoLab, /No note was entered or sounded/);
  assert.match(pianoLab, /setResolutionForkSet\(resolutionForkSet \?\? nextNoteForks\)/);
  assert.match(pianoLab, /pianoLens/);
  assert.doesNotMatch(pianoLab, /placeNearbyChord/);
  assert.match(ratioLab, /labFromSearch/);
  assert.match(ratioLab, /searchParams\.set\("lab", lab\)/);
  assert.match(pianoLab, /tonal pull, arrival evidence/);
  assert.doesNotMatch(pianoLab, /AudioContext|createOscillator|synth\.enable/);
  assert.match(earLab, /Hear how timbre, register, and level change an interval/);
  assert.match(earLab, /modelPredictions/);
  assert.match(earLab, /humanRatings/);
  assert.match(earLab, /Controlled auditory A\/B experiments/);
  assert.match(earLab, /Fusion hypothesis/);
  assert.match(harmonyLab, /Change one voice\. Hear the whole harmony shift/);
  assert.match(harmonyLab, /Shared harmonic basis/);
  assert.match(harmonyLab, /Low-prime coordinates/);
  assert.match(harmonyLab, /Equal-division approximation morph/);
  assert.match(harmonyLab, /One moving voice/);
  assert.match(harmonyLab, /From vibration to felt possibility/);
  assert.match(harmonyLab, /Conditional affordances/);
  assert.match(harmonyLab, /Emotion is not inside a ratio/);
  assert.match(harmonyLab, /three to six pitches together/);
  assert.match(harmonyLab, /Add source/);
  assert.match(rhythmLab, /Build a pattern, then feel it at different speeds/);
  assert.match(rhythmLab, /Anchor resistance/);
  assert.match(rhythmLab, /Competing pulse hypotheses/);
  assert.match(rhythmLab, /Transparent syncopation/);
  assert.match(rhythmLab, /Embodied pulse input/);
  assert.match(journeyLab, /Follow a phrase as it repeats, changes, and returns/);
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
  assert.match(atlasLab, /Compare musical paths, not quality scores/);
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
  assert.match(personalLab, /Live Piano phrase reports/);
  assert.match(personalLab, /Open live phrase map/);

  await assert.rejects(access(new URL("../app/_sites-preview/", import.meta.url)));
  await assert.rejects(access(new URL("../package-lock.json", projectRoot)));
});
