"use client";

import { useRef, useState } from "react";

type Destination = "ratio" | "scale" | "ear" | "harmony" | "rhythm" | "journey" | "recording" | "atlas" | "personal";

const PATH: { number: string; title: string; question: string; destination: Destination; action: string }[] = [
  { number: "01", title: "Relationship", question: "What remains the same when every frequency moves?", destination: "ratio", action: "Open Ratio Lab" },
  { number: "02", title: "Scale shape", question: "How can movable Do turn unequal frequency gaps into a transposable map?", destination: "scale", action: "Open Scale Lab" },
  { number: "03", title: "Auditory reality", question: "Why does the same ratio change with spectrum and register?", destination: "ear", action: "Open Ear Lab" },
  { number: "04", title: "Time and embodiment", question: "How do duration ratios become pulse, resistance, and movement?", destination: "rhythm", action: "Open Rhythm Lab" },
  { number: "05", title: "Expectation and form", question: "How can rupture, uncertainty, and return make a larger arc?", destination: "journey", action: "Open Journey" },
  { number: "06", title: "Listener and purpose", question: "When does a musical strategy fit this person and goal?", destination: "personal", action: "Open Personal Lens" },
];

const GLOSSARY = [
  ["frequency", "physical cycles per second"],
  ["pitch", "a listener’s organization of periodic sound"],
  ["movable Do", "a culturally situated syllable for a chosen home relationship"],
  ["interval", "multiplicative pitch distance, heard across time or in overlap"],
  ["scale", "an octave-closing route made from an ordered set of relative gaps"],
  ["scale degree", "a position relative to a movable center, not an absolute letter"],
  ["transposition", "moving every absolute frequency while preserving the relationships"],
  ["roughness", "a sensory-interaction model for nearby components"],
  ["harmonicity", "fit to one or more harmonic templates"],
  ["fusion", "a report or hypothesis that sources form one object"],
  ["tension", "felt or modeled pressure toward continuation or change"],
  ["surprise", "information after an event under a declared predictor"],
  ["liking", "a listener report in one context and moment"],
];

const LEARNING_CHECKS: {
  prompt: string;
  options: string[];
  answer: number;
  explanation: string;
  destination: Destination;
  action: string;
}[] = [
  {
    prompt: "Two frequencies both double. What remains invariant?",
    options: ["Their physical frequencies", "Their frequency ratio", "Their register in the body"],
    answer: 1,
    explanation: "Both hertz values and the embodied register move, while the multiplicative relationship between them stays fixed.",
    destination: "ratio",
    action: "Test this in Ratio Lab",
  },
  {
    prompt: "The ratio stays fixed, but register and partial balance change. What may change?",
    options: ["Nothing perceptually relevant", "Only the conventional note name", "Roughness, brightness, fusion, and felt character"],
    answer: 2,
    explanation: "A ratio is an invariant relationship, not a complete sound. Absolute frequency and spectrum change how components interact in an ear.",
    destination: "ear",
    action: "Compare realizations in Ear Lab",
  },
  {
    prompt: "Do moves from 220 Hz to 280 Hz while every scale ratio stays fixed. What happened?",
    options: ["The scale was transposed", "A different degree became home", "The step order rotated"],
    answer: 0,
    explanation: "Transposition changes the absolute embodiment while preserving the ordered gaps, ratios, syllables, and degree relationships. Choosing a new home would change those home-relative relationships.",
    destination: "scale",
    action: "Run the transposition test",
  },
  {
    prompt: "When can upper-partial roughness help explain an interval in this lesson?",
    options: ["Whenever two degree names differ", "When harmonic spectra overlap in time", "Only when a melody returns to Do"],
    answer: 1,
    explanation: "Roughness is a model of simultaneous spectral interaction. A melodic interval unfolds across time, where memory, contour, distance, and context are more relevant explanations.",
    destination: "scale",
    action: "Compare melodic and simultaneous intervals",
  },
  {
    prompt: "A field is modeled as rough and you enjoy it. Is one observation wrong?",
    options: ["Yes—roughness determines liking", "No—sensory interaction and liking are different variables", "Yes—liking determines harmonicity"],
    answer: 1,
    explanation: "Roughness is a model of sensory interaction. Liking is your report in a context; friction can be expressive, energizing, or desired.",
    destination: "harmony",
    action: "Inspect the causal chain",
  },
  {
    prompt: "Which distinction correctly places uncertainty and surprise in time?",
    options: ["Both are measured only after an event", "Uncertainty is before; surprise is after", "Surprise is before; uncertainty is after"],
    answer: 1,
    explanation: "Uncertainty describes the spread of predicted alternatives before an event. Surprise scores the event that actually occurred under that predictor.",
    destination: "journey",
    action: "Follow the prediction lanes",
  },
  {
    prompt: "Can an abrasive instant contribute to a satisfying musical whole?",
    options: ["No—local discomfort fixes whole-form value", "Only if its ratio is a small integer", "Yes—contrast, expectation, memory, and return can change its role"],
    answer: 2,
    explanation: "A moment inherits meaning from its path. Rupture can intensify a return, and local comfort can diverge from whole-arc satisfaction.",
    destination: "journey",
    action: "Compare whole-form contexts",
  },
];

