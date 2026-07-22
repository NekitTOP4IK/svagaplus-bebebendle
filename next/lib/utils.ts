import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import {
  formatTimeUntilMidnightMsk,
  nextMidnightMsk,
} from "@/lib/daily-timezone";

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

/** @deprecated Use formatTimeUntilMidnightMsk — daily resets at 00:00 MSK. */
export function formatTimeUntilMidnightUTC(): string {
  return formatTimeUntilMidnightMsk();
}

export { formatTimeUntilMidnightMsk, nextMidnightMsk };

export function getLikesPercentage(likes: number, dislikes: number): number {
  const total = likes + dislikes;
  if (total === 0) return 50;
  return Math.round((likes / total) * 100);
}

export function calculateScore(answers: { isCorrect: boolean }[]): number {
  return answers.filter((a) => a.isCorrect).length;
}

/** Public site origin for share links (env or current browser origin). */
export function getShareSiteUrl(): string {
  const fromEnv = (
    process.env.NEXT_PUBLIC_SITE_URL ||
    process.env.NEXT_PUBLIC_APP_URL ||
    ""
  )
    .trim()
    .replace(/\/$/, "");
  if (fromEnv) return fromEnv;
  if (typeof window !== "undefined" && window.location?.origin) {
    return window.location.origin.replace(/\/$/, "");
  }
  return "http://localhost:3000";
}

export function formatShareText(
  answers: { isCorrect: boolean }[],
  score: number,
  siteUrl?: string,
): string {
  const emblems = [
    { correct: "🟢", incorrect: "🔴" },
    { correct: "👍", incorrect: "👎" },
    { correct: "✅", incorrect: "⛔️" },
    { correct: "💚", incorrect: "💔" },
    { correct: "😏", incorrect: "😩" },
    { correct: "🍑", incorrect: "🍆" },
    { correct: "😻", incorrect: "😾" },
    { correct: "💣", incorrect: "💥" },
    { correct: "💪", incorrect: "🫵" },
    { correct: "🌝", incorrect: "🌚" },
    { correct: "🔔", incorrect: "🔕" },
    { correct: "🤩", incorrect: "🫠" },
    { correct: "🔥", incorrect: "💩" },
    { correct: "😃", incorrect: "🤡" },
    { correct: "😋", incorrect: "😭" },
    { correct: "🌹", incorrect: "🥀" },
    { correct: "👅", incorrect: "👁️" },
  ];
  const randomEmblem = emblems[Math.floor(Math.random() * emblems.length)];
  const circles = answers
    .map((answer) =>
      answer.isCorrect ? randomEmblem.correct : randomEmblem.incorrect,
    )
    .join("");
  const url = (siteUrl ?? getShareSiteUrl()).replace(/\/$/, "");
  return `${circles} - ${score}/10\n${url}`;
}
