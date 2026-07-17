import { NextResponse } from "next/server";
import { db, scrans, users } from "@/db/schema";
import { and, asc, desc, eq } from "drizzle-orm";
import { getCurrentUser } from "@/lib/auth-server";
import {
  computeQueueScore,
  interleaveQueue,
  getAuthorKey,
  type ScranWithMeta,
} from "@/lib/moderation-queue";

export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user || !['moderator', 'admin'].includes(user.role)) {
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
    const view = searchParams.get("view") || "list";
    const subscriberOnly = searchParams.get("subscriber_only") === "true";

    const offset = (page - 1) * limit;

    if (view === "queue") {
      // === QUEUE MODE: pending only, score + 3:1 interleave ===
      // Fetch ALL pending (reasonable for in-memory reorder; per design note)
      const pendingRows = await db
        .select({
          scran: scrans,
          user: {
            id: users.id,
            telegramUsername: users.telegramUsername,
            displayName: users.displayName,
          },
        })
        .from(scrans)
        .leftJoin(users, eq(scrans.submittedByUserId, users.id))
        .where(and(eq(scrans.approved, false), eq(scrans.rejected, false)));

      // Enrich with author info
      const allPending: ScranWithMeta[] = pendingRows.map((row) => {
        const s = row.scran;
        const u = row.user;
        return {
          ...s,
          authorUsername: u?.telegramUsername ?? null,
          authorDisplayName: u?.displayName ?? null,
          isSubscriberAtSubmit: s.isSubscriberAtSubmit,
          submittedByUserId: s.submittedByUserId,
          telegramId: s.telegramId,
        } as ScranWithMeta;
      });

      // Compute pending counts per author (for penalty + UI display)
      const countMap = new Map<string, number>();
      for (const p of allPending) {
        const key = getAuthorKey(p);
        countMap.set(key, (countMap.get(key) || 0) + 1);
      }
      for (const p of allPending) {
        p.pendingCount = countMap.get(getAuthorKey(p)) || 1;
      }

      // Proxy "hours waiting" from id (no created_at on scrans table).
      // Older (smaller id) waited longer. Scale chosen for meaningful aging.
      const maxId = allPending.length > 0 ? Math.max(...allPending.map((p) => p.id)) : 0;

      // Attach score for sorting within buckets
      type ScranWithScore = ScranWithMeta & { _score: number };
      const scored: ScranWithScore[] = allPending.map((p) => {
        const ageUnits = maxId - p.id;
        const hoursWaiting = Math.max(0, ageUnits / 80);
        const score = computeQueueScore(p, p.pendingCount || 1, hoursWaiting);
        return { ...p, _score: score };
      });

      // Split
      const subscriberList = scored.filter((p) => p.isSubscriberAtSubmit === true);
      const regularList = scored.filter((p) => p.isSubscriberAtSubmit !== true);

      // Sort each bucket by score desc (higher = higher priority)
      subscriberList.sort((a, b) => b._score - a._score);
      regularList.sort((a, b) => b._score - a._score);

      // Interleave or filter-only (strip internal _score before response)
      const stripScore = (item: ScranWithScore): ScranWithMeta => {
        const { _score, ...rest } = item;
        void _score;
        return rest;
      };
      let ordered: ScranWithMeta[];
      if (subscriberOnly) {
        ordered = subscriberList.map(stripScore);
      } else {
        ordered = interleaveQueue(subscriberList, regularList).map(stripScore);
      }

      // Paginate the fair ordered list
      const pageItems = ordered.slice(offset, offset + limit);
      const total = ordered.length;
      const subscriberCount = subscriberList.length;
      const regularCount = regularList.length;

      return NextResponse.json({
        scrans: pageItems,
        total,
        page,
        limit,
        subscriberCount,
        regularCount,
        view: "queue",
      });
    }

    // === DEFAULT / LIST MODE: original behavior (all scrans, sortable) ===
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

    // Get total count (note: inefficient full scan kept for compatibility)
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
