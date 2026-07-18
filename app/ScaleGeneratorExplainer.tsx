"use client";

import { useMemo, useState } from "react";
import {
  CHROMATIC_DEGREE_ADDRESSES,
  EQUAL_TEMPERED_FIFTH_CENTS,
  FIFTH_SHIFT_EXAMPLES,
  MAJOR_FIFTH_WINDOW,
  MAJOR_GAPS,
  MAJOR_POSITIONS,
  PURE_FIFTH_CENTS,
  PYTHAGOREAN_COMMA_CENTS,
  REHOMED_MAJOR_WITHOUT_REPAIR,
  REHOMED_UNCHANGED_GAPS,
  SEVEN_PURE_FIFTH_BOUNDARY_CENTS,
  fifthShiftProfile,
  generatorOrbit,
  generatorWindow,
} from "@/lib/scale-generator-model";

type DerivationStage = "major" | "rehome" | "repair" | "window";

type ScaleGeneratorExplainerProps = {
  audioPlaying: boolean;
  audioStatus: string;
  onPlayRoute: (positions: number[], octaveOffsets: number[], label: string) => void;
  onStopAudio: () => void;
  onNext: () => void;
};

const DERIVATION_STAGES: Array<{ id: DerivationStage; number: string; label: string; action: string }> = [
  { id: "major", number: "1", label: "Current major", action: "hold the gap route" },
  { id: "rehome", number: "2", label: "Make Sol Do", action: "move home, not pitch" },
  { id: "repair", number: "3", label: "Lift Te to Ti", action: "move one position" },
  { id: "window", number: "4", label: "Slide the window", action: "see why it is one sharp" },
];

const GENERATOR_OPTIONS = [
  { step: 1, name: "semitone", note: "stepwise clock" },
  { step: 2, name: "whole step", note: "two six-position loops" },
  { step: 3, name: "small third", note: "three four-position loops" },
  { step: 4, name: "large third", note: "four three-position loops" },
  { step: 5, name: "fourth", note: "fifths in reverse" },
  { step: 6, name: "tritone", note: "six two-position loops" },
  { step: 7, name: "fifth", note: "near the ratio 3:2" },
] as const;

const CURRENT_ROLE_BY_POSITION = new Map([
  [0, "Do"], [2, "Re"], [4, "Mi"], [5, "Fa"], [7, "Sol"], [9, "La"], [11, "Ti"],
]);

const REHOMED_ROLE_BY_POSITION = new Map([
  [0, "Do"], [2, "Re"], [4, "Mi"], [5, "Fa"], [7, "Sol"], [9, "La"], [10, "Te"],
]);

const OLD_ROLE_FROM_NEW_DO = new Map([
  [0, "old Sol"], [2, "old La"], [4, "old Ti"], [5, "old Do"], [7, "old Re"], [9, "old Mi"], [10, "old Fa"], [11, "old Fi"],
]);

const OLD_ROLE_BY_ABSOLUTE_POSITION = new Map([
  [0, "Do"], [2, "Re"], [4, "Mi"], [5, "Fa"], [6, "Fi"], [7, "Sol"], [9, "La"], [11, "Ti"],
]);

const AUDIO_ROUTES = [
  {
    id: "major",
    label: "Hear current major from Do",
    positions: [0, 2, 4, 5, 7, 9, 11, 0],
    octaves: [0, 0, 0, 0, 0, 0, 0, 1],
    playbackLabel: "the current major route from old Do",
  },
  {
    id: "rehome",
    label: "Hear the same pitches from Sol",
    positions: [7, 9, 11, 0, 2, 4, 5, 7],
    octaves: [0, 0, 0, 1, 1, 1, 1, 1],
    playbackLabel: "the unchanged pitches from old Sol, now new Do",
  },
  {
    id: "repair",
    label: "Hear the repaired next major",
    positions: [7, 9, 11, 0, 2, 4, 6, 7],
    octaves: [0, 0, 0, 1, 1, 1, 1, 1],
    playbackLabel: "the next major route after old Fa rises to Fi",
  },
] as const;

