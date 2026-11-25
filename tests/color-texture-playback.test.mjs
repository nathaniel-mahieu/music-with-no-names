import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";

const hookSource = readFileSync(new URL("../app/useColorTexturePlayback.ts", import.meta.url), "utf8");
const audioLevelSource = readFileSync(new URL("../lib/audio-level.ts", import.meta.url), "utf8");

function compile(source) {
  return ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
}

const compiledHook = compile(hookSource);
const compiledAudioLevel = compile(audioLevelSource);
const frequency = (midi) => 440 * 2 ** ((midi - 69) / 12);

function makeSequence(id = "transport-fixture") {
  return {
    id,
    title: "Three authored landings",
    mode: "major",
    totalBeats: 6,
    frames: [60, 62, 64].map((midi, index) => ({
      id: String(index),
      label: String(index + 1),
      chord: "C",
      beat: index * 2,
      durationBeats: 2,
      notes: [{ midi, voice: "melody", role: "flow", degree: "1" }],
      description: "A transport fixture.",
      texture: "flow",
    })),
  };
}

function makeTiedSequence() {
  return {
    id: "tied-melody-fixture",
    title: "A held note through independent bass changes",
    mode: "major",
    totalBeats: 6,
    frames: [47, 43, 45].map((bass, index) => ({
      id: String(index),
      label: String(index + 1),
      chord: "Authored",
      beat: index * 2,
      durationBeats: 2,
      notes: [
        {
          midi: 60,
          voice: "melody",
          role: index ? "suspension" : "anchor",
          degree: "1",
          ...(index ? { sustainFromPrevious: true } : {}),
        },
        { midi: bass, voice: "bass", role: "flow", degree: "1" },
      ],
      description: "A tie and independent accompaniment.",
      texture: "flow",
    })),
  };
}

