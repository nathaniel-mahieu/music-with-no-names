"use client";

import { memo, useEffect, useId, useState, type CSSProperties } from "react";
import {
  CONVENTIONAL_PITCH_CLASSES,
  conventionalPitchName,
  frequencyFromMidi,
  nearbyScaleChords,
  nearestMidiForPitchClass,
  noteContext,
  pitchClassFromMidi,
  scaleSemitones,
  tonalTendency,
  voiceLeadingProfile,
  type ChordCandidate,
  type MotifTransformation,
  type PianoScale,
  type ScaleCandidate,
  type ScaleFrameSnapshot,
  type TonalGravityCandidate,
} from "@/lib/piano-model";
import {
  PIANO_SOUND_MODELS,
  pianoSoundModel,
  type PianoSoundModelId,
} from "@/lib/piano-sound-model";
import {
  IMMERSION_VIEWBOX,
  immersionArcPath,
  immersionAttackContour,
  immersionAttackKnowledge,
  immersionChordShape,
  immersionCloudHull,
  immersionCloudBounds,
  immersionCurve,
  immersionDirectionPoint,
  immersionFifthsTide,
  immersionIntervalField,
  immersionPhraseNewness,
  immersionPitchPoint,
  immersionReleaseProvenSilence,
  immersionRoleColor,
  immersionSameNoteField,
  immersionScaleSectors,
  immersionTrail,
  planImmersionAnnotations,
} from "@/lib/piano-immersion-model";

export type ImmersionHudEvent = {
  id: number;
  note: number;
  velocity: number;
  onsetMs: number;
  keyReleaseMs: number | null;
  releaseMs: number | null;
  releaseReason: "key" | "pedal" | null;
  fieldNotes: number[];
};

type ImmersionEventMeasure = {
  event: ImmersionHudEvent;
  crunch: number | null;
  pull: number;
  arrival: number;
  novelty: number;
  motion: number;
};

type ImmersionChordMeasure = {
  gesture: {
    id: string;
    attacks: ImmersionHudEvent[];
    attackedNotes: number[];
    inheritedNotes: number[];
    spreadMs: number;
    kind: "together" | "rolled";
  };
  interpretedNotes: number[];
  audibleNotes: number[];
  excludedInheritedNotes: number[];
  candidate: ChordCandidate | null;
  crunch: number | null;
  pull: number;
  novelty: number;
  motion: number;
  rootTravelSteps: number | null;
  commonPitchClassCount: number;
};

type ActiveImmersionNote = {
  note: number;
  velocity: number;
  pressed: boolean;
  sustained: boolean;
};

type PianoImmersionProps = {
  events: ImmersionHudEvent[];
  phraseEvents: ImmersionHudEvent[];
  measures: ImmersionEventMeasure[];
  chordMeasures: ImmersionChordMeasure[];
  activeNotes: ActiveImmersionNote[];
  doMidi: number;
  scale: PianoScale;
  frameMode: "discover" | "locked";
  frameSnapshot: ScaleFrameSnapshot | null;
  gravityCandidates: TonalGravityCandidate[];
  motifs: MotifTransformation[];
  nearbyReady: boolean;
  chordWindowMs: number;
  soundModelId: PianoSoundModelId;
  showConventions: boolean;
  onSoundModelChange: (value: PianoSoundModelId) => void;
};

const COSMIC_DUST = Array.from({ length: 54 }, (_, index) => ({
  x: 28 + (index * 181) % 1144,
  y: 24 + (index * 113) % 652,
  radius: 0.65 + (index % 4) * 0.42,
  opacity: 0.14 + (index % 5) * 0.055,
}));

function evidenceWord(value: number | null) {
  if (value == null) return "not available";
  if (value >= 0.67) return "high";
  if (value >= 0.34) return "moderate";
  return "low";
}

function formatHz(value: number) {
  return `${value.toFixed(value < 1000 ? 1 : 0)} Hz`;
}

function noteLabel(note: number, doMidi: number, scale: PianoScale, showConventions: boolean) {
  return showConventions ? conventionalPitchName(note) : noteContext(note, doMidi, scale).syllable;
}

function fieldCenter(notes: number[], doMidi: number) {
  const points = [...new Set(notes)].map((note) => immersionPitchPoint(note, doMidi));
  if (!points.length) return { x: IMMERSION_VIEWBOX.centerX, y: IMMERSION_VIEWBOX.centerY, radius: 190 };
  return {
    x: points.reduce((sum, point) => sum + point.x, 0) / points.length,
    y: points.reduce((sum, point) => sum + point.y, 0) / points.length,
    radius: points.reduce((sum, point) => sum + point.radius, 0) / points.length,
  };
}

function filamentPath(lower: { x: number; y: number }, upper: { x: number; y: number }) {
  const middleX = (lower.x + upper.x) / 2;
  const middleY = (lower.y + upper.y) / 2;
  const controlX = middleX + (IMMERSION_VIEWBOX.centerX - middleX) * 0.14;
  const controlY = middleY + (IMMERSION_VIEWBOX.centerY - middleY) * 0.14;
  return `M ${lower.x} ${lower.y} Q ${controlX} ${controlY} ${upper.x} ${upper.y}`;
}

function signedStepCount(value: number) {
  if (value > 0) return `↑${value}`;
  if (value < 0) return `↓${Math.abs(value)}`;
  return "0";
}

function keyMove(value: number) {
  return value === 0 ? "same key" : `${signedStepCount(value)} keys`;
}

function pitchClassLabel(pitchClass: number, doMidi: number, scale: PianoScale, showConventions: boolean) {
  if (showConventions) return CONVENTIONAL_PITCH_CLASSES[pitchClassFromMidi(pitchClass)];
  return noteContext(nearestMidiForPitchClass(pitchClass, doMidi), doMidi, scale).syllable;
}

function shortScaleLabel(candidate: ScaleCandidate, doMidi: number, selectedScale: PianoScale, showConventions: boolean) {
  const root = pitchClassLabel(candidate.rootPitchClass, doMidi, selectedScale, showConventions);
  return showConventions
    ? `${root} ${candidate.scale.conventionalName}`
    : `${root}-centered ${candidate.scale.name.replace(" route", "")}`;
}

function strongestContextCues(candidate: TonalGravityCandidate | null) {
  if (!candidate) return [];
  const labels: Record<Exclude<keyof TonalGravityCandidate["components"], "routeFit">, string> = {
    duration: "held time",
    recurrence: "recurrence",
    accent: "attack",
    bass: "low placement",
    ending: "ending",
  };
  return (Object.entries(candidate.components) as Array<[keyof TonalGravityCandidate["components"], number]>)
    .filter((entry): entry is [Exclude<keyof TonalGravityCandidate["components"], "routeFit">, number] => entry[0] !== "routeFit")
    .sort((first, second) => second[1] - first[1])
    .slice(0, 2)
    .map(([cue]) => labels[cue]);
}

function centroid(points: Array<{ x: number; y: number }>) {
  if (!points.length) return null;
  return {
    x: points.reduce((sum, point) => sum + point.x, 0) / points.length,
    y: points.reduce((sum, point) => sum + point.y, 0) / points.length,
  };
}

function fourPointStarPath(x: number, y: number, outer: number, inner: number) {
  return [0, 1, 2, 3, 4, 5, 6, 7].map((index) => {
    const radius = index % 2 === 0 ? outer : inner;
    const angle = -Math.PI / 2 + index * Math.PI / 4;
    const point = `${(x + Math.cos(angle) * radius).toFixed(2)} ${(y + Math.sin(angle) * radius).toFixed(2)}`;
    return `${index === 0 ? "M" : "L"} ${point}`;
  }).join(" ") + " Z";
}

