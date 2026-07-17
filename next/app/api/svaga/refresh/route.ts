import { NextResponse } from "next/server";
import { checkRateLimit } from "@/app/api/middleware/rateLimit";
import { getCurrentUser } from "@/lib/auth-server";
import { svagaStatusService } from "@/lib/svaga-status-service";

export async function POST() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const rateLimitResult = await checkRateLimit(
    `svaga-refresh:${user.telegramId}`,
    5,
    60,
  );
  if (!rateLimitResult.allowed) {
    return NextResponse.json(
      { error: "Too many requests. Please wait." },
      { status: 429 },
    );
  }

  console.log(
    `[svaga-refresh] refresh for telegramId=${user.telegramId} (userId=${user.id})`,
  );

  try {
    const resolved = await svagaStatusService.resolve(user.telegramId);
    const body = {
      isSubscriber: resolved.isSubscriber,
      source: resolved.source,
      checkedAt: resolved.checkedAt ? resolved.checkedAt.toISOString() : null,
      error: resolved.error ?? null,
    };

    if (resolved.source === "fresh" || resolved.source === "cache") {
      return NextResponse.json(body, { status: 200 });
    }

    return NextResponse.json(body, { status: 503 });
  } catch (error) {
    console.error(
      `[svaga-refresh] error for telegramId=${user.telegramId}:`,
      error,
    );
    return NextResponse.json(
      { error: "Failed to refresh SVAGA+ status" },
      { status: 500 },
    );
  }
}
