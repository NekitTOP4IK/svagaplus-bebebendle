"use client";

import type { ReactElement } from "react";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import { RoundCard } from "@/components/daily/round-card";
import { TransitionOverlay } from "@/components/daily/transition-overlay";
import { VsBadge } from "@/components/daily/vs-badge";

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

/**
 * Competitive round board — same layout/animations as daily GameBoard.
 * +N pts only after answer reveal (correct/wrong).
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
  const { scranA, scranB, roundNumber } = round;
  const resultVisible = showResult && lastResult !== null;

  return (
    <div className="retro-bg relative h-dvh w-full overflow-hidden">
      <div className="retro-overlay absolute inset-0" />

      <CompetitiveResultOverlay result={lastResult} isVisible={resultVisible} />
      <TransitionOverlay isVisible={isTransitioning} />

      <Link
        href="/competitive"
        className="pixel-text absolute left-4 top-4 z-20 text-xl font-bold text-white transition-colors hover:text-yellow-300"
      >
        ranked
      </Link>

      <div className="pixel-text absolute right-4 top-4 z-20 text-xl font-bold text-white">
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

      <VsBadge hidden={resultVisible} />
    </div>
  );
}

/** Daily-style % VS % + earned pts only after reveal. */
function CompetitiveResultOverlay({
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
              ? "inset 0 0 150px 80px rgba(34,197,94,0.6), inset 0 0 300px 150px rgba(34,197,94,0.3)"
              : "inset 0 0 150px 80px rgba(239,68,68,0.6), inset 0 0 300px 150px rgba(239,68,68,0.3)",
          }}
        >
          <div className="flex h-full flex-col items-center justify-center gap-6">
            <motion.div
              initial={{ scale: 0.5, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              className="flex items-center justify-center gap-8 sm:gap-16"
            >
              <p className="pixel-text text-5xl font-black text-white sm:text-7xl">
                {Math.round(result.percentageA)}%
              </p>
              <p className="pixel-text text-4xl font-black text-white sm:text-6xl">
                VS
              </p>
              <p className="pixel-text text-5xl font-black text-white sm:text-7xl">
                {Math.round(result.percentageB)}%
              </p>
            </motion.div>
            <motion.div
              initial={{ scale: 0.6, opacity: 0, y: 12 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              transition={{ delay: 0.12, duration: 0.28 }}
              className="pixel-text px-5 py-2 text-xl font-bold sm:text-3xl"
              style={{
                backgroundColor: result.isCorrect ? "#166534" : "#7f1d1d",
                border: "4px solid #000",
                boxShadow: "4px 4px 0 rgba(0,0,0,0.5)",
                color: "#fff",
              }}
            >
              {result.earnedPoints > 0
                ? `+${result.earnedPoints} pts`
                : "+0 pts"}
            </motion.div>
          </div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
