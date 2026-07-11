"use client";

import { useRef, useState } from "react";

type Destination = "ratio" | "scale" | "ear" | "harmony" | "rhythm" | "journey" | "recording" | "atlas" | "personal";

const PATH: { number: string; title: string; question: string; destination: Destination; action: string }[] = [
  { number: "01", title: "Relationship", question: "If both pitches move, what stays the same between them?", destination: "ratio", action: "Compare two pitches" },
  { number: "02", title: "Scale shape", question: "How can Do mean home at any pitch?", destination: "scale", action: "Learn movable scales" },
  { number: "03", title: "Hearing", question: "Why can the same interval sound different in a new register or timbre?", destination: "ear", action: "Change the sound" },
  { number: "04", title: "Rhythm", question: "How do spacing and tempo create pulse and movement?", destination: "rhythm", action: "Build a rhythm" },
  { number: "05", title: "Musical journey", question: "How do repetition, surprise, and return shape a phrase?", destination: "journey", action: "Follow a musical journey" },
  { number: "06", title: "Your response", question: "How do your goal and listening history change your response?", destination: "personal", action: "Map your listening" },
];

const GLOSSARY = [
  ["frequency", "physical cycles per second"],
  ["pitch", "how high or low a sound seems"],
  ["movable Do", "the syllable for whichever pitch is treated as home"],
  ["interval", "the pitch distance between two sounds, heard in sequence or together"],
  ["scale", "an ordered gap pattern that repeats when frequency doubles"],
  ["scale degree", "one position relative to Do"],
  ["transposition", "moving every pitch together while keeping their relationships"],
  ["roughness", "modeled interaction between nearby frequencies that overlap in time"],
  ["harmonicity", "how well spectral components fit a harmonic pattern"],
  ["fusion", "whether several sounds seem to form one sound object"],
  ["tension", "felt or modeled pressure toward continuation or change"],
  ["surprise", "information after an event under a declared predictor"],
  ["liking", "what one listener reports in one moment and context"],
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
          <p className="section-kicker">Start here · change one thing, then listen</p>
          <h2 id="guide-title">Music begins with relationships you can hear.</h2>
          <p>Change one part of a sound or phrase. Ask three things: what changed, what stayed the same, and what changed for <em>you</em>?</p>
          <button type="button" onClick={() => onNavigate("ratio")}>Compare two pitches <span aria-hidden="true">→</span></button>
        </div>
        <div className="representation-chain" role="img" aria-label="Physical sound becomes auditory evidence, temporal expectation, and a listener response conditioned by context">
          <div><span>sound</span><strong>frequency · overtones · timing</strong></div>
          <i aria-hidden="true">→</i>
          <div><span>hearing</span><strong>pitch · blend · pulse</strong></div>
          <i aria-hidden="true">→</i>
          <div><span>music over time</span><strong>repetition · expectation · return</strong></div>
          <i aria-hidden="true">→</i>
          <div><span>you in context</span><strong>memory · culture · purpose</strong></div>
        </div>
      </div>

      <div className="guide-path">
        <div className="guide-section-heading"><span>Learning path</span><h3>Learn by changing one thing at a time.</h3><p>Start anywhere. Each lab separates what happened in the sound, what a model estimates, and what you report hearing.</p></div>
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
        <article><span>Same relationship, different sound</span><strong>3:2 names the relationship. Playing 220 and 330 Hz places it in one particular register.</strong><p>Move both pitches and the ratio stays the same, while the physical sound and your hearing can change.</p></article>
        <article><span>Keep the measures separate</span><strong>Roughness, harmonicity, stability, tension, and liking answer different questions.</strong><p>They can move together in one situation and apart in another.</p></article>
        <article><span>A song is a path</span><strong>A locally abrasive event can support a satisfying return.</strong><p>Judge moments within recurrence, prediction, surprise, transformation, memory, and purpose.</p></article>
        <article><span>Good for whom—and for what?</span><strong>Ask who is listening, what they want from the music, and how sure the evidence is.</strong><p>The Atlas and Personal Lens map responses, not an objectively good region.</p></article>
      </div>

      <div className="guide-glossary">
        <div className="guide-section-heading"><span>A few useful terms</span><h3>Names for relationships you can already hear.</h3><p>The app introduces these terms only when they help describe an experience. None is a musical-quality score.</p></div>
        <dl>{GLOSSARY.map(([term, meaning]) => <div key={term}><dt>{term}</dt><dd>{meaning}</dd></div>)}</dl>
      </div>

      <div className="learning-check">
        <div className="learning-check-heading">
          <span>Quick check · stays on this device</span>
          <h3>Can you tell what changed?</h3>
          <p>This is a self-check, not a test of musical ability. Choose the clearest explanation, read why, then try it in the related lab.</p>
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
            {answerRevealed ? "Explanation shown" : "Show why"}
          </button>

          {answerRevealed ? (
            <div className="learning-check-feedback" aria-live="polite">
              <span>{answerIsCorrect ? "That fits the model here" : "Separate the layers once more"}</span>
              <p>{check.explanation}</p>
              {isLastCheck ? <strong>You matched {correctCount} of {LEARNING_CHECKS.length} explanations. Revisit any distinction that still feels uncertain.</strong> : null}
              <div>
                <button type="button" onClick={() => onNavigate(check.destination)}>{check.action}</button>
                <button type="button" onClick={nextCheck}>{isLastCheck ? "Start over" : "Next question"}</button>
              </div>
            </div>
          ) : null}
        </div>
      </div>

      <div className="safety-guide">
        <div><span>Hearing safety</span><h3>Calibrate low. Compare briefly.</h3></div>
        <ol>
          <li><strong>Turn your device down first.</strong><span>Begin near silence, then raise only enough to hear the relationship.</span></li>
          <li><strong>Keep A and B equally loud.</strong><span>A louder example can seem fuller or better even when loudness is not the change being tested.</span></li>
          <li><strong>Stop if sound is uncomfortable.</strong><span>The app uses conservative gain and limiters, but your device, headphones, hearing, and environment still matter.</span></li>
          <li><strong>Use short comparisons.</strong><span>Rest your ears and avoid treating this educational tool as a calibrated hearing test.</span></li>
        </ol>
      </div>

      <div className="transparency-registry">
        <div><span>How the models are made</span><h3>Know what each number can—and cannot—tell you.</h3><p>The project notes list each model’s method, version, source examples, and limits.</p></div>
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
