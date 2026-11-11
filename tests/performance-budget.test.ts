import assert from "node:assert/strict";
import test from "node:test";
import { performance } from "node:perf_hooks";
import { analyzeMonoAudio } from "../lib/audio-analysis.ts";
import { immersionCloudHull } from "../lib/piano-immersion-model.ts";
import { createPianoFramePublisher, midiMessageTimeStamp } from "../lib/piano-live-input.ts";

function frameHarness() {
  let nextId = 0;
  const frames = new Map<number, () => void>();
  const cancelled: number[] = [];
  return {
    frames,
    cancelled,
    request(callback: () => void) {
      const id = nextId++;
      frames.set(id, callback);
      return id;
    },
    cancel(id: number) {
      cancelled.push(id);
      frames.delete(id);
    },
    runNext() {
      const entry = frames.entries().next().value;
      assert.ok(entry, "a frame must be pending");
      frames.delete(entry[0]);
      entry[1]();
    },
  };
}

test("a MIDI chord burst preserves every raw record but publishes one view frame", () => {
  const clock = frameHarness();
  const raw: { note: number; onsetMs: number }[] = [];
  const snapshots: typeof raw[] = [];
  const publisher = createPianoFramePublisher(() => snapshots.push([...raw]), clock.request, clock.cancel);

  [60, 64, 67].forEach((note, index) => {
    raw.push({ note, onsetMs: 1000 + index * 2 });
    publisher.schedule();
  });

  assert.deepEqual(raw.map(({ note }) => note), [60, 64, 67]);
  assert.equal(snapshots.length, 0, "only view publication should wait for a frame");
  assert.equal(clock.frames.size, 1);
  clock.runNext();
  assert.deepEqual(snapshots, [raw]);
  assert.equal(clock.frames.size, 0);
});

test("flushing a pending piano frame is immediate and does not publish twice", () => {
  const clock = frameHarness();
  let published = 0;
  const publisher = createPianoFramePublisher(() => { published += 1; }, clock.request, clock.cancel);
  publisher.flush();
  assert.equal(published, 0);
  publisher.schedule();
  const staleFrame = clock.frames.values().next().value!;
  publisher.flush();
  publisher.flush();
  staleFrame();
  assert.equal(published, 1);
  assert.equal(clock.frames.size, 0);
  assert.deepEqual(clock.cancelled, [0], "frame ID zero is a valid pending frame");
});

test("piano frame callbacks can schedule the next frame during publication", () => {
  const clock = frameHarness();
  let published = 0;
  const publisher = createPianoFramePublisher(() => {
    published += 1;
    if (published < 3) publisher.schedule();
  }, clock.request, clock.cancel);
  publisher.schedule();
  clock.runNext();
  assert.equal(published, 1);
  assert.equal(clock.frames.size, 1);
  publisher.flush();
  assert.equal(published, 2);
  assert.equal(clock.frames.size, 1, "flush must also clear pending state before publication");
  clock.runNext();
  assert.equal(published, 3);
  assert.equal(clock.frames.size, 0);
});

test("piano frame cancellation is safe for unmount and reset without stale publication", () => {
  const clock = frameHarness();
  const raw: number[] = [];
  const snapshots: number[][] = [];
  const publisher = createPianoFramePublisher(() => snapshots.push([...raw]), clock.request, clock.cancel);
  raw.push(60);
  publisher.schedule();
  const staleFrame = clock.frames.values().next().value!;
  publisher.cancel();
  publisher.cancel();
  raw.length = 0;
  raw.push(67);
  publisher.schedule();
  staleFrame();
  assert.equal(snapshots.length, 0, "a canceled frame must not flush the reset session");
  clock.runNext();
  assert.deepEqual(snapshots, [[67]]);
  assert.deepEqual(clock.cancelled, [0]);
});

test("MIDI onset timestamps preserve chord spacing despite delivery jitter", () => {
  const onsets = [1000, 1002, 1005];
  const received = [1010, 1040, 1090];
  const resolved = onsets.map((onset, index) => midiMessageTimeStamp(onset, received[index]));
  assert.deepEqual(resolved, onsets);
  assert.deepEqual(resolved.slice(1).map((onset, index) => onset - resolved[index]), [2, 3]);
  assert.equal(midiMessageTimeStamp(1001, 1000), 1001, "allow one millisecond of clock rounding");
  for (const invalid of [undefined, 0, -1, Number.NaN, Number.POSITIVE_INFINITY, 1001.01, 1_700_000_000_000]) {
    assert.equal(midiMessageTimeStamp(invalid, 1000), 1000, String(invalid));
  }
});

test("two-minute analysis stays bounded in time, memory, and frame count", () => {
  const sampleRate = 12000;
  const durationSeconds = 120;
  const samples = new Float32Array(sampleRate * durationSeconds);
  for (let index = 0; index < samples.length; index += 1) {
    const time = index / sampleRate;
    const envelope = time % 0.5 < 0.11 ? 0.45 : 0.08;
    samples[index] = Math.sin(2 * Math.PI * 180 * time) * envelope;
  }
  const heapBefore = process.memoryUsage().heapUsed;
  const started = performance.now();
  const result = analyzeMonoAudio(samples, sampleRate, { maxFineFrames: 2400, createdAt: "2026-01-01T00:00:00.000Z" });
  const elapsed = performance.now() - started;
  const heapGrowth = process.memoryUsage().heapUsed - heapBefore;

  assert.ok(elapsed < 5000, `analysis took ${elapsed.toFixed(0)} ms`);
  assert.ok(heapGrowth < 256 * 1024 * 1024, `heap grew by ${(heapGrowth / 1024 / 1024).toFixed(1)} MB`);
  assert.ok(result.resolutions[0].frames.length <= 2400);
  assert.ok(result.resolutions[1].frames.length <= 1800);
  assert.ok(result.resolutions[2].frames.length <= 900);
});

test("a full MIDI-range immersion hull stays geometrically bounded", () => {
  const notes = Array.from({ length: 128 }, (_, note) => note);
  const started = performance.now();
  const hull = immersionCloudHull(notes, 60);
  const elapsed = performance.now() - started;

  assert.ok(hull);
  assert.equal(hull.pointCount, 128);
  assert.ok(hull.path.length < 3000, `dense hull path grew to ${hull.path.length} characters`);
  assert.ok(elapsed < 100, `dense hull took ${elapsed.toFixed(1)} ms`);
});
