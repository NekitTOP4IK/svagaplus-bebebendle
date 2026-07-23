import { NextResponse } from "next/server";
import { checkRateLimit } from "@/app/api/middleware/rateLimit";
import { getCurrentUser } from "@/lib/auth-server";
import { recordCompetitiveVote } from "@/lib/competitive/play";
import { todayMskDate } from "@/lib/daily-timezone";

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
    roundNumber?: unknown;
    chosenScranId?: unknown;
    date?: unknown;
  };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const roundNumber =
    typeof body.roundNumber === "number"
      ? body.roundNumber
      : Number(body.roundNumber);
  const chosenScranId =
    typeof body.chosenScranId === "number"
      ? body.chosenScranId
      : Number(body.chosenScranId);

  if (!Number.isInteger(roundNumber) || !Number.isInteger(chosenScranId)) {
    return NextResponse.json(
      { error: "roundNumber and chosenScranId must be integers" },
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
      roundNumber,
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
      { userId: user.id, roundNumber },
      error,
    );
    return NextResponse.json(
      { error: "Failed to record vote" },
      { status: 500 },
    );
  }
}
