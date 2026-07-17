import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth-server";
import {
  getDailyDisabledReason,
  isDailyGenerationEnabled,
  isDailyRotationNotifyEnabled,
  setDailyDisabledReason,
  setDailyGenerationEnabled,
  setDailyRotationNotifyEnabled,
} from "@/lib/app-settings";
import { writeAuditLog } from "@/lib/moderation-audit";

/** GET — staff can read settings */
export async function GET() {
  const user = await getCurrentUser();
  if (!user || !["moderator", "admin"].includes(user.role)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const [dailyRotationNotify, dailyGenerationEnabled, dailyDisabledReason] =
      await Promise.all([
        isDailyRotationNotifyEnabled(),
        isDailyGenerationEnabled(),
        getDailyDisabledReason(),
      ]);
    return NextResponse.json({
      dailyRotationNotify,
      dailyGenerationEnabled,
      dailyDisabledReason,
    });
  } catch (error) {
    console.error("[admin/settings] GET", error);
    return NextResponse.json({ error: "Failed to load settings" }, { status: 500 });
  }
}

/** PATCH — admin only */
export async function PATCH(request: Request) {
  const user = await getCurrentUser();
  if (!user || user.role !== "admin") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = (await request.json().catch(() => ({}))) as {
      dailyRotationNotify?: unknown;
      dailyGenerationEnabled?: unknown;
      dailyDisabledReason?: unknown;
    };

    let touched = false;

    if (typeof body.dailyRotationNotify === "boolean") {
      await setDailyRotationNotifyEnabled(body.dailyRotationNotify);
      await writeAuditLog({
        actorUserId: user.id,
        action: "settings.daily_rotation_notify",
        details: JSON.stringify({ enabled: body.dailyRotationNotify }),
      });
      touched = true;
    }

    if (typeof body.dailyGenerationEnabled === "boolean") {
      await setDailyGenerationEnabled(body.dailyGenerationEnabled);
      await writeAuditLog({
        actorUserId: user.id,
        action: "settings.daily_generation",
        details: JSON.stringify({
          enabled: body.dailyGenerationEnabled,
          reason:
            typeof body.dailyDisabledReason === "string"
              ? body.dailyDisabledReason
              : undefined,
        }),
      });
      touched = true;
    }

    if (typeof body.dailyDisabledReason === "string") {
      await setDailyDisabledReason(body.dailyDisabledReason);
      touched = true;
    }

    if (!touched) {
      return NextResponse.json({ error: "No valid fields" }, { status: 400 });
    }

    return NextResponse.json({
      dailyRotationNotify: await isDailyRotationNotifyEnabled(),
      dailyGenerationEnabled: await isDailyGenerationEnabled(),
      dailyDisabledReason: await getDailyDisabledReason(),
    });
  } catch (error) {
    console.error("[admin/settings] PATCH", error);
    return NextResponse.json({ error: "Failed to save settings" }, { status: 500 });
  }
}