/** Executes the real hook with deterministic hooks, audio clocks, and timers. */
function createHarness() {
  let hookIndex = 0;
  let hooks = [];
  let pendingEffects = [];
  let clockMs = 0;
  let nextId = 1;
  let initialContextState = "running";
  let resumeGate = null;
  let sequence = makeSequence();
  let tempo = 60;
  let loop = false;

  const contexts = [];
  const intervals = new Map();
  const animationFrames = new Map();
  const timeouts = new Map();
  const documentEvents = new Map();
  const windowEvents = new Map();
  const sameDependencies = (first, second) => first && second
    && first.length === second.length
    && first.every((value, index) => Object.is(value, second[index]));

  const react = {
    useRef(value) {
      const index = hookIndex++;
      hooks[index] ??= { current: value };
      return hooks[index];
    },
    useState(value) {
      const index = hookIndex++;
      hooks[index] ??= { state: typeof value === "function" ? value() : value };
      const setState = (next) => {
        hooks[index].state = typeof next === "function" ? next(hooks[index].state) : next;
      };
      return [hooks[index].state, setState];
    },
    useCallback(callback, dependencies) {
      const index = hookIndex++;
      if (!hooks[index] || !sameDependencies(hooks[index].dependencies, dependencies)) {
        hooks[index] = { dependencies, callback };
      }
      return hooks[index].callback;
    },
    useEffect(effect, dependencies) {
      const index = hookIndex++;
      if (!hooks[index] || !sameDependencies(hooks[index].dependencies, dependencies)) {
        const previous = hooks[index];
        hooks[index] = { dependencies, cleanup: previous?.cleanup };
        pendingEffects.push(() => {
          previous?.cleanup?.();
          hooks[index].cleanup = effect();
        });
      }
    },
  };

  class FakeAudioParam {
    constructor() {
      this.value = 0;
      this.events = [];
    }
    setValueAtTime(value, time) {
      this.value = value;
      this.events.push({ kind: "set", value, time });
    }
    setTargetAtTime(value, time, constant) {
      this.value = value;
      this.events.push({ kind: "target", value, time, constant });
    }
    exponentialRampToValueAtTime(value, time) {
      this.value = value;
      this.events.push({ kind: "ramp", value, time });
    }
    cancelScheduledValues(time) {
      this.events.push({ kind: "cancel", time });
    }
  }

  class FakeAudioNode {
    constructor() {
      this.gain = new FakeAudioParam();
      this.disconnected = false;
    }
    connect(next) {
      return next;
    }
    disconnect() {
      this.disconnected = true;
    }
  }

  class FakeOscillator extends FakeAudioNode {
    constructor() {
      super();
      this.frequency = { value: 0 };
      this.onended = null;
      this.startTime = null;
      this.stopTime = Infinity;
      this.ended = false;
    }
    start(time) {
      this.startTime = time;
    }
    stop(time = 0) {
      this.stopTime = time;
    }
  }

  class FakeAudioContext {
    constructor() {
      this.state = initialContextState;
      this.currentTime = 0;
      this.sampleRate = 48_000;
      this.oscillators = [];
      this.gains = [];
      this.destination = new FakeAudioNode();
      this.onstatechange = null;
      contexts.push(this);
    }
    createGain() {
      const node = new FakeAudioNode();
      this.gains.push(node);
      return node;
    }
    createDynamicsCompressor() {
      const node = new FakeAudioNode();
      for (const name of ["threshold", "knee", "ratio", "attack", "release"]) {
        node[name] = new FakeAudioParam();
      }
      return node;
    }
    createOscillator() {
      const oscillator = new FakeOscillator();
      this.oscillators.push(oscillator);
      return oscillator;
    }
    async resume() {
      if (resumeGate) await resumeGate.promise;
      if (this.state !== "closed") this.state = "running";
    }
    async close() {
      this.state = "closed";
    }
  }

  const browserWindow = {
    AudioContext: FakeAudioContext,
    setInterval(callback) {
      const id = nextId++;
      intervals.set(id, callback);
      return id;
    },
    clearInterval(id) {
      intervals.delete(id);
    },
    requestAnimationFrame(callback) {
      const id = nextId++;
      animationFrames.set(id, callback);
      return id;
    },
    cancelAnimationFrame(id) {
      animationFrames.delete(id);
    },
    setTimeout(callback, delay) {
      const id = nextId++;
      timeouts.set(id, { callback, at: clockMs + delay });
      return id;
    },
    addEventListener(name, callback) {
      windowEvents.set(name, callback);
    },
    removeEventListener(name, callback) {
      if (windowEvents.get(name) === callback) windowEvents.delete(name);
    },
  };
  const browserDocument = {
    hidden: false,
    addEventListener(name, callback) {
      documentEvents.set(name, callback);
    },
    removeEventListener(name, callback) {
      if (documentEvents.get(name) === callback) documentEvents.delete(name);
    },
  };

  const audioLevelExports = {};
  vm.runInNewContext(compiledAudioLevel, { exports: audioLevelExports });
  const hookExports = {};
  vm.runInNewContext(compiledHook, {
    exports: hookExports,
    require(name) {
      if (name === "react") return react;
      if (name === "@/lib/audio-level") return audioLevelExports;
      throw new Error(`Unexpected runtime dependency: ${name}`);
    },
    window: browserWindow,
    document: browserDocument,
  });

  function render() {
    hookIndex = 0;
    const transport = hookExports.useColorTexturePlayback(sequence, tempo, loop);
    const effects = pendingEffects;
    pendingEffects = [];
    effects.forEach((effect) => effect());
    return transport;
  }

  function advance(seconds) {
    const steps = Math.ceil(seconds / .02);
    for (let index = 0; index < steps; index += 1) {
      const duration = seconds / steps;
      clockMs += duration * 1000;
      for (const context of contexts) {
        if (context.state === "running") context.currentTime += duration;
        for (const oscillator of context.oscillators) {
          if (!oscillator.ended && oscillator.stopTime <= context.currentTime) {
            oscillator.ended = true;
            oscillator.onended?.();
          }
        }
      }
      for (const callback of [...intervals.values()]) callback();
      const frames = [...animationFrames.values()];
      animationFrames.clear();
      frames.forEach((callback) => callback(clockMs));
      for (const [id, timeout] of [...timeouts]) {
        if (timeout.at <= clockMs) {
          timeouts.delete(id);
          timeout.callback();
        }
      }
    }
  }

  function unmount() {
    hooks.forEach((hook) => hook?.cleanup?.());
    advance(.06);
  }

  render();
  return {
    render,
    advance,
    unmount,
    contexts,
    intervals,
    animationFrames,
    document: browserDocument,
    documentEvents,
    setLoop(value) {
      loop = value;
      render();
    },
    setTempo(value) {
      tempo = value;
      render();
    },
    setSequence(value) {
      sequence = value;
      render();
    },
    suspendNextResume() {
      initialContextState = "suspended";
      let resolve;
      let reject;
      const promise = new Promise((onResolve, onReject) => {
        resolve = onResolve;
        reject = onReject;
      });
      resumeGate = { promise, resolve, reject };
      return resumeGate;
    },
  };
}

