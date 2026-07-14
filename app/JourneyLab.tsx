"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import {
  eventsInSelection,
  incrementalPredictionTrace,
  liveJourneyPhraseProfile,
  localGesturePrediction,
  predictionTraceWithPrior,
  selfSimilarityMatrix,
  transformedRecurrence,
  type EventSelection,
  type MusicalEvent,
  type LiveJourneyStep,
} from "@/lib/musical-sequence";
import { SYNTH_MASTER_GAIN, configureSafetyCompressor } from "@/lib/audio-level";
import { PIANO_SESSION_KEY, parsePianoPhraseSpecimen, type PianoPhraseSpecimenEvent } from "@/lib/piano-session";

type Lens = "original" | "repeat" | "variation" | "unexpected" | "delay";
type PredictionModel = "piece" | "synthetic" | "personal";
type ResponsePoint = { sectionId: string; type: string; intensity: number; recordedAt: string };
type PredictionObservation = { fromGesture: string; toGesture: string; recordedAt: string };
type AudibleTransform = "original" | "smooth" | "register" | "timing";
type CalibrationTransform = Exclude<AudibleTransform, "original">;
type JourneyPlayback = { context: AudioContext; master: GainNode; sources: OscillatorNode[]; timer: number };

const DURATION_SECONDS = 16;
const RESPONSE_STORAGE_KEY = "mwno.journey.responses.v1";
const PREDICTION_STORAGE_KEY = "mwno.journey.predictions.v1";
const SYNTHETIC_TRANSITIONS = {
  anchor: { rise: 12, anchor: 3, turn: 2 },
  rise: { crest: 11, turn: 4, break: 1 },
  crest: { turn: 8, anchor: 5, break: 2 },
  turn: { anchor: 10, rise: 2 },
  break: { search: 9, anchor: 3 },
  search: { rise: 6, search: 3, anchor: 4 },
  return: { anchor: 8 },
} as const;
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
const GESTURES = [...new Set(EVENTS.map((event) => event.gesture))];

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
    roughness: 18 + wave * 16 + rupture * (lens === "repeat" ? 8 : lens === "variation" ? 34 : 62) + search * 24,
    harmonicity: 78 - rupture * 55 - search * 28 + returnShape * 18,
    pulse: 72 + Math.sin(time * 1.55) * 10 - search * 38 + returnShape * 18,
    repetition: time < 4 ? 18 + time * 11 : time < 8 ? (lens === "repeat" ? 98 : lens === "variation" ? 72 : 82) : 36 + returnShape * 55,
    uncertainty: 62 - Math.min(time * 7, 42) + rupture * 58 + search * 40 - returnShape * 38,
    surprise: 12 + rupture * (lens === "repeat" ? 6 : lens === "variation" ? 34 : lens === "unexpected" ? 98 : 82) + search * 24 + (lens === "delay" ? Math.exp(-(((time - 12.5) / 0.8) ** 2)) * 42 : 0),
    tension: 24 + rupture * 48 + search * 43 - returnShape * 34,
  };
  return clamp(values[key]);
}

function journeyShapeLabel(step: LiveJourneyStep) {
  if (step.pitchOffsets.length === 1) return "single";
  const visible = step.pitchOffsets.slice(0, 5).join("·");
  return `shape ${visible}${step.pitchOffsets.length > 5 ? ` +${step.pitchOffsets.length - 5}` : ""}`;
}

function journeyMoveLabel(step: LiveJourneyStep) {
  if (step.bassMove == null) return "start";
  if (step.bassMove === 0) return "bass held";
  return `bass ${step.bassMove > 0 ? "+" : ""}${step.bassMove} keys`;
}

function journeyExpectationLabel(step: LiveJourneyStep) {
  if (step.expectationState === "opening") return "opening";
  if (step.expectationState === "open") return "no precedent";
  if (step.expectationState === "new") return "new continuation";
  if (step.alternativeCount <= 1) return "seen continuation";
  return `one of ${step.alternativeCount}`;
}

