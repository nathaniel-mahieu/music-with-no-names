"use client";

import { useMemo, useState } from "react";
import {
  CONVENTIONAL_PITCH_CLASSES,
  pitchClassFromMidi,
  type PianoScale,
} from "@/lib/piano-model";
import {
  DIATONIC_MODES,
  MAJOR_SCALE_OFFSETS,
  MAJOR_SCALE_SOLFEGE,
  majorDegreeContextProfile,
  majorDegreeForRelativeSemitones,
  majorScaleLandscape,
  physicalScaleGravityWindowOffset,
  recognizeMajorHarmonyContext,
  relativeSemitonesFromDo,
  rotateMajorMode,
  scaleGravityJourney,
  type MajorHarmonyContextId,
} from "@/lib/piano-scale-gravity-model";

type ScaleGravityEvent = {
  id: number;
  note: number;
  onsetMs: number;
  fieldNotes: number[];
};

type PianoScaleGravityHudProps = {
  events: ScaleGravityEvent[];
  activeNotes: number[];
  doMidi: number;
  scale: PianoScale;
  showConventions: boolean;
};

const CONTEXT_DEGREES: Record<MajorHarmonyContextId, string> = {
  IV: "4 · 6 · 1",
  V: "5 · 7 · 2",
  I: "1 · 3 · 5",
};

const DEGREE_PROMPTS = [
  "Compare the same note as IV's fifth, V's fourth, and I's root. Does arrival come from the pitch, the harmony, or both?",
  "One musician hears degree 2 as floating or pastel—neither settled nor sharply tense. Treat that as a listening prompt, then test your own hearing.",
  "Hear the major-seventh rub over IV, then notice the unchanged note become I's chordal third. Resolution can happen while the held pitch does not move.",
  "Compare degree 4 as IV's root, outside the plain V triad, and above I as an eleventh or fourth.",
  "Compare one fixed pillar as IV's ninth, V's root, and I's fifth. Chord context changes its role without moving it.",
  "Hear degree 6 as IV's third, V's ninth, and I's thirteenth or sixth; then decide which descriptions fit your ear.",
  "Hear degree 7 inside V as its third, then notice the one-semitone path to 1. The tendency is common in tonal styles, not compulsory.",
] as const;

function formatSigned(value: number) {
  return value > 0 ? `+${value}` : String(value);
}

function pitchNameForOffset(doMidi: number, offset: number) {
  return CONVENTIONAL_PITCH_CLASSES[(pitchClassFromMidi(doMidi) + offset) % 12];
}

function degreeLabel(degree: number, doMidi: number, showConventions: boolean) {
  const solfege = MAJOR_SCALE_SOLFEGE[degree - 1];
  return showConventions ? `${solfege} · ${pitchNameForOffset(doMidi, MAJOR_SCALE_OFFSETS[degree - 1])}` : solfege;
}

