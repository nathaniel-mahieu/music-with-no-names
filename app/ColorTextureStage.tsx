"use client";

import { useEffect, useRef } from "react";
import {
  getDemoPitchColor,
  type DemoFrame,
  type DemoSequence,
  type TextureRole,
} from "@/lib/piano-color-texture-model";

type ColorTextureStageProps = {
  frame: DemoFrame;
  nextFrame: DemoFrame | null;
  beat: number;
  isPlaying: boolean;
  textures: boolean;
  selectedMidi: number | null;
  sequence: DemoSequence;
};

type Rgb = [number, number, number];
type PitchColor = ReturnType<typeof getDemoPitchColor>;
type Orb = {
  note: DemoFrame["notes"][number];
  x: number;
  y: number;
  radius: number;
};

const ROLE_LABELS: Record<TextureRole, string> = {
  anchor: "anchored",
  flow: "flowing",
  pull: "directed",
  suspension: "suspended",
  friction: "crossing",
  release: "releasing",
};
const VOICE_ORDER = { bass: 0, harmony: 1, melody: 2 } as const;
const PITCH_CACHE = new Map<number, { color: PitchColor; rgb: Rgb }>();
const TAU = Math.PI * 2;

function clamp(value: number, low: number, high: number) {
  return Math.max(low, Math.min(high, value));
}

function colorChannels(L: number, C: number, hue: number): Rgb {
  const a = C * Math.cos(hue * Math.PI / 180);
  const b = C * Math.sin(hue * Math.PI / 180);
  const l = (L + .3963377774 * a + .2158037573 * b) ** 3;
  const m = (L - .1055613458 * a - .0638541728 * b) ** 3;
  const s = (L - .0894841775 * a - 1.291485548 * b) ** 3;
  const linear = [
    4.0767416621 * l - 3.3077115913 * m + .2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - .3413193965 * s,
    -.0041960863 * l - .7034186147 * m + 1.707614701 * s,
  ];
  return linear.map((channel) => {
    const normalized = clamp(channel, 0, 1);
    return Math.round(255 * (normalized <= .0031308 ? 12.92 * normalized : 1.055 * normalized ** (1 / 2.4) - .055));
  }) as Rgb;
}

function rgba(rgb: Rgb, alpha: number) {
  return `rgba(${rgb[0]},${rgb[1]},${rgb[2]},${alpha})`;
}

function pitchColor(midi: number) {
  let cached = PITCH_CACHE.get(midi);
  if (!cached) {
    const color = getDemoPitchColor(midi);
    cached = { color, rgb: colorChannels(color.lightness, color.chroma, color.hue) };
    PITCH_CACHE.set(midi, cached);
  }
  return cached;
}

function layoutOrbs(frame: DemoFrame, width: number, height: number): Orb[] {
  const notes = [...frame.notes].sort((a, b) => VOICE_ORDER[a.voice] - VOICE_ORDER[b.voice] || a.midi - b.midi);
  const count = notes.length;
  if (!count) return [];
  if (width < 540) {
    const columns = count <= 4 ? 2 : 3;
    const rows = Math.ceil(count / columns);
    const radius = Math.min(54, width / (columns * 3.1), height / (rows * 4.1));
    return notes.map((note, index) => {
      const row = Math.floor(index / columns);
      const inRow = Math.min(columns, count - row * columns);
      const column = index % columns;
      return {
        note,
        x: width * ((column + .5) / inRow),
        y: rows === 1 ? height * .43 : height * (.29 + row * .40),
        radius,
      };
    });
  }
  const radius = Math.min(80, width / (Math.max(3, count) * 2.75), height * .185);
  return notes.map((note, index) => {
    const fraction = count === 1 ? .5 : .16 + index * .68 / (count - 1);
    const stagger = index % 2 === 0 ? .085 : -.085;
    const voiceHeight = note.voice === "bass" ? .075 : note.voice === "melody" ? -.055 : 0;
    return {
      note,
      x: width * fraction,
      y: height * (.47 + stagger + voiceHeight),
      radius: radius * (note.voice === "melody" ? 1.05 : note.voice === "bass" ? .97 : 1),
    };
  });
}