function LivePhraseJourneyBridge({
  phrase,
  hydrated,
  onNavigateToPiano,
}: {
  phrase: PianoPhraseSpecimenEvent[];
  hydrated: boolean;
  onNavigateToPiano?: () => void;
}) {
  const profile = useMemo(() => liveJourneyPhraseProfile(phrase), [phrase]);
  const visibleSteps = profile?.steps.slice(-8) ?? [];
  const last = profile?.steps.at(-1) ?? null;
  const beforeLast = profile && profile.steps.length > 1 ? profile.steps.at(-2)! : null;
  const lastReading = !last || !beforeLast
    ? "The phrase needs another onset group before a transition can be read."
    : last.expectationState === "known"
      ? `Before group ${last.index + 1}, ${journeyShapeLabel(beforeLast)} · ${journeyMoveLabel(beforeLast)} had ${last.alternativeCount} learned continuation${last.alternativeCount === 1 ? "" : "s"}. This realized path held ${Math.round((last.actualProbability ?? 0) * 100)}% of that phrase-local evidence.`
      : last.expectationState === "new"
        ? `Before group ${last.index + 1}, ${journeyShapeLabel(beforeLast)} · ${journeyMoveLabel(beforeLast)} had ${last.alternativeCount} learned continuation${last.alternativeCount === 1 ? "" : "s"}, but this one was absent. The event now becomes one new observation for later in the phrase.`
        : `Before group ${last.index + 1}, ${journeyShapeLabel(beforeLast)} · ${journeyMoveLabel(beforeLast)} had not yet led anywhere earlier in this phrase. The model stays open rather than inventing an expectation.`;
  const accessibleTrail = visibleSteps.map((step) => `Group ${step.index + 1}: ${journeyShapeLabel(step)}, ${journeyMoveLabel(step)}, ${step.gapMultiple == null ? "opening" : `${step.gapMultiple.toFixed(2)} local time units`}, ${journeyExpectationLabel(step)}`).join(". ");
  return (
    <section className="journey-live-bridge" aria-labelledby="journey-live-title">
      <div className="journey-live-heading">
        <div>
          <span className="workspace-label">Live phrase · piece-local memory</span>
          <h3 id="journey-live-title">Where did your phrase teach itself what might come next?</h3>
        </div>
        <p>Each onset group becomes a field shape, bass move, and relative-time step. Only earlier transitions in this phrase may form an expectation.</p>
      </div>

      {!hydrated ? (
        <p className="journey-live-status" role="status">Reading the retained phrase…</p>
      ) : profile ? (
        <>
          <p className="journey-live-status">{profile.attackCount} attacks → {profile.groupCount} onset groups · latest {visibleSteps.length} shown · {profile.learnedStepCount} continuation{profile.learnedStepCount === 1 ? "" : "s"} had earlier evidence</p>
          <div className="journey-live-figure" role="img" aria-label={`Piece-local expectation trail. ${accessibleTrail}.`}>
            <ol className="journey-live-thread">
              {visibleSteps.map((step) => (
                <li key={step.eventIds.join("-")} className={`is-${step.expectationState} ${step.priorOccurrences > 0 ? "is-return" : ""}`}>
                  <span>group {step.index + 1}{step.attackCount > 1 ? ` · ${step.attackCount} attacks` : ""}</span>
                  <strong>{journeyShapeLabel(step)}</strong>
                  <small>{journeyMoveLabel(step)}</small>
                  <small>{step.gapMultiple == null ? "time origin" : `${step.gapMultiple.toFixed(2)}× local time`}</small>
                  <em>{journeyExpectationLabel(step)}</em>
                  {step.priorOccurrences > 0 ? <b>gesture return · seen {step.priorOccurrences}× before</b> : <b>first appearance</b>}
                </li>
              ))}
            </ol>
            <div className={`journey-live-last is-${last?.expectationState ?? "open"}`}>
              <span>What changed at the latest group?</span>
              <strong>{lastReading}</strong>
              <small>{profile.nextAlternatives.length ? `After the final gesture, phrase memory contains ${profile.nextAlternatives.length} observed continuation${profile.nextAlternatives.length === 1 ? "" : "s"}. It does not choose one for you.` : "The final gesture has no observed continuation inside this phrase yet."}</small>
            </div>
          </div>
          <div className="journey-live-boundary">
            <p><strong>Keep the lanes separate:</strong> onset grouping, field shape, bass motion, and relative time are measured from MIDI. Continuation counts are a piece-local model learned only from earlier groups. Your expectation, surprise, sense of form, and musical judgment remain unclaimed.</p>
            {onNavigateToPiano ? <button type="button" onClick={onNavigateToPiano}>Extend or replay this phrase</button> : null}
          </div>
        </>
      ) : (
        <div className="journey-live-empty">
          <div>
            <strong>{phrase.length ? `${phrase.length} retained attack${phrase.length === 1 ? "" : "s"}, but not enough separated events yet` : "No retained phrase yet"}</strong>
            <p>Play at least four attacks across four onset groups. Notes within 70 ms become one field, so a chord is one event in the journey rather than several false steps.</p>
          </div>
          {onNavigateToPiano ? <button type="button" onClick={onNavigateToPiano}>Build a phrase in Piano</button> : null}
        </div>
      )}
    </section>
  );
}

