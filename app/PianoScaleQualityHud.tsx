"use client";

import { useMemo, useState, type CSSProperties } from "react";
import {
  conventionalPitchName,
  frequencyFromMidi,
  pitchClassFromMidi,
} from "@/lib/piano-model";
import {
  PIANO_SOUND_MODELS,
  isPianoSoundModelId,
  pianoSoundModel,
  type PianoSoundModelId,
} from "@/lib/piano-sound-model";
import {
  SCALE_QUALITY_CATALOG,
  SCALE_QUALITY_DEFAULT_SPLIT_MIDI,
  SCALE_QUALITY_MAX_SPLIT_MIDI,
  SCALE_QUALITY_MIN_SPLIT_MIDI,
  rankScaleQualityCandidates,
  scaleQualityEvidenceStatus,
  scaleQualityNoteProfile,
  scaleQualityOverlapProfile,
  splitScaleQualityPerformance,
  type ScaleQualityEvent,
  type ScaleQualityScale,
} from "@/lib/piano-scale-quality-model";
import styles from "./PianoScaleQualityHud.module.css";

type PianoScaleQualityHudProps = {
  events: ScaleQualityEvent[];
  activeNotes: number[];
  entryAfterEventId: number;
  showConventions: boolean;
  soundModelId: PianoSoundModelId;
  onSoundModelChange: (value: PianoSoundModelId) => void;
};

type ListenerWord = "resting" | "leaning-up" | "leaning-down" | "open";

const LISTENER_WORDS: Array<{ id: ListenerWord; label: string; cue: string }> = [
  { id: "resting", label: "resting", cue: "I could leave it here" },
  { id: "leaning-up", label: "leans up", cue: "I imagine a higher next step" },
  { id: "leaning-down", label: "leans down", cue: "I imagine a lower next step" },
  { id: "open", label: "open / unclear", cue: "several continuations feel available" },
];

const ORBIT_CENTER = 280;
const ROUTE_RADIUS = 205;

function modulo(value: number, divisor = 12) {
  return ((value % divisor) + divisor) % divisor;
}

function orbitPoint(offset: number, radius = ROUTE_RADIUS) {
  const angle = (offset * 30 - 90) * Math.PI / 180;
  return {
    x: ORBIT_CENTER + Math.cos(angle) * radius,
    y: ORBIT_CENTER + Math.sin(angle) * radius,
  };
}

function formatSigned(value: number) {
  return value > 0 ? `+${value}` : String(value);
}

function plural(value: number, singular: string, pluralForm = `${singular}s`) {
  return `${value} ${value === 1 ? singular : pluralForm}`;
}

function degreeHue(offset: number) {
  return modulo(42 + modulo(offset * 7) * 30, 360);
}

function chromaticLabel(tonicMidi: number | null, offset: number, showConventions: boolean) {
  return showConventions && tonicMidi != null ? conventionalPitchName(tonicMidi + offset) : `+${offset}`;
}

function gapPattern(scale: ScaleQualityScale) {
  return scale.offsets.map((offset, index) => modulo(scale.offsets[(index + 1) % scale.offsets.length] - offset) || 12);
}

function movementCopy(moves: readonly number[]) {
  if (!moves.length) return "none";
  return moves.map((move) => `${formatSigned(move)} st`).join(" or ");
}

function candidateDifference(first: ScaleQualityScale | null, second: ScaleQualityScale | null, observed: Set<number>) {
  if (!first || !second) return [];
  const firstSet = new Set(first.offsets);
  const secondSet = new Set(second.offsets);
  return Array.from({ length: 12 }, (_, offset) => offset)
    .filter((offset) => firstSet.has(offset) !== secondSet.has(offset) && !observed.has(offset));
}

