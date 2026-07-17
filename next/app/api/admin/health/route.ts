import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth-server";

/** Proxy internal readiness for staff (admin only). */
export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user || user.role !== "admin") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const origin = new URL(request.url).origin;
    const [ready, live] = await Promise.all([
      fetch(`${origin}/api/health/ready`, { cache: "no-store" }).then(async (r) => ({
        status: r.status,
        body: await r.json().catch(() => ({})),
      })),
      fetch(`${origin}/api/health/live`, { cache: "no-store" }).then(async (r) => ({
        status: r.status,
        body: await r.json().catch(() => ({})),
      })),
    ]);

    return NextResponse.json({
      ready,
      live,
      env: process.env.APP_ENV || "unknown",
      now: new Date().toISOString(),
    });
  } catch (error) {
    console.error("[admin/health]", error);
    return NextResponse.json({ error: "Health check failed" }, { status: 500 });
  }
}
