"use server";

import { db } from "@/db/schema";
import { dailyCustomEvents, dailyScrandles, scrans } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import type { DailyData } from "@/types/game";
import { publicScran } from "@/lib/daily-integrity";
import { todayMskDate } from "@/lib/daily-timezone";
import type { CustomDailyBadgeStyle } from "@/lib/admin/custom-daily";

function todayIsoDate(): string {
  return todayMskDate();
}

/** Lightweight check for home CTA — does not load full scran rows. */
export async function hasDailyForToday(): Promise<boolean> {
  const today = todayIsoDate();
  const rows = await db
    .select({ roundNumber: dailyScrandles.roundNumber })
    .from(dailyScrandles)
    .where(eq(dailyScrandles.date, today))
    .limit(1);
  return rows.length > 0;
}

export type TodayCustomDailyHomePresentation = Readonly<{
  eventId: number;
  eventName: string;
  badgeStyle: CustomDailyBadgeStyle;
}>;

/** Optional themed Daily copy rendered next to the home-page Daily CTA. */
export async function getTodayCustomDailyHomePresentation(): Promise<TodayCustomDailyHomePresentation | null> {
  const today = todayIsoDate();
  const [event] = await db
    .select({
      eventId: dailyCustomEvents.id,
      eventName: dailyCustomEvents.name,
      badgeStyle: dailyCustomEvents.badgeStyle,
    })
    .from(dailyCustomEvents)
    .where(
      and(
        eq(dailyCustomEvents.targetDate, today),
        eq(dailyCustomEvents.status, "published"),
        eq(dailyCustomEvents.showOnHome, true),
      ),
    )
    .limit(1);
  return event ?? null;
}

export async function getDailyData(): Promise<DailyData | null> {
  const today = todayIsoDate();

  const roundsData = await db
    .select({
      id: dailyScrandles.id,
      roundNumber: dailyScrandles.roundNumber,
      scranAId: dailyScrandles.scranAId,
      scranBId: dailyScrandles.scranBId,
    })
    .from(dailyScrandles)
    .where(eq(dailyScrandles.date, today))
    .orderBy(dailyScrandles.roundNumber);

  if (roundsData.length === 0) {
    return null;
  }

  const eventData = await db
    .select({
      id: dailyCustomEvents.id,
      name: dailyCustomEvents.name,
      showEventBadge: dailyCustomEvents.showEventBadge,
      badgeStyle: dailyCustomEvents.badgeStyle,
    })
    .from(dailyCustomEvents)
    .where(
      and(
        eq(dailyCustomEvents.targetDate, today),
        eq(dailyCustomEvents.status, "published"),
      ),
    )
    .limit(1);

  const rounds = await Promise.all(
    roundsData.map(async (round) => {
      const [scranAData, scranBData] = await Promise.all([
        db.select().from(scrans).where(eq(scrans.id, round.scranAId)).limit(1),
        db.select().from(scrans).where(eq(scrans.id, round.scranBId)).limit(1),
      ]);

      const scranA = scranAData[0];
      const scranB = scranBData[0];
      if (!scranA || !scranB) {
        throw new Error(`Scran missing for daily round ${round.roundNumber}`);
      }

      return {
        roundNumber: round.roundNumber,
        scrandleId: round.id,
        scranA: publicScran(scranA),
        scranB: publicScran(scranB),
      };
    }),
  );

  return {
    date: today,
    totalRounds: rounds.length,
    rounds,
    ...(eventData[0]
      ? {
          eventId: eventData[0].id,
          eventName: eventData[0].name,
          eventBadgeVisible: eventData[0].showEventBadge,
          eventBadgeStyle: eventData[0].badgeStyle,
        }
      : {}),
  };
}
