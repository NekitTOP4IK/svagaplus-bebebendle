// @vitest-environment jsdom

import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { HomeOverlays } from "@/components/home-overlays";

const audio = vi.hoisted(() => ({
  activatePlayback: vi.fn(),
  restorePlaybackVolume: vi.fn(),
  setPlaybackActivationBlocked: vi.fn(),
  setPanelHovering: vi.fn(),
}));

const entrance = vi.hoisted(() => ({
  alreadyEntered: false,
}));

vi.mock("@/components/audio/audio-provider", () => ({
  useAudioController: () => audio,
}));

vi.mock("@/components/entrance-gate", () => ({
  hasEnteredCurrentDocument: () => entrance.alreadyEntered,
  EntranceGate: ({
    onActivate,
    onEntered,
  }: {
    onActivate(): void;
    onEntered(): void;
  }) => (
    <div data-testid="entrance-gate">
      <button type="button" onClick={onActivate}>Активировать</button>
      <button type="button" onClick={onEntered}>Завершить вход</button>
    </div>
  ),
}));

vi.mock("@/components/announcements/announcement-overlay", () => ({
  AnnouncementOverlay: () => <div data-testid="announcements" />,
}));

describe("HomeOverlays", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    entrance.alreadyEntered = false;
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
      callback(0);
      return 1;
    });
  });

  it("skips the entrance gate after it was passed in the current document", () => {
    entrance.alreadyEntered = true;

    render(<HomeOverlays announcements={[]} />);

    expect(screen.queryByTestId("entrance-gate")).not.toBeInTheDocument();
    expect(screen.getByTestId("announcements")).toBeVisible();
    expect(audio.setPlaybackActivationBlocked).toHaveBeenCalledWith(false);
    expect(audio.activatePlayback).not.toHaveBeenCalled();
  });

  it("blocks background activation and mounts announcements only after the gate exits", () => {
    render(<HomeOverlays announcements={[]} />);

    expect(audio.setPlaybackActivationBlocked).toHaveBeenCalledWith(true);
    expect(screen.queryByTestId("announcements")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Активировать" }));

    expect(audio.setPlaybackActivationBlocked).toHaveBeenCalledWith(false);
    expect(audio.activatePlayback).toHaveBeenCalledWith(true);
    expect(screen.queryByTestId("announcements")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Завершить вход" }));

    expect(screen.getByTestId("announcements")).toBeVisible();
    expect(audio.restorePlaybackVolume).toHaveBeenCalledTimes(1);
  });
});