const STAGE_COPY: Record<Exclude<DerivationStage, "window">, { eyebrow: string; title: string; body: string; summary: string }> = {
  major: {
    eyebrow: "Start with one major-shaped route",
    title: "Do · Re · Mi · Fa · Sol · La · Ti",
    body: "The pitches follow 2–2–1–2–2–2–1 semitone gaps. Sol is degree 5, seven semitones above Do.",
    summary: "Current Do frame. Major gap route 2, 2, 1, 2, 2, 2, 1 semitones.",
  },
  rehome: {
    eyebrow: "Change the reference; hold every pitch",
    title: "Old Sol becomes new Do",
    body: "Read the unchanged collection upward from old Sol. Old Fa now sits ten semitones above new Do, so its new role is Te. The result is a Mixolydian-shaped 2–2–1–2–2–1–2 route.",
    summary: "Old Sol is new Do. No pitch moved. The unchanged collection ends on Te at ten semitones, giving gaps 2, 2, 1, 2, 2, 1, 2.",
  },
  repair: {
    eyebrow: "Restore the original gap pattern",
    title: "Old Fa rises to Fi · new Te rises to Ti",
    body: "Move only that final role from ten to eleven semitones above new Do. Six pitch positions stay fixed, and the major route returns.",
    summary: "One position moves from ten to eleven semitones: old Fa to Fi, which is new Te to Ti. Major gap route restored; six positions retained.",
  },
};

const WINDOW_STAGE_SUMMARY = "Current fifth window Fa, Do, Sol, Re, La, Mi, Ti. Next window Do, Sol, Re, La, Mi, Ti, Fi. Fa leaves, Fi enters, and six positions stay. Seven window positions times a seven-semitone generator leaves a remainder of one modulo twelve.";

function GapStrip({ gaps, labels, ariaLabel }: { gaps: readonly number[]; labels: readonly string[]; ariaLabel: string }) {
  return (
    <ol className="generator-gap-strip" aria-label={ariaLabel}>
      {gaps.map((gap, index) => (
        <li key={`${labels[index]}-${gap}-${index}`} style={{ flexGrow: gap }}>
          <strong>{gap}</strong>
          <i aria-hidden="true" />
          <small>{labels[index]} → {labels[(index + 1) % labels.length]}</small>
        </li>
      ))}
    </ol>
  );
}

function MajorDegreeRail({ stage }: { stage: Exclude<DerivationStage, "window"> }) {
  const positions = stage === "rehome" ? [...REHOMED_MAJOR_WITHOUT_REPAIR] : [...MAJOR_POSITIONS];
  const roles = stage === "rehome" ? REHOMED_ROLE_BY_POSITION : CURRENT_ROLE_BY_POSITION;
  const gaps = stage === "rehome" ? REHOMED_UNCHANGED_GAPS : MAJOR_GAPS;
  const labels = stage === "rehome" ? ["Do", "Re", "Mi", "Fa", "Sol", "La", "Te"] : ["Do", "Re", "Mi", "Fa", "Sol", "La", "Ti"];
  const copy = STAGE_COPY[stage];
  return (
    <div className="generator-major-reading">
      <div className="generator-stage-copy">
        <span>{copy.eyebrow}</span>
        <h4>{copy.title}</h4>
        <p>{copy.body}</p>
      </div>
      <p className="generator-axis-note">Axis: semitones above {stage === "major" ? "current Do" : "new Do"}. When old Sol becomes new Do, the axis re-zeroes; the inherited pitches themselves do not move.</p>
      <div className="generator-degree-rail" role="img" aria-label={copy.summary}>
        {Array.from({ length: 12 }, (_, position) => {
          const active = positions.includes(position);
          const role = roles.get(position);
          const oldRole = stage === "major" ? null : OLD_ROLE_FROM_NEW_DO.get(position);
          const isNextHome = stage === "major" && position === 7;
          const mismatch = stage === "rehome" && position === 10;
          const entering = stage === "repair" && position === 11;
          const departed = stage === "repair" && position === 10;
          return (
            <div key={position} className={`${active ? "is-present" : ""} ${isNextHome ? "is-next-home" : ""} ${mismatch ? "is-mismatch" : ""} ${entering ? "is-entering" : ""} ${departed ? "is-departed" : ""}`}>
              <span>{position} st</span>
              <strong>{active ? role : departed ? "Te" : "·"}</strong>
              <small>{active ? oldRole ?? (isNextHome ? "degree 5 · next home" : position === 0 ? "current home" : "scale pitch") : departed ? "lifted away" : "outside"}</small>
            </div>
          );
        })}
      </div>
      <GapStrip gaps={gaps} labels={labels} ariaLabel={`${stage === "rehome" ? "Unchanged re-homed" : "Major"} scale gap route: ${gaps.join(", ")} semitones`} />
    </div>
  );
}

