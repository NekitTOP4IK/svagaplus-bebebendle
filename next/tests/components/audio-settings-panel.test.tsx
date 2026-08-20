// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
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

  it("saves the music toggle and volume", () => {
    renderPanel();

    fireEvent.click(screen.getByRole("switch", { name: /музыка/i }));
    fireEvent.click(screen.getByRole("button", { name: "Сохранить" }));

    expect(JSON.parse(localStorage.getItem(AUDIO_PREFERENCES_STORAGE_KEY)!)).toEqual({
      musicEnabled: false,
      musicVolume: 0.5,
      outcomeJinglesEnabled: true,
      autoCollapsePlayer: true,
    });
  });

  it("saves outcome and player behavior settings", () => {
    renderPanel();

    fireEvent.click(screen.getByRole("switch", { name: /сигналы результата/i }));
    fireEvent.click(screen.getByRole("switch", { name: /автосворачивание/i }));
    fireEvent.click(screen.getByRole("button", { name: "Сохранить" }));

    expect(JSON.parse(localStorage.getItem(AUDIO_PREFERENCES_STORAGE_KEY)!)).toEqual({
      musicEnabled: true,
      musicVolume: 0.5,
      outcomeJinglesEnabled: false,
      autoCollapsePlayer: false,
    });
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
