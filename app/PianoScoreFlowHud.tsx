"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type CSSProperties,
  type DragEvent,
} from "react";
import styles from "./PianoScoreFlowHud.module.css";
import {
  ORBIT_STUDY_MUSICXML,
  importMusicXmlFile,
  normalizeImportedMusicXmlScore,
  parseMusicXml,
  type ImportedMusicXmlNote,
  type ImportedMusicXmlScore,
} from "@/lib/musicxml-import";
import {
  analyzeLocalPitchCollections,
  buildSheetMusicReadingChunks,
  chordSpacing,
  evaluateSheetMusicPerformance,
  fingerDistance,
  repairLoopAroundFirstDivergence,
  selectSheetMusicLoop,
  summarizeSheetReadingChunkProgress,
  type PracticeHand,
  type MidiPerformanceNote,
  type SheetPitchCollectionAnalysis,
  type SheetReadingChunk,
  type SheetReadingChunkProgress,
  type SheetEventComparison,
  type SheetMusicPracticeLoop,
  type SheetMusicNote,
  type SheetMusicPracticeAttack,
  type SheetMusicScore,
  type RelationshipComparison,
} from "@/lib/sheet-music-coach-model";
import { configureSafetyCompressor, SYNTH_MASTER_GAIN } from "@/lib/audio-level";
import { frequencyFromMidi } from "@/lib/piano-model";

const SCORE_FLOW_STORAGE_KEY = "music-with-no-names:score-flow:v1";
const MAX_LIVE_FEEDBACK_ATTACKS = 160;
const MAX_UI_ALIGNMENT_CELLS = 1_250_000;
const WHITE_PITCH_CLASSES = new Set([0, 2, 4, 5, 7, 9, 11]);
const INTERVAL_COLORS = [
  "#f4f0e7", "#ff8f86", "#f5a46f", "#edc66a", "#c9d875", "#85d6a0",
  "#69d8d0", "#65c8e5", "#7eafe9", "#9d9ce8", "#c494e2", "#dd8dca", "#f3df9b",
] as const;

type HandNoteMap = { left: number[]; right: number[] };

type ScoreHudEvent = {
  id: number;
  note: number;
  velocity: number;
  onsetMs: number;
  keyReleaseMs?: number | null;
  releaseMs: number | null;
  fieldNotes: number[];
};

type PianoScoreFlowHudProps = {
  events: ScoreHudEvent[];
  activeNotes: number[];
  chordWindowMs: number;
  showConventions: boolean;
  frozen: boolean;
  onResumeCapture: () => void;
};

type ReadingMode = "read" | "ear" | "memory";
type TimingMode = "self-paced" | "pulse";
type CaptureState = "idle" | "armed" | "review";
type ReferenceVoice = "full" | "upper" | "bass";
type AudioContextWindow = Window & typeof globalThis & { webkitAudioContext?: typeof AudioContext };

function cx(...values: Array<string | false | null | undefined>) {
  return values.filter(Boolean).join(" ");
}

function newestEventId(events: ScoreHudEvent[]) {
  return events.reduce((latest, event) => Math.max(latest, event.id), -1);
}

function signed(value: number, digits = 0) {
  const rounded = Number(value.toFixed(digits));
  return `${rounded > 0 ? "+" : ""}${rounded}`;
}

function pitchClassName(midi: number, prefer: "flats" | "sharps") {
  const flats = ["C", "D♭", "D", "E♭", "E", "F", "G♭", "G", "A♭", "A", "B♭", "B"];
  const sharps = ["C", "C♯", "D", "D♯", "E", "F", "F♯", "G", "G♯", "A", "A♯", "B"];
  const octave = Math.floor(midi / 12) - 1;
  return `${(prefer === "sharps" ? sharps : flats)[((midi % 12) + 12) % 12]}${octave}`;
}

function writtenLabel(note: SheetMusicNote, showConventions: boolean) {
  return showConventions ? note.pitch.label : `${note.hand === "left" ? "lower" : "upper"} key`;
}

function keySignatureLabel(score: Pick<ImportedMusicXmlScore, "keyFifths" | "keyMode">) {
  const fifths = score.keyFifths;
  if (fifths == null) return "key signature not encoded";
  if (fifths === 0) return score.keyMode ? `no sharps or flats · ${score.keyMode}` : "no sharps or flats · mode not encoded";
  const count = Math.abs(fifths);
  const accidental = fifths > 0 ? "sharp" : "flat";
  return `${count} ${accidental}${count === 1 ? "" : "s"} · ${score.keyMode ?? "mode not encoded"}`;
}

function meterSummary(score: ImportedMusicXmlScore) {
  const changes = score.measures.filter((measure, index) => index === 0 || measure.timeSignatureDisplay !== score.measures[index - 1].timeSignatureDisplay);
  return changes.map((measure) => `${measure.timeSignatureDisplay}${measure.index ? ` at m.${measure.number}` : ""}`).join(" → ");
}

function metricLabel(accuracy: number | null, compared: number) {
  return accuracy == null ? "not observed" : `${Math.round(accuracy * 100)}% · ${compared} compared`;
}

function intervalColor(semitones: number) {
  const absolute = Math.abs(semitones);
  const intervalClass = absolute === 0 ? 0 : absolute % 12 === 0 ? 12 : absolute % 12;
  return INTERVAL_COLORS[intervalClass];
}

function chordHypothesis(midis: number[], prefer: "flats" | "sharps", authoredNotes: SheetMusicNote[] = []) {
  const pitchClasses = [...new Set(midis.map((midi) => ((midi % 12) + 12) % 12))];
  if (pitchClasses.length !== 3) return null;
  const qualities = [
    { name: "major", intervals: [0, 4, 7] },
    { name: "minor", intervals: [0, 3, 7] },
    { name: "diminished", intervals: [0, 3, 6] },
    { name: "augmented", intervals: [0, 4, 8] },
  ];
  for (const root of pitchClasses) {
    const relative = pitchClasses.map((pitchClass) => (pitchClass - root + 12) % 12).sort((a, b) => a - b);
    const quality = qualities.find((candidate) => candidate.intervals.every((interval, index) => interval === relative[index]));
    if (!quality) continue;
    const bassInterval = (Math.min(...midis) - root + 120) % 12;
    const inversion = bassInterval === 0 ? "root position" : bassInterval === quality.intervals[1] ? "first inversion" : bassInterval === quality.intervals[2] ? "second inversion" : "open voicing";
    const authoredRoot = authoredNotes.find((note) => ((note.pitch.midi % 12) + 12) % 12 === root)?.pitch.label.replace(/-?\d+$/, "");
    return `${authoredRoot ?? pitchClassName(root + 60, prefer).replace(/\d+$/, "")} ${quality.name} · ${inversion}`;
  }
  return null;
}

function notesByHand(comparison: SheetEventComparison | null, fallback: SheetMusicPracticeAttack | null): HandNoteMap {
  const result: HandNoteMap = { left: [], right: [] };
  if (comparison?.actualNotes.length && comparison.expected.notes.length) {
    const actual = [...comparison.actualNotes].sort((a, b) => a - b);
    const expected = [...comparison.expected.notes].sort((a, b) => a.pitch.midi - b.pitch.midi);
    if (actual.length === expected.length) {
      actual.forEach((midi, index) => {
        const hand = expected[index]?.hand === "left" ? "left" : "right";
        result[hand].push(midi);
      });
      return result;
    }
    actual.forEach((midi) => {
      const nearest = expected.reduce((best, note) => Math.abs(note.pitch.midi - midi) < Math.abs(best.pitch.midi - midi) ? note : best, expected[0]);
      result[nearest.hand === "left" ? "left" : "right"].push(midi);
    });
    return result;
  }
  fallback?.notes.forEach((note) => result[note.hand === "left" ? "left" : "right"].push(note.pitch.midi));
  return result;
}

function handFingering(notes: SheetMusicNote[], hand: "left" | "right") {
  const sorted = [...notes].sort((first, second) => first.pitch.midi - second.pitch.midi);
  if (sorted.length === 1) return new Map<string, number | null>([[sorted[0].id, sorted[0].fingering]]);
  const patterns: Record<number, number[]> = {
    2: [1, 5],
    3: [1, 3, 5],
    4: [1, 2, 3, 5],
    5: [1, 2, 3, 4, 5],
  };
  const base = patterns[Math.min(5, sorted.length)] ?? Array.from({ length: sorted.length }, (_, index) => Math.min(5, index + 1));
  const fingers = hand === "right" ? base : [...base].reverse();
  return new Map<string, number | null>(sorted.map((note, index) => [note.id, note.fingering ?? fingers[index] ?? null]));
}

