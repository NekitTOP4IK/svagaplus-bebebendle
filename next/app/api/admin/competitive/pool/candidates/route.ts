import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth-server";
import { listPoolCandidates } from "@/lib/competitive/pool";
import { MIN_COMPETITIVE_VOTES } from "@/lib/competitive/constants";

/** GET — approved scrans eligible to add to competitive pool. Admin only. */
export async function GET(request: Request) {
  try {
    await requireRole("admin");
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { searchParams } = new URL(request.url);
    const limitRaw = Number(searchParams.get("limit") || 200);
    const limit = Number.isFinite(limitRaw) ? limitRaw : 200;
    const candidates = await listPoolCandidates(limit);
    return NextResponse.json({
      minVotes: MIN_COMPETITIVE_VOTES,
      candidates,
    });
  } catch (error) {
    console.error("[admin/competitive/pool/candidates] GET", error);
    return NextResponse.json(
      { error: "Failed to list candidates" },
      { status: 500 },
    );
  }
}
