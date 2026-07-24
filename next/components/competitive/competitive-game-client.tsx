"use client";

import {
  useCallback,
  useEffect,
  useState,
  type ReactElement,
} from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { LoadingState } from "@/components/daily/loading-state";
import { AnswerIndicators } from "@/components/answer-indicators";
import {
  CompetitiveRound,
  type CompetitiveRoundData,
  type RoundVoteResult,
} from "@/components/competitive/competitive-round";
import { useTransitionState } from "@/hooks/use-transition-state";
import { COMPETITIVE_ROUNDS } from "@/lib/competitive/constants";

type CompetitiveDailyPayload = Readonly<{
  date: string;
  totalRounds: number;
  rounds: CompetitiveRoundData[];
}>;

type BoardRow = Readonly<{
  place: number;
  label: string;
  points: number;
  isMe: boolean;
}>;

type GameState =
  | { type: "loading" }
  | { type: "playing"; data: CompetitiveDailyPayload }
  | {
      type: "complete";
      points: number;
      hits: number;
      answers: { isCorrect: boolean }[];
      board: BoardRow[];
      seasonPoints: number | null;
      place: number | null;
    }
  | { type: "error"; message: string };

/**
 * Competitive daily client — daily-style transitions + points final + mini board.
 */
export function CompetitiveGameClient(): ReactElement {
  const [gameState, setGameState] = useState<GameState>({ type: "loading" });
  const [currentRound, setCurrentRound] = useState(1);
  const [lastResult, setLastResult] = useState<RoundVoteResult | null>(null);
  const [isVoting, setIsVoting] = useState(false);
  const [answers, setAnswers] = useState<{ isCorrect: boolean }[]>([]);
  const { showResult, isTransitioning, setShowResult, startTransition } =
    useTransitionState();

  useEffect(() => {
    let cancelled = false;

    async function loadDaily(): Promise<void> {
      try {
        const res = await fetch("/api/competitive/daily", {
          method: "GET",
          credentials: "same-origin",
        });

        if (cancelled) return;

        if (res.status === 401) {
          setGameState({
            type: "error",
            message: "Нужно войти, чтобы играть в ranked.",
          });
          return;
        }

        if (res.status === 403) {
          setGameState({
            type: "error",
            message: "Соревновательный режим отключён.",
          });
          return;
        }

        if (res.status === 404) {
          setGameState({
            type: "error",
            message: "Дейлик на сегодня ещё не готов.",
          });
          return;
        }

        if (!res.ok) {
          const body = (await res.json().catch(() => null)) as {
            error?: string;
          } | null;
          setGameState({
            type: "error",
            message: body?.error ?? "Не удалось загрузить дейлик.",
          });
          return;
        }

        const data = (await res.json()) as CompetitiveDailyPayload;
        if (!data.rounds?.length) {
          setGameState({
            type: "error",
            message: "Дейлик на сегодня ещё не готов.",
          });
          return;
        }

        prefetchRoundImages(data, 1);
        if (data.rounds.length > 1) {
          prefetchRoundImages(data, 2);
        }

        setGameState({ type: "playing", data });
      } catch {
        if (!cancelled) {
          setGameState({
            type: "error",
            message: "Не удалось загрузить дейлик. Проверь сеть и попробуй снова.",
          });
        }
      }
    }

    void loadDaily();
    return () => {
      cancelled = true;
    };
  }, []);

  const finalizeDay = useCallback(
    async (
      date: string,
      dayAnswers: { isCorrect: boolean }[],
    ): Promise<void> => {
      try {
        const res = await fetch("/api/competitive/finalize", {
          method: "POST",
          credentials: "same-origin",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ date }),
        });

        if (!res.ok) {
          const body = (await res.json().catch(() => null)) as {
            error?: string;
          } | null;
          if (res.status === 409) {
            window.location.href = "/competitive";
            return;
          }
          setGameState({
            type: "error",
            message: body?.error ?? "Не удалось сохранить результат.",
          });
          return;
        }

        const body = (await res.json()) as { points: number; hits: number };

        // Mini leaderboard after standings update
        let board: BoardRow[] = [];
        let seasonPoints: number | null = null;
        let place: number | null = null;
        try {
          const hubRes = await fetch("/api/competitive/hub", {
            credentials: "same-origin",
          });
          if (hubRes.ok) {
            const hub = (await hubRes.json()) as {
              me?: { place: number | null; points: number; label?: string };
              top?: Array<{
                place: number;
                label: string;
                points: number;
                isMe: boolean;
              }>;
            };
            seasonPoints = hub.me?.points ?? null;
            place = hub.me?.place ?? null;
            const top = hub.top ?? [];
            const TOP_N = 8;
            board = top.slice(0, TOP_N).map((r) => ({
              place: r.place,
              label: r.label,
              points: r.points,
              isMe: r.isMe,
            }));

            // User outside top: fetch window me + 2 below
            if (place != null && place > TOP_N) {
              const offset = Math.max(0, place - 1);
              const lbRes = await fetch(
                `/api/competitive/leaderboard?limit=3&offset=${offset}`,
                { credentials: "same-origin" },
              );
              if (lbRes.ok) {
                const lb = (await lbRes.json()) as {
                  rows?: Array<{
                    place: number;
                    label: string;
                    points: number;
                    isMe: boolean;
                  }>;
                };
                for (const r of lb.rows ?? []) {
                  if (!board.some((b) => b.place === r.place)) {
                    board.push({
                      place: r.place,
                      label: r.label,
                      points: r.points,
                      isMe: r.isMe,
                    });
                  }
                }
                board.sort((a, b) => a.place - b.place);
              } else if (hub.me) {
                board.push({
                  place,
                  label: hub.me.label ?? "ты",
                  points: hub.me.points,
                  isMe: true,
                });
              }
            }
          }
        } catch {
          // board optional
        }

        setGameState({
          type: "complete",
          points: body.points,
          hits: body.hits,
          answers: dayAnswers,
          board,
          seasonPoints,
          place,
        });
      } catch {
        setGameState({
          type: "error",
          message: "Не удалось сохранить результат. Попробуй ещё раз.",
        });
      }
    },
    [],
  );

  const handleVote = useCallback(
    async (chosenScranId: number): Promise<void> => {
      if (gameState.type !== "playing" || isVoting) return;

      const { data } = gameState;
      const round = data.rounds.find(
        (r) => r.displayRoundNumber === currentRound,
      );
      if (!round) return;

      try {
        setIsVoting(true);

        const res = await fetch("/api/competitive/vote", {
          method: "POST",
          credentials: "same-origin",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            date: data.date,
            roundId: round.roundId,
            chosenScranId,
          }),
        });

        if (!res.ok) {
          const body = (await res.json().catch(() => null)) as {
            error?: string;
          } | null;
          if (res.status === 409) {
            setGameState({
              type: "error",
              message: body?.error ?? "День уже завершён или ответ записан.",
            });
            setIsVoting(false);
            return;
          }
          setGameState({
            type: "error",
            message: body?.error ?? "Не удалось записать голос.",
          });
          setIsVoting(false);
          return;
        }

        const result = (await res.json()) as RoundVoteResult;
        setLastResult(result);
        setShowResult(true);

        const nextAnswers = [
          ...answers,
          { isCorrect: result.isCorrect },
        ];
        setAnswers(nextAnswers);

        if (currentRound < data.totalRounds) {
          prefetchRoundImages(data, currentRound + 1);
        }

        startTransition(() => {
          setLastResult(null);

          if (currentRound < data.totalRounds) {
            setCurrentRound((n) => n + 1);
            setIsVoting(false);
          } else {
            void finalizeDay(data.date, nextAnswers);
          }
        });
      } catch {
        setGameState({
          type: "error",
          message: "Произошла ошибка при голосовании.",
        });
        setIsVoting(false);
      }
    },
    [
      gameState,
      isVoting,
      currentRound,
      answers,
      setShowResult,
      startTransition,
      finalizeDay,
    ],
  );

  switch (gameState.type) {
    case "loading":
      return <LoadingState message="Загрузка ranked…" />;

    case "error":
      return <ErrorPanel message={gameState.message} />;

    case "complete":
      return (
        <CompletePanel
          points={gameState.points}
          hits={gameState.hits}
          answers={gameState.answers}
          board={gameState.board}
          seasonPoints={gameState.seasonPoints}
          place={gameState.place}
        />
      );

    case "playing": {
      const round = gameState.data.rounds.find(
        (r) => r.displayRoundNumber === currentRound,
      );
      if (!round) {
        return <ErrorPanel message="Раунд не найден" />;
      }
      return (
        <CompetitiveRound
          round={round}
          totalRounds={gameState.data.totalRounds || COMPETITIVE_ROUNDS}
          lastResult={lastResult}
          showResult={showResult}
          isTransitioning={isTransitioning}
          isVoting={isVoting}
          onVote={handleVote}
        />
      );
    }

    default:
      return <ErrorPanel message="Неизвестное состояние" />;
  }
}

