"use client";

import { useEffect, useMemo, useState } from "react";
import { LANDMARKS } from "./AtlasLab";
import {
  PHRASE_CHARACTER_STORAGE_KEY,
  familiarityResponseTrend,
  latestLandmarkCharacterContrast,
  learnPreferenceTerrain,
  parsePhraseCharacterObservations,
  summarizePhraseCharacter,
  terrainFit,
  type PhraseCharacterObservation,
  type LandmarkCharacterContrast,
  type ResponseSample,
} from "@/lib/personal-response";

type RatingKey =
  | "liking"
  | "tension"
  | "arousal"
  | "urgeToMove"
  | "interest"
  | "familiarity"
  | "feltResolution";

type Ratings = Record<RatingKey, number>;

type Observation = {
  id: string;
  landmarkId: string;
  goal: GoalId;
  recordedAt: string;
  ratings: Ratings;
};

type GoalId = "dance" | "relax" | "focus" | "curiosity" | "comfort" | "catharsis";

const STORAGE_KEY = "music-with-no-names.personal-lens.v1";

const RATING_FIELDS: { key: RatingKey; label: string; low: string; high: string }[] = [
  { key: "liking", label: "Liking", low: "not for me", high: "deeply like" },
  { key: "tension", label: "Felt tension", low: "settled", high: "strained" },
  { key: "arousal", label: "Arousal", low: "quiet", high: "activated" },
  { key: "urgeToMove", label: "Urge to move", low: "still", high: "compelled" },
  { key: "interest", label: "Interest", low: "disengaged", high: "absorbed" },
  { key: "familiarity", label: "Familiarity", low: "unknown", high: "known by heart" },
  { key: "feltResolution", label: "Felt resolution", low: "open", high: "complete" },
];

const INITIAL_RATINGS: Ratings = {
  liking: 62,
  tension: 45,
  arousal: 58,
  urgeToMove: 55,
  interest: 68,
  familiarity: 45,
  feltResolution: 52,
};

const GOALS: Record<GoalId, { label: string; targets: Ratings }> = {
  dance: {
    label: "Dance",
    targets: { liking: 75, tension: 52, arousal: 88, urgeToMove: 95, interest: 70, familiarity: 58, feltResolution: 60 },
  },
  relax: {
    label: "Relax",
    targets: { liking: 72, tension: 15, arousal: 20, urgeToMove: 18, interest: 50, familiarity: 62, feltResolution: 82 },
  },
  focus: {
    label: "Focus",
    targets: { liking: 62, tension: 25, arousal: 42, urgeToMove: 35, interest: 64, familiarity: 58, feltResolution: 68 },
  },
  curiosity: {
    label: "Curiosity",
    targets: { liking: 55, tension: 60, arousal: 62, urgeToMove: 45, interest: 95, familiarity: 22, feltResolution: 38 },
  },
  comfort: {
    label: "Comfort",
    targets: { liking: 82, tension: 18, arousal: 34, urgeToMove: 38, interest: 55, familiarity: 88, feltResolution: 84 },
  },
  catharsis: {
    label: "Catharsis",
    targets: { liking: 72, tension: 82, arousal: 86, urgeToMove: 62, interest: 86, familiarity: 52, feltResolution: 92 },
  },
};

function closeness(value: number, target: number) {
  return Math.max(0, 100 - Math.abs(value - target) * 1.45);
}

function mean(values: number[]) {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function safeParseObservations(value: string | null): Observation[] {
  if (!value) return [];
  try {
    const parsed: unknown = JSON.parse(value);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item): item is Observation => {
      if (!item || typeof item !== "object") return false;
      const candidate = item as Partial<Observation>;
      return (
        typeof candidate.id === "string" &&
        typeof candidate.landmarkId === "string" &&
        typeof candidate.recordedAt === "string" &&
        typeof candidate.ratings === "object" &&
        candidate.ratings !== null
      );
    });
  } catch {
    return [];
  }
}

