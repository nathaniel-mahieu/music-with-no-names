"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { getPitchClassColor, PITCH_CLASS_COLORS } from "@/lib/piano-pitch-color";
import { GRAND_STAFF_LINES, pitchStaffLedgerSteps, pitchStaffStep } from "@/lib/piano-pitch-staff";
import { DEFAULT_PITCH_VISUAL_SETTINGS, PITCH_VISUAL_SETTINGS_STORAGE_KEY, normalizePitchVisualSettings, parsePitchVisualSettings, serializePitchVisualSettings, type PitchVisualSettings } from "@/lib/piano-pitch-visual-settings";
import styles from "./PitchVisuals.module.css";

const STAFF_NOTES = Array.from({ length: 128 }, (_, midi) => ({
  midi, ...getPitchClassColor(midi), step: pitchStaffStep(midi), ledgerSteps: pitchStaffLedgerSteps(midi),
}));
// A convex, note-shaped lens: a readable center with long, pointed shoulders.
const TAPERED_NOTE_PATH = "M0 16 C180 16 400 0 500 0 C600 0 820 16 1000 16 C820 16 600 32 500 32 C400 32 180 16 0 16Z";

type MidiVisualEvent = { data: Uint8Array };
type MidiVisualInput = {
  addEventListener?: (type: "midimessage", listener: (event: MidiVisualEvent) => void) => void;
  removeEventListener?: (type: "midimessage", listener: (event: MidiVisualEvent) => void) => void;
};
type PitchVisualContextValue = {
  settings: PitchVisualSettings;
  setSettings: (settings: PitchVisualSettings) => void;
  flashNotes: (notes: readonly number[]) => void;
  clearFlashes: () => void;
  setPianoActive: (active: boolean) => void;
  rememberMidiInput: (input: MidiVisualInput | null) => void;
};
const PitchVisualContext = createContext<PitchVisualContextValue | null>(null);

export function usePitchVisuals() {
  const value = useContext(PitchVisualContext);
  if (!value) throw new Error("Pitch visuals require PitchVisualProvider");
  return value;
}

function StaffLines() {
  return <>
    {GRAND_STAFF_LINES.map(({ midi, step, clef }) => <i key={midi} data-clef={clef} data-staff-step={step} style={{ "--pitch-staff-position": step } as CSSProperties} />)}
    <span className={`${styles.clef} ${styles.treble}`}>𝄞</span>
    <span className={`${styles.clef} ${styles.bass}`}>𝄢</span>
  </>;
}