function FifthWindowReading() {
  const currentVisits = MAJOR_FIFTH_WINDOW.visits;
  const nextOrdered = [0, 7, 2, 9, 4, 11, 6];
  return (
    <div className="generator-window-reading">
      <div className="generator-stage-copy">
        <span>Generator order · not scale order</span>
        <h4>A diatonic collection is a seven-stop window; with Do second, its upward route is major.</h4>
        <p>Slide that window one fifth. Its left endpoint leaves, its right endpoint enters, and the six positions between them stay.</p>
      </div>
      <div className="fifths-window-comparison" role="img" aria-label="Current fifth window Fa, Do, Sol, Re, La, Mi, Ti. Next window Do, Sol, Re, La, Mi, Ti, Fi. Fa leaves, Fi enters, and six positions stay.">
        <div className="fifths-window-row is-current">
          <span>current</span>
          {currentVisits.map((visit, index) => (
            <div key={`${visit.absolutePosition}-${index}`} className={index === 0 ? "is-leaving" : "is-retained"}>
              <strong>{OLD_ROLE_BY_ABSOLUTE_POSITION.get(visit.absolutePosition)}</strong>
              <small>{index === 0 ? "leaves" : "+7 st neighbor"}</small>
            </div>
          ))}
        </div>
        <div className="fifths-window-row is-next">
          <span>next</span>
          {nextOrdered.map((position, index) => (
            <div key={`${position}-${index}`} className={index === nextOrdered.length - 1 ? "is-entering" : "is-retained"}>
              <strong>{OLD_ROLE_BY_ABSOLUTE_POSITION.get(position)}</strong>
              <small>{index === nextOrdered.length - 1 ? "enters" : "stays"}</small>
            </div>
          ))}
        </div>
      </div>
      <div className="generator-boundary-equation">
        <span>window length × generator</span>
        <strong>7 × 7 = 49 ≡ 1 mod 12</strong>
        <p>The entering boundary is one equal-tempered semitone above the departing boundary: Fa → Fi. Counterclockwise, 7 × 5 ≡ −1: old Ti falls to Te—new Fi falls to Fa—so the same logic produces one flat.</p>
      </div>
    </div>
  );
}

function pointOnClock(position: number, radius: number) {
  const angle = position / 12 * Math.PI * 2 - Math.PI / 2;
  return { x: 190 + Math.cos(angle) * radius, y: 190 + Math.sin(angle) * radius };
}

