"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useReducer,
  useRef,
  useState,
  type ReactElement,
  type ReactNode,
} from "react";
import { usePathname } from "next/navigation";
import { useAudioPreferences } from "@/components/audio/audio-preferences-provider";
import { updateAudioPreferences } from "@/lib/audio/preferences";
import { SOUNDTRACK_MANIFEST, type AudioScene, type Outcome, type SoundtrackTrack } from "@/lib/audio/soundtrack-manifest";
import {
  applySoundtrackMetadata,
  DEFAULT_SOUNDTRACK_METADATA,
  type SoundtrackMetadata,
} from "@/lib/audio/soundtrack-metadata";
import {
  resolveRouteAudioScene,
  supportedSources,
  tracksForScene,
} from "@/lib/audio/soundtrack";
import {
  createInitialPlayerState,
  playerReducer,
  type PlayerEvent,
  type PlayerState,
} from "@/lib/audio/player-state";
import { SoundtrackPlayer } from "@/components/audio/soundtrack-player";

export type AudioController = Readonly<{
  state: PlayerState;
  currentTrack: SoundtrackTrack | null;
  trackCount: number;
  currentTime: number;
  duration: number;
  playerObscured: boolean;
  setScene(scene: AudioScene, ownerId: string): void;
  clearScene(ownerId: string): void;
  playOutcome(outcome: Outcome, eventId: string, resumeSceneAfter?: boolean): void;
  activatePlayback(silent?: boolean): void;
  restorePlaybackVolume(): void;
  setPlaybackActivationBlocked(blocked: boolean): void;
  setPanelHovering(hovering: boolean): void;
  setPlayerObscured(obscured: boolean): void;
  togglePanel(): void;
  togglePlayback(): void;
  seek(seconds: number): void;
  setVolume(volume: number): void;
  previousTrack(): void;
  nextTrack(): void;
}>;

const AudioControllerContext = createContext<AudioController | null>(null);

export function useAudioController(): AudioController {
  const controller = useContext(AudioControllerContext);
  if (!controller) {
    throw new Error("useAudioController must be used inside AudioProvider");
  }
  return controller;
}

/** Optional companion for client surfaces that are also rendered in isolation
 * by storybook/tests. The app provider is always present in the real shell. */
export function useOptionalAudioController(): AudioController | null {
  return useContext(AudioControllerContext);
}

type Candidate = Readonly<{ trackIndex: number; sourceIndex: number }>;
type PlayableTrack = Readonly<{ track: SoundtrackTrack }>;

const AUTO_CLOSE_MS = 3000;
const AUTO_CLOSE_HOVER_GRACE_MS = 150;
const TRACK_FADE_OUT_MS = 180;
const TRACK_FADE_IN_MS = 260;
const TRACK_FADE_STEP_MS = 16;

