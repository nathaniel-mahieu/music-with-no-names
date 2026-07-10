"use client";

import { useMemo, useState, type CSSProperties } from "react";
import {
  eventsInSelection,
  localGesturePrediction,
  transformedRecurrence,
  type EventSelection,
  type MusicalEvent,
} from "@/lib/musical-sequence";

type Lens = "original" | "smooth" | "delay";

const DURATION_SECONDS = 16;

const EVENTS: MusicalEvent[] = [
  { id: "e1", onsetSeconds: 0, durationSeconds: 0.8, ratioToReference: 1, amplitude: 0.72, timbre: "harmonic", gesture: "anchor" },
  { id: "e2", onsetSeconds: 1, durationSeconds: 0.65, ratioToReference: 1.25, amplitude: 0.62, timbre: "harmonic", gesture: "rise" },
  { id: "e3", onsetSeconds: 2, durationSeconds: 0.8, ratioToReference: 1.5, amplitude: 0.78, timbre: "harmonic", gesture: "crest" },
  { id: "e4", onsetSeconds: 3, durationSeconds: 0.7, ratioToReference: 1.2, amplitude: 0.58, timbre: "pure", gesture: "turn" },
  { id: "e5", onsetSeconds: 4, durationSeconds: 0.8, ratioToReference: 1, amplitude: 0.74, timbre: "harmonic", gesture: "anchor" },
  { id: "e6", onsetSeconds: 5, durationSeconds: 0.65, ratioToReference: 1.25, amplitude: 0.66, timbre: "harmonic", gesture: "rise" },
  { id: "e7", onsetSeconds: 6, durationSeconds: 0.8, ratioToReference: 1.5, amplitude: 0.82, timbre: "harmonic", gesture: "crest" },
  { id: "e8", onsetSeconds: 7, durationSeconds: 0.55, ratioToReference: Math.SQRT2, amplitude: 0.88, timbre: "noise", gesture: "break" },
  { id: "e9", onsetSeconds: 8.15, durationSeconds: 0.75, ratioToReference: 1.08, amplitude: 0.56, timbre: "pure", gesture: "search" },
  { id: "e10", onsetSeconds: 9.45, durationSeconds: 0.65, ratioToReference: 1.31, amplitude: 0.64, timbre: "harmonic", gesture: "rise" },
  { id: "e11", onsetSeconds: 10.8, durationSeconds: 0.9, ratioToReference: 1.62, amplitude: 0.9, timbre: "noise", gesture: "break" },
  { id: "e12", onsetSeconds: 12, durationSeconds: 0.9, ratioToReference: 1, amplitude: 0.82, timbre: "harmonic", gesture: "anchor" },
  { id: "e13", onsetSeconds: 13, durationSeconds: 0.7, ratioToReference: 1.25, amplitude: 0.74, timbre: "harmonic", gesture: "rise" },
  { id: "e14", onsetSeconds: 14, durationSeconds: 0.9, ratioToReference: 1.5, amplitude: 0.88, timbre: "harmonic", gesture: "crest" },
  { id: "e15", onsetSeconds: 15, durationSeconds: 0.95, ratioToReference: 1, amplitude: 0.64, timbre: "pure", gesture: "return" },
];

const SECTIONS: { id: string; label: string; role: string; selection: EventSelection }[] = [
  { id: "statement", label: "Statement", role: "pattern learned", selection: { startSeconds: 0, endSeconds: 4 } },
  { id: "repeat", label: "Repeat + rupture", role: "confidence then violation", selection: { startSeconds: 4, endSeconds: 8 } },
  { id: "search", label: "Search", role: "uncertain alternatives", selection: { startSeconds: 8, endSeconds: 12 } },
  { id: "return", label: "Return", role: "recognition and closure", selection: { startSeconds: 12, endSeconds: 16 } },
];

const FEATURE_LANES = [
  { key: "roughness", label: "Roughness", color: "var(--journey-coral)" },
  { key: "harmonicity", label: "Harmonicity", color: "var(--journey-cyan)" },
  { key: "pulse", label: "Pulse confidence", color: "var(--journey-gold)" },
  { key: "repetition", label: "Recurrence", color: "#a6d69c" },
  { key: "uncertainty", label: "Uncertainty", color: "#bb9bea" },
  { key: "surprise", label: "Surprise", color: "#f08dc0" },
  { key: "tension", label: "Felt-tension hypothesis", color: "#f6a66b" },
] as const;

