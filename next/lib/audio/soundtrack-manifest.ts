export type AudioScene = "silent" | "casual-menu" | "casual-game" | "ranked-menu" | "ranked-game";

export type Outcome = "victory" | "defeat";

export type AudioSource = Readonly<{
  src: string;
  type: "audio/ogg" | "audio/mpeg";
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

function soundtrackTrack(
  id: string,
  title: string,
  fileName: string,
): SoundtrackTrack {
  return {
    id,
    title,
    sources: [
      { src: `/soundtrack/${fileName}.ogg`, type: "audio/ogg" },
      { src: `/soundtrack/${fileName}.mp3`, type: "audio/mpeg" },
    ],
  };
}

const START_MENU = soundtrackTrack("start-menu", "Главное меню", "start-menu");
const DAILY_GAME = soundtrackTrack("daily-game", "Дейлик", "daily-game");
const COMPETITIVE_MENU = soundtrackTrack(
  "competitive-menu",
  "Competitive — меню",
  "competitive-menu",
);
const COMPETITIVE_GAME = soundtrackTrack(
  "competitive-game",
  "Competitive — игра",
  "competitive-game",
);

export const SOUNDTRACK_MANIFEST: SoundtrackManifest = {
  casualMenu: [START_MENU],
  casualGame: [DAILY_GAME],
  rankedMenu: [COMPETITIVE_MENU],
  rankedGame: [COMPETITIVE_GAME],
  victoryJingle: soundtrackTrack("game-win", "Победа", "game-win"),
  defeatJingle: soundtrackTrack("game-lose", "Поражение", "game-lose"),
};