function GeneratorClock({ generator, windowSize }: { generator: number; windowSize: number }) {
  const orbit = generatorOrbit(generator);
  const window = generatorWindow(generator, windowSize);
  const orbitSet = new Set(orbit.positions);
  const windowSet = new Set(window.absolutePositions);
  const leavingSet = new Set(window.removedPositions);
  const enteringSet = new Set(window.addedPositions);
  const orbitPoints = orbit.positions.map((position) => pointOnClock(position, 118));
  const path = orbitPoints.map((point, index) => `${index === 0 ? "M" : "L"} ${point.x} ${point.y}`).join(" ") + (orbitPoints.length > 2 ? " Z" : "");
  const description = `Repeated move plus ${generator} semitones modulo twelve. The loop beginning at Do visits ${orbit.positions.join(", ")} and returns after ${orbit.cycleLength} moves. Across all twelve positions, this move partitions the clock into ${orbit.componentCount} separate loop${orbit.componentCount === 1 ? "" : "s"}. A ${windowSize}-visit window contains ${window.distinctCount} distinct positions and produces ${window.collectionLabel} with relative gaps ${window.gaps.join(", ")} semitones.`;
  return (
    <div className="generator-clock" role="img" aria-label={description}>
      <svg viewBox="0 0 380 380" aria-hidden="true">
        <circle cx="190" cy="190" r="118" className="generator-clock-ring" />
        <path d={path} className="generator-orbit-path" />
        {Array.from({ length: 12 }, (_, position) => {
          const node = pointOnClock(position, 118);
          const label = pointOnClock(position, 151);
          const orbitIndex = orbit.positions.indexOf(position);
          const address = CHROMATIC_DEGREE_ADDRESSES[position];
          return (
            <g key={position} className={`${orbitSet.has(position) ? "is-orbit" : "is-outside-orbit"} ${windowSet.has(position) ? "is-window" : ""} ${position === 0 ? "is-home" : ""} ${leavingSet.has(position) ? "is-leaving" : ""} ${enteringSet.has(position) ? "is-entering" : ""}`}>
              <circle cx={node.x} cy={node.y} r={windowSet.has(position) ? 12 : 8} />
              {orbitIndex >= 0 ? <text x={node.x} y={node.y + 3} className="generator-orbit-index">{orbitIndex}</text> : null}
              <text x={label.x} y={label.y + 3} className="generator-clock-label">{address.syllable.split(" / ")[0]}</text>
            </g>
          );
        })}
        <text x="190" y="181" className="generator-clock-center-label">repeat</text>
        <text x="190" y="202" className="generator-clock-center-value">+{generator} mod 12</text>
        <text x="190" y="220" className="generator-clock-center-note">{orbit.cycleLength} moves to return</text>
      </svg>
      <small>Node numbers show visit order from Do. A thicker node is inside the selected window; dashed and heavy endpoints mark what leaves or enters on the next slide.</small>
    </div>
  );
}

