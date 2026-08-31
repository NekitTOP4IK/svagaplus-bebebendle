import type { ReactElement } from "react";

export type DailyEventBadgeStyle = "violet" | "gold" | "neon" | "rainbow";

const STYLE_LABELS: Record<DailyEventBadgeStyle, string> = {
  violet: "Фиолетовый",
  gold: "Золотой",
  neon: "Неон",
  rainbow: "Радуга",
};

export const DAILY_EVENT_BADGE_STYLES = Object.entries(STYLE_LABELS) as Array<
  [DailyEventBadgeStyle, string]
>;

export function DailyEventBadge({
  name,
  style = "violet",
  preview = false,
}: Readonly<{
  name: string;
  style?: DailyEventBadgeStyle;
  preview?: boolean;
}>): ReactElement {
  return (
    <div
      className={`daily-event-badge daily-event-badge--${style} ${preview ? "relative inline-flex max-w-full" : "absolute left-1/2 top-14 z-20 max-w-[80vw] -translate-x-1/2 sm:top-4 sm:max-w-[50vw]"}`}
      title={name}
      aria-label={`Событие: ${name}`}
    >
      <svg
        aria-hidden="true"
        className="daily-event-badge__spark"
        viewBox="0 0 16 16"
        focusable="false"
        shapeRendering="crispEdges"
      >
        <path fill="currentColor" d="M7 0h2v4h2v2h4v2h-4v2H9v4H7v-4H5V8H1V6h4V4h2z" />
      </svg>
      <span className="truncate">событие · {name}</span>
    </div>
  );
}
