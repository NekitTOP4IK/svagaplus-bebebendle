// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  AUDIO_PREFERENCES_EVENT,
  AUDIO_PREFERENCES_STORAGE_KEY,
  DEFAULT_AUDIO_PREFERENCES,
  normalizeAudioPreferences,
  readAudioPreferences,
  subscribeAudioPreferences,
  updateAudioPreferences,
  writeAudioPreferences,
} from "@/lib/audio/preferences";

describe("audio preferences", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("normalizes invalid values and clamps volume", () => {
    expect(normalizeAudioPreferences(null)).toEqual(DEFAULT_AUDIO_PREFERENCES);
    expect(normalizeAudioPreferences({ musicEnabled: false, musicVolume: 5 })).toEqual({
      musicEnabled: false,
      musicVolume: 1,
    });
    expect(normalizeAudioPreferences({ musicVolume: -1 })).toEqual({
      musicEnabled: true,
      musicVolume: 0,
    });
  });

  it("persists full and partial updates", () => {
    writeAudioPreferences({ musicEnabled: false, musicVolume: 0.8 });
    updateAudioPreferences({ musicEnabled: true });

    expect(readAudioPreferences()).toEqual({ musicEnabled: true, musicVolume: 0.8 });
    expect(localStorage.getItem(AUDIO_PREFERENCES_STORAGE_KEY)).not.toBeNull();
  });

  it("notifies same-tab and matching cross-tab changes", () => {
    const listener = vi.fn();
    const unsubscribe = subscribeAudioPreferences(listener);

    window.dispatchEvent(new Event(AUDIO_PREFERENCES_EVENT));
    window.dispatchEvent(new StorageEvent("storage", { key: AUDIO_PREFERENCES_STORAGE_KEY }));
    window.dispatchEvent(new StorageEvent("storage", { key: "unrelated" }));

    expect(listener).toHaveBeenCalledTimes(2);
    unsubscribe();
  });
});