function AlternativeGeneratorWorkbench() {
  const [generator, setGenerator] = useState(7);
  const [windowSize, setWindowSize] = useState(7);
  const orbit = useMemo(() => generatorOrbit(generator), [generator]);
  const window = useMemo(() => generatorWindow(generator, windowSize), [generator, windowSize]);
  const selectedOption = GENERATOR_OPTIONS.find((option) => option.step === generator)!;
  const takeOrder = window.visits.map((visit) => {
    const address = CHROMATIC_DEGREE_ADDRESSES[visit.relativePosition].syllable;
    return `${address}${visit.repeated ? " again" : ""}`;
  }).join(" → ");
  const boundaryReading = window.stableAfterShift
    ? `The window already covers this whole loop, so the next slide changes no membership.`
    : `Next slide: ${window.removedPositions.map((position) => CHROMATIC_DEGREE_ADDRESSES[position].syllable).join(", ")} leaves; ${window.addedPositions.map((position) => CHROMATIC_DEGREE_ADDRESSES[position].syllable).join(", ")} enters. Boundary remainder ${window.boundaryRemainder} mod 12.`;
  const liveSummary = `Plus ${generator} ${selectedOption.name}. The Do loop returns after ${orbit.cycleLength} moves, and the move partitions all twelve positions into ${orbit.componentCount} loop${orbit.componentCount === 1 ? "" : "s"}. The ${windowSize}-visit window has ${window.distinctCount} distinct positions, labeled ${window.collectionLabel}, with cyclic gaps ${window.gaps.join(", ")} semitones. ${boundaryReading}`;
  return (
    <section className="alternative-generator-workbench" aria-labelledby="alternative-generator-title">
      <div className="generator-section-heading">
        <div><span>Change the repeated move</span><h3 id="alternative-generator-title">What if the circle used another interval?</h3></div>
        <p>A generator supplies an order, not a tonic or a scale by itself. The full +7 orbit is chromatic; major appears only after selecting a seven-stop window and where Do sits. Choose another repeated move and window to see what changes.</p>
      </div>

      <fieldset className="generator-options">
        <legend>Repeat one interval and fold every landing into twelve semitone positions</legend>
        {GENERATOR_OPTIONS.map((option) => (
          <button key={option.step} type="button" aria-pressed={generator === option.step} onClick={() => setGenerator(option.step)}>
            <strong>+{option.step} · {option.name}</strong>
            <small>{option.note}</small>
          </button>
        ))}
      </fieldset>

      <div className="generator-window-control">
        <label htmlFor="generator-window-size"><span>Visits inside the window</span><output>{windowSize}</output></label>
        <input id="generator-window-size" type="range" min="2" max="12" step="1" value={windowSize} onChange={(event) => setWindowSize(Number(event.target.value))} />
        <small>The first visit is one generator step below Do; the second visit is Do. Repeated landings do not create new scale positions. With +7, seven visits make major; five visits make a mode of the same anhemitonic pentatonic set, while putting Do at the first stop would make major pentatonic.</small>
      </div>

      <div className="generator-explorer">
        <GeneratorClock generator={generator} windowSize={windowSize} />
        <div className="generator-explorer-reading">
          <div className="generator-result-title">
            <span>+{generator} {selectedOption.name} · {windowSize}-visit window</span>
            <h4>{window.collectionLabel}</h4>
            <p>{window.distinctCount} distinct octave position{window.distinctCount === 1 ? "" : "s"}. Take order: {takeOrder}.</p>
          </div>
          <dl className="generator-math-reading">
            <div><dt>orbit closure</dt><dd><strong>{orbit.cycleLength} moves</strong><span>12 ÷ gcd(12, {generator})</span></dd></div>
            <div><dt>clock partitions into</dt><dd><strong>{orbit.componentCount} loop{orbit.componentCount === 1 ? "" : "s"}</strong><span>gcd(12, {generator})</span></dd></div>
            <div><dt>next window</dt><dd><strong>{window.stableAfterShift ? "same membership" : `${window.retainedPositions.length} stay · 1 changes`}</strong><span>{window.coversFullOrbit ? "full starting loop covered" : `${windowSize} × ${generator} ≡ ${window.boundaryRemainder} mod 12`}</span></dd></div>
          </dl>
          <div className="generator-relative-route" role="img" aria-label={`${window.collectionLabel} sorted upward from Do: ${window.relativePositions.map((position) => `${CHROMATIC_DEGREE_ADDRESSES[position].syllable} at ${position} semitones`).join(", ")}. Cyclic gaps ${window.gaps.join(", ")} semitones.`}>
            {window.relativePositions.map((position) => (
              <div key={position}>
                <strong>{CHROMATIC_DEGREE_ADDRESSES[position].syllable}</strong>
                <span>{CHROMATIC_DEGREE_ADDRESSES[position].degree}</span>
                <small>+{position} st</small>
              </div>
            ))}
          </div>
          <GapStrip gaps={window.gaps} labels={window.relativePositions.map((position) => CHROMATIC_DEGREE_ADDRESSES[position].syllable)} ariaLabel={`${window.collectionLabel} cyclic gaps: ${window.gaps.join(", ")} semitones`} />
          <p className="generator-live-reading">{boundaryReading}</p>
          <p className="sr-only generator-workbench-live-summary" role="status" aria-live="polite" aria-atomic="true">{liveSummary}</p>
        </div>
      </div>

      <div className="generator-stability-ledger" aria-label="Three meanings of stability kept separate">
        <div><span>Mathematical closure</span><strong>The Do loop returns after {orbit.cycleLength} moves</strong><p>The move partitions the full clock into {orbit.componentCount} loop{orbit.componentCount === 1 ? "" : "s"}. This says nothing about which position is musical home.</p></div>
        <div><span>Structural symmetry</span><strong>{window.gaps.every((gap) => gap === window.gaps[0]) ? "every local gap matches" : "local gaps are unequal"}</strong><p>Equal spacing can remove a unique geometric center; unequal spacing can create landmarks.</p></div>
        <div><span>Musical home</span><strong>not generated by the loop</strong><p>Phrase, repetition, bass, style, and a listener can establish a center that the arithmetic does not detect.</p></div>
      </div>
    </section>
  );
}

