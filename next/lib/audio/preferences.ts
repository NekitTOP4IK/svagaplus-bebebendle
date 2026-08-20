export type AudioPreferences = Readonly<{
  musicEnabled: boolean;
  musicVolume: number;
  autoCollapsePlayer: boolean;
}>;

export const DEFAULT_AUDIO_PREFERENCES: AudioPreferences = {
  musicEnabled: true,
  musicVolume: 0.5,
  autoCollapsePlayer: true,
};

export const AUDIO_PREFERENCES_STORAGE_KEY = "bebebendle.audio-preferences.v1";
export const AUDIO_PREFERENCES_EVENT = "bebebendle:audio-preferences";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function normalizeVolume(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return 0.5;
  return Math.min(1, Math.max(0, value));
}

export function normalizeAudioPreferences(value: unknown): AudioPreferences {
  const record = isRecord(value) ? value : {};
  return {
    musicEnabled: typeof record.musicEnabled === "boolean" ? record.musicEnabled : true,
    musicVolume: normalizeVolume(record.musicVolume),
    autoCollapsePlayer:
      typeof record.autoCollapsePlayer === "boolean" ? record.autoCollapsePlayer : true,
  };
}

export function readAudioPreferences(): AudioPreferences {
  if (typeof window === "undefined") return DEFAULT_AUDIO_PREFERENCES;

  try {
    const stored = window.localStorage.getItem(AUDIO_PREFERENCES_STORAGE_KEY);
    return stored ? normalizeAudioPreferences(JSON.parse(stored)) : DEFAULT_AUDIO_PREFERENCES;
  } catch {
    return DEFAULT_AUDIO_PREFERENCES;
  }
}

export function writeAudioPreferences(preferences: AudioPreferences): void {
  window.localStorage.setItem(AUDIO_PREFERENCES_STORAGE_KEY, JSON.stringify(preferences));
  window.dispatchEvent(new Event(AUDIO_PREFERENCES_EVENT));
}

export function updateAudioPreferences(patch: Partial<AudioPreferences>): void {
  writeAudioPreferences({ ...readAudioPreferences(), ...patch });
}

export function subscribeAudioPreferences(listener: () => void): () => void {
  const handleStorage = (event: StorageEvent): void => {
    if (event.key === AUDIO_PREFERENCES_STORAGE_KEY) listener();
  };
  window.addEventListener("storage", handleStorage);
  window.addEventListener(AUDIO_PREFERENCES_EVENT, listener);
  return () => {
    window.removeEventListener("storage", handleStorage);
    window.removeEventListener(AUDIO_PREFERENCES_EVENT, listener);
  };
}
