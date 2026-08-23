import "server-only";

import { getSetting, setSetting } from "@/lib/app-settings";
import {
  DEFAULT_SOUNDTRACK_METADATA,
  normalizeSoundtrackMetadata,
  type SoundtrackMetadata,
} from "@/lib/audio/soundtrack-metadata";

export const SETTING_SOUNDTRACK_METADATA = "soundtrack_metadata";

export async function getSoundtrackMetadata(): Promise<SoundtrackMetadata> {
  const fallback = JSON.stringify(DEFAULT_SOUNDTRACK_METADATA);
  const raw = await getSetting(SETTING_SOUNDTRACK_METADATA, fallback);
  try {
    return normalizeSoundtrackMetadata(JSON.parse(raw));
  } catch {
    return DEFAULT_SOUNDTRACK_METADATA;
  }
}

export async function setSoundtrackMetadata(
  metadata: SoundtrackMetadata,
): Promise<void> {
  await setSetting(SETTING_SOUNDTRACK_METADATA, JSON.stringify(metadata));
}