test("authored transport requires Play, follows audio time, and disposes stopped audio", async (t) => {
  const harness = createHarness();
  t.after(() => harness.unmount());
  assert.equal(harness.contexts.length, 0, "rendering never starts audio");

  await harness.render().play();
  const context = harness.contexts[0];
  assert.equal(harness.render().isPlaying, true);
  assert(context.oscillators.some((oscillator) => oscillator.frequency.value === frequency(60)));
  assert(context.oscillators.every((oscillator) => oscillator.frequency.value < context.sampleRate / 2));
  assert.equal(context.gains[0].gain.value, .065, "shared master output budget is used");

  harness.advance(1);
  assert(Math.abs(harness.render().beat - .975) < .04, "visual position follows the audio clock including its start lead");
  harness.render().stop();
  harness.advance(.06);
  assert.equal(harness.render().beat, 0);
  assert.equal(harness.render().isPlaying, false);
  assert(harness.contexts.every((item) => item.state === "closed"));
  assert(context.gains.every((node) => node.disconnected));
  assert.equal(harness.intervals.size, 0);
  assert.equal(harness.animationFrames.size, 0);
});

test("pause preserves score position and a playing seek sounds the chosen frame", async (t) => {
  const harness = createHarness();
  t.after(() => harness.unmount());
  await harness.render().play();
  harness.advance(1);
  harness.render().pause();
  const pausedBeat = harness.render().beat;
  assert(pausedBeat > .9 && pausedBeat < 1.1);
  harness.advance(.05);
  assert.equal(harness.contexts[0].state, "closed");

  await harness.render().play();
  assert.equal(harness.contexts.length, 2);
  assert.equal(harness.contexts[1].oscillators[0].frequency.value, frequency(60));
  harness.advance(1.1);
  assert.equal(harness.render().frameIndex, 1, "resume does not restart the passage clock");

  harness.render().seek(4);
  assert.equal(harness.render().beat, 4);
  assert.equal(harness.render().frameIndex, 2);
  assert.equal(harness.contexts.at(-1).oscillators[0].frequency.value, frequency(64));
});

test("a non-looping passage ends at its written boundary and replays only on Play", async (t) => {
  const harness = createHarness();
  t.after(() => harness.unmount());
  await harness.render().play();
  harness.advance(6.1);
  assert.equal(harness.render().isPlaying, false);
  assert.equal(harness.render().beat, 6);
  assert.equal(harness.render().frameIndex, 2);
  harness.advance(.05);
  assert.equal(harness.contexts[0].state, "closed");
  assert.equal(harness.contexts.length, 1, "the end never autoplays another context");

  await harness.render().play();
  assert.equal(harness.render().beat, 0);
  assert.equal(harness.contexts.length, 2);
});

test("loop toggles cancel future voices and finish the current cycle without duplication", async (t) => {
  const harness = createHarness();
  t.after(() => harness.unmount());
  harness.setLoop(true);
  await harness.render().play();
  harness.advance(5.9);
  harness.setLoop(false);
  harness.setLoop(true);
  harness.advance(.25);

  const context = harness.contexts[0];
  const audibleFundamentals = context.oscillators.filter((oscillator) => oscillator.frequency.value === frequency(60)
    && oscillator.startTime <= context.currentTime && oscillator.stopTime > context.currentTime);
  assert.equal(audibleFundamentals.length, 1, "re-enabling a cancelled future cycle sounds one landing");
  assert(harness.render().beat < .3);
  harness.advance(1);
  harness.setLoop(false);
  harness.advance(5.1);
  assert.equal(harness.render().isPlaying, false);
  assert.equal(harness.render().beat, 6);
});

