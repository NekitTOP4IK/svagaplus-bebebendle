import type {
  AudioScene,
  Outcome,
  AudioSource,
  SoundtrackManifest,
  SoundtrackTrack,
} from "@/lib/audio/soundtrack-manifest";

export function tracksForScene(
  manifest: SoundtrackManifest,
  scene: AudioScene,
): readonly SoundtrackTrack[] {
  switch (scene) {
    case "casual-menu":
      return manifest.casualMenu;
    case "casual-game":
      return manifest.casualGame;
    case "ranked-menu":
      return manifest.rankedMenu;
    case "ranked-game":
      return manifest.rankedGame;
    case "silent":
      return [];
  }
}

/**
 * Utility surfaces share the casual menu soundtrack so navigation between
 * home, settings and administration does not restart the current track.
 * Game routes stay silent until their client game state explicitly claims a scene.
 */
export function resolveRouteAudioScene(pathname: string): AudioScene {
  if (
    pathname === "/" ||
    pathname === "/settings" ||
    pathname === "/admin" ||
    pathname.startsWith("/admin/")
  ) {
    return "casual-menu";
  }
  if (pathname === "/competitive") return "ranked-menu";
  return "silent";
}

export function supportedSources(
  track: SoundtrackTrack,
  canPlayType: (type: string) => CanPlayTypeResult,
): readonly AudioSource[] {
  return track.sources.filter((source) => canPlayType(source.type) !== "");
}

export function chooseSupportedSource(
  track: SoundtrackTrack,
  canPlayType: (type: string) => CanPlayTypeResult,
): AudioSource | null {
  const supported = supportedSources(track, canPlayType);
  return supported[0] ?? null;
}

export function casualOutcome(score: number, averageScore: number | null): Outcome {
  const baseline = averageScore ?? score;
  return score >= baseline ? "victory" : "defeat";
}

export function rankedOutcome(
  input: Readonly<{ betterThanPercent: number | null; hits: number; totalRounds: number }>,
): Outcome {
  if (input.betterThanPercent !== null) {
    return input.betterThanPercent >= 50 ? "victory" : "defeat";
  }
  return input.hits >= Math.ceil(input.totalRounds / 2) ? "victory" : "defeat";
}