function KeyboardTerritory({ next, previousNotes, activeNotes, showConventions, prefer, allowSplit = true }: {
  next: SheetMusicPracticeAttack | null;
  previousNotes: number[];
  activeNotes: number[];
  showConventions: boolean;
  prefer: "flats" | "sharps";
  allowSplit?: boolean;
}) {
  const targets = next?.midiNotes ?? [];
  const source = [...targets, ...previousNotes, ...activeNotes];
  const span = source.length ? Math.max(...source) - Math.min(...source) : 0;
  const leftTargets = next?.notes.filter((note) => note.hand === "left") ?? [];
  const rightTargets = next?.notes.filter((note) => note.hand === "right") ?? [];
  if (allowSplit && span > 30 && leftTargets.length && rightTargets.length && next) {
    const leftCenter = leftTargets.reduce((sum, note) => sum + note.pitch.midi, 0) / leftTargets.length;
    const rightCenter = rightTargets.reduce((sum, note) => sum + note.pitch.midi, 0) / rightTargets.length;
    const midpoint = (leftCenter + rightCenter) / 2;
    const handAttack = (notes: SheetMusicNote[]): SheetMusicPracticeAttack => ({ ...next, notes, midiNotes: notes.map((note) => note.pitch.midi).sort((a, b) => a - b), hands: [...new Set(notes.map((note) => note.hand))] });
    return <div className={styles.territorySplit}>
      <section><span>Upper-staff territory</span><KeyboardTerritory next={handAttack(rightTargets)} previousNotes={previousNotes.filter((note) => note >= midpoint)} activeNotes={activeNotes.filter((note) => note >= midpoint)} showConventions={showConventions} prefer={prefer} allowSplit={false} /></section>
      <section><span>Lower-staff territory</span><KeyboardTerritory next={handAttack(leftTargets)} previousNotes={previousNotes.filter((note) => note < midpoint)} activeNotes={activeNotes.filter((note) => note < midpoint)} showConventions={showConventions} prefer={prefer} allowSplit={false} /></section>
      <small>An octave break separates the two staff territories so the drawn key widths remain physical rather than compressing the entire piano.</small>
    </div>;
  }
  const center = source.length ? Math.round(source.reduce((sum, note) => sum + note, 0) / source.length) : 60;
  let low = Math.max(21, Math.min(...(source.length ? source : [center])) - 4);
  let high = Math.min(108, Math.max(...(source.length ? source : [center])) + 4);
  while (high - low < 18) { if (low > 21) low -= 1; if (high < 108 && high - low < 18) high += 1; if (low === 21 && high === 108) break; }
  const visible = Array.from({ length: high - low + 1 }, (_, index) => low + index);
  const whites = visible.filter((note) => WHITE_PITCH_CLASSES.has(note % 12));
  const fingerMaps = next ? {
    left: handFingering(next.notes.filter((note) => note.hand === "left"), "left"),
    right: handFingering(next.notes.filter((note) => note.hand === "right"), "right"),
  } : null;
  const label = targets.length
    ? `Next keyboard territory: ${targets.map((note) => pitchClassName(note, prefer)).join(" plus ")}. Suggested finger numbers are starting points unless the MusicXML supplied them.`
    : "Keyboard territory waiting for a score landing.";
  return <div className={styles.keyboardTerritory} role="group" aria-label={label}>
    <div className={styles.whiteKeys} style={{ "--black-width": `${(0.62 / Math.max(1, whites.length)) * 100}%` } as CSSProperties}>
      {whites.map((note) => {
        const targetNote = next?.notes.find((item) => item.pitch.midi === note);
        const finger = targetNote ? targetNote.fingering ?? fingerMaps?.[targetNote.hand === "left" ? "left" : "right"].get(targetNote.id) : null;
        return <i key={note} className={cx(styles.whiteKey, targets.includes(note) && styles.isTarget, activeNotes.includes(note) && styles.isActive, previousNotes.includes(note) && styles.isPrevious)}>
          {showConventions && (targets.includes(note) || activeNotes.includes(note)) ? <small>{pitchClassName(note, prefer)}</small> : null}
          {targetNote ? <b className={targetNote.fingering ? styles.authoredFinger : finger ? styles.suggestedFinger : styles.unknownFinger}>{targetNote.fingering ? `score ${finger}` : finger ? `~${finger}` : "?"}</b> : null}
        </i>;
      })}
      {visible.filter((note) => !WHITE_PITCH_CLASSES.has(note % 12)).map((note) => {
        const whitesBefore = whites.filter((white) => white < note).length;
        const targetNote = next?.notes.find((item) => item.pitch.midi === note);
        const finger = targetNote ? targetNote.fingering ?? fingerMaps?.[targetNote.hand === "left" ? "left" : "right"].get(targetNote.id) : null;
        return <i key={note} className={cx(styles.blackKey, targets.includes(note) && styles.isTarget, activeNotes.includes(note) && styles.isActive, previousNotes.includes(note) && styles.isPrevious)} style={{ "--black-left": `${(whitesBefore / Math.max(1, whites.length)) * 100}%` } as CSSProperties}>{targetNote ? <b className={targetNote.fingering ? styles.authoredFinger : finger ? styles.suggestedFinger : styles.unknownFinger}>{targetNote.fingering ? `score ${finger}` : finger ? `~${finger}` : "?"}</b> : null}</i>;
      })}
    </div>
    <div className={styles.keyboardLegend}><span><i className={styles.targetSwatch} />next</span><span><i className={styles.activeSwatch} />held</span><span><i className={styles.previousSwatch} />last landing</span><em><b>score 3</b> = authored · <b>~3</b> = shape suggestion · ? = passage context needed</em></div>
  </div>;
}

function DistanceField({ next, previousByHand, showConventions, prefer }: {
  next: SheetMusicPracticeAttack | null;
  previousByHand: HandNoteMap;
  showConventions: boolean;
  prefer: "flats" | "sharps";
}) {
  if (!next) return <div className={styles.emptyField}><strong>Loop complete.</strong><span>Review the evidence, then shrink or move the loop.</span></div>;
  const byHand = (["right", "left"] as const).map((hand) => {
    const notes = next.notes.filter((note) => note.hand === hand);
    if (!notes.length) return null;
    const fingers = handFingering(notes, hand);
    return { hand, notes: [...notes].sort((a, b) => a.pitch.midi - b.pitch.midi), fingers };
  }).filter((item): item is NonNullable<typeof item> => item != null);
  return <div className={styles.distanceField}>
    {byHand.map(({ hand, notes, fingers }) => <section key={hand}>
      <header><span>{hand === "right" ? "upper staff" : "lower staff"}</span><strong>{notes.length > 1 ? "prepare one shape" : "prepare one landing"}</strong></header>
      <div className={styles.distanceRoutes}>
        {notes.map((note, index) => {
          const sources = [...previousByHand[hand]].sort((a, b) => a - b);
          const sourceIndex = notes.length <= 1 ? Math.floor((sources.length - 1) / 2) : Math.round(index * Math.max(0, sources.length - 1) / Math.max(1, notes.length - 1));
          const nearest = sources[sourceIndex] ?? null;
          const distance = nearest == null ? null : fingerDistance(nearest, note.pitch.midi);
          const finger = note.fingering ?? fingers.get(note.id) ?? null;
          return <article key={note.id}>
            <b className={note.fingering ? styles.authoredFinger : finger ? styles.suggestedFinger : styles.unknownFinger}>{note.fingering ? `score ${finger}` : finger ? `~${finger}` : "?"}</b>
            <div><strong>{writtenLabel(note, showConventions)}</strong><span>{distance ? `${distance.direction === "same" ? "stay" : distance.direction} ${distance.absoluteSemitones} semitone${distance.absoluteSemitones === 1 ? "" : "s"}` : "place from the written staff"}</span><small>{distance ? `about ${Math.round(distance.whiteKeyWidths * 10) / 10} white-key widths · ${distance.reach.replace("-", " ")}` : showConventions ? pitchClassName(note.pitch.midi, prefer) : "first landing establishes the hand"}</small></div>
          </article>;
        })}
      </div>
      <footer>{notes.every((note) => note.fingering != null) ? "Finger numbers are authored in this file. Travel is a same-staff route estimate from the prior landing." : notes.length === 1 ? "No finger is inferred from an isolated landing. Travel is a same-staff route estimate; MIDI cannot identify which finger moved." : "Chord-shape starting suggestion—not authored. Routes stay within the same staff and preserve low-to-high order; hand size and the next phrase may favor another choice."}</footer>
    </section>)}
  </div>;
}

function RelationshipEvidence({ label, comparison }: { label: string; comparison: RelationshipComparison | null }) {
  if (!comparison) return <article><span>{label}</span><strong>Play two landings</strong><small>A directed interval appears after a comparable pair.</small></article>;
  return <article className={styles.relationshipCard}>
    <span>{label}</span>
    <strong><i style={{ "--interval-color": intervalColor(comparison.expectedSemitones) } as CSSProperties} />expected {signed(comparison.expectedSemitones)} st <b>→</b> <i style={{ "--interval-color": intervalColor(comparison.playedSemitones) } as CSSProperties} />played {signed(comparison.playedSemitones)} st</strong>
    <small>{comparison.intervalMatch ? "Same directed width—link the color, reach, and sound." : comparison.contourMatch ? "Direction agrees; feel the difference in exact reach." : "Direction changed. Rehearse only these two landings."}</small>
  </article>;
}

type EvidenceItem = {
  label: string;
  value: string;
  detail: string;
};

function EvidenceGroup({ eyebrow, title, items }: { eyebrow: string; title: string; items: EvidenceItem[] }) {
  return <article className={styles.evidenceGroup}>
    <header><span>{eyebrow}</span><strong>{title}</strong></header>
    <div>{items.map((item) => <section key={item.label}>
      <div><span>{item.label}</span><strong>{item.value}</strong></div>
      <small>{item.detail}</small>
    </section>)}</div>
  </article>;
}

function attackStatusLabel(comparison: SheetEventComparison | null, current: boolean) {
  if (comparison?.status === "correct") return "✓ right landing";
  if (comparison?.status === "missed") return "− missed landing";
  if (comparison?.status === "incorrect") {
    if (!comparison.pitchMatch) {
      if (comparison.missingNotes.length && !comparison.extraNotes.length) return `− ${comparison.missingNotes.length} missing`;
      if (comparison.extraNotes.length && !comparison.missingNotes.length) return `+ ${comparison.extraNotes.length} extra`;
      return "× wrong key set";
    }
    if (comparison.arpeggiationMatch === false) return "↕ change roll direction";
    if (comparison.timingMatch === false) return comparison.timingErrorMs != null && comparison.timingErrorMs < 0 ? "← early attack" : "→ late attack";
    if (comparison.durationMatch === false) return comparison.durationErrorMs != null && comparison.durationErrorMs < 0 ? "↓ released early" : "↑ released late";
    return "× needs repair";
  }
  return current ? "next landing" : "waiting";
}

function patternLabel(values: number[]) {
  if (!values.length) return "one landing";
  return values.map((value) => `${value > 0 ? "↑" : value < 0 ? "↓" : "→"} ${Math.abs(value)} st`).join(" · ");
}

function rhythmLabel(values: number[]) {
  if (!values.length) return "one attack boundary";
  return values.map((value) => `${Math.round(value * 100) / 100}`).join(" · ") + " beats";
}

