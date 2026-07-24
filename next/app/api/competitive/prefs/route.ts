import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth-server";
import {
  getCompetitiveUserPrefs,
  patchCompetitiveUserPrefs,
} from "@/lib/competitive/user-prefs";

/**
 * PATCH — dismiss onboarding flags (intro / nick prompt).
 * Body: { introDismissed?: true, nickPromptDismissed?: true }
 * Only true is accepted (cannot re-open via self).
 */
export async function PATCH(request: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: {
    introDismissed?: unknown;
    nickPromptDismissed?: unknown;
  };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const patch: {
    introDismissed?: boolean;
    nickPromptDismissed?: boolean;
  } = {};

  if (body.introDismissed === true) patch.introDismissed = true;
  if (body.nickPromptDismissed === true) patch.nickPromptDismissed = true;

  if (Object.keys(patch).length === 0) {
    return NextResponse.json(
      { error: "Provide introDismissed and/or nickPromptDismissed as true" },
      { status: 400 },
    );
  }

  try {
    const prefs = await patchCompetitiveUserPrefs(user.id, patch);
    return NextResponse.json({ prefs });
  } catch (error) {
    console.error("[competitive-prefs] patch failed", { userId: user.id }, error);
    return NextResponse.json(
      { error: "Failed to update prefs" },
      { status: 500 },
    );
  }
}

/** GET — current prefs (optional; hub already embeds them). */
export async function GET() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const prefs = await getCompetitiveUserPrefs(user.id);
  return NextResponse.json({ prefs });
}
