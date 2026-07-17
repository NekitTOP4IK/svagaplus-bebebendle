import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth-server";
import {
  recheckScranSubscriber,
  recheckUncheckedScrans,
} from "@/lib/recheck-scran-subscriber";

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user || !["moderator", "admin"].includes(user.role)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = (await request.json().catch(() => ({}))) as {
      scranId?: unknown;
      allUnchecked?: unknown;
    };

    if (body.allUnchecked === true) {
      const { total, results } = await recheckUncheckedScrans(50);
      const ok = results.filter((r) => r.ok).length;
      const failed = results.length - ok;
      return NextResponse.json({ mode: "bulk", total, ok, failed, results });
    }

    const scranId =
      typeof body.scranId === "number"
        ? body.scranId
        : typeof body.scranId === "string"
          ? Number.parseInt(body.scranId, 10)
          : NaN;

    if (!Number.isInteger(scranId) || scranId <= 0) {
      return NextResponse.json(
        { error: "scranId or allUnchecked=true required" },
        { status: 400 },
      );
    }

    const result = await recheckScranSubscriber(scranId);
    if (!result.ok && result.reason === "not_found") {
      return NextResponse.json({ error: "Scran not found" }, { status: 404 });
    }
    return NextResponse.json({ mode: "single", result });
  } catch (error) {
    console.error("[admin] recheck-subscriber failed", error);
    return NextResponse.json({ error: "Recheck failed" }, { status: 500 });
  }
}
