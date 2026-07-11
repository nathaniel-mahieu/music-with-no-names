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
- **Limits:** the bundled Atlas is a teaching set, not a statistically representative genre corpus. Personal models with few samples are unstable and remain on the device.

## Governance

- Model predictions, curator hypotheses, measured evidence, and human reports use distinct fields and encodings.
- No scalar may be called goodness without listener, purpose, context, uncertainty, and visible components.
- Changes to formulas or semantics require a version change and regression fixtures.
- Empirical anchors and prohibited claims are recorded in [research-ledger.md](./research-ledger.md).
- Reproducible checks and their limits are recorded in [validation-report.md](./validation-report.md).
- Dataset and fixture origins are recorded in [data-provenance.md](./data-provenance.md).
