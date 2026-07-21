# Music With No Names — Development Roadmap

Status: implementation underway
Last updated: 2026-07-18

## North star

Build an interactive, audible way to understand music without treating note names, piano geometry, twelve-tone equal temperament, chord labels, or Western scale names as the fundamental objects.

The project will represent music through:

- Physical sound: frequency, spectrum, amplitude, envelope, onset, duration, and space.
- Invariant relationships: frequency ratios, log-frequency distance, duration ratios, phase within a pulse, and transformations over time.
- Human auditory consequences: periodicity, harmonicity, fusion, beating, roughness, masking, pitch salience, and stream segregation.
- Musical organization: pulse, meter, motif, recurrence, voice motion, center formation, tension, surprise, and resolution.
- Listener-conditioned experience: familiarity, cultural learning, bodily entrainment, attention, memory, purpose, emotion, and pleasure.

The core thesis is:

> Musical goodness is not a property stored in a waveform. It is a changing relationship among sound, sequence, listener, context, and purpose.

Formally, the application should eventually model a response distribution:

```text
response(t) ~ P(
  response
  | sound-history,
    perceptual-history,
    listener,
    familiarity,
    goal,
    context
)
```

The response is a vector—such as tension, pleasure, arousal, groove, interest, recognition, and felt resolution—not a universal quality score.

## Success criteria

The project succeeds when a curious listener can:

1. Hear and see why simple ratios can fuse without being told conventional interval names.
2. Understand why the same ratio changes character with timbre, register, voicing, loudness, and duration.
3. Build multi-tone relationships and inspect common periodicity, partial alignment, beating, and voice motion.
4. Experience rhythm as duration ratios and phase relationships rather than only conventional meter notation.
5. See how repetition, uncertainty, surprise, and resolution unfold over several timescales.
6. Load or select an existing recording and trace it through physical, perceptual, structural, and experiential views.
7. Compare pop, blues, classical, and other traditions as overlapping clouds of strategies—not rigid genre boxes.
8. Build a personal response map that explains preferences without claiming that preference is universal truth.
9. Use the application without needing prior music theory knowledge or a piano-shaped mental model.

## Product principles

1. **Relations first, labels second.** The core model stores continuous frequency, ratios, and time. Conventional names may appear only as an optional translation layer.
2. **Invariant plus embodied.** Preserve ratio-level invariants and absolute realization in hertz, seconds, loudness, and register. Human hearing is not scale-invariant.
3. **The spectrum is not the listener.** Raw signal analysis must pass through ear-relative representations such as auditory bands and temporal integration.
4. **No consonance meter.** Harmonicity, roughness, familiarity, stability, and liking remain distinct.
5. **Music is temporal.** A moment is interpreted using what preceded it and what it predicts.
6. **A song is a path, not a point.** Summaries may locate a recording, but its trajectory and section changes remain visible.
7. **A genre is a cloud, not a boundary.** Genre regions require a declared corpus, era, and recording set.
8. **A composition is not always the recording.** Composition, performance, and production get separate layers.
9. **Models expose uncertainty.** Inter-listener disagreement and model uncertainty must be shown separately.
10. **Learning is part of the product.** Controlled A/B transformations are more important than unexplained metrics.
11. **Audio stays safe.** Prevent clicks, runaway gain, clipping, and unexpected playback.
12. **Accessibility is foundational.** Every visual needs a textual interpretation; every interaction must work without color-only meaning.

## Non-goals for the first release

- Replacing staff notation for professional performers.
- Proving that one tuning system, genre, or theory is naturally superior.
- Assigning universal emotions to ratios, chords, modes, or genres.
- Automatically judging whether a song is objectively good.
- Perfectly transcribing arbitrary polyphonic recordings.
- Shipping copyrighted commercial recordings without explicit rights.
- Using an opaque machine-learning embedding as the primary explanation.
- Building a full digital audio workstation, streaming service, or social network.

## Conceptual architecture

### Representation layers

| Layer | Core quantities | Human relevance | Primary view |
|---|---|---|---|
| Physical | Hz, partial amplitudes, phase, envelope, SPL, onset time | What reaches the ear | Waveform and spectrum |
| Auditory | Auditory-band energy, modulation, masking, periodicity evidence | Roughness, fusion, pitch salience, timbre | Cochlear spectrum and periodicity view |
| Relational | Frequency ratios, log distances, prime exponents, duration ratios | Interval and rhythm invariants | Ratio field and harmonic lattice |
| Gestural | Pitch, timing, dynamics, and articulation residuals | Bend, swing, phrasing, expression | Continuous gesture trace |
| Structural | Pulse hypotheses, recurrence, motifs, center distribution, voice motion | Groove, coherence, tonality, form | Timeline and self-similarity view |
| Predictive | Entropy before events, surprise after events, expected alternatives | Tension, anticipation, learning | Probability fan and surprise trace |
| Experiential | Tension, arousal, groove, liking, recognition, meaning | Musicality as lived | Response braid and personal terrain |

### Required timescales

| Horizon | Typical phenomena |
|---|---|
| 1–50 ms | Attack shape, phase-sensitive transients, localization, fine modulation |
| 20–500 ms | Roughness, timbre, pitch evidence, onset grouping |
| 200 ms–3 s | Pulse, swing, syncopation, short gestures |
| 2–30 s | Motifs, phrases, local tension, call and response |
| 30 s–minutes | Section contrast, delayed return, buildup, formal payoff |
| Repeated listening–lifetime | Familiarity, style learning, identity, autobiographical meaning |

No single analysis window may be presented as a complete account of musicality.

### Core domain objects

The initial data contracts should support these concepts without committing the UI to conventional theory:

```text
SoundSource
  fundamentalHz?
  partials[]
  noiseProfile?
  envelope
  gain
  spatialPosition?

MusicalEvent
  onsetSeconds
  durationSeconds
  ratioToReference?
  absoluteFrequencyHz?
  sources[]
  gesture

PerceptualFrame
  timestamp
  roughness
  harmonicityCandidates[]
  periodicityCandidates[]
  pitchSalience
  brightness
  loudness
  spectralFlux

StructuralFrame
  pulseCandidates[]
  phaseWithinPulse
  centerDistribution[]
  recurrence
  expectedEvents[]
  entropy
  surprise

ResponseObservation
  listenerProfileId
  timestampOrRange
  goal
  context
  familiarity
  tension
  arousal
  urgeToMove
  interest
  pleasure
  feltResolution

Landmark
  workMetadata
  recordingMetadata
  provenance
  compositionLayer?
  performanceLayer?
  productionLayer?
  analysisVersion
  analysisSeries[]
  curatorialHypotheses[]
  listenerResponses[]
```

Measured features, model predictions, curatorial interpretations, and listener reports must have distinct types and visual treatments.

## Product surfaces

### 1. Ratio Lab

A continuous, audible workspace for one or more oscillators. It reveals wave repetition, partial coincidences, near-collisions, harmonicity, and register/timbre effects.

### 2. Rhythm Lab

A pulse-relative workspace for onset positions, duration ratios, phase, syncopation, swing, microtiming, and motor invitation.

### 3. Journey

An aligned timeline for a phrase or recording. It shows physical, perceptual, structural, predictive, and reported-experience lanes on one time axis.

### 4. Acoustic Microscope

A drill-down at a selected instant or gesture: auditory spectrum, partial interactions, periodicity, continuous ratios, pulse phase, and predicted alternatives.

### 5. Experience Atlas

Recordings appear as directed trajectories through interpretable experiential dimensions. Genre clouds, listener-response terrain, and uncertainty can be overlaid without turning genres or songs into fixed essences.

### 6. Personal Lens

Brief A/B experiments and ratings teach the system a listener’s preferences for sensory tension, surprise, groove, coherence, expression, and purpose.

## Working technology decisions

These are defaults for implementation, not irreversible commitments. Material changes should be captured in short architecture decision records.

- Language: TypeScript with strict type checking.
- Application: React with Vite for a fast, static-first web application.
- Package manager: pnpm.
- Audio playback: Web Audio API.
- Low-latency synthesis: native audio nodes first; AudioWorklet when sample-level processing is required.
- Heavy analysis: Web Workers so audio and UI remain responsive.
- Visualization: SVG for explanatory plots and interaction; Canvas for dense real-time spectra or waveforms.
- Storage: local browser storage/IndexedDB for settings, analyses, and personal ratings.
- Backend: none for the MVP. Audio remains on the device.
- Tests: Vitest for math and state; browser-level interaction and accessibility tests for product flows.
- Deployment: static hosting after the local experience is stable.
- Performance rule: adopt WebAssembly only after profiling demonstrates a real need.

## Development phases

Each phase has a stable work-package prefix so later tasks can be requested and executed by ID.

### F0 — Foundation and scientific guardrails

Objective: create a reliable project skeleton and make the conceptual distinctions enforceable in code.

- [x] **F0.1** Scaffold the TypeScript application, linting, formatting, tests, and production build.
- [x] **F0.2** Create architecture decision records for the stack, audio lifecycle, storage, and visualization approach.
- [x] **F0.3** Define units and core domain types. Use explicit suffixes such as `Hz`, `Seconds`, and `Ratio` to prevent accidental mixing.
- [x] **F0.4** Implement shared math utilities for ratios, log-frequency distance, rational approximation, prime factorization, and safe normalization.
- [x] **F0.5** Establish audio safety: master limiter, conservative gain defaults, short attack/release ramps, and explicit user-started playback.
- [x] **F0.6** Add deterministic generated signal fixtures for unison, 2:1, 3:2, 5:4, close beating tones, harmonic spectra, and inharmonic spectra.
- [x] **F0.7** Create a glossary distinguishing frequency, pitch, interval, harmonicity, roughness, consonance, stability, tension, pleasure, and goodness.
- [x] **F0.8** Add a research ledger that ties empirical UI claims to sources and records known limitations.

Exit gate:

- The app builds and tests cleanly.
- Audio can be started and stopped without clicks or unexpected autoplay.
- All core quantities use explicit units.
- No core type requires a note name, key, chord label, or twelve-tone pitch class.

### R1 — Ratio Lab vertical slice

Objective: deliver the first complete learn-by-hearing experience.

- [x] **R1.1** Create a reference oscillator whose displayed identity is `1` plus its physical frequency in hertz.
- [x] **R1.2** Add a second oscillator controlled continuously from ratio 1:1 through 2:1.
- [x] **R1.3** Show optional small-integer landmarks without snapping by default.
- [x] **R1.4** Draw both component waveforms and their summed waveform.
- [x] **R1.5** Detect and show the combined repetition period for rational relationships.
- [x] **R1.6** Draw a spectrum with matching partials and near-collisions visibly distinguished.
- [x] **R1.7** Add sine and harmonic-complex timbres.
- [x] **R1.8** Support transposition of the absolute reference while preserving the ratio.
- [x] **R1.9** Add concise, accessible explanations of what changed physically and what stayed invariant.
- [x] **R1.10** Add shareable local presets for 1:1, 2:1, 3:2, 4:3, 5:4, 6:5, 16:15, and an equal-tempered half-octave.

