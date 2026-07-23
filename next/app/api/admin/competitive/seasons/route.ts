import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth-server";
import { writeAuditLog } from "@/lib/moderation-audit";
import {
  createSeason,
  listSeasons,
  type SeasonStatus,
} from "@/lib/competitive/seasons";

const VALID_STATUSES = new Set(["draft", "countdown", "active", "ended"]);

function parseDate(value: unknown): Date | null {
  if (typeof value !== "string" || !value.trim()) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d;
}

/** GET — list competitive seasons (newest startsAt first). Admin only. */
export async function GET() {
  try {
    await requireRole("admin");
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const seasons = await listSeasons();
    return NextResponse.json(seasons);
  } catch (error) {
    console.error("[admin/competitive/seasons] GET", error);
    return NextResponse.json(
      { error: "Failed to list seasons" },
      { status: 500 },
    );
  }
}

/** POST — create a competitive season. Admin only. */
export async function POST(request: Request) {
  let user;
  try {
    user = await requireRole("admin");
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await request.json().catch(() => null)) as {
    name?: unknown;
    startsAt?: unknown;
    endsAt?: unknown;
    status?: unknown;
    themeKey?: unknown;
    themeConfig?: unknown;
  } | null;

  if (!body) {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (typeof body.name !== "string" || !body.name.trim()) {
    return NextResponse.json({ error: "name is required" }, { status: 400 });
  }

  const startsAt = parseDate(body.startsAt);
  const endsAt = parseDate(body.endsAt);
  if (!startsAt || !endsAt) {
    return NextResponse.json(
      { error: "startsAt and endsAt must be valid ISO datetimes" },
      { status: 400 },
    );
  }

  let status: SeasonStatus | undefined;
  if (body.status !== undefined) {
    if (typeof body.status !== "string" || !VALID_STATUSES.has(body.status)) {
      return NextResponse.json({ error: "Invalid status" }, { status: 400 });
    }
    status = body.status as SeasonStatus;
  }

  try {
    const season = await createSeason({
      name: body.name,
      startsAt,
      endsAt,
      status,
      themeKey:
        body.themeKey === null
          ? null
          : typeof body.themeKey === "string"
            ? body.themeKey
            : undefined,
      themeConfig: body.themeConfig,
    });

    await writeAuditLog({
      actorUserId: user.id,
      action: "competitive.season.create",
      details: JSON.stringify({
        id: season.id,
        name: season.name,
        status: season.status,
      }),
    });

    return NextResponse.json(season, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (
      message.includes("startsAt") ||
      message.includes("endsAt") ||
      message.includes("name is required") ||
      message.includes("Invalid season status") ||
      message.includes("Only one active season")
    ) {
      return NextResponse.json({ error: message }, { status: 400 });
    }
    console.error("[admin/competitive/seasons] POST", error);
    return NextResponse.json(
      { error: "Failed to create season" },
      { status: 500 },
    );
  }
}
