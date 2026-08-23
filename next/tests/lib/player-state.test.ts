import { describe, expect, it } from "vitest";
import {
  createInitialPlayerState,
  playerReducer,
  type PlayerEvent,
  type PlayerState,
} from "@/lib/audio/player-state";

function reduce(events: PlayerEvent[], state: PlayerState = createInitialPlayerState()): PlayerState {
  return events.reduce((current, event) => playerReducer(current, event), state);
}

function inScene(scene: PlayerState["scene"], trackCount: number): PlayerState {
  return reduce([{ type: "SCENE_CHANGED", scene, trackCount }]);
}

function playing(overrides?: Partial<PlayerState>): PlayerState {
  const started = reduce(
    [
      { type: "SCENE_CHANGED", scene: "casual-menu", trackCount: 2 },
      { type: "TRACK_STARTED", generation: 1 },
    ],
    createInitialPlayerState(),
  );
  return { ...started, ...overrides };
}

describe("createInitialPlayerState", () => {
  it("starts silent, hidden and paused-free", () => {
    expect(createInitialPlayerState()).toEqual({
      scene: "silent",
      status: "idle",
      panelMode: "hidden",
      trackIndex: 0,
      sourceIndex: 0,
      generation: 0,
      outcome: null,
      sessionPaused: false,
    });
  });
});

describe("SCENE_CHANGED", () => {
  it("hides the panel when the scene has no tracks", () => {
    const state = reduce([{ type: "SCENE_CHANGED", scene: "casual-menu", trackCount: 0 }]);
    expect(state.panelMode).toBe("hidden");
    expect(state.scene).toBe("casual-menu");
  });

  it("resets indices, bumps generation and starts hidden with tracks", () => {
    const state = reduce([
      { type: "SCENE_CHANGED", scene: "casual-menu", trackCount: 2 },
      { type: "TRACK_STARTED", generation: 1 },
      { type: "NEXT_TRACK", trackCount: 2 },
      { type: "SCENE_CHANGED", scene: "ranked-game", trackCount: 3 },
    ]);

    expect(state.scene).toBe("ranked-game");
    expect(state.trackIndex).toBe(0);
    expect(state.sourceIndex).toBe(0);
    expect(state.panelMode).toBe("hidden");
    expect(state.generation).toBe(3);
  });

  it("clears a prior outcome but preserves an explicit session pause", () => {
    const paused = reduce([
      { type: "SCENE_CHANGED", scene: "casual-menu", trackCount: 2 },
      { type: "PLAYBACK_PAUSED" },
    ]);
    expect(paused.sessionPaused).toBe(true);

    const afterSceneChange = reduce(
      [{ type: "SCENE_CHANGED", scene: "ranked-game", trackCount: 3 }],
      paused,
    );
    expect(afterSceneChange.scene).toBe("ranked-game");
    expect(afterSceneChange.sessionPaused).toBe(true);
    expect(afterSceneChange.status).toBe("paused");
    expect(afterSceneChange.panelMode).toBe("collapsed");

    const state = reduce(
      [
        { type: "OUTCOME_REQUESTED", outcome: "victory" },
        { type: "SCENE_CHANGED", scene: "silent", trackCount: 0 },
      ],
      afterSceneChange,
    );

    expect(state.outcome).toBeNull();
    expect(state.sessionPaused).toBe(true);
  });
});

describe("TRACK_STARTED", () => {
  it("moves the panel to auto when the generation matches", () => {
    const state = playing();
    expect(state.panelMode).toBe("auto");
    expect(state.status).toBe("playing");
  });

  it("ignores starts from a stale generation", () => {
    const state = reduce(
      [{ type: "TRACK_STARTED", generation: 0 }],
      playing({ panelMode: "manual" }),
    );
    expect(state.panelMode).toBe("manual");
  });
});

