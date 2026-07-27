"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactElement,
} from "react";
import { loadSeasonLeaderboardPage } from "@/app/actions/competitive";
import type {
  SeasonBoardRow,
  SeasonLeaderboardPage,
} from "@/lib/competitive/standings";
import { SEASON_LEADERBOARD_PAGE_SIZE } from "@/lib/competitive/constants";

const PAGE_SIZE = SEASON_LEADERBOARD_PAGE_SIZE;
const JUMP_LOOKBACK = 6;

type PendingAction = "append" | "jump" | "top";

type LoadRequest = Readonly<{
  action: PendingAction;
  offset: number;
  mode: "append" | "replace";
  highlightSelfAfter: boolean;
}>;

type LoadError = Readonly<{
  request: LoadRequest;
  message: string;
}>;

type Props = Readonly<{
  initialPage: SeasonLeaderboardPage;
}>;

/**
 * Full season leaderboard: a contiguous window of rows starting at
 * `rangeStart`, grown by scrolling past the sentinel and replaced wholesale
 * by the "К себе" / "К началу" controls.
 */
export function SeasonLeaderboardList({ initialPage }: Props): ReactElement {
  const [rows, setRows] = useState<SeasonBoardRow[]>(initialPage.rows);
  const [rangeStart, setRangeStart] = useState(0);
  const [total, setTotal] = useState(initialPage.total);
  const [myPlace, setMyPlace] = useState(initialPage.myPlace);
  const [myRow, setMyRow] = useState(initialPage.myRow);
  const [pending, setPending] = useState<PendingAction | null>(null);
  const [error, setError] = useState<LoadError | null>(null);
  const [highlightUserId, setHighlightUserId] = useState<number | null>(null);
  // Belt-and-braces stop: an append that comes back with no rows means the
  // list is done regardless of what the arithmetic below says, in case
  // `total` is ever stale or undercounted.
  const [exhausted, setExhausted] = useState(false);

  const isLoadingRef = useRef(false);
  const sentinelRef = useRef<HTMLDivElement | null>(null);

  // Mirrors state into a ref so the observer callback (created once) always
  // reads the latest values instead of the ones captured at creation time.
  const latest = useRef({ rows, total, rangeStart, myPlace, exhausted });
  useEffect(() => {
    latest.current = { rows, total, rangeStart, myPlace, exhausted };
  });

  // The held window is [rangeStart, rangeStart + rows.length). Comparing
  // rows.length alone against total is only correct while rangeStart is 0 —
  // after a jump replaces the window at a non-zero offset, the caller's
  // position in the full list is rangeStart + rows.length, not rows.length.
  const hasMore = !exhausted && rangeStart + rows.length < total;

  const runLoad = useCallback(async (request: LoadRequest): Promise<void> => {
    if (isLoadingRef.current) return;
    isLoadingRef.current = true;
    setPending(request.action);
    setError(null);
    try {
      const result = await loadSeasonLeaderboardPage({
        offset: request.offset,
        limit: PAGE_SIZE,
      });
      if (!result.ok) {
        setError({ request, message: result.message });
        return;
      }
      const page = result.data;
      setTotal(page.total);
      setMyPlace(page.myPlace);
      setMyRow(page.myRow);
      if (request.mode === "append") {
        // Standings shift under live play: a page fetched at a stale offset
        // can re-return someone already in `prev` (they climbed past it
        // between fetches). Drop repeats so React keys stay unique.
        const held = new Set(latest.current.rows.map((row) => row.userId));
        const fresh = page.rows.filter((row) => !held.has(row.userId));
        setRows((prev) => [...prev, ...fresh]);
        // Nothing new means the next offset — derived from rows.length — would
        // be the one just requested, so continuing would re-fetch it forever.
        if (fresh.length === 0) setExhausted(true);
      } else {
        setRows(page.rows);
        setRangeStart(request.offset);
        setExhausted(false);
      }
      setHighlightUserId(
        request.highlightSelfAfter ? (page.myRow?.userId ?? null) : null,
      );
    } finally {
      isLoadingRef.current = false;
      setPending(null);
    }
  }, []);

  const loadMore = useCallback((): void => {
    const state = latest.current;
    if (state.exhausted || state.rangeStart + state.rows.length >= state.total) {
      return;
    }
    void runLoad({
      action: "append",
      offset: state.rangeStart + state.rows.length,
      mode: "append",
      highlightSelfAfter: false,
    });
  }, [runLoad]);

  useEffect(() => {
    if (!hasMore) return undefined;
    const node = sentinelRef.current;
    if (!node || typeof IntersectionObserver === "undefined") return undefined;
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) {
        loadMore();
      }
    });
    observer.observe(node);
    return () => observer.disconnect();
    // rows.length re-arms the observer after every settled append: IntersectionObserver
    // only fires on threshold crossings, so if the sentinel is still intersecting once
    // new rows land (tall viewport, short final page), a fresh observer is what notices.
  }, [hasMore, loadMore, rows.length]);

  const handleJump = useCallback((): void => {
    const place = latest.current.myPlace;
    if (place == null) return;
    const offset = Math.max(0, place - JUMP_LOOKBACK);
    void runLoad({
      action: "jump",
      offset,
      mode: "replace",
      highlightSelfAfter: true,
    });
  }, [runLoad]);

  const handleBackToTop = useCallback((): void => {
    void runLoad({
      action: "top",
      offset: 0,
      mode: "replace",
      highlightSelfAfter: false,
    });
  }, [runLoad]);

  const handleRetry = useCallback((): void => {
    if (!error) return;
    void runLoad(error.request);
  }, [error, runLoad]);

  const isBusy = pending !== null;

  return (
    <div className="c-leaderboard-list">
      {rangeStart > 0 ? (
        <div className="c-leaderboard-toolbar">
          <button
            type="button"
            className="pixel-btn px-3 py-1.5 text-xs font-bold"
            onClick={handleBackToTop}
            disabled={isBusy}
          >
            К началу
          </button>
        </div>
      ) : null}

      <div className="c-leaderboard-table-wrap c-table-wrap">
        <table className="c-table">
          <thead>
            <tr>
              <th>#</th>
              <th>Ник</th>
              <th>очки</th>
              <th>дней</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const isMe = myRow != null && row.userId === myRow.userId;
              const isHighlighted = row.userId === highlightUserId;
              const rowClassName = [
                isMe ? "c-row-me" : null,
                isHighlighted ? "c-row-highlight" : null,
              ]
                .filter(Boolean)
                .join(" ");
              return (
                <tr
                  key={row.userId}
                  className={rowClassName || undefined}
                  id={isMe ? "currentPlayer" : undefined}
                >
                  <td>{row.place}</td>
                  <td className="c-nick" title={row.label}>
                    {row.label}
                  </td>
                  <td>{row.points}</td>
                  <td>{row.daysPlayed}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {hasMore ? (
        <div
          ref={sentinelRef}
          className="c-leaderboard-sentinel"
          aria-hidden
        />
      ) : null}

      {pending === "append" ? (
        <p className="c-leaderboard-loading">Загрузка…</p>
      ) : null}

      {error ? (
        <div className="c-leaderboard-error" role="alert">
          <p>{error.message}</p>
          <button
            type="button"
            className="pixel-btn pixel-btn-warn px-3 py-1.5 text-xs font-bold"
            onClick={handleRetry}
          >
            Повторить
          </button>
        </div>
      ) : null}

      {myPlace != null && myRow != null ? (
        <button
          type="button"
          className="c-leaderboard-pinned"
          onClick={handleJump}
          disabled={isBusy}
        >
          <span className="c-leaderboard-pinned__label">К себе</span>
          <span className="c-leaderboard-pinned__place">#{myRow.place}</span>
          <span className="c-leaderboard-pinned__points">
            {myRow.points} очков
          </span>
        </button>
      ) : null}
    </div>
  );
}
