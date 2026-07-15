"use client";

import { useEffect, useState, type CSSProperties } from "react";
import {
  CONVENTIONAL_PITCH_CLASSES,
  conventionalPitchName,
  frequencyFromMidi,
  noteContext,
  pitchClassFromMidi,
  scaleSemitones,
  tonalTendency,
  voiceLeadingProfile,
  type PianoScale,
} from "@/lib/piano-model";
import {
  PIANO_SOUND_MODELS,
  pianoSoundModel,
  type PianoSoundModelId,
} from "@/lib/piano-sound-model";
import {
  IMMERSION_VIEWBOX,
  immersionCloudBounds,
  immersionCurve,
  immersionDirectionPoint,
  immersionIntervalField,
  immersionPhraseNewness,
  immersionPitchPoint,
  immersionReleaseProvenSilence,
  immersionRoleColor,
  immersionSameNoteField,
  immersionTrail,
} from "@/lib/piano-immersion-model";

export type ImmersionHudEvent = {
  id: number;
  note: number;
  velocity: number;
  onsetMs: number;
  keyReleaseMs: number | null;
  releaseMs: number | null;
  releaseReason: "key" | "pedal" | null;
  fieldNotes: number[];
};

type ImmersionEventMeasure = {
  event: ImmersionHudEvent;
  crunch: number | null;
  pull: number;
  arrival: number;
  novelty: number;
  motion: number;
};

type ImmersionChordMeasure = {
  gesture: {
    id: string;
    attacks: ImmersionHudEvent[];
    attackedNotes: number[];
    inheritedNotes: number[];
    spreadMs: number;
    kind: "together" | "rolled";
  };
  interpretedNotes: number[];
  audibleNotes: number[];
  excludedInheritedNotes: number[];
  crunch: number | null;
  pull: number;
  novelty: number;
  motion: number;
};

type ActiveImmersionNote = {
  note: number;
  velocity: number;
  pressed: boolean;
  sustained: boolean;
};

type PianoImmersionProps = {
  events: ImmersionHudEvent[];
  phraseEvents: ImmersionHudEvent[];
  measures: ImmersionEventMeasure[];
  chordMeasures: ImmersionChordMeasure[];
  activeNotes: ActiveImmersionNote[];
  doMidi: number;
  scale: PianoScale;
  frameMode: "discover" | "locked";
  chordWindowMs: number;
  soundModelId: PianoSoundModelId;
  showConventions: boolean;
  onSoundModelChange: (value: PianoSoundModelId) => void;
};

const COSMIC_DUST = Array.from({ length: 54 }, (_, index) => ({
  x: 28 + (index * 181) % 1144,
  y: 24 + (index * 113) % 652,
  radius: 0.65 + (index % 4) * 0.42,
  opacity: 0.14 + (index % 5) * 0.055,
}));

function evidenceWord(value: number | null) {
  if (value == null) return "not available";
  if (value >= 0.67) return "high";
  if (value >= 0.34) return "moderate";
  return "low";
}

function formatHz(value: number) {
  return `${value.toFixed(value < 1000 ? 1 : 0)} Hz`;
}

function noteLabel(note: number, doMidi: number, scale: PianoScale, showConventions: boolean) {
  return showConventions ? conventionalPitchName(note) : noteContext(note, doMidi, scale).syllable;
}

function fieldCenter(notes: number[], doMidi: number) {
  const points = [...new Set(notes)].map((note) => immersionPitchPoint(note, doMidi));
  if (!points.length) return { x: IMMERSION_VIEWBOX.centerX, y: IMMERSION_VIEWBOX.centerY, radius: 190 };
  return {
    x: points.reduce((sum, point) => sum + point.x, 0) / points.length,
    y: points.reduce((sum, point) => sum + point.y, 0) / points.length,
    radius: points.reduce((sum, point) => sum + point.radius, 0) / points.length,
  };
}

function filamentPath(lower: { x: number; y: number }, upper: { x: number; y: number }) {
  const middleX = (lower.x + upper.x) / 2;
  const middleY = (lower.y + upper.y) / 2;
  const controlX = middleX + (IMMERSION_VIEWBOX.centerX - middleX) * 0.14;
  const controlY = middleY + (IMMERSION_VIEWBOX.centerY - middleY) * 0.14;
  return `M ${lower.x} ${lower.y} Q ${controlX} ${controlY} ${upper.x} ${upper.y}`;
}