export function PianoScaleQualityHud({
  events,
  activeNotes,
  entryAfterEventId,
  showConventions,
  soundModelId,
  onSoundModelChange,
}: PianoScaleQualityHudProps) {
  const [splitMidi, setSplitMidi] = useState(SCALE_QUALITY_DEFAULT_SPLIT_MIDI);
  const [resetAfterEventId, setResetAfterEventId] = useState(entryAfterEventId);
  const [lockedScaleId, setLockedScaleId] = useState<string | null>(null);
  const [listenerWords, setListenerWords] = useState<Record<string, ListenerWord>>({});
  const localEvents = useMemo(() => events.filter((event) => event.id > resetAfterEventId), [events, resetAfterEventId]);
  const performance = useMemo(() => splitScaleQualityPerformance(localEvents, splitMidi), [localEvents, splitMidi]);
  const rawTonicEvent = performance.tonicEvent;
  const activeBassPitchClasses = useMemo(() => new Set(activeNotes.filter((note) => note <= splitMidi).map(pitchClassFromMidi)), [activeNotes, splitMidi]);
  const bassFieldAmbiguous = performance.tonicFieldAmbiguous || activeBassPitchClasses.size > 1;
  // Every tonic-relative channel shares this one trusted anchor. An ambiguous
  // low field never leaks an arbitrary last note into exact-looking geometry.
  const tonicEvent = bassFieldAmbiguous ? null : rawTonicEvent;
  const allCandidates = useMemo(() => tonicEvent
    ? rankScaleQualityCandidates(performance.upperEvents.map((event) => event.note), tonicEvent.note, SCALE_QUALITY_CATALOG.length)
    : [], [performance.upperEvents, tonicEvent]);
  const leadingCandidate = allCandidates[0] ?? null;
  const candidateEvidence = scaleQualityEvidenceStatus(allCandidates);
  const automaticScale = candidateEvidence.id === "suggestive" || candidateEvidence.id === "complete"
    ? leadingCandidate?.scale ?? null
    : null;
  const selectedScale = SCALE_QUALITY_CATALOG.find((scale) => scale.id === lockedScaleId)
    ?? automaticScale
    ?? null;
  const selectedCandidate = selectedScale ? allCandidates.find((candidate) => candidate.scale.id === selectedScale.id) ?? null : null;
  const latestUpper = performance.upperEvents.at(-1) ?? null;
  const previousUpper = performance.upperEvents.at(-2) ?? null;
  const noteProfile = latestUpper && tonicEvent
    ? scaleQualityNoteProfile(latestUpper.note, tonicEvent.note, selectedScale, previousUpper?.note ?? null)
    : null;
  const liveOverlap = latestUpper && tonicEvent
    ? scaleQualityOverlapProfile(tonicEvent.note, latestUpper.note, activeNotes, soundModelId)
    : null;
  const overlap = liveOverlap;
  const overlapState = liveOverlap ? "sounding" : "memory";
  const observedOffsets = useMemo(() => {
    if (!tonicEvent) return new Set<number>();
    return new Set(performance.upperEvents.map((event) => modulo(event.note - tonicEvent.note)));
  }, [performance.upperEvents, tonicEvent]);
  const offsetCounts = useMemo(() => {
    const counts = new Map<number, number>();
    if (!tonicEvent) return counts;
    performance.upperEvents.forEach((event) => {
      const offset = modulo(event.note - tonicEvent.note);
      counts.set(offset, (counts.get(offset) ?? 0) + 1);
    });
    return counts;
  }, [performance.upperEvents, tonicEvent]);
  const distinguishingOffsets = candidateDifference(allCandidates[0]?.scale ?? null, allCandidates[1]?.scale ?? null, observedOffsets);
  const selectedOffsets = new Set<number>(selectedScale?.offsets ?? []);
  const routePoints = selectedScale?.offsets.map((offset) => orbitPoint(offset)).map((point) => `${point.x},${point.y}`).join(" ") ?? "";
  const trail = tonicEvent ? performance.upperEvents.slice(-12).map((event) => {
    const physicalSemitones = event.note - tonicEvent.note;
    const radius = Math.min(196, 84 + Math.max(0, physicalSemitones / 12) * 28);
    return { event, offset: modulo(physicalSemitones), physicalSemitones, ...orbitPoint(modulo(physicalSemitones), radius) };
  }) : [];
  const trailPoints = trail.map((point) => `${point.x},${point.y}`).join(" ");
  const evidence = bassFieldAmbiguous
    ? { id: "ambiguous" as const, label: "More than one low pitch class is present. Release the bass field, then strike one low anchor." }
    : candidateEvidence;
  const routeStatus = bassFieldAmbiguous
    ? evidence.label
    : !tonicEvent
    ? `Waiting for one low MIDI anchor at or below ${showConventions ? conventionalPitchName(splitMidi) : `key ${splitMidi}`}.`
    : evidence.label;
  const tonicLabel = tonicEvent
    ? showConventions ? conventionalPitchName(tonicEvent.note) : "Do"
    : "—";
  const latestLabel = latestUpper && noteProfile
    ? showConventions ? conventionalPitchName(latestUpper.note) : noteProfile?.solfege ?? `+${noteProfile?.foldedOffset ?? 0} st`
    : "—";
  const reportKey = tonicEvent && noteProfile ? `${pitchClassFromMidi(tonicEvent.note)}:${noteProfile.foldedOffset}:${selectedScale?.id ?? "unframed"}` : "none";
  const listenerWord = listenerWords[reportKey] ?? null;
  const soundModel = pianoSoundModel(soundModelId);
  const resetReading = (nextSplit = splitMidi) => {
    setSplitMidi(nextSplit);
    setResetAfterEventId(events.reduce((maximum, event) => Math.max(maximum, event.id), 0));
    setLockedScaleId(null);
    setListenerWords({});
  };
  const candidatePair = allCandidates.length > 1
    ? `${allCandidates[0].scale.shortName} and ${allCandidates[1].scale.shortName}`
    : allCandidates[0]?.scale.shortName ?? "no catalog routes";
  const physicalOctaves = noteProfile ? Math.floor(noteProfile.physicalSemitones / 12) : 0;

  return <section className={styles.shell} aria-labelledby="piano-scale-quality-title">
    <header className={styles.intro}>
      <div>
        <span>Scale Quality Explorer · silent live MIDI</span>
        <h3 id="piano-scale-quality-title">One low note becomes home. Every upper note reveals another relationship.</h3>
        <p>Play one intermittent note below the split, then explore a scale above it. This HUD reads raw MIDI only; your piano or DAW supplies the sound.</p>
      </div>
      <div className={styles.controls} aria-label="Scale Quality Explorer setup">
        <label htmlFor="scale-quality-split">
          <span>hand split · bass key included</span>
          <input id="scale-quality-split" type="range" min={SCALE_QUALITY_MIN_SPLIT_MIDI} max={SCALE_QUALITY_MAX_SPLIT_MIDI} step={1} value={splitMidi} aria-describedby="scale-quality-split-reading" aria-valuetext={`Bass through ${showConventions ? conventionalPitchName(splitMidi) : `MIDI ${splitMidi}`}; upper from ${showConventions ? conventionalPitchName(splitMidi + 1) : `MIDI ${splitMidi + 1}`}`} onChange={(event) => resetReading(Number(event.target.value))} />
          <output id="scale-quality-split-reading" htmlFor="scale-quality-split">bass ≤ {showConventions ? conventionalPitchName(splitMidi) : splitMidi} · upper ≥ {showConventions ? conventionalPitchName(splitMidi + 1) : splitMidi + 1}</output>
        </label>
        <label htmlFor="scale-quality-spectrum">
          <span>assumed teaching spectrum</span>
          <select id="scale-quality-spectrum" value={soundModelId} onChange={(event) => { if (isPianoSoundModelId(event.target.value)) onSoundModelChange(event.target.value); }}>
            {PIANO_SOUND_MODELS.map((model) => <option key={model.id} value={model.id}>{model.label}</option>)}
          </select>
          <small>Changes only the overlap model, never the keys or route fit.</small>
        </label>
        <button type="button" onClick={() => resetReading()}>Start a fresh reading</button>
      </div>
    </header>

    <div className={styles.status} role="status" aria-live="polite" aria-atomic="true">
      <span data-state={evidence.id}>{bassFieldAmbiguous ? "bass ambiguous" : tonicEvent ? "home established" : "waiting for home"}</span>
      <strong>{routeStatus}</strong>
      <small>{performance.ignoredPreTonicUpperCount ? `${plural(performance.ignoredPreTonicUpperCount, "earlier upper attack")} ignored before this home. ` : ""}Repeated notes do not add new route evidence.</small>
    </div>

    <div className={styles.stage}>
      <section className={styles.sky} aria-labelledby="scale-quality-map-title">
        <header>
          <div><span>tonic-relative constellation</span><h4 id="scale-quality-map-title">Angle is pitch class. Radius remembers register.</h4></div>
          <p><i className={styles.routeKey} /> compared route <i className={styles.heardKey} /> heard position <i className={styles.questionKey} /> distinguishes leaders</p>
        </header>
        <svg viewBox="0 0 560 560" role="img" aria-labelledby="scale-quality-orbit-title scale-quality-orbit-desc">
          <title id="scale-quality-orbit-title">Tonic-relative scale constellation</title>
          <desc id="scale-quality-orbit-desc">A central low tonic beacon surrounded by twelve semitone positions. The selected scale route, observed upper notes, compound-register trail, and current tonic-to-note connection are shown independently. Trail radius expands evenly by octave through four octaves; wider intervals remain at the outer trail rim.</desc>
          <defs>
            <radialGradient id="scale-quality-tonic-glow">
              <stop offset="0" stopColor="#fff4bd" stopOpacity=".96" />
              <stop offset=".32" stopColor="#eec36d" stopOpacity=".6" />
              <stop offset="1" stopColor="#eec36d" stopOpacity="0" />
            </radialGradient>
          </defs>
          {[112, 140, 168, 196].map((radius, index) => <circle key={radius} cx={ORBIT_CENTER} cy={ORBIT_CENTER} r={radius} className={styles.registerRing}><title>{index === 3 ? "Four or more octaves above the bass anchor; wider intervals pin to this rim" : `${index + 1} octave${index ? "s" : ""} above the bass anchor`}</title></circle>)}
          <circle cx={ORBIT_CENTER} cy={ORBIT_CENTER} r={ROUTE_RADIUS} className={styles.chromaticOrbit} />
          {routePoints ? <polygon points={routePoints} className={styles.routeShape} /> : null}
          {trailPoints ? <polyline points={trailPoints} className={styles.trailLine} /> : null}
          {trail.map((point, index) => <circle key={`${point.event.id}-${index}`} cx={point.x} cy={point.y} r={index === trail.length - 1 ? 7 : 3.5} className={index === trail.length - 1 ? styles.latestTrailPoint : styles.trailPoint} style={{ "--node-hue": degreeHue(point.offset) } as CSSProperties}><title>{`${formatSigned(point.physicalSemitones)} physical semitones; +${point.offset} after octave fold${point.physicalSemitones > 48 ? "; register radius capped beyond four octaves" : ""}`}</title></circle>)}
          {tonicEvent && noteProfile ? <line x1={ORBIT_CENTER} y1={ORBIT_CENTER} x2={trail.at(-1)?.x ?? ORBIT_CENTER} y2={trail.at(-1)?.y ?? ORBIT_CENTER} className={overlap ? styles.liveFilament : styles.memoryFilament}><title>{overlap ? "Tonic and latest upper key overlapped" : "Sequential comparison through remembered tonic"}</title></line> : null}
          {Array.from({ length: 12 }, (_, offset) => {
            const point = orbitPoint(offset);
            const inRoute = selectedOffsets.has(offset);
            const heard = observedOffsets.has(offset);
            const latest = noteProfile?.foldedOffset === offset;
            const distinguishing = distinguishingOffsets.includes(offset);
            const count = offsetCounts.get(offset) ?? 0;
            const className = [styles.orbitNode, inRoute ? styles.inRoute : "", heard ? styles.isHeard : "", latest ? styles.isLatest : "", distinguishing ? styles.isDistinguishing : ""].filter(Boolean).join(" ");
            return <g key={offset} className={className} style={{ "--node-hue": degreeHue(offset) } as CSSProperties}>
              <circle cx={point.x} cy={point.y} r={latest ? 22 : 17} />
              <text x={point.x} y={point.y + 2} textAnchor="middle">{chromaticLabel(tonicEvent?.note ?? null, offset, showConventions)}</text>
              <text x={point.x} y={point.y + 12} textAnchor="middle" className={styles.nodeCount}>{count ? `×${count}` : inRoute ? "route" : ""}</text>
              <title>{`+${offset} semitones from tonic${inRoute && selectedScale ? `, in ${selectedScale.name}` : selectedScale ? ", outside compared route" : ", no route selected"}${heard ? `, heard ${count} time${count === 1 ? "" : "s"}` : ""}${distinguishing ? `, distinguishes ${candidatePair}` : ""}`}</title>
            </g>;
          })}
          {tonicEvent ? performance.tonicPulses.slice(-4).map((pulse, index, pulses) => <circle key={pulse.id} cx={ORBIT_CENTER} cy={ORBIT_CENTER} r={36 + (pulses.length - index) * 9} className={styles.tonicPulse} />) : null}
          <circle cx={ORBIT_CENTER} cy={ORBIT_CENTER} r="68" fill="url(#scale-quality-tonic-glow)" />
          <circle cx={ORBIT_CENTER} cy={ORBIT_CENTER} r="28" className={styles.tonicCore} />
          <text x={ORBIT_CENTER} y={ORBIT_CENTER - 3} textAnchor="middle" className={styles.tonicText}>{tonicLabel}</text>
          <text x={ORBIT_CENTER} y={ORBIT_CENTER + 12} textAnchor="middle" className={styles.tonicSubtext}>{bassFieldAmbiguous ? "one low class" : tonicEvent ? `low ${tonicEvent.note}` : "play low"}</text>
        </svg>
        <footer>
          <div><span>bass pulse</span><strong>{bassFieldAmbiguous ? "ambiguous low field · no tonic chosen" : tonicEvent ? `${tonicLabel} · MIDI ${tonicEvent.note} · ${frequencyFromMidi(tonicEvent.note).toFixed(1)} Hz` : "none yet"}</strong><small>{tonicEvent && performance.tonicPulses.length ? `${plural(performance.tonicPulses.length, "same-home pulse")} in this epoch` : bassFieldAmbiguous ? "Release the cluster, then strike one isolated low note." : "The next single low attack starts a new local reading."}</small></div>
          <div><span>upper journey</span><strong>{performance.upperEvents.length ? `${plural(performance.upperEvents.length, "attack")} · ${plural(observedOffsets.size, "distinct position")}` : "waiting above the split"}</strong><small>{trail.length > 1 ? trail.slice(1).map((point, index) => formatSigned(point.event.note - trail[index].event.note)).join(" · ") + " st moves" : "Successive movement appears after two upper attacks."}</small></div>
        </footer>
      </section>

      <aside className={styles.readings} aria-label="Scale relationship readings">
        <section className={styles.relationship}>
          <header><span>latest upper relationship</span><strong>{latestUpper && noteProfile ? `${latestLabel} · ${noteProfile.signedPhysicalSemitones} st` : "Play above the split"}</strong></header>
          {noteProfile ? <>
            <div className={styles.bigInterval}><strong>{formatSigned(noteProfile.physicalSemitones)}</strong><span>physical semitones</span><small>{physicalOctaves} octave{physicalOctaves === 1 ? "" : "s"} + {noteProfile.foldedOffset} st · {noteProfile.centsFromTonic} cents</small></div>
            <dl>
              <div><dt>octave-folded place</dt><dd>+{noteProfile.foldedOffset} st · {noteProfile.intervalName}</dd></div>
              <div><dt>12-TET ratio</dt><dd>2^({noteProfile.physicalSemitones}/12) = {noteProfile.frequencyRatio.toFixed(3)}:1</dd></div>
              <div><dt>from previous upper</dt><dd>{noteProfile.moveFromPreviousUpper == null ? "first upper attack" : `${formatSigned(noteProfile.moveFromPreviousUpper)} st`}</dd></div>
            </dl>
          </> : <p className={styles.empty}>Keep the bass lane to one pitch class. Then each upper attack gains a physical interval, folded position, and route role.</p>}
        </section>

        <section className={styles.topology}>
          <header><span>route topology</span><strong>{selectedScale?.name ?? "No route compared yet"}</strong><small>{selectedScale ? `${gapPattern(selectedScale).join("–")} semitone gaps around the octave${selectedCandidate ? ` · ${selectedCandidate.matchedOffsets.length}/${selectedScale.offsets.length} heard · ${selectedCandidate.outsideOffsets.length} outside` : ""}` : "Play upper notes or choose a reference route; no scale is assumed."}</small></header>
          {noteProfile && selectedScale ? <div className={styles.topologyRows}>
            <div><span>position</span><strong>{noteProfile.inScale ? `degree ${noteProfile.degreeNumber} · ${noteProfile.solfege}` : `+${noteProfile.foldedOffset} is outside this route`}</strong></div>
            <div><span>neighbor gaps</span><strong>{noteProfile.inScale ? `${noteProfile.incomingGap} st in · ${noteProfile.outgoingGap} st out` : `nearest route move ${movementCopy(noteProfile.nearestScaleMoves)}`}</strong></div>
            <div><span>available home moves</span><strong>{movementCopy(noteProfile.shortestHomeMoves)}</strong></div>
            <p>{noteProfile.roleCue} Nearness makes motion available; it does not require resolution.</p>
          </div> : <p className={styles.empty}>The compared route stays provisional until your upper notes provide evidence.</p>}
        </section>

        <section className={styles.spectrum}>
          <header><span>only while raw MIDI proves exact overlap</span><strong>{overlapState === "sounding" ? "Together now" : "Compared through memory"}</strong><small>{overlap ? `${soundModel.shortLabel} proxy · not recorded piano audio` : "Simultaneous-spectrum evidence is withheld because both exact keys are not sounding now."}</small></header>
          {overlap ? <>
            <div className={styles.meters}>
              {[
                ["partial alignment", Math.min(1, overlap.alignedPartialCount / 8)],
                ["spectral crowding", overlap.roughness],
                ["periodic fit", overlap.harmonicity],
                ["center ambiguity", overlap.ambiguity],
                ["fusion", overlap.fusion],
                ["register openness", overlap.openness],
              ].map(([label, rawValue]) => {
                const value = Number(rawValue);
                return <div key={String(label)}><span>{label}</span><i><b style={{ width: `${Math.round(value * 100)}%` }} /></i><strong>{Math.round(value * 100)}</strong></div>;
              })}
            </div>
            <p>{overlap.alignedPartialCount} aligned partial pairs · {overlap.interactionPairCount} close interaction pairs. Brightness is omitted as a virtue: in this model it mostly follows register and spectrum.</p>
          </> : <p className={styles.empty}>Hold or pedal the low tonic into an upper attack to reveal a modeled interaction profile. A dashed filament means the comparison is sequential instead.</p>}
        </section>
      </aside>
    </div>

    <div className={styles.bottomDeck}>
      <section className={styles.candidates} aria-labelledby="scale-quality-candidates-title">
        <header>
          <div><span>catalog comparison · not key detection</span><h4 id="scale-quality-candidates-title">Which scale shapes still fit?</h4></div>
          <label htmlFor="scale-quality-route"><span>route to inspect</span><select id="scale-quality-route" value={lockedScaleId ?? ""} onChange={(event) => setLockedScaleId(event.target.value || null)}><option value="">{automaticScale ? `Follow evidence · ${automaticScale.shortName}` : "Follow evidence · assume none"}</option>{SCALE_QUALITY_CATALOG.map((scale) => <option key={scale.id} value={scale.id}>{scale.name}</option>)}</select></label>
        </header>
        {allCandidates.length ? <div className={styles.candidateList} role="group" aria-label="Choose a scale route to compare with the played upper notes">
          {allCandidates.slice(0, 4).map((candidate, index) => <button key={candidate.scale.id} type="button" aria-pressed={selectedScale?.id === candidate.scale.id} onClick={() => setLockedScaleId(candidate.scale.id)}>
            <span>{index === 0 ? "leading comparison" : `comparison ${index + 1}`}</span>
            <strong>{candidate.scale.name}</strong>
            <small>{candidate.matchedOffsets.length}/{candidate.scale.offsets.length} route positions heard · {candidate.outsideOffsets.length ? `${candidate.outsideOffsets.length} outside` : "none outside"}</small>
          </button>)}
        </div> : <p className={styles.empty}>{bassFieldAmbiguous ? "Release the low cluster and play one bass pitch class." : tonicEvent ? "Play upper notes to compare route shapes." : "The first isolated low MIDI attack establishes tonic; upper attacks before it are deliberately ignored."}</p>}
        {allCandidates.length > 1 ? <div className={styles.difference}>
          <span>What could separate the first two?</span>
          <strong>{distinguishingOffsets.length ? distinguishingOffsets.map((offset) => `+${offset}`).join(" · ") + " st positions have not been tested" : "The observed collection already contains every catalog distinction between these two routes."}</strong>
          <small>{candidatePair} remain comparisons, not a detected key. Bass, phrase endings, repetition, and style can change what feels like home.</small>
        </div> : null}
      </section>

      <section className={styles.listener} aria-labelledby="scale-quality-listener-title">
        <header><span>your ear · never inferred</span><h4 id="scale-quality-listener-title">What does this one relationship invite?</h4></header>
        {noteProfile ? <>
          <div className={styles.listenerChoices} role="group" aria-label={`Describe how +${noteProfile.foldedOffset} semitones from tonic feels to you`}>
            {LISTENER_WORDS.map((word) => <button key={word.id} type="button" aria-pressed={listenerWord === word.id} onClick={() => setListenerWords((current) => ({ ...current, [reportKey]: word.id }))}><strong>{word.label}</strong><small>{word.cue}</small></button>)}
          </div>
          <p role="status">{listenerWord ? `Your word for +${noteProfile.foldedOffset} ${selectedScale ? `in ${selectedScale.shortName}` : "with no scale route assumed"}: ${LISTENER_WORDS.find((word) => word.id === listenerWord)?.label}. Change the register, timing, route, or voicing and ask again.` : "Choose only after listening. These words are prompts for attention, not properties computed from semitone count."}</p>
        </> : <p className={styles.empty}>Establish home and play one upper note before recording a listening word.</p>}
      </section>
    </div>

    <footer className={styles.boundary}>
      <p><b>Exact:</b> MIDI key distance, octave fold, selected-route membership, gap pattern, frequency reference, and attack history. Register radius is capped after four octaves.</p>
      <p><b>Modeled:</b> partial alignment, roughness, periodic fit, ambiguity, fusion, and openness under the selected teaching spectrum—only for demonstrated overlap.</p>
      <p><b>Contextual:</b> scale identity, tendency, tension, rest, color, and “goodness.” Quality is a profile, not a verdict; felt character belongs to the listener.</p>
    </footer>
  </section>;
}
