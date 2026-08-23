// @vitest-environment jsdom
/* eslint-disable react-hooks/globals */
import { act, fireEvent, render, waitFor } from "@testing-library/react";
import { useEffect, type ReactElement, type ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AudioProvider, useAudioController } from "@/components/audio/audio-provider";
import type { AudioController } from "@/components/audio/audio-provider";
import { AudioPreferencesProvider } from "@/components/audio/audio-preferences-provider";
import { updateAudioPreferences } from "@/lib/audio/preferences";

const manifest = vi.hoisted(() => ({
  casualMenu: [
    {
      id: "casual-menu-a",
      title: "Casual Menu A",
      sources: [
        { src: "/soundtrack/casual-menu-a.ogg", type: "audio/ogg" },
        { src: "/soundtrack/casual-menu-a.mp3", type: "audio/mpeg" },
      ],
    },
    {
      id: "casual-menu-b",
      title: "Casual Menu B",
      sources: [
        { src: "/soundtrack/casual-menu-b.ogg", type: "audio/ogg" },
        { src: "/soundtrack/casual-menu-b.mp3", type: "audio/mpeg" },
      ],
    },
  ],
  casualGame: [
    {
      id: "casual-game-a",
      title: "Casual Game A",
      sources: [{ src: "/soundtrack/casual-game-a.mp3", type: "audio/mpeg" }],
    },
  ],
  rankedMenu: [],
  rankedGame: [
    {
      id: "ranked-game-a",
      title: "Ranked Game A",
      sources: [{ src: "/soundtrack/ranked-game-a.mp3", type: "audio/mpeg" }],
    },
  ],
  victoryJingle: {
    id: "victory-jingle",
    title: "Victory",
    sources: [{ src: "/soundtrack/victory.mp3", type: "audio/mpeg" }],
  },
  defeatJingle: {
    id: "defeat-jingle",
    title: "Defeat",
    sources: [{ src: "/soundtrack/defeat.mp3", type: "audio/mpeg" }],
  },
}));

vi.mock("@/lib/audio/soundtrack-manifest", () => ({
  get SOUNDTRACK_MANIFEST() {
    return manifest;
  },
}));

const ORIGINAL_CASUAL_MENU = vi.hoisted(
  () => manifest.casualMenu,
);
const ORIGINAL_VICTORY_JINGLE = vi.hoisted(() => manifest.victoryJingle);

const route = vi.hoisted(() => ({ value: "/" }));

vi.mock("next/navigation", () => ({
  usePathname: () => route.value,
}));

class FakeAudio {
  static instances: FakeAudio[] = [];
  static supportedType: (type: string) => CanPlayTypeResult = () => "probably";

  src = "";
  volume = 1;
  muted = false;
  currentTime = 0;
  duration = 164;
  paused = true;
  loop = false;

  play = vi.fn((): Promise<void> => {
    this.paused = false;
    return Promise.resolve();
  });
  pause = vi.fn((): void => {
    this.paused = true;
  });
  load = vi.fn((): void => {});
  canPlayType = vi.fn((type: string): CanPlayTypeResult => FakeAudio.supportedType(type));
  removeAttribute = vi.fn((name: string): void => {
    if (name === "src") this.src = "";
  });

  private listeners = new Map<string, Set<() => void>>();

  constructor() {
    FakeAudio.instances.push(this);
  }

  addEventListener(type: string, listener: () => void): void {
    if (!this.listeners.has(type)) this.listeners.set(type, new Set());
    this.listeners.get(type)!.add(listener);
  }

  removeEventListener(type: string, listener: () => void): void {
    this.listeners.get(type)?.delete(listener);
  }

  emit(type: string): void {
    this.listeners.get(type)?.forEach((listener) => listener());
  }
}

function audio(): FakeAudio {
  expect(FakeAudio.instances.length).toBeGreaterThan(0);
  return FakeAudio.instances[FakeAudio.instances.length - 1]!;
}

