import { NextResponse } from "next/server";
import { db, scrans } from "@/db/schema";
import { eq, desc, or } from "drizzle-orm";
import { getCurrentUser } from "@/lib/auth-server";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    // Match by linked user id or telegram id (bot-only submits may lack user_id).
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
        rejected: scrans.rejected,
        rejectReason: scrans.rejectReason,
        isSubscriberAtSubmit: scrans.isSubscriberAtSubmit,
        submittedByUserId: scrans.submittedByUserId,
      })
      .from(scrans)
      .where(
        or(
          eq(scrans.submittedByUserId, user.id),
          eq(scrans.telegramId, String(user.telegramId)),
        ),
      )
      .orderBy(desc(scrans.id))
      .limit(100);

    return NextResponse.json({
      user: {
        id: user.id,
        telegramId: user.telegramId,
        telegramUsername: user.telegramUsername,
        telegramPhotoUrl: user.telegramPhotoUrl,
        displayName: user.displayName,
        role: user.role,
        isSubscriber: user.isSubscriber,
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
