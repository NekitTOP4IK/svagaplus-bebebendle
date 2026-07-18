"use client";

import { useEffect, useState, type ReactElement } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import type { Announcement } from "@/db/schema";
import { MarkdownView } from "@/components/announcements/markdown-view";

type Props = Readonly<{ active: Announcement[] }>;

const STORAGE_KEY = "seenAnnouncementIds";
const SEEN_CAP = 200;

function readSeenIds(): number[] {
  if (typeof window === "undefined") return [];
  const raw = window.localStorage.getItem(STORAGE_KEY);
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (v): v is number => typeof v === "number" && Number.isFinite(v),
    );
  } catch {
    return [];
  }
}

function writeSeenIds(ids: number[]): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(ids.slice(0, SEEN_CAP)));
  } catch {
    // ignore quota/privacy mode — best-effort
  }
}

function pickShown(active: Announcement[]): Announcement | null {
  if (active.length === 0) return null;
  const seen = readSeenIds();
  return active.find((a) => !seen.includes(a.id)) ?? null;
}

export function AnnouncementOverlay({ active }: Props): ReactElement | null {
  const [shown, setShown] = useState<Announcement | null>(() => pickShown(active));
  const reduceMotion = useReducedMotion();

  useEffect(() => {
    if (shown) {
      const seen = readSeenIds();
      if (!seen.includes(shown.id)) {
        writeSeenIds([shown.id, ...seen]);
      }
    }
  }, [shown]);

  const close = () => setShown(null);

  return (
    <AnimatePresence>
      {shown && (
        <motion.div
          role="dialog"
          aria-modal="true"
          aria-label={shown.title}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: reduceMotion ? 0 : 0.2 }}
          onClick={close}
        >
          <motion.div
            className="mc-frame relative w-full max-w-xl"
            initial={{ scale: reduceMotion ? 1 : 0.98, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: reduceMotion ? 1 : 0.98, opacity: 0 }}
            transition={{ duration: reduceMotion ? 0 : 0.2 }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mc-panel">
              <button
                type="button"
                aria-label="Закрыть"
                onClick={close}
                className="mc-close"
              >
                ✕
              </button>
              <div className="text-center">
                <div
                  className="mc-sign"
                  style={{ margin: "-32px auto 12px" }}
                >
                  <span className="mc-title">{shown.title}</span>
                </div>
              </div>
              <div className="mc-body max-h-[60vh] overflow-y-auto">
                <MarkdownView content={shown.body} />
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}