Exit gate:

- A user can predict when a waveform will repeat and relate that to what they hear.
- Changing the reference frequency preserves ratio geometry but reveals audible register effects.
- The experience is useful with no conventional interval names visible.

Release candidate: **v0.1 — Ratio Lab**

### A2 — Human auditory reality

Objective: connect ideal frequency mathematics to the behavior of an actual auditory system.

- [x] **A2.1** Add editable partial spectra, harmonic rolloff, controlled inharmonicity, and noise components.
- [x] **A2.2** Add register, loudness, envelope, and spacing controls.
- [x] **A2.3** Implement an auditory-filterbank view rather than relying only on a raw Fourier spectrum.
- [x] **A2.4** Implement at least one documented roughness model and expose its assumptions.
- [x] **A2.5** Implement harmonicity/periodicity measures separately from roughness.
- [x] **A2.6** Show fusion as a model hypothesis, not as a synonym for liking.
- [x] **A2.7** Build controlled A/B experiments:
  - Same ratio, sine versus harmonic versus inharmonic timbre.
  - Same ratio, low versus middle versus high register.
  - Same fundamentals, different partial amplitudes.
  - Same spectrum, different envelope and duration.
- [x] **A2.8** Let users rate sensory smoothness, fusion, tension, and liking independently.
- [x] **A2.9** Store model predictions and human ratings separately for later comparison.

Exit gate:

- The app demonstrates that ratio alone does not determine roughness or preference.
- Roughness and harmonicity can visibly diverge.
- Every displayed psychoacoustic measure states its model and uncertainty.

### H3 — Multi-tone harmony and motion

Objective: move from dyads to global spectral organization and voice motion without reverting to chord names.

- [x] **H3.1** Support three to six simultaneous sources with independent spectra, register, and amplitude.
- [x] **H3.2** Represent a sonority as a normalized ratio set plus its absolute realization.
- [x] **H3.3** Detect candidate common subharmonics and visualize competing interpretations.
- [x] **H3.4** Add prime-exponent coordinates for 2-, 3-, 5-, and 7-based relationships.
- [x] **H3.5** Build an octave-optional harmonic lattice; octave folding must be a view choice, not an implicit truth.
- [x] **H3.6** Calculate voice-leading distance as continuous log-frequency motion.
- [x] **H3.7** Let users morph between just relationships and equal-tempered approximations while hearing the difference.
- [x] **H3.8** Add instructive fields such as 4:5:6, 10:12:15, 4:5:6:7, and deliberately inharmonic sets.
- [x] **H3.9** Create a sequence mode in which one or more voices move while others remain fixed.
- [x] **H3.10** Show why an internally smooth sonority can still feel contextually unstable.
- [x] **H3.11** Link physical realization → auditory evidence → structural reading → conditional emotional affordances, with inspectable drivers, comparison landmarks, and no universal emotion assignment.

Exit gate:

- Users can distinguish global common-period structure from a list of pairwise intervals.
- Chord changes are visible as voice trajectories and changing spectral relationships.
- The system never labels a sonority’s emotional meaning as universal.

### T4 — Rhythm, meter, and embodiment

Objective: give time the same first-principles treatment as frequency.

- [x] **T4.1** Create a pulse-relative timeline with continuous onset placement.
- [x] **T4.2** Represent durations as ratios to a chosen or inferred pulse.
- [x] **T4.3** Show multiple pulse hypotheses and their confidence rather than forcing one meter.
- [x] **T4.4** Visualize phase within nested cycles.
- [x] **T4.5** Add swing and microtiming as continuous deviations from an inferred grid.
- [x] **T4.6** Implement a transparent syncopation measure.
- [x] **T4.7** Keep pulse clarity and groove conceptually and computationally separate.
- [x] **T4.8** Build low-, medium-, and high-syncopation A/B experiments on the same pulse.
- [x] **T4.9** Test the same duration ratios across different absolute tempos.
- [x] **T4.10** Add optional tapping input to compare inferred pulse with the listener’s embodied pulse.

Exit gate:

- A rhythm can be created and understood without a `4/4` label.
- The user can hear that identical ratios at different tempos are not perceptually identical.
- The UI demonstrates that groove is structured conflict with a pulse, not timing perfection alone.

Release candidate: **v0.2 — Ratio and Rhythm Labs**

### P5 — Pattern, prediction, and musical form

Objective: explain tension, surprise, coherence, and payoff as temporal phenomena.

- [x] **P5.1** Define a generic event sequence combining frequency relationships, onsets, durations, amplitude, and timbre.
- [x] **P5.2** Detect exact recurrence and transformed recurrence.
- [x] **P5.3** Build a self-similarity view for motifs, loops, phrases, and sections.
- [x] **P5.4** Implement a simple, inspectable piece-local prediction model before considering learned neural models.
- [x] **P5.5** Display uncertainty before an event and surprise after it.
- [x] **P5.6** Support multiple prediction models: piece-local, synthetic-corpus, and listener-personalized.
- [x] **P5.7** Build a human-response braid with separate lanes for roughness, harmonicity, pulse confidence, repetition, uncertainty, surprise, tension, and ratings.
- [x] **P5.8** Mark buildup, expectation violation, return, and release as hypotheses that can be confirmed or rejected by the listener.
- [x] **P5.9** Demonstrate that local unpleasantness can contribute to a satisfying larger arc.
- [x] **P5.10** Add experiments for repetition, repetition-with-variation, expected versus unexpected context, and delayed resolution.

Exit gate:

- A selected musical moment can be explained using both local acoustics and preceding context.
- The system does not compute whole-piece quality by averaging momentary consonance or pleasure.
- Prediction models reveal their training context and alternatives.

### I6 — Recording import and analysis pipeline

Objective: connect the controlled labs to real recordings while preserving uncertainty and provenance.

- [x] **I6.1** Add explicit local-file audio import. Do not upload audio for the MVP.
- [x] **I6.2** Decode audio and compute versioned, multi-resolution analysis frames in a worker.
- [x] **I6.3** Extract loudness, spectral balance, spectral flux, onset strength, and auditory-band energy.
- [x] **I6.4** Estimate periodicity, harmonicity candidates, pitch salience, and roughness with confidence values.
- [x] **I6.5** Estimate pulse candidates, onset phase, tempo changes, and syncopation.
- [x] **I6.6** Detect recurrence and candidate section boundaries.
- [x] **I6.7** Preserve continuous frequency evidence; do not reduce the master representation immediately to twelve chroma bins.
- [x] **I6.8** Add user-correctable hypotheses for pulse, center, sections, and source events.
- [x] **I6.9** Export and re-import a portable analysis JSON file without the copyrighted audio.
- [x] **I6.10** Build test fixtures from generated mixtures and openly licensed recordings with known provenance.

Exit gate:

- Analysis never blocks playback or primary interaction.
- Every derived feature identifies its time window, model version, and confidence.
- A user can correct important analysis mistakes.
- The app distinguishes limitations of mixed-audio analysis from facts about the music.

### J7 — Journey and Acoustic Microscope

Objective: make a real recording inspectable from whole form down to partial interactions.

- [x] **J7.1** Create one aligned, zoomable timeline for audio, sections, physical features, perceptual features, prediction, and ratings.
- [x] **J7.2** Support timescales from milliseconds to the whole recording without changing the underlying event identity.
- [x] **J7.3** Selecting any time range opens the Acoustic Microscope.
- [x] **J7.4** Show auditory spectrum, partial collisions, periodicity candidates, continuous ratio evidence, onset phase, and expected alternatives for the selection.
- [x] **J7.5** Explain a model estimate through visible contributing evidence rather than a black-box number.
- [x] **J7.6** Add counterfactual A/B transforms that preserve the gesture while changing one factor such as roughness, register, timbre, syncopation, or repetition.
- [x] **J7.7** Allow annotations for perceived section, tension, release, surprise, and personal significance.

Exit gate:

- A pleasure or tension peak can be traced to concurrent evidence at several timescales.
- The interface makes correlation versus causal manipulation visibly distinct.
- Counterfactuals change only the declared factor within documented limits.

Release candidate: **v0.3 — Recording Journey**

### L8 — Landmark atlas and genre clouds

Objective: orient users with familiar music while avoiding genre essentialism and copyright problems.

- [x] **L8.1** Define a versioned landmark schema with work, performance, production, recording, provenance, and licensing metadata.
- [x] **L8.2** Represent every landmark as a trajectory with section markers, not just a centroid.
- [x] **L8.3** Keep measured features, curator hypotheses, and listener reports visually distinct.
- [x] **L8.4** Build an atlas with interpretable selectable axes such as sensory tension, predictive surprise, pulse clarity, activation, repetition, and long-form transformation.
- [x] **L8.5** Encode inter-listener variation separately from model uncertainty.
- [x] **L8.6** Construct genre regions from declared corpora and display porous overlapping density clouds.
- [x] **L8.7** Add a composition/performance/production layer switch.
- [x] **L8.8** Create the first landmark set:
  - A generated 4:5:6 harmonic field.
  - Bach, *Prelude in C major*, BWV 846.
  - Beethoven, Symphony No. 5, first movement.
  - Stravinsky, *The Rite of Spring*, “Augurs of Spring.”
  - B.B. King, “The Thrill Is Gone.”
  - Muddy Waters, “Mannish Boy.”
  - Billie Eilish, “bad guy.”
  - The Weeknd, “Blinding Lights.”
- [x] **L8.9** Use openly licensed recordings where available; otherwise provide metadata and analysis profiles while requiring the user to load audio they are entitled to use.
- [x] **L8.10** Add comparisons that expose where novelty tends to live:
  - Pop: stable pulse/loop with variation in production, voice, and sectional energy.
  - Blues: stable cyclic frame with continuous pitch, timing, interaction, and timbral variation.
  - Selected classical works: motif transformation, orchestration, center movement, and longer-range formal memory.

Exit gate:

- Genre clouds overlap and always declare their corpus.
- Different recordings of the same composition can trace different paths.
- Commercial audio is never bundled without rights.
- Curatorial placements are labeled as hypotheses until measured and tested.

Release candidate: **v0.4 — Music Atlas**

### G9 — Listener-conditioned goodness

Objective: visualize musical value honestly as personal, multidimensional, goal-relative, and uncertain.

- [x] **G9.1** Add separate continuous ratings for liking, tension, arousal, urge to move, interest, familiarity, and felt resolution.
- [x] **G9.2** Add optional listening goals such as dance, relaxation, focus, curiosity, comfort, and catharsis.
- [x] **G9.3** Build short calibration experiments using controlled transformations from the Labs.
- [x] **G9.4** Fit a transparent personal response surface with uncertainty.
- [x] **G9.5** Visualize a listener’s preferred region over the atlas without labeling the region objectively good.
- [x] **G9.6** Show a goal-relative fit profile containing:
  - Sensory fit.
  - Prediction reward.
  - Motor fit.
  - Expressive salience.
  - Coherence and transformation.
  - Narrative payoff.
  - Personal resonance.