function drawBackground(context: CanvasRenderingContext2D, width: number, height: number, time: number) {
  context.fillStyle = "#080d10";
  context.fillRect(0, 0, width, height);
  const light = context.createRadialGradient(width * .48, height * .48, 0, width * .48, height * .48, width * .62);
  light.addColorStop(0, "rgba(68,86,94,.13)");
  light.addColorStop(1, "rgba(8,13,16,0)");
  context.fillStyle = light;
  context.fillRect(0, 0, width, height);
  context.strokeStyle = "rgba(178,197,202,.035)";
  context.lineWidth = .65;
  for (let line = 0; line < 9; line += 1) {
    const y = height * (.15 + line * .085);
    const bend = Math.sin(line * .65 + time * .035) * height * .055;
    context.beginPath();
    context.moveTo(0, y);
    context.bezierCurveTo(width * .28, y - bend, width * .67, y + bend, width, y - height * .06);
    context.stroke();
  }
}

function drawThreads(
  context: CanvasRenderingContext2D,
  role: TextureRole,
  radius: number,
  time: number,
  progress: number,
  seed: number,
  direction: number,
) {
  const r = radius;
  context.lineWidth = .65;
  context.lineCap = "round";
  const phase = seed * .018 + time * .12;
  const light = "rgba(249,252,249,.30)";
  const shade = "rgba(16,24,28,.17)";
  if (role === "release") {
    for (let index = 0; index < 15; index += 1) {
      const spread = r * (.13 + index * .16 + progress * .20);
      context.strokeStyle = index % 3 === 0 ? light : "rgba(249,252,249,.16)";
      context.beginPath();
      context.ellipse(-r * .50, r * .66, spread * 1.15, spread, -.3, 0, TAU);
      context.stroke();
    }
    return;
  }
  if (role === "suspension") {
    context.rotate(-.62);
    for (let index = 0; index < 32; index += 1) {
      const y = -r * 1.2 + index * r * .078;
      const tension = Math.sin(phase + index * .25) * r * .012;
      context.strokeStyle = index % 4 === 0 ? light : index % 4 === 1 ? shade : "rgba(249,252,249,.16)";
      context.beginPath();
      context.moveTo(-r * 1.5, y);
      context.quadraticCurveTo(0, y + tension, r * 1.5, y);
      context.stroke();
    }
    return;
  }
  if (role === "friction") {
    for (const direction of [-1, 1]) {
      context.save();
      context.rotate(direction * .60);
      for (let index = 0; index < 18; index += 1) {
        const y = -r * 1.25 + index * r * .15;
        context.strokeStyle = index % 3 === 0 ? shade : "rgba(249,252,249,.23)";
        context.beginPath();
        for (let point = 0; point <= 24; point += 1) {
          const x = -r * 1.4 + point * r * 2.8 / 24;
          const wave = Math.sin(x / r * 2.2 + phase * .7 + index * .27) * r * .075;
          if (point === 0) context.moveTo(x, y + wave);
          else context.lineTo(x, y + wave);
        }
        context.stroke();
      }
      context.restore();
    }
    return;
  }
  context.rotate(role === "pull" ? -.15 * direction : -.26);
  for (let index = 0; index < 27; index += 1) {
    const y = -r * 1.4 + index * r * .105;
    context.strokeStyle = index % 4 === 0 ? light : index % 4 === 1 ? shade : "rgba(249,252,249,.17)";
    context.beginPath();
    if (role === "pull") {
      const bend = direction * r * .65;
      context.moveTo(-r * 1.4, y + bend * .25);
      context.bezierCurveTo(-r * .52, y + bend * .35, r * .24, y - bend * .38, r * 1.4, y - bend);
    } else if (role === "flow") {
      const wave = Math.sin(phase + index * .22) * r * .12;
      context.moveTo(-r * 1.4, y + wave);
      context.bezierCurveTo(-r * .52, y - r * .25 - wave, r * .44, y + r * .25 + wave, r * 1.4, y - wave);
    } else {
      const breath = Math.sin(phase + index * .12) * r * .025;
      context.moveTo(-r * 1.4, y + r * .18);
      context.bezierCurveTo(-r * .58, y - r * .42 + breath, r * .52, y - r * .24 + breath, r * 1.4, y + r * .42);
    }
    context.stroke();
  }
}

