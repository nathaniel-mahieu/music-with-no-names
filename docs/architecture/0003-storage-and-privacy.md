# ADR 0003: Storage and privacy

## Status

Accepted for the private MVP.

## Decision

Use browser storage only for explicitly local response observations. Do not add a backend, accounts, cohort aggregation, or audio upload. Recording analysis executes in a Web Worker. Portable analysis JSON contains measurements, hypotheses, corrections, versions, and limitations but never audio samples.

## Data classes

- **Ephemeral:** decoded recording buffers, active oscillator nodes, explicitly enabled microphone waveform windows, derived live vocal-pitch estimates, and temporary visualization state.
- **Device-local:** independent listener ratings and model/response comparison observations.
- **Portable by explicit action:** analysis JSON and personal rating JSON.
- **Never persisted or uploaded:** copyrighted audio, microphone audio, microphone-derived pitch history, identity-linked listening history.

## Consequences

Cross-device preference learning is unavailable. Microphone access requires an explicit learner action, feeds a local analysis node without a recorder or destination connection, and stops its media tracks on stop or unmount. A future backend—or any microphone recording or pitch-history feature—requires a new consent, retention, deletion, access-control, and threat-model decision rather than an incremental implementation shortcut.
