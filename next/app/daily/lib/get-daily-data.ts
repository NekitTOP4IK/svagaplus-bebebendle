"use server";

import { db } from "@/db/schema";
import { dailyScrandles, scrans } from "@/db/schema";
import { eq } from "drizzle-orm";
import type { DailyData } from "@/types/game";
import { publicScran } from "@/lib/daily-integrity";

function todayIsoDate(): string {
  return new Date().toISOString().split("T")[0];
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
  };
}
