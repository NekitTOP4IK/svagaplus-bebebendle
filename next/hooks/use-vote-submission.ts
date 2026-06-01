"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import type { UserAnswer } from "@/types/game";

interface UseVoteSubmissionReturn {
  currentRound: number;
  userAnswers: UserAnswer[];
  lastAnswer: UserAnswer | null;
  isVoting: boolean;
  setIsVoting: (value: boolean) => void;
  addAnswer: (answer: UserAnswer) => void;
  incrementRound: () => void;
  getCorrectCount: () => number;
  resetLastAnswer: () => void;
  getCurrentAnswers: () => UserAnswer[];
}

export function useVoteSubmission(): UseVoteSubmissionReturn {
  const [currentRound, setCurrentRound] = useState(1);
  const [userAnswers, setUserAnswers] = useState<UserAnswer[]>([]);
  const [lastAnswer, setLastAnswer] = useState<UserAnswer | null>(null);
  const [isVoting, setIsVoting] = useState(false);
  const userAnswersRef = useRef<UserAnswer[]>([]);

  useEffect(() => {
    userAnswersRef.current = userAnswers;
  }, [userAnswers]);

  const addAnswer = useCallback((answer: UserAnswer) => {
    setLastAnswer(answer);
    setUserAnswers((prev) => {
      const next = [...prev, answer];
      userAnswersRef.current = next;
      return next;
    });
  }, []);

  const incrementRound = useCallback(() => {
    setCurrentRound((prev) => prev + 1);
  }, []);

  const getCorrectCount = useCallback(() => {
    return userAnswers.filter((a) => a.isCorrect).length;
  }, [userAnswers]);

  const resetLastAnswer = useCallback(() => {
    setLastAnswer(null);
  }, []);

  const getCurrentAnswers = useCallback(() => {
    return userAnswersRef.current;
  }, []);

  return {
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
  };
}
