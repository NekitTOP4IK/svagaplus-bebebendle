import { NextResponse } from "next/server";
import { generateDailyForDate, todayUtcDate } from "@/lib/daily-generate";

export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const today = todayUtcDate();
    const result = await generateDailyForDate(today);

    if (!result.ok) {
      if (result.status === 409) {
        return NextResponse.json({
          message: "Daily scrandles already exist for today",
          count: 10,
        });
      }
      return NextResponse.json({ error: result.error }, { status: result.status });
    }

    console.log("Added daily game");
    return NextResponse.json({
      message: "Daily scrandles created successfully",
      date: result.date,
      rounds: result.rounds,
    });
  } catch (error) {
    console.error("Error creating daily scrandles:", error);
    return NextResponse.json(
      { error: "Failed to create daily scrandles" },
      { status: 500 },
    );
  }
}
