"use client";

import { useMemo } from "react";
import {
  chordSpacingProfile,
  exactIntervalCopy,
  foldIntervalForGlow,
  intervalListeningCue,
  intervalTimeline,
  sequentialIntervalFeeling,
  togetherIntervalFeeling,
  type ChordIntervalPair,
} from "@/lib/piano-interval-glow-model";
import {
  conventionalPitchName,
  frequencyFromMidi,
  noteContext,
  type PianoScale,
} from "@/lib/piano-model";
import {
  PIANO_SOUND_MODELS,
  pianoSoundModel,
  pianoSoundVoice,
  type PianoSoundModelId,
} from "@/lib/piano-sound-model";
import { sonorityPerceptionModel } from "@/lib/sonority-model";

type IntervalGlowEvent = {
  id: number;
  note: number;
  onsetMs: number;
  velocity: number;
  fieldNotes: number[];
};

type PianoIntervalGlowHudProps = {
  events: IntervalGlowEvent[];
  activeNotes: number[];
  doMidi: number;
  scale: PianoScale;
  chordWindowMs: number;
  soundModelId: PianoSoundModelId;
  onSoundModelChange: (id: PianoSoundModelId) => void;
  showConventions: boolean;
};

const RING_STEPS = Array.from({ length: 12 }, (_, index) => index + 1);
const KEYBOARD_LOW = 21;
const KEYBOARD_HIGH = 108;
const KEYBOARD_SIZE = KEYBOARD_HIGH - KEYBOARD_LOW + 1;

function pointOnRing(step: number, radius: number) {
  const angle = (step * 30 - 90) * Math.PI / 180;
  return {
    x: 410 + Math.cos(angle) * radius,
    y: 340 + Math.sin(angle) * radius,
  };
}

function intervalClass(step: number) {
  return `is-interval-${step}`;
}

function signedSemitones(value: number) {
  if (value > 0) return `↑ ${value}`;
  if (value < 0) return `↓ ${Math.abs(value)}`;
  return "0";
}

function directionCopy(value: number) {
  if (value > 0) return "higher";
  if (value < 0) return "lower";
  return "same key";
}

function countCopy(values: Array<{ semitones: number; pairCount: number }>) {
  return values.length
    ? values.map(({ semitones, pairCount }) => `${semitones}${pairCount > 1 ? ` × ${pairCount}` : ""}`).join(" · ")
    : "—";
}

function eventLabel(note: number, doMidi: number, scale: PianoScale, showConventions: boolean) {
  const relative = noteContext(note, doMidi, scale).syllable;
  return showConventions ? `${relative} · ${conventionalPitchName(note)}` : relative;
}

function pairTitle(pair: ChordIntervalPair, doMidi: number, scale: PianoScale, showConventions: boolean) {
  const feeling = togetherIntervalFeeling(pair.exactSemitones);
  return `${eventLabel(pair.lowNote, doMidi, scale, showConventions)} to ${eventLabel(pair.highNote, doMidi, scale, showConventions)}: ${exactIntervalCopy(pair.exactSemitones)}; together texture prompt: ${feeling.phrase}; possible words to test: ${feeling.possibleWords}${pair.addedOctaves ? `; drawn smaller and inward because ${pair.addedOctaves} octave layer${pair.addedOctaves === 1 ? "" : "s"} was added` : ""}`;
}

function resonanceContourPath(openness: number, roughness: number, fusion: number, pairCount: number) {
  const pointCount = 56;
  const baseRadius = 34 + openness * 56 + fusion * 8;
  const ripple = 2 + roughness * 17;
  const lobes = Math.max(3, Math.min(11, pairCount + 3));
  return Array.from({ length: pointCount }, (_, index) => {
    const angle = (index / pointCount) * Math.PI * 2 - Math.PI / 2;
    const radius = baseRadius
      + Math.sin(angle * lobes) * ripple
      + Math.sin(angle * (lobes + 3)) * ripple * .28;
    const x = 410 + Math.cos(angle) * radius;
    const y = 354 + Math.sin(angle) * radius;
    return `${index === 0 ? "M" : "L"} ${x.toFixed(2)} ${y.toFixed(2)}`;
  }).join(" ") + " Z";
}

