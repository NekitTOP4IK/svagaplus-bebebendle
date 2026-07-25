import { and, asc, desc, eq, ilike, or, sql, type SQL } from "drizzle-orm";
import {
  dailyScrandles,
  db,
  moderationAuditLog,
  scrans,
  users,
} from "@/db/schema";
import {
  computeQueueScore,
  getAuthorKey,
  interleaveQueue,
  type ScranWithMeta,
} from "@/lib/moderation-queue";

type AdminScranList = Readonly<{
  scrans: readonly ScranWithMeta[];
  total: number;
  page: number;
  limit: number;
  subscriberCount?: number;
  regularCount?: number;
  view: "list" | "rejected" | "queue";
}>;

function parsePagination(params: URLSearchParams): Readonly<{
  page: number;
  limit: number;
}> {
  const page = Math.max(1, Number.parseInt(params.get("page") ?? "1", 10) || 1);
  const limit = Math.min(
    50,
    Math.max(1, Number.parseInt(params.get("limit") ?? "10", 10) || 10),
  );
  return { page, limit };
}

function applyQueueFilters(
  items: ScranWithMeta[],
  query: string,
  authorTelegramId: string,
): ScranWithMeta[] {
  const lowerQuery = query.toLowerCase();
  return items.filter((item) => {
    const matchesQuery =
      !query ||
      item.name.toLowerCase().includes(lowerQuery) ||
      (item.description ?? "").toLowerCase().includes(lowerQuery) ||
      (item.telegramId ?? "").includes(query) ||
      (item.authorUsername ?? "").toLowerCase().includes(lowerQuery);
    const matchesAuthor =
      !authorTelegramId || item.telegramId === authorTelegramId;
    return matchesQuery && matchesAuthor;
  });
}

async function loadQueue(
  params: URLSearchParams,
  page: number,
  limit: number,
): Promise<AdminScranList> {
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
    .where(and(eq(scrans.approved, false), eq(scrans.rejected, false)));

  const query = (params.get("q") ?? "").trim().slice(0, 100);
  const authorTelegramId = (params.get("telegram_id") ?? "").trim();
  let pending = rows.map(({ scran, user }) => ({
    ...scran,
    authorUsername: user?.telegramUsername ?? null,
    authorDisplayName: user?.displayName ?? null,
    isSubscriberAtSubmit: scran.isSubscriberAtSubmit,
    submittedByUserId: scran.submittedByUserId,
    telegramId: scran.telegramId,
  })) as ScranWithMeta[];

  pending = applyQueueFilters(pending, query, authorTelegramId);

  const pendingCounts = new Map<string, number>();
  for (const item of pending) {
    const key = getAuthorKey(item);
    pendingCounts.set(key, (pendingCounts.get(key) ?? 0) + 1);
  }
  for (const item of pending) {
    item.pendingCount = pendingCounts.get(getAuthorKey(item)) ?? 1;
  }

  const maxId = pending.length
    ? Math.max(...pending.map((item) => item.id))
    : 0;
  const scored = pending.map((item) => ({
    item,
    score: computeQueueScore(
      item,
      item.pendingCount ?? 1,
      Math.max(0, (maxId - item.id) / 80),
    ),
  }));
  const subscribers = scored
    .filter(({ item }) => item.isSubscriberAtSubmit === true)
    .sort((a, b) => b.score - a.score)
    .map(({ item }) => item);
  const regular = scored
    .filter(({ item }) => item.isSubscriberAtSubmit !== true)
    .sort((a, b) => b.score - a.score)
    .map(({ item }) => item);
  const ordered = params.get("subscriber_only") === "true"
    ? subscribers
    : interleaveQueue(subscribers, regular);
  const offset = (page - 1) * limit;

  return {
    scrans: ordered.slice(offset, offset + limit),
    total: ordered.length,
    page,
    limit,
    subscriberCount: subscribers.length,
    regularCount: regular.length,
    view: "queue",
  };
}