function OtherScaleComparison() {
  return (
    <section className="generator-scale-comparison" aria-labelledby="generator-scale-comparison-title">
      <div className="generator-section-heading">
        <div><span>Does it apply beyond major?</span><h3 id="generator-scale-comparison-title">Transposition always preserves the shape. One-out/one-in membership does not.</h3></div>
        <p>Each row compares a pitch collection with the same shape moved up seven semitones. “Replaced” counts one pitch leaving and one entering as one membership replacement.</p>
      </div>
      <div className="generator-comparison-table" role="table" aria-label="Pitch collection overlap after transposition by a fifth">
        <div role="row" className="generator-table-head"><span role="columnheader">Scale shape</span><span role="columnheader">Absolute positions retained</span><span role="columnheader">Why</span></div>
        {FIFTH_SHIFT_EXAMPLES.map((example) => {
          const profile = fifthShiftProfile(example);
          return (
            <div role="row" key={example.id}>
              <strong role="rowheader">{example.label}</strong>
              <span role="cell">{profile.retained.length}/{profile.source.length} stay · {profile.replacements} replaced</span>
              <p role="cell">{example.reason}</p>
            </div>
          );
        })}
      </div>
      <p className="generator-comparison-note">Re-homing unchanged pitches and transposing a named scale are different operations. Old Sol as new Do turns unchanged major into Mixolydian; changing Te to Ti then restores the major species. Across fixed diatonic modes, the old role that rises is major Fa, Dorian Me, Phrygian Ra, Lydian Do, Mixolydian Te, natural-minor Le, or Locrian Se. Locrian needs a caveat: its scale degree 5 is a lowered fifth, so “make degree 5 home” is not the circle’s +7-semitone move.</p>
    </section>
  );
}

function BoundedMeaning() {
  return (
    <section className="generator-boundary" aria-labelledby="generator-boundary-title">
      <div className="generator-section-heading">
        <div><span>How arbitrary is it?</span><h3 id="generator-boundary-title">Contingent at the boundary; exact inside it.</h3></div>
        <p>The circle becomes inevitable only after several musical and mathematical choices have already been made.</p>
      </div>
      <div className="generator-boundary-grid">
        <div><span>Chosen frame</span><strong>octave equivalence · 12 equal positions · +7 generator · seven-stop window · chosen Do</strong><p>These are useful premises, not universal facts about all music. The top of the drawing and clockwise direction are conventions too.</p></div>
        <div><span>Forced inside that frame</span><strong>one 12-position orbit · six shared major positions · Fa → Fi</strong><p>Because gcd(12, 7) = 1 and 7 × 7 ≡ 1 mod 12. Once the premises are fixed, the sharp is not arbitrary.</p></div>
        <div><span>Not implied</span><strong>tonic detection · function · resolution · consonance · emotion · quality</strong><p>Octave folding discards absolute height and register. A pitch class alone cannot tell which registral direction or compound interval was played. The arithmetic contains no rhythm, voicing, timbre, culture, intention, or listener report.</p></div>
      </div>
      <div className="generator-tuning-boundary" role="note">
        <div><span>12-TET circle</span><strong>{EQUAL_TEMPERED_FIFTH_CENTS.toFixed(0)} cents</strong><p>Twelve equal-tempered fifth steps equal seven octaves exactly, so +7 closes in the keyboard model. The +7 choice is motivated, not forced: it approximates 3:2 within {Math.abs(PURE_FIFTH_CENTS - EQUAL_TEMPERED_FIFTH_CENTS).toFixed(3)} cents.</p></div>
        <div><span>Pure 3:2 spiral</span><strong>{PURE_FIFTH_CENTS.toFixed(3)} cents</strong><p>Twelve pure fifths overshoot seven octaves by {PYTHAGOREAN_COMMA_CENTS.toFixed(2)} cents. Seven pure fifths fold to {SEVEN_PURE_FIFTH_BOUNDARY_CENTS.toFixed(2)} cents, not one 100-cent keyboard step.</p></div>
      </div>
      <p className="generator-final-claim"><strong>The circle of fifths is an exact map of one modular pitch-class relationship after 12-TET and enharmonic equivalence are chosen.</strong> It maps 12-TET pitch-class and conventional diatonic-key adjacency, but written spellings such as Fi and Se remain distinct outside the twelve-node loop. The seven-note window is a Western diatonic choice; neither it nor a tonic follows from modular arithmetic alone. This is not a complete map of harmony or musical meaning.</p>
    </section>
  );
}