- [x] **G9.7** When a scalar is necessary, label it `predicted fit for this listener and goal` and show its uncertainty and component breakdown.
- [ ] **G9.8** Let users compare their response terrain with an anonymized cohort only after explicit consent and only if a backend is deliberately added. (A no-data architecture, consent sequence, minimal schema, aggregation rules, deletion model, and launch decision checklist are published; implementation remains intentionally unauthorized.)
- [x] **G9.9** Show how familiarity and repeated listening alter predictions and responses over time.
- [x] **G9.10** Provide a delete/export flow for all personal ratings and learned preferences.

Exit gate:

- Two listeners can receive different maps without either being treated as wrong.
- Tense, sad, rough, or surprising music can still be represented as pleasurable.
- No screen silently converts consonance, popularity, familiarity, or model confidence into goodness.

### S2.5 — Transposable scales and inner hearing

Objective: teach scales as octave-closing relationship patterns, using movable syllables and physical geometry instead of absolute note letters.

- [x] **S2.5.1** Add a movable-Do Scale Lab whose relational structure survives changes of reference frequency.
- [x] **S2.5.2** Render scale steps as proportional logarithmic-frequency arcs and rails, including a 3 · 2 · 2 · 3 · 2 five-degree fingerprint.
- [x] **S2.5.3** Separate sensory interaction, context-dependent pull, and listener-dependent musical value at the selected-degree level.
- [x] **S2.5.4** Show equal-division ratios beside nearby small-integer landmarks without presenting the approximation as the scale’s identity.
- [x] **S2.5.5** Add a safe listen–imagine–reveal exercise for inner hearing.
- [x] **S2.5.6** Test octave closure, cyclic rotation, transposition invariance, responsive layout, keyboard semantics, and forced-color states.
- [x] **S2.5.7** Replace the explanatory dashboard with a progressive feel-home → walk-distance → predict-motion lesson.
- [x] **S2.5.8** Correct the five-step chromatic solfège overlay and distinguish true transposition from modal re-centering.
- [x] **S2.5.9** Make gap categories physically invariant across presets and disclose the 2:1 octave / twelve-equal-slice coordinate choice.
- [x] **S2.5.10** Match harmonic-complex playback to simultaneous-spectrum evidence and keep it separate from melodic-interval explanation.
- [x] **S2.5.11** Add context A/B listening with learner reports before interpretation.
- [x] **S2.5.12** Replace modulo-wrapped passive reveals with scale-specific retrieval-and-correction phrases.

Exit gate:

- A learner can move Do or its absolute frequency and explain what remains invariant.
- A learner can read small, medium, and large scale gaps without translating them into note letters.
- No physical metric is presented as a universal measure of stability, emotion, or goodness.

### K2.6 — Piano and MIDI relationship bridge

Objective: introduce a piano as a silent, interactive translation of the existing ratio, interval, scale, and auditory models without making keyboard geometry or note letters foundational.

