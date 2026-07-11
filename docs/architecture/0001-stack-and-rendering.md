# ADR 0001: Application stack and rendering

## Status

Accepted.

## Decision

Use TypeScript, React, Next-compatible app routing, and vinext to produce a Cloudflare Worker-compatible application. Keep all scientific transforms in framework-independent modules under `lib/`; React components may render and orchestrate them but must not be the only implementation of model logic.

## Rationale

- The application needs low-latency client interaction and Web Audio access.
- Server rendering keeps the learning surface readable before hydration.
- Pure TypeScript model modules can be tested against analytic signal fixtures.
- vinext preserves the Sites deployment contract without coupling domain objects to hosting.

## Consequences

- Browser-only APIs require explicit client boundaries.
- Every browser capability needs a visible failure state.
- Framework upgrades must preserve the pure model test suite and Worker bundle.
