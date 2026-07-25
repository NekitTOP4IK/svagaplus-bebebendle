"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { ensureSession, getSessionSnapshot } from "@/app/actions/auth";

const REFRESH_WINDOW_MS = 5 * 60 * 1000;
const LOCK_KEY = "bebebendle-session-refresh-lock";
const LOCK_TTL_MS = 15 * 1000;
const CHANNEL_NAME = "bebebendle-session";

type RefreshLock = Readonly<{ expiresAt: number }>;

function canAcquireRefreshLock(): boolean {
  try {
    const now = Date.now();
    const current = localStorage.getItem(LOCK_KEY);
    if (current) {
      const parsed = JSON.parse(current) as Partial<RefreshLock>;
      if (typeof parsed.expiresAt === "number" && parsed.expiresAt > now) return false;
    }
    localStorage.setItem(LOCK_KEY, JSON.stringify({ expiresAt: now + LOCK_TTL_MS }));
    return true;
  } catch {
    return true;
  }
}

export function SessionRefreshBoundary(): null {
  const router = useRouter();
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    let cancelled = false;
    const channel = typeof BroadcastChannel === "undefined" ? null : new BroadcastChannel(CHANNEL_NAME);

    const clearTimer = (): void => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };

    const refresh = async (): Promise<void> => {
      if (!canAcquireRefreshLock()) {
        if (!cancelled) router.refresh();
        return;
      }
      await ensureSession();
      channel?.postMessage({ type: "refreshed" });
      if (!cancelled) router.refresh();
    };

    const schedule = async (): Promise<void> => {
      clearTimer();
      const snapshot = await getSessionSnapshot();
      if (cancelled) return;
      if (!snapshot.authenticated || snapshot.accessExpiresAt === null) {
        await refresh();
        return;
      }
      const delay = snapshot.accessExpiresAt - Date.now() - REFRESH_WINDOW_MS;
      if (delay <= 0) {
        await refresh();
        return;
      }
      timerRef.current = setTimeout(() => void refresh(), delay);
    };

    const onVisibilityChange = (): void => {
      if (document.visibilityState === "visible") void schedule();
    };
    const onMessage = (): void => {
      clearTimer();
      router.refresh();
    };

    channel?.addEventListener("message", onMessage);
    document.addEventListener("visibilitychange", onVisibilityChange);
    void schedule();

    return () => {
      cancelled = true;
      clearTimer();
      channel?.removeEventListener("message", onMessage);
      channel?.close();
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [router]);

  return null;
}
