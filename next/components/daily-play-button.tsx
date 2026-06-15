"use client";

import { useSyncExternalStore } from "react";
import Link from "next/link";
import { hasPlayedToday, getTodayResult } from "@/lib/cookies";

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

export function DailyPlayButton() {
  const hasPlayed = useSyncExternalStore(
    subscribe,
    getSnapshot,
    getServerSnapshot,
  );

  let score: number | null = null;

  if (hasPlayed && typeof window !== "undefined") {
    const result = getTodayResult();
    if (result) {
      score = result.userAnswers.filter(({ isCorrect }) => isCorrect).length;
    }
  }

  if (hasPlayed) {
    return (
      <div className="flex flex-col items-center gap-2">
        <button
          disabled
          className="pixel-btn inline-flex items-center justify-center gap-1.5 sm:gap-2 2xl:gap-3 4xl:gap-4 px-2 sm:px-4 py-1.5 sm:py-2 2xl:px-6 2xl:py-3 4xl:px-8 4xl:py-4 text-xs sm:text-sm md:text-base 2xl:text-xl 4xl:text-2xl w-full"
        >
          Уже сыграно
        </button>
        {/*{score !== null && (
          <p className="pixel-text mt-2 text-lg text-white">
            Ваш результат: {score}/10
          </p>
        )}*/}
        <p className="pixel-text text-sm text-zinc-300 text-center">
          Следующий дейлик завтра
        </p>
      </div>
    );
  }

  return (
    <Link
      href="/daily"
      className="pixel-btn inline-flex items-center justify-center gap-1.5 sm:gap-2 2xl:gap-3 4xl:gap-4 px-2 sm:px-4 py-1.5 sm:py-2 2xl:px-6 2xl:py-3 4xl:px-8 4xl:py-4 text-xs sm:text-sm md:text-base 2xl:text-xl 4xl:text-2xl"
    >
      Дейлик!
    </Link>
  );
}
