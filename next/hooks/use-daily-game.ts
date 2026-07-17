"use client";

import { useEffect, useCallback } from "react";
import { getFingerprint } from "@/lib/fingerprint";
import { saveDailyResult } from "@/lib/cookies";
import {
  submitDailyVote,
  submitDailyResult,
  getDailyAverage,
} from "@/app/actions/daily";
import { buildUserAnswer } from "@/lib/game-helpers";
import { useDailyData } from "@/hooks/use-daily-data";
import { useVoteSubmission } from "@/hooks/use-vote-submission";
import { useTransitionState } from "@/hooks/use-transition-state";
import { useImagePreloader } from "@/hooks/use-image-preloader";
import type { GameState, UserAnswer, DailyData } from "@/types/game";

interface UseDailyGameProps {
  initialData?: DailyData;
}

interface UseDailyGameReturn {
  gameState: GameState;
  currentRound: number;
  userAnswers: UserAnswer[];
  lastAnswer: UserAnswer | null;
  showResult: boolean;
  isTransitioning: boolean;
  isVoting: boolean;
  handleVote: (chosenScranId: number) => Promise<void>;
}

const TOTAL_ROUNDS = 10;

export function useDailyGame({
  initialData,
}: UseDailyGameProps = {}): UseDailyGameReturn {
  // Compose smaller hooks
  const { dailyData, gameState, setGameState } = useDailyData(initialData);
  const {
    currentRound,
    userAnswers,
    lastAnswer,
    isVoting,
    setIsVoting,
    addAnswer,
    incrementRound,
    getCorrectCount,
    resetLastAnswer,
    getCurrentAnswers,
  } = useVoteSubmission();
  const { showResult, isTransitioning, setShowResult, startTransition } =
    useTransitionState();
  const { prefetchNextRound } = useImagePreloader();

  // Initialize fingerprint
  useEffect(() => {
    getFingerprint();
  }, []);

  // Submit final score — server recomputes from stored round votes
  const submitScore = useCallback(async () => {
    if (!dailyData) return;
    const answers = getCurrentAnswers();
    const clientScoreGuess = answers.filter(({ isCorrect }) => isCorrect).length;

    try {
      const fingerprint = await getFingerprint();
      const result = await submitDailyResult(
        dailyData.date,
        clientScoreGuess,
        fingerprint,
      );

      if ("error" in result) {
        setGameState({
          type: "error",
          message: result.error || "Не удалось сохранить результат",
        });
        return;
      }

      const score = result.score;
      const avgData = await getDailyAverage(dailyData.date);

      setGameState({
        type: "complete",
        score,
        averageScore: avgData.averageScore,
        scoreDistribution: avgData.scoreDistribution,
      });

      saveDailyResult({
        date: dailyData.date,
        score,
        totalRounds: TOTAL_ROUNDS,
        userAnswers: [...answers],
      });
    } catch (error) {
      console.error("Error submitting score:", error);
      setGameState({
        type: "error",
        message: "Не удалось сохранить результат. Попробуй ещё раз.",
      });
    }
  }, [dailyData, getCurrentAnswers, setGameState]);

  // Handle vote submission
  const handleVote = useCallback(
    async (chosenScranId: number) => {
      if (!dailyData || isVoting) return;

      const currentRoundData = dailyData.rounds.find(
        (r) => r.roundNumber === currentRound,
      );
      if (!currentRoundData) return;

      try {
        setIsVoting(true);
        const fingerprint = await getFingerprint();
        const result = await submitDailyVote(
          currentRound,
          chosenScranId,
          currentRoundData.scranA.id,
          currentRoundData.scranB.id,
          fingerprint,
          dailyData.date,
        );

        if ("error" in result) {
          setGameState({
            type: "error",
            message: result.error || "Unknown error",
          });
          setIsVoting(false);
          return;
        }

        if (result.success) {
          const answer = buildUserAnswer(
            currentRound,
            result.isCorrect,
            result.chosenScranId,
            result.correctScranId,
            result.percentageA,
            result.percentageB,
          );

          addAnswer(answer);
          setShowResult(true);

          // Prefetch next round images
          if (currentRound < TOTAL_ROUNDS) {
            prefetchNextRound(dailyData, currentRound + 1);
          }

          startTransition(() => {
            resetLastAnswer();

            if (currentRound < TOTAL_ROUNDS) {
              incrementRound();
              setIsVoting(false);
            } else {
              submitScore();
            }
          });
        }
      } catch {
        setGameState({ type: "error", message: "Произошла ошибка" });
        setIsVoting(false);
      }
    },
    [
      dailyData,
      isVoting,
      currentRound,
      setIsVoting,
      addAnswer,
      setShowResult,
      prefetchNextRound,
      startTransition,
      resetLastAnswer,
      incrementRound,
      getCorrectCount,
      submitScore,
      setGameState,
    ],
  );

  return {
    gameState,
    currentRound,
    userAnswers,
    lastAnswer,
    showResult,
    isTransitioning,
    isVoting,
    handleVote,
  };
}
