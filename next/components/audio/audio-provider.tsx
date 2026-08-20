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
  setScene(scene: AudioScene, ownerId: string): void;
  clearScene(ownerId: string): void;
  playOutcome(outcome: Outcome, eventId: string): void;
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

export function AudioProvider({ children }: Readonly<{ children: ReactNode }>): ReactElement {
  const pathname = usePathname();
  const preferences = useAudioPreferences();

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
  const suppressMediaEventsRef = useRef(false);
  const playedOutcomeIdsRef = useRef(new Set<string>());
  const pendingSceneRef = useRef<{ scene: AudioScene; generation: number } | null>(null);
  const outcomeSceneRef = useRef<AudioScene | null>(null);
  const pendingSceneAfterOutcomeRef = useRef<AudioScene | null>(null);
  const deferSceneAfterOutcomeRef = useRef(false);

  const [owners, setOwners] = useState<ReadonlyMap<string, AudioScene>>(new Map());
  const [position, setPosition] = useState({ currentTime: 0, duration: 0 });

  const clearMediaSource = useCallback((element: HTMLAudioElement): void => {
    suppressMediaEventsRef.current = true;
    element.pause();
    element.currentTime = 0;
    element.removeAttribute("src");
    suppressMediaEventsRef.current = false;
    mediaGenerationRef.current = null;
    setPosition({ currentTime: 0, duration: 0 });
  }, []);

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
  const outcomeJinglesEnabledRef = useRef(preferences.outcomeJinglesEnabled);
  outcomeJinglesEnabledRef.current = preferences.outcomeJinglesEnabled;

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
    suppressMediaEventsRef.current = true;
    if (element.src !== source.src) {
      element.src = source.src;
      element.load();
    }
    element.loop = sceneTracksRef.current.length === 1 && !jingleModeRef.current;
    mediaGenerationRef.current = { generation, jingleRequest: null };
    suppressMediaEventsRef.current = false;

    void element.play().then(
      () => {
        if (pendingSceneRef.current?.generation !== generation) return;
        dispatch({ type: "TRACK_STARTED", generation });
      },
      () => {
        if (pendingSceneRef.current?.generation !== generation) return;
        dispatch({ type: "PLAYBACK_BLOCKED" });
      },
    );
  }, [dispatch, getAudio]);

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
      const tracks = tracksForScene(SOUNDTRACK_MANIFEST, scene);
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

      suppressMediaEventsRef.current = true;
      element.pause();
      element.currentTime = 0;
      if (queue.length > 0) {
        const first = playableTracks[queue[0]!.trackIndex]!.track.sources[queue[0]!.sourceIndex]!;
        element.src = first.src;
        element.load();
      } else {
        element.removeAttribute("src");
      }
      suppressMediaEventsRef.current = false;
      setPosition({ currentTime: 0, duration: 0 });
      if (queue.length > 0) attemptPlay();
    },
    [attemptPlay, canPlay, dispatch, getAudio],
  );

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
        jingleModeRef.current = false;
        activeJingleRequestRef.current = null;
        clearMediaSource(element);
        const pendingScene = pendingSceneAfterOutcomeRef.current;
        pendingSceneAfterOutcomeRef.current = null;
        const outcomeScene = outcomeSceneRef.current;
        outcomeSceneRef.current = null;
        if (pendingScene && pendingScene !== outcomeScene) applyScene(pendingScene);
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
        jingleModeRef.current = false;
        activeJingleRequestRef.current = null;
        clearMediaSource(element);
        const pendingScene = pendingSceneAfterOutcomeRef.current;
        pendingSceneAfterOutcomeRef.current = null;
        const outcomeScene = outcomeSceneRef.current;
        outcomeSceneRef.current = null;
        if (pendingScene && pendingScene !== outcomeScene) applyScene(pendingScene);
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
    const key = `${effectiveScene}|${ownersKey}`;
    if (lastSceneKeyRef.current === key) return;
    lastSceneKeyRef.current = key;
    applyScene(effectiveScene);
  }, [effectiveScene, ownersKey, applyScene]);

  useEffect(() => {
    const onGesture = (): void => {
      if (activatedRef.current) return;
      activatedRef.current = true;
      document.removeEventListener("pointerdown", onGesture);
      document.removeEventListener("keydown", onGesture);
      attemptPlay();
    };
    document.addEventListener("pointerdown", onGesture);
    document.addEventListener("keydown", onGesture);
    return () => {
      document.removeEventListener("pointerdown", onGesture);
      document.removeEventListener("keydown", onGesture);
    };
  }, [attemptPlay]);

  useEffect(() => {
    getAudio().volume = preferences.musicVolume;
  }, [preferences.musicVolume, getAudio]);

  const previousEnabledRef = useRef(preferences.musicEnabled);
  useEffect(() => {
    const element = getAudio();
    if (!preferences.musicEnabled) {
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
  }, [preferences.musicEnabled, applyScene, dispatch, getAudio]);

  useEffect(() => {
    if (!preferences.autoCollapsePlayer || state.panelMode !== "auto") return;
    const generation = state.generation;
    const timer = setTimeout(() => {
      dispatch({ type: "AUTO_CLOSE", generation });
    }, AUTO_CLOSE_MS);
    return () => clearTimeout(timer);
  }, [preferences.autoCollapsePlayer, state.panelMode, state.generation, dispatch]);

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
    (outcome: Outcome, eventId: string): void => {
      if (playedOutcomeIdsRef.current.has(eventId)) return;
      playedOutcomeIdsRef.current.add(eventId);

      dispatch({ type: "OUTCOME_REQUESTED", outcome });
      outcomeSceneRef.current = stateRef.current.scene;
      pendingSceneAfterOutcomeRef.current = null;

      const element = getAudio();
      clearMediaSource(element);
      queueRef.current = [];
      sceneTracksRef.current = [];
      jingleModeRef.current = false;
      activeJingleRequestRef.current = null;
      jingleRequestCounterRef.current += 1;

      const jingle = outcome === "victory" ? SOUNDTRACK_MANIFEST.victoryJingle : SOUNDTRACK_MANIFEST.defeatJingle;
      const source = jingle ? supportedSources(jingle, canPlay)[0] : undefined;
      if (
        !jingle ||
        !source ||
        !activatedRef.current ||
        !musicEnabledRef.current ||
        !outcomeJinglesEnabledRef.current
      ) {
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
        jingleModeRef.current = false;
        activeJingleRequestRef.current = null;
        clearMediaSource(element);
      });
    },
    [canPlay, clearMediaSource, dispatch, getAudio],
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
    setScene,
    clearScene,
    playOutcome,
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
