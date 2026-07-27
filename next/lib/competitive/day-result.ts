export type DayResultBoardRow = Readonly<{
  place: number;
  label: string;
  points: number;
  isMe: boolean;
}>;

export type CompetitiveDaySummary = Readonly<{
  seasonPoints: number;
  place: number | null;
  betterThanPercent: number | null;
  board: DayResultBoardRow[];
}>;

export function betterThanPercent(
  worseCount: number,
  totalPlayers: number,
): number | null {
  if (totalPlayers <= 1) return null;
  return Math.round((worseCount / totalPlayers) * 100);
}
