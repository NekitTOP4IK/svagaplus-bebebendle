"use client";

import {
  useCallback,
  useEffect,
  useRef,
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
import { finalizeCompetitiveDay, submitCompetitiveVote } from "@/app/actions/competitive";
import type { CompetitiveDaySummary } from "@/lib/competitive/day-result";
import { AudioSceneBoundary } from "@/components/audio/audio-scene";
import { useOptionalAudioController } from "@/components/audio/audio-provider";
import { rankedOutcome } from "@/lib/audio/soundtrack";

type CompetitiveDailyPayload = Readonly<{
  date: string;
  totalRounds: number;
  rounds: CompetitiveRoundData[];
}>;

type GameState =
  | { type: "loading" }
  | { type: "playing"; data: CompetitiveDailyPayload }
  | {
      type: "complete";
      points: number;
      hits: number;
      answers: { isCorrect: boolean }[];
      summary: CompetitiveDaySummary;
    }
  | { type: "error"; message: string };

/**
 * Competitive daily client — daily-style transitions + points final + mini board.
 */
export function CompetitiveGameClient({ initialDaily }: Readonly<{ initialDaily: CompetitiveDailyPayload }>): ReactElement {
  const audioController = useOptionalAudioController();
  const enteredCompleteFromPlayRef = useRef(false);
  const firedOutcomeId = useRef<string | null>(null);
  const [gameState, setGameState] = useState<GameState>({ type: "playing", data: initialDaily });
  const [currentRound, setCurrentRound] = useState(1);
  const [lastResult, setLastResult] = useState<RoundVoteResult | null>(null);
  const [isVoting, setIsVoting] = useState(false);
  const [answers, setAnswers] = useState<{ isCorrect: boolean }[]>([]);
  const { showResult, isTransitioning, setShowResult, startTransition } =
    useTransitionState();

  const finalizeDay = useCallback(async (dayAnswers: { isCorrect: boolean }[]): Promise<void> => {
    const result = await finalizeCompetitiveDay();
    if (!result.ok) {
      setGameState({ type: "error", message: result.message });
      return;
    }
    enteredCompleteFromPlayRef.current = true;
    setGameState({
      type: "complete",
      points: result.data.points,
      hits: result.data.hits,
      answers: dayAnswers,
      summary: result.data.summary,
    });
  }, []);

  useEffect(() => {
    if (
      gameState.type !== "complete" ||
      !audioController ||
      !enteredCompleteFromPlayRef.current
    ) {
      return;
    }
    const eventId = `ranked-result:${initialDaily.date}`;
    if (firedOutcomeId.current === eventId) return;
    firedOutcomeId.current = eventId;
    enteredCompleteFromPlayRef.current = false;
    audioController.playOutcome(
      rankedOutcome({
        betterThanPercent: gameState.summary.betterThanPercent,
        hits: gameState.hits,
        totalRounds: initialDaily.totalRounds,
      }),
      eventId,
      true,
    );
  }, [audioController, gameState, initialDaily.date, initialDaily.totalRounds]);

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

        const actionResult = await submitCompetitiveVote({ roundId: round.roundId, chosenScranId });
        if (!actionResult.ok) {
          setGameState({ type: "error", message: actionResult.message });
          setIsVoting(false);
          return;
        }
        const result: RoundVoteResult = actionResult.data;
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
            void finalizeDay(nextAnswers);
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
        <>
          <AudioSceneBoundary scene="ranked-game" ownerId={`ranked-game:${initialDaily.date}`} />
          <CompletePanel
            points={gameState.points}
            hits={gameState.hits}
            answers={gameState.answers}
            summary={gameState.summary}
          />
        </>
      );

    case "playing": {
      const round = gameState.data.rounds.find(
        (r) => r.displayRoundNumber === currentRound,
      );
      if (!round) {
        return <ErrorPanel message="Раунд не найден" />;
      }
      return (
        <>
          <AudioSceneBoundary scene="ranked-game" ownerId={`ranked-game:${initialDaily.date}`} />
          <CompetitiveRound
            round={round}
            totalRounds={gameState.data.totalRounds || COMPETITIVE_ROUNDS}
            lastResult={lastResult}
            showResult={showResult}
            isTransitioning={isTransitioning}
            isVoting={isVoting}
            onVote={handleVote}
          />
        </>
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
  summary,
}: Readonly<{
  points: number;
  hits: number;
  answers: { isCorrect: boolean }[];
  summary: CompetitiveDaySummary;
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
              {hits}/{answers.length || 10} верных
            </p>
            {summary.betterThanPercent != null ? (
              <p className="pixel-text mt-2 text-sm text-amber-200">
                Ты лучше, чем {summary.betterThanPercent}% игроков сегодня
              </p>
            ) : null}
          </div>

          <div className="pixel-container rounded-none border-4 border-black bg-zinc-900/80 px-4 py-3">
            <p className="pixel-text text-sm text-white/80 sm:text-base">
              {summary.place != null ? (
                <>
                  Место в сезоне:{" "}
                  <span className="font-bold text-amber-300">#{summary.place}</span>
                </>
              ) : null}
              {summary.place != null ? " · " : null}
              {summary.seasonPoints != null ? (
                <>
                  Всего:{" "}
                  <span className="font-bold text-white">{summary.seasonPoints}</span>
                </>
              ) : null}
            </p>
          </div>
        </div>

        {summary.board.length > 0 ? (
          <div className="pixel-container mb-8 overflow-hidden rounded-none border-4 border-black bg-zinc-900/90 text-left">
            <div className="border-b-2 border-black bg-zinc-800 px-3 py-2">
              <p className="pixel-text text-sm font-bold text-white">
                Лидерборд
              </p>
            </div>
            <ul className="divide-y divide-zinc-700">
              {summary.board.flatMap((row, idx) => {
                const prev = summary.board[idx - 1];
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