function prefetchRoundImages(
  data: CompetitiveDailyPayload,
  displayRoundNumber: number,
): void {
  if (typeof window === "undefined") return;
  const round = data.rounds.find(
    (r) => r.displayRoundNumber === displayRoundNumber,
  );
  if (!round) return;
  const imgA = new window.Image();
  const imgB = new window.Image();
  imgA.src = round.scranA.imageUrl;
  imgB.src = round.scranB.imageUrl;
}

function ErrorPanel({
  message,
}: Readonly<{ message: string }>): ReactElement {
  return (
    <div className="flex min-h-dvh items-center justify-center bg-zinc-950 px-4">
      <div className="w-full max-w-md border-4 border-black bg-white p-8 text-center text-black shadow-[6px_6px_0_#000]">
        <p className="mb-6 text-base text-zinc-800">{message}</p>
        <div className="flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
          <Link
            href="/competitive"
            className="pixel-btn pixel-btn-ok px-6 py-3 text-sm font-bold"
          >
            В хаб
          </Link>
          <Link href="/" className="pixel-btn px-6 py-3 text-sm font-bold">
            На главную
          </Link>
        </div>
      </div>
    </div>
  );
}

function CompletePanel({
  points,
  hits,
  answers,
  board,
  seasonPoints,
  place,
}: Readonly<{
  points: number;
  hits: number;
  answers: { isCorrect: boolean }[];
  board: BoardRow[];
  seasonPoints: number | null;
  place: number | null;
}>): ReactElement {
  return (
    <div className="retro-bg flex min-h-dvh flex-col items-center justify-center px-4 py-10">
      <div className="retro-overlay absolute inset-0" />
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="relative z-10 w-full max-w-2xl text-center"
      >
        <h1 className="pixel-text mb-6 text-3xl font-bold text-white sm:text-5xl">
          Результаты
        </h1>

        {answers.length > 0 ? (
          <AnswerIndicators answers={answers} delayIncrement={0.08} />
        ) : null}

        <div className="mb-6 space-y-3">
          <div className="pixel-container rounded-none border-4 border-black bg-zinc-900/85 p-5">
            <p className="pixel-text mb-2 text-sm text-white/70 sm:text-base">
              Очки за день
            </p>
            <p
              className="pixel-text text-5xl font-black sm:text-6xl"
              style={{ color: "#ffd22d", textShadow: "3px 3px 0 #3f3f00" }}
            >
              {points}
            </p>
            <p className="pixel-text mt-2 text-sm text-white/80">
              {pointsWord(points)} · {hits}/{answers.length || 10} верных
            </p>
          </div>

          {(seasonPoints != null || place != null) && (
            <div className="pixel-container rounded-none border-4 border-black bg-zinc-900/80 px-4 py-3">
              <p className="pixel-text text-sm text-white/80 sm:text-base">
                {place != null ? (
                  <>
                    Место в сезоне:{" "}
                    <span className="font-bold text-amber-300">#{place}</span>
                  </>
                ) : null}
                {place != null && seasonPoints != null ? " · " : null}
                {seasonPoints != null ? (
                  <>
                    Всего:{" "}
                    <span className="font-bold text-white">{seasonPoints}</span>
                  </>
                ) : null}
              </p>
            </div>
          )}
        </div>

        {board.length > 0 ? (
          <div className="pixel-container mb-8 overflow-hidden rounded-none border-4 border-black bg-zinc-900/90 text-left">
            <div className="border-b-2 border-black bg-zinc-800 px-3 py-2">
              <p className="pixel-text text-sm font-bold text-white">
                Лидерборд
              </p>
            </div>
            <ul className="divide-y divide-zinc-700">
              {board.flatMap((row, idx) => {
                const prev = board[idx - 1];
                const items: ReactElement[] = [];
                if (prev != null && row.place > prev.place + 1) {
                  items.push(
                    <li
                      key={`gap-${prev.place}-${row.place}`}
                      className="px-3 py-1 text-center text-xs text-white/40"
                    >
                      ···
                    </li>,
                  );
                }
                items.push(
                  <li
                    key={`${row.place}-${row.label}`}
                    className={`flex items-center justify-between gap-3 px-3 py-2 text-sm ${
                      row.isMe
                        ? "bg-violet-900/50 text-violet-100"
                        : "text-white/90"
                    }`}
                  >
                    <span className="pixel-text min-w-0 truncate">
                      <span className="mr-2 text-white/50">#{row.place}</span>
                      <span style={{ textTransform: "none" }}>{row.label}</span>
                      {row.isMe ? (
                        <span className="ml-2 text-[10px] text-amber-300">
                          ты
                        </span>
                      ) : null}
                    </span>
                    <span className="pixel-text shrink-0 tabular-nums text-amber-200">
                      {row.points}
                    </span>
                  </li>,
                );
                return items;
              })}
            </ul>
          </div>
        ) : null}

        <Link
          href="/competitive"
          className="pixel-btn inline-block px-8 py-4 text-lg"
        >
          В хаб
        </Link>
        <div className="mt-3">
          <Link href="/" className="pixel-btn inline-block px-6 py-3 text-sm">
            На главную
          </Link>
        </div>
      </motion.div>
    </div>
  );
}

function pointsWord(n: number): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return "очко";
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return "очка";
  return "очков";
}