function centerGesturePath(signedSemitones: number) {
  const direction = Math.sign(signedSemitones);
  const span = Math.min(54, 10 + Math.abs(signedSemitones) * 4);
  const startY = 302 + direction * span * .18;
  const endY = 302 - direction * span * .62;
  const controlY = 302 - direction * span * 1.1;
  return `M 318 ${startY.toFixed(1)} Q 410 ${controlY.toFixed(1)} 502 ${endY.toFixed(1)}`;
}

function threadGesturePath(x1: number, y1: number, x2: number, y2: number, signedSemitones: number) {
  const curve = Math.min(24, 5 + Math.abs(signedSemitones) * 1.4);
  const direction = Math.sign(signedSemitones) || 1;
  return `M ${x1.toFixed(2)} ${y1.toFixed(2)} Q ${((x1 + x2) / 2).toFixed(2)} ${(((y1 + y2) / 2) - direction * curve).toFixed(2)} ${x2.toFixed(2)} ${y2.toFixed(2)}`;
}

export function PianoIntervalGlowHud({
  events,
  activeNotes,
  doMidi,
  scale,
  chordWindowMs,
  soundModelId,
  onSoundModelChange,
  showConventions,
}: PianoIntervalGlowHudProps) {
  const timeline = useMemo(
    () => intervalTimeline(events, chordWindowMs, 24),
    [chordWindowMs, events],
  );
  const latest = timeline.events.at(-1) ?? null;
  const previous = timeline.events.at(-2) ?? null;
  const latestTransition = timeline.transitions.at(-1) ?? null;
  const latestSequentialTransition = [...timeline.transitions].reverse().find((transition) => !transition.sameGroup) ?? null;
  const signedLatestDistance = latest && previous ? latest.note - previous.note : null;
  const latestInterval = signedLatestDistance == null
    ? null
    : foldIntervalForGlow(Math.abs(signedLatestDistance));
  const latestAttackFeeling = latestTransition
    ? latestTransition.sameGroup
      ? togetherIntervalFeeling(Math.abs(latestTransition.signedSemitones))
      : sequentialIntervalFeeling(latestTransition.signedSemitones, latestTransition.onsetGapMs)
    : null;
  const latestSequentialFeeling = latestSequentialTransition
    ? sequentialIntervalFeeling(latestSequentialTransition.signedSemitones, latestSequentialTransition.onsetGapMs)
    : null;
  const latestGroup = timeline.groups.at(-1) ?? null;
  const latestEventSource = events.at(-1) ?? null;
  const field = useMemo(() => chordSpacingProfile(
    activeNotes.length >= 2
      ? activeNotes
      : latestEventSource?.fieldNotes && latestEventSource.fieldNotes.length >= 2
        ? latestEventSource.fieldNotes
        : latestGroup?.notes ?? [],
  ), [activeNotes, latestEventSource, latestGroup]);
  const soundModel = pianoSoundModel(soundModelId);
  const fieldPerception = useMemo(() => field.notes.length >= 2
    ? sonorityPerceptionModel(field.notes.map((note) => pianoSoundVoice(frequencyFromMidi(note), .72, soundModelId)))
    : null, [field.notes, soundModelId]);
  const featuredTogetherPair = field.pairs.length
    ? [...field.pairs].sort((first, second) => first.exactSemitones - second.exactSemitones)[0]
    : null;
  const featuredTogetherFeeling = featuredTogetherPair
    ? togetherIntervalFeeling(featuredTogetherPair.exactSemitones)
    : null;
  const contourPath = fieldPerception
    ? resonanceContourPath(fieldPerception.openness, fieldPerception.roughness, fieldPerception.fusion, field.pairs.length)
    : null;
  const pairCounts = new Map(field.ringCounts.map((bin) => [bin.semitones, bin.pairCount]));
  const eventById = new Map(timeline.events.map((event) => [event.id, event]));
  const timelineMinimum = timeline.events.length ? Math.min(...timeline.events.map((event) => event.note)) : 60;
  const timelineMaximum = timeline.events.length ? Math.max(...timeline.events.map((event) => event.note)) : 72;
  const timelineSpan = Math.max(12, timelineMaximum - timelineMinimum);
  const groupIndexByEvent = new Map<number, { groupIndex: number; eventIndex: number; groupSize: number }>();
  timeline.groups.forEach((group, groupIndex) => group.events.forEach((event, eventIndex) => {
    groupIndexByEvent.set(event.id, { groupIndex, eventIndex, groupSize: group.events.length });
  }));
  const timelineX = (eventId: number) => {
    const placement = groupIndexByEvent.get(eventId);
    if (!placement) return 410;
    const groupX = timeline.groups.length === 1
      ? 565
      : 255 + (placement.groupIndex / (timeline.groups.length - 1)) * 310;
    return groupX + (placement.eventIndex - (placement.groupSize - 1) / 2) * 8;
  };
  const timelineY = (note: number) => 414 - ((note - timelineMinimum) / timelineSpan) * 128;
  const recentTransitionLabels = new Set(timeline.transitions.slice(-6).map((transition) => transition.toId));
  const newestCue = latestInterval
    ? intervalListeningCue(latestInterval.exactSemitones)
    : "Play two notes. Their exact signed keyboard distance will light one stable place on the ring.";
  const latestCopy = latestInterval && signedLatestDistance != null
    ? latestTransition?.sameGroup
      ? `${eventLabel(previous!.note, doMidi, scale, showConventions)} + ${eventLabel(latest!.note, doMidi, scale, showConventions)} · ${Math.abs(signedLatestDistance)} semitone${Math.abs(signedLatestDistance) === 1 ? "" : "s"} apart · inside ${chordWindowMs} ms`
      : `${eventLabel(previous!.note, doMidi, scale, showConventions)} → ${eventLabel(latest!.note, doMidi, scale, showConventions)} · ${Math.abs(signedLatestDistance)} semitone${Math.abs(signedLatestDistance) === 1 ? "" : "s"} ${directionCopy(signedLatestDistance)}`
    : "Waiting for two attacks";
  const fieldCopy = field.notes.length >= 2
    ? `${field.notes.length} notes; adjacent gaps ${field.adjacentGaps.join("–")}; all-pairs distances ${countCopy(field.exactCounts)}; outer span ${field.span} semitones.`
    : "Hold or closely attack at least two notes to reveal adjacent gaps and all pairwise spacings.";
  const ringSummary = latestInterval
    ? `${latestTransition?.sameGroup ? `The newest grouped pair spans ${Math.abs(signedLatestDistance!)} semitones and lights position ${latestInterval.ringSemitones}. It falls inside one ${chordWindowMs} millisecond grouping window and is shown as a together texture, not isolated melodic order.` : `The newest attack moved ${signedSemitones(signedLatestDistance!)} semitones and lights position ${latestInterval.ringSemitones}.${latestAttackFeeling ? ` Its sequential gesture prompt is ${latestAttackFeeling.phrase}.` : ""}`} ${fieldCopy}${fieldPerception ? ` Under the ${soundModel.shortLabel} equal-level teaching spectrum, the current field has modeled roughness ${Math.round(fieldPerception.roughness * 100)}, fusion ${Math.round(fieldPerception.fusion * 100)}, and openness ${Math.round(fieldPerception.openness * 100)}.` : ""}`
    : `No two-note transition yet. ${fieldCopy}`;
  const attackModeCopy = latestTransition?.sameGroup
    ? `inside ${chordWindowMs} ms · together texture`
    : latestSequentialFeeling?.phrase ?? "play across two moments";
  const feelingWords = latestTransition?.sameGroup && latestAttackFeeling
    ? latestAttackFeeling.possibleWords
    : latestSequentialFeeling?.possibleWords ?? "direction · pace · spacing";
  const sequentialDistance = latestSequentialTransition ? Math.abs(latestSequentialTransition.signedSemitones) : null;
  const togetherTextureList = field.pairs
    .slice()
    .sort((first, second) => first.exactSemitones - second.exactSemitones)
    .slice(0, 4)
    .map((pair) => `${pair.exactSemitones} st ${togetherIntervalFeeling(pair.exactSemitones).phrase.split(" · ")[0]}`)
    .join(" · ");

  return (
    <section className="piano-interval-glow" aria-labelledby="piano-interval-glow-title">
      <header className="piano-interval-glow-intro">
        <div>
          <span>Interval Glow · one spacing, two perceptual lives</span>
          <h3 id="piano-interval-glow-title">Watch an interval travel—or feel it gather.</h3>
          <p>Across separate moments, an interval becomes a directional gesture whose arc carries size and pace. Inside the chord window, the same semitone color becomes a woven texture. The words are invitations to listen, never fixed emotional meanings.</p>
        </div>
        <aside className="interval-glow-reading-key">
          <dl aria-label="Interval Glow reading rules">
            <div><dt>traveling arc</dt><dd>direction + size + attack pace</dd></div>
            <div><dt>woven bloom</dt><dd>simultaneous pair texture</dd></div>
            <div><dt>stable color</dt><dd>1–12 family; octave layers shrink inward</dd></div>
          </dl>
          <label htmlFor="interval-glow-sound-model">
            <span>Together bloom model</span>
            <select
              id="interval-glow-sound-model"
              value={soundModelId}
              onChange={(event) => onSoundModelChange(event.target.value as PianoSoundModelId)}
            >
              {PIANO_SOUND_MODELS.map((model) => <option key={model.id} value={model.id}>{model.label}</option>)}
            </select>
            <small>Changes the modeled bloom—not your MIDI or audio.</small>
          </label>
        </aside>
      </header>

      <div className="interval-keyboard-horizon" aria-label="The full 88-key piano unrolled as equal semitone cells">
        <div>
          <span>Entire keyboard · 88 equal steps</span>
          <strong>{latestCopy}</strong>
          <small>Piano key width is visually removed here: every cell is exactly one semitone. Current or latest field keys glow; the newest two attacks are joined.</small>
        </div>
        <svg viewBox="0 0 880 92" role="img" aria-label={`Full piano range from MIDI ${KEYBOARD_LOW} through ${KEYBOARD_HIGH}. ${latestCopy}.`}>
          {Array.from({ length: KEYBOARD_SIZE }, (_, index) => {
            const note = KEYBOARD_LOW + index;
            const active = field.notes.includes(note);
            const newest = latest?.note === note;
            const prior = previous?.note === note;
            return <rect
              key={note}
              x={index * 10 + 1}
              y={note % 12 === 0 ? 19 : 25}
              width="8"
              height={note % 12 === 0 ? 49 : 43}
              rx="2"
              className={[
                "interval-keyboard-cell",
                active ? "is-active" : "",
                newest ? "is-latest" : "",
                prior ? "is-previous" : "",
                latestInterval && (newest || prior) ? intervalClass(latestInterval.ringSemitones) : "",
              ].filter(Boolean).join(" ")}
            ><title>{`MIDI ${note}${active ? ", current field" : ""}${newest ? ", newest attack" : ""}${prior ? ", previous attack" : ""}`}</title></rect>;
          })}
          {previous && latest && previous.note >= KEYBOARD_LOW && previous.note <= KEYBOARD_HIGH && latest.note >= KEYBOARD_LOW && latest.note <= KEYBOARD_HIGH ? (
            <>
              <path
                className={`interval-keyboard-arc ${intervalClass(latestInterval!.ringSemitones)}`}
                d={`M ${(previous.note - KEYBOARD_LOW) * 10 + 5} 22 Q ${((previous.note + latest.note) / 2 - KEYBOARD_LOW) * 10 + 5} ${Math.max(2, 22 - Math.abs(latest.note - previous.note) * 1.15)} ${(latest.note - KEYBOARD_LOW) * 10 + 5} 22`}
              />
              <text x={Math.min(842, Math.max(38, ((previous.note + latest.note) / 2 - KEYBOARD_LOW) * 10 + 5))} y="12" textAnchor="middle">{latestTransition?.sameGroup ? Math.abs(signedLatestDistance!) : signedSemitones(signedLatestDistance!)} st</text>
            </>
          ) : null}
          <text x="2" y="86">A0</text>
          <text x="878" y="86" textAnchor="end">C8</text>
        </svg>
      </div>

      <div className="interval-glow-stage">
        <svg viewBox="0 0 820 720" role="img" aria-labelledby="interval-glow-svg-title interval-glow-svg-desc">
          <title id="interval-glow-svg-title">Live semitone-spacing ring and phrase timeline</title>
          <desc id="interval-glow-svg-desc">{ringSummary}</desc>
          <defs>
            <filter id="interval-glow-soft" x="-80%" y="-80%" width="260%" height="260%">
              <feGaussianBlur stdDeviation="9" />
            </filter>
            <radialGradient id="interval-glow-center" cx="50%" cy="46%">
              <stop offset="0%" stopColor="currentColor" stopOpacity=".1" />
              <stop offset="100%" stopColor="currentColor" stopOpacity="0" />
            </radialGradient>
            <marker id="interval-gesture-arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse">
              <path d="M 0 0 L 10 5 L 0 10 Z" />
            </marker>
          </defs>
          <circle className="interval-glow-atmosphere" cx="410" cy="340" r="328" />
          <circle className="interval-glow-guide" cx="410" cy="340" r="282" />
          <circle className="interval-glow-guide is-inner" cx="410" cy="340" r="244" />
          {RING_STEPS.map((step) => {
            const point = pointOnRing(step, 282);
            const count = pairCounts.get(step) ?? 0;
            const isLatest = latestInterval?.ringSemitones === step;
            const active = count > 0 || isLatest;
            return (
              <g
                key={step}
                className={[
                  "interval-glow-node",
                  intervalClass(step),
                  active ? "is-lit" : "",
                  isLatest ? "is-latest" : "",
                  step === 12 ? "is-octave" : "",
                ].filter(Boolean).join(" ")}
                transform={`translate(${point.x} ${point.y})`}
              >
                {active ? <circle className="interval-glow-aura" r={36 + Math.min(3, count) * 5} filter="url(#interval-glow-soft)" /> : null}
                <circle className="interval-glow-node-body" r={step === 12 ? 27 : 23} />
                {step === 12 ? <circle className="interval-glow-octave-orbit" r="32" /> : null}
                <text className="interval-glow-number" textAnchor="middle" y="4">{step}</text>
                <text className="interval-glow-name" textAnchor="middle" y="48">{foldIntervalForGlow(step).name}</text>
                {count > 1 ? <text className="interval-glow-count" textAnchor="middle" y="-34">{count} pairs</text> : null}
                <title>{`${step} semitone${step === 1 ? "" : "s"} · ${foldIntervalForGlow(step).name}${count ? ` · ${count} current chord pair${count === 1 ? "" : "s"}` : ""}${isLatest ? latestTransition?.sameGroup ? " · newest grouped pair" : " · newest sequential distance" : ""}`}</title>
              </g>
            );
          })}

          {field.pairs.slice(0, 24).map((pair, index) => {
            const base = pointOnRing(pair.ringSemitones, 282 - pair.addedOctaves * 24);
            const angle = (pair.ringSemitones * 30 - 90) * Math.PI / 180;
            const tangentX = -Math.sin(angle);
            const tangentY = Math.cos(angle);
            const peers = field.pairs.filter((candidate) => candidate.ringSemitones === pair.ringSemitones);
            const peerIndex = peers.indexOf(pair);
            const offset = (peerIndex - (peers.length - 1) / 2) * 10;
            const radius = Math.max(3.5, 8 - pair.addedOctaves * 1.7);
            return <circle
              key={`${pair.lowNote}-${pair.highNote}-${index}`}
              className={`interval-glow-pair ${intervalClass(pair.ringSemitones)}`}
              cx={base.x + tangentX * offset}
              cy={base.y + tangentY * offset}
              r={radius}
            ><title>{pairTitle(pair, doMidi, scale, showConventions)}</title></circle>;
          })}

          <circle className="interval-glow-center-disc" cx="410" cy="350" r="184" />
          <circle className="interval-glow-center-wash" cx="410" cy="350" r="180" fill="url(#interval-glow-center)" />
          {contourPath && fieldPerception ? (
            <g key={`together-field-${field.notes.join("-")}`} className="interval-together-field">
              <path
                className="interval-together-contour"
                d={contourPath}
                style={{
                  strokeWidth: 1.2 + fieldPerception.roughness * 3.4,
                  opacity: .16 + fieldPerception.fusion * .32,
                }}
              />
              <circle
                className="interval-together-core"
                cx="410"
                cy="354"
                r={18 + fieldPerception.fusion * 28}
                style={{ opacity: .08 + fieldPerception.fusion * .18 }}
              />
              {field.pairs.slice(0, 12).map((pair, index) => {
                const feeling = togetherIntervalFeeling(pair.exactSemitones);
                const ellipseRadius = 28 + Math.min(24, pair.exactSemitones) * 2.25;
                const ellipseThickness = 7 + Math.min(12, pair.ringSemitones) * .58;
                return <ellipse
                  key={`weave-${pair.lowNote}-${pair.highNote}-${index}`}
                  className={`interval-together-strand ${intervalClass(pair.ringSemitones)} is-${feeling.texture}`}
                  cx="410"
                  cy="354"
                  rx={ellipseRadius}
                  ry={ellipseThickness}
                  transform={`rotate(${pair.ringSemitones * 30 - 90} 410 354)`}
                ><title>{`${pairTitle(pair, doMidi, scale, showConventions)}. Ellipse length follows exact physical semitone span; orientation follows its 1–12 color family.`}</title></ellipse>;
              })}
            </g>
          ) : null}
          {latestTransition && !latestTransition.sameGroup ? (
            <path
              key={`center-gesture-${latestTransition.toId}`}
              className={`interval-center-gesture ${intervalClass(latestTransition.folded.ringSemitones)} is-${sequentialIntervalFeeling(latestTransition.signedSemitones, latestTransition.onsetGapMs).pace}`}
              d={centerGesturePath(latestTransition.signedSemitones)}
              markerEnd="url(#interval-gesture-arrow)"
            ><title>{`${sequentialIntervalFeeling(latestTransition.signedSemitones, latestTransition.onsetGapMs).phrase}: ${signedSemitones(latestTransition.signedSemitones)} semitones across ${Math.round(latestTransition.onsetGapMs)} milliseconds`}</title></path>
          ) : null}
          <text className="interval-glow-center-kicker" x="410" y="192" textAnchor="middle">{latestTransition?.sameGroup ? "NEWEST ATTACKS · TOGETHER" : "NEWEST MOVE · IN TIME"}</text>
          <text
            className={`interval-glow-center-value ${latestInterval ? intervalClass(latestInterval.ringSemitones) : ""}`}
            x="410"
            y="228"
            textAnchor="middle"
          >{signedLatestDistance == null ? "play 2 notes" : `${latestTransition?.sameGroup ? Math.abs(signedLatestDistance) : signedSemitones(signedLatestDistance)} st`}</text>
          <text className="interval-glow-center-detail" x="410" y="249" textAnchor="middle">
            {latestInterval ? exactIntervalCopy(latestInterval.exactSemitones) : "exact MIDI-key subtraction"}
          </text>
          <text className="interval-glow-center-feeling" x="410" y="268" textAnchor="middle">{attackModeCopy}</text>

          <line className="interval-thread-axis" x1="238" x2="582" y1="424" y2="424" />
          <text className="interval-thread-time-label" x="238" y="446">earlier</text>
          <text className="interval-thread-time-label" x="582" y="446" textAnchor="end">now →</text>
          {timeline.groups.map((group) => {
            if (group.events.length < 2) return null;
            const xs = group.events.map((event) => timelineX(event.id));
            const ys = group.events.map((event) => timelineY(event.note));
            return <rect
              key={`group-${group.id}`}
              className="interval-thread-chord-halo"
              x={Math.min(...xs) - 10}
              y={Math.min(...ys) - 11}
              width={Math.max(24, Math.max(...xs) - Math.min(...xs) + 20)}
              height={Math.max(24, Math.max(...ys) - Math.min(...ys) + 22)}
              rx="12"
            ><title>{`${group.events.length} attacks grouped inside ${chordWindowMs} ms: ${group.notes.map((note) => eventLabel(note, doMidi, scale, showConventions)).join(", ")}`}</title></rect>;
          })}
          {timeline.transitions.map((transition) => {
            const source = eventById.get(transition.fromId)!;
            const target = eventById.get(transition.toId)!;
            const midpointX = (timelineX(source.id) + timelineX(target.id)) / 2;
            const midpointY = (timelineY(source.note) + timelineY(target.note)) / 2;
            const feeling = transition.sameGroup
              ? togetherIntervalFeeling(Math.abs(transition.signedSemitones))
              : sequentialIntervalFeeling(transition.signedSemitones, transition.onsetGapMs);
            return <g
              key={`transition-${transition.toId}`}
              className={`${intervalClass(transition.folded.ringSemitones)} ${transition.sameGroup ? "is-together" : "is-sequential"}`}
            >
              <path
                className="interval-thread-link"
                d={threadGesturePath(
                  timelineX(source.id),
                  timelineY(source.note),
                  timelineX(target.id),
                  timelineY(target.note),
                  transition.signedSemitones,
                )}
                markerEnd={transition.sameGroup ? undefined : "url(#interval-gesture-arrow)"}
              >
                <title>{`${eventLabel(source.note, doMidi, scale, showConventions)} to ${eventLabel(target.note, doMidi, scale, showConventions)}: ${signedSemitones(transition.signedSemitones)} semitones; ${transition.sameGroup ? `inside one ${chordWindowMs} millisecond group, so packet order is shown as together texture: ${feeling.phrase}` : `sequential gesture: ${feeling.phrase} across ${Math.round(transition.onsetGapMs)} milliseconds`}`}</title>
              </path>
              {recentTransitionLabels.has(transition.toId) ? <text className="interval-thread-step" x={midpointX} y={midpointY - 7} textAnchor="middle">{signedSemitones(transition.signedSemitones)}</text> : null}
            </g>;
          })}
          {timeline.events.map((event) => {
            const group = groupIndexByEvent.get(event.id);
            const isLatest = latest?.id === event.id;
            return <g key={`event-${event.id}`} className={isLatest ? "interval-thread-note is-latest" : "interval-thread-note"}>
              <circle cx={timelineX(event.id)} cy={timelineY(event.note)} r={isLatest ? 7 : 5} />
              <title>{`${eventLabel(event.note, doMidi, scale, showConventions)} · ${group?.groupSize && group.groupSize > 1 ? `${group.groupSize}-attack grouped moment` : "single-note moment"}`}</title>
            </g>;
          })}
          {!timeline.events.length ? <text className="interval-thread-empty" x="410" y="365" textAnchor="middle">Your phrase will gather here</text> : null}
          <text className="interval-glow-feel-words" x="410" y="478" textAnchor="middle">words to test · {feelingWords}</text>
        </svg>
      </div>

      <div className="interval-glow-readings">
        <article>
          <span>1 · in time · felt as motion</span>
          <strong>{latestSequentialFeeling ? latestSequentialFeeling.phrase : "Play across two separate moments"}</strong>
          <p>{latestSequentialTransition && sequentialDistance != null
            ? <><b>{signedSemitones(latestSequentialTransition.signedSemitones)} semitones · {Math.round(latestSequentialTransition.onsetGapMs)} ms</b><br />Words to test: {latestSequentialFeeling!.possibleWords}. {latestSequentialFeeling!.listeningPrompt}</>
            : "A move outside the chord window becomes an arrow. Its direction, bend, and pace come from the performed attacks."}</p>
        </article>
        <article>
          <span>2 · at once · felt as texture</span>
          <strong>{field.notes.length >= 2 && featuredTogetherFeeling ? `${featuredTogetherFeeling.phrase} inside ${field.notes.length} notes` : "Hold or closely attack a pair"}</strong>
          <p><b>From low to high:</b> {field.adjacentGaps.length ? field.adjacentGaps.join(" – ") : "—"}<br /><b>Pair textures:</b> {togetherTextureList || "—"}{fieldPerception ? <><br /><b>{soundModel.shortLabel} shape:</b> rough edge {Math.round(fieldPerception.roughness * 100)} · fused core {Math.round(fieldPerception.fusion * 100)} · spread {Math.round(fieldPerception.openness * 100)}</> : null}</p>
        </article>
        <article>
          <span>3 · one spacing · two lives</span>
          <strong>{latestInterval ? `Play ${latestInterval.exactSemitones} st broken → together` : "Build a direct contrast"}</strong>
          <p>{latestInterval ? `First release the lower note before the upper attack; then sustain both inside ${chordWindowMs} ms. The color stays fixed while travel becomes texture. ${newestCue}` : "Use the same two keys first in sequence, then together. Notice which felt words survive the change."}</p>
        </article>
      </div>

      <footer className="interval-glow-boundary">
        <strong>What is measured</strong>
        <span>MIDI key number, attack direction, onset gap, and grouping time. Semitone counts are exact key subtraction.</span>
        <strong>What is not measured</strong>
        <span>Your piano’s acoustic spectrum, tuning, pedal resonance, loudness, emotion, consonance, or musical quality. The bloom’s roughness, fusion, and openness use an equal-level {soundModel.shortLabel} teaching spectrum; felt words remain yours to accept or reject.</span>
      </footer>
    </section>
  );
}
