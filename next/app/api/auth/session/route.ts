import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth-server";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ user: null });
  }

  return NextResponse.json({
    user: {
      id: user.id,
      telegramId: user.telegramId,
      telegramUsername: user.telegramUsername,
      telegramPhotoUrl: user.telegramPhotoUrl,
      displayName: user.displayName,
      role: user.role,
    },
  });
}
