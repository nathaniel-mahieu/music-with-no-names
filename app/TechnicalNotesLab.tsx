"use client";

import { useRef, useState } from "react";

type Destination = "ratio" | "scale" | "piano" | "voice" | "ear" | "harmony" | "rhythm" | "journey" | "recording" | "atlas" | "personal";

const IMPLEMENTED = [
  {
    title: "Piano companion",
    status: "live MIDI · silent input",
    body: "Sound Finder, Interval Glow, and Immersion are the primary working surfaces. Explore, Sight Shapes, and Scales remain visibly marked To do while their prototype material is refined. Secondary working views include EchoKey, Score Flow, Scale Quality, Scale Gravity, Intervals, Chords, Motion, Paths, Research, and Experience.",
    destination: "piano" as const,
    action: "Open Piano",
  },
  {
    title: "Voice workspace",
    status: "live microphone · local analysis",
    body: "Choose a microphone and A4=440 reference, hear a target, estimate one monophonic fundamental, follow target-relative cents and a 3.2-second pitch trail, inspect detector periodicity and recent spread, or compare the live spectrum with ideal target harmonics.",
    destination: "voice" as const,
    action: "Open Voice",
  },
  {
    title: "Foundations",
    status: "generated teaching examples",
    body: "Ratio, Scale, Ear, Harmony, Rhythm, and Journey separate physical coordinates, assumed auditory models, temporal evidence, and listener response. Their sounds are synthesized only after an explicit play action.",
    destination: "ratio" as const,
    action: "Open Ratio",
  },
  {
    title: "Local music",
    status: "files stay on this device",
    body: "Recording analyzes a locally chosen audio file. Score Flow parses one MusicXML part and compares silent MIDI with written landings. Atlas and Personal Lens align declared landmarks and learner reports. Spotify, when embedded, is independent listening only: it never drives score timing, reveal, or grading.",
    destination: "recording" as const,
    action: "Open Recording",
  },
];

const EVIDENCE_LAYERS = [
  ["Browser-observed", "MIDI note number, channel, attack value, timestamps, key release, sustain; live microphone samples; locally decoded audio; and locally parsed MusicXML."],
  ["Declared coordinate", "A4=440 equal-tempered reference, movable Do, selected scale, chord grouping window, pulse, score range, and learner-chosen practice settings."],
  ["Teaching model", "Pitch estimates, spectral interaction proxies, scale compatibility, tonal-tendency heuristics, grouping, and piece-local prediction under visible assumptions."],
  ["Human report", "Felt character, liking, familiarity, expectation, intention, and usefulness belong to the learner unless they explicitly enter them."],
];

const MODELS = [
  ["mwno-math-1", "Ratio, waveform, cents, period, harmonic-partial, and log-frequency utilities."],
  ["mwno-ear-2", "Roughness, critical-band energy, spectral overlap, harmonic-template, and fusion teaching hypotheses for declared spectra."],
  ["mwno-sonority-2", "Separate sonority structure, sensory proxies, recent motion, and conditional affordances; never an emotion or consonance verdict."],
  ["mwno-piano-77", "The current bounded MIDI relationship system, including its semitone, scale, chord, phrase, Immersion, Research, and score-practice coordinates."],
  ["mwno-voice-2", "Uncalibrated monophonic pitch estimation. The live implementation uses a 0.0015 RMS gate, a bounded 35–2400 Hz search, periodicity rejection, and target-relative smoothing."],
  ["mwno-rhythm-3", "Chord-clustered onset and release evidence, learner-declared pulse, and local timing ratios without beat or groove inference."],
  ["mwno-prediction-2", "Piece-local transition counts and explicit synthetic teaching priors; surprise is conditional on the declared predictor."],
  ["mwno-audio-0.3.0", "Versioned, multi-resolution descriptors for a locally decoded recording; corrections remain separate from measurements."],
  ["mwno-landmark.v1", "Curator-authored recording and score landmarks with source and uncertainty fields."],
  ["music-with-no-names.live-atlas.v1", "A bounded live-phrase bridge for recurrence, piece-local surprise, and timing activity."],
  ["mwno-personal-1", "Local listener-report terrain with visible sample-count uncertainty."],
];

