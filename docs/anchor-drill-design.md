# Anchor Drill · ear-learning design

Status: Phase 1 of the Anchor Drill (section 4) is implemented. Sections 2 and 3 remain proposals. Line references are to the tree at commit `dc9ec83` and have drifted since.

## What shipped in Phase 1, and where it differs from the proposal

- **Model, tests, lens, storage, model card** are in `lib/piano-anchor-drill-model.ts`, `tests/piano-anchor-drill-model.test.ts`, `app/PianoAnchorDrillHud.tsx`, and `docs/model-cards.md` under `mwno-anchor-1`.
- **Answer surfaces.** Silent MIDI keys, the twelve-cell pitch ring, and below/same/above. The shared on-screen keyboard is hidden in this lens, as it is in Absolute Pitch; the ring replaces it and still fills the heard-as grid. A ring answer has no octave, so it is placed on the key nearest the hidden tone.
- **No spacing chip.** `judgedSemitones` was dropped. Direction buttons are judged by the shorter way around the pitch-class circle.
- **Storage is one record per anchor**, keyed `piano-anchor-drill-v1:<pitch class>`, so changing anchor never discards another anchor's history.
- **Levels are learner-controlled.** The HUD highlights the add button when every pitch in play has four answers at an 80 percent recognised share. It does not add a pitch on its own.
- **Promotion gate.** Cold-check records hold only totals, so the gate cannot ask for the anchor's pitch class in both sounds. It asks instead for twelve anchor answers at 80 percent, three transfer-timbre answers at 80 percent, and any cold check recorded after the drill began. Phase 1 only shows a notice; two-anchor prompts are Phase 3.
- **Staff glow needed no change.** Pitch visuals became site-wide after this proposal was written, so the `showPitchAttacks` widening in 4.6 no longer applies.
- **ADR 0003** now names a device-local scheduling-state class, as section 4.5 asked.

This document does three things:

1. States what the current primary Piano views do well and poorly for learning intervals, absolute pitch, and ear skills.
2. Specifies two reworks of existing views (Immersion predict mode, Sound Finder single-landing frames) with their exact hook points.
3. Specifies a new HUD, the Anchor Drill, with its model API, state, registration touch points, model-card boundary, and test plan.

## 1. Why the current views teach slowly

Ear learning needs three things that the current primary views mostly lack.

| Need | Current state |
| --- | --- |
| Commit before you see | Immersion and Interval Glow label every attack as it lands. The learner never has to guess. |
| Tiny adaptive steps | Absolute Pitch adds targets on a fixed offset ladder (`absolutePitchPracticeTargets`, [lib/piano-absolute-pitch-model.ts:35](../lib/piano-absolute-pitch-model.ts)). Which pitch classes the learner actually confuses is never recorded. |
| Spacing across time | Every view is a session you open and close. Nothing revisits a weak item minutes or days later. |

Sound Finder is the exception. Its secure-prefix tracker, graded compass, and non-crediting ear hints are a real learning loop. The reworks below extend that loop downward to one note, and the new HUD extends it across time.

Design constraints inherited from the project, all honoured below:

- Incoming MIDI is silent note data. Only explicit learner actions make sound ([PianoLab.tsx:6098](../app/PianoLab.tsx) and `usePianoTrainerTone`).
- Note names are an optional translation layer, never the primary object.
- No goodness, talent, or proficiency score. Counts describe recorded events (ADR 0003).
- Every visual has a textual interpretation and no colour-only meaning.

## 2. Rework A · Immersion predict mode

Immersion computes a latest transition with signed semitones, landmark, ratio, and a spacing character ([lib/piano-immersion-model.ts:576](../lib/piano-immersion-model.ts)). The HUD shows it in three places and two spoken summaries:

- the interval chip, [PianoImmersion.tsx:1273](../app/PianoImmersion.tsx)
- the interval-context title, [PianoImmersion.tsx:1341](../app/PianoImmersion.tsx)
- the listening prompt, [PianoImmersion.tsx:1347](../app/PianoImmersion.tsx)
- the spoken `latestTransitionCopy` and `immersionSummary`, [PianoImmersion.tsx:844](../app/PianoImmersion.tsx) and [PianoImmersion.tsx:865](../app/PianoImmersion.tsx)

Add one prop, `predictMode: boolean`, beside `showConventions` ([PianoImmersion.tsx:132](../app/PianoImmersion.tsx)). When true:

