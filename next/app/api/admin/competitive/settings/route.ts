import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth-server";
import { writeAuditLog } from "@/lib/moderation-audit";
import {
  isCompetitiveEnabled,
  setCompetitiveEnabled,
} from "@/lib/competitive/feature";

/** GET — competitive feature flag. Admin only. */
export async function GET() {
  try {
    await requireRole("admin");
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const competitiveEnabled = await isCompetitiveEnabled();
    return NextResponse.json({ competitiveEnabled });
  } catch (error) {
    console.error("[admin/competitive/settings] GET", error);
    return NextResponse.json(
      { error: "Failed to load competitive settings" },
      { status: 500 },
    );
  }
}

/** PATCH — set competitive feature flag. Admin only. */
export async function PATCH(request: Request) {
  let user;
  try {
    user = await requireRole("admin");
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = (await request.json().catch(() => null)) as {
      competitiveEnabled?: unknown;
      enabled?: unknown;
    } | null;

    if (!body) {
      return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
    }

    const raw =
      typeof body.competitiveEnabled === "boolean"
        ? body.competitiveEnabled
        : typeof body.enabled === "boolean"
          ? body.enabled
          : undefined;

    if (typeof raw !== "boolean") {
      return NextResponse.json(
        { error: "competitiveEnabled (boolean) is required" },
        { status: 400 },
      );
    }

    await setCompetitiveEnabled(raw);

    await writeAuditLog({
      actorUserId: user.id,
      action: "competitive.settings.update",
      details: JSON.stringify({ competitiveEnabled: raw }),
    });

    return NextResponse.json({ competitiveEnabled: raw });
  } catch (error) {
    console.error("[admin/competitive/settings] PATCH", error);
    return NextResponse.json(
      { error: "Failed to save competitive settings" },
      { status: 500 },
    );
  }
}
