"use client";

import type { ReactElement } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { RoundCard } from "@/components/daily/round-card";
import { TransitionOverlay } from "@/components/daily/transition-overlay";

export type CompetitiveScran = Readonly<{
  id: number;
  imageUrl: string;
  name: string;
  description: string | null;
  price: number;
  icon: string;
  isSubscriberAtSubmit?: boolean | null;
}>;

export type CompetitiveRoundData = Readonly<{
  roundNumber: number;
  roundId: number;
  potentialPoints: number;
  scranA: CompetitiveScran;
  scranB: CompetitiveScran;
}>;

export type RoundVoteResult = Readonly<{
  isCorrect: boolean;
  percentageA: number;
  percentageB: number;
  potentialPoints: number;
  earnedPoints: number;
}>;

type Props = Readonly<{
  round: CompetitiveRoundData;
  totalRounds: number;
  lastResult: RoundVoteResult | null;
  showResult: boolean;
  isTransitioning: boolean;
  isVoting: boolean;
  onVote: (scranId: number) => void;
}>;

function formatPct(value: number): string {
  return `${Math.round(value)}%`;
}

/**
 * Competitive round board: A/B cards from daily RoundCard patterns.
 * Pre-answer: centered +N pts (does not reveal winner).
 * Post-answer: percentages + earned points only.
 */
export function CompetitiveRound({
  round,
  totalRounds,
  lastResult,
  showResult,
  isTransitioning,
  isVoting,
  onVote,
}: Props): ReactElement {
  const { scranA, scranB, potentialPoints, roundNumber } = round;
  const resultVisible = showResult && lastResult !== null;

  return (
    <div className="retro-bg relative h-dvh w-full overflow-hidden">
      <div className="retro-overlay absolute inset-0" />

      <ResultGlow result={lastResult} isVisible={resultVisible} />
      <TransitionOverlay isVisible={isTransitioning} />

      <div className="pixel-text absolute left-4 top-4 z-20 text-sm font-bold text-white sm:text-xl">
        COMPETITIVE
      </div>

      <div className="pixel-text absolute right-4 top-4 z-20 text-sm font-bold text-white sm:text-xl">
        раунд {roundNumber}/{totalRounds}
      </div>

      <div className="relative z-10 flex h-full w-full flex-col md:flex-row">
        <RoundCard
          scran={scranA}
          onVote={() => onVote(scranA.id)}
          isVoting={isVoting || resultVisible}
          position="left"
        />
        <RoundCard
          scran={scranB}
          onVote={() => onVote(scranB.id)}
          isVoting={isVoting || resultVisible}
          position="right"
        />
      </div>

      {/* Center stack: potential pts pre-answer; pct + earned post-answer */}
      <div className="pointer-events-none absolute left-1/2 top-1/2 z-20 flex -translate-x-1/2 -translate-y-1/2 flex-col items-center gap-3">
        <AnimatePresence mode="wait">
          {resultVisible && lastResult ? (
            <motion.div
              key="result"
              initial={{ opacity: 0, scale: 0.85 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              transition={{ duration: 0.25 }}
              className="flex flex-col items-center gap-4"
            >
              <div className="flex items-center justify-center gap-6 sm:gap-12">
                <p className="pixel-text text-4xl font-black text-white sm:text-6xl">
                  {formatPct(lastResult.percentageA)}
                </p>
                <p className="pixel-text text-2xl font-black text-white sm:text-4xl">
                  VS
                </p>
                <p className="pixel-text text-4xl font-black text-white sm:text-6xl">
                  {formatPct(lastResult.percentageB)}
                </p>
              </div>
              <div
                className="pixel-text px-4 py-2 text-lg font-bold sm:text-2xl"
                style={{
                  backgroundColor: lastResult.isCorrect ? "#166534" : "#7f1d1d",
                  border: "4px solid #000",
                  boxShadow: "4px 4px 0 rgba(0,0,0,0.5)",
                  color: "#fff",
                }}
              >
                {lastResult.earnedPoints > 0
                  ? `+${lastResult.earnedPoints} pts`
                  : "+0 pts"}
              </div>
            </motion.div>
          ) : (
            <motion.div
              key="pre"
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              transition={{ duration: 0.2 }}
              className="flex flex-col items-center gap-3"
            >
              <div className="pixel-btn flex h-12 w-12 items-center justify-center bg-white text-lg font-black text-black md:h-16 md:w-16 md:text-xl lg:h-20 lg:w-20 lg:text-2xl">
                VS
              </div>
              <div
                className="pixel-text px-3 py-1.5 text-sm font-bold sm:text-base md:text-lg"
                style={{
                  backgroundColor: "#5b21b6",
                  border: "3px solid #000",
                  boxShadow:
                    "3px 3px 0 rgba(0,0,0,0.55), 0 0 18px rgba(168,85,247,0.55)",
                  color: "#fde68a",
                  textShadow: "1px 1px 0 #3b0764",
                }}
                aria-label={`За раунд можно получить ${potentialPoints} очков`}
              >
                +{potentialPoints} pts
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

function ResultGlow({
  result,
  isVisible,
}: Readonly<{
  result: RoundVoteResult | null;
  isVisible: boolean;
}>): ReactElement {
  return (
    <AnimatePresence>
      {isVisible && result ? (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.3 }}
          className="pointer-events-none fixed inset-0 z-30"
          style={{
            boxShadow: result.isCorrect
              ? "inset 0 0 150px 80px rgba(34,197,94,0.55), inset 0 0 300px 150px rgba(34,197,94,0.25)"
              : "inset 0 0 150px 80px rgba(239,68,68,0.55), inset 0 0 300px 150px rgba(239,68,68,0.25)",
          }}
        />
      ) : null}
    </AnimatePresence>
  );
}
