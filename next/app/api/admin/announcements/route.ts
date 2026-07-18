import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth-server";
import { writeAuditLog } from "@/lib/moderation-audit";
import {
  listAllAnnouncements,
  createAnnouncement,
  validateAnnouncement,
} from "@/lib/announcements";

/** GET — list all announcements (active + disabled), newest first. Admin only. */
export async function GET() {
  try {
    await requireRole("admin");
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const rows = await listAllAnnouncements();
    return NextResponse.json(rows);
  } catch (error) {
    console.error("[admin/announcements] GET", error);
    return NextResponse.json({ error: "Failed to list announcements" }, { status: 500 });
  }
}

/** POST — create a new announcement. Admin only. */
export async function POST(request: Request) {
  let user;
  try {
    user = await requireRole("admin");
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await request.json().catch(() => null)) as
    | { title?: unknown; body?: unknown; active?: unknown }
    | null;

  if (!body) {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const validated = validateAnnouncement({ title: body.title, body: body.body });
  if (!validated.ok) {
    return NextResponse.json({ error: validated.error }, { status: 400 });
  }

  const active = typeof body.active === "boolean" ? body.active : true;

  try {
    const row = await createAnnouncement({
      title: validated.title,
      body: validated.body,
      active,
      createdByUserId: user.id,
    });
    await writeAuditLog({
      actorUserId: user.id,
      action: "announcements.create",
      details: JSON.stringify({ id: row.id, title: row.title }),
    });
    return NextResponse.json(row, { status: 201 });
  } catch (error) {
    console.error("[admin/announcements] POST", error);
    return NextResponse.json({ error: "Failed to create announcement" }, { status: 500 });
  }
}