import { NextResponse } from "next/server";
import { getCurrentUser, isStaffRole } from "@/lib/auth-server";

export async function POST() {
  try {
    const user = await getCurrentUser();
    if (user && isStaffRole(user.role)) {
      return NextResponse.json({ authenticated: true, role: user.role });
    }
    return NextResponse.json({ authenticated: false }, { status: 401 });
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
}
