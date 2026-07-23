import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth-server";
import { getHubPayload } from "@/lib/competitive/hub";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const payload = await getHubPayload(user.id);
    // Flag off → { enabled: false } (not 404)
    return NextResponse.json(payload);
  } catch (error) {
    console.error("[competitive-hub] failed", { userId: user.id }, error);
    return NextResponse.json(
      { error: "Failed to load competitive hub" },
      { status: 500 },
    );
  }
}
