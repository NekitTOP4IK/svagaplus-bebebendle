import { NextResponse } from "next/server";
import { db, scrans } from "@/db/schema";
import { eq } from "drizzle-orm";
import { getCurrentUser } from "@/lib/auth-server";
import { writeAuditLog } from "@/lib/moderation-audit";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getCurrentUser();
  // Ban (unpublish approved) is admin-only. Moderators only approve/reject.
  if (!user || user.role !== "admin") {
    return NextResponse.json(
      { error: "Unauthorized" },
      { status: 401 }
    );
  }

  try {
    const { id } = await params;
    const scranId = parseInt(id);

    if (isNaN(scranId)) {
      return NextResponse.json(
        { error: "Invalid ID" },
        { status: 400 }
      );
    }

    const updated = await db
      .update(scrans)
      .set({ approved: false })
      .where(eq(scrans.id, scranId))
      .returning({ telegramId: scrans.telegramId, name: scrans.name });

    if (updated.length === 0) {
      return NextResponse.json({ error: "Scran not found" }, { status: 404 });
    }

    await writeAuditLog({
      actorUserId: user.id,
      action: "scran.unpublish",
      scranId,
      targetTelegramId: updated[0].telegramId,
      details: updated[0].name,
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error banning scran:", error);
    return NextResponse.json(
      { error: "Failed to ban scran" },
      { status: 500 }
    );
  }
}
