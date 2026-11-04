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

  return <section className="advanced-lab voice-lab" aria-labelledby="voice-workspace-title">
    <header className="voice-workspace-header">
      <div className="voice-workspace-identity">
        <p className="section-kicker">Voice workspace</p>
        <h1 id="voice-workspace-title">Hear it. Sing it. See the distance.</h1>
        <p>Local microphone analysis estimates one sustained pitch and its spectrum. Nothing is recorded or uploaded.</p>
      </div>

      <div className="voice-reference-console" role="group" aria-label="Voice reference and display settings">
        <div className="voice-reference-status"><i aria-hidden="true" /><div><span>Practice reference</span><strong>{showConventions ? conventionalPitchName(anchorMidi) : "Do"} · {formatHz(frequencyFromMidi(anchorMidi))}</strong><small>Movable Do · A4=440 equal-tempered coordinate</small></div></div>
        <label htmlFor="voice-anchor-key"><span>Anchor</span><select id="voice-anchor-key" value={anchorMidi} onChange={(event) => setAnchorMidi(Number(event.target.value))}>{VOICE_ANCHORS.map((midi) => <option key={midi} value={midi}>{conventionalPitchName(midi)} · {formatHz(frequencyFromMidi(midi))}</option>)}</select></label>
        <details className="voice-workspace-settings">
          <summary>Settings</summary>
          <div>
            <label><input type="checkbox" checked={showConventions} onChange={(event) => setShowConventions(event.target.checked)} /><span>Show conventional note names</span></label>
            <p>Off uses movable-Do syllables while keeping exact semitone and frequency coordinates unchanged.</p>
            <small>Anchor range: F♯2 through F♯5. The selected anchor becomes Do for this workspace.</small>
          </div>
        </details>
      </div>
    </header>

    <nav className="voice-focus-navigation" aria-label="Voice learning views">
      <a href="#voice-match">Pitch match<span>target + microphone</span></a>
      <a href="#voice-ear-map">Ear map<span>direction + steadiness</span></a>
      <a href="#voice-spectrum">Harmonics<span>live spectrum</span></a>
    </nav>

    <VocalPitchCoach
      anchorMidi={anchorMidi}
      anchorSource="voice-lab-reference"
      doMidi={anchorMidi}
      scale={scale}
      showConventions={showConventions}
    />
  </section>;
}
