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

The Scale Lab fixtures require every preset to close at an exact 2:1 octave, preserve its ratio structure under transposition, keep identical physical gaps in the same close/middle/open category, and spell the 3 · 2 · 2 · 3 · 2 orbit as Do · Me · Fa · Sol · Te in the declared chromatic movable-Do convention. Every inner-hearing path is authored for its specific scale, uses valid degree indices without modulo wrapping, varies the missing position, and avoids a target identical to either neighbor.

The browser review additionally checks that the model’s ten-partial harmonic spectrum is the spectrum synthesized for simultaneous examples, while melodic examples explicitly exclude simultaneous roughness as their explanation. Context and inner-hearing tasks collect a learner response before interpretation. These checks validate internal consistency and interaction behavior; they do not demonstrate learning gains in recruited participants.

## Open validation work

- Calibrate auditory filters and level-dependent loudness against suitable published conditions.
- Validate mixed-tone descriptors against expert annotations without treating agreement as musical truth.
- Run preregistered listening and comprehension studies with listener reports separated from predictions.
- Profile additional long-file formats and real audio devices beyond the generated performance budget.

## Performance budgets

The automated suite analyzes a generated two-minute, 12 kHz fixture and requires completion within five seconds, less than 256 MB of heap growth, and bounded multi-resolution frame counts. Recording Lab additionally exposes device-local worker throughput, browser-reported audio scheduling latency, median display-frame duration, and JavaScript heap when the browser provides it. These diagnostics do not replace real-device testing.
