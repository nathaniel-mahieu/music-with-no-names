# First-principles music glossary

| Term | Meaning in this project | Not interchangeable with |
|---|---|---|
| Frequency | Physical cycles per second, measured in hertz. | Pitch, note identity, importance. |
| Pitch | A listener’s perceptual organization of periodic sound. | A single Fourier peak or guaranteed fundamental. |
| Ratio | Multiplicative relationship between frequencies or durations. | A conventional interval name or a goodness score. |
| Semitone | One equal-tempered piano-key step; in 12-TET it multiplies reference frequency by `2^(1/12)`, and twelve semitones form a 2:1 octave. | A fixed amount of tension, roughness, resolution, emotion, or quality. |
| Interval | Pitch distance between two events or simultaneous components; this project may expose semitone count, frequency ratio, direction, register, timing, and context separately. | Semitone count alone or one universal consonance rank. |
| Sequential key interval | The signed difference between two chronological MIDI key attacks, retained in physical register; close-time bouquets are labeled as attack order rather than automatically treated as melody. | An octave-folded pitch-class distance, intended fingering or voice, whole-chord motion, or a guarantee that the sounds did not overlap. |
| Listening prompt | A small cluster of possible attention words—such as closeness, rub, breadth, reach, or register echo—offered beside inspectable interval evidence. | A detected emotion, universal association, consonance verdict, preference prediction, or report from the listener. |
| Generator orbit | The ordered pitch-class path made by repeatedly adding one fixed equal-key step modulo the octave; in twelve positions its length is `12 / gcd(12, step)`. | A scale, key, tuning system, historical cause, or claim that every visited position has equal musical function. |
| Generator window | A finite consecutive selection from a generator orbit, interpreted only after its size and a position for Do are declared; sorting its positions around the octave yields a cyclic gap pattern. | The full orbit, a uniquely implied tonic, or a scale name guaranteed by the generator alone. |
| Partial | One frequency component of a source spectrum. | Necessarily an exact harmonic. |
| Fundamental reference | The A4=440 12-TET frequency derived from a MIDI key number and used as a teaching coordinate. | Measured acoustic pitch from the keyboard, DAW, microphone, or room. |
| Harmonicity | Fit between observed components and one or more harmonic templates. | Smoothness, stability, liking. |
| Periodicity | Evidence that a waveform or event pattern repeats after a duration. | Musical meter, closure, pleasure. |
| Roughness | A sensory-interaction hypothesis for nearby components within auditory frequency selectivity. | Dissonance in every musical sense. |
| Fusion | Degree to which a listener organizes sources as one auditory object. | Harmonicity or liking. |
| Consonance | A historically and contextually overloaded family of sensory, structural, and cultural judgments. | Any one model output. The UI avoids using it as a meter. |
| Stability | Context-dependent expectation that an event can function as a center, continuation, or stopping point. | Low roughness. |
| Resolution | A listener's context-dependent experience of arrival, release, or directional completion after a path. | A compulsory one-semitone move or a property fixed by major, minor, or diminished chord type. |
| Tension | Felt or modeled activation toward change, continuation, or release. | Roughness, loudness, or negative emotion alone. |
| Pulse | A periodic timing hypothesis that organizes events. | A fixed meter name or exact clock grid. |
| Local onset ruler | The median spacing among recent grouped attacks, used only to compare the phrase's own gap shapes. | A detected beat, intended tempo, meter, bar position, groove, or performance-accuracy score. |
| Grid deviation | Signed or absolute distance from the closest declared pulse/ratio landmark. | Proof that the performer intended that landmark, or a correctness score. |
| Groove | Embodied urge and timing relationship involving pulse, microtiming, pattern, and listener. | Syncopation or pulse confidence alone. |
| Recurrence | Reappearance of an event pattern, exactly or after an allowed transformation. | Repetition without perceptual relevance. |
| Uncertainty | Spread among plausible next events before an event occurs. | Surprise. |
| Surprise | Information associated with what occurred relative to a predictive model. | Novelty, quality, or pleasure. |
| Liking | A listener report in a particular context and time. | Objective musical value. |
| Goodness | A shorthand that is valid only when expanded into listener, purpose, context, components, and uncertainty. | A universal property of sound. |
