import assert from "node:assert/strict";
import test from "node:test";
import { deflateRawSync } from "node:zlib";

import {
  ORBIT_STUDY_MUSICXML,
  importMusicXmlFile,
  musicXmlTextFromBytes,
  normalizeImportedMusicXmlScore,
  parseMusicXml,
  parseMusicXmlTree,
} from "../lib/musicxml-import.ts";
import { selectSheetMusicLoop } from "../lib/sheet-music-coach-model.ts";

const encoder = new TextEncoder();

function fixtureCrc32(bytes: Uint8Array) {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function concatenate(parts: Uint8Array[]) {
  const result = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0));
  let offset = 0;
  parts.forEach((part) => { result.set(part, offset); offset += part.length; });
  return result;
}

type FixtureZipEntry = {
  name: string;
  text: string;
  method?: 0 | 8;
  declaredCrc32?: number;
  declaredSize?: number;
};

function fixtureZip(entries: FixtureZipEntry[], comment = new Uint8Array()) {
  const locals: Uint8Array[] = [];
  const centralRecords: Uint8Array[] = [];
  let localOffset = 0;
  entries.forEach((entry) => {
    const name = encoder.encode(entry.name);
    const source = encoder.encode(entry.text);
    const method = entry.method ?? 8;
    const compressed = method === 8 ? new Uint8Array(deflateRawSync(source)) : source;
    const crc = entry.declaredCrc32 ?? fixtureCrc32(source);
    const declaredSize = entry.declaredSize ?? source.length;
    const flags = 0x0800;
    const local = new Uint8Array(30 + name.length + compressed.length);
    const localView = new DataView(local.buffer);
    localView.setUint32(0, 0x04034b50, true);
    localView.setUint16(4, 20, true);
    localView.setUint16(6, flags, true);
    localView.setUint16(8, method, true);
    localView.setUint32(14, crc, true);
    localView.setUint32(18, compressed.length, true);
    localView.setUint32(22, declaredSize, true);
    localView.setUint16(26, name.length, true);
    local.set(name, 30);
    local.set(compressed, 30 + name.length);
    locals.push(local);

    const central = new Uint8Array(46 + name.length);
    const centralView = new DataView(central.buffer);
    centralView.setUint32(0, 0x02014b50, true);
    centralView.setUint16(4, 20, true);
    centralView.setUint16(6, 20, true);
    centralView.setUint16(8, flags, true);
    centralView.setUint16(10, method, true);
    centralView.setUint32(16, crc, true);
    centralView.setUint32(20, compressed.length, true);
    centralView.setUint32(24, declaredSize, true);
    centralView.setUint16(28, name.length, true);
    centralView.setUint32(42, localOffset, true);
    central.set(name, 46);
    centralRecords.push(central);
    localOffset += local.length;
  });
  const central = concatenate(centralRecords);
  const end = new Uint8Array(22 + comment.length);
  const endView = new DataView(end.buffer);
  endView.setUint32(0, 0x06054b50, true);
  endView.setUint16(8, entries.length, true);
  endView.setUint16(10, entries.length, true);
  endView.setUint32(12, central.length, true);
  endView.setUint32(16, localOffset, true);
  endView.setUint16(20, comment.length, true);
  end.set(comment, 22);
  return concatenate([...locals, central, end]);
}

const TEST_CONTAINER = `<?xml version="1.0" encoding="UTF-8"?>
<container xmlns="urn:oasis:names:tc:opendocument:xmlns:container"><rootfiles>
  <rootfile full-path="score.musicxml" media-type="application/vnd.recordare.musicxml+xml"/>
</rootfiles></container>`;

