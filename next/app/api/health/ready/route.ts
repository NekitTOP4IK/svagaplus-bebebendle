import { NextResponse } from "next/server";

import { getReadyHealth } from "@/lib/health";

export async function GET(): Promise<NextResponse> {
  const body = await getReadyHealth();
  return NextResponse.json(body, { status: body.status === "ok" ? 200 : 503 });
}
