"use client";

import { useEffect, useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X } from "lucide-react";

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
            className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm"
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.9, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9, y: 20 }}
            transition={{ duration: 0.2 }}
            className="fixed left-1/2 top-1/2 z-50 w-[90vw] max-w-md -translate-x-1/2 -translate-y-1/2"
          >
            <div className="pixel-container rounded-2xl bg-zinc-900 p-6 sm:p-8">
              <div className="flex items-center justify-between mb-6">
                <h2 className="pixel-text text-2xl font-bold text-white">
                  Статистика
                </h2>
                <button
                  onClick={onClose}
                  className="text-zinc-400 hover:text-white transition-colors"
                >
                  <X className="w-6 h-6" />
                </button>
              </div>

              {loading ? (
                <div className="text-center py-8">
                  <div className="inline-block animate-spin rounded-full h-8 w-8 border-4 border-yellow-400 border-t-transparent" />
                </div>
              ) : stats ? (
                <div className="space-y-4">
                  <div className="pixel-container rounded-xl bg-zinc-800/50 p-4">
                    <p className="text-sm text-zinc-400 mb-1">
                      Одобренных скранов
                    </p>
                    <p className="pixel-text text-xl font-bold text-white">
                      {stats.approvedScransCount}
                    </p>
                  </div>

                  <div className="pixel-container rounded-xl bg-zinc-800/50 p-4">
                    <p className="text-sm text-zinc-400 mb-1">
                      Общая стоимость всех скранов
                    </p>
                    <p className="pixel-text text-xl font-bold text-yellow-400">
                      {stats.totalPrice.toFixed(2)} ₽
                    </p>
                  </div>

                  <div className="pixel-container rounded-xl bg-zinc-800/50 p-4">
                    <p className="text-sm text-zinc-400 mb-1">
                      Чаттеров загрузило:
                    </p>
                    <p className="pixel-text text-xl font-bold text-white">
                      {stats.distinctUploaders}
                    </p>
                  </div>
                </div>
              ) : (
                <div className="text-center py-8 text-zinc-400">
                  Не удалось загрузить статистику
                </div>
              )}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