- [x] **K2.6.1** Add a two-octave on-screen piano whose keys are labeled by movable-Do role relative to a changeable home.
- [x] **K2.6.2** Add local, analysis-only Web MIDI input with permission-aware connection, device selection, note-on/off, velocity, and sustain-pedal handling; never synthesize, record, or route audio from Piano Lab input.
- [x] **K2.6.3** Keep conventional note, scale, and interval names behind an optional translation layer.
- [x] **K2.6.4** Add bright seven-pitch, shadow seven-pitch, open five-pitch, and blues six-pitch routes with octave-closing physical gap fingerprints.
- [x] **K2.6.5** Restore a live ascending scale walk that accepts Do in any MIDI octave and follows note-on events with corrective feedback. Guided Scale Walk v1.38 freezes the selected relational frame, preserves progress after a wrong gap, and connects each next physical move to frequency, ratio, fifths position, and performed tonal context without sounding or entering an answer.
- [x] **K2.6.6** Represent each held field as a pairwise interval network plus separate harmonic-fit, spectral-friction, pitch-span, and selected-route-membership evidence.
- [x] **K2.6.7** Restore controlled sonority starting fields with conditional affordance language and no combined listenability, emotion, consonance, or quality score. Controlled Sonority Fields v1.39 restores four silent physical recipes plus a learner-supplied field inside the existing Chords focus.
- [x] **K2.6.8** Extend the current fifths compass into the full derivation from repeated 3:2 moves, octave folding, equal-key approximation, and the visible 23.5-cent pure closure mismatch.
- [x] **K2.6.9** Allow any fifths position to become the new movable Do while preserving the relationship-first representation.
- [x] **K2.6.10** Test MIDI parsing, transposition invariance, scale closure, interval landmarks, fifths geometry, semantic interaction, forced colors, and responsive layout contracts.
- [x] **K2.6.11** Add ranked scale-and-center compatibility, held-note fifths highlighting, modeled crunch, tonal pull, repose/arrival evidence, and a multi-state descriptor trace while keeping every output separate from musical quality.
- [x] **K2.6.12** Consolidate Piano Lab into one always-visible HUD: preserve the last seven note-on attacks (including repetitions), align staff and log-frequency plots, number visits on a fixed fifths compass, stabilize changing scale frames, distinguish exact chords from outlines, rank nearby chord moves by retained tones, visualize sustain, and coordinate separate crunch, pull, arrival, leap, and voice-motion traces.
- [x] **K2.6.13** Add an explicit temporal chord-gesture layer with adjustable attack-gap granularity and a hard maximum span; keep attacked membership separate from inherited held/pedal context, align selectable chord brackets across the seven-event HUD, and add chord-level crunch, pull, arrival, pitch-set novelty, voice motion, and exact-root fifths travel without combining them into a quality score.
- [x] **K2.6.14** Audit and polish the chord HUD: prevent incomplete outlines from implying exact identity or a known fifths root, hide neighbor suggestions until a source field exists, realize suggested chords with economical register-aware voice leading, enlarge essential labels, simplify copy, and verify narrow/wide interaction without horizontal clipping.
- [x] **K2.6.15** Establish Guided Live Phrase v1.29: preserve the seven-event specimen across lab changes in one tab; capture key release, sounding duration, velocity, and pedal extension; add Explore, Intervals, Scales, Chords, and Motion practice lenses; implement Interval Echo, causal chord deltas, correctable chord boundaries, active-lab URLs, and a prominent assumed-sound disclosure.
- [x] **K2.6.16** Expand Phrase Memory + Voice Leading v1.30: retain a bounded sixty-second phrase behind the seven-attack microscope; trace explicit nearest voice strands and parallel/contrary/oblique motion; replace answer-entering nearby chords with silent ghost targets the learner performs; persist the target and encode the selected Piano lens in the URL.
- [x] **K2.6.17** Add Scale Fingerprint + Tonal Gravity v1.31: expose cyclic scale-gap strings and view-only rotations before theory names; rank competing sounded centers from separately visible route, duration, recurrence, attack, low-register, and ending evidence; offer frozen silent resolution forks the learner performs; and derive the stable frame from phrase memory rather than the truncated microscope.
- [x] **K2.6.18** Add Gesture + Motif v1.32: separate finger contact, pedal extension, sounding overlap, and silence in a seven-attack articulation lane; classify local touch connections with tempo-relative timing evidence; detect exact, transposed, rhythmically varied, altered-ending, and returning three- or four-attack motifs across phrase memory; and turn each match into a one-property practice prompt inside the Motion focus.
- [x] **K2.6.19** Add Playable Landmark Paths v1.33: define generated, transposable pop-loop, blues-cycle, classical-cadence, and pedal-point archetypes; lock the current Do while practicing; create stable close-position ghost voicings; advance only after exact learner-performed pitch-class matches in any octave; and explain every transition through carried tones, nearest-voice motion, fifths travel, and separate modeled texture/tendency evidence without reproducing a recording or treating the archetype as a song-level universal.
- [x] **K2.6.20** Add Personal Character Map v1.34: freeze a live phrase for reflection; collect settledness, energy, surprise/familiarity, and liking one question at a time; map only explicit learner reports with sample count, spread, and uncertainty; compare transposition- and tempo-scale-invariant relationship signatures; keep measured MIDI facts, modeled proxies, and listener reports in separate evidence lanes; and connect local persistence, export, and deletion to the Personal Lens.
- [x] **K2.6.21** Add Assumed Sound Models v1.35: turn the hidden fixed timbre assumption into a persistent sine, harmonic, mellow-piano, or bright-piano choice; preview each spectral envelope as a partial comb; recompute only spectrum-dependent crunch, harmonic-fit, brightness, and spectral repose evidence; preserve MIDI positions, their derived reference frequencies, and all interval, scale, fifths, rhythm, tonal-pull, novelty, and listener-report evidence; and state explicitly that MIDI supplies no actual instrument audio.
- [x] **K2.6.22** Add First-Principles Fifths v1.36: build a thirteen-point repeated-3:2 spiral including the attempted return; step through octave folding; continuously morph each 701.955-cent pure fifth toward the 700-cent equal-key approximation; make the remaining 23.46-to-0-cent closure gap visible; let compass or spiral positions become movable Do without entering notes; and preserve the locked Do/scale frame in session state and the URL.
- [x] **K2.6.23** Add Chord Membership Correction v1.37: treat inherited held or pedal tones as visually distinct, correctable members of the automatic chord reading; let the learner exclude or restore each inherited MIDI note; propagate corrected membership through identity, tonal tendency, novelty, exact-root travel, nearby targets, causal comparison, and voice leading; preserve the correction in the tab; and keep the full physically sounding field, interval texture, and spectrum-dependent roughness invariant under the contextual correction.
- [x] **K2.6.24** Add Guided Scale Walk v1.38: arm a silent one-octave route from the current movable Do and scale; let Do in any MIDI octave establish or restart the register; require the exact ascending equal-key gaps through the upper Do; preserve completed progress after a wrong attack while explaining actual versus expected motion; mark one exact silent key target; expose next frequency, ratio from Do, interval landmark, fifths coordinate, and local center evidence; and persist the live exercise in the current tab.
- [x] **K2.6.25** Add Controlled Sonority Fields v1.39: choose one of four relation-defined starting fields or capture the learner's current exact MIDI notes; outline targets without producing sound or entering attacks; attribute an exact one-note addition or removal only to its gained or lost pairwise intervals; preserve separate physical, assumed-auditory, selected-context, and conditional-affordance lanes; expose assumed-spectrum sensitivity without changing interval or context facts; refuse the causal display when several notes change; and require the exact persisted baseline to be replayed before comparison resumes.
- [x] **K2.6.26** Add Live Pulse Mirror v1.40: reduce the Motion focus to one selected question—Pulse, Touch, Voices, or Motif—without changing the underlying phrase; let the learner declare a pulse by repeating one key four times; reject implausibly fast or slow anchors; group near-simultaneous attacks before timing analysis; place later onset clusters around an eight-pulse coordinate; compare phase and inter-onset gaps with simple fractional landmarks; persist the source-tap identity and selected question in the tab and URL; expire rather than silently replace a pulse whose source taps leave phrase memory; and never turn the coordinate into meter, notation, groove quality, timing accuracy, or musical goodness.
- [x] **K2.6.27** Add Performed Scale Fingerprints v1.41: let the learner author an unnamed strictly ascending route from any first MIDI key; close only at the exact twelve-key, 2:1 octave; render accepted positions and proportional ordered gaps as they are performed; preserve the valid prefix after descending, overshooting, or wrong replay attacks; test the same fingerprint from a new key; rotate which cyclic gap follows the starting point; delay conventional catalog translations until explicit reveal; persist the active exercise in the tab; mark only silent replay targets; and hide unrelated scale diagnostics while an exercise is active so the HUD answers one question at a time.
- [x] **K2.6.28** Add Tonal Gravity Counterfactuals v1.42: freeze the learner's performed phrase; select one sounded position and one contextual evidence lane; reassign only that complete lane while preserving route fit, every other component, and every MIDI event; compare all twelve center rankings before and after with shape-redundant marks; state the exact rank and component change; provide a corresponding hands-on replay invitation; persist the frozen experiment and locked frame in the tab and URL; hide unrelated scale diagnostics while active; and refuse key detection, listener simulation, tension, liking, or musical-quality claims.
- [x] **K2.6.29** Add Five-Lens Phrase A/B v1.43: freeze a recent learner-bounded phrase; capture a live replay after an explicit anchor; compare measured sound-coordinate, signed-interval, normalized-timing, and modeled-context evidence without averaging across units; reserve settledness, energy, and liking for three independent learner reports; identify transposition and proportional timing invariants; lock the movable-Do frame across A and B; persist specimens, reports, and active phase in the tab; hide unrelated Explore diagnostics while active; support replay-again and B-as-new-A iteration; and refuse similarity, musicality, causation, emotion, or goodness scores.
- [x] **K2.6.30** Add Companion-First Navigation v1.44: make Start, Piano, and Personal Lens the persistent top-level choices; group specialist labs by pitch relationships, time and listening, and music as evidence; keep every lab keyboard reachable through a native disclosure; detect a valid tab-scoped Piano phrase without hydrating the whole analysis model; show its attack count and active learning lens while another lab is open; return to the same silent phrase with URL, movable-Do frame, scale, and lens intact; and verify narrow and wide layouts without inventing a musicality score or new dashboard.
- [x] **K2.6.31** Add One-Change Phrase Experiments v1.45: replace an undirected whole-phrase replay with six learner-declared investigations—transposition, timing, touch, articulation, one interval, or ending; freeze the intention with phrase A; compare phrase B against a transparent target threshold and intention-specific control condition; identify other changed and invariant five-lens coordinates without averaging them; persist the intention with the tab-scoped specimen; keep the selected Do and route fixed; and refuse execution scores, causal claims, or any claim that isolating one performed property explains the learner's response.
- [x] **K2.6.32** Add the Live Partial Interaction Microscope v1.46: pair a focused sounding note with its nearest sounding neighbor; render their selected assumed spectra as two aligned partial combs on one logarithmic frequency coordinate; distinguish near-coincident partials from the strongest non-aligned interaction zones with line, shape, and text redundancy; expose exact cents gaps, beat-rate coordinates, aggregate roughness, and spectral overlap separately; keep fundamentals fixed while the assumed spectrum changes; and state that the display neither analyzes DAW audio nor scores consonance, emotion, listenability, or musical goodness.
- [x] **K2.6.33** Add Interval Echo Invariance v1.47: freeze the performed source pair rather than only its unsigned distance; partition later attacks into independent two-note attempts; compare source and replay on one keyboard-position coordinate; identify equal-key span and ratio as invariant only after a match; expose uniform transposition, hand-center shift, direction, fundamentals, hertz gap, assumed-spectrum roughness, and overlap as separate changing coordinates; preserve the source after a mismatch; and refuse claims about fingering, actual audio, identical hearing, correctness, or musical quality.
- [x] **K2.6.34** Add the Selected Attack Five-Lens Microscope v1.48: replace the undirected Explore footer with one selected-event question; move the reading when a learner selects any visible attack; separate measured Sound, attributable-or-snapshot Relationships, measured Motion, modeled Context, and unclaimed Experience; permit one-note attribution only when the selected MIDI member is the sole addition and no note left; guard repeats, missing history, removal, and multi-change snapshots; hand the preserved phrase directly to listener reflection; and refuse aggregate similarity, correctness, emotion, listenability, or goodness.
- [x] **K2.6.35** Add Landmark Path Transposition v1.49: after a learner performs a generated landmark route, move the complete path to the next fifths neighbor without entering or sounding notes; restart at field one; display the changed center and physical targets beside invariant field order, roles, root offsets, and pitch-class shapes while admitting compact revoicing; preserve the learner's judgment of experiential similarity; and reset progress safely whenever Paths changes Do through the compass.
- [x] **K2.6.36** Add the One-Tone Path Counterfactual v1.50: after a generated route is performed, replay it at the same Do with exactly one declared MIDI key changed in one field and every other target held physically fixed; trace the changed note's interval distances, assumed-spectrum roughness/repose deltas, selected-context pull/home deltas, and route-level invariants separately; require a fresh complete performance; collect one optional listener report without deriving it from a model; persist the experiment in the tab; and refuse a combined goodness, correctness, emotion, or learning score.
- [x] **K2.6.37** Add the Live Phrase Landmark Bridge v1.51: safely project a valid tab-scoped Piano phrase into the Atlas; compare relationship recurrence, piece-local transition surprise, and timing activity with one selected curator-authored song hypothesis on separate inspectable lanes; preserve the live measurements while landmark selection changes; mark the timing-to-embodied-drive construct mismatch; provide a direct return to the same silent phrase; collapse advanced Atlas configuration behind a native disclosure; and refuse nearest-song ranking, style or emotion classification, causal interpretation, and aggregate goodness.
- [x] **K2.6.38** Add the Pitchless Phrase Rhythm Bridge v1.52: carry the same bounded, tab-scoped Piano phrase into Rhythm; remove pitch identity; collapse attacks within 70 ms into one onset group; use the median inter-group gap as a local ruler rather than an inferred beat; expose normalized gap lengths, nearby ratio landmarks, close recurrence, MIDI attack range, and release-based overlap or silence separately; make replay on new keys the one primary action; move the authored cycle instrument behind a native disclosure; and refuse meter, groove, intention, timing-accuracy, or goodness claims.
- [x] **K2.6.39** Add the Live Phrase Expectation Trail v1.53: carry the same tab-scoped Piano phrase into Journey; collapse attacks within 70 ms into field events; represent each event by transposition-invariant pitch shape, signed bass motion, and median-normalized onset spacing; learn continuation evidence incrementally from earlier events only; distinguish opening, no precedent, new continuation, and seen continuation without inventing listener expectation; state exactly what changed at the latest group; keep the generated journey behind a native disclosure; and preserve MIDI, model, and listener provenance as separate lanes.
- [x] **K2.6.40** Add the Live Chord Change Bridge v1.54: carry the same tab-scoped Piano phrase and its learner-corrected 80, 160, or 320 ms chord boundaries into Harmony; compare the latest two compact attacked fields as bass-relative shapes; draw shape-redundant nearest-key voice strands; keep equal-key interval landmarks, motion, fixed nine-partial sensory proxies, four conditional musical affordances, and unclaimed listener experience in separate lenses; ignore isolated melody attacks rather than manufacturing harmony; state that velocity is not acoustic level and inherited held or pedaled notes are not reconstructed; keep the generated Harmony instrument behind a native disclosure; and refuse actual-audio, emotion, preference, tonal-function, or goodness claims.
- [x] **K2.6.41** Add the Live Interval Assumption Bridge v1.55: carry the latest two valid Piano attacks into Ear; preserve measured equal-key motion, onset spacing, and release-proven overlap alongside derived equal-tempered ratios and A4=440 reference frequencies; compare four declared spectra only when the attacks demonstrably overlapped; separate sensory-friction, harmonic-fit, and fusion hypotheses from invariant relationship facts and listener experience; refuse simultaneous spectral evidence for sequential or release-unknown intervals; expose model partials and interaction counts without pretending to analyze acoustic pitch, the keyboard, or the DAW; and keep the generated Ear instrument behind a native disclosure.
- [x] **K2.6.42** Add Interval Context Echo v1.56: make the Piano Interval focus begin with one replay question; compare a frozen source and one independent two-attack echo through Relationship, Sound, Motion, Context, and Experience; preserve equal-key span and ratio only after a match; expose register, hertz gap, direction, onset gap, release-proven overlap, surrounding field size, and movable-Do roles as separate changing coordinates; compute selected-spectrum roughness and overlap only when both pairs demonstrably overlapped; accept safely shifted restored-session time coordinates; and place the interval network and assumed-partial microscope behind a native disclosure.
- [x] **K2.6.43** Add Interval Experience Handoff v1.57: let a matched source-and-echo comparison enter the Personal Character Map as one exact four-attack specimen; retain the whole live phrase; keep measured MIDI, assumed-spectrum models, and listener report visibly separate; tailor reflection copy to the comparison; persist the report locally; surface it in Personal Lens export/deletion; and verify the complete handoff at desktop and 390-pixel widths without horizontal overflow.
- [x] **K2.6.44** Add Chord Change Experience Handoff v1.58: make Chords focus ask one five-lens before-and-after question; compare the latest two learner-corrected grouped gestures through measured Sound and Relationships, interpreted Motion, modeled Context, and listener-only Experience without aggregation; freeze the exact two gestures for a four-question personal report; preserve that bounded specimen across focus changes until the learner explicitly returns to the whole phrase; reset it safely on Clear; persist it locally; surface it in Personal Lens export/deletion; and verify the complete flow at desktop and 390-pixel widths without horizontal overflow.
- [x] **K2.6.45** Add Chord Voicing Echo v1.59: turn Chords into three one-question modes while retaining one live phrase; freeze a compact learner-corrected chord field with its performed source evidence; recognize exact pitch-class identity or one uniform transposition separately from register, inversion, bass role, spacing, doubling, nearest-key motion, assumed-spectrum roughness, selected-Do context, and listener experience; keep the source stable across independent mismatches, focus changes, phrase-window pruning, and reload; hand only a matched source-and-revoicing specimen to the Personal Character Map; and verify the complete flow at desktop and 390-pixel widths without horizontal overflow.
- [x] **K2.6.46** Add Chord Motion Echo v1.60: extend the existing Two chords lesson rather than adding another focus; freeze two corrected performed fields; require both replay endpoints to share one modulo-twelve transposition before calling the whole transformation invariant; diagnose separately matching endpoints under inconsistent shifts; keep physical register, voicing, bass and nearest-key motion, assumed-spectrum paths, selected-Do context, and listener experience outside the match rule; bound retries explicitly; preserve the source across focus changes and reload; hand only a matched four-field specimen to Personal Character reflection; and verify source continuity, mismatch recovery, desktop behavior, and 390-pixel layout without overflow.
- [x] **K2.6.47** Add Tonal Frame Echo v1.61 inside a matched Chord Motion Echo: ask whether the tonal job travels with the reference frame; compare fixed Do with replay Do shifted by the exact structural transposition; update only replay-relative syllables and selected-context models; prove the original pull and home-evidence path returns when the scale route and Do move together; leave MIDI, frequency, spectrum, voicing, relationship identity, and listener experience unchanged; reset the presentation choice at every explicit retry; and verify native pressed states, forced colors, and a no-overflow 390-pixel layout.
- [x] **K2.6.48** Add Octave Fold v1.62 inside a matched Chord Voicing Echo: replace note-name and physical-register coordinates with a closed twelve-step loop of adjacent gaps; remove pitch-class doubling explicitly; choose one canonical cyclic rotation only as a comparison anchor; prove inversion and uniform transposition preserve the loop while a changed third does not; toggle between physical and folded views without changing MIDI or any five-lens evidence; reset the reveal for every new performed attempt; and verify native pressed state, non-color shape distinctions, forced colors, and a no-overflow 390-pixel layout.
- [x] **K2.6.49** Add Gap Mutation v1.63 to the same Chord Voicing Echo: recognize only an equal-sized field with exactly one replaced unique octave position and at least two retained positions; align both closed loops at one retained pitch solely for comparison; show the source and replay gap words with signed per-gap deltas; explain that one changed position redistributes adjacent space while both loops still total twelve; preserve matched Octave Fold behavior; omit the reveal for complex mismatches; reset reveal state per performed attempt; and verify native pressed state, visible non-color delta labels, forced colors, five-lens continuity, browser silence, and 390-pixel no-overflow layout.
- [x] **K2.6.50** Add Scale Landing Mutation v1.64 to the performed Scale Fingerprint builder: let any completed octave route become a frozen control; accept a free ascending replay from any physical key without a ghost target; compare cumulative positions rather than note names; recognize exactly one moved internal landing only when the landing count, origin, octave closure, and every other landing remain fixed; show the source and new thirteen-position routes plus signed neighboring-gap deltas; explicitly refuse an unchanged route, a density change, or several moved landings; preserve the single-question exercise flow and optional theory-name boundary; and verify deterministic closure, native status text, non-color shapes, forced colors, browser silence, and 390-pixel no-overflow layout.
- [x] **K2.6.51** Add Interval Ripple v1.65 as the progressive second view of one successful Scale Landing Mutation: require the isolated landing to move exactly one equal-key step; enumerate every normalized source and new interval from that landing to each retained physical route position; show distance bars, 12-TET frequency multipliers, and shorter/wider text without note names; count changed spokes separately from invariant retained-to-retained relationships; keep absolute replay frequency, tuning scope, consonance, function, emotion, preference, and quality outside the result; refuse wider one-position moves without exposing the ripple; and verify native pressed state, live summary, solid/dashed non-color marks, forced colors, browser silence, and 390-pixel no-overflow layout.
- [x] **K2.6.52** Add Spectral Ripple v1.66 as a one-spoke progressive consequence of Interval Ripple: let the learner select exactly one changed source/new interval; preserve the original performed route register as a counterfactual control even when the mutation replay began elsewhere; compare both two-tone partial strips on one logarithmic frequency coordinate under the globally selected declared spectrum; mark near-alignment and strongest non-aligned interaction zones with shape and text; keep aligned-pair count, interaction-zone count, roughness, and overlap as separate deltas; make the MIDI-without-audio assumption prominent; preserve the broader ripple invariants; and refuse consonance, function, emotion, preference, quality, or actual-instrument claims.
- [x] **K2.6.53** Add Ending Ripple v1.67 inside the existing declared-change phrase experiment: reveal it only when equal attack counts and normalized earlier positions prove that one ending position changed; remove any whole-phrase transposition before comparison; expand the ending into every signed interval it forms with earlier attacks; show source/new interval bars, 12-TET multipliers, the changed final approach, and the invariant earlier-to-earlier count; keep the performed ending role, full gravity-model reranking, other changed performance lenses, and three learner reports separate; reset the reveal for each new replay; and refuse cadence-function, causation, emotion, preference, correctness, or quality claims.
- [x] **K2.6.54** Add Chord Gesture Echo v1.68 inside a structurally matched Chord Motion Echo: retain the exact attacked members of each source field separately from inherited chord membership; align source and replay gestures at their first attack on one shared millisecond scale; distinguish attack spread within each field, chord-anchor spacing, release-proven overlap, silence, pedal-ended duration, unknown release state, and MIDI attack velocity; keep the pitch-class transformation invariant while these performance coordinates change; reset the reveal for each explicit retry; and refuse meter, groove, intention, acoustic-loudness, feeling, preference, correctness, or quality claims.
- [x] **K2.6.55** Add Resolution Landing Lens v1.69 inside the existing silent fork experiment: freeze the exact source attack and first later attack that reaches the armed pitch class; distinguish the intended source-to-destination interval from the performed final approach; count intervening attacks so a detour cannot masquerade as an isolated one-note intervention; plot key height against elapsed time; expose measured MIDI key and velocity beside derived reference frequency and interval ratio, attack spacing, release-proven overlap or silence, and selected-frame tendency through five separate lenses; hand a bounded three-to-twelve-attack context to Personal reflection; disable stale fork coordinates after a match until the trial is cleared; and refuse detected-function, meter, groove, acoustic-pitch or loudness, causation, emotion, preference, correctness, or quality claims.
- [x] **K2.6.56** Add Phrase Breath Map v1.70 as one focused Motion question: collapse near-simultaneous attacks into onset groups so a chord does not masquerade as several beats; use the phrase-local median group gap as an adjustable ruler; mark a candidate break only when unusual spacing and release-proven silence agree; preserve unknown, touching, and overlapping bridges without inventing quiet; show pitch motion, the latest seven-attack microscope coordinates, candidate gates, timing islands, pitch spans, and signed step paths on one elapsed-time field; and refuse intended-phrase, breath, meter, form, expression, correctness, or goodness claims.
- [x] **K2.6.57** Add One-Pause Counterfactual v1.71 as progressive disclosure inside the existing whole-phrase timing experiment: require the same attack count and absolute key path; tolerate ordinary replay drift with a per-gap 12% or 45-millisecond floor; open the microscope only when exactly one inter-onset gap crosses that boundary; align source and replay on one millisecond axis; preserve all other gaps as visible controls; keep release-proven silence, touching, overlap, pedal extension, and unknown release evidence separate from onset spacing; refuse broad-retiming, changed-key, boundary, meter, intention, emotion, preference, quality, or causal claims.
- [x] **K2.6.58** Add Motif Invariance Lens v1.72 as progressive disclosure inside Motion → Motif: expose the detector’s source and return windows; normalize each statement to relative key position and proportional onset gaps; align relative pitch paths, signed moves, and timing shares; name retained starting key, pitch shape, opening, or rhythm separately from transposition, changed timing, or altered moves; keep the learner’s phrase and existing practice prompt intact; refuse intended-motif, formal-function, style, emotion, correctness, quality, or causal claims.
- [x] **K2.6.59** Add Learner-Bounded Motif Echo v1.73 inside Motion → Motif: let the learner freeze exactly the latest three or four attacks; compare the first equally sized replay in full rather than selecting a favorable sub-window; classify exact return, shared shape under transposition, shared pitch shape with changed timing, preserved opening with altered ending, or multiple changed properties; reuse the signed-step and proportional-gap invariance view; keep retry and source release native, silent, phrase-local, and session-persistent; refuse intended-form, style, emotion, correctness, quality, or learning-effect claims.
- [x] **K2.6.60** Add Motif Return Arc v1.74 inside the same learner-bounded Motif Echo: retain up to three completed full-boundary statements in order; distinguish relationship returns from timing, ending, and multi-property variations; guide the learner from source through one changed statement into an exact or transposed return; persist and migrate the local sequence; render variation and return with separate text and line styles; keep the current replay inspectable; and refuse section, theme, intention, style, recognition, emotion, correctness, quality, or formal-function claims.
- [x] **K2.6.61** Add Motif Experience Check v1.75 after the latest open variation receives an exact or transposed relationship return: ask one listener-only question about whether the last statement felt like a return; keep the modeled pitch-and-timing fingerprint beside but independent from the learner's not-return, uncertain, or felt-return report; persist and migrate only that bounded local report; reopen the cycle when a newer variation appears; reset the old report when that variation is kept; and refuse inferred recognition, form, emotion, correctness, quality, or universal experience.
- [x] **K2.6.62** Add Return Experience Contrast v1.76 inside the same one-question check: retain at most four event-addressed exact or transposed return observations; replace rather than duplicate a changed report for one performance; after two observations, align each same-start or shifted physical return with its particular listener response; preserve chronology and the current return without computing agreement, a rate, average, threshold, profile, or personal law; migrate the v1.75 single report on the learner's next choice; persist the contrast across reloads; and keep narrow, non-color, and forced-color evidence intact.
- [x] **K2.6.63** Add Motif Experience Handoff v1.77 from a completed learner-bounded source → variation → relationship-return arc into the existing Personal Character Map: select the latest completed cycle by exact event IDs; recover the original live MIDI events rather than joining normalized session copies; refuse the handoff when any event has aged out of the sixty-second phrase; preserve the whole live phrase; ask settledness, energy, familiarity, and liking one at a time with arc-specific copy; and keep those listener reports separate from relationship detection, the assumed spectrum, correctness, emotion inference, and musical quality.
- [x] **K2.6.64** Add Landmark Experience Handoff v1.78 from a completed generated pop-loop, blues-cycle, classical-cadence, or pedal-point path into the existing Personal Character Map: retain the exact source event IDs for every matched field, preserve common sustained attacks without duplicating them, bind the report to its original, transposed, or one-key-changed route, refuse incomplete, malformed, legacy, or expired captures, preserve the full live phrase, surface the landmark context in local Personal reports and export, and keep learner-reported settledness, energy, familiarity, and liking separate from path identity, modeled texture, stylistic convention, correctness, emotion inference, and musical quality.
- [x] **K2.6.65** Add Landmark Experience Contrast v1.79 inside Personal Lens: choose the latest report that has one immediately preceding report for the same generated path; retain the two particular performances instead of averaging, ranking, or searching for a favorable pair; state movable-center and one-key-mutation controls only when stored context supports them; plot settledness, energy, familiarity, and liking independently with non-color A/B shapes; align measured span and overlap beside but separately from modeled crunch and ending repose; preserve v1.78 observations with an honest missing-center statement; persist through the existing local report store and export; and refuse causal, preference-law, emotion, style, goodness, and learning-effect claims.
- [x] **K2.6.66** Add Landmark Route Fingerprint v1.80 after a learner completes any generated path: remove absolute Do and register; fold every field into ordered 0–11 equal-key offsets; distinguish field tones, root positions, carried positions, and the declared one-key source/target with non-color shapes and line styles; expose nearest-key motion, largest leap, and fifths travel for every adjacent transition; keep the whole route visible in one compact plot; preserve optional conventional labels without making them fundamental; keep incomplete paths focused on their current field; and refuse sound, tonal-function, stylistic-membership, emotional, correctness, quality, or learning-effect claims.
- [x] **K2.6.67** Add Performed Route Comparison v1.81 after any generated path completion: let the learner freeze that authored fingerprint as route A, choose and physically complete a different route B, and reveal both in one shared octave-folded coordinate; highlight exact shared field shapes without calling them song or style matches; compare recurrence, whole-route through-tones, carried-position counts, nearest-key motion, and fifths travel as independent sequences instead of a score; keep route A while trying another B; persist the bounded session locally; honor optional conventional labels; reflow to a readable two-column evidence table on narrow screens; and state that performed timing, articulation, register, actual sound, tonal hearing, listener emotion, familiarity, quality, and learning effects remain outside the authored structural comparison.
- [x] **K2.6.68** Add Landmark Transition Change Lens v1.82 inside a completed route fingerprint: make every adjacent transition an explicit native selection; isolate folded positions that stayed, entered, and left; align one stable compact before/after target on a physical-key axis with held, moved, added, and released strands; expose span, modeled crunch/repose deltas under the selected assumed spectrum, total and largest nearest-key motion, bass motion, modeled pull/home-evidence deltas under the selected Do frame, and root fifths travel through the common five-lens grammar; keep the learner's settledness judgment unclaimed; reset the reveal safely when path, variant, or center changes; preserve one-question progressive disclosure; support conventional labels, narrow one-column reflow, and forced colors; and refuse reconstructed performance audio, acoustic timbre, timing, pedal, fingering, intention, emotion, correctness, goodness, or learning-effect claims.
- [x] **K2.6.69** Add Shared Cycle Lens v1.83 inside live Interval practice: accept only two to six distinct physical MIDI positions; fit compact common-period candidates from A4=440 equal-tempered reference frequencies derived from those positions; retain the Pareto tradeoff between maximum harmonic number and RMS cents mismatch; phase-reset every wave only as an explicit display convention; plot actual cycles and endpoint drift across one candidate period; expose short, middle, and close templates without ranking musical value; reset the reveal when the specimen changes; support native controls, nonvisual summaries, narrow reflow, and forced colors; and refuse inferred acoustic pitch, phase, upper partials, root, chord identity, tonal function, consonance, emotion, quality, or learning-effect claims.
- [x] **K2.6.70** Clarify MIDI Reference-Frequency Provenance v1.84 across the live Piano and Ear experience: distinguish transmitted key numbers, timing, releases, pedal, and attack values from A4=440 12-TET reference frequencies derived by the app; rename the primary frequency plot and screen-reader summaries accordingly; disclose that pitch bend, instrument tuning, acoustic pitch, and audio spectrum are not captured; carry the same boundary through interval, chord, resolution, shared-cycle, assumed-spectrum, and documentation copy; correct the stale seven-event phrase-memory statement; preserve compact mobile layout and five-lens evidence separation; and refuse to label reference coordinates as measured acoustic fundamentals.
- [x] **K2.6.71** Add Resonance Sky v1.85 as a silent Piano Immersion focus: keep performed pitch directions stable on a fixed fifths orientation while a movable gold Do meridian and relational hues reinterpret the field; map equal-key/log-frequency register to radial depth; illuminate the current scale route without treating outside-route notes as wrong; retain a bounded twenty-eight-attack memory wake and seven bright attack stars; map MIDI attack to capped size rather than loudness; use all-notes release proof for broken trails, timing-group chord mist, nearest-key voice wakes, bounded register-spanning interval-reference filaments with cents mismatch and explicit integer-ratio versus geometric-midpoint provenance, pedal rings, selected-frame pull, matching-field assumed-spectrum crunch, and retained-phrase newness as separate non-evaluative channels; provide a delayed atomic text summary, optional silent hand horizon, compact assumed-spectrum control, narrow immersive crop, reduced-motion and forced-color fallbacks; and refuse acoustic-pitch, measured-spectrum, emotion, correctness, preference, consonance, goodness, style, or learning-effect claims.
- [x] **K2.6.72** Expand Resonance Sky v1.86 into a proximal learning field: replace the partial route halo with an all-twelve-position fifths crown that distinguishes selected membership, outside-route positions, visits, a leading catalog fit, and one honest alternative when several routes remain compatible; add three separately labeled attack-density tides for the trailing onset window ending at the latest attack, seven-attack microscope, and retained phrase while withholding a circular center for diffuse evidence; group chord membranes from the full retained phrase before bounding the four visible fields, separate interpreted from audible hulls, and distinguish exact, incomplete, together, and rolled evidence without implying function; add a twelve-attack elapsed-time/relative-height contour that preserves close-time bouquets rather than manufacturing melody; bridge one phrase-local relationship-window return without inferring motif intention or form; keep pitch-set route evidence separate from the performed contextual-center heuristic and its component cues; show at most two low-change in-route field possibilities after a short pause as non-predictive keep/move/add transformations; label live sounding fields separately from latest attack-time snapshots; bound collision-aware proximal annotations to five; preserve reference-frequency, assumed-spectrum, forced-color, reduced-motion, narrow-layout, and no-goodness guardrails.
- [x] **K2.6.73** Harden Resonance Sky v1.87 for dense live sessions: stop its clock-driven render loop when idle; update at a lower cadence only while notes remain held; measure only the five recent chord gestures needed to preserve four visible membranes plus transition context; pause the quadratic assumed-spectrum field model above eight positions with an explicit explanation; reduce dense chord-hull geometry to register extremes per pitch class; cap gradient stops; remove the large SVG blur allocation; add paint containment; and stress-test long attack sequences plus a ten-position held field without browser diagnostics or unbounded visual growth.
- [x] **K2.6.74** Add Semitone Horizon v1.88 across the learning path: expose exact adjacent, pairwise, compound, and octave-folded semitone spacing without turning it into tension or quality; prioritize the latest attack's nearest sounding relationship in Resonance Sky; combine sounding-pair counts, scale-gap sizes, and one concrete selected-Do move in a twelve-point non-color-redundant horizon; add a major/minor/diminished root-position atlas with A4=440 fundamentals, bounded assumed partial frequencies, and down/hold/up one-semitone neighboring routes; show the live chord's spacing beside selected-frame and assumed-spectrum evidence; translate Scale, Harmony, interval, voice-leading, mutation, and route copy into explicit semitone units; document that chord type does not choose a felt resolution; and regression-test transposition, inversion, register dependence, dense-field priority, accessibility, and invalid input.
- [x] **K2.6.75** Add Scale-Degree Harmonic Field v1.89 inside guided Interval learning: keep every degree's movable syllable, semitone address, incoming gap, and outgoing gap visible; build one upward three-note field through an explicit take–skip–take–skip–take rule; plot its bass-relative positions and exact adjacent gaps on a twelve-semitone ruler; distinguish major, minor, diminished, augmented, mixed third/fourth, and even fourth-stack geometry without turning labels into emotion or quality; expose root-position or inversion language only when a major, minor, diminished, or augmented pitch-class set matches exactly; make minor pentatonic and whole-tone geometry directly comparable; extend normalized listening across octave-wrapped scale degrees; and regression-test all preset fields, octave wrapping, narrow layout, forced colors, and nonvisual summaries.
- [x] **K2.6.76** Add Scale Generator Laboratory v1.90 inside guided Scale learning: separate the unchanged pitch-class collection, its movable-degree reinterpretation under a new Do, and the one-position repair that restores the major gap pattern; state precisely that old Sol becomes new Do while old Fa rises to Fi—new Te to Ti—rather than saying that the fifth is sharpened; reveal the sliding seven-stop fifth window and `7 × 7 = 49 ≡ 1 (mod 12)` replacement arithmetic; compare the same fifth shift across diatonic modes, natural minor, major pentatonic, harmonic minor, whole-tone, octatonic, and chromatic collections; let learners explore every `+1` through `+7` modular generator and two- through twelve-position windows; expose cycle length, disconnected components, generated collection, and cyclic gap fingerprint without treating any generator as a scale by itself; distinguish the closed 12-TET pitch-class orbit from the near-closing pure-`3:2` spiral; bound all claims away from detected tonic, unique spelling, historical inevitability, tonal function, emotion, preference, correctness, goodness, or required resolution; and regression-test generator arithmetic, accessible semantics, narrow layout, forced colors, and nonvisual summaries.
- [x] **K2.6.77** Add Resonance Sky Musical Edge Lenses v1.91 for active playing: use the open upper-left, upper-right, and lower-left sky corners for rhythm, harmony-field, and recent-five summaries; prefer an existing learner-declared four-tap pulse and otherwise label the median onset gap as a local ruler rather than a beat, meter, or accuracy score; expose exact gap ratios and deviation; keep chord identity, octave-folded intervals, adjacent gaps, assumed-spectrum roughness and fusion, nearest-key rise/fall, modeled-repose change, and selected-Do pull change independent rather than collapsing them into resolution or cohesion; use modeled fusion alone for chord-name emphasis and current-membrane weight; leave felt character explicitly listener-only; preserve five recent attacks as a line only when every onset group is a singleton and otherwise retain the bouquet boundary; show signed steps, landmarks, contour, selected-route fit, repeated interval sizes, and two compatible catalog frames without claiming scale origin, harmony, or goodness; reduce the center to one newest-attack annotation, a five-attack contour, and labels only on active semitone-horizon positions while preserving the established tonal geometry; collapse verbose evidence into disclosures; add one concise atomic live summary, forced-color distinctions, 900- and 620-pixel reflow, 320-pixel no-overflow support, and deterministic rhythm/recent-path tests.
- [x] **K2.6.78** Add the Resonance Sky Semitone-First Interval Lens v1.92: promote the latest exact signed MIDI-key subtraction above the recent-five path; retain direction, compound register travel, onset gap, pitch-class fold, and endpoint roles separately; classify singleton-to-singleton motion apart from attack order inside or after a close-time bouquet; derive directional and unordered A4=440 12-TET reference-frequency multipliers without calling them measured acoustic pitch; disclose nearby authored ratio landmarks and cents offset; gate pair roughness and fusion on release-time or attack-snapshot overlap under the declared spectrum; expose selected-route entry/exit and shortest selected-Do pitch-class distance without inferring function or resolution; offer bounded spacing and possible listening words while explicitly refusing emotion, consonance, preference, or meaning prediction; lead the existing atomic live summary with the newest interval; reduce the center's sole annotation back to pitch role; add forced-color direction redundancy, compound/bouquet/overlap tests, responsive browser checks, and provenance documentation.
- [x] **K2.6.79** Add Resonance Sky Legibility and Declared Meter v1.93: collapse the circle-of-fifths center to one route crown, consistent attack circles, and sounding-state outlines; remove unexplained density rings, seeds, stars, and satellite dots; keep a persistent three-mark visual key; add learner-set BPM and pulses-per-bar, downbeat lock/unlock, optional metronome click, and a grouped-attack two-bar rhythm view that refuses inferred meter or accuracy claims; promote exact chord identity; name compatible scale frames for a complete monophonic five-attack span; retain semitone-first interval language, responsive reflow, forced-color redundancy, and explicit evidence boundaries.
- [x] **K2.6.80** Add Voice Match and Interval Singing v1.94: request microphone access only from a labeled learner action; estimate one supported monophonic fundamental locally without recording, persistence, or upload; name its movable-Do or optional conventional nearest key; expose estimated hertz, nearest A4=440 piano reference, signed cents, and coarse semitone distance separately; anchor targets to the latest piano attack or selected Do; offer every −12 through +12 semitone interval and a quiet learner-triggered anchor-to-target sine preview; stop every media track, timer, and audio context; withhold low-level, weakly periodic, and polyphonic evidence; add deterministic YIN fixtures, privacy/provenance boundaries, forced-color and narrow-screen contracts, and real-device microphone validation as an explicit remaining limit.
- [x] **K2.6.81** Add Visible Route Selection v1.95: keep the selected scale route visible across every Piano focus mode; expose its ordered semitone gaps and octave positions from Do; provide a native direct-choice menu that retains Do and locks the chosen route; rename the frame lock control so it clearly governs both Do and route; list direct selection, performed-evidence discovery, and compatible-candidate adoption as distinct selection paths; state that the fifths compass changes Do while retaining the route; preserve URL/session route state; and add responsive, forced-color, accessibility, rendered-source, and browser interaction checks.
- [x] **K2.6.82** Add Inversion-Aware Chord Names v1.96: append first, second, or third inversion directly to exact chord names in the upper-right Immersion harmony HUD; name the realized bass and catalog root in the adjacent explanation; keep root-position names uncluttered while explicitly stating that root and bass coincide; compute inversion from the template's root-relative tone order rather than sorted absolute pitch classes; and add transposed triad and seventh-chord fixtures plus source and browser checks.
- [x] **K2.6.83** Add Compact Chord Fingering v1.97: place one small realized-keyboard graphic beneath exact chord names in the upper-right Immersion harmony HUD; mark a common right-hand fingering with digits 1–5; adapt common triad and four-note patterns to inversion; withhold the guide for non-exact, over-five-key, or wider-than-octave fields; state the hand-size, black-key, register, and next-chord boundary; and verify accessible naming, forced colors, 320-pixel fit, and source/model fixtures.
- [x] **K2.6.84** Add Play-to-Set Movable Do v1.98: expose one persistent native action across every Piano focus; arm the next MIDI note-on or new on-screen attack as movable Do; retain and lock the selected route; update the URL and all shared contextual views; operate even when the visual trace is frozen; cancel explicitly; reset frame-bound exercises that would otherwise retain a stale center; preserve direct fifths selection; and verify the Scales-to-Intervals handoff plus 320-pixel fit in production-browser review.
- [x] **K2.6.85** Add Register-Aware Chord Hands v1.99: choose the compact chord guide's suggested hand from the realized voicing midpoint around a middle-C split; use left-hand finger order below the split and right-hand finger order at or above it; name the register rule in visible and nonvisual copy; preserve inversion-sensitive triad and four-note suggestions; keep crossing, accompaniment, anatomy, and neighboring-chord caveats explicit; and verify low, high, and split-crossing fixtures.
- [x] **K2.6.86** Add Standalone Voice Pitch Lab v2.00: remove microphone analysis from the persistent Piano HUD; expose Voice as its own top-level page and shareable `lab=voice` state; supply an independent chromatic A4=440 anchor selector; retain the complete signed one-octave interval practice and local reference playback; add an input-activity meter that distinguishes arriving samples from accepted periodic pitch; state that the feature estimates sung pitch rather than words; and preserve local-only lifecycle, responsive, forced-color, and non-evaluative boundaries.
- [x] **K2.6.87** Add Immersion Scale Lens v2.01: place a semitone-first scale view in the lower-right HUD; render twelve equal keyboard cells with route degree, recent five-attack, latest-attack, and sounding-state distinctions; name the current route and exact latest position from Do; expose the cyclic semitone-gap loop and retained route coverage; keep the selected/locked state explicit; reflow into the fourth quadrant at tablet widths and a normal stacked region on phones; and state that the display is a learner-selected coordinate rather than detected key.
- [x] **K2.6.88** Add Quick HUD Scale Reset v2.02: put one native pressed-state next-note Do reset and one native fresh-evidence frame reset directly in the Immersion Scale Lens; make Do capture retain and lock the route; anchor frame discovery after the current event so earlier phrase evidence cannot dominate the replayed scale; expose zero-to-four distinct-note progress and one-click restart; cancel frame learning when Do capture arms; remove pinned Do/scale URL state during frame relearning; preserve the current frame provisionally until fresh evidence stabilizes; and verify synchronized main-HUD state plus 320-pixel fit.
- [x] **K2.6.89** Add Register-Aware Scale Fingering v2.03: derive the nearest selected-route octave from the recent played register; suggest left hand for an octave centered below middle C and right hand at or above it; display one compact ascending 1–5 strip with the crossing point for seven-, six-, and five-position routes; expose a complete text alternative; keep the heuristic visibly bounded by key layout, direction, hand size, and surrounding passage; and verify narrow and forced-color presentation.
- [x] **K2.6.90** Add Shared Short HUD History v2.04: reduce the Immersion note wake from twenty-eight to twelve attacks; derive note marks, pitch-class visits, local center evidence, motif evidence, and chord groups from the same newest-twelve-attack slice; keep the four-membrane rendering cap separate from the shared evidence boundary; show the shared count in the HUD state bar; preserve the longer phrase for non-Immersion learning focuses; and verify deterministic aging, accessible disclosure, and production deployment.
- [x] **K2.6.91** Add Research HUD v2.05 as a separate Piano focus over the same movable Do, selected route, live MIDI field, and newest-twelve-attack history: make the fixed chromatic clock primary so adjacent positions always mean one semitone; overlay repeated `+1` through `+7 (mod 12)` generator paths without moving nodes; compare a `+3`/`+4` thirds lattice and complete directed all-pairs interval matrix; state what each projection preserves and folds away; define fifths distance only as repeated `+7` steps rather than affinity, consonance, function, resolution, emotion, or value; retain the 12-TET/MIDI-reference boundary; and verify modular geometry, state continuity, accessibility, responsive layout, and production deployment.
- [x] **K2.6.92** Add practitioner-derived Scale Gravity HUD v2.06 as a separate Piano focus over the shared movable Do, live MIDI field, and newest-twelve-attack history: make a thirteen-slot semitone runway from Do through its octave copy primary; pin one major degree while IV, V, and I change its exact interval and triad role; keep exact 12-TET structure, style-bound common-practice tendencies, and subjective listening prompts visibly separate; show the newest five unfolded physical key moves; re-home the unchanged diatonic collection through all seven modes without changing the shared Do or claiming a heard tonic; state the cultural and mathematical limits of the major frame; preserve native keyboard controls, non-color state redundancy, responsive reflow, and forced-color support; and record the private practitioner elicitation as paraphrased design input rather than empirical validation or retained project data.
- [x] **K2.6.93** Harden local Voice input v2.07: lower the overly conservative RMS gate from 0.008 to 0.0015 for quiet but periodic built-in-microphone input; retain periodicity as an independent pitch gate; prefer browser automatic gain without recording or uploading audio; resume the analysis context after permission; support prefixed Safari audio contexts; expose the browser-selected input label; distinguish no input, too-quiet input, usable voice, and detected pitch in text; recover honestly from mute, disconnect, denial, and startup failure; and regression-test quiet periodic detection, weak-signal refusal, accessibility copy, type safety, responsive layout, and production export.
- [x] **K2.6.94** Add selectable Voice input v2.08: place a labeled native microphone-source menu beside the Voice controls; keep the system default available before permission; enumerate browser-authorized audio inputs only after the local stream opens; restart analysis immediately against an explicitly selected device; preserve the selection while stopping and starting within the tab; refresh safely when devices change; fall back to the system default when the chosen source disconnects; retain active-device, no-recording, and no-upload disclosures; and verify accessibility, forced colors, narrow reflow, type safety, deterministic tests, and production deployment.
- [x] **K2.6.95** Add Voice Spectrum + Tuner v2.09: draw a live 50–3000 Hz log-frequency microphone magnitude spectrum without retaining samples; overlay up to twelve ideal integer harmonics of the selected target; mark a reliable detected fundamental independently from the strongest spectrum band; explain formant and upper-harmonic dominance; replace the target rail's custom-property marker with a direct bounded position; widen low/high vocal search coverage; relax the periodicity gate while retaining silence, weak-input, malformed-window, and noise-like refusals; and verify spectrum arithmetic, accessibility, forced colors, 320-pixel reflow, type safety, deterministic tests, production export, and deployment.
- [x] **K2.6.96** Add Intuitive Voice Ear Map v2.10: replace the abstract distance rail with a vertical lower/target/higher pitch field; mark the exact ±50-cent nearest-key boundaries and a narrow ±5-cent centering lane; retain a bounded 3.2-second target-relative pitch trail; use trail dash pattern and a labeled native meter to expose detector periodicity without calling it vocal quality; derive recent steadiness from the middle 80% of about two seconds of pitch evidence; turn signed target distance into an immediate ease-up, ease-down, replay, or hold cue; present a hear, sing-from-memory, check-direction, repeat ear-training loop; and verify model arithmetic, accessible summaries, non-color distinctions, forced colors, responsive reflow, and deployment.

