# Accessibility verification matrix

## Automated contracts

- Every primary Lab is a named semantic region.
- Native buttons, range inputs, selects, details, and links provide keyboard operation without custom key handlers.
- The persistent navigation exposes Start, Piano, and Personal Lens directly, groups every supporting lab inside a native `details` disclosure, and names the conditional return-to-phrase region for assistive technology.
- Focus-visible outlines cover links, buttons, inputs, and selects.
- Dynamic audio and analysis status uses polite live regions.
- The Piano Lab uses native buttons for every silent on-screen key, attack, learning lens, phrase-A/B intention/capture/replay/promotion/report, selected-attack reflection, Motion question, four-tap pulse action, performed-fingerprint and guided-scale action, tonal-gravity target and evidence-lane intervention, controlled-sonority recipe, interval-echo action, landmark replay/transposition, ghost target, chord-boundary correction, inherited-membership correction, and grouped chord gesture; native selects for MIDI device and chord timing granularity; text-redundant held, sustained, duration, pedal-tail, selected-attack provenance/attribution/guardrail, phrase-target/control/other-change/invariant/provenance, pulse-capture/phase/gap, performed-gap, gravity rank/component change, landmark changed/invariant/listen-for comparison, inherited, excluded, guided-step, controlled-baseline/replay, ghost, scale, chord-member, interval-source/replay/invariant, partial-alignment, interaction-zone, and voice-motion states; named visual summaries for the sixty-second phrase ribbon, selected-attack five-lens group, five-lens A/B profile, staff, frequency, fifths, performed octave positions, paired twelve-center gravity comparison, live pulse, source-versus-echo interval, two-note partial comb, landmark transposition, voice-leading, and evidence views; concise polite live explanations for the HUD, selected-attack attribution, phrase-B capture and one-change result, pulse capture, performed fingerprint, Interval Echo retry, gravity counterfactual, guided walk, landmark center change, and one-note sonority comparison; and double/dotted/solid outline, fill, line, circle, square, diamond, dash, cross, check, arrow, number, and text labels as well as color for selected-attack evidence provenance, A/B targets/invariants/changes/reports, baseline/intervention center bars, pulse lines and onsets, source-versus-echo hand shapes, partial alignment and interaction links, perceptual traces, voice strands, performed positions, walk progress, inherited exclusions, silent sonority references, ghost keys, and chord brackets.
- The one-tone landmark counterfactual adds a named five-lens comparison, a live description of the single key replacement, native replay/restore/report buttons, pressed-state text for the listener choice, and explicit physical/model/listener provenance. Its 900- and 620-pixel layouts reflow from five columns to three and then one; forced-color mode preserves the intervention marker and selected report without relying on hue.
- The Live Phrase Landmark Bridge is a named region led by one explicit question. Its three-lane visual has a complete text alternative, labels the square live mark and circular curator mark redundantly, uses native return and landmark buttons, keeps advanced Atlas controls in a native disclosure, preserves system-color distinctions in forced-color mode, and stacks the lanes and actions at the declared 900- and 620-pixel breakpoints.
- The Pitchless Phrase Rhythm Bridge is a named region led by one explicit question. Its timing axis has a complete text alternative; onset groups use numbered marks and a distinct square shape when several attacks cluster; recurrence is written as “shape returns” as well as marked by a line; exact multiples, nearest ratios, overlap, silence, and missing release evidence remain text visible. Replay uses a native button, the authored cycle uses a native disclosure, forced-color mode preserves the onset and recurrence marks, and the 900- and 620-pixel contracts stack readouts, gap cells, copy, and actions without horizontal scrolling.
- Canvas and dense visualizations provide accessible names or adjacent textual interpretations.
- Reduced-motion preferences disable smooth scrolling and collapse animation/transition duration.
- Color is redundant with text labels, position, marker shape, border style, or fill pattern. Atlas corpus clouds use dashed, dotted, and double borders plus distinct patterns.
- The first keyboard stop is a skip link to the active Lab, avoiding repeated traversal through the global lab selector and hero.
- Forced-color mode replaces decorative backgrounds with system colors, preserves selected states with `Highlight`, and distinguishes spectral voices through width and shape as well as color.

These contracts are tested in `tests/accessibility-contract.test.mjs` and source-rendering tests.

## Manual verification still required

The following must be checked with real assistive technology and are not claimed complete from source inspection:

- Full keyboard traversal and focus order in each Lab.
- VoiceOver and NVDA announcements for changing model states, sliders, plots, and local-file workflows.
- High-contrast and forced-color modes.
- Confirm system-color appearance in Windows High Contrast on physical displays; the automated forced-color contract does not substitute for this check.
- Touch target comfort and switch-control operation on real mobile devices.
- Physical MIDI-keyboard connection, sustain behavior, disconnect/reconnect announcements, and device switching with assistive technology.
- Reduced-motion behavior in a browser with the operating-system preference enabled.
