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
  const betterThanPercent =
    numberOfPlays > 0 ? (betterOfPlays / numberOfPlays) * 100 : 0;

  return (
    <div
      className="border-2 border-black p-4 sm:p-5"
      style={{
        background: "#ececec",
        boxShadow: "inset 2px 2px 0 #fff, inset -2px -2px 0 #8b8b8b",
      }}
    >
      <p className="mb-1 text-sm font-bold text-zinc-700">
        Лучше чем{" "}
        <span className="font-[family-name:var(--font-pixel)] text-amber-800">
          {betterThanPercent.toFixed(2)}%
        </span>{" "}
        игроков
      </p>
      <p className="pixel-text-on-light mb-6 text-base font-bold sm:text-lg">
        Распределение результатов
      </p>

      <div className="flex h-40 flex-col sm:h-48">
        <div className="flex flex-1 items-end gap-1 sm:gap-2">
          {distribution.map((item, index) => {
            const height = (item.count / maxCount) * 100;
            const isUserScore = item.score === userScore;

            return (
              <div
                key={item.score}
                className="relative flex flex-1 justify-center"
                style={{ height: `${Math.max(height, item.count > 0 ? 8 : 0)}%` }}
              >
                <motion.div
                  initial={{ height: 0 }}
                  animate={{ height: "100%" }}
                  transition={{ duration: 0.5, delay: index * 0.05 }}
                  className="w-full self-end border-2 border-black"
                  style={{
                    background: isUserScore ? "#ffcc00" : "#8b8b8b",
                    boxShadow: isUserScore
                      ? "inset 2px 2px 0 #ffe566, inset -2px -2px 0 #aa8800"
                      : "inset 2px 2px 0 #b5b5b5, inset -2px -2px 0 #555",
                  }}
                />
                {item.count > 0 && (
                  <motion.span
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ duration: 0.3, delay: index * 0.05 + 0.3 }}
                    className="absolute -top-5 text-[10px] font-bold text-zinc-900 sm:text-xs"
                  >
                    {item.count}
                  </motion.span>
                )}
              </div>
            );
          })}
        </div>
        <div className="mt-1 flex gap-1 sm:gap-2">
          {distribution.map((item) => {
            const isUserScore = item.score === userScore;
            return (
              <div key={item.score} className="flex-1 text-center">
                <span
                  className={`text-[10px] font-bold sm:text-xs ${
                    isUserScore ? "text-amber-800" : "text-zinc-700"
                  }`}
                >
                  {item.score}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center justify-center gap-4 text-xs font-bold text-zinc-700">
        <div className="flex items-center gap-2">
          <div
            className="h-3 w-3 border-2 border-black"
            style={{ background: "#ffcc00" }}
          />
          <span>Ваш результат</span>
        </div>
        <div className="flex items-center gap-2">
          <div
            className="h-3 w-3 border-2 border-black"
            style={{ background: "#8b8b8b" }}
          />
          <span>Другие игроки</span>
        </div>
      </div>
    </div>
  );
}
