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
  fifthsCircle,
  frequencyFromMidi,
  intervalLandmark,
  nearestMidiForPitchClass,
  noteContext,
  pairwiseIntervals,
  parseMidiMessage,
  pitchClassFromMidi,
  scaleCoverage,
  scaleSemitones,
  type PianoScale,
} from "@/lib/piano-model";
import { sonorityPerceptionModel } from "@/lib/sonority-model";
import {
  SYNTH_MASTER_GAIN,
  configureSafetyCompressor,
  equalPowerMixGains,
  rmsMatchedHarmonicCoefficients,
} from "@/lib/audio-level";

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
type PianoVoice = { oscillator: OscillatorNode; gain: GainNode };
type PianoGraph = {
  context: AudioContext;
  master: GainNode;
  voices: Map<number, PianoVoice>;
  wave: PeriodicWave;
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

function useMidiKeyboard(onNoteOn: (note: number) => void) {
  const accessRef = useRef<MidiAccessLike | null>(null);
  const pressedRef = useRef(new Set<number>());
  const sustainRef = useRef(false);
  const onNoteOnRef = useRef(onNoteOn);
  const [supported, setSupported] = useState<boolean | null>(null);
  const [inputs, setInputs] = useState<MidiInputLike[]>([]);
  const [selectedInputId, setSelectedInputId] = useState("");
  const [notes, setNotes] = useState<Map<number, number>>(new Map());
  const [status, setStatus] = useState("Connect a MIDI keyboard, or use the on-screen keys.");

  useEffect(() => {
    onNoteOnRef.current = onNoteOn;
  }, [onNoteOn]);

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
    setNotes(new Map());
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
        setNotes((current) => {
          const next = new Map(current);
          next.set(message.note, message.velocity);
          return next;
        });
        onNoteOnRef.current(message.note);
      } else if (message.type === "note-off") {
        pressedRef.current.delete(message.note);
        if (!sustainRef.current) {
          setNotes((current) => {
            const next = new Map(current);
            next.delete(message.note);
            return next;
          });
        }
      } else if (message.type === "sustain") {
        sustainRef.current = message.down;
        if (!message.down) {
          setNotes((current) => new Map(Array.from(current.entries()).filter(([note]) => pressedRef.current.has(note))));
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

function usePianoSynth(activeNotes: Map<number, number>) {
  const graphRef = useRef<PianoGraph | null>(null);
  const [enabled, setEnabled] = useState(false);
  const [message, setMessage] = useState("Piano sound is off. Visual MIDI input still works.");

  const disable = useCallback(() => {
    const graph = graphRef.current;
    graphRef.current = null;
    if (graph) {
      const now = graph.context.currentTime;
      graph.master.gain.cancelScheduledValues(now);
      graph.master.gain.setValueAtTime(Math.max(0.0001, graph.master.gain.value), now);
      graph.master.gain.exponentialRampToValueAtTime(0.0001, now + 0.04);
      graph.voices.forEach(({ oscillator }) => {
        try {
          oscillator.stop(now + 0.05);
        } catch {
          // The voice may already be stopping.
        }
      });
      window.setTimeout(() => void graph.context.close(), 65);
    }
    setEnabled(false);
    setMessage("Piano sound is off. Visual MIDI input still works.");
  }, []);

  const enable = useCallback(async () => {
    if (graphRef.current) return true;
    if (!window.AudioContext) {
      setMessage("This browser does not provide the audio features needed for piano sound.");
      return false;
    }
    try {
      const context = new AudioContext();
      await Promise.race([
        context.resume(),
        new Promise<void>((resolve) => window.setTimeout(resolve, 900)),
      ]);
      if (context.state !== "running") {
        void context.close();
        setMessage("The browser kept audio suspended. Visual input remains available; try Start piano sound again.");
        return false;
      }
      const master = context.createGain();
      const compressor = context.createDynamicsCompressor();
      const coefficients = rmsMatchedHarmonicCoefficients(9, 1.2);
      const wave = context.createPeriodicWave(new Float32Array(coefficients.length), coefficients, { disableNormalization: true });
      const now = context.currentTime;
      configureSafetyCompressor(compressor, now);
      master.gain.setValueAtTime(0.0001, now);
      master.connect(compressor).connect(context.destination);
      master.gain.exponentialRampToValueAtTime(SYNTH_MASTER_GAIN, now + 0.045);
      graphRef.current = { context, master, voices: new Map(), wave };
      setEnabled(true);
      setMessage("Piano sound is on at the shared safe synthesis level.");
      return true;
    } catch {
      setMessage("Piano sound could not start. Visual input remains available.");
      return false;
    }
  }, []);

  useEffect(() => {
    const graph = graphRef.current;
    if (!graph || !enabled) return;
    const now = graph.context.currentTime;
    const entries = Array.from(activeNotes.entries()).filter(([note]) => note >= 0 && note <= 127);
    const activeSet = new Set(entries.map(([note]) => note));

    graph.voices.forEach((voice, note) => {
      if (activeSet.has(note)) return;
      voice.gain.gain.cancelScheduledValues(now);
      voice.gain.gain.setValueAtTime(Math.max(0.0001, voice.gain.gain.value), now);
      voice.gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.035);
      try {
        voice.oscillator.stop(now + 0.045);
      } catch {
        // The voice may already be stopping.
      }
      graph.voices.delete(note);
    });

    const gains = equalPowerMixGains(entries.map(([, velocity]) => Math.max(0.12, velocity / 127)));
    entries.forEach(([note], index) => {
      let voice = graph.voices.get(note);
      if (!voice) {
        const oscillator = graph.context.createOscillator();
        const gain = graph.context.createGain();
        oscillator.setPeriodicWave(graph.wave);
        oscillator.frequency.setValueAtTime(frequencyFromMidi(note), now);
        gain.gain.setValueAtTime(0.0001, now);
        oscillator.connect(gain).connect(graph.master);
        oscillator.start(now);
        voice = { oscillator, gain };
        graph.voices.set(note, voice);
      }
      voice.gain.gain.setTargetAtTime(Math.max(0.0001, gains[index]), now, 0.018);
    });
  }, [activeNotes, enabled]);

  useEffect(() => () => {
    const graph = graphRef.current;
    graphRef.current = null;
    if (!graph) return;
    graph.voices.forEach(({ oscillator }) => {
      try {
        oscillator.stop();
      } catch {
        // The voice may already be stopped.
      }
    });
    void graph.context.close();
  }, []);

  return { disable, enable, enabled, message };
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

export function PianoLab() {
  const [stage, setStage] = useState<PianoStage>("map");
  const [scaleId, setScaleId] = useState<ScaleId>("bright-seven");
  const [doMidi, setDoMidi] = useState(60);
  const [showConventions, setShowConventions] = useState(false);
  const [latchedNotes, setLatchedNotes] = useState<Map<number, number>>(new Map());
  const [newestNote, setNewestNote] = useState(60);
  const [practiceIndex, setPracticeIndex] = useState(0);
  const [playedHistory, setPlayedHistory] = useState<number[]>([]);
  const [fifthStep, setFifthStep] = useState(1);
  const practiceBaseRef = useRef<number | null>(null);

  const scale = PIANO_SCALES.find((item) => item.id === scaleId) ?? PIANO_SCALES[0];
  const scalePositions = useMemo(() => scaleSemitones(scale), [scale]);
  const practicePattern = useMemo(() => [...scalePositions, 12], [scalePositions]);

  const registerPlayedNote = useCallback((note: number) => {
    setNewestNote(note);
    setPlayedHistory((current) => [...current, note].slice(-10));
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

  const midi = useMidiKeyboard(registerPlayedNote);
  const activeNotes = useMemo(() => {
    const combined = new Map(latchedNotes);
    midi.notes.forEach((velocity, note) => combined.set(note, velocity));
    return combined;
  }, [latchedNotes, midi.notes]);
  const synth = usePianoSynth(activeNotes);
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
  const circle = useMemo(() => fifthsCircle(), []);
  const selectedFifth = circle.nodes[fifthStep];
  const enoughForSonority = activeNoteNumbers.length >= 2;

  const resetPractice = () => {
    practiceBaseRef.current = null;
    setPracticeIndex(0);
    setPlayedHistory([]);
  };

  const clearNotes = () => {
    setLatchedNotes(new Map());
    midi.clear();
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
    if (!latchedNotes.has(note)) {
      void synth.enable();
      registerPlayedNote(note);
    }
    setLatchedNotes((current) => {
      const next = new Map(current);
      if (next.has(note)) next.delete(note);
      else next.set(note, 104);
      return next;
    });
  };

  const loadSet = (offsets: readonly number[]) => {
    void synth.enable();
    const next = new Map<number, number>();
    offsets.forEach((offset) => next.set(doMidi + offset, 100));
    setLatchedNotes(next);
    setNewestNote(doMidi + offsets[offsets.length - 1]);
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
          <p>Choose Do, then every key becomes a distance, a movable syllable, and a possible role in a scale. Play one note to locate it. Add notes to expose every interval and the way their spectra may interact.</p>
        </div>
        <aside>
          <span>Keep the layers visible</span>
          <strong>Key position → frequency relationship → hearing model → scale context → your response</strong>
          <p>The first four can be visualized. Whether the result is good, moving, or right for the moment remains a listener-and-context question.</p>
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
        <button type="button" className={synth.enabled ? "is-sounding" : ""} onClick={synth.enabled ? synth.disable : () => void synth.enable()}>{synth.enabled ? "Turn piano sound off" : "Start piano sound"}</button>
        <button type="button" onClick={clearNotes} disabled={activeNoteNumbers.length === 0}>Release all notes</button>
        <details><summary>MIDI setup help</summary><p>The browser asks before reading your keyboard. Choose an input after permission. Note-on, note-off, velocity, and sustain pedal messages are visualized locally; nothing is uploaded. If MIDI is unavailable, the on-screen keys provide the same learning views.</p></details>
      </div>
      <p className="sr-only" role="status" aria-live="polite">{synth.message}</p>

      <div className="piano-instrument">
        <div className="piano-instrument-heading">
          <div><span>{stage === "map" ? "Press one key, then walk the route" : stage === "combine" ? "Hold notes together or click to latch them" : "The selected fifths target is outlined on the keys"}</span><strong>{activeNoteNumbers.length === 0 ? "No notes sounding" : `${activeNoteNumbers.length} note${activeNoteNumbers.length === 1 ? "" : "s"} active`}</strong></div>
          <button type="button" onClick={() => makeDo(activeNoteNumbers[0] ?? newestNote)} disabled={activeNoteNumbers.length === 0 && playedHistory.length === 0}>Make {activeNoteNumbers.length ? "lowest active note" : "newest note"} Do</button>
        </div>
        <div className="piano-keyboard" role="group" aria-label="Two-octave on-screen piano; click keys to latch and release notes">
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
            <div><span>Controlled comparisons</span><h3 id="sonority-recipes-title">Change one interval inside the whole.</h3><p>These are starting fields, not emotion buttons. Listen for what the physical change makes possible, then decide what it does for you.</p></div>
            <div>{SONORITY_SETS.map((set) => <button key={set.label} type="button" onClick={() => loadSet(set.offsets)}><strong>{set.label}</strong><span>{set.relation}</span><small>{set.possibility}</small></button>)}</div>
          </section>

          <section className="live-sonority" aria-labelledby="live-sonority-title">
            <div className="live-sonority-heading"><div><span>Live evidence · {activeNoteNumbers.length} active</span><h3 id="live-sonority-title">What changed when the notes met?</h3></div><p>No total “listenability” or quality score is computed. The measures below answer different questions and may disagree.</p></div>
            <div className="piano-evidence-grid">
              <EvidenceMeter label="Common periodic fit" value={enoughForSonority ? perception.harmonicity : null} note="Higher fit may support fusion or groundedness with this timbre." />
              <EvidenceMeter label="Spectral friction" value={enoughForSonority ? perception.roughness : null} note="Higher interaction may support bite, urgency, shimmer, or unwanted crowding." />
              <EvidenceMeter label="Pitch-span openness" value={enoughForSonority ? perception.openness : null} note="A wider logarithmic span may support breadth or exposure." />
              <EvidenceMeter label="Selected-route membership" value={activeNoteNumbers.length ? coverage.fraction : null} note="Familiarity with this route may support coherence; outside notes can be expressive." />
            </div>
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
            <div><span>2 · auditory model</span><strong>{enoughForSonority ? `${Math.round(perception.harmonicity * 100)}% periodic fit · ${Math.round(perception.roughness * 100)}% friction` : "needs overlapping notes"}</strong><p>One educational model of partial fit and interference.</p></div>
            <i aria-hidden="true">→</i>
            <div><span>3 · scale context</span><strong>{activeNoteNumbers.length ? `${coverage.inScaleCount}/${coverage.noteCount} in route${coverage.hasHome ? " · Do present" : ""}` : "no active context"}</strong><p>Membership describes the chosen frame, not correctness.</p></div>
            <i aria-hidden="true">→</i>
            <div><span>4 · lived musicality</span><strong>listen, compare, report</strong><p>Style, sequence, memory, purpose, and you determine what the field becomes.</p></div>
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
                  return <button key={node.step} type="button" className={fifthStep === node.step ? "is-selected" : ""} aria-pressed={fifthStep === node.step} style={{ "--fifth-angle": `${node.step * 30}deg` } as CSSProperties} onClick={() => setFifthStep(node.step)}><strong>{node.syllable}</strong><span>{node.step === 0 ? "home" : `${node.step} × fifth`}</span>{showConventions ? <small>{CONVENTIONAL_PITCH_CLASSES[absolutePitchClass]}</small> : null}</button>;
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
            {circle.nodes.map((node, index) => <button key={node.step} type="button" className={fifthStep === index ? "is-selected" : ""} onClick={() => setFifthStep(index)}><span>{index}</span><strong>{node.syllable}</strong><small>{node.pitchClass * 100}¢ from Do</small></button>)}
          </div>

          <div className="fifths-takeaway"><span>Why musicians use this map</span><strong>Nearby points preserve many scale tones while moving the center; distant points replace more of the route.</strong><p>That makes the circle useful for transposition, chord motion, and scale comparison. It does not say which path is emotionally right. Repetition, voice leading, rhythm, timbre, style, and expectation turn the geometry into musical experience.</p></div>
        </div>
      )}
    </section>
  );
}