1. The three render sites and both spoken summaries show a placeholder instead of the transition until the learner answers. The sky still places the dot, since register and fifths position are what the learner is reading, not the label.
2. A thirteen-chip answer strip appears under the interval context, one chip per `IMMERSION_INTERVAL_CHARACTERS` entry ([lib/piano-immersion-model.ts:173](../lib/piano-immersion-model.ts)). Chips carry the `spacingLabel`, not a conventional name. Direction is a separate up/down/same toggle, so the learner is judging width and direction independently, as `EarSearchProbeFeedback` already does.
3. On answer, the real transition fades in, the chosen chip is marked matched, narrower, or wider, and the listening prompt is shown as feedback copy.
4. The next attack re-blanks the panel. No tally is kept inside Immersion. Misses can be forwarded to the Anchor Drill confusion grid (section 4.4) if the drill is active, which is how Immersion becomes a source of spaced prompts.

Toggle placement: the existing Settings disclosure in the shared Piano input bar, next to the conventions toggle. Default off, so current behaviour is unchanged.

A smaller second change: allow the learner to set a **held anchor pitch** rather than Do as the reference for `immersionLatestTransition`. Every attack is then reported relative to the anchor. This is the bridge from relative to absolute hearing and uses the same anchor the drill stores.

## 3. Rework B · Sound Finder single-landing frames

The matcher is already target-agnostic. `EarSearchLanding` is `{ id, notes, measureIndex, measureNumber, staff? }` ([lib/piano-ear-search-model.ts:24](../lib/piano-ear-search-model.ts)), and `advanceEarSearchTracker` accepts any landing list. Nothing ties it to MusicXML except `buildEarSearchChunks`.

Add a fourth `EarSearchTimeSpan`, `"one-note"`, that produces a one-landing target drawn from the selected frame's attacks. The frame-start selector keeps its stable half-bar addresses; `one-note` steps through the attacks inside the current half-bar. The reference playback plan is the single cue plus its carries, so the existing shared synthesis path is reused.

Two model changes:

- Export `feedbackForProbe` ([lib/piano-ear-search-model.ts:284](../lib/piano-ear-search-model.ts)) as `earSearchProbeFeedback` so the Anchor Drill can call it with the anchor passed as `previous`. The `intervalDirection` and `intervalWidth` cues then describe distance from the anchor with no new code.
- Record the compass tier the learner needed before each catch. The HUD already tracks a `PrimaryCue` of texture, interval, place, direction, or none ([PianoEarSearchHud.tsx:75](../app/PianoEarSearchHud.tsx)). Store the tier in `recentProbes` so the next frame can default to one tier lower. This is adaptation without a score.

## 4. The Anchor Drill HUD

### 4.1 Concept

One anchor pitch is held in memory. Short hidden prompts arrive over time. The learner answers on the keyboard. A confusion grid, not a score, decides what comes next. A cold check, which already exists, decides when a second anchor is earned.

The learner's own instrument sounds their answer. The browser sounds only the prompt. That asymmetry is the lesson: the memory of the anchor is compared against a real key under the hand.

### 4.2 Learner flow

1. **Choose an anchor.** Reuses the `piano-absolute-pitch-anchor-v1` storage key so Absolute Pitch and the drill share one anchor.
2. **Hear it once.** `playTrainerTone(midi, "harmonic", true)` with the staff glow. After this the anchor is never replayed unless the learner asks, and asking resets that pitch class's spacing interval.
3. **Wait.** The HUD shows a quiet countdown to the next prompt, or a "Prompt now" button. Cadence is learner-chosen: manual, 1, 3, or 5 minutes.
4. **Prompt.** The browser plays one hidden tone. Sound and octave come from the schedule (4.4). No colour, no staff glow.
5. **Answer.** Either a silent MIDI or on-screen key press, or, with no keyboard, three buttons: same, above, below, plus an optional spacing chip from the Immersion character list.
6. **Feedback.** `earSearchProbeFeedback(probe, target, anchorLanding)` gives direction, proximity, pitch family, and interval width relative to the anchor. The HUD then plays the prompt tone and the learner's key in sequence, so the miss is heard as an interval, and fades in the pitch colour and Interval Glow cue for the target.
7. **Repeat.** The answer updates the confusion grid and the per-pitch-class due time.

### 4.3 Screen

Single column. Top: anchor swatch and name, next-prompt countdown, cadence control. Middle: the twelve-cell pitch-class ring from Absolute Pitch's colour wheel, with the anchor cell marked, cells dimmed by how far their due time is, and a faint link drawn from anchor to the last target after feedback. Bottom: the latest feedback line, the heard-versus-answered grid as a twelve-by-twelve heat table with row and column headers and a text summary of the three most confused pairs, and a visible "Clear this device's drill history" control.

The ambient grand-staff glow from Absolute Pitch is reused for feedback only. The `showPitchAttacks` branch at [PianoLab.tsx:4415](../app/PianoLab.tsx) keys on `isAbsolutePitchFocus`; widen it to an `isPitchStaffFocus` that includes the drill.

