"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import styles from "./PianoSightReadingHud.module.css";
import {
  PITCH_LETTERS,
  analyzeNotatedInterval,
  assignNotesToTargets,
  attacksShareChordWindow,
  displayedAccidentalsForMeasure,
  inferUniformTransposition,
  preferredAccidentalsForShape,
  preferredAccidentalsForTonic,
  spellShapeRelativePitch,
  spellMidiPitch,
  type Accidental,
  type NotatedPitch,
} from "@/lib/piano-sight-reading-model";
import { scaleSemitones, type PianoScale } from "@/lib/piano-model";

type SightEvent = {
  id: number;
  note: number;
  velocity: number;
  onsetMs: number;
  releaseMs: number | null;
  fieldNotes: number[];
};

type PianoSightReadingHudProps = {
  events: SightEvent[];
  activeNotes: number[];
  doMidi: number;
  scale: PianoScale;
  chordWindowMs: number;
  showConventions: boolean;
  frozen: boolean;
  onResumeCapture: () => void;
};

type Chapter = "understand" | "embody" | "integrate" | "mindset";
type PracticeMode = "exact" | "transfer";
type ChallengeMode = "open" | "fade" | "memory";
type Hand = "left" | "right";

type PatternFrame = {
  offsets: number[];
  beats: number;
  hands?: Hand[];
  articulation?: "connected" | "detached" | "accent";
};

type PatternGroup = {
  from: number;
  to: number;
  label: string;
};

type SightPattern = {
  id: string;
  chapter: Chapter;
  family: string;
  name: string;
  miniature: string;
  frames: PatternFrame[];
  groups: PatternGroup[];
  focus: string;
  eyes: string;
  hands: string;
  ears: string;
  idea: string;
  indication?: string;
  anchorOffset?: number;
  foldable?: boolean;
  coordination?: string;
};

const CHAPTERS: Array<{ id: Chapter; number: string; label: string; subtitle: string }> = [
  { id: "understand", number: "01", label: "Understand", subtitle: "intervals · lines · chords · fixed points" },
  { id: "embody", number: "02", label: "Embody", subtitle: "groups · pre-movement · coordination" },
  { id: "integrate", number: "03", label: "Integrate", subtitle: "indications · ideas · two words" },
  { id: "mindset", number: "04", label: "Practice", subtitle: "diagnose one relationship, then retry" },
];

