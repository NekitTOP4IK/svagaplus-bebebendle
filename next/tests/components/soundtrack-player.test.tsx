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
      sources: [{ src: "/soundtrack/menu.ogg", type: "audio/ogg; codecs=opus" }],
    },
    trackCount,
    currentTime: 65,
    duration: 190,
    setScene: vi.fn(),
    clearScene: vi.fn(),
    playOutcome: vi.fn(),
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
  preferences.current = { musicEnabled: true, musicVolume: 0.5 };
  controller.current = createController();
});

describe("SoundtrackPlayer", () => {
  it("does not render for inactive audio states", () => {
    const inactive = [
      { scene: "silent" as const },
      { panelMode: "hidden" as const },
      { outcome: "victory" as const },
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

  it("renders an expanded unified dock with the handle before its panel", () => {
    renderPlayer();

    const dock = screen.getByLabelText("Музыкальный плеер");
    expect(dock).toHaveClass("soundtrack-player--expanded");
    expect(dock.firstElementChild).toHaveClass("soundtrack-player__handle");
    expect(dock.lastElementChild).toHaveClass("soundtrack-player__panel");
    expect(screen.getByText("Уютный вечер")).toBeVisible();
    expect(screen.getByText("Bebebendle OST")).toBeVisible();
  });

  it("uses only a compact handle while visually collapsed and toggles it", () => {
    controller.current = createController({ panelMode: "collapsed" });
    renderPlayer();

    const dock = screen.getByLabelText("Музыкальный плеер");
    expect(dock).toHaveClass("soundtrack-player--collapsed");
    fireEvent.click(screen.getByRole("button", { name: "Открыть плеер" }));
    expect(controller.current!.togglePanel).toHaveBeenCalledOnce();
  });

  it("exposes accessible playback, seeking and volume controls", () => {
    renderPlayer();

    fireEvent.click(screen.getByRole("button", { name: "Поставить на паузу" }));
    expect(controller.current!.togglePlayback).toHaveBeenCalledOnce();

    fireEvent.change(screen.getByLabelText("Позиция трека"), { target: { value: "90" } });
    expect(controller.current!.seek).toHaveBeenCalledWith(90);

    fireEvent.click(screen.getByRole("button", { name: "Увеличить громкость" }));
    expect(controller.current!.setVolume).toHaveBeenCalledWith(0.6);
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

  it("uses a mute glyph for zero volume without adding text artefacts", () => {
    preferences.current = { musicEnabled: true, musicVolume: 0 };
    renderPlayer();

    const handle = screen.getByRole("button", { name: "Свернуть плеер" });
    expect(handle.querySelector("svg path")?.getAttribute("d")).toContain("M2 6");
  });
});
