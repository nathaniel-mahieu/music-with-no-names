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
- Resonance Sky's proximity layers may align several representations but must preserve their evidence boundaries. Fifths tides show attack density at the trailing onset window ending at the latest attack, seven-attack microscope, and retained-phrase scopes; the first window follows the chord grouping width, tides may omit a center for diffuse circular evidence, and none becomes a key estimate. The all-twelve route crown must show outside-route positions and competing catalog fits rather than letting a working frame masquerade as certainty. Pitch-set route compatibility and performed contextual-center cues remain separate marks and sentences. Phrase-scoped chord hulls must distinguish interpreted membership from everything sounding, while the attack contour must preserve close-time bouquets rather than drawing every attack as one melody. Motif bridges are detector relationship windows, and nearby in-route fields are low-change possibilities, not predictions. Live sounding fields and historical attack-time snapshots require distinct labels. An annotation may disappear under collision or display caps only when the same evidence remains in the SVG description or adjacent text.

## Consequences

A compact graphic without a textual interpretation is unfinished. A scalar called “goodness,” “consonance,” or “emotion” is prohibited unless its listener, purpose, inputs, uncertainty, and components are visible.