function drawOrb(
  context: CanvasRenderingContext2D,
  orb: Orb,
  props: ColorTextureStageProps,
  time: number,
  progress: number,
  mobile: boolean,
) {
  const { note, x, y, radius } = orb;
  const { color, rgb } = pitchColor(note.midi);
  const gray = colorChannels(color.grayLightness, 0, 0);
  const selected = props.selectedMidi == null || props.selectedMidi === note.midi;
  const onset = props.isPlaying ? Math.exp(-progress * 11) : .55;
  const r = radius * (props.isPlaying ? .97 + .03 * (1 - onset) : 1);
  context.save();
  context.globalAlpha = selected ? 1 : .24;
  const halo = context.createRadialGradient(x, y, r * 1.03, x, y, r * 2.3);
  halo.addColorStop(0, rgba(gray, .055 + onset * .12));
  halo.addColorStop(.35, rgba(gray, .024 + onset * .04));
  halo.addColorStop(1, rgba(gray, 0));
  context.fillStyle = halo;
  context.beginPath();
  context.arc(x, y, r * 2.3, 0, TAU);
  context.fill();
  context.strokeStyle = rgba(gray, .82);
  context.lineWidth = Math.max(2, r * .045);
  context.beginPath();
  context.arc(x, y, r + 7, 0, TAU);
  context.stroke();
  context.fillStyle = "#080d10";
  context.beginPath();
  context.arc(x, y, r + 3.5, 0, TAU);
  context.fill();
  context.fillStyle = rgba(rgb, 1);
  context.beginPath();
  context.arc(x, y, r, 0, TAU);
  context.fill();
  context.save();
  context.translate(x, y);
  context.beginPath();
  context.arc(0, 0, r - .5, 0, TAU);
  context.clip();
  const finish = context.createRadialGradient(-r * .36, -r * .48, 0, 0, 0, r * 1.16);
  finish.addColorStop(0, "rgba(255,255,250,.10)");
  finish.addColorStop(.56, "rgba(255,255,250,0)");
  finish.addColorStop(1, "rgba(5,13,19,.23)");
  context.fillStyle = finish;
  context.fillRect(-r, -r, r * 2, r * 2);
  if (props.textures) {
    const future = props.nextFrame?.notes.filter((candidate) => candidate.voice === note.voice)
      .sort((a, b) => Math.abs(a.midi - note.midi) - Math.abs(b.midi - note.midi))[0];
    const direction = future ? Math.sign(future.midi - note.midi) || 1 : 1;
    const seed = note.midi * 13 + VOICE_ORDER[note.voice] * 37;
    drawThreads(context, note.role, r, time, progress, seed, direction);
  }
  context.restore();
  context.strokeStyle = "rgba(249,252,249,.23)";
  context.lineWidth = .65;
  context.beginPath();
  context.arc(x, y, r - .5, 0, TAU);
  context.stroke();
  const label = /\d/.test(color.note) ? color.note : `${color.note}${color.octave}`;
  context.textAlign = "center";
  context.textBaseline = "alphabetic";
  context.font = `500 ${mobile ? 14 : 16}px ui-sans-serif, system-ui, sans-serif`;
  context.fillStyle = "#edf2ef";
  context.fillText(label, x, y + r + 29);
  context.font = "400 12px ui-sans-serif, system-ui, sans-serif";
  context.fillStyle = "#93a29f";
  context.fillText(ROLE_LABELS[note.role], x, y + r + 47);
  context.restore();
}

function paintStage(context: CanvasRenderingContext2D, width: number, height: number, props: ColorTextureStageProps, reduced: boolean) {
  const time = reduced ? 0 : props.beat;
  const progress = reduced || !props.isPlaying ? 0 : clamp((props.beat - props.frame.beat) / Math.max(.01, props.frame.durationBeats), 0, 1);
  drawBackground(context, width, height, time);
  const orbs = layoutOrbs(props.frame, width, height);
  context.save();
  context.lineWidth = .65;
  for (let index = 1; index < orbs.length; index += 1) {
    const previous = orbs[index - 1];
    const current = orbs[index];
    const gradient = context.createLinearGradient(previous.x, previous.y, current.x, current.y);
    gradient.addColorStop(0, rgba(pitchColor(previous.note.midi).rgb, .15));
    gradient.addColorStop(1, rgba(pitchColor(current.note.midi).rgb, .15));
    context.strokeStyle = gradient;
    context.beginPath();
    context.moveTo(previous.x, previous.y);
    context.bezierCurveTo(previous.x + width * .10, previous.y - height * .12, current.x - width * .10, current.y + height * .12, current.x, current.y);
    context.stroke();
  }
  context.restore();
  orbs.forEach((orb) => drawOrb(context, orb, props, time, progress, width < 540));
}

