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
        { src: "/soundtrack/casual-menu-a.ogg", type: "audio/ogg; codecs=opus" },
        { src: "/soundtrack/casual-menu-a.mp3", type: "audio/mpeg" },
      ],
    },
    {
      id: "casual-menu-b",
      title: "Casual Menu B",
      sources: [
        { src: "/soundtrack/casual-menu-b.ogg", type: "audio/ogg; codecs=opus" },
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

  it("moves to blocked when autoplay is rejected and does not retry on later gestures", async () => {
    let controller!: AudioController;
    function Grab(): null {
      controller = useAudioController();
      return null;
    }
    render(wrap(<Grab />));
    audio().play = vi.fn(() => Promise.reject(new DOMException("denied", "NotAllowedError")));

    fireEvent.pointerDown(document.body);

    await waitFor(() => expect(audio().paused).toBe(true));
    expect(controller.state.status).toBe("blocked");
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

  it("skips by playable tracks rather than by fallback source variants", () => {
    let controller!: AudioController;
    function Grab(): null {
      controller = useAudioController();
      return null;
    }
    FakeAudio.supportedType = (type: string): CanPlayTypeResult =>
      type === "audio/mpeg" ? "probably" : "";
    render(wrap(<Grab />));
    fireEvent.pointerDown(document.body);

    act(() => controller.nextTrack());

    expect(controller.trackCount).toBe(2);
    expect(audio().src).toBe("/soundtrack/casual-menu-b.mp3");
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
