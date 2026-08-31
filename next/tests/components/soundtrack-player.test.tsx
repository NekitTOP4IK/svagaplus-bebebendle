// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { SoundtrackPlayer } from "@/components/audio/soundtrack-player";
import type { AudioController } from "@/components/audio/audio-provider";

const controller = vi.hoisted(() => ({ current: null as AudioController | null }));
const preferences = vi.hoisted(() => ({ current: { musicEnabled: true, musicVolume: 0.5 } }));

vi.mock("@/components/audio/audio-provider", () => ({
  useAudioController: () => controller.current,
}));

vi.mock("@/components/audio/audio-preferences-provider", () => ({
  useAudioPreferences: () => preferences.current,
}));

function createController(overrides: Partial<AudioController["state"]> = {}, trackCount = 1): AudioController {
  return {
    state: {
      scene: "casual-menu",
      status: "playing",
      panelMode: "manual",
      trackIndex: 0,
      sourceIndex: 0,
      generation: 1,
      outcome: null,
      sessionPaused: false,
      ...overrides,
    },
    currentTrack: {
      id: "menu",
      title: "Уютный вечер",
      artist: "Bebebendle OST",
      sources: [{ src: "/soundtrack/menu.ogg", type: "audio/ogg" }],
    },
    trackCount,
    currentTime: 65,
    duration: 190,
    playerObscured: false,
    setScene: vi.fn(),
    clearScene: vi.fn(),
    playOutcome: vi.fn(),
    activatePlayback: vi.fn(),
    restorePlaybackVolume: vi.fn(),
    setPlaybackActivationBlocked: vi.fn(),
    setPanelHovering: vi.fn(),
    setPlayerObscured: vi.fn(),
    togglePanel: vi.fn(),
    togglePlayback: vi.fn(),
    seek: vi.fn(),
    setVolume: vi.fn(),
    previousTrack: vi.fn(),
    nextTrack: vi.fn(),
  };
}

function renderPlayer(): ReturnType<typeof render> {
  return render(<SoundtrackPlayer />);
}

beforeEach(() => {
  window.localStorage.clear();
  preferences.current = { musicEnabled: true, musicVolume: 0.5 };
  controller.current = createController();
});

