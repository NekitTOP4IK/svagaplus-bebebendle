/**
 * Server-side competitive UX prefs (modals). Admin-resettable.
 */

import { eq } from "drizzle-orm";
import { competitiveUserPrefs, db } from "@/db/schema";

export type CompetitiveUserPrefsRow = Readonly<{
  introDismissed: boolean;
  nickPromptDismissed: boolean;
}>;

const EMPTY: CompetitiveUserPrefsRow = {
  introDismissed: false,
  nickPromptDismissed: false,
};

export async function getCompetitiveUserPrefs(
  userId: number,
): Promise<CompetitiveUserPrefsRow> {
  const [row] = await db
    .select({
      introDismissed: competitiveUserPrefs.introDismissed,
      nickPromptDismissed: competitiveUserPrefs.nickPromptDismissed,
    })
    .from(competitiveUserPrefs)
    .where(eq(competitiveUserPrefs.userId, userId))
    .limit(1);
  if (!row) return EMPTY;
  return {
    introDismissed: row.introDismissed,
    nickPromptDismissed: row.nickPromptDismissed,
  };
}

export async function patchCompetitiveUserPrefs(
  userId: number,
  patch: Partial<CompetitiveUserPrefsRow>,
  now: Date = new Date(),
): Promise<CompetitiveUserPrefsRow> {
  const current = await getCompetitiveUserPrefs(userId);
  const next: CompetitiveUserPrefsRow = {
    introDismissed: patch.introDismissed ?? current.introDismissed,
    nickPromptDismissed:
      patch.nickPromptDismissed ?? current.nickPromptDismissed,
  };

  await db
    .insert(competitiveUserPrefs)
    .values({
      userId,
      introDismissed: next.introDismissed,
      nickPromptDismissed: next.nickPromptDismissed,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: competitiveUserPrefs.userId,
      set: {
        introDismissed: next.introDismissed,
        nickPromptDismissed: next.nickPromptDismissed,
        updatedAt: now,
      },
    });

  return next;
}

/** Admin: clear modal dismiss flags so prompts show again. */
export async function resetCompetitiveModalPrefs(
  userId: number,
  now: Date = new Date(),
): Promise<void> {
  await db
    .insert(competitiveUserPrefs)
    .values({
      userId,
      introDismissed: false,
      nickPromptDismissed: false,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: competitiveUserPrefs.userId,
      set: {
        introDismissed: false,
        nickPromptDismissed: false,
        updatedAt: now,
      },
    });
}
