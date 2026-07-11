"use client";

import { useMemo, useState, type CSSProperties } from "react";
import {
  dimensionProximity,
  experienceProximity,
  type ExperiencePosition,
  type ExperienceWeights,
} from "@/lib/experience-model";
import { densityRegion, meanValue } from "@/lib/atlas-model";

type Genre = "generated" | "pop" | "blues" | "classical";
type CorpusGenre = Exclude<Genre, "generated">;
type AtlasLayer = "whole" | "composition" | "performance" | "production";
type AtlasDimension = "tension" | "surprise" | "drive" | "repetition" | "expression" | "transformation";

export const LANDMARK_SCHEMA_VERSION = "music-with-no-names.landmark.v1" as const;

export type LandmarkMetadata = {
  schema: typeof LANDMARK_SCHEMA_VERSION;
  work: { title: string; creator: string };
  performance: { performer: string; edition: string };
  production: { note: string };
  recording: { bundledAudio: false; access: string };
  provenance: { profileSource: string; corpus: string };
  licensing: { status: string; requirement: string };
};

type LandmarkSection = ExperiencePosition & {
  label: string;
};

export type Landmark = ExperiencePosition & {
  id: string;
  short: string;
  title: string;
  creator: string;
  genre: Genre;
  repetition: number;
  expression: number;
  description: string;
  mechanism: string;
  sections: LandmarkSection[];
};

