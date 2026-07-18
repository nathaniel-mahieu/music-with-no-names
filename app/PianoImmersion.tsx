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
  semitoneFieldProfile,
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
  pianoSoundVoice,
  type PianoSoundModelId,
} from "@/lib/piano-sound-model";
import { sonorityPerceptionModel } from "@/lib/sonority-model";
import type { LivePulseMirror } from "@/lib/rhythm-model";
import {
  IMMERSION_MAX_FIELD_NOTES,
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
  immersionRecentPath,
  immersionReleaseProvenSilence,
  immersionRhythmLens,
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
    temporalCompactness: number;
    kind: "together" | "rolled";
  };
  interpretedNotes: number[];
  audibleNotes: number[];
  excludedInheritedNotes: number[];
  candidate: ChordCandidate | null;
  hasPreviousChord: boolean;
  crunch: number | null;
  pull: number;
  arrival: number;
  novelty: number;
  motion: number;
  rootTravel: number;
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
  pulseMirror: LivePulseMirror | null;
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
  return value === 0 ? "same key" : `${signedStepCount(value)} semitone${Math.abs(value) === 1 ? "" : "s"}`;
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

function characterArcPath(value: number | null, startDegrees: number) {
  if (value == null || value <= 0) return "";
  const bounded = Math.max(0, Math.min(1, value));
  const endDegrees = startDegrees + bounded * 76;
  const radius = 43;
  const point = (degrees: number) => ({
    x: 56 + Math.cos(degrees * Math.PI / 180) * radius,
    y: 56 + Math.sin(degrees * Math.PI / 180) * radius,
  });
  const start = point(startDegrees);
  const end = point(endDegrees);
  return `M ${start.x.toFixed(2)} ${start.y.toFixed(2)} A ${radius} ${radius} 0 0 1 ${end.x.toFixed(2)} ${end.y.toFixed(2)}`;
}

function percentage(value: number | null) {
  return value == null ? "—" : `${Math.round(Math.max(0, Math.min(1, value)) * 100)}%`;
}

function signedPercentDelta(value: number | null) {
  if (value == null) return "—";
  if (Math.abs(value) < 0.025) return "held";
  return `${value > 0 ? "↑" : "↓"}${Math.round(Math.abs(value) * 100)}%`;
}

