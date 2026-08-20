"use client";

import {
  useEffect,
  useMemo,
  useState,
  type CSSProperties,
  type ReactElement,
} from "react";
import { useAudioPreferences } from "@/components/audio/audio-preferences-provider";
import {
  writeAudioPreferences,
  type AudioPreferences,
} from "@/lib/audio/preferences";

export function AudioSettingsPanel(): ReactElement {
  const preferences = useAudioPreferences();
  const [draft, setDraft] = useState<AudioPreferences>(preferences);

  useEffect(() => {
    setDraft(preferences);
  }, [preferences]);

  const volumePercent = Math.round(draft.musicVolume * 100);
  const isDirty = useMemo(
    () =>
      preferences.musicEnabled !== draft.musicEnabled ||
      preferences.musicVolume !== draft.musicVolume,
    [draft, preferences],
  );

  return (
    <section className="audio-settings pixel-container" aria-labelledby="audio-settings-title">
      <header className="audio-settings__header">
        <h1 id="audio-settings-title" className="pixel-text">Настройки</h1>
        <p>Музыка главного меню и игрового процесса.</p>
      </header>

      <div className="audio-settings__controls">
        <button
          type="button"
          role="switch"
          aria-checked={draft.musicEnabled}
          className="audio-settings__switch pixel-btn"
          onClick={() => setDraft((current) => ({
            ...current,
            musicEnabled: !current.musicEnabled,
          }))}
        >
          <span>Музыка</span>
          <strong>{draft.musicEnabled ? "Вкл" : "Выкл"}</strong>
        </button>

        <label
          className="audio-settings__volume"
          style={{ "--audio-volume-position": `${volumePercent}%` } as CSSProperties}
        >
          <span className="audio-settings__volume-thumb" aria-hidden="true" />
          <span className="audio-settings__volume-copy" aria-hidden="true">
            Громкость: {volumePercent}%
          </span>
          <input
            type="range"
            aria-label="Громкость"
            min={0}
            max={100}
            step={1}
            value={volumePercent}
            disabled={!draft.musicEnabled}
            onChange={(event) => setDraft((current) => ({
              ...current,
              musicVolume: Number(event.currentTarget.value) / 100,
            }))}
          />
        </label>
      </div>

      <footer className="audio-settings__actions">
        {isDirty ? (
          <button type="button" className="pixel-btn" onClick={() => setDraft(preferences)}>
            Отменить
          </button>
        ) : null}
        <button
          type="button"
          className="pixel-btn pixel-btn-ok"
          disabled={!isDirty}
          onClick={() => writeAudioPreferences(draft)}
        >
          Сохранить
        </button>
      </footer>
    </section>
  );
}