export const LANDMARKS: Landmark[] = [
  {
    id: "generated-456",
    short: "4:5:6 field",
    title: "Generated 4:5:6 harmonic field",
    creator: "Music With No Names",
    genre: "generated",
    tension: 14,
    surprise: 18,
    drive: 34,
    repetition: 94,
    expression: 20,
    description: "A rights-clear generated field built from three simultaneous harmonic sources in the ratio 4:5:6.",
    mechanism: "Short shared periodicity and aligned partials make a compact baseline for separating physical fusion cues from liking.",
    sections: [
      { label: "Establish", tension: 10, surprise: 22, drive: 26 },
      { label: "Sustain", tension: 12, surprise: 8, drive: 34 },
      { label: "Middle voice moves", tension: 42, surprise: 58, drive: 38 },
      { label: "Return", tension: 8, surprise: 18, drive: 28 },
    ],
  },
  {
    id: "bad-guy",
    short: "bad guy",
    title: "bad guy",
    creator: "Billie Eilish",
    genre: "pop",
    tension: 42,
    surprise: 49,
    drive: 88,
    repetition: 90,
    expression: 72,
    description: "Sparse low-frequency design, dry close voice, a rigid pulse, and a late structural rupture.",
    mechanism: "A highly legible loop makes tiny timbral gestures salient; the ending changes the frame rather than adding harmonic density.",
    sections: [
      { label: "Opening", tension: 28, surprise: 38, drive: 72 },
      { label: "Core loop", tension: 38, surprise: 25, drive: 90 },
      { label: "Return", tension: 44, surprise: 28, drive: 92 },
      { label: "Final shift", tension: 72, surprise: 88, drive: 68 },
    ],
  },
  {
    id: "blinding-lights",
    short: "Blinding Lights",
    title: "Blinding Lights",
    creator: "The Weeknd",
    genre: "pop",
    tension: 28,
    surprise: 27,
    drive: 96,
    repetition: 88,
    expression: 60,
    description: "Persistent pulse and ostinato with bright, saturated production and staged density changes.",
    mechanism: "Motor certainty lets small changes in register, vocal intensity, and arrangement renew energy without breaking the orbit.",
    sections: [
      { label: "Pulse arrives", tension: 18, surprise: 30, drive: 84 },
      { label: "Verse", tension: 26, surprise: 20, drive: 90 },
      { label: "Lift", tension: 36, surprise: 34, drive: 98 },
      { label: "Return", tension: 28, surprise: 18, drive: 96 },
    ],
  },
  {
    id: "someone-like-you",
    short: "Someone Like You",
    title: "Someone Like You",
    creator: "Adele",
    genre: "pop",
    tension: 20,
    surprise: 22,
    drive: 20,
    repetition: 82,
    expression: 92,
    description: "A stable repeating accompaniment leaves space for vocal dynamics, phrasing, memory, and semantic meaning.",
    mechanism: "Low structural surprise is not low musical value: predictability supports recognition while the voice carries expressive change.",
    sections: [
      { label: "Piano frame", tension: 12, surprise: 15, drive: 12 },
      { label: "Voice enters", tension: 24, surprise: 24, drive: 18 },
      { label: "Expansion", tension: 44, surprise: 32, drive: 30 },
      { label: "Release", tension: 18, surprise: 12, drive: 14 },
    ],
  },
  {
    id: "thrill-is-gone",
    short: "The Thrill Is Gone",
    title: "The Thrill Is Gone",
    creator: "B.B. King",
    genre: "blues",
    tension: 48,
    surprise: 42,
    drive: 70,
    repetition: 76,
    expression: 96,
    description: "A stable cyclic ground foregrounds bends, vibrato, phrase spacing, attack, and placement around the beat.",
    mechanism: "Predictability of the form magnifies continuous pitch and timing deviations in the solo voice.",
    sections: [
      { label: "Cycle", tension: 34, surprise: 24, drive: 62 },
      { label: "Guitar phrase", tension: 66, surprise: 55, drive: 72 },
      { label: "Space", tension: 28, surprise: 38, drive: 44 },
      { label: "Response", tension: 52, surprise: 46, drive: 70 },
    ],
  },
  {
    id: "mannish-boy",
    short: "Mannish Boy",
    title: "Mannish Boy",
    creator: "Muddy Waters",
    genre: "blues",
    tension: 52,
    surprise: 34,
    drive: 92,
    repetition: 96,
    expression: 88,
    description: "A persistent riff and call-and-response frame turn small performance differences into communal events.",
    mechanism: "Repetition functions as synchronization and ritual rather than informational emptiness.",
    sections: [
      { label: "Riff", tension: 42, surprise: 18, drive: 88 },
      { label: "Call", tension: 58, surprise: 40, drive: 92 },
      { label: "Response", tension: 48, surprise: 26, drive: 96 },
      { label: "Riff returns", tension: 44, surprise: 14, drive: 94 },
    ],
  },
  {
    id: "bach-prelude",
    short: "Bach prelude",
    title: "Prelude in C major, BWV 846",
    creator: "J. S. Bach",
    genre: "classical",
    tension: 18,
    surprise: 28,
    drive: 22,
    repetition: 84,
    expression: 54,
    description: "A nearly invariant arpeggiated texture reveals changing voice-leading and center through slow harmonic motion.",
    mechanism: "Surface predictability makes the changing global relationship legible; arrival is carried by sequence and memory.",
    sections: [
      { label: "Establish", tension: 12, surprise: 18, drive: 18 },
      { label: "Travel", tension: 34, surprise: 35, drive: 22 },
      { label: "Compression", tension: 58, surprise: 46, drive: 28 },
      { label: "Arrival", tension: 8, surprise: 20, drive: 14 },
    ],
  },
  {
    id: "beethoven-five",
    short: "Beethoven 5",
    title: "Symphony No. 5, first movement",
    creator: "L. van Beethoven",
    genre: "classical",
    tension: 58,
    surprise: 56,
    drive: 76,
    repetition: 86,
    expression: 82,
    description: "A tiny rhythmic gesture recurs under displacement, fragmentation, expansion, and changing scale.",
    mechanism: "Extreme motif compressibility coexists with long-range uncertainty about destination and return.",
    sections: [
      { label: "Gesture", tension: 54, surprise: 62, drive: 78 },
      { label: "Expansion", tension: 70, surprise: 58, drive: 84 },
      { label: "Contrast", tension: 38, surprise: 48, drive: 54 },
      { label: "Return", tension: 82, surprise: 42, drive: 90 },
    ],
  },
  {
    id: "clair-de-lune",
    short: "Clair de Lune",
    title: "Clair de Lune",
    creator: "Claude Debussy",
    genre: "classical",
    tension: 29,
    surprise: 48,
    drive: 16,
    repetition: 50,
    expression: 90,
    description: "Weak pulse assertion, fluid center, registral space, and touch make color and return into orientation cues.",
    mechanism: "Coherence can be carried by timbre, contour, and memory without a dominant motor pulse.",
    sections: [
      { label: "Suspension", tension: 22, surprise: 46, drive: 10 },
      { label: "Motion", tension: 42, surprise: 54, drive: 26 },
      { label: "Expansion", tension: 48, surprise: 60, drive: 34 },
      { label: "Dissolve", tension: 14, surprise: 30, drive: 8 },
    ],
  },
  {
    id: "rite-augurs",
    short: "Rite / Augurs",
    title: "The Rite of Spring: Augurs of Spring",
    creator: "Igor Stravinsky",
    genre: "classical",
    tension: 88,
    surprise: 85,
    drive: 91,
    repetition: 78,
    expression: 86,
    description: "A stable pulse substrate and repeated vertical mass coexist with difficult-to-predict accent grouping.",
    mechanism: "The body can know when to move while prediction remains uncertain about where emphasis will land.",
    sections: [
      { label: "Impact", tension: 86, surprise: 92, drive: 92 },
      { label: "Repetition", tension: 82, surprise: 58, drive: 94 },
      { label: "Accent shift", tension: 94, surprise: 88, drive: 96 },
      { label: "Accumulation", tension: 98, surprise: 76, drive: 90 },
    ],
  },
];

