import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth-server";
import { writeAuditLog } from "@/lib/moderation-audit";
import { updateAnnouncement, deleteAnnouncement, validateAnnouncement } from "@/lib/announcements";

function parseId(idStr: string): number | null {
  const n = Number(idStr);
  return Number.isInteger(n) && n > 0 ? n : null;
}

/** PATCH — update fields of an announcement. Admin only. */
export async function PATCH(
  request: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  let user;
  try {
    user = await requireRole("admin");
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id: idStr } = await ctx.params;
  const id = parseId(idStr);
  if (id === null) return NextResponse.json({ error: "Invalid id" }, { status: 400 });

  const body = (await request.json().catch(() => null)) as
    | { title?: unknown; body?: unknown; active?: unknown }
    | null;
  if (!body) return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });

  const patch: { title?: string; body?: string; active?: boolean } = {};
  const changedKeys: string[] = [];

  if (typeof body.title !== "undefined" || typeof body.body !== "undefined") {
    const v = validateAnnouncement({
      title: body.title ?? "",
      body: body.body ?? "",
    });
    if (!v.ok) return NextResponse.json({ error: v.error }, { status: 400 });
    if (typeof body.title !== "undefined") {
      patch.title = v.title;
      changedKeys.push("title");
    }
    if (typeof body.body !== "undefined") {
      patch.body = v.body;
      changedKeys.push("body");
    }
  }
  if (typeof body.active === "boolean") {
    patch.active = body.active;
    changedKeys.push("active");
  }

  if (changedKeys.length === 0) {
    return NextResponse.json({ error: "No valid fields" }, { status: 400 });
  }

  try {
    const row = await updateAnnouncement(id, patch);
    if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });
    await writeAuditLog({
      actorUserId: user.id,
      action: "announcements.update",
      details: JSON.stringify({ id: row.id, changed: changedKeys }),
    });
    return NextResponse.json(row);
  } catch (error) {
    console.error("[admin/announcements] PATCH", error);
    return NextResponse.json({ error: "Failed to update announcement" }, { status: 500 });
  }
}

/** DELETE — hard-delete an announcement. Admin only. */
export async function DELETE(
  _request: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  let user;
  try {
    user = await requireRole("admin");
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id: idStr } = await ctx.params;
  const id = parseId(idStr);
  if (id === null) return NextResponse.json({ error: "Invalid id" }, { status: 400 });

  try {
    const ok = await deleteAnnouncement(id);
    if (!ok) return NextResponse.json({ error: "Not found" }, { status: 404 });
    await writeAuditLog({
      actorUserId: user.id,
      action: "announcements.delete",
      details: JSON.stringify({ id }),
    });
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    console.error("[admin/announcements] DELETE", error);
    return NextResponse.json({ error: "Failed to delete announcement" }, { status: 500 });
  }
}