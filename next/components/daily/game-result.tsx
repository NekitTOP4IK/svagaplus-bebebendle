"use client";

import { useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { BarChart3 } from "lucide-react";
import { AnswerIndicators } from "@/components/answer-indicators";
import { ScoreDisplay } from "@/components/score-display";
import { AverageScoreDisplay } from "@/components/average-score-display";
import { HistogramModal } from "@/components/histogram-modal";
import { ShareButton } from "@/components/share-button";
import type { UserAnswer, ScoreDistributionItem } from "@/types/game";

interface GameResultProps {
  userAnswers: UserAnswer[];
  score: number;
  averageScore: number | null;
  scoreDistribution: ScoreDistributionItem[];
}

export function GameResult({
  userAnswers,
  score,
  averageScore,
  scoreDistribution,
}: GameResultProps) {
  const trueScore = userAnswers.filter(({ isCorrect }) => isCorrect).length;
  const [showHistogram, setShowHistogram] = useState(false);

  return (
    <div className="retro-bg flex min-h-dvh flex-col items-center justify-center px-4">
      <div className="retro-overlay absolute inset-0" />
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="relative z-10 w-full max-w-4xl text-center"
      >
        <h1 className="pixel-text mb-8 text-4xl font-bold text-white sm:text-5xl">
          Результаты
        </h1>

        <AnswerIndicators answers={userAnswers} delayIncrement={0.1} />

        <div className="mb-8 space-y-4">
          <ScoreDisplay score={trueScore} />
          <AverageScoreDisplay
            averageScore={averageScore !== null ? averageScore : trueScore}
          />
        </div>

        {scoreDistribution.length > 0 && (
          <button
            onClick={() => setShowHistogram(true)}
            className="pixel-btn mb-4 inline-flex items-center gap-2 border-4 border-black bg-blue-500 px-6 py-3 text-base text-white hover:bg-blue-400"
          >
            <BarChart3 className="w-5 h-5" />
            Распределение результатов
          </button>
        )}

        <div className="block">
          <ShareButton userAnswers={userAnswers} score={trueScore} />
        </div>

        <Link
          href="/"
          className="pixel-btn mt-4 inline-block border-4 border-black bg-yellow-400 px-8 py-4 text-lg text-black hover:bg-yellow-300"
        >
          На главную
        </Link>

        {scoreDistribution.length > 0 && (
          <HistogramModal
            isOpen={showHistogram}
            onClose={() => setShowHistogram(false)}
            distribution={scoreDistribution}
            userScore={trueScore}
          />
        )}
      </motion.div>
    </div>
  );
}
