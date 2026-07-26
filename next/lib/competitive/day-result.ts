export type DayResultBoardRow = Readonly<{
  place: number;
  label: string;
  points: number;
  isMe: boolean;
}>;

export type DayResultBoardInput = Readonly<{
  userId: number;
  label: string;
  points: number;
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

export function buildDayResultBoard(
  ranked: readonly DayResultBoardInput[],
  userId: number,
  topN: number,
): DayResultBoardRow[] {
  const toRow = (
    entry: DayResultBoardInput,
    index: number,
  ): DayResultBoardRow => ({
    place: index + 1,
    label: entry.label,
    points: entry.points,
    isMe: entry.userId === userId,
  });

  const rows = ranked.slice(0, topN).map(toRow);
  const myIndex = ranked.findIndex((entry) => entry.userId === userId);
  if (myIndex < 0 || myIndex < topN) return rows;

  const from = Math.max(topN, myIndex - 1);
  const to = Math.min(ranked.length, myIndex + 2);
  for (let index = from; index < to; index += 1) {
    rows.push(toRow(ranked[index], index));
  }

  return rows;
}
