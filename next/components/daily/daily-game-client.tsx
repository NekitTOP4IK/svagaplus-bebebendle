"use client";

import { useDailyGame } from "@/hooks/use-daily-game";
import { useEffect, useRef } from "react";
import { AudioSceneBoundary } from "@/components/audio/audio-scene";
import { useOptionalAudioController } from "@/components/audio/audio-provider";
import { casualOutcome } from "@/lib/audio/soundtrack";
import { LoadingState } from "@/components/daily/loading-state";
import { ErrorState } from "@/components/daily/error-state";
import { GameResult } from "@/components/daily/game-result";
import { GameBoard } from "@/components/daily/game-board";
import type { DailyData } from "@/types/game";

interface DailyGameClientProps {
  initialData: DailyData;
}

export function DailyGameClient({ initialData }: DailyGameClientProps) {
  const audioController = useOptionalAudioController();
  const firedOutcomeId = useRef<string | null>(null);
  const {
    gameState,
    currentRound,
    userAnswers,
    lastAnswer,
    showResult,
    isTransitioning,
    isVoting,
    handleVote,
  } = useDailyGame({ initialData });

  useEffect(() => {
    if (gameState.type !== "complete" || !audioController) return;
    const eventId = `casual-result:${initialData.date}`;
    if (firedOutcomeId.current === eventId) return;
    firedOutcomeId.current = eventId;
    audioController.playOutcome(
      casualOutcome(gameState.score, gameState.averageScore),
      eventId,
    );
  }, [audioController, gameState, initialData.date]);

  switch (gameState.type) {
    case "loading":
      return <LoadingState />;

    case "error":
      return <ErrorState message={gameState.message} />;

    case "complete":
      return (
        <GameResult
          userAnswers={userAnswers}
          score={gameState.score}
          averageScore={gameState.averageScore}
          scoreDistribution={gameState.scoreDistribution}
        />
      );

    case "playing":
      return (
        <>
          <AudioSceneBoundary scene="casual-game" ownerId={`casual-game:${initialData.date}`} />
          <GameBoard
            data={gameState.data}
            currentRound={currentRound}
            lastAnswer={lastAnswer}
            showResult={showResult}
            isTransitioning={isTransitioning}
            isVoting={isVoting}
            onVote={handleVote}
          />
        </>
      );

    case "already-played":
      return (
        <GameResult
          userAnswers={gameState.result.userAnswers}
          score={gameState.result.score}
          averageScore={null}
          scoreDistribution={[]}
        />
      );

    default:
      return <ErrorState message="Неизвестное состояние" />;
  }
}
