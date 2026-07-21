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
        <p>This page estimates sung pitch only—it does not recognize words. Choose a piano reference, hear it, sing from memory, and use the live map to decide whether to move higher, move lower, or stay. The spectrum and recent pitch trail remain local; microphone audio is never recorded or uploaded.</p>
      </div>
      <aside role="note">
        <span>Three ear-training questions</span>
        <strong>Is sound arriving? · where is its pitch center? · can one pitch be tracked steadily?</strong>
        <p>Accuracy is distance from the target. Clarity is repeating-wave evidence. Steadiness is how narrowly the recent pitch stays grouped. None is a score for the voice.</p>
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
