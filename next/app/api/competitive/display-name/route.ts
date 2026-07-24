import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth-server";
import { setCompetitiveDisplayName } from "@/lib/competitive/display-name-server";

/**
 * Set/clear competitive leaderboard nick.
 * Always available for logged-in users — not gated by competitive_enabled.
 * (Mode flag only controls play/cron/hub; identity is independent.)
 */
export async function PATCH(request: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { name?: unknown };
  try {
    body = (await request.json()) as { name?: unknown };
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  // name: string | null — null clears; missing is invalid
  if (!("name" in body)) {
    return NextResponse.json(
      { error: "name is required (string or null)" },
      { status: 400 },
    );
  }

  if (body.name !== null && typeof body.name !== "string") {
    return NextResponse.json(
      { error: "name must be a string or null" },
      { status: 400 },
    );
  }

  try {
    const result = await setCompetitiveDisplayName(user.id, body.name);

    if (!result.ok) {
      return NextResponse.json(
        { error: result.error },
        { status: result.status },
      );
    }

    return NextResponse.json({
      competitiveDisplayName: result.competitiveDisplayName,
      label: result.label,
    });
  } catch (error) {
    console.error(
      "[competitive-display-name] failed",
      { userId: user.id },
      error,
    );
    return NextResponse.json(
      { error: "Failed to update display name" },
      { status: 500 },
    );
  }
}