export function JourneyLab({ onNavigateToPiano }: { onNavigateToPiano?: () => void }) {
  const [selectedSection, setSelectedSection] = useState(SECTIONS[1]);
  const [lens, setLens] = useState<Lens>("original");
  const [annotation, setAnnotation] = useState("surprise");
  const [feltTension, setFeltTension] = useState(68);
  const [localComfort, setLocalComfort] = useState(24);
  const [arcSatisfaction, setArcSatisfaction] = useState(78);
  const [predictionModel, setPredictionModel] = useState<PredictionModel>("piece");
  const [responses, setResponses] = useState<ResponsePoint[]>([]);
  const [predictionObservations, setPredictionObservations] = useState<PredictionObservation[]>([]);
  const [expectedGestureReport, setExpectedGestureReport] = useState("anchor");
  const [audibleTransform, setAudibleTransform] = useState<AudibleTransform | null>(null);
  const [calibrationTransform, setCalibrationTransform] = useState<CalibrationTransform>("smooth");
  const [calibrationGuess, setCalibrationGuess] = useState<CalibrationTransform>("smooth");
  const [calibrationRevealed, setCalibrationRevealed] = useState(false);
  const [hypothesisResponses, setHypothesisResponses] = useState<Record<string, "confirm" | "reject">>({});
  const [phraseSpecimen, setPhraseSpecimen] = useState<PianoPhraseSpecimenEvent[]>([]);
  const [phraseHydrated, setPhraseHydrated] = useState(false);
  const playbackRef = useRef<JourneyPlayback | null>(null);
  const selectedEvents = eventsInSelection(EVENTS, selectedSection.selection);
  const predict = useMemo(() => localGesturePrediction(EVENTS), []);
  const finalGesture = selectedEvents[selectedEvents.length - 1]?.gesture ?? "anchor";
  const expected = predict(finalGesture);
  const firstPhrase = eventsInSelection(EVENTS, SECTIONS[0].selection);
  const repeatedPhrase = eventsInSelection(EVENTS, SECTIONS[1].selection);
  const recurrence = transformedRecurrence(firstPhrase, repeatedPhrase);
  const similarity = useMemo(() => selfSimilarityMatrix(EVENTS), []);
  const predictionTrace = useMemo(() => incrementalPredictionTrace(EVENTS), []);
  const syntheticPredictionTrace = useMemo(() => predictionTraceWithPrior(EVENTS, SYNTHETIC_TRANSITIONS), []);
  const personalPrior = useMemo(() => predictionObservations.reduce<Record<string, Record<string, number>>>((prior, observation) => {
    const row = prior[observation.fromGesture] ?? {};
    row[observation.toGesture] = (row[observation.toGesture] ?? 0) + 1;
    prior[observation.fromGesture] = row;
    return prior;
  }, {}), [predictionObservations]);
  const personalPredictionTrace = useMemo(() => predictionTraceWithPrior(EVENTS, personalPrior), [personalPrior]);
  const visiblePredictionTrace = predictionModel === "piece" ? predictionTrace : predictionModel === "synthetic" ? syntheticPredictionTrace : personalPredictionTrace;
  const responseBySection = useMemo(() => Object.fromEntries(SECTIONS.map((section) => {
    const latest = [...responses].reverse().find((response) => response.sectionId === section.id);
    return [section.id, latest?.intensity ?? 0];
  })), [responses]);
  const meanRatio = selectedEvents.reduce((sum, event) => sum + event.ratioToReference, 0) / Math.max(1, selectedEvents.length);

  useEffect(() => {
    let saved: ResponsePoint[] = [];
    try {
      const parsed: unknown = JSON.parse(window.localStorage.getItem(RESPONSE_STORAGE_KEY) ?? "[]");
      if (Array.isArray(parsed)) saved = parsed.filter((item): item is ResponsePoint => typeof item?.sectionId === "string" && typeof item?.intensity === "number");
    } catch { /* A malformed local record should not block the lab. */ }
    const timer = window.setTimeout(() => setResponses(saved), 0);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      try {
        setPhraseSpecimen(parsePianoPhraseSpecimen(window.sessionStorage.getItem(PIANO_SESSION_KEY)) ?? []);
      } catch {
        setPhraseSpecimen([]);
      }
      setPhraseHydrated(true);
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    let saved: PredictionObservation[] = [];
    try {
      const parsed: unknown = JSON.parse(window.localStorage.getItem(PREDICTION_STORAGE_KEY) ?? "[]");
      if (Array.isArray(parsed)) saved = parsed.filter((item): item is PredictionObservation => typeof item?.fromGesture === "string" && typeof item?.toGesture === "string");
    } catch { /* A malformed local record should not block the lab. */ }
    const timer = window.setTimeout(() => setPredictionObservations(saved), 0);
    return () => window.clearTimeout(timer);
  }, []);

  const saveResponse = () => {
    const next = [...responses, { sectionId: selectedSection.id, type: annotation, intensity: feltTension, recordedAt: new Date().toISOString() }];
    setResponses(next);
    window.localStorage.setItem(RESPONSE_STORAGE_KEY, JSON.stringify(next));
  };

  const clearResponses = () => {
    setResponses([]);
    window.localStorage.removeItem(RESPONSE_STORAGE_KEY);
  };

  const saveExpectedTransition = () => {
    const next = [...predictionObservations, { fromGesture: finalGesture, toGesture: expectedGestureReport, recordedAt: new Date().toISOString() }];
    setPredictionObservations(next);
    window.localStorage.setItem(PREDICTION_STORAGE_KEY, JSON.stringify(next));
    setPredictionModel("personal");
  };

  const clearExpectedTransitions = () => {
    setPredictionObservations([]);
    window.localStorage.removeItem(PREDICTION_STORAGE_KEY);
  };

  const stopAudible = useCallback(() => {
    const playback = playbackRef.current;
    if (!playback) return;
    playbackRef.current = null;
    window.clearTimeout(playback.timer);
    const now = playback.context.currentTime;
    playback.master.gain.cancelScheduledValues(now);
    playback.master.gain.setValueAtTime(playback.master.gain.value, now);
    playback.master.gain.linearRampToValueAtTime(0.0001, now + 0.04);
    window.setTimeout(() => {
      playback.sources.forEach((source) => { try { source.stop(); } catch { /* Already ended. */ } });
      void playback.context.close();
    }, 55);
    setAudibleTransform(null);
  }, []);

  const playAudible = async (transform: AudibleTransform) => {
    stopAudible();
    try {
      const context = new AudioContext();
      await context.resume();
      const master = context.createGain();
      const compressor = context.createDynamicsCompressor();
      const now = context.currentTime;
      master.gain.setValueAtTime(0.0001, now);
      master.gain.exponentialRampToValueAtTime(SYNTH_MASTER_GAIN, now + 0.05);
      configureSafetyCompressor(compressor, now);
      master.connect(compressor).connect(context.destination);
      const sources = selectedEvents.map((event, index) => {
        const source = context.createOscillator();
        const gain = context.createGain();
        const relativeOnset = event.onsetSeconds - selectedSection.selection.startSeconds;
        const timingShift = transform === "timing" && index % 2 === 1 ? 0.09 : 0;
        const startsAt = now + 0.08 + Math.max(0, relativeOnset + timingShift);
        const endsAt = startsAt + Math.max(0.12, event.durationSeconds * 0.72);
        source.frequency.setValueAtTime(180 * event.ratioToReference * (transform === "register" ? 2 : 1), startsAt);
        source.type = transform === "smooth" ? "sine" : event.timbre === "pure" ? "sine" : event.timbre === "harmonic" ? "triangle" : "sawtooth";
        gain.gain.setValueAtTime(0.0001, startsAt);
        const eventGain = 0.6 + event.amplitude * 0.4;
        gain.gain.exponentialRampToValueAtTime(eventGain, startsAt + 0.025);
        gain.gain.setValueAtTime(eventGain, Math.max(startsAt + 0.025, endsAt - 0.05));
        gain.gain.linearRampToValueAtTime(0.0001, endsAt);
        source.connect(gain).connect(master);
        source.start(startsAt);
        source.stop(endsAt + 0.02);
        return source;
      });
      const durationMs = Math.ceil((selectedSection.selection.endSeconds - selectedSection.selection.startSeconds + 0.35) * 1000);
      const playback: JourneyPlayback = { context, master, sources, timer: 0 };
      playback.timer = window.setTimeout(() => {
        if (playbackRef.current !== playback) return;
        playbackRef.current = null;
        setAudibleTransform(null);
        void context.close();
      }, durationMs);
      playbackRef.current = playback;
      setAudibleTransform(transform);
    } catch {
      setAudibleTransform(null);
    }
  };

  const nextCalibration = () => {
    const order: CalibrationTransform[] = ["smooth", "register", "timing"];
    setCalibrationTransform(order[(order.indexOf(calibrationTransform) + 1) % order.length]);
    setCalibrationRevealed(false);
  };

  useEffect(() => () => {
    const playback = playbackRef.current;
    playbackRef.current = null;
    if (!playback) return;
    window.clearTimeout(playback.timer);
    playback.sources.forEach((source) => { try { source.stop(); } catch { /* Already ended. */ } });
    void playback.context.close();
  }, []);

  return (
    <section className="advanced-lab journey-lab" aria-labelledby="journey-title">
      <div className="lab-intro journey-intro">
        <div>
          <p className="section-kicker">Journey Lab · memory grows inside the phrase</p>
          <h2 id="journey-title">See expectation emerge from what your hands repeat.</h2>
        </div>
        <p>
          Begin with your retained Piano phrase. Similar field shapes and movements create piece-local memory; a continuation becomes expected only after the phrase has supplied evidence.
        </p>
      </div>

      <LivePhraseJourneyBridge phrase={phraseSpecimen} hydrated={phraseHydrated} onNavigateToPiano={onNavigateToPiano} />

      <details className="journey-generated-disclosure">
        <summary><strong>Explore the generated sixteen-second journey</strong><span>optional counterfactuals, self-similarity, prediction models, audio, and listener annotation</span></summary>
        <div className="journey-toolbar">
        <div className="counterfactual-picker" role="group" aria-label="Counterfactual lens">
          <span>Counterfactual</span>
          {([
            ["original", "Original"],
            ["repeat", "Exact repeat"],
            ["variation", "Repeat + variation"],
            ["unexpected", "Unexpected rupture"],
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
          <div className="feature-lane response-lane">
            <span className="lane-label">Your saved rating</span>
            <div role="img" aria-label="Latest saved listener rating for each four-second section">
              {SECTIONS.flatMap((section) => Array.from({ length: 8 }, (_, index) => <i key={`${section.id}-${index}`} style={{ height: `${responseBySection[section.id]}%` }} />))}
            </div>
          </div>
        </div>
        <div className="time-axis" aria-hidden="true"><span>0 s</span><span>4</span><span>8</span><span>12</span><span>16 s</span></div>
      </div>

      <div className="structure-inspector">
        <article className="similarity-card">
          <div className="journey-heading"><div><span>Pattern · transformed recurrence</span><h3>Self-similarity across events</h3></div><p>brighter cell = stronger match</p></div>
          <div className="similarity-matrix" role="img" aria-label="Fifteen by fifteen event self-similarity matrix showing repeated and transformed gestures">
            {similarity.flatMap((row, rowIndex) => row.map((value, columnIndex) => <i key={`${rowIndex}-${columnIndex}`} style={{ backgroundColor: `rgba(114, 213, 209, ${0.04 + value * 0.88})` }} title={`event ${rowIndex + 1} to ${columnIndex + 1}: ${Math.round(value * 100)} percent similar`} />))}
          </div>
          <p>The diagonal is identity. Off-diagonal blocks reveal recurrence even when onset time moves; similarity uses ratio, duration, gesture, and timbre with declared weights.</p>
        </article>

        <article className="prediction-trace-card">
          <div className="journey-heading"><div><span>Prediction · declared model comparison</span><h3>Before uncertainty, after surprise</h3></div><div className="prediction-model-picker" role="group" aria-label="Prediction model"><button type="button" aria-pressed={predictionModel === "piece"} onClick={() => setPredictionModel("piece")}>Piece-local</button><button type="button" aria-pressed={predictionModel === "synthetic"} onClick={() => setPredictionModel("synthetic")}>Synthetic corpus</button><button type="button" aria-pressed={predictionModel === "personal"} onClick={() => setPredictionModel("personal")}>Your expectations · {predictionObservations.length}</button></div></div>
          <div className="prediction-trace" role="img" aria-label={`Uncertainty before and surprise after each generated musical event under the ${predictionModel} model`}>
            <div className="trace-label">uncertainty before</div>
            <div className="trace-bars uncertainty-bars">{visiblePredictionTrace.map((point, index) => <i key={point.eventId} style={{ height: `${Math.max(2, Math.min(100, point.uncertaintyBits / 2 * 100))}%` }} title={`event ${index + 1}: ${point.uncertaintyBits.toFixed(2)} bits uncertainty`} />)}</div>
            <div className="trace-label">surprise after</div>
            <div className="trace-bars surprise-bars">{visiblePredictionTrace.map((point, index) => <i key={point.eventId} style={{ height: `${Math.max(2, Math.min(100, (point.surpriseBits ?? 0) / 6 * 100))}%` }} title={`event ${index + 1}: ${point.surpriseBits === null ? "unlearned" : `${point.surpriseBits.toFixed(2)} bits surprise`}`} />)}</div>
            <div className="trace-events">{visiblePredictionTrace.map((point, index) => <span key={point.eventId}>{index + 1}</span>)}</div>
          </div>
          <p>{predictionModel === "piece" ? "The piece-local predictor learns transition counts only from earlier events in this sequence." : predictionModel === "synthetic" ? "The synthetic corpus is a small, declared teaching prior—not a claim about any musical culture or genre." : predictionObservations.length ? "Your model begins with transition choices you explicitly saved, then learns from this piece." : "Your model has no saved expectations yet, so it currently falls back to piece-local evidence."} A wide distribution raises uncertainty before an event; a low-probability realized event raises surprise afterward.</p>
          <div className="personal-prediction-teacher"><span>After <strong>{finalGesture}</strong>, I expect</span><select aria-label="Your expected next gesture" value={expectedGestureReport} onChange={(event) => setExpectedGestureReport(event.target.value)}>{GESTURES.map((gesture) => <option key={gesture} value={gesture}>{gesture}</option>)}</select><button type="button" onClick={saveExpectedTransition}>Teach my model</button><button type="button" disabled={predictionObservations.length === 0} onClick={clearExpectedTransitions}>Clear</button></div>
        </article>
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
          <div className="hypothesis-response" role="group" aria-label={`Respond to the ${selectedSection.label} tension hypothesis`}>
            <button type="button" aria-pressed={hypothesisResponses[selectedSection.id] === "confirm"} onClick={() => setHypothesisResponses((current) => ({ ...current, [selectedSection.id]: "confirm" }))}>Matches my listening</button>
            <button type="button" aria-pressed={hypothesisResponses[selectedSection.id] === "reject"} onClick={() => setHypothesisResponses((current) => ({ ...current, [selectedSection.id]: "reject" }))}>Does not match</button>
          </div>
        </div>

        <div className="audible-counterfactuals">
          <div><span>Audible counterfactual A/B · {selectedSection.label}</span><h4>Same gesture identity, one declared factor changed.</h4><p>Begin with your device low. Compare briefly; level and event ratios remain fixed.</p></div>
          <div role="group" aria-label="Audible counterfactual transforms">
            {([[
              "original", "A · Original", "baseline realization",
            ], [
              "smooth", "B · Smooth timbre", "source waveform only",
            ], [
              "register", "C · Higher register", "all frequencies ×2",
            ], [
              "timing", "D · Timing shift", "alternate events +90 ms",
            ]] as [AudibleTransform, string, string][]).map(([id, label, note]) => <button key={id} type="button" aria-pressed={audibleTransform === id} onClick={audibleTransform === id ? stopAudible : () => void playAudible(id)}><strong>{audibleTransform === id ? "■ Stop" : `▶ ${label}`}</strong><span>{note}</span></button>)}
          </div>
          <div className="calibration-quiz"><div><span>Blind calibration</span><strong>Can you identify the single changed factor?</strong></div><button type="button" onClick={() => void playAudible("original")}>▶ Hear A</button><button type="button" onClick={() => void playAudible(calibrationTransform)}>▶ Hear mystery B</button><label><span>My answer</span><select value={calibrationGuess} onChange={(event) => setCalibrationGuess(event.target.value as CalibrationTransform)}><option value="smooth">spectrum / timbre</option><option value="register">absolute register</option><option value="timing">event timing</option></select></label><button type="button" onClick={() => setCalibrationRevealed(true)}>Reveal</button>{calibrationRevealed ? <output className={calibrationGuess === calibrationTransform ? "is-correct" : "is-different"}>{calibrationGuess === calibrationTransform ? "Matched" : `Changed: ${calibrationTransform}`}</output> : null}<button type="button" onClick={nextCalibration}>Next</button></div>
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
        <div className="journey-response-actions"><button type="button" className="save-journey-response" onClick={saveResponse}>Save to response lane</button><button type="button" disabled={responses.length === 0} onClick={clearResponses}>Clear saved ratings</button></div>
      </div>

      <div className="arc-dissociation">
        <div><span>Moment versus form</span><h3>Can a difficult event serve a satisfying arc?</h3><p>These are independent listener reports. The interface never infers the second from the first.</p></div>
        <label><span>Rupture comfort <output>{localComfort}</output></span><input type="range" min="0" max="100" aria-label="Local rupture comfort" value={localComfort} onChange={(event) => setLocalComfort(Number(event.target.value))} /></label>
        <label><span>Whole-arc satisfaction <output>{arcSatisfaction}</output></span><input type="range" min="0" max="100" aria-label="Whole arc satisfaction" value={arcSatisfaction} onChange={(event) => setArcSatisfaction(Number(event.target.value))} /></label>
        <strong>{arcSatisfaction > localComfort + 20 ? "Dissociation visible: low local comfort, higher form-level satisfaction." : "Your reports do not currently show a strong moment/form dissociation."}</strong>
      </div>
      </details>
    </section>
  );
}
