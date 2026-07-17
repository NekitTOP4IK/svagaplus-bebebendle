import { NextResponse } from "next/server";
import { db, scrans, users } from "@/db/schema";
import { and, asc, desc, eq, ilike, or, sql, type SQL } from "drizzle-orm";
import { getCurrentUser } from "@/lib/auth-server";
import {
  computeQueueScore,
  interleaveQueue,
  getAuthorKey,
  type ScranWithMeta,
} from "@/lib/moderation-queue";

export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user || !["moderator", "admin"].includes(user.role)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get("page") || "1", 10);
    const limit = Math.min(parseInt(searchParams.get("limit") || "10", 10), 50);
    const sortField = searchParams.get("sort") || "id";
    const sortOrder = searchParams.get("order") || "desc";
    const view = searchParams.get("view") || "list";
    const subscriberOnly = searchParams.get("subscriber_only") === "true";
    const q = (searchParams.get("q") || "").trim().slice(0, 100);
    const status = searchParams.get("status") || "all"; // all|pending|approved|rejected
    const authorTg = (searchParams.get("telegram_id") || "").trim();

    const offset = (page - 1) * limit;

    if (view === "queue") {
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

      let allPending: ScranWithMeta[] = pendingRows.map((row) => {
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

      if (q) {
        const lower = q.toLowerCase();
        allPending = allPending.filter(
          (p) =>
            p.name.toLowerCase().includes(lower) ||
            (p.description ?? "").toLowerCase().includes(lower) ||
            (p.telegramId ?? "").includes(q) ||
            (p.authorUsername ?? "").toLowerCase().includes(lower),
        );
      }
      if (authorTg) {
        allPending = allPending.filter((p) => p.telegramId === authorTg);
      }

      const countMap = new Map<string, number>();
      for (const p of allPending) {
        const key = getAuthorKey(p);
        countMap.set(key, (countMap.get(key) || 0) + 1);
      }
      for (const p of allPending) {
        p.pendingCount = countMap.get(getAuthorKey(p)) || 1;
      }

      const maxId = allPending.length > 0 ? Math.max(...allPending.map((p) => p.id)) : 0;

      type ScranWithScore = ScranWithMeta & { _score: number };
      const scored: ScranWithScore[] = allPending.map((p) => {
        const ageUnits = maxId - p.id;
        const hoursWaiting = Math.max(0, ageUnits / 80);
        const score = computeQueueScore(p, p.pendingCount || 1, hoursWaiting);
        return { ...p, _score: score };
      });

      const subscriberList = scored.filter((p) => p.isSubscriberAtSubmit === true);
      const regularList = scored.filter((p) => p.isSubscriberAtSubmit !== true);

      subscriberList.sort((a, b) => b._score - a._score);
      regularList.sort((a, b) => b._score - a._score);

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

      const pageItems = ordered.slice(offset, offset + limit);

      return NextResponse.json({
        scrans: pageItems,
        total: ordered.length,
        page,
        limit,
        subscriberCount: subscriberList.length,
        regularCount: regularList.length,
        view: "queue",
      });
    }

    // === LIST / REJECTED MODE ===
    const filters: SQL[] = [];
    if (status === "pending") {
      filters.push(eq(scrans.approved, false), eq(scrans.rejected, false));
    } else if (status === "approved") {
      filters.push(eq(scrans.approved, true));
    } else if (status === "rejected" || view === "rejected") {
      filters.push(eq(scrans.rejected, true));
    }
    if (authorTg) {
      filters.push(eq(scrans.telegramId, authorTg));
    }
    if (q) {
      const pattern = `%${q}%`;
      filters.push(
        or(
          ilike(scrans.name, pattern),
          ilike(scrans.description, pattern),
          ilike(scrans.telegramId, pattern),
        )!,
      );
    }

    const whereClause = filters.length > 0 ? and(...filters) : undefined;

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

    const countRow = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(scrans)
      .where(whereClause);
    const total = countRow[0]?.count ?? 0;

    const rows = await db
      .select({
        scran: scrans,
        user: {
          telegramUsername: users.telegramUsername,
          displayName: users.displayName,
        },
      })
      .from(scrans)
      .leftJoin(users, eq(scrans.submittedByUserId, users.id))
      .where(whereClause)
      .orderBy(orderBy)
      .limit(limit)
      .offset(offset);

    const paginated = rows.map((r) => ({
      ...r.scran,
      authorUsername: r.user?.telegramUsername ?? null,
      authorDisplayName: r.user?.displayName ?? null,
    }));

    return NextResponse.json({
      scrans: paginated,
      total,
      page,
      limit,
      view: view === "rejected" ? "rejected" : "list",
    });
  } catch (error) {
    console.error("Error fetching scrans:", error);
    return NextResponse.json({ error: "Failed to fetch scrans" }, { status: 500 });
  }
}