function FocusLanding({
  attack,
  comparison,
  currentIndex,
  totalAttacks,
  activeNotes,
  veiled,
  showConventions,
  prefer,
  arrivalWindowMs,
  arrivalWindowOpen,
  captureState,
}: {
  attack: SheetMusicPracticeAttack | null;
  comparison: SheetEventComparison | null;
  currentIndex: number;
  totalAttacks: number;
  activeNotes: number[];
  veiled: boolean;
  showConventions: boolean;
  prefer: "flats" | "sharps";
  arrivalWindowMs: number;
  arrivalWindowOpen: boolean;
  captureState: CaptureState;
}) {
  if (!attack && totalAttacks === 0) return <section className={styles.focusLanding} aria-labelledby="focus-landing-title">
    <header><span>Now · landing</span><strong id="focus-landing-title">No playable landing in this selection</strong></header>
    <div className={styles.landingComplete}><i>○</i><strong>Choose a measure and staff containing note attacks.</strong><small>Rests remain part of the written context, but this release evaluates played landings rather than silence.</small></div>
  </section>;
  if (!attack) return <section className={styles.focusLanding} aria-labelledby="focus-landing-title">
    <header><span>Now · landing</span><strong id="focus-landing-title">Loop complete</strong></header>
    <div className={styles.landingComplete}><i>✓</i><strong>{captureState === "review" ? "Every written landing has a frozen comparison." : "Every written landing has arrived."}</strong><small>{captureState === "armed" ? "Release any held keys so note lengths can enter the frozen review." : "Review the first repair, move the loop, or veil the score for recall."}</small></div>
  </section>;
  const ordered = [...attack.notes].sort((first, second) => first.pitch.midi - second.pitch.midi);
  const bass = ordered[0]?.pitch.midi ?? 60;
  const spacing = chordSpacing(attack.midiNotes);
  const hypothesis = chordHypothesis(attack.midiNotes, prefer, attack.notes);
  const activeTargetCount = [...new Set(activeNotes.filter((note) => attack.midiNotes.includes(note)))].length;
  const activeExtraCount = activeNotes.filter((note) => !attack.midiNotes.includes(note)).length;
  const capturedTargetCount = [...new Set((comparison?.actualNotes ?? []).filter((note) => attack.midiNotes.includes(note)))].length;
  const capturedExtraCount = [...new Set(comparison?.extraNotes ?? [])].length;
  const gatheredTargetCount = Math.min(attack.midiNotes.length, Math.max(activeTargetCount, capturedTargetCount));
  const gathering = captureState === "armed" && arrivalWindowOpen && attack.midiNotes.length > 1 && activeExtraCount === 0 && capturedExtraCount === 0
    && ((gatheredTargetCount > 0 && gatheredTargetCount < attack.midiNotes.length) || Boolean(comparison?.missingNotes.length && !comparison.extraNotes.length));
  const revealOutcome = !veiled && !gathering;
  const status = veiled ? `${attack.midiNotes.length}-note landing · feedback veiled` : gathering ? `gathering ${gatheredTargetCount} of ${attack.midiNotes.length} · ${arrivalWindowMs} ms lens` : attackStatusLabel(comparison, true);
  return <section className={cx(styles.focusLanding, revealOutcome && comparison?.status === "correct" && styles.isFocusCorrect, revealOutcome && (comparison?.status === "incorrect" || comparison?.status === "missed") && styles.isFocusWrong)} aria-labelledby="focus-landing-title">
    <header><span>{revealOutcome && comparison && comparison.status !== "pending" ? "Review · landing" : "Now · landing"}</span><strong id="focus-landing-title">Landing {Math.min(currentIndex + 1, totalAttacks)} of {totalAttacks} · m.{attack.measureNumber}</strong><em>{status}</em></header>
    <div className={cx(styles.landingField, veiled && styles.isVeiled)}>
      <div className={styles.landingOrbits} aria-hidden="true"><i /><i /><i /></div>
      <div className={styles.noteConstellation} role="list" aria-label={veiled ? `Veiled landing with ${attack.notes.length} simultaneous note${attack.notes.length === 1 ? "" : "s"}` : `Written landing: ${ordered.map((note) => note.pitch.label).join(" plus ")}`}>
        {ordered.map((note, index) => {
          const relative = note.pitch.midi - bass;
          const held = activeNotes.includes(note.pitch.midi);
          const matched = comparison?.actualNotes.includes(note.pitch.midi) && !comparison.missingNotes.includes(note.pitch.midi);
          const missing = comparison?.missingNotes.includes(note.pitch.midi) || (gathering && !held && !matched);
          return <article key={note.id} role="listitem" className={cx(styles.landingNote, !veiled && held && styles.isHeld, !veiled && matched && styles.isMatched, !veiled && missing && styles.isMissing)} style={{ "--node-color": intervalColor(relative), "--node-rise": veiled ? "0px" : `${Math.min(42, relative * 3)}px` } as CSSProperties}>
            <i aria-hidden="true" />
            <strong>{veiled ? "?" : showConventions ? note.pitch.label : `tone ${index + 1}`}</strong>
            <span>{veiled ? "hidden" : `${note.staff > 1 ? "lower staff" : "upper staff"}${note.fingering ? ` · finger ${note.fingering}` : ""}`}</span>
            {!veiled && held ? <em>held</em> : null}
          </article>;
        })}
        {!veiled && comparison?.extraNotes.map((midi) => <article key={`extra-${midi}`} role="listitem" className={cx(styles.landingNote, styles.isExtra)} style={{ "--node-color": "#f18d7e", "--node-rise": "0px" } as CSSProperties}><i aria-hidden="true" /><strong>+ {pitchClassName(midi, prefer)}</strong><span>extra note</span></article>)}
      </div>
    </div>
    <div className={styles.landingFacts}>
      <div><span>Notes</span><strong>{veiled ? `${attack.notes.length} concealed` : ordered.map((note) => showConventions ? note.pitch.label : note.staff > 1 ? "lower" : "upper").join(" + ")}</strong><small>One landing = one or more notes that begin together.</small></div>
      <div><span>{attack.midiNotes.length >= 3 ? "Chord shape" : attack.midiNotes.length === 2 ? "Vertical shape" : "Attack shape"}</span><strong>{veiled ? `${attack.notes.length}-note field · pitch spacing veiled` : spacing.adjacentSemitones.length ? `${spacing.adjacentSemitones.map((gap) => `${gap} st`).join(" · ")} · ${spacing.spanSemitones} st span` : "single tone"}</strong><small>{veiled ? "Keep only the simultaneous-note count and rhythm slot in memory." : hypothesis ? `${hypothesis} · inferred from pitch classes` : attack.midiNotes.length > 1 ? "Read the outside reach, then the inside gaps." : "Relate it to the previous and next landing."}</small></div>
    </div>
    {!veiled && !gathering && comparison?.status === "incorrect" ? <div className={styles.landingCorrection}>
      <span>Smallest correction</span>
      <strong>{comparison.corrections[0] ? `${comparison.corrections[0].direction === "same" ? "Stay" : `Move ${comparison.corrections[0].direction}`} ${comparison.corrections[0].absoluteSemitones} st · about ${Math.round(comparison.corrections[0].whiteKeyWidths * 10) / 10} white-key widths` : comparison.missingNotes.length ? `Add ${comparison.missingNotes.map((midi) => attack.notes.find((note) => note.pitch.midi === midi)?.pitch.label ?? pitchClassName(midi, prefer)).join(" + ")}` : comparison.extraNotes.length ? `Release ${comparison.extraNotes.map((midi) => pitchClassName(midi, prefer)).join(" + ")}` : attackStatusLabel(comparison, true)}</strong>
    </div> : null}
  </section>;
}

function ReadingChunkFocus({
  chunk,
  progress,
  loop,
  comparisons,
  currentIndex,
  veiled,
  showConventions,
  notationById,
  directionText,
}: {
  chunk: SheetReadingChunk | null;
  progress: SheetReadingChunkProgress | null;
  loop: SheetMusicPracticeLoop;
  comparisons: Map<number, SheetEventComparison>;
  currentIndex: number;
  veiled: boolean;
  showConventions: boolean;
  notationById: Map<string, ImportedMusicXmlNote>;
  directionText: string | null;
}) {
  if (!chunk) return <section className={styles.chunkFocus}><header><span>Chunk · read shapes</span><strong>No playable chunk in this loop.</strong></header></section>;
  const chordSummary = veiled
    ? `${chunk.chordSpacings.length} vertical field${chunk.chordSpacings.length === 1 ? "" : "s"} · exact gaps veiled`
    : chunk.chordSpacings.length
    ? chunk.chordSpacings.map((shape) => shape.adjacentSemitones.map((gap) => `${gap}`).join("–")).join(" / ") + " st"
    : "no vertical chord inside this chunk";
  return <section className={cx(styles.chunkFocus, progress?.status === "secure" && styles.isChunkSecure, progress?.status === "repair" && styles.isChunkRepair)} aria-labelledby="reading-chunk-title">
    <header><div><span>Suggested chunk {chunk.ordinal + 1} · {chunk.attackCount} landings</span><strong id="reading-chunk-title">{chunk.label}</strong></div><em>{progress?.status === "secure" ? "✓ all matched this take" : progress?.status === "repair" ? `${progress.needsRepair} repair` : progress?.status === "in-progress" ? `${progress.successes} right · continue` : "up next"}</em></header>
    <p className={styles.chunkCue}>{veiled ? "Keep the number of simultaneous notes and the rhythm cell in memory; exact pitch routes return in review." : chunk.cue}</p>
    {directionText && !veiled ? <p className={styles.chunkDirection}><span>Authored direction</span>{directionText}</p> : null}
    <div className={styles.chunkAttackRail} role="list" aria-label={`Reading chunk from landing ${chunk.startAttackIndex + 1} through ${chunk.endAttackIndex + 1}`}>
      {chunk.attackIndexes.map((attackIndex, index) => {
        const attack = loop.attacks[attackIndex];
        const comparison = comparisons.get(attackIndex) ?? null;
        const isCurrent = attackIndex === currentIndex;
        const movement = index ? chunk.semitonePattern[index - 1] : null;
        const flags = [...new Set(attack.notes.flatMap((note) => {
          const source = notationById.get(note.id);
          return [source?.tuplet ? `${source.tuplet.actual}:${source.tuplet.normal}` : null, source?.fermata ? "fermata" : null, source?.slurStart ? "slur begins" : null, source?.slurStop ? "slur ends" : null, note.tie.start ? "tie" : null].filter((item): item is string => item != null);
        }))];
        return <div key={attack.id} className={styles.chunkAttackPair} style={{ "--rhythm-space": Math.max(1, Math.min(4, index ? chunk.rhythmPatternBeats[index - 1] : 1)) } as CSSProperties}>
          {movement != null && !veiled ? <i className={styles.chunkMove} style={{ "--interval-color": intervalColor(movement) } as CSSProperties}>{movement > 0 ? "↑" : movement < 0 ? "↓" : "→"}{Math.abs(movement)}</i> : null}
          <article role="listitem" className={cx(styles.chunkAttack, isCurrent && styles.isCurrent, comparison?.status === "correct" && styles.isCorrect, (comparison?.status === "incorrect" || comparison?.status === "missed") && styles.isWrong)} aria-current={isCurrent ? "step" : undefined} aria-label={`Landing ${attackIndex + 1}, ${attackStatusLabel(comparison, isCurrent)}, ${attack.notes.length} note${attack.notes.length === 1 ? "" : "s"}`}>
            <small>{attack.notes.length > 1 ? `${attack.notes.length} notes` : "1 note"}</small>
            <div>{attack.notes.slice(0, 5).map((note) => <i key={note.id} />)}</div>
            <strong>{veiled ? "hidden" : showConventions ? attack.notes.map((note) => note.pitch.label).join("+") : attack.notes.length > 1 ? "field" : "tone"}</strong>
            <em>{attackStatusLabel(comparison, isCurrent)}</em>
            {!veiled && flags.length ? <span className={styles.notationFlags}>{flags.join(" · ")}</span> : null}
          </article>
        </div>;
      })}
    </div>
    <div className={styles.readingLayers}>
      <div><span>1 · Landmark</span><strong>{veiled ? `${chunk.noteCount} notes across ${chunk.attackCount} hidden landings` : showConventions ? chunk.noteSummary : `${chunk.handSummary.replace("both hands", "both staves").replace("right hand", "upper staff").replace("left hand", "lower staff")} · ${chunk.rangeSemitones} st range`}</strong></div>
      <div><span>2 · Top-note path</span><strong>{veiled ? "exact direction and width veiled" : patternLabel(chunk.semitonePattern)}</strong></div>
      <div><span>3 · Vertical shape</span><strong>{chordSummary}</strong></div>
      <div><span>4 · Rhythm cell</span><strong>{rhythmLabel(chunk.rhythmPatternBeats)}</strong></div>
    </div>
  </section>;
}

