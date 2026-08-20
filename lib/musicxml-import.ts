/**
 * Browser-safe MusicXML / compressed MXL import.
 *
 * The parser is deliberately non-validating and never resolves a DTD, entity,
 * URL, or external resource. Uploaded bytes stay in the browser. The small XML
 * reader understands the structural subset needed by score-partwise MusicXML
 * and keeps score facts separate from later performance interpretations.
 */

import {
  normalizeSheetMusicScore,
  type MusicXmlStep,
  type SheetMusicScore,
  type SheetMusicScoreInput,
} from "./sheet-music-coach-model.ts";

const MAX_ARCHIVE_BYTES = 12 * 1024 * 1024;
const MAX_EXPANDED_BYTES = 16 * 1024 * 1024;
const MAX_ZIP_ENTRIES = 96;
const MAX_XML_NODES = 180_000;

export type MusicXmlHand = "left" | "right";

export type ImportedMusicXmlTuplet = {
  actual: number;
  normal: number;
};

export type ImportedMusicXmlFermata = {
  type: string | null;
  shape: string | null;
};

export type ImportedMusicXmlBeatGroup = {
  /** Additive numerators retain their grouping: 3+2/8 becomes [3, 2]. */
  beats: number[];
  beatType: number;
};

export type ImportedMusicXmlNote = {
  id: string;
  partId: string;
  measureIndex: number;
  measureNumber: string;
  onsetBeats: number;
  durationBeats: number;
  midi: number;
  step: string;
  alter: number;
  octave: number;
  voice: string;
  staff: number;
  hand: MusicXmlHand;
  chord: boolean;
  grace: boolean;
  tieStart: boolean;
  tieStop: boolean;
  slurStart: boolean;
  slurStop: boolean;
  arpeggiate: "up" | "down" | "unspecified" | null;
  fingering: number | null;
  noteType: string | null;
  dots: number;
  accidental: string | null;
  tuplet: ImportedMusicXmlTuplet | null;
  fermata: ImportedMusicXmlFermata | null;
};

export type ImportedMusicXmlRest = {
  id: string;
  partId: string;
  measureIndex: number;
  measureNumber: string;
  onsetBeats: number;
  durationBeats: number;
  voice: string;
  staff: number;
  measureRest: boolean;
  noteType: string | null;
  dots: number;
  tuplet: ImportedMusicXmlTuplet | null;
  fermata: ImportedMusicXmlFermata | null;
};

export type ImportedMusicXmlMoment = {
  id: string;
  onsetBeats: number;
  durationBeats: number;
  measureIndex: number;
  measureNumber: string;
  notes: ImportedMusicXmlNote[];
};

export type ImportedMusicXmlMeasure = {
  index: number;
  number: string;
  startBeats: number;
  durationBeats: number;
  implicit: boolean;
  keyFifths: number | null;
  keyMode: string | null;
  beats: number;
  beatType: number;
  timeSignatureDisplay: string;
  timeSignatureGroups: ImportedMusicXmlBeatGroup[];
};

export type ImportedMusicXmlDirection = {
  measureIndex: number;
  onsetBeats: number;
  staff: number | null;
  kind: "tempo" | "words" | "dynamic" | "wedge";
  text: string;
  tempoBpm: number | null;
};

export type ImportedMusicXmlScore = {
  schemaVersion: 1;
  title: string;
  composer: string | null;
  source: string | null;
  fileName: string;
  partNames: string[];
  measures: ImportedMusicXmlMeasure[];
  notes: ImportedMusicXmlNote[];
  rests: ImportedMusicXmlRest[];
  moments: ImportedMusicXmlMoment[];
  directions: ImportedMusicXmlDirection[];
  measureCount: number;
  totalBeats: number;
  tempoBpm: number | null;
  keyFifths: number | null;
  keyMode: string | null;
  timeSignature: { beats: number; beatType: number } | null;
  timeSignatureDisplay: string | null;
  timeSignatureGroups: ImportedMusicXmlBeatGroup[] | null;
  lowestMidi: number | null;
  highestMidi: number | null;
  hasExplicitFingerings: boolean;
};

type XmlNode = {
  name: string;
  attributes: Record<string, string>;
  children: XmlNode[];
  text: string;
};

function decodeXmlText(value: string) {
  return value.replace(/&(#x[\da-f]+|#\d+|amp|lt|gt|quot|apos);/gi, (entity, body: string) => {
    if (body === "amp") return "&";
    if (body === "lt") return "<";
    if (body === "gt") return ">";
    if (body === "quot") return '"';
    if (body === "apos") return "'";
    const radix = body.toLowerCase().startsWith("#x") ? 16 : 10;
    const codePoint = Number.parseInt(body.slice(radix === 16 ? 2 : 1), radix);
    return Number.isFinite(codePoint) ? String.fromCodePoint(codePoint) : entity;
  });
}

function localName(name: string) {
  return name.split(":").at(-1)?.toLowerCase() ?? name.toLowerCase();
}