export function GuideLab({ onNavigate }: { onNavigate: (destination: Destination) => void }) {
  const [checkIndex, setCheckIndex] = useState(0);
  const [selectedAnswer, setSelectedAnswer] = useState<number | null>(null);
  const [answerRevealed, setAnswerRevealed] = useState(false);
  const [correctCount, setCorrectCount] = useState(0);
  const firstAnswerRef = useRef<HTMLInputElement>(null);
  const check = LEARNING_CHECKS[checkIndex];
  const answerIsCorrect = selectedAnswer === check.answer;
  const isLastCheck = checkIndex === LEARNING_CHECKS.length - 1;

  const revealAnswer = () => {
    if (selectedAnswer === null || answerRevealed) return;
    if (answerIsCorrect) setCorrectCount((count) => count + 1);
    setAnswerRevealed(true);
  };

  const nextCheck = () => {
    if (isLastCheck) {
      setCheckIndex(0);
      setCorrectCount(0);
    } else {
      setCheckIndex((index) => index + 1);
    }
    setSelectedAnswer(null);
    setAnswerRevealed(false);
    window.requestAnimationFrame(() => firstAnswerRef.current?.focus());
  };

  return (
    <section className="advanced-lab guide-lab" aria-labelledby="guide-title">
      <div className="guide-opening">
        <div>
          <p className="section-kicker">Start here · manipulation before terminology</p>
          <h2 id="guide-title">Music without names begins with one question.</h2>
          <p>What changed physically, what stayed invariant, what did a model predict, and what did <em>you</em> experience?</p>
          <button type="button" onClick={() => onNavigate("ratio")}>Begin with two vibrations <span aria-hidden="true">→</span></button>
        </div>
        <div className="representation-chain" role="img" aria-label="Physical sound becomes auditory evidence, temporal expectation, and a listener response conditioned by context">
          <div><span>physical</span><strong>frequency · spectrum · time</strong></div>
          <i aria-hidden="true">→</i>
          <div><span>perceptual</span><strong>roughness · fusion · pulse</strong></div>
          <i aria-hidden="true">→</i>
          <div><span>structural</span><strong>recurrence · uncertainty · release</strong></div>
          <i aria-hidden="true">→</i>
          <div><span>situated</span><strong>listener · purpose · history</strong></div>
        </div>
      </div>

      <div className="guide-path">
        <div className="guide-section-heading"><span>Learning path</span><h3>Build intuition by changing one factor.</h3><p>You do not need to finish in order. Each lab keeps physical evidence, model hypotheses, and human reports visibly separate.</p></div>
        <div className="guide-steps">
          {PATH.map((step) => (
            <article key={step.number}>
              <span>{step.number}</span>
              <h4>{step.title}</h4>
              <p>{step.question}</p>
              <button type="button" onClick={() => onNavigate(step.destination)}>{step.action}</button>
            </article>
          ))}
        </div>
      </div>

      <div className="guide-principles">
        <article><span>Invariant + embodied</span><strong>3:2 is a relationship. 220 → 330 Hz is one bodily realization.</strong><p>Keep both. Human hearing changes with absolute register, spectrum, level, duration, and environment.</p></article>
        <article><span>No consonance meter</span><strong>Roughness, harmonicity, stability, tension, and liking are different variables.</strong><p>They can correlate in a situation without becoming synonyms or universal laws.</p></article>
        <article><span>A song is a path</span><strong>A locally abrasive event can support a satisfying return.</strong><p>Judge moments within recurrence, prediction, surprise, transformation, memory, and purpose.</p></article>
        <article><span>Goodness is conditional</span><strong>Ask “fit for whom, for what, and with what uncertainty?”</strong><p>The Atlas and Personal Lens visualize a response terrain—not an objectively good region.</p></article>
      </div>

      <div className="guide-glossary">
        <div className="guide-section-heading"><span>Working vocabulary</span><h3>Precise distinctions, optional names.</h3><p>These terms describe different layers. None is allowed to silently stand in for musical quality.</p></div>
        <dl>{GLOSSARY.map(([term, meaning]) => <div key={term}><dt>{term}</dt><dd>{meaning}</dd></div>)}</dl>
      </div>

      <div className="learning-check">
        <div className="learning-check-heading">
          <span>Reasoning check · stays on this device</span>
          <h3>Can you predict what the model will say?</h3>
          <p>This is practice, not a grade or a participant study. Choose the strongest explanation, reveal the reasoning, then test it in the relevant lab.</p>
          <strong>{String(checkIndex + 1).padStart(2, "0")} / {String(LEARNING_CHECKS.length).padStart(2, "0")}</strong>
        </div>

        <div className="learning-check-question">
          <fieldset>
            <legend>{check.prompt}</legend>
            {check.options.map((option, index) => (
              <label key={option} className={answerRevealed && index === check.answer ? "is-answer" : ""}>
                <input
                  ref={index === 0 ? firstAnswerRef : undefined}
                  type="radio"
                  name={`learning-check-${checkIndex}`}
                  value={index}
                  checked={selectedAnswer === index}
                  disabled={answerRevealed}
                  onChange={() => setSelectedAnswer(index)}
                />
                <span>{option}</span>
              </label>
            ))}
          </fieldset>

          <button
            type="button"
            onClick={revealAnswer}
            disabled={selectedAnswer === null}
            aria-disabled={answerRevealed}
          >
            {answerRevealed ? "Reasoning checked" : "Check my reasoning"}
          </button>

          {answerRevealed ? (
            <div className="learning-check-feedback" aria-live="polite">
              <span>{answerIsCorrect ? "Reasoning holds" : "Revisit this layer"}</span>
              <p>{check.explanation}</p>
              {isLastCheck ? <strong>{correctCount} of {LEARNING_CHECKS.length} explanations matched on this pass.</strong> : null}
              <div>
                <button type="button" onClick={() => onNavigate(check.destination)}>{check.action}</button>
                <button type="button" onClick={nextCheck}>{isLastCheck ? "Restart check" : "Next question"}</button>
              </div>
            </div>
          ) : null}
        </div>
      </div>

      <div className="safety-guide">
        <div><span>Hearing safety</span><h3>Calibrate low. Compare briefly.</h3></div>
        <ol>
          <li><strong>Turn your device down first.</strong><span>Begin near silence, then raise only enough to hear the relationship.</span></li>
          <li><strong>Match level before judging A/B examples.</strong><span>Louder can seem fuller or better even when the intended variable is unchanged.</span></li>
          <li><strong>Stop if sound is uncomfortable.</strong><span>The app uses conservative gain and limiters, but your device, headphones, hearing, and environment still matter.</span></li>
          <li><strong>Use short comparisons.</strong><span>Rest your ears and avoid treating this educational tool as a calibrated hearing test.</span></li>
        </ol>
      </div>

      <div className="transparency-registry">
        <div><span>Model registry</span><h3>Every number has a scope and version.</h3><p>Full cards, fixture provenance, research anchors, and prohibited claims live with the source documentation.</p></div>
        <dl>
          <div><dt>Recording</dt><dd><strong>mwno-audio-0.3.0</strong><span>Mixed-audio descriptors are correctable hypotheses.</span></dd></div>
          <div><dt>Prediction</dt><dd><strong>mwno-prediction-1</strong><span>Piece-local counts or a declared synthetic teaching prior.</span></dd></div>
          <div><dt>Auditory</dt><dd><strong>mwno-ear-1</strong><span>Uncalibrated educational roughness, template, and fusion models.</span></dd></div>
          <div><dt>Data</dt><dd><strong>local + generated</strong><span>No bundled commercial audio or hidden genre corpus.</span></dd></div>
        </dl>
      </div>

      <div className="guide-next">
        <div><span>Ready for existing music?</span><strong>Load audio privately or navigate by landmark.</strong></div>
        <button type="button" onClick={() => onNavigate("recording")}>Analyze a local recording</button>
        <button type="button" onClick={() => onNavigate("atlas")}>Explore the Atlas</button>
      </div>
    </section>
  );
}
