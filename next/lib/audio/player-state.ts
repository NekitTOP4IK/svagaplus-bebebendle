import type { AudioScene, Outcome } from "@/lib/audio/soundtrack-manifest";

export type PanelMode = "hidden" | "auto" | "manual" | "collapsed";

export type PlaybackStatus = "idle" | "blocked" | "loading" | "playing" | "paused" | "error";

export type PlayerState = Readonly<{
  scene: AudioScene;
  status: PlaybackStatus;
  panelMode: PanelMode;
  trackIndex: number;
  sourceIndex: number;
  generation: number;
  outcome: Outcome | null;
  sessionPaused: boolean;
}>;

export type PlayerEvent =
  | Readonly<{ type: "SCENE_CHANGED"; scene: AudioScene; trackCount: number }>
  | Readonly<{ type: "TRACK_STARTED"; generation: number }>
  | Readonly<{ type: "AUTO_CLOSE"; generation: number }>
  | Readonly<{ type: "PANEL_TOGGLED" }>
  | Readonly<{ type: "PLAYBACK_PAUSED" }>
  | Readonly<{ type: "PLAYBACK_RESUMED" }>
  | Readonly<{ type: "TRACK_ENDED"; generation: number; trackCount: number }>
  | Readonly<{
      type: "SOURCE_FAILED";
      generation: number;
      fallback: Readonly<{ trackIndex: number; sourceIndex: number }> | null;
    }>
  | Readonly<{ type: "NEXT_TRACK"; trackCount: number }>
  | Readonly<{ type: "PREVIOUS_TRACK"; trackCount: number }>
  | Readonly<{ type: "OUTCOME_REQUESTED"; outcome: Outcome }>
  | Readonly<{ type: "PLAYBACK_BLOCKED" }>
  | Readonly<{ type: "PLAYBACK_ERROR"; generation: number }>;

export function createInitialPlayerState(): PlayerState {
  return {
    scene: "silent",
    status: "idle",
    panelMode: "hidden",
    trackIndex: 0,
    sourceIndex: 0,
    generation: 0,
    outcome: null,
    sessionPaused: false,
  };
}

function wrapIndex(index: number, trackCount: number): number {
  return ((index % trackCount) + trackCount) % trackCount;
}

export function playerReducer(state: PlayerState, event: PlayerEvent): PlayerState {
  switch (event.type) {
    case "SCENE_CHANGED":
      return {
        ...state,
        scene: event.scene,
        status: "idle",
        panelMode: "hidden",
        trackIndex: 0,
        sourceIndex: 0,
        generation: state.generation + 1,
        outcome: null,
        sessionPaused: false,
      };

    case "TRACK_STARTED":
      if (event.generation !== state.generation) return state;
      return { ...state, status: "playing", panelMode: "auto" };

    case "AUTO_CLOSE":
      if (event.generation !== state.generation || state.panelMode !== "auto") return state;
      return { ...state, panelMode: "collapsed" };

    case "PANEL_TOGGLED":
      switch (state.panelMode) {
        case "auto":
        case "manual":
          return { ...state, panelMode: "collapsed" };
        case "collapsed":
          return { ...state, panelMode: "manual" };
        case "hidden":
          return state;
      }
      return state;

    case "PLAYBACK_PAUSED":
      return { ...state, status: "paused", sessionPaused: true };

    case "PLAYBACK_RESUMED":
      return { ...state, status: "playing", sessionPaused: false };

    case "TRACK_ENDED":
      if (event.generation !== state.generation) return state;
      if (event.trackCount <= 1) {
        return { ...state, trackIndex: 0 };
      }
      return {
        ...state,
        trackIndex: wrapIndex(state.trackIndex + 1, event.trackCount),
        sourceIndex: 0,
        generation: state.generation + 1,
      };

    case "SOURCE_FAILED":
      if (event.generation !== state.generation) return state;
      if (event.fallback === null) {
        return { ...state, status: "error", panelMode: "hidden" };
      }
      return {
        ...state,
        status: "loading",
        trackIndex: event.fallback.trackIndex,
        sourceIndex: event.fallback.sourceIndex,
        generation: state.generation + 1,
      };

    case "NEXT_TRACK":
    case "PREVIOUS_TRACK":
      if (event.trackCount <= 0) return state;
      return {
        ...state,
        status: "loading",
        trackIndex: wrapIndex(
          state.trackIndex + (event.type === "NEXT_TRACK" ? 1 : -1),
          event.trackCount,
        ),
        sourceIndex: 0,
        generation: state.generation + 1,
      };

    case "OUTCOME_REQUESTED":
      return {
        ...state,
        panelMode: "auto",
        outcome: event.outcome,
        trackIndex: 0,
        sourceIndex: 0,
        generation: state.generation + 1,
      };

    case "PLAYBACK_BLOCKED":
      return { ...state, status: "blocked", panelMode: "hidden" };

    case "PLAYBACK_ERROR":
      if (event.generation !== state.generation) return state;
      return { ...state, status: "error" };
  }
}
