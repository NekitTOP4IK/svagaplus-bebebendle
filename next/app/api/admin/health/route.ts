import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth-server";
import { getLiveHealth, getReadyHealth } from "@/lib/health";

/**
 * In-process health snapshot for admins.
 * Do not self-fetch public HTTPS origin — behind reverse proxy that hits local HTTP
 * and causes ERR_SSL_WRONG_VERSION_NUMBER.
 */
export async function GET() {
  const user = await getCurrentUser();
  if (!user || user.role !== "admin") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const [readyBody, liveBody] = await Promise.all([
      getReadyHealth(),
      Promise.resolve(getLiveHealth()),
    ]);

    return NextResponse.json({
      ready: {
        status: readyBody.status === "ok" ? 200 : 503,
        body: readyBody,
      },
      live: {
        status: 200,
        body: liveBody,
      },
      env: process.env.APP_ENV || "unknown",
      now: new Date().toISOString(),
    });
  } catch (error) {
    console.error("[admin/health]", error);
    return NextResponse.json({ error: "Health check failed" }, { status: 500 });
  }
}
