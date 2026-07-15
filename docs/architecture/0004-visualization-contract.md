# ADR 0004: Visualization contract

## Status

Accepted.

## Decision

Every essential visual must expose a textual interpretation and accessible name. Measured evidence, model predictions, curator hypotheses, and listener reports use distinct labels and must not be merged into a single authority-looking score.

## Visual grammar

- Physical frequency uses logarithmic horizontal space where equal distance means equal ratio.
- Time views preserve absolute seconds and declared relative pulse units.
- Model confidence is shown separately from listener disagreement.
- Color is redundant with labels, shape, position, or pattern.
- Conventional pitch-class names are never required to interpret a core visual.
- Resonance Sky keeps performed-note direction fixed in one declared circle-of-fifths orientation so an inferred frame change cannot make the played geometry jump. Its radial coordinate is equal MIDI-key/log-reference-frequency register depth, not the Ratio Lab's measured or authored physical-frequency axis; equal unclamped semitone steps receive equal radial increments, and extreme MIDI values may clamp at the display boundary. A movable Do changes the meridian, relative labels, and hue interpretation—not event identity or position. Color is repeated by route fill/dash state, labels, ring count, line pattern, arrows, and text. Recency and MIDI attack may change bounded opacity or area, but never encode goodness. No ambient motion loops are permitted; event motion must end in the same static geometry exposed under reduced motion.

## Consequences

A compact graphic without a textual interpretation is unfinished. A scalar called “goodness,” “consonance,” or “emotion” is prohibited unless its listener, purpose, inputs, uncertainty, and components are visible.
