import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth-server";
import {
  isDailyRotationNotifyEnabled,
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
    const dailyRotationNotify = await isDailyRotationNotifyEnabled();
    return NextResponse.json({
      dailyRotationNotify,
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
    };

    if (typeof body.dailyRotationNotify === "boolean") {
      await setDailyRotationNotifyEnabled(body.dailyRotationNotify);
      await writeAuditLog({
        actorUserId: user.id,
        action: "settings.daily_rotation_notify",
        details: JSON.stringify({ enabled: body.dailyRotationNotify }),
      });
    } else {
      return NextResponse.json(
        { error: "dailyRotationNotify boolean required" },
        { status: 400 },
      );
    }

    return NextResponse.json({
      dailyRotationNotify: await isDailyRotationNotifyEnabled(),
    });
  } catch (error) {
    console.error("[admin/settings] PATCH", error);
    return NextResponse.json({ error: "Failed to save settings" }, { status: 500 });
  }
}
