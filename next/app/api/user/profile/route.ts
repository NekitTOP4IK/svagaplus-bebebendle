import { NextResponse } from "next/server";
import { db, scrans } from "@/db/schema";
import { eq, desc } from "drizzle-orm";
import { getCurrentUser } from "@/lib/auth-server";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    // Fetch user's submitted scrans (joined with users for consistency, though not strictly needed)
    const myScrans = await db
      .select({
        id: scrans.id,
        imageUrl: scrans.imageUrl,
        name: scrans.name,
        description: scrans.description,
        price: scrans.price,
        numberOfLikes: scrans.numberOfLikes,
        numberOfDislikes: scrans.numberOfDislikes,
        approved: scrans.approved,
        isSubscriberAtSubmit: scrans.isSubscriberAtSubmit,
        submittedByUserId: scrans.submittedByUserId,
      })
      .from(scrans)
      .where(eq(scrans.submittedByUserId, user.id))
      .orderBy(desc(scrans.id))
      .limit(100);

    return NextResponse.json({
      user: {
        id: user.id,
        telegramId: user.telegramId,
        telegramUsername: user.telegramUsername,
        displayName: user.displayName,
        role: user.role,
      },
      scrans: myScrans,
    });
  } catch (error) {
    console.error("Error fetching user profile:", error);
    return NextResponse.json(
      { error: "Failed to fetch profile" },
      { status: 500 }
    );
  }
}
