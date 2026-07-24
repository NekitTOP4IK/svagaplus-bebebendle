/**
 * Competitive display names: pure validation / labels / cooldown helpers.
 * Client-safe — no DB imports (pg cannot ship to the browser).
 * Server mutations: `display-name-server.ts`.
 * Independent of `competitive_enabled` — nick can be set while the mode is off.
 */

/** Min/max length after trim. */
export const COMPETITIVE_DISPLAY_NAME_MIN = 2;
export const COMPETITIVE_DISPLAY_NAME_MAX = 24;

/** 24h between renames. Clearing (null) is always allowed and does not start a new cooldown wait for delete itself. */
export const COMPETITIVE_DISPLAY_NAME_COOLDOWN_MS = 24 * 60 * 60 * 1000;

/**
 * Letters (Latin + Cyrillic), digits, underscore, hyphen.
 * Cyrillic: U+0400–U+04FF (basic block, includes Russian).
 */
const DISPLAY_NAME_CHARSET = /^[a-zA-Z0-9_\-\u0400-\u04FF]+$/;

export type ValidateCompetitiveDisplayNameResult =
  | { ok: true; name: string }
  | { ok: false; error: string };

export type SetCompetitiveDisplayNameResult =
  | {
      ok: true;
      competitiveDisplayName: string | null;
      label: string;
    }
  | { ok: false; error: string; status: number };

/**
 * Validate a competitive nick from raw input (e.g. API body).
 * Trims; requires length 2..24; charset letters/numbers/_/-/cyrillic.
 */
export function validateCompetitiveDisplayName(
  raw: unknown,
): ValidateCompetitiveDisplayNameResult {
  if (typeof raw !== "string") {
    return { ok: false, error: "name must be a string" };
  }

  // Preserve typed case (NekitTOP4IK) — only trim whitespace, never lower/upper.
  const name = raw.trim();
  if (name.length === 0) {
    return { ok: false, error: "name is empty" };
  }
  if (name.length < COMPETITIVE_DISPLAY_NAME_MIN) {
    return {
      ok: false,
      error: `name must be at least ${COMPETITIVE_DISPLAY_NAME_MIN} characters`,
    };
  }
  if (name.length > COMPETITIVE_DISPLAY_NAME_MAX) {
    return {
      ok: false,
      error: `name must be at most ${COMPETITIVE_DISPLAY_NAME_MAX} characters`,
    };
  }
  if (!DISPLAY_NAME_CHARSET.test(name)) {
    return {
      ok: false,
      error:
        "name may only contain letters, numbers, underscore, hyphen, and Cyrillic",
    };
  }

  return { ok: true, name };
}

/**
 * Leaderboard / hub label fallback chain:
 * competitiveDisplayName → telegramUsername (no @) → Игрок #id
 */
export function leaderboardLabel(user: {
  id: number;
  competitiveDisplayName: string | null;
  telegramUsername: string | null;
}): string {
  const competitive = user.competitiveDisplayName?.trim();
  if (competitive) return competitive;
  const tg = user.telegramUsername?.trim();
  if (tg) {
    // Strip leading @ — plain nick looks better in pixel UI
    return tg.replace(/^@+/, "") || `Игрок #${user.id}`;
  }
  return `Игрок #${user.id}`;
}

/**
 * Pure: whether a rename is allowed given last update timestamp and now.
 * First change (updatedAt null) is always allowed.
 */
export function canChangeDisplayName(
  updatedAt: Date | null,
  now: Date = new Date(),
): { ok: true } | { ok: false; retryAfterMs: number } {
  if (!updatedAt) return { ok: true };
  const elapsed = now.getTime() - updatedAt.getTime();
  if (elapsed >= COMPETITIVE_DISPLAY_NAME_COOLDOWN_MS) {
    return { ok: true };
  }
  return {
    ok: false,
    retryAfterMs: COMPETITIVE_DISPLAY_NAME_COOLDOWN_MS - elapsed,
  };
}
