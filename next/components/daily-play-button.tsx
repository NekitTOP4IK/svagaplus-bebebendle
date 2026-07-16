"use client";

import { useSyncExternalStore } from "react";
import Link from "next/link";
import { hasPlayedToday } from "@/lib/cookies";

function subscribe() {
  return () => {};
}

function getSnapshot() {
  if (typeof window === "undefined") return null;
  return hasPlayedToday();
}

function getServerSnapshot() {
  return null;
}

const btnBase =
  "pixel-btn inline-flex w-full items-center justify-center gap-1.5 sm:gap-2 2xl:gap-3 4xl:gap-4 px-2 sm:px-4 py-1.5 sm:py-2 2xl:px-6 2xl:py-3 4xl:px-8 4xl:py-4 text-xs sm:text-sm md:text-base 2xl:text-xl 4xl:text-2xl";

type Props = Readonly<{
  /** When false, daily for today is missing in the DB. */
  available?: boolean;
}>;

export function DailyPlayButton({ available = true }: Props) {
  const hasPlayed = useSyncExternalStore(
    subscribe,
    getSnapshot,
    getServerSnapshot,
  );

  if (!available) {
    return (
      <div className="flex flex-col items-center gap-2">
        <button
          type="button"
          disabled
          className={`${btnBase} cursor-not-allowed border-red-950 bg-red-950 text-red-200 opacity-90 shadow-none`}
          style={{
            background: "#3f1515",
            color: "#f0c0c0",
            boxShadow: "inset 2px 2px 0 #5a2222, inset -2px -2px 0 #1a0808",
            textShadow: "none",
          }}
        >
          Дейлика на сегодня нет
        </button>
        <p className="pixel-text text-center text-sm text-zinc-300">
          Набор ещё не готов — загляни позже
        </p>
      </div>
    );
  }

  if (hasPlayed) {
    return (
      <div className="flex flex-col items-center gap-2">
        <button
          type="button"
          disabled
          className={`${btnBase}`}
        >
          Уже сыграно
        </button>
        <p className="pixel-text text-center text-sm text-zinc-300">
          Следующий дейлик завтра
        </p>
      </div>
    );
  }

  return (
    <Link href="/daily" className={btnBase}>
      Дейлик!
    </Link>
  );
}
