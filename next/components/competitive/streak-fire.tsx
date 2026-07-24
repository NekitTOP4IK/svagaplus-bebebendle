import type { ReactElement } from "react";

export type StreakTier =
  | "zero"
  | "ember"
  | "flame"
  | "blaze"
  | "inferno"
  | "legend";

export type FreezeVisual = "hidden" | "ready" | "holding" | "used";

type Props = Readonly<{
  days: number;
  /**
   * Freeze crystal next to the fire.
   * - hidden: no season / N/A
   * - ready: 1 charge left this season
   * - holding: currently bridging a miss
   * - used: already spent this season
   */
  freeze?: FreezeVisual;
}>;

/**
 * Streak display: tiered fire (color/glow) + optional freeze crystal.
 * UI-only (no points). Zero streak is dimmed ash.
 */
export function StreakFire({
  days,
  freeze = "hidden",
}: Props): ReactElement {
  const tier = streakTier(days);
  const zero = days <= 0;
  const holding = freeze === "holding";

  return (
    <div
      className={`c-streak-fire c-streak-fire--${tier}${
        holding ? " c-streak-fire--holding" : ""
      }`}
      aria-label={
        zero
          ? "Стрик: 0 дней"
          : `Стрик: ${days} ${daysLabel(days)}${
              holding ? ", заморозка" : ""
            }`
      }
    >
      <span className="c-streak-fire__count">{days}</span>
      <span className="c-streak-fire__icons">
        <FireIcon className="c-streak-fire__icon" tier={tier} />
        {freeze !== "hidden" ? (
          <FreezeIcon
            className={`c-streak-freeze c-streak-freeze--${freeze}`}
            used={freeze === "used"}
          />
        ) : null}
      </span>
    </div>
  );
}

/** Visual tier thresholds for fire color / intensity. */
export function streakTier(days: number): StreakTier {
  if (days <= 0) return "zero";
  if (days <= 2) return "ember";
  if (days <= 6) return "flame";
  if (days <= 13) return "blaze";
  if (days <= 29) return "inferno";
  return "legend";
}

function daysLabel(n: number): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return "день";
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return "дня";
  return "дней";
}

function FireIcon({
  className,
  tier,
}: {
  className?: string;
  tier: StreakTier;
}): ReactElement {
  // Unique gradient ids per mount-ish via tier suffix (static OK for SSR).
  const id = `c-fire-${tier}`;
  return (
    <svg
      className={className}
      viewBox="0 0 64 64"
      width={40}
      height={40}
      aria-hidden
      focusable="false"
    >
      <defs>
        <linearGradient id={`${id}-core`} x1="0.5" y1="1" x2="0.5" y2="0">
          <stop offset="0%" className="c-fire-stop c-fire-stop--base" />
          <stop offset="55%" className="c-fire-stop c-fire-stop--mid" />
          <stop offset="100%" className="c-fire-stop c-fire-stop--tip" />
        </linearGradient>
        <linearGradient id={`${id}-inner`} x1="0.5" y1="1" x2="0.5" y2="0">
          <stop offset="0%" className="c-fire-stop c-fire-stop--inner-base" />
          <stop offset="100%" className="c-fire-stop c-fire-stop--inner-tip" />
        </linearGradient>
      </defs>
      {/* Outer tongue */}
      <path
        className="c-fire-path c-fire-path--outer"
        fill={`url(#${id}-core)`}
        d="M32 6c1.2 7.5 4.5 12 8.5 16.5 4.2 4.7 7.5 9.8 7.5 17.5 0 10.5-7.2 20-16 24.5C23.2 60 16 50.5 16 40c0-7.2 3-12.2 7-17C27.2 18 30.5 13.5 32 6z"
      />
      {/* Left lick */}
      <path
        className="c-fire-path c-fire-path--side"
        fill={`url(#${id}-core)`}
        opacity="0.92"
        d="M22 24c-1.5 5-4 10-4 17 0 8 4.5 14.5 9 19 0.5-6 2.5-11.5 5-15.5-5.5-1.5-9-9-10-20.5z"
      />
      {/* Hot core */}
      <path
        className="c-fire-path c-fire-path--inner"
        fill={`url(#${id}-inner)`}
        d="M32 26c1.2 5.5 5.5 8.5 5.5 14.5 0 5.5-3.2 10-5.5 13-2.3-3-5.5-7.5-5.5-13 0-5 3.5-9 5.5-14.5z"
      />
    </svg>
  );
}

function FreezeIcon({
  className,
  used,
}: {
  className?: string;
  used?: boolean;
}): ReactElement {
  return (
    <svg
      className={className}
      viewBox="0 0 32 32"
      width={22}
      height={22}
      aria-hidden
      focusable="false"
    >
      {/* Snowflake / crystal */}
      <g
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        opacity={used ? 0.35 : 1}
      >
        <path d="M16 4v24M6.5 9.5l19 13M6.5 22.5l19-13" />
        <path d="M16 8l2.5 2.5M16 8l-2.5 2.5M16 24l2.5-2.5M16 24l-2.5-2.5" />
        <path d="M9.2 11.2l3.2.2M9.2 11.2l1.2 3M22.8 20.8l-3.2-.2M22.8 20.8l-1.2-3" />
        <path d="M9.2 20.8l3.2-.2M9.2 20.8l1.2-3M22.8 11.2l-3.2.2M22.8 11.2l-1.2 3" />
      </g>
    </svg>
  );
}
