// @vitest-environment jsdom
import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AudioPreferencesProvider } from "@/components/audio/audio-preferences-provider";
import { AudioSettingsPanel } from "@/components/audio/audio-settings-panel";
import { AUDIO_PREFERENCES_STORAGE_KEY } from "@/lib/audio/preferences";

function renderPanel(): ReturnType<typeof render> {
  return render(
    <AudioPreferencesProvider>
      <AudioSettingsPanel />
    </AudioPreferencesProvider>,
  );
}

describe("AudioSettingsPanel", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("saves the music toggle and volume", () => {
    renderPanel();

    fireEvent.click(screen.getByRole("switch", { name: /музыка/i }));
    fireEvent.click(screen.getByRole("button", { name: "Сохранить" }));

    expect(JSON.parse(localStorage.getItem(AUDIO_PREFERENCES_STORAGE_KEY)!)).toEqual({
      musicEnabled: false,
      musicVolume: 0.5,
      autoCollapsePlayer: true,
    });
  });

  it("saves player behavior settings", () => {
    renderPanel();

    fireEvent.click(screen.getByRole("switch", { name: /автосворачивание/i }));
    fireEvent.click(screen.getByRole("button", { name: "Сохранить" }));

    expect(JSON.parse(localStorage.getItem(AUDIO_PREFERENCES_STORAGE_KEY)!)).toEqual({
      musicEnabled: true,
      musicVolume: 0.5,
      autoCollapsePlayer: false,
    });
  });

  it("shows save feedback temporarily and animates the cancel action state", () => {
    vi.useFakeTimers();
    renderPanel();

    expect(screen.queryByRole("status")).toBeNull();
    expect(screen.queryByRole("button", { name: "Отменить" })).toBeNull();

    fireEvent.click(screen.getByRole("switch", { name: /автосворачивание/i }));
    expect(screen.getByRole("button", { name: "Отменить" })).toHaveClass("pixel-btn-danger");

    fireEvent.click(screen.getByRole("button", { name: "Сохранить" }));
    expect(screen.getByRole("status")).toHaveTextContent("Изменения сохранены");
    expect(screen.queryByRole("button", { name: "Отменить" })).toBeNull();

    act(() => vi.advanceTimersByTime(5000));
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("can discard an unsaved volume change", () => {
    renderPanel();
    const volume = screen.getByRole("slider", { name: "Громкость" });

    fireEvent.change(volume, { target: { value: "20" } });
    expect(screen.getByText("Громкость: 20%")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Отменить" }));

    expect(volume).toHaveValue("50");
    expect(screen.getByText("Громкость: 50%")).toBeInTheDocument();
    expect(localStorage.getItem(AUDIO_PREFERENCES_STORAGE_KEY)).toBeNull();
  });
});
