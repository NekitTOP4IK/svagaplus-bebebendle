/**
 * Daily game calendar day is Europe/Moscow (MSK, UTC+3, no DST since 2014).
 * Generation, "played today", and countdown all share this boundary (00:00 MSK).
 */

export const DAILY_TIMEZONE = "Europe/Moscow";

/** Fixed MSK offset (no DST). Used for next-midnight math without full TZ databases. */
const MSK_OFFSET_MS = 3 * 60 * 60 * 1000;

/** YYYY-MM-DD in Europe/Moscow for the given instant (default: now). */
export function todayMskDate(now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: DAILY_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

/**
 * Instant of the next 00:00:00 in Europe/Moscow after `now`.
 * At exact midnight MSK, returns the following midnight (full day remaining).
 */
export function nextMidnightMsk(now: Date = new Date()): Date {
  const mskAsUtc = new Date(now.getTime() + MSK_OFFSET_MS);
  const next =
    Date.UTC(
      mskAsUtc.getUTCFullYear(),
      mskAsUtc.getUTCMonth(),
      mskAsUtc.getUTCDate() + 1,
      0,
      0,
      0,
      0,
    ) - MSK_OFFSET_MS;
  return new Date(next);
}

/** HH:MM:SS until next 00:00 MSK. */
export function formatTimeUntilMidnightMsk(now: Date = new Date()): string {
  const diff = Math.max(0, nextMidnightMsk(now).getTime() - now.getTime());
  const hours = Math.floor(diff / (1000 * 60 * 60));
  const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
  const seconds = Math.floor((diff % (1000 * 60)) / 1000);

  return `${hours.toString().padStart(2, "0")}:${minutes
    .toString()
    .padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`;
}