const LANDMARK_CHARACTER_FIELDS: Array<{ key: keyof PhraseCharacterObservation["ratings"]; label: string; low: string; high: string }> = [
  { key: "settledness", label: "Settledness", low: "suspended", high: "settled" },
  { key: "energy", label: "Energy", low: "calm", high: "energized" },
  { key: "familiarity", label: "Familiarity", low: "surprising", high: "familiar" },
  { key: "liking", label: "Liking", low: "less", high: "more" },
];

function signed(value: number, digits = 0) {
  const rounded = Number(value.toFixed(digits));
  return `${rounded > 0 ? "+" : ""}${rounded}`;
}

function LandmarkRouteContrast({ contrast }: { contrast: LandmarkCharacterContrast }) {
  const { source, target } = contrast;
  return <section className="personal-landmark-contrast" aria-labelledby="personal-landmark-contrast-title">
    <header>
      <div><span>Performed landmark · particular reports</span><h3 id="personal-landmark-contrast-title">What changed when you played this route again?</h3></div>
      <strong>{contrast.pathLabel}</strong>
    </header>
    <div className="personal-landmark-pair" aria-label="Earlier and later landmark performances">
      <div><span><i aria-hidden="true" />A · earlier</span><strong>{source.context.label}</strong></div>
      <div><span><i aria-hidden="true" />B · later</span><strong>{target.context.label}</strong></div>
    </div>
    <p className="personal-landmark-control"><strong>Physical control</strong>{contrast.controlFacts.join(" ")}</p>
    <div className="personal-landmark-axes" aria-label="Four listener reports shown separately">
      {LANDMARK_CHARACTER_FIELDS.map((field) => {
        const sourceValue = source.ratings[field.key];
        const targetValue = target.ratings[field.key];
        return <div className="personal-landmark-axis" key={field.key} role="img" aria-label={`${field.label}: earlier ${sourceValue}, later ${targetValue}, change ${signed(targetValue - sourceValue)}`}>
          <span>{field.label}<small>{field.low} · {field.high}</small></span>
          <i aria-hidden="true"><b style={{ left: `${sourceValue}%` }} /><em style={{ left: `${targetValue}%` }} /></i>
          <output>{sourceValue} → {targetValue}<small>Δ {signed(targetValue - sourceValue)}</small></output>
        </div>;
      })}
    </div>
    <div className="personal-landmark-evidence" aria-label="Measured MIDI and modeled teaching evidence kept separate">
      <span><small>measured · key span</small><strong>{source.evidence.measured.pitchSpan} → {target.evidence.measured.pitchSpan}</strong><em>Δ {signed(target.evidence.measured.pitchSpan - source.evidence.measured.pitchSpan)} keys</em></span>
      <span><small>measured · overlap</small><strong>{Math.round(source.evidence.measured.overlapShare * 100)} → {Math.round(target.evidence.measured.overlapShare * 100)}%</strong><em>Δ {signed((target.evidence.measured.overlapShare - source.evidence.measured.overlapShare) * 100)} points</em></span>
      <span><small>modeled · mean crunch</small><strong>{Math.round(source.evidence.modeled.meanCrunch * 100)} → {Math.round(target.evidence.modeled.meanCrunch * 100)}</strong><em>Δ {signed((target.evidence.modeled.meanCrunch - source.evidence.modeled.meanCrunch) * 100)} points</em></span>
      <span><small>modeled · ending repose</small><strong>{Math.round(source.evidence.modeled.endingRepose * 100)} → {Math.round(target.evidence.modeled.endingRepose * 100)}</strong><em>Δ {signed((target.evidence.modeled.endingRepose - source.evidence.modeled.endingRepose) * 100)} points</em></span>
    </div>
    <p className="personal-landmark-limit">The reports and evidence are aligned, not causally joined. Two performances do not establish a preference, an emotional property, a style rule, or musical goodness.</p>
  </section>;
}

