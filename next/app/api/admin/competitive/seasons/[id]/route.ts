import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth-server";
import { writeAuditLog } from "@/lib/moderation-audit";
import {
  endSeason,
  getSeason,
  updateSeason,
  type SeasonStatus,
  type UpdateSeasonPatch,
} from "@/lib/competitive/seasons";

const VALID_STATUSES = new Set(["draft", "countdown", "active", "ended"]);

function parseId(idStr: string): number | null {
  const n = Number(idStr);
  return Number.isInteger(n) && n > 0 ? n : null;
}

function parseDate(value: unknown): Date | null {
  if (typeof value !== "string" || !value.trim()) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d;
}

/** PATCH — update season fields. Admin only. */
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
  if (id === null) {
    return NextResponse.json({ error: "Invalid id" }, { status: 400 });
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

  const patch: UpdateSeasonPatch = {};
  const changedKeys: string[] = [];

  if (typeof body.name === "string") {
    patch.name = body.name;
    changedKeys.push("name");
  }
  if (body.startsAt !== undefined) {
    const startsAt = parseDate(body.startsAt);
    if (!startsAt) {
      return NextResponse.json(
        { error: "startsAt must be a valid ISO datetime" },
        { status: 400 },
      );
    }
    patch.startsAt = startsAt;
    changedKeys.push("startsAt");
  }
  if (body.endsAt !== undefined) {
    const endsAt = parseDate(body.endsAt);
    if (!endsAt) {
      return NextResponse.json(
        { error: "endsAt must be a valid ISO datetime" },
        { status: 400 },
      );
    }
    patch.endsAt = endsAt;
    changedKeys.push("endsAt");
  }
  if (body.status !== undefined) {
    if (typeof body.status !== "string" || !VALID_STATUSES.has(body.status)) {
      return NextResponse.json({ error: "Invalid status" }, { status: 400 });
    }
    patch.status = body.status as SeasonStatus;
    changedKeys.push("status");
  }
  if (body.themeKey !== undefined) {
    if (body.themeKey !== null && typeof body.themeKey !== "string") {
      return NextResponse.json({ error: "Invalid themeKey" }, { status: 400 });
    }
    patch.themeKey = body.themeKey as string | null;
    changedKeys.push("themeKey");
  }
  if (body.themeConfig !== undefined) {
    patch.themeConfig = body.themeConfig;
    changedKeys.push("themeConfig");
  }

  if (changedKeys.length === 0) {
    return NextResponse.json({ error: "No valid fields" }, { status: 400 });
  }

  try {
    const season = await updateSeason(id, patch);
    if (!season) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    await writeAuditLog({
      actorUserId: user.id,
      action: "competitive.season.update",
      details: JSON.stringify({ id, changed: changedKeys, status: season.status }),
    });

    return NextResponse.json(season);
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
    console.error("[admin/competitive/seasons] PATCH", error);
    return NextResponse.json(
      { error: "Failed to update season" },
      { status: 500 },
    );
  }
}

/** POST — end season and snapshot final ranks. Admin only. */
export async function POST(
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
  if (id === null) {
    return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  }

  try {
    const existing = await getSeason(id);
    if (!existing) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    await endSeason(id);
    const season = await getSeason(id);

    await writeAuditLog({
      actorUserId: user.id,
      action: "competitive.season.end",
      details: JSON.stringify({ id, previousStatus: existing.status }),
    });

    return NextResponse.json(season);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message.includes("Season not found")) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    console.error("[admin/competitive/seasons] POST end", error);
    return NextResponse.json(
      { error: "Failed to end season" },
      { status: 500 },
    );
  }
}
