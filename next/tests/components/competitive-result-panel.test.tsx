// @vitest-environment jsdom
import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

const submitCompetitiveVote = vi.fn();
const finalizeCompetitiveDay = vi.fn();
const audioController = vi.hoisted(() => ({
  setScene: vi.fn(),
  clearScene: vi.fn(),
  playOutcome: vi.fn(),
  setPlayerObscured: vi.fn(),
}));

vi.mock("@/components/audio/audio-provider", () => ({
  useOptionalAudioController: () => audioController,
}));

vi.mock("@/app/actions/competitive", () => ({
  submitCompetitiveVote: (...args: unknown[]) =>
    submitCompetitiveVote(...args),
  finalizeCompetitiveDay: (...args: unknown[]) =>
    finalizeCompetitiveDay(...args),
}));

const { CompetitiveGameClient } = await import(
  "@/components/competitive/competitive-game-client"
);

const rounds = Array.from({ length: 10 }, (_, index) => ({
  displayRoundNumber: index + 1,
  roundId: index + 1,
  potentialPoints: 100,
  scranA: {
    id: index * 2 + 1,
    imageUrl: "/uploads/a.jpg",
    name: `A${index}`,
    description: null,
    price: 100,
    icon: "CakeNew.png",
  },
  scranB: {
    id: index * 2 + 2,
    imageUrl: "/uploads/b.jpg",
    name: `B${index}`,
    description: null,
    price: 200,
    icon: "CakeNew.png",
  },
}));

const summary = {
  seasonPoints: 6900,
  place: 4,
  betterThanPercent: 73,
  board: [
    { place: 1, label: "catlilface", points: 8120, isMe: false },
    { place: 4, label: "me", points: 6900, isMe: true },
  ],
};

async function playThrough() {
  const utils = render(
    <CompetitiveGameClient
      initialDaily={{ date: "2026-07-26", totalRounds: 10, rounds }}
    />,
  );

  for (let round = 0; round < 10; round += 1) {
    fireEvent.click(screen.getAllByRole("button")[0]);
    await vi.advanceTimersByTimeAsync(3100);
  }

  // waitFor's polling relies on real timers; the game itself only needs
  // fake ones to skip through the per-round transition delays above.
  vi.useRealTimers();

  return utils;
}

beforeEach(() => {
  vi.useFakeTimers();
  submitCompetitiveVote.mockResolvedValue({
    ok: true,
    data: {
      isCorrect: true,
      percentageA: 60,
      percentageB: 40,
      potentialPoints: 100,
      earnedPoints: 100,
    },
  });
  finalizeCompetitiveDay.mockResolvedValue({
    ok: true,
    data: { points: 742, hits: 7, summary },
  });
  audioController.setScene.mockClear();
  audioController.clearScene.mockClear();
  audioController.playOutcome.mockClear();
  audioController.setPlayerObscured.mockClear();
});

describe("ranked result panel", () => {
  it("shows the day score without a declined points word", async () => {
    await playThrough();

    await waitFor(() => expect(screen.getByText("742")).toBeTruthy());
    expect(screen.getByText(/7\/10 верных/)).toBeTruthy();
    expect(screen.queryByText(/очк(а|о|ов)\s*·/)).toBeNull();
  });

  it("tells the player what share of today's field they beat", async () => {
    await playThrough();

    await waitFor(() =>
      expect(
        screen.getByText("Ты лучше, чем 73% игроков сегодня"),
      ).toBeTruthy(),
    );
  });

  it("renders the leaderboard again", async () => {
    await playThrough();

    await waitFor(() => expect(screen.getByText("Лидерборд")).toBeTruthy());
    expect(screen.getByText("catlilface")).toBeTruthy();
    expect(screen.getByText("8120")).toBeTruthy();
  });

  it("keeps one sprite per round", async () => {
    await playThrough();

    await waitFor(() => expect(screen.getAllByAltText("Correct")).toHaveLength(10));
  });

  it("plays a result jingle and resumes ranked music for the first player of the day", async () => {
    finalizeCompetitiveDay.mockResolvedValue({
      ok: true,
      data: {
        points: 742,
        hits: 7,
        summary: { ...summary, betterThanPercent: null, place: 1 },
      },
    });

    await playThrough();

    await waitFor(() => expect(audioController.playOutcome).toHaveBeenCalledWith(
      "victory",
      "ranked-result:2026-07-26",
      true,
    ));
  });
});
