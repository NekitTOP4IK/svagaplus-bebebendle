import { NextResponse } from "next/server";

import { getLiveHealth } from "@/lib/health";

export function GET(): NextResponse {
  return NextResponse.json(getLiveHealth());
}