const TIE_AND_TEMPO_SCORE = `<?xml version="1.0"?>
<!DOCTYPE score-partwise PUBLIC "-//Recordare//DTD MusicXML 3.1 Partwise//EN" "http://www.musicxml.org/dtds/partwise.dtd">
<score-partwise version="3.1">
  <work><work-title>Boundary study</work-title></work>
  <part-list><score-part id="P1"><part-name>Piano</part-name></score-part></part-list>
  <part id="P1">
    <measure number="1">
      <attributes><divisions>4</divisions><key><fifths>2</fifths></key><time><beats>4</beats><beat-type>4</beat-type></time></attributes>
      <direction><direction-type><metronome><beat-unit>eighth</beat-unit><beat-unit-dot/><per-minute>80</per-minute></metronome></direction-type></direction>
      <note><pitch><step>F</step><alter>1</alter><octave>4</octave></pitch><duration>16</duration><tie type="start"/><voice>1</voice><staff>1</staff><notations><tied type="start"/><slur type="start" number="1"/></notations></note>
    </measure>
    <measure number="2">
      <note><pitch><step>F</step><alter>1</alter><octave>4</octave></pitch><duration>4</duration><tie type="stop"/><voice>1</voice><staff>1</staff><notations><tied type="stop"/><slur type="stop" number="1"/></notations></note>
      <note><pitch><step>G</step><octave>4</octave></pitch><duration>4</duration><voice>1</voice><staff>1</staff><notations><arpeggiate direction="up"/><technical><fingering>3</fingering></technical></notations></note>
    </measure>
  </part>
</score-partwise>`;

test("the original demo preserves written evidence and merges simultaneous staves", () => {
  const imported = parseMusicXml(ORBIT_STUDY_MUSICXML, "orbit-study.musicxml");
  assert.equal(imported.title, "Orbit Study");
  assert.equal(imported.composer, "Music With No Names");
  assert.equal(imported.measureCount, 4);
  assert.equal(imported.notes.length, 23);
  assert.equal(imported.moments.length, 15);
  assert.equal(imported.tempoBpm, 72);
  assert.deepEqual(imported.timeSignature, { beats: 4, beatType: 4 });
  assert.deepEqual(imported.moments[0].notes.map((note) => note.midi), [48, 55, 72]);
  assert.deepEqual(imported.moments[0].notes.map((note) => note.staff), [2, 2, 1]);

  const normalized = normalizeImportedMusicXmlScore(imported);
  assert.equal(normalized.attacks.length, 15);
  assert.equal(normalized.measures[1].startBeat, 4);
  assert.equal(normalized.measures[1].events[0].offsetBeats, 0);
});

test("ties remain sustains, loop boundaries become explicit re-attacks, and dotted tempo is normalized", () => {
  const imported = parseMusicXml(TIE_AND_TEMPO_SCORE, "boundary.musicxml");
  assert.equal(imported.tempoBpm, 60);
  assert.equal(imported.keyFifths, 2);
  assert.equal(imported.keyMode, null);
  assert.equal(imported.moments.length, 2, "a tie continuation is not a new attack moment");
  assert.equal(imported.notes[1].onsetBeats, 4);
  assert.equal(imported.notes[2].onsetBeats, 5);
  assert.equal(imported.notes[2].fingering, 3);
  assert.equal(imported.notes[2].arpeggiate, "up");

  const normalized = normalizeImportedMusicXmlScore(imported);
  assert.equal(normalized.attacks.length, 2);
  assert.equal(normalized.attacks[0].soundingDurationBeats, 5);
  assert.equal(normalized.measures[1].events[0].offsetBeats, 0);
  assert.equal(normalized.measures[1].events[1].offsetBeats, 1);
  assert.equal(normalized.measures[1].events[0].kind, "note");
  assert.equal(normalized.measures[1].events[0].kind === "note" && normalized.measures[1].events[0].isAttack, false);

  const secondMeasure = selectSheetMusicLoop(normalized, { startMeasureIndex: 1, endMeasureIndex: 1, includeBoundaryTies: true });
  assert.equal(secondMeasure.attacks[0].syntheticBoundaryTie, true);
  assert.deepEqual(secondMeasure.attacks.map((attack) => attack.midiNotes), [[66], [67]]);
});

