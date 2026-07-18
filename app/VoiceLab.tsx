"use client";

import { useState } from "react";
import {
  PIANO_SCALES,
  conventionalPitchName,
  frequencyFromMidi,
} from "@/lib/piano-model";
import { VocalPitchCoach } from "./VocalPitchCoach";

const VOICE_ANCHORS = Array.from({ length: 37 }, (_, index) => 42 + index);

function formatHz(value: number) {
  return `${value.toFixed(value < 1000 ? 1 : 0)} Hz`;
}

export function VoiceLab() {
  const [anchorMidi, setAnchorMidi] = useState(60);
  const [showConventions, setShowConventions] = useState(true);
  const scale = PIANO_SCALES[0];

  return <section className="advanced-lab voice-lab" aria-labelledby="voice-lab-title">
    <div className="voice-lab-intro">
      <div>
        <p className="section-kicker">Dedicated voice pitch practice · local microphone</p>
        <h2 id="voice-lab-title">Match one piano-key frequency with your voice.</h2>
        <p>This page estimates sung pitch only—it does not recognize words. Choose a piano reference, start the microphone, and hold one steady vowel. Microphone audio stays in this tab and is never recorded or uploaded.</p>
      </div>
      <aside role="note">
        <span>Three separate readings</span>
        <strong>Input activity · periodic pitch estimate · distance from target</strong>
        <p>If input activity moves but pitch stays blank, the microphone is working but the sound is not yet steady or periodic enough for this bounded detector.</p>
      </aside>
    </div>

    <div className="voice-lab-reference" aria-label="Voice practice reference controls">
      <label htmlFor="voice-anchor-key">
        <span>Anchor piano reference</span>
        <select id="voice-anchor-key" value={anchorMidi} onChange={(event) => setAnchorMidi(Number(event.target.value))}>
          {VOICE_ANCHORS.map((midi) => <option key={midi} value={midi}>{conventionalPitchName(midi)} · {formatHz(frequencyFromMidi(midi))} · MIDI {midi}</option>)}
        </select>
        <small>Thirty-seven chromatic positions from F♯2 through F♯5 under A4=440 equal temperament.</small>
      </label>
      <label className="voice-lab-conventions"><input type="checkbox" checked={showConventions} onChange={(event) => setShowConventions(event.target.checked)} /><span>Show conventional note names</span><small>Turn this off to read every target as a semitone relationship from movable Do.</small></label>
      <p><span>Current anchor</span><strong>{showConventions ? conventionalPitchName(anchorMidi) : "Do"} · {formatHz(frequencyFromMidi(anchorMidi))}</strong><small>The selected anchor is treated as movable Do on this page.</small></p>
    </div>

    <VocalPitchCoach
      anchorMidi={anchorMidi}
      anchorSource="voice-lab-reference"
      doMidi={anchorMidi}
      scale={scale}
      showConventions={showConventions}
    />
  </section>;
}
