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
  assert.match(html, /More learning labs/i);
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
  const [scaleGenerator, scaleGeneratorModel] = await Promise.all([
    readFile(new URL("../app/ScaleGeneratorExplainer.tsx", import.meta.url), "utf8"),
    readFile(new URL("../lib/scale-generator-model.ts", import.meta.url), "utf8"),
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
  assert.match(ratioLab, /v1\.98/);
  assert.match(scaleLab, /Hear home\. Build intervals\. Generate scales\. Predict what comes next/);
  assert.match(scaleLab, /Transposition moves every pitch together/);
  assert.match(scaleLab, /hear it in your mind first/i);
  assert.match(scaleLab, /Keep three questions separate/);
  assert.match(scaleLab, /Hear Do and /);
  assert.match(scaleLab, /makeHarmonicWave/);
  assert.match(scaleLab, /answer restored inside the phrase/);
  assert.match(scaleLab, /minor pentatonic/);
  assert.match(scaleLab, /A nearby gap does not decide what comes next/);
  assert.match(scaleLab, /Stack scale degrees into three-note shapes/);
  assert.match(scaleLab, /fourth-stacks, inversions, and equal divisions/);
  assert.match(scaleLab, /does not predict emotion, goodness, or a required resolution/);
  assert.match(scaleLab, /<ScaleGeneratorExplainer/);
  assert.match(scaleGenerator, /Old Sol becomes new Do/);
  assert.match(scaleGenerator, /7 × 7 = 49 ≡ 1 mod 12/);
  assert.match(scaleGenerator, /full \+7 orbit is chromatic/);
  assert.match(scaleGenerator, /not a complete map of harmony or musical meaning/);
  assert.match(scaleGeneratorModel, /generatorOrbit/);
  assert.match(scaleGeneratorModel, /fifthShiftProfile/);
  assert.match(scaleGeneratorModel, /Harmonic minor/);
  assert.match(scaleGeneratorModel, /Whole-tone/);
  assert.match(scaleGeneratorModel, /PYTHAGOREAN_COMMA_CENTS/);
  assert.doesNotMatch(scaleLab, /Move Do to the next landmark/);
  assert.match(pianoLab, /Connect MIDI/);
  assert.match(pianoLab, /Attack history/);
  assert.match(pianoLab, /Interval texture/);
  assert.match(pianoLab, /Where partials meet/);
  assert.match(pianoLab, /pianoPartialInteraction/);
  assert.match(pianoLab, /comparePianoPartialInteractions/);
  assert.match(pianoLab, /What could this one-key change do to partial interaction\?/);
  assert.match(pianoLab, /comparePhraseEndingRipple/);
  assert.match(pianoLab, /one changed ending · every connected relationship/);
  assert.match(pianoLab, /MIDI itself contains no partials or instrument audio/);
  assert.match(pianoLab, /Neither output measures musical goodness/);
  assert.match(pianoLab, /No overall goodness score/);
  assert.match(pianoLab, /near 3:2/);
  assert.match(pianoLab, /Chord grouping/);
  assert.match(pianoLab, /maximum span/);
  assert.match(pianoLab, /diamonds summarize grouped chords/);
  assert.match(pianoLab, /first chord gesture sets the transition baseline/);
  assert.match(pianoLab, /Inherited held or pedal notes begin included/);
  assert.match(pianoLab, /Reading changes · MIDI field stays/);
  assert.match(pianoLab, /selected-spectrum crunch model remain unchanged; MIDI contains no acoustic roughness measurement/);
  assert.match(pianoLab, /excluded from the chord reading but remain in the audible texture/);
  assert.match(pianoLab, /membershipCorrections/);
  assert.match(pianoModel, /interpretedChordNotes/);
  assert.match(pianoLab, /sustain/);
  assert.match(pianoLab, /nothing is recorded or uploaded/i);
  assert.match(pianoLab, /No sound is generated or recorded/);
  assert.match(pianoLab, /Scale lens/);
  assert.match(pianoLab, /How to select a route/);
  assert.match(pianoLab, /Choose a new route/);
  assert.match(pianoLab, /Assumed spectrum/);
  assert.match(pianoSoundModel, /Sine · one partial/);
  assert.match(pianoSoundModel, /alignedPairs/);
  assert.match(pianoSoundModel, /interactionPairs/);
  assert.match(pianoLab, /Changes:/);
  assert.match(pianoLab, /Stays fixed:/);
  assert.match(pianoLab, /no audio analysis/i);
  assert.match(pianoLab, /Live phrase ribbon/);
  assert.match(pianoLab, /Same spacing, different context/);
  assert.match(pianoLab, /Same spacing—now inspect what changed around it/);
  assert.match(pianoLab, /A matched spacing preserves one relationship—not its melodic or harmonic job/);
  assert.match(pianoLab, /Optional interval network and assumed-partial microscope/);
  assert.match(pianoLab, /Reflect on source \+ echo/);
  assert.match(pianoLab, /The exact source and replay are frozen together/);
  assert.match(pianoLab, /Use whole live phrase/);
  assert.match(pianoLab, /this source-and-echo comparison/);
  assert.match(pianoLab, /What changed between these chords\?/);
  assert.match(pianoLab, /Reflect on chord change/);
  assert.match(pianoLab, /The exact two grouped gestures are frozen together/);
  assert.match(pianoLab, /Save this chord-change report/);
  assert.match(pianoLab, /One live phrase · one chord question/);
  assert.match(pianoLab, /What survives when the hand shape changes\?/);
  assert.match(pianoLab, /compareChordVoicingEcho/);
  assert.match(pianoLab, /same pitch-class set · new bass role/);
  assert.match(pianoLab, /Reflect on source \+ voicing/);
  assert.match(pianoLab, /The exact source and revoicing gestures are frozen together/);
  assert.match(pianoLab, /Save this voicing report/);
  assert.match(pianoLab, /Can this entire chord change survive elsewhere\?/);
  assert.match(pianoLab, /compareChordMotionEcho/);
  assert.match(pianoLab, /same two-field move · both fields shifted/);
  assert.match(pianoLab, /Both chord types returned, but they did not share one transposition/);
  assert.match(pianoLab, /Reflect on source \+ replayed move/);
  assert.match(pianoLab, /The exact two source fields and two replay fields are frozen together/);
  assert.match(pianoLab, /Save this chord-move report/);
  assert.match(pianoLab, /compareIntervalEcho/);
  assert.match(pianoLab, /What did this attack change\?/);
  assert.match(pianoLab, /Exactly one MIDI member entered/);
  assert.match(pianoLab, /reports snapshots without inventing a one-note cause/);
  assert.match(pianoLab, /No lens is averaged into similarity, correctness, emotion, listenability, or musical goodness/);
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
  assert.match(pianoLab, /Scale relationships with your hands/);
  assert.match(pianoLab, /Build an unnamed scale/);
  assert.match(pianoLab, /Reveal theory translations/);
  assert.match(pianoLab, /evaluatePerformedScaleFingerprint/);
  assert.match(pianoLab, /matchScaleFingerprint/);
  assert.match(pianoLab, /What makes a pitch feel like home/);
  assert.match(pianoLab, /Open center microscope/);
  assert.match(pianoLab, /tonalGravityCounterfactual/);
  assert.match(pianoLab, /Route fit and the other four performed cues stayed numerically identical/);
  assert.match(pianoLab, /Choose one thing to change/);
  assert.match(pianoLab, /One change, traced through five lenses/);
  assert.match(pianoLab, /Choose one phrase change to investigate/);
  assert.match(pianoLab, /The intended coordinate moved/);
  assert.match(pianoLab, /Control preserved/);
  assert.match(pianoLab, /does not decide whether either phrase is better/);
  assert.match(pianoModel, /comparePhraseLenses/);
  assert.match(pianoModel, /phraseChangeProfile/);
  assert.doesNotMatch(pianoModel, /PhraseLensComparison[\s\S]{0,900}(goodness|liking|emotion)/i);
  assert.match(pianoLab, /Why the fifths circle is first a spiral/);
  assert.match(pianoLab, /what is gained—and changed—when a pure relationship is adjusted/);
  assert.match(pianoLab, /Stack pure 3:2 moves/);
  assert.match(pianoLab, /Apply equal-temperament correction/);
  assert.match(pianoLab, /Make .* movable Do/);
  assert.match(pianoLab, /pianoDo/);
  assert.match(pianoLab, /Resolution forks/);
  assert.match(pianoLab, /Duration \+ articulation lane/);
  assert.match(pianoLab, /Motif transformation trail/);
  assert.match(pianoLab, /repeat → change one property → return/);
  assert.match(pianoLab, /blue source · gold later statement · exact · transposed · rhythm changed · ending changed · return/);
  assert.match(pianoLab, /Playable landmark paths/);
  assert.match(pianoLab, /HUD advances only after an exact pitch-class match in any octave/);
  assert.match(pianoLab, /Generated · silent · transposable/);
  assert.match(pianoLab, /Same route completed from two centers/);
  assert.match(pianoLab, /Move to fifths neighbor/);
  assert.match(pianoLab, /field order, roles, root offsets, and internal pitch-class shapes/);
  assert.match(pianoLab, /compact voicings may move individual keys differently/);
  assert.match(pianoLab, /landmarkTranspositionProfile/);
  assert.match(pianoLab, /setLandmarkStepIndex\(0\)/);
  assert.match(pianoLab, /One route completed with exactly one changed key/);
  assert.match(pianoLab, /Original versus one-key path comparison across five lenses/);
  assert.match(pianoLab, /Which path felt more directed/);
  assert.match(pianoLab, /No modeled lane fills this answer/);
  assert.match(pianoModel, /voiceLandmarkCounterfactual/);
  assert.match(pianoModel, /Keeps every authored target fixed except one declared MIDI-key move/);
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
  assert.match(pianoLab, /Walk one octave by its gaps/);
  assert.match(pianoLab, /begin on Do in any octave/);
  assert.match(pianoLab, /Progress stays here/);
  assert.match(pianoLab, /frequency doubled/);
  assert.match(pianoLab, /evaluateAscendingScaleWalk/);
  assert.match(pianoLab, /scaleWalkSession/);
  assert.match(pianoLab, /Change one note inside the whole/);
  assert.match(pianoLab, /Nothing here plays or enters an answer/);
  assert.match(pianoLab, /More than one note changed/);
  assert.match(pianoLab, /conditional felt possibility/);
  assert.match(pianoLab, /This is an invitation to listen, not an emotion prediction/);
  assert.match(pianoLab, /controlledSonorityChange/);
  assert.match(pianoLab, /sonorityAffordances/);
  assert.match(pianoLab, /controlledSonoritySession/);
  assert.match(pianoLab, /replayRequired/);
  assert.match(pianoLab, /The comparison stays paused until the exact baseline is sounding/);
  assert.match(pianoLab, /Where did each attack land/);
  assert.match(pianoLab, /Repeat any one key four times/);
  assert.match(pianoLab, /livePulseMirror/);
  assert.match(pianoLab, /closest to.*phaseLabel/);
  assert.match(pianoLab, /not timing accuracy, notation, meter, swing, groove quality, or musical goodness/);
  assert.match(pianoLab, /One phrase · one motion question/);
  assert.match(pianoLab, /pianoMotion/);
  assert.match(pianoLab, /setResolutionForkSet\(resolutionForkSet \?\? nextNoteForks\)/);
  assert.match(pianoLab, /pianoLens/);
  assert.doesNotMatch(pianoLab, /placeNearbyChord/);
  assert.match(ratioLab, /labFromSearch/);
  assert.match(ratioLab, /searchParams\.set\("lab", lab\)/);
  assert.match(pianoLab, /tonal pull, arrival evidence/);
  assert.doesNotMatch(pianoLab, /AudioContext|createOscillator|synth\.enable/);
  assert.match(earLab, /Keep the relationship\. Change the imagined sound/);
  assert.match(earLab, /Which conclusions survive when only the assumed sound changes/);
  assert.match(earLab, /Five separate lenses for this interval and its assumed sounds/);
  assert.match(earLab, /Explore the generated hearing instrument/);
  assert.match(earLab, /modelPredictions/);
  assert.match(earLab, /humanRatings/);
  assert.match(earLab, /Controlled auditory A\/B experiments/);
  assert.match(earLab, /Fusion hypothesis/);
  assert.match(harmonyLab, /Watch one field become another/);
  assert.match(harmonyLab, /What changed when your hands moved to the next harmony/);
  assert.match(harmonyLab, /Five separate evidence lenses for the chord change/);
  assert.match(harmonyLab, /Explore the generated harmonic-field instrument/);
  assert.match(harmonyLab, /Shared harmonic basis/);
  assert.match(harmonyLab, /Low-prime coordinates/);
  assert.match(harmonyLab, /Equal-division approximation morph/);
  assert.match(harmonyLab, /One moving voice/);
  assert.match(harmonyLab, /From vibration to felt possibility/);
  assert.match(harmonyLab, /Conditional affordances/);
  assert.match(harmonyLab, /Emotion is not inside a ratio/);
  assert.match(harmonyLab, /your chord change through five lenses/);
  assert.match(harmonyLab, /Add source/);
  assert.match(rhythmLab, /See the timing shape before naming the beat/);
  assert.match(rhythmLab, /Anchor resistance/);
  assert.match(rhythmLab, /Competing pulse hypotheses/);
  assert.match(rhythmLab, /Transparent syncopation/);
  assert.match(rhythmLab, /Embodied pulse input/);
  assert.match(rhythmLab, /What remains when every pitch becomes the same point/);
  assert.match(rhythmLab, /median onset gap · not a detected beat/);
  assert.match(rhythmLab, /Replay these gaps on new keys/);
  assert.match(journeyLab, /See expectation emerge from what your hands repeat/);
  assert.match(journeyLab, /Acoustic Microscope/);
  assert.match(journeyLab, /Expected alternatives/);
  assert.match(journeyLab, /Self-similarity across events/);
  assert.match(journeyLab, /Before uncertainty, after surprise/);
  assert.match(journeyLab, /Matches my listening/);
  assert.match(journeyLab, /Exact repeat/);
  assert.match(journeyLab, /Whole-arc satisfaction/);
  assert.match(journeyLab, /Teach my model/);
  assert.match(journeyLab, /Where did your phrase teach itself what might come next/);
  assert.match(journeyLab, /What changed at the latest group/);
  assert.match(journeyLab, /Extend or replay this phrase/);
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
