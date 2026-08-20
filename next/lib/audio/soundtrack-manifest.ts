export type AudioScene = "silent" | "casual-menu" | "casual-game" | "ranked-menu" | "ranked-game";

export type Outcome = "victory" | "defeat";

export type AudioSource = Readonly<{
  src: string;
  type: "audio/ogg; codecs=opus" | "audio/mpeg";
}>;

export type SoundtrackTrack = Readonly<{
  id: string;
  title: string;
  artist?: string;
  sources: readonly AudioSource[];
}>;

export type SoundtrackManifest = Readonly<{
  casualMenu: readonly SoundtrackTrack[];
  casualGame: readonly SoundtrackTrack[];
  rankedMenu: readonly SoundtrackTrack[];
  rankedGame: readonly SoundtrackTrack[];
  victoryJingle?: SoundtrackTrack;
  defeatJingle?: SoundtrackTrack;
}>;

/**
 * Audio files are not available yet. The empty manifest is the first-class
 * default: nothing here may resolve to a request for a missing URL.
 */
export const SOUNDTRACK_MANIFEST: SoundtrackManifest = {
  casualMenu: [],
  casualGame: [],
  rankedMenu: [],
  rankedGame: [],
};
