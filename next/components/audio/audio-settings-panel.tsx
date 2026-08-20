"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactElement,
} from "react";
import { useAudioPreferences } from "@/components/audio/audio-preferences-provider";
import {
  writeAudioPreferences,
  type AudioPreferences,
} from "@/lib/audio/preferences";

type SettingSwitchProps = Readonly<{
  title: string;
  description: string;
  checked: boolean;
  onToggle(): void;
}>;

function SettingSwitch({
  title,
  description,
  checked,
  onToggle,
}: SettingSwitchProps): ReactElement {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      className="audio-settings__setting-row"
      onClick={onToggle}
    >
      <span className="audio-settings__setting-copy">
        <strong>{title}</strong>
        <small>{description}</small>
      </span>
      <span className="audio-settings__switch-state" data-enabled={checked ? "true" : "false"}>
        <i aria-hidden="true" />
        {checked ? "Вкл" : "Выкл"}
      </span>
    </button>
  );
}

export function AudioSettingsPanel(): ReactElement {
  const preferences = useAudioPreferences();
  const [draft, setDraft] = useState<AudioPreferences>(preferences);
  const [saveNoticeVisible, setSaveNoticeVisible] = useState(false);
  const saveNoticeTimerRef = useRef<number | null>(null);

  useEffect(() => {
    setDraft(preferences);
  }, [preferences]);

  const volumePercent = Math.round(draft.musicVolume * 100);
  const isDirty = useMemo(
    () =>
      preferences.musicEnabled !== draft.musicEnabled ||
      preferences.musicVolume !== draft.musicVolume ||
      preferences.autoCollapsePlayer !== draft.autoCollapsePlayer,
    [draft, preferences],
  );

  useEffect(() => () => {
    if (saveNoticeTimerRef.current !== null) {
      window.clearTimeout(saveNoticeTimerRef.current);
    }
  }, []);

  useEffect(() => {
    if (!isDirty) return;
    setSaveNoticeVisible(false);
    if (saveNoticeTimerRef.current !== null) {
      window.clearTimeout(saveNoticeTimerRef.current);
      saveNoticeTimerRef.current = null;
    }
  }, [isDirty]);

  const savePreferences = (): void => {
    writeAudioPreferences(draft);
    setSaveNoticeVisible(true);
    if (saveNoticeTimerRef.current !== null) {
      window.clearTimeout(saveNoticeTimerRef.current);
    }
    saveNoticeTimerRef.current = window.setTimeout(() => {
      setSaveNoticeVisible(false);
      saveNoticeTimerRef.current = null;
    }, 5000);
  };

  return (
    <section className="audio-settings pixel-container" aria-labelledby="settings-title">
      <div className="audio-settings__categories">
        <section className="audio-settings__category" aria-labelledby="music-settings-title">
          <header className="audio-settings__category-header">
            <span className="audio-settings__category-icon" aria-hidden="true">♫</span>
            <div>
              <h2 id="music-settings-title">Музыка</h2>
              <p>Саундтрек меню и игровых режимов.</p>
            </div>
          </header>

          <div className="audio-settings__group">
            <SettingSwitch
              title="Фоновая музыка"
              description="Включает весь саундтрек игры."
              checked={draft.musicEnabled}
              onToggle={() => setDraft((current) => ({
                ...current,
                musicEnabled: !current.musicEnabled,
              }))}
            />

            <div className="audio-settings__nested" data-disabled={!draft.musicEnabled ? "true" : "false"}>
              <span className="audio-settings__branch" aria-hidden="true" />
              <div className="audio-settings__nested-content">
                <span className="audio-settings__nested-label">Громкость музыки</span>
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
                    onChange={(event) => {
                      const musicVolume = Number(event.currentTarget.value) / 100;

                      setDraft((current) => ({
                        ...current,
                        musicVolume,
                      }));
                    }}
                  />
                </label>
              </div>
            </div>
          </div>
        </section>

        <section className="audio-settings__category" aria-labelledby="player-settings-title">
          <header className="audio-settings__category-header">
            <span className="audio-settings__category-icon" aria-hidden="true">▣</span>
            <div>
              <h2 id="player-settings-title">Плеер</h2>
              <p>Поведение панели с текущим треком.</p>
            </div>
          </header>
          <div className="audio-settings__group">
            <SettingSwitch
              title="Автосворачивание"
              description="Сворачивать плеер через несколько секунд после запуска."
              checked={draft.autoCollapsePlayer}
              onToggle={() => setDraft((current) => ({
                ...current,
                autoCollapsePlayer: !current.autoCollapsePlayer,
              }))}
            />
          </div>
        </section>
      </div>

      <footer className="audio-settings__actions">
        <span
          className="audio-settings__save-state"
          role="status"
          aria-hidden={!saveNoticeVisible}
          data-visible={saveNoticeVisible ? "true" : "false"}
        >
          Изменения сохранены
        </span>
        <div className="audio-settings__action-buttons">
          <button
            type="button"
            className="audio-settings__save pixel-btn pixel-btn-ok"
            disabled={!isDirty}
            onClick={savePreferences}
          >
            Сохранить
          </button>
          <span
            className="audio-settings__cancel-slot"
            data-visible={isDirty ? "true" : "false"}
          >
            <button
              type="button"
              className="pixel-btn pixel-btn-danger"
              disabled={!isDirty}
              aria-hidden={!isDirty}
              tabIndex={isDirty ? 0 : -1}
              onClick={() => setDraft(preferences)}
            >
              Отменить
            </button>
          </span>
        </div>
      </footer>
    </section>
  );
}