const DIMENSION_LABELS: Record<AtlasDimension, string> = {
  tension: "sensory tension",
  surprise: "predictive surprise",
  drive: "embodied drive",
  repetition: "repetition",
  expression: "expressive salience",
  transformation: "long-form transformation",
};

const LAYER_LABELS: Record<AtlasLayer, string> = {
  whole: "whole recording",
  composition: "composition",
  performance: "performance",
  production: "production",
};

const CORPUS_DECLARATIONS: Record<CorpusGenre, { version: string; method: string; novelty: string }> = {
  pop: { version: "pop-starter-corpus-v1 · 3 profiles", method: "curated whole-recording and section hypotheses", novelty: "Stable pulse and loop make production, voice, and sectional-energy changes conspicuous." },
  blues: { version: "blues-starter-corpus-v1 · 2 profiles", method: "curated cyclic-frame and performance hypotheses", novelty: "A stable cycle magnifies continuous pitch, timing, interaction, and timbral variation." },
  classical: { version: "classical-starter-corpus-v1 · 4 profiles", method: "curated score, form, and reference-performance hypotheses", novelty: "Motif transformation, orchestration, center movement, and long-range memory carry change." },
};

function transformationValue(landmark: Landmark) {
  const dimensions: (keyof ExperiencePosition)[] = ["tension", "surprise", "drive"];
  return Math.min(100, dimensions.reduce((sum, dimension) => {
    const values = landmark.sections.map((section) => section[dimension]);
    return sum + Math.max(...values) - Math.min(...values);
  }, 0) / dimensions.length * 1.45);
}

function dimensionValue(landmark: Landmark, dimension: AtlasDimension) {
  return dimension === "transformation" ? transformationValue(landmark) : landmark[dimension];
}

function layerValue(landmark: Landmark, dimension: AtlasDimension, layer: AtlasLayer) {
  const base = dimensionValue(landmark, dimension);
  if (layer === "whole") return base;
  if (layer === "composition") {
    if (dimension === "drive") return base * 0.76;
    if (dimension === "expression") return base * 0.68;
    if (dimension === "transformation") return Math.min(100, base * 1.12);
    return base * 0.92;
  }
  if (layer === "performance") {
    if (dimension === "expression") return Math.min(100, base * 1.08);
    if (dimension === "repetition") return base * 0.82;
    return Math.min(100, base * 0.9 + landmark.expression * 0.12);
  }
  if (dimension === "drive") return Math.min(100, base * (landmark.genre === "pop" ? 1.05 : 0.92));
  if (dimension === "expression") return Math.min(100, base * 0.9 + landmark.drive * 0.08);
  if (dimension === "transformation") return base * 0.72;
  return Math.min(100, base * 0.9 + landmark.repetition * 0.08);
}