function clamp(value: number) {
  return Math.max(0, Math.min(100, value));
}

function featureValue(key: (typeof FEATURE_LANES)[number]["key"], index: number, lens: Lens) {
  const time = (index / 31) * DURATION_SECONDS;
  const rupture = Math.exp(-(((time - 7.2) / 0.75) ** 2));
  const search = Math.exp(-(((time - 10.2) / 1.5) ** 2));
  const returnShape = Math.exp(-(((time - (lens === "delay" ? 15.1 : 12.7)) / 1.15) ** 2));
  const wave = (Math.sin(time * 2.1) + 1) / 2;
  const values = {
    roughness: 18 + wave * 16 + rupture * 62 + search * 24,
    harmonicity: 78 - rupture * 55 - search * 28 + returnShape * 18,
    pulse: 72 + Math.sin(time * 1.55) * 10 - search * 38 + returnShape * 18,
    repetition: time < 4 ? 18 + time * 11 : time < 8 ? 82 : 36 + returnShape * 55,
    uncertainty: 62 - Math.min(time * 7, 42) + rupture * 58 + search * 40 - returnShape * 38,
    surprise: 12 + rupture * 82 + search * 24 + (lens === "delay" ? Math.exp(-(((time - 12.5) / 0.8) ** 2)) * 42 : 0),
    tension: 24 + rupture * 48 + search * 43 - returnShape * 34,
  };
  if (key === "roughness" && lens === "smooth") return clamp(values[key] * 0.42);
  return clamp(values[key]);
}