function CollectionFocus({ analysis, showConventions, prefer, veiled }: { analysis: SheetPitchCollectionAnalysis; showConventions: boolean; prefer: "flats" | "sharps"; veiled: boolean }) {
  const kindLabel = (kind: string) => kind === "natural-minor" ? "natural minor" : kind.replace("-", " ");
  const fitGap = (analysis.candidates[0]?.fitScore ?? 0) - (analysis.candidates[1]?.fitScore ?? 0);
  const evidenceHeadline = analysis.evidence === "thin"
    ? "Too few distinct pitches to orient a scale"
    : analysis.evidence === "usable"
      ? "This chunk fits several collections"
      : fitGap >= .08
        ? "One collection is the stronger local fit"
        : "Several collections remain plausible";
  return <section className={styles.collectionFocus} aria-labelledby="collection-focus-title">
    <header><span>Local collection · scale context</span><strong id="collection-focus-title">{veiled ? "Scale context hidden during this pass" : evidenceHeadline}</strong></header>
    {veiled ? <div className={styles.collectionVeil}><i aria-hidden="true">?</i><strong>Pitch collection is veiled.</strong><small>Rhythm slots and simultaneous-note counts remain; signature, pitch classes, and scale candidates return in review.</small></div> : <>
    <div className={styles.signatureContext}><span>Written context</span><strong>{analysis.authored.label}</strong>{analysis.authored.relativePossibilities.length ? <small>Signature relatives: {analysis.authored.relativePossibilities.join(" / ")}</small> : null}</div>
    <div className={styles.pitchClassOrbit} role="img" aria-label={`${analysis.observedPitchClasses.length} distinct pitch classes in the nearby reading window`}>
      {Array.from({ length: 12 }, (_, pitchClass) => <i key={pitchClass} className={analysis.observedPitchClasses.includes(pitchClass) ? styles.isObserved : undefined} style={{ "--pitch-angle": `${pitchClass * 30}deg` } as CSSProperties}><span>{showConventions && analysis.observedPitchClasses.includes(pitchClass) ? pitchClassName(pitchClass + 60, prefer).replace(/\d+$/, "") : ""}</span></i>)}
      <b>{analysis.observedPitchClasses.length}<small>pitch classes</small></b>
    </div>
    {analysis.evidence === "thin" ? <div className={styles.thinCollection}><strong>Play through more distinct pitch positions.</strong><small>This nearby window fits too many scales to orient you honestly.</small></div> : <div className={styles.collectionCandidates}>{analysis.candidates.slice(0, 2).map((candidate, index) => <article key={`${candidate.kind}-${candidate.tonicPitchClass}`}>
      <header><span>{analysis.evidence === "thin" ? "example compatible set" : index ? "another compatible fit" : fitGap >= .08 && analysis.evidence === "rich" ? "stronger local fit" : "compatible fit"}</span><strong>{showConventions ? candidate.label : kindLabel(candidate.kind)}</strong></header>
      <div><i style={{ "--fit": candidate.occurrenceCoverage } as CSSProperties} /></div>
      <small>{Math.round(candidate.occurrenceCoverage * 100)}% note coverage—not confidence · {candidate.signatureCompatible ? "agrees with signature" : "local subset only"}</small>
    </article>)}</div>}
    <p>{analysis.caveat}</p>
    </>}
  </section>;
}

function ScoreJourney({
  loop,
  chunks,
  chunkProgress,
  comparisons,
  currentIndex,
  extraCount,
  captureState,
}: {
  loop: SheetMusicPracticeLoop;
  chunks: SheetReadingChunk[];
  chunkProgress: SheetReadingChunkProgress[];
  comparisons: Map<number, SheetEventComparison>;
  currentIndex: number;
  extraCount: number;
  captureState: CaptureState;
}) {
  const exactLimit = 96;
  const binSize = Math.max(1, Math.ceil(loop.attacks.length / exactLimit));
  const bins = Array.from({ length: Math.ceil(loop.attacks.length / binSize) }, (_, binIndex) => {
    const start = binIndex * binSize;
    const end = Math.min(loop.attacks.length, start + binSize);
    const statuses = Array.from({ length: end - start }, (_, offset) => comparisons.get(start + offset)?.status ?? "pending");
    const wrong = statuses.filter((status) => status === "incorrect" || status === "missed").length;
    const correct = statuses.filter((status) => status === "correct").length;
    const current = currentIndex >= start && currentIndex < end;
    const state = wrong ? "repair" : correct === statuses.length ? "secure" : correct ? "mixed" : "pending";
    return { start, end, wrong, correct, current, state };
  });
  const successCount = [...comparisons.values()].filter((comparison) => comparison.status === "correct").length;
  const missCount = [...comparisons.values()].filter((comparison) => comparison.status === "incorrect" || comparison.status === "missed").length;
  const progressById = new Map(chunkProgress.map((progress) => [progress.chunkId, progress]));
  return <section className={styles.scoreJourney} aria-labelledby="score-journey-title">
    <header><div><span>Form · loop journey</span><strong id="score-journey-title">{loop.attacks.length} written landings in {chunks.length} reading chunks</strong></div><div className={styles.journeyCounts}><span className={styles.successCount}>✓ {successCount} right</span><span className={styles.missCount}>× {missCount} repair</span><span>○ {Math.max(0, loop.attacks.length - successCount - missCount)} waiting</span>{extraCount ? <span>+ {extraCount} extra landing{extraCount === 1 ? "" : "s"}</span> : null}</div></header>
    <div className={styles.journeyTrack} role="img" aria-label={`${successCount} correct, ${missCount} needing repair, ${Math.max(0, loop.attacks.length - successCount - missCount)} waiting${extraCount ? `, and ${extraCount} extra landings` : ""}`}>
      {bins.map((bin) => <i key={bin.start} className={cx(bin.state === "secure" && styles.isSecure, bin.state === "repair" && styles.isRepair, bin.state === "mixed" && styles.isMixed, bin.current && styles.isCursor)} title={`Landings ${bin.start + 1}–${bin.end}: ${bin.correct} right, ${bin.wrong} repair`} />)}
    </div>
    <div className={styles.chunkJourney} aria-label="Reading chunk status">{chunks.slice(0, 40).map((chunk) => {
      const progress = progressById.get(chunk.id);
      return <span key={chunk.id} className={cx(progress?.status === "secure" && styles.isSecure, progress?.status === "repair" && styles.isRepair, currentIndex >= chunk.startAttackIndex && currentIndex <= chunk.endAttackIndex && styles.isCursor)} style={{ "--chunk-grow": chunk.attackCount } as CSSProperties}>{chunk.ordinal + 1}<small>{progress?.status === "secure" ? "✓" : progress?.status === "repair" ? "×" : "○"}</small></span>;
    })}{chunks.length > 40 ? <em>+{chunks.length - 40} more chunks</em> : null}</div>
    <p>{captureState === "review" ? "Frozen review: ✓ and × are definitive for this take." : captureState === "armed" ? "Live alignment is provisional; a later landing can clarify an earlier match." : "Arm a silent take to turn the neutral journey into note-by-note evidence."}</p>
  </section>;
}

function stopAudioContext(context: AudioContext | null, master: GainNode | null) {
  if (!context || context.state === "closed") return;
  try {
    const now = context.currentTime;
    if (master) {
      master.gain.cancelScheduledValues(now);
      master.gain.setValueAtTime(Math.max(0.0001, master.gain.value), now);
      master.gain.exponentialRampToValueAtTime(0.0001, now + 0.025);
    }
    window.setTimeout(() => { if (context.state !== "closed") void context.close(); }, 40);
  } catch { void context.close(); }
}