test("normalization qualifies voices by part so equal pitches cannot steal another part's tie chain", () => {
  const tiedPart = `<part id="P1">
    <measure number="1"><attributes><divisions>1</divisions><time><beats>4</beats><beat-type>4</beat-type></time></attributes><note><pitch><step>C</step><octave>4</octave></pitch><duration>4</duration><tie type="start"/><voice>1</voice><staff>1</staff></note></measure>
    <measure number="2"><note><pitch><step>C</step><octave>4</octave></pitch><duration>4</duration><tie type="stop"/><voice>1</voice><staff>1</staff></note></measure>
  </part>`;
  const independentPart = `<part id="P2">
    <measure number="1"><attributes><divisions>1</divisions><time><beats>4</beats><beat-type>4</beat-type></time></attributes><note><pitch><step>C</step><octave>4</octave></pitch><duration>4</duration><voice>1</voice><staff>1</staff></note></measure>
    <measure number="2"><note><pitch><step>C</step><octave>4</octave></pitch><duration>4</duration><voice>1</voice><staff>1</staff></note></measure>
  </part>`;
  const imported = parseMusicXml(`<score-partwise><part-list>
    <score-part id="P1"><part-name>Tied piano</part-name></score-part><score-part id="P2"><part-name>Independent piano</part-name></score-part>
  </part-list>${tiedPart}${independentPart}</score-partwise>`, "multipart.musicxml");
  assert.deepEqual([...new Set(imported.notes.map((note) => note.voice))], ["1"], "authored MusicXML voice labels remain intact");

  const normalized = normalizeImportedMusicXmlScore(imported);
  const tiedStart = normalized.events.find((event) => event.id === "P1:m0:n0");
  const tiedStop = normalized.events.find((event) => event.id === "P1:m1:n0");
  const independent = normalized.events.find((event) => event.id === "P2:m0:n0");
  assert.equal(tiedStart?.voice, "P1:1");
  assert.equal(tiedStop?.voice, "P1:1");
  assert.equal(independent?.voice, "P2:1");
  assert.equal(tiedStart?.kind === "note" && tiedStart.soundingDurationBeats, 8);
  assert.equal(tiedStop?.kind === "note" && tiedStop.isAttack, false);
});

test("normalization groups multipart notes and rests with one linear scan", () => {
  const measureCount = 48;
  const partOneMeasures = Array.from({ length: measureCount }, (_, index) => `<measure number="${index + 1}">
    ${index === 0 ? "<attributes><divisions>1</divisions><time><beats>4</beats><beat-type>4</beat-type></time></attributes>" : ""}
    <note><pitch><step>C</step><octave>4</octave></pitch><duration>1</duration><voice>1</voice><staff>1</staff></note>
    <note><rest/><duration>3</duration><voice>1</voice><staff>1</staff></note>
  </measure>`).join("");
  const partTwoMeasures = Array.from({ length: measureCount }, (_, index) => `<measure number="${index + 1}">
    ${index === 0 ? "<attributes><divisions>1</divisions><time><beats>4</beats><beat-type>4</beat-type></time></attributes>" : ""}
    <note><pitch><step>G</step><octave>3</octave></pitch><duration>4</duration><voice>2</voice><staff>2</staff></note>
  </measure>`).join("");
  const imported = parseMusicXml(`<score-partwise><part-list>
    <score-part id="P1"><part-name>Upper</part-name></score-part>
    <score-part id="P2"><part-name>Lower</part-name></score-part>
  </part-list><part id="P1">${partOneMeasures}</part><part id="P2">${partTwoMeasures}</part></score-partwise>`, "many-measures.musicxml");

  let noteReads = 0;
  let restReads = 0;
  const countIndexedReads = <Item>(items: Item[], onRead: () => void) => new Proxy(items, {
    get(target, property, receiver) {
      if (typeof property === "string" && /^\d+$/.test(property)) onRead();
      return Reflect.get(target, property, receiver);
    },
  });
  const sourceNotes = imported.notes;
  const sourceRests = imported.rests;
  imported.notes = countIndexedReads(sourceNotes, () => { noteReads += 1; });
  imported.rests = countIndexedReads(sourceRests, () => { restReads += 1; });

  const normalized = normalizeImportedMusicXmlScore(imported);

  assert.equal(noteReads, sourceNotes.length, "each imported note should be visited exactly once while grouping measures");
  assert.equal(restReads, sourceRests.length, "each imported rest should be visited exactly once while grouping measures");
  assert.equal(normalized.measures.length, measureCount);
  normalized.measures.forEach((measure, index) => {
    assert.deepEqual(measure.events.map((event) => event.id), [
      `P1:m${index}:n0`,
      `P2:m${index}:n0`,
      `P1:m${index}:n1`,
    ]);
    assert.deepEqual(measure.events.map((event) => event.onsetBeat - measure.startBeat), [0, 0, 1]);
  });
});

