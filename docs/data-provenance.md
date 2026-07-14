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

The v1.55 Ear bridge derives one interval from the latest two valid attacks in that same tab-scoped phrase. Key numbers and event timing supply equal-tempered fundamentals, movement, onset spacing, and release-proven overlap; they do not supply audio or upper partials. Four generated spectra—sine, exact harmonic, mellow-piano proxy, and bright-piano proxy—are compared only after overlap is proven. No phrase or audio is uploaded, no keyboard or DAW spectrum is analyzed, MIDI velocity is not acoustic loudness, and no sensory proxy is stored as a listener response, preference, emotion, or quality label.

The v1.56 Interval Context Echo uses only two frozen tab-scoped MIDI events and one later two-attack replay. It derives key span, equal-tempered fundamentals, attack gap, direction, release-proven overlap, and the second attack's sounding MIDI field from those local events. Current movable-Do labels are a selected teaching overlay. The chosen teaching spectrum contributes roughness and partial overlap only when both pairs prove simultaneous overlap; no keyboard or DAW audio, listener response, or inferred musical function is added or uploaded.

The v1.57 Interval Experience Handoff copies those exact four local MIDI events into the existing Personal Character Map only after the learner selects `Reflect on source + echo`. The retained live phrase remains unchanged. Timing, key span, velocity, release, field membership, and assumed-spectrum summaries remain measured or modeled evidence; settledness, energy, familiarity, and liking are stored only after explicit listener answers. The resulting report stays in browser-local storage, enters the existing explicit JSON export and two-step deletion flow, and is never uploaded automatically.

The v1.58 Chord Change Experience Handoff copies the attacks belonging to the selected corrected chord gesture and its immediately preceding corrected gesture only after the learner selects `Reflect on chord change`. Boundary and inherited-membership corrections determine which two interpreted fields are compared, while the copied event records retain their original MIDI note, onset, velocity, release, and sounding-field evidence. The sixty-second live phrase is not shortened or replaced. Field size, key span, entered/left/stayed positions, nearest-key motion, and declared-spectrum or selected-Do teaching coordinates remain measured, interpreted, or modeled evidence; settledness, energy, familiarity, and liking remain absent until the listener answers. The bounded specimen persists through Piano focus changes, returns to whole-phrase mode only by explicit learner action or Clear, and follows the same browser-local export and deletion policy as other phrase reports.

## Listener data

Ear observations, Journey responses, and Personal Lens ratings are created by the current listener and stored only in that browser. No cohort data, identity, account, or backend aggregation exists. Export occurs only through an explicit local JSON action.

## External research

Papers in the research ledger are conceptual and empirical anchors, not training data. No article text or research-participant data is copied into the product.