export function PianoImmersion({
  events,
  phraseEvents,
  measures,
  chordMeasures,
  activeNotes,
  doMidi,
  scale,
  frameMode,
  chordWindowMs,
  soundModelId,
  showConventions,
  onSoundModelChange,
}: PianoImmersionProps) {
  const routeOffsets = scaleSemitones(scale);
  const routePitchClasses = new Set(routeOffsets.map((offset) => pitchClassFromMidi(doMidi + offset)));
  const seenPitchClasses = new Set(phraseEvents.map((event) => pitchClassFromMidi(event.note)));
  const trail = immersionTrail(phraseEvents, doMidi);
  const latestSeven = events.map((event) => ({ event, point: immersionPitchPoint(event.note, doMidi) }));
  const activeNumbers = activeNotes.map((active) => active.note);
  const latestChord = chordMeasures.at(-1) ?? null;
  const latestMeasure = measures.at(-1) ?? null;
  const latestEvent = events.at(-1) ?? null;
  const fieldNotes = activeNumbers.length
    ? activeNumbers
    : latestEvent?.fieldNotes ?? [];
  const intervalField = immersionIntervalField(fieldNotes, doMidi);
  const tendency = tonalTendency(fieldNotes, doMidi, scale);
  const fieldPoint = fieldCenter(fieldNotes, doMidi);
  const fieldCloud = immersionCloudBounds(fieldNotes, doMidi);
  const doDirection = immersionDirectionPoint(pitchClassFromMidi(doMidi), 326);
  const homeAtField = immersionDirectionPoint(pitchClassFromMidi(doMidi), fieldPoint.radius);
  const visibleClouds = chordMeasures.slice(-3).map((measure) => ({
    measure,
    bounds: immersionCloudBounds(measure.gesture.attacks.map((attack) => attack.note), doMidi),
  })).filter((entry) => entry.bounds != null);
  const previousChord = chordMeasures.at(-2) ?? null;
  const voiceProfile = previousChord && latestChord
    ? voiceLeadingProfile(previousChord.interpretedNotes, latestChord.interpretedNotes)
    : null;
  const currentModel = pianoSoundModel(soundModelId);
  const matchingChord = latestChord
    && latestEvent
    && latestChord.gesture.attacks.some((attack) => attack.id === latestEvent.id)
    && immersionSameNoteField(latestChord.audibleNotes, fieldNotes)
    ? latestChord
    : null;
  const matchingMeasure = latestMeasure && immersionSameNoteField(latestMeasure.event.fieldNotes, fieldNotes) ? latestMeasure : null;
  const currentCrunch = matchingChord?.crunch ?? matchingMeasure?.crunch ?? null;
  const phraseNewness = immersionPhraseNewness(phraseEvents);
  const latestLabel = latestEvent ? noteLabel(latestEvent.note, doMidi, scale, showConventions) : "—";
  const sampleInterval = intervalField.links[0] ?? null;
  const samplingReading = intervalField.omittedLinkCount
    ? ` ${intervalField.links.length} of ${intervalField.totalPairCount} possible interval fibers are drawn${intervalField.omittedNoteCount ? ` from ${intervalField.notes.length} positions sampled across the register` : ""}.`
    : "";
  const currentReading = latestEvent
    ? `${latestLabel} arrived at MIDI key ${latestEvent.note}. ${activeNumbers.length ? `${activeNumbers.length} ${activeNumbers.length === 1 ? "position is" : "positions are"} held or pedal-sustained now.` : matchingChord ? `Its ${matchingChord.gesture.kind} field groups ${matchingChord.gesture.attacks.length} attacks across ${Math.round(matchingChord.gesture.spreadMs)} milliseconds.` : "No keys remain held."}`
    : "Play a MIDI key, or open the silent hand horizon below. The first attack will light the sky.";
  const metricReading = latestEvent
    ? `Selected-frame pull is ${evidenceWord(tendency.homePull)}; home evidence is ${evidenceWord(tendency.homeEvidence)}; phrase-local newness is ${evidenceWord(phraseNewness)}${currentCrunch == null ? "; modeled crunch needs a matching multi-note field" : `; modeled crunch is ${evidenceWord(currentCrunch)} under ${currentModel.shortLabel.toLowerCase()}`}.${samplingReading}`
    : "Hue, size, trails, filaments, and mist remain separate visual channels; none is a goodness or emotion score.";
  const visualSummary = latestEvent
    ? `Resonance Sky contains ${Math.min(28, phraseEvents.length)} recent attack marks and ${events.length} bright microscope attacks. Latest is ${latestLabel}, MIDI key ${latestEvent.note}, at the derived A4 equals 440 reference ${formatHz(frequencyFromMidi(latestEvent.note))}. ${fieldNotes.length} field positions create ${intervalField.totalPairCount} possible pairwise intervals; ${intervalField.omittedNoteCount ? `${intervalField.notes.length} positions sampled evenly across the register create ${intervalField.analyzedPairCount} analyzed pairs, and ` : ""}${intervalField.links.length} bounded filaments are shown${intervalField.omittedLinkCount ? ` while ${intervalField.omittedLinkCount} pairs are omitted from the drawing` : ""}${sampleInterval ? `; one labeled reference is ${sampleInterval.relationship} near ${sampleInterval.landmarkLabel}` : ""}. ${latestChord ? `The newest ${latestChord.gesture.kind} chord membrane spans ${Math.round(latestChord.gesture.spreadMs)} milliseconds.` : "No chord membrane is available."} ${metricReading} Musical quality and listener feeling are not inferred.`
    : "Empty Resonance Sky. Direction follows the circle of fifths, depth follows equal-key register, and the outer aurora shows the selected movable-Do route.";
  const [announcedSummary, setAnnouncedSummary] = useState(visualSummary);

  useEffect(() => {
    const timer = window.setTimeout(() => setAnnouncedSummary(visualSummary), 280);
    return () => window.clearTimeout(timer);
  }, [visualSummary]);

  return (
    <section className="piano-immersion" aria-labelledby="piano-immersion-title">
      <div className="piano-immersion-intro">
        <div>
          <span>Immersion · analysis only</span>
          <h3 id="piano-immersion-title">Resonance Sky</h3>
          <p>Direction follows fifths. Depth follows register. Hue follows pitch role around the current Do. The sky holds still when the frame moves; its gold Do meridian and relational colors reinterpret the same played positions.</p>
        </div>
        <label className="piano-immersion-model" htmlFor="immersion-sound-model">
          <span>Assumed spectrum</span>
          <select id="immersion-sound-model" value={soundModelId} onChange={(event) => onSoundModelChange(event.target.value as PianoSoundModelId)}>
            {PIANO_SOUND_MODELS.map((model) => <option key={model.id} value={model.id}>{model.shortLabel}</option>)}
          </select>
          <small>Only coral modeled crunch responds; no keyboard audio is read.</small>
        </label>
      </div>

      <p className="sr-only" role="status" aria-live="polite" aria-atomic="true">{announcedSummary}</p>

      <div className="piano-immersion-stage">
        <svg viewBox={`0 0 ${IMMERSION_VIEWBOX.width} ${IMMERSION_VIEWBOX.height}`} preserveAspectRatio="xMidYMid slice" role="img" aria-labelledby="piano-immersion-svg-title piano-immersion-svg-description">
          <title id="piano-immersion-svg-title">Resonance Sky for the current MIDI phrase</title>
          <desc id="piano-immersion-svg-description">{visualSummary}</desc>
          <defs>
            <filter id="immersion-soft-glow" x="-80%" y="-80%" width="260%" height="260%">
              <feGaussianBlur stdDeviation="5" result="blur" />
              <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
            </filter>
            <radialGradient id="immersion-home-well">
              <stop offset="0" stopColor="#ffd36a" stopOpacity="0.44" />
              <stop offset="0.42" stopColor="#ffd36a" stopOpacity="0.12" />
              <stop offset="1" stopColor="#ffd36a" stopOpacity="0" />
            </radialGradient>
            <radialGradient id="immersion-cloud-mist">
              <stop offset="0" stopColor="#8f9dff" stopOpacity="0.16" />
              <stop offset="0.58" stopColor="#8f9dff" stopOpacity="0.08" />
              <stop offset="1" stopColor="#8f9dff" stopOpacity="0" />
            </radialGradient>
            <marker id="immersion-pull-arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse">
              <path d="M 0 0 L 10 5 L 0 10 z" />
            </marker>
          </defs>

          <g className="immersion-dust" aria-hidden="true">
            {COSMIC_DUST.map((dust, index) => <circle key={index} cx={dust.x} cy={dust.y} r={dust.radius} opacity={dust.opacity} />)}
          </g>

          <g className="immersion-register-depth" aria-hidden="true">
            <circle cx="600" cy="350" r="106" /><circle cx="600" cy="350" r="208" /><circle cx="600" cy="350" r="310" />
            <text x="600" y="338">low</text><text x="600" y="236">middle</text><text x="600" y="134">high</text>
          </g>

          <g className="immersion-scale-aurora" aria-label={`${scale.name} outer route constellation`}>
            {routeOffsets.map((offset, index) => {
              const note = doMidi + offset;
              const point = immersionPitchPoint(note, doMidi);
              const direction = immersionDirectionPoint(point.pitchClass, 313);
              const seen = seenPitchClasses.has(point.pitchClass);
              const labelPoint = immersionDirectionPoint(point.pitchClass, 338);
              const label = showConventions ? CONVENTIONAL_PITCH_CLASSES[point.pitchClass] : scale.solfege[index] ?? noteContext(note, doMidi, scale).syllable;
              return <g key={`${point.pitchClass}-${index}`} className={`${seen ? "is-seen" : ""} ${offset === 0 ? "is-home" : ""}`}>
                <circle cx={direction.x} cy={direction.y} r={seen ? 24 : 18} style={{ "--immersion-pitch": immersionRoleColor(point, true) } as CSSProperties} />
                <text x={labelPoint.x} y={labelPoint.y + 4}>{label}</text>
              </g>;
            })}
          </g>

          <g className="immersion-do-meridian">
            <line x1="600" y1="350" x2={doDirection.x} y2={doDirection.y} />
            <circle cx={homeAtField.x} cy={homeAtField.y} r={38 + tendency.homeEvidence * 40} fill="url(#immersion-home-well)" />
            <circle cx={doDirection.x} cy={doDirection.y} r="9" />
            <text x={doDirection.x} y={doDirection.y + (doDirection.y < 350 ? 27 : -17)}>Do · {frameMode === "locked" ? "locked" : "discovering"}</text>
          </g>

          <g className="immersion-chord-clouds" aria-label={`${visibleClouds.length} recent timing-group membranes using the ${chordWindowMs} millisecond chord window`}>
            {visibleClouds.map(({ measure, bounds }, index) => bounds ? <g key={measure.gesture.id} className={`${measure.gesture.kind === "rolled" ? "is-rolled" : ""} ${index === visibleClouds.length - 1 ? "is-current" : ""}`}>
              <ellipse cx={bounds.centerX} cy={bounds.centerY} rx={bounds.radiusX} ry={bounds.radiusY} fill="url(#immersion-cloud-mist)" />
              <ellipse cx={bounds.centerX} cy={bounds.centerY} rx={Math.max(22, bounds.radiusX - 14)} ry={Math.max(18, bounds.radiusY - 12)} />
            </g> : null)}
          </g>

          {fieldCloud && currentCrunch != null ? <ellipse className="immersion-crunch-haze" cx={fieldCloud.centerX} cy={fieldCloud.centerY} rx={fieldCloud.radiusX + 10 + currentCrunch * 30} ry={fieldCloud.radiusY + 8 + currentCrunch * 24} style={{ "--immersion-crunch": currentCrunch } as CSSProperties} /> : null}

          {voiceProfile ? <g className="immersion-voice-wake" aria-label={`${voiceProfile.strands.length} nearest-key voice paths from the previous grouped field`}>
            {voiceProfile.strands.map((strand, index) => {
              const anchorNote = strand.from ?? strand.to;
              if (anchorNote == null) return null;
              const anchor = immersionPitchPoint(anchorNote, doMidi);
              const from = strand.from == null ? { x: 600 + (anchor.x - 600) * 0.86, y: 350 + (anchor.y - 350) * 0.86 } : immersionPitchPoint(strand.from, doMidi);
              const to = strand.to == null ? { x: 600 + (anchor.x - 600) * 1.08, y: 350 + (anchor.y - 350) * 1.08 } : immersionPitchPoint(strand.to, doMidi);
              return <path key={`${strand.from}-${strand.to}-${index}`} d={filamentPath(from, to)} className={`is-${strand.motion}`}><title>{strand.motion === "held" ? "Retained physical key" : strand.motion === "added" ? "Position entered the interpretation" : strand.motion === "released" ? "Position left the interpretation" : `Nearest-key voice moved ${Math.abs(strand.semitones)} steps ${strand.motion}`}</title></path>;
            })}
          </g> : null}

          {trail.length > 1 ? <path className="immersion-memory-wake" d={immersionCurve(trail.map(({ point }) => point))} /> : null}

          <g className="immersion-attack-gaps" aria-label="Latest attack path; broken segments contain release-proven silence">
            {latestSeven.slice(1).map((current, index) => {
              const previous = latestSeven[index];
              const gapMs = Math.max(0, current.event.onsetMs - previous.event.onsetMs);
              const silence = immersionReleaseProvenSilence(phraseEvents, current.event);
              return <path key={`${previous.event.id}-${current.event.id}`} d={filamentPath(previous.point, current.point)} className={silence.proven ? "is-silence" : gapMs <= chordWindowMs ? "is-grouped" : "is-connected"} style={{ "--immersion-gap": Math.min(1, gapMs / 1600) } as CSSProperties}><title>{silence.durationMs != null ? `${Math.round(silence.durationMs)} milliseconds of release-proven silence before the next attack` : `${Math.round(gapMs)} milliseconds between attacks; no silence claim`}</title></path>;
            })}
          </g>

          <g className="immersion-interval-filaments" aria-label={`${intervalField.links.length} of ${intervalField.totalPairCount} pairwise interval filaments shown`}>
            {intervalField.links.map((link, index) => {
              const midpointX = (link.lowerPoint.x + link.upperPoint.x) / 2;
              const midpointY = (link.lowerPoint.y + link.upperPoint.y) / 2;
              const className = Math.abs(link.errorCents) <= 12 ? "is-close" : Math.abs(link.errorCents) <= 25 ? "is-near" : "is-offset";
              const labelY = midpointY + (Math.abs(link.lowerPoint.y - link.upperPoint.y) < 35 ? 20 : index % 2 ? -18 : 18);
              return <g key={`${link.lower}-${link.upper}`} className={className}>
                <path d={filamentPath(link.lowerPoint, link.upperPoint)}><title>{link.relationship}, {link.semitones} equal keys, near {link.landmarkLabel}, {Math.round(Math.abs(link.errorCents))} cents from that {link.referenceKind === "geometric-midpoint" ? "geometric octave midpoint" : "integer-ratio reference"}</title></path>
                {index < 3 ? <text x={midpointX} y={labelY}>{link.landmarkLabel} · {Math.round(Math.abs(link.errorCents))}¢</text> : null}
              </g>;
            })}
          </g>

          {latestEvent ? (() => {
            const point = immersionPitchPoint(latestEvent.note, doMidi);
            return <circle className="immersion-newness-bloom" cx={point.x} cy={point.y} r={22 + phraseNewness * 30} style={{ "--immersion-newness": phraseNewness } as CSSProperties} />;
          })() : null}

          {latestEvent && tendency.homePull >= 0.04 ? <path className="immersion-pull-current" d={filamentPath(fieldPoint, homeAtField)} style={{ "--immersion-pull": tendency.homePull } as CSSProperties}><title>Modeled selected-frame pull toward the current Do is {evidenceWord(tendency.homePull)}</title></path> : null}

          <g className="immersion-phrase-stars" aria-label={`${trail.length} recent attack stars; latest seven are labeled`}>
            {trail.map(({ event, point, recency }) => {
              const recentIndex = events.findIndex((recent) => recent.id === event.id);
              const inScale = routePitchClasses.has(point.pitchClass);
              const color = immersionRoleColor(point, inScale);
              const size = 4.5 + Math.max(0, Math.min(127, event.velocity)) / 127 * 8.5;
              const isLatest = event.id === latestEvent?.id;
              return <g key={event.id} className={`piano-immersion-note ${recentIndex >= 0 ? "is-microscope" : "is-memory"} ${recentIndex >= 0 && recentIndex < Math.max(0, events.length - 5) ? "is-older-label" : ""} ${isLatest ? "is-latest" : ""}`} style={{ "--immersion-pitch": color, "--immersion-recency": 0.18 + recency * 0.82 } as CSSProperties}>
                <circle className="cosmos-node-bloom" cx={point.x} cy={point.y} r={size + 10} />
                <circle className={inScale ? "cosmos-node is-route" : "cosmos-node is-outside-route"} cx={point.x} cy={point.y} r={size} />
                {recentIndex >= 0 ? <text x={point.x + 15} y={point.y - 13}>{recentIndex + 1} · {noteLabel(event.note, doMidi, scale, showConventions)}</text> : null}
              </g>;
            })}
          </g>

          <g className="immersion-active-stars" aria-label={`${activeNotes.length} held or pedal-sustained positions`}>
            {activeNotes.map((active) => {
              const point = immersionPitchPoint(active.note, doMidi);
              const inScale = routePitchClasses.has(point.pitchClass);
              const size = 8 + Math.max(0, Math.min(127, active.velocity)) / 127 * 9;
              return <g key={active.note} className={`${active.pressed ? "is-pressed" : ""} ${active.sustained ? "is-sustained" : ""}`} style={{ "--immersion-pitch": immersionRoleColor(point, inScale) } as CSSProperties}>
                <circle className="immersion-active-corona" cx={point.x} cy={point.y} r={size + 9} />
                <circle className="immersion-active-core" cx={point.x} cy={point.y} r={size} />
                {active.sustained ? <circle className="immersion-pedal-ring" cx={point.x} cy={point.y} r={size + 15} /> : null}
              </g>;
            })}
          </g>

          {!events.length ? <g className="immersion-empty-reading">
            <text x="600" y="335">press one key</text>
            <text x="600" y="368">a pitch becomes a place</text>
            <text x="600" y="394">a second pitch reveals the relationship</text>
          </g> : null}
        </svg>
      </div>

      <div className="piano-immersion-legend" aria-label="How to read Resonance Sky">
        <span className="is-pitch"><i aria-hidden="true" /><strong>Pitch star</strong><small>direction = fifths · depth = register · hue = role around Do · size = MIDI attack, not loudness</small></span>
        <span className="is-route"><i aria-hidden="true" /><strong>Scale aurora</strong><small>saturated positions belong to the current route; dimmer ones sit outside it without being wrong</small></span>
        <span className="is-interval"><i aria-hidden="true" /><strong>Interval fiber</strong><small>dash density shows 12-TET mismatch to the named reference; √2 is a geometric midpoint, not an integer ratio</small></span>
        <span className="is-chord"><i aria-hidden="true" /><strong>Chord mist</strong><small>one membrane = attacks grouped within {chordWindowMs} ms; a dashed edge means rolled</small></span>
        <span className="is-context"><i aria-hidden="true" /><strong>Musical weather</strong><small>gold arrow = selected-Do pull · coral ripple = assumed crunch · violet burst = phrase-local newness</small></span>
        <span className="is-time"><i aria-hidden="true" /><strong>Memory wake</strong><small>brightness = recency; a broken segment needs release-proven silence, not merely a long onset gap</small></span>
      </div>

      <div className="piano-immersion-reading">
        <span>Now</span>
        <strong>{currentReading}</strong>
        <small>{metricReading} The view never combines these channels into correctness, emotion, preference, or musical goodness.</small>
        <em>Reference depth derives from MIDI key number using A4=440 12-TET. Pitch bend, keyboard or DAW tuning, acoustic pitch, audio spectrum, and acoustic loudness are not captured.</em>
      </div>
    </section>
  );
}