function SceneProbe({ scene, ownerId }: Readonly<{ scene: string; ownerId: string }>): null {
  const { setScene, clearScene } = useAudioController();
  useEffect(() => {
    setScene(scene as never, ownerId);
    return () => clearScene(ownerId);
  }, [scene, ownerId, setScene, clearScene]);
  return null;
}

function wrap(children: ReactNode): ReactElement {
  return (
    <AudioPreferencesProvider>
      <AudioProvider>{children}</AudioProvider>
    </AudioPreferencesProvider>
  );
}

beforeEach(() => {
  window.localStorage.clear();
  route.value = "/";
  manifest.casualMenu = ORIGINAL_CASUAL_MENU;
  manifest.victoryJingle = ORIGINAL_VICTORY_JINGLE;
  FakeAudio.instances = [];
  FakeAudio.supportedType = () => "probably";
  vi.stubGlobal("Audio", FakeAudio);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("single audio element and user activation", () => {
  it("creates exactly one audio element and never plays before a user gesture", async () => {
    render(wrap(<span>home</span>));

    expect(FakeAudio.instances).toHaveLength(1);
    expect(audio().play).not.toHaveBeenCalled();
    expect(audio().src).toBe("/soundtrack/casual-menu-a.ogg");

    fireEvent.pointerDown(document.body);

    expect(audio().play).toHaveBeenCalledTimes(1);
  });

  it("invokes play synchronously during the gesture stack", () => {
    render(wrap(<span>home</span>));

    fireEvent.pointerDown(document.body);

    expect(audio().play).toHaveBeenCalledTimes(1);
  });

  it("accepts a keydown as the activation gesture too", () => {
    render(wrap(<span>home</span>));

    fireEvent.keyDown(document.body);

    expect(audio().play).toHaveBeenCalledTimes(1);
  });

  it("accepts a click as an activation gesture", () => {
    render(wrap(<span>home</span>));

    fireEvent.click(document.body);

    expect(audio().play).toHaveBeenCalledTimes(1);
  });

  it("restores the configured volume when normal activation follows a silent one", async () => {
    let controller!: AudioController;
    function Grab(): null {
      controller = useAudioController();
      return null;
    }
    render(wrap(<Grab />));

    act(() => controller.activatePlayback(true));

    expect(audio().play).toHaveBeenCalledTimes(1);
    expect(audio().volume).toBe(0);
    expect(audio().muted).toBe(true);
    await waitFor(() => expect(controller.state.panelMode).toBe("auto"));

    act(() => controller.activatePlayback());
    expect(audio().volume).toBe(0.5);
    expect(audio().muted).toBe(false);
  });

  it("ignores global gestures while entrance activation is blocked", () => {
    let controller!: AudioController;
    function Grab(): null {
      controller = useAudioController();
      return null;
    }
    render(wrap(<Grab />));

    act(() => controller.setPlaybackActivationBlocked(true));
    fireEvent.pointerDown(document.body);
    fireEvent.click(document.body);
    fireEvent.keyDown(document.body, { key: "Enter" });

    expect(audio().play).not.toHaveBeenCalled();

    act(() => controller.setPlaybackActivationBlocked(false));
    fireEvent.click(document.body);

    expect(audio().play).toHaveBeenCalledTimes(1);
  });

  it("moves to blocked when autoplay is rejected and does not retry on later gestures", async () => {
    let controller!: AudioController;
    function Grab(): null {
      controller = useAudioController();
      return null;
    }
    render(wrap(<Grab />));
    audio().play = vi.fn(() => Promise.reject(new DOMException("denied", "NotAllowedError")));

    fireEvent.pointerDown(document.body);

    // Wait for the rejection to propagate through the play promise; paused flips
    // synchronously inside playSelectedSource, so it cannot gate the dispatch.
    await waitFor(() => expect(controller.state.status).toBe("blocked"));
    expect(audio().paused).toBe(true);
    expect(controller.state.panelMode).toBe("hidden");

    fireEvent.pointerDown(document.body);
    await Promise.resolve();

    expect(audio().play).toHaveBeenCalledTimes(1);
  });
});

describe("scene ownership", () => {
  it("keeps the last registered scene while mounted owners overlap", () => {
    render(
      wrap(
        <>
          <SceneProbe scene="ranked-game" ownerId="owner-a" />
          <SceneProbe scene="casual-game" ownerId="owner-b" />
        </>,
      ),
    );

    expect(audio().src).toBe("/soundtrack/casual-game-a.mp3");
  });

  it("restores the newer remaining owner when an older owner unmounts", () => {
    const { rerender } = render(
      wrap(
        <>
          <SceneProbe scene="ranked-game" ownerId="owner-a" />
          <SceneProbe scene="casual-game" ownerId="owner-b" />
        </>,
      ),
    );

    rerender(wrap(<SceneProbe scene="casual-game" ownerId="owner-b" />));

    expect(audio().src).toBe("/soundtrack/casual-game-a.mp3");
  });

  it("returns to the route base scene when explicit owners unmount", () => {
    const { rerender } = render(wrap(<SceneProbe scene="casual-game" ownerId="owner-a" />));

    rerender(wrap(<span>home</span>));

    expect(audio().src).toBe("/soundtrack/casual-menu-a.ogg");
  });
});

describe("session pause", () => {
  it("keeps playback paused across scene changes and resumes the new scene on demand", async () => {
    let controller!: AudioController;
    function Grab(): null {
      controller = useAudioController();
      return null;
    }
    render(wrap(<Grab />));
    fireEvent.pointerDown(document.body);
    await act(async () => Promise.resolve());
    act(() => controller.togglePlayback());
    expect(audio().paused).toBe(true);
    const playCalls = audio().play.mock.calls.length;

    act(() => controller.setScene("casual-game", "probe"));
    await waitFor(() => expect(audio().src).toBe("/soundtrack/casual-game-a.mp3"));

    expect(audio().play.mock.calls.length).toBe(playCalls);
    expect(audio().paused).toBe(true);
    expect(controller.state.status).toBe("paused");

    act(() => controller.togglePlayback());
    expect(audio().play.mock.calls.length).toBe(playCalls + 1);
  });

  it("swaps to the selected track without autoplay when skipping while paused", async () => {
    let controller!: AudioController;
    function Grab(): null {
      controller = useAudioController();
      return null;
    }
    render(wrap(<Grab />));
    fireEvent.pointerDown(document.body);
    await act(async () => Promise.resolve());
    act(() => controller.setVolume(0.8));
    act(() => controller.togglePlayback());
    const playCalls = audio().play.mock.calls.length;

    act(() => controller.nextTrack());

    expect(audio().src).toBe("/soundtrack/casual-menu-b.ogg");
    expect(audio().volume).toBe(0.8);
    expect(audio().paused).toBe(true);
    expect(audio().play.mock.calls.length).toBe(playCalls);
    expect(controller.state.status).toBe("paused");

    act(() => controller.togglePlayback());
    expect(audio().play.mock.calls.length).toBe(playCalls + 1);
  });

  it("fades auto-advanced tracks back to the saved volume instead of the default", async () => {
    vi.useFakeTimers();
    try {
      let controller!: AudioController;
      function Grab(): null {
        controller = useAudioController();
        return null;
      }
      render(wrap(<Grab />));
      fireEvent.pointerDown(document.body);
      await act(async () => Promise.resolve());
      act(() => controller.setVolume(0.9));

      act(() => audio().emit("ended"));
      expect(controller.state.trackIndex).toBe(1);

      act(() => vi.advanceTimersByTime(200));
      await act(async () => Promise.resolve());
      expect(audio().src).toBe("/soundtrack/casual-menu-b.ogg");
      expect(audio().volume).toBeLessThan(0.9);

      act(() => vi.advanceTimersByTime(400));
      await act(async () => Promise.resolve());
      expect(audio().volume).toBeCloseTo(0.9);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("empty manifest", () => {
  it("makes no source assignment and never requests URLs", async () => {
    manifest.casualMenu = [];
    render(wrap(<span>home</span>));

    expect(audio().src).toBe("");
    expect(audio().load).not.toHaveBeenCalled();

    fireEvent.pointerDown(document.body);

    expect(audio().play).not.toHaveBeenCalled();
  });
});

describe("source selection", () => {
  it("keeps the original source index when the first listed format is unsupported", () => {
    FakeAudio.supportedType = (type: string): CanPlayTypeResult =>
      type === "audio/mpeg" ? "probably" : "";

    render(wrap(<span>home</span>));

    expect(audio().src).toBe("/soundtrack/casual-menu-a.mp3");
  });

  it("counts a track once even when it has fallback formats", () => {
    let controller!: AudioController;
    function Grab(): null {
      controller = useAudioController();
      return null;
    }
    manifest.casualMenu = [ORIGINAL_CASUAL_MENU[0]!];
    render(wrap(<Grab />));

    fireEvent.pointerDown(document.body);

    expect(controller.trackCount).toBe(1);
    expect(audio().loop).toBe(true);
  });

  it("skips by playable tracks rather than by fallback source variants with a soft transition", async () => {
    vi.useFakeTimers();
    let controller!: AudioController;
    function Grab(): null {
      controller = useAudioController();
      return null;
    }
    try {
      FakeAudio.supportedType = (type: string): CanPlayTypeResult =>
        type === "audio/mpeg" ? "probably" : "";
      render(wrap(<Grab />));
      fireEvent.pointerDown(document.body);
      await act(async () => Promise.resolve());

      act(() => controller.nextTrack());

      expect(controller.trackCount).toBe(2);
      expect(audio().src).toBe("/soundtrack/casual-menu-a.mp3");

      act(() => vi.advanceTimersByTime(200));
      await act(async () => Promise.resolve());
      expect(audio().src).toBe("/soundtrack/casual-menu-b.mp3");
      expect(audio().volume).toBeLessThan(0.5);

      act(() => vi.advanceTimersByTime(300));
      expect(audio().volume).toBeCloseTo(0.5);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("preferences", () => {
  it("applies the default volume of 0.5", () => {
    render(wrap(<span>home</span>));

    expect(audio().volume).toBe(0.5);
  });

  it("does not start playback while music is disabled", () => {
    updateAudioPreferences({ musicEnabled: false });
    render(wrap(<span>home</span>));

    fireEvent.pointerDown(document.body);

    expect(audio().play).not.toHaveBeenCalled();
  });

  it("pauses and hides when music is disabled mid-session, restarts from index 0 on re-enable", () => {
    const { } = render(wrap(<span>home</span>));
    fireEvent.pointerDown(document.body);
    expect(audio().play).toHaveBeenCalledTimes(1);

    act(() => updateAudioPreferences({ musicEnabled: false }));

    expect(audio().pause).toHaveBeenCalled();

    act(() => updateAudioPreferences({ musicEnabled: true }));

    expect(audio().src).toBe("/soundtrack/casual-menu-a.ogg");
    expect(audio().currentTime).toBe(0);
  });

  it("writes volume changes directly to the element; zero mutes but keeps the player", () => {
    render(wrap(<span>home</span>));

    act(() => updateAudioPreferences({ musicVolume: 0 }));

    expect(audio().volume).toBe(0);
    expect(audio().src).toBe("/soundtrack/casual-menu-a.ogg");
  });

  it("persists volume changes made through the audio controller", () => {
    let controller!: AudioController;
    function Grab(): null {
      controller = useAudioController();
      return null;
    }
    render(wrap(<Grab />));

    act(() => controller.setVolume(0.25));

    expect(audio().volume).toBe(0.25);
    expect(JSON.parse(window.localStorage.getItem("bebebendle.audio-preferences.v1") ?? "{}")).toMatchObject({
      musicVolume: 0.25,
    });
  });

  it("keeps the player expanded when auto-collapse is disabled", async () => {
    vi.useFakeTimers();
    try {
      let controller!: AudioController;
      function Grab(): null {
        controller = useAudioController();
        return null;
      }
      updateAudioPreferences({ autoCollapsePlayer: false });
      render(wrap(<Grab />));

      fireEvent.pointerDown(document.body);
      await act(async () => Promise.resolve());
      expect(controller.state.panelMode).toBe("auto");

      act(() => vi.advanceTimersByTime(3500));
      expect(controller.state.panelMode).toBe("auto");
    } finally {
      vi.useRealTimers();
    }
  });

  it("waits for hover to end before auto-collapsing, with a short re-entry grace", async () => {
    vi.useFakeTimers();
    try {
      let controller!: AudioController;
      function Grab(): null {
        controller = useAudioController();
        return null;
      }
      render(wrap(<Grab />));
      fireEvent.pointerDown(document.body);
      await act(async () => Promise.resolve());

      act(() => controller.setPanelHovering(true));
      act(() => vi.advanceTimersByTime(3000));
      expect(controller.state.panelMode).toBe("auto");

      act(() => controller.setPanelHovering(false));
      act(() => vi.advanceTimersByTime(100));
      act(() => controller.setPanelHovering(true));
      act(() => vi.advanceTimersByTime(100));
      expect(controller.state.panelMode).toBe("auto");

      act(() => controller.setPanelHovering(false));
      act(() => vi.advanceTimersByTime(149));
      expect(controller.state.panelMode).toBe("auto");
      act(() => vi.advanceTimersByTime(1));
      expect(controller.state.panelMode).toBe("collapsed");
    } finally {
      vi.useRealTimers();
    }
  });

  it("continues the same menu track across home, settings and admin navigation", async () => {
    let controller!: AudioController;
    function Grab(): null {
      controller = useAudioController();
      return null;
    }
    const view = render(wrap(<Grab />));
    fireEvent.pointerDown(document.body);
    await act(async () => Promise.resolve());
    audio().currentTime = 23;
    const playCount = audio().play.mock.calls.length;

    route.value = "/settings";
    view.rerender(wrap(<Grab />));
    route.value = "/admin/announcements";
    view.rerender(wrap(<Grab />));

    expect(controller.state.scene).toBe("casual-menu");
    expect(audio().src).toBe("/soundtrack/casual-menu-a.ogg");
    expect(audio().currentTime).toBe(23);
    expect(audio().play).toHaveBeenCalledTimes(playCount);
  });
});

describe("outcome jingles", () => {
  it("plays a jingle once for a repeated event id", () => {
    let controller!: AudioController;
    function Grab(): null {
      controller = useAudioController();
      return null;
    }
    render(wrap(<Grab />));
    fireEvent.pointerDown(document.body);

    act(() => controller.playOutcome("victory", "casual-result:2026-08-18"));

    expect(audio().src).toBe("/soundtrack/victory.mp3");
    const jinglePlays = audio().play.mock.calls.length;

    act(() => controller.playOutcome("victory", "casual-result:2026-08-18"));

    expect(audio().play.mock.calls.length).toBe(jinglePlays);
  });

  it("restores the configured volume before playing a jingle after a scene fade", () => {
    let controller!: AudioController;
    function Grab(): null {
      controller = useAudioController();
      return null;
    }
    render(wrap(<Grab />));
    fireEvent.pointerDown(document.body);

    audio().volume = 0;
    audio().muted = true;

    act(() => controller.playOutcome("victory", "casual-result:after-fade"));

    expect(audio().volume).toBe(0.5);
    expect(audio().muted).toBe(false);
    expect(audio().src).toBe("/soundtrack/victory.mp3");
    expect(audio().play).toHaveBeenCalled();
  });

  it("stays silent after the jingle ends", () => {
    let controller!: AudioController;
    function Grab(): null {
      controller = useAudioController();
      return null;
    }
    render(wrap(<Grab />));
    fireEvent.pointerDown(document.body);

    act(() => controller.playOutcome("defeat", "casual-result:x"));
    expect(audio().src).toBe("/soundtrack/defeat.mp3");

    act(() => audio().emit("ended"));

    expect(audio().src).toBe("");
  });

  it("restores the ranked scene after its result jingle when requested", async () => {
    let controller!: AudioController;
    function Grab(): null {
      controller = useAudioController();
      const setScene = controller.setScene;
      const clearScene = controller.clearScene;
      useEffect(() => {
        setScene("ranked-game", "ranked-result");
        return () => clearScene("ranked-result");
      }, [clearScene, setScene]);
      return null;
    }
    render(wrap(<Grab />));
    fireEvent.pointerDown(document.body);
    await waitFor(() => expect(audio().src).toBe("/soundtrack/ranked-game-a.mp3"));

    act(() => controller.playOutcome("victory", "ranked-result:first-player", true));
    expect(audio().src).toBe("/soundtrack/victory.mp3");

    act(() => audio().emit("ended"));
    await waitFor(() => expect(audio().src).toBe("/soundtrack/ranked-game-a.mp3"));
    expect(controller.state.scene).toBe("ranked-game");
    expect(controller.state.outcome).toBeNull();
  });

  it("keeps a casual result jingle when the game scene is cleared after completion", async () => {
    let controller!: AudioController;
    route.value = "/daily";
    function Grab(): null {
      controller = useAudioController();
      const setScene = controller.setScene;
      const clearScene = controller.clearScene;
      useEffect(() => {
        setScene("casual-game", "casual-result");
        return () => clearScene("casual-result");
      }, [clearScene, setScene]);
      return null;
    }
    render(wrap(<Grab />));
    fireEvent.pointerDown(document.body);
    await waitFor(() => expect(audio().src).toBe("/soundtrack/casual-game-a.mp3"));

    act(() => {
      controller.clearScene("casual-result");
      controller.playOutcome("victory", "casual-result:scene-cleared");
    });

    expect(audio().src).toBe("/soundtrack/victory.mp3");
    expect(audio().play).toHaveBeenCalled();
  });

  it("stops the background and stays silent when a jingle is unavailable", () => {
    let controller!: AudioController;
    function Grab(): null {
      controller = useAudioController();
      return null;
    }
    render(wrap(<Grab />));
    fireEvent.pointerDown(document.body);
    Reflect.deleteProperty(manifest, "victoryJingle");

    act(() => controller.playOutcome("victory", "casual-result:no-jingle"));

    expect(audio().src).toBe("");
    expect(controller.trackCount).toBe(0);
  });

  it("ignores a rejected jingle play after a newer scene has claimed the audio element", async () => {
    let controller!: AudioController;
    let rejectJingle!: (reason?: unknown) => void;
    function Grab(): null {
      controller = useAudioController();
      return null;
    }
    render(wrap(<Grab />));
    fireEvent.pointerDown(document.body);
    audio().play = vi.fn(
      () =>
        new Promise<void>((_resolve, reject) => {
          rejectJingle = reject;
        }),
    );

    act(() => controller.playOutcome("victory", "casual-result:stale-jingle"));
    expect(audio().src).toBe("/soundtrack/victory.mp3");

    act(() => controller.setScene("casual-game", "newer-scene"));
    await waitFor(() => expect(audio().src).toBe("/soundtrack/casual-game-a.mp3"));

    rejectJingle(new DOMException("stale", "AbortError"));
    await Promise.resolve();

    expect(audio().src).toBe("/soundtrack/casual-game-a.mp3");
  });
});