export function parseMusicXmlTree(xml: string) {
  if (xml.length > MAX_EXPANDED_BYTES) throw new Error("The MusicXML document is larger than the 16 MB safety limit.");
  const root: XmlNode = { name: "#document", attributes: {}, children: [], text: "" };
  const stack = [root];
  const tokens = xml.match(/<!\[CDATA\[[\s\S]*?\]\]>|<!--[\s\S]*?-->|<\?[\s\S]*?\?>|<!DOCTYPE[^>]*>|<\/?[^>]+>|[^<]+/g) ?? [];
  let nodeCount = 0;

  tokens.forEach((token) => {
    if (token.startsWith("<?") || token.startsWith("<!--") || token.startsWith("<!DOCTYPE")) return;
    if (token.startsWith("<![CDATA[")) {
      stack.at(-1)!.text += token.slice(9, -3);
      return;
    }
    if (!token.startsWith("<")) {
      stack.at(-1)!.text += decodeXmlText(token);
      return;
    }
    if (token.startsWith("</")) {
      const closing = localName(token.slice(2, -1).trim());
      if (stack.length <= 1 || stack.at(-1)!.name !== closing) throw new Error(`Malformed MusicXML near closing <${closing}>.`);
      stack.pop();
      return;
    }
    const selfClosing = /\/\s*>$/.test(token);
    const body = token.slice(1, selfClosing ? token.lastIndexOf("/") : -1).trim();
    const nameMatch = body.match(/^([^\s/>]+)/);
    if (!nameMatch) return;
    const name = localName(nameMatch[1]);
    const attributes: Record<string, string> = {};
    const attributeText = body.slice(nameMatch[0].length);
    const attributePattern = /([^\s=]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g;
    let match: RegExpExecArray | null;
    while ((match = attributePattern.exec(attributeText))) attributes[localName(match[1])] = decodeXmlText(match[2] ?? match[3] ?? "");
    const node: XmlNode = { name, attributes, children: [], text: "" };
    stack.at(-1)!.children.push(node);
    nodeCount += 1;
    if (nodeCount > MAX_XML_NODES) throw new Error("The MusicXML document contains too many elements to inspect safely.");
    if (!selfClosing) {
      if (stack.length >= 512) throw new Error("The MusicXML document is nested too deeply to inspect safely.");
      stack.push(node);
    }
  });

  if (stack.length !== 1) throw new Error(`Malformed MusicXML: <${stack.at(-1)!.name}> was not closed.`);
  const documentElement = root.children.find((node) => node.name !== "#text");
  if (!documentElement) throw new Error("The file does not contain an XML score.");
  return documentElement;
}

function children(node: XmlNode, name: string) {
  return node.children.filter((child) => child.name === name);
}

function child(node: XmlNode, name: string) {
  return node.children.find((candidate) => candidate.name === name) ?? null;
}

function descendants(node: XmlNode, name: string): XmlNode[] {
  return node.children.flatMap((candidate) => [
    ...(candidate.name === name ? [candidate] : []),
    ...descendants(candidate, name),
  ]);
}

function normalizedText(node: XmlNode | null): string {
  if (!node) return "";
  return [node.text, ...node.children.map((candidate) => normalizedText(candidate))]
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
}

function childText(node: XmlNode, name: string) {
  return normalizedText(child(node, name));
}

function finiteNumber(value: string, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function requiredPositiveDuration(node: XmlNode, divisions: number, context: string) {
  const raw = childText(node, "duration");
  const duration = Number(raw);
  if (!raw || !Number.isFinite(duration) || duration <= 0) {
    throw new Error(`${context} needs a positive MusicXML duration.`);
  }
  return duration / divisions;
}

function optionalOffsetBeats(node: XmlNode | null, divisions: number, context: string) {
  if (!node) return 0;
  const raw = normalizedText(node);
  const offset = Number(raw);
  if (!raw || !Number.isFinite(offset)) throw new Error(`${context} contains an invalid MusicXML offset.`);
  return offset / divisions;
}

type ParsedTimeSignature = {
  beats: number;
  beatType: number;
  quarterBeats: number;
  display: string;
  groups: ImportedMusicXmlBeatGroup[];
};

function cloneBeatGroups(groups: ImportedMusicXmlBeatGroup[]) {
  return groups.map((group) => ({ beats: [...group.beats], beatType: group.beatType }));
}

function parseTimeSignature(node: XmlNode, fallback: ParsedTimeSignature, measureNumber: string): ParsedTimeSignature {
  if (child(node, "senza-misura")) return { ...fallback, groups: cloneBeatGroups(fallback.groups) };
  const groups: ImportedMusicXmlBeatGroup[] = [];
  for (let index = 0; index < node.children.length; index += 1) {
    const candidate = node.children[index];
    if (candidate.name !== "beats") continue;
    const beatTypeNode = node.children.slice(index + 1).find((next) => next.name === "beats" || next.name === "beat-type");
    if (!beatTypeNode || beatTypeNode.name !== "beat-type") {
      throw new Error(`Measure ${measureNumber} contains an incomplete time signature.`);
    }
    const beatParts = normalizedText(candidate).split("+").map((part) => part.trim());
    const beats = beatParts.map(Number);
    const beatType = Number(normalizedText(beatTypeNode));
    if (!beats.length || beats.some((beat, partIndex) => !/^\d+$/.test(beatParts[partIndex]) || !Number.isInteger(beat) || beat <= 0)
      || !Number.isInteger(beatType) || beatType <= 0) {
      throw new Error(`Measure ${measureNumber} contains an unsupported time signature.`);
    }
    groups.push({ beats, beatType });
  }
  if (!groups.length) throw new Error(`Measure ${measureNumber} contains an unsupported time signature.`);
  const aggregateBeatType = Math.max(...groups.map((group) => group.beatType));
  const aggregateBeats = groups.reduce((sum, group) => (
    sum + group.beats.reduce((groupSum, beat) => groupSum + beat * (aggregateBeatType / group.beatType), 0)
  ), 0);
  const quarterBeats = groups.reduce((sum, group) => (
    sum + group.beats.reduce((groupSum, beat) => groupSum + beat * (4 / group.beatType), 0)
  ), 0);
  if (!Number.isInteger(aggregateBeats) || aggregateBeats < 1 || aggregateBeats > 32
    || ![1, 2, 4, 8, 16, 32, 64].includes(aggregateBeatType)
    || !Number.isFinite(quarterBeats) || quarterBeats <= 0) {
    throw new Error(`Measure ${measureNumber} contains a time signature outside this piano coach's supported range.`);
  }
  return {
    beats: aggregateBeats,
    beatType: aggregateBeatType,
    quarterBeats,
    display: groups.map((group) => `${group.beats.join("+")}/${group.beatType}`).join(" + "),
    groups: cloneBeatGroups(groups),
  };
}

function midiFromPitch(step: string, alter: number, octave: number) {
  const stepOffsets: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
  const pitch = (octave + 1) * 12 + (stepOffsets[step] ?? Number.NaN) + alter;
  if (!Number.isFinite(pitch) || !Number.isInteger(pitch) || pitch < 0 || pitch > 127) {
    throw new Error(`The score contains an unsupported piano pitch (${step}${alter ? alter : ""}${octave}).`);
  }
  return pitch;
}

function soundDivisions(node: XmlNode, fallback: number) {
  const specified = Number(node.attributes.divisions);
  return Number.isFinite(specified) && specified > 0 ? specified : fallback;
}

function soundTempo(node: XmlNode | null) {
  const tempo = Number(node?.attributes.tempo);
  return Number.isFinite(tempo) && tempo > 0 ? tempo : null;
}

function directionFromNode(node: XmlNode, measureIndex: number, cursorBeats: number, divisions: number): ImportedMusicXmlDirection[] {
  const staffValue = Number(childText(node, "staff"));
  const staff = Number.isInteger(staffValue) && staffValue > 0 ? staffValue : null;
  const directionOffset = optionalOffsetBeats(child(node, "offset"), divisions, `Direction in measure ${measureIndex + 1}`);
  const directionOnset = cursorBeats + directionOffset;
  const soundNode = descendants(node, "sound").find((sound) => soundTempo(sound) != null) ?? null;
  const playbackTempo = soundTempo(soundNode);
  const soundOffsetNode = soundNode ? child(soundNode, "offset") : null;
  const tempoOnset = soundOffsetNode
    ? cursorBeats + optionalOffsetBeats(soundOffsetNode, soundDivisions(soundNode!, divisions), `Tempo in measure ${measureIndex + 1}`)
    : directionOnset;
  const metronome = descendants(node, "metronome")[0] ?? null;
  const perMinute = metronome ? Number(childText(metronome, "per-minute")) : Number.NaN;
  const unitQuarterBeats: Record<string, number> = {
    maxima: 32, long: 16, breve: 8, whole: 4, half: 2, quarter: 1, eighth: 0.5,
    "16th": 0.25, "32nd": 0.125, "64th": 0.0625, "128th": 0.03125,
    "256th": 0.015625, "512th": 0.0078125, "1024th": 0.00390625,
  };
  const beatUnit = metronome ? childText(metronome, "beat-unit").toLowerCase() : "quarter";
  const dotCount = metronome ? children(metronome, "beat-unit-dot").length : 0;
  const dotFactor = 2 - 1 / 2 ** dotCount;
  const metronomeTempo = Number.isFinite(perMinute) && perMinute > 0 && unitQuarterBeats[beatUnit] != null
    ? perMinute * unitQuarterBeats[beatUnit] * dotFactor
    : null;
  const tempo = playbackTempo ?? metronomeTempo;
  const result: ImportedMusicXmlDirection[] = [];
  if (tempo != null) result.push({ measureIndex, onsetBeats: playbackTempo != null ? tempoOnset : directionOnset, staff, kind: "tempo", text: `${tempo} BPM`, tempoBpm: tempo });
  descendants(node, "words").forEach((words) => {
    const text = normalizedText(words);
    if (text) result.push({ measureIndex, onsetBeats: directionOnset, staff, kind: "words", text, tempoBpm: null });
  });
  descendants(node, "dynamics").forEach((dynamics) => {
    const mark = dynamics.children[0]?.name;
    if (mark) result.push({ measureIndex, onsetBeats: directionOnset, staff, kind: "dynamic", text: mark, tempoBpm: null });
  });
  descendants(node, "wedge").forEach((wedge) => {
    const text = wedge.attributes.type;
    if (text) result.push({ measureIndex, onsetBeats: directionOnset, staff, kind: "wedge", text, tempoBpm: null });
  });
  return result;
}

function directionFromStandaloneSound(node: XmlNode, measureIndex: number, cursorBeats: number, divisions: number): ImportedMusicXmlDirection[] {
  const tempo = soundTempo(node);
  if (tempo == null) return [];
  const onsetBeats = cursorBeats + optionalOffsetBeats(
    child(node, "offset"), soundDivisions(node, divisions), `Tempo in measure ${measureIndex + 1}`,
  );
  return [{ measureIndex, onsetBeats, staff: null, kind: "tempo", text: `${tempo} BPM`, tempoBpm: tempo }];
}

export function parseMusicXml(xml: string, fileName = "uploaded.musicxml"): ImportedMusicXmlScore {
  const root = parseMusicXmlTree(xml);
  if (root.name !== "score-partwise") throw new Error("This release reads score-partwise MusicXML. Export the score in that format and try again.");

  const title = childText(child(root, "work") ?? root, "work-title")
    || descendants(root, "credit-words").map(normalizedText).find(Boolean)
    || fileName.replace(/\.(mxl|musicxml|xml)$/i, "")
    || "Untitled score";
  const creators = descendants(root, "creator");
  const composer = normalizedText(creators.find((creator) => creator.attributes.type === "composer") ?? creators[0] ?? null) || null;
  const source = normalizedText(descendants(root, "source")[0] ?? null) || null;
  const partNamesById = new Map(children(child(root, "part-list") ?? root, "score-part").map((part) => [
    part.attributes.id,
    childText(part, "part-name") || part.attributes.id || "Part",
  ]));

  const notes: ImportedMusicXmlNote[] = [];
  const rests: ImportedMusicXmlRest[] = [];
  const directions: ImportedMusicXmlDirection[] = [];
  const measuresByIndex = new Map<number, ImportedMusicXmlMeasure>();
  const partNames: string[] = [];
  let globalTempo: number | null = null;
  let globalKeyFifths: number | null = null;
  let globalKeyMode: string | null = null;
  let globalTimeSignature: { beats: number; beatType: number } | null = null;
  let globalTimeSignatureDisplay: string | null = null;
  let globalTimeSignatureGroups: ImportedMusicXmlBeatGroup[] | null = null;

  children(root, "part").forEach((part, partIndex) => {
    const partId = part.attributes.id || `P${partIndex + 1}`;
    partNames.push(partNamesById.get(partId) ?? partId);
    let divisions = 1;
    let keyFifths: number | null = null;
    let keyMode: string | null = null;
    let activeTimeSignature: ParsedTimeSignature = {
      beats: 4,
      beatType: 4,
      quarterBeats: 4,
      display: "4/4",
      groups: [{ beats: [4], beatType: 4 }],
    };
    let partCursorBeats = 0;

    children(part, "measure").forEach((measureNode, measureIndex) => {
      const measureNumber = measureNode.attributes.number || String(measureIndex + 1);
      const implicit = measureNode.attributes.implicit === "yes";
      let cursorBeats = 0;
      let maximumCursorBeats = 0;
      let chordAnchorOnsetBeats: number | null = null;
      let noteOrdinal = 0;
      let measureKeyFifths = keyFifths;
      let measureKeyMode = keyMode;
      let measureTimeSignature: ParsedTimeSignature = {
        ...activeTimeSignature,
        groups: cloneBeatGroups(activeTimeSignature.groups),
      };

      measureNode.children.forEach((node) => {
        if (node.name === "attributes") {
          chordAnchorOnsetBeats = null;
          const divisionsText = childText(node, "divisions");
          if (divisionsText) {
            const nextDivisions = Number(divisionsText);
            if (!Number.isFinite(nextDivisions) || nextDivisions <= 0) {
              throw new Error(`Measure ${measureNumber} contains invalid MusicXML divisions.`);
            }
            divisions = nextDivisions;
          }
          const key = child(node, "key");
          if (key) {
            const fifthsText = childText(key, "fifths");
            const fifths = Number(fifthsText);
            if (fifthsText && !Number.isInteger(fifths)) throw new Error(`Measure ${measureNumber} contains invalid key-signature fifths.`);
            if (fifthsText) keyFifths = fifths;
            keyMode = childText(key, "mode") || null;
            if (Math.abs(cursorBeats) <= 1e-7) {
              measureKeyFifths = keyFifths;
              measureKeyMode = keyMode;
            }
          }
          const time = child(node, "time");
          if (time) {
            activeTimeSignature = parseTimeSignature(time, activeTimeSignature, measureNumber);
            if (Math.abs(cursorBeats) <= 1e-7) {
              measureTimeSignature = {
                ...activeTimeSignature,
                groups: cloneBeatGroups(activeTimeSignature.groups),
              };
            }
          }
          return;
        }
        if (node.name === "backup") {
          chordAnchorOnsetBeats = null;
          const amount = requiredPositiveDuration(node, divisions, `Backup in measure ${measureNumber}`);
          if (amount > cursorBeats + 1e-7) throw new Error(`A backup in measure ${measureNumber} moves before the start of the measure.`);
          cursorBeats = Math.max(0, cursorBeats - amount);
          return;
        }
        if (node.name === "forward") {
          chordAnchorOnsetBeats = null;
          cursorBeats += requiredPositiveDuration(node, divisions, `Forward in measure ${measureNumber}`);
          maximumCursorBeats = Math.max(maximumCursorBeats, cursorBeats);
          return;
        }
        if (node.name === "direction") {
          chordAnchorOnsetBeats = null;
          const found = directionFromNode(node, measureIndex, partCursorBeats + cursorBeats, divisions);
          directions.push(...found);
          globalTempo ??= found.find((item) => item.tempoBpm != null)?.tempoBpm ?? null;
          return;
        }
        if (node.name === "sound") {
          chordAnchorOnsetBeats = null;
          const found = directionFromStandaloneSound(node, measureIndex, partCursorBeats + cursorBeats, divisions);
          directions.push(...found);
          globalTempo ??= found.find((item) => item.tempoBpm != null)?.tempoBpm ?? null;
          return;
        }
        if (node.name !== "note") {
          chordAnchorOnsetBeats = null;
          return;
        }

        const isChord = child(node, "chord") != null;
        const grace = child(node, "grace") != null;
        const durationText = childText(node, "duration");
        const durationBeats = grace && !durationText
          ? 0
          : requiredPositiveDuration(node, divisions, `Note in measure ${measureNumber}`);
        if (isChord && chordAnchorOnsetBeats == null) throw new Error(`Measure ${measureNumber} contains a chord note without a preceding anchor note.`);
        const onsetWithinMeasure = isChord ? chordAnchorOnsetBeats! : cursorBeats;
        if (!isChord) chordAnchorOnsetBeats = cursorBeats;
        const onsetBeats = partCursorBeats + onsetWithinMeasure;
        const voice = childText(node, "voice") || "1";
        const staffValue = Number(childText(node, "staff"));
        const staff = Number.isInteger(staffValue) && staffValue > 0 ? staffValue : 1;
        const id = `${partId}:m${measureIndex}:n${noteOrdinal}`;
        noteOrdinal += 1;
        const rest = child(node, "rest");
        const timeModification = child(node, "time-modification");
        const actual = timeModification ? Number(childText(timeModification, "actual-notes")) : Number.NaN;
        const normal = timeModification ? Number(childText(timeModification, "normal-notes")) : Number.NaN;
        const tuplet = Number.isInteger(actual) && actual > 0 && Number.isInteger(normal) && normal > 0 ? { actual, normal } : null;
        const fermataNode = descendants(node, "fermata")[0] ?? null;
        const fermata = fermataNode ? {
          type: fermataNode.attributes.type || null,
          shape: normalizedText(fermataNode) || null,
        } : null;
        const noteType = childText(node, "type") || null;
        const dots = children(node, "dot").length;
        if (rest) {
          rests.push({
            id, partId, measureIndex, measureNumber, onsetBeats, durationBeats, voice, staff,
            measureRest: rest.attributes.measure === "yes", noteType, dots, tuplet, fermata,
          });
        } else {
          const pitch = child(node, "pitch");
          if (!pitch) throw new Error(`Measure ${measureNumber} contains a note without pitch or rest data.`);
          const step = childText(pitch, "step").toUpperCase();
          const alter = finiteNumber(childText(pitch, "alter"));
          const octave = Number(childText(pitch, "octave"));
          const tieTypes = children(node, "tie").map((tie) => tie.attributes.type);
          const tiedTypes = descendants(node, "tied").map((tie) => tie.attributes.type);
          const slurTypes = descendants(node, "slur").map((slur) => slur.attributes.type);
          const arpeggiateNode = descendants(node, "arpeggiate")[0] ?? null;
          const arpeggiateDirection = arpeggiateNode?.attributes.direction;
          const fingeringText = normalizedText(descendants(node, "fingering")[0] ?? null);
          const fingeringValue = Number(fingeringText);
          notes.push({
            id,
            partId,
            measureIndex,
            measureNumber,
            onsetBeats,
            durationBeats,
            midi: midiFromPitch(step, alter, octave),
            step,
            alter,
            octave,
            voice,
            staff,
            hand: staff > 1 ? "left" : "right",
            chord: isChord,
            grace,
            tieStart: tieTypes.includes("start") || tiedTypes.includes("start"),
            tieStop: tieTypes.includes("stop") || tiedTypes.includes("stop"),
            slurStart: slurTypes.includes("start"),
            slurStop: slurTypes.includes("stop"),
            arpeggiate: arpeggiateNode
              ? arpeggiateDirection === "up" || arpeggiateDirection === "down" ? arpeggiateDirection : "unspecified"
              : null,
            fingering: Number.isInteger(fingeringValue) && fingeringValue >= 1 && fingeringValue <= 5 ? fingeringValue : null,
            noteType,
            dots,
            accidental: childText(node, "accidental") || null,
            tuplet,
            fermata,
          });
        }
        if (!isChord && !grace) cursorBeats += durationBeats;
        maximumCursorBeats = Math.max(maximumCursorBeats, onsetWithinMeasure + durationBeats, cursorBeats);
      });

      const nominalMeasureBeats = measureTimeSignature.quarterBeats;
      const durationBeats = implicit ? maximumCursorBeats : Math.max(maximumCursorBeats, nominalMeasureBeats);
      if (partIndex === 0) {
        measuresByIndex.set(measureIndex, {
          index: measureIndex,
          number: measureNumber,
          startBeats: partCursorBeats,
          durationBeats,
          implicit,
          keyFifths: measureKeyFifths,
          keyMode: measureKeyMode,
          beats: measureTimeSignature.beats,
          beatType: measureTimeSignature.beatType,
          timeSignatureDisplay: measureTimeSignature.display,
          timeSignatureGroups: cloneBeatGroups(measureTimeSignature.groups),
        });
        globalKeyFifths ??= measureKeyFifths;
        globalKeyMode ??= measureKeyMode;
        globalTimeSignature ??= { beats: measureTimeSignature.beats, beatType: measureTimeSignature.beatType };
        globalTimeSignatureDisplay ??= measureTimeSignature.display;
        globalTimeSignatureGroups ??= cloneBeatGroups(measureTimeSignature.groups);
      }
      partCursorBeats += durationBeats;
    });
  });

  if (!notes.length) throw new Error("The score does not contain pitched notes to practice.");
  const attackNotes = notes.filter((note) => !note.tieStop);
  const momentGroups = new Map<string, ImportedMusicXmlNote[]>();
  attackNotes.forEach((note) => {
    const key = note.onsetBeats.toFixed(6);
    const group = momentGroups.get(key) ?? [];
    group.push(note);
    momentGroups.set(key, group);
  });
  const moments = [...momentGroups.values()]
    .map((group) => {
      const sorted = [...group].sort((first, second) => first.midi - second.midi || first.id.localeCompare(second.id));
      const first = sorted[0];
      return {
        id: `beat:${first.onsetBeats.toFixed(6)}`,
        onsetBeats: first.onsetBeats,
        durationBeats: Math.max(...sorted.map((note) => note.durationBeats)),
        measureIndex: first.measureIndex,
        measureNumber: first.measureNumber,
        notes: sorted,
      } satisfies ImportedMusicXmlMoment;
    })
    .sort((first, second) => first.onsetBeats - second.onsetBeats || first.id.localeCompare(second.id));
  const measures = [...measuresByIndex.values()].sort((first, second) => first.index - second.index);
  const lowestMidi = Math.min(...notes.map((note) => note.midi));
  const highestMidi = Math.max(...notes.map((note) => note.midi));
  const totalBeats = Math.max(
    ...notes.map((note) => note.onsetBeats + note.durationBeats),
    ...rests.map((rest) => rest.onsetBeats + rest.durationBeats),
    ...measures.map((measure) => measure.startBeats + measure.durationBeats),
  );

  return {
    schemaVersion: 1,
    title,
    composer,
    source,
    fileName,
    partNames,
    measures,
    notes,
    rests,
    moments,
    directions: directions.sort((first, second) => first.onsetBeats - second.onsetBeats),
    measureCount: measures.length,
    totalBeats,
    tempoBpm: globalTempo,
    keyFifths: globalKeyFifths,
    keyMode: globalKeyMode,
    timeSignature: globalTimeSignature,
    timeSignatureDisplay: globalTimeSignatureDisplay,
    timeSignatureGroups: globalTimeSignatureGroups,
    lowestMidi,
    highestMidi,
    hasExplicitFingerings: notes.some((note) => note.fingering != null),
  };
}

type ZipEntry = {
  name: string;
  flags: number;
  method: number;
  crc32: number;
  compressedSize: number;
  uncompressedSize: number;
  localOffset: number;
};

function safeZipPath(name: string) {
  return !name.startsWith("/") && !name.startsWith("\\") && !name.split(/[\\/]+/).includes("..");
}

function zipEntries(bytes: Uint8Array) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let endOffset = -1;
  let entryCount = 0;
  let centralOffset = 0;
  let centralSize = 0;
  const earliest = Math.max(0, bytes.length - 65_557);
  for (let offset = bytes.length - 22; offset >= earliest; offset -= 1) {
    if (view.getUint32(offset, true) !== 0x06054b50) continue;
    const commentLength = view.getUint16(offset + 20, true);
    const diskNumber = view.getUint16(offset + 4, true);
    const centralDisk = view.getUint16(offset + 6, true);
    const diskEntries = view.getUint16(offset + 8, true);
    const totalEntries = view.getUint16(offset + 10, true);
    const candidateCentralSize = view.getUint32(offset + 12, true);
    const candidateCentralOffset = view.getUint32(offset + 16, true);
    if (offset + 22 + commentLength !== bytes.length
      || diskNumber !== 0 || centralDisk !== 0 || diskEntries !== totalEntries
      || candidateCentralOffset + candidateCentralSize !== offset) continue;
    endOffset = offset;
    entryCount = totalEntries;
    centralOffset = candidateCentralOffset;
    centralSize = candidateCentralSize;
    break;
  }
  if (endOffset < 0) throw new Error("The MXL archive has no readable central directory.");
  if (entryCount > MAX_ZIP_ENTRIES) throw new Error(`The MXL archive contains more than ${MAX_ZIP_ENTRIES} files.`);
  const decoder = new TextDecoder();
  const result: ZipEntry[] = [];
  const names = new Set<string>();
  let cursor = centralOffset;
  let expandedTotal = 0;
  const centralEnd = centralOffset + centralSize;
  for (let index = 0; index < entryCount; index += 1) {
    if (cursor + 46 > centralEnd || view.getUint32(cursor, true) !== 0x02014b50) throw new Error("The MXL archive directory is malformed.");
    const flags = view.getUint16(cursor + 8, true);
    const method = view.getUint16(cursor + 10, true);
    const crc32 = view.getUint32(cursor + 16, true);
    const compressedSize = view.getUint32(cursor + 20, true);
    const uncompressedSize = view.getUint32(cursor + 24, true);
    const nameLength = view.getUint16(cursor + 28, true);
    const extraLength = view.getUint16(cursor + 30, true);
    const commentLength = view.getUint16(cursor + 32, true);
    const localOffset = view.getUint32(cursor + 42, true);
    const nameEnd = cursor + 46 + nameLength;
    const entryEnd = nameEnd + extraLength + commentLength;
    if (nameEnd > centralEnd || entryEnd > centralEnd) throw new Error("The MXL archive contains a truncated directory entry.");
    const name = decoder.decode(bytes.subarray(cursor + 46, nameEnd));
    if (!safeZipPath(name)) throw new Error("The MXL archive contains an unsafe file path.");
    if (names.has(name)) throw new Error(`The MXL archive contains a duplicate file name (${name}).`);
    names.add(name);
    if (flags & 0x1) throw new Error("Encrypted MXL archives are not supported.");
    if (method !== 0 && method !== 8) throw new Error(`The MXL archive uses unsupported compression method ${method}.`);
    expandedTotal += uncompressedSize;
    if (expandedTotal > MAX_EXPANDED_BYTES) throw new Error("The expanded MXL archive exceeds the 16 MB safety limit.");
    result.push({ name, flags, method, crc32, compressedSize, uncompressedSize, localOffset });
    cursor = entryEnd;
  }
  if (cursor !== centralEnd) throw new Error("The MXL archive directory size does not match its entries.");
  return result;
}

function crc32(bytes: Uint8Array) {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

async function extractZipEntry(archive: Uint8Array, entry: ZipEntry) {
  const view = new DataView(archive.buffer, archive.byteOffset, archive.byteLength);
  if (entry.localOffset + 30 > archive.length || view.getUint32(entry.localOffset, true) !== 0x04034b50) throw new Error(`The MXL entry ${entry.name} has no valid local header.`);
  const localFlags = view.getUint16(entry.localOffset + 6, true);
  const localMethod = view.getUint16(entry.localOffset + 8, true);
  const nameLength = view.getUint16(entry.localOffset + 26, true);
  const extraLength = view.getUint16(entry.localOffset + 28, true);
  const nameStart = entry.localOffset + 30;
  const nameEnd = nameStart + nameLength;
  if (nameEnd > archive.length) throw new Error(`The MXL entry ${entry.name} has a truncated local file name.`);
  const localName = new TextDecoder().decode(archive.subarray(nameStart, nameEnd));
  if (localName !== entry.name || localFlags !== entry.flags || localMethod !== entry.method) {
    throw new Error(`The MXL entry ${entry.name} disagrees with its central directory record.`);
  }
  const start = entry.localOffset + 30 + nameLength + extraLength;
  const end = start + entry.compressedSize;
  if (end > archive.length) throw new Error(`The MXL entry ${entry.name} is truncated.`);
  let result: Uint8Array;
  if (entry.method === 0) result = archive.slice(start, end);
  else {
    if (typeof DecompressionStream === "undefined") throw new Error("This browser cannot decompress MXL yet. Export uncompressed MusicXML (.musicxml or .xml) and upload that instead.");
    try {
      const stream = new Blob([archive.slice(start, end).buffer]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
      const reader = stream.getReader();
      const chunks: Uint8Array[] = [];
      let expanded = 0;
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = value instanceof Uint8Array ? value : new Uint8Array(value);
        expanded += chunk.length;
        if (expanded > entry.uncompressedSize || expanded > MAX_EXPANDED_BYTES) {
          await reader.cancel();
          throw new Error(`The compressed score entry ${entry.name} expanded beyond its declared safety bound.`);
        }
        chunks.push(chunk);
      }
      result = new Uint8Array(expanded);
      let writeOffset = 0;
      chunks.forEach((chunk) => { result.set(chunk, writeOffset); writeOffset += chunk.length; });
    } catch {
      throw new Error(`The compressed score entry ${entry.name} could not be expanded.`);
    }
  }
  if (result.length !== entry.uncompressedSize || crc32(result) !== entry.crc32) throw new Error(`The MXL entry ${entry.name} failed its integrity check.`);
  return result;
}

export async function musicXmlTextFromBytes(bytes: Uint8Array, fileName: string) {
  if (!bytes.length) throw new Error("The selected score file is empty.");
  if (bytes.length > MAX_ARCHIVE_BYTES) throw new Error("The selected file is larger than the 12 MB upload limit.");
  const looksZipped = bytes.length >= 4 && new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(0, true) === 0x04034b50;
  if (!looksZipped) {
    try { return new TextDecoder("utf-8", { fatal: true }).decode(bytes); }
    catch { throw new Error(`${fileName} is not valid UTF-8 MusicXML.`); }
  }
  const entries = zipEntries(bytes);
  const byName = new Map(entries.map((entry) => [entry.name, entry]));
  const container = byName.get("META-INF/container.xml");
  let scorePath: string | null = null;
  if (container) {
    const containerText = new TextDecoder().decode(await extractZipEntry(bytes, container));
    const containerRoot = parseMusicXmlTree(containerText);
    scorePath = descendants(containerRoot, "rootfile")[0]?.attributes["full-path"] ?? null;
  }
  const scoreEntry = (scorePath ? byName.get(scorePath) : null)
    ?? entries.find((entry) => /\.(musicxml|xml)$/i.test(entry.name) && !entry.name.startsWith("META-INF/"));
  if (!scoreEntry) throw new Error("The MXL archive does not point to a MusicXML score.");
  return new TextDecoder("utf-8", { fatal: true }).decode(await extractZipEntry(bytes, scoreEntry));
}

export async function importMusicXmlFile(file: File) {
  const lowerName = file.name.toLowerCase();
  if (!lowerName.endsWith(".mxl") && !lowerName.endsWith(".musicxml") && !lowerName.endsWith(".xml")) {
    throw new Error("Choose a .mxl, .musicxml, or .xml score file.");
  }
  if (file.size === 0) throw new Error("The selected score file is empty.");
  if (file.size > MAX_ARCHIVE_BYTES) throw new Error("The selected file is larger than the 12 MB upload limit.");
  const bytes = new Uint8Array(await file.arrayBuffer());
  const xml = await musicXmlTextFromBytes(bytes, file.name);
  return { xml, score: parseMusicXml(xml, file.name) };
}

/** Convert preserved MusicXML evidence into the bounded live-coaching model. */
export function normalizeImportedMusicXmlScore(imported: ImportedMusicXmlScore): SheetMusicScore {
  const notesByMeasure = new Map<number, ImportedMusicXmlNote[]>();
  for (const note of imported.notes) {
    if (note.grace) continue;
    const grouped = notesByMeasure.get(note.measureIndex) ?? [];
    grouped.push(note);
    notesByMeasure.set(note.measureIndex, grouped);
  }
  const restsByMeasure = new Map<number, ImportedMusicXmlRest[]>();
  for (const rest of imported.rests) {
    if (rest.durationBeats <= 0) continue;
    const grouped = restsByMeasure.get(rest.measureIndex) ?? [];
    grouped.push(rest);
    restsByMeasure.set(rest.measureIndex, grouped);
  }
  const measures: SheetMusicScoreInput["measures"] = imported.measures.map((measure) => {
    const measureNotes = notesByMeasure.get(measure.index) ?? [];
    const measureRests = restsByMeasure.get(measure.index) ?? [];
    return {
      id: `measure-${measure.index + 1}`,
      number: measure.number,
      durationBeats: measure.durationBeats,
      timeSignature: { beats: measure.beats, beatType: measure.beatType },
      events: [
        ...measureNotes.map((note) => ({
          kind: "note" as const,
          id: note.id,
          offsetBeats: note.onsetBeats - measure.startBeats,
          durationBeats: note.durationBeats,
          staff: note.staff,
          voice: `${note.partId}:${note.voice}`,
          hand: note.hand,
          midi: note.midi,
          pitch: { step: note.step as MusicXmlStep, alter: note.alter, octave: note.octave },
          tie: { start: note.tieStart, stop: note.tieStop },
          fingering: note.fingering ?? undefined,
          arpeggiate: note.arpeggiate ?? undefined,
        })),
        ...measureRests.map((rest) => ({
          kind: "rest" as const,
          id: rest.id,
          offsetBeats: rest.onsetBeats - measure.startBeats,
          durationBeats: rest.durationBeats,
          staff: rest.staff,
          voice: `${rest.partId}:${rest.voice}`,
          hand: rest.staff > 1 ? "left" as const : "right" as const,
          measureRest: rest.measureRest,
        })),
      ],
    };
  });
  const tempoChanges = imported.directions
    .filter((direction): direction is ImportedMusicXmlDirection & { tempoBpm: number } => direction.tempoBpm != null)
    .map((direction) => ({ beat: direction.onsetBeats, bpm: direction.tempoBpm }));
  const idStem = imported.fileName.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "").slice(0, 100).toLowerCase() || "score";
  return normalizeSheetMusicScore({
    id: `musicxml-${idStem}-${imported.notes.length}`,
    title: imported.title.slice(0, 240),
    composer: imported.composer?.slice(0, 240),
    sourceName: imported.fileName.slice(0, 240),
    tempoBpm: imported.tempoBpm ?? 72,
    timeSignature: imported.timeSignature ?? { beats: 4, beatType: 4 },
    keyFifths: imported.keyFifths,
    tempoChanges,
    measures,
  });
}

/** An original, project-authored score for trying the importer without sharing a copyrighted song. */
export const ORBIT_STUDY_MUSICXML = `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="3.1"><work><work-title>Orbit Study</work-title></work><identification><creator type="composer">Music With No Names</creator></identification><part-list><score-part id="P1"><part-name>Piano</part-name></score-part></part-list><part id="P1">
<measure number="1"><attributes><divisions>4</divisions><key><fifths>0</fifths><mode>major</mode></key><time><beats>4</beats><beat-type>4</beat-type></time><staves>2</staves><clef number="1"><sign>G</sign><line>2</line></clef><clef number="2"><sign>F</sign><line>4</line></clef></attributes><direction><direction-type><metronome><beat-unit>quarter</beat-unit><per-minute>72</per-minute></metronome></direction-type><sound tempo="72"/></direction><note><pitch><step>C</step><octave>5</octave></pitch><duration>4</duration><voice>1</voice><type>quarter</type><staff>1</staff></note><note><pitch><step>D</step><octave>5</octave></pitch><duration>4</duration><voice>1</voice><type>quarter</type><staff>1</staff></note><note><pitch><step>E</step><octave>5</octave></pitch><duration>4</duration><voice>1</voice><type>quarter</type><staff>1</staff></note><note><pitch><step>G</step><octave>5</octave></pitch><duration>4</duration><voice>1</voice><type>quarter</type><staff>1</staff></note><backup><duration>16</duration></backup><note><pitch><step>C</step><octave>3</octave></pitch><duration>16</duration><voice>5</voice><type>whole</type><staff>2</staff></note><note><chord/><pitch><step>G</step><octave>3</octave></pitch><duration>16</duration><voice>5</voice><type>whole</type><staff>2</staff></note></measure>
<measure number="2"><note><pitch><step>A</step><octave>5</octave></pitch><duration>8</duration><voice>1</voice><type>half</type><staff>1</staff></note><note><pitch><step>G</step><octave>5</octave></pitch><duration>4</duration><voice>1</voice><type>quarter</type><staff>1</staff></note><note><pitch><step>E</step><octave>5</octave></pitch><duration>4</duration><voice>1</voice><type>quarter</type><staff>1</staff></note><backup><duration>16</duration></backup><note><pitch><step>F</step><octave>3</octave></pitch><duration>16</duration><voice>5</voice><type>whole</type><staff>2</staff></note><note><chord/><pitch><step>C</step><octave>4</octave></pitch><duration>16</duration><voice>5</voice><type>whole</type><staff>2</staff></note></measure>
<measure number="3"><note><pitch><step>D</step><octave>5</octave></pitch><duration>4</duration><voice>1</voice><type>quarter</type><staff>1</staff></note><note><pitch><step>E</step><octave>5</octave></pitch><duration>4</duration><voice>1</voice><type>quarter</type><staff>1</staff></note><note><pitch><step>G</step><octave>5</octave></pitch><duration>4</duration><voice>1</voice><type>quarter</type><staff>1</staff></note><note><pitch><step>A</step><octave>5</octave></pitch><duration>4</duration><voice>1</voice><type>quarter</type><staff>1</staff></note><backup><duration>16</duration></backup><note><pitch><step>G</step><octave>2</octave></pitch><duration>16</duration><voice>5</voice><type>whole</type><staff>2</staff></note><note><chord/><pitch><step>D</step><octave>3</octave></pitch><duration>16</duration><voice>5</voice><type>whole</type><staff>2</staff></note></measure>
<measure number="4"><note><pitch><step>G</step><octave>5</octave></pitch><duration>4</duration><voice>1</voice><type>quarter</type><staff>1</staff></note><note><pitch><step>E</step><octave>5</octave></pitch><duration>4</duration><voice>1</voice><type>quarter</type><staff>1</staff></note><note><pitch><step>D</step><octave>5</octave></pitch><duration>4</duration><voice>1</voice><type>quarter</type><staff>1</staff></note><note><pitch><step>C</step><octave>5</octave></pitch><duration>4</duration><voice>1</voice><type>quarter</type><staff>1</staff></note><backup><duration>16</duration></backup><note><pitch><step>C</step><octave>3</octave></pitch><duration>16</duration><voice>5</voice><type>whole</type><staff>2</staff></note><note><chord/><pitch><step>G</step><octave>3</octave></pitch><duration>16</duration><voice>5</voice><type>whole</type><staff>2</staff></note></measure>
</part></score-partwise>`;
