"use client";

import { useEffect, useId, useRef } from "react";
import { setAllPitchVisualEffects } from "@/lib/piano-pitch-visual-settings";
import { usePitchVisuals } from "./PitchVisuals";
import styles from "./PitchVisualSettings.module.css";

/** One site-level control: preferences survive changing labs and reloading. */
export function PitchVisualSettingsMenu() {
  const { settings, setSettings } = usePitchVisuals();
  const detailsRef = useRef<HTMLDetailsElement>(null);
  const descriptionId = useId();
  const modeId = useId();
  const allOn = settings.glowFlash && settings.noteFlash && settings.staffFlash;
  const allOff = !settings.glowFlash && !settings.noteFlash && !settings.staffFlash;

  useEffect(() => {
    const closeOutside = (event: PointerEvent) => {
      const details = detailsRef.current;
      if (details?.open && event.target instanceof Node && !details.contains(event.target)) {
        details.open = false;
      }
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      const details = detailsRef.current;
      if (event.key !== "Escape" || !details?.open) return;
      details.open = false;
      details.querySelector("summary")?.focus();
    };
    document.addEventListener("pointerdown", closeOutside);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOutside);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, []);

  return <details ref={detailsRef} className={styles.menu}>
    <summary aria-label="Site-wide pitch visuals">
      <span>Visuals</span>
      <small aria-hidden="true">{allOff ? "off" : ""}</small>
    </summary>
    <div className={styles.panel} role="group" aria-label="Site-wide pitch visual settings" aria-describedby={descriptionId}>
      <div className={styles.heading}>
        <strong>Pitch in the page</strong>
        <span>Saved across the site</span>
      </div>
      <div className={styles.presets} role="group" aria-label="Enable or disable all pitch effects">
        <button type="button" aria-pressed={allOn} onClick={() => setSettings(setAllPitchVisualEffects(settings, true))}>All on</button>
        <button type="button" aria-pressed={allOff} onClick={() => setSettings(setAllPitchVisualEffects(settings, false))}>All off</button>
      </div>
      <label className={styles.mode} htmlFor={modeId}>
        <span>Glow layout</span>
        <select id={modeId} value={settings.mode} onChange={(event) => setSettings({ ...settings, mode: event.target.value === "vertical" ? "vertical" : "staff" })}>
          <option value="staff">Staff-positioned</option>
          <option value="vertical">Vertical glow · original</option>
        </select>
      </label>
      <fieldset className={styles.effects}>
        <legend>Flash layers</legend>
        <label>
          <input type="checkbox" checked={settings.glowFlash} onChange={(event) => setSettings({ ...settings, glowFlash: event.target.checked })} />
          <span><strong>Glow flash</strong><small>Soft color across the whole page</small></span>
        </label>
        <label>
          <input type="checkbox" disabled={settings.mode === "vertical"} checked={settings.noteFlash} onChange={(event) => setSettings({ ...settings, noteFlash: event.target.checked })} />
          <span><strong>Tapered note flash</strong><small>A clear, pointed marker at the played pitch</small></span>
        </label>
        <label>
          <input type="checkbox" disabled={settings.mode === "vertical"} checked={settings.staffFlash} onChange={(event) => setSettings({ ...settings, staffFlash: event.target.checked })} />
          <span><strong>Staff flash</strong><small>Lines and clefs show the note’s position</small></span>
        </label>
      </fieldset>
      {settings.mode === "vertical" ? <small className={styles.modeNote}>Original vertical bands use Glow flash only. Your note and staff preferences are kept for staff layout.</small> : null}
      <p id={descriptionId}>Responds to your played keys, without adding sound. Hidden reference notes stay hidden.</p>
    </div>
  </details>;
}
