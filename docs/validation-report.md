# Validation report

## Analytic fixtures

The automated suite checks waveform samples, normalized waveform sums, rational common periods, harmonic spectra, coincident partials, log-frequency distance, periodicity evidence from a known sine realization, pulse tempo, nested phase, recurrence, prediction information, and response-terrain behavior against closed-form or constructed answers.

## Published-style psychoacoustic condition

The Ear Lab roughness curve is a Plomp–Levelt/Sethares-style educational model. For equal-amplitude simple tones, the implementation has an analytic maximum separation

`ln(5.75 / 3.5) / ((5.75 - 3.5) × scale)`

where `scale = 0.24 / (0.021 × lowerHz + 19)`. Automated tests numerically recover that maximum at 250, 500, and 1000 Hz. This confirms the implementation follows its declared curve family and changes with absolute register.

This is **not** a reproduction of the original listener experiment. The project does not reproduce its participants, apparatus, calibrated levels, stimulus protocol, response scale, or statistical analysis. The check supports only the limited claim that the demonstrator has the intended critical-band-relative simple-tone behavior. See [research-ledger.md](./research-ledger.md) for the evidence anchor and prohibited claims.

## Open validation work

- Calibrate auditory filters and level-dependent loudness against suitable published conditions.
- Validate mixed-tone descriptors against expert annotations without treating agreement as musical truth.
- Run preregistered listening and comprehension studies with listener reports separated from predictions.
- Profile long recordings and real audio devices.