test("plain XML bytes stay local and decode without an archive", async () => {
  const bytes = new TextEncoder().encode(ORBIT_STUDY_MUSICXML);
  assert.equal(await musicXmlTextFromBytes(bytes, "orbit-study.musicxml"), ORBIT_STUDY_MUSICXML);
});

test("a compressed project-authored MXL follows its container and ignores false EOCD signatures inside a valid comment", async () => {
  const signatureComment = new Uint8Array(22);
  new DataView(signatureComment.buffer).setUint32(0, 0x06054b50, true);
  const archive = fixtureZip([
    { name: "META-INF/container.xml", text: TEST_CONTAINER, method: 0 },
    { name: "score.musicxml", text: ORBIT_STUDY_MUSICXML, method: 8 },
  ], signatureComment);
  const xml = await musicXmlTextFromBytes(archive, "orbit-study.mxl");
  assert.equal(xml, ORBIT_STUDY_MUSICXML);
  assert.equal(parseMusicXml(xml, "orbit-study.mxl").title, "Orbit Study");
});

test("MXL rejects duplicate and unsafe names, bad CRC evidence, and expansion beyond the declared bound", async () => {
  await assert.rejects(
    () => musicXmlTextFromBytes(fixtureZip([
      { name: "score.musicxml", text: ORBIT_STUDY_MUSICXML },
      { name: "score.musicxml", text: ORBIT_STUDY_MUSICXML },
    ]), "duplicate.mxl"),
    /duplicate file name/,
  );
  await assert.rejects(
    () => musicXmlTextFromBytes(fixtureZip([{ name: "../score.musicxml", text: ORBIT_STUDY_MUSICXML }]), "unsafe.mxl"),
    /unsafe file path/,
  );
  await assert.rejects(
    () => musicXmlTextFromBytes(fixtureZip([
      { name: "META-INF/container.xml", text: TEST_CONTAINER, method: 0 },
      { name: "score.musicxml", text: ORBIT_STUDY_MUSICXML, declaredCrc32: 0 },
    ]), "crc.mxl"),
    /integrity check/,
  );
  await assert.rejects(
    () => musicXmlTextFromBytes(fixtureZip([
      { name: "META-INF/container.xml", text: TEST_CONTAINER, method: 0 },
      { name: "score.musicxml", text: ORBIT_STUDY_MUSICXML, declaredSize: 1 },
    ]), "expansion.mxl"),
    /could not be expanded/,
  );
});

test("oversized files are rejected before the browser allocates their contents", async () => {
  let arrayBufferCalled = false;
  const file = {
    name: "too-large.mxl",
    size: 13 * 1024 * 1024,
    arrayBuffer: async () => {
      arrayBufferCalled = true;
      return new ArrayBuffer(0);
    },
  } as File;
  await assert.rejects(() => importMusicXmlFile(file), /12 MB upload limit/);
  assert.equal(arrayBufferCalled, false);
});

