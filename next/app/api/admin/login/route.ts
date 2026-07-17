import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth-server";

// Legacy endpoint kept for compatibility but password auth has been replaced
// by real Telegram user + role session (httpOnly cookie). Use /api/auth/telegram instead.
export async function POST() {
  const user = await getCurrentUser();
  if (!user || !['moderator', 'admin'].includes(user.role)) {
    return NextResponse.json(
      { error: "Password auth removed. Use Telegram Login Widget (moderator/admin role required)." },
      { status: 401 }
    );
  }
  return NextResponse.json({ success: true, role: user.role });
}