function signedSemitone(value: number) {
  if (value === 0) return "0";
  return `${value > 0 ? "+" : "−"}${Math.abs(value)}`;
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
  pulseMirror,
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
  const intervalField = immersionIntervalField(fieldNotes, doMidi, latestEvent?.note ?? null);
  const semitoneProfile = semitoneFieldProfile(fieldNotes, doMidi);
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
  const crunchLimitReached = fieldNotes.length > IMMERSION_MAX_FIELD_NOTES;
  const currentPerception = fieldNotes.length >= 2 && fieldNotes.length <= IMMERSION_MAX_FIELD_NOTES
    ? sonorityPerceptionModel(fieldNotes.map((note) => pianoSoundVoice(frequencyFromMidi(note), 0.72, soundModelId)))
    : null;
  const comparablePreviousChord = matchingChord === latestChord ? previousChord : null;
  const previousPerception = comparablePreviousChord
    && comparablePreviousChord.audibleNotes.length >= 2
    && comparablePreviousChord.audibleNotes.length <= IMMERSION_MAX_FIELD_NOTES
    ? sonorityPerceptionModel(comparablePreviousChord.audibleNotes.map((note) => pianoSoundVoice(frequencyFromMidi(note), 0.72, soundModelId)))
    : null;
  const comparableVoiceProfile = comparablePreviousChord ? voiceProfile : null;
  const upSteps = comparableVoiceProfile?.strands.reduce((sum, strand) => sum + Math.max(0, strand.semitones), 0) ?? 0;
  const downSteps = comparableVoiceProfile?.strands.reduce((sum, strand) => sum + Math.max(0, -strand.semitones), 0) ?? 0;
  const heldVoices = comparableVoiceProfile?.strands.filter((strand) => strand.motion === "held").length ?? 0;
  const addedVoices = comparableVoiceProfile?.strands.filter((strand) => strand.motion === "added").length ?? 0;
  const releasedVoices = comparableVoiceProfile?.strands.filter((strand) => strand.motion === "released").length ?? 0;
  const directionalMotion = upSteps + downSteps;
  const riseShare = comparableVoiceProfile && directionalMotion > 0 ? upSteps / directionalMotion : comparableVoiceProfile ? 0 : null;
  const fallShare = comparableVoiceProfile && directionalMotion > 0 ? downSteps / directionalMotion : comparableVoiceProfile ? 0 : null;
  const roughnessDelta = currentPerception && previousPerception ? currentPerception.roughness - previousPerception.roughness : null;
  const reposeDelta = currentPerception && previousPerception ? currentPerception.repose - previousPerception.repose : null;
  const pullDelta = matchingChord && comparablePreviousChord ? matchingChord.pull - comparablePreviousChord.pull : null;
  const rhythmLens = immersionRhythmLens(phraseEvents, pulseMirror);
  const recentPath = immersionRecentPath(phraseEvents, chordWindowMs, doMidi, scale);
  const latestTransition = recentPath.latestTransition;
  const latestTransitionPerception = latestTransition
    && latestTransition.absoluteSemitones > 0
    && latestTransition.connection.kind === "overlap"
    ? sonorityPerceptionModel([
      pianoSoundVoice(frequencyFromMidi(latestTransition.from.note), 0.72, soundModelId),
      pianoSoundVoice(frequencyFromMidi(latestTransition.to.note), 0.72, soundModelId),
    ])
    : null;
  const phraseNewness = immersionPhraseNewness(phraseEvents);
  const fifthsTide = immersionFifthsTide(phraseEvents, events, chordWindowMs);
  const fifthsDrift = fifthsTide.flatMap((scope) => scope.centerPoint ? [scope.centerPoint] : []);
  const attackKnowledge = immersionAttackKnowledge(phraseEvents, doMidi, scale);
  const contour = immersionAttackContour(phraseEvents.slice(-5), chordWindowMs);
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
  const semitoneBinByDistance = new Map(semitoneProfile.intervalBins.map((bin) => [bin.semitones, bin]));
  const routeGapCounts = scale.steps.reduce((counts, gap) => counts.set(gap, (counts.get(gap) ?? 0) + 1), new Map<number, number>());
  const semitoneHorizonPoint = (semitones: number) => {
    const progress = (semitones - 1) / 11;
    const x = 428 + progress * 344;
    const y = (1 - progress) ** 2 * 632 + 2 * (1 - progress) * progress * 612 + progress ** 2 * 632;
    return { x, y };
  };
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
  const sampleIntervalCopy = sampleInterval
    ? `${noteLabel(sampleInterval.lower, doMidi, scale, showConventions)} ↔ ${noteLabel(sampleInterval.upper, doMidi, scale, showConventions)} · ${sampleInterval.semitones} semitone${sampleInterval.semitones === 1 ? "" : "s"} · near ${sampleInterval.landmarkLabel}`
    : null;
  const semitonePairCopy = semitoneProfile.intervalBins.length
    ? semitoneProfile.intervalBins.map((bin) => `${bin.semitones}${bin.pairCount > 1 ? `×${bin.pairCount}` : ""}`).join(" · ") + " semitones"
    : "no pair yet";
  const adjacentGapCopy = semitoneProfile.adjacentGaps.length
    ? `adjacent voicing gaps ${semitoneProfile.adjacentGaps.join("–")} semitones`
    : fieldNotes.length ? "one position" : "no sounding field yet";
  const strongestHomeCue = semitoneProfile.strongestHomewardCue;
  const homeCueCopy = strongestHomeCue
    ? `${noteLabel(strongestHomeCue.note, doMidi, scale, showConventions)} → Do ${keyMove(strongestHomeCue.movement)}${strongestHomeCue.directNeighbor ? " · direct one-semitone neighbor" : " · selected-Do heuristic cue"}`
    : fieldNotes.length ? "Do is already present without another homeward voice" : "no homeward move yet";
  const routeGapCopy = `${scale.steps.join("–")} semitone gap loop`;
  const newestPoint = latestEvent ? immersionPitchPoint(latestEvent.note, doMidi) : null;
  const latestRole = attackKnowledge
    ? `${showConventions ? `${conventionalPitchName(attackKnowledge.event.note)} · ` : ""}${attackKnowledge.context.syllable} · ${attackKnowledge.context.inScale ? `route degree ${attackKnowledge.context.degreeIndex + 1}` : "outside selected route"}`
    : "";
  const latestMove = attackKnowledge?.moveSteps == null
    ? "first attack in retained memory"
    : `attack-to-attack ${keyMove(attackKnowledge.moveSteps)} · near ${attackKnowledge.moveLandmark?.landmarkLabel}${attackKnowledge.onsetGapMs != null ? ` · ${Math.round(attackKnowledge.onsetGapMs)} ms` : ""}`;
  const latestRecurrence = attackKnowledge
    ? `${attackKnowledge.pitchClassOccurrenceCount === 1 ? "first pitch-class visit" : `pitch-class return #${attackKnowledge.pitchClassOccurrenceCount}`}${attackKnowledge.attacksSincePreviousPitchClass != null ? ` · ${attackKnowledge.attacksSincePreviousPitchClass} intervening attacks` : ""} · ${formatHz(attackKnowledge.context.frequencyHz)} ref`
    : "";
  const chordIdentity = matchingChord?.candidate?.exact
    ? `${pitchClassLabel(matchingChord.candidate.rootPitchClass, doMidi, scale, showConventions)} ${matchingChord.candidate.template.name.toLowerCase()} · exact catalog shape`
    : matchingChord
      ? `${matchingChord.interpretedNotes.length}-position interpretation · no exact catalog label`
      : null;
  const chordStructure = currentChordShape
    ? `from bass ${currentChordShape.bassRelativePositions.join("–")} semitones · adjacent voicing gaps ${currentChordShape.physicalGaps.join("–") || "0"} · folded loop ${currentChordShape.cyclicGaps.join("–")}`
    : null;
  const chordCopy = matchingChord
    ? `${matchingChord.gesture.attacks.length} attacks · ${matchingChord.gesture.kind} · ${Math.round(matchingChord.gesture.spreadMs)} ms. ${chordIdentity}${chordStructure ? `; ${chordStructure}` : ""}.`
    : "No current multi-note onset group matches the displayed field.";
  const nearbyCopy = nearbyOptions.length
    ? nearbyOptions.map((option) => `${option.syllable}: ${nearbyPossibilityLabel(matchingChord!.interpretedNotes, option.pitchClasses, doMidi, scale, showConventions)}`).join(" · ")
    : null;
  const fusion = currentPerception?.fusion ?? null;
  const chordPanelIdentity = matchingChord
    ? chordIdentity ?? `${matchingChord.interpretedNotes.length}-position onset field`
    : fieldNotes.length >= 2
      ? `${fieldNotes.length}-position sounding field`
      : fieldNotes.length === 1
        ? "One sounding position"
        : "Waiting for a sounding field";
  const voiceMotionCopy = comparableVoiceProfile
    ? `↑${upSteps} st · ↓${downSteps} st · ${heldVoices} held${addedVoices || releasedVoices ? ` · +${addedVoices}/−${releasedVoices} voices` : ""}`
    : "Play a second grouped field to compare nearest-key motion";
  const ringSummary = `Independent modeled field cues: roughness ${percentage(currentPerception?.roughness ?? null)}, fusion ${percentage(fusion)}, upward share ${percentage(riseShare)}, downward share ${percentage(fallShare)}. Felt character is listener-only and unreported.`;
  const rhythmSourceLabel = pulseMirror?.status === "capturing"
    ? `Learner pulse · ${pulseMirror.tapEvents.length}/4 anchor taps`
    : pulseMirror?.status === "invalid"
      ? "Learner pulse · anchor needs retry"
      : pulseMirror?.status === "waiting"
        ? "Learner pulse · waiting for anchor"
        : rhythmLens.source === "learner-pulse"
          ? "Learner-declared pulse"
          : rhythmLens.source === "local-ruler"
            ? "Local onset ruler · not a beat"
            : "Timing evidence gathering";
  const rhythmRulerCopy = pulseMirror?.status === "capturing"
    ? `${pulseMirror.tapsNeeded} more same-key tap${pulseMirror.tapsNeeded === 1 ? "" : "s"} to declare the pulse`
    : pulseMirror?.status === "invalid"
      ? pulseMirror.invalidReason ?? "The four anchor gaps did not form a usable pulse"
      : rhythmLens.rulerMs == null
        ? "Play four attacks across three onset groups"
        : rhythmLens.source === "learner-pulse" && rhythmLens.pulsesPerMinute != null
          ? `${Math.round(rhythmLens.rulerMs)} ms · ${Math.round(rhythmLens.pulsesPerMinute)} pulses/min`
          : `${Math.round(rhythmLens.rulerMs)} ms median gap`;
  const rhythmDeviationCopy = rhythmLens.latestMultiple == null || rhythmLens.nearestRatioLabel == null || rhythmLens.deviationPercent == null
    ? "A later gap will reveal the nearest ratio landmark"
    : `${rhythmLens.latestMultiple.toFixed(2)}× ruler · nearest ${rhythmLens.nearestRatioLabel} · ${rhythmLens.deviationPercent >= 0 ? "+" : "−"}${Math.abs(rhythmLens.deviationPercent).toFixed(1)}%`;
  const rhythmPhaseCopy = rhythmLens.source === "learner-pulse" && rhythmLens.phaseLabel && rhythmLens.phaseDistanceMs != null
    ? `${Math.round(rhythmLens.phaseDistanceMs)} ms from ${rhythmLens.phaseLabel}`
    : rhythmLens.repeatedGapShare != null
      ? `${Math.round(rhythmLens.repeatedGapShare * 100)}% of recent gap shapes recur`
      : "No beat, bar, or meter is inferred";
  const recentPathTitle = recentPath.completeFive && recentPath.monophonic
    ? "Recent five-note line"
    : recentPath.events.length
      ? `Recent ${recentPath.events.length}-attack path${recentPath.monophonic ? "" : " · bouquet included"}`
      : "Recent attack path";
  const recentDegreeCopy = recentPath.events.length
    ? recentPath.events.map((event) => noteLabel(event.note, doMidi, scale, showConventions)).join(" → ")
    : "Play to begin the path";
  const recentStepCopy = recentPath.steps.length
    ? recentPath.steps.map((step) => signedSemitone(step.semitones)).join(" · ") + " st"
    : "A second attack will reveal direction";
  const recentLandmarkCopy = recentPath.steps.length
    ? recentPath.steps.map((step) => step.landmarkLabel).join(" · ")
    : "";
  const recentCatalogCopy = recentPath.catalogCandidates.length
    ? recentPath.catalogCandidates.map((candidate) => `${shortScaleLabel(candidate, doMidi, scale, showConventions)} ${candidate.inScaleCount}/${candidate.uniqueNoteCount}`).join(" / ")
    : "At least three distinct pitch classes are needed for a useful catalog comparison";
  const recentBoundaryCopy = !recentPath.events.length
    ? "Waiting for attacks"
    : recentPath.monophonic
      ? `${recentPath.direction} · ${recentPath.pitchSpan} st span · ${recentPath.directionTurns} turn${recentPath.directionTurns === 1 ? "" : "s"}`
      : `${recentPath.groupCount} onset groups · melody and accompaniment are not isolated`;
  const latestTransitionSpoken = !latestTransition
    ? "A second isolated attack will reveal the exact signed MIDI-key difference"
    : latestTransition.direction === "up"
      ? `up ${latestTransition.absoluteSemitones} semitone${latestTransition.absoluteSemitones === 1 ? "" : "s"}`
      : latestTransition.direction === "down"
        ? `down ${latestTransition.absoluteSemitones} semitone${latestTransition.absoluteSemitones === 1 ? "" : "s"}`
        : "same key, zero semitones";
  const latestTransitionKindLabel = latestTransition?.context === "between-singletons"
    ? "Latest sequential key interval"
    : latestTransition
      ? "Latest chronological key spacing"
      : "Latest sequential key interval";
  const latestTransitionMark = !latestTransition
    ? "—"
    : latestTransition.direction === "up"
      ? `↑${latestTransition.absoluteSemitones}`
      : latestTransition.direction === "down"
        ? `↓${latestTransition.absoluteSemitones}`
        : "0";
  const latestTransitionNotes = latestTransition
    ? `${noteLabel(latestTransition.from.note, doMidi, scale, showConventions)} → ${noteLabel(latestTransition.to.note, doMidi, scale, showConventions)} · MIDI ${latestTransition.from.note} → ${latestTransition.to.note} · ${Math.round(latestTransition.onsetGapMs)} ms`
    : "Play two attacks to expose a physical keyboard interval";
  const latestReferenceCopy = latestTransition
    ? latestTransition.absoluteSemitones === 0
      ? "A4=440 12-TET reference ×1.000 · repeated pitch coordinate"
      : `next reference ×${latestTransition.directionalFrequencyRatio.toFixed(3)} · unordered span ×${latestTransition.spanFrequencyRatio.toFixed(3)} · near ${latestTransition.landmark.landmarkLabel}${Math.abs(latestTransition.landmark.errorCents) < 0.05 ? " exactly" : ` · 12-TET is ${Math.abs(latestTransition.landmark.errorCents).toFixed(1)}¢ ${latestTransition.landmark.errorCents > 0 ? "wider" : "narrower"}`}`
    : "Every ascending semitone multiplies the A4=440 reference frequency by 2^(1/12)";
  const latestRouteMovement = latestTransition
    ? latestTransition.fromRole.inScale && latestTransition.toRole.inScale
      ? "both positions fit the selected route"
      : !latestTransition.fromRole.inScale && latestTransition.toRole.inScale
        ? "enters the selected route"
        : latestTransition.fromRole.inScale && !latestTransition.toRole.inScale
          ? "leaves the selected route"
          : "both positions sit outside the selected route"
    : "selected-frame context waits for a transition";
  const latestDoMovement = latestTransition
    ? pitchClassFromMidi(latestTransition.to.note) === selectedRootPitchClass
      ? "lands on selected Do"
      : pitchClassFromMidi(latestTransition.from.note) === selectedRootPitchClass
        ? "leaves selected Do"
        : `shortest selected-Do class distance ${latestTransition.fromDoPitchClassDistance} → ${latestTransition.toDoPitchClassDistance} st`
    : "";
  const latestTonalCopy = latestTransition
    ? `${latestRouteMovement} · ${latestDoMovement}`
    : latestRouteMovement;
  const latestConnectionCopy = !latestTransition
    ? "No acoustic interaction is inferred before a pair exists"
    : latestTransition.connection.kind === "overlap"
      ? `${latestTransition.connection.basis === "release-time" && latestTransition.connection.durationMs != null ? `${Math.round(latestTransition.connection.durationMs)} ms MIDI-release overlap${latestTransition.connection.pedalExtended ? " · pedal-ended" : ""}` : "MIDI-state overlap at the later attack"}${latestTransitionPerception ? ` · ${currentModel.shortLabel} pair model: roughness ${percentage(latestTransitionPerception.roughness)}, fusion ${percentage(latestTransitionPerception.fusion)}` : " · same-key spectral interaction withheld"}`
      : latestTransition.connection.kind === "silence"
        ? `${Math.round(latestTransition.connection.durationMs ?? 0)} ms release-proven separation · simultaneous roughness withheld`
        : latestTransition.connection.kind === "touching"
          ? "Earlier release meets the next attack · no positive overlap; simultaneous roughness withheld"
          : "Release timing is incomplete · overlap and simultaneous roughness stay unknown";
  const latestSequenceBoundary = !latestTransition
    ? "Waiting for a second attack"
    : latestTransition.context === "inside-bouquet"
      ? "Inside one close-time onset bouquet: exact chronological attack spacing, not an isolated melody interval."
      : latestTransition.context === "after-bouquet"
        ? `From the prior bouquet's last chronological attack (${latestTransition.sourceGroupAttackCount} attacks): not whole-field voice leading.`
        : "Two singleton onset groups: an isolated note-to-note keyboard interval.";
  const latestTransitionSummary = latestTransition
    ? `${latestTransitionKindLabel}: ${latestTransitionSpoken}. ${latestTransition.character.spacingLabel}. ${latestTransitionNotes}. ${latestReferenceCopy}. Selected frame: ${latestTonalCopy}. Acoustic evidence: ${latestConnectionCopy}. Listening prompts: ${latestTransition.character.listeningPrompt}; associations only, not an emotion prediction. ${latestSequenceBoundary}`
    : latestTransitionSpoken;
  const samplingReading = intervalField.omittedLinkCount
    ? ` ${intervalField.links.length} of ${intervalField.totalPairCount} possible interval fibers are drawn${intervalField.omittedNoteCount ? ` from ${intervalField.notes.length} positions sampled across the register` : ""}.`
    : "";
  const currentReading = latestEvent
    ? `${latestLabel} arrived at MIDI key ${latestEvent.note}. ${activeNumbers.length ? `${activeNumbers.length} ${activeNumbers.length === 1 ? "position is" : "positions are"} held or pedal-sustained in the live sounding field.` : `No keys remain held; the fibers preserve the latest attack-time snapshot${fieldNotes.length ? ` of ${fieldNotes.length} positions` : ""}.`}`
    : "Play a MIDI key, or open the silent hand horizon below. The first attack will light the sky.";
  const crunchReading = currentCrunch != null
    ? `modeled crunch is ${evidenceWord(currentCrunch)} under ${currentModel.shortLabel.toLowerCase()}`
    : crunchLimitReached
      ? `modeled crunch pauses above ${IMMERSION_MAX_FIELD_NOTES} positions to keep live rendering bounded`
      : "modeled crunch needs a matching multi-note field";
  const pullReading = `selected-Do pull heuristic is ${evidenceWord(tendency.homePull)}; ${homeCueCopy}`;
  const metricReading = latestEvent
    ? `For the ${fieldProvenance}, ${pullReading}; home evidence is ${evidenceWord(tendency.homeEvidence)}; the latest first/return bloom is ${evidenceWord(phraseNewness)}; ${crunchReading}. Semitone spacing is the ruler; register and the assumed spectrum determine coral crunch, while phrase context and listening shape felt resolution.${samplingReading}`
    : "Hue, size, trails, filaments, and mist remain separate visual channels; none is a goodness or emotion score.";
  const visualSummary = latestEvent
    ? `Resonance Sky contains ${Math.min(28, phraseEvents.length)} recent attack marks and ${events.length} bright microscope attacks. Latest: ${latestRole}; ${latestMove}; ${latestRecurrence}. The ${fieldProvenance} contains ${fieldNotes.length} positions and ${intervalField.totalPairCount} possible pairwise intervals; ${intervalField.links.length} bounded filaments are shown${sampleIntervalCopy ? `, led by ${sampleIntervalCopy}` : ""}. Field spacing: ${adjacentGapCopy}; octave-folded pair counts ${semitonePairCopy}. Selected route gaps: ${routeGapCopy}. ${chordCopy} ${routeEvidenceCopy} ${contextCopy} ${motifCopy ?? "No relationship-window return is currently drawn."} ${metricReading} Musical quality and listener feeling are not inferred.`
    : "Empty Resonance Sky. Direction follows the circle of fifths, depth follows semitone register, and the outer aurora shows the selected movable-Do route.";
  const liveSummary = latestEvent
    ? `Latest keyboard interval: ${latestTransitionSpoken}${latestTransition ? `; ${latestTransition.character.spacingLabel}` : ""}. ${latestSequenceBoundary} Rhythm: ${rhythmSourceLabel}; ${rhythmDeviationCopy}. Harmony: ${chordPanelIdentity}; ${voiceMotionCopy}; modeled roughness ${percentage(currentPerception?.roughness ?? null)} and fusion ${percentage(fusion)}.`
    : "Resonance Sky is ready. Play one key to place a pitch, then add attacks to reveal rhythm, harmony, and a recent path.";
  const annotationInputs = [
    ...(newestPoint ? [{
      id: "latest-note",
      anchorX: newestPoint.x,
      anchorY: newestPoint.y,
      lines: [latestRole],
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
      lines: [`${noteLabel(sampleInterval.lower, doMidi, scale, showConventions)} ↔ ${noteLabel(sampleInterval.upper, doMidi, scale, showConventions)} · ${sampleInterval.semitones} st`, `${sampleInterval.relationship} · near ${sampleInterval.landmarkLabel} · ${Math.round(Math.abs(sampleInterval.errorCents))}¢ offset`],
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
  const annotations = planImmersionAnnotations(annotationInputs, 1, reservedAnnotationBounds);
  const registerBeacons = [36, 60, 84].map((note, index) => ({
    note,
    radius: immersionPitchPoint(note, doMidi).radius,
    path: orbitArcPath(immersionPitchPoint(note, doMidi).radius, 136 + index * 3, 218 - index * 4),
    labelPoint: {
      x: IMMERSION_VIEWBOX.centerX + Math.cos((218 - index * 4) * Math.PI / 180) * immersionPitchPoint(note, doMidi).radius,
      y: IMMERSION_VIEWBOX.centerY + Math.sin((218 - index * 4) * Math.PI / 180) * immersionPitchPoint(note, doMidi).radius,
    },
  }));
  const [announcedSummary, setAnnouncedSummary] = useState(liveSummary);

  useEffect(() => {
    const timer = window.setTimeout(() => setAnnouncedSummary(liveSummary), 280);
    return () => window.clearTimeout(timer);
  }, [liveSummary]);

  return (
    <section className="piano-immersion" aria-labelledby="piano-immersion-title">
      <div className="piano-immersion-intro">
        <div>
          <span>Immersion · analysis only</span>
          <h3 id="piano-immersion-title">Resonance Sky</h3>
          <p>The exact signed semitone move now leads the recent path: first the physical key distance, then its acoustic coordinate, selected-frame context, and possible listening words. The center keeps fifths direction, register depth, simultaneity, and motion while rhythm and harmony remain separate edge questions.</p>
        </div>
        <label className="piano-immersion-model" htmlFor="immersion-sound-model">
          <span>Assumed spectrum</span>
          <select id="immersion-sound-model" value={soundModelId} onChange={(event) => onSoundModelChange(event.target.value as PianoSoundModelId)}>
            {PIANO_SOUND_MODELS.map((model) => <option key={model.id} value={model.id}>{model.shortLabel}</option>)}
          </select>
          <small>Coral field crunch and release-gated pair evidence respond; no keyboard audio is read. Dense fields above {IMMERSION_MAX_FIELD_NOTES} positions pause the field model.</small>
        </label>
      </div>

      <p className="sr-only" role="status" aria-live="polite" aria-atomic="true">{announcedSummary}</p>

      <div className="piano-immersion-stage">
        <svg viewBox={`0 0 ${IMMERSION_VIEWBOX.width} ${IMMERSION_VIEWBOX.height}`} preserveAspectRatio="xMidYMid slice" role="img" aria-labelledby="piano-immersion-svg-title piano-immersion-svg-description">
          <title id="piano-immersion-svg-title">Resonance Sky for the current MIDI phrase</title>
          <desc id="piano-immersion-svg-description">{visualSummary}</desc>
          <defs>
            <radialGradient id={`${instanceId}-home-well`}>
              <stop offset="0" stopColor="#ffd36a" stopOpacity="0.44" />
              <stop offset="0.42" stopColor="#ffd36a" stopOpacity="0.12" />
              <stop offset="1" stopColor="#ffd36a" stopOpacity="0" />
            </radialGradient>
            {visibleClouds.map(({ measure, gradientId }) => {
              const notes = [...new Set(measure.interpretedNotes)];
              const colorNotes = notes.length <= IMMERSION_MAX_FIELD_NOTES
                ? notes
                : Array.from({ length: IMMERSION_MAX_FIELD_NOTES }, (_, index) => notes[Math.round(index * (notes.length - 1) / (IMMERSION_MAX_FIELD_NOTES - 1))]);
              return <linearGradient key={gradientId} id={gradientId} x1="0" y1="0" x2="1" y2="1">
                {colorNotes.map((note, index) => {
                  const point = immersionPitchPoint(note, doMidi);
                  return <stop key={note} offset={`${colorNotes.length <= 1 ? 50 : index / (colorNotes.length - 1) * 100}%`} stopColor={immersionRoleColor(point, routePitchClasses.has(point.pitchClass))} stopOpacity={measure === matchingChord ? 0.22 : 0.1} />;
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

          <g className="immersion-register-beacons" aria-label="Three A4 equals 440 12-TET register references">
            {registerBeacons.map((beacon) => <g key={beacon.note}>
              <path d={beacon.path} />
              <circle cx={beacon.labelPoint.x} cy={beacon.labelPoint.y} r="2.5" />
              <text x={beacon.labelPoint.x - 8} y={beacon.labelPoint.y + 4} textAnchor="end">{showConventions ? `${conventionalPitchName(beacon.note)} · ` : ""}{formatHz(frequencyFromMidi(beacon.note))}</text>
            </g>)}
          </g>

          <g className="immersion-fifths-tide" aria-label="Circle-of-fifths attack density in the latest onset window, latest seven attacks, and retained phrase scopes">
            {fifthsTide.map((scope) => <g key={scope.id} className={`is-${scope.id}`}>
              {scope.eventCount ? <path className="immersion-tide-envelope" d={scope.densityPath}><title>{scope.label}: {scope.eventCount} attacks across {scope.uniquePitchClassCount} pitch classes</title></path> : null}
              {scope.countsByFifthStep.map((count, fifthStep) => {
                if (!count) return null;
                const sector = selectedSectors[fifthStep];
                const strength = count / Math.max(1, scope.maximumCount);
                return <path key={fifthStep} className="immersion-tide-visit" d={immersionArcPath(sector.pitchClass, scope.radius, 6 + strength * 14)} style={{ "--immersion-tide": strength } as CSSProperties}><title>{scope.label}: {count} attack{count === 1 ? "" : "s"} at {pitchClassLabel(sector.pitchClass, doMidi, scale, showConventions)}</title></path>;
              })}
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
            {visibleClouds.map(({ measure, interpretedHull, audibleHull, gradientId }) => interpretedHull ? <g key={measure.gesture.id} className={`${measure.gesture.kind === "rolled" ? "is-rolled" : "is-together"} ${measure.candidate?.exact ? "is-exact" : "is-incomplete"} ${measure === matchingChord ? "is-current" : "is-history"}`} style={measure === matchingChord && fusion != null ? { "--immersion-fusion": fusion } as CSSProperties : undefined}>
              {audibleHull ? <path className="immersion-audible-hull" d={audibleHull.path}><title>Outer edge: everything sounding at the timing-group close, including tones excluded from the chord interpretation</title></path> : null}
              <path className="immersion-interpreted-hull" d={interpretedHull.path} fill={`url(#${gradientId})`}><title>{measure.gesture.kind} group: {measure.gesture.attacks.length} attacks across {Math.round(measure.gesture.spreadMs)} milliseconds; inner membrane follows interpreted membership; {measure.candidate?.exact ? `exact ${measure.candidate.template.name} catalog shape` : "no exact catalog shape"}</title></path>
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
              return <path key={`${strand.from}-${strand.to}-${index}`} d={filamentPath(from, to)} className={`is-${strand.motion}`}><title>{strand.motion === "held" ? "Retained physical key" : strand.motion === "added" ? "Position entered the interpretation" : strand.motion === "released" ? "Position left the interpretation" : `Nearest-key voice moved ${Math.abs(strand.semitones)} semitone${Math.abs(strand.semitones) === 1 ? "" : "s"} ${strand.motion}`}</title></path>;
            })}
          </g> : null}

          {memoryTrail.length > 1 ? <path className="immersion-memory-wake" d={immersionCurve(memoryTrail.map(({ point }) => point))} /> : null}

          {contour.points.length ? <g className="immersion-attack-contour" aria-label={`Attack contour for ${contour.points.length} recent attacks; ${contour.monophonic ? "each onset group contains one attack" : "close-time multi-attack groups are preserved"}`}>
            <path className="immersion-contour-horizon" d="M 350 578 Q 600 560 850 578" />
            {contourGroups.filter((group) => group.points.length > 1).map((group) => <ellipse key={group.groupIndex} className="immersion-contour-bouquet" cx={group.centerX} cy={group.centerY} rx={group.radiusX} ry={group.radiusY}><title>{group.points.length} attacks share one timing group</title></ellipse>)}
            {contour.segments.map((segment) => <g key={`${segment.from.event.id}-${segment.to.event.id}`} className={segment.sameGroup ? "is-same-group" : segment.connectAsLine ? "is-line" : "is-group-bridge"}>
              <path d={`M ${segment.from.x.toFixed(2)} ${segment.from.y.toFixed(2)} L ${segment.to.x.toFixed(2)} ${segment.to.y.toFixed(2)}`} />
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
                <path d={filamentPath(link.lowerPoint, link.upperPoint)}><title>{noteLabel(link.lower, doMidi, scale, showConventions)} to {noteLabel(link.upper, doMidi, scale, showConventions)}: {link.semitones} semitone{link.semitones === 1 ? "" : "s"}, {link.relationship}, near {link.landmarkLabel}, {Math.round(Math.abs(link.errorCents))} cents from that {link.referenceKind === "geometric-midpoint" ? "geometric octave midpoint" : "integer-ratio reference"}</title></path>
              </g>;
            })}
          </g>

          <g className="immersion-semitone-horizon" aria-label={`Semitone horizon. Octave-folded field pair counts: ${semitonePairCopy}. Selected scale gap loop: ${routeGapCopy}. Homeward cue: ${homeCueCopy}.`}>
            <path className="immersion-semitone-baseline" d="M 428 632 Q 600 612 772 632" />
            {Array.from({ length: 12 }, (_, index) => index + 1).map((semitones) => {
              const point = semitoneHorizonPoint(semitones);
              const bin = semitoneBinByDistance.get(semitones);
              const routeCount = routeGapCounts.get(semitones) ?? 0;
              const isHomeCue = strongestHomeCue?.distance === semitones;
              return <g key={semitones} className={`${bin ? "is-present" : ""} ${routeCount ? "is-route-gap" : ""} ${isHomeCue ? "is-home-cue" : ""}`}>
                <line x1={point.x} y1={point.y - 4} x2={point.x} y2={point.y + 4} />
                <circle cx={point.x} cy={point.y} r={bin ? Math.min(8, 3.2 + Math.sqrt(bin.pairCount) * 1.8) : 1.6} />
                {routeCount ? <rect x={point.x - 3.5} y={point.y + 10} width="7" height="7" transform={`rotate(45 ${point.x} ${point.y + 13.5})`}><title>The selected route uses {routeCount} gap{routeCount === 1 ? "" : "s"} of {semitones} semitone{semitones === 1 ? "" : "s"}</title></rect> : null}
                {isHomeCue ? <path className="immersion-semitone-home-cue" d={`M ${point.x - 5} ${point.y - 13} L ${point.x + 5} ${point.y - 13} L ${point.x} ${point.y - 6} Z`}><title>{homeCueCopy}</title></path> : null}
                {bin || routeCount || isHomeCue ? <text x={point.x} y={point.y + 29}>{semitones}</text> : null}
                {bin ? <title>{bin.pairCount} sounding pair{bin.pairCount === 1 ? "" : "s"} fold to {semitones} semitone{semitones === 1 ? "" : "s"} within an octave; exact register distance{bin.exactDistances.length === 1 ? "" : "s"} {bin.exactDistances.join(", ")}</title> : null}
              </g>;
            })}
          </g>

          {latestEvent ? (() => {
            const point = immersionPitchPoint(latestEvent.note, doMidi);
            return <circle className="immersion-newness-bloom" cx={point.x} cy={point.y} r={22 + phraseNewness * 30} style={{ "--immersion-newness": phraseNewness } as CSSProperties} />;
          })() : null}

          {latestEvent && tendency.homePull >= 0.04 ? <path className="immersion-pull-current" d={filamentPath(fieldPoint, homeAtField)} markerEnd={`url(#${instanceId}-pull-arrow)`} style={{ "--immersion-pull": tendency.homePull } as CSSProperties}><title>Selected-Do pull heuristic is {evidenceWord(tendency.homePull)}. {homeCueCopy}. This arrow is contextual, not a physical force or felt-resolution prediction.</title></path> : null}

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
                <circle className="cosmos-node-bloom" cx={point.x} cy={point.y} r={size + 10} />
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

        <div className="piano-immersion-edge-hud">
          <section className="piano-immersion-lens is-rhythm" aria-labelledby={`${instanceId}-rhythm-lens-title`}>
            <header>
              <span>Rhythm</span>
              <strong id={`${instanceId}-rhythm-lens-title`}>{rhythmSourceLabel}</strong>
            </header>
            <p className="piano-immersion-lens-value">{rhythmRulerCopy}</p>
            <p className="piano-immersion-ratio-reading"><span>Closest gap shape</span><strong>{rhythmDeviationCopy}</strong></p>
            <p className="piano-immersion-lens-cue">{rhythmPhaseCopy}</p>
            <p className="piano-immersion-lens-boundary"><span>Beat / measure</span><strong>—</strong><small>needs a declared downbeat and pulses per measure</small></p>
            <small>Deviation is distance from the nearest ratio or pulse landmark—not performance accuracy.</small>
          </section>

          <section className="piano-immersion-lens is-harmony" aria-labelledby={`${instanceId}-harmony-lens-title`}>
            <header>
              <span>Harmony field</span>
              <strong id={`${instanceId}-harmony-lens-title`} className={fusion != null && fusion >= 0.6 ? "is-fused" : ""}>{chordPanelIdentity}</strong>
            </header>
            <div className="piano-immersion-interval-strip" aria-label={`Octave-folded pair intervals: ${semitonePairCopy}`}>
              {semitoneProfile.intervalBins.length
                ? semitoneProfile.intervalBins.map((bin) => <span key={bin.semitones}>{bin.semitones}{bin.pairCount > 1 ? `×${bin.pairCount}` : ""}</span>)
                : <span>add a second position</span>}
            </div>
            <small>{adjacentGapCopy} · {matchingChord ? `onset togetherness ${percentage(matchingChord.gesture.temporalCompactness)}` : "no matched timing group"} · interval values are semitones</small>

            <div className="piano-immersion-character">
              <svg viewBox="0 0 112 112" role="img" aria-label={ringSummary}>
                <circle className="is-guide" cx="56" cy="56" r="43" />
                {currentPerception ? <path className="is-roughness" d={characterArcPath(currentPerception.roughness, -90)} /> : null}
                {riseShare != null ? <path className="is-rising" d={characterArcPath(riseShare, 0)} /> : null}
                {fusion != null ? <path className="is-fusion" d={characterArcPath(fusion, 90)} /> : null}
                {fallShare != null ? <path className="is-falling" d={characterArcPath(fallShare, 180)} /> : null}
                <text x="56" y="52">model</text>
                <text x="56" y="67">cues</text>
              </svg>
              <dl>
                <div className="is-roughness"><dt>roughness</dt><dd>{percentage(currentPerception?.roughness ?? null)}</dd></div>
                <div className="is-rising"><dt>rising share</dt><dd>{percentage(riseShare)}</dd></div>
                <div className="is-fusion"><dt>model fusion</dt><dd>{percentage(fusion)}</dd></div>
                <div className="is-falling"><dt>falling share</dt><dd>{percentage(fallShare)}</dd></div>
              </dl>
            </div>

            <div className="piano-immersion-change-cues">
              <span>Change cues · no resolution verdict</span>
              <strong>{voiceMotionCopy}</strong>
              <small>roughness {signedPercentDelta(roughnessDelta)} · model repose {signedPercentDelta(reposeDelta)} · selected-Do pull {signedPercentDelta(pullDelta)}</small>
            </div>
            <p className="piano-immersion-felt"><span>Felt character</span><strong>listener only · unreported</strong></p>
            <small>Chord-name emphasis and the current membrane weight follow modeled fusion under the assumed spectrum; onset togetherness and catalog fit stay separate.</small>
          </section>

          <section className="piano-immersion-lens is-melody" aria-labelledby={`${instanceId}-melody-lens-title`}>
            <header>
              <span>Semitone path</span>
              <strong id={`${instanceId}-melody-lens-title`}>{recentPathTitle}</strong>
            </header>

            <div className={`piano-immersion-latest-transition ${latestTransition ? `is-${latestTransition.direction}` : "is-waiting"}`} role="group" aria-label={latestTransitionSummary}>
              <p className="piano-immersion-transition-number">
                <span>{latestTransitionKindLabel}</span>
                <strong>{latestTransitionMark}</strong>
                <b>semitones</b>
              </p>
              <em>{latestTransition?.character.spacingLabel ?? "waiting for a second attack"}{latestTransition?.absoluteSemitones ? ` · common name region: ${latestTransition.landmark.conventionalName}` : ""}</em>
              <small>{latestTransitionNotes}</small>
            </div>

            <small className="piano-immersion-transition-boundary">{latestSequenceBoundary}</small>

            {recentPath.events.length && !recentPath.monophonic ? <p className="piano-immersion-bouquet-summary">
              <span>Recent chronological attack spacing</span>
              <strong>{recentStepCopy}</strong>
              <small>{recentBoundaryCopy}. Attack order remains exact; melody, accompaniment, and whole-field voices are not isolated.</small>
            </p> : <>
              <p className="piano-immersion-degree-path">{recentDegreeCopy}</p>
              <p className="piano-immersion-step-path"><span>Recent signed key intervals</span><strong>{recentStepCopy}</strong><small>{recentLandmarkCopy} · exact attack-to-attack MIDI-key differences</small></p>
              <p className="piano-immersion-recent-summary">
                <strong>{recentBoundaryCopy} · selected route {recentPath.selectedRouteCount}/{recentPath.events.length || 0} · repeated-size moves {recentPath.repeatedIntervalCount}/{recentPath.steps.length || 0}</strong>
                <small>Compatible catalog routes: {recentCatalogCopy} · compatibility, not scale origin, harmony, or cohesion.</small>
              </p>
            </>}
          </section>
        </div>
      </div>

      <section className="piano-immersion-interval-context-bar" aria-labelledby={`${instanceId}-interval-context-title`}>
        <header>
          <span>Latest interval context</span>
          <strong id={`${instanceId}-interval-context-title`}>{latestTransition ? `${latestTransitionMark} semitones · ${latestTransition.character.spacingLabel}` : "A second attack opens the interval context"}</strong>
          <small>{latestTransitionNotes}</small>
        </header>
        <div>
          <p className="is-acoustic"><span>Acoustic coordinate</span><strong>{latestReferenceCopy}</strong><small>{latestConnectionCopy}</small></p>
          <p className="is-tonal"><span>Selected-frame context</span><strong>{latestTonalCopy}</strong><small>Route and Do are learner-selected coordinates—not inherent function or resolution.</small></p>
          <p className="is-listening"><span>Listen for · possible words</span><strong>{latestTransition?.character.listeningPrompt ?? "spacing character appears with the next interval"}</strong><small>Prompts, not a prediction of emotion, consonance, preference, or meaning.</small></p>
        </div>
      </section>

      <details className="piano-immersion-evidence">
        <summary>Open exact current evidence and provenance</summary>
        {latestEvent ? <div className="piano-immersion-orienting" aria-label="Detailed proximal musical evidence">
          <p className="is-note"><span>Latest attack</span><strong>{latestRole}</strong><small>{latestMove} · {latestRecurrence}</small></p>
          <p className="is-field"><span>{fieldProvenance}</span><strong>{matchingChord ? chordIdentity : `${fieldNotes.length} displayed position${fieldNotes.length === 1 ? "" : "s"}`}</strong><small>{matchingChord ? `${matchingChord.gesture.kind} in ${Math.round(matchingChord.gesture.spreadMs)} ms${chordStructure ? ` · ${chordStructure}` : ""}` : sampleIntervalCopy ?? "A second position will reveal a pairwise relationship."} · {adjacentGapCopy}; pair classes {semitonePairCopy}.{nearbyCopy ? ` Nearby in-route possibilities, not predictions: ${nearbyCopy}.` : ""}</small></p>
          <p className="is-frame"><span>Route + center</span><strong>{routeEvidenceCopy}</strong><small>{routeGapCopy}. {contextCopy} {homeCueCopy}.{motifCopy ? ` ${motifCopy} Detector match only; intention and form are not inferred.` : ""}</small></p>
        </div> : null}
        <div className="piano-immersion-reading">
          <span>Current reading</span>
          <strong>{currentReading}</strong>
          <small>{metricReading} These channels are never collapsed into correctness, emotion, preference, or musical goodness.</small>
          <em>Reference depth derives from MIDI key number using A4=440 12-TET. Pitch bend, keyboard or DAW tuning, acoustic pitch, audio spectrum, and acoustic loudness are not captured.</em>
        </div>
      </details>

      <details className="piano-immersion-guide">
        <summary>Read the sky · open the visual key</summary>
        <div className="piano-immersion-legend" aria-label="How to read Resonance Sky">
          <span className="is-pitch"><i aria-hidden="true" /><strong>Pitch star</strong><small>direction = fifths · depth = semitone register · hue = role around Do · size = MIDI attack velocity, not acoustic loudness</small></span>
          <span className="is-route"><i aria-hidden="true" /><strong>Route crown</strong><small>solid arcs are the selected route · thin dashed arcs sit outside it · seeds mark visits · ghost arcs are catalog fits</small></span>
          <span className="is-tide"><i aria-hidden="true" /><strong>Fifths tide</strong><small>inner = latest onset window · middle = last seven attacks · outer = retained phrase; bulges show attack density, not a key</small></span>
          <span className="is-interval"><i aria-hidden="true" /><strong>Interval fiber</strong><small>dash density shows 12-TET mismatch to the named reference; √2 is a geometric midpoint, not an integer ratio</small></span>
          <span className="is-semitone"><i aria-hidden="true" /><strong>Semitone horizon</strong><small>numbered circles count sounding pair spans folded into one octave · diamonds mark scale-gap sizes · gold pointer marks one concrete move to Do</small></span>
          <span className="is-chord"><i aria-hidden="true" /><strong>Chord membrane</strong><small>inner hull = interpreted members · faint outer hull = everything sounding · long dash = incomplete catalog fit · dotted overtrace = rolled timing</small></span>
          <span className="is-context"><i aria-hidden="true" /><strong>Musical weather</strong><small>gold = selected-Do pull · coral = assumed-spectrum crunch · violet = first/return bloom · small rosette = contextual-center cues</small></span>
          <span className="is-time"><i aria-hidden="true" /><strong>Memory + contour</strong><small>cosmic wake preserves fifths/register geography; the lower horizon shows attack time and physical rise/fall; broken wake needs release-proven silence</small></span>
          <span className="is-echo"><i aria-hidden="true" /><strong>Echo + possibilities</strong><small>dotted bridge = detected relationship-window return · hollow satellites = low-change in-route fields, never predictions</small></span>
        </div>
      </details>

    </section>
  );
});
