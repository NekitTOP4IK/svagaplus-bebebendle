"use client";

import { motion } from "framer-motion";
import type { ScoreDistributionItem } from "@/types/game";

interface ScoreHistogramProps {
  distribution: ScoreDistributionItem[];
  userScore: number;
}

export function ScoreHistogram({
  distribution,
  userScore,
}: ScoreHistogramProps) {
  const maxCount = Math.max(...distribution.map((d) => d.count), 1);
  const numberOfPlays = distribution.reduce((acc, item) => acc + item.count, 0);
  const betterOfPlays = distribution.reduce((acc, item) => {
    if (userScore <= item.score) {
      return acc;
    }

    return acc + item.count;
  }, 0);
  const betterThanPercent = (betterOfPlays / numberOfPlays) * 100;

  return (
    <div className="pixel-container rounded-2xl bg-zinc-900/80 p-6">
      <p className="pixel-text text-gray-400">
        Лучше чем{" "}
        <span className="text-yellow-500">{betterThanPercent.toFixed(2)}%</span>{" "}
        игроков
      </p>
      <p className="pixel-text mb-8 text-lg text-white">
        Распределение результатов
      </p>
      <div className="flex flex-col h-40 sm:h-48">
        <div className="flex-1 flex items-end gap-1 sm:gap-2">
          {distribution.map((item, index) => {
            const height = (item.count / maxCount) * 100;
            const isUserScore = item.score === userScore;

            return (
              <div
                key={item.score}
                className="flex-1 relative flex justify-center"
                style={{ height: `${height}%` }}
              >
                <motion.div
                  initial={{ height: 0 }}
                  animate={{ height: `100%` }}
                  transition={{ duration: 0.5, delay: index * 0.05 }}
                  className={`w-full rounded-t self-end ${
                    isUserScore
                      ? "bg-yellow-400 border-2 border-yellow-600"
                      : "bg-zinc-600 border-2 border-zinc-700"
                  }`}
                />
                {item.count > 0 && (
                  <motion.span
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ duration: 0.3, delay: index * 0.05 + 0.3 }}
                    className="absolute -top-6 text-xs font-bold text-white"
                  >
                    {item.count}
                  </motion.span>
                )}
              </div>
            );
          })}
        </div>
        <div className="flex gap-1 sm:gap-2 mt-1">
          {distribution.map((item) => {
            const isUserScore = item.score === userScore;
            return (
              <div key={item.score} className="flex-1 text-center">
                <span
                  className={`text-xs font-bold ${
                    isUserScore ? "text-yellow-400" : "text-zinc-400"
                  }`}
                >
                  {item.score}
                </span>
              </div>
            );
          })}
        </div>
      </div>
      <div className="mt-4 flex items-center justify-center gap-4 text-xs text-zinc-400">
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 bg-yellow-400 border border-yellow-600 rounded" />
          <span>Ваш результат</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 bg-zinc-600 border border-zinc-700 rounded" />
          <span>Другие игроки</span>
        </div>
      </div>
    </div>
  );
}
