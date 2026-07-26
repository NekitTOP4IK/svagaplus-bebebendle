import { describe, expect, it } from "vitest";
import {
  betterThanPercent,
  buildDayResultBoard,
  type DayResultBoardInput,
} from "@/lib/competitive/day-result";

function ranking(count: number): DayResultBoardInput[] {
  return Array.from({ length: count }, (_, index) => ({
    userId: index + 1,
    label: `player${index + 1}`,
    points: (count - index) * 100,
  }));
}

describe("betterThanPercent", () => {
  it("reports the share of players scoring strictly lower", () => {
    expect(betterThanPercent(3, 4)).toBe(75);
  });

  it("divides the worse count by the total player count", () => {
    expect(betterThanPercent(7, 10)).toBe(70);
  });

  it("returns null when the player is alone", () => {
    expect(betterThanPercent(0, 1)).toBeNull();
  });

  it("returns null when nobody has played", () => {
    expect(betterThanPercent(0, 0)).toBeNull();
  });

  it("rounds to a whole percent", () => {
    expect(betterThanPercent(1, 3)).toBe(33);
  });
});

describe("buildDayResultBoard", () => {
  it("returns just the top when the player is inside it", () => {
    const board = buildDayResultBoard(ranking(10), 3, 5);

    expect(board.map((row) => row.place)).toEqual([1, 2, 3, 4, 5]);
    expect(board.filter((row) => row.isMe).map((row) => row.place)).toEqual([3]);
  });

  it("appends a window around a player outside the top", () => {
    const board = buildDayResultBoard(ranking(20), 12, 5);

    expect(board.map((row) => row.place)).toEqual([1, 2, 3, 4, 5, 11, 12, 13]);
    expect(board.filter((row) => row.isMe).map((row) => row.place)).toEqual([12]);
  });

  it("clips the window at the end of the ranking", () => {
    const board = buildDayResultBoard(ranking(8), 8, 5);

    expect(board.map((row) => row.place)).toEqual([1, 2, 3, 4, 5, 7, 8]);
  });

  it("returns only the top when the player has no standing", () => {
    const board = buildDayResultBoard(ranking(10), 999, 5);

    expect(board.map((row) => row.place)).toEqual([1, 2, 3, 4, 5]);
    expect(board.some((row) => row.isMe)).toBe(false);
  });

  it("carries labels and points through unchanged", () => {
    const board = buildDayResultBoard(ranking(3), 1, 5);

    expect(board[0]).toEqual({
      place: 1,
      label: "player1",
      points: 300,
      isMe: true,
    });
  });
});
