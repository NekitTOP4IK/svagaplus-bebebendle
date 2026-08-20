"use client";

import { useState, useSyncExternalStore, type ReactElement } from "react";
import { useAudioController } from "@/components/audio/audio-provider";
import { useAudioPreferences } from "@/components/audio/audio-preferences-provider";
import "./soundtrack-player.css";

function formatTime(value: number): string {
  if (!Number.isFinite(value) || value < 0) return "0:00";
  const seconds = Math.floor(value);
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

function PlayIcon(): ReactElement {
  return <svg aria-hidden="true" viewBox="0 0 16 16"><path d="M4 2.5 13 8 4 13.5Z" fill="currentColor" /></svg>;
}

function PauseIcon(): ReactElement {
  return <svg aria-hidden="true" viewBox="0 0 16 16"><path d="M3 2h3v12H3zm7 0h3v12h-3z" fill="currentColor" /></svg>;
}

function MuteIcon(): ReactElement {
  return <svg aria-hidden="true" viewBox="0 0 16 16"><path d="M2 6h3l4-3v10l-4-3H2zM11 6l3 4m0-4-3 4" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="square" /></svg>;
}

function ArrowIcon({ direction }: Readonly<{ direction: "previous" | "next" }>): ReactElement {
  return <svg aria-hidden="true" viewBox="0 0 16 16"><path d={direction === "previous" ? "m10 2-6 6 6 6" : "m6 2 6 6-6 6"} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="square" strokeLinejoin="miter" /></svg>;
}

function volumeLabel(volume: number): string {
  return `Громкость: ${Math.round(volume * 100)}%`;
}

const PLAYER_HINT_KEY = "soundtrackPlayerHintSeen";
const PLAYER_HINT_EVENT = "soundtrack-player-hint-change";

function subscribeToHint(callback: () => void): () => void {
  window.addEventListener("storage", callback);
  window.addEventListener(PLAYER_HINT_EVENT, callback);
  return () => {
    window.removeEventListener("storage", callback);
    window.removeEventListener(PLAYER_HINT_EVENT, callback);
  };
}

function isHintSeen(): boolean {
  try {
    return window.localStorage.getItem(PLAYER_HINT_KEY) === "true";
  } catch {
    return false;
  }
}

function markHintSeen(): void {
  try {
    window.localStorage.setItem(PLAYER_HINT_KEY, "true");
  } catch {
    // The hint can still disappear for this render in privacy mode.
  }
  window.dispatchEvent(new Event(PLAYER_HINT_EVENT));
}

/**
 * Visual shell for the single, app-level AudioProvider. It deliberately owns no
 * media element: all transport state stays in audio-provider.tsx.
 */
export function SoundtrackPlayer(): ReactElement | null {
  const controller = useAudioController();
  const preferences = useAudioPreferences();
  const { state, currentTrack, trackCount, currentTime, duration } = controller;
  const hintSeen = useSyncExternalStore(subscribeToHint, isHintSeen, () => true);
  const [hintDismissed, setHintDismissed] = useState(false);

  const shouldHide =
    !preferences.musicEnabled ||
    state.scene === "silent" ||
    state.outcome !== null ||
    state.panelMode === "hidden" ||
    currentTrack === null ||
    trackCount === 0;

  if (shouldHide) return null;

  const isExpanded = state.panelMode === "auto" || state.panelMode === "manual";
  const isPlaying = state.status === "playing";
  const isMuted = preferences.musicVolume === 0;
  const safeDuration = Number.isFinite(duration) && duration > 0 ? duration : 0;
  const safeCurrentTime = Math.min(Math.max(0, currentTime), safeDuration || currentTime || 0);
  const volume = Math.min(1, Math.max(0, preferences.musicVolume));
  const Icon = isMuted ? MuteIcon : isPlaying ? PauseIcon : PlayIcon;
  const showHint = state.panelMode === "collapsed" && !hintSeen && !hintDismissed;

  const changeVolume = (delta: number): void => {
    controller.setVolume(Math.min(1, Math.max(0, volume + delta)));
  };

  const togglePanel = (): void => {
    if (showHint) {
      setHintDismissed(true);
      markHintSeen();
    }
    controller.togglePanel();
  };

  return (
    <>
      {showHint && (
        <div className="soundtrack-player__hint" role="status">
          Плеер свернулся. Нажми сюда, чтобы развернуть.
        </div>
      )}
      <aside
        className={`soundtrack-player${isExpanded ? " soundtrack-player--expanded" : " soundtrack-player--collapsed"}`}
        data-panel-mode={state.panelMode}
        data-playback={state.status}
        data-hint={showHint ? "true" : undefined}
        aria-label="Музыкальный плеер"
      >
        <button
          className="soundtrack-player__handle"
          type="button"
          onClick={togglePanel}
          aria-label={isExpanded ? "Свернуть плеер" : "Открыть плеер"}
          aria-expanded={isExpanded}
        >
          <Icon />
        </button>

        <section className="soundtrack-player__panel" aria-hidden={!isExpanded}>
          <div className="soundtrack-player__track">
            <strong>{currentTrack.title}</strong>
            {currentTrack.artist ? <span>{currentTrack.artist}</span> : null}
          </div>

          <div className="soundtrack-player__transport">
            {trackCount > 1 ? (
              <button type="button" className="soundtrack-player__icon-button" onClick={controller.previousTrack} aria-label="Предыдущий трек">
                <ArrowIcon direction="previous" />
              </button>
            ) : null}
            <button
              type="button"
              className="soundtrack-player__icon-button soundtrack-player__playback"
              onClick={controller.togglePlayback}
              aria-label={isPlaying ? "Поставить на паузу" : "Продолжить воспроизведение"}
            >
              {isPlaying ? <PauseIcon /> : <PlayIcon />}
            </button>
            {trackCount > 1 ? (
              <button type="button" className="soundtrack-player__icon-button" onClick={controller.nextTrack} aria-label="Следующий трек">
                <ArrowIcon direction="next" />
              </button>
            ) : null}
          </div>

          <label className="soundtrack-player__progress">
            <span className="sr-only">Позиция трека</span>
            <input
              type="range"
              aria-label="Позиция трека"
              min="0"
              max={safeDuration || 1}
              step="1"
              value={safeCurrentTime}
              disabled={safeDuration === 0}
              onChange={(event) => controller.seek(Number(event.currentTarget.value))}
            />
            <span aria-hidden="true">{formatTime(safeCurrentTime)} / {formatTime(safeDuration)}</span>
          </label>

          <div className="soundtrack-player__volume" aria-label={volumeLabel(volume)}>
            <button type="button" onClick={() => changeVolume(-0.1)} aria-label="Уменьшить громкость">
              <ArrowIcon direction="previous" />
            </button>
            <input
              type="range"
              min="0"
              max="1"
              step="0.05"
              value={volume}
              onChange={(event) => controller.setVolume(Number(event.currentTarget.value))}
              aria-label={volumeLabel(volume)}
            />
            <button type="button" onClick={() => changeVolume(0.1)} aria-label="Увеличить громкость">
              <ArrowIcon direction="next" />
            </button>
          </div>
        </section>
      </aside>
    </>
  );
}
