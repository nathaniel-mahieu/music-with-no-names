# Music With No Names

An audible, visual exploration of music through frequency ratios, spectra, time, perception, and expectation—without treating note names or piano geometry as the fundamental objects.

The current milestone is **Performance + Accessibility Diagnostics v1.16**. It provides:

- Safe, user-initiated two-tone synthesis.
- A continuous frequency-ratio control from 1:1 through 2:1.
- Small-integer landmarks without forced snapping.
- Sine and harmonic-complex timbres.
- Synchronized waveform, spectrum, and cycle-against-cycle views.
- Explanations that keep harmonicity, roughness, fusion, and musical goodness distinct.
- A three-voice Harmony Lab with shared-basis and aggregate-spectrum views.
- A twelve-position Rhythm Lab with onset-spacing ratios, tempo, and microtiming bias.
- An interactive map of pop, blues, and classical landmarks as experiential trajectories.
- Listener- and goal-conditioned preference proximity with an inspectable component profile.
- Seven independent response ratings, transparent goal-relative fit, and visible uncertainty.
- Local-only listening observations with portable JSON export and a two-step delete flow.
- A generated event-sequence Journey with aligned sensory, structural, prediction, and tension lanes.
- Section selection that preserves event identity while opening an evidence-backed Acoustic Microscope.
- Inspectable piece-local predictions, transformed-recurrence evidence, annotations, and counterfactual views.
- Shareable Ratio Lab URLs that preserve relationship, physical register, and timbre.
- Local-only recording import with safe playback and background-worker analysis.
- Versioned fine, medium, and whole-form feature frames with continuous frequency evidence.
- Editable pulse, frequency-center, section, and listener-heard source-event hypotheses plus portable analysis JSON that contains no audio.
- Arbitrary time-range inspection with adaptive fine, medium, and whole-form evidence frames.
- A zoomable aligned recording timeline spanning audio envelope, physical and perceptual evidence, pulse expectedness, sections, source events, and listener ratings.
- Per-feature evidence confidence plus selection-level ratio, partial-collision, onset-phase, and expected-pulse alternatives.
- Declared harmonicity, pitch-salience, roughness, onset-phase, tempo-change, syncopation, and recurrence proxies.
- An Ear Lab with editable spectrum, register, spacing, level, envelope, inharmonicity, and noise.
- Explicit A/B families that hold fundamentals or spectra steady while changing timbre, register, partial balance, or envelope and duration.
- A transparent fusion hypothesis kept separate from perceived fusion and liking reports.
- Separate roughness, auditory-band, spectral-overlap, and harmonic-template models.
- Independent smoothness, fusion, tension, and liking reports stored separately from predictions.
- A manipulation-first learning path from physical relationships to listener-conditioned experience.
- Hearing-safety and level-calibration guidance embedded in the product.
- Architecture decisions, a first-principles glossary, and a research/limitations ledger.
- Closed-form regression fixtures for waveform samples, ratio repetition, harmonic spectra, periodicity evidence, tempo, and nested timing phase.
- A two-minute analysis performance budget covering elapsed time, memory growth, and bounded frame counts.
- In-product worker throughput, browser audio-latency, display-frame, and available heap diagnostics.
- Automated semantic, focus, reduced-motion, and non-color accessibility contracts with a documented manual assistive-technology matrix.
- Four-voice harmonic fields with 2/3/5/7 prime-exponent coordinates.
- Three-to-six-source fields with independent register realization, amplitude, and harmonic-spectrum complexity.
- Optional octave folding, just-to-equal approximation morphing, and continuous voice-leading distance.
- A sequence mode showing how local interval familiarity can diverge from contextual stability.
- Multiple pattern-relative pulse hypotheses with confidence and nested-cycle phase.
- A transparent syncopation measure kept explicitly separate from pulse clarity and groove.
- Low/medium/high syncopation comparisons plus optional listener tapping and consistency feedback.
- A motif self-similarity matrix that detects recurrence beyond absolute event time.
- An incremental piece-local prediction trace separating uncertainty before from surprise after events.
- A side-by-side switch between piece-local learning and a small declared synthetic-corpus prior.
- A listener-personalized predictor learned only from explicitly saved next-gesture expectations.
- A local, persisted listener-response lane aligned with the generated Journey and removable at any time.
- Listener confirmation or rejection of section-level tension hypotheses.
- A versioned landmark schema with provenance, licensing, and no bundled commercial audio.
- Selectable Atlas axes and whole-recording/composition/performance/production views.
- Separate measured, curator, listener, model-uncertainty, and inter-listener-spread encodings.
- Data-derived, overlapping genre regions whose centers and widths follow the selected axes and declared starter corpora.
- Explicit pop, blues, and selected-classical novelty-channel comparisons with visible corpus counts and methods.
- A transparent listener preference center and bandwidth learned from saved evidence.
- Goal-relative fit blended with learned proximity and sample-count uncertainty.
- Repeated-listening history that keeps familiarity and liking changes separate.
- Exact-repeat, variation, unexpected-rupture, and delayed-return context experiments.
- Safe, short A/B renderings that preserve gesture identity while changing only timbre, register, or timing.
- Blind calibration prompts for identifying the changed physical factor by ear.
- Independent local-comfort and whole-arc-satisfaction reports that expose moment/form dissociation.

## Run locally

```bash
pnpm install
pnpm dev
```

## Verify

```bash
pnpm verify
```

The broader development plan is in [roadmap.md](./roadmap.md).

Scientific transparency is documented in [model cards](./docs/model-cards.md), [data provenance](./docs/data-provenance.md), the [validation report](./docs/validation-report.md), the [accessibility matrix](./docs/accessibility-matrix.md), the [study protocol](./docs/study-protocol.md), and the [research ledger](./docs/research-ledger.md).

## Product principle

Music is represented twice:

1. As invariant relationships such as frequency and duration ratios.
2. As an embodied realization in hertz, seconds, spectra, loudness, and register.

No acoustic metric is presented as an objective measure of whether music is good.
