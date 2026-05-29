import { NextResponse } from "next/server";
import { db, scrans } from "@/db/schema";
import { eq, sql } from "drizzle-orm";

export async function GET() {
  try {
    const [approvedCount] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(scrans)
      .where(eq(scrans.approved, true));

    const [priceSum] = await db
      .select({ sum: sql<number>`coalesce(sum(${scrans.price}), 0)::real` })
      .from(scrans)
      .where(eq(scrans.approved, true));

    const [distinctUsers] = await db
      .select({ count: sql<number>`count(distinct ${scrans.telegramId})::int` })
      .from(scrans)
      .where(eq(scrans.approved, true));

    return NextResponse.json({
      approvedScransCount: approvedCount?.count ?? 0,
      totalPrice: Math.round((priceSum?.sum ?? 0) * 100) / 100,
      distinctUploaders: distinctUsers?.count ?? 0,
    });
  } catch (error) {
    console.error("Error fetching stats:", error);
    return NextResponse.json(
      { error: "Failed to fetch stats" },
      { status: 500 }
    );
  }
}
