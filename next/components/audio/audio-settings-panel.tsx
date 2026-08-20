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

  useEffect(() => {
    setDraft(preferences);
  }, [preferences]);

  const volumePercent = Math.round(draft.musicVolume * 100);
  const isDirty = useMemo(
    () =>
      preferences.musicEnabled !== draft.musicEnabled ||
      preferences.musicVolume !== draft.musicVolume ||
      preferences.outcomeJinglesEnabled !== draft.outcomeJinglesEnabled ||
      preferences.autoCollapsePlayer !== draft.autoCollapsePlayer,
    [draft, preferences],
  );

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

        <section className="audio-settings__category" aria-labelledby="game-audio-settings-title">
          <header className="audio-settings__category-header">
            <span className="audio-settings__category-icon" aria-hidden="true">★</span>
            <div>
              <h2 id="game-audio-settings-title">Игровые события</h2>
              <p>Звуковая обратная связь во время игры.</p>
            </div>
          </header>
          <div className="audio-settings__group">
            <SettingSwitch
              title="Сигналы результата"
              description="Короткая отбивка после победы или поражения."
              checked={draft.outcomeJinglesEnabled}
              onToggle={() => setDraft((current) => ({
                ...current,
                outcomeJinglesEnabled: !current.outcomeJinglesEnabled,
              }))}
            />
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
        <span className="audio-settings__save-state" data-dirty={isDirty ? "true" : "false"}>
          {isDirty ? "Есть несохранённые изменения" : "Все изменения сохранены"}
        </span>
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