export function AudioProvider({
  children,
  soundtrackMetadata = DEFAULT_SOUNDTRACK_METADATA,
}: Readonly<{
  children: ReactNode;
  soundtrackMetadata?: SoundtrackMetadata;
}>): ReactElement {
  const pathname = usePathname();
  const preferences = useAudioPreferences();
  const soundtrackMetadataKey = JSON.stringify(soundtrackMetadata);

  const [baseState, dispatchReducer] = useReducer(playerReducer, undefined, createInitialPlayerState);
  const stateRef = useRef<PlayerState>(baseState);
  const dispatch = useCallback((event: PlayerEvent): void => {
    stateRef.current = playerReducer(stateRef.current, event);
    dispatchReducer(event);
  }, []);
  const state = baseState;

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const queueRef = useRef<readonly Candidate[]>([]);
  const sceneTracksRef = useRef<readonly PlayableTrack[]>([]);
  const jingleModeRef = useRef(false);
  const activeJingleRequestRef = useRef<number | null>(null);
  const jingleRequestCounterRef = useRef(0);
  const mediaGenerationRef = useRef<Readonly<{
    generation: number;
    jingleRequest: number | null;
  }> | null>(null);
  const activatedRef = useRef(false);
  const playbackActivationBlockedRef = useRef(false);
  const panelHoveringRef = useRef(false);
  const autoClosePendingRef = useRef(false);
  const hoverCloseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const volumeFadeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const volumeFadeTokenRef = useRef(0);
  const suppressMediaEventsRef = useRef(false);
  const playedOutcomeIdsRef = useRef(new Set<string>());
  const pendingSceneRef = useRef<{ scene: AudioScene; generation: number } | null>(null);
  const outcomeSceneRef = useRef<AudioScene | null>(null);
  const pendingSceneAfterOutcomeRef = useRef<AudioScene | null>(null);
  const deferSceneAfterOutcomeRef = useRef(false);
  const resumeSceneAfterOutcomeRef = useRef(false);

  const [owners, setOwners] = useState<ReadonlyMap<string, AudioScene>>(new Map());
  const [position, setPosition] = useState({ currentTime: 0, duration: 0 });
  const [playerObscured, setPlayerObscured] = useState(false);

  const cancelVolumeFade = useCallback((): void => {
    volumeFadeTokenRef.current += 1;
    if (volumeFadeTimerRef.current !== null) {
      clearTimeout(volumeFadeTimerRef.current);
      volumeFadeTimerRef.current = null;
    }
  }, []);

  const fadeVolume = useCallback((
    element: HTMLAudioElement,
    target: number,
    duration: number,
    token: number,
    onComplete?: () => void,
  ): void => {
    if (volumeFadeTimerRef.current !== null) {
      clearTimeout(volumeFadeTimerRef.current);
      volumeFadeTimerRef.current = null;
    }
    const from = element.volume;
    const startedAt = Date.now();
    const tick = (): void => {
      if (volumeFadeTokenRef.current !== token) return;
      const progress = Math.min(1, (Date.now() - startedAt) / duration);
      element.volume = from + (target - from) * progress;
      if (progress < 1) {
        volumeFadeTimerRef.current = setTimeout(tick, TRACK_FADE_STEP_MS);
        return;
      }
      volumeFadeTimerRef.current = null;
      onComplete?.();
    };
    tick();
  }, []);

  const clearMediaSource = useCallback((element: HTMLAudioElement): void => {
    cancelVolumeFade();
    suppressMediaEventsRef.current = true;
    element.pause();
    element.currentTime = 0;
    element.removeAttribute("src");
    suppressMediaEventsRef.current = false;
    mediaGenerationRef.current = null;
    setPosition({ currentTime: 0, duration: 0 });
  }, [cancelVolumeFade]);

  const getAudio = useCallback((): HTMLAudioElement => {
    if (!audioRef.current) {
      const element = new Audio();
      element.preload = "metadata";
      audioRef.current = element;
      attachMediaListeners(element);
    }
    return audioRef.current;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const canPlay = useCallback(
    (type: string): CanPlayTypeResult => getAudio().canPlayType(type),
    [getAudio],
  );

  const musicEnabledRef = useRef(preferences.musicEnabled);
  musicEnabledRef.current = preferences.musicEnabled;

  const attemptPlay = useCallback((): void => {
    if (!activatedRef.current || !musicEnabledRef.current) return;
    if (stateRef.current.sessionPaused && !jingleModeRef.current) return;
    const queue = queueRef.current;
    if (queue.length === 0) return;

    const { trackIndex, sourceIndex } = stateRef.current;
    const candidate =
      queue.find((item) => item.trackIndex === trackIndex && item.sourceIndex === sourceIndex) ??
      queue.find((item) => item.trackIndex === trackIndex) ??
      queue[0]!;
    const track = sceneTracksRef.current[candidate.trackIndex]?.track;
    const source = track?.sources[candidate.sourceIndex];
    if (!track || !source) return;

    const element = getAudio();
    const generation = stateRef.current.generation;
    pendingSceneRef.current = { scene: stateRef.current.scene, generation };
    const resolvedSource = new URL(source.src, window.location.href).href;
    const sourceChanged = element.src !== source.src && element.src !== resolvedSource;

    const playSelectedSource = (fadeToken?: number): void => {
      if (fadeToken !== undefined && volumeFadeTokenRef.current !== fadeToken) return;
      if (
        !activatedRef.current ||
        !musicEnabledRef.current ||
        (stateRef.current.sessionPaused && !jingleModeRef.current)
      ) {
        return;
      }
      suppressMediaEventsRef.current = true;
      if (sourceChanged) {
        element.pause();
        element.currentTime = 0;
        element.src = source.src;
        element.load();
        element.volume = 0;
        setPosition({ currentTime: 0, duration: 0 });
      }
      element.loop = sceneTracksRef.current.length === 1 && !jingleModeRef.current;
      mediaGenerationRef.current = { generation, jingleRequest: null };
      suppressMediaEventsRef.current = false;

      void element.play().then(
        () => {
          if (pendingSceneRef.current?.generation !== generation) return;
          dispatch({ type: "TRACK_STARTED", generation });
          if (sourceChanged && fadeToken !== undefined) {
            fadeVolume(element, preferences.musicVolume, TRACK_FADE_IN_MS, fadeToken);
          }
        },
        () => {
          if (pendingSceneRef.current?.generation !== generation) return;
          dispatch({ type: "PLAYBACK_BLOCKED" });
        },
      );
    };

    if (!sourceChanged) {
      playSelectedSource();
      return;
    }

    cancelVolumeFade();
    const fadeToken = volumeFadeTokenRef.current;
    if (!element.paused && element.src && element.volume > 0 && !element.muted) {
      fadeVolume(
        element,
        0,
        TRACK_FADE_OUT_MS,
        fadeToken,
        () => playSelectedSource(fadeToken),
      );
      return;
    }
    playSelectedSource(fadeToken);
  }, [cancelVolumeFade, dispatch, fadeVolume, getAudio, preferences.musicVolume]);

  const activatePlayback = useCallback((silent = false): void => {
    activatedRef.current = true;
    const element = getAudio();
    if (silent) {
      element.muted = true;
      element.volume = 0;
    } else {
      element.volume = preferences.musicVolume;
      element.muted = false;
    }
    attemptPlay();
  }, [attemptPlay, getAudio, preferences.musicVolume]);

  const restorePlaybackVolume = useCallback((): void => {
    const element = getAudio();
    element.volume = preferences.musicVolume;
    element.muted = false;
  }, [getAudio, preferences.musicVolume]);

  const setPlaybackActivationBlocked = useCallback((blocked: boolean): void => {
    playbackActivationBlockedRef.current = blocked;
  }, []);

  const applyScene = useCallback(
    (scene: AudioScene): void => {
      // A game owner is unmounted as the result screen appears. Preserve the
      // jingle while that owner is cleared; an explicit newer owner still
      // wins immediately (the provider marks only clearScene as deferred).
      if (
        deferSceneAfterOutcomeRef.current &&
        stateRef.current.outcome !== null &&
        jingleModeRef.current
      ) {
        pendingSceneAfterOutcomeRef.current = scene;
        deferSceneAfterOutcomeRef.current = false;
        return;
      }
      deferSceneAfterOutcomeRef.current = false;
      const element = getAudio();
      const manifest = applySoundtrackMetadata(SOUNDTRACK_MANIFEST, soundtrackMetadata);
      const tracks = tracksForScene(manifest, scene);
      const playableTracks: PlayableTrack[] = [];
      const queue: Candidate[] = [];
      tracks.forEach((track) => {
        const sourceIndices: number[] = [];
        track.sources.forEach((source, sourceIndex) => {
          if (canPlay(source.type) !== "") {
            sourceIndices.push(sourceIndex);
          }
        });
        if (sourceIndices.length === 0) return;
        const trackIndex = playableTracks.length;
        playableTracks.push({ track });
        sourceIndices.forEach((sourceIndex) => queue.push({ trackIndex, sourceIndex }));
      });

      sceneTracksRef.current = playableTracks;
      queueRef.current = queue;
      jingleModeRef.current = false;
      activeJingleRequestRef.current = null;
      jingleRequestCounterRef.current += 1;
      mediaGenerationRef.current = null;
      dispatch({ type: "SCENE_CHANGED", scene, trackCount: playableTracks.length });

      if (queue.length > 0) {
        const first = playableTracks[queue[0]!.trackIndex]!.track.sources[queue[0]!.sourceIndex]!;
        if (!activatedRef.current) {
          cancelVolumeFade();
          suppressMediaEventsRef.current = true;
          element.pause();
          element.currentTime = 0;
          element.src = first.src;
          element.load();
          suppressMediaEventsRef.current = false;
          setPosition({ currentTime: 0, duration: 0 });
        } else {
          attemptPlay();
        }
      } else {
        const clear = (): void => clearMediaSource(element);
        cancelVolumeFade();
        const fadeToken = volumeFadeTokenRef.current;
        if (!element.paused && element.src && element.volume > 0 && !element.muted) {
          fadeVolume(element, 0, TRACK_FADE_OUT_MS, fadeToken, clear);
        } else {
          clear();
        }
      }
    },
    [
      attemptPlay,
      canPlay,
      cancelVolumeFade,
      clearMediaSource,
      dispatch,
      fadeVolume,
      getAudio,
      soundtrackMetadata,
    ],
  );

  useEffect(() => () => cancelVolumeFade(), [cancelVolumeFade]);

  const finishOutcome = useCallback((element: HTMLAudioElement): void => {
    jingleModeRef.current = false;
    activeJingleRequestRef.current = null;
    clearMediaSource(element);
    const pendingScene = pendingSceneAfterOutcomeRef.current;
    pendingSceneAfterOutcomeRef.current = null;
    const outcomeScene = outcomeSceneRef.current;
    outcomeSceneRef.current = null;
    const resumeScene = resumeSceneAfterOutcomeRef.current;
    resumeSceneAfterOutcomeRef.current = false;
    const nextScene = pendingScene && pendingScene !== outcomeScene
      ? pendingScene
      : resumeScene
        ? outcomeScene
        : null;
    if (nextScene) applyScene(nextScene);
  }, [applyScene, clearMediaSource]);

  const attachMediaListeners = (element: HTMLAudioElement): void => {
    element.addEventListener("timeupdate", () => {
      setPosition({ currentTime: element.currentTime, duration: element.duration || 0 });
    });
    element.addEventListener("loadedmetadata", () => {
      setPosition({ currentTime: element.currentTime, duration: element.duration || 0 });
    });
    element.addEventListener("ended", () => {
      if (suppressMediaEventsRef.current) return;
      const media = mediaGenerationRef.current;
      const generation = stateRef.current.generation;
      if (!media || media.generation !== generation) return;
      if (jingleModeRef.current) {
        if (media.jingleRequest !== activeJingleRequestRef.current) return;
        finishOutcome(element);
        return;
      }
      dispatch({ type: "TRACK_ENDED", generation, trackCount: sceneTracksRef.current.length });
      attemptPlay();
    });
    element.addEventListener("error", () => {
      if (suppressMediaEventsRef.current) return;
      const media = mediaGenerationRef.current;
      const generation = stateRef.current.generation;
      if (!media || media.generation !== generation) return;
      const queue = queueRef.current;
      const current = stateRef.current;
      const cursor = queue.findIndex(
        (item) => item.trackIndex === current.trackIndex && item.sourceIndex === current.sourceIndex,
      );
      const fallback = cursor >= 0 && cursor + 1 < queue.length ? queue[cursor + 1]! : null;
      if (jingleModeRef.current) {
        if (media.jingleRequest !== activeJingleRequestRef.current) return;
        finishOutcome(element);
        return;
      }
      dispatch({ type: "SOURCE_FAILED", generation, fallback });
      if (fallback) attemptPlay();
    });
    element.addEventListener("pause", () => {
      if (suppressMediaEventsRef.current) return;
      if (!element.ended && !element.src) return;
      dispatch({ type: "PLAYBACK_PAUSED" });
    });
    element.addEventListener("play", () => {
      if (suppressMediaEventsRef.current) return;
      if (stateRef.current.sessionPaused && !jingleModeRef.current) {
        dispatch({ type: "PLAYBACK_RESUMED" });
      }
    });
  };

  const baseScene = resolveRouteAudioScene(pathname);
  const effectiveScene: AudioScene = [...owners.values()].pop() ?? baseScene;
  const ownersKey = [...owners.entries()].map(([id, scene]) => `${id}:${scene}`).join("|");

  const lastSceneKeyRef = useRef<string>("");
  useEffect(() => {
    const key = `${effectiveScene}|${ownersKey}|${soundtrackMetadataKey}`;
    if (lastSceneKeyRef.current === key) return;
    lastSceneKeyRef.current = key;
    applyScene(effectiveScene);
  }, [effectiveScene, ownersKey, soundtrackMetadataKey, applyScene]);

  useEffect(() => {
    const onGesture = (): void => {
      if (playbackActivationBlockedRef.current) return;

      document.removeEventListener("pointerdown", onGesture, true);
      document.removeEventListener("keydown", onGesture, true);
      document.removeEventListener("click", onGesture, true);
      if (activatedRef.current) return;
      activatePlayback();
    };
    document.addEventListener("pointerdown", onGesture, true);
    document.addEventListener("keydown", onGesture, true);
    document.addEventListener("click", onGesture, true);
    return () => {
      document.removeEventListener("pointerdown", onGesture, true);
      document.removeEventListener("keydown", onGesture, true);
      document.removeEventListener("click", onGesture, true);
    };
  }, [activatePlayback]);

  useEffect(() => {
    getAudio().volume = preferences.musicVolume;
  }, [preferences.musicVolume, getAudio]);

  const previousEnabledRef = useRef(preferences.musicEnabled);
  useEffect(() => {
    const element = getAudio();
    if (!preferences.musicEnabled) {
      cancelVolumeFade();
      suppressMediaEventsRef.current = true;
      element.pause();
      element.currentTime = 0;
      suppressMediaEventsRef.current = false;
      setPosition({ currentTime: 0, duration: 0 });
      if (previousEnabledRef.current) {
        dispatch({
          type: "SCENE_CHANGED",
          scene: stateRef.current.scene,
          trackCount: sceneTracksRef.current.length,
        });
      }
    } else if (!previousEnabledRef.current) {
      applyScene(stateRef.current.scene);
    }
    previousEnabledRef.current = preferences.musicEnabled;
  }, [preferences.musicEnabled, applyScene, cancelVolumeFade, dispatch, getAudio]);

  useEffect(() => {
    if (!preferences.autoCollapsePlayer || state.panelMode !== "auto") return;
    autoClosePendingRef.current = false;
    const generation = state.generation;
    const timer = setTimeout(() => {
      if (panelHoveringRef.current) {
        autoClosePendingRef.current = true;
        return;
      }
      dispatch({ type: "AUTO_CLOSE", generation });
    }, AUTO_CLOSE_MS);
    return () => {
      clearTimeout(timer);
      autoClosePendingRef.current = false;
      if (hoverCloseTimerRef.current !== null) {
        clearTimeout(hoverCloseTimerRef.current);
        hoverCloseTimerRef.current = null;
      }
    };
  }, [preferences.autoCollapsePlayer, state.panelMode, state.generation, dispatch]);

  const setPanelHovering = useCallback((hovering: boolean): void => {
    panelHoveringRef.current = hovering;
    if (hoverCloseTimerRef.current !== null) {
      clearTimeout(hoverCloseTimerRef.current);
      hoverCloseTimerRef.current = null;
    }
    if (hovering || !autoClosePendingRef.current) return;

    const generation = stateRef.current.generation;
    hoverCloseTimerRef.current = setTimeout(() => {
      hoverCloseTimerRef.current = null;
      if (panelHoveringRef.current || !autoClosePendingRef.current) return;
      autoClosePendingRef.current = false;
      dispatch({ type: "AUTO_CLOSE", generation });
    }, AUTO_CLOSE_HOVER_GRACE_MS);
  }, [dispatch]);

  const setScene = useCallback((scene: AudioScene, ownerId: string): void => {
    setOwners((current) => {
      const next = new Map([...current.entries()].filter(([id]) => id !== ownerId));
      next.set(ownerId, scene);
      return next;
    });
  }, []);

  const clearScene = useCallback((ownerId: string): void => {
    setOwners((current) => {
      if (!current.has(ownerId)) return current;
      if (jingleModeRef.current) deferSceneAfterOutcomeRef.current = true;
      const next = new Map(current);
      next.delete(ownerId);
      return next;
    });
  }, []);

  const playOutcome = useCallback(
    (outcome: Outcome, eventId: string, resumeSceneAfter = false): void => {
      if (playedOutcomeIdsRef.current.has(eventId)) return;
      playedOutcomeIdsRef.current.add(eventId);

      dispatch({ type: "OUTCOME_REQUESTED", outcome });
      outcomeSceneRef.current = stateRef.current.scene;
      pendingSceneAfterOutcomeRef.current = null;
      resumeSceneAfterOutcomeRef.current = resumeSceneAfter;

      const element = getAudio();
      clearMediaSource(element);
      queueRef.current = [];
      sceneTracksRef.current = [];
      jingleModeRef.current = false;
      activeJingleRequestRef.current = null;
      jingleRequestCounterRef.current += 1;

      const manifest = applySoundtrackMetadata(SOUNDTRACK_MANIFEST, soundtrackMetadata);
      const jingle = outcome === "victory" ? manifest.victoryJingle : manifest.defeatJingle;
      const source = jingle ? supportedSources(jingle, canPlay)[0] : undefined;
      if (!jingle || !source || !activatedRef.current || !musicEnabledRef.current) {
        if (resumeSceneAfter && outcomeSceneRef.current) {
          const scene = outcomeSceneRef.current;
          outcomeSceneRef.current = null;
          resumeSceneAfterOutcomeRef.current = false;
          applyScene(scene);
        }
        return;
      }

      const generation = stateRef.current.generation;
      const request = jingleRequestCounterRef.current + 1;
      jingleRequestCounterRef.current = request;
      jingleModeRef.current = true;
      activeJingleRequestRef.current = request;
      suppressMediaEventsRef.current = true;
      element.loop = false;
      element.src = source.src;
      element.load();
      suppressMediaEventsRef.current = false;
      mediaGenerationRef.current = { generation, jingleRequest: request };
      void element.play().catch(() => {
        const media = mediaGenerationRef.current;
        if (
          activeJingleRequestRef.current !== request ||
          media?.generation !== generation ||
          media.jingleRequest !== request ||
          stateRef.current.generation !== generation
        ) {
          return;
        }
        finishOutcome(element);
      });
    },
    [applyScene, canPlay, clearMediaSource, dispatch, finishOutcome, getAudio, soundtrackMetadata],
  );

  const togglePanel = useCallback((): void => {
    dispatch({ type: "PANEL_TOGGLED" });
  }, [dispatch]);

  const togglePlayback = useCallback((): void => {
    const element = getAudio();
    if (!element.src) return;
    if (!element.paused) {
      suppressMediaEventsRef.current = true;
      element.pause();
      suppressMediaEventsRef.current = false;
      dispatch({ type: "PLAYBACK_PAUSED" });
      return;
    }
    dispatch({ type: "PLAYBACK_RESUMED" });
    void element.play().catch(() => dispatch({ type: "PLAYBACK_BLOCKED" }));
  }, [dispatch, getAudio]);

  const seek = useCallback(
    (seconds: number): void => {
      const element = getAudio();
      if (!Number.isFinite(element.duration) || element.duration <= 0) return;
      element.currentTime = Math.min(Math.max(0, seconds), element.duration);
      setPosition({ currentTime: element.currentTime, duration: element.duration });
    },
    [getAudio],
  );

  const setVolume = useCallback(
    (volume: number): void => {
      const clamped = Math.min(1, Math.max(0, volume));
      getAudio().volume = clamped;
      updateAudioPreferences({ musicVolume: clamped });
    },
    [getAudio],
  );

  const previousTrack = useCallback((): void => {
    const count = sceneTracksRef.current.length;
    if (count === 0) return;
    dispatch({ type: "PREVIOUS_TRACK", trackCount: count });
    attemptPlay();
  }, [attemptPlay, dispatch]);

  const nextTrack = useCallback((): void => {
    const count = sceneTracksRef.current.length;
    if (count === 0) return;
    dispatch({ type: "NEXT_TRACK", trackCount: count });
    attemptPlay();
  }, [attemptPlay, dispatch]);

  const controller: AudioController = {
    state,
    currentTrack: sceneTracksRef.current[state.trackIndex]?.track ?? null,
    trackCount: sceneTracksRef.current.length,
    currentTime: position.currentTime,
    duration: position.duration,
    playerObscured,
    setScene,
    clearScene,
    playOutcome,
    activatePlayback,
    restorePlaybackVolume,
    setPlaybackActivationBlocked,
    setPanelHovering,
    setPlayerObscured,
    togglePanel,
    togglePlayback,
    seek,
    setVolume,
    previousTrack,
    nextTrack,
  };

  return (
    <AudioControllerContext.Provider value={controller}>
      {children}
      <SoundtrackPlayer />
    </AudioControllerContext.Provider>
  );
}