const PATTERNS: SightPattern[] = [
  {
    id: "neighbor-return",
    chapter: "understand",
    family: "Interval atom",
    name: "Neighbor & return",
    miniature: "• ↗ • ↘ •",
    frames: [
      { offsets: [0], beats: 1 }, { offsets: [2], beats: 1 }, { offsets: [0], beats: 2 },
    ],
    groups: [{ from: 0, to: 2, label: "one turn" }],
    focus: "Read two directions around one remembered point—not three isolated notes.",
    eyes: "The middle note occupies the next staff position; the first and last coincide.",
    hands: "Let the first key remain your physical reference while one finger travels away and back.",
    ears: "Compare the outward whole step with its exact reversal.",
    idea: "leave · remember · return",
    anchorOffset: 0,
  },
  {
    id: "third-contrast",
    chapter: "understand",
    family: "Interval atom",
    name: "Two kinds of third",
    miniature: "3 st ⇄ 4 st",
    frames: [
      { offsets: [0], beats: 1 }, { offsets: [3], beats: 1 }, { offsets: [0], beats: 1 }, { offsets: [4], beats: 2 },
    ],
    groups: [{ from: 0, to: 1, label: "3 st" }, { from: 2, to: 3, label: "4 st" }],
    focus: "The staff shows two generic thirds. Accidentals decide whether the keyboard span is three or four semitones.",
    eyes: "Notice the same line-to-line or space-to-space geometry twice.",
    hands: "Hold the visual third-shape while comparing its compact and wider keyboard versions.",
    ears: "Hear the contrast before attaching major/minor or emotional labels.",
    idea: "same drawing · changed interior",
    anchorOffset: 0,
  },
  {
    id: "rising-line",
    chapter: "understand",
    family: "Melodic line",
    name: "Rising line",
    miniature: "╱ one destination",
    frames: [
      { offsets: [0], beats: 1 }, { offsets: [2], beats: 1 }, { offsets: [4], beats: 1 },
      { offsets: [5], beats: 1 }, { offsets: [7], beats: 2 },
    ],
    groups: [{ from: 0, to: 4, label: "continuous line" }],
    focus: "Compress a confirmed stepwise passage into starting point, direction, and destination.",
    eyes: "Track the uninterrupted slope; keep the final landing in peripheral awareness.",
    hands: "Prepare the hand’s destination while the middle notes pass beneath it.",
    ears: "Listen for continuous travel even though the semitone steps alternate 2–2–1–2.",
    idea: "gather toward the high point",
    indication: "cresc. →",
  },
  {
    id: "arch",
    chapter: "understand",
    family: "Melodic line",
    name: "Arch & reversal",
    miniature: "⌒ one turning point",
    frames: [
      { offsets: [0], beats: 1 }, { offsets: [2], beats: 1 }, { offsets: [4], beats: 1 },
      { offsets: [5], beats: 1 }, { offsets: [4], beats: 1 }, { offsets: [2], beats: 1 }, { offsets: [0], beats: 2 },
    ],
    groups: [{ from: 0, to: 3, label: "rise" }, { from: 3, to: 6, label: "fall" }],
    focus: "Read the turning point first; the two slopes become one arch.",
    eyes: "Find the peak before decoding the interior notes.",
    hands: "Approach the peak with enough freedom to reverse direction without a reset.",
    ears: "Hear whether the descent answers, repeats, or releases the ascent.",
    idea: "grow · turn · settle",
    indication: "<  >",
  },
  {
    id: "triad-stack",
    chapter: "understand",
    family: "Chord silhouette",
    name: "Stacked-third chord",
    miniature: "●\n●  4+3\n●",
    frames: [{ offsets: [0, 4, 7], beats: 2, hands: ["right", "right", "right"] }],
    groups: [{ from: 0, to: 0, label: "one vertical object" }],
    focus: "Read the outer silhouette, then the adjacent 4 + 3 semitone fingerprint.",
    eyes: "Three alternating line/space positions form the familiar stacked-third snowman.",
    hands: "Prepare the complete span before attacking; order inside the chord is not the musical identity.",
    ears: "Listen to all three pairwise relationships, not only the root-to-top span.",
    idea: "gather into one sonority",
  },
  {
    id: "first-inversion",
    chapter: "understand",
    family: "Inversion",
    name: "Inversion wedge",
    miniature: "3 + 5 · root above bass",
    frames: [{ offsets: [0, 3, 8], beats: 2, hands: ["right", "right", "right"] }],
    groups: [{ from: 0, to: 0, label: "bass changes the silhouette" }],
    focus: "A fourth inside a triad is a fast visual clue that the chord has been inverted.",
    eyes: "Read the compact third below and wider fourth above as a single wedge.",
    hands: "Feel the uneven 3 + 5 spacing rather than reconstructing a root-position label first.",
    ears: "Hear how the lower third and upper fourth redistribute weight when the chord root is not the bass.",
    idea: "root displaced · weight redistributed",
  },
  {
    id: "folded-arpeggio",
    chapter: "understand",
    family: "Arpeggio",
    name: "Fold the arpeggio",
    miniature: "•  •  •  ↦  chord",
    frames: [
      { offsets: [0], beats: 1, articulation: "connected" },
      { offsets: [4], beats: 1, articulation: "connected" },
      { offsets: [7], beats: 1, articulation: "connected" },
      { offsets: [12], beats: 2, articulation: "connected" },
    ],
    groups: [{ from: 0, to: 3, label: "one chord unfolded through time" }],
    focus: "Mentally compress the broken notes into their simultaneous chord family.",
    eyes: "See the regular skips before reading four separate note identities.",
    hands: "Move through one expanding territory; prepare the octave before the final crossing.",
    ears: "Hold the earlier notes in memory so the latent chord remains audible.",
    idea: "unfold · widen · arrive",
    foldable: true,
    indication: "legato",
  },
  {
    id: "pedal-orbit",
    chapter: "understand",
    family: "Fixed point",
    name: "Pedal-point orbit",
    miniature: "anchor — motion — anchor",
    frames: [
      { offsets: [0], beats: 1 }, { offsets: [7], beats: 1 }, { offsets: [0], beats: 1 },
      { offsets: [5], beats: 1 }, { offsets: [0], beats: 2 },
    ],
    groups: [{ from: 0, to: 4, label: "motion around a fixed point" }],
    focus: "Pin the repeated note and spend attention on the changing distances around it.",
    eyes: "A horizontal return-line reveals what stays invariant.",
    hands: "Keep the anchor geographically stable while the other finger prepares two destinations.",
    ears: "Notice how an unchanged pitch acquires a different relationship each time.",
    idea: "pillar · orbit · pillar",
    anchorOffset: 0,
  },
  {
    id: "transposed-cell",
    chapter: "understand",
    family: "Transform",
    name: "Sequence transformation",
    miniature: "⌁ → ⌁ +2",
    frames: [
      { offsets: [0], beats: 1 }, { offsets: [2], beats: 1 }, { offsets: [4], beats: 1 },
      { offsets: [2], beats: 1 }, { offsets: [4], beats: 1 }, { offsets: [6], beats: 2 },
    ],
    groups: [{ from: 0, to: 2, label: "cell A" }, { from: 3, to: 5, label: "A shifted +2" }],
    focus: "Read the second cell as a transformation of the first, then inspect only what moved.",
    eyes: "Match the contour before checking the new starting position.",
    hands: "Carry one compact gesture to a nearby anchor without rebuilding it note by note.",
    ears: "Hear sameness of relationship alongside change of pitch level.",
    idea: "repeat · lift · continue",
  },
  {
    id: "grouped-run",
    chapter: "embody",
    family: "Groups",
    name: "Seven as 3 + 4",
    miniature: "[•••] [••••]",
    frames: [
      { offsets: [0], beats: .5 }, { offsets: [2], beats: .5 }, { offsets: [4], beats: 1 },
      { offsets: [5], beats: .5 }, { offsets: [7], beats: .5 }, { offsets: [9], beats: .5 }, { offsets: [7], beats: 1.5 },
    ],
    groups: [{ from: 0, to: 2, label: "3-note thought" }, { from: 3, to: 6, label: "4-note answer" }],
    focus: "Replace a seven-note queue with two graspable gestures.",
    eyes: "Jump your attention to the second bracket before the first group finishes.",
    hands: "Prepare one group as a territory, then release into the next territory.",
    ears: "Listen for the seam between 3 and 4 without inserting an unwanted pause.",
    idea: "gather three · answer in four",
  },
  {
    id: "destination-leap",
    chapter: "embody",
    family: "Pre-movement",
    name: "Prepare the landing",
    miniature: "•• ⇢ magnet",
    frames: [
      { offsets: [0], beats: 1 }, { offsets: [2], beats: 1 }, { offsets: [9], beats: 2, articulation: "accent" },
    ],
    groups: [{ from: 0, to: 1, label: "departure" }, { from: 2, to: 2, label: "prepared landing" }],
    focus: "See the distant destination before your hand has finished the departure group.",
    eyes: "The large exceptional leap deserves attention; the two close notes do not deserve equal decoding time.",
    hands: "Begin orienting toward the destination early without shortening the preceding note.",
    ears: "Hear the leap as one directed span rather than a surprise after the fact.",
    idea: "speak · release · arrive",
    indication: "accent the arrival",
  },
  {
    id: "expand-contract",
    chapter: "embody",
    family: "Movement",
    name: "Expand & contract",
    miniature: "< hand span >",
    frames: [
      { offsets: [0], beats: 1 }, { offsets: [3], beats: 1 }, { offsets: [7], beats: 1 },
      { offsets: [12], beats: 1 }, { offsets: [7], beats: 1 }, { offsets: [3], beats: 1 }, { offsets: [0], beats: 2 },
    ],
    groups: [{ from: 0, to: 3, label: "expand" }, { from: 3, to: 6, label: "contract" }],
    focus: "The hand-span envelope is the pattern; each interior key is a waypoint.",
    eyes: "Read increasing and decreasing spacing around the octave peak.",
    hands: "Let the whole hand reorganize gradually instead of lunging finger by finger.",
    ears: "Compare widening register with the return toward fusion.",
    idea: "open fully · gather home",
    foldable: true,
  },
  {
    id: "contrary-hands",
    chapter: "embody",
    family: "Coordination",
    name: "Contrary mirrors",
    miniature: "L ↙  ·  ↗ R",
    frames: [
      { offsets: [-12, 0], beats: 1, hands: ["left", "right"] },
      { offsets: [-14, 2], beats: 1, hands: ["left", "right"] },
      { offsets: [-16, 4], beats: 1, hands: ["left", "right"] },
      { offsets: [-17, 5], beats: 2, hands: ["left", "right"] },
    ],
    groups: [{ from: 0, to: 3, label: "two lines · one pulse" }],
    focus: "Read two opposing contours tied together by shared onsets.",
    eyes: "Follow the widening outer silhouette before naming either inner line.",
    hands: "Prepare both destinations as one expanding gesture; neither hand waits for the other.",
    ears: "Hear contrary direction while preserving the vertical relationship at each landing.",
    idea: "one center · opening outward",
    coordination: "contrary motion · shared attacks",
  },
  {
    id: "melody-pillar",
    chapter: "embody",
    family: "Coordination",
    name: "Pillar + melody",
    miniature: "L —  ·  R ⌒",
    frames: [
      { offsets: [-12, 0], beats: 1, hands: ["left", "right"] },
      { offsets: [-12, 2], beats: 1, hands: ["left", "right"] },
      { offsets: [-12, 4], beats: 1, hands: ["left", "right"] },
      { offsets: [-12, 2], beats: 1, hands: ["left", "right"] },
      { offsets: [-12, 0], beats: 2, hands: ["left", "right"] },
    ],
    groups: [{ from: 0, to: 4, label: "fixed bass · moving upper voice" }],
    focus: "Separate role from event count: one hand anchors while the other shapes a line.",
    eyes: "Pin the horizontal bass and spend visual attention on the upper contour.",
    hands: "Keep the left-hand geography quiet while the right hand completes the arch.",
    ears: "Listen to the changing interval above an unchanged bass.",
    idea: "grounded beneath · singing above",
    anchorOffset: -12,
    coordination: "fixed left hand · shaped right hand",
  },
  {
    id: "question-answer",
    chapter: "integrate",
    family: "Musical idea",
    name: "Question & answer",
    miniature: "↗ ?   ↘ .",
    frames: [
      { offsets: [0], beats: 1, articulation: "connected" }, { offsets: [2], beats: 1, articulation: "connected" },
      { offsets: [5], beats: 2 }, { offsets: [4], beats: 1, articulation: "connected" },
      { offsets: [2], beats: 1, articulation: "connected" }, { offsets: [0], beats: 2 },
    ],
    groups: [{ from: 0, to: 2, label: "question" }, { from: 3, to: 5, label: "answer" }],
    focus: "Indications and grouping turn accurate pitches into a comprehensible exchange.",
    eyes: "See two phrases and their punctuation before reading six attacks.",
    hands: "Let the first release create room; begin the answer as a new gesture.",
    ears: "Ask whether the second group completes, contradicts, or merely echoes the first.",
    idea: "ask openly · answer simply",
    indication: "legato · phrase lift · diminuendo",
  },
  {
    id: "repeat-intensify",
    chapter: "integrate",
    family: "Indications",
    name: "Repeat, then intensify",
    miniature: "A  →  A′",
    frames: [
      { offsets: [0], beats: 1 }, { offsets: [3], beats: 1 }, { offsets: [5], beats: 2 },
      { offsets: [0], beats: .75, articulation: "accent" }, { offsets: [3], beats: .75 }, { offsets: [7], beats: 3, articulation: "accent" },
    ],
    groups: [{ from: 0, to: 2, label: "statement" }, { from: 3, to: 5, label: "changed return" }],
    focus: "Similarity makes the changed ending and altered energy perceptually important.",
    eyes: "Overlay the two cells; attend to the final note and rhythmic expansion.",
    hands: "Reuse the first gesture while preparing the wider second landing.",
    ears: "Decide whether the changed ending intensifies, opens, or destabilizes the return.",
    idea: "state · repeat with consequence",
    indication: "p  <  mf",
  },
  {
    id: "breath-and-release",
    chapter: "integrate",
    family: "Indications",
    name: "Breath & release",
    miniature: "slur  ·  lift  ·  answer",
    frames: [
      { offsets: [0], beats: 1, articulation: "connected" }, { offsets: [4], beats: 1, articulation: "connected" },
      { offsets: [7], beats: 2, articulation: "detached" }, { offsets: [5], beats: 1, articulation: "connected" },
      { offsets: [2], beats: 1, articulation: "connected" }, { offsets: [0], beats: 3 },
    ],
    groups: [{ from: 0, to: 2, label: "breathe here" }, { from: 3, to: 5, label: "long release" }],
    focus: "Duration, articulation, and silence are part of the pattern—not decoration added after pitch accuracy.",
    eyes: "Read the slur ending and longer values as structural landmarks.",
    hands: "Release the first group without collapsing the pulse; prepare the answer during the breath.",
    ears: "Listen for separation of ideas rather than a mechanical gap.",
    idea: "suspend · breathe · let go",
    indication: "slur · lift · rit. into final note",
  },
  {
    id: "diagnostic-cell",
    chapter: "mindset",
    family: "Relational retry",
    name: "Preserve one relation",
    miniature: "see → play → compare → retry",
    frames: [
      { offsets: [0], beats: 1 }, { offsets: [2], beats: 1 }, { offsets: [7], beats: 1 }, { offsets: [5], beats: 1 }, { offsets: [0], beats: 2 },
    ],
    groups: [{ from: 0, to: 1, label: "close departure" }, { from: 2, to: 4, label: "wide return" }],
    focus: "A useful attempt preserves some relationships and misses others. Diagnose the smallest consequential difference.",
    eyes: "Preview the two close notes, the exceptional leap, and the final return.",
    hands: "Name one physical destination before playing; change only that preparation on the retry.",
    ears: "Listen for contour, exact span, and landing as separate achievements.",
    idea: "notice precisely · change one thing",
  },
];

// These syllables follow the written interval shapes used by this reader:
// lowered 2/3/6/7 are Ra/Me/Le/Te, while the raised fourth is Fi.
const SHAPE_SOLFEGE = ["Do", "Ra", "Re", "Me", "Mi", "Fa", "Fi", "Sol", "Le", "La", "Te", "Ti"];
const WHITE_PITCH_CLASSES = new Set([0, 2, 4, 5, 7, 9, 11]);
const INTERVAL_COLORS = [
  "#8ea1b5", "#ee6d92", "#ef9a5b", "#e9c46a", "#9fd36c", "#56c6a9", "#48b9cf",
  "#5f9ff0", "#8f87ef", "#b978e2", "#dd71bd", "#ef7390", "#d9b96e",
];

function cx(...names: Array<string | false | null | undefined>) {
  return names.filter(Boolean).join(" ");
}

function pitchClass(note: number) {
  return ((note % 12) + 12) % 12;
}

function pitchLabel(note: number, doMidi: number, showConventions: boolean, prefer = preferredAccidentalsForTonic(doMidi)) {
  const relative = ((note - doMidi) % 12 + 12) % 12;
  if (!showConventions) return SHAPE_SOLFEGE[relative];
  if (!Number.isInteger(note) || note < 0 || note > 127) return "outside MIDI range";
  return spellMidiPitch(note, {
    clef: note < 60 ? "bass" : "treble",
    prefer,
  }).label;
}

function pitchClassLabel(note: number, prefer: "sharps" | "flats") {
  if (!Number.isInteger(note) || note < 0 || note > 127) return "out";
  const notation = spellMidiPitch(note, { prefer });
  const symbol = notation.accidental === "natural" ? "" : accidentalGlyph(notation.accidental);
  return `${notation.letter}${symbol ?? ""}`;
}

function signed(value: number) {
  if (value > 0) return `+${value}`;
  return String(value);
}

