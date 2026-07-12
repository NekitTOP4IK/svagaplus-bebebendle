import { NextResponse } from "next/server";
import { db, scrans } from "@/db/schema";
import { eq } from "drizzle-orm";
import { getCurrentUser } from "@/lib/auth-server";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getCurrentUser();
  if (!user || (user.role !== "moderator" && user.role !== "admin")) {
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

    await db
      .update(scrans)
      .set({ approved: false })
      .where(eq(scrans.id, scranId));

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error banning scran:", error);
    return NextResponse.json(
      { error: "Failed to ban scran" },
      { status: 500 }
    );
  }
}