export function PersonalLab() {
  const [landmarkId, setLandmarkId] = useState(LANDMARKS[0].id);
  const [goal, setGoal] = useState<GoalId>("curiosity");
  const [ratings, setRatings] = useState<Ratings>(INITIAL_RATINGS);
  const [observations, setObservations] = useState<Observation[]>([]);
  const [phraseObservations, setPhraseObservations] = useState<PhraseCharacterObservation[]>([]);
  const [storageReady, setStorageReady] = useState(false);
  const [deleteArmed, setDeleteArmed] = useState(false);

  useEffect(() => {
    const hydrationTask = window.setTimeout(() => {
      setObservations(safeParseObservations(window.localStorage.getItem(STORAGE_KEY)));
      setPhraseObservations(parsePhraseCharacterObservations(window.localStorage.getItem(PHRASE_CHARACTER_STORAGE_KEY)));
      setStorageReady(true);
    }, 0);
    return () => window.clearTimeout(hydrationTask);
  }, []);

  useEffect(() => {
    if (!storageReady) return;
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(observations));
  }, [observations, storageReady]);

  const selected = LANDMARKS.find((item) => item.id === landmarkId) ?? LANDMARKS[0];
  const goalProfile = GOALS[goal];
  const repeats = observations.filter(
    (item) => item.landmarkId === landmarkId && item.goal === goal,
  ).length;
  const responseSamples = useMemo(() => observations.flatMap<ResponseSample>((observation) => {
    const landmark = LANDMARKS.find((item) => item.id === observation.landmarkId);
    return landmark ? [{ position: { tension: landmark.tension, surprise: landmark.surprise, drive: landmark.drive }, liking: observation.ratings.liking, interest: observation.ratings.interest, familiarity: observation.ratings.familiarity, recordedAt: observation.recordedAt }] : [];
  }), [observations]);
  const learnedTerrain = useMemo(() => learnPreferenceTerrain(responseSamples), [responseSamples]);
  const phraseCharacterSummary = useMemo(() => summarizePhraseCharacter(phraseObservations), [phraseObservations]);
  const latestLandmarkPhrase = useMemo(() => phraseObservations.findLast((observation) => observation.context?.kind === "landmark-path") ?? null, [phraseObservations]);
  const landmarkCharacterContrast = useMemo(() => latestLandmarkCharacterContrast(phraseObservations), [phraseObservations]);
  const selectedHistory = useMemo(() => observations.filter((observation) => observation.landmarkId === landmarkId).map<ResponseSample>((observation) => ({ position: { tension: selected.tension, surprise: selected.surprise, drive: selected.drive }, liking: observation.ratings.liking, interest: observation.ratings.interest, familiarity: observation.ratings.familiarity, recordedAt: observation.recordedAt })), [landmarkId, observations, selected]);
  const historyTrend = useMemo(() => familiarityResponseTrend(selectedHistory), [selectedHistory]);
  const terrainRanking = useMemo(() => learnedTerrain ? LANDMARKS.map((landmark) => ({ landmark, fit: terrainFit(landmark, learnedTerrain) })).sort((a, b) => b.fit - a.fit).slice(0, 5) : [], [learnedTerrain]);

  const components = useMemo(() => {
    const target = goalProfile.targets;
    return [
      { label: "Sensory fit", value: closeness(ratings.tension, target.tension) },
      { label: "Prediction reward", value: closeness(ratings.interest, target.interest) },
      { label: "Motor fit", value: closeness(ratings.urgeToMove, target.urgeToMove) },
      { label: "Expressive salience", value: mean([ratings.arousal, ratings.interest]) },
      { label: "Coherence + transformation", value: mean([ratings.interest, ratings.feltResolution]) },
      { label: "Narrative payoff", value: mean([ratings.liking, ratings.feltResolution]) },
      { label: "Personal resonance", value: mean([ratings.liking, ratings.familiarity]) },
    ];
  }, [goalProfile, ratings]);

  const declaredGoalFit = mean(components.map((item) => item.value));
  const learnedFit = learnedTerrain ? terrainFit(selected, learnedTerrain) * 100 : null;
  const predictedFit = Math.round(learnedFit === null ? declaredGoalFit : declaredGoalFit * 0.42 + learnedFit * 0.58);
  const uncertainty = Math.round(learnedTerrain ? Math.max(learnedTerrain.uncertainty, 8 - repeats) : Math.max(6, 24 - repeats * 4));

  const saveObservation = () => {
    const observation: Observation = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      landmarkId,
      goal,
      recordedAt: new Date().toISOString(),
      ratings,
    };
    setObservations((current) => [...current, observation]);
    setDeleteArmed(false);
  };

  const exportObservations = () => {
    const payload = {
      schema: "music-with-no-names.personal-lens.v1",
      exportedAt: new Date().toISOString(),
      observations,
      phraseCharacterObservations: phraseObservations,
      learnedPreferenceModel: learnedTerrain,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "music-with-no-names-personal-lens.json";
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const deleteObservations = () => {
    setObservations([]);
    setPhraseObservations([]);
    window.localStorage.removeItem(STORAGE_KEY);
    window.localStorage.removeItem(PHRASE_CHARACTER_STORAGE_KEY);
    setDeleteArmed(false);
  };

  return (
    <section className="advanced-lab personal-lab" aria-labelledby="personal-title">
      <div className="lab-intro personal-intro">
        <div>
          <p className="section-kicker">Personal Lens · describe one listening experience</p>
          <h2 id="personal-title">Notice more than whether you liked it.</h2>
        </div>
        <p>
          Rate tension, movement, interest, familiarity, resolution, and liking separately. Your entries stay in this browser and can change from one listen to the next.
        </p>
      </div>

      <div className="personal-live-phrase-summary">
        <div><span>Live Piano phrase reports</span><strong>{phraseCharacterSummary ? `${phraseCharacterSummary.sampleCount} reflection${phraseCharacterSummary.sampleCount === 1 ? "" : "s"} · center ${Math.round(phraseCharacterSummary.center.settledness)} settled / ${Math.round(phraseCharacterSummary.center.energy)} energy` : "No live phrase reflections yet"}</strong><small>{phraseCharacterSummary ? `${latestLandmarkPhrase?.context ? `Latest performed landmark: ${latestLandmarkPhrase.context.label}. ` : ""}Uncertainty ±${Math.round(phraseCharacterSummary.uncertainty)} · surprise/familiarity and liking remain separate report dimensions.` : "Use the Piano Experience focus to map your own phrase without asking the model to infer how it felt."}</small></div>
        <a href="?lab=piano&pianoLens=experience">Open live phrase map</a>
      </div>

      {landmarkCharacterContrast ? <LandmarkRouteContrast contrast={landmarkCharacterContrast} /> : null}

      <div className="personal-context">
        <label>
          <span>Landmark</span>
          <select value={landmarkId} onChange={(event) => setLandmarkId(event.target.value)}>
            {LANDMARKS.map((item) => (
              <option key={item.id} value={item.id}>{item.creator} · {item.title}</option>
            ))}
          </select>
        </label>
        <div>
          <span>Listening purpose</span>
          <div className="goal-picker" role="group" aria-label="Personal Lens listening purpose">
            {(Object.entries(GOALS) as [GoalId, (typeof GOALS)[GoalId]][]).map(([id, item]) => (
              <button key={id} type="button" onClick={() => setGoal(id)} aria-pressed={goal === id} className={goal === id ? "is-selected" : ""}>
                {item.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="personal-stage">
        <div className="rating-panel">
          <div className="panel-heading">
            <span>Response observation</span>
            <h3>{selected.title}</h3>
            <p>Move each dimension independently. Contradictions are useful data.</p>
          </div>
          <div className="rating-fields">
            {RATING_FIELDS.map((field) => (
              <label key={field.key}>
                <span><strong>{field.label}</strong><output>{ratings[field.key]}</output></span>
                <input
                  type="range"
                  min="0"
                  max="100"
                  aria-label={field.label}
                  value={ratings[field.key]}
                  onChange={(event) => setRatings((current) => ({ ...current, [field.key]: Number(event.target.value) }))}
                />
                <small><i>{field.low}</i><i>{field.high}</i></small>
              </label>
            ))}
          </div>
          <button type="button" className="save-observation" onClick={saveObservation}>
            Save this listening
          </button>
        </div>

        <aside className="fit-panel" aria-live="polite">
          <div className="fit-score">
            <span>predicted fit for this listener and goal</span>
            <strong>{predictedFit}<i>±{uncertainty}</i></strong>
            <p>{repeats === 0 ? "No repeated observations yet" : `${repeats} prior observation${repeats === 1 ? "" : "s"} in this context`}</p>
          </div>
          <div className="fit-components">
            {components.map((item) => (
              <div key={item.label}>
                <span>{item.label}</span>
                <i><b style={{ width: `${Math.round(item.value)}%` }} /></i>
                <output>{Math.round(item.value)}</output>
              </div>
            ))}
          </div>
          <p className="model-explanation">
            This demonstrator compares your current ratings with declared targets for
            <strong> {goalProfile.label.toLowerCase()}</strong>. Its uncertainty narrows
            only with repeated observations; it does not infer a universal taste score.
          </p>
        </aside>
      </div>

      <div className="personal-terrain">
        <div className="terrain-heading">
          <div><span>Transparent personal response surface</span><h3>{learnedTerrain ? "A preference center learned from your saved evidence" : "Save observations to reveal a response terrain"}</h3></div>
          <p>{learnedTerrain ? `${learnedTerrain.sampleCount} observations · model uncertainty ±${Math.round(learnedTerrain.uncertainty)}` : "No learned model yet. The declared goal profile above remains available without pretending to know your taste."}</p>
        </div>
        {learnedTerrain ? (
          <div className="terrain-grid">
            <article className="terrain-center"><span>Learned center</span><div><i style={{ left: `${learnedTerrain.center.tension}%`, top: `${100 - learnedTerrain.center.surprise}%`, width: `${learnedTerrain.bandwidth.tension * 1.4}px`, height: `${learnedTerrain.bandwidth.surprise * 1.4}px` }} /><b style={{ left: `${learnedTerrain.center.tension}%`, top: `${100 - learnedTerrain.center.surprise}%` }} /></div><p>x: tension {learnedTerrain.center.tension.toFixed(0)} · y: surprise {learnedTerrain.center.surprise.toFixed(0)} · desired drive {learnedTerrain.center.drive.toFixed(0)}</p></article>
            <article className="terrain-ranking"><span>Nearby landmarks under this model</span>{terrainRanking.map((item) => <div key={item.landmark.id}><strong>{item.landmark.short}</strong><i><b style={{ width: `${Math.round(item.fit * 100)}%` }} /></i><output>{Math.round(item.fit * 100)}%</output></div>)}<p>Proximity is a Gaussian response surface weighted by your liking and interest reports. It is interpretable, sparse, and uncertain.</p></article>
            <article className="familiarity-history"><span>Repeated listening · {selected.short}</span>{selectedHistory.length ? <div className="history-bars" role="img" aria-label={`Familiarity and liking across ${selectedHistory.length} saved observations for ${selected.title}`}>{selectedHistory.map((sample, index) => <i key={`${sample.recordedAt}-${index}`}><b style={{ height: `${sample.familiarity}%` }} /><em style={{ height: `${sample.liking}%` }} /></i>)}</div> : <strong>No repeat history for this landmark</strong>}<p>{historyTrend ? `Familiarity ${historyTrend.familiarityChange >= 0 ? "+" : ""}${historyTrend.familiarityChange}; liking ${historyTrend.likingChange >= 0 ? "+" : ""}${historyTrend.likingChange} across ${historyTrend.observations} observations.` : "Save this landmark at least twice to compare familiarity and liking change without assuming they move together."}</p></article>
          </div>
        ) : null}
      </div>

      <div className="personal-data">
        <div>
          <span>Local evidence</span>
          <strong>{observations.length} landmark listening{observations.length === 1 ? "" : "s"} · {phraseObservations.length} live phrase reflection{phraseObservations.length === 1 ? "" : "s"}</strong>
          <p>Stored only in this browser. No account, upload, or cohort comparison.</p>
        </div>
        <div className="data-actions">
          <button type="button" onClick={exportObservations} disabled={observations.length + phraseObservations.length === 0}>Export JSON</button>
          {deleteArmed ? (
            <button type="button" className="danger" onClick={deleteObservations}>Confirm delete all</button>
          ) : (
            <button type="button" onClick={() => setDeleteArmed(true)} disabled={observations.length + phraseObservations.length === 0}>Delete local data</button>
          )}
        </div>
      </div>
    </section>
  );
}
