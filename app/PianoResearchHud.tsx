"use client";

import { useMemo, useState } from "react";
import {
  CONVENTIONAL_PITCH_CLASSES,
  nearestMidiForPitchClass,
  noteContext,
  pitchClassFromMidi,
  type PianoScale,
} from "@/lib/piano-model";
import {
  chromaticClock,
  generatorComponents,
  intervalMatrix,
  normalizeResearchPitchClass,
  researchIntervalName,
  thirdsLattice,
} from "@/lib/piano-research-model";

type ResearchHudEvent = {
  id: number;
  note: number;
  onsetMs: number;
  fieldNotes: number[];
};

type ResearchLayout = "clock" | "lattice" | "matrix";

type PianoResearchHudProps = {
  events: ResearchHudEvent[];
  activeNotes: number[];
  doMidi: number;
  scale: PianoScale;
  showConventions: boolean;
};

const LAYOUTS: Array<{ id: ResearchLayout; label: string; short: string }> = [
  { id: "clock", label: "Semitone clock", short: "Equal chromatic distance" },
  { id: "lattice", label: "Thirds lattice", short: "Local +3, +4, and +7 shapes" },
  { id: "matrix", label: "All-pairs table", short: "Every directed interval" },
];

const GENERATORS = [
  { step: 1, name: "semitone" },
  { step: 2, name: "whole tone" },
  { step: 3, name: "minor third" },
  { step: 4, name: "major third" },
  { step: 5, name: "perfect fourth" },
  { step: 6, name: "tritone" },
  { step: 7, name: "perfect fifth" },
] as const;

const LAYOUT_BOUNDARIES: Record<ResearchLayout, { shows: string; hides: string }> = {
  clock: {
    shows: "One neighboring position = one semitone; rotation preserves every pitch-class interval, and reflection reverses direction.",
    hides: "Register, voicing, tuning, spectrum, timing, harmonic function, and the listener's response.",
  },
  lattice: {
    shows: "Right = +3, down = +4, and down-right = +7 semitones, so thirds and compact triad shapes become local.",
    hides: "Ordinary chromatic distance, physical register, voicing, timing, and any claim that an edge is a musical boundary.",
  },
  matrix: {
    shows: "Every ordered source-to-target pitch-class interval exactly once; reversing a pair exposes its octave complement.",
    hides: "Chord gestalt, register, voicing, timing, spectral interaction, hierarchy, and any preferred path through the notes.",
  },
};

function pitchLabel(pitchClass: number, doMidi: number, scale: PianoScale, showConventions: boolean) {
  const note = nearestMidiForPitchClass(pitchClass, doMidi);
  const relative = noteContext(note, doMidi, scale).syllable;
  return showConventions ? `${relative} · ${CONVENTIONAL_PITCH_CLASSES[pitchClass]}` : relative;
}

function formatSigned(value: number) {
  return value > 0 ? `+${value}` : String(value);
}

function nodeStateClass(pitchClass: number, anchorPitchClass: number, latestPitchClass: number | null, activePitchClasses: Set<number>, recentCounts: Map<number, number>) {
  return [
    "piano-research-clock-node",
    pitchClass === anchorPitchClass ? "is-anchor" : "",
    pitchClass === latestPitchClass ? "is-latest" : "",
    activePitchClasses.has(pitchClass) ? "is-sounding" : "",
    recentCounts.has(pitchClass) ? "is-recent" : "",
  ].filter(Boolean).join(" ");
}