Exit gate:

- A learner can press a physical or on-screen key and explain its frequency, distance, syllable, and scale role relative to Do.
- A learner can add notes and distinguish physical interaction evidence from scale context and personal musical judgment.
- A learner can see several scale-and-center frames fit the same evidence and explain why a short note set cannot uniquely identify one scale.
- A learner can distinguish current crunch, pull toward Do, arrival evidence, and change from the previous field without treating any one dimension as goodness.
- A learner can explain why the equal-tempered fifths cycle closes even though twelve pure 3:2 moves do not equal exactly seven octaves.
- MIDI data and all learning state remain local to the browser; Piano Lab does not generate or capture sound.

### Q10 — Validation, accessibility, and release hardening

Objective: ensure that the experience is scientifically honest, musically useful, robust, and pleasant to use.

- [x] **Q10.1** Validate ratio, waveform, spectrum, periodicity, and timing math against analytic fixtures.
- [x] **Q10.2** Compare psychoacoustic outputs with published test conditions where reproduction is feasible.
- [ ] **Q10.3** Test all core flows with keyboard navigation, screen readers, reduced motion, and non-color encodings. (Automated semantic, focus, reduced-motion, and non-color contracts pass; manual VoiceOver/NVDA and real-device traversal remain.)
- [x] **Q10.4** Add hearing-safety guidance, volume calibration guidance, and visible playback state.
- [ ] **Q10.5** Test low-powered devices, headphones, phone speakers, and multiple browser audio implementations. (A concrete device/browser/assistive-technology matrix is published; physical execution remains.)
- [x] **Q10.6** Profile audio latency, main-thread frame time, memory use, and long-file analysis.
- [x] **Q10.7** Add an onboarding path that teaches by manipulation rather than terminology.
- [ ] **Q10.8** Conduct comprehension tests: can users explain what changed and predict the next A/B result? (Pre/post questions, manipulation tasks, and scoring requirements are published; participant sessions remain.)
- [ ] **Q10.9** Conduct listening studies that keep model predictions separate from self-reported experience. (A consent, randomization, condition, and data-separation protocol is published; participant sessions remain.)
- [x] **Q10.10** Publish limitations, model cards, analysis versions, dataset provenance, and research citations.
- [x] **Q10.11** Polish phone navigation, minimum interactive target sizes, responsive label separation, and reduced-motion-aware programmatic scrolling.
- [x] **Q10.12** Add an in-product conceptual self-check with prediction questions, explanatory feedback, and direct evidence-lab links while keeping participant validation as a separate gate.
- [x] **Q10.13** Add a first-focus skip route and explicit forced-color fallbacks for selected states, spectral voices, maps, uncertainty rings, and learning feedback.
- [x] **Q10.14** Rewrite core guidance around listening actions, replace ambiguous gap vocabulary, and normalize nominal playback across synthesized and recorded labs.

