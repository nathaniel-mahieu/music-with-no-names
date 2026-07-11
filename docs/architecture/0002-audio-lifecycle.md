# ADR 0002: Audio lifecycle and safety

## Status

Accepted.

## Decision

Audio begins only after an explicit listener action. Every synthesized or decoded source passes through conservative gain staging and a dynamics compressor. Start and stop transitions use short ramps. Audio contexts and scheduled sources are closed on stop and component teardown.

Nominal sustained synthesis targets approximately −28 dBFS RMS. Simultaneous voices use equal-power mixing with a separate coherent-peak ceiling; harmonic waveforms are RMS-matched to sine references. Imported and generated recordings are attenuated against both RMS and peak targets. Every path uses the same safety-compressor settings so page changes do not introduce arbitrary level jumps.

## Safety invariants

- No autoplay.
- Default gain is deliberately low.
- A visible control always reflects playback intent.
- Parameter changes never create an instantaneous full-scale discontinuity.
- Stopping ramps toward silence before sources close.
- Imported audio remains in browser memory and is never transmitted.

## Consequences

Automated browser environments may not grant audio-context activation. Mathematical, state, and lifecycle logic therefore require tests independent of audible browser output, while real-device validation remains a release task.
