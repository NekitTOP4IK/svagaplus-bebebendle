"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type PointerEvent as ReactPointerEvent,
  type ReactElement,
} from "react";
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

function PanelIcon({ expanded }: Readonly<{ expanded: boolean }>): ReactElement {
  if (expanded) {
    return <svg aria-hidden="true" viewBox="0 0 16 16"><path d="m5 2 6 6-6 6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="square" strokeLinejoin="miter" /></svg>;
  }
  return (
    <svg aria-hidden="true" viewBox="0 0 16 16">
      <path
        d="M5.5 3.5 12.5 2v8.25M5.5 3.5v8"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="square"
        strokeLinejoin="miter"
      />
      <circle cx="3.5" cy="12" r="2.25" fill="currentColor" />
      <circle cx="10.5" cy="10.75" r="2.25" fill="currentColor" />
    </svg>
  );
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

type PlayerOffsetY = number;

const PLAYER_POSITION_KEY = "soundtrackPlayerPosition.v1";
const DRAG_THRESHOLD_PX = 4;
const VIEWPORT_MARGIN_PX = 8;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function readPlayerPosition(): PlayerOffsetY | null {
  try {
    const stored = window.localStorage.getItem(PLAYER_POSITION_KEY);
    if (!stored) return null;
    const parsed: unknown = JSON.parse(stored);
    // The first draggable release stored {x, y}; keep accepting its y offset.
    const raw = typeof parsed === "number" ? parsed : isRecord(parsed) ? parsed.y : null;
    return typeof raw === "number" && Number.isFinite(raw) ? raw : null;
  } catch {
    return null;
  }
}

function writePlayerPosition(offsetY: PlayerOffsetY): void {
  try {
    window.localStorage.setItem(PLAYER_POSITION_KEY, JSON.stringify(offsetY));
  } catch {
    // Position persistence is best-effort (privacy mode etc).
  }
}

function clampOffsetY(offsetY: number, height: number): number {
  const maxY = Math.max(VIEWPORT_MARGIN_PX, window.innerHeight - height - VIEWPORT_MARGIN_PX);
  return Math.min(Math.max(VIEWPORT_MARGIN_PX, offsetY), maxY);
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

  const dockRef = useRef<HTMLElement | null>(null);
  // Lazy read is safe: the dock renders nothing until playback starts, so the
  // server markup never depends on this value.
  const [position, setPosition] = useState<PlayerOffsetY | null>(() =>
    typeof window === "undefined" ? null : readPlayerPosition(),
  );
  const [dragging, setDragging] = useState(false);
  const draggedRef = useRef(false);
  const lastPositionRef = useRef<PlayerOffsetY | null>(null);
  const dragStateRef = useRef<{
    pointerId: number;
    startY: number;
    originY: number;
    height: number;
  } | null>(null);

  const showHint = state.panelMode === "collapsed" && !hintSeen && !hintDismissed;

  useEffect(() => {
    const onResize = (): void => {
      setPosition((current) => {
        if (current === null || !dockRef.current) return current;
        return clampOffsetY(current, dockRef.current.offsetHeight);
      });
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  const dismissHint = useCallback((): void => {
    setHintDismissed(true);
    markHintSeen();
  }, []);

  const onHandlePointerDown = (event: ReactPointerEvent<HTMLButtonElement>): void => {
    if (event.pointerType === "mouse" && event.button !== 0) return;
    const dock = dockRef.current;
    if (!dock) return;
    // The dock stays anchored to the right edge: dragging adjusts its bottom
    // offset only, so the horizontal collapse slide keeps its physics. Cursor
    // deltas are inverted into bottom-offset space (down = closer to bottom).
    const rect = dock.getBoundingClientRect();
    dragStateRef.current = {
      pointerId: event.pointerId,
      startY: event.clientY,
      originY: window.innerHeight - rect.bottom,
      height: dock.offsetHeight,
    };
    draggedRef.current = false;
    if (typeof event.currentTarget.setPointerCapture === "function") {
      try {
        event.currentTarget.setPointerCapture(event.pointerId);
      } catch {
        // Capture is best-effort; dragging still works while over the handle.
      }
    }
  };

  const onHandlePointerMove = (event: ReactPointerEvent<HTMLButtonElement>): void => {
    const drag = dragStateRef.current;
    if (!drag || event.pointerId !== drag.pointerId) return;
    const dy = event.clientY - drag.startY;
    if (!draggedRef.current && Math.abs(dy) < DRAG_THRESHOLD_PX) return;
    if (!draggedRef.current) {
      draggedRef.current = true;
      setDragging(true);
      if (showHint) dismissHint();
    }
    const next = clampOffsetY(drag.originY - dy, drag.height);
    lastPositionRef.current = next;
    setPosition(next);
  };

  const finishDrag = (event: ReactPointerEvent<HTMLButtonElement>, persist: boolean): void => {
    const drag = dragStateRef.current;
    if (!drag || event.pointerId !== drag.pointerId) return;
    dragStateRef.current = null;
    setDragging(false);
    const handle = event.currentTarget;
    if (
      typeof handle.hasPointerCapture === "function" &&
      typeof handle.releasePointerCapture === "function" &&
      handle.hasPointerCapture(drag.pointerId)
    ) {
      try {
        handle.releasePointerCapture(drag.pointerId);
      } catch {
        // The capture may already be gone; nothing else to clean up.
      }
    }
    if (persist && draggedRef.current && lastPositionRef.current !== null) {
      writePlayerPosition(lastPositionRef.current);
    }
  };

  const onHandlePointerUp = (event: ReactPointerEvent<HTMLButtonElement>): void => {
    finishDrag(event, true);
  };

  const onHandlePointerCancel = (event: ReactPointerEvent<HTMLButtonElement>): void => {
    finishDrag(event, true);
  };

  const onHandleClick = (): void => {
    // A completed drag ends with a click event; swallow it so moving the
    // player never toggles it. Keyboard activation passes through.
    if (draggedRef.current) {
      draggedRef.current = false;
      return;
    }
    if (showHint) dismissHint();
    controller.togglePanel();
  };

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
  const safeDuration = Number.isFinite(duration) && duration > 0 ? duration : 0;
  const safeCurrentTime = Math.min(Math.max(0, currentTime), safeDuration || currentTime || 0);
  const volume = Math.min(1, Math.max(0, preferences.musicVolume));

  return (
    <>
      {showHint && (
        <div className="soundtrack-player__hint" role="status">
          Плеер свернулся. Нажми сюда, чтобы развернуть.
        </div>
      )}
      <aside
        ref={dockRef}
        className={`soundtrack-player${isExpanded ? " soundtrack-player--expanded" : " soundtrack-player--collapsed"}${dragging ? " soundtrack-player--dragging" : ""}${controller.playerObscured ? " soundtrack-player--obscured" : ""}`}
        style={position !== null ? { bottom: `${Math.round(position)}px` } : undefined}
        data-panel-mode={state.panelMode}
        data-playback={state.status}
        data-hint={showHint ? "true" : undefined}
        aria-label="Музыкальный плеер"
        onPointerEnter={() => controller.setPanelHovering(true)}
        onPointerLeave={() => controller.setPanelHovering(false)}
      >
        <button
          className="soundtrack-player__handle"
          type="button"
          onClick={onHandleClick}
          onPointerDown={onHandlePointerDown}
          onPointerMove={onHandlePointerMove}
          onPointerUp={onHandlePointerUp}
          onPointerCancel={onHandlePointerCancel}
          aria-label={isExpanded ? "Свернуть плеер" : "Открыть плеер"}
          aria-expanded={isExpanded}
          title="Перетащи вверх или вниз, чтобы переместить плеер"
        >
          <span className="soundtrack-player__handle-icon"><PanelIcon expanded={isExpanded} /></span>
          <span className="soundtrack-player__handle-status" aria-hidden="true" />
        </button>

        <section className="soundtrack-player__panel" aria-hidden={!isExpanded}>
          <div className="soundtrack-player__track">
            <span className="soundtrack-player__eyebrow">Сейчас играет</span>
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

          <div className="soundtrack-player__volume">
            <span><span className="soundtrack-player__volume-label">Громкость</span> {Math.round(volume * 100)}%</span>
            <input
              type="range"
              min="0"
              max="1"
              step="0.05"
              value={volume}
              onChange={(event) => controller.setVolume(Number(event.currentTarget.value))}
              aria-label={volumeLabel(volume)}
            />
          </div>
        </section>
      </aside>
    </>
  );
}
