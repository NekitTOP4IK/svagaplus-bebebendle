import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth-server";
import { getSetting, setSetting } from "@/lib/app-settings";
import { writeAuditLog } from "@/lib/moderation-audit";
import {
  SETTING_COMPETITIVE_MODE_RULES,
  emptyContentDoc,
  parseContentDoc,
  parseContentDocFromJsonString,
  serializeContentDoc,
  type CompetitiveContentDoc,
} from "@/lib/competitive/content";

/** GET — global competitive mode rules document. Admin only. */
export async function GET() {
  try {
    await requireRole("admin");
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const raw = await getSetting(SETTING_COMPETITIVE_MODE_RULES, "");
  const doc = parseContentDocFromJsonString(raw || null);
  return NextResponse.json({ doc });
}

/** PUT — replace global mode rules. Admin only. */
export async function PUT(request: Request) {
  let user;
  try {
    user = await requireRole("admin");
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = (await request.json().catch(() => null)) as {
      doc?: unknown;
    } | null;
    if (!body || body.doc === undefined) {
      return NextResponse.json({ error: "doc is required" }, { status: 400 });
    }

    const doc: CompetitiveContentDoc = parseContentDoc(body.doc);
    await setSetting(SETTING_COMPETITIVE_MODE_RULES, serializeContentDoc(doc));

    await writeAuditLog({
      actorUserId: user.id,
      action: "competitive.content.mode_rules.update",
      details: JSON.stringify({ blocks: doc.blocks.length }),
    });

    return NextResponse.json({ doc: doc.blocks.length ? doc : emptyContentDoc() });
  } catch (error) {
    console.error("[admin/competitive/content/mode-rules] PUT", error);
    return NextResponse.json(
      { error: "Failed to save mode rules" },
      { status: 500 },
    );
  }
}
