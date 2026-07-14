# Dataset and fixture provenance

## Bundled audio

No commercial or third-party recording is bundled. Recording Lab operates on audio the listener explicitly selects from their own device; that audio remains in browser memory and is not exported.

## Generated fixtures

- **Recurrence + rupture demo:** synthesized in the browser from 220 Hz plus a 330 Hz or 277 Hz component, gated at a 500 ms pulse. Authored for this project; no external rights are implicated.
- **Analytic sine fixtures:** generated at test time from closed-form sine functions at declared frequencies and sample rates.
- **Controlled Ear Lab fields:** synthesized at interaction time from declared fundamentals, partial amplitudes, inharmonic stretch, noise amount, attack, and duration.

## Open recording fixture candidate

`fixtures/open/manifest.json` pins Rubinkumar's fourteen-second *A Major Scale* recording from Wikimedia Commons under CC0 1.0, including its source page, direct media URL, declared byte count, and Wikimedia SHA-1 checksum. The deterministic fetch script rejects any size or checksum mismatch, and the test suite rechecks the bundled bytes. Browser codec coverage remains in the real-device matrix.

## Atlas teaching data

The initial Atlas entries are hand-authored pedagogical landmarks and transformations. They are not measurements of bundled copyrighted recordings and do not constitute a representative genre dataset. Each entry carries source type, method, version, layer, confidence or spread, and licensing metadata. The Atlas computes explicitly provisional density regions from three pop profiles, two blues profiles, and four selected-classical profiles; counts and methods remain visible, and the regions are deliberately porous and overlapping.

The v1.51 live bridge does not add a recording corpus. Its live square is derived only from the current tab's retained MIDI attacks; the selected landmark's circular marks remain the existing curator-authored, whole-recording hypotheses. No phrase, audio, similarity result, or landmark assignment is uploaded or persisted as new Atlas data.

The v1.52 Rhythm bridge derives its pitchless timeline only from that same tab-scoped MIDI phrase. It does not capture audio, fetch timing examples, add the phrase to a dataset, or upload attacks, velocity, or release times. Its ratio landmarks are authored mathematical reference coordinates, not learned genre norms.

The v1.53 Journey bridge derives field shape, bass motion, relative onset time, and continuation counts only from that tab-scoped MIDI phrase. It does not capture audio, query or add a corpus, identify a work or style, persist a learned population model, or upload the phrase. Its alternatives are counts inside the current specimen, not recommendations or crowd expectations.

The v1.54 Harmony bridge derives attacked chord fields from that same tab-scoped phrase plus the learner's stored chord-timing and break/join corrections. Its auditory deltas are generated from a fixed nine-partial exact-harmonic teaching spectrum rather than keyboard or DAW audio; MIDI velocity is not treated as loudness. It does not add a corpus, upload a phrase, reconstruct pedal-inherited chord membership, infer emotion, or store a listener model.

## Listener data

Ear observations, Journey responses, and Personal Lens ratings are created by the current listener and stored only in that browser. No cohort data, identity, account, or backend aggregation exists. Export occurs only through an explicit local JSON action.

## External research

Papers in the research ledger are conceptual and empirical anchors, not training data. No article text or research-participant data is copied into the product.
