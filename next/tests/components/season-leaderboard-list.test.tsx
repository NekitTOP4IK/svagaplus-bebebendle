// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
import type { SeasonBoardRow, SeasonLeaderboardPage } from "@/lib/competitive/standings";

const loadSeasonLeaderboardPage = vi.fn();

vi.mock("@/app/actions/competitive", () => ({
  loadSeasonLeaderboardPage: (...args: unknown[]) =>
    loadSeasonLeaderboardPage(...args),
}));

const { SeasonLeaderboardList } = await import(
  "@/components/competitive/season-leaderboard-list"
);

type IntersectionEntryLike = Readonly<{ isIntersecting: boolean }>;

class FakeIntersectionObserver {
  static instances: FakeIntersectionObserver[] = [];
  readonly callback: (entries: IntersectionEntryLike[]) => void;
  observe = vi.fn();
  unobserve = vi.fn();
  disconnect = vi.fn();
  takeRecords(): IntersectionEntryLike[] {
    return [];
  }
  constructor(callback: (entries: IntersectionEntryLike[]) => void) {
    this.callback = callback;
    FakeIntersectionObserver.instances.push(this);
  }
  trigger(isIntersecting = true): void {
    this.callback([{ isIntersecting }]);
  }
}

function makeRows(startPlace: number, count: number): SeasonBoardRow[] {
  return Array.from({ length: count }, (_, index) => {
    const place = startPlace + index;
    return {
      place,
      userId: place,
      points: 10_000 - place,
      daysPlayed: 5,
      hits: 3,
      label: `Player ${place}`,
    };
  });
}

function makePage(
  overrides: Partial<SeasonLeaderboardPage> = {},
): SeasonLeaderboardPage {
  return {
    rows: makeRows(1, 25),
    total: 25,
    myPlace: null,
    myRow: null,
    ...overrides,
  };
}

