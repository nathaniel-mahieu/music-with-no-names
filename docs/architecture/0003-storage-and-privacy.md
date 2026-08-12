# ADR 0003: Storage and privacy

## Status

Accepted for the private MVP.

## Decision

Use browser storage only for explicitly local response observations and bounded lesson-continuity state. Tab-scoped `sessionStorage` may retain validated MIDI exercise coordinates, attempt boundaries, completed symbolic note paths, learner-selected steps, and small derived miss histories so an exercise survives navigation; it must not become a proficiency score or durable learner profile. Persistent `localStorage` remains reserved for learner-authored response observations with visible export and deletion. Do not add a backend, accounts, cohort aggregation, or audio upload. Recording analysis executes in a Web Worker. Portable analysis JSON contains measurements, hypotheses, corrections, versions, and limitations but never audio samples.

## Data classes

- **Ephemeral:** decoded recording buffers, active oscillator nodes, explicitly enabled microphone waveform windows, derived live vocal-pitch estimates, and temporary visualization state.
- **Tab-scoped lesson continuity:** bounded MIDI events and exercise coordinates, explicit attempt boundaries, temporary self-reports, and small validated derived histories. These disappear with the tab session and are not exported.
- **Device-local:** independent listener ratings and model/response comparison observations.
- **Portable by explicit action:** analysis JSON and personal rating JSON.
- **Never persisted or uploaded:** copyrighted audio, microphone audio, microphone-derived pitch history, identity-linked listening history.

## Consequences

Cross-device preference learning is unavailable. A lesson may expose a direct reset while a derived miss history uses its own explicit deletion control; counts describe recorded events, never success rates or ability. Microphone access requires an explicit learner action, feeds a local analysis node without a recorder or destination connection, and stops its media tracks on stop or unmount. A future backend—or any microphone recording, microphone pitch-history, durable MIDI-history, or learner-profiling feature—requires a new consent, retention, deletion, access-control, and threat-model decision rather than an incremental implementation shortcut.
