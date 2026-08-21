"use client";

import {
  createContext,
  useEffect,
  useContext,
  useState,
  type ReactElement,
  type ReactNode,
} from "react";
import {
  DEFAULT_AUDIO_PREFERENCES,
  readAudioPreferences,
  subscribeAudioPreferences,
  type AudioPreferences,
} from "@/lib/audio/preferences";

const AudioPreferencesContext = createContext<AudioPreferences>(DEFAULT_AUDIO_PREFERENCES);

export function useAudioPreferences(): AudioPreferences {
  return useContext(AudioPreferencesContext);
}

export function AudioPreferencesProvider({
  children,
}: Readonly<{ children: ReactNode }>): ReactElement {
  const [preferences, setPreferences] = useState<AudioPreferences>(
    DEFAULT_AUDIO_PREFERENCES,
  );

  useEffect(() => {
    const refresh = (): void => setPreferences(readAudioPreferences());
    refresh();
    return subscribeAudioPreferences(refresh);
  }, []);

  return (
    <AudioPreferencesContext.Provider value={preferences}>
      {children}
    </AudioPreferencesContext.Provider>
  );
}