export function PianoScaleGravityHud({ events, activeNotes, doMidi, scale, showConventions }: PianoScaleGravityHudProps) {
  const [pinnedDegree, setPinnedDegree] = useState<number | null>(null);
  const [selectedContext, setSelectedContext] = useState<MajorHarmonyContextId>("IV");
  const [modeHomeDegree, setModeHomeDegree] = useState(1);
  const landscape = useMemo(() => majorScaleLandscape(), []);
  const journey = useMemo(() => scaleGravityJourney(events, doMidi, 5), [doMidi, events]);
  const latest = events.at(-1) ?? null;
  const latestPhysicalOffset = latest ? latest.note - doMidi : null;
  const latestWindowOffset = latest ? physicalScaleGravityWindowOffset(latest.note, doMidi) : null;
  const latestRelative = latest ? relativeSemitonesFromDo(latest.note, doMidi) : null;
  const latestDegree = latestRelative == null ? null : majorDegreeForRelativeSemitones(latestRelative);
  const latestRouteEvent = useMemo(() => [...events].reverse().find((event) => majorDegreeForRelativeSemitones(relativeSemitonesFromDo(event.note, doMidi)) != null) ?? null, [doMidi, events]);
  const latestRouteDegree = latestRouteEvent == null ? null : majorDegreeForRelativeSemitones(relativeSemitonesFromDo(latestRouteEvent.note, doMidi));
  const heldDegree = pinnedDegree ?? latestRouteDegree ?? 1;
  const profile = useMemo(() => majorDegreeContextProfile(heldDegree), [heldDegree]);
  const selectedReading = profile.find((reading) => reading.context.id === selectedContext)!;
  const mode = useMemo(() => rotateMajorMode(modeHomeDegree), [modeHomeDegree]);
  const activePhysicalOffsets = useMemo(() => new Set(activeNotes.map((note) => physicalScaleGravityWindowOffset(note, doMidi)).filter((offset): offset is number => offset != null)), [activeNotes, doMidi]);
  const recentCounts = useMemo(() => {
    const counts = new Map<number, number>();
    events.forEach((event) => {
      const offset = physicalScaleGravityWindowOffset(event.note, doMidi);
      if (offset == null) return;
      counts.set(offset, (counts.get(offset) ?? 0) + 1);
    });
    return counts;
  }, [doMidi, events]);
  const activeContext = activeNotes.length ? recognizeMajorHarmonyContext(activeNotes, doMidi) : null;
  const capturedContext = latest?.fieldNotes.length ? recognizeMajorHarmonyContext(latest.fieldNotes, doMidi) : null;
  const doPitchName = CONVENTIONAL_PITCH_CLASSES[pitchClassFromMidi(doMidi)];
  const heldLabel = degreeLabel(heldDegree, doMidi, showConventions);
  const routeAligned = scale.id === "bright-seven";
  const heldSource = pinnedDegree != null ? "pinned" : latestRouteDegree != null ? "follows last route note" : "default reference";
  const fieldStatus = activeNotes.length
    ? activeContext ? `matches ${activeContext} triad core · sounding now` : "sounding field has no complete I · IV · V triad match"
    : capturedContext ? `latest captured field matched ${capturedContext} · no keys sounding` : "no keys sounding · no captured I · IV · V triad match";
  const nearestToneSummary = selectedReading.nearestChordTones
    .map((tone) => `${tone.role} ${formatSigned(tone.signedSemitones)} st`)
    .join(" · ");

  return <section className="piano-scale-gravity-hud" aria-labelledby="piano-scale-gravity-title">
    <header className="piano-scale-gravity-intro">
      <div>
        <span>Scale Gravity HUD · practitioner-derived ear-training landscape</span>
        <h3 id="piano-scale-gravity-title">Hold one location. Let harmony move underneath.</h3>
        <p>A composer’s choir warm-up becomes a live map: degree position stays fixed while IV, V, and I change its chord role. Semitone geometry is exact; tendency and color remain things to test by listening.</p>
      </div>
      <dl aria-label="Scale Gravity HUD coordinates">
        <div><dt>major frame</dt><dd>Do = {showConventions ? doPitchName : "selected Do"} · 2–2–1–2–2–2–1</dd></div>
        <div><dt>held location</dt><dd>degree {heldDegree} · {heldLabel} · {heldSource}</dd></div>
        <div><dt>latest attack</dt><dd>{latestPhysicalOffset == null ? "none yet" : `${formatSigned(latestPhysicalOffset)} st from selected Do · ${latestDegree == null ? "outside major frame" : `degree ${latestDegree} after octave fold`}`}</dd></div>
        <div><dt>sounding field</dt><dd>{fieldStatus} · {events.length}/12 attacks</dd></div>
      </dl>
    </header>

    <section className="piano-scale-gravity-runway" aria-labelledby="piano-scale-gravity-runway-title">
      <header>
        <div><span>12-semitone runway</span><strong id="piano-scale-gravity-runway-title">Whole steps leave a slot. Half steps touch.</strong></div>
        <button type="button" aria-pressed={pinnedDegree == null} onClick={() => setPinnedDegree(null)}>Follow latest route note</button>
      </header>
      <div className="piano-scale-gravity-slots" role="group" aria-label={`Major-scale locations from selected Do ${showConventions ? doPitchName : ""}. Thirteen displayed slots include the octave copy.`}>
        {Array.from({ length: 13 }, (_, offset) => {
          const node = landscape.find((candidate) => candidate.semitonesFromDo === offset) ?? null;
          const foldedOffset = offset % 12;
          const count = recentCounts.get(offset) ?? 0;
          const latestHere = latestWindowOffset === offset;
          const sounding = activePhysicalOffsets.has(offset);
          const modeHome = node && !node.octaveCopy && node.degree === modeHomeDegree;
          if (!node) return <div key={offset} className={["piano-scale-gravity-slot", "is-chromatic", latestHere ? "is-latest" : "", sounding ? "is-sounding" : "", count ? "is-recent" : ""].filter(Boolean).join(" ")} role="img" aria-label={`+${offset} semitones from Do, outside the major frame${latestHere ? ", latest attack" : ""}${sounding ? ", sounding" : ""}${count ? `, ${count} recent attack${count === 1 ? "" : "s"}` : ""}`}>
            <small>+{offset}</small><i aria-hidden="true" />{count ? <b>×{count}</b> : null}
          </div>;
          const visibleName = showConventions ? pitchNameForOffset(doMidi, foldedOffset) : node.solfege;
          const nodeClasses = ["piano-scale-gravity-slot", "is-degree", heldDegree === node.degree ? "is-held" : "", latestHere ? "is-latest" : "", sounding ? "is-sounding" : "", count ? "is-recent" : "", modeHome ? "is-mode-home" : "", node.halfStepAfter ? "has-half-step-after" : "", node.octaveCopy ? "is-octave-copy" : ""].filter(Boolean).join(" ");
          if (node.octaveCopy) return <div key={offset} className={nodeClasses} role="img" aria-label={`Octave copy of degree 1, twelve semitones from Do${heldDegree === 1 ? ", held degree" : ""}${latestHere ? ", latest attack" : ""}${sounding ? ", sounding" : ""}${count ? `, ${count} recent attack${count === 1 ? "" : "s"}` : ""}`}><small>+12</small><strong>1′</strong><span>{visibleName}</span>{count ? <b>×{count}</b> : null}</div>;
          return <div key={offset} className={nodeClasses} role="img" aria-label={`Degree ${node.degree}, ${visibleName}, +${offset} semitones from Do, nominal 12-TET ratio ${node.nominalRatio.toFixed(4)} to 1${heldDegree === node.degree ? ", held degree" : ""}${latestHere ? ", latest attack" : ""}${sounding ? ", sounding" : ""}${count ? `, ${count} recent attacks` : ""}${modeHome ? `, ${DIATONIC_MODES[modeHomeDegree - 1].name} home marker` : ""}`}>
            <small>+{offset}</small><strong>{node.degree}</strong><span>{visibleName}</span>{count ? <b>×{count}</b> : null}{node.halfStepAfter ? <i>½</i> : null}
          </div>;
        })}
      </div>
      <div className="piano-scale-gravity-degree-picker" role="group" aria-label="Pin one held major-scale degree">
        <span>hold degree</span>
        {landscape.filter((node) => !node.octaveCopy).map((node) => <button key={node.degree} type="button" aria-pressed={pinnedDegree === node.degree} aria-current={heldDegree === node.degree ? "true" : undefined} onClick={() => setPinnedDegree(node.degree)}>{node.degree} · {degreeLabel(node.degree, doMidi, showConventions)}</button>)}
      </div>
      <div className="piano-scale-gravity-runway-key" aria-label="Runway mark key"><span><i className="is-held" aria-hidden="true" />held degree</span><span><i className="is-latest" aria-hidden="true" />latest</span><span><i className="is-sounding" aria-hidden="true" />sounding</span><span><i className="is-mode-home" aria-hidden="true" />re-heard home</span><span><b>½</b> one-semitone gate</span></div>
      <p className="piano-scale-gravity-runway-boundary">This runway is an exact physical window from selected Do to Do′: only attacks between 0 and +12 semitones mark it. Scale-degree names fold octave copies; the recent path keeps each unfolded key-to-key move.</p>
      <div className="piano-scale-gravity-journey" aria-label="Most recent five-note scale journey">
        <span>recent path</span>
        {journey.length ? <ol>{journey.map((step, index) => <li key={`${events.at(-journey.length + index)?.id ?? index}-${step.note}`} className={step.degree == null ? "is-chromatic" : ""}>
          {step.physicalMoveFromPrevious == null ? null : <small>{formatSigned(step.physicalMoveFromPrevious)} st</small>}
          <strong>{step.degree == null ? `+${step.relativeSemitones}` : step.degree}</strong>
          <em>{step.solfege ?? "chromatic"}</em>
        </li>)}</ol> : <p>Play into the landscape; exact unfolded key movement will connect the newest five attacks.</p>}
      </div>
    </section>

    <section className="piano-scale-gravity-harmony" aria-labelledby="piano-scale-gravity-harmony-title">
      <header><span>Held degree × moving harmony</span><h4 id="piano-scale-gravity-harmony-title">IV → V → I context profile</h4><p>The held pitch does not move. Only the chord beneath it changes.</p></header>
      <div className="piano-scale-gravity-contexts" role="group" aria-label={`Choose harmony beneath held degree ${heldDegree}`}>
        {profile.map((reading) => <button key={reading.context.id} type="button" aria-pressed={selectedContext === reading.context.id} className={[reading.isChordTone ? "is-chord-tone" : "", reading.nearestDistance === 1 ? "is-semitone-neighbor" : "", activeContext === reading.context.id ? "is-live-match" : "", !activeNotes.length && capturedContext === reading.context.id ? "is-captured-match" : ""].filter(Boolean).join(" ")} onClick={() => setSelectedContext(reading.context.id)}>
          <span>{reading.context.id}{activeContext === reading.context.id ? " · sounding now" : !activeNotes.length && capturedContext === reading.context.id ? " · last captured" : ""}</span>
          <strong>{CONTEXT_DEGREES[reading.context.id]}</strong>
          <b>{reading.intervalName}</b>
          <small>{reading.isChordTone ? `inside triad · ${reading.triadRole}` : `outside triad · nearest ${reading.nearestDistance} st`}</small>
        </button>)}
      </div>
      <div className="piano-scale-gravity-reading" aria-live="polite">
        <div><span>Exact structure</span><strong>degree {heldDegree} over {selectedContext} · {selectedReading.structureCue}</strong><small>{selectedReading.isChordTone ? `The held note is the ${selectedReading.triadRole}.` : `${selectedReading.nearestChordTones.length > 1 ? "Equally nearest triad tones" : "Nearest triad tone"}: ${nearestToneSummary}.`}</small></div>
        <div><span>Style-bound tendency</span><strong>{selectedReading.commonPracticeCue}</strong></div>
        <div><span>Listening prompt</span><strong>{DEGREE_PROMPTS[heldDegree - 1]}</strong></div>
      </div>
    </section>

    <section className="piano-scale-gravity-mode" aria-labelledby="piano-scale-gravity-mode-title">
      <div>
        <span>Same collection · a newly established home</span>
        <h4 id="piano-scale-gravity-mode-title">Re-hear the seven notes as a mode</h4>
      </div>
      <label htmlFor="piano-scale-gravity-mode-home"><span>Hear parent-major degree as new 1</span><select id="piano-scale-gravity-mode-home" value={modeHomeDegree} onChange={(event) => setModeHomeDegree(Number(event.target.value))}>{DIATONIC_MODES.map((candidate) => <option key={candidate.parentHomeDegree} value={candidate.parentHomeDegree}>{candidate.parentHomeDegree} · {candidate.name}</option>)}</select></label>
      <div className="piano-scale-gravity-mode-reading" role="status" aria-live="polite"><strong>{mode.modeName} · {mode.parallelDifference}</strong><span>parent degrees {mode.parentDegreeOrder.join(" → ")}</span><code>{mode.steps.join("–")} semitones</code></div>
      <ol aria-label={`${mode.modeName} degree remapping`}>{mode.parentDegreeOrder.slice(0, 7).map((parentDegree, index) => <li key={`${mode.modeName}-${parentDegree}`} className={index === 0 ? "is-home" : ""}><span>new {index + 1}</span><strong>parent {parentDegree}</strong></li>)}</ol>
      <p>This moves a listening frame, not the pitches or the app’s selected Do. A mode needs a heard home established through emphasis, bass, duration, repetition, or cadence; merely starting on another note does not guarantee modal hearing.</p>
    </section>

    <footer className="piano-scale-gravity-boundary">
      <p><b>What is exact:</b> major-scale offsets <code>0·2·4·5·7·9·11</code>, 12-TET interval ratio <code>2^(k/12):1</code>, chord membership, and signed MIDI-key movement.</p>
      <p><b>What is contextual:</b> “gravity,” tendency, color, floating, rub, and arrival depend on tonic frame, chord, bass, voicing, timing, tuning, timbre, style, memory, and the listener.</p>
      <p><b>Major-scale boundary:</b> this is a productive reference for diatonic Western tonal practice, not the basis of all music. Natural minor is its sixth rotation; harmonic and melodic minor, blues, pentatonic, whole-tone, octatonic, maqam, raga, and many other systems are not merely major-scale rotations.</p>
      {!routeAligned ? <p><b>Route notice:</b> the universal route selector is currently {scale.name}. This practitioner exercise deliberately keeps a major reference from the same selected Do, so its seven positions differ from that route.</p> : null}
    </footer>
  </section>;
}
