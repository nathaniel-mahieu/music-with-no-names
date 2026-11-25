"use client";

import { useMemo, useState, type CSSProperties } from "react";
import {
  COLOR_TEXTURE_CONSTRUCTIONS,
  COLOR_TEXTURE_KEYS,
  getColorTextureSequence,
  getDemoPitchColor,
  type TextureRole,
} from "@/lib/piano-color-texture-model";
import { useColorTexturePlayback } from "./useColorTexturePlayback";
import { ColorTextureStage } from "./ColorTextureStage";
import styles from "./ColorTextureLab.module.css";

const MATERIALS: Record<TextureRole, { name: string; material: string; explanation: string }> = {
  anchor: { name: "Grounded", material: "Silk", explanation: "Coherent contours give this authored point of rest a settled surface." },
  flow: { name: "In motion", material: "Current", explanation: "Gentle ripples carry the phrase between its points of arrival." },
  pull: { name: "Leaning forward", material: "Filament", explanation: "Directed fibers trace the approach to the next written landing." },
  suspension: { name: "Held in suspense", material: "Taut weave", explanation: "A held voice stretches against its changing harmony before resolving." },
  friction: { name: "A point of contrast", material: "Interference", explanation: "Crossing threads mark a composed chromatic or harmonic detour." },
  release: { name: "Arriving", material: "Bloom", explanation: "Opening contours make the written release visible as the phrase lands." },
};

