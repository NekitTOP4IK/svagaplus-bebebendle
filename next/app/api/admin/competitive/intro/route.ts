import { NextResponse } from "next/server";
import { getSetting, setSetting } from "@/lib/app-settings";
import { requireRole } from "@/lib/auth-server";
import { writeAuditLog } from "@/lib/moderation-audit";
import {
  parseCompetitiveIntro,
  parseCompetitiveIntroFromJsonString,
  serializeCompetitiveIntro,
  SETTING_COMPETITIVE_INTRO,
} from "@/lib/competitive/intro";

/** GET — Ranked intro modal config. Admin only. */
export async function GET() {
  try {
    await requireRole("admin");
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const raw = await getSetting(SETTING_COMPETITIVE_INTRO, "");
    const intro = parseCompetitiveIntroFromJsonString(raw || null);
    return NextResponse.json({ intro });
  } catch (error) {
    console.error("[admin/competitive/intro] GET", error);
    return NextResponse.json(
      { error: "Failed to load intro config" },
      { status: 500 },
    );
  }
}

/** PUT — save Ranked intro modal config. Admin only. */
export async function PUT(request: Request) {
  let user;
  try {
    user = await requireRole("admin");
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = (await request.json().catch(() => null)) as {
      intro?: unknown;
      enabled?: unknown;
      title?: unknown;
      body?: unknown;
    } | null;

    if (!body) {
      return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
    }

    const source =
      body.intro && typeof body.intro === "object"
        ? body.intro
        : {
            enabled: body.enabled,
            title: body.title,
            body: body.body,
          };

    const intro = parseCompetitiveIntro(source);
    await setSetting(SETTING_COMPETITIVE_INTRO, serializeCompetitiveIntro(intro));

    await writeAuditLog({
      actorUserId: user.id,
      action: "competitive.intro.update",
      details: JSON.stringify({
        enabled: intro.enabled,
        titleLen: intro.title.length,
        bodyLen: intro.body.length,
      }),
    });

    return NextResponse.json({ intro });
  } catch (error) {
    console.error("[admin/competitive/intro] PUT", error);
    return NextResponse.json(
      { error: "Failed to save intro config" },
      { status: 500 },
    );
  }
}
