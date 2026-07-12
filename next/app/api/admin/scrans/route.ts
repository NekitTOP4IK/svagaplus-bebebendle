import { NextResponse } from "next/server";
import { db, scrans } from "@/db/schema";
import { asc, desc } from "drizzle-orm";
import { getCurrentUser } from "@/lib/auth-server";

export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user || (user.role !== "moderator" && user.role !== "admin")) {
    return NextResponse.json(
      { error: "Unauthorized" },
      { status: 401 }
    );
  }

  try {
    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get("page") || "1");
    const limit = parseInt(searchParams.get("limit") || "10");
    const sortField = searchParams.get("sort") || "id";
    const sortOrder = searchParams.get("order") || "desc";

    const offset = (page - 1) * limit;

    // Build order by clause
    let orderBy;
    const orderFn = sortOrder === "asc" ? asc : desc;
    
    switch (sortField) {
      case "name":
        orderBy = orderFn(scrans.name);
        break;
      case "price":
        orderBy = orderFn(scrans.price);
        break;
      case "numberOfLikes":
        orderBy = orderFn(scrans.numberOfLikes);
        break;
      case "numberOfDislikes":
        orderBy = orderFn(scrans.numberOfDislikes);
        break;
      case "approved":
        orderBy = orderFn(scrans.approved);
        break;
      default:
        orderBy = orderFn(scrans.id);
    }

    // Get total count
    const allScrans = await db.select().from(scrans);
    const total = allScrans.length;

    // Get paginated results
    const paginatedScrans = await db
      .select()
      .from(scrans)
      .orderBy(orderBy)
      .limit(limit)
      .offset(offset);

    return NextResponse.json({
      scrans: paginatedScrans,
      total,
      page,
      limit,
    });
  } catch (error) {
    console.error("Error fetching scrans:", error);
    return NextResponse.json(
      { error: "Failed to fetch scrans" },
      { status: 500 }
    );
  }
}
