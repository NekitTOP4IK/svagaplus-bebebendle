"use client";

import { useEffect, useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Twitch, Github } from "lucide-react";

interface StatsData {
  approvedScransCount: number;
  totalPrice: number;
  distinctUploaders: number;
}

interface StatsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function StatsModal({ isOpen, onClose }: StatsModalProps) {
  const [stats, setStats] = useState<StatsData | null>(null);
  const [loading, setLoading] = useState(false);

  const fetchStats = useCallback(async () => {
    if (stats) return;
    setLoading(true);
    try {
      const res = await fetch("/api/stats");
      const data = await res.json();
      setStats(data);
    } catch {
      // Error handled by UI
    } finally {
      setLoading(false);
    }
  }, [stats]);

  useEffect(() => {
    if (isOpen && !stats) {
      fetchStats();
    }
  }, [isOpen, stats, fetchStats]);

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
            className="fixed left-1/2 top-1/2 z-50 w-[90vw] max-w-md -translate-x-1/2 -translate-y-1/2"
          >
            {/* Light Minecraft panel — not pixel-container (that forces dark glass) */}
            <div
              className="border-4 border-black p-6 sm:p-8"
              style={{
                background: "#c6c6c6",
                boxShadow:
                  "inset 3px 3px 0 #efefef, inset -3px -3px 0 #555, 6px 6px 0 #000",
              }}
            >
              <div className="mb-5 flex items-center justify-between">
                <h2 className="pixel-text-on-light text-2xl font-bold">
                  Статистика
                </h2>
                <button
                  type="button"
                  onClick={onClose}
                  className="pixel-btn px-2 py-1 text-sm font-bold"
                  aria-label="Закрыть"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              {loading ? (
                <div className="py-8 text-center">
                  <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-black border-t-transparent" />
                </div>
              ) : stats ? (
                <div className="space-y-3">
                  <StatRow
                    label="Одобренных скранов"
                    value={String(stats.approvedScransCount)}
                  />
                  <StatRow
                    label="Общая стоимость всех скранов"
                    value={`${stats.totalPrice.toFixed(2)} ₽`}
                    highlight
                  />
                  <StatRow
                    label="Чаттеров загрузило"
                    value={String(stats.distinctUploaders)}
                  />
                </div>
              ) : (
                <div className="py-8 text-center text-sm font-bold text-zinc-800">
                  Не удалось загрузить статистику
                </div>
              )}

              <div className="mt-5 flex flex-col gap-2 sm:gap-3">
                <a
                  href="https://www.twitch.tv/olesha"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="pixel-btn pixel-btn-twitch inline-flex items-center justify-center gap-1.5 px-2 py-1.5 text-xs sm:gap-2 sm:px-4 sm:py-2 sm:text-sm md:text-base"
                >
                  <Twitch className="h-3 w-3 sm:h-4 sm:w-4 md:h-5 md:w-5" />
                  <span className="hidden sm:inline">olesha</span>
                  <span className="sm:hidden">twitch</span>
                </a>
                <a
                  href="https://github.com/NekitTOP4IK/svagaplus-bebebendle/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="pixel-btn inline-flex items-center justify-center gap-1.5 px-2 py-1.5 text-xs sm:gap-2 sm:px-4 sm:py-2 sm:text-sm md:text-base"
                >
                  <Github className="h-3 w-3 sm:h-4 sm:w-4 md:h-5 md:w-5" />
                  <span className="hidden sm:inline">github</span>
                  <span className="sm:hidden">git</span>
                </a>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

function StatRow({
  label,
  value,
  highlight = false,
}: {
  label: string;
  value: string;
  highlight?: boolean;
}) {
  return (
    <div
      className="border-2 border-black px-4 py-3"
      style={{
        background: "#ececec",
        boxShadow: "inset 2px 2px 0 #fff, inset -2px -2px 0 #8b8b8b",
      }}
    >
      <p className="mb-1 text-xs font-bold uppercase tracking-wide text-zinc-600">
        {label}
      </p>
      <p
        className={`font-[family-name:var(--font-pixel)] text-xl font-bold ${
          highlight ? "text-amber-800" : "text-zinc-900"
        }`}
        style={
          highlight
            ? { textShadow: "1px 1px 0 #f5e6a8" }
            : undefined
        }
      >
        {value}
      </p>
    </div>
  );
}
