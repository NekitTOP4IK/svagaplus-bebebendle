import { NextResponse } from "next/server";
import { checkRateLimit, getClientIp } from "@/app/api/middleware/rateLimit";
import { svagaStatusService } from "@/lib/svaga-status-service";

const BEBEBENDLE_INTERNAL_SECRET = process.env.BEBEBENDLE_INTERNAL_SECRET;

export async function GET(request: Request) {
  const providedSecret = request.headers.get("x-internal-secret");
  if (!BEBEBENDLE_INTERNAL_SECRET || providedSecret !== BEBEBENDLE_INTERNAL_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let telegramIdStrForLog: string | null = null;
  try {
    const { searchParams } = new URL(request.url);
    const telegramIdStr = searchParams.get("telegram_id");
    telegramIdStrForLog = telegramIdStr;

    const rateKey = telegramIdStr
      ? `internal-svaga:${telegramIdStr}`
      : `internal-svaga-ip:${getClientIp(request)}`;
    const rateLimitResult = await checkRateLimit(rateKey, 30, 60);
    if (!rateLimitResult.allowed) {
      return NextResponse.json(
        { error: "Too many requests. Please wait." },
        { status: 429 },
      );
    }

    if (!telegramIdStr) {
      return NextResponse.json(
        { error: "telegram_id query param is required" },
        { status: 400 },
      );
    }

    const telegramId = parseInt(telegramIdStr, 10);
    if (isNaN(telegramId) || telegramId <= 0) {
      return NextResponse.json(
        { error: "Invalid telegram_id" },
        { status: 400 },
      );
    }

    console.log(`[svaga-internal] subscriber check for telegramId=${telegramId}`);
    const resolved = await svagaStatusService.resolve(telegramId);
    console.log(
      `[svaga-internal] result for ${telegramId}: source=${resolved.source} isSubscriber=${resolved.isSubscriber}`,
    );

    return NextResponse.json({
      isSubscriber: resolved.isSubscriber,
      source: resolved.source,
      checkedAt: resolved.checkedAt ? resolved.checkedAt.toISOString() : null,
      error: resolved.error ?? null,
    });
  } catch (error) {
    console.error(
      `[svaga-internal] Internal SVAGA subscription-status error for ${telegramIdStrForLog || "unknown"}:`,
      error,
    );
    return NextResponse.json(
      { error: "Failed to get subscription status" },
      { status: 500 },
    );
  }
}
