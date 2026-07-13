"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import {
  CHROMATIC_SOLFEGE,
  CONVENTIONAL_PITCH_CLASSES,
  PIANO_SCALES,
  conventionalPitchName,
  fifthStepForPitchClass,
  fifthsCircle,
  frequencyFromMidi,
  inferScaleCandidates,
  intervalLandmark,
  nearestMidiForPitchClass,
  noteContext,
  pairwiseIntervals,
  parseMidiMessage,
  pitchClassFromMidi,
  scaleCoverage,
  scaleSemitones,
  resolutionDirection,
  tonalTendency,
  type PianoScale,
  type ScaleCandidate,
} from "@/lib/piano-model";
import { sonorityPerceptionModel } from "@/lib/sonority-model";

type PianoStage = "map" | "combine" | "fifths";
type ScaleId = PianoScale["id"];
type MidiInputLike = {
  id: string;
  name?: string | null;
  manufacturer?: string | null;
  state?: string;
  onmidimessage: ((event: { data: Uint8Array }) => void) | null;
};
type MidiAccessLike = {
  inputs: Map<string, MidiInputLike>;
  onstatechange: (() => void) | null;
};
type NavigatorWithMidi = Navigator & {
  requestMIDIAccess?: (options?: { sysex?: boolean }) => Promise<MidiAccessLike>;
};

type AnalysisPoint = {
  index: number;
  signature: string;
  label: string;
  crunch: number;
  pull: number;
  arrival: number;
};

const STAGES: { id: PianoStage; number: string; title: string; promise: string }[] = [
  { id: "map", number: "01", title: "Map the keys", promise: "Do, scale positions, and physical distance" },
  { id: "combine", number: "02", title: "Combine notes", promise: "intervals, chords, and separate evidence" },
  { id: "fifths", number: "03", title: "Walk by fifths", promise: "derive the circle from repeated 3:2 moves" },
];

const SONORITY_SETS = [
  { label: "Compact aligned field", offsets: [0, 4, 7], relation: "near 4:5:6", possibility: "may support fusion or arrival" },
  { label: "Lowered-middle field", offsets: [0, 3, 7], relation: "near 10:12:15", possibility: "may support weight, warmth, or shadow in familiar styles" },
  { label: "Held-open field", offsets: [0, 5, 7], relation: "two linked spans", possibility: "may invite motion when a style makes one likely" },
  { label: "Close cluster", offsets: [0, 1, 2], relation: "adjacent keyboard steps", possibility: "may support pressure, bite, or dense color" },
] as const;

const WHITE_PITCH_CLASSES = new Set([0, 2, 4, 5, 7, 9, 11]);
const VISIBLE_NOTES = Array.from({ length: 25 }, (_, index) => 48 + index);
const WHITE_NOTES = VISIBLE_NOTES.filter((note) => WHITE_PITCH_CLASSES.has(pitchClassFromMidi(note)));

function formatHz(value: number) {
  return `${value.toFixed(value < 1000 ? 1 : 0)} Hz`;
}