const GLOSSARY = [
  ["frequency", "physical cycles per second, written in hertz"],
  ["pitch", "the perceived highness or lowness of a sound"],
  ["semitone", "one equal-tempered piano-key step; twelve steps double the reference frequency"],
  ["cent", "one hundredth of an equal-tempered semitone, used here as a logarithmic distance"],
  ["interval", "a relationship between two pitches; semitone size, ratio, direction, register, timing, and context describe different parts of it"],
  ["generic interval", "written staff distance such as a third; its exact semitone size can vary"],
  ["movable Do", "the learner-selected home reference, wherever it is placed"],
  ["scale", "an ordered loop of pitch gaps that repeats at an octave"],
  ["scale degree", "one position relative to the selected Do and scale"],
  ["transposition", "moving every pitch together while preserving relative spacing"],
  ["circle of fifths", "repeated +7-semitone motion folded into twelve equal-tempered pitch classes"],
  ["roughness", "a model of interaction among nearby simultaneous spectral components"],
  ["harmonicity", "fit to a declared harmonic template, not proof of a heard root"],
  ["fusion", "a deliberately simple hypothesis about several components forming one auditory object"],
  ["tonal tendency", "a contextual invitation to continue or settle, not a force or universal rule"],
  ["surprise", "the information assigned to an event after it occurs under one declared predictor"],
  ["fundamental estimate", "one likely repeating frequency in a monophonic microphone window; it can be withheld or mistaken"],
  ["notation spelling", "the written letter, accidental, octave, and staff position preserved from a score when available"],
];

const CHECKS = [
  {
    prompt: "A MIDI keyboard is connected. What reaches this site?",
    options: ["The instrument's audio", "Note and controller events", "A calibrated acoustic pitch"],
    answer: 1,
    explanation: "Web MIDI supplies event data. The instrument or DAW makes the sound; this site does not measure its tuning, spectrum, loudness, or room response.",
  },
  {
    prompt: "A sonority is modeled as rough and you enjoy it. Is one observation wrong?",
    options: ["Yes—roughness determines liking", "No—the model and your report answer different questions", "Yes—liking determines harmonicity"],
    answer: 1,
    explanation: "Spectral interaction under an assumed sound model and a listener's response are separate evidence.",
  },
  {
    prompt: "The microphone activity meter moves but no pitch appears. What follows?",
    options: ["The microphone is silent", "The voice is incorrect", "Samples arrived, but no sufficiently periodic monophonic estimate passed the gate"],
    answer: 2,
    explanation: "Input activity confirms sample energy only. Breath, speech, noise, a changing vowel, or several pitches can remain intentionally unlabelled.",
  },
  {
    prompt: "Can the embedded Spotify player synchronize Score Flow?",
    options: ["Yes, automatically", "Only after MIDI permission", "No—it is an independent listening reference"],
    answer: 2,
    explanation: "Spotify does not expose a shared timing map here, so it never drives the cursor, notation reveal, or performance evaluation.",
  },
];

