# Music With No Names — Development Roadmap

Status: implementation underway
Last updated: 2026-07-13

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
- [x] **K2.6.21** Add Assumed Sound Models v1.35: turn the hidden fixed timbre assumption into a persistent sine, harmonic, mellow-piano, or bright-piano choice; preview each spectral envelope as a partial comb; recompute only spectrum-dependent crunch, harmonic-fit, brightness, and spectral repose evidence; preserve performed fundamentals and all interval, scale, fifths, rhythm, tonal-pull, novelty, and listener-report evidence; and state explicitly that MIDI supplies no actual instrument audio.
- [x] **K2.6.22** Add First-Principles Fifths v1.36: build a thirteen-point repeated-3:2 spiral including the attempted return; step through octave folding; continuously morph each 701.955-cent pure fifth toward the 700-cent equal-key approximation; make the remaining 23.46-to-0-cent closure gap visible; let compass or spiral positions become movable Do without entering notes; and preserve the locked Do/scale frame in session state and the URL.
- [x] **K2.6.23** Add Chord Membership Correction v1.37: treat inherited held or pedal tones as visually distinct, correctable members of the automatic chord reading; let the learner exclude or restore each inherited MIDI note; propagate corrected membership through identity, tonal tendency, novelty, exact-root travel, nearby targets, causal comparison, and voice leading; preserve the correction in the tab; and keep the full physically sounding field, interval texture, and spectrum-dependent roughness invariant under the contextual correction.
- [x] **K2.6.24** Add Guided Scale Walk v1.38: arm a silent one-octave route from the current movable Do and scale; let Do in any MIDI octave establish or restart the register; require the exact ascending equal-key gaps through the upper Do; preserve completed progress after a wrong attack while explaining actual versus expected motion; mark one exact silent key target; expose next frequency, ratio from Do, interval landmark, fifths coordinate, and local center evidence; and persist the live exercise in the current tab.
- [x] **K2.6.25** Add Controlled Sonority Fields v1.39: choose one of four relation-defined starting fields or capture the learner's current exact MIDI notes; outline targets without producing sound or entering attacks; attribute an exact one-note addition or removal only to its gained or lost pairwise intervals; preserve separate physical, assumed-auditory, selected-context, and conditional-affordance lanes; expose assumed-spectrum sensitivity without changing interval or context facts; refuse the causal display when several notes change; and require the exact persisted baseline to be replayed before comparison resumes.
- [x] **K2.6.26** Add Live Pulse Mirror v1.40: reduce the Motion focus to one selected question—Pulse, Touch, Voices, or Motif—without changing the underlying phrase; let the learner declare a pulse by repeating one key four times; reject implausibly fast or slow anchors; group near-simultaneous attacks before timing analysis; place later onset clusters around an eight-pulse coordinate; compare phase and inter-onset gaps with simple fractional landmarks; persist the source-tap identity and selected question in the tab and URL; expire rather than silently replace a pulse whose source taps leave phrase memory; and never turn the coordinate into meter, notation, groove quality, timing accuracy, or musical goodness.

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