Exit gate:

- Core interactions meet accessibility requirements.
- Audio is stable and safe across supported browsers.
- Model limitations are visible at the point of interpretation.
- Users demonstrate conceptual learning, not just successful button use.

Release candidate: **v1.0 — Music With No Names**

## Execution order and dependencies

```text
F0 Foundation
  └─ R1 Ratio Lab
       └─ A2 Auditory reality
            ├─ S2.5 Transposable scales + inner hearing
            │    └─ K2.6 Piano + MIDI relationship bridge
            ├─ H3 Multi-tone harmony
            └─ T4 Rhythm and embodiment
                 └─ P5 Pattern and prediction
                      └─ I6 Recording import
                           └─ J7 Journey + Microscope
                                └─ L8 Landmark Atlas
                                     └─ G9 Personal goodness
                                          └─ Q10 Release hardening
```

H3 and T4 can proceed partly in parallel after A2. All later phases should remain thin until the preceding exit gate is met.

## Initial vertical slice

The first implementation sequence should be:

1. **F0.1–F0.6:** project, units, math, safety, and signal fixtures.
2. **R1.1–R1.3:** two audible oscillators with a continuous ratio control.
3. **R1.4–R1.6:** synchronized waveform, repetition, and partial views.
4. **R1.7–R1.9:** timbre comparison, transposition, and explanation.
5. **R1.10:** preset examples and shareable state.

