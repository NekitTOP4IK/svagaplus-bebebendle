import { NextResponse } from "next/server";
import { checkRateLimit } from "@/app/api/middleware/rateLimit";
import { getCurrentUser } from "@/lib/auth-server";
import { recordCompetitiveVote } from "@/lib/competitive/play";
import { todayMskDate } from "@/lib/daily-timezone";

function parseOptionalInt(value: unknown): number | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  const n = typeof value === "number" ? value : Number(value);
  return Number.isInteger(n) ? n : Number.NaN;
}

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const rateLimitResult = await checkRateLimit(
    `competitive-vote:${user.id}`,
    30,
    60,
  );
  if (!rateLimitResult.allowed) {
    return NextResponse.json(
      { error: "Too many requests. Please wait." },
      { status: 429 },
    );
  }

  let body: {
    roundId?: unknown;
    roundNumber?: unknown;
    chosenScranId?: unknown;
    date?: unknown;
  };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const roundId = parseOptionalInt(body.roundId);
  const roundNumber = parseOptionalInt(body.roundNumber);
  const chosenScranId = parseOptionalInt(body.chosenScranId);

  if (chosenScranId === undefined || Number.isNaN(chosenScranId)) {
    return NextResponse.json(
      { error: "chosenScranId must be an integer" },
      { status: 400 },
    );
  }

  if (
    (roundId === undefined || Number.isNaN(roundId)) &&
    (roundNumber === undefined || Number.isNaN(roundNumber))
  ) {
    return NextResponse.json(
      { error: "roundId is required (or legacy roundNumber)" },
      { status: 400 },
    );
  }

  if (roundId !== undefined && Number.isNaN(roundId)) {
    return NextResponse.json(
      { error: "roundId must be an integer" },
      { status: 400 },
    );
  }

  if (roundNumber !== undefined && Number.isNaN(roundNumber)) {
    return NextResponse.json(
      { error: "roundNumber must be an integer" },
      { status: 400 },
    );
  }

  const date =
    typeof body.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(body.date)
      ? body.date
      : todayMskDate();

  try {
    // isCompetitiveEnabled checked inside recordCompetitiveVote
    const result = await recordCompetitiveVote({
      userId: user.id,
      date,
      roundId: roundId !== undefined && !Number.isNaN(roundId) ? roundId : undefined,
      roundNumber:
        roundNumber !== undefined && !Number.isNaN(roundNumber)
          ? roundNumber
          : undefined,
      chosenScranId,
    });

    if (!result.ok) {
      return NextResponse.json(
        { error: result.error },
        { status: result.status },
      );
    }

    return NextResponse.json({
      isCorrect: result.isCorrect,
      percentageA: result.percentageA,
      percentageB: result.percentageB,
      potentialPoints: result.potentialPoints,
      earnedPoints: result.earnedPoints,
    });
  } catch (error) {
    console.error(
      "[competitive-vote] failed",
      { userId: user.id, roundId, roundNumber },
      error,
    );
    return NextResponse.json(
      { error: "Failed to record vote" },
      { status: 500 },
    );
  }
}
