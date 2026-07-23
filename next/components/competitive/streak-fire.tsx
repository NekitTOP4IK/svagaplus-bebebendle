import type { ReactElement } from "react";

type Props = Readonly<{
  days: number;
}>;

/**
 * Streak display: number + fire SVG with CSS glow.
 * UI-only (no points). Zero streak is dimmed.
 */
export function StreakFire({ days }: Props): ReactElement {
  const zero = days <= 0;
  return (
    <div
      className={`c-streak-fire${zero ? " c-streak-fire--zero" : ""}`}
      aria-label={zero ? "Стрик: 0 дней" : `Стрик: ${days} ${daysLabel(days)}`}
    >
      <span className="c-streak-fire__count">{days}</span>
      <FireIcon className="c-streak-fire__icon" />
    </div>
  );
}

function daysLabel(n: number): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return "день";
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return "дня";
  return "дней";
}

function FireIcon({ className }: { className?: string }): ReactElement {
  return (
    <svg
      className={className}
      viewBox="0 0 64 64"
      width={36}
      height={36}
      aria-hidden
      focusable="false"
    >
      <defs>
        <linearGradient id="c-fire-core" x1="0.5" y1="1" x2="0.5" y2="0">
          <stop offset="0%" stopColor="#ff3b00" />
          <stop offset="45%" stopColor="#ff8a00" />
          <stop offset="100%" stopColor="#ffd54a" />
        </linearGradient>
        <linearGradient id="c-fire-inner" x1="0.5" y1="1" x2="0.5" y2="0">
          <stop offset="0%" stopColor="#fff6c8" />
          <stop offset="100%" stopColor="#ffb347" />
        </linearGradient>
      </defs>
      <path
        fill="url(#c-fire-core)"
        d="M32 4c2 10 14 14 14 28 0 12-8 22-14 28-6-6-14-16-14-28 0-10 8-16 14-28z"
      />
      <path
        fill="url(#c-fire-core)"
        opacity="0.9"
        d="M22 22c0 0-6 8-6 18 0 10 6 16 10 20 1-8 4-14 6-18-6-2-10-10-10-20z"
      />
      <path
        fill="url(#c-fire-inner)"
        d="M32 28c1 6 7 9 7 16 0 6-4 11-7 14-3-3-7-8-7-14 0-5 4-9 7-16z"
      />
    </svg>
  );
}