describe("AUTO_CLOSE", () => {
  it("collapses an auto panel when the timer matches", () => {
    const state = reduce([{ type: "AUTO_CLOSE", generation: playing().generation }], playing());
    expect(state.panelMode).toBe("collapsed");
  });

  it("ignores a stale timer", () => {
    const state = reduce([{ type: "AUTO_CLOSE", generation: 0 }], playing());
    expect(state.panelMode).toBe("auto");
  });

  it("cannot close a manually opened panel", () => {
    const collapsed = reduce([{ type: "PANEL_TOGGLED" }], playing());
    const manual = reduce([{ type: "PANEL_TOGGLED" }], collapsed);
    expect(manual.panelMode).toBe("manual");

    const state = reduce([{ type: "AUTO_CLOSE", generation: manual.generation }], manual);
    expect(state.panelMode).toBe("manual");
  });
});

describe("PANEL_TOGGLED", () => {
  it("closes immediately when clicked during auto mode", () => {
    expect(reduce([{ type: "PANEL_TOGGLED" }], playing()).panelMode).toBe("collapsed");
  });

  it("opens manually from collapsed and closes again", () => {
    const collapsed = reduce([{ type: "PANEL_TOGGLED" }], playing());
    const reopened = reduce([{ type: "PANEL_TOGGLED" }], collapsed);
    expect(reopened.panelMode).toBe("manual");
    expect(reduce([{ type: "PANEL_TOGGLED" }], reopened).panelMode).toBe("collapsed");
  });

  it("never reveals the panel when hidden", () => {
    const state = reduce([{ type: "PANEL_TOGGLED" }], createInitialPlayerState());
    expect(state.panelMode).toBe("hidden");
  });
});

describe("PLAYBACK_PAUSED / PLAYBACK_RESUMED", () => {
  it("tracks the session pause flag", () => {
    const paused = reduce([{ type: "PLAYBACK_PAUSED" }], playing());
    expect(paused.sessionPaused).toBe(true);
    expect(paused.status).toBe("paused");

    const resumed = reduce([{ type: "PLAYBACK_RESUMED" }], paused);
    expect(resumed.sessionPaused).toBe(false);
    expect(resumed.status).toBe("playing");
  });
});

describe("TRACK_ENDED", () => {
  it("ignores stale generations", () => {
    const state = reduce([{ type: "TRACK_ENDED", generation: 0, trackCount: 2 }], playing());
    expect(state.trackIndex).toBe(0);
    expect(state.generation).toBe(playing().generation);
  });

  it("keeps index 0 without an auto-open bump for one-track playlists", () => {
    const base = reduce([
      { type: "SCENE_CHANGED", scene: "casual-menu", trackCount: 1 },
      { type: "TRACK_STARTED", generation: 1 },
    ]);
    const state = reduce([{ type: "TRACK_ENDED", generation: base.generation, trackCount: 1 }], base);

    expect(state.trackIndex).toBe(0);
    expect(state.generation).toBe(base.generation);
    expect(state.panelMode).toBe("auto");
  });

  it("advances and wraps multi-track playlists, resets source and bumps generation", () => {
    const base = playing();
    const advanced = reduce(
      [{ type: "TRACK_ENDED", generation: base.generation, trackCount: 2 }],
      base,
    );
    expect(advanced.trackIndex).toBe(1);
    expect(advanced.sourceIndex).toBe(0);
    expect(advanced.generation).toBe(base.generation + 1);

    const wrapped = reduce(
      [{ type: "TRACK_ENDED", generation: advanced.generation, trackCount: 2 }],
      advanced,
    );
    expect(wrapped.trackIndex).toBe(0);
    expect(wrapped.generation).toBe(advanced.generation + 1);
  });
});