function pluralSemitones(value: number) {
  return `${Math.abs(value)} semitone${Math.abs(value) === 1 ? "" : "s"}`;
}

function ordinal(value: number) {
  const ending = value % 10 === 1 && value % 100 !== 11 ? "st" : value % 10 === 2 && value % 100 !== 12 ? "nd" : value % 10 === 3 && value % 100 !== 13 ? "rd" : "th";
  return `${value}${ending}`;
}

function notatePatternPitch(anchorMidi: number, semitoneOffset: number, prefer = preferredAccidentalsForTonic(anchorMidi)): NotatedPitch {
  return spellShapeRelativePitch(anchorMidi, Math.round(semitoneOffset), prefer);
}

function diatonicIndex(pitch: NotatedPitch) {
  return pitch.octave * 7 + PITCH_LETTERS.indexOf(pitch.letter);
}

function genericIntervalFromOffsets(firstOffset: number, secondOffset: number, anchorMidi: number, prefer: "sharps" | "flats") {
  return analyzeNotatedInterval(
    notatePatternPitch(anchorMidi, firstOffset, prefer),
    notatePatternPitch(anchorMidi, secondOffset, prefer),
  ).genericNumber;
}

function staffY(pitch: NotatedPitch) {
  return 144 - (diatonicIndex(pitch) - 30) * 7;
}

function ledgerLines(pitch: NotatedPitch) {
  const y = staffY(pitch);
  const lines: number[] = [];
  if (y <= 74) for (let line = 74; line >= y; line -= 14) lines.push(line);
  if (y >= 158 && y <= 158) lines.push(158);
  if (y >= 242) for (let line = 242; line <= y; line += 14) lines.push(line);
  return lines;
}

function accidentalGlyph(accidental: Accidental) {
  if (accidental === "flat") return "♭";
  if (accidental === "sharp") return "♯";
  if (accidental === "natural") return "♮";
  if (accidental === "double-flat") return "𝄫";
  if (accidental === "double-sharp") return "𝄪";
  return null;
}

function frameStarts(pattern: SightPattern) {
  let beat = 0;
  return pattern.frames.map((frame) => {
    const start = beat;
    beat += frame.beats;
    return start;
  });
}

function connectedRuns(pattern: SightPattern) {
  const runs: Array<{ from: number; to: number }> = [];
  let start: number | null = null;
  pattern.frames.forEach((frame, index) => {
    if (frame.articulation === "connected") {
      if (start == null) start = index;
      return;
    }
    if (start != null && index - start >= 2) runs.push({ from: start, to: index - 1 });
    start = null;
  });
  if (start != null && pattern.frames.length - start >= 2) runs.push({ from: start, to: pattern.frames.length - 1 });
  return runs;
}

function flattenPattern(pattern: SightPattern, anchor: number, prefer: "sharps" | "flats") {
  return pattern.frames.flatMap((frame, frameIndex) => frame.offsets.map((offset, noteIndex) => ({
    frameIndex,
    noteIndex,
    note: anchor + offset,
    offset,
    notation: notatePatternPitch(anchor, offset, prefer),
    hand: frame.hands?.[noteIndex] ?? (offset < 0 ? "left" : "right"),
  })));
}

function splitAttempt(events: SightEvent[], pattern: SightPattern) {
  const groups: SightEvent[][] = [];
  let cursor = 0;
  for (const frame of pattern.frames) {
    groups.push(events.slice(cursor, cursor + frame.offsets.length));
    cursor += frame.offsets.length;
  }
  return groups;
}

function sorted(values: number[]) {
  return [...values].sort((first, second) => first - second);
}

function sameNumbers(first: number[], second: number[]) {
  return first.length === second.length && first.every((value, index) => value === second[index]);
}

function colorForInterval(distance: number) {
  const index = Math.abs(distance) === 0 ? 0 : ((Math.abs(distance) - 1) % 12) + 1;
  return INTERVAL_COLORS[index];
}

function feelingForInterval(distance: number) {
  const absolute = Math.abs(distance);
  if (absolute === 0) return "repeat · renewed attention";
  if (absolute <= 2) return "neighbor · close continuation";
  if (absolute <= 4) return "turn · compact color";
  if (absolute <= 7) return "reach · open hand-space";
  if (absolute < 12) return "vault · exposed distance";
  return "register echo · expanded identity";
}

type MotionLane = {
  id: "gesture" | Hand;
  label: string;
  centers: number[];
  moves: number[];
};

function offsetsForMotionLane(frame: PatternFrame, lane: MotionLane["id"]) {
  if (lane === "gesture") return frame.offsets;
  return frame.offsets.filter((_, index) => frame.hands?.[index] === lane);
}

function patternMotionLanes(pattern: SightPattern): MotionLane[] {
  const hasIndependentHands = pattern.frames.some((frame) => frame.hands?.includes("left") && frame.hands.includes("right"));
  const laneSpecs: Array<{ id: MotionLane["id"]; label: string }> = hasIndependentHands
    ? [{ id: "left", label: "L" }, { id: "right", label: "R" }]
    : [{ id: "gesture", label: "gesture" }];
  return laneSpecs.map((lane) => {
    const centers = pattern.frames.map((frame) => median(offsetsForMotionLane(frame, lane.id)));
    return {
      ...lane,
      centers,
      moves: centers.slice(1).map((center, index) => center - centers[index]),
    };
  });
}

function motionLaneY(frame: PatternFrame, lane: MotionLane["id"], anchorMidi: number, prefer: "sharps" | "flats") {
  const offsets = offsetsForMotionLane(frame, lane);
  const positions = offsets.map((offset) => staffY(notatePatternPitch(anchorMidi, offset, prefer)));
  return positions.reduce((sum, value) => sum + value, 0) / Math.max(1, positions.length);
}

function adjacentGaps(notes: number[]) {
  const ordered = sorted(notes);
  return ordered.slice(1).map((note, index) => note - ordered[index]);
}

function median(values: number[]) {
  if (!values.length) return 0;
  const ordered = sorted(values);
  const middle = Math.floor(ordered.length / 2);
  return ordered.length % 2 ? ordered[middle] : (ordered[middle - 1] + ordered[middle]) / 2;
}

function eventFrameX(frameIndex: number, pattern: SightPattern) {
  const starts = frameStarts(pattern);
  const totalBeats = pattern.frames.reduce((sum, frame) => sum + frame.beats, 0);
  const beat = starts[frameIndex] + .18;
  return 112 + (beat / Math.max(totalBeats, 1)) * 900;
}

function noteHead(frame: PatternFrame) {
  return frame.beats >= 2 ? "open" : "filled";
}

function noteNeedsFlag(frame: PatternFrame) {
  return frame.beats < 1;
}

function noteNeedsDot(frame: PatternFrame) {
  return frame.beats === .75 || frame.beats === 1.5 || frame.beats === 3;
}

function keyboardWindow(notes: number[]) {
  const minimum = Math.min(...notes, 48);
  const maximum = Math.max(...notes, 72);
  let low = Math.max(21, minimum - 2);
  let high = Math.min(108, maximum + 2);
  while (!WHITE_PITCH_CLASSES.has(pitchClass(low))) low -= 1;
  while (!WHITE_PITCH_CLASSES.has(pitchClass(high))) high += 1;
  if (high - low < 16) {
    low = Math.max(21, low - Math.ceil((16 - (high - low)) / 2));
    high = Math.min(108, high + Math.floor((16 - (high - low)) / 2));
  }
  return { low, high };
}

function registerFitsScore(doMidi: number, shift: number, pattern: SightPattern) {
  try {
    const offsets = pattern.frames.flatMap((frame) => frame.offsets);
    const prefer = preferredAccidentalsForShape(doMidi + shift, offsets);
    return offsets.every((offset) => {
      const y = staffY(notatePatternPitch(doMidi + shift, offset, prefer));
      return y >= 60 && y <= 246;
    });
  } catch {
    return false;
  }
}

function patternChapterCopy(chapter: Chapter) {
  if (chapter === "understand") return "Reduce detail into intervals, contour, chord silhouette, transformation, and fixed points.";
  if (chapter === "embody") return "Turn visual groups into prepared territories, continuous movement, and coordinated hands.";
  if (chapter === "integrate") return "Join pitch and rhythm to indications, phrase intention, and your own listening language.";
  return "Preserve what worked, identify the smallest consequential difference, and retry one change.";
}

