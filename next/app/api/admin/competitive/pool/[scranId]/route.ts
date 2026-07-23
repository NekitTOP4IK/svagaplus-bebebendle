import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth-server";
import { writeAuditLog } from "@/lib/moderation-audit";
import { setPoolEnabled } from "@/lib/competitive/pool";

function parseScranId(idStr: string): number | null {
  const n = Number(idStr);
  return Number.isInteger(n) && n > 0 ? n : null;
}

/** PATCH — enable/disable a pool entry by scran id. Admin only. */
export async function PATCH(
  request: Request,
  ctx: { params: Promise<{ scranId: string }> },
) {
  let user;
  try {
    user = await requireRole("admin");
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { scranId: idStr } = await ctx.params;
  const scranId = parseScranId(idStr);
  if (scranId === null) {
    return NextResponse.json({ error: "Invalid scranId" }, { status: 400 });
  }

  const body = (await request.json().catch(() => null)) as {
    enabled?: unknown;
  } | null;

  if (!body || typeof body.enabled !== "boolean") {
    return NextResponse.json(
      { error: "enabled (boolean) is required" },
      { status: 400 },
    );
  }

  try {
    const result = await setPoolEnabled(scranId, body.enabled);
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: 404 });
    }

    await writeAuditLog({
      actorUserId: user.id,
      action: "competitive.pool.enable",
      scranId,
      details: JSON.stringify({ scranId, enabled: body.enabled }),
    });

    return NextResponse.json(result.entry);
  } catch (error) {
    console.error("[admin/competitive/pool] PATCH", error);
    return NextResponse.json(
      { error: "Failed to update pool entry" },
      { status: 500 },
    );
  }
}