function landmarkMetadata(landmark: Landmark): LandmarkMetadata {
  const generated = landmark.genre === "generated";
  return {
    schema: LANDMARK_SCHEMA_VERSION,
    work: { title: landmark.title, creator: landmark.creator },
    performance: { performer: generated ? "browser-generated harmonic sources" : landmark.creator, edition: generated ? "deterministic synthesis profile" : "illustrative reference performance; recording not asserted" },
    production: { note: generated ? "harmonic-complex synthesis with conservative gain" : "curatorial production-layer description; not extracted measurement" },
    recording: { bundledAudio: false, access: generated ? "generated on demand in the Labs" : "load audio you are entitled to use in Recording Journey" },
    provenance: { profileSource: generated ? "declared generated fixture" : "curatorial hypothesis profile", corpus: `${landmark.genre}-starter-corpus-v1` },
    licensing: { status: generated ? "rights-clear generated profile" : "metadata and analysis profile only", requirement: generated ? "no commercial audio used" : "commercial audio is not bundled; user supplies lawful access" },
  };
}

function modelUncertainty(landmark: Landmark) {
  return landmark.genre === "generated" ? 7 : Math.round(12 + landmark.surprise * 0.12);
}

function listenerSpread(landmark: Landmark) {
  return Math.round(10 + landmark.expression * 0.15);
}

const GOALS: Record<
  string,
  { label: string; position: ExperiencePosition; weights: ExperienceWeights }
> = {
  balanced: {
    label: "Balanced discovery",
    position: { tension: 42, surprise: 48, drive: 68 },
    weights: {},
  },
  dance: {
    label: "Movement",
    position: { tension: 45, surprise: 35, drive: 92 },
    weights: { drive: 2.2, tension: 0.8, surprise: 0.8 },
  },
  comfort: {
    label: "Comfort",
    position: { tension: 18, surprise: 20, drive: 34 },
    weights: { tension: 1.4, surprise: 1.4, drive: 0.7 },
  },
  contemplation: {
    label: "Contemplation",
    position: { tension: 30, surprise: 50, drive: 18 },
    weights: { drive: 1.3, surprise: 1.1 },
  },
  curiosity: {
    label: "Curiosity",
    position: { tension: 62, surprise: 78, drive: 55 },
    weights: { surprise: 1.8, tension: 1.1, drive: 0.5 },
  },
};

function fitPercent(value: number) {
  return Math.round(value * 100);
}

