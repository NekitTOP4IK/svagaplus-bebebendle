/**
 * Competitive display names: validation, leaderboard labels, set/clear with 24h rate limit.
 */

import { eq } from "drizzle-orm";
import { db, users } from "@/db/schema";

/** Min/max length after trim. */
export const COMPETITIVE_DISPLAY_NAME_MIN = 2;
export const COMPETITIVE_DISPLAY_NAME_MAX = 24;

/** 24h between renames (including clear). */
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
 * competitiveDisplayName → @telegramUsername → Игрок #id
 */
export function leaderboardLabel(user: {
  id: number;
  competitiveDisplayName: string | null;
  telegramUsername: string | null;
}): string {
  const competitive = user.competitiveDisplayName?.trim();
  if (competitive) return competitive;
  const tg = user.telegramUsername?.trim();
  if (tg) return tg.startsWith("@") ? tg : `@${tg}`;
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

/**
 * Set or clear competitive display name for a user.
 * `name: null` clears. Non-null is validated. 24h rate limit via updatedAt.
 * Unique on lower(name) → 409.
 */
export async function setCompetitiveDisplayName(
  userId: number,
  name: string | null,
  now: Date = new Date(),
): Promise<SetCompetitiveDisplayNameResult> {
  let nextName: string | null;

  if (name === null) {
    nextName = null;
  } else {
    const validated = validateCompetitiveDisplayName(name);
    if (!validated.ok) {
      return { ok: false, error: validated.error, status: 400 };
    }
    nextName = validated.name;
  }

  const [user] = await db
    .select({
      id: users.id,
      competitiveDisplayName: users.competitiveDisplayName,
      competitiveDisplayNameUpdatedAt: users.competitiveDisplayNameUpdatedAt,
      telegramUsername: users.telegramUsername,
    })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  if (!user) {
    return { ok: false, error: "User not found", status: 404 };
  }

  // No-op if value already matches (after trim / null).
  const current = user.competitiveDisplayName?.trim() ?? null;
  if (current === nextName) {
    return {
      ok: true,
      competitiveDisplayName: current,
      label: leaderboardLabel({
        id: user.id,
        competitiveDisplayName: current,
        telegramUsername: user.telegramUsername,
      }),
    };
  }

  const allowed = canChangeDisplayName(
    user.competitiveDisplayNameUpdatedAt,
    now,
  );
  if (!allowed.ok) {
    const hours = Math.ceil(allowed.retryAfterMs / (60 * 60 * 1000));
    return {
      ok: false,
      error: `Можно сменить ник не чаще раза в 24 часа (через ~${hours} ч)`,
      status: 429,
    };
  }

  try {
    const [updated] = await db
      .update(users)
      .set({
        competitiveDisplayName: nextName,
        competitiveDisplayNameUpdatedAt: now,
        updatedAt: now,
      })
      .where(eq(users.id, userId))
      .returning({
        id: users.id,
        competitiveDisplayName: users.competitiveDisplayName,
        telegramUsername: users.telegramUsername,
      });

    if (!updated) {
      return { ok: false, error: "User not found", status: 404 };
    }

    console.log(
      `[competitive-display-name] set user=${userId} name=${nextName ?? "(cleared)"}`,
    );

    return {
      ok: true,
      competitiveDisplayName: updated.competitiveDisplayName,
      label: leaderboardLabel(updated),
    };
  } catch (error) {
    const code =
      error && typeof error === "object" && "code" in error
        ? String((error as { code?: unknown }).code)
        : "";
    const message = error instanceof Error ? error.message : String(error);
    if (
      code === "23505" ||
      message.includes("unique") ||
      message.includes("duplicate") ||
      message.includes("competitive_display_name")
    ) {
      return {
        ok: false,
        error: "Это имя уже занято",
        status: 409,
      };
    }
    console.error(
      "[competitive-display-name] set failed",
      { userId },
      error,
    );
    return {
      ok: false,
      error: "Failed to update display name",
      status: 500,
    };
  }
}
