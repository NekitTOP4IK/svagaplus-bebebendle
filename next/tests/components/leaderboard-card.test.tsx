// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { LeaderboardCard } from "@/components/competitive/leaderboard-card";
import type { HubStandingRow } from "@/lib/competitive/hub";

function makeTop(count: number): HubStandingRow[] {
  return Array.from({ length: count }, (_, index) => ({
    place: index + 1,
    userId: index + 1,
    points: 1000 - index,
    daysPlayed: 5,
    hits: 3,
    label: `Player ${index + 1}`,
    isMe: false,
  }));
}

function row(place: number, isMe = false): HubStandingRow {
  return {
    place,
    userId: place,
    points: 100,
    daysPlayed: 2,
    hits: 1,
    label: `Player ${place}`,
    isMe,
  };
}

/** startsAt/endsAt bracketing "now" so isSeasonPlayableNow reads it as in-window. */
function inWindow(): { seasonStartsAt: string; seasonEndsAt: string } {
  const now = Date.now();
  return {
    seasonStartsAt: new Date(now - 3_600_000).toISOString(),
    seasonEndsAt: new Date(now + 3_600_000).toISOString(),
  };
}

/** startsAt in the future: status "active" but outside the playable window. */
function beforeWindow(): { seasonStartsAt: string; seasonEndsAt: string } {
  const now = Date.now();
  return {
    seasonStartsAt: new Date(now + 3_600_000).toISOString(),
    seasonEndsAt: new Date(now + 7_200_000).toISOString(),
  };
}

describe("LeaderboardCard", () => {
  it("renders the caller once inside the top table with no ellipsis when they are in the top", () => {
    const top = makeTop(5);
    top[2] = { ...top[2], isMe: true, label: "Me" };

    render(
      <LeaderboardCard
        top={top}
        myWindow={[]}
        seasonStatus="active"
        {...inWindow()}
      />,
    );

    expect(screen.queryByText("…")).not.toBeInTheDocument();
    expect(screen.getAllByText("Me")).toHaveLength(1);
  });

  it("renders contiguous neighbours with no ellipsis when the window abuts the top slice", () => {
    const top = makeTop(50);
    const myWindow = [row(51, true), row(52)];

    render(
      <LeaderboardCard
        top={top}
        myWindow={myWindow}
        seasonStatus="active"
        {...inWindow()}
      />,
    );

    expect(screen.queryByText("…")).not.toBeInTheDocument();
    expect(screen.getByText("Player 51")).toBeInTheDocument();
    expect(screen.getByText("Player 52")).toBeInTheDocument();
  });

  it("renders an unmarked, contiguous neighbour when the caller sits at the last top place", () => {
    const top = makeTop(50);
    top[49] = { ...top[49], isMe: true, label: "Me" };
    const myWindow = [row(51)];

    render(
      <LeaderboardCard
        top={top}
        myWindow={myWindow}
        seasonStatus="active"
        {...inWindow()}
      />,
    );

    expect(screen.queryByText("…")).not.toBeInTheDocument();
    const neighbourRow = screen.getByText("Player 51").closest("tr");
    expect(neighbourRow).not.toBeNull();
    expect(neighbourRow).not.toHaveClass("c-row-me");
    expect(neighbourRow).not.toHaveAttribute("id", "currentPlayer");
  });

  it("renders a single ellipsis row before a window far outside the top slice", () => {
    const top = makeTop(50);
    const myWindow = [row(199), row(200, true), row(201)];

    const { container } = render(
      <LeaderboardCard
        top={top}
        myWindow={myWindow}
        seasonStatus="active"
        {...inWindow()}
      />,
    );

    // Asserting on cell count alone (getAllByText("…")) would also pass for
    // two ellipsis rows of two cells each — count the row itself instead.
    expect(container.querySelectorAll("tr.c-row-ellipsis")).toHaveLength(1);
    expect(screen.getByText("Player 199")).toBeInTheDocument();
    expect(screen.getByText("Player 200")).toBeInTheDocument();
    expect(screen.getByText("Player 201")).toBeInTheDocument();
  });

  it("shows the full-list link when the season is active and inside its playable window", () => {
    render(
      <LeaderboardCard
        top={makeTop(5)}
        myWindow={[]}
        seasonStatus="active"
        {...inWindow()}
      />,
    );

    expect(
      screen.getByRole("link", { name: "Весь список" }),
    ).toBeInTheDocument();
  });

  it("hides the full-list link when status is active but startsAt is still in the future", () => {
    render(
      <LeaderboardCard
        top={makeTop(5)}
        myWindow={[]}
        seasonStatus="active"
        {...beforeWindow()}
      />,
    );

    expect(
      screen.queryByRole("link", { name: "Весь список" }),
    ).not.toBeInTheDocument();
  });

  it("hides the full-list link when startsAt/endsAt are unknown", () => {
    render(
      <LeaderboardCard
        top={makeTop(5)}
        myWindow={[]}
        seasonStatus="active"
        seasonStartsAt={null}
        seasonEndsAt={null}
      />,
    );

    expect(
      screen.queryByRole("link", { name: "Весь список" }),
    ).not.toBeInTheDocument();
  });
});