This slice is deliberately small but complete: manipulate → hear → see → predict → compare.

## Definition of done for every work package

A work package is complete only when:

- The requested behavior exists and is reachable in the product.
- Mathematical logic has focused tests.
- Audio changes use safe gain ramps and do not click or clip under normal operation.
- The UI works at narrow and wide widths.
- Interaction is keyboard-accessible and meaning does not depend on color alone.
- A concise textual explanation accompanies any essential visual.
- Measured data, predictions, and interpretation are not conflated.
- Uncertainty and failure states are visible where relevant.
- No unrelated conventional labels have leaked into the core model.
- Documentation and this roadmap are updated if scope or assumptions changed.

## Validation experiments

These experiments form a reusable scientific and educational spine across the roadmap:

1. Same ratio, different timbre.
2. Same ratio, different register.
3. Same spectrum, different amplitude envelope.
4. Same internal sonority, different preceding context.
5. Same pulse, low/medium/high syncopation.
6. Same duration ratios, different absolute tempo.
7. Exact repetition versus repetition with transformation.
8. First exposure versus repeated exposure.
9. Same phrase evaluated for dance, relaxation, tension, interest, and pleasure.
10. Same event under piece-local, pop-trained, blues-trained, classical-trained, and personalized prediction models.

The application should prefer these causal counterfactuals over unexplained correlations from finished recordings.