### 4.4 Model · `lib/piano-anchor-drill-model.ts`

Pure functions, seeded random, no DOM, following the Absolute Pitch model.

```ts
export const ANCHOR_DRILL_BASE_SPACING_MS = 90_000;
export const ANCHOR_DRILL_MAX_SPACING_MS = 7 * 24 * 60 * 60_000;
export const ANCHOR_DRILL_PROMPT_SOUNDS = ["harmonic", "mellow-piano"] as const;

export type AnchorDrillPrompt = {
  id: number;
  anchorPitchClass: number;
  targetMidi: number;
  sound: PianoSoundModelId;
  issuedAtMs: number;
};

export type AnchorDrillAnswer = {
  prompt: AnchorDrillPrompt;
  probeNotes: number[] | null;             // null when answered by buttons
  judgedDirection: "same" | "above" | "below" | null;
  judgedSemitones: number | null;          // spacing chip, folded to 0..12
  latencyMs: number;
};

export type AnchorDrillState = {
  version: 1;
  anchorPitchClass: number;
  confusion: number[][];                   // [heard][answered], 12 x 12 counts
  dueAtMs: number[];                       // per heard pitch class
  spacingMs: number[];                     // per heard pitch class
  answerCount: number;
};

export function createAnchorDrillState(anchorPitchClass: number, nowMs: number): AnchorDrillState;
export function anchorDrillCandidates(state: AnchorDrillState, level: number): number[];
export function nextAnchorDrillPrompt(state, level, nowMs, random): AnchorDrillPrompt;
export function anchorDrillFeedback(prompt, answer): EarSearchProbeFeedback;
export function recordAnchorDrillAnswer(state, answer, nowMs): AnchorDrillState;
export function anchorDrillWeakPairs(state, limit?): Array<{ heard: number; answered: number; count: number }>;
export function anchorDrillPromotionReady(state, latestColdCheck: ColdRecord | null): boolean;
export function parseAnchorDrillState(serialized: string | null): AnchorDrillState | null;
```

Rules:

- **Candidates.** Level 1 is the anchor alone versus distractors two or more semitones away, as `createAbsolutePitchPractice` does today. Each level adds the pitch class with the highest off-diagonal confusion count, not the next offset on a ladder. Ties fall back to the existing ladder.
- **Scheduling.** A pitch class is due when `nowMs >= dueAtMs[pc]`. Among due classes, pick the one with the largest confusion row sum, then random. If none is due, pick the soonest. A correct answer doubles that class's `spacingMs`, capped at the maximum. A miss resets it to the base and also halves the spacing of the class the learner answered, since confusion is symmetric.
- **Octave and sound.** Target octave is drawn from `ABSOLUTE_PITCH_OCTAVES`. Every fourth prompt uses the transfer sound so the memory is not tied to one timbre.
- **Feedback.** Build `target = { id, notes: [targetMidi] }` and `anchor = { id, notes: [anchorMidi at octave 4] }`, then call `earSearchProbeFeedback(probe, target, anchor, null, caught)`. A button answer synthesises a probe one semitone above or below the anchor so direction feedback still works; `intervalWidth` is `"unavailable"` for it.
- **Promotion.** A second anchor becomes available when the current anchor's row has at least twelve answers, its diagonal share is at or above the same 80 percent used by `absolutePitchPracticePassed`, and a cold check recorded after the drill started shows that anchor's pitch class correct in both sounds. The cold check stays in Absolute Pitch; the drill only reads `piano-absolute-pitch-cold-history-v1`.

### 4.5 Storage

The confusion grid and due times are the drill's whole state: 144 integers, 24 timestamps, one anchor. Store under `piano-anchor-drill-v1` in `localStorage` with the same `writeStorage`, `subscribeToStorage`, and `parseStorage` pattern as the Absolute Pitch HUD. Validate on read with `parseAnchorDrillState`, discard on any malformed field.

ADR 0003 reserves durable storage for learner-authored observations and keeps derived miss histories tab-scoped. Spaced scheduling cannot work tab-scoped. This proposal therefore asks for one ADR amendment: a bounded, device-local, deletable **scheduling state** class, defined as counts and timestamps that drive what is asked next and are never shown as a rate or ability. The Absolute Pitch cold-check history already lives in `localStorage` on the same reasoning, so this names an existing practice rather than opening a new one.

### 4.6 Registration touch points

