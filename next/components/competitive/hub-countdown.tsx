"use client";

import { useEffect, useRef, useState, type ReactElement } from "react";

type Props = Readonly<{
  /** ISO timestamp to count down to. */
  targetIso: string | null;
  /** `hms` → 03:16:52; `long` → 12д 14ч 22м */
  mode?: "hms" | "long";
  fallback?: string;
  className?: string;
  /** Fires once when `now >= target` (resets when `targetIso` changes). */
  onExpire?: () => void;
}>;

function pad2(n: number): string {
  return n.toString().padStart(2, "0");
}

export function formatCountdown(
  targetMs: number,
  nowMs: number,
  mode: "hms" | "long",
): string {
  const diff = Math.max(0, targetMs - nowMs);
  const totalSec = Math.floor(diff / 1000);
  const days = Math.floor(totalSec / 86400);
  const hours = Math.floor((totalSec % 86400) / 3600);
  const minutes = Math.floor((totalSec % 3600) / 60);
  const seconds = totalSec % 60;

  if (mode === "hms") {
    const totalHours = Math.floor(totalSec / 3600);
    return `${pad2(totalHours)}:${pad2(minutes)}:${pad2(seconds)}`;
  }

  if (days > 0) return `${days}д ${hours}ч ${minutes}м`;
  if (hours > 0) return `${hours}ч ${minutes}м ${seconds}с`;
  if (minutes > 0) return `${minutes}м ${seconds}с`;
  return `${seconds}с`;
}

function computeText(
  targetIso: string | null,
  mode: "hms" | "long",
  fallback: string,
  nowMs: number,
): string {
  if (!targetIso) return fallback;
  const targetMs = new Date(targetIso).getTime();
  if (Number.isNaN(targetMs)) return fallback;
  return formatCountdown(targetMs, nowMs, mode);
}

/**
 * Live countdown to an absolute ISO target (season end or next daily).
 * Defers first paint to avoid SSR/client hydration mismatch.
 */
export function HubCountdown({
  targetIso,
  mode = "hms",
  fallback = "—",
  className,
  onExpire,
}: Props): ReactElement {
  const [text, setText] = useState(fallback);
  const expiredRef = useRef(false);
  const onExpireRef = useRef(onExpire);

  useEffect(() => {
    onExpireRef.current = onExpire;
  }, [onExpire]);

  useEffect(() => {
    expiredRef.current = false;
  }, [targetIso]);

  useEffect(() => {
    const tick = () => {
      const nowMs = Date.now();
      setText(computeText(targetIso, mode, fallback, nowMs));

      if (!targetIso || expiredRef.current) return;
      const targetMs = new Date(targetIso).getTime();
      if (Number.isNaN(targetMs)) return;
      if (nowMs >= targetMs) {
        expiredRef.current = true;
        onExpireRef.current?.();
      }
    };

    const initTimeout = setTimeout(tick, 0);
    const timer = setInterval(tick, 1000);

    return () => {
      clearTimeout(initTimeout);
      clearInterval(timer);
    };
  }, [targetIso, mode, fallback]);

  return <span className={className}>{text}</span>;
}
