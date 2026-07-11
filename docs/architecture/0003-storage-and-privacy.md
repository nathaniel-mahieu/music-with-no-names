# ADR 0003: Storage and privacy

## Status

Accepted for the private MVP.

## Decision

Use browser storage only for explicitly local response observations. Do not add a backend, accounts, cohort aggregation, or audio upload. Recording analysis executes in a Web Worker. Portable analysis JSON contains measurements, hypotheses, corrections, versions, and limitations but never audio samples.

## Data classes

- **Ephemeral:** decoded audio buffers, active oscillator nodes, temporary visualization state.
- **Device-local:** independent listener ratings and model/response comparison observations.
- **Portable by explicit action:** analysis JSON and personal rating JSON.
- **Never collected:** copyrighted audio, microphone input, identity-linked listening history.

## Consequences

Cross-device preference learning is unavailable. A future backend requires a new consent, retention, deletion, access-control, and threat-model decision rather than an incremental implementation shortcut.
