"use client";

import { useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X } from "lucide-react";
import { ScoreHistogram } from "@/components/score-histogram";
import type { ScoreDistributionItem } from "@/types/game";

interface HistogramModalProps {
  isOpen: boolean;
  onClose: () => void;
  distribution: ScoreDistributionItem[];
  userScore: number;
}

export function HistogramModal({ isOpen, onClose, distribution, userScore }: HistogramModalProps) {
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };

    if (isOpen) {
      document.addEventListener("keydown", handleEscape);
      return () => document.removeEventListener("keydown", handleEscape);
    }
  }, [isOpen, onClose]);

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm"
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.9, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9, y: 20 }}
            transition={{ duration: 0.2 }}
            className="fixed left-1/2 top-1/2 z-50 w-[90vw] max-w-2xl -translate-x-1/2 -translate-y-1/2"
          >
            <div className="pixel-container rounded-2xl bg-zinc-900 p-6 sm:p-8">
              <div className="flex items-center justify-between">
                <h2 className="pixel-text text-2xl font-bold text-white">
                  Распределение результатов
                </h2>
                <button
                  onClick={onClose}
                  className="text-zinc-400 hover:text-white transition-colors"
                >
                  <X className="w-6 h-6" />
                </button>
              </div>

              <ScoreHistogram distribution={distribution} userScore={userScore} />
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
