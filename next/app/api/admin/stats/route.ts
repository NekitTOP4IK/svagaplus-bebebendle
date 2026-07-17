import { NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import { db, dailyScrandles, dailyUserResults, scrans, users } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth-server";

export async function GET() {
  const user = await getCurrentUser();
  if (!user || !["moderator", "admin"].includes(user.role)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const [scranStats] = await db
      .select({
        total: sql<number>`count(*)::int`,
        pending: sql<number>`count(*) filter (where ${scrans.approved} = false and ${scrans.rejected} = false)::int`,
        approved: sql<number>`count(*) filter (where ${scrans.approved} = true)::int`,
        rejected: sql<number>`count(*) filter (where ${scrans.rejected} = true)::int`,
        subscribersPending: sql<number>`count(*) filter (where ${scrans.approved} = false and ${scrans.rejected} = false and ${scrans.isSubscriberAtSubmit} = true)::int`,
        unchecked: sql<number>`count(*) filter (where ${scrans.approved} = false and ${scrans.rejected} = false and ${scrans.isSubscriberAtSubmit} is null)::int`,
      })
      .from(scrans);

    const [userStats] = await db
      .select({
        total: sql<number>`count(*)::int`,
        admins: sql<number>`count(*) filter (where ${users.role} = 'admin')::int`,
        moderators: sql<number>`count(*) filter (where ${users.role} = 'moderator')::int`,
      })
      .from(users);

    const [playStats] = await db
      .select({
        results: sql<number>`count(*)::int`,
        avgScore: sql<number>`coalesce(round(avg(${dailyUserResults.score})::numeric, 2), 0)::real`,
      })
      .from(dailyUserResults);

    const [dailyDays] = await db
      .select({ days: sql<number>`count(distinct ${dailyScrandles.date})::int` })
      .from(dailyScrandles);

    return NextResponse.json({
      scrans: scranStats,
      users: userStats,
      plays: playStats,
      dailyDays: dailyDays?.days ?? 0,
    });
  } catch (error) {
    console.error("[admin/stats]", error);
    return NextResponse.json({ error: "Failed to load stats" }, { status: 500 });
  }
}