export function PianoResearchHud({ events, activeNotes, doMidi, scale, showConventions }: PianoResearchHudProps) {
  const [layout, setLayout] = useState<ResearchLayout>("clock");
  const [generatorStep, setGeneratorStep] = useState(7);
  const latest = events.at(-1) ?? null;
  const previous = events.at(-2) ?? null;
  const anchorNote = doMidi;
  const anchorPitchClass = pitchClassFromMidi(anchorNote);
  const latestPitchClass = latest ? pitchClassFromMidi(latest.note) : null;
  const doPitchClass = pitchClassFromMidi(doMidi);
  const clock = useMemo(() => chromaticClock(anchorPitchClass), [anchorPitchClass]);
  const generator = useMemo(() => generatorComponents(generatorStep, anchorPitchClass), [anchorPitchClass, generatorStep]);
  const lattice = useMemo(() => thirdsLattice(anchorPitchClass), [anchorPitchClass]);
  const matrix = useMemo(() => intervalMatrix(anchorPitchClass), [anchorPitchClass]);
  const activePitchClasses = useMemo(() => new Set(activeNotes.map(pitchClassFromMidi)), [activeNotes]);
  const recentCounts = useMemo(() => {
    const counts = new Map<number, number>();
    events.forEach((event) => {
      const pitchClass = pitchClassFromMidi(event.note);
      counts.set(pitchClass, (counts.get(pitchClass) ?? 0) + 1);
    });
    return counts;
  }, [events]);
  const fieldNotes = activeNotes.length ? activeNotes : latest?.fieldNotes ?? [];
  const fieldPitchClasses = [...new Set(fieldNotes.map(pitchClassFromMidi))];
  const clockPoint = (relativePosition: number, radius = 176) => {
    const node = clock[normalizeResearchPitchClass(relativePosition)];
    return { x: 320 + node.x * radius, y: 248 + node.y * radius };
  };
  const fieldPoints = fieldPitchClasses.map((pitchClass) => clockPoint(normalizeResearchPitchClass(pitchClass - anchorPitchClass), 151));
  const fieldPath = fieldPoints.length > 2
    ? `${fieldPoints.map((point) => `${point.x},${point.y}`).join(" ")} ${fieldPoints[0].x},${fieldPoints[0].y}`
    : fieldPoints.map((point) => `${point.x},${point.y}`).join(" ");
  const physicalDelta = latest && previous ? latest.note - previous.note : null;
  const transitionClass = physicalDelta == null ? null : researchIntervalName(Math.abs(physicalDelta));
  const transitionDirection = physicalDelta == null ? "" : physicalDelta > 0 ? "up" : physicalDelta < 0 ? "down" : "same key";
  const sourceRelative = previous ? normalizeResearchPitchClass(pitchClassFromMidi(previous.note) - anchorPitchClass) : null;
  const targetRelative = latest ? normalizeResearchPitchClass(pitchClassFromMidi(latest.note) - anchorPitchClass) : null;
  const generatorName = GENERATORS.find((option) => option.step === generatorStep)?.name ?? "interval";
  const orbitReading = `+${generator.step} st · ${generator.componentCount} ${generator.componentCount === 1 ? "loop" : "loops"} × ${generator.loopLength} positions`;
  const anchorLabel = pitchLabel(anchorPitchClass, doMidi, scale, showConventions);
  const doLabel = pitchLabel(doPitchClass, doMidi, scale, showConventions);
  const fieldSummary = fieldPitchClasses.length
    ? fieldPitchClasses.map((pitchClass) => pitchLabel(pitchClass, doMidi, scale, showConventions)).join(", ")
    : "no sounding or latest field";
  const clockSummary = `Chromatic clock anchored on ${anchorLabel}. Twelve fixed positions advance upward by one semitone clockwise. ${orbitReading} overlays repeated ${generatorName} steps. Current field: ${fieldSummary}.`;

  return <section className="piano-research-hud" aria-labelledby="piano-research-title">
    <header className="piano-research-intro">
      <div>
        <span>Research HUD · alternate interval spaces</span>
        <h3 id="piano-research-title">Keep the twelve notes fixed. Change only the relationship map.</h3>
        <p>The default clock makes geometric distance literal: one neighboring position is one semitone. The other views preserve different facts, so every view names what it reveals and what it folds away.</p>
      </div>
      <dl className="piano-research-context" aria-label="Shared live coordinate">
        <div><dt>spatial anchor</dt><dd>selected Do = {doLabel}</dd></div>
        <div><dt>selected route</dt><dd>{scale.name}</dd></div>
        <div><dt>evidence</dt><dd>{events.length}/12 shared attacks · {activeNotes.length} sounding</dd></div>
      </dl>
    </header>

    <div className="piano-research-layout-controls" aria-label="Research HUD note arrangement">
      {LAYOUTS.map((option) => <button key={option.id} type="button" aria-pressed={layout === option.id} onClick={() => setLayout(option.id)}><strong>{option.label}</strong><span>{option.short}</span></button>)}
    </div>

    {layout === "clock" ? <div className="piano-research-clock-layout">
      <div className="piano-research-generator-control">
        <label htmlFor="piano-research-generator"><span>Relationship overlay</span><select id="piano-research-generator" value={generatorStep} onChange={(event) => setGeneratorStep(Number(event.target.value))}>{GENERATORS.map((option) => <option key={option.step} value={option.step}>+{option.step} · {option.name}</option>)}</select></label>
        <div role="status" aria-live="polite"><strong>{orbitReading}</strong><small>Loop length = 12 ÷ gcd(12, {generator.step}). Node positions do not move.</small></div>
      </div>
      <div className="piano-research-clock-figure">
        <svg viewBox="0 0 640 500" role="img" aria-labelledby="piano-research-clock-title piano-research-clock-description">
          <title id="piano-research-clock-title">Fixed twelve-semitone clock with interval-generator overlay</title>
          <desc id="piano-research-clock-description">{clockSummary}</desc>
          <circle className="piano-research-clock-ring" cx="320" cy="248" r="176" />
          {clock.map((node) => {
            const inner = clockPoint(node.relativeSemitones, 162);
            const outer = clockPoint(node.relativeSemitones, 190);
            return <line key={`tick-${node.pitchClass}`} className="piano-research-clock-tick" x1={inner.x} y1={inner.y} x2={outer.x} y2={outer.y} />;
          })}
          {generator.components.map((component) => {
            const points = component.relativePositions.map((position) => clockPoint(position));
            if (points.length === 2) return <line key={`orbit-${component.index}`} className="piano-research-orbit is-pair" x1={points[0].x} y1={points[0].y} x2={points[1].x} y2={points[1].y}><title>{`Loop ${component.index + 1}: ${component.pitchClasses.join(", ")}`}</title></line>;
            const path = `M ${points.map((point) => `${point.x} ${point.y}`).join(" L ")} Z`;
            return <path key={`orbit-${component.index}`} className="piano-research-orbit" d={path}><title>{`Loop ${component.index + 1}: ${component.pitchClasses.join(", ")}`}</title></path>;
          })}
          {fieldPoints.length >= 2 ? <polyline className="piano-research-field-shape" points={fieldPath}><title>{`Current field: ${fieldSummary}`}</title></polyline> : null}
          {clock.map((node) => {
            const point = clockPoint(node.relativeSemitones);
            const count = recentCounts.get(node.pitchClass) ?? 0;
            const label = pitchLabel(node.pitchClass, doMidi, scale, showConventions);
            const states = [node.pitchClass === latestPitchClass ? "latest" : "", activePitchClasses.has(node.pitchClass) ? "sounding" : "", count ? `${count} recent attack${count === 1 ? "" : "s"}` : ""].filter(Boolean).join(", ") || "unplayed";
            return <g key={`node-${node.pitchClass}`} className={nodeStateClass(node.pitchClass, anchorPitchClass, latestPitchClass, activePitchClasses, recentCounts)} transform={`translate(${point.x} ${point.y})`}>
              <circle r="24"><title>{`+${node.relativeSemitones} semitones, ${node.intervalName}, ${label}, ${states}`}</title></circle>
              <text className="piano-research-node-offset" y="-2">{node.relativeSemitones === 0 ? "0" : `+${node.relativeSemitones}`}</text>
              <text className="piano-research-node-label" y="11">{label}</text>
              {count ? <text className="piano-research-node-count" x="20" y="-17">×{count}</text> : null}
            </g>;
          })}
          <g className="piano-research-clock-center">
            <text x="320" y="231">clock anchor</text>
            <text className="is-value" x="320" y="251">{anchorLabel}</text>
            <text x="320" y="271">clockwise = +1 st</text>
          </g>
        </svg>
        <div className="piano-research-map-key" aria-label="Clock mark key"><span><i className="is-latest" aria-hidden="true" />latest</span><span><i className="is-sounding" aria-hidden="true" />sounding</span><span><i className="is-recent" aria-hidden="true" />recent × count</span><span><i className="is-field" aria-hidden="true" />current field shape</span></div>
      </div>
      <aside className="piano-research-transition" aria-label="Latest physical semitone movement">
        <span>Latest sequential movement</span>
        {physicalDelta == null ? <><strong>Play two notes</strong><small>The exact attack-to-attack MIDI-key distance will appear here without folding away octaves.</small></> : <>
          <strong>{formatSigned(physicalDelta)} semitone{Math.abs(physicalDelta) === 1 ? "" : "s"} · {transitionDirection}</strong>
          <small>{transitionClass} after octave folding · {pitchLabel(pitchClassFromMidi(previous!.note), doMidi, scale, showConventions)} → {pitchLabel(pitchClassFromMidi(latest!.note), doMidi, scale, showConventions)}. The clock folds register; {Math.abs(physicalDelta)} st is the physical key spacing.</small>
        </>}
      </aside>
    </div> : null}

    {layout === "lattice" ? <div className="piano-research-lattice-layout">
      <div className="piano-research-lattice-axes" aria-label="Thirds lattice directions"><strong>→ +3 st · minor third</strong><strong>↓ +4 st · major third</strong><strong>↘ +7 st · perfect fifth</strong></div>
      <div className="piano-research-lattice" role="list" aria-label={`Four by three thirds lattice anchored on ${anchorLabel}. Right adds 3 semitones, down adds 4, and down-right adds 7. Every pitch class occurs once. Current field: ${fieldSummary}.`}>
        {lattice.map((cell) => {
          const count = recentCounts.get(cell.pitchClass) ?? 0;
          const classes = ["piano-research-lattice-cell", cell.relativeSemitones === 0 ? "is-anchor" : "", cell.pitchClass === latestPitchClass ? "is-latest" : "", activePitchClasses.has(cell.pitchClass) ? "is-sounding" : "", count ? "is-recent" : ""].filter(Boolean).join(" ");
          return <div key={`${cell.x}-${cell.y}`} className={classes} role="listitem" aria-label={`+${cell.relativeSemitones} semitones, ${cell.intervalName}, ${pitchLabel(cell.pitchClass, doMidi, scale, showConventions)}${count ? `, ${count} recent attacks` : ""}${activePitchClasses.has(cell.pitchClass) ? ", sounding" : ""}`}>
            <span>{cell.relativeSemitones === 0 ? "0 st" : `+${cell.relativeSemitones} st`}</span><strong>{pitchLabel(cell.pitchClass, doMidi, scale, showConventions)}</strong><small>{cell.intervalName}{count ? ` · ×${count}` : ""}</small>
          </div>;
        })}
      </div>
      <p className="piano-research-lattice-reading">A major-triad pitch-class shape uses the anchor, one step down (+4), and one step down-right (+7). A minor-triad shape uses the anchor, one step right (+3), and the same down-right fifth; translating either shape preserves intervals, not musical function.</p>
    </div> : null}

    {layout === "matrix" ? <div className="piano-research-matrix-layout">
      <div className="piano-research-matrix-axis"><strong>row source → column target</strong><span>cell = upward semitones mod 12</span></div>
      <table className="piano-research-matrix" aria-describedby="piano-research-matrix-reading">
        <caption className="sr-only">Every directed pitch-class interval relative to selected Do. Rows are sources, columns are targets, and each cell is upward semitones modulo twelve.</caption>
        <thead><tr><th scope="col">from<br />to</th>{clock.map((node) => <th key={`target-${node.index}`} scope="col">+{node.index}</th>)}</tr></thead>
        <tbody>{matrix.map((row, sourceIndex) => <tr key={`source-${sourceIndex}`}><th scope="row">+{sourceIndex}</th>{row.map((cell) => <td key={`${cell.sourceIndex}-${cell.targetIndex}`} className={sourceRelative === sourceIndex && targetRelative === cell.targetIndex ? "is-latest-pair" : ""} aria-label={`From +${cell.sourceIndex} to +${cell.targetIndex}: ${cell.semitones} semitones, ${cell.intervalName}`}>{cell.semitones}</td>)}</tr>)}</tbody>
      </table>
      <p id="piano-research-matrix-reading">Read one cell in each direction: source→target and target→source usually sum to 12. The two directions are exact pitch-class facts, not two levels of musical closeness.</p>
    </div> : null}

    <div className="piano-research-boundaries">
      <div><span>This map shows</span><strong>{LAYOUT_BOUNDARIES[layout].shows}</strong></div>
      <div><span>This map hides</span><strong>{LAYOUT_BOUNDARIES[layout].hides}</strong></div>
      <p><b>Circle-of-fifths boundary:</b> it is exactly the <code>+7 mod 12</code> generator path. Immediate neighbors are a fifth upward or a fourth in reverse; farther path distance counts repeated fifth steps, not generic note affinity, consonance, harmonic function, resolution, emotion, or quality. It closes in 12-TET because gcd(7,12)=1; pure 3:2 fifths do not close exactly after twelve steps.</p>
      <small>All three layouts use MIDI-key pitch classes under the A4=440 12-TET reference. They do not measure acoustic pitch, piano tuning, overtones, loudness, or listening experience.</small>
    </div>
  </section>;
}