beforeEach(() => {
  loadSeasonLeaderboardPage.mockReset();
  FakeIntersectionObserver.instances = [];
  vi.stubGlobal("IntersectionObserver", FakeIntersectionObserver);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("SeasonLeaderboardList", () => {
  it("appends the next page when the sentinel intersects", async () => {
    loadSeasonLeaderboardPage.mockResolvedValue({
      ok: true,
      data: makePage({ rows: makeRows(26, 25), total: 50 }),
    });

    const { container } = render(
      <SeasonLeaderboardList initialPage={makePage({ total: 50 })} />,
    );

    expect(FakeIntersectionObserver.instances).toHaveLength(1);
    const sentinel = container.querySelector(".c-leaderboard-sentinel");
    expect(sentinel).not.toBeNull();
    expect(FakeIntersectionObserver.instances[0]!.observe).toHaveBeenCalledWith(
      sentinel,
    );
    act(() => {
      FakeIntersectionObserver.instances[0]!.trigger();
    });

    await waitFor(() =>
      expect(screen.getByText("Player 26")).toBeInTheDocument(),
    );
    expect(loadSeasonLeaderboardPage).toHaveBeenCalledWith({
      offset: 25,
      limit: 25,
    });
    expect(screen.getByText("Player 50")).toBeInTheDocument();
    expect(screen.getByText("Player 1")).toBeInTheDocument();
  });

  it("dedupes rows that reappear in a later page because standings shifted mid-scroll", async () => {
    loadSeasonLeaderboardPage.mockResolvedValue({
      ok: true,
      data: makePage({
        // Player 20 is already held from the initial page and climbed back
        // into the offset-25 window (live standings shift); 26-49 are new.
        rows: [...makeRows(20, 1), ...makeRows(26, 24)],
        total: 50,
      }),
    });

    render(<SeasonLeaderboardList initialPage={makePage({ total: 50 })} />);
    const observer = FakeIntersectionObserver.instances[0]!;

    act(() => {
      observer.trigger();
    });

    await waitFor(() =>
      expect(screen.getByText("Player 49")).toBeInTheDocument(),
    );
    expect(screen.getAllByText("Player 20")).toHaveLength(1);
  });

  it("stops requesting once the held row count reaches total", async () => {
    loadSeasonLeaderboardPage.mockResolvedValue({
      ok: true,
      data: makePage({ rows: makeRows(26, 5), total: 30 }),
    });

    render(<SeasonLeaderboardList initialPage={makePage({ total: 30 })} />);
    const observer = FakeIntersectionObserver.instances[0]!;

    act(() => {
      observer.trigger();
    });
    await waitFor(() =>
      expect(screen.getByText("Player 30")).toBeInTheDocument(),
    );
    expect(loadSeasonLeaderboardPage).toHaveBeenCalledTimes(1);
    // Deterministic passive-effect flush: without it, the `latest` ref mirror
    // may not have re-run yet when the second trigger fires below, and the
    // second trigger reads stale state (flaky ~1 run in 20 without this).
    await act(async () => {});

    act(() => {
      observer.trigger();
    });
    expect(loadSeasonLeaderboardPage).toHaveBeenCalledTimes(1);
  });

  it("never issues two loads at once", async () => {
    let resolveLoad: (value: unknown) => void = () => {};
    loadSeasonLeaderboardPage.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveLoad = resolve;
        }),
    );

    render(<SeasonLeaderboardList initialPage={makePage({ total: 100 })} />);
    const observer = FakeIntersectionObserver.instances[0]!;

    act(() => {
      observer.trigger();
      observer.trigger();
    });

    expect(loadSeasonLeaderboardPage).toHaveBeenCalledTimes(1);

    resolveLoad({
      ok: true,
      data: makePage({ rows: makeRows(26, 25), total: 100 }),
    });
    await waitFor(() =>
      expect(screen.getByText("Player 26")).toBeInTheDocument(),
    );
  });

  it("replaces the list rather than appending when the jump control is used", async () => {
    const myRow: SeasonBoardRow = {
      place: 50,
      userId: 50,
      points: 500,
      daysPlayed: 10,
      hits: 4,
      label: "Me",
    };
    loadSeasonLeaderboardPage.mockResolvedValue({
      ok: true,
      data: makePage({
        rows: makeRows(45, 25),
        total: 100,
        myPlace: 50,
        myRow,
      }),
    });

    render(
      <SeasonLeaderboardList
        initialPage={makePage({ total: 100, myPlace: 50, myRow })}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /К себе/ }));

    await waitFor(() =>
      expect(screen.getByText("Player 45")).toBeInTheDocument(),
    );
    expect(loadSeasonLeaderboardPage).toHaveBeenCalledWith({
      offset: 44,
      limit: 25,
    });
    expect(screen.queryByText("Player 1")).not.toBeInTheDocument();
    const firstRow = screen.getByText("Player 45").closest("tr");
    expect(firstRow).not.toBeNull();
    // toHaveTextContent("45") is a substring match over the whole row
    // ("45Player 4599555"), so it passes regardless of what the place cell
    // renders — anchor to the cell itself instead.
    expect(firstRow!.firstElementChild).toHaveTextContent(/^45$/);
  });

  it("stops requesting once a jump-then-scroll session reaches total, without querying past the end", async () => {
    const myRow: SeasonBoardRow = {
      place: 50,
      userId: 50,
      points: 500,
      daysPlayed: 10,
      hits: 4,
      label: "Me",
    };

    loadSeasonLeaderboardPage
      .mockResolvedValueOnce({
        ok: true,
        data: makePage({ rows: makeRows(45, 25), total: 94, myPlace: 50, myRow }),
      })
      .mockResolvedValueOnce({
        ok: true,
        data: makePage({ rows: makeRows(70, 25), total: 94, myPlace: 50, myRow }),
      })
      .mockResolvedValue({
        ok: true,
        data: makePage({ rows: [], total: 94, myPlace: 50, myRow }),
      });

    render(
      <SeasonLeaderboardList
        initialPage={makePage({ total: 94, myPlace: 50, myRow })}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /К себе/ }));
    await waitFor(() =>
      expect(screen.getByText("Player 45")).toBeInTheDocument(),
    );
    expect(loadSeasonLeaderboardPage).toHaveBeenCalledWith({
      offset: 44,
      limit: 25,
    });

    act(() => {
      FakeIntersectionObserver.instances.at(-1)!.trigger();
    });
    await waitFor(() =>
      expect(screen.getByText("Player 94")).toBeInTheDocument(),
    );
    expect(loadSeasonLeaderboardPage).toHaveBeenCalledTimes(2);
    await act(async () => {});

    // rangeStart(44) + rows.length(50) === total(94): fully loaded, even
    // though rows.length alone (50) is still well under total (94).
    act(() => {
      FakeIntersectionObserver.instances.at(-1)!.trigger();
    });
    expect(loadSeasonLeaderboardPage).toHaveBeenCalledTimes(2);
  });

  it("marks the list complete when an append comes back empty, even if the arithmetic still says more remain", async () => {
    loadSeasonLeaderboardPage.mockResolvedValue({
      ok: true,
      data: makePage({ rows: [], total: 100 }),
    });

    const { container } = render(
      <SeasonLeaderboardList initialPage={makePage({ total: 100 })} />,
    );
    const observer = FakeIntersectionObserver.instances[0]!;

    act(() => {
      observer.trigger();
    });
    // Wait for the load to fully settle (not just for the call to have
    // fired) — "called once" is true synchronously, before the empty
    // response has been processed into `exhausted`.
    await waitFor(() =>
      expect(screen.queryByText("Загрузка…")).not.toBeInTheDocument(),
    );
    expect(loadSeasonLeaderboardPage).toHaveBeenCalledTimes(1);
    // hasMore is now false: the sentinel effect should have torn down its
    // observer, and the sentinel node itself should be gone from the DOM.
    expect(observer.disconnect).toHaveBeenCalled();
    expect(
      container.querySelector(".c-leaderboard-sentinel"),
    ).not.toBeInTheDocument();
    await act(async () => {});

    act(() => {
      FakeIntersectionObserver.instances.at(-1)!.trigger();
    });
    expect(loadSeasonLeaderboardPage).toHaveBeenCalledTimes(1);
  });

  it("does not render a pinned row or jump control when myPlace is null", () => {
    render(<SeasonLeaderboardList initialPage={makePage({ total: 25 })} />);

    expect(screen.queryByText("К себе")).not.toBeInTheDocument();
  });

  it("shows a retry affordance after a failed load and lets the caller retry", async () => {
    loadSeasonLeaderboardPage
      .mockResolvedValueOnce({
        ok: false,
        code: "failed",
        message: "Не удалось загрузить таблицу лидеров.",
      })
      .mockResolvedValueOnce({
        ok: true,
        data: makePage({ rows: makeRows(26, 25), total: 50 }),
      });

    render(<SeasonLeaderboardList initialPage={makePage({ total: 50 })} />);
    act(() => {
      FakeIntersectionObserver.instances[0]!.trigger();
    });

    const retryButton = await screen.findByRole("button", {
      name: /Повторить/,
    });
    fireEvent.click(retryButton);

    await waitFor(() =>
      expect(screen.getByText("Player 26")).toBeInTheDocument(),
    );
    expect(loadSeasonLeaderboardPage).toHaveBeenCalledTimes(2);
  });
});
