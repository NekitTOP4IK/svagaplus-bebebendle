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

export function HistogramModal({
  isOpen,
  onClose,
  distribution,
  userScore,
}: HistogramModalProps) {
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
            className="fixed inset-0 z-50 bg-black/60"
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 12 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 12 }}
            transition={{ duration: 0.18, ease: [0.23, 1, 0.32, 1] }}
            className="fixed left-1/2 top-1/2 z-50 w-[90vw] max-w-2xl -translate-x-1/2 -translate-y-1/2"
          >
            {/* Light Minecraft panel — same shell as stats modal */}
            <div
              className="border-4 border-black p-5 sm:p-8"
              style={{
                background: "#c6c6c6",
                boxShadow:
                  "inset 3px 3px 0 #efefef, inset -3px -3px 0 #555, 6px 6px 0 #000",
              }}
            >
              <div className="mb-4 flex items-center justify-between gap-3">
                <h2 className="pixel-text-on-light text-xl font-bold sm:text-2xl">
                  Распределение результатов
                </h2>
                <button
                  type="button"
                  onClick={onClose}
                  className="pixel-btn shrink-0 px-2 py-1 text-sm font-bold"
                  aria-label="Закрыть"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              <ScoreHistogram
                distribution={distribution}
                userScore={userScore}
              />
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