export function TechnicalNotesLab({ onNavigate }: { onNavigate: (destination: Destination) => void }) {
  const [checkIndex, setCheckIndex] = useState(0);
  const [selectedAnswer, setSelectedAnswer] = useState<number | null>(null);
  const [answerRevealed, setAnswerRevealed] = useState(false);
  const firstAnswerRef = useRef<HTMLInputElement>(null);
  const check = CHECKS[checkIndex];

  const nextCheck = () => {
    setCheckIndex((index) => (index + 1) % CHECKS.length);
    setSelectedAnswer(null);
    setAnswerRevealed(false);
    window.requestAnimationFrame(() => firstAnswerRef.current?.focus());
  };

  return (
    <section className="advanced-lab technical-notes" aria-labelledby="technical-notes-title">
      <header className="technical-notes-header">
        <div>
          <p className="section-kicker">Technical Notes · current release</p>
          <h1 id="technical-notes-title">What the site measures, models, stores, and leaves to you.</h1>
          <p>Every display is browser input, a declared coordinate, a transparent teaching model, or your report. Keeping those layers separate matters more than producing one seductive score.</p>
        </div>
        <aside role="note"><span>Release boundary</span><strong>Educational, local-first, and uncalibrated.</strong><p>Automated tests cover arithmetic and software behavior—not your hardware, hearing, musical response, or learning.</p></aside>
      </header>

      <nav className="technical-jump-nav" aria-label="Technical Notes sections">
        <a href="#technical-implemented">Implemented</a>
        <a href="#technical-evidence">Evidence</a>
        <a href="#technical-models">Models</a>
        <a href="#technical-glossary">Glossary</a>
        <a href="#technical-safety">Safety</a>
      </nav>

      <section id="technical-implemented" className="technical-section" aria-labelledby="technical-implemented-title">
        <div className="technical-section-heading"><span>01 · Product inventory</span><h2 id="technical-implemented-title">What is actually implemented</h2><p>Working surfaces, visible prototypes, and external boundaries are named directly.</p></div>
        <div className="technical-inventory">
          {IMPLEMENTED.map((item) => <article key={item.title}><span>{item.status}</span><h3>{item.title}</h3><p>{item.body}</p><button type="button" onClick={() => onNavigate(item.destination)}>{item.action} →</button></article>)}
        </div>
      </section>

      <section id="technical-evidence" className="technical-section is-soft" aria-labelledby="technical-evidence-title">
        <div className="technical-section-heading"><span>02 · Evidence grammar</span><h2 id="technical-evidence-title">Four layers that should not be collapsed</h2><p>A visual can be precise without being a complete account of musical experience.</p></div>
        <div className="technical-evidence-grid">{EVIDENCE_LAYERS.map(([title, body], index) => <article key={title}><span>0{index + 1}</span><h3>{title}</h3><p>{body}</p></article>)}</div>
        <div className="technical-privacy">
          <article><span>Inputs</span><strong>MIDI is data, not audio.</strong><p>Voice audio is analyzed live and is not recorded or uploaded. Chosen MusicXML and recordings are parsed or decoded locally. Device names stay tab-local.</p></article>
          <article><span>Persistence</span><strong>Bounded browser storage only.</strong><p>Session storage retains the current Piano and score-practice state. Local storage keeps selected learner reports and bounded practice memory. There is no account or application backend.</p></article>
          <article><span>External media</span><strong>Spotify is not synchronized.</strong><p>An embedded player can support independent listening, but it does not move a score cursor, reveal notation, or grade performance.</p></article>
        </div>
      </section>

      <section id="technical-models" className="technical-section" aria-labelledby="technical-models-title">
        <div className="technical-section-heading"><span>03 · Version registry</span><h2 id="technical-models-title">Current teaching models</h2><p>These labels make assumptions inspectable. They are not calibration certificates or claims of empirical universality.</p></div>
        <dl className="technical-model-registry">{MODELS.map(([version, body]) => <div key={version}><dt>{version}</dt><dd>{body}</dd></div>)}</dl>
      </section>

      <section id="technical-glossary" className="technical-section is-soft" aria-labelledby="technical-glossary-title">
        <div className="technical-section-heading"><span>04 · Working language</span><h2 id="technical-glossary-title">Definitions used by the interface</h2><p>Terms name coordinates and hypotheses. None is a musical-quality score.</p></div>
        <dl className="technical-glossary">{GLOSSARY.map(([term, meaning]) => <div key={term}><dt>{term}</dt><dd>{meaning}</dd></div>)}</dl>
      </section>

      <section className="technical-section technical-check" aria-labelledby="technical-check-title">
        <div className="technical-section-heading"><span>05 · Boundary check</span><h2 id="technical-check-title">Can you identify what the evidence supports?</h2><p>This checks the model boundary, not musical ability.</p></div>
        <div className="technical-check-card">
          <strong>{String(checkIndex + 1).padStart(2, "0")} / {String(CHECKS.length).padStart(2, "0")}</strong>
          <fieldset><legend>{check.prompt}</legend>{check.options.map((option, index) => <label key={option} className={answerRevealed && index === check.answer ? "is-answer" : ""}><input ref={index === 0 ? firstAnswerRef : undefined} type="radio" name={`technical-check-${checkIndex}`} checked={selectedAnswer === index} disabled={answerRevealed} onChange={() => setSelectedAnswer(index)} /><span>{option}</span></label>)}</fieldset>
          <div className="technical-check-actions"><button type="button" disabled={selectedAnswer == null || answerRevealed} onClick={() => setAnswerRevealed(true)}>Show why</button>{answerRevealed ? <button type="button" onClick={nextCheck}>{checkIndex === CHECKS.length - 1 ? "Start over" : "Next boundary"}</button> : null}</div>
          {answerRevealed ? <p role="status"><strong>{selectedAnswer === check.answer ? "Supported" : "Separate the layers"}</strong>{check.explanation}</p> : null}
        </div>
      </section>

      <section id="technical-safety" className="technical-section technical-safety" aria-labelledby="technical-safety-title">
        <div className="technical-section-heading"><span>06 · Safety and validation</span><h2 id="technical-safety-title">Calibrate low. Compare briefly. Keep the claims bounded.</h2><p>Software checks cannot validate a physical listening level or a human learning outcome.</p></div>
        <div>
          <article><strong>Turn playback down first.</strong><p>Raise it only enough to hear the relationship. Stop if sound is uncomfortable and rest your ears during repeated comparisons.</p></article>
          <article><strong>Use headphones thoughtfully.</strong><p>They can prevent a Voice reference from leaking into the microphone, but they also place sound close to the ear.</p></article>
          <article><strong>Know what tests establish.</strong><p>The suite validates deterministic math, model fixtures, import boundaries, rendering contracts, accessibility markup, and builds—not acoustic calibration, comprehension, aesthetic response, or learning effectiveness.</p></article>
        </div>
      </section>
    </section>
  );
}
