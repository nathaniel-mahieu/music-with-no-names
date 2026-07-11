# Proposed consented cohort backend

## Status

Proposed only. No backend, cohort collection, identity linkage, or network submission is implemented. Implementation requires explicit project-owner authorization and a separate privacy/security review.

## Purpose boundary

The only intended question is: “How does my locally learned response terrain compare with an aggregate of consenting listeners under the same declared task?” The service must not rank listeners, infer identity or health, upload recordings, or turn cohort averages into musical-goodness claims.

## Consent sequence

1. Explain exactly which response fields would leave the device.
2. Show the retention period, aggregation method, minimum cohort size, and deletion method.
3. Require an unchecked opt-in control followed by an explicit submit action.
4. Let the listener preview the complete payload before submission.
5. Issue a deletion secret stored only on the listener’s device or explicitly exported by them.
6. Keep local use fully functional after refusal or withdrawal.

Consent to one study version must not silently carry into a changed schema, purpose, or retention policy.

## Minimal submission schema

Allowed fields:

- Random submission identifier generated on device.
- Study and schema version.
- Declared listening goal and controlled condition identifier.
- Independent listener ratings: smoothness, fusion, tension, liking, familiarity, interest, local comfort, and whole-arc satisfaction.
- Coarsened model coordinates needed for comparison.
- Coarsened device category only when required for analysis.
- Consent timestamp and consent-text version.

Forbidden fields:

- Audio samples, filenames, free-text annotations, IP-derived location, account identifiers, email, advertising identifiers, browser fingerprint components, or raw interaction logs.
- Exact timestamps beyond what deletion and consent auditing require.
- Health, hearing-loss, demographic, or protected-trait inference.

## Aggregation and release rules

- Return only aggregates after a deliberately chosen minimum cell count; never return individual submissions.
- Suppress sparse combinations and repeated queries that could isolate a participant.
- Use broad bins and publish their definitions.
- Show sample count, uncertainty, task, cohort inclusion criteria, study version, and collection period beside every comparison.
- Keep cohort spread visually distinct from model uncertainty and the current listener’s local observations.
- Do not label an average region as normal, correct, consonant, or good.

## Retention and deletion

- Define a short raw-submission retention window before launch.
- Delete raw submissions when the window expires or a valid deletion secret is presented.
- Recompute or invalidate aggregates after deletions according to a published policy.
- Backups require the same expiry and deletion strategy.
- Keep an append-only schema/consent/version ledger without retaining deleted response content.

## Security requirements before launch

- Server-side schema validation and strict payload limits.
- Rate limiting without persistent fingerprinting.
- Encryption in transit and at rest through the selected platform.
- No third-party analytics on consent or response endpoints.
- Separate read and write capabilities; public clients cannot enumerate raw records.
- Automated tests for refusal, withdrawal, schema-version mismatch, sparse-cell suppression, deletion, and payload rejection.
- Threat-model and incident-response review by a qualified human before collecting real responses.

## Deliberate implementation decision required

Before implementation, the project owner must approve:

- Whether cohort comparison is worth introducing network collection at all.
- The workspace and data-region constraints.
- The minimum aggregation cell size.
- Raw and aggregate retention periods.
- The consent copy and deletion workflow.
- Who may access raw data, for what purpose, and how access is audited.
- Whether external privacy or research-ethics review is required.

Until those choices are approved, the correct product behavior is the current local-only Personal Lens.
