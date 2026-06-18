import { NextResponse } from "next/server";
import { db, scrans, dailyScrandles } from "@/db/schema";
import {
  eq,
  and,
  sql,
  getTableColumns,
  notExists,
  or,
  gt,
  asc,
} from "drizzle-orm";
import type { Scran } from "@/db/schema";

const MIN_SCRANS = 20;
const ROUNDS_COUNT = 10;
const MIN_VOTES = 10;

function shuffle<T>(array: T[]): T[] {
  const result = [...array];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

async function getApprovedScransWithVotes(): Promise<Scran[]> {
  const rating = sql<number>`
    round(
      (${scrans.numberOfLikes})::numeric
      / nullif(${scrans.numberOfLikes} + ${scrans.numberOfDislikes}, 0),
      2
    )
  `
    .mapWith(Number)
    .as("rating");

  const candidates = db
    .select({
      ...getTableColumns(scrans),
      rating,
    })
    .from(scrans)
    .where(
      and(
        notExists(
          db
            .select({ one: sql`1` })
            .from(dailyScrandles)
            .where(
              or(
                eq(dailyScrandles.scranAId, scrans.id),
                eq(dailyScrandles.scranBId, scrans.id),
              ),
            ),
        ),
        gt(
          sql<number>`${scrans.numberOfLikes} + ${scrans.numberOfDislikes}`,
          MIN_VOTES,
        ),
        eq(scrans.approved, true),
      ),
    )
    .as("candidates");

  const result = await db
    .selectDistinctOn([candidates.rating])
    .from(candidates)
    .orderBy(asc(candidates.rating))
    .limit(20);

  return result;
}

async function checkExistingRoundsForDate(date: string): Promise<boolean> {
  const existing = await db
    .select({ id: dailyScrandles.id })
    .from(dailyScrandles)
    .where(eq(dailyScrandles.date, date))
    .limit(1);

  return existing.length > 0;
}

async function createDailyRounds(
  scrans: Scran[],
  date: string,
): Promise<{ roundNumber: number; scranA: string; scranB: string }[]> {
  const createdRounds = [];

  for (let roundNumber = 1; roundNumber <= ROUNDS_COUNT; roundNumber++) {
    const scranA = scrans[(roundNumber - 1) * 2];
    const scranB = scrans[(roundNumber - 1) * 2 + 1];

    await db.insert(dailyScrandles).values({
      date,
      scranAId: scranA.id,
      scranBId: scranB.id,
      roundNumber: roundNumber,
      createdAt: new Date(),
    });

    createdRounds.push({
      roundNumber,
      scranA: scranA.name,
      scranB: scranB.name,
    });
  }

  return createdRounds;
}

export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const today = new Date().toISOString().split("T")[0];

    if (await checkExistingRoundsForDate(today)) {
      return NextResponse.json({
        message: "Daily scrandles already exist for today",
        count: ROUNDS_COUNT,
      });
    }

    const approvedScrans = await getApprovedScransWithVotes();

    if (approvedScrans.length < MIN_SCRANS) {
      return NextResponse.json(
        {
          error: `Not enough scrans with sufficient votes (need at least ${MIN_SCRANS}, found ${approvedScrans.length})`,
        },
        { status: 400 },
      );
    }

    const selectedScrans = shuffle(approvedScrans).slice(0, MIN_SCRANS);
    const createdRounds = await createDailyRounds(selectedScrans, today);

    console.log("Added daily game");

    return NextResponse.json({
      message: "Daily scrandles created successfully",
      date: today,
      rounds: createdRounds,
    });
  } catch (error) {
    console.error("Error creating daily scrandles:", error);
    return NextResponse.json(
      { error: "Failed to create daily scrandles" },
      { status: 500 },
    );
  }
}