describe("SOURCE_FAILED", () => {
  it("ignores stale generations", () => {
    const state = reduce(
      [
        {
          type: "SOURCE_FAILED",
          generation: 0,
          fallback: { trackIndex: 1, sourceIndex: 0 },
        },
      ],
      playing({ sourceIndex: 1 }),
    );
    expect(state.sourceIndex).toBe(1);
    expect(state.status).toBe("playing");
  });

  it("applies the provider-computed fallback and bumps generation", () => {
    const base = playing();
    const state = reduce(
      [
        {
          type: "SOURCE_FAILED",
          generation: base.generation,
          fallback: { trackIndex: 1, sourceIndex: 1 },
        },
      ],
      base,
    );

    expect(state.trackIndex).toBe(1);
    expect(state.sourceIndex).toBe(1);
    expect(state.generation).toBe(base.generation + 1);
    expect(state.status).not.toBe("error");
  });

  it("keeps a session pause when applying a source fallback", () => {
    const base = playing({ sessionPaused: true, status: "paused" });
    const state = reduce(
      [
        {
          type: "SOURCE_FAILED",
          generation: base.generation,
          fallback: { trackIndex: 1, sourceIndex: 1 },
        },
      ],
      base,
    );

    expect(state.trackIndex).toBe(1);
    expect(state.status).toBe("paused");
  });

  it("settles into a hidden error state when no fallback remains", () => {
    const base = playing();
    const state = reduce(
      [{ type: "SOURCE_FAILED", generation: base.generation, fallback: null }],
      base,
    );

    expect(state.status).toBe("error");
    expect(state.panelMode).toBe("hidden");
  });
});

describe("NEXT_TRACK / PREVIOUS_TRACK", () => {
  it("wraps forward and backward, resetting the source index", () => {
    const base = playing({ sourceIndex: 1 });

    const next = reduce([{ type: "NEXT_TRACK", trackCount: 2 }], base);
    expect(next.trackIndex).toBe(1);
    expect(next.sourceIndex).toBe(0);
    expect(next.generation).toBe(base.generation + 1);

    const previous = reduce([{ type: "PREVIOUS_TRACK", trackCount: 2 }], next);
    expect(previous.trackIndex).toBe(0);
    expect(previous.generation).toBe(next.generation + 1);

    const wrappedBack = reduce([{ type: "PREVIOUS_TRACK", trackCount: 2 }], previous);
    expect(wrappedBack.trackIndex).toBe(1);
  });

  it("does nothing for empty playlists", () => {
    const base = inScene("casual-menu", 0);
    const state = reduce([{ type: "NEXT_TRACK", trackCount: 0 }], base);
    expect(state.generation).toBe(base.generation);
  });

  it("stays paused when skipping tracks during a session pause", () => {
    const base = playing({ sessionPaused: true, status: "paused" });

    const next = reduce([{ type: "NEXT_TRACK", trackCount: 2 }], base);
    expect(next.trackIndex).toBe(1);
    expect(next.status).toBe("paused");
    expect(next.sessionPaused).toBe(true);

    const previous = reduce([{ type: "PREVIOUS_TRACK", trackCount: 2 }], next);
    expect(previous.trackIndex).toBe(0);
    expect(previous.status).toBe("paused");
  });
});

describe("OUTCOME_REQUESTED", () => {
  it("opens the panel for the jingle, stores the outcome, clears indices and bumps generation", () => {
    const base = playing();
    const state = reduce([{ type: "OUTCOME_REQUESTED", outcome: "defeat" }], base);

    expect(state.panelMode).toBe("auto");
    expect(state.outcome).toBe("defeat");
    expect(state.trackIndex).toBe(0);
    expect(state.sourceIndex).toBe(0);
    expect(state.generation).toBe(base.generation + 1);
  });
});

describe("PLAYBACK_ERROR", () => {
  it("marks the current generation as errored", () => {
    const base = playing();
    const state = reduce([{ type: "PLAYBACK_ERROR", generation: base.generation }], base);
    expect(state.status).toBe("error");
  });

  it("ignores stale generation errors", () => {
    const state = reduce([{ type: "PLAYBACK_ERROR", generation: 0 }], playing());
    expect(state.status).toBe("playing");
  });
});

describe("PLAYBACK_BLOCKED", () => {
  it("records an autoplay rejection without leaving the player panel open", () => {
    const state = reduce([{ type: "PLAYBACK_BLOCKED" }], playing());

    expect(state.status).toBe("blocked");
    expect(state.panelMode).toBe("hidden");
  });
});
