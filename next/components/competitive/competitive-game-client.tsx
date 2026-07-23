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

type GameState =
  | { type: "loading" }
  | { type: "playing"; data: CompetitiveDailyPayload }
  | { type: "complete"; points: number; hits: number }
  | { type: "error"; message: string };

/**
 * Client game state machine for competitive daily.
 * Auth-only (cookie session); no fingerprint.
 *
 * Flow: load daily → vote each round → after 10 finalize → day points → hub link.
 */
export function CompetitiveGameClient(): ReactElement {
  const [gameState, setGameState] = useState<GameState>({ type: "loading" });
  const [currentRound, setCurrentRound] = useState(1);
  const [lastResult, setLastResult] = useState<RoundVoteResult | null>(null);
  const [isVoting, setIsVoting] = useState(false);
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
            message: "Нужно войти, чтобы играть в competitive.",
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

        // Prefetch first round images
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
    async (date: string): Promise<void> => {
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
            // Already finalized (e.g. double-submit / refresh race) → hub
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
        setGameState({
          type: "complete",
          points: body.points,
          hits: body.hits,
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
      const round = data.rounds.find((r) => r.roundNumber === currentRound);
      if (!round) return;

      try {
        setIsVoting(true);

        const res = await fetch("/api/competitive/vote", {
          method: "POST",
          credentials: "same-origin",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            roundNumber: currentRound,
            chosenScranId,
            date: data.date,
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

        if (currentRound < data.totalRounds) {
          prefetchRoundImages(data, currentRound + 1);
        }

        startTransition(() => {
          setLastResult(null);

          if (currentRound < data.totalRounds) {
            setCurrentRound((n) => n + 1);
            setIsVoting(false);
          } else {
            void finalizeDay(data.date);
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
      setShowResult,
      startTransition,
      finalizeDay,
    ],
  );

  switch (gameState.type) {
    case "loading":
      return <LoadingState message="Загрузка competitive…" />;

    case "error":
      return <ErrorPanel message={gameState.message} />;

    case "complete":
      return <CompletePanel points={gameState.points} />;

    case "playing": {
      const round = gameState.data.rounds.find(
        (r) => r.roundNumber === currentRound,
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
  roundNumber: number,
): void {
  if (typeof window === "undefined") return;
  const round = data.rounds.find((r) => r.roundNumber === roundNumber);
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
            className="inline-block border-4 border-black bg-yellow-400 px-6 py-3 font-[family-name:var(--font-pixel)] text-sm text-black hover:bg-yellow-300"
          >
            В хаб
          </Link>
          <Link
            href="/"
            className="inline-block border-4 border-black bg-white px-6 py-3 font-[family-name:var(--font-pixel)] text-sm text-black hover:bg-zinc-100"
          >
            На главную
          </Link>
        </div>
      </div>
    </div>
  );
}

function CompletePanel({
  points,
}: Readonly<{ points: number }>): ReactElement {
  return (
    <div className="retro-bg flex min-h-dvh flex-col items-center justify-center px-4">
      <div className="retro-overlay absolute inset-0" />
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.45 }}
        className="relative z-10 w-full max-w-lg text-center"
      >
        <h1 className="pixel-text mb-4 text-3xl font-bold text-white sm:text-5xl">
          День завершён
        </h1>
        <p className="pixel-text mb-2 text-sm text-zinc-300 sm:text-base">
          Сегодня набрано
        </p>
        <p
          className="pixel-text mb-6 text-5xl font-black sm:text-7xl"
          style={{ color: "#ffd22d", textShadow: "3px 3px 0 #3f3f00" }}
        >
          {points}
        </p>
        <p className="pixel-text mb-10 text-base text-white sm:text-xl">
          {pointsWord(points)}
        </p>
        <Link
          href="/competitive"
          className="pixel-btn inline-block px-8 py-4 text-lg"
        >
          В хаб
        </Link>
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