export function PianoScoreFlowHud({ events, activeNotes, chordWindowMs, showConventions, frozen, onResumeCapture }: PianoScoreFlowHudProps) {
  const [imported, setImported] = useState<ImportedMusicXmlScore | null>(null);
  const [score, setScore] = useState<SheetMusicScore | null>(null);
  const [fileState, setFileState] = useState<"empty" | "loading" | "ready" | "error">("empty");
  const [fileNotice, setFileNotice] = useState("Choose compressed MXL or uncompressed MusicXML. Nothing leaves this browser tab.");
  const [loopStart, setLoopStart] = useState(0);
  const [loopEnd, setLoopEnd] = useState(3);
  const [practiceHand, setPracticeHand] = useState<PracticeHand>("both");
  const [readingMode, setReadingMode] = useState<ReadingMode>("read");
  const [timingMode, setTimingMode] = useState<TimingMode>("self-paced");
  const [tempoPercent, setTempoPercent] = useState(70);
  const [clusterWindow, setClusterWindow] = useState(() => chordWindowMs <= 80 ? 70 : chordWindowMs <= 160 ? 140 : 220);
  const [captureState, setCaptureState] = useState<CaptureState>("idle");
  const [reviewTakeEvents, setReviewTakeEvents] = useState<MidiPerformanceNote[] | null>(null);
  const [attemptAfterId, setAttemptAfterId] = useState(() => newestEventId(events));
  const [settledThroughEventId, setSettledThroughEventId] = useState(() => newestEventId(events));
  const [captureNotice, setCaptureNotice] = useState("Load a score, choose a short loop, then arm the silent MIDI take.");
  const [isDragging, setIsDragging] = useState(false);
  const [audioState, setAudioState] = useState<"idle" | "playing" | "unavailable">("idle");
  const [audioNotice, setAudioNotice] = useState("Reference audio is off. MIDI remains silent.");
  const audioContextRef = useRef<AudioContext | null>(null);
  const audioMasterRef = useRef<GainNode | null>(null);
  const audioTimerRef = useRef<number | null>(null);
  const audioTokenRef = useRef(0);
  const eventsRef = useRef(events);

  useEffect(() => {
    eventsRef.current = events;
  }, [events]);

  const stopReference = useCallback((notice = "Reference stopped. MIDI remains silent.") => {
    audioTokenRef.current += 1;
    if (audioTimerRef.current != null) window.clearTimeout(audioTimerRef.current);
    audioTimerRef.current = null;
    stopAudioContext(audioContextRef.current, audioMasterRef.current);
    audioContextRef.current = null;
    audioMasterRef.current = null;
    setAudioState("idle");
    setAudioNotice(notice);
  }, []);

  const installScore = useCallback((nextImported: ImportedMusicXmlScore, xml: string, persist: boolean) => {
    stopReference("Reference stopped for the new score. MIDI remains silent.");
    if (nextImported.partNames.length !== 1) throw new Error(`This piano release evaluates one MusicXML part at a time. This file contains ${nextImported.partNames.length}; export the piano part by itself, then import that file.`);
    const normalized = normalizeImportedMusicXmlScore(nextImported);
    setImported(nextImported);
    setScore(normalized);
    setFileState("ready");
    setFileNotice(`${nextImported.measureCount} measures · ${normalized.attacks.length} landings · ${nextImported.notes.length} written notes.`);
    setLoopStart(0);
    setLoopEnd(Math.min(3, nextImported.measureCount - 1));
    setTempoPercent(70);
    setCaptureState("idle");
    setReviewTakeEvents(null);
    setAttemptAfterId(newestEventId(eventsRef.current));
    setSettledThroughEventId(newestEventId(eventsRef.current));
    setCaptureNotice("Score ready. Study the next written shape or arm a silent take.");
    if (persist) {
      try { window.sessionStorage.setItem(SCORE_FLOW_STORAGE_KEY, JSON.stringify({ version: 1, fileName: nextImported.fileName, xml })); }
      catch { setFileNotice(`${nextImported.measureCount} measures loaded in memory; this browser could not retain the upload after navigation.`); }
    }
  }, [stopReference]);

  useEffect(() => {
    const task = window.setTimeout(() => {
      try {
        const raw = window.sessionStorage.getItem(SCORE_FLOW_STORAGE_KEY);
        if (!raw) return;
        const saved = JSON.parse(raw) as { version?: unknown; fileName?: unknown; xml?: unknown };
        if (saved.version !== 1 || typeof saved.fileName !== "string" || typeof saved.xml !== "string" || saved.xml.length > 16 * 1024 * 1024) return;
        installScore(parseMusicXml(saved.xml, saved.fileName), saved.xml, false);
        setFileNotice("Restored this tab’s on-device score. No file was uploaded to a server.");
      } catch {
        try { window.sessionStorage.removeItem(SCORE_FLOW_STORAGE_KEY); } catch { /* Continue with an empty importer. */ }
      }
    }, 0);
    return () => window.clearTimeout(task);
  }, [installScore]);

  const acceptFile = useCallback(async (file: File) => {
    setFileState("loading");
    setFileNotice(`Reading ${file.name} locally…`);
    try {
      const result = await importMusicXmlFile(file);
      installScore(result.score, result.xml, true);
    } catch (error) {
      setFileState("error");
      setFileNotice(error instanceof Error ? error.message : "This score could not be read.");
    }
  }, [installScore]);

  const onFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (file) void acceptFile(file);
  };

  const onDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setIsDragging(false);
    const file = event.dataTransfer.files?.[0];
    if (file) void acceptFile(file);
  };

  const loadDemo = () => {
    try { installScore(parseMusicXml(ORBIT_STUDY_MUSICXML, "orbit-study.musicxml"), ORBIT_STUDY_MUSICXML, true); }
    catch (error) { setFileState("error"); setFileNotice(error instanceof Error ? error.message : "The demo score could not be read."); }
  };

  const clearScore = () => {
    stopReference("Reference stopped. The local score was removed.");
    setImported(null); setScore(null); setFileState("empty"); setCaptureState("idle"); setReviewTakeEvents(null);
    setFileNotice("Score removed from this tab. Choose another MXL or MusicXML file.");
    try { window.sessionStorage.removeItem(SCORE_FLOW_STORAGE_KEY); } catch { /* The in-memory score is still cleared. */ }
  };

  const loop = useMemo(() => score ? selectSheetMusicLoop(score, { startMeasureIndex: loopStart, endMeasureIndex: loopEnd, hand: practiceHand, includeBoundaryTies: true }) : null, [loopEnd, loopStart, practiceHand, score]);
  const liveTakeEvents = useMemo(() => events
    .filter((event) => event.id > attemptAfterId)
    .sort((first, second) => first.onsetMs - second.onsetMs || first.id - second.id)
    .map((event) => ({ id: event.id, midi: event.note, onsetMs: event.onsetMs, velocity: event.velocity, releaseMs: event.keyReleaseMs ?? event.releaseMs ?? undefined })), [attemptAfterId, events]);
  const latestLiveEventId = liveTakeEvents.at(-1)?.id ?? -1;
  const takeEvents = useMemo(() => captureState === "armed"
    ? liveTakeEvents
    : captureState === "review"
      ? reviewTakeEvents ?? []
      : [], [captureState, liveTakeEvents, reviewTakeEvents]);
  const scoreVeiled = captureState !== "review" && (readingMode === "ear" || (readingMode === "memory" && captureState === "armed" && takeEvents.length > 0));
  const practiceTempo = score ? Math.max(20, Math.round(score.tempoBpm * tempoPercent / 100)) : 72;
  const evaluationState = useMemo(() => {
    if (!score) return { evaluation: null, error: null, paused: false };
    const targetCount = loop?.attacks.length ?? 0;
    if (captureState === "armed" && targetCount > MAX_LIVE_FEEDBACK_ATTACKS) return { evaluation: null, error: null, paused: true };
    try {
      if (targetCount * Math.max(1, takeEvents.length) > MAX_UI_ALIGNMENT_CELLS) throw new Error("This take and loop exceed the browser-safe comparison bound.");
      return {
        evaluation: evaluateSheetMusicPerformance(score, takeEvents, {
          startMeasureIndex: loopStart,
          endMeasureIndex: loopEnd,
          hand: practiceHand,
          includeBoundaryTies: true,
          clusterWindowMs: clusterWindow,
          arpeggioWindowMs: Math.min(500, Math.max(180, clusterWindow + 100)),
          timingToleranceMs: timingMode === "self-paced" ? 1_000_000_000 : undefined,
          durationToleranceMs: timingMode === "self-paced" ? 1_000_000_000 : undefined,
          tempoBpm: practiceTempo,
          finalize: captureState === "review",
        }),
        error: null,
        paused: false,
      };
    } catch (error) {
      return { evaluation: null, error: error instanceof Error ? error.message : "This take is too large to align safely.", paused: false };
    }
  }, [captureState, clusterWindow, loop?.attacks.length, loopEnd, loopStart, practiceHand, practiceTempo, score, takeEvents, timingMode]);
  const evaluation = evaluationState.evaluation;
  const evaluationError = evaluationState.error;
  const liveEvaluationPaused = evaluationState.paused;

  useEffect(() => {
    if (captureState !== "armed" || latestLiveEventId < 0 || latestLiveEventId <= settledThroughEventId) return;
    const task = window.setTimeout(() => setSettledThroughEventId((current) => Math.max(current, latestLiveEventId)), clusterWindow + 12);
    return () => window.clearTimeout(task);
  }, [captureState, clusterWindow, latestLiveEventId, settledThroughEventId]);

  useEffect(() => {
    const newest = newestEventId(events);
    if (newest >= attemptAfterId) return;
    const task = window.setTimeout(() => {
      setAttemptAfterId(newest);
      setSettledThroughEventId(newest);
      setCaptureState("idle");
      setReviewTakeEvents(null);
      setCaptureNotice("The shared piano trace was cleared. Arm a fresh score take when ready.");
    }, 0);
    return () => window.clearTimeout(task);
  }, [attemptAfterId, events]);

  useEffect(() => {
    if (captureState !== "armed" || !takeEvents.length || !evaluation?.complete || activeNotes.length) return;
    const task = window.setTimeout(() => {
      setReviewTakeEvents(takeEvents.map((event) => ({ ...event })));
      setCaptureState("review");
      setCaptureNotice("The selected loop has enough landings to review. Evidence is frozen at this attempt boundary.");
    }, 420);
    return () => window.clearTimeout(task);
  }, [activeNotes.length, captureState, evaluation?.complete, takeEvents]);

  const armTake = () => {
    if (!score || !loop?.attacks.length) return;
    if (activeNotes.length) {
      setCaptureNotice("Release every held or sustained key before arming. This keeps the first score boundary unambiguous.");
      return;
    }
    if (frozen) onResumeCapture();
    setAttemptAfterId(newestEventId(events));
    setSettledThroughEventId(newestEventId(events));
    setReviewTakeEvents(null);
    setCaptureState("armed");
    setCaptureNotice((loop?.attacks.length ?? 0) > MAX_LIVE_FEEDBACK_ATTACKS
      ? `Long take armed. To protect the browser, live alignment pauses above ${MAX_LIVE_FEEDBACK_ATTACKS} written landings; play the loop, then choose Stop + diagnose for one frozen evaluation.`
      : "Take armed. The first new MIDI or on-screen attack becomes the timing anchor; MIDI remains silent.");
  };

  const reviewTake = () => {
    if (!takeEvents.length) { setCaptureNotice("No new landings have crossed this take boundary yet."); return; }
    setReviewTakeEvents(takeEvents.map((event) => ({ ...event })));
    setCaptureState("review");
    setCaptureNotice(activeNotes.length
      ? `Take stopped while ${activeNotes.length} key${activeNotes.length === 1 ? " was" : "s were"} still sounding; those unfinished release lengths remain unscored.`
      : "Take stopped. The HUD now separates pitch, interval, chord, pulse, and release evidence.");
  };

  const resetTake = useCallback((notice = "Take cleared. Study the next relationship, then arm again.") => {
    stopReference("Reference stopped for the new practice boundary. MIDI remains silent.");
    setAttemptAfterId(newestEventId(events));
    setSettledThroughEventId(newestEventId(events));
    setReviewTakeEvents(null);
    setCaptureState("idle");
    setCaptureNotice(notice);
  }, [events, stopReference]);

  const changeLoop = (start: number, end: number) => {
    if (!score) return;
    const nextStart = Math.max(0, Math.min(score.measures.length - 1, start));
    const nextEnd = Math.max(nextStart, Math.min(score.measures.length - 1, end));
    setLoopStart(nextStart); setLoopEnd(nextEnd); resetTake(`Loop moved to measures ${score.measures[nextStart].number}–${score.measures[nextEnd].number}.`);
  };

  const installRepairLoop = () => {
    if (!score || !evaluation) return;
    const repair = repairLoopAroundFirstDivergence(score, evaluation, 1);
    if (!repair || repair.startMeasureIndex == null || repair.endMeasureIndex == null) return;
    setLoopStart(repair.startMeasureIndex); setLoopEnd(repair.endMeasureIndex); setPracticeHand(repair.hand ?? "both");
    resetTake(`Repair loop narrowed around the first divergence: measures ${score.measures[repair.startMeasureIndex].number}–${score.measures[repair.endMeasureIndex].number}.`);
  };

  const evaluatedCurrentIndex = captureState === "review"
    ? evaluation?.firstDivergence?.expectedIndex ?? evaluation?.progress.nextExpectedIndex ?? loop?.attacks.length ?? 0
    : evaluation?.progress.nextExpectedIndex ?? (evaluation?.complete ? loop?.attacks.length ?? 0 : 0);
  const gatheringComparison = captureState === "armed" && latestLiveEventId > settledThroughEventId && evaluatedCurrentIndex > 0
    ? evaluation?.comparisons[evaluatedCurrentIndex - 1] ?? null
    : null;
  const gatheringPreviousChord = Boolean(gatheringComparison
    && gatheringComparison.expected.midiNotes.length > 1
    && gatheringComparison.status === "incorrect"
    && gatheringComparison.missingNotes.length
    && !gatheringComparison.extraNotes.length);
  const currentIndex = gatheringPreviousChord ? evaluatedCurrentIndex - 1 : evaluatedCurrentIndex;
  const nextAttack = loop?.attacks[currentIndex] ?? null;
  const contextAttack = nextAttack ?? loop?.attacks.at(-1) ?? null;
  const priorComparison = evaluation?.comparisons.slice(0, currentIndex).findLast((comparison) => comparison.actual != null) ?? null;
  const priorAttack = currentIndex > 0 ? loop?.attacks[currentIndex - 1] ?? null : null;
  const previousNotes = priorComparison?.actualNotes ?? priorAttack?.midiNotes ?? [];
  const previousByHand = notesByHand(priorComparison, priorAttack);
  const currentMeasureIndex = contextAttack?.measureIndex ?? loopEnd;
  const prefer = (imported?.measures[currentMeasureIndex]?.keyFifths ?? score?.keyFifths ?? 0) > 0 ? "sharps" as const : "flats" as const;
  const notationById = useMemo(() => new Map((imported?.notes ?? []).map((note) => [note.id, note])), [imported]);
  const readingChunks = useMemo(() => score ? buildSheetMusicReadingChunks(score, {
    startMeasureIndex: loopStart,
    endMeasureIndex: loopEnd,
    hand: practiceHand,
    includeBoundaryTies: true,
    minAttacks: 2,
    maxAttacks: 6,
    targetAttacks: 4,
  }) : [], [loopEnd, loopStart, practiceHand, score]);
  const visibleComparisons = useMemo(() => {
    if (scoreVeiled) return [];
    const comparisons = evaluation?.comparisons ?? [];
    return gatheringPreviousChord ? comparisons.filter((comparison) => comparison.expectedIndex !== currentIndex) : comparisons;
  }, [currentIndex, evaluation?.comparisons, gatheringPreviousChord, scoreVeiled]);
  const chunkProgress = useMemo(() => summarizeSheetReadingChunkProgress(readingChunks, visibleComparisons), [readingChunks, visibleComparisons]);
  const currentChunk = readingChunks.find((chunk) => currentIndex >= chunk.startAttackIndex && currentIndex <= chunk.endAttackIndex)
    ?? (currentIndex >= (loop?.attacks.length ?? 0) ? readingChunks.at(-1) : readingChunks[0])
    ?? null;
  const currentChunkProgress = currentChunk ? chunkProgress.find((progress) => progress.chunkId === currentChunk.id) ?? null : null;
  const comparisonsByExpectedIndex = useMemo(() => new Map(visibleComparisons.map((comparison) => [comparison.expectedIndex, comparison])), [visibleComparisons]);
  const comparisonsByMeasureIndex = useMemo(() => {
    const grouped = new Map<number, SheetEventComparison[]>();
    for (const comparison of visibleComparisons) {
      const measureComparisons = grouped.get(comparison.expected.measureIndex) ?? [];
      measureComparisons.push(comparison);
      grouped.set(comparison.expected.measureIndex, measureComparisons);
    }
    return grouped;
  }, [visibleComparisons]);
  const localMeasureContext = imported?.measures[currentMeasureIndex] ?? null;
  const localCollectionAttacks = useMemo(() => {
    if (!currentChunk || !loop) return [];
    const position = readingChunks.findIndex((chunk) => chunk.id === currentChunk.id);
    const indexes = readingChunks.slice(Math.max(0, position - 1), position + 2).flatMap((chunk) => chunk.attackIndexes);
    return indexes.map((index) => loop.attacks[index]).filter(Boolean);
  }, [currentChunk, loop, readingChunks]);
  const localCollection = useMemo(() => analyzeLocalPitchCollections(
    localCollectionAttacks,
    { keyFifths: localMeasureContext?.keyFifths ?? null, keyMode: localMeasureContext?.keyMode ?? null, maxCandidates: 3 },
  ), [localCollectionAttacks, localMeasureContext?.keyFifths, localMeasureContext?.keyMode]);

  const playReference = useCallback(async (voice: ReferenceVoice = "full") => {
    if (!loop?.attacks.length) return;
    stopReference("Preparing score reference…");
    const AudioContextConstructor = window.AudioContext || (window as AudioContextWindow).webkitAudioContext;
    if (!AudioContextConstructor) { setAudioState("unavailable"); setAudioNotice("Reference audio is unavailable here. The silent score coach still works."); return; }
    const token = audioTokenRef.current + 1;
    audioTokenRef.current = token;
    let context: AudioContext | null = null;
    let master: GainNode | null = null;
    try {
      context = new AudioContextConstructor({ latencyHint: "interactive" });
      audioContextRef.current = context;
      await context.resume();
      if (audioTokenRef.current !== token || audioContextRef.current !== context) { stopAudioContext(context, null); return; }
      const now = context.currentTime;
      const compressor = context.createDynamicsCompressor();
      configureSafetyCompressor(compressor, now);
      master = context.createGain();
      audioMasterRef.current = master;
      master.gain.setValueAtTime(SYNTH_MASTER_GAIN, now);
      compressor.connect(master).connect(context.destination);
      const startIndex = Math.max(0, currentIndex);
      const source = loop.attacks.slice(startIndex, startIndex + 14);
      const baseBeat = source[0]?.onsetBeat ?? loop.startBeat;
      const secondsPerBeat = 60 / practiceTempo;
      const bounded = source.filter((attack) => (attack.onsetBeat - baseBeat) * secondsPerBeat <= 9);
      let latestStop = now + 0.2;
      let denseFieldClipped = false;
      let longDurationCapped = false;
      bounded.forEach((attack) => {
        const attackStart = now + 0.065 + (attack.onsetBeat - baseBeat) * secondsPerBeat;
        const ordered = [...attack.notes].sort((first, second) => first.pitch.midi - second.pitch.midi);
        const voiceNotes = voice === "upper"
          ? ordered.slice(-1)
          : voice === "bass"
            ? ordered.slice(0, 1)
            : attack.arpeggiate === "down"
              ? ordered.reverse().slice(0, 12)
              : ordered.slice(0, 12);
        if (voice === "full" && attack.notes.length > voiceNotes.length) denseFieldClipped = true;
        const voiceGain = 0.68 / Math.sqrt(Math.max(1, voiceNotes.length));
        voiceNotes.forEach((writtenNote, noteIndex) => {
          const rollDelay = voice === "full" && attack.arpeggiate ? noteIndex * 0.055 : 0;
          const start = attackStart + rollDelay;
          const rawDuration = Math.max(0.14, writtenNote.soundingDurationBeats * secondsPerBeat * 0.82);
          const duration = Math.min(6, rawDuration);
          if (rawDuration > duration) longDurationCapped = true;
          const oscillator = context!.createOscillator();
          const envelope = context!.createGain();
          oscillator.type = "sine";
          oscillator.frequency.setValueAtTime(frequencyFromMidi(writtenNote.pitch.midi), start);
          envelope.gain.setValueAtTime(0.0001, start);
          envelope.gain.exponentialRampToValueAtTime(voiceGain, start + 0.018);
          envelope.gain.setValueAtTime(voiceGain, start + Math.max(0.04, duration - 0.07));
          envelope.gain.exponentialRampToValueAtTime(0.0001, start + duration);
          oscillator.connect(envelope).connect(compressor);
          oscillator.start(start); oscillator.stop(start + duration + 0.03);
          latestStop = Math.max(latestStop, start + duration + 0.08);
        });
      });
      setAudioState("playing");
      const voiceLabel = voice === "upper" ? "upper path" : voice === "bass" ? "bass route" : "full written field";
      const bounds = [denseFieldClipped ? "dense fields are transparently limited to 12 tones" : null, longDurationCapped ? "very long tones are capped at 6 seconds" : null].filter(Boolean).join("; ");
      setAudioNotice(`Playing the ${voiceLabel} for up to ${bounded.length} landing${bounded.length === 1 ? "" : "s"} from the cursor at ${practiceTempo} BPM. Each voice keeps its own tied duration${bounds ? `; ${bounds}` : ""}. MIDI input is still silent.`);
      audioTimerRef.current = window.setTimeout(() => {
        if (audioTokenRef.current !== token) return;
        if (context?.state !== "closed") void context?.close();
        audioContextRef.current = null; audioMasterRef.current = null; audioTimerRef.current = null;
        setAudioState("idle"); setAudioNotice(voice === "full" ? "Reference finished. Isolate the upper path or bass route next, then reproduce the relationship on the keys." : `The ${voiceLabel} finished. Sing or imagine it once without the keys, then find it inside the full texture.`);
      }, Math.max(180, (latestStop - now) * 1000));
    } catch {
      stopAudioContext(context, master);
      audioContextRef.current = null; audioMasterRef.current = null;
      setAudioState("unavailable"); setAudioNotice("Reference playback could not start. Check site audio permission; score and MIDI visualization remain available.");
    }
  }, [currentIndex, loop, practiceTempo, stopReference]);

  useEffect(() => () => stopReference(), [stopReference]);

  if (!score || !imported) return <section className={styles.shell} aria-labelledby="score-flow-title">
    <header className={styles.intro}>
      <div><span>Uploaded score · eyes, hands, and ear</span><h3 id="score-flow-title">Turn a page of music into a navigable field.</h3><p>Import MusicXML, choose a few measures, and let silent MIDI show where your playing agrees with the written pitch, interval, chord, timing, and release structure. Corrections are expressed as semitone direction and approximate physical key travel—not as a judgment of musical worth.</p></div>
      <dl><div><dt>Score</dt><dd>authored pitch spelling and structure lead</dd></div><div><dt>MIDI</dt><dd>notes and timing only · no sound</dd></div><div><dt>Fingering</dt><dd>authored when present · otherwise suggested</dd></div></dl>
    </header>
    <div className={cx(styles.dropZone, isDragging && styles.isDragging)} onDragEnter={(event) => { event.preventDefault(); setIsDragging(true); }} onDragOver={(event) => event.preventDefault()} onDragLeave={() => setIsDragging(false)} onDrop={onDrop}>
      <div className={styles.dropOrbit} aria-hidden="true"><i /><i /><i /></div>
      <span>Local score portal</span><strong>{fileState === "loading" ? "Reading the score…" : "Drop an MXL or MusicXML file here"}</strong><p>.mxl · .musicxml · .xml · up to 12 MB compressed / 16 MB expanded</p>
      <div><label htmlFor="score-flow-upload">Choose score<input id="score-flow-upload" type="file" accept=".mxl,.musicxml,.xml,application/vnd.recordare.musicxml,application/vnd.recordare.musicxml+xml,application/xml,text/xml" onChange={onFileChange} /></label><button type="button" onClick={loadDemo}>Try original Orbit Study</button></div>
      <small role={fileState === "error" ? "alert" : "status"}>{fileNotice}</small>
    </div>
    <div className={styles.importTruth}><article><span>Private by design</span><strong>Parsing happens in this tab.</strong><p>The score never leaves this browser. A tab-local copy is kept until you remove it or the tab session ends.</p></article><article><span>What is evaluated</span><strong>Written landings become targets.</strong><p>A landing is one or more notes that start together. Tied continuations stay held; simultaneous staff voices merge at one onset.</p></article><article><span>What remains human</span><strong>Expression is not reduced to correctness.</strong><p>Dynamics, pedaling, tone, rubato, intention, and enjoyment exceed silent MIDI. This HUD keeps the evidence it does have separate.</p></article></div>
  </section>;

  const currentDirections = imported.directions
    .filter((direction) => direction.measureIndex === currentMeasureIndex && direction.kind !== "tempo" && direction.onsetBeats <= (contextAttack?.onsetBeat ?? Number.POSITIVE_INFINITY) + 1e-7)
    .slice(-3);
  const repairAvailable = captureState === "review" && evaluation?.firstDivergence != null;
  const visibleEvaluation = scoreVeiled || gatheringPreviousChord ? null : evaluation;
  const pitchMetric = visibleEvaluation?.metrics.pitch;
  const chordMetric = visibleEvaluation?.metrics.chords;
  const contourMetric = visibleEvaluation?.metrics.soprano;
  const bassMetric = visibleEvaluation?.metrics.bass;
  const arpeggiationMetric = visibleEvaluation?.metrics.arpeggiation;
  const chordSpacingMetric = visibleEvaluation?.metrics.chordSpacing;
  const latestUpperRelationship = contourMetric?.comparisons.at(-1) ?? null;
  const latestBassRelationship = bassMetric?.comparisons.at(-1) ?? null;
  const hasPracticeAttacks = Boolean(loop?.attacks.length);
  const focusComparison = evaluation?.comparisons.find((comparison) => comparison.expectedIndex === currentIndex) ?? null;
  const announcedGatheredCount = nextAttack ? Math.min(nextAttack.midiNotes.length, new Set([
    ...activeNotes.filter((note) => nextAttack.midiNotes.includes(note)),
    ...(focusComparison?.actualNotes ?? []).filter((note) => nextAttack.midiNotes.includes(note)),
  ]).size) : 0;
  const liveHudMessage = scoreVeiled && nextAttack
    ? `Veiled landing ${currentIndex + 1} of ${loop?.attacks.length ?? 0}: ${nextAttack.midiNotes.length} note${nextAttack.midiNotes.length === 1 ? "" : "s"}. Pitch and outcome feedback return in review.`
    : gatheringPreviousChord && nextAttack
      ? `Gathering ${announcedGatheredCount} of ${nextAttack.midiNotes.length} notes inside the ${clusterWindow} millisecond togetherness window.`
      : nextAttack
        ? `${attackStatusLabel(focusComparison, true)}. Next landing has ${nextAttack.notes.length} note${nextAttack.notes.length === 1 ? "" : "s"}${showConventions ? `: ${nextAttack.notes.map((note) => note.pitch.label).join(" plus ")}` : ""}.`
        : captureState === "armed" ? "Every written landing has arrived. Release any held keys to finish the take." : "Loop complete. Review this take or move the loop.";
  const divergenceComparison = evaluation?.firstDivergence?.expectedIndex == null
    ? null
    : evaluation.comparisons.find((comparison) => comparison.expectedIndex === evaluation.firstDivergence?.expectedIndex) ?? null;
  const authoredLabelForMidi = (midi: number) => divergenceComparison?.expected.notes.find((note) => note.pitch.midi === midi)?.pitch.label ?? pitchClassName(midi, prefer);
  const repairInstruction = (() => {
    const divergence = evaluation?.firstDivergence;
    if (!divergence) return "";
    if (divergence.signedSemitoneCorrection != null) return `Key correction: move ${divergence.signedSemitoneCorrection > 0 ? "right" : "left"} ${Math.abs(divergence.signedSemitoneCorrection)} semitone${Math.abs(divergence.signedSemitoneCorrection) === 1 ? "" : "s"}. Preserve the surrounding contour and every already-correct tone.`;
    if (divergenceComparison?.missingNotes.length && !divergenceComparison.extraNotes.length) {
      const retained = divergenceComparison.expectedNotes.filter((midi) => divergenceComparison.actualNotes.includes(midi)).map(authoredLabelForMidi);
      const missing = divergenceComparison.missingNotes.map((midi) => {
        const note = divergenceComparison.expected.notes.find((candidate) => candidate.pitch.midi === midi);
        return `${authoredLabelForMidi(midi)}${note?.fingering ? ` with authored finger ${note.fingering}` : ""}`;
      });
      return `${retained.length ? `Keep ${retained.join(" + ")} in place; ` : ""}add ${missing.join(" + ")}. Hear the complete vertical spacing, then rebuild it without moving the retained tones.`;
    }
    if (divergenceComparison?.extraNotes.length && !divergenceComparison.missingNotes.length) {
      const retained = divergenceComparison.actualNotes.filter((midi) => divergenceComparison.expectedNotes.includes(midi)).map(authoredLabelForMidi);
      const extras = divergenceComparison.extraNotes.map((midi) => pitchClassName(midi, prefer));
      return `${retained.length ? `Keep ${retained.join(" + ")}; ` : ""}remove ${extras.join(" + ")}. Re-form the written field before the next attack.`;
    }
    if (divergence.kind === "arpeggiation") return "Keep the written pitch set, but reverse or clarify the marked roll direction. Rehearse the outer notes first, then insert the interior tones.";
    if (divergence.kind === "missing-attack") return `Add the missing written landing${divergence.measureNumber ? ` in measure ${divergence.measureNumber}` : ""}; connect the landing before and after it as one short repair fragment.`;
    if (divergence.kind === "extra-attack") return "Omit the extra attack while preserving any notes already held across this boundary.";
    return "Replay the smallest surrounding relationship. Keep correct pitches intact and change only the named pulse or key-release boundary.";
  })();

  return <section className={styles.shell} aria-labelledby="score-flow-title">
    <header className={styles.scoreHeader}>
      <div><span>Score Flow · uploaded music</span><h3 id="score-flow-title">{imported.title}</h3><p>{imported.composer ? `${imported.composer} · ` : ""}{imported.partNames.join(" + ")} · {imported.fileName}</p></div>
      <div className={styles.scoreFacts}><span>{imported.measureCount} measures</span><span>{score.attacks.length} landings</span><span>{scoreVeiled ? "key context veiled" : keySignatureLabel(localMeasureContext ?? imported)}</span><span>{meterSummary(imported)}</span><span>{imported.tempoBpm ? `opening ${Math.round(imported.tempoBpm)} BPM` : "tempo not encoded · using 72"}</span><span>{scoreVeiled ? "pitch range veiled" : imported.lowestMidi != null && imported.highestMidi != null ? `${pitchClassName(imported.lowestMidi, prefer)}–${pitchClassName(imported.highestMidi, prefer)}` : "range unavailable"}</span></div>
      <button type="button" className={styles.removeScore} onClick={clearScore}>Remove local score</button>
    </header>

    <details className={styles.practiceSetup}>
      <summary><span>Practice setup</span><strong>m.{score.measures[loopStart].number}–{score.measures[loopEnd].number} · {practiceHand === "both" ? "both staves" : practiceHand === "right" ? "upper staff" : "lower staff"} · {readingMode === "read" ? "score visible" : readingMode === "memory" ? "memory fade" : "ear-first veil"} · {timingMode === "self-paced" ? `self-paced · ${practiceTempo} BPM reference` : `fixed pulse · ${practiceTempo} BPM`}</strong><small>Change loop, visibility, timing, tempo, or togetherness tolerance</small></summary>
      <div className={styles.practiceControls} aria-label="Score practice controls">
        <label><span>From measure</span><select value={loopStart} onChange={(event) => changeLoop(Number(event.target.value), Math.max(Number(event.target.value), loopEnd))}>{score.measures.map((measure) => <option key={measure.id} value={measure.index}>{measure.number}</option>)}</select></label>
        <label><span>Through measure</span><select value={loopEnd} onChange={(event) => changeLoop(Math.min(loopStart, Number(event.target.value)), Number(event.target.value))}>{score.measures.map((measure) => <option key={measure.id} value={measure.index} disabled={measure.index < loopStart}>{measure.number}</option>)}</select></label>
        <label><span>Staff focus</span><select value={practiceHand} onChange={(event) => { setPracticeHand(event.target.value as PracticeHand); resetTake("Staff focus changed. The score boundary is fresh."); }}><option value="both">Both staves</option><option value="right">Upper staff</option><option value="left">Lower staff</option></select></label>
        <label><span>Reading layer</span><select value={readingMode} onChange={(event) => setReadingMode(event.target.value as ReadingMode)}><option value="read">Pitch-position horizon</option><option value="memory">Fade after launch</option><option value="ear">Ear first · veil pitches</option></select></label>
        <label><span>Timing lens</span><select value={timingMode} onChange={(event) => { setTimingMode(event.target.value as TimingMode); resetTake("Timing lens changed. Arm a fresh take."); }}><option value="self-paced">Self-paced · pitch first</option><option value="pulse">Fixed-pulse drill</option></select></label>
        <label><span>Practice tempo</span><select value={tempoPercent} onChange={(event) => { setTempoPercent(Number(event.target.value)); resetTake("Tempo changed. Arm a fresh take."); }}><option value={50}>50% · {Math.max(20, Math.round(score.tempoBpm * .5))} BPM</option><option value={70}>70% · {Math.max(20, Math.round(score.tempoBpm * .7))} BPM</option><option value={85}>85% · {Math.max(20, Math.round(score.tempoBpm * .85))} BPM</option><option value={100}>100% · {Math.round(score.tempoBpm)} BPM</option></select></label>
        <label><span>Notes count as together</span><select value={clusterWindow} onChange={(event) => { setClusterWindow(Number(event.target.value)); resetTake("Togetherness lens changed. Arm a fresh take."); }}><option value={70}>Tight · 70 ms</option><option value={140}>Relaxed · 140 ms</option><option value={220}>Rolled · 220 ms</option></select></label>
      </div>
      <div className={styles.measureMap} aria-label="Measure navigator">{score.measures.map((measure) => {
        const comparisons = comparisonsByMeasureIndex.get(measure.index) ?? [];
        const wrong = comparisons.some((comparison) => comparison.status === "incorrect" || comparison.status === "missed");
        const correct = comparisons.length > 0 && comparisons.every((comparison) => comparison.status === "correct");
        const inLoop = measure.index >= loopStart && measure.index <= loopEnd;
        const current = measure.index === currentMeasureIndex;
        const state = wrong ? "needs repair" : correct ? "aligned" : current ? "current" : inLoop ? "in loop" : "outside loop";
        return <button key={measure.id} type="button" className={cx(inLoop && styles.isInLoop, current && styles.isCurrentMeasure, wrong && styles.hasWrong, correct && styles.isMeasureCorrect)} aria-label={`Measure ${measure.number}, ${imported.measures[measure.index]?.timeSignatureDisplay ?? `${measure.beats}/${measure.beatType}`}, ${state}`} aria-current={current ? "location" : undefined} onClick={() => changeLoop(measure.index, Math.min(score.measures.length - 1, measure.index + Math.max(0, loopEnd - loopStart)))}><span>{measure.number}</span><small>{imported.measures[measure.index]?.timeSignatureDisplay ?? `${measure.beats}/${measure.beatType}`}</small><em>{wrong ? "repair" : correct ? "aligned" : current ? "current" : inLoop ? "loop" : ""}</em></button>;
      })}</div>
    </details>

    <div className={styles.sessionBar}>
      <div><span>{captureState === "idle" ? "study" : captureState === "armed" ? liveEvaluationPaused ? "long take" : evaluation?.complete && activeNotes.length ? "release to finish" : takeEvents.length ? "capturing" : "armed" : "review"}</span><strong>{loop?.attacks.length ?? 0} written landing{loop?.attacks.length === 1 ? "" : "s"} · m.{score.measures[loopStart].number}–{score.measures[loopEnd].number}</strong><small role="status" aria-live="polite" aria-atomic="true">{evaluationError ? "Evaluation paused until the loop is shortened." : !hasPracticeAttacks ? "This selection contains no landing targets for the chosen staff focus. Include a measure with notes or change the staff focus." : captureState === "armed" && evaluation?.complete && activeNotes.length ? "All written landings have arrived. Release the held keys so key-release lengths can enter the frozen review." : captureNotice}</small>{evaluationError ? <small role="alert">{evaluationError} Choose a shorter measure loop, then arm a fresh take.</small> : null}</div>
      <div className={styles.sessionActions}>{audioState === "playing" ? <button type="button" onClick={() => stopReference()}>Stop reference</button> : <><button type="button" disabled={!hasPracticeAttacks} onClick={() => void playReference()}>Hear from cursor · audio</button><button type="button" disabled={!hasPracticeAttacks} onClick={() => void playReference("upper")}>Hear upper path</button><button type="button" disabled={!hasPracticeAttacks} onClick={() => void playReference("bass")}>Hear bass route</button></>}{captureState === "armed" ? <button type="button" onClick={reviewTake}>Stop + diagnose</button> : <button type="button" className={styles.primaryAction} disabled={!hasPracticeAttacks || Boolean(evaluationError)} onClick={armTake}>{captureState === "review" ? "Try loop again" : "Arm silent take"}</button>}</div>
      <p className={styles.audioNotice}>{audioNotice}{timingMode === "pulse" ? ` Fixed-pulse is a literal ${practiceTempo} BPM drill: your first landing is beat zero, and encoded rubato words or fermatas do not move its clock.` : ""}</p>
    </div>

    {loop ? <div className={styles.immersionOverview}>
      <p className="sr-only" role="status" aria-live="polite" aria-atomic="true">{liveHudMessage}</p>
      <FocusLanding attack={nextAttack} comparison={focusComparison} currentIndex={currentIndex} totalAttacks={loop.attacks.length} activeNotes={activeNotes} veiled={scoreVeiled} showConventions={showConventions} prefer={prefer} arrivalWindowMs={clusterWindow} arrivalWindowOpen={latestLiveEventId > settledThroughEventId} captureState={captureState} />
      <ReadingChunkFocus chunk={currentChunk} progress={currentChunkProgress} loop={loop} comparisons={comparisonsByExpectedIndex} currentIndex={currentIndex} veiled={scoreVeiled} showConventions={showConventions} notationById={notationById} directionText={currentDirections.length ? currentDirections.map((direction) => direction.text).join(" · ") : null} />
      <CollectionFocus analysis={localCollection} showConventions={showConventions} prefer={prefer} veiled={scoreVeiled} />
      <ScoreJourney loop={loop} chunks={readingChunks} chunkProgress={chunkProgress} comparisons={comparisonsByExpectedIndex} currentIndex={currentIndex} extraCount={visibleEvaluation?.extraClusters.length ?? 0} captureState={captureState} />
    </div> : null}

    <div className={styles.hudGrid}>
      <section className={styles.handCompass} aria-labelledby="hand-compass-title">
        <header><div><span>Keyboard route</span><h4 id="hand-compass-title">Put the focused landing under the hands.</h4></div><p>{scoreVeiled ? "Destination, played pitches, and prior-score territory stay dark until review." : "White outline = held · gold = destination · blue edge = last landing. Finger numbers are never silently presented as authored."}</p></header>
        <KeyboardTerritory next={scoreVeiled ? null : nextAttack} previousNotes={scoreVeiled ? [] : previousNotes} activeNotes={scoreVeiled ? [] : activeNotes} showConventions={scoreVeiled ? false : showConventions} prefer={prefer} />
        {scoreVeiled ? <div className={styles.emptyField}><strong>Destination territory is veiled.</strong><span>Hear or imagine the landing, play the route, then stop the take to reveal exact semitones, physical key travel, and suggested fingers.</span></div> : <DistanceField next={nextAttack} previousByHand={previousByHand} showConventions={showConventions} prefer={prefer} />}
      </section>

      <section className={styles.diagnosis} aria-labelledby="score-diagnosis-title">
        <header><div><span>First useful difference</span><h4 id="score-diagnosis-title">{evaluationError ? "Shorten the loop to keep the diagnosis responsive." : liveEvaluationPaused ? "Long take is recording without repeated heavy alignment." : captureState === "review" ? evaluation?.firstDivergence ? `Repair measure ${evaluation.firstDivergence.measureNumber ?? "near the cursor"}.` : "The selected evidence aligned." : takeEvents.length ? "Follow the live cursor, not a score total." : "Launch only when the whole next shape is prepared."}</h4></div></header>
        {evaluationError ? <div className={styles.divergenceCard} role="alert"><span>Evaluation boundary</span><strong>{evaluationError}</strong><p>The score remains loaded and no evidence was discarded. Select fewer measures, then arm a fresh take.</p></div> : liveEvaluationPaused ? <div className={styles.liveInstruction}><strong>{takeEvents.length} key attack{takeEvents.length === 1 ? "" : "s"} captured behind a fixed boundary.</strong><p>Keep playing from the source page. Stop + diagnose freezes this take and runs the expensive alignment once; no automatic finish or moving cursor is attempted during a long capture.</p></div> : captureState === "review" ? evaluation?.firstDivergence ? <div className={styles.divergenceCard}>
          <span>{evaluation.firstDivergence.kind.replace("-", " ")}</span><strong>{evaluation.firstDivergence.message}</strong>
          <p>{repairInstruction}</p>
          {divergenceComparison?.expectedSpacing.adjacentSemitones.length || divergenceComparison?.actualSpacing?.adjacentSemitones.length ? <div className={styles.spacingComparison}>
            <div><span>Written gaps</span><strong>{divergenceComparison.expectedSpacing.adjacentSemitones.length ? divergenceComparison.expectedSpacing.adjacentSemitones.map((gap) => `${gap} st`).join(" · ") : "single tone"}</strong></div>
            <b>→</b>
            <div><span>Played gaps</span><strong>{divergenceComparison.actualSpacing?.adjacentSemitones.length ? divergenceComparison.actualSpacing.adjacentSemitones.map((gap) => `${gap} st`).join(" · ") : divergenceComparison.actualNotes.length ? "single tone" : "no landing"}</strong></div>
          </div> : null}
          {repairAvailable ? <button type="button" onClick={installRepairLoop}>Make a ±1 measure repair loop</button> : null}
        </div> : <div className={styles.secureCard}><span>No first divergence</span><strong>Pitch, chord, and selected timing evidence aligned for this loop.</strong><p>This is not a musicality or expression score. Move the loop, fade notation, or sing one voice before replaying it.</p></div> : scoreVeiled ? <div className={styles.liveInstruction}><strong>Hold the heard or imagined route without searching for a lit destination.</strong><p>The score preserves only rhythm slots and chord size while this layer is veiled. Stop the take to reveal the exact written landing and the smallest physical correction.</p></div> : <div className={styles.liveInstruction}><strong>{nextAttack ? `${nextAttack.midiNotes.length > 1 ? "Prepare the full vertical span" : "Orient the next finger"} before attacking.` : "The loop has no attack targets."}</strong><p>{nextAttack && previousNotes.length ? nextAttack.midiNotes.map((target) => { const from = [...previousNotes].sort((a, b) => Math.abs(target - a) - Math.abs(target - b))[0]; const distance = fingerDistance(from, target); return `${signed(distance.signedSemitones)} st / ${Math.round(distance.whiteKeyWidths * 10) / 10} key widths`; }).join(" · ") : "Use the staff and keyboard territory together; then look slightly ahead of the current landing."}</p></div>}
        {captureState === "review" && evaluation ? <div className={styles.relationshipEvidence} aria-label="Most recent directed interval evidence">
          <RelationshipEvidence label="Latest upper link" comparison={latestUpperRelationship} />
          <RelationshipEvidence label="Latest bass link" comparison={latestBassRelationship} />
        </div> : null}
        <details className={styles.reviewEvidence} open={captureState === "review"}>
          <summary><span>Deep evidence</span><strong>Right keys, note relationships, pulse, and release remain separate</strong></summary>
          <div className={styles.evidenceGroups} aria-label="Separate performance evidence">
          <EvidenceGroup eyebrow="Notes + chords" title="Did the written field arrive?" items={[
            { label: "Right keys", value: pitchMetric ? metricLabel(pitchMetric.accuracy, pitchMetric.compared) : "waiting", detail: "Exact MIDI set at each written landing" },
            { label: "Notes together", value: chordMetric ? metricLabel(chordMetric.accuracy, chordMetric.compared) : "waiting", detail: "Membership and duplicate key attacks" },
            { label: "Semitone spacing", value: chordSpacingMetric ? metricLabel(chordSpacingMetric.accuracy, chordSpacingMetric.compared) : "waiting", detail: "Adjacent gaps, kept separate from membership" },
            { label: "Marked roll direction", value: arpeggiationMetric ? metricLabel(arpeggiationMetric.accuracy, arpeggiationMetric.compared) : "waiting", detail: "Only fields explicitly marked arpeggiated" },
          ]} />
          <EvidenceGroup eyebrow="Motion" title="Did the relationships keep their shape?" items={[
            { label: "Top-note shape", value: contourMetric ? metricLabel(contourMetric.contourAccuracy, contourMetric.contourCompared) : "waiting", detail: "Rise, fall, or repeat in the highest-note envelope" },
            { label: "Top-note interval width", value: contourMetric ? metricLabel(contourMetric.intervalAccuracy, contourMetric.intervalCompared) : "waiting", detail: "Exact signed semitone links" },
            { label: "Bottom-note path", value: bassMetric ? metricLabel(bassMetric.intervalAccuracy, bassMetric.intervalCompared) : "waiting", detail: "Exact lowest-note semitone links" },
          ]} />
          <EvidenceGroup eyebrow="Time + journey" title="Did the landing and release boundaries align?" items={[
            { label: "Pulse proportions", value: timingMode === "self-paced" ? "not scored · self-paced" : visibleEvaluation ? metricLabel(visibleEvaluation.metrics.rhythm.accuracy, visibleEvaluation.metrics.rhythm.compared) : "waiting", detail: timingMode === "self-paced" ? "No clock judgment" : `Literal ${practiceTempo} BPM drill; qualitative rubato stays human` },
            { label: "Release lengths · key-up", value: timingMode === "self-paced" ? "not scored · self-paced" : visibleEvaluation ? metricLabel(visibleEvaluation.metrics.duration.accuracy, visibleEvaluation.metrics.duration.compared) : "waiting", detail: timingMode === "self-paced" ? "Written lengths remain visible but ungraded" : "Physical key-up time; expressive holds still need human judgment" },
          ]} />
          </div>
        </details>
      </section>
    </div>

    <details className={styles.truthDrawer}>
      <summary><span>Evidence limits</span><strong>What comes from the score, what MIDI measures, and what the coach only suggests</strong></summary>
      <footer className={styles.truthFooter}>
        <div><span>Score facts</span><strong>Spelling, staff, voice, duration, tie, meter, and encoded directions come from MusicXML.</strong></div>
        <div><span>Measured from MIDI</span><strong>Key number, landing time, physical key-up time, and near-simultaneous grouping enter this coach. Velocity and pedal state remain ungraded.</strong></div>
        <div><span>Teaching inference</span><strong>Reading chunks, fingering suggestions, collection fits, and key-width cues are hypotheses—not authored facts.</strong></div>
        <p>The HUD does not hear tone, pedaling acoustics, voicing balance, dynamics, rubato intention, emotion, or whether the performance is “good.” Notes count as together under the selected onset lens; a written arpeggiation can widen only its own field. This is a synchronized attack map rather than authoritative engraving: use the source page for rests, beams, clefs, layout, and editorial fingering. Staff 1 is treated as an upper-staff route and later staves as lower-staff routes; unusual or cross-staff writing needs human interpretation.</p>
      </footer>
    </details>
  </section>;
}
