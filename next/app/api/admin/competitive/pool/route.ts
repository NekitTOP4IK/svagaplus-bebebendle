import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth-server";
import { writeAuditLog } from "@/lib/moderation-audit";
import { addToPool, listPool } from "@/lib/competitive/pool";
import { todayMskDate } from "@/lib/daily-timezone";

function isDate(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

/** GET — list competitive pool entries. Admin only. */
export async function GET(request: Request) {
  try {
    await requireRole("admin");
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { searchParams } = new URL(request.url);
    const dateParam = searchParams.get("date");
    const date = dateParam || todayMskDate();
    if (!isDate(date)) {
      return NextResponse.json({ error: "Invalid date" }, { status: 400 });
    }

    const rows = await listPool(date);
    return NextResponse.json({ date, entries: rows });
  } catch (error) {
    console.error("[admin/competitive/pool] GET", error);
    return NextResponse.json(
      { error: "Failed to list pool" },
      { status: 500 },
    );
  }
}

/** POST — add one or many scrans to competitive pool. Admin only.
 * Body: `{ scranId: number }` or `{ scranIds: number[] }`
 */
export async function POST(request: Request) {
  let user;
  try {
    user = await requireRole("admin");
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await request.json().catch(() => null)) as {
    scranId?: unknown;
    scranIds?: unknown;
  } | null;

  if (!body) {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const ids: number[] = [];
  if (Array.isArray(body.scranIds)) {
    for (const raw of body.scranIds) {
      const n = typeof raw === "number" ? raw : Number(raw);
      if (Number.isInteger(n) && n > 0) ids.push(n);
    }
  } else {
    const scranId =
      typeof body.scranId === "number"
        ? body.scranId
        : typeof body.scranId === "string"
          ? Number(body.scranId)
          : NaN;
    if (Number.isInteger(scranId) && scranId > 0) ids.push(scranId);
  }

  if (ids.length === 0) {
    return NextResponse.json(
      { error: "scranId or scranIds is required" },
      { status: 400 },
    );
  }

  try {
    const added: number[] = [];
    const failed: Array<{ scranId: number; error: string }> = [];

    for (const scranId of ids) {
      const result = await addToPool(scranId, user.id);
      if (!result.ok) {
        failed.push({ scranId, error: result.error });
        continue;
      }
      added.push(scranId);
      await writeAuditLog({
        actorUserId: user.id,
        action: "competitive.pool.add",
        scranId,
        details: JSON.stringify({ scranId, entryId: result.entry.id }),
      });
    }

    if (ids.length === 1) {
      if (added.length === 1) {
        return NextResponse.json({ ok: true, scranId: added[0] }, { status: 201 });
      }
      const err = failed[0]?.error || "Failed to add";
      const status =
        err.includes("не найден") || err.includes("not found")
          ? 404
          : err.includes("уже в пуле")
            ? 409
            : 400;
      return NextResponse.json({ error: err }, { status });
    }

    return NextResponse.json(
      {
        ok: true,
        added,
        failed,
        addedCount: added.length,
        failedCount: failed.length,
      },
      { status: 201 },
    );
  } catch (error) {
    console.error("[admin/competitive/pool] POST", error);
    return NextResponse.json(
      { error: "Failed to add to pool" },
      { status: 500 },
    );
  }
}
