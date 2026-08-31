// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/components/daily/round-card", () => ({
  RoundCard: ({ scran }: { scran: { name: string } }) => <div>{scran.name}</div>,
}));
vi.mock("@/components/daily/result-overlay", () => ({ ResultOverlay: () => null }));
vi.mock("@/components/daily/transition-overlay", () => ({ TransitionOverlay: () => null }));
vi.mock("@/components/daily/vs-badge", () => ({ VsBadge: () => null }));

import { GameBoard } from "@/components/daily/game-board";

const data = {
  date: "2026-08-30",
  totalRounds: 1,
  eventId: 4,
  eventName: "Битва бургеров",
  rounds: [{
    roundNumber: 1,
    scrandleId: 10,
    scranA: { id: 1, name: "А", imageUrl: "/a", description: null, price: 1, icon: "" },
    scranB: { id: 2, name: "Б", imageUrl: "/b", description: null, price: 2, icon: "" },
  }],
};

describe("custom Daily event badge", () => {
  it("shows only public event metadata during play", () => {
    render(<GameBoard data={{ ...data, eventBadgeStyle: "neon" }} currentRound={1} lastAnswer={null} showResult={false} isTransitioning={false} isVoting={false} onVote={vi.fn()} />);
    expect(screen.getByLabelText("Событие: Битва бургеров")).toHaveClass("daily-event-badge--neon");
    expect(screen.getByLabelText("Событие: Битва бургеров").querySelector("svg")).not.toBeNull();
  });

  it("hides the badge when the event presentation disables it", () => {
    render(<GameBoard data={{ ...data, eventBadgeVisible: false }} currentRound={1} lastAnswer={null} showResult={false} isTransitioning={false} isVoting={false} onVote={vi.fn()} />);
    expect(screen.queryByLabelText("Событие: Битва бургеров")).toBeNull();
  });
});
