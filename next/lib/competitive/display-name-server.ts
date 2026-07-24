/**
 * Server-only competitive display name mutations (uses DB / pg).
 * Do not import this module from client components.
 */

import { eq } from "drizzle-orm";
import { db, users } from "@/db/schema";
import {
  canChangeDisplayName,
  leaderboardLabel,
  validateCompetitiveDisplayName,
  type SetCompetitiveDisplayNameResult,
} from "./display-name";

/**
 * Set or clear competitive display name for a user.
 * `name: null` clears. Non-null is validated. 24h rate limit via updatedAt.
 * Unique on lower(name) → 409.
 * Clear is always allowed (outside CD).
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

  // Clear (delete nick) is always allowed and outside the 24h rename CD.
  const isClear = nextName === null;
  if (!isClear) {
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
  }

  try {
    // On clear: wipe name but keep updatedAt so a re-set still respects CD
    // if they renamed recently; only first-ever set has null updatedAt.
    // User asked: delete outside CD — so we do NOT require CD for clear.
    // After clear, next set uses existing updatedAt (still CD if recent rename).
    const [updated] = await db
      .update(users)
      .set({
        competitiveDisplayName: nextName,
        // Only bump cooldown clock on set/rename, not on clear.
        ...(isClear
          ? { updatedAt: now }
          : {
              competitiveDisplayNameUpdatedAt: now,
              updatedAt: now,
            }),
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