function orbitArcPath(radius: number, startDegrees: number, endDegrees: number) {
  const start = startDegrees * Math.PI / 180;
  const end = endDegrees * Math.PI / 180;
  const startX = IMMERSION_VIEWBOX.centerX + Math.cos(start) * radius;
  const startY = IMMERSION_VIEWBOX.centerY + Math.sin(start) * radius;
  const endX = IMMERSION_VIEWBOX.centerX + Math.cos(end) * radius;
  const endY = IMMERSION_VIEWBOX.centerY + Math.sin(end) * radius;
  const largeArc = Math.abs(endDegrees - startDegrees) > 180 ? 1 : 0;
  return `M ${startX.toFixed(2)} ${startY.toFixed(2)} A ${radius.toFixed(2)} ${radius.toFixed(2)} 0 ${largeArc} 1 ${endX.toFixed(2)} ${endY.toFixed(2)}`;
}

function nearbyPossibilityLabel(
  currentNotes: number[],
  targetPitchClasses: number[],
  doMidi: number,
  scale: PianoScale,
  showConventions: boolean,
) {
  const currentPitchClasses = [...new Set(currentNotes.map(pitchClassFromMidi))];
  const kept = currentPitchClasses.filter((pitchClass) => targetPitchClasses.includes(pitchClass));
  const leave = currentPitchClasses.filter((pitchClass) => !targetPitchClasses.includes(pitchClass));
  const enter = targetPitchClasses.filter((pitchClass) => !currentPitchClasses.includes(pitchClass));
  const label = (pitchClass: number) => pitchClassLabel(pitchClass, doMidi, scale, showConventions);
  const keptText = kept.length ? `keep ${kept.map(label).join(" + ")}` : "retain no pitch classes";
  if (leave.length === 1 && enter.length === 1) {
    const up = (enter[0] - leave[0] + 12) % 12;
    const down = (leave[0] - enter[0] + 12) % 12;
    const move = up <= down ? `raise ${up}` : `lower ${down}`;
    return `${keptText} · ${move} key${Math.min(up, down) === 1 ? "" : "s"}`;
  }
  if (!leave.length && enter.length === 1) return `${keptText} · add ${label(enter[0])}`;
  return `${keptText} · change ${Math.max(leave.length, enter.length)} tone${Math.max(leave.length, enter.length) === 1 ? "" : "s"}`;
}

