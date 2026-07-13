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

- **Version:** `mwno-piano-9` for the bounded sixty-second phrase, seven-attack microscope, duration/pedal ribbon, articulation lane, phrase-local motif transformations, focus lenses, phrase-stabilized scale frame, cyclic scale fingerprint, performed-evidence tonal gravity, silent resolution forks, correctable chord gestures, causal chord comparison, explicit voice-leading strands, and silent chord-target layer; standardized spectral evidence reuses `mwno-sonority-1`.
- **Inputs:** up to sixty seconds of local note-on events (bounded to 256 attacks), velocity, key release, sounding release, pedal extension, simultaneous held/pedaled field, optional chord-boundary corrections, an optional locked movable Do, the current scale frame, a locally selected ghost target, and optional conventional-label visibility. Coordinated detail views inspect the latest seven attacks.
- **Relational outputs:** frequency in hertz, equal-key ratio and cents from Do, movable syllable, selected-scale membership, pairwise interval landmarks, and repeated-fifths coordinates.
- **Fifths derivation:** each pure move multiplies frequency by 3:2 and removes octaves until the result lies within one octave. The equal-key placement is shown separately, including accumulated error and the approximately 23.46-cent mismatch between twelve pure fifths and seven octaves.
- **Scale candidates:** all twelve possible homes are tested against four declared pitch-class routes. Fit combines 72% observed-note membership, 18% route coverage, and 10% candidate-home presence. It is a compatibility ranking, not key detection certainty.
- **Performed tonal gravity:** each possible center is paired with its best-fitting declared route, then ranked by 42% route membership, 17% capped logarithmic sounding duration, 14% recurrence, 9% MIDI attack strength, 8% low-register presence, and 10% presence among the last three attacks. Pedal extension contributes 35% of its capped duration, and older attacks receive a bounded recency discount. Components are normalized within the local phrase and shown separately. This is an inspectable teaching heuristic, not a detected key, probability, listener model, or population fit.
- **Scale fingerprint and resolution forks:** the selected route is rendered as a cyclic string of one-, two-, or three-key gaps totaling twelve. Rotation changes only the displayed starting point and does not change the pitch set. Resolution forks are unranked invitations: return to the selected center, minimize one keyboard move, visit the selected center’s fifths neighbor, or choose a less-recent in-route pitch class. Selecting a fork freezes the choices and marks a pitch class silently; only a later learner attack can match it.
- **Articulation evidence:** finger contact ends at key release; pedal extension is sounding release minus key release; silence or overlap is measured against the next attack. A release is treated as edge-connected inside a tolerance bounded from 25 to 80 ms and otherwise set to 10% of the local inter-onset interval. The lane distinguishes still held, phrase ending, detached, connected, finger-overlapped, and pedal-linked timing. These are captured-event descriptions, not inferred note values, legato markings, fingering, or technique assessment.
- **Motif transformations:** non-overlapping windows of three or four note attacks are represented by exact semitone offsets from the first attack and onset gaps normalized by total window duration. Identical pitches and close rhythm form an exact repeat; constant-shift pitch shape and close rhythm form a transposed repeat; the same pitch shape with a normalized rhythm distance from 0.12 through 0.5 is a rhythmic variation; and a matching three-note opening with a changed fourth note is an altered ending. A later match separated by other attacks is labeled as a return after intervening material. The detector is phrase-local and deterministic, not a learned form or salience model.
- **Tonal tendency outputs:** pull toward selected Do weights chromatic neighbors and the fifth relation, then reduces unresolved pull when Do is already present. Home evidence combines Do presence, fifth support, and selected-route membership. Repose/arrival evidence combines 55% `mwno-sonority-1` repose with 45% home evidence; change is compared only with the previous held field.
- **Standardized spectral outputs:** harmonic-template fit and modeled spectral crunch assume a nine-partial harmonic teaching proxy weighted by MIDI velocity. MIDI contains no audio, so these values do not measure the actual spectrum of the connected keyboard.
- **MIDI behavior and privacy:** permission and messages stay in the browser. Note-on, note-off, velocity, and sustain drive only the live local visualization; Piano Lab never synthesizes, records, or routes audio. The bounded sixty-second phrase and local learning settings use tab-scoped session storage so they survive lab navigation and disappear when that tab session ends; nothing is uploaded.
- **Frame and chord limits:** an automatic frame waits for at least four distinct pitch classes, uses the sixty-second phrase rather than only the seven-note microscope, and still reports alternatives; this is catalog compatibility, not key detection. Chords are pitch-class template matches and cannot infer function, voicing intention, style, or emotional meaning. Incomplete matches are labeled as outlines and do not receive an exact root. Nearby chords first minimize pitch-class changes inside the displayed scale, then choose a compact realization near the current hand position; neither stage predicts what should come next.
- **Temporal grouping:** note attacks join a chord gesture when each adjacent gap fits the visible 80, 160, or 320 ms setting and the whole gesture remains within twice that duration. A learner may explicitly break before or join a selected attack; the correction is displayed and reversible. At least two attacks and two distinct pitch classes are required. The grouping is timing evidence or a declared learner correction, not certainty about a performer’s intended chord. Notes already held or sustained at the gesture’s close contribute to sounding-field proxies but are labeled as inherited rather than chord attacks.
- **Chord-transition outputs:** pitch-set novelty is Jaccard distance between successive attacked pitch-class sets; voice motion is a symmetric nearest-voice keyboard-distance proxy normalized to one octave; root travel is reported only between exact template matches and measures shortest distance around the fifths cycle. These remain separate from modeled crunch, tonal pull, arrival evidence, and listener response.
- **Voice-leading and targets:** completed chord gestures are paired by the minimum total absolute keyboard distance among currently represented voices. Strands report held, up, down, added, and released voices; motion classes report parallel, contrary, oblique, or changing voice count when those patterns are present. This is a nearest-key mapping, not inferred fingering, voice identity, or compositional intent. Nearby-chord choices create visible ghost keys only; the learner must supply the MIDI or on-screen attacks before a pitch-class match is reported.
- **Limits:** equal temperament is the keyboard coordinate system, not a claim of natural superiority. Velocity is not calibrated loudness. Scale membership is not correctness. The compatibility frame ignores note order and duration; the separate tonal-gravity heuristic uses local duration and order but is not trained or listener-validated. Tonal pull assumes the selected Do and declared scale frame. Articulation labels depend on MIDI timing and do not recover score notation. Motif matching ignores harmony, meter, accent hierarchy, phrase boundaries, orchestration, style, and listener salience. Resolution forks do not predict the intended, stylistic, emotionally effective, or correct continuation. Conditional language such as “may support” is not an emotion classifier or listener prediction.

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
