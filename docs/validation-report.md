# Validation report

## Analytic fixtures

The automated suite checks waveform samples, normalized waveform sums, rational common periods, harmonic spectra, coincident partials, log-frequency distance, periodicity evidence from a known sine realization, pulse tempo, nested phase, recurrence, prediction information, and response-terrain behavior against closed-form or constructed answers.

## Published-style psychoacoustic condition

The Ear Lab roughness curve is a Plomp–Levelt/Sethares-style educational model. For equal-amplitude simple tones, the implementation has an analytic maximum separation

`ln(5.75 / 3.5) / ((5.75 - 3.5) × scale)`

where `scale = 0.24 / (0.021 × lowerHz + 19)`. Automated tests numerically recover that maximum at 250, 500, and 1000 Hz. This confirms the implementation follows its declared curve family and changes with absolute register.

This is **not** a reproduction of the original listener experiment. The project does not reproduce its participants, apparatus, calibrated levels, stimulus protocol, response scale, or statistical analysis. The check supports only the limited claim that the demonstrator has the intended critical-band-relative simple-tone behavior. See [research-ledger.md](./research-ledger.md) for the evidence anchor and prohibited claims.

## Sonority-affordance invariants

The sonority-model fixtures require all dimensions to remain separately bounded, a compact 4:5:6 field to show stronger harmonic fit and less ambiguity than a field containing √2, higher realizations to show greater spectral brightness, wider voicings to show greater openness, and recent motion to raise modeled activation while lowering modeled repose. These direction checks verify the declared explanatory logic; they do not validate an emotion prediction against listeners.

## Scale-learning invariants

The Scale Lab fixtures require every preset to close at an exact 2:1 octave, preserve its ratio structure under transposition, keep identical physical gaps in the same small/medium/large category, and spell the 3 · 2 · 2 · 3 · 2 path as Do · Me · Fa · Sol · Te in the declared chromatic movable-Do convention. Every inner-hearing path is authored for its specific scale, uses valid degree indices without modulo wrapping, varies the missing position, and avoids a target identical to either neighbor.

The browser review additionally checks that the model’s ten-partial harmonic spectrum is the spectrum synthesized for simultaneous examples, while melodic examples explicitly exclude simultaneous roughness as their explanation. Context and inner-hearing tasks collect a learner response before interpretation. These checks validate internal consistency and interaction behavior; they do not demonstrate learning gains in recruited participants.

## Piano and MIDI invariants

The piano-model fixtures pin MIDI note 69 to 440 Hz, require octave frequency doubling, verify that each learning scale closes after twelve equal keyboard steps, and preserve movable-Do role under transposition. Pairwise interval tests compare equal-key distances with declared simple-ratio landmarks without treating the landmark as the tuning identity.

The fifths fixtures generate the order Do → Sol → Re → La by repeated 3:2 multiplication and octave folding. They recover the approximately 1.955-cent difference between one pure fifth and seven equal-key steps, and the approximately 23.46-cent mismatch after twelve pure fifths versus seven octaves. MIDI parser fixtures cover note-on, explicit and zero-velocity note-off, channel preservation, and sustain-pedal thresholds.

Scale-candidate fixtures require a complete bright seven-position route to rank its matching Do frame at full compatibility while retaining other candidates. Tonal-tendency fixtures keep unresolved pull separate from home/arrival evidence, and sequential fixtures distinguish motion toward repose, away from repose, and small ambiguous changes. Source contracts also prohibit `AudioContext`, oscillators, and synthesizer activation inside Piano Lab so MIDI remains visualization-only.

The v1.26 HUD fixtures additionally require a strict seven-event note-on buffer that preserves repeated attacks, prevent the automatic scale frame from stabilizing before four distinct pitch classes, recognize chord inversions despite doubled notes, keep incomplete chord outlines explicit, and rank nearby scale chords by retained pitch classes with a concrete one-voice move when available.

The v1.27 temporal-chord fixtures enforce both adjacent-gap and maximum-span boundaries, keep inherited sounding tones out of attacked chord membership, reject repeated attacks of one pitch class as a chord, and independently measure pitch-set novelty, symmetric voice-motion distance, shared tones, and exact-root travel around the fifths cycle.

The v1.28 polish fixtures add bounded register-aware chord realization and reject empty, invalid, or overlarge pitch collections before combinatorial voicing work. Browser checks confirm that incomplete dyads remain labeled as outlines with an unknown root, exact triads restore root travel, suggested moves stay near the current hand position, essential HUD copy remains readable, and 390-pixel and desktop layouts avoid horizontal clipping.

The v1.29 phrase fixtures permit explicit break/join corrections at inferred chord boundaries while preserving automatic adjacent-gap and maximum-span behavior elsewhere. Source contracts require the live phrase ribbon, Interval Echo, causal chord view, prominent assumed-sound disclosure, tab-scoped session persistence, and active-lab URL state. Browser checks confirm five captured on-screen attacks persist across Scale/Piano navigation with the chosen learning lens, an interval can be matched from a new starting key, a forced join creates a corrected chord group, controls remain unclipped at 390 pixels, and no console errors are emitted.

Source-level accessibility contracts require a named piano region, native on-screen key and event buttons, polite live status, named SVG summaries, a text-labeled fifths cycle, forced-color states, and no positive tab indices. Browser review and physical MIDI-device testing remain separate release checks.

## Playback-level invariants

Synthesized labs share a nominal 0.065 master gain, equal-power simultaneous mixing, RMS-matched harmonic waveforms, a 0.24 coherent-peak ceiling, and one safety-compressor configuration. Recording playback is attenuated against both a 0.045 RMS target and a 0.20 peak ceiling. Tests cover silent and invalid inputs, voice-count invariance, timbre power matching, and recording gain bounds. Rhythm remains a separately calibrated transient, and authored musical dynamics remain intentionally audible.

## Open validation work

- Calibrate auditory filters and level-dependent loudness against suitable published conditions.
- Validate mixed-tone descriptors against expert annotations without treating agreement as musical truth.
- Run preregistered listening and comprehension studies with listener reports separated from predictions.
- Profile additional long-file formats and real audio devices beyond the generated performance budget.

## Performance budgets

The automated suite analyzes a generated two-minute, 12 kHz fixture and requires completion within five seconds, less than 256 MB of heap growth, and bounded multi-resolution frame counts. Recording Lab additionally exposes device-local worker throughput, browser-reported audio scheduling latency, median display-frame duration, and JavaScript heap when the browser provides it. These diagnostics do not replace real-device testing.