function useMidiKeyboard(onNoteOn: (note: number) => void, onNotesChange: (notes: Map<number, number>) => void) {
  const accessRef = useRef<MidiAccessLike | null>(null);
  const pressedRef = useRef(new Set<number>());
  const sustainRef = useRef(false);
  const notesRef = useRef(new Map<number, number>());
  const onNoteOnRef = useRef(onNoteOn);
  const onNotesChangeRef = useRef(onNotesChange);
  const [supported, setSupported] = useState<boolean | null>(null);
  const [inputs, setInputs] = useState<MidiInputLike[]>([]);
  const [selectedInputId, setSelectedInputId] = useState("");
  const [notes, setNotes] = useState<Map<number, number>>(new Map());
  const [status, setStatus] = useState("Connect a MIDI keyboard, or use the on-screen keys.");

  useEffect(() => {
    onNoteOnRef.current = onNoteOn;
    onNotesChangeRef.current = onNotesChange;
  }, [onNoteOn, onNotesChange]);

  const refreshInputs = useCallback((access: MidiAccessLike) => {
    const next = Array.from(access.inputs.values()).filter((input) => input.state !== "disconnected");
    setInputs(next);
    setSelectedInputId((current) => next.some((input) => input.id === current) ? current : next[0]?.id ?? "");
    setStatus(next.length > 0 ? `${next.length} MIDI input${next.length === 1 ? "" : "s"} available.` : "Permission granted, but no MIDI input is visible yet.");
  }, []);

  const connect = useCallback(async () => {
    const request = (navigator as NavigatorWithMidi).requestMIDIAccess;
    if (!request) {
      setSupported(false);
      setStatus("This browser does not expose MIDI input. The on-screen piano still works.");
      return;
    }
    setStatus("Waiting for MIDI permission…");
    try {
      const access = await request.call(navigator, { sysex: false });
      accessRef.current = access;
      refreshInputs(access);
      access.onstatechange = () => refreshInputs(access);
    } catch {
      setStatus("MIDI permission was not granted. You can retry or use the on-screen piano.");
    }
  }, [refreshInputs]);

  const clear = useCallback(() => {
    pressedRef.current.clear();
    sustainRef.current = false;
    notesRef.current = new Map();
    setNotes(notesRef.current);
  }, []);

  useEffect(() => {
    const access = accessRef.current;
    const input = access?.inputs.get(selectedInputId);
    if (!input) return;
    clear();
    setStatus(`Listening to ${input.name || "MIDI input"}. Press a key to place it in every view.`);
    input.onmidimessage = (event) => {
      const message = parseMidiMessage(event.data);
      if (message.type === "note-on") {
        pressedRef.current.add(message.note);
        const next = new Map(notesRef.current);
        next.set(message.note, message.velocity);
        notesRef.current = next;
        setNotes(next);
        onNoteOnRef.current(message.note);
        onNotesChangeRef.current(next);
      } else if (message.type === "note-off") {
        pressedRef.current.delete(message.note);
        if (!sustainRef.current) {
          const next = new Map(notesRef.current);
          next.delete(message.note);
          notesRef.current = next;
          setNotes(next);
          onNotesChangeRef.current(next);
        }
      } else if (message.type === "sustain") {
        sustainRef.current = message.down;
        if (!message.down) {
          const next = new Map(Array.from(notesRef.current.entries()).filter(([note]) => pressedRef.current.has(note)));
          notesRef.current = next;
          setNotes(next);
          onNotesChangeRef.current(next);
        }
      }
    };
    return () => {
      input.onmidimessage = null;
    };
  }, [clear, selectedInputId]);

  useEffect(() => () => {
    if (accessRef.current) accessRef.current.onstatechange = null;
  }, []);

  return { clear, connect, inputs, notes, selectedInputId, setSelectedInputId, status, supported };
}

function EvidenceMeter({ label, value, note }: { label: string; value: number | null; note: string }) {
  const percent = value == null ? 0 : Math.round(value * 100);
  return (
    <article className="piano-evidence-meter">
      <div><span>{label}</span><strong>{value == null ? "—" : `${percent}%`}</strong></div>
      <i role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={value == null ? undefined : percent}><b style={{ width: `${percent}%` }} /></i>
      <p>{note}</p>
    </article>
  );
}