/** Outside every HUD stacking context; only deliberate played/revealed notes enter here. */
export function PitchVisualProvider({ children }: { children: ReactNode }) {
  const [settings, setSettingsState] = useState<PitchVisualSettings>(DEFAULT_PITCH_VISUAL_SETTINGS);
  const settingsRef = useRef(settings);
  const foregroundStaffRef = useRef<HTMLDivElement>(null);
  const glowRef = useRef<HTMLDivElement>(null);
  const noteRef = useRef<HTMLDivElement>(null);
  const pianoActiveRef = useRef(false);
  const midiCleanupRef = useRef<(() => void) | null>(null);
  const midiInputRef = useRef<MidiVisualInput | null>(null);

  const clearFlashes = useCallback(() => {
    for (const ref of [foregroundStaffRef, glowRef, noteRef]) {
      ref.current?.getAnimations?.({ subtree: true }).forEach((animation) => animation.cancel());
    }
  }, []);

  const setSettings = useCallback((next: PitchVisualSettings) => {
    const normalized = normalizePitchVisualSettings(next);
    clearFlashes();
    settingsRef.current = normalized;
    setSettingsState(normalized);
    try { window.localStorage.setItem(PITCH_VISUAL_SETTINGS_STORAGE_KEY, serializePitchVisualSettings(normalized)); }
    catch { /* Preferences still work in memory when local storage is blocked. */ }
  }, [clearFlashes]);

  useEffect(() => {
    try {
      const saved = parsePitchVisualSettings(window.localStorage.getItem(PITCH_VISUAL_SETTINGS_STORAGE_KEY));
      settingsRef.current = saved;
      setSettingsState(saved);
    } catch { /* The initial defaults remain usable without storage. */ }
    const sync = (event: StorageEvent) => {
      if (event.key !== PITCH_VISUAL_SETTINGS_STORAGE_KEY && event.key !== null) return;
      clearFlashes();
      const saved = parsePitchVisualSettings(event.newValue);
      settingsRef.current = saved;
      setSettingsState(saved);
    };
    window.addEventListener("storage", sync);
    return () => { window.removeEventListener("storage", sync); clearFlashes(); midiCleanupRef.current?.(); };
  }, [clearFlashes]);

  const flashNotes = useCallback((notes: readonly number[]) => {
    const current = settingsRef.current;
    // A setting is saved synchronously; wait for its matching DOM layout before
    // addressing layers (128 written pitches vs 12 vertical pitch classes).
    if (glowRef.current?.dataset.mode !== current.mode) return;
    if (!current.glowFlash && !current.noteFlash && !current.staffFlash) return;
    const valid = new Set(notes.filter((note) => Number.isInteger(note) && note >= 0 && note <= 127));
    if (!valid.size) return;
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const animate = (element: Element | null | undefined, peak: number, hold: number) => {
      if (!element?.animate) return;
      element.getAnimations().forEach((animation) => animation.cancel());
      const frames = reducedMotion
        ? [{ opacity: peak * .72 }, { opacity: peak * .72 }]
        : [{ opacity: peak }, { opacity: hold, offset: .22 }, { opacity: 0 }];
      element.animate(frames, { duration: reducedMotion ? 330 : 820, easing: "ease-out" });
    };
    const staffMode = current.mode === "staff";
    if (current.glowFlash) {
      const attacks = staffMode ? valid : new Set([...valid].map((note) => note % 12));
      attacks.forEach((note) => animate(glowRef.current?.children.item(note), .42, .31));
    }
    if (staffMode && current.noteFlash) valid.forEach((note) => animate(noteRef.current?.children.item(note), .86, .65));
    if (staffMode && current.staffFlash) {
      animate(foregroundStaffRef.current, .62, .42);
    }
  }, []);

  const setPianoActive = useCallback((active: boolean) => { pianoActiveRef.current = active; clearFlashes(); }, [clearFlashes]);
  const rememberMidiInput = useCallback((input: MidiVisualInput | null) => {
    if (input === midiInputRef.current) return;
    midiCleanupRef.current?.();
    midiCleanupRef.current = null;
    midiInputRef.current = input;
    if (!input?.addEventListener || !input.removeEventListener) return;
    // Keep the already-authorized, selected keyboard visual outside Piano too.
    // Piano itself uses its immediate attack path; never duplicate those flashes.
    const onMessage = ({ data }: MidiVisualEvent) => {
      if (!pianoActiveRef.current && data.length >= 3 && (data[0] & 0xf0) === 0x90 && data[2] > 0) flashNotes([data[1]]);
    };
    input.addEventListener("midimessage", onMessage);
    midiCleanupRef.current = () => input.removeEventListener?.("midimessage", onMessage);
  }, [flashNotes]);

  const value = useMemo(() => ({ settings, setSettings, flashNotes, clearFlashes, setPianoActive, rememberMidiInput }), [settings, setSettings, flashNotes, clearFlashes, setPianoActive, rememberMidiInput]);
  const staffVisible = settings.mode === "staff" && settings.staffFlash;
  return <PitchVisualContext.Provider value={value}>
    <div className={`${styles.staff} ${styles.baseline}`} hidden={!staffVisible} aria-hidden="true" data-pitch-staff="background"><StaffLines /></div>
    {children}
    <div ref={foregroundStaffRef} className={`${styles.staff} ${styles.foregroundStaff}`} hidden={!staffVisible} aria-hidden="true" data-pitch-staff="foreground-flash"><StaffLines /></div>
    <div ref={glowRef} className={`${styles.glow} ${settings.mode === "staff" ? styles.staffGlow : styles.verticalGlow}`} data-pitch-visual="glow" data-mode={settings.mode} hidden={!settings.glowFlash} aria-hidden="true">
      {settings.mode === "staff" ? STAFF_NOTES.map(({ midi, pitchClass, color, step }) => <span key={midi} data-midi-note={midi} data-pitch-class={pitchClass} data-staff-step={step} style={{ "--pitch-glow-color": color, "--pitch-staff-position": step } as CSSProperties}><i className={styles.wash} /></span>) : PITCH_CLASS_COLORS.map(({ pitchClass, color }) => <span key={pitchClass} data-pitch-class={pitchClass} style={{ "--pitch-glow-color": color, "--pitch-glow-position": `${16 + pitchClass * 68 / 11}%` } as CSSProperties} />)}
    </div>
    <div ref={noteRef} className={styles.notes} data-pitch-visual="note" hidden={settings.mode !== "staff" || !settings.noteFlash} aria-hidden="true">
      {STAFF_NOTES.map(({ midi, pitchClass, color, step, ledgerSteps }) => <span key={midi} data-midi-note={midi} data-staff-step={step} style={{ "--pitch-glow-color": color, "--pitch-staff-position": step } as CSSProperties}>
        <svg className={styles.quarterNote} data-quarter-note={midi} viewBox="-2.3 -8 4.6 16" data-stem={step <= (midi >= 60 ? -6 : 6) ? "down" : "up"}>
          {ledgerSteps.map((ledgerStep) => <line key={ledgerStep} x1="-1.6" x2="1.6" y1={ledgerStep - step} y2={ledgerStep - step} className={styles.quarterLedger} />)}
          <ellipse cx="0" cy="0" rx="1.15" ry=".78" transform="rotate(-18)" />
          <path className={styles.quarterStem} d={step <= (midi >= 60 ? -6 : 6) ? "M-1 .24V7" : "M1 -.24V-7"} />
          {[1, 3, 6, 8, 10].includes(pitchClass) ? <text x="-2.4" y=".7" className={styles.quarterAccidental}>♯</text> : null}
        </svg>
        <svg className={styles.taperedNote} viewBox="0 0 1000 32" preserveAspectRatio="none"><path d={TAPERED_NOTE_PATH} /></svg>
        {ledgerSteps.map((ledgerStep) => <i className={styles.ledger} key={ledgerStep} style={{ "--pitch-staff-position": ledgerStep } as CSSProperties} />)}
        <i className={styles.notehead} />
        {[1, 3, 6, 8, 10].includes(pitchClass) ? <b className={styles.accidental}>♯</b> : null}
      </span>)}
    </div>
  </PitchVisualContext.Provider>;
}
