"use client";

import type { ReactElement } from "react";
import {
  identityBadgeSrc,
  identityBadgeTitle,
  identityMetaSuffix,
  resolveIdentityTone,
  type UserRole,
} from "@/lib/user-identity";

type Props = Readonly<{
  name: string;
  role?: UserRole | string | null;
  isSubscriber?: boolean | null;
  /** smaller = home menu chip; larger = profile header */
  size?: "sm" | "lg";
  className?: string;
  meta?: string | null;
  /** Append · admin / · СВАГА+ to meta (default true). */
  showMetaSuffix?: boolean;
  /** Nick color/glow by role (default true). Set false for plain white nick. */
  nickGlow?: boolean;
  /**
   * Pixel font for the nick. Default true (home / profile / competitive self).
   * Pass false only if a surface needs system sans for dense mixed-case lists.
   */
  pixelFont?: boolean;
}>;

/**
 * Nick + role/SVAGA badge with glow that is not clipped by truncate.
 * Glow uses filter on an outer layer; ellipsis lives on an inner span.
 */
export function UserIdentity({
  name,
  role,
  isSubscriber,
  size = "sm",
  className = "",
  meta,
  showMetaSuffix = true,
  nickGlow = true,
  pixelFont = true,
}: Props): ReactElement {
  const tone = resolveIdentityTone(role, isSubscriber);
  const nickTone = nickGlow ? tone : "default";
  const badge = identityBadgeSrc(tone);
  const title = identityBadgeTitle(tone);
  const nameClass =
    size === "lg" ? "text-lg sm:text-xl" : "text-sm leading-snug";
  const badgeClass =
    size === "lg"
      ? "h-5 w-5 sm:h-6 sm:w-6"
      : "h-4 w-4 sm:h-[1.15rem] sm:w-[1.15rem]";
  const nickFontClass = pixelFont
    ? "user-nick-text--pixel"
    : "user-nick-text--sans";

  return (
    <div className={`min-w-0 ${className}`}>
      <div className="flex min-w-0 items-center gap-1.5 overflow-visible py-0.5">
        <span className={`user-nick-glow user-nick-glow--${nickTone} min-w-0`}>
          <span
            className={`user-nick-text ${nickFontClass} ${nameClass} font-bold`}
          >
            {name}
          </span>
        </span>
        {badge ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={badge}
            alt=""
            title={title}
            className={`user-role-badge user-role-badge--${tone} ${badgeClass} shrink-0`}
          />
        ) : null}
      </div>
      {meta != null && meta !== "" ? (
        <span className="mt-0.5 block truncate text-[10px] leading-tight text-white/60">
          {meta}
          {showMetaSuffix ? identityMetaSuffix(role, isSubscriber) : null}
        </span>
      ) : null}
    </div>
  );
}
