import type { ReactElement } from "react";

export type StreakTier =
  | "zero"
  | "ember"
  | "flame"
  | "blaze"
  | "inferno"
  | "legend";

export type FreezeVisual = "hidden" | "ready" | "holding" | "used";

type StreakProps = Readonly<{
  days: number;
}>;

/**
 * Streak display: tiered fire (color/glow). Freeze is a separate row (IceCubeRow).
 * UI-only (no points). Zero streak is dimmed ash.
 */
export function StreakFire({ days }: StreakProps): ReactElement {
  const tier = streakTier(days);
  const zero = days <= 0;

  return (
    <div
      className={`c-streak-fire c-streak-fire--${tier}`}
      aria-label={
        zero ? "Стрик: 0 дней" : `Стрик: ${days} ${daysLabel(days)}`
      }
    >
      <span className="c-streak-fire__count">{days}</span>
      <FireIcon className="c-streak-fire__icon" tier={tier} />
    </div>
  );
}

type IceProps = Readonly<{
  state: Exclude<FreezeVisual, "hidden">;
}>;

/**
 * Ice cube charge for the season — lives under the streak, not glued to the fire.
 */
export function IceCubeRow({ state }: IceProps): ReactElement {
  const label =
    state === "ready"
      ? "Заморозка доступна"
      : state === "holding"
        ? "Стрик на заморозке"
        : "Заморозка использована";

  return (
    <div
      className={`c-ice-row c-ice-row--${state}`}
      aria-label={label}
      title={label}
    >
      <IceCubeIcon className="c-ice-cube" used={state === "used"} />
      <span className="c-ice-row__label">{label}</span>
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
      <path
        className="c-fire-path c-fire-path--outer"
        fill={`url(#${id}-core)`}
        d="M32 6c1.2 7.5 4.5 12 8.5 16.5 4.2 4.7 7.5 9.8 7.5 17.5 0 10.5-7.2 20-16 24.5C23.2 60 16 50.5 16 40c0-7.2 3-12.2 7-17C27.2 18 30.5 13.5 32 6z"
      />
      <path
        className="c-fire-path c-fire-path--side"
        fill={`url(#${id}-core)`}
        opacity="0.92"
        d="M22 24c-1.5 5-4 10-4 17 0 8 4.5 14.5 9 19 0.5-6 2.5-11.5 5-15.5-5.5-1.5-9-9-10-20.5z"
      />
      <path
        className="c-fire-path c-fire-path--inner"
        fill={`url(#${id}-inner)`}
        d="M32 26c1.2 5.5 5.5 8.5 5.5 14.5 0 5.5-3.2 10-5.5 13-2.3-3-5.5-7.5-5.5-13 0-5 3.5-9 5.5-14.5z"
      />
    </svg>
  );
}

function IceCubeIcon({
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
      width={28}
      height={28}
      aria-hidden
      focusable="false"
    >
      <defs>
        <linearGradient id="c-ice-face" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#e8f7ff" />
          <stop offset="55%" stopColor="#8fd4ff" />
          <stop offset="100%" stopColor="#3a9fd9" />
        </linearGradient>
        <linearGradient id="c-ice-side" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#6bb8e8" />
          <stop offset="100%" stopColor="#2a6f9a" />
        </linearGradient>
        <linearGradient id="c-ice-top" x1="0" y1="1" x2="1" y2="0">
          <stop offset="0%" stopColor="#bfe9ff" />
          <stop offset="100%" stopColor="#ffffff" />
        </linearGradient>
      </defs>
      <g opacity={used ? 0.4 : 1}>
        {/* isometric cube */}
        <path fill="url(#c-ice-top)" d="M16 4 L28 10 L16 16 L4 10 Z" />
        <path fill="url(#c-ice-face)" d="M4 10 L16 16 L16 28 L4 22 Z" />
        <path fill="url(#c-ice-side)" d="M16 16 L28 10 L28 22 L16 28 Z" />
        {/* frost edge */}
        <path
          fill="none"
          stroke="rgba(255,255,255,0.55)"
          strokeWidth="0.8"
          d="M16 4 L28 10 L16 16 L4 10 Z M4 10 L16 16 L16 28 M16 16 L28 10"
        />
        {/* sparkle */}
        <circle cx="12" cy="12" r="1.1" fill="#fff" opacity="0.85" />
        <circle cx="20" cy="14" r="0.7" fill="#fff" opacity="0.7" />
      </g>
    </svg>
  );
}