function buildListFilters(params: URLSearchParams): SQL[] {
  const filters: SQL[] = [];
  const status = params.get("status") ?? "all";
  const view = params.get("view") ?? "list";
  const authorTelegramId = (params.get("telegram_id") ?? "").trim();
  const query = (params.get("q") ?? "").trim().slice(0, 100);

  if (status === "pending") {
    filters.push(eq(scrans.approved, false), eq(scrans.rejected, false));
  } else if (status === "approved") {
    filters.push(eq(scrans.approved, true));
  } else if (status === "rejected" || view === "rejected") {
    filters.push(eq(scrans.rejected, true));
  }
  if (authorTelegramId) filters.push(eq(scrans.telegramId, authorTelegramId));
  if (query) {
    const pattern = `%${query}%`;
    filters.push(
      or(
        ilike(scrans.name, pattern),
        ilike(scrans.description, pattern),
        ilike(scrans.telegramId, pattern),
      )!,
    );
  }
  return filters;
}

export async function listAdminScrans(query: string): Promise<AdminScranList> {
  const params = new URLSearchParams(query);
  const { page, limit } = parsePagination(params);
  if (params.get("view") === "queue") return loadQueue(params, page, limit);

  const filters = buildListFilters(params);
  const where = filters.length > 0 ? and(...filters) : undefined;
  const sortField = params.get("sort") ?? "id";
  const order = params.get("order") === "asc" ? asc : desc;
  const orderBy = sortField === "name"
    ? order(scrans.name)
    : sortField === "price"
      ? order(scrans.price)
      : sortField === "numberOfLikes"
        ? order(scrans.numberOfLikes)
        : sortField === "numberOfDislikes"
          ? order(scrans.numberOfDislikes)
          : sortField === "approved"
            ? order(scrans.approved)
            : order(scrans.id);

  const [countRow] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(scrans)
    .where(where);
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
    .where(where)
    .orderBy(orderBy)
    .limit(limit)
    .offset((page - 1) * limit);

  return {
    scrans: rows.map(({ scran, user }) => ({
      ...scran,
      authorUsername: user?.telegramUsername ?? null,
      authorDisplayName: user?.displayName ?? null,
    })) as ScranWithMeta[],
    total: countRow?.count ?? 0,
    page,
    limit,
    view: params.get("view") === "rejected" ? "rejected" : "list",
  };
}

export async function getAdminScran(
  id: number,
): Promise<Record<string, unknown> | null> {
  const rows = await db
    .select({
      scran: scrans,
      author: {
        id: users.id,
        telegramUsername: users.telegramUsername,
        displayName: users.displayName,
        telegramPhotoUrl: users.telegramPhotoUrl,
        role: users.role,
        isSubscriber: users.isSubscriber,
      },
    })
    .from(scrans)
    .leftJoin(users, eq(scrans.submittedByUserId, users.id))
    .where(eq(scrans.id, id))
    .limit(1);
  if (!rows[0]) return null;

  const daily = await db
    .select({
      date: dailyScrandles.date,
      roundNumber: dailyScrandles.roundNumber,
      scranAId: dailyScrandles.scranAId,
      scranBId: dailyScrandles.scranBId,
    })
    .from(dailyScrandles)
    .where(or(eq(dailyScrandles.scranAId, id), eq(dailyScrandles.scranBId, id)))
    .orderBy(desc(dailyScrandles.date))
    .limit(50);
  const audit = await db
    .select({
      id: moderationAuditLog.id,
      action: moderationAuditLog.action,
      details: moderationAuditLog.details,
      createdAt: moderationAuditLog.createdAt,
      actorUsername: users.telegramUsername,
      actorDisplayName: users.displayName,
    })
    .from(moderationAuditLog)
    .leftJoin(users, eq(moderationAuditLog.actorUserId, users.id))
    .where(eq(moderationAuditLog.scranId, id))
    .orderBy(desc(moderationAuditLog.createdAt))
    .limit(40);

  return {
    scran: rows[0].scran,
    author: rows[0].author?.id != null ? rows[0].author : null,
    daily: daily.map((item) => ({
      date: item.date,
      roundNumber: item.roundNumber,
      side: item.scranAId === id ? "A" : "B",
    })),
    audit,
  };
}