| Where | Change |
| --- | --- |
| [PianoLab.tsx:218](../app/PianoLab.tsx) `FocusLens` | add `"anchor-drill"` |
| [PianoLab.tsx:398](../app/PianoLab.tsx) `FOCUS_LENSES` | primary tier, after Absolute Pitch: `{ id: "anchor-drill", label: "Anchor Drill", description: "Spaced prompts from one held pitch" }` |
| [lib/piano-session.ts:3](../lib/piano-session.ts) `PIANO_SESSION_LENSES` | add `"anchor-drill"`. PianoLab itself restores a saved lens through `normalizeFocusLens` against `FOCUS_LENSES` ([PianoLab.tsx:424](../app/PianoLab.tsx)), so this list only affects `parsePianoSessionSummary` consumers. `"absolute-pitch"` is already missing from it; add both so the two lists stay in sync. |
| [PianoLab.tsx:5526](../app/PianoLab.tsx) latch release | add to the silent-lens list so held screen keys release on entry |
| [PianoLab.tsx:6075](../app/PianoLab.tsx) and [PianoLab.tsx:6087](../app/PianoLab.tsx) | hide chord grouping and the frame state bar, as for Absolute Pitch |
| [PianoLab.tsx:4415](../app/PianoLab.tsx) `showPitchAttacks` | widen `isAbsolutePitchFocus` to include the drill |
| [PianoLab.tsx:6098](../app/PianoLab.tsx) | mount `<PianoAnchorDrillHud events={...} activeNotes={...} onPlayTone={playTrainerTone} onStopTone={stopTone} />` |
| `tests/accessibility-contract.test.mjs` | extend the pitch-glow test to the drill lens |
| `tests/rendered-html.test.mjs` | lens label appears in navigation |
| `package.json` `test` and `verify` | add `tests/piano-anchor-drill-model.test.ts` |
| `docs/model-cards.md` | new entry, text in 4.7 |
| README | milestone note; Technical Notes inventory |

The events prop uses the same `EarSearchHudEvent` shape as Sound Finder ([PianoEarSearchHud.tsx:54](../app/PianoEarSearchHud.tsx)), so the drill receives attacks from the shared MIDI bar without a new capture path.

### 4.7 Model-card boundary

> **Anchor Drill · `mwno-anchor-1`.** Inputs: one learner-chosen anchor pitch class, silent MIDI or on-screen key attacks, button answers, and a device-local confusion grid. Outputs: the next prompt, direction and width cues relative to the anchor reusing the Sound Finder probe feedback, per-pitch-class spacing intervals, and a list of most-confused pairs. Spacing doubles on a correct answer and resets on a miss; these are scheduling choices, not a memory model. The grid counts recorded answers under one timbre set and three octaves. It is not a measure of absolute pitch, ability, talent, or progress, does not read acoustic pitch from the learner's instrument, and does not claim the learner hears the anchor internally. Promotion to a second anchor is gated by the existing cold check and is a practice-flow choice, not a certification.

### 4.8 Test plan · `tests/piano-anchor-drill-model.test.ts`

Seeded random throughout, as in `piano-absolute-pitch-model.test.ts`.

1. `createAnchorDrillState` yields a zero grid, all classes due now, base spacing.
2. Level 1 candidates are the anchor plus distractors at least two semitones away. Level 2 adds the most-confused class; with a zero grid it falls back to the offset ladder.
3. `nextAnchorDrillPrompt` prefers due classes, then highest confusion row, and never repeats the previous target pitch class when another is due.
4. A correct answer doubles spacing up to the cap; a miss resets the heard class and halves the answered class.
5. `anchorDrillFeedback` with a key two semitones above the target reports `pitchDirection: "lower"`, `proximity: "near"`, and width relative to the anchor; with a button answer, width is `"unavailable"`.
6. Every fourth prompt uses the transfer sound; octaves cycle through 3, 4, 5.
7. `anchorDrillPromotionReady` is false with fewer than twelve answers, false without a post-start cold check, true when both conditions and the 80 percent diagonal share hold.
8. `parseAnchorDrillState` rejects a grid with the wrong shape, negative counts, or non-finite timestamps, and accepts a round-tripped state.
9. Grid and timestamp arrays stay bounded regardless of answer count.

### 4.9 Phasing

- **Phase 1.** Model, tests, standalone lens, storage, model card. The reworks in sections 2 and 3 are independent and can land before or after.
- **Phase 2.** A persistent anchor bar in the shared MIDI input strip that can fire a prompt in any Piano lens. This is the actual accelerator, since prompts then interleave with Immersion and Sound Finder work. It needs the Immersion predict-mode miss forwarding from section 2.
- **Phase 3.** Two anchors, with the second chosen by promotion. Prompts then ask which anchor the target is nearest, which is the first step from one memorised pitch to a map.
