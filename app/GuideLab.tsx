"use client";

type Destination = "ratio" | "ear" | "harmony" | "rhythm" | "journey" | "recording" | "atlas" | "personal";

const PATH: { number: string; title: string; question: string; destination: Destination; action: string }[] = [
  { number: "01", title: "Relationship", question: "What remains the same when every frequency moves?", destination: "ratio", action: "Open Ratio Lab" },
  { number: "02", title: "Auditory reality", question: "Why does the same ratio change with spectrum and register?", destination: "ear", action: "Open Ear Lab" },
  { number: "03", title: "Time and embodiment", question: "How do duration ratios become pulse, resistance, and movement?", destination: "rhythm", action: "Open Rhythm Lab" },
  { number: "04", title: "Expectation and form", question: "How can rupture, uncertainty, and return make a larger arc?", destination: "journey", action: "Open Journey" },
  { number: "05", title: "Listener and purpose", question: "When does a musical strategy fit this person and goal?", destination: "personal", action: "Open Personal Lens" },
];

const GLOSSARY = [
  ["frequency", "physical cycles per second"],
  ["pitch", "a listener’s organization of periodic sound"],
  ["roughness", "a sensory-interaction model for nearby components"],
  ["harmonicity", "fit to one or more harmonic templates"],
  ["fusion", "a report or hypothesis that sources form one object"],
  ["tension", "felt or modeled pressure toward continuation or change"],
  ["surprise", "information after an event under a declared predictor"],
  ["liking", "a listener report in one context and moment"],
];

export function GuideLab({ onNavigate }: { onNavigate: (destination: Destination) => void }) {
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

      <div className="safety-guide">
        <div><span>Hearing safety</span><h3>Calibrate low. Compare briefly.</h3></div>
        <ol>
          <li><strong>Turn your device down first.</strong><span>Begin near silence, then raise only enough to hear the relationship.</span></li>
          <li><strong>Match level before judging A/B examples.</strong><span>Louder can seem fuller or better even when the intended variable is unchanged.</span></li>
          <li><strong>Stop if sound is uncomfortable.</strong><span>The app uses conservative gain and limiters, but your device, headphones, hearing, and environment still matter.</span></li>
          <li><strong>Use short comparisons.</strong><span>Rest your ears and avoid treating this educational tool as a calibrated hearing test.</span></li>
        </ol>
      </div>

      <div className="guide-next">
        <div><span>Ready for existing music?</span><strong>Load audio privately or navigate by landmark.</strong></div>
        <button type="button" onClick={() => onNavigate("recording")}>Analyze a local recording</button>
        <button type="button" onClick={() => onNavigate("atlas")}>Explore the Atlas</button>
      </div>
    </section>
  );
}