export function JourneyLab() {
  const [selectedSection, setSelectedSection] = useState(SECTIONS[1]);
  const [lens, setLens] = useState<Lens>("original");
  const [annotation, setAnnotation] = useState("surprise");
  const [feltTension, setFeltTension] = useState(68);
  const selectedEvents = eventsInSelection(EVENTS, selectedSection.selection);
  const predict = useMemo(() => localGesturePrediction(EVENTS), []);
  const finalGesture = selectedEvents[selectedEvents.length - 1]?.gesture ?? "anchor";
  const expected = predict(finalGesture);
  const firstPhrase = eventsInSelection(EVENTS, SECTIONS[0].selection);
  const repeatedPhrase = eventsInSelection(EVENTS, SECTIONS[1].selection);
  const recurrence = transformedRecurrence(firstPhrase, repeatedPhrase);
  const meanRatio = selectedEvents.reduce((sum, event) => sum + event.ratioToReference, 0) / Math.max(1, selectedEvents.length);

  return (
    <section className="advanced-lab journey-lab" aria-labelledby="journey-title">
      <div className="lab-intro journey-intro">
        <div>
          <p className="section-kicker">Journey · one identity across timescales</p>
          <h2 id="journey-title">Musical meaning is a path through time.</h2>
        </div>
        <p>
          This generated gesture begins with recurrence, violates its own pattern, searches,
          and returns. Select a section to connect whole-form expectation with physical events.
        </p>
      </div>

      <div className="journey-toolbar">
        <div className="counterfactual-picker" role="group" aria-label="Counterfactual lens">
          <span>Counterfactual</span>
          {([
            ["original", "Original"],
            ["smooth", "Reduce roughness"],
            ["delay", "Delay return"],
          ] as [Lens, string][]).map(([id, label]) => (
            <button key={id} type="button" onClick={() => setLens(id)} aria-pressed={lens === id} className={lens === id ? "is-selected" : ""}>{label}</button>
          ))}
        </div>
        <p>Same event identity · one modeled factor changed</p>
      </div>

      <div className="journey-timeline" aria-label="Aligned musical feature timeline">
        <div className="section-rail">
          {SECTIONS.map((section) => (
            <button
              key={section.id}
              type="button"
              onClick={() => setSelectedSection(section)}
              aria-pressed={selectedSection.id === section.id}
              className={selectedSection.id === section.id ? "is-selected" : ""}
            >
              <strong>{section.label}</strong>
              <span>{section.role}</span>
            </button>
          ))}
        </div>

        <div className="event-lane">
          <span className="lane-label">Events</span>
          <div role="img" aria-label="Fifteen generated musical events expressed as ratios to a reference">
            {EVENTS.map((event) => (
              <i
                key={event.id}
                title={`${event.gesture}: ${event.ratioToReference.toFixed(3)} times reference`}
                style={{
                  left: `${(event.onsetSeconds / DURATION_SECONDS) * 100}%`,
                  width: `${Math.max(1.2, (event.durationSeconds / DURATION_SECONDS) * 100)}%`,
                  height: `${15 + event.amplitude * 34}px`,
                  "--event-y": `${(Math.log2(event.ratioToReference) / Math.log2(1.7)) * 70}%`,
                } as CSSProperties}
              />
            ))}
          </div>
        </div>

        <div className="feature-stack">
          {FEATURE_LANES.map((lane) => (
            <div className="feature-lane" key={lane.key}>
              <span className="lane-label">{lane.label}</span>
              <div role="img" aria-label={`${lane.label} over sixteen seconds`}>
                {Array.from({ length: 32 }, (_, index) => (
                  <i key={index} style={{ height: `${featureValue(lane.key, index, lens)}%`, background: lane.color }} />
                ))}
              </div>
            </div>
          ))}
        </div>
        <div className="time-axis" aria-hidden="true"><span>0 s</span><span>4</span><span>8</span><span>12</span><span>16 s</span></div>
      </div>

      <div className="microscope">
        <div className="microscope-heading">
          <div>
            <span>Acoustic Microscope · {selectedSection.selection.startSeconds.toFixed(0)}–{selectedSection.selection.endSeconds.toFixed(0)} seconds</span>
            <h3>{selectedSection.label}</h3>
          </div>
          <strong>{selectedEvents.length} events</strong>
        </div>

        <div className="microscope-grid">
          <article>
            <span>A · Continuous ratio evidence</span>
            <strong>{meanRatio.toFixed(3)}×</strong>
            <div className="ratio-evidence" aria-label="Selected event ratios">
              {selectedEvents.map((event) => <i key={event.id} style={{ left: `${Math.min(100, Math.log2(event.ratioToReference) * 140)}%` }} title={event.ratioToReference.toFixed(3)} />)}
            </div>
            <p>Average ratio is descriptive only. Individual events remain continuous and are not collapsed into pitch classes.</p>
          </article>
          <article>
            <span>B · Recurrence evidence</span>
            <strong>{Math.round(recurrence * 100)}%</strong>
            <div className="evidence-pairs"><i /><i /><i /><i /></div>
            <p>The second phrase preserves onset spacing and three relative ratios, then replaces the expected turn with a rupture.</p>
          </article>
          <article>
            <span>C · Expected alternatives</span>
            <strong>{expected.length || "open"}</strong>
            <div className="prediction-list">
              {expected.length ? expected.slice(0, 3).map((item) => <div key={item.nextGesture}><span>{item.nextGesture}</span><i><b style={{ width: `${item.probability * 100}%` }} /></i><output>{Math.round(item.probability * 100)}%</output></div>) : <p>No learned transition follows this gesture yet.</p>}
            </div>
            <p>Predictions come only from transition counts inside this generated piece—no hidden corpus or neural model.</p>
          </article>
        </div>

        <div className="explain-estimate">
          <strong>Why the tension hypothesis rises here</strong>
          <p>
            Visible contributors: {selectedSection.id === "repeat" ? "a high-probability recurrence is interrupted while roughness spikes and harmonicity falls" : selectedSection.id === "search" ? "pulse confidence weakens, event spacing becomes less regular, and several futures remain plausible" : selectedSection.id === "return" ? "recurrence and pulse confidence rise while uncertainty falls" : "the system is still learning the piece-local pattern"}. This is a hypothesis, not your report.
          </p>
        </div>
      </div>

      <div className="journey-annotation">
        <div>
          <span>Your annotation for {selectedSection.label}</span>
          <div className="annotation-types" role="group" aria-label="Annotation type">
            {["tension", "release", "surprise", "personal significance"].map((type) => <button key={type} type="button" onClick={() => setAnnotation(type)} aria-pressed={annotation === type}>{type}</button>)}
          </div>
        </div>
        <label>
          <span>Felt intensity <output>{feltTension}</output></span>
          <input type="range" min="0" max="100" value={feltTension} aria-label="Felt annotation intensity" onChange={(event) => setFeltTension(Number(event.target.value))} />
        </label>
        <p>Human annotation: <strong>{annotation}</strong> at {feltTension}/100. Kept visually separate from the modeled lanes above.</p>
      </div>
    </section>
  );
}