test("attributes, additive meter, standalone sound offsets, tuplets, and fermatas survive score-order parsing", () => {
  const xml = `<score-partwise><part-list><score-part id="P1"><part-name>Piano</part-name></score-part></part-list><part id="P1">
    <measure number="1" implicit="yes">
      <attributes><divisions>1</divisions><time><beats>3 + 2</beats><beat-type>8</beat-type></time></attributes>
      <note><pitch><step>C</step><octave>4</octave></pitch><duration>1</duration><voice>1</voice><staff>1</staff></note>
      <attributes><divisions>2</divisions></attributes>
      <sound tempo="88"><offset>2</offset></sound>
      <note><pitch><step>D</step><octave>4</octave></pitch><duration>2</duration><voice>1</voice><staff>1</staff></note>
      <note><pitch><step>E</step><octave>4</octave></pitch><duration>2</duration><voice>1</voice><staff>1</staff><notations><fermata type="upright">normal</fermata></notations></note>
      <note><rest/><duration>1</duration><voice>1</voice><staff>1</staff><type>eighth</type><time-modification><actual-notes>3</actual-notes><normal-notes>2</normal-notes></time-modification></note>
    </measure>
  </part></score-partwise>`;
  const imported = parseMusicXml(xml, "score-order.musicxml");
  assert.deepEqual(imported.timeSignature, { beats: 5, beatType: 8 });
  assert.equal(imported.timeSignatureDisplay, "3+2/8");
  assert.deepEqual(imported.timeSignatureGroups, [{ beats: [3, 2], beatType: 8 }]);
  assert.deepEqual(imported.notes.map((note) => [note.onsetBeats, note.durationBeats]), [[0, 1], [1, 1], [2, 1]]);
  assert.deepEqual(imported.notes[2].fermata, { type: "upright", shape: "normal" });
  assert.deepEqual(imported.rests[0].tuplet, { actual: 3, normal: 2 });
  assert.equal(imported.directions.find((direction) => direction.kind === "tempo")?.onsetBeats, 2);
  assert.equal(imported.tempoBpm, 88);
});

test("mixed-denominator composite meter is reduced without losing its written grouping", () => {
  const xml = `<score-partwise><part-list><score-part id="P1"><part-name>Piano</part-name></score-part></part-list><part id="P1"><measure number="1">
    <attributes><divisions>2</divisions><time><beats>2</beats><beat-type>4</beat-type><beats>3</beats><beat-type>8</beat-type></time></attributes>
    <note><pitch><step>C</step><octave>4</octave></pitch><duration>7</duration><voice>1</voice><staff>1</staff></note>
  </measure></part></score-partwise>`;
  const imported = parseMusicXml(xml, "composite.musicxml");
  assert.deepEqual(imported.timeSignature, { beats: 7, beatType: 8 });
  assert.equal(imported.timeSignatureDisplay, "2/4 + 3/8");
  assert.deepEqual(imported.timeSignatureGroups, [{ beats: [2], beatType: 4 }, { beats: [3], beatType: 8 }]);
  assert.equal(imported.measures[0].durationBeats, 3.5);
});

test("cursor movement rejects non-positive durations and backups before the barline", () => {
  const wrap = (music: string) => `<score-partwise><part-list><score-part id="P1"><part-name>Piano</part-name></score-part></part-list><part id="P1"><measure number="1" implicit="yes"><attributes><divisions>4</divisions></attributes>${music}</measure></part></score-partwise>`;
  const note = `<note><pitch><step>C</step><octave>4</octave></pitch><duration>4</duration><voice>1</voice><staff>1</staff></note>`;
  assert.throws(() => parseMusicXml(wrap(`${note}<backup><duration>8</duration></backup>${note}`)), /before the start/);
  assert.throws(() => parseMusicXml(wrap(`<forward><duration>0</duration></forward>${note}`)), /positive MusicXML duration/);
  assert.throws(() => parseMusicXml(wrap(`<note><pitch><step>C</step><octave>4</octave></pitch><duration>-1</duration></note>`)), /positive MusicXML duration/);
});

test("unsupported roots, malformed markup, and excessive nesting fail closed", () => {
  assert.throws(() => parseMusicXml("<score-timewise/>", "timewise.musicxml"), /score-partwise/);
  assert.throws(() => parseMusicXmlTree("<score-partwise><part></score-partwise>"), /Malformed MusicXML/);
  const tooDeep = `${"<x>".repeat(512)}${"</x>".repeat(512)}`;
  assert.throws(() => parseMusicXmlTree(tooDeep), /nested too deeply/);
});
