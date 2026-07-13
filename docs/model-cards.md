# Model cards and version registry

These cards describe educational models used by Music With No Names. A model output is evidence under stated assumptions, never a verdict about musical goodness.

## Ratio and waveform geometry

- **Version:** `mwno-math-1` (source-controlled pure functions).
- **Inputs:** positive frequencies, continuous ratios, seconds, phase, partial count.
- **Outputs:** sine samples, normalized sums, rational approximations, common periods, harmonic partials, partial coincidences, prime coordinates, and log-frequency distances.
- **Validation:** closed-form waveform, spectrum, ratio-period, and voice-motion fixtures.
- **Limits:** rational approximation depends on denominator and cent tolerances; a shared physical period is not a perceptual or musical center.

## Ear Lab auditory models

- **Version:** `mwno-ear-1`.
- **Inputs:** explicit partial spectra, register, spacing, inharmonicity, noise, level control, attack, and duration.
- **Outputs:** Plomp–Levelt/Sethares-style roughness, critical-band-rate energy projection, spectral overlap, harmonic-template candidates, and a declared fusion hypothesis.
- **Fusion formula:** 42% spectral overlap + 45% best template confidence + 13% inverse roughness. It is deliberately simple and visually separated from the listener's fusion and liking reports.
- **Confidence:** template confidence is relative fit inside the searched candidate set. It is not a calibrated probability that the listener hears one pitch.
- **Limits:** no individualized auditory filters, calibrated SPL, masking model, binaural model, or hearing-profile correction.

## Harmony affordance model

- **Version:** `mwno-sonority-1`.
- **Inputs:** absolute frequency, amplitude, partial count, normalized ratio field, and recent voice-leading distance.
- **Auditory outputs:** aggregate roughness, strongest harmonic-template fit, competing-template ambiguity, pairwise spectral overlap, amplitude-weighted spectral height, fusion, and outer-voice spread.
- **Structural outputs:** repose combines 42% harmonic fit, 33% inverse roughness, and 25% low recent motion. Tension combines 42% roughness, 24% competing-center ambiguity, 22% recent motion, and 12% spectral brightness.
- **Affordances:** repose/groundedness, friction/activation, openness/spaciousness, and brightness/lift are kept as separate dimensions. Each is phrased as something a sound *may support*, never an emotion it contains.
- **Confidence:** values are bounded educational indices with visible drivers. They are not probabilities, preference estimates, emotion classifiers, or a consonance score.
- **Limits:** no familiarity corpus, individualized hearing model, temporal expectation beyond one previous field, tempo, dynamics, articulation, spatialization, semantic content, culture, or personal association. Formula weights are explanatory choices, not fitted coefficients.

## Piano and MIDI relationship bridge

- **Version:** `mwno-piano-1` for the pure relationship layer; live sonority evidence reuses `mwno-sonority-1`.
- **Inputs:** local MIDI note number, velocity, sustain state, selected movable Do, selected octave-closing scale route, and optional conventional-label visibility.
- **Relational outputs:** frequency in hertz, equal-key ratio and cents from Do, movable syllable, selected-scale membership, pairwise interval landmarks, and repeated-fifths coordinates.
- **Fifths derivation:** each pure move multiplies frequency by 3:2 and removes octaves until the result lies within one octave. The equal-key placement is shown separately, including accumulated error and the approximately 23.46-cent mismatch between twelve pure fifths and seven octaves.
- **Live sonority outputs:** harmonic-template fit, spectral friction, outer-voice span, and selected-route membership remain separate. The interface does not average them into listenability, consonance, emotion, or quality.
- **MIDI privacy:** permission and messages stay in the browser. Note-on, note-off, velocity, and sustain are used only for the live local view; no MIDI event log is persisted or uploaded.
- **Limits:** equal temperament is the keyboard coordinate system, not a claim of natural superiority. Velocity is not calibrated loudness. Scale membership is not correctness. Conditional language such as “may support” is not an emotion classifier or listener prediction.

## Rhythm and pulse models

- **Version:** `mwno-rhythm-1`.
- **Inputs:** circular onset positions, tempo, microtiming, and optional listener taps.
- **Outputs:** ranked pulse hypotheses, nested phase, transparent syncopation, estimated tap tempo, and tap consistency.
- **Confidence:** pulse confidence is normalized pattern support among the declared candidate divisions.
- **Limits:** it does not establish meter, groove, entrainment, or bodily response for a listener.

## Journey prediction models

- **Version:** `mwno-prediction-1`.
- **Piece-local model:** transition counts are learned incrementally only from earlier events in the generated sequence.
- **Synthetic-corpus model:** a small declared gesture-transition prior used for teaching model dependence. It is not trained on, or representative of, a musical culture.
- **Listener-personalized model:** transition counts begin with next-gesture expectations the listener explicitly teaches and stores locally, then update with the current piece. With no observations it reduces to the piece-local model.
- **Outputs:** alternatives, uncertainty before an event, and surprise after an event.
- **Limits:** gestures are curated labels; no claim is made that transition counts capture human expectation. Listener annotations remain separate lanes.

## Recording analysis

- **Schema:** `music-with-no-names.analysis.v1`.
- **Analysis version:** `mwno-audio-0.3.0`.
- **Inputs:** locally decoded mono samples, sample rate, channel count, and filename. Audio is never included in export.
- **Outputs:** 50 ms, 250 ms, and 1 s frames; RMS level; spectral-balance and band-energy proxies; flux and onset evidence; zero-crossing frequency; periodicity; harmonicity, salience, and roughness proxies; pulse candidates; onset phase; tempo envelope; syncopation; recurrence; and section candidates.
- **Confidence:** periodicity and pulse confidence are normalized internal model evidence. Roughness, harmonicity, and salience carry explicit evidence-confidence values derived from signal level, periodicity, brightness, and local change; these are model-internal confidence measures, not population-calibrated probabilities.
- **Known failures:** dense mixtures, noise, polyphony, strong transients, expressive tempo, and long files can undermine estimates. Listener corrections are exported separately from measurements.

## Atlas and personal-response models

- **Atlas schema:** `mwno-landmark.v1`.
- **Inputs:** declared measured values, curator hypotheses, uncertainty, listener spread, layer, provenance, and licensing.
- **Outputs:** porous descriptive placements and listener/goal-conditioned proximity—not quality rankings.
- **Personal terrain version:** `mwno-personal-1`; weighted centers and bandwidths are learned from local ratings with visible sample-count uncertainty.
- **Limits:** the bundled Atlas is a teaching set, not a statistically representative genre corpus. Its density clouds are derived only from the declared small starter corpora and must not be generalized to all music in a genre. Personal models with few samples are unstable and remain on the device.

## Governance

- Model predictions, curator hypotheses, measured evidence, and human reports use distinct fields and encodings.
- No scalar may be called goodness without listener, purpose, context, uncertainty, and visible components.
- Changes to formulas or semantics require a version change and regression fixtures.
- Empirical anchors and prohibited claims are recorded in [research-ledger.md](./research-ledger.md).
- Reproducible checks and their limits are recorded in [validation-report.md](./validation-report.md).
- Dataset and fixture origins are recorded in [data-provenance.md](./data-provenance.md).