export function ScaleGeneratorExplainer({ audioPlaying, audioStatus, onPlayRoute, onStopAudio, onNext }: ScaleGeneratorExplainerProps) {
  const [stage, setStage] = useState<DerivationStage>("major");
  return (
    <section className="scale-lesson generator-lesson" aria-labelledby="generator-lesson-title">
      <div className="lesson-heading"><span>03 · Generate and re-home scales</span><h3 id="generator-lesson-title">The fifth is not sharpened. The fifth becomes home.</h3><p>To move a major scale one fifth higher, make old Sol the new Do. Then raise old Fa to Fi—new Te to Ti—so the major gap route returns.</p></div>

      <section className="generator-derivation" aria-labelledby="generator-derivation-title">
        <div className="generator-section-heading">
          <div><span>Take five; lift four</span><h3 id="generator-derivation-title">Make Sol home. What breaks?</h3></div>
          <p>Step through the same pitch collection in movable scale-degree language. Only the final repair changes a physical pitch position.</p>
        </div>
        <div className="generator-derivation-controls" role="group" aria-label="Circle of fifths major-scale derivation stages">
          {DERIVATION_STAGES.map((item) => (
            <button key={item.id} type="button" aria-pressed={stage === item.id} aria-controls="generator-derivation-reading" onClick={() => setStage(item.id)}>
              <span>{item.number}</span><strong>{item.label}</strong><small>{item.action}</small>
            </button>
          ))}
        </div>
        <div id="generator-derivation-reading" className="generator-derivation-visual">
          {stage === "window" ? <FifthWindowReading /> : <MajorDegreeRail stage={stage} />}
        </div>
        <p className="sr-only generator-derivation-live-summary" role="status" aria-live="polite" aria-atomic="true">{stage === "window" ? WINDOW_STAGE_SUMMARY : STAGE_COPY[stage].summary}</p>
        <div className="generator-audio-actions" aria-label="Hear the three scale routes">
          {AUDIO_ROUTES.map((route) => <button key={route.id} type="button" onClick={() => onPlayRoute([...route.positions], [...route.octaves], route.playbackLabel)}>{route.label}</button>)}
          {audioPlaying ? <button type="button" onClick={onStopAudio}>Stop sound</button> : null}
        </div>
        <p className="audio-status" role="status" aria-live="polite">{audioStatus}</p>
      </section>

      <AlternativeGeneratorWorkbench />
      <OtherScaleComparison />
      <BoundedMeaning />

      <div className="lesson-next"><span>Can you separate the orbit, the selected pitch window, and the musical home?</span><button type="button" onClick={onNext}>Next: hear what comes next</button></div>
    </section>
  );
}
