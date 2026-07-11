# Accessibility verification matrix

## Automated contracts

- Every primary Lab is a named semantic region.
- Native buttons, range inputs, selects, details, and links provide keyboard operation without custom key handlers.
- Focus-visible outlines cover links, buttons, inputs, and selects.
- Dynamic audio and analysis status uses polite live regions.
- Canvas and dense visualizations provide accessible names or adjacent textual interpretations.
- Reduced-motion preferences disable smooth scrolling and collapse animation/transition duration.
- Color is redundant with text labels, position, marker shape, border style, or fill pattern. Atlas corpus clouds use dashed, dotted, and double borders plus distinct patterns.

These contracts are tested in `tests/accessibility-contract.test.mjs` and source-rendering tests.

## Manual verification still required

The following must be checked with real assistive technology and are not claimed complete from source inspection:

- Full keyboard traversal and focus order in each Lab.
- VoiceOver and NVDA announcements for changing model states, sliders, plots, and local-file workflows.
- High-contrast and forced-color modes.
- Touch target comfort and switch-control operation on real mobile devices.
- Reduced-motion behavior in a browser with the operating-system preference enabled.