test("late resolved and rejected resume requests cannot restart or overwrite cancelled playback", async (t) => {
  for (const resolution of ["resolve", "reject"]) {
    const harness = createHarness();
    t.after(() => harness.unmount());
    const gate = harness.suspendNextResume();
    const pending = harness.render().play();
    assert.equal(harness.render().isStarting, true);
    harness.render().stop();
    if (resolution === "resolve") gate.resolve();
    else gate.reject(new Error("A stale permission-resume failure"));
    await pending;

    assert.equal(harness.render().isPlaying, false);
    assert.equal(harness.render().isStarting, false);
    assert.equal(harness.render().error, "");
    assert.equal(harness.contexts[0].state, "closed");
    assert.equal(harness.contexts[0].oscillators.length, 0);
  }
});

test("hiding the page pauses audio and changing tempo or sequence cancels the old schedule", async (t) => {
  const harness = createHarness();
  t.after(() => harness.unmount());
  await harness.render().play();
  harness.advance(.8);
  harness.document.hidden = true;
  harness.documentEvents.get("visibilitychange")();
  assert.equal(harness.render().isPlaying, false);
  assert(harness.render().beat > .7);
  harness.advance(.06);
  assert.equal(harness.contexts[0].state, "closed");

  harness.document.hidden = false;
  assert.equal(harness.contexts.length, 1, "becoming visible does not resume audio automatically");
  await harness.render().play();
  harness.setTempo(90);
  assert.equal(harness.render().isPlaying, false);
  assert.equal(harness.render().beat, 0);
  harness.advance(.06);
  assert(harness.contexts.every((context) => context.state === "closed"));

  await harness.render().play();
  harness.advance(.2);
  harness.setSequence(makeSequence("a-different-construction"));
  assert.equal(harness.render().isPlaying, false);
  assert.equal(harness.render().beat, 0);
  harness.advance(.06);
  assert(harness.contexts.every((context) => context.state === "closed"));
});

test("a tied melody survives chord changes, is audible after seeks, and starts fresh on each loop", async (t) => {
  const harness = createHarness();
  t.after(() => harness.unmount());
  harness.setSequence(makeTiedSequence());
  await harness.render().play();
  const context = harness.contexts[0];
  const melodyOnsets = () => context.oscillators.filter((oscillator) => oscillator.frequency.value === frequency(60));
  assert.equal(melodyOnsets().length, 1);
  assert(melodyOnsets()[0].stopTime > 6, "the melody envelope spans the entire authored tie chain");

  harness.advance(2.1);
  assert.equal(melodyOnsets().length, 1, "the incoming tie does not re-attack");
  assert(context.oscillators.some((oscillator) => oscillator.frequency.value === frequency(43)), "the new bass still enters");
  harness.advance(2);
  assert.equal(melodyOnsets().length, 1);
  assert(context.oscillators.some((oscillator) => oscillator.frequency.value === frequency(45)));

  harness.render().pause();
  harness.advance(.05);
  await harness.render().play();
  const resumed = harness.contexts.at(-1);
  assert(resumed.oscillators.some((oscillator) => oscillator.frequency.value === frequency(60)), "resuming inside a tie starts its retained voice");
  harness.render().seek(2);
  const sought = harness.contexts.at(-1);
  assert(sought.oscillators.some((oscillator) => oscillator.frequency.value === frequency(60)), "seeking exactly to a tied boundary is audible");

  harness.render().stop();
  harness.advance(.05);
  harness.setLoop(true);
  await harness.render().play();
  const looping = harness.contexts.at(-1);
  harness.advance(6.12);
  const loopMelodies = looping.oscillators.filter((oscillator) => oscillator.frequency.value === frequency(60));
  assert.equal(loopMelodies.length, 2, "each loop starts one new melody chain");
});