function tracePoints(points: AnalysisPoint[], key: "crunch" | "pull" | "arrival") {
  if (points.length === 0) return "";
  return points.map((point, index) => {
    const x = points.length === 1 ? 320 : 42 + (index / (points.length - 1)) * 574;
    const y = 138 - point[key] * 108;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(" ");
}

export function PianoLab() {
  const [stage, setStage] = useState<PianoStage>("map");
  const [scaleId, setScaleId] = useState<ScaleId>("bright-seven");
  const [doMidi, setDoMidi] = useState(60);
  const [showConventions, setShowConventions] = useState(false);
  const [latchedNotes, setLatchedNotes] = useState<Map<number, number>>(new Map());
  const [newestNote, setNewestNote] = useState(60);
  const [practiceIndex, setPracticeIndex] = useState(0);
  const [playedHistory, setPlayedHistory] = useState<number[]>([]);
  const [analysisTrail, setAnalysisTrail] = useState<AnalysisPoint[]>([]);
  const [fifthStep, setFifthStep] = useState(1);
  const practiceBaseRef = useRef<number | null>(null);

  const scale = PIANO_SCALES.find((item) => item.id === scaleId) ?? PIANO_SCALES[0];
  const scalePositions = useMemo(() => scaleSemitones(scale), [scale]);
  const practicePattern = useMemo(() => [...scalePositions, 12], [scalePositions]);

  const recordField = useCallback((field: Map<number, number>) => {
    const noteNumbers = Array.from(field.keys()).sort((first, second) => first - second);
    if (noteNumbers.length === 0) return;
    const model = sonorityPerceptionModel(noteNumbers.map((note) => ({
      frequencyHz: frequencyFromMidi(note),
      amplitude: Math.max(0.12, (field.get(note) ?? 96) / 127),
      partialCount: 9,
    })));
    const tonal = tonalTendency(noteNumbers, doMidi, scale);
    const arrival = model.repose * 0.55 + tonal.homeEvidence * 0.45;
    const signature = noteNumbers.map((note) => `${note}:${field.get(note) ?? 0}`).join("|");
    const label = noteNumbers.map((note) => noteContext(note, doMidi, scale).syllable).join(" + ");
    setAnalysisTrail((current) => {
      if (current.at(-1)?.signature === signature) return current;
      return [...current, {
        index: (current.at(-1)?.index ?? 0) + 1,
        signature,
        label,
        crunch: model.roughness,
        pull: tonal.homePull,
        arrival,
      }].slice(-12);
    });
  }, [doMidi, scale]);

  const registerPlayedNote = useCallback((note: number) => {
    setNewestNote(note);
    setPlayedHistory((current) => [...current, note].slice(-10));
    setFifthStep(fifthStepForPitchClass(pitchClassFromMidi(note - doMidi)));
    setPracticeIndex((current) => {
      const isDo = pitchClassFromMidi(note) === pitchClassFromMidi(doMidi);
      if (current === 0 || current >= practicePattern.length || practiceBaseRef.current == null) {
        if (!isDo) {
          practiceBaseRef.current = null;
          return 0;
        }
        practiceBaseRef.current = note;
        return 1;
      }
      const offset = note - practiceBaseRef.current;
      if (offset === practicePattern[current]) return Math.min(practicePattern.length, current + 1);
      if (isDo) {
        practiceBaseRef.current = note;
        return 1;
      }
      practiceBaseRef.current = null;
      return 0;
    });
  }, [doMidi, practicePattern]);

  const registerMidiField = useCallback((midiField: Map<number, number>) => {
    const combined = new Map(latchedNotes);
    midiField.forEach((velocity, note) => combined.set(note, velocity));
    recordField(combined);
  }, [latchedNotes, recordField]);
  const midi = useMidiKeyboard(registerPlayedNote, registerMidiField);
  const activeNotes = useMemo(() => {
    const combined = new Map(latchedNotes);
    midi.notes.forEach((velocity, note) => combined.set(note, velocity));
    return combined;
  }, [latchedNotes, midi.notes]);
  const activeNoteNumbers = useMemo(() => Array.from(activeNotes.keys()).sort((a, b) => a - b), [activeNotes]);
  const focusNote = activeNotes.has(newestNote) || playedHistory.length > 0 ? newestNote : doMidi;
  const focus = noteContext(focusNote, doMidi, scale);
  const focusInterval = intervalLandmark(focus.rawStepsFromDo);
  const coverage = useMemo(() => scaleCoverage(activeNoteNumbers, doMidi, scale), [activeNoteNumbers, doMidi, scale]);
  const intervals = useMemo(() => pairwiseIntervals(activeNoteNumbers), [activeNoteNumbers]);
  const perception = useMemo(() => sonorityPerceptionModel(activeNoteNumbers.map((note) => ({
    frequencyHz: frequencyFromMidi(note),
    amplitude: Math.max(0.12, (activeNotes.get(note) ?? 96) / 127),
    partialCount: 9,
  }))), [activeNoteNumbers, activeNotes]);
  const tendency = useMemo(() => tonalTendency(activeNoteNumbers, doMidi, scale), [activeNoteNumbers, doMidi, scale]);
  const arrivalEvidence = activeNoteNumbers.length > 0
    ? perception.repose * 0.55 + tendency.homeEvidence * 0.45
    : 0;
  const activeSignature = activeNoteNumbers.map((note) => `${note}:${activeNotes.get(note) ?? 0}`).join("|");
  const evidenceNotes = useMemo(() => [...playedHistory.slice(-10), ...activeNoteNumbers], [playedHistory, activeNoteNumbers]);
  const scaleCandidates = useMemo(() => inferScaleCandidates(evidenceNotes, 4), [evidenceNotes]);
  const circle = useMemo(() => fifthsCircle(), []);
  const selectedFifth = circle.nodes[fifthStep];
  const enoughForSonority = activeNoteNumbers.length >= 2;
  const activeFifthSteps = useMemo(() => new Set(activeNoteNumbers.map((note) => (
    fifthStepForPitchClass(pitchClassFromMidi(note - doMidi))
  ))), [activeNoteNumbers, doMidi]);

  const currentRecorded = analysisTrail.at(-1)?.signature === activeSignature;
  const previousPoint = currentRecorded ? analysisTrail.at(-2) : analysisTrail.at(-1);
  const resolution = resolutionDirection(previousPoint?.arrival ?? null, arrivalEvidence);

  const resetPractice = () => {
    practiceBaseRef.current = null;
    setPracticeIndex(0);
    setPlayedHistory([]);
  };

  const clearNotes = () => {
    setLatchedNotes(new Map());
    midi.clear();
    setPlayedHistory([]);
    setAnalysisTrail([]);
  };

  const chooseScale = (id: ScaleId) => {
    setScaleId(id);
    clearNotes();
    resetPractice();
  };

  const makeDo = (note: number) => {
    const visibleDo = nearestMidiForPitchClass(pitchClassFromMidi(note), 55);
    setDoMidi(visibleDo);
    setNewestNote(visibleDo);
    setFifthStep(1);
    clearNotes();
    resetPractice();
  };

  const toggleKey = (note: number) => {
    if (!latchedNotes.has(note)) registerPlayedNote(note);
    const next = new Map(latchedNotes);
    if (next.has(note)) next.delete(note);
    else next.set(note, 104);
    setLatchedNotes(next);
    const combined = new Map(next);
    midi.notes.forEach((velocity, midiNote) => combined.set(midiNote, velocity));
    recordField(combined);
  };

  const loadSet = (offsets: readonly number[]) => {
    const next = new Map<number, number>();
    offsets.forEach((offset) => next.set(doMidi + offset, 100));
    setLatchedNotes(next);
    setNewestNote(doMidi + offsets[offsets.length - 1]);
    offsets.forEach((offset) => registerPlayedNote(doMidi + offset));
    const combined = new Map(next);
    midi.notes.forEach((velocity, midiNote) => combined.set(midiNote, velocity));
    recordField(combined);
  };

  const adoptScaleCandidate = (candidate: ScaleCandidate) => {
    setScaleId(candidate.scale.id);
    makeDo(nearestMidiForPitchClass(candidate.rootPitchClass, 55));
  };

  const setSelectedAsDo = () => {
    const absolutePitchClass = (pitchClassFromMidi(doMidi) + selectedFifth.pitchClass) % 12;
    makeDo(nearestMidiForPitchClass(absolutePitchClass, 55));
  };

  const renderKey = (note: number, black: boolean) => {
    const context = noteContext(note, doMidi, scale);
    const active = activeNotes.has(note);
    const home = context.stepsWithinOctave === 0;
    const circleTarget = stage === "fifths" && context.stepsWithinOctave === selectedFifth.pitchClass;
    const conventional = showConventions ? conventionalPitchName(note) : null;
    const className = [
      "piano-key",
      black ? "is-black" : "is-white",
      context.inScale ? "is-in-scale" : "",
      active ? "is-active" : "",
      home ? "is-home" : "",
      circleTarget ? "is-circle-target" : "",
    ].filter(Boolean).join(" ");
    const style = ({
      "--key-left": black
        ? `${(WHITE_NOTES.filter((white) => white < note).length / WHITE_NOTES.length) * 100}%`
        : `${(WHITE_NOTES.indexOf(note) / WHITE_NOTES.length) * 100}%`,
      "--key-width": `${100 / WHITE_NOTES.length}%`,
    } as CSSProperties);
    return (
      <button
        key={note}
        type="button"
        className={className}
        style={style}
        aria-pressed={active}
        aria-label={`${context.syllable}, ${context.inScale ? "in the selected scale" : "outside the selected scale"}, ${formatHz(context.frequencyHz)}${conventional ? `, conventionally ${conventional}` : ""}`}
        onClick={() => toggleKey(note)}
      >
        <span>{context.inScale || active || home ? context.syllable : "·"}</span>
        {conventional ? <small>{conventional}</small> : null}
      </button>
    );
  };

  return (
    <section className="advanced-lab piano-lab" aria-labelledby="piano-title">
      <div className="piano-intro">
        <div>
          <p className="section-kicker">Piano companion · relationships translated onto keys</p>
          <h2 id="piano-title">Let the keyboard reveal the map—not replace it.</h2>
          <p>Choose Do, then every key becomes a distance, a movable syllable, and a possible role in a scale. MIDI and on-screen keys act only as analytical input: add notes to reveal intervals, candidate scales, fifths position, modeled crunch, and motion toward or away from repose.</p>
        </div>
        <aside>
          <span>Keep the layers visible</span>
          <strong>Key position → frequency relationship → hearing model → scale context → your response</strong>
          <p>The first four can be visualized without generating or capturing sound. Whether the result is good, moving, or right for the moment remains a listener-and-context question.</p>
        </aside>
      </div>

      <nav className="piano-stage-nav" aria-label="Piano companion stages">
        {STAGES.map((item) => (
          <button key={item.id} type="button" className={stage === item.id ? "is-selected" : ""} aria-current={stage === item.id ? "step" : undefined} onClick={() => setStage(item.id)}>
            <span>{item.number}</span><strong>{item.title}</strong><small>{item.promise}</small>
          </button>
        ))}
      </nav>

      <div className="piano-context-bar">
        <label htmlFor="piano-scale">
          <span>Scale route from Do</span>
          <select id="piano-scale" value={scaleId} onChange={(event) => chooseScale(event.target.value as ScaleId)}>
            {PIANO_SCALES.map((item) => <option key={item.id} value={item.id}>{item.name} · {item.steps.join(" · ")}</option>)}
          </select>
          <small>{showConventions ? scale.conventionalName : scale.character}</small>
        </label>
        <label className="piano-convention-toggle">
          <input type="checkbox" checked={showConventions} onChange={(event) => setShowConventions(event.target.checked)} />
          <span>Show note and theory names</span>
          <small>Optional translation layer</small>
        </label>
        <div className="piano-home-readout">
          <span>Current home</span><strong>Do · {formatHz(frequencyFromMidi(doMidi))}</strong>
          <small>{showConventions ? conventionalPitchName(doMidi) : "movable, not fixed"}</small>
        </div>
      </div>

      <div className="midi-connection" aria-label="Piano and MIDI controls">
        <div className="midi-status"><i className={midi.inputs.length ? "is-connected" : ""} aria-hidden="true" /><div><span>MIDI input</span><strong role="status" aria-live="polite">{midi.status}</strong></div></div>
        {midi.inputs.length > 0 ? (
          <label htmlFor="midi-input"><span>Input device</span><select id="midi-input" value={midi.selectedInputId} onChange={(event) => midi.setSelectedInputId(event.target.value)}>{midi.inputs.map((input) => <option key={input.id} value={input.id}>{[input.manufacturer, input.name].filter(Boolean).join(" · ") || "MIDI input"}</option>)}</select></label>
        ) : (
          <button type="button" onClick={() => void midi.connect()} disabled={midi.supported === false}>{midi.supported === false ? "MIDI unavailable here" : "Connect MIDI keyboard"}</button>
        )}
        <div className="midi-analysis-only"><strong>Visualization only</strong><span>No sound is generated or recorded.</span></div>
        <button type="button" onClick={clearNotes} disabled={activeNoteNumbers.length === 0 && analysisTrail.length === 0}>Clear held notes + trace</button>
        <details><summary>MIDI setup help</summary><p>The browser asks before reading your keyboard. Choose an input after permission. Note-on, note-off, velocity, and sustain pedal messages are analyzed locally; nothing is uploaded. This page does not synthesize, record, or route audio. If MIDI is unavailable, the on-screen keys provide the same analytical views.</p></details>
      </div>

      <div className="piano-instrument">
        <div className="piano-instrument-heading">
          <div><span>{stage === "map" ? "Press one key, then walk the route" : stage === "combine" ? "Hold notes together or click to latch them" : "The selected fifths target is outlined on the keys"}</span><strong>{activeNoteNumbers.length === 0 ? "No notes held" : `${activeNoteNumbers.length} note${activeNoteNumbers.length === 1 ? "" : "s"} held`}</strong></div>
          <button type="button" onClick={() => makeDo(activeNoteNumbers[0] ?? newestNote)} disabled={activeNoteNumbers.length === 0 && playedHistory.length === 0}>Make {activeNoteNumbers.length ? "lowest active note" : "newest note"} Do</button>
        </div>
        <div className="piano-keyboard" role="group" aria-label="Two-octave on-screen piano; click keys to visualize, latch, and release notes without sound">
          <div className="piano-keys">{VISIBLE_NOTES.map((note) => renderKey(note, !WHITE_PITCH_CLASSES.has(pitchClassFromMidi(note))))}</div>
        </div>
        <div className="chromatic-degree-strip" role="img" aria-label={`Twelve equal keyboard steps from Do. Scale route: ${scale.solfege.join(", ")}. Active positions are marked.`}>
          {CHROMATIC_SOLFEGE.map((syllable, step) => {
            const degreeIndex = scalePositions.indexOf(step);
            const active = activeNoteNumbers.some((note) => noteContext(note, doMidi, scale).stepsWithinOctave === step);
            return <div key={syllable} className={`${degreeIndex >= 0 ? "is-in-scale" : ""} ${active ? "is-active" : ""}`}><span>{step}</span><strong>{degreeIndex >= 0 ? scale.solfege[degreeIndex] : syllable}</strong><small>{degreeIndex >= 0 ? `degree ${degreeIndex + 1}` : "between route"}</small></div>;
          })}
        </div>
      </div>

      <section className="live-sonority piano-live-reading" aria-labelledby="piano-live-reading-title">
        <div className="live-sonority-heading">
          <div><span>Live analytical reading · {activeNoteNumbers.length} held</span><h3 id="piano-live-reading-title">What pattern is this field making available?</h3></div>
          <p>MIDI supplies key number, velocity, release, and sustain—not audio. Spectral values use the same declared nine-partial teaching proxy as the earlier labs. No total “listenability” or quality score is computed.</p>
        </div>
        <div className="piano-evidence-grid">
          <EvidenceMeter label="Common periodic fit" value={enoughForSonority ? perception.harmonicity : null} note="Higher modeled alignment may support fusion; it does not guarantee consonance or liking." />
          <EvidenceMeter label="Modeled spectral crunch" value={enoughForSonority ? perception.roughness : null} note="Partial interference may support bite or crowding under the standardized spectrum proxy." />
          <EvidenceMeter label="Pull toward selected Do" value={activeNoteNumbers.length ? tendency.homePull : null} note={`${tendency.directNeighborCount ? `${tendency.directNeighborCount} adjacent pitch${tendency.directNeighborCount === 1 ? " intensifies" : "es intensify"}` : "Step distance and fifth relation shape"} this transparent tonal-frame heuristic.`} />
          <EvidenceMeter label="Repose / arrival evidence" value={activeNoteNumbers.length ? arrivalEvidence : null} note={activeNoteNumbers.length ? `${resolution.label}${resolution.delta == null ? "" : ` · ${resolution.delta >= 0 ? "+" : ""}${Math.round(resolution.delta * 100)} points`}` : "Play or place a field to establish the first point."} />
        </div>
        <div className="piano-analysis-body">
          <div className="piano-analysis-trace">
            <div><span>Recent held fields</span><strong>Descriptor trace—not a musical-goodness plot</strong><small>{analysisTrail.length ? `Latest: ${analysisTrail.at(-1)?.label}` : "Hold notes to begin the trace."}</small></div>
            <svg viewBox="0 0 640 166" role="img" aria-label={analysisTrail.length ? `Recent modeled crunch, pull toward Do, and arrival evidence across ${analysisTrail.length} held-note states.` : "No held-note analysis states yet."}>
              <line x1="42" y1="30" x2="616" y2="30" className="analysis-grid-line" />
              <line x1="42" y1="84" x2="616" y2="84" className="analysis-grid-line" />
              <line x1="42" y1="138" x2="616" y2="138" className="analysis-grid-line" />
              <text x="5" y="34">100</text><text x="13" y="88">50</text><text x="21" y="142">0</text>
              {analysisTrail.length ? <>
                <polyline points={tracePoints(analysisTrail, "crunch")} className="analysis-line is-crunch" />
                <polyline points={tracePoints(analysisTrail, "pull")} className="analysis-line is-pull" />
                <polyline points={tracePoints(analysisTrail, "arrival")} className="analysis-line is-arrival" />
              </> : null}
            </svg>
            <div className="analysis-legend" aria-hidden="true"><span className="is-crunch">crunch</span><span className="is-pull">pull to Do</span><span className="is-arrival">arrival evidence</span></div>
          </div>
          <div className="piano-scale-candidates">
            <div><span>Scale + center finder</span><strong>{scaleCandidates.length ? "Several frames can fit the same notes." : "Play a short phrase or chord."}</strong><small>Ranked only by pitch-class membership, route coverage, and whether the candidate home appeared. More distinct notes make the comparison more informative.</small></div>
            <ol>
              {scaleCandidates.map((candidate) => {
                const relativeRoot = CHROMATIC_SOLFEGE[pitchClassFromMidi(candidate.rootPitchClass - pitchClassFromMidi(doMidi))];
                const conventionalRoot = CONVENTIONAL_PITCH_CLASSES[candidate.rootPitchClass];
                return <li key={`${candidate.rootPitchClass}-${candidate.scale.id}`}><button type="button" onClick={() => adoptScaleCandidate(candidate)}><span>{Math.round(candidate.fit * 100)}% pattern fit</span><strong>Do = {relativeRoot}{showConventions ? ` (${conventionalRoot})` : ""} · {candidate.scale.name}</strong><small>{candidate.inScaleCount}/{candidate.uniqueNoteCount} observed positions inside · {candidate.routeCoveredCount}/{candidate.scale.solfege.length} route positions seen</small></button></li>;
              })}
            </ol>
            <p>{scaleCandidates.length ? "Choose a candidate to re-center Do and load that route. A high fit means compatible, not proven." : "The finder deliberately waits for note evidence; it does not assume the selected route is what you meant."}</p>
          </div>
        </div>
      </section>

      {stage === "map" ? (
        <div className="piano-map-stage">
          <section className="piano-note-inspector" aria-labelledby="piano-note-title">
            <div><span>Newest pitch</span><h3 id="piano-note-title">{focus.syllable}{showConventions ? ` · ${conventionalPitchName(focus.note)}` : ""}</h3><p>{focus.inScale ? `${focus.syllable} is degree ${focus.degreeIndex + 1} in this route.` : `${focus.syllable} sits between the selected scale positions. It is still available for color, approach, or a different route.`}</p></div>
            <dl>
              <div><dt>physical frequency</dt><dd><strong>{formatHz(focus.frequencyHz)}</strong><span>changes when the route moves</span></dd></div>
              <div><dt>distance from Do</dt><dd><strong>{focus.rawStepsFromDo === 0 ? "same pitch" : `${Math.abs(focus.centsFromDo)} cents ${focus.rawStepsFromDo > 0 ? "above" : "below"}`}</strong><span>{Math.abs(focus.rawStepsFromDo)} equal keyboard steps</span></dd></div>
              <div><dt>frequency relation</dt><dd><strong>{focus.ratioToDo.toFixed(4)} × Do</strong><span>nearest landmark: {focusInterval.landmarkLabel}</span></dd></div>
              <div><dt>interval language</dt><dd><strong>{focusInterval.relationship}</strong><span>{showConventions ? focusInterval.conventionalName : "physical description shown"}</span></dd></div>
            </dl>
          </section>

          <section className="scale-walk" aria-labelledby="scale-walk-title">
            <div className="scale-walk-heading"><span>Practice with feedback</span><h3 id="scale-walk-title">Walk from Do to upper Do.</h3><p>Play each movable syllable in order. The highlighted step follows your note-on events; octave placement matters for the final Do.</p></div>
            <div className="scale-walk-steps" aria-label={`Practice progress ${practiceIndex} of ${practicePattern.length}`}>
              {[...scale.solfege, "Do↑"].map((syllable, index) => <div key={`${syllable}-${index}`} className={`${index < practiceIndex ? "is-complete" : ""} ${index === practiceIndex ? "is-current" : ""}`}><span>{index + 1}</span><strong>{syllable}</strong><small>{index < scale.steps.length ? `${scale.steps[index]} ${scale.steps[index] === 1 ? "step" : "steps"} next` : "octave"}</small></div>)}
            </div>
            <p className="practice-feedback" role="status" aria-live="polite">{practiceIndex === practicePattern.length ? "Route complete. You kept the gap pattern while the keyboard supplied the physical pitches." : practiceIndex === 0 ? "Begin on Do. A different note restarts the path without penalty." : `${practiceIndex} of ${practicePattern.length} positions matched. Next: ${practiceIndex === scale.solfege.length ? "upper Do" : scale.solfege[practiceIndex]}.`}</p>
            <button type="button" onClick={resetPractice}>Restart scale walk</button>
          </section>

          <div className="piano-gap-route">
            <div><span>Physical fingerprint</span><strong>{scale.steps.join(" · ")}</strong><p>Each number counts equal keyboard steps. Their order—not the name of the starting key—is the scale shape.</p></div>
            <ol>{scale.steps.map((step, index) => <li key={`${step}-${index}`} style={{ flexGrow: step }}><i /><span>{scale.solfege[index]} → {index === scale.solfege.length - 1 ? "Do" : scale.solfege[index + 1]}</span><strong>{step}</strong></li>)}</ol>
          </div>
        </div>
      ) : stage === "combine" ? (
        <div className="piano-combine-stage">
          <section className="sonority-recipes" aria-labelledby="sonority-recipes-title">
            <div><span>Controlled comparisons</span><h3 id="sonority-recipes-title">Change one interval inside the whole.</h3><p>These are analytical starting fields, not emotion buttons. Compare how each relationship changes the live evidence and trace; the page remains silent.</p></div>
            <div>{SONORITY_SETS.map((set) => <button key={set.label} type="button" onClick={() => loadSet(set.offsets)}><strong>{set.label}</strong><span>{set.relation}</span><small>{set.possibility}</small></button>)}</div>
          </section>

          <section className="interval-network" aria-labelledby="interval-network-title">
            <div><span>Every pair inside the chord</span><h3 id="interval-network-title">A chord is an interval network.</h3><p>{intervals.length === 0 ? "Add at least two notes to reveal the relationships between them." : `${intervals.length} pairwise relationship${intervals.length === 1 ? " is" : "s are"} active. The whole-field model above also includes how all partials combine.`}</p></div>
            <div className="active-note-row">{activeNoteNumbers.map((note) => { const context = noteContext(note, doMidi, scale); return <span key={note}><strong>{context.syllable}</strong><small>{showConventions ? conventionalPitchName(note) : formatHz(context.frequencyHz)}</small></span>; })}</div>
            <ol>{intervals.slice(0, 15).map((pair) => { const lower = noteContext(pair.lower, doMidi, scale); const upper = noteContext(pair.upper, doMidi, scale); return <li key={`${pair.lower}-${pair.upper}`}><span>{lower.syllable} → {upper.syllable}</span><strong>{pair.distance.cents}¢ · {pair.distance.relationship}</strong><small>equal keyboard {pair.distance.equalKeyboardRatio.toFixed(4)}:1 · landmark {pair.distance.landmarkLabel}{showConventions ? ` · ${pair.distance.conventionalName}` : ""}</small></li>; })}</ol>
            {intervals.length > 15 ? <p>Showing the first 15 of {intervals.length} pairs. Release notes to inspect a smaller field.</p> : null}
          </section>

          <div className="piano-causal-chain">
            <div><span>1 · physical</span><strong>{activeNoteNumbers.length ? activeNoteNumbers.map((note) => formatHz(frequencyFromMidi(note))).join(" · ") : "press or choose notes"}</strong><p>Frequencies, velocities, register, and overtone spectra.</p></div>
            <i aria-hidden="true">→</i>
            <div><span>2 · auditory proxy</span><strong>{enoughForSonority ? `${Math.round(perception.harmonicity * 100)}% periodic fit · ${Math.round(perception.roughness * 100)}% crunch` : "needs overlapping notes"}</strong><p>A standardized nine-partial model—not sound captured from your keyboard.</p></div>
            <i aria-hidden="true">→</i>
            <div><span>3 · scale context</span><strong>{activeNoteNumbers.length ? `${coverage.inScaleCount}/${coverage.noteCount} in route${coverage.hasHome ? " · Do present" : ""}` : "no active context"}</strong><p>Membership describes the chosen frame, not correctness.</p></div>
            <i aria-hidden="true">→</i>
            <div><span>4 · lived musicality</span><strong>interpret in sequence</strong><p>Style, rhythm, memory, purpose, and the listener determine what the field becomes.</p></div>
          </div>
        </div>
      ) : (
        <div className="piano-fifths-stage">
          <section className="fifths-explainer" aria-labelledby="fifths-title">
            <div className="fifths-heading"><span>One operation repeated</span><h3 id="fifths-title">Multiply by 3:2, then fold back into one octave.</h3><p>The circle is not an arbitrary wheel of letters. It traces repeated near-3:2 relationships. The piano uses equal steps, so each fifth is a close approximation and the twelfth is deliberately made to close.</p></div>
            <div className="fifths-workbench">
              <div className="fifths-circle" role="group" aria-label="Circle of fifths in movable-Do syllables">
                <div className="fifths-center"><span>12 × 3:2</span><strong>≈ 7 octaves</strong><small>pure mismatch<br />{circle.closureDriftCents.toFixed(1)} cents</small></div>
                {circle.nodes.map((node) => {
                  const absolutePitchClass = (pitchClassFromMidi(doMidi) + node.pitchClass) % 12;
                  return <button key={node.step} type="button" className={`${fifthStep === node.step ? "is-selected" : ""} ${activeFifthSteps.has(node.step) ? "is-active" : ""}`} aria-pressed={fifthStep === node.step} style={{ "--fifth-angle": `${node.step * 30}deg` } as CSSProperties} onClick={() => setFifthStep(node.step)}><strong>{node.syllable}</strong><span>{activeFifthSteps.has(node.step) ? "held now" : node.step === 0 ? "home" : `${node.step} × fifth`}</span>{showConventions ? <small>{CONVENTIONAL_PITCH_CLASSES[absolutePitchClass]}</small> : null}</button>;
                })}
              </div>
              <div className="fifths-inspector">
                <span>Selected · {selectedFifth.syllable}</span>
                <h3>{fifthStep === 0 ? "The starting Do" : `${fifthStep} repeated 3:2 move${fifthStep === 1 ? "" : "s"}`}</h3>
                <p>{fifthStep === 0 ? "Choose another point to follow the repeated operation." : `After octave folding, ${selectedFifth.syllable} lands ${selectedFifth.keyboardCents} cents above Do on the equal-step keyboard.`}</p>
                <dl>
                  <div><dt>pure stacked relation</dt><dd><strong>{selectedFifth.foldedRatio.toFixed(4)} × Do</strong><span>{selectedFifth.pureCents.toFixed(1)} cents after folding</span></dd></div>
                  <div><dt>equal-key placement</dt><dd><strong>{(2 ** (selectedFifth.pitchClass / 12)).toFixed(4)} × Do</strong><span>{selectedFifth.keyboardCents} cents</span></dd></div>
                  <div><dt>accumulated difference</dt><dd><strong>{selectedFifth.driftCents >= 0 ? "+" : ""}{selectedFifth.driftCents.toFixed(1)} cents</strong><span>pure chain versus this keyboard</span></dd></div>
                  <div><dt>movable role</dt><dd><strong>{selectedFifth.syllable}</strong><span>{showConventions ? CONVENTIONAL_PITCH_CLASSES[(pitchClassFromMidi(doMidi) + selectedFifth.pitchClass) % 12] : "relative to current Do"}</span></dd></div>
                </dl>
                <div>
                  <button type="button" onClick={() => loadSet(fifthStep === 0 ? [0, 12] : [0, selectedFifth.pitchClass])}>Place Do + {fifthStep === 0 ? "upper Do" : selectedFifth.syllable}</button>
                  <button type="button" disabled={fifthStep === 0} onClick={setSelectedAsDo}>Make {selectedFifth.syllable} the new Do</button>
                </div>
              </div>
            </div>
          </section>

          <div className="fifths-path" aria-label="Movable-Do circle order">
            {circle.nodes.map((node, index) => <button key={node.step} type="button" className={`${fifthStep === index ? "is-selected" : ""} ${activeFifthSteps.has(index) ? "is-active" : ""}`} onClick={() => setFifthStep(index)}><span>{index}</span><strong>{node.syllable}</strong><small>{activeFifthSteps.has(index) ? "held now" : `${node.pitchClass * 100}¢ from Do`}</small></button>)}
          </div>

          <div className="fifths-takeaway"><span>Why musicians use this map</span><strong>Nearby points preserve many scale tones while moving the center; distant points replace more of the route.</strong><p>That makes the circle useful for transposition, chord motion, and scale comparison. It does not say which path is emotionally right. Repetition, voice leading, rhythm, timbre, style, and expectation turn the geometry into musical experience.</p></div>
        </div>
      )}
    </section>
  );
}
