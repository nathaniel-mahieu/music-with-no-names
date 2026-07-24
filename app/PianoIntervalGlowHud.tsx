"use client";

import { useMemo } from "react";
import {
  chordSpacingProfile,
  exactIntervalCopy,
  foldIntervalForGlow,
  intervalListeningCue,
  intervalTimeline,
  type ChordIntervalPair,
} from "@/lib/piano-interval-glow-model";
import {
  conventionalPitchName,
  noteContext,
  type PianoScale,
} from "@/lib/piano-model";

type IntervalGlowEvent = {
  id: number;
  note: number;
  onsetMs: number;
  fieldNotes: number[];
};

type PianoIntervalGlowHudProps = {
  events: IntervalGlowEvent[];
  activeNotes: number[];
  doMidi: number;
  scale: PianoScale;
  chordWindowMs: number;
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
  return `${eventLabel(pair.lowNote, doMidi, scale, showConventions)} to ${eventLabel(pair.highNote, doMidi, scale, showConventions)}: ${exactIntervalCopy(pair.exactSemitones)}${pair.addedOctaves ? `; drawn smaller and inward because ${pair.addedOctaves} octave layer${pair.addedOctaves === 1 ? "" : "s"} was added` : ""}`;
}

export function PianoIntervalGlowHud({
  events,
  activeNotes,
  doMidi,
  scale,
  chordWindowMs,
  showConventions,
}: PianoIntervalGlowHudProps) {
  const timeline = useMemo(
    () => intervalTimeline(events, chordWindowMs, 24),
    [chordWindowMs, events],
  );
  const latest = timeline.events.at(-1) ?? null;
  const previous = timeline.events.at(-2) ?? null;
  const signedLatestDistance = latest && previous ? latest.note - previous.note : null;
  const latestInterval = signedLatestDistance == null
    ? null
    : foldIntervalForGlow(Math.abs(signedLatestDistance));
  const latestGroup = timeline.groups.at(-1) ?? null;
  const latestEventSource = events.at(-1) ?? null;
  const field = useMemo(() => chordSpacingProfile(
    activeNotes.length >= 2
      ? activeNotes
      : latestEventSource?.fieldNotes && latestEventSource.fieldNotes.length >= 2
        ? latestEventSource.fieldNotes
        : latestGroup?.notes ?? [],
  ), [activeNotes, latestEventSource, latestGroup]);
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
    ? `${eventLabel(previous!.note, doMidi, scale, showConventions)} → ${eventLabel(latest!.note, doMidi, scale, showConventions)} · ${Math.abs(signedLatestDistance)} semitone${Math.abs(signedLatestDistance) === 1 ? "" : "s"} ${directionCopy(signedLatestDistance)}`
    : "Waiting for two attacks";
  const fieldCopy = field.notes.length >= 2
    ? `${field.notes.length} notes; adjacent gaps ${field.adjacentGaps.join("–")}; all-pairs distances ${countCopy(field.exactCounts)}; outer span ${field.span} semitones.`
    : "Hold or closely attack at least two notes to reveal adjacent gaps and all pairwise spacings.";
  const ringSummary = latestInterval
    ? `The newest attack moved ${signedSemitones(signedLatestDistance!)} semitones and lights position ${latestInterval.ringSemitones}. ${fieldCopy}`
    : `No two-note transition yet. ${fieldCopy}`;

  return (
    <section className="piano-interval-glow" aria-labelledby="piano-interval-glow-title">
      <header className="piano-interval-glow-intro">
        <div>
          <span>Interval Glow · exact keyboard space</span>
          <h3 id="piano-interval-glow-title">Let every semitone distance become a place and a color.</h3>
          <p>Each new attack lights its exact distance from the previous attack. Notes grouped inside the chord window light every pair at once. The center keeps the recent melodic thread and chord clusters together in time.</p>
        </div>
        <dl aria-label="Interval Glow reading rules">
          <div><dt>around the ring</dt><dd>1–12 exact semitones</dd></div>
          <div><dt>smaller, inward marks</dt><dd>the same spacing plus octave layers</dd></div>
          <div><dt>center thread</dt><dd>attack order + grouped chord moments</dd></div>
        </dl>
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
              <text x={Math.min(842, Math.max(38, ((previous.note + latest.note) / 2 - KEYBOARD_LOW) * 10 + 5))} y="12" textAnchor="middle">{signedSemitones(signedLatestDistance!)} st</text>
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
                <title>{`${step} semitone${step === 1 ? "" : "s"} · ${foldIntervalForGlow(step).name}${count ? ` · ${count} current chord pair${count === 1 ? "" : "s"}` : ""}${isLatest ? " · newest melodic distance" : ""}`}</title>
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
          <text className="interval-glow-center-kicker" x="410" y="205" textAnchor="middle">NEWEST ATTACK-TO-ATTACK MOVE</text>
          <text
            className={`interval-glow-center-value ${latestInterval ? intervalClass(latestInterval.ringSemitones) : ""}`}
            x="410"
            y="244"
            textAnchor="middle"
          >{signedLatestDistance == null ? "play 2 notes" : `${signedSemitones(signedLatestDistance)} st`}</text>
          <text className="interval-glow-center-detail" x="410" y="265" textAnchor="middle">
            {latestInterval ? exactIntervalCopy(latestInterval.exactSemitones) : "exact MIDI-key subtraction"}
          </text>

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
            return <g key={`transition-${transition.toId}`} className={intervalClass(transition.folded.ringSemitones)}>
              <line
                className="interval-thread-link"
                x1={timelineX(source.id)}
                y1={timelineY(source.note)}
                x2={timelineX(target.id)}
                y2={timelineY(target.note)}
              >
                <title>{`${eventLabel(source.note, doMidi, scale, showConventions)} to ${eventLabel(target.note, doMidi, scale, showConventions)}: ${signedSemitones(transition.signedSemitones)} semitones`}</title>
              </line>
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
        </svg>
      </div>

      <div className="interval-glow-readings">
        <article>
          <span>1 · melody distance</span>
          <strong>{signedLatestDistance == null ? "Play any two notes" : `${signedSemitones(signedLatestDistance)} semitones · ${latestInterval!.name}`}</strong>
          <p>{signedLatestDistance == null ? "The first attack sets a temporary origin. The second reveals signed, exact key distance." : `${Math.abs(signedLatestDistance)} equal keyboard steps ${directionCopy(signedLatestDistance)}. The ring folds only the display; the exact distance remains here.`}</p>
        </article>
        <article>
          <span>2 · chord decomposition</span>
          <strong>{field.notes.length >= 2 ? `${field.notes.length} notes · span ${field.span} st` : "Waiting for a note cluster"}</strong>
          <p><b>From low to high:</b> {field.adjacentGaps.length ? field.adjacentGaps.join(" – ") : "—"}<br /><b>Every pair:</b> {countCopy(field.exactCounts)}</p>
        </article>
        <article>
          <span>3 · ear experiment</span>
          <strong>{latestInterval ? `Compare ${latestInterval.ringSemitones} with ${latestInterval.ringSemitones === 12 ? 11 : latestInterval.ringSemitones + 1}` : "Build a contrast"}</strong>
          <p>{newestCue}</p>
        </article>
      </div>

      <footer className="interval-glow-boundary">
        <strong>What is measured</strong>
        <span>MIDI key number, attack order, and grouping time. Semitone counts are exact key subtraction.</span>
        <strong>What is not measured</strong>
        <span>Your piano’s acoustic spectrum, tuning, pedal resonance, loudness, emotion, consonance, or musical quality. Listen through your instrument or DAW while the HUD remains silent.</span>
      </footer>
    </section>
  );
}