function clock(beats: number, tempo: number) {
  const seconds = Math.max(0, Math.floor(beats * 60 / tempo));
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

export function ColorTextureLab() {
  const [construction, setConstruction] = useState("homecoming");
  const [tonic, setTonic] = useState(0);
  const [register, setRegister] = useState(0);
  const [tempo, setTempo] = useState(76);
  const [loop, setLoop] = useState(false);
  const [textures, setTextures] = useState(true);
  const [selectedMidi, setSelectedMidi] = useState<number | null>(null);
  const sequence = useMemo(() => getColorTextureSequence(construction, tonic, register), [construction, tonic, register]);
  const playback = useColorTexturePlayback(sequence, tempo, loop);
  const frameIndex = Math.max(0, Math.min(sequence.frames.length - 1, playback.frameIndex));
  const frame = sequence.frames[frameIndex];
  const nextFrame = sequence.frames[frameIndex + 1] ?? (loop ? sequence.frames[0] : null);
  const selectedNote = frame.notes.find((note) => note.midi === selectedMidi) ?? null;
  const material = MATERIALS[selectedNote?.role ?? frame.texture];
  const definition = COLOR_TEXTURE_CONSTRUCTIONS.find((study) => study.id === construction) ?? COLOR_TEXTURE_CONSTRUCTIONS[0];
  const tonicName = COLOR_TEXTURE_KEYS.find((key) => key.pitchClass === tonic)?.label ?? "C";
  const keyName = `${tonicName} ${sequence.mode}`;
  const progress = Math.max(0, Math.min(1, playback.beat / sequence.totalBeats));
  const stateLabel = playback.isStarting ? "Opening audio" : playback.isPlaying ? "Playing" : playback.beat >= sequence.totalBeats ? "Complete" : playback.beat > 0 ? "Paused" : "Ready to listen";

  return <section className={styles.shell} aria-labelledby="color-texture-title" data-color-texture-hud="authored-demo">
    <div className={styles.heading}>
      <div>
        <h1 id="color-texture-title">Color & Texture<span className={styles.demoBadge}>Demo</span></h1>
        <p className={styles.subtitle}>A note keeps its color. Its musical context changes the surface.</p>
      </div>
      <div className={styles.transport}>
        <span className={styles.time}>{clock(playback.beat, tempo)}<span> / {clock(sequence.totalBeats, tempo)}</span></span>
        <button type="button" className={styles.rewind} onClick={playback.stop} aria-label="Back to the start" disabled={!playback.isPlaying && playback.beat === 0}>↶</button>
        <button type="button" className={styles.play} disabled={playback.isStarting} onClick={() => playback.isPlaying ? playback.pause() : void playback.play()} aria-pressed={playback.isPlaying}>
          <span aria-hidden="true">{playback.isPlaying ? "Ⅱ" : "▶"}</span>
          {playback.isStarting ? "Starting…" : playback.isPlaying ? "Pause" : playback.beat > 0 && playback.beat < sequence.totalBeats ? "Resume" : playback.beat >= sequence.totalBeats ? "Replay study" : "Play study"}
        </button>
      </div>
    </div>

    <div className={styles.controls}>
      <label className={styles.studyControl}><span>Construction</span><select value={construction} onChange={(event) => { setConstruction(event.target.value); setSelectedMidi(null); }}>
        {COLOR_TEXTURE_CONSTRUCTIONS.map((study) => <option key={study.id} value={study.id}>{study.title}</option>)}
      </select></label>
      <label><span>Key signature</span><select value={tonic} onChange={(event) => { setTonic(Number(event.target.value)); setSelectedMidi(null); }}>
        {COLOR_TEXTURE_KEYS.map((key) => <option key={key.pitchClass} value={key.pitchClass}>{key.label} {sequence.mode}</option>)}
      </select></label>
      <label><span>Register</span><select value={register} onChange={(event) => { setRegister(Number(event.target.value)); setSelectedMidi(null); }}>
        <option value={-1}>Low · −1</option><option value={0}>Middle</option><option value={1}>High · +1</option>
      </select></label>
      <label className={styles.tempo}><span>Tempo <output>{tempo} bpm</output></span><input aria-label="Playback tempo" type="range" min="48" max="112" step="2" value={tempo} onChange={(event) => setTempo(Number(event.target.value))} /></label>
      <label className={styles.check}><input type="checkbox" checked={loop} onChange={(event) => setLoop(event.target.checked)} /><span>Loop</span></label>
    </div>

    {playback.error ? <p className={styles.error} role="alert">{playback.error}</p> : null}

    <div className={styles.instrument}>
      <div className={styles.viewport}>
        <div className={styles.stageHeading}>
          <span className={styles.stageState} data-playing={playback.isPlaying}><i aria-hidden="true" />{stateLabel}</span>
          <span className={styles.stageHint}>Tap notes to hear them overlap</span>
          <span className={styles.stageIndex}>{String(frameIndex + 1).padStart(2, "0")} <span>/ {String(sequence.frames.length).padStart(2, "0")}</span></span>
        </div>
        <div className={styles.canvasWrap}>
          <ColorTextureStage sequence={sequence} frame={frame} nextFrame={nextFrame} beat={playback.beat} isPlaying={playback.isPlaying} textures={textures} selectedMidi={selectedNote?.midi ?? null} onNoteActivate={playback.auditionNote} />
        </div>
        <div className={styles.stageBottom}>
          <span>{keyName}<span className={styles.separator}>/</span>{definition.subtitle}</span>
          <label className={styles.textureSwitch}><input type="checkbox" checked={textures} onChange={(event) => setTextures(event.target.checked)} /><span>Textures</span></label>
        </div>
      </div>

      <aside className={styles.inspector} aria-label="Current musical context">
        <div className={styles.contextHeading}>
          <span className={styles.kicker}>{selectedNote ? "Selected voice" : "Current harmony"}</span>
          <h2>{selectedNote ? getDemoPitchColor(selectedNote.midi).note : frame.chord}</h2>
          <span className={styles.frameLabel}>{frame.label}</span>
        </div>
        <div className={styles.material} data-material={selectedNote?.role ?? frame.texture}>
          <span className={styles.materialMark} aria-hidden="true">∿</span>
          <div><span>{material.material}</span><strong>{material.name}</strong></div>
        </div>
        <p className={styles.contextDescription}>{selectedNote ? material.explanation : frame.description}</p>
        <div className={styles.notesHeading}><span>Sounding voices</span><small>Play and inspect</small></div>
        <div className={styles.noteList}>
          {frame.notes.map((note, index) => {
            const color = getDemoPitchColor(note.midi);
            return <button
              type="button"
              key={`${note.voice}-${note.midi}-${index}`}
              className={styles.note}
              aria-pressed={note.midi === selectedNote?.midi}
              aria-label={`Play and inspect ${color.note}, degree ${note.degree}, ${note.voice}, ${MATERIALS[note.role].name}`}
              style={{ "--note-color": color.color, "--octave-gray": color.gray } as CSSProperties}
              onClick={() => {
                playback.auditionNote(note.midi);
                setSelectedMidi((current) => current === note.midi ? null : note.midi);
              }}
            >
              <span className={styles.noteColor} aria-hidden="true" /><strong>{color.note}</strong><span>{note.degree}</span><small>{note.voice}</small>
            </button>;
          })}
        </div>
        <p className={styles.authoredNote}>Composed examples · authored context</p>
      </aside>
    </div>

    <div className={styles.score}>
      <div className={styles.scoreHeader}><span>The phrase</span><small>Choose a moment to move through the study.</small><span>{sequence.totalBeats} beats</span></div>
      <div className={styles.timeline} aria-label="Study timeline">
        {sequence.frames.map((step, index) => <button type="button" key={step.id} className={styles.moment} data-current={index === frameIndex} data-past={index < frameIndex} aria-current={index === frameIndex ? "step" : undefined} aria-label={`Go to ${step.chord}, ${step.label}, beat ${step.beat + 1}`} onClick={() => { playback.seek(step.beat); setSelectedMidi(null); }} style={{ flexGrow: step.durationBeats } as CSSProperties}>
          <span className={styles.momentIndex}>{String(index + 1).padStart(2, "0")}</span><strong>{step.chord}</strong>
          <span className={styles.momentColors} aria-hidden="true">{step.notes.map((note, noteIndex) => <i key={`${note.midi}-${noteIndex}`} style={{ backgroundColor: getDemoPitchColor(note.midi).color }} />)}</span>
        </button>)}
        <div className={styles.playhead} aria-hidden="true" style={{ left: `${progress * 100}%` }} />
      </div>
    </div>

    <div className={styles.legend}>
      <span><i className={styles.hueDot} aria-hidden="true" />Hue is pitch</span><span><i className={styles.grayDot} aria-hidden="true" />Gray is octave</span><span><i className={styles.threadDot} aria-hidden="true" />Texture follows context</span>
      <details className={styles.explanation}><summary>How to read this</summary><div>
        <p>Each voice keeps its pitch-class hue. Within an octave, all note colors share a lightness target; higher octaves gently lighten the note and its gray surround. Vivid chroma uses the available sRGB gamut for each hue.</p>
        <p>Silk, current, filament, taut weave, interference, and bloom illustrate the roles written into these studies. They describe a chosen musical reading, rather than measuring emotion or the sound’s acoustic roughness. Your experience can differ.</p>
        <p>Every note, chord, and transition comes from the selected construction. Playback uses a warm synthesized teaching tone and runs locally. You can turn texture off to compare color alone.</p>
      </div></details>
    </div>
    <p className="sr-only" aria-live="polite">{frame.chord}. {frame.label}. {material.name}. {frame.description}</p>
  </section>;
}