## Risks and mitigations

| Risk | Mitigation |
|---|---|
| Ratio simplicity is mistaken for beauty | Keep fusion, roughness, familiarity, stability, and liking separate; use counterexamples early |
| A psychoacoustic metric appears more authoritative than it is | Name the model, expose parameters, compare models, and show uncertainty |
| Polyphonic analysis produces confident errors | Preserve candidates, provide confidence, and support user correction |
| Genre maps become stereotypes | Use declared corpora, overlapping clouds, recording-level paths, and curator caveats |
| Copyright blocks representative landmarks | Bundle only licensed material; support user-loaded audio and portable analysis files |
| Personalization becomes a hidden ranking algorithm | Keep the model local, inspectable, goal-relative, and deletable |
| Real-time DSP harms responsiveness | Move analysis off the main thread and profile before adopting heavier methods |
| Audio surprises or harms users | Require explicit playback, use conservative gain and limiting, and provide visible stop controls |
| Visual richness overwhelms learning | Use progressive disclosure: Lab → Journey → Microscope → Atlas |
| Western categories re-enter through feature extraction | Keep continuous frequency/time evidence and make culture-specific models explicit overlays |

## Research anchors

The research ledger should begin with these studies and expand as implementation decisions require:

- [McDermott, Lehr, and Oxenham — harmonicity, roughness, experience, and consonance](https://pmc.ncbi.nlm.nih.gov/articles/PMC2885564/)
- [McDermott et al. — cultural variation in consonance preference](https://www.nature.com/articles/nature18635)
- [McPherson et al. — interval fusion across contrasting cultures](https://www.nature.com/articles/s41467-020-16448-6)
- [Jacoby et al. — cross-cultural rhythm priors](https://www.nature.com/articles/s41562-023-01800-9)
- [Witek et al. — syncopation, movement, and groove](https://journals.plos.org/plosone/article?id=10.1371/journal.pone.0094446)
- [Gold et al. — predictability, uncertainty, and musical pleasure](https://pmc.ncbi.nlm.nih.gov/articles/PMC6867811/)
- [Salimpoor et al. — anticipation, peak emotion, and musical reward](https://www.nature.com/articles/nn.2726)
- [Eerola, Friberg, and Bresin — musical cues and perceived emotion](https://www.frontiersin.org/journals/psychology/articles/10.3389/fpsyg.2013.00487/full)
- [Martínez-Molina et al. — individual differences in musical reward](https://pmc.ncbi.nlm.nih.gov/articles/PMC5135354/)
- [Cognitive and sensory expectations independently shape expectancy and pleasure](https://pmc.ncbi.nlm.nih.gov/articles/PMC10725761/)

## Open decisions

These decisions should be resolved only when their dependent phase begins:

- Which auditory filterbank and roughness models best balance fidelity, transparency, and real-time performance?
- Which harmonicity and periodicity measures should be shown side by side?
- How should prime-coordinate distance be weighted without implying a universal perceptual law?
- Which pulse and syncopation models generalize beyond common Western meters?
- What is the smallest transparent prediction model that produces useful explanations?
- Which public-domain or openly licensed recordings can anchor the first atlas?
- How should a user match a locally loaded commercial recording to an existing metadata-only landmark?
- What minimum listener study is necessary before showing a population response terrain?
- Whether optional conventional note/chord translations belong in v1.0 or a later educational overlay.

## Current project state

- [x] Working thesis established.
- [x] Initial physical, perceptual, temporal, cultural, and listener-centered framework established.
- [x] Initial roadmap created.
- [x] Application scaffold created.
- [x] First audible vertical slice implemented.
- [x] Harmony and rhythm labs implemented.
- [x] Initial listener-conditioned landmark atlas implemented.
- [x] Personal Lens ratings, uncertainty, local export, and deletion implemented.
- [x] Generated Journey, inspectable local prediction, and Acoustic Microscope implemented.
- [x] First vertical slice completed with shareable ratio/register/timbre state.
- [x] Private local recording import, worker analysis, correction controls, and portable profiles implemented.
- [x] Ear Lab sensory models and independent human reports implemented.
- [x] Guided learning path, hearing safety, glossary, ADRs, and research ledger implemented.
- [x] Movable-Do scale orbit, physical step fingerprint, degree evidence, and inner-hearing practice implemented.
- [x] Silent Piano companion with local MIDI input, movable-Do key mapping, scale/center inference, selected-field interval texture, perceptual-evidence trace, held-note fifths mapping, chord gestures, and nearby voice-led chord moves implemented.
- [x] Persistent live phrase ribbon, note duration and pedal tails, guided focus lenses, Interval Echo, causal chord comparison, and correctable chord boundaries implemented.
- [x] Sixty-second phrase memory, explicit voice-leading strands, motion classes, and learner-performed ghost chord targets implemented.
- [x] Cyclic scale fingerprints, performed-evidence tonal gravity, phrase-stable center framing, and learner-performed resolution forks implemented.
- [x] Duration/articulation evidence and phrase-local motif transformation coaching implemented in the live Motion lens.
- [x] Silent playable landmark paths connect pop, blues, classical-cadence, and pedal-point archetypes to live MIDI, close voicing, fifths motion, and modeled texture inside the same Piano HUD.
- [x] The live Experience focus maps explicit phrase reports separately from measured MIDI evidence and modeled teaching proxies, with local uncertainty, relationship-signature comparison, Personal Lens integration, export, and deletion.
- [x] Prime-coordinate harmony lattice, temperament morph, and sequence motion implemented.
- [x] Competing pulse hypotheses, nested phase, syncopation, and tapping input implemented.
- [x] Event self-similarity and incremental uncertainty/surprise trace implemented.
- [x] Versioned Atlas schema, selectable axes/layers, provenance, and uncertainty encodings implemented.
- [x] Transparent learned preference terrain and repeated-listening response history implemented.

All locally authorized roadmap implementation packages are complete. Remaining unchecked release gates require real assistive technology and audio devices, recruited comprehension/listening participants, or explicit authorization for a consented cohort backend.