export function AtlasLab() {
  const [selectedId, setSelectedId] = useState("bad-guy");
  const [goalId, setGoalId] = useState("balanced");
  const [preference, setPreference] = useState<ExperiencePosition>(
    GOALS.balanced.position,
  );
  const [xAxis, setXAxis] = useState<AtlasDimension>("tension");
  const [yAxis, setYAxis] = useState<AtlasDimension>("surprise");
  const [sizeAxis, setSizeAxis] = useState<AtlasDimension>("drive");
  const [layer, setLayer] = useState<AtlasLayer>("whole");
  const selected = LANDMARKS.find((landmark) => landmark.id === selectedId) ?? LANDMARKS[0];
  const weights = useMemo(() => GOALS[goalId]?.weights ?? {}, [goalId]);

  const landmarksWithFit = useMemo(
    () =>
      LANDMARKS.map((landmark) => ({
        ...landmark,
        fit: experienceProximity(landmark, preference, weights),
        xValue: layerValue(landmark, xAxis, layer),
        yValue: layerValue(landmark, yAxis, layer),
        sizeValue: layerValue(landmark, sizeAxis, layer),
      })),
    [layer, preference, sizeAxis, weights, xAxis, yAxis],
  );
  const genreRegions = useMemo(() => (Object.keys(CORPUS_DECLARATIONS) as CorpusGenre[]).map((genre) => {
    const items = landmarksWithFit.filter((landmark) => landmark.genre === genre);
    return { genre, ...densityRegion(items) };
  }), [landmarksWithFit]);
  const noveltyProfiles = useMemo(() => (Object.keys(CORPUS_DECLARATIONS) as CorpusGenre[]).map((genre) => {
    const items = LANDMARKS.filter((landmark) => landmark.genre === genre);
    return {
      genre,
      repetition: meanValue(items.map((item) => item.repetition)),
      expression: meanValue(items.map((item) => item.expression)),
      surprise: meanValue(items.map((item) => item.surprise)),
      transformation: meanValue(items.map(transformationValue)),
      declaration: CORPUS_DECLARATIONS[genre],
    };
  }), []);
  const selectedFit = experienceProximity(selected, preference, weights);
  const selectedMetadata = landmarkMetadata(selected);
  const profile = [
    {
      label: "Sensory fit",
      value: dimensionProximity(selected.tension, preference.tension),
    },
    {
      label: "Prediction fit",
      value: dimensionProximity(selected.surprise, preference.surprise),
    },
    {
      label: "Motor fit",
      value: dimensionProximity(selected.drive, preference.drive),
    },
    { label: "Coherence", value: selected.repetition / 100 },
    { label: "Expressive salience", value: selected.expression / 100 },
  ];

  const chooseGoal = (id: string) => {
    const goal = GOALS[id];
    setGoalId(id);
    setPreference(goal.position);
  };

  const setDimension = (dimension: keyof ExperiencePosition, value: number) => {
    setGoalId("custom");
    setPreference((current) => ({ ...current, [dimension]: value }));
  };

  return (
    <section className="advanced-lab atlas-lab" aria-labelledby="atlas-title">
      <div className="lab-intro atlas-intro">
        <div>
          <p className="section-kicker">Experience atlas · recordings as trajectories</p>
          <h2 id="atlas-title">There is no universal good region.</h2>
        </div>
        <p>
          The map locates curatorial hypotheses about recordings. Move your preferred
          tension, surprise, and drive: the proximity halos change because musical value
          belongs to a listener, a purpose, and a moment in time.
        </p>
      </div>

      <div className="atlas-controls">
        <div className="goal-picker" role="group" aria-label="Listening purpose">
          {Object.entries(GOALS).map(([id, goal]) => (
            <button
              key={id}
              type="button"
              className={goalId === id ? "is-selected" : ""}
              onClick={() => chooseGoal(id)}
              aria-pressed={goalId === id}
            >
              {goal.label}
            </button>
          ))}
        </div>
        <div className="preference-controls">
          {(
            [
              ["tension", "Preferred sensory tension"],
              ["surprise", "Preferred surprise"],
              ["drive", "Desired embodied drive"],
            ] as const
          ).map(([dimension, label]) => (
            <label className="control-field" key={dimension}>
              <span>
                {label}
                <output>{preference[dimension]}</output>
              </span>
              <input
                type="range"
                aria-label={label}
                min="0"
                max="100"
                value={preference[dimension]}
                onChange={(event) => setDimension(dimension, Number(event.target.value))}
              />
            </label>
          ))}
        </div>
        <div className="atlas-view-controls">
          <div className="atlas-axis-controls">
            {([
              ["Horizontal axis", xAxis, setXAxis],
              ["Vertical axis", yAxis, setYAxis],
              ["Point size", sizeAxis, setSizeAxis],
            ] as [string, AtlasDimension, (value: AtlasDimension) => void][]).map(([label, value, setter]) => (
              <label key={label}><span>{label}</span><select aria-label={label} value={value} onChange={(event) => setter(event.target.value as AtlasDimension)}>{(Object.keys(DIMENSION_LABELS) as AtlasDimension[]).map((dimension) => <option key={dimension} value={dimension}>{DIMENSION_LABELS[dimension]}</option>)}</select></label>
            ))}
          </div>
          <div className="atlas-layer-switch" role="group" aria-label="Atlas interpretation layer">
            <span>Interpretation layer</span>
            {(Object.keys(LAYER_LABELS) as AtlasLayer[]).map((value) => <button key={value} type="button" aria-pressed={layer === value} onClick={() => setLayer(value)}>{LAYER_LABELS[value]}</button>)}
          </div>
          <p>Axis positions and layer decompositions are curator hypotheses until a recording is analyzed. Changing the view never changes the underlying landmark trajectory.</p>
        </div>
      </div>

      <div className="atlas-stage">
        <div className="atlas-plot-wrap">
          <div
            className="atlas-plot"
            role="img"
            aria-label={`Music landmarks positioned by ${DIMENSION_LABELS[xAxis]} and ${DIMENSION_LABELS[yAxis]}. Point size indicates ${DIMENSION_LABELS[sizeAxis]}. ${LAYER_LABELS[layer]} layer.`}
          >
            {genreRegions.map((region) => <div key={region.genre} className={`genre-cloud cloud-${region.genre}`} style={{ left: `${region.centerX}%`, top: `${100 - region.centerY}%`, width: `${region.width}%`, height: `${region.height}%` }}><strong>{region.genre}</strong><span>{region.count} declared profiles</span></div>)}
            {xAxis === "tension" && yAxis === "surprise" && layer === "whole" ? <div className="preference-target" style={{ left: `${preference.tension}%`, top: `${100 - preference.surprise}%` }} aria-hidden="true" /> : null}
            {landmarksWithFit.map((landmark) => {
              const style = {
                left: `${landmark.xValue}%`,
                top: `${100 - landmark.yValue}%`,
                "--fit": landmark.fit,
                "--point-size": `${22 + landmark.sizeValue * 0.13}px`,
                "--model-uncertainty": `${modelUncertainty(landmark)}px`,
                "--listener-spread": `${listenerSpread(landmark)}px`,
              } as CSSProperties;
              return (
                <button
                  key={landmark.id}
                  type="button"
                  className={`atlas-point genre-${landmark.genre} ${
                    selected.id === landmark.id ? "is-selected" : ""
                  }`}
                  style={style}
                  onClick={() => setSelectedId(landmark.id)}
                  aria-label={`${landmark.creator}, ${landmark.title}; ${DIMENSION_LABELS[xAxis]} ${Math.round(landmark.xValue)}, ${DIMENSION_LABELS[yAxis]} ${Math.round(landmark.yValue)}, ${DIMENSION_LABELS[sizeAxis]} ${Math.round(landmark.sizeValue)}, model uncertainty ${modelUncertainty(landmark)}, illustrative listener spread ${listenerSpread(landmark)}, preference proximity ${fitPercent(landmark.fit)} percent`}
                  aria-pressed={selected.id === landmark.id}
                >
                  <i aria-hidden="true" />
                  <span>{landmark.short}</span>
                </button>
              );
            })}
            <span className="atlas-y-high">more {DIMENSION_LABELS[yAxis]}</span>
            <span className="atlas-y-low">less {DIMENSION_LABELS[yAxis]}</span>
            <span className="atlas-x-low">less {DIMENSION_LABELS[xAxis]}</span>
            <span className="atlas-x-high">more {DIMENSION_LABELS[xAxis]}</span>
          </div>
          <div className="atlas-legend" aria-label="Atlas legend">
            <span><i className="legend-pop" /> pop</span>
            <span><i className="legend-blues" /> blues</span>
            <span><i className="legend-classical" /> classical</span>
            <span><i className="legend-generated" /> generated</span>
            <span><i className="legend-fit" /> halo = preference proximity</span>
            <span><i className="legend-uncertainty" /> inner ring = model uncertainty</span>
            <span><i className="legend-listener" /> outer ring = listener spread</span>
            <span>size = {DIMENSION_LABELS[sizeAxis]}</span>
          </div>
        </div>

        <aside className="landmark-detail" aria-live="polite">
          <div className="landmark-heading">
            <span>{selected.genre} landmark · illustrative profile</span>
            <h3>{selected.title}</h3>
            <p>{selected.creator}</p>
          </div>
          <div className="proximity-score">
            <strong>{fitPercent(selectedFit)}%</strong>
            <span>preference proximity</span>
          </div>
          <p className="landmark-description">{selected.description}</p>
          <div className="fit-profile">
            {profile.map((item) => (
              <div key={item.label}>
                <span>{item.label}</span>
                <i><b style={{ width: `${fitPercent(item.value)}%` }} /></i>
                <output>{fitPercent(item.value)}</output>
              </div>
            ))}
          </div>
          <p className="mechanism-note"><strong>Why it may work:</strong> {selected.mechanism}</p>
          <div className="evidence-ledger">
            <div className="evidence-measured"><span>Measured evidence</span><strong>{selected.genre === "generated" ? "declared generated ratios" : "not loaded"}</strong><p>{selectedMetadata.recording.access}</p></div>
            <div className="evidence-curator"><span>Curator hypothesis</span><strong>{selectedMetadata.provenance.profileSource}</strong><p>{LAYER_LABELS[layer]} view · model uncertainty {modelUncertainty(selected)}</p></div>
            <div className="evidence-listener"><span>Listener reports</span><strong>illustrative spread {listenerSpread(selected)}</strong><p>Your preference target is separate; no cohort responses are bundled.</p></div>
          </div>
          <details className="landmark-provenance"><summary>Provenance and licensing</summary><dl><div><dt>Schema</dt><dd>{selectedMetadata.schema}</dd></div><div><dt>Corpus</dt><dd>{selectedMetadata.provenance.corpus}</dd></div><div><dt>Recording</dt><dd>{selectedMetadata.recording.access}</dd></div><div><dt>Rights</dt><dd>{selectedMetadata.licensing.status}. {selectedMetadata.licensing.requirement}</dd></div></dl></details>
        </aside>
      </div>

      <div className="novelty-comparison">
        <div className="journey-heading"><div><span>Corpus comparison · where novelty tends to live</span><h3>Stable frames make different changes audible.</h3></div><p>descriptive teaching profiles · overlapping, not essential</p></div>
        <div className="novelty-cards">
          {noveltyProfiles.map((profile) => <article key={profile.genre} className={`novelty-${profile.genre}`}><div><span>{profile.genre}</span><strong>{profile.declaration.version}</strong><p>{profile.declaration.method}</p></div><div className="novelty-bars">{([[
            "stable repetition", profile.repetition,
          ], [
            "expressive variation", profile.expression,
          ], [
            "event surprise", profile.surprise,
          ], [
            "long-form change", profile.transformation,
          ]] as [string, number][]).map(([label, value]) => <div key={label}><span>{label}</span><i><b style={{ width: `${value}%` }} /></i><output>{Math.round(value)}</output></div>)}</div><p className="novelty-note">{profile.declaration.novelty}</p></article>)}
        </div>
        <p className="corpus-boundary">Cloud centers and widths are computed from the currently selected axes and interpretation layer. Small counts, curator placement, and corpus version remain visible; the regions overlap by design and are not claims about all music in a genre.</p>
      </div>

      <div className="journey-view">
        <div className="journey-heading">
          <div>
            <span>Selected recording · section trajectory</span>
            <h3>{selected.title} is a path, not a point</h3>
          </div>
          <p>bars: tension · surprise · drive</p>
        </div>
        <div className="journey-sections">
          {selected.sections.map((section, index) => (
            <article key={section.label}>
              <span>{String(index + 1).padStart(2, "0")}</span>
              <h4>{section.label}</h4>
              <div className="journey-bars" aria-label={`${section.label}: tension ${section.tension}, surprise ${section.surprise}, drive ${section.drive}`}>
                <i style={{ height: `${section.tension}%` }} />
                <i style={{ height: `${section.surprise}%` }} />
                <i style={{ height: `${section.drive}%` }} />
              </div>
            </article>
          ))}
        </div>
      </div>

      <div className="lab-learning-note atlas-note">
        <strong>Interpretation boundary:</strong> these song positions are explicit
        curatorial hypotheses, not extracted measurements or claims about entire genres.
        Commercial audio is never bundled. Load audio you are entitled to use in the
        Recording Journey to add measured evidence; curator uncertainty and illustrative
        listener spread remain separate encodings.
      </div>
    </section>
  );
}