export function ColorTextureStage(props: ColorTextureStageProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const propsRef = useRef(props);
  const reducedRef = useRef(false);
  const requestPaintRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    const previous = propsRef.current;
    propsRef.current = props;
    const changedFrame = previous.frame !== props.frame || previous.sequence !== props.sequence || previous.selectedMidi !== props.selectedMidi || previous.textures !== props.textures;
    if (!reducedRef.current || changedFrame) requestPaintRef.current?.();
  }, [props]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");
    if (!canvas || !context) return;
    // The sized wrapper owns layout. Observing the canvas itself can report
    // its intrinsic backing-store writes as new resize notifications.
    const container = canvas.parentElement ?? canvas;
    let width = 0;
    let height = 0;
    let animation = 0;
    let lastPaint = -Infinity;
    let resizePending = true;
    let disposed = false;
    const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
    reducedRef.current = motion.matches;

    function render(now: number) {
      animation = 0;
      if (disposed || document.hidden) return;
      // ResizeObserver callbacks only queue work. All canvas dimension writes
      // happen in this animation frame, outside observer delivery.
      if (resizePending) {
        resizePending = false;
        resizeBackingStore();
      }
      if (!width || !height) return;
      const current = propsRef.current;
      if (now - lastPaint >= 1000 / 30 || !current.isPlaying || reducedRef.current) {
        paintStage(context!, width, height, current, reducedRef.current);
        lastPaint = now;
      }
      if (current.isPlaying && !reducedRef.current) animation = window.requestAnimationFrame(render);
    }
    function requestPaint() {
      if (!disposed && !animation && !document.hidden) animation = window.requestAnimationFrame(render);
    }
    function resizeBackingStore() {
      const rect = container.getBoundingClientRect();
      const nextWidth = rect.width;
      const nextHeight = rect.height;
      const ratio = Math.min(2, window.devicePixelRatio || 1);
      const pixelWidth = Math.max(1, Math.round(nextWidth * ratio));
      const pixelHeight = Math.max(1, Math.round(nextHeight * ratio));
      const changed = nextWidth !== width || nextHeight !== height || canvas!.width !== pixelWidth || canvas!.height !== pixelHeight;
      width = nextWidth;
      height = nextHeight;
      if (!changed || !width || !height) return;
      // Assigning either intrinsic dimension clears context state, so leave
      // unchanged backing stores alone during duplicate observer deliveries.
      if (canvas!.width !== pixelWidth) canvas!.width = pixelWidth;
      if (canvas!.height !== pixelHeight) canvas!.height = pixelHeight;
      context!.setTransform(pixelWidth / width, 0, 0, pixelHeight / height, 0, 0);
      lastPaint = -Infinity;
    }
    function queueResize() {
      resizePending = true;
      requestPaint();
    }
    function updateMotion() {
      reducedRef.current = motion.matches;
      if (animation) window.cancelAnimationFrame(animation);
      animation = 0;
      lastPaint = -Infinity;
      requestPaint();
    }
    function updateVisibility() {
      if (document.hidden && animation) {
        window.cancelAnimationFrame(animation);
        animation = 0;
      } else requestPaint();
    }
    requestPaintRef.current = requestPaint;
    const observer = new ResizeObserver(queueResize);
    observer.observe(container);
    motion.addEventListener("change", updateMotion);
    document.addEventListener("visibilitychange", updateVisibility);
    window.addEventListener("resize", queueResize);
    requestPaint();
    return () => {
      disposed = true;
      observer.disconnect();
      if (animation) window.cancelAnimationFrame(animation);
      motion.removeEventListener("change", updateMotion);
      document.removeEventListener("visibilitychange", updateVisibility);
      window.removeEventListener("resize", queueResize);
      requestPaintRef.current = null;
    };
  }, []);

  return <canvas ref={canvasRef} aria-hidden="true" style={{ display: "block", width: "100%", height: "100%" }} />;
}