export function PianoSightReadingHud({ events, activeNotes, doMidi, scale, chordWindowMs, showConventions, frozen, onResumeCapture }: PianoSightReadingHudProps) {
  const [chapter, setChapter] = useState<Chapter>("understand");
  const [patternId, setPatternId] = useState("neighbor-return");
  const [practiceMode, setPracticeMode] = useState<PracticeMode>("exact");
  const [challengeMode, setChallengeMode] = useState<ChallengeMode>("open");
  const [support, setSupport] = useState(3);
  const [registerShift, setRegisterShift] = useState(0);
  const [foldArpeggio, setFoldArpeggio] = useState(true);
  const [attemptAfterId, setAttemptAfterId] = useState(() => events.at(-1)?.id ?? -1);
  const [writtenFrame, setWrittenFrame] = useState(() => ({ doMidi, scale }));
  const [scoreRevealed, setScoreRevealed] = useState(true);
  const [intention, setIntention] = useState("follow the written idea");
  const [wordOne, setWordOne] = useState("");
  const [wordTwo, setWordTwo] = useState("");
  const scoreViewportRef = useRef<HTMLDivElement>(null);
  const keyboardViewportRef = useRef<HTMLDivElement>(null);

  const pattern = PATTERNS.find((candidate) => candidate.id === patternId) ?? PATTERNS[0];
  const patternsForChapter = PATTERNS.filter((candidate) => candidate.chapter === chapter);
  const motionLanes = useMemo(() => patternMotionLanes(pattern), [pattern]);
  const slurRuns = useMemo(() => connectedRuns(pattern), [pattern]);
  const anchor = writtenFrame.doMidi + registerShift;
  const notationPreference = useMemo(
    () => preferredAccidentalsForShape(anchor, pattern.frames.flatMap((frame) => frame.offsets)),
    [anchor, pattern],
  );
  const targetNotes = useMemo(() => flattenPattern(pattern, anchor, notationPreference), [anchor, notationPreference, pattern]);
  const displayedAccidentals = useMemo(
    () => displayedAccidentalsForMeasure(targetNotes.map((target) => target.notation)),
    [targetNotes],
  );
  const selectedRoute = useMemo(() => new Set(scaleSemitones(writtenFrame.scale)), [writtenFrame.scale]);
  const targetRouteOffsets = [...new Set(targetNotes.map((target) => ((target.note - writtenFrame.doMidi) % 12 + 12) % 12))];
  const routeMemberCount = targetRouteOffsets.filter((offset) => selectedRoute.has(offset)).length;
  const targetPitchClassCount = new Set(targetNotes.map((target) => pitchClass(target.note))).size;
  const routeOutsideCount = targetPitchClassCount - routeMemberCount;
  const outsideRouteLabels = [...new Set(targetNotes.flatMap((target) => {
    const offset = ((target.note - writtenFrame.doMidi) % 12 + 12) % 12;
    return selectedRoute.has(offset) ? [] : [target.notation.label];
  }))];
  const liveFrameChanged = writtenFrame.doMidi !== doMidi || writtenFrame.scale.id !== scale.id;
  const expectedAttackCount = targetNotes.length;
  const attemptEvents = useMemo(
    () => events.filter((event) => event.id > attemptAfterId).slice(0, expectedAttackCount),
    [attemptAfterId, events, expectedAttackCount],
  );
  const attemptFrames = useMemo(() => splitAttempt(attemptEvents, pattern), [attemptEvents, pattern]);
  const attemptComplete = attemptEvents.length === expectedAttackCount;
  const firstAttemptFrame = attemptFrames[0] ?? [];
  const firstTargetFrame = pattern.frames[0].offsets.map((offset) => anchor + offset);
  const transferShift = practiceMode === "transfer" && firstAttemptFrame.length
    ? (() => {
      if (firstTargetFrame.length === 1) return firstAttemptFrame[0].note - firstTargetFrame[0];
      if (firstAttemptFrame.length !== firstTargetFrame.length) return 0;
      return inferUniformTransposition(firstTargetFrame, firstAttemptFrame.map((event) => event.note)) ?? 0;
    })()
    : 0;
  const shownAttemptNotes = attemptEvents.map((event) => event.note - transferShift);
  const physicalDo = writtenFrame.doMidi + transferShift;
  const physicalShapeOffsets = pattern.frames.flatMap((frame) => frame.offsets);
  const physicalNotationPreference = physicalShapeOffsets.every((offset) => physicalDo + offset >= 0 && physicalDo + offset <= 127)
    ? preferredAccidentalsForShape(physicalDo, physicalShapeOffsets)
    : notationPreference;
  const frameTargetStartIndices = useMemo(() => {
    return pattern.frames.map((_, frameIndex) => pattern.frames
      .slice(0, frameIndex)
      .reduce((start, frame) => start + frame.offsets.length, 0));
  }, [pattern]);
  const attemptTargetIndices = useMemo(() => pattern.frames.flatMap((frame, frameIndex) => {
    const start = frameTargetStartIndices[frameIndex];
    const candidates = targetNotes.slice(start, start + frame.offsets.length).map((target, localIndex) => ({
      globalIndex: start + localIndex,
      note: target.note,
    }));
    const actual = (attemptFrames[frameIndex] ?? []).map((event) => event.note - transferShift);
    return assignNotesToTargets(actual, candidates.map((candidate) => candidate.note)).map((localIndex) => candidates[localIndex].globalIndex);
  }), [attemptFrames, frameTargetStartIndices, pattern, targetNotes, transferShift]);
  const currentFrameIndex = pattern.frames.findIndex((frame, index) => (attemptFrames[index]?.length ?? 0) < frame.offsets.length);
  const nextFlatTargets = currentFrameIndex < 0 ? [] : (() => {
    const start = frameTargetStartIndices[currentFrameIndex];
    const frameTargets = targetNotes.slice(start, start + pattern.frames[currentFrameIndex].offsets.length);
    const assigned = new Set(attemptTargetIndices.slice(start, start + (attemptFrames[currentFrameIndex]?.length ?? 0)));
    return frameTargets.filter((_, localIndex) => !assigned.has(start + localIndex));
  })();
  const nextPhysicalTargets = nextFlatTargets.map((target) => target.note + transferShift);
  const scoreVeiled = !scoreRevealed || (challengeMode === "fade" && attemptEvents.length > 0);
  const targetFrameStarts = useMemo(() => frameStarts(pattern), [pattern]);

  const evaluation = useMemo(() => {
    const frameResults = pattern.frames.map((frame, index) => {
      const target = sorted(frame.offsets.map((offset) => anchor + offset + transferShift));
      const actual = sorted((attemptFrames[index] ?? []).map((event) => event.note));
      const complete = actual.length === target.length;
      const correct = complete && sameNumbers(target, actual);
      const grouped = attacksShareChordWindow(
        (attemptFrames[index] ?? []).map((event) => event.onsetMs),
        chordWindowMs,
        chordWindowMs * 2,
      );
      return { target, actual, complete, correct, grouped };
    });
    const pitchHits = frameResults.reduce((count, frame) => {
      const remaining = [...frame.target];
      const hits = frame.actual.reduce((inner, note) => {
        const match = remaining.indexOf(note);
        if (match < 0) return inner;
        remaining.splice(match, 1);
        return inner + 1;
      }, 0);
      return count + hits;
    }, 0);
    const actualByTargetIndex = new Map<number, number>();
    attemptEvents.forEach((event, index) => actualByTargetIndex.set(attemptTargetIndices[index], event.note - transferShift));
    const directionComparisons = motionLanes.flatMap((lane) => lane.moves.flatMap((targetMove, transitionIndex) => {
      const frameActualCenter = (frameIndex: number) => {
        const frame = pattern.frames[frameIndex];
        const start = frameTargetStartIndices[frameIndex];
        const localIndices = frame.offsets.flatMap((_, localIndex) => (
          lane.id === "gesture" || frame.hands?.[localIndex] === lane.id ? [localIndex] : []
        ));
        const values = localIndices.flatMap((localIndex) => {
          const actual = actualByTargetIndex.get(start + localIndex);
          return actual == null ? [] : [actual];
        });
        return values.length === localIndices.length ? median(values) : null;
      };
      const from = frameActualCenter(transitionIndex);
      const to = frameActualCenter(transitionIndex + 1);
      return from == null || to == null ? [] : [{ target: Math.sign(targetMove), actual: Math.sign(to - from) }];
    }));
    const comparedDirections = directionComparisons.length;
    const directionHits = directionComparisons.filter((comparison) => comparison.actual === comparison.target).length;
    const chordFrames = frameResults.filter((_, index) => pattern.frames[index].offsets.length > 1);
    const chordGroupingHits = chordFrames.filter((frame) => frame.complete && frame.grouped).length;
    const actualOnsets = attemptFrames.filter((frame) => frame.length).map((frame) => frame[0].onsetMs);
    const actualGaps = actualOnsets.slice(1).map((value, index) => value - actualOnsets[index]);
    const targetGaps = targetFrameStarts.slice(1).map((value, index) => value - targetFrameStarts[index]);
    let pulseFit: number | null = null;
    if (actualGaps.length >= 2) {
      const millisecondsPerBeat = median(actualGaps.map((gap, index) => gap / Math.max(targetGaps[index], .25)));
      const errors = actualGaps.map((gap, index) => Math.abs(gap - targetGaps[index] * millisecondsPerBeat) / Math.max(millisecondsPerBeat, 1));
      pulseFit = Math.max(0, 1 - errors.reduce((sum, value) => sum + value, 0) / errors.length);
    }
    return {
      frameResults,
      pitchHits,
      pitchFit: expectedAttackCount ? pitchHits / expectedAttackCount : 0,
      directionHits,
      directionComparisonCount: comparedDirections,
      targetDirectionCount: motionLanes.reduce((count, lane) => count + lane.moves.length, 0),
      directionFit: comparedDirections ? directionHits / comparedDirections : null,
      chordGroupingHits,
      chordFrameCount: chordFrames.length,
      pulseFit,
      allCorrect: attemptComplete && frameResults.every((frame) => frame.correct),
    };
  }, [anchor, attemptComplete, attemptEvents, attemptFrames, attemptTargetIndices, chordWindowMs, expectedAttackCount, frameTargetStartIndices, motionLanes, pattern, targetFrameStarts, transferShift]);

  const diagnosis = (() => {
    if (!attemptEvents.length) return {
      title: "Read the whole gesture before launching it.",
      body: pattern.focus,
      next: pattern.frames.length > 1 ? `Prepare frame 1, then let your attention move toward frame 2 before the first sound ends.` : "Prepare the entire vertical spacing before any key goes down.",
    };
    if (!attemptComplete) {
      const priorActual = attemptEvents.at(-1)!.note;
      if (practiceMode === "transfer" && pattern.frames[0].offsets.length > 1 && firstAttemptFrame.length < pattern.frames[0].offsets.length) return {
        title: `${firstAttemptFrame.length} of ${pattern.frames[0].offsets.length} opening chord tones received.`,
        body: "Complete the opening vertical shape in any attack order. Its sorted spacing—not the first MIDI packet—will establish the transfer anchor.",
        next: "Prepare the whole sonority and gather its remaining keys inside the selected chord window.",
      };
      if (nextPhysicalTargets.length > 1) return {
        title: `${attemptEvents.length} of ${expectedAttackCount} attacks placed. Complete one vertical object.`,
        body: `${nextPhysicalTargets.length} chord members remain in this frame; their internal attack order does not matter.`,
        next: "Prepare the outside span, then gather every remaining member before moving to the next frame.",
      };
      const expectedPhysicalNote = nextPhysicalTargets[0];
      return {
        title: `${attemptEvents.length} of ${expectedAttackCount} attacks placed. Keep the phrase alive.`,
        body: expectedPhysicalNote == null
          ? "The current frame is complete; prepare the next written object."
          : `The next destination is ${signed(expectedPhysicalNote - priorActual)} semitones from your latest key. That is a preparation cue, not a command to hurry.`,
        next: "Let the hand orient early while the written duration continues.",
      };
    }
    if (evaluation.allCorrect && evaluation.chordFrameCount && evaluation.chordGroupingHits < evaluation.chordFrameCount) {
      return {
        title: "The pitches fit; simultaneity changed the object.",
        body: `${evaluation.pitchHits}/${expectedAttackCount} target positions matched, but one intended vertical group exceeded an adjacent gap of ${chordWindowMs} ms or the shared ${chordWindowMs * 2} ms maximum span.`,
        next: "Prepare the complete outer span first, then let the interior keys arrive inside the same window.",
      };
    }
    if (evaluation.allCorrect && evaluation.pulseFit != null && evaluation.pulseFit < .72) {
      return {
        title: "The pitch shape landed; the onset proportions changed.",
        body: `${evaluation.pitchHits}/${expectedAttackCount} positions matched, while the tempo-adaptive pulse-shape fit was ${Math.round(evaluation.pulseFit * 100)}%.`,
        next: "Keep the same pitches and retry the long-versus-short relationships before fading any support.",
      };
    }
    if (evaluation.allCorrect) {
      const groupingCopy = evaluation.chordFrameCount
        ? ` The chord attacks also gathered inside the selected ${chordWindowMs} ms reading window.`
        : "";
      return {
        title: practiceMode === "transfer" && transferShift !== 0 ? "The relationship survived from a new anchor." : "The written pitch shape landed intact.",
        body: `${evaluation.pitchHits}/${expectedAttackCount} target positions matched.${groupingCopy}`,
        next: support > 0 ? "Fade one layer of help and preserve the same relationship." : "Move the pattern to another register, then listen for what stays recognizable.",
      };
    }
    const firstWrongFrame = evaluation.frameResults.findIndex((frame) => frame.complete && !frame.correct);
    const wrong = evaluation.frameResults[firstWrongFrame];
    const differences = wrong ? wrong.actual.map((actual, index) => actual - (wrong.target[index] ?? actual)) : [];
    const difference = differences.find((candidate) => candidate !== 0) ?? null;
    if ((evaluation.directionFit ?? 0) >= .75 && evaluation.pitchFit < 1) return {
      title: "The contour survived; an exact span changed.",
      body: difference == null ? "Direction was mostly preserved, but at least one destination had a different semitone width." : `At frame ${firstWrongFrame + 1}, the performed landing was ${pluralSemitones(difference)} ${difference > 0 ? "higher" : "lower"} than the target after alignment.`,
      next: `Retry only the approach into frame ${firstWrongFrame + 1}; keep the larger contour you already preserved.`,
    };
    return {
      title: "Some landmarks moved; preserve one relation on the retry.",
      body: `${evaluation.pitchHits}/${expectedAttackCount} positions and ${evaluation.directionHits}/${Math.max(1, evaluation.targetDirectionCount)} contour directions matched after ${practiceMode === "transfer" ? "transposition alignment" : "exact-pitch comparison"}.`,
      next: firstWrongFrame >= 0 ? `Preview frame ${firstWrongFrame + 1} as a destination, then replay the surrounding group—not the isolated wrong note.` : "Return to the first group and keep its silhouette intact.",
    };
  })();

  const resetAttempt = () => {
    setAttemptAfterId(events.at(-1)?.id ?? -1);
    setScoreRevealed(challengeMode !== "memory");
  };

  const adoptLiveFrame = () => {
    setWrittenFrame({ doMidi, scale });
    if (!registerFitsScore(doMidi, registerShift, pattern)) setRegisterShift(0);
    setAttemptAfterId(events.at(-1)?.id ?? -1);
    setScoreRevealed(true);
  };

  const selectPattern = (next: SightPattern) => {
    setPatternId(next.id);
    setWrittenFrame({ doMidi, scale });
    if (!registerFitsScore(doMidi, registerShift, next)) setRegisterShift(0);
    setAttemptAfterId(events.at(-1)?.id ?? -1);
    setFoldArpeggio(Boolean(next.foldable));
    setScoreRevealed(true);
    setIntention("follow the written idea");
    setWordOne("");
    setWordTwo("");
  };

  const selectChapter = (next: Chapter) => {
    const first = PATTERNS.find((candidate) => candidate.chapter === next)!;
    setChapter(next);
    selectPattern(first);
  };

  const selectPracticeMode = (next: PracticeMode) => {
    setPracticeMode(next);
    setAttemptAfterId(events.at(-1)?.id ?? -1);
  };

  const selectRegister = (next: number) => {
    setRegisterShift(next);
    setAttemptAfterId(events.at(-1)?.id ?? -1);
    setScoreRevealed(true);
  };

  const keyboardTargetNotes = targetNotes.map((note) => note.note + transferShift);
  const visibleKeyboardNotes = [...keyboardTargetNotes, ...attemptEvents.map((event) => event.note), ...activeNotes];
  const { low: keyboardLow, high: keyboardHigh } = keyboardWindow(visibleKeyboardNotes);
  const whiteNotes = Array.from({ length: keyboardHigh - keyboardLow + 1 }, (_, index) => keyboardLow + index).filter((note) => WHITE_PITCH_CLASSES.has(pitchClass(note)));
  const whiteWidth = 1040 / whiteNotes.length;
  const keyX = (note: number) => {
    const whitesBefore = whiteNotes.filter((candidate) => candidate < note).length;
    if (WHITE_PITCH_CLASSES.has(pitchClass(note))) return whitesBefore * whiteWidth;
    return whitesBefore * whiteWidth - whiteWidth * .31;
  };
  const scoreScrollX = currentFrameIndex >= 0 ? eventFrameX(currentFrameIndex, pattern) : null;
  const nextKeyboardTargetForScroll = nextPhysicalTargets.find((note) => note >= keyboardLow && note <= keyboardHigh) ?? null;
  const keyboardScrollX = nextKeyboardTargetForScroll == null ? null : keyX(nextKeyboardTargetForScroll);
  useEffect(() => {
    const scoreViewport = scoreViewportRef.current;
    if (scoreViewport && scoreViewport.scrollWidth > scoreViewport.clientWidth + 1 && scoreScrollX != null) {
      const scoreX = scoreScrollX / 1120 * scoreViewport.scrollWidth;
      scoreViewport.scrollTo({
        left: Math.max(0, Math.min(scoreViewport.scrollWidth - scoreViewport.clientWidth, scoreX - scoreViewport.clientWidth / 2)),
        behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth",
      });
    }
    const keyboardViewport = keyboardViewportRef.current;
    if (keyboardViewport && keyboardScrollX != null && keyboardViewport.scrollWidth > keyboardViewport.clientWidth + 1) {
      const keyboardX = keyboardScrollX / 1040 * keyboardViewport.scrollWidth;
      keyboardViewport.scrollTo({
        left: Math.max(0, Math.min(keyboardViewport.scrollWidth - keyboardViewport.clientWidth, keyboardX - keyboardViewport.clientWidth / 2)),
        behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth",
      });
    }
  }, [keyboardScrollX, scoreScrollX]);
  const patternMoves = motionLanes.flatMap((lane) => lane.moves);
  const foldedOffsets = [...new Set(pattern.frames.flatMap((frame) => frame.offsets))].sort((first, second) => first - second);
  const targetSpan = Math.max(...keyboardTargetNotes) - Math.min(...keyboardTargetNotes);
  const completedFrameCount = attemptFrames.filter((frame, index) => frame.length === pattern.frames[index].offsets.length).length;
  const anchorOccurrences = pattern.anchorOffset == null ? [] : targetNotes.filter((note) => note.offset === pattern.anchorOffset);

  return (
    <section className={styles.shell} aria-labelledby="sight-shapes-title">
      <header className={styles.hero}>
        <div className={styles.heroCopy}>
          <span className={styles.eyebrow}>Sight Shapes · eyes × hands × ear</span>
          <h3 id="sight-shapes-title">Read relationships before they become a queue of notes.</h3>
          <p>The score remains primary. Each optional layer exposes an interval, contour, chord silhouette, physical territory, or phrase idea—and can fade once the relationship is yours.</p>
        </div>
        <dl className={styles.statusLedger} aria-label="Sight-reading session status">
          <div><dt>sound</dt><dd>visualization only · piano or DAW supplies audio</dd></div>
          <div><dt>target</dt><dd>{expectedAttackCount} attacks · {pattern.frames.length} frame{pattern.frames.length === 1 ? "" : "s"}</dd></div>
          <div><dt>attempt</dt><dd>{attemptEvents.length}/{expectedAttackCount} attacks · {activeNotes.length} active / held now</dd></div>
          <div><dt>comparison</dt><dd>{practiceMode === "exact" ? "written position" : "transposable shape"}</dd></div>
          <div><dt>written frame</dt><dd>{showConventions ? writtenFrame.scale.conventionalName : writtenFrame.scale.name} from {pitchLabel(writtenFrame.doMidi, writtenFrame.doMidi, showConventions, notationPreference)} · {routeMemberCount}/{targetPitchClassCount} target positions inside its route{routeOutsideCount ? ` · ${routeOutsideCount} authored alteration${routeOutsideCount === 1 ? "" : "s"}` : ""}</dd></div>
        </dl>
      </header>

      <nav className={styles.chapterNav} aria-label="Sight-reading learning arc inspired by Sofia Laria">
        {CHAPTERS.map((item) => (
          <button key={item.id} type="button" aria-pressed={chapter === item.id} onClick={() => selectChapter(item.id)}>
            <span>{item.number}</span><strong>{item.label}</strong><small>{item.subtitle}</small>
          </button>
        ))}
      </nav>

      <section className={styles.chapterIntro} aria-live="polite">
        <span>{CHAPTERS.find((item) => item.id === chapter)?.number} · {CHAPTERS.find((item) => item.id === chapter)?.label}</span>
        <p>{patternChapterCopy(chapter)}</p>
      </section>

      <div className={styles.patternStrip} role="group" aria-label={`${chapter} pattern choices`}>
        {patternsForChapter.map((candidate) => (
          <button key={candidate.id} type="button" aria-pressed={candidate.id === pattern.id} onClick={() => selectPattern(candidate)}>
            <small>{candidate.family}</small><strong>{candidate.name}</strong><span>{candidate.miniature}</span>
          </button>
        ))}
      </div>

      <section className={styles.workbench} aria-labelledby="sight-workbench-title">
        <header className={styles.workbenchHeader}>
          <div>
            <span>{pattern.family}</span>
            <h4 id="sight-workbench-title">{pattern.name}</h4>
            <p>{pattern.focus}</p>
          </div>
          <div className={styles.workbenchActions}>
            <button type="button" className={styles.primaryAction} onClick={resetAttempt}>{challengeMode === "memory" && scoreRevealed && !attemptEvents.length ? "Start from memory" : attemptComplete ? "Try it again" : attemptEvents.length ? "Restart from now" : "Reset boundary"}</button>
            {liveFrameChanged ? <button type="button" onClick={adoptLiveFrame}>Adopt live frame</button> : null}
            {challengeMode === "memory" ? <button type="button" aria-pressed={scoreRevealed} onClick={() => setScoreRevealed((current) => !current)}>{scoreRevealed ? "Veil score" : "Reveal score"}</button> : null}
          </div>
        </header>

        {frozen ? <p className={styles.frameNotice} role="alert"><strong>Attack capture is frozen.</strong> Held keys can still light, but new notes cannot enter this attempt. <button type="button" onClick={onResumeCapture}>Resume capture</button></p> : liveFrameChanged ? <p className={styles.frameNotice} role="status"><strong>The live Do / route moved.</strong> This written score stays fixed through the attempt. Adopt the live frame only when you want a new target.</p> : null}

        <div className={styles.controlRail}>
          <fieldset>
            <legend>Position rule</legend>
            <button type="button" aria-pressed={practiceMode === "exact"} onClick={() => selectPracticeMode("exact")}><strong>Exact</strong><span>match written keys</span></button>
            <button type="button" aria-pressed={practiceMode === "transfer"} onClick={() => selectPracticeMode("transfer")}><strong>Transfer</strong><span>keep relative shape</span></button>
          </fieldset>
          <fieldset>
            <legend>Register</legend>
            {[-12, 0, 12].map((shift) => {
              const readable = registerFitsScore(writtenFrame.doMidi, shift, pattern);
              return <button key={shift} type="button" aria-pressed={registerShift === shift} disabled={!readable} title={readable ? undefined : "This register would collide with the interval braid."} onClick={() => selectRegister(shift)}>{shift < 0 ? "low" : shift > 0 ? "high" : "center"}<span>{signed(shift)} st</span></button>;
            })}
          </fieldset>
          <label className={styles.supportControl}>
            <span><strong>Scaffold</strong><small>{["score only", "territory", "intervals", "full decode"][support]}</small></span>
            <input type="range" min="0" max="3" step="1" value={support} onChange={(event) => setSupport(Number(event.target.value))} aria-label="Scaffold amount from score only to full decode" />
          </label>
          <label className={styles.selectControl}>
            <span>Reading challenge</span>
            <select value={challengeMode} onChange={(event) => { const next = event.target.value as ChallengeMode; setChallengeMode(next); setScoreRevealed(true); }}>
              <option value="open">Open score</option>
              <option value="fade">Fade after first attack</option>
              <option value="memory">Preview, then veil</option>
            </select>
          </label>
          {pattern.foldable ? <button className={styles.foldControl} type="button" aria-pressed={foldArpeggio} onClick={() => setFoldArpeggio((current) => !current)}><strong>Fold arpeggio</strong><span>{foldArpeggio ? "latent chord visible" : "timeline only"}</span></button> : null}
        </div>

        <div className={cx(styles.scoreFrame, scoreVeiled && styles.isVeiled, challengeMode === "fade" && styles.isFading)}>
          <div className={styles.scoreHeading}>
            <div><span>Primary reading surface</span><strong>Grand staff + interval braid</strong><small>One unbarred measure · accidentals carry to the closing bar · ♮ cancels them · no key signature assumed</small></div>
            <div className={styles.scoreLegend} aria-label="Score overlay key"><span><i className={styles.targetMark} />written target</span><span><i className={styles.attemptMark} />performed overlay</span><span><i className={styles.magnetMark} />next destination</span></div>
          </div>
          {outsideRouteLabels.length ? <p className={styles.routeNotice}><strong>Fixed interval specimen · {outsideRouteLabels.join(" · ")} {outsideRouteLabels.length === 1 ? "is" : "are"} outside the selected route.</strong> {pattern.id === "transposed-cell" ? "The final pitch is intentional: the second cell preserves the same +2, +2 semitone interior as the first. Replacing it with the neighboring route pitch would make the last move +1." : "The selected route provides context; it does not rewrite this authored spacing exercise."}</p> : null}
          <div ref={scoreViewportRef} className={styles.scoreViewport} tabIndex={0} aria-label="Scrollable notation viewport; it follows the next written frame on narrow screens.">
            <svg className={styles.score} viewBox="0 0 1120 360" role="img" aria-labelledby="sight-score-title sight-score-description">
            <title id="sight-score-title">{pattern.name} notation with aligned interval and attempt overlays</title>
            <desc id="sight-score-description">{pattern.focus} {attemptEvents.length ? `${attemptEvents.length} performed attacks are overlaid.` : "No performed attacks yet."}</desc>
            <defs>
              <linearGradient id="sight-braid-gradient" x1="0" x2="1"><stop offset="0" stopColor="#5f9ff0" /><stop offset=".5" stopColor="#b978e2" /><stop offset="1" stopColor="#e9c46a" /></linearGradient>
              <filter id="sight-soft-glow" x="-80%" y="-80%" width="260%" height="260%"><feGaussianBlur stdDeviation="5" result="blur" /><feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge></filter>
            </defs>

            <g className={styles.staffPaper}>
              {[88, 102, 116, 130, 144, 172, 186, 200, 214, 228].map((y) => <line key={y} x1="70" x2="1070" y1={y} y2={y} />)}
              <line x1="70" x2="70" y1="88" y2="228" className={styles.barLine} />
              <line x1="1070" x2="1070" y1="88" y2="228" className={styles.barLine} />
              <text x="20" y="143" className={styles.trebleClef}>𝄞</text>
              <text x="27" y="218" className={styles.bassClef}>𝄢</text>
            </g>

            <g className={styles.groupLayer}>
              {pattern.groups.map((group, index) => {
                const x1 = eventFrameX(group.from, pattern) - 28;
                const x2 = eventFrameX(group.to, pattern) + 28;
                const path = `M ${x1} 66 Q ${(x1 + x2) / 2} ${48 - index * 3} ${x2} 66`;
                return <g key={`${group.label}-${index}`}><path d={path} /><text x={(x1 + x2) / 2} y={44 - index * 3}>{group.label}</text></g>;
              })}
            </g>

            {anchorOccurrences.length > 1 ? <g className={styles.anchorLayer}>
              <line x1={eventFrameX(anchorOccurrences[0].frameIndex, pattern)} x2={eventFrameX(anchorOccurrences.at(-1)!.frameIndex, pattern)} y1={staffY(anchorOccurrences[0].notation)} y2={staffY(anchorOccurrences[0].notation)} />
              <text x={eventFrameX(anchorOccurrences[0].frameIndex, pattern)} y={staffY(anchorOccurrences[0].notation) - 30}>fixed point</text>
            </g> : null}

            <g className={styles.targetLayer} aria-hidden={scoreVeiled}>
              {motionLanes.flatMap((lane) => pattern.frames.slice(1).map((frame, index) => {
                const prior = pattern.frames[index];
                const distance = lane.moves[index];
                const x1 = eventFrameX(index, pattern);
                const x2 = eventFrameX(index + 1, pattern);
                const y1 = motionLaneY(prior, lane.id, anchor, notationPreference);
                const y2 = motionLaneY(frame, lane.id, anchor, notationPreference);
                return <path key={`contour-${lane.id}-${index}`} d={`M ${x1} ${y1} Q ${(x1 + x2) / 2} ${Math.min(y1, y2) - 12} ${x2} ${y2}`} className={styles.contourPath} style={{ "--interval-color": colorForInterval(distance) } as CSSProperties} />;
              }))}
              <g className={styles.slurLayer}>
                {slurRuns.map((run) => {
                  const fromFrame = pattern.frames[run.from];
                  const toFrame = pattern.frames[run.to];
                  const x1 = eventFrameX(run.from, pattern) - 8;
                  const x2 = eventFrameX(run.to, pattern) + 8;
                  const y1 = Math.max(...fromFrame.offsets.map((offset) => staffY(notatePatternPitch(anchor, offset, notationPreference)))) + 17;
                  const y2 = Math.max(...toFrame.offsets.map((offset) => staffY(notatePatternPitch(anchor, offset, notationPreference)))) + 17;
                  return <path key={`slur-${run.from}-${run.to}`} d={`M ${x1} ${y1} Q ${(x1 + x2) / 2} ${Math.max(y1, y2) + 18} ${x2} ${y2}`} />;
                })}
              </g>
              {pattern.groups.filter((group) => group.label.toLowerCase().includes("breathe")).map((group) => <text key={`breath-${group.to}`} x={eventFrameX(group.to, pattern) + 35} y="80" className={styles.breathMark}>𝄒</text>)}
              {targetNotes.map((target, targetIndex) => {
                const frame = pattern.frames[target.frameIndex];
                const x = eventFrameX(target.frameIndex, pattern) + (target.noteIndex - (frame.offsets.length - 1) / 2) * 7;
                const y = staffY(target.notation);
                const isAnchor = pattern.anchorOffset != null && target.offset === pattern.anchorOffset;
                const accidental = displayedAccidentals[targetIndex] == null ? null : accidentalGlyph(displayedAccidentals[targetIndex]!);
                return <g key={`target-${target.frameIndex}-${target.noteIndex}`} className={cx(styles.targetNote, isAnchor && styles.isAnchor)}>
                  {ledgerLines(target.notation).map((line) => <line key={line} x1={x - 15} x2={x + 15} y1={line} y2={line} className={styles.ledgerLine} />)}
                  {accidental ? <text x={x - 20} y={y + 5} className={styles.accidental}>{accidental}</text> : null}
                  <ellipse cx={x} cy={y} rx="10" ry="7" transform={`rotate(-14 ${x} ${y})`} className={noteHead(frame) === "open" ? styles.openNote : styles.filledNote} />
                  {frame.offsets.length === 1 ? <line x1={x + 9} x2={x + 9} y1={y} y2={y - 38} className={styles.stem} /> : null}
                  {frame.offsets.length === 1 && noteNeedsFlag(frame) ? <path d={`M ${x + 9} ${y - 38} Q ${x + 27} ${y - 31} ${x + 18} ${y - 15}`} className={styles.flag} /> : null}
                  {noteNeedsDot(frame) ? <circle cx={x + 17} cy={y} r="2.4" className={styles.durationDot} /> : null}
                  {frame.articulation === "detached" ? <circle cx={x} cy={y + 15} r="2.5" className={styles.articulation} /> : null}
                  {frame.articulation === "accent" ? <text x={x} y={y + 22} className={styles.accent}>&gt;</text> : null}
                  {support === 3 ? <text x={x} y={255 + target.noteIndex * 13} className={styles.noteLabel}>{showConventions ? target.notation.label : pitchLabel(target.note, writtenFrame.doMidi, false)}</text> : null}
                </g>;
              })}
              {pattern.frames.map((frame, frameIndex) => {
                if (frame.offsets.length <= 1) return null;
                const x = eventFrameX(frameIndex, pattern) + 9;
                const positions = frame.offsets.map((offset) => staffY(notatePatternPitch(anchor, offset, notationPreference)));
                const top = Math.min(...positions);
                const bottom = Math.max(...positions);
                return <g key={`chord-rhythm-${frameIndex}`} className={styles.targetNote}>
                  <line x1={x} x2={x} y1={bottom} y2={top - 38} className={styles.stem} />
                  {noteNeedsFlag(frame) ? <path d={`M ${x} ${top - 38} Q ${x + 18} ${top - 31} ${x + 9} ${top - 15}`} className={styles.flag} /> : null}
                </g>;
              })}
              {pattern.frames.map((frame, frameIndex) => frame.offsets.length > 1 ? <g key={`hull-${frameIndex}`} className={styles.chordHull}>
                <rect x={eventFrameX(frameIndex, pattern) - 22} y={Math.min(...frame.offsets.map((offset) => staffY(notatePatternPitch(anchor, offset, notationPreference)))) - 16} width="44" height={Math.max(...frame.offsets.map((offset) => staffY(notatePatternPitch(anchor, offset, notationPreference)))) - Math.min(...frame.offsets.map((offset) => staffY(notatePatternPitch(anchor, offset, notationPreference)))) + 32} rx="20" />
                {support >= 2 ? <text x={eventFrameX(frameIndex, pattern) + 29} y={(Math.min(...frame.offsets.map((offset) => staffY(notatePatternPitch(anchor, offset, notationPreference)))) + Math.max(...frame.offsets.map((offset) => staffY(notatePatternPitch(anchor, offset, notationPreference))))) / 2}>{adjacentGaps(frame.offsets).join(" + ")} st</text> : null}
              </g> : null)}
              {pattern.indication ? <text x="88" y="248" className={styles.indication}>{pattern.indication}</text> : null}
              {foldArpeggio && pattern.foldable ? <g className={styles.foldedChord}>
                <path d={`M 980 ${staffY(notatePatternPitch(anchor, foldedOffsets[0], notationPreference))} Q 1040 ${(staffY(notatePatternPitch(anchor, foldedOffsets[0], notationPreference)) + staffY(notatePatternPitch(anchor, foldedOffsets.at(-1)!, notationPreference))) / 2} 1018 ${staffY(notatePatternPitch(anchor, foldedOffsets.at(-1)!, notationPreference))}`} />
                {foldedOffsets.map((offset) => <circle key={offset} cx="1042" cy={staffY(notatePatternPitch(anchor, offset, notationPreference))} r="5" />)}
                <text x="1036" y="52">folded memory</text>
              </g> : null}
            </g>

            <g className={styles.attemptLayer}>
              {attemptEvents.map((event, index) => {
                const target = targetNotes[attemptTargetIndices[index] ?? index];
                if (!target) return null;
                const x = eventFrameX(target.frameIndex, pattern) + (target.noteIndex - (pattern.frames[target.frameIndex].offsets.length - 1) / 2) * 7;
                const expected = target.note;
                const matches = shownAttemptNotes[index] === expected;
                const normalizedNote = shownAttemptNotes[index];
                const performedNotation = matches
                  ? target.notation
                  : Number.isInteger(normalizedNote) && normalizedNote >= 0 && normalizedNote <= 127
                    ? spellMidiPitch(normalizedNote, {
                      clef: normalizedNote < 60 ? "bass" : "treble",
                      prefer: notationPreference,
                    })
                    : null;
                const y = performedNotation ? staffY(performedNotation) : normalizedNote < 0 ? 252 : 60;
                return <g key={event.id} className={matches ? styles.isMatch : styles.isDifferent}>
                  <circle cx={x} cy={y} r="14" />
                  <circle cx={x} cy={y} r="4" />
                  {!matches ? <text x={x + 15} y={y - 11}>{signed(shownAttemptNotes[index] - expected)} st</text> : null}
                </g>;
              })}
            </g>

            {nextFlatTargets.length && !attemptComplete && support >= 1 ? <g className={styles.scoreMagnet} filter="url(#sight-soft-glow)">
              {nextFlatTargets.map((target, index) => {
                const frame = pattern.frames[target.frameIndex];
                const x = eventFrameX(target.frameIndex, pattern) + (target.noteIndex - (frame.offsets.length - 1) / 2) * 7;
                const labelY = Math.min(...nextFlatTargets.map((candidate) => staffY(candidate.notation))) - 18;
                return <g key={`next-${target.frameIndex}-${target.noteIndex}`}><circle cx={x} cy={staffY(target.notation)} r="18" />{index === 0 ? <text x={x + 28} y={labelY}>{nextFlatTargets.length > 1 ? "next chord" : "next"}</text> : null}</g>;
              })}
            </g> : null}

            <g className={styles.braidLayer}>
              <text x="70" y="286" className={styles.braidTitle}>INTERVAL BRAID · frame-to-frame physical movement</text>
              {motionLanes.map((lane, laneIndex) => {
                const baseline = motionLanes.length === 1 ? 321 : 314 + laneIndex * 18;
                return <g key={`braid-lane-${lane.id}`}>
                  <line x1="84" x2="1050" y1={baseline} y2={baseline} className={styles.braidBaseline} />
                  {motionLanes.length > 1 ? <text x="73" y={baseline + 3} className={styles.braidLaneLabel}>{lane.label}</text> : null}
                  {pattern.frames.map((frame, index) => {
                    const x = eventFrameX(index, pattern);
                    const move = index ? lane.moves[index - 1] : null;
                    return <g key={`braid-${lane.id}-${index}`}>
                      {move != null ? <path d={`M ${eventFrameX(index - 1, pattern)} ${baseline} Q ${(eventFrameX(index - 1, pattern) + x) / 2} ${baseline - Math.min(18, Math.abs(move) * 2)} ${x} ${baseline}`} className={styles.braidArc} style={{ "--interval-color": colorForInterval(move) } as CSSProperties} /> : null}
                      <circle cx={x} cy={baseline} r={motionLanes.length > 1 ? 6 : frame.offsets.length > 1 ? 11 : 7} className={styles.braidNode} style={{ "--interval-color": colorForInterval(move ?? 0) } as CSSProperties} />
                    </g>;
                  })}
                </g>;
              })}
              {pattern.frames.map((frame, index) => {
                const x = eventFrameX(index, pattern);
                const moveLabel = index === 0 ? null : motionLanes.map((lane) => `${motionLanes.length > 1 ? `${lane.label} ` : ""}${signed(lane.moves[index - 1])} st`).join(" · ");
                return <g key={`braid-label-${index}`}>
                  {support >= 2 && moveLabel ? <text x={(eventFrameX(index - 1, pattern) + x) / 2} y="301" className={styles.braidLabel}>{moveLabel}{motionLanes.length === 1 && pattern.frames[index - 1].offsets.length === 1 && frame.offsets.length === 1 ? ` · ${ordinal(genericIntervalFromOffsets(pattern.frames[index - 1].offsets[0], frame.offsets[0], anchor, notationPreference))}` : ""}</text> : null}
                  <text x={x} y="350" className={styles.frameLabel}>{index + 1}</text>
                </g>;
              })}
            </g>
            {scoreVeiled ? <g className={styles.veilMessage}><rect x="72" y="72" width="996" height="192" rx="16" /><text x="570" y="154">Hold the shape in working memory</text><text x="570" y="180">The interval braid and keyboard can remain—or fade with the scaffold control.</text></g> : null}
            </svg>
          </div>
        </div>

        {support >= 1 ? <section className={styles.keyboardPanel} aria-labelledby="sight-keyboard-title">
          <header>
            <div><span>Embodied territory</span><strong id="sight-keyboard-title">Where the gesture lives beneath the hand</strong></div>
            <p>{targetSpan} semitone span · {pattern.coordination ?? (keyboardTargetNotes.some((note) => note < anchor) ? "shared keyboard territory" : "one-hand study")}</p>
          </header>
          <div ref={keyboardViewportRef} className={styles.keyboardViewport} tabIndex={0} aria-label="Scrollable keyboard viewport; it follows the next destination on narrow screens.">
            <svg className={styles.keyboard} viewBox="0 0 1040 168" role="img" aria-labelledby="sight-keyboard-svg-title sight-keyboard-svg-description">
            <title id="sight-keyboard-svg-title">Keyboard territory, active keys, and next-destination magnet</title>
            <desc id="sight-keyboard-svg-description">{`Keyboard territory from ${pitchLabel(keyboardLow, physicalDo, showConventions, physicalNotationPreference)} through ${pitchLabel(keyboardHigh, physicalDo, showConventions, physicalNotationPreference)}. ${nextPhysicalTargets.length ? `Next ${nextPhysicalTargets.length > 1 ? "chord members" : "target"}: ${nextPhysicalTargets.map((note) => pitchLabel(note, physicalDo, showConventions, physicalNotationPreference)).join(", ")}.` : "Attempt complete."}`}</desc>
            {whiteNotes.map((note) => {
              const target = keyboardTargetNotes.includes(note);
              const attempted = attemptEvents.some((event) => event.note === note);
              const active = activeNotes.includes(note);
              return <g key={`white-${note}`} className={cx(styles.whiteKey, target && styles.isTargetKey, attempted && styles.isAttemptedKey, active && styles.isActiveKey)}>
                <rect x={keyX(note) + 1} y="1" width={whiteWidth - 2} height="148" rx="0 0 6 6" />
                {(showConventions && (target || active)) ? <text x={keyX(note) + whiteWidth / 2} y="138">{pitchClassLabel(note, physicalNotationPreference)}</text> : null}
              </g>;
            })}
            {Array.from({ length: keyboardHigh - keyboardLow + 1 }, (_, index) => keyboardLow + index).filter((note) => !WHITE_PITCH_CLASSES.has(pitchClass(note))).map((note) => {
              const target = keyboardTargetNotes.includes(note);
              const attempted = attemptEvents.some((event) => event.note === note);
              const active = activeNotes.includes(note);
              return <g key={`black-${note}`} className={cx(styles.blackKey, target && styles.isTargetKey, attempted && styles.isAttemptedKey, active && styles.isActiveKey)}>
                <rect x={keyX(note)} y="1" width={whiteWidth * .62} height="92" rx="0 0 5 5" />
                {(showConventions && (target || active)) ? <text x={keyX(note) + whiteWidth * .31} y="82">{pitchClassLabel(note, physicalNotationPreference)}</text> : null}
              </g>;
            })}
            {nextPhysicalTargets.filter((note) => note >= keyboardLow && note <= keyboardHigh).map((note, index) => <g key={`keyboard-next-${note}`} className={styles.keyboardMagnet} transform={`translate(${keyX(note) + (WHITE_PITCH_CLASSES.has(pitchClass(note)) ? whiteWidth / 2 : whiteWidth * .31)} 112)`}>
              <circle r="18" /><circle r="6" />{index === 0 ? <text y="40">{nextPhysicalTargets.length > 1 ? "NEXT CHORD" : "NEXT"}</text> : null}
            </g>)}
            <g className={styles.handTerritory}>
              {(["left", "right"] as Hand[]).map((hand) => {
                const notes = targetNotes.filter((note) => note.hand === hand).map((note) => note.note + transferShift);
                if (!notes.length) return null;
                const min = Math.min(...notes);
                const max = Math.max(...notes);
                const x = keyX(min);
                const width = Math.max(whiteWidth * .6, keyX(max) - x + whiteWidth);
                return <g key={hand} className={hand === "left" ? styles.leftHand : styles.rightHand}><line x1={x} x2={x + width} y1="160" y2="160" /><text x={x + width / 2} y="166">{hand === "left" ? "L" : "R"}</text></g>;
              })}
            </g>
            </svg>
          </div>
          <div className={styles.preMovement}>
            <span>pre-movement magnet</span>
            <strong>{attemptComplete
              ? "Phrase complete—release, notice, then reset."
              : nextPhysicalTargets.length > 1
                ? `Gather ${nextPhysicalTargets.map((note) => pitchLabel(note, physicalDo, showConventions, physicalNotationPreference)).join(" · ")} as one vertical object; attack order does not matter.`
                : attemptEvents.length && nextPhysicalTargets[0] != null
                  ? `${signed(nextPhysicalTargets[0] - attemptEvents.at(-1)!.note)} st from the latest attack toward ${pitchLabel(nextPhysicalTargets[0], physicalDo, showConventions, physicalNotationPreference)}`
                  : nextPhysicalTargets[0] != null
                    ? `Orient to ${pitchLabel(nextPhysicalTargets[0], physicalDo, showConventions, physicalNotationPreference)} before beginning.`
                    : "Choose a transfer anchor that keeps the complete shape inside the keyboard range."}</strong>
            <small>The magnet names a destination. It does not ask you to shorten the written rhythm.</small>
          </div>
        </section> : null}

        <div className={styles.learningGrid}>
          <article className={styles.lensCard}>
            <header><span>Eyes</span><strong>What to compress</strong></header>
            <p>{pattern.eyes}</p>
            <dl>
              <div><dt>contour</dt><dd>{patternMoves.length ? motionLanes.map((lane) => `${motionLanes.length > 1 ? `${lane.label}: ` : ""}${lane.moves.map((move) => `${signed(move)} st`).join(" · ")}`).join(" / ") : "vertical field"}</dd></div>
              <div><dt>groups</dt><dd>{pattern.groups.map((group) => group.label).join(" → ")}</dd></div>
              {pattern.frames.some((frame) => frame.offsets.length > 1) ? <div><dt>chord gaps</dt><dd>{pattern.frames.filter((frame) => frame.offsets.length > 1).map((frame) => adjacentGaps(frame.offsets).join(" + ")).join(" · ")} st</dd></div> : null}
            </dl>
          </article>
          <article className={styles.lensCard}>
            <header><span>Hands</span><strong>What to prepare</strong></header>
            <p>{pattern.hands}</p>
            <dl>
              <div><dt>territory</dt><dd>{targetSpan} semitones · {targetSpan >= 12 ? `${Math.floor(targetSpan / 12)} octave layer${targetSpan >= 24 ? "s" : ""}` : "inside one octave"}</dd></div>
              <div><dt>coordination</dt><dd>{pattern.coordination ?? "one gesture stream"}</dd></div>
              <div><dt>next frame</dt><dd>{attemptComplete ? "release and reset" : `${completedFrameCount + 1} of ${pattern.frames.length}`}</dd></div>
            </dl>
          </article>
          <article className={styles.lensCard}>
            <header><span>Ear</span><strong>What to compare</strong></header>
            <p>{pattern.ears}</p>
            <div className={styles.intervalWords}>
              {[...new Set(patternMoves.map((move) => Math.abs(move)))].slice(0, 4).map((distance) => <span key={distance} style={{ "--interval-color": colorForInterval(distance) } as CSSProperties}><i />{distance} st <small>{feelingForInterval(distance)}</small></span>)}
              {!patternMoves.length ? <span style={{ "--interval-color": colorForInterval(targetSpan) } as CSSProperties}><i />{targetSpan} st <small>{feelingForInterval(targetSpan)}</small></span> : null}
            </div>
          </article>
        </div>

        <section className={styles.diagnosisPanel} aria-labelledby="sight-diagnosis-title" aria-live="polite">
          <div className={styles.diagnosisLead}>
            <span>Relational diagnosis</span>
            <h4 id="sight-diagnosis-title">{diagnosis.title}</h4>
            <p>{diagnosis.body}</p>
            <strong>Next attempt · {diagnosis.next}</strong>
          </div>
          <div className={styles.metricCluster}>
            <div style={{ "--meter": `${Math.round(evaluation.pitchFit * 100)}%` } as CSSProperties}><span>positions</span><strong>{evaluation.pitchHits}/{expectedAttackCount}</strong><i /></div>
            <div style={{ "--meter": `${Math.round((evaluation.directionFit ?? 0) * 100)}%` } as CSSProperties}><span>contour</span><strong>{evaluation.directionFit == null ? "waiting" : `${Math.round(evaluation.directionFit * 100)}%`}</strong><i /></div>
            <div style={{ "--meter": `${Math.round((evaluation.pulseFit ?? 0) * 100)}%` } as CSSProperties}><span>pulse shape</span><strong>{evaluation.pulseFit == null ? "needs 3 frames" : `${Math.round(evaluation.pulseFit * 100)}%`}</strong><i /></div>
            {evaluation.chordFrameCount ? <div style={{ "--meter": `${Math.round((evaluation.chordGroupingHits / evaluation.chordFrameCount) * 100)}%` } as CSSProperties}><span>vertical groups</span><strong>{evaluation.chordGroupingHits}/{evaluation.chordFrameCount}</strong><i /></div> : null}
          </div>
          <p className={styles.measureBoundary}>Position, direction, relative onset spacing, and attack clustering are measured. Chord membership uses the same selected rule as the main HUD: adjacent gaps up to {chordWindowMs} ms and a {chordWindowMs * 2} ms maximum span. “Pulse shape” adapts to your tempo. Fingering, gaze, acoustic loudness, physical tension, and emotional meaning are not inferred from MIDI.</p>
        </section>

        <section className={styles.integratePanel} aria-labelledby="sight-integrate-title">
          <div className={styles.integrateIdea}>
            <span>Integrate · musical idea</span>
            <h4 id="sight-integrate-title">{pattern.idea}</h4>
            <p>{pattern.indication ? `Written cue: ${pattern.indication}. ` : ""}Choose an intention before the attempt; describe your experience after it.</p>
          </div>
          <label>
            <span>Intention</span>
            <select value={intention} onChange={(event) => setIntention(event.target.value)}>
              <option>follow the written idea</option>
              <option>make the groups unmistakable</option>
              <option>preserve one continuous gesture</option>
              <option>let the arrival feel inevitable</option>
              <option>test a contrasting interpretation</option>
            </select>
          </label>
          <fieldset>
            <legend>Two words after listening</legend>
            <label><span>character</span><input value={wordOne} maxLength={24} placeholder="e.g. searching" onChange={(event) => setWordOne(event.target.value)} /></label>
            <label><span>sound / motion</span><input value={wordTwo} maxLength={24} placeholder="e.g. suspended" onChange={(event) => setWordTwo(event.target.value)} /></label>
          </fieldset>
          <div className={styles.reflectionReadout}>
            <span>your hypothesis</span>
            <strong>{wordOne.trim() || wordTwo.trim() ? `${wordOne.trim() || "…"} · ${wordTwo.trim() || "…"}` : "Listen first; add language only if it sharpens the next attempt."}</strong>
            <small>Personal words are observations to test—not properties assigned to an interval.</small>
          </div>
        </section>
      </section>

      <footer className={styles.boundaryNote}>
        <p><strong>What stays exact:</strong> notated position, MIDI key number, semitone distance, event order, onset spacing, and attack-cluster spread.</p>
        <p><strong>What stays interpretive:</strong> grouping, fingering strategy, tension and resolution, phrase character, and the two words you choose. These depend on musical context, style, instrument, body, and listener.</p>
      </footer>
    </section>
  );
}