export const PianoImmersion = memo(function PianoImmersion({
  events,
  phraseEvents,
  measures,
  chordMeasures,
  activeNotes,
  doMidi,
  scale,
  frameMode,
  frameSnapshot,
  gravityCandidates,
  motifs,
  nearbyReady,
  chordWindowMs,
  soundModelId,
  showConventions,
  onSoundModelChange,
}: PianoImmersionProps) {
  const instanceId = useId().replace(/:/g, "");
  const selectedRootPitchClass = pitchClassFromMidi(doMidi);
  const selectedSectors = immersionScaleSectors(scale, selectedRootPitchClass);
  const routePitchClasses = new Set(selectedSectors.filter((sector) => sector.inRoute).map((sector) => sector.pitchClass));
  const seenPitchCounts = phraseEvents.reduce((counts, event) => {
    const pitchClass = pitchClassFromMidi(event.note);
    counts.set(pitchClass, (counts.get(pitchClass) ?? 0) + 1);
    return counts;
  }, new Map<number, number>());
  const trail = immersionTrail(phraseEvents, doMidi);
  const microscopeIds = new Set(events.map((event) => event.id));
  const firstMicroscopeIndex = trail.findIndex(({ event }) => microscopeIds.has(event.id));
  const memoryTrail = firstMicroscopeIndex >= 0 ? trail.slice(0, firstMicroscopeIndex + 1) : trail;
  const latestSeven = events.map((event) => ({ event, point: immersionPitchPoint(event.note, doMidi) }));
  const activeNumbers = activeNotes.map((active) => active.note);
  const latestChord = chordMeasures.at(-1) ?? null;
  const latestMeasure = measures.at(-1) ?? null;
  const latestEvent = events.at(-1) ?? null;
  const fieldNotes = activeNumbers.length
    ? activeNumbers
    : latestEvent?.fieldNotes ?? [];
  const fieldProvenance = activeNumbers.length ? "live sounding field" : latestEvent ? "latest attack-time snapshot" : "empty field";
  const intervalField = immersionIntervalField(fieldNotes, doMidi);
  const tendency = tonalTendency(fieldNotes, doMidi, scale);
  const fieldPoint = fieldCenter(fieldNotes, doMidi);
  const fieldCloud = immersionCloudBounds(fieldNotes, doMidi);
  const doDirection = immersionDirectionPoint(pitchClassFromMidi(doMidi), 326);
  const homeAtField = immersionDirectionPoint(pitchClassFromMidi(doMidi), fieldPoint.radius);
  const visibleClouds = chordMeasures.slice(-4).map((measure, index) => ({
    measure,
    interpretedHull: immersionCloudHull(measure.interpretedNotes, doMidi, 26),
    audibleHull: immersionSameNoteField(measure.interpretedNotes, measure.audibleNotes)
      ? null
      : immersionCloudHull(measure.audibleNotes, doMidi, 37),
    gradientId: `${instanceId}-chord-${index}`,
  }));
  const previousChord = chordMeasures.at(-2) ?? null;
  const voiceProfile = previousChord && latestChord
    ? voiceLeadingProfile(previousChord.interpretedNotes, latestChord.interpretedNotes)
    : null;
  const currentModel = pianoSoundModel(soundModelId);
  const matchingChord = latestChord
    && latestEvent
    && latestChord.gesture.attacks.some((attack) => attack.id === latestEvent.id)
    && immersionSameNoteField(latestChord.audibleNotes, fieldNotes)
    ? latestChord
    : null;
  const matchingMeasure = latestMeasure && immersionSameNoteField(latestMeasure.event.fieldNotes, fieldNotes) ? latestMeasure : null;
  const currentCrunch = matchingChord?.crunch ?? matchingMeasure?.crunch ?? null;
  const phraseNewness = immersionPhraseNewness(phraseEvents);
  const fifthsTide = immersionFifthsTide(phraseEvents, events, chordWindowMs);
  const fifthsDrift = fifthsTide.flatMap((scope) => scope.centerPoint ? [scope.centerPoint] : []);
  const attackKnowledge = immersionAttackKnowledge(phraseEvents, doMidi, scale);
  const contour = immersionAttackContour(phraseEvents, chordWindowMs);
  const contourGroups = [...new Set(contour.points.map((point) => point.groupIndex))].map((groupIndex) => {
    const points = contour.points.filter((point) => point.groupIndex === groupIndex);
    return {
      groupIndex,
      points,
      centerX: points.reduce((sum, point) => sum + point.x, 0) / points.length,
      centerY: points.reduce((sum, point) => sum + point.y, 0) / points.length,
      radiusX: Math.max(12, (Math.max(...points.map((point) => point.x)) - Math.min(...points.map((point) => point.x))) / 2 + 10),
      radiusY: Math.max(12, (Math.max(...points.map((point) => point.y)) - Math.min(...points.map((point) => point.y))) / 2 + 10),
    };
  });
  const exactChordRoots = visibleClouds
    .filter(({ measure }) => measure.candidate?.exact)
    .map(({ measure }, index, selected) => ({
      measure,
      point: immersionDirectionPoint(measure.candidate!.rootPitchClass, 242 + index * (selected.length > 1 ? 4 : 0)),
    }));
  const currentChordShape = matchingChord ? immersionChordShape(matchingChord.interpretedNotes) : null;
  const candidateIdentity = (candidate: ScaleCandidate | null | undefined) => candidate
    ? `${candidate.rootPitchClass}:${candidate.scale.id}`
    : "";
  const leadingCandidate = frameSnapshot?.leading ?? null;
  const runnerCandidate = frameSnapshot?.runnersUp.find((candidate) => candidateIdentity(candidate) !== candidateIdentity(leadingCandidate)) ?? null;
  const scaleEvidenceState = frameMode === "locked"
    ? "selected"
    : (frameSnapshot?.distinctPitchClasses ?? 0) < 4
      ? "gathering"
      : frameSnapshot?.evidenceLabel === "several compatible frames" || (leadingCandidate && runnerCandidate && leadingCandidate.fit - runnerCandidate.fit < 0.08)
        ? "ambiguous"
        : "leading";
  const leadingGhostSectors = scaleEvidenceState !== "gathering" && scaleEvidenceState !== "selected" && leadingCandidate
    ? immersionScaleSectors(leadingCandidate.scale, leadingCandidate.rootPitchClass)
    : [];
  const runnerGhostSectors = scaleEvidenceState === "ambiguous" && runnerCandidate
    ? immersionScaleSectors(runnerCandidate.scale, runnerCandidate.rootPitchClass)
    : [];
  const retainedPitchClasses = [...seenPitchCounts.keys()];
  const selectedInScaleCount = retainedPitchClasses.filter((pitchClass) => routePitchClasses.has(pitchClass)).length;
  const selectedCoveredCount = [...routePitchClasses].filter((pitchClass) => seenPitchCounts.has(pitchClass)).length;
  const routeEvidencePoint = scaleEvidenceState === "selected"
    ? immersionDirectionPoint(selectedRootPitchClass, 333)
    : leadingCandidate
    ? immersionDirectionPoint(leadingCandidate.rootPitchClass, 333)
    : doDirection;
  const routeEvidenceDetail = scaleEvidenceState === "selected"
    ? `${selectedInScaleCount}/${retainedPitchClasses.length || 0} played classes fit · ${selectedCoveredCount}/${routePitchClasses.size} route positions visited`
    : leadingCandidate
    ? `${leadingCandidate.inScaleCount}/${leadingCandidate.uniqueNoteCount} played classes fit · ${leadingCandidate.routeCoveredCount}/${scaleSemitones(leadingCandidate.scale).length} route positions visited`
    : `${frameSnapshot?.distinctPitchClasses ?? 0} distinct pitch classes retained`;
  const routeEvidenceCopy = scaleEvidenceState === "selected"
    ? `Selected frame · Do + ${scale.name}${showConventions ? ` · conventional translation: ${CONVENTIONAL_PITCH_CLASSES[selectedRootPitchClass]} ${scale.conventionalName}` : ""}. This is a working coordinate, not a detected key.`
    : scaleEvidenceState === "gathering"
      ? `Gathering route evidence · ${frameSnapshot?.distinctPitchClasses ?? 0} distinct pitch classes. The current route remains a starting reference.`
      : scaleEvidenceState === "ambiguous" && leadingCandidate && runnerCandidate
        ? `Several catalog routes fit · ${shortScaleLabel(leadingCandidate, doMidi, scale, showConventions)} / ${shortScaleLabel(runnerCandidate, doMidi, scale, showConventions)}. ${routeEvidenceDetail}.`
        : leadingCandidate
          ? `Leading catalog fit · ${shortScaleLabel(leadingCandidate, doMidi, scale, showConventions)}. ${routeEvidenceDetail}.`
          : "No catalog route evidence yet.";
  const contextCandidate = (frameSnapshot?.distinctPitchClasses ?? 0) >= 4 ? gravityCandidates[0] ?? null : null;
  const contextCues = strongestContextCues(contextCandidate);
  const contextPoint = contextCandidate ? immersionDirectionPoint(contextCandidate.rootPitchClass, 224) : null;
  const contextName = contextCandidate
    ? pitchClassLabel(contextCandidate.rootPitchClass, doMidi, scale, showConventions)
    : "—";
  const routeCenterForAlignment = scaleEvidenceState === "selected" ? selectedRootPitchClass : leadingCandidate?.rootPitchClass;
  const contextCopy = contextCandidate
    ? `${routeCenterForAlignment === contextCandidate.rootPitchClass ? `Route membership and contextual-center cues currently align on ${contextName}` : `Contextual-center model leans toward ${contextName}`}${contextCues.length ? ` through ${contextCues.join(" + ")}` : ""}. This is a heuristic clue, not a detected key.`
    : "Contextual-center cues wait for at least four distinct pitch classes.";
  const newestMotif = motifs[0] ?? null;
  const trailPointById = new Map(trail.map((entry) => [entry.event.id, entry.point]));
  const motifSource = newestMotif ? centroid(newestMotif.sourceEventIds.flatMap((id) => {
    const point = trailPointById.get(id);
    return point ? [point] : [];
  })) : null;
  const motifTarget = newestMotif ? centroid(newestMotif.targetEventIds.flatMap((id) => {
    const point = trailPointById.get(id);
    return point ? [point] : [];
  })) : null;
  const motifBridge = newestMotif && motifSource && motifTarget ? {
    source: motifSource,
    target: motifTarget,
    anchor: { x: (motifSource.x + motifTarget.x) / 2, y: (motifSource.y + motifTarget.y) / 2 },
  } : null;
  const motifCopy = newestMotif?.kind === "exact-repeat"
    ? `A ${newestMotif.length}-attack relationship window returned with the same pitch and timing shape.`
    : newestMotif?.kind === "transposed-repeat"
      ? `A ${newestMotif.length}-attack relationship window returned ${keyMove(newestMotif.transpositionSemitones)} from its first position.`
      : newestMotif?.kind === "rhythmic-variation"
        ? `A ${newestMotif.length}-attack pitch shape returned with changed timing shares.`
        : newestMotif?.kind === "altered-ending"
          ? `A ${newestMotif.length}-attack opening returned; its ending shifted ${keyMove(newestMotif.endingDeltaSemitones)}.`
          : null;
  const nearbyOptions = matchingChord && nearbyReady
    ? nearbyScaleChords(matchingChord.interpretedNotes, doMidi, scale, 2)
    : [];
  const latestLabel = latestEvent ? noteLabel(latestEvent.note, doMidi, scale, showConventions) : "—";
  const sampleInterval = intervalField.links[0] ?? null;
  const newestPoint = latestEvent ? immersionPitchPoint(latestEvent.note, doMidi) : null;
  const latestRole = attackKnowledge
    ? `${showConventions ? `${conventionalPitchName(attackKnowledge.event.note)} · ` : ""}${attackKnowledge.context.syllable} · ${attackKnowledge.context.inScale ? `route degree ${attackKnowledge.context.degreeIndex + 1}` : "outside selected route"}`
    : "";
  const latestMove = attackKnowledge?.moveSteps == null
    ? "first attack in retained memory"
    : `attack-to-attack ${keyMove(attackKnowledge.moveSteps)} · near ${attackKnowledge.moveLandmark?.landmarkLabel}${attackKnowledge.onsetGapMs != null ? ` · ${Math.round(attackKnowledge.onsetGapMs)} ms` : ""}`;
  const latestMoveShort = attackKnowledge?.moveSteps == null
    ? "first retained attack"
    : `${attackKnowledge.moveSteps === 0 ? "same-key attack" : `attack move ${keyMove(attackKnowledge.moveSteps)}`} · near ${attackKnowledge.moveLandmark?.landmarkLabel}${attackKnowledge.onsetGapMs != null ? ` · ${Math.round(attackKnowledge.onsetGapMs)} ms` : ""}`;
  const latestRecurrence = attackKnowledge
    ? `${attackKnowledge.pitchClassOccurrenceCount === 1 ? "first pitch-class visit" : `pitch-class return #${attackKnowledge.pitchClassOccurrenceCount}`}${attackKnowledge.attacksSincePreviousPitchClass != null ? ` · ${attackKnowledge.attacksSincePreviousPitchClass} intervening attacks` : ""} · ${formatHz(attackKnowledge.context.frequencyHz)} ref`
    : "";
  const latestRecurrenceShort = attackKnowledge
    ? `${attackKnowledge.pitchClassOccurrenceCount === 1 ? "first pitch-class visit" : `return #${attackKnowledge.pitchClassOccurrenceCount}`}${attackKnowledge.attacksSincePreviousPitchClass != null ? ` · ${attackKnowledge.attacksSincePreviousPitchClass} between` : ""} · ${formatHz(attackKnowledge.context.frequencyHz)} ref`
    : "";
  const chordIdentity = matchingChord?.candidate?.exact
    ? `${pitchClassLabel(matchingChord.candidate.rootPitchClass, doMidi, scale, showConventions)} ${matchingChord.candidate.template.name.toLowerCase()} · exact catalog shape`
    : matchingChord
      ? `${matchingChord.interpretedNotes.length}-position interpretation · no exact catalog label`
      : null;
  const chordStructure = currentChordShape
    ? `bass-fold ${currentChordShape.bassRelativePositions.join("–")} · cyclic gaps ${currentChordShape.cyclicGaps.join("–")}`
    : null;
  const chordCopy = matchingChord
    ? `${matchingChord.gesture.attacks.length} attacks · ${matchingChord.gesture.kind} · ${Math.round(matchingChord.gesture.spreadMs)} ms. ${chordIdentity}${chordStructure ? `; ${chordStructure}` : ""}.`
    : "No current multi-note onset group matches the displayed field.";
  const nearbyCopy = nearbyOptions.length
    ? nearbyOptions.map((option) => `${option.syllable}: ${nearbyPossibilityLabel(matchingChord!.interpretedNotes, option.pitchClasses, doMidi, scale, showConventions)}`).join(" · ")
    : null;
  const samplingReading = intervalField.omittedLinkCount
    ? ` ${intervalField.links.length} of ${intervalField.totalPairCount} possible interval fibers are drawn${intervalField.omittedNoteCount ? ` from ${intervalField.notes.length} positions sampled across the register` : ""}.`
    : "";
  const currentReading = latestEvent
    ? `${latestLabel} arrived at MIDI key ${latestEvent.note}. ${activeNumbers.length ? `${activeNumbers.length} ${activeNumbers.length === 1 ? "position is" : "positions are"} held or pedal-sustained in the live sounding field.` : `No keys remain held; the fibers preserve the latest attack-time snapshot${fieldNotes.length ? ` of ${fieldNotes.length} positions` : ""}.`}`
    : "Play a MIDI key, or open the silent hand horizon below. The first attack will light the sky.";
  const metricReading = latestEvent
    ? `For the ${fieldProvenance}, selected-frame pull is ${evidenceWord(tendency.homePull)}; home evidence is ${evidenceWord(tendency.homeEvidence)}; the latest first/return bloom is ${evidenceWord(phraseNewness)}${currentCrunch == null ? "; modeled crunch needs a matching multi-note field" : `; modeled crunch is ${evidenceWord(currentCrunch)} under ${currentModel.shortLabel.toLowerCase()}`}.${samplingReading}`
    : "Hue, size, trails, filaments, and mist remain separate visual channels; none is a goodness or emotion score.";
  const visualSummary = latestEvent
    ? `Resonance Sky contains ${Math.min(28, phraseEvents.length)} recent attack marks and ${events.length} bright microscope attacks. Latest: ${latestRole}; ${latestMove}; ${latestRecurrence}. The ${fieldProvenance} contains ${fieldNotes.length} positions and ${intervalField.totalPairCount} possible pairwise intervals; ${intervalField.links.length} bounded filaments are shown${sampleInterval ? `, including ${sampleInterval.relationship} near ${sampleInterval.landmarkLabel}` : ""}. ${chordCopy} ${routeEvidenceCopy} ${contextCopy} ${motifCopy ?? "No relationship-window return is currently drawn."} ${metricReading} Musical quality and listener feeling are not inferred.`
    : "Empty Resonance Sky. Direction follows the circle of fifths, depth follows equal-key register, and the outer aurora shows the selected movable-Do route.";
  const annotationInputs = [
    ...(newestPoint ? [{
      id: "latest-note",
      anchorX: newestPoint.x,
      anchorY: newestPoint.y,
      lines: [latestRole, latestMoveShort, latestRecurrenceShort],
      priority: 100,
    }] : []),
    ...(matchingChord && visibleClouds.at(-1)?.interpretedHull ? [{
      id: "current-chord",
      anchorX: visibleClouds.at(-1)!.interpretedHull!.centerX,
      anchorY: visibleClouds.at(-1)!.interpretedHull!.centerY,
      lines: [`${matchingChord.gesture.attacks.length} attacks · ${matchingChord.gesture.kind} · ${Math.round(matchingChord.gesture.spreadMs)} ms`, chordIdentity ?? "unclassified onset field", chordStructure ?? "shape still forming"],
      priority: 92,
    }] : []),
    ...(motifBridge && motifCopy ? [{
      id: "motif",
      anchorX: motifBridge.anchor.x,
      anchorY: motifBridge.anchor.y,
      lines: ["relationship-window echo", newestMotif?.kind === "transposed-repeat" ? `${newestMotif.length} attacks · same shape · ${keyMove(newestMotif.transpositionSemitones)}` : newestMotif?.kind === "rhythmic-variation" ? `${newestMotif.length} attacks · pitch shape kept · timing changed` : newestMotif?.kind === "altered-ending" ? `${newestMotif.length} attacks · opening kept · ending changed` : `${newestMotif?.length ?? 0} attacks · pitch + timing shape returned`],
      priority: 80,
    }] : []),
    ...((scaleEvidenceState !== "gathering" || phraseEvents.length >= 4) ? [{
      id: "route-evidence",
      anchorX: routeEvidencePoint.x,
      anchorY: routeEvidencePoint.y,
      lines: [scaleEvidenceState === "ambiguous" ? "several catalog routes fit" : scaleEvidenceState === "selected" ? "selected working frame" : "leading catalog fit", scaleEvidenceState === "selected" ? `${selectedInScaleCount}/${retainedPitchClasses.length || 0} fit · ${selectedCoveredCount}/${routePitchClasses.size} route positions` : leadingCandidate ? `${leadingCandidate.inScaleCount}/${leadingCandidate.uniqueNoteCount} fit · ${leadingCandidate.routeCoveredCount}/${scaleSemitones(leadingCandidate.scale).length} route positions` : `${frameSnapshot?.distinctPitchClasses ?? 0} distinct positions`],
      priority: 76,
    }] : []),
    ...(contextPoint ? [{
      id: "context-center",
      anchorX: contextPoint.x,
      anchorY: contextPoint.y,
      lines: ["contextual-center model", `${contextName} · ${contextCues.join(" + ") || "mixed cues"}`],
      priority: 70,
    }] : []),
    ...(sampleInterval ? [{
      id: "field-interval",
      anchorX: (sampleInterval.lowerPoint.x + sampleInterval.upperPoint.x) / 2,
      anchorY: (sampleInterval.lowerPoint.y + sampleInterval.upperPoint.y) / 2,
      lines: [`${sampleInterval.semitones} equal keys · ${sampleInterval.relationship}`, `near ${sampleInterval.landmarkLabel} · ${Math.round(Math.abs(sampleInterval.errorCents))}¢ offset`],
      priority: 62,
    }] : []),
  ];
  const reservedAnnotationBounds = [
    { left: doDirection.x - 78, right: doDirection.x + 78, top: doDirection.y - 28, bottom: doDirection.y + 31 },
    { left: 704, right: 868, top: 56, bottom: 129 },
    ...(contour.points.length ? [{ left: 334, right: 690, top: 488, bottom: 517 }] : []),
    ...selectedSectors.filter((sector) => sector.inRoute && sector.degreeIndex !== 0).map((sector) => {
      const labelPoint = immersionDirectionPoint(sector.pitchClass, 344);
      return { left: labelPoint.x - 24, right: labelPoint.x + 24, top: labelPoint.y - 12, bottom: labelPoint.y + 12 };
    }),
  ];
  const annotations = planImmersionAnnotations(annotationInputs, 5, reservedAnnotationBounds);
  const registerBeacons = [36, 60, 84].map((note, index) => ({
    note,
    radius: immersionPitchPoint(note, doMidi).radius,
    path: orbitArcPath(immersionPitchPoint(note, doMidi).radius, 136 + index * 3, 218 - index * 4),
    labelPoint: {
      x: IMMERSION_VIEWBOX.centerX + Math.cos((218 - index * 4) * Math.PI / 180) * immersionPitchPoint(note, doMidi).radius,
      y: IMMERSION_VIEWBOX.centerY + Math.sin((218 - index * 4) * Math.PI / 180) * immersionPitchPoint(note, doMidi).radius,
    },
  }));
  const [announcedSummary, setAnnouncedSummary] = useState(visualSummary);

  useEffect(() => {
    const timer = window.setTimeout(() => setAnnouncedSummary(visualSummary), 280);
    return () => window.clearTimeout(timer);
  }, [visualSummary]);

  return (
    <section className="piano-immersion" aria-labelledby="piano-immersion-title">
      <div className="piano-immersion-intro">
        <div>
          <span>Immersion · analysis only</span>
          <h3 id="piano-immersion-title">Resonance Sky</h3>
          <p>Direction follows fifths. Depth follows register. Hue follows pitch role around the current Do. Three outer tides hold the latest onset window, last seven attacks, and retained phrase at once; chord membranes and a contour horizon keep simultaneity distinct from sequence.</p>
        </div>
        <label className="piano-immersion-model" htmlFor="immersion-sound-model">
          <span>Assumed spectrum</span>
          <select id="immersion-sound-model" value={soundModelId} onChange={(event) => onSoundModelChange(event.target.value as PianoSoundModelId)}>
            {PIANO_SOUND_MODELS.map((model) => <option key={model.id} value={model.id}>{model.shortLabel}</option>)}
          </select>
          <small>Only coral modeled crunch responds; no keyboard audio is read.</small>
        </label>
      </div>

      <p className="sr-only" role="status" aria-live="polite" aria-atomic="true">{announcedSummary}</p>

      <div className="piano-immersion-stage">
        <svg viewBox={`0 0 ${IMMERSION_VIEWBOX.width} ${IMMERSION_VIEWBOX.height}`} preserveAspectRatio="xMidYMid slice" role="img" aria-labelledby="piano-immersion-svg-title piano-immersion-svg-description">
          <title id="piano-immersion-svg-title">Resonance Sky for the current MIDI phrase</title>
          <desc id="piano-immersion-svg-description">{visualSummary}</desc>
          <defs>
            <filter id={`${instanceId}-soft-glow`} x="-80%" y="-80%" width="260%" height="260%">
              <feGaussianBlur stdDeviation="5" result="blur" />
              <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
            </filter>
            <radialGradient id={`${instanceId}-home-well`}>
              <stop offset="0" stopColor="#ffd36a" stopOpacity="0.44" />
              <stop offset="0.42" stopColor="#ffd36a" stopOpacity="0.12" />
              <stop offset="1" stopColor="#ffd36a" stopOpacity="0" />
            </radialGradient>
            {visibleClouds.map(({ measure, gradientId }) => {
              const notes = [...new Set(measure.interpretedNotes)];
              return <linearGradient key={gradientId} id={gradientId} x1="0" y1="0" x2="1" y2="1">
                {notes.map((note, index) => {
                  const point = immersionPitchPoint(note, doMidi);
                  return <stop key={note} offset={`${notes.length <= 1 ? 50 : index / (notes.length - 1) * 100}%`} stopColor={immersionRoleColor(point, routePitchClasses.has(point.pitchClass))} stopOpacity={measure === matchingChord ? 0.22 : 0.1} />;
                })}
              </linearGradient>;
            })}
            <marker id={`${instanceId}-pull-arrow`} viewBox="0 0 10 10" refX="8" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse">
              <path d="M 0 0 L 10 5 L 0 10 z" />
            </marker>
          </defs>

          <g className="immersion-dust" aria-hidden="true">
            {COSMIC_DUST.map((dust, index) => <circle key={index} cx={dust.x} cy={dust.y} r={dust.radius} opacity={dust.opacity} />)}
          </g>

          <g className="immersion-register-beacons" aria-label="Three A4 equals 440 equal-key register references">
            {registerBeacons.map((beacon) => <g key={beacon.note}>
              <path d={beacon.path} />
              <circle cx={beacon.labelPoint.x} cy={beacon.labelPoint.y} r="2.5" />
              <text x={beacon.labelPoint.x - 8} y={beacon.labelPoint.y + 4} textAnchor="end">{showConventions ? `${conventionalPitchName(beacon.note)} · ` : ""}{formatHz(frequencyFromMidi(beacon.note))}</text>
            </g>)}
          </g>

          <g className="immersion-fifths-tide" aria-label="Circle-of-fifths attack density in the latest onset window, latest seven attacks, and retained phrase scopes">
            {fifthsTide.map((scope, scopeIndex) => <g key={scope.id} className={`is-${scope.id}`}>
              {scope.eventCount ? <path className="immersion-tide-envelope" d={scope.densityPath}><title>{scope.label}: {scope.eventCount} attacks across {scope.uniquePitchClassCount} pitch classes</title></path> : null}
              {scope.countsByFifthStep.map((count, fifthStep) => {
                if (!count) return null;
                const sector = selectedSectors[fifthStep];
                const strength = count / Math.max(1, scope.maximumCount);
                return <path key={fifthStep} className="immersion-tide-visit" d={immersionArcPath(sector.pitchClass, scope.radius, 6 + strength * 14)} style={{ "--immersion-tide": strength } as CSSProperties}><title>{scope.label}: {count} attack{count === 1 ? "" : "s"} at {pitchClassLabel(sector.pitchClass, doMidi, scale, showConventions)}</title></path>;
              })}
              <text x="858" y={74 + scopeIndex * 17}>{scope.label}</text>
            </g>)}
            {fifthsDrift.length > 1 ? <path className="immersion-fifths-drift" d={immersionCurve(fifthsDrift)}><title>Attack-density center drift across the three displayed scopes; diffuse scopes have no center</title></path> : null}
          </g>

          <g className="immersion-route-hypotheses" aria-label={routeEvidenceCopy}>
            {leadingGhostSectors.filter((sector) => sector.inRoute).map((sector) => <path key={`leading-${sector.pitchClass}`} className="is-leading" d={immersionArcPath(sector.pitchClass, 335, 18)} />)}
            {runnerGhostSectors.filter((sector) => sector.inRoute).map((sector) => <path key={`runner-${sector.pitchClass}`} className="is-runner" d={immersionArcPath(sector.pitchClass, 342, 13)} />)}
          </g>

          <g className="immersion-scale-aurora" aria-label={`${scale.name} selected route across all twelve fifths positions`}>
            {selectedSectors.map((sector) => {
              const point = immersionPitchPoint(nearestMidiForPitchClass(sector.pitchClass, doMidi), doMidi);
              const seed = immersionDirectionPoint(sector.pitchClass, 315);
              const labelPoint = immersionDirectionPoint(sector.pitchClass, 344);
              const seenCount = seenPitchCounts.get(sector.pitchClass) ?? 0;
              const label = sector.inRoute
                ? showConventions ? CONVENTIONAL_PITCH_CLASSES[sector.pitchClass] : scale.solfege[sector.degreeIndex]
                : "";
              return <g key={sector.pitchClass} className={`${sector.inRoute ? "is-route" : "is-outside-route"} ${seenCount ? "is-seen" : ""} ${sector.degreeIndex === 0 ? "is-home" : ""}`} style={{ "--immersion-pitch": immersionRoleColor(point, sector.inRoute) } as CSSProperties}>
                <path d={immersionArcPath(sector.pitchClass, 326, sector.inRoute ? 22 : 13)}><title>{label || pitchClassLabel(sector.pitchClass, doMidi, scale, showConventions)} · {sector.inRoute ? `selected route degree ${sector.degreeIndex + 1}` : "outside the selected route"} · {seenCount || "no"} retained attack{seenCount === 1 ? "" : "s"}</title></path>
                {seenCount ? <circle className="immersion-route-seed" cx={seed.x} cy={seed.y} r={Math.min(7, 2.5 + Math.sqrt(seenCount) * 1.4)} /> : null}
                {label ? <text x={labelPoint.x} y={labelPoint.y + 4}>{label}</text> : null}
              </g>;
            })}
          </g>

          <g className="immersion-do-meridian">
            <line x1="600" y1="350" x2={doDirection.x} y2={doDirection.y} />
            {fieldNotes.length ? <circle cx={homeAtField.x} cy={homeAtField.y} r={38 + tendency.homeEvidence * 40} fill={`url(#${instanceId}-home-well)`} /> : null}
            <circle cx={doDirection.x} cy={doDirection.y} r="9" />
            <text x={doDirection.x} y={doDirection.y + (doDirection.y < 350 ? 27 : -17)}>Do · {frameMode === "locked" ? "selected frame" : "working frame"}</text>
          </g>

          {contextCandidate && contextPoint ? <g className="immersion-context-rosette" aria-label={contextCopy}>
            <path d={fourPointStarPath(contextPoint.x, contextPoint.y, 13, 5)} />
            {Object.entries(contextCandidate.components).filter(([cue]) => cue !== "routeFit").map(([cue, value], index, entries) => {
              const angle = index / entries.length * Math.PI * 2 - Math.PI / 2;
              return <circle key={cue} cx={contextPoint.x + Math.cos(angle) * 20} cy={contextPoint.y + Math.sin(angle) * 20} r={2.4 + value * 4} style={{ "--immersion-cue": value } as CSSProperties}><title>{cue}: one input to the contextual-center model</title></circle>;
            })}
          </g> : null}

          <g className="immersion-chord-root-wake" aria-label={`${exactChordRoots.length} recent exact catalog chord roots folded onto fifths space`}>
            {exactChordRoots.length > 1 ? <path className="immersion-root-curve" d={immersionCurve(exactChordRoots.map(({ point }) => point))} /> : null}
            {exactChordRoots.map(({ measure, point }, index) => <path key={measure.gesture.id} className={index === exactChordRoots.length - 1 ? "is-latest" : ""} d={fourPointStarPath(point.x, point.y, 9, 4)}><title>{pitchClassLabel(measure.candidate!.rootPitchClass, doMidi, scale, showConventions)} exact catalog root; {measure.rootTravelSteps == null ? "no preceding exact root comparison" : `${measure.rootTravelSteps} fifth step${measure.rootTravelSteps === 1 ? "" : "s"} from the prior exact root; shortest circular distance, direction not retained`}</title></path>)}
          </g>

          <g className="immersion-chord-clouds" aria-label={`${visibleClouds.length} recent timing-group membranes using the ${chordWindowMs} millisecond chord window`}>
            {visibleClouds.map(({ measure, interpretedHull, audibleHull, gradientId }) => interpretedHull ? <g key={measure.gesture.id} className={`${measure.gesture.kind === "rolled" ? "is-rolled" : "is-together"} ${measure.candidate?.exact ? "is-exact" : "is-incomplete"} ${measure === matchingChord ? "is-current" : "is-history"}`}>
              {audibleHull ? <path className="immersion-audible-hull" d={audibleHull.path}><title>Outer edge: everything sounding at the timing-group close, including tones excluded from the chord interpretation</title></path> : null}
              <path className="immersion-interpreted-hull" d={interpretedHull.path} fill={`url(#${gradientId})`} filter={measure === matchingChord ? `url(#${instanceId}-soft-glow)` : undefined}><title>{measure.gesture.kind} group: {measure.gesture.attacks.length} attacks across {Math.round(measure.gesture.spreadMs)} milliseconds; inner membrane follows interpreted membership; {measure.candidate?.exact ? `exact ${measure.candidate.template.name} catalog shape` : "no exact catalog shape"}</title></path>
              <path className="immersion-timing-hull" d={interpretedHull.path}><title>{measure.gesture.kind === "rolled" ? "Dotted overtrace: attacks were rolled across the grouping window" : "No dotted overtrace: attacks arrived together"}</title></path>
            </g> : null)}
          </g>

          {fieldCloud && currentCrunch != null ? <ellipse className="immersion-crunch-haze" cx={fieldCloud.centerX} cy={fieldCloud.centerY} rx={fieldCloud.radiusX + 10 + currentCrunch * 30} ry={fieldCloud.radiusY + 8 + currentCrunch * 24} style={{ "--immersion-crunch": currentCrunch } as CSSProperties}><title>Coral haze: modeled crunch for the {fieldProvenance} under {currentModel.shortLabel}</title></ellipse> : null}

          {nearbyOptions.length ? <g className="immersion-nearby-fields" aria-label="Nearby in-route field possibilities, not predictions">
            {nearbyOptions.map((option, index) => {
              const center = immersionDirectionPoint(option.rootPitchClass, 172 + index * 24);
              const copy = nearbyPossibilityLabel(matchingChord!.interpretedNotes, option.pitchClasses, doMidi, scale, showConventions);
              return <g key={`${option.rootPitchClass}-${index}`}>
                <circle className="immersion-nearby-orbit" cx={center.x} cy={center.y} r="17" />
                {option.pitchClasses.map((pitchClass) => {
                  const offset = immersionDirectionPoint(pitchClass, 10.5);
                  return <circle key={pitchClass} className={option.commonPitchClasses.includes(pitchClass) ? "is-retained" : "is-entering"} cx={center.x + offset.x - 600} cy={center.y + offset.y - 350} r="3.2" />;
                })}
                <text x={center.x + 21} y={center.y + 4}>{option.syllable}</text>
                <title>{option.syllable} possibility, not prediction: {copy}</title>
              </g>;
            })}
          </g> : null}

          {motifBridge && motifCopy ? <g className="immersion-motif-bridge" aria-label={motifCopy}>
            <circle cx={motifBridge.source.x} cy={motifBridge.source.y} r="10" />
            <path d={filamentPath(motifBridge.source, motifBridge.target)} />
            <circle cx={motifBridge.target.x} cy={motifBridge.target.y} r="13" />
            <title>{motifCopy} This is a detector relationship-window match, not a claim about intended melody or form.</title>
          </g> : null}

          {voiceProfile ? <g className="immersion-voice-wake" aria-label={`${voiceProfile.strands.length} nearest-key voice paths from the previous grouped field`}>
            {voiceProfile.strands.map((strand, index) => {
              const anchorNote = strand.from ?? strand.to;
              if (anchorNote == null) return null;
              const anchor = immersionPitchPoint(anchorNote, doMidi);
              const from = strand.from == null ? { x: 600 + (anchor.x - 600) * 0.86, y: 350 + (anchor.y - 350) * 0.86 } : immersionPitchPoint(strand.from, doMidi);
              const to = strand.to == null ? { x: 600 + (anchor.x - 600) * 1.08, y: 350 + (anchor.y - 350) * 1.08 } : immersionPitchPoint(strand.to, doMidi);
              return <path key={`${strand.from}-${strand.to}-${index}`} d={filamentPath(from, to)} className={`is-${strand.motion}`}><title>{strand.motion === "held" ? "Retained physical key" : strand.motion === "added" ? "Position entered the interpretation" : strand.motion === "released" ? "Position left the interpretation" : `Nearest-key voice moved ${Math.abs(strand.semitones)} steps ${strand.motion}`}</title></path>;
            })}
          </g> : null}

          {memoryTrail.length > 1 ? <path className="immersion-memory-wake" d={immersionCurve(memoryTrail.map(({ point }) => point))} /> : null}

          {contour.points.length ? <g className="immersion-attack-contour" aria-label={`Attack contour for ${contour.points.length} recent attacks; ${contour.monophonic ? "each onset group contains one attack" : "close-time multi-attack groups are preserved"}`}>
            <text x="348" y="502">attack contour · {contour.monophonic ? "single-attack line" : "onset bouquets preserved"}</text>
            <path className="immersion-contour-horizon" d="M 350 578 Q 600 560 850 578" />
            {contourGroups.filter((group) => group.points.length > 1).map((group) => <ellipse key={group.groupIndex} className="immersion-contour-bouquet" cx={group.centerX} cy={group.centerY} rx={group.radiusX} ry={group.radiusY}><title>{group.points.length} attacks share one timing group</title></ellipse>)}
            {contour.segments.map((segment, index) => <g key={`${segment.from.event.id}-${segment.to.event.id}`} className={segment.sameGroup ? "is-same-group" : segment.connectAsLine ? "is-line" : "is-group-bridge"}>
              <path d={`M ${segment.from.x.toFixed(2)} ${segment.from.y.toFixed(2)} L ${segment.to.x.toFixed(2)} ${segment.to.y.toFixed(2)}`} />
              {!segment.sameGroup && index >= contour.segments.length - 3 ? <text x={(segment.from.x + segment.to.x) / 2} y={(segment.from.y + segment.to.y) / 2 - 8}>{segment.steps === 0 ? "same key" : signedStepCount(segment.steps)}</text> : null}
              <title>{keyMove(segment.steps)} over {Math.round(segment.gapMs)} milliseconds; {segment.sameGroup ? "inside one timing group" : "between timing groups"}</title>
            </g>)}
            {contour.points.map((point) => <circle key={point.event.id} cx={point.x} cy={point.y} r={point.event.id === latestEvent?.id ? 4.6 : 2.8} />)}
          </g> : null}

          <g className="immersion-attack-gaps" aria-label="Latest attack path; broken segments contain release-proven silence">
            {latestSeven.slice(1).map((current, index) => {
              const previous = latestSeven[index];
              const gapMs = Math.max(0, current.event.onsetMs - previous.event.onsetMs);
              const silence = immersionReleaseProvenSilence(phraseEvents, current.event);
              return <path key={`${previous.event.id}-${current.event.id}`} d={filamentPath(previous.point, current.point)} className={silence.proven ? "is-silence" : gapMs <= chordWindowMs ? "is-grouped" : "is-connected"} style={{ "--immersion-gap": Math.min(1, gapMs / 1600) } as CSSProperties}><title>{silence.durationMs != null ? `${Math.round(silence.durationMs)} milliseconds of release-proven silence before the next attack` : `${Math.round(gapMs)} milliseconds between attacks; no silence claim`}</title></path>;
            })}
          </g>

          <g className="immersion-interval-filaments" aria-label={`${intervalField.links.length} of ${intervalField.totalPairCount} pairwise interval filaments shown`}>
            {intervalField.links.map((link, index) => {
              const className = Math.abs(link.errorCents) <= 12 ? "is-close" : Math.abs(link.errorCents) <= 25 ? "is-near" : "is-offset";
              return <g key={`${link.lower}-${link.upper}`} className={`${className} ${index === 0 ? "is-primary" : "is-secondary"}`}>
                <path d={filamentPath(link.lowerPoint, link.upperPoint)}><title>{link.relationship}, {link.semitones} equal keys, near {link.landmarkLabel}, {Math.round(Math.abs(link.errorCents))} cents from that {link.referenceKind === "geometric-midpoint" ? "geometric octave midpoint" : "integer-ratio reference"}</title></path>
              </g>;
            })}
          </g>

          {latestEvent ? (() => {
            const point = immersionPitchPoint(latestEvent.note, doMidi);
            return <circle className="immersion-newness-bloom" cx={point.x} cy={point.y} r={22 + phraseNewness * 30} style={{ "--immersion-newness": phraseNewness } as CSSProperties} />;
          })() : null}

          {latestEvent && tendency.homePull >= 0.04 ? <path className="immersion-pull-current" d={filamentPath(fieldPoint, homeAtField)} markerEnd={`url(#${instanceId}-pull-arrow)`} style={{ "--immersion-pull": tendency.homePull } as CSSProperties}><title>Modeled selected-frame pull toward the current Do is {evidenceWord(tendency.homePull)}</title></path> : null}

          <g className="immersion-phrase-stars" aria-label={`${trail.length} recent attack stars; latest seven carry compact order marks`}>
            {trail.map(({ event, point, recency }) => {
              const recentIndex = events.findIndex((recent) => recent.id === event.id);
              const inScale = routePitchClasses.has(point.pitchClass);
              const color = immersionRoleColor(point, inScale);
              const size = 4.5 + Math.max(0, Math.min(127, event.velocity)) / 127 * 8.5;
              const isLatest = event.id === latestEvent?.id;
              const outwardX = point.radius > 0 ? (point.x - 600) / point.radius : 0;
              const outwardY = point.radius > 0 ? (point.y - 350) / point.radius : -1;
              const recurrenceCount = seenPitchCounts.get(point.pitchClass) ?? 1;
              return <g key={event.id} className={`piano-immersion-note ${recentIndex >= 0 ? "is-microscope" : "is-memory"} ${recentIndex >= 0 && recentIndex < Math.max(0, events.length - 5) ? "is-older-label" : ""} ${isLatest ? "is-latest" : ""}`} style={{ "--immersion-pitch": color, "--immersion-recency": 0.18 + recency * 0.82 } as CSSProperties}>
                <title>{noteLabel(event.note, doMidi, scale, showConventions)} · MIDI key {event.note} · {inScale ? "inside" : "outside"} selected route · pitch class appears {recurrenceCount} time{recurrenceCount === 1 ? "" : "s"} in retained memory</title>
                <circle className="cosmos-node-bloom" cx={point.x} cy={point.y} r={size + 10} filter={isLatest ? `url(#${instanceId}-soft-glow)` : undefined} />
                {isLatest
                  ? <path className={inScale ? "cosmos-node is-route" : "cosmos-node is-outside-route"} d={fourPointStarPath(point.x, point.y, size + 3, Math.max(3.5, size * 0.42))} />
                  : <circle className={inScale ? "cosmos-node is-route" : "cosmos-node is-outside-route"} cx={point.x} cy={point.y} r={size} />}
                <circle className="cosmos-node-specular" cx={point.x - size * 0.22} cy={point.y - size * 0.28} r={isLatest ? 2.2 : 1.3} />
                {isLatest && recurrenceCount > 1 ? <circle className="cosmos-node-echo" cx={point.x} cy={point.y} r={size + 17} /> : null}
                {!inScale ? <line className="cosmos-route-notch" x1={point.x + outwardX * (size + 3)} y1={point.y + outwardY * (size + 3)} x2={point.x + outwardX * (size + 12)} y2={point.y + outwardY * (size + 12)} /> : null}
                {recentIndex >= 0 && !isLatest && recurrenceCount === 1 ? <text x={point.x + 11} y={point.y - 10}>{recentIndex + 1}</text> : null}
              </g>;
            })}
          </g>

          <g className="immersion-active-stars" aria-label={`${activeNotes.length} held or pedal-sustained positions`}>
            {activeNotes.map((active) => {
              const point = immersionPitchPoint(active.note, doMidi);
              const inScale = routePitchClasses.has(point.pitchClass);
              const size = 8 + Math.max(0, Math.min(127, active.velocity)) / 127 * 9;
              return <g key={active.note} className={`${active.pressed ? "is-pressed" : ""} ${active.sustained ? "is-sustained" : ""}`} style={{ "--immersion-pitch": immersionRoleColor(point, inScale) } as CSSProperties}>
                <circle className="immersion-active-corona" cx={point.x} cy={point.y} r={size + 9} />
                <circle className="immersion-active-core" cx={point.x} cy={point.y} r={size} />
                {active.sustained ? <circle className="immersion-pedal-ring" cx={point.x} cy={point.y} r={size + 15} /> : null}
              </g>;
            })}
          </g>

          <g className="immersion-annotations" aria-label={`${annotations.length} proximal musical annotations`}>
            {annotations.map((annotation) => <g key={annotation.id} className={`is-${annotation.id}`}>
              <line x1={annotation.anchorX} y1={annotation.anchorY} x2={annotation.leaderX} y2={annotation.leaderY} />
              <circle cx={annotation.anchorX} cy={annotation.anchorY} r="2.5" />
              <text x={annotation.x} y={annotation.y} textAnchor={annotation.textAnchor}>
                {annotation.lines.map((line, index) => <tspan key={`${line}-${index}`} x={annotation.x} dy={index === 0 ? 0 : 15}>{line}</tspan>)}
              </text>
            </g>)}
          </g>

          {!events.length ? <g className="immersion-empty-reading">
            <text x="600" y="335">press one key</text>
            <text x="600" y="368">a pitch becomes a place</text>
            <text x="600" y="394">a second pitch reveals the relationship</text>
          </g> : null}
        </svg>
      </div>

      {latestEvent ? <div className="piano-immersion-orienting" aria-label="Proximal musical knowledge">
        <p className="is-note"><span>Latest attack</span><strong>{latestRole}</strong><small>{latestMove} · {latestRecurrence}</small></p>
        <p className="is-field"><span>{fieldProvenance}</span><strong>{matchingChord ? chordIdentity : `${fieldNotes.length} displayed position${fieldNotes.length === 1 ? "" : "s"}`}</strong><small>{matchingChord ? `${matchingChord.gesture.kind} in ${Math.round(matchingChord.gesture.spreadMs)} ms${chordStructure ? ` · ${chordStructure}` : ""}` : sampleInterval ? `${sampleInterval.relationship} near ${sampleInterval.landmarkLabel} is one visible pair` : "A second position will reveal a pairwise relationship."}{nearbyCopy ? ` · Nearby in-route possibilities, not predictions: ${nearbyCopy}.` : ""}</small></p>
        <p className="is-frame"><span>Route + center</span><strong>{routeEvidenceCopy}</strong><small>{contextCopy}{motifCopy ? ` ${motifCopy} Detector match only; intention and form are not inferred.` : ""}</small></p>
      </div> : null}

      <details className="piano-immersion-guide">
        <summary>Read the sky · open the visual key</summary>
        <div className="piano-immersion-legend" aria-label="How to read Resonance Sky">
          <span className="is-pitch"><i aria-hidden="true" /><strong>Pitch star</strong><small>direction = fifths · depth = equal-key register · hue = role around Do · size = MIDI attack velocity, not acoustic loudness</small></span>
          <span className="is-route"><i aria-hidden="true" /><strong>Route crown</strong><small>solid arcs are the selected route · thin dashed arcs sit outside it · seeds mark visits · ghost arcs are catalog fits</small></span>
          <span className="is-tide"><i aria-hidden="true" /><strong>Fifths tide</strong><small>inner = latest onset window · middle = last seven attacks · outer = retained phrase; bulges show attack density, not a key</small></span>
          <span className="is-interval"><i aria-hidden="true" /><strong>Interval fiber</strong><small>dash density shows 12-TET mismatch to the named reference; √2 is a geometric midpoint, not an integer ratio</small></span>
          <span className="is-chord"><i aria-hidden="true" /><strong>Chord membrane</strong><small>inner hull = interpreted members · faint outer hull = everything sounding · long dash = incomplete catalog fit · dotted overtrace = rolled timing</small></span>
          <span className="is-context"><i aria-hidden="true" /><strong>Musical weather</strong><small>gold = selected-Do pull · coral = assumed-spectrum crunch · violet = first/return bloom · small rosette = contextual-center cues</small></span>
          <span className="is-time"><i aria-hidden="true" /><strong>Memory + contour</strong><small>cosmic wake preserves fifths/register geography; the lower horizon shows attack time and physical rise/fall; broken wake needs release-proven silence</small></span>
          <span className="is-echo"><i aria-hidden="true" /><strong>Echo + possibilities</strong><small>dotted bridge = detected relationship-window return · hollow satellites = low-change in-route fields, never predictions</small></span>
        </div>
      </details>

      <div className="piano-immersion-reading">
        <span>Current reading</span>
        <strong>{currentReading}</strong>
        <small>{metricReading} These channels are never collapsed into correctness, emotion, preference, or musical goodness.</small>
        <em>Reference depth derives from MIDI key number using A4=440 12-TET. Pitch bend, keyboard or DAW tuning, acoustic pitch, audio spectrum, and acoustic loudness are not captured.</em>
      </div>
    </section>
  );
});
