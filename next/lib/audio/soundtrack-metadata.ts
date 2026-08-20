import type {
  SoundtrackManifest,
  SoundtrackTrack,
} from "@/lib/audio/soundtrack-manifest";

export const SOUNDTRACK_SLOTS = [
  { id: "start-menu", label: "Главное меню", fileName: "start-menu" },
  { id: "daily-game", label: "Обычная игра", fileName: "daily-game" },
  { id: "competitive-menu", label: "Competitive — меню", fileName: "competitive-menu" },
  { id: "competitive-game", label: "Competitive — игра", fileName: "competitive-game" },
  { id: "game-win", label: "Победа", fileName: "game-win" },
  { id: "game-lose", label: "Поражение", fileName: "game-lose" },
] as const;

export type SoundtrackSlotId = (typeof SOUNDTRACK_SLOTS)[number]["id"];

export type SoundtrackMetadataEntry = Readonly<{
  title: string;
  artist: string;
}>;

export type SoundtrackMetadata = Readonly<
  Record<SoundtrackSlotId, SoundtrackMetadataEntry>
>;

export const SOUNDTRACK_FIELD_MAX_LENGTH = 120;

export const DEFAULT_SOUNDTRACK_METADATA: SoundtrackMetadata = {
  "start-menu": { title: "Главное меню", artist: "" },
  "daily-game": { title: "Дейлик", artist: "" },
  "competitive-menu": { title: "Competitive — меню", artist: "" },
  "competitive-game": { title: "Competitive — игра", artist: "" },
  "game-win": { title: "Победа", artist: "" },
  "game-lose": { title: "Поражение", artist: "" },
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalizedField(value: unknown): string | null {
  if (typeof value !== "string") return null;
  return value.trim().slice(0, SOUNDTRACK_FIELD_MAX_LENGTH);
}

/** Fills missing or malformed stored values from the built-in manifest defaults. */
export function normalizeSoundtrackMetadata(value: unknown): SoundtrackMetadata {
  const source = isRecord(value) ? value : {};
  return Object.fromEntries(
    SOUNDTRACK_SLOTS.map(({ id }) => {
      const fallback = DEFAULT_SOUNDTRACK_METADATA[id];
      const entry = isRecord(source[id]) ? source[id] : {};
      const title = normalizedField(entry.title) || fallback.title;
      const artist = normalizedField(entry.artist) ?? fallback.artist;
      return [id, { title, artist }];
    }),
  ) as unknown as SoundtrackMetadata;
}

function withMetadata(
  track: SoundtrackTrack,
  metadata: SoundtrackMetadata,
): SoundtrackTrack {
  const entry = metadata[track.id as SoundtrackSlotId];
  if (!entry) return track;
  return {
    ...track,
    title: entry.title,
    ...(entry.artist ? { artist: entry.artist } : {}),
  };
}

/** Applies display-only metadata while preserving fixed audio files and scenes. */
export function applySoundtrackMetadata(
  manifest: SoundtrackManifest,
  metadata: SoundtrackMetadata,
): SoundtrackManifest {
  return {
    casualMenu: manifest.casualMenu.map((track) => withMetadata(track, metadata)),
    casualGame: manifest.casualGame.map((track) => withMetadata(track, metadata)),
    rankedMenu: manifest.rankedMenu.map((track) => withMetadata(track, metadata)),
    rankedGame: manifest.rankedGame.map((track) => withMetadata(track, metadata)),
    victoryJingle: manifest.victoryJingle
      ? withMetadata(manifest.victoryJingle, metadata)
      : undefined,
    defeatJingle: manifest.defeatJingle
      ? withMetadata(manifest.defeatJingle, metadata)
      : undefined,
  };
}