describe("SoundtrackPlayer", () => {
  it("does not render for inactive audio states", () => {
    const inactive = [
      { scene: "silent" as const },
      { panelMode: "hidden" as const },
    ];

    for (const patch of inactive) {
      controller.current = createController(patch);
      const view = renderPlayer();
      expect(view.queryByLabelText("Музыкальный плеер")).toBeNull();
      view.unmount();
    }

    preferences.current = { musicEnabled: false, musicVolume: 0.5 };
    expect(renderPlayer().queryByLabelText("Музыкальный плеер")).toBeNull();
  });

  it("keeps rendering while an outcome jingle is the current track", () => {
    controller.current = createController({ outcome: "victory" });
    expect(renderPlayer().getByLabelText("Музыкальный плеер")).toBeVisible();
  });

  it("renders an expanded unified dock with the handle before its panel", () => {
    renderPlayer();

    const dock = screen.getByLabelText("Музыкальный плеер");
    expect(dock).toHaveClass("soundtrack-player--expanded");
    expect(dock.firstElementChild).toHaveClass("soundtrack-player__handle");
    expect(dock.lastElementChild).toHaveClass("soundtrack-player__panel");
    expect(screen.getByText("Уютный вечер")).toBeVisible();
    expect(screen.getByText("Bebebendle OST")).toBeVisible();
    expect(screen.getByText("Сейчас играет")).toBeVisible();
  });

  it("reports pointer presence so automatic collapse can wait", () => {
    renderPlayer();
    const dock = screen.getByLabelText("Музыкальный плеер");

    fireEvent.pointerEnter(dock);
    expect(controller.current!.setPanelHovering).toHaveBeenCalledWith(true);

    fireEvent.pointerLeave(dock);
    expect(controller.current!.setPanelHovering).toHaveBeenCalledWith(false);
  });

  it("marks the dock for contextual dimming while keeping pointer interaction available", () => {
    controller.current = { ...createController(), playerObscured: true };
    renderPlayer();

    const dock = screen.getByLabelText("Музыкальный плеер");
    expect(dock).toHaveClass("soundtrack-player--obscured");
    fireEvent.pointerEnter(dock);
    expect(controller.current!.setPanelHovering).toHaveBeenCalledWith(true);
  });

  it("uses only a compact handle while visually collapsed and toggles it", () => {
    controller.current = createController({ panelMode: "collapsed" });
    renderPlayer();

    const dock = screen.getByLabelText("Музыкальный плеер");
    expect(dock).toHaveClass("soundtrack-player--collapsed");
    expect(screen.getByRole("status")).toHaveTextContent("Нажми сюда");
    fireEvent.click(screen.getByRole("button", { name: "Открыть плеер" }));
    expect(controller.current!.togglePanel).toHaveBeenCalledOnce();
    expect(window.localStorage.getItem("soundtrackPlayerHintSeen")).toBe("true");
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("exposes accessible playback, seeking and volume controls", () => {
    renderPlayer();

    fireEvent.click(screen.getByRole("button", { name: "Поставить на паузу" }));
    expect(controller.current!.togglePlayback).toHaveBeenCalledOnce();

    fireEvent.change(screen.getByLabelText("Позиция трека"), { target: { value: "90" } });
    expect(controller.current!.seek).toHaveBeenCalledWith(90);

    fireEvent.change(screen.getByLabelText("Громкость: 50%"), { target: { value: "0.7" } });
    expect(controller.current!.setVolume).toHaveBeenCalledWith(0.7);
    expect(screen.getByText("50%")).toBeVisible();
    expect(screen.queryByRole("button", { name: "Увеличить громкость" })).toBeNull();
    expect(screen.getAllByRole("slider")).toHaveLength(2);
    expect(document.querySelector(".soundtrack-player__volume-meter")).toBeNull();
    expect(screen.getByText("1:05 / 3:10")).toBeVisible();
  });

  it("hides skip controls for a single track and shows them for a playlist", () => {
    const single = renderPlayer();
    expect(screen.queryByRole("button", { name: "Предыдущий трек" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Следующий трек" })).toBeNull();
    single.unmount();

    controller.current = createController({}, 2);
    renderPlayer();
    fireEvent.click(screen.getByRole("button", { name: "Предыдущий трек" }));
    fireEvent.click(screen.getByRole("button", { name: "Следующий трек" }));
    expect(controller.current!.previousTrack).toHaveBeenCalledOnce();
    expect(controller.current!.nextTrack).toHaveBeenCalledOnce();
  });

  it("shows zero volume without changing the panel handle into a playback control", () => {
    preferences.current = { musicEnabled: true, musicVolume: 0 };
    renderPlayer();

    const handle = screen.getByRole("button", { name: "Свернуть плеер" });
    expect(handle.querySelector("svg path")?.getAttribute("d")).toContain("m5 2");
    expect(screen.getByText("0%")).toBeVisible();
  });

  it("renders the collapsed music icon as separate stems and note heads", () => {
    controller.current = createController({ panelMode: "collapsed" });
    renderPlayer();

    const handle = screen.getByRole("button", { name: "Открыть плеер" });
    expect(handle.querySelector("svg path")?.getAttribute("d")).toContain("M5.5 3.5");
    expect(handle.querySelectorAll("svg circle")).toHaveLength(2);
  });

  describe("dragging", () => {
    function mockDockRect(dock: HTMLElement, top: number, height: number): void {
      vi.spyOn(dock, "getBoundingClientRect").mockReturnValue({
        top,
        bottom: top + height,
        height,
      } as DOMRect);
    }

    function setViewportHeight(height: number): void {
      Object.defineProperty(window, "innerHeight", { value: height, configurable: true });
    }

    it("moves the dock vertically with the handle and persists the dropped offset", () => {
      setViewportHeight(600);
      renderPlayer();

      const dock = screen.getByLabelText("Музыкальный плеер");
      mockDockRect(dock, 100, 76); // initial bottom offset: 600 - 176 = 424
      const handle = screen.getByRole("button", { name: "Свернуть плеер" });

      fireEvent.pointerDown(handle, { pointerId: 1, clientX: 100, clientY: 100 });
      fireEvent.pointerMove(handle, { pointerId: 1, clientX: 140, clientY: 160 });
      fireEvent.pointerUp(handle, { pointerId: 1, clientX: 140, clientY: 160 });

      expect(dock.style.bottom).toBe("364px"); // 424 - 60
      expect(dock.style.left).toBe("");
      expect(dock.style.top).toBe("");
      expect(dock.style.right).toBe("");
      expect(window.localStorage.getItem("soundtrackPlayerPosition.v1")).toBe("364");
    });

    it("restores a stored vertical offset after mount, including the legacy record", () => {
      window.localStorage.setItem("soundtrackPlayerPosition.v1", "48");
      const first = renderPlayer();
      expect(screen.getByLabelText("Музыкальный плеер").style.bottom).toBe("48px");
      first.unmount();

      window.localStorage.setItem(
        "soundtrackPlayerPosition.v1",
        JSON.stringify({ x: 120, y: 36 }),
      );
      renderPlayer();
      expect(screen.getByLabelText("Музыкальный плеер").style.bottom).toBe("36px");
    });

    it("keeps the handle click as a toggle for taps without movement", () => {
      renderPlayer();

      const handle = screen.getByRole("button", { name: "Свернуть плеер" });
      fireEvent.pointerDown(handle, { pointerId: 1, clientX: 10, clientY: 10 });
      fireEvent.pointerMove(handle, { pointerId: 1, clientX: 11, clientY: 11 });
      fireEvent.pointerUp(handle, { pointerId: 1, clientX: 11, clientY: 11 });
      fireEvent.click(handle);

      expect(controller.current!.togglePanel).toHaveBeenCalledOnce();
      expect(screen.getByLabelText("Музыкальный плеер").style.bottom).toBe("");
    });

    it("never toggles the panel because of a completed drag", () => {
      renderPlayer();

      const handle = screen.getByRole("button", { name: "Свернуть плеер" });
      fireEvent.pointerDown(handle, { pointerId: 1, clientX: 10, clientY: 10 });
      fireEvent.pointerMove(handle, { pointerId: 1, clientX: 40, clientY: 80 });
      fireEvent.pointerUp(handle, { pointerId: 1, clientX: 40, clientY: 80 });
      fireEvent.click(handle);

      expect(controller.current!.togglePanel).not.toHaveBeenCalled();
    });

    it("ignores horizontal movement instead of dragging sideways", () => {
      renderPlayer();

      const handle = screen.getByRole("button", { name: "Свернуть плеер" });
      fireEvent.pointerDown(handle, { pointerId: 1, clientX: 10, clientY: 100 });
      fireEvent.pointerMove(handle, { pointerId: 1, clientX: 200, clientY: 101 });
      fireEvent.pointerUp(handle, { pointerId: 1, clientX: 200, clientY: 101 });
      fireEvent.click(handle);

      const dock = screen.getByLabelText("Музыкальный плеер");
      expect(dock.style.bottom).toBe("");
      expect(controller.current!.togglePanel).toHaveBeenCalledOnce();
    });

    it("clamps the dragged offset to the viewport height", () => {
      try {
        setViewportHeight(400);
        renderPlayer();
        const dock = screen.getByLabelText("Музыкальный плеер");
        Object.defineProperty(dock, "offsetHeight", { value: 76, configurable: true });
        mockDockRect(dock, 50, 76); // initial bottom offset: 400 - 126 = 274
        const maxY = 400 - 76 - 8;

        const handle = screen.getByRole("button", { name: "Свернуть плеер" });
        fireEvent.pointerDown(handle, { pointerId: 1, clientX: 0, clientY: 200 });
        fireEvent.pointerMove(handle, { pointerId: 1, clientX: 0, clientY: -8800 });
        fireEvent.pointerUp(handle, { pointerId: 1, clientX: 0, clientY: -8800 });
        expect(dock.style.bottom).toBe(`${maxY}px`);

        fireEvent.pointerDown(handle, { pointerId: 2, clientX: 0, clientY: 0 });
        mockDockRect(dock, 8, 76);
        fireEvent.pointerMove(handle, { pointerId: 2, clientX: 0, clientY: 9000 });
        fireEvent.pointerUp(handle, { pointerId: 2, clientX: 0, clientY: 9000 });
        expect(dock.style.bottom).toBe("8px");
      } finally {
        setViewportHeight(768);
      }
    });
  });
});
