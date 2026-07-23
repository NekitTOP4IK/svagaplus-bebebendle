"use client";

import { useCallback, useState, type ReactElement } from "react";

/**
 * Logout control styled for the competitive shell (avoids global pixel-btn).
 */
export function CompetitiveLogout(): ReactElement {
  const [loggingOut, setLoggingOut] = useState(false);

  const logout = useCallback(async () => {
    setLoggingOut(true);
    try {
      await fetch("/api/auth/session", { method: "DELETE" });
    } catch {
      // ignore network errors — still leave the shell
    }
    window.location.href = "/";
  }, []);

  return (
    <button
      type="button"
      onClick={() => void logout()}
      disabled={loggingOut}
      title="Выйти"
      aria-label="Выйти"
      className="c-pixel-btn c-pixel-btn--danger"
    >
      {loggingOut ? "…" : "Выход"}
    </button>
  );
}
