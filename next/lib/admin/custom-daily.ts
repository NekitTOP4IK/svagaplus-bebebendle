import {
  and,
  asc,
  desc,
  eq,
  ilike,
  ne,
  or,
  sql,
} from "drizzle-orm";
import {
  dailyCustomEventEntries,
  dailyCustomEvents,
  dailyScrandles,
  dailyUserResults,
  db,
  scrandleVotes,
  scrans,
} from "@/db/schema";

export const CUSTOM_DAILY_ENTRY_COUNT = 20;
export const CUSTOM_DAILY_NAME_MAX_LENGTH = 120;
export const CUSTOM_DAILY_CATALOG_PAGE_SIZE = 12;
export const CUSTOM_DAILY_CATALOG_MAX_PAGE = 10_000;
export const CUSTOM_DAILY_CATALOG_QUERY_MAX_LENGTH = 100;

export type CustomDailyStatus = "draft" | "published" | "cancelled";
export type CustomDailyBadgeStyle = "violet" | "gold" | "neon" | "rainbow";

export type CustomDailyInput = Readonly<{
  name: string;
  targetDate: string;
  notifyAuthors: boolean;
  showEventBadge: boolean;
  showOnHome: boolean;
  badgeStyle: CustomDailyBadgeStyle;
  scranIds: readonly number[];
}>;

export type CustomDailyScran = Readonly<{
  id: number;
  name: string;
  imageUrl: string;
  price: number;
}>;

export type CustomDailyScranCatalogSort = "newest" | "name" | "price_asc" | "price_desc";
export type CustomDailyCatalogSort = CustomDailyScranCatalogSort;

export type CustomDailyScranCatalogInput = Readonly<{
  query: string;
  page: number;
  sort: CustomDailyScranCatalogSort;
}>;

export type CustomDailyScranCatalogPage = Readonly<{
  items: readonly CustomDailyScran[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}>;

export type CustomDailyEntry = CustomDailyScran & Readonly<{
  position: number;
}>;

export type CustomDailySummary = Readonly<{
  id: number;
  name: string;
  targetDate: string;
  status: CustomDailyStatus;
  notifyAuthors: boolean;
  showEventBadge: boolean;
  showOnHome: boolean;
  badgeStyle: CustomDailyBadgeStyle;
  entryCount: number;
  createdAt: Date;
  updatedAt: Date;
  publishedAt: Date | null;
}>;

export type CustomDailyDetail = CustomDailySummary & Readonly<{
  createdByUserId: number | null;
  entries: readonly CustomDailyEntry[];
}>;

export type CustomDailyErrorCode =
  | "invalid_input"
  | "not_found"
  | "date_conflict"
  | "invalid_status"
  | "invalid_scrans"
  | "participation_exists";

export type CustomDailyDomainResult<T> =
  | Readonly<{ ok: true; data: T }>
  | Readonly<{ ok: false; code: CustomDailyErrorCode; message: string }>;

type ValidatedCustomDailyInput = Readonly<{
  ok: true;
  data: CustomDailyInput;
}>;

function invalidInput(message: string): CustomDailyDomainResult<never> {
  return { ok: false, code: "invalid_input", message };
}

/** Strictly validates an MSK calendar key without timezone-dependent parsing. */
export function isCustomDailyDate(value: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  return parsed.getUTCFullYear() === year
    && parsed.getUTCMonth() === month - 1
    && parsed.getUTCDate() === day;
}

export function validateCustomDailyInput(input: Readonly<{
  name: unknown;
  targetDate: unknown;
  notifyAuthors: unknown;
  showEventBadge?: unknown;
  showOnHome?: unknown;
  badgeStyle?: unknown;
  scranIds: unknown;
}>): ValidatedCustomDailyInput | CustomDailyDomainResult<never> {
  if (typeof input.name !== "string") return invalidInput("Введите название события.");
  const name = input.name.trim();
  if (!name) return invalidInput("Введите название события.");
  if (name.length > CUSTOM_DAILY_NAME_MAX_LENGTH) {
    return invalidInput(`Название должно быть не длиннее ${CUSTOM_DAILY_NAME_MAX_LENGTH} символов.`);
  }
  if (typeof input.targetDate !== "string" || !isCustomDailyDate(input.targetDate)) {
    return invalidInput("Укажите корректную дату в формате YYYY-MM-DD.");
  }
  if (typeof input.notifyAuthors !== "boolean") {
    return invalidInput("Некорректная настройка уведомлений.");
  }
  const showEventBadge = input.showEventBadge ?? true;
  const showOnHome = input.showOnHome ?? false;
  const badgeStyle = input.badgeStyle ?? "violet";
  if (typeof showEventBadge !== "boolean" || typeof showOnHome !== "boolean") {
    return invalidInput("Некорректные настройки отображения события.");
  }
  if (badgeStyle !== "violet" && badgeStyle !== "gold" && badgeStyle !== "neon" && badgeStyle !== "rainbow") {
    return invalidInput("Некорректный стиль плашки события.");
  }
  if (!Array.isArray(input.scranIds)) return invalidInput("Некорректный список блюд.");
  const scranIds = input.scranIds.map(Number);
  if (scranIds.some((id) => !Number.isInteger(id) || id < 1)) {
    return invalidInput("Список блюд содержит некорректный ID.");
  }
  if (new Set(scranIds).size !== scranIds.length) {
    return invalidInput("Одно блюдо нельзя добавить в событие дважды.");
  }
  if (scranIds.length > CUSTOM_DAILY_ENTRY_COUNT) {
    return invalidInput(`В событии может быть не больше ${CUSTOM_DAILY_ENTRY_COUNT} блюд.`);
  }
  return {
    ok: true,
    data: {
      name,
      targetDate: input.targetDate,
      notifyAuthors: input.notifyAuthors,
      showEventBadge,
      showOnHome,
      badgeStyle,
      scranIds,
    },
  };
}

export function pairCustomDailyScranIds(scranIds: readonly number[]): ReadonlyArray<Readonly<{
  roundNumber: number;
  scranAId: number;
  scranBId: number;
}>> {
  if (scranIds.length !== CUSTOM_DAILY_ENTRY_COUNT || new Set(scranIds).size !== scranIds.length) {
    throw new Error(`Custom Daily requires exactly ${CUSTOM_DAILY_ENTRY_COUNT} unique scrans.`);
  }
  return Array.from({ length: CUSTOM_DAILY_ENTRY_COUNT / 2 }, (_, index) => ({
    roundNumber: index + 1,
    scranAId: scranIds[index * 2]!,
    scranBId: scranIds[index * 2 + 1]!,
  }));
}

export function validateCustomDailyPublishEntries(entries: readonly Readonly<{
  id: number;
  approved: boolean;
  rejected: boolean;
}>[]): CustomDailyDomainResult<readonly number[]> {
  if (entries.length !== CUSTOM_DAILY_ENTRY_COUNT || new Set(entries.map((entry) => entry.id)).size !== entries.length) {
    return { ok: false, code: "invalid_scrans", message: `Для публикации нужно ровно ${CUSTOM_DAILY_ENTRY_COUNT} уникальных блюд.` };
  }
  if (entries.some((entry) => !entry.approved || entry.rejected)) {
    return { ok: false, code: "invalid_scrans", message: "Все блюда должны быть одобрены и не отклонены." };
  }
  return { ok: true, data: entries.map((entry) => entry.id) };
}

function toSummary(row: typeof dailyCustomEvents.$inferSelect, entryCount: number): CustomDailySummary {
  return {
    id: row.id,
    name: row.name,
    targetDate: row.targetDate,
    status: row.status,
    notifyAuthors: row.notifyAuthors,
    showEventBadge: row.showEventBadge,
    showOnHome: row.showOnHome,
    badgeStyle: row.badgeStyle,
    entryCount,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    publishedAt: row.publishedAt,
  };
}

export async function listCustomDailyEvents(): Promise<CustomDailySummary[]> {
  const rows = await db
    .select({
      event: dailyCustomEvents,
      entryCount: sql<number>`count(${dailyCustomEventEntries.scranId})::int`,
    })
    .from(dailyCustomEvents)
    .leftJoin(dailyCustomEventEntries, eq(dailyCustomEventEntries.eventId, dailyCustomEvents.id))
    .groupBy(dailyCustomEvents.id)
    .orderBy(desc(dailyCustomEvents.targetDate), desc(dailyCustomEvents.id));
  return rows.map(({ event, entryCount }) => toSummary(event, entryCount));
}

export async function getCustomDailyEvent(id: number): Promise<CustomDailyDetail | null> {
  const [event] = await db.select().from(dailyCustomEvents).where(eq(dailyCustomEvents.id, id)).limit(1);
  if (!event) return null;
  const entries = await db
    .select({
      position: dailyCustomEventEntries.position,
      id: scrans.id,
      name: scrans.name,
      imageUrl: scrans.imageUrl,
      price: scrans.price,
    })
    .from(dailyCustomEventEntries)
    .innerJoin(scrans, eq(scrans.id, dailyCustomEventEntries.scranId))
    .where(eq(dailyCustomEventEntries.eventId, id))
    .orderBy(asc(dailyCustomEventEntries.position));
  return { ...toSummary(event, entries.length), createdByUserId: event.createdByUserId, entries };
}

export function parseCustomDailyScranSearch(query: string): Readonly<{
  text: string;
  numericId: number | null;
}> {
  const text = query.trim().slice(0, 100);
  const parsed = /^\d+$/.test(text) ? Number(text) : null;
  return {
    text,
    numericId: parsed !== null && Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null,
  };
}

export function validateCustomDailyScranCatalogInput(
  input: unknown,
): CustomDailyDomainResult<CustomDailyScranCatalogInput> {
  if (typeof input !== "object" || input === null) {
    return invalidInput("Некорректные параметры каталога блюд.");
  }
  const { query, page, sort } = input as Record<string, unknown>;
  if (typeof query !== "string" || query.length > CUSTOM_DAILY_CATALOG_QUERY_MAX_LENGTH) {
    return invalidInput(`Поисковый запрос должен быть не длиннее ${CUSTOM_DAILY_CATALOG_QUERY_MAX_LENGTH} символов.`);
  }
  if (!Number.isInteger(page) || (page as number) < 1 || (page as number) > CUSTOM_DAILY_CATALOG_MAX_PAGE) {
    return invalidInput(`Номер страницы должен быть от 1 до ${CUSTOM_DAILY_CATALOG_MAX_PAGE}.`);
  }
  if (sort !== "newest" && sort !== "name" && sort !== "price_asc" && sort !== "price_desc") {
    return invalidInput("Некорректная сортировка каталога блюд.");
  }
  return {
    ok: true,
    data: { query: query.trim(), page: page as number, sort },
  };
}

export async function listApprovedCustomDailyScrans(
  input: CustomDailyScranCatalogInput,
): Promise<CustomDailyScranCatalogPage> {
  const { text, numericId } = parseCustomDailyScranSearch(input.query);
  const search = text
    ? or(
        ilike(scrans.name, `%${text}%`),
        numericId !== null ? eq(scrans.id, numericId) : undefined,
      )
    : undefined;
  const where = and(eq(scrans.approved, true), eq(scrans.rejected, false), search);
  const [{ total }] = await db
    .select({ total: sql<number>`count(*)::int` })
    .from(scrans)
    .where(where);
  const totalPages = Math.max(1, Math.ceil((total ?? 0) / CUSTOM_DAILY_CATALOG_PAGE_SIZE));
  const page = Math.min(input.page, totalPages);
  const orderBy = input.sort === "newest"
    ? [desc(scrans.id)]
    : input.sort === "name"
      ? [asc(scrans.name), asc(scrans.id)]
      : input.sort === "price_asc"
        ? [asc(scrans.price), asc(scrans.id)]
        : [desc(scrans.price), asc(scrans.id)];
  const items = await db
    .select({ id: scrans.id, name: scrans.name, imageUrl: scrans.imageUrl, price: scrans.price })
    .from(scrans)
    .where(where)
    .orderBy(...orderBy)
    .limit(CUSTOM_DAILY_CATALOG_PAGE_SIZE)
    .offset((page - 1) * CUSTOM_DAILY_CATALOG_PAGE_SIZE);
  return {
    items,
    page,
    pageSize: CUSTOM_DAILY_CATALOG_PAGE_SIZE,
    total: total ?? 0,
    totalPages,
  };
}

async function hasActiveDateConflict(
  targetDate: string,
  exceptId?: number,
): Promise<boolean> {
  const filters = [eq(dailyCustomEvents.targetDate, targetDate), ne(dailyCustomEvents.status, "cancelled")];
  if (exceptId !== undefined) filters.push(ne(dailyCustomEvents.id, exceptId));
  const existing = await db.select({ id: dailyCustomEvents.id }).from(dailyCustomEvents)
    .where(and(...filters)).limit(1);
  return existing.length > 0;
}

export async function createCustomDailyEvent(
  input: CustomDailyInput,
  actorUserId: number,
): Promise<CustomDailyDomainResult<CustomDailyDetail>> {
  const validated = validateCustomDailyInput(input);
  if (!validated.ok) return validated;
  if (await hasActiveDateConflict(validated.data.targetDate)) {
    return { ok: false, code: "date_conflict", message: "На эту дату уже есть активное событие." };
  }
  const now = new Date();
  try {
    const id = await db.transaction(async (tx) => {
      const [event] = await tx.insert(dailyCustomEvents).values({
        name: validated.data.name,
        targetDate: validated.data.targetDate,
        status: "draft",
        notifyAuthors: validated.data.notifyAuthors,
        showEventBadge: validated.data.showEventBadge,
        showOnHome: validated.data.showOnHome,
        badgeStyle: validated.data.badgeStyle,
        createdByUserId: actorUserId,
        createdAt: now,
        updatedAt: now,
      }).returning({ id: dailyCustomEvents.id });
      if (!event) throw new Error("Custom Daily insert returned no row.");
      if (validated.data.scranIds.length > 0) {
        await tx.insert(dailyCustomEventEntries).values(validated.data.scranIds.map((scranId, index) => ({
          eventId: event.id,
          scranId,
          position: index + 1,
        })));
      }
      return event.id;
    });
    const event = await getCustomDailyEvent(id);
    if (!event) throw new Error("Created Custom Daily could not be reloaded.");
    return { ok: true, data: event };
  } catch (error) {
    if (isUniqueViolation(error)) {
      return { ok: false, code: "date_conflict", message: "На эту дату уже есть активное событие." };
    }
    throw error;
  }
}

export async function updateCustomDailyEvent(
  id: number,
  input: CustomDailyInput,
): Promise<CustomDailyDomainResult<CustomDailyDetail>> {
  const validated = validateCustomDailyInput(input);
  if (!validated.ok) return validated;
  const [current] = await db.select().from(dailyCustomEvents).where(eq(dailyCustomEvents.id, id)).limit(1);
  if (!current) return { ok: false, code: "not_found", message: "Событие не найдено." };
  if (current.status !== "draft") {
    return { ok: false, code: "invalid_status", message: "Можно редактировать только черновик." };
  }
  if (await hasActiveDateConflict(validated.data.targetDate, id)) {
    return { ok: false, code: "date_conflict", message: "На эту дату уже есть активное событие." };
  }
  try {
    await db.transaction(async (tx) => {
      const updated = await tx.update(dailyCustomEvents).set({
        name: validated.data.name,
        targetDate: validated.data.targetDate,
        notifyAuthors: validated.data.notifyAuthors,
        showEventBadge: validated.data.showEventBadge,
        showOnHome: validated.data.showOnHome,
        badgeStyle: validated.data.badgeStyle,
        updatedAt: new Date(),
      }).where(and(eq(dailyCustomEvents.id, id), eq(dailyCustomEvents.status, "draft")))
        .returning({ id: dailyCustomEvents.id });
      if (!updated[0]) throw new CustomDailyStateChangedError();
      await tx.delete(dailyCustomEventEntries).where(eq(dailyCustomEventEntries.eventId, id));
      if (validated.data.scranIds.length > 0) {
        await tx.insert(dailyCustomEventEntries).values(validated.data.scranIds.map((scranId, index) => ({
          eventId: id,
          scranId,
          position: index + 1,
        })));
      }
    });
    const event = await getCustomDailyEvent(id);
    if (!event) throw new Error("Updated Custom Daily could not be reloaded.");
    return { ok: true, data: event };
  } catch (error) {
    if (error instanceof CustomDailyStateChangedError) {
      return { ok: false, code: "invalid_status", message: "Состояние события изменилось. Обновите страницу." };
    }
    if (isUniqueViolation(error)) {
      return { ok: false, code: "date_conflict", message: "На эту дату уже есть активное событие." };
    }
    throw error;
  }
}

export type PublishedCustomDaily = Readonly<{
  event: CustomDailyDetail;
  notificationScrans: readonly Readonly<{ id: number; name: string; telegramId: string | null }>[];
}>;

export async function publishCustomDailyEvent(
  id: number,
): Promise<CustomDailyDomainResult<PublishedCustomDaily>> {
  let result: CustomDailyDomainResult<readonly {
    id: number; name: string; telegramId: string | null;
  }[]>;
  try {
    result = await db.transaction(async (tx): Promise<CustomDailyDomainResult<readonly {
      id: number; name: string; telegramId: string | null;
    }[]>> => {
    await tx.execute(sql`select ${dailyCustomEvents.id} from ${dailyCustomEvents} where ${dailyCustomEvents.id} = ${id} for update`);
    const [event] = await tx.select().from(dailyCustomEvents).where(eq(dailyCustomEvents.id, id)).limit(1);
    if (!event) return { ok: false, code: "not_found", message: "Событие не найдено." };
    if (event.status !== "draft") {
      return { ok: false, code: "invalid_status", message: "Опубликовать можно только черновик." };
    }
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${event.targetDate}))`);
    const entries = await tx.select({
      position: dailyCustomEventEntries.position,
      id: scrans.id,
      name: scrans.name,
      telegramId: scrans.telegramId,
      approved: scrans.approved,
      rejected: scrans.rejected,
    }).from(dailyCustomEventEntries)
      .innerJoin(scrans, eq(scrans.id, dailyCustomEventEntries.scranId))
      .where(eq(dailyCustomEventEntries.eventId, id))
      .orderBy(asc(dailyCustomEventEntries.position));
    const validEntries = validateCustomDailyPublishEntries(entries);
    if (!validEntries.ok) return validEntries;
    const occupied = await tx.select({ id: dailyScrandles.id }).from(dailyScrandles)
      .where(eq(dailyScrandles.date, event.targetDate)).limit(1);
    if (occupied.length > 0) {
      return { ok: false, code: "date_conflict", message: "Daily на эту дату уже создан." };
    }
    const rounds = pairCustomDailyScranIds(validEntries.data);
    const now = new Date();
    await tx.insert(dailyScrandles).values(rounds.map((round) => ({
      date: event.targetDate,
      ...round,
      source: "custom" as const,
      createdAt: now,
    })));
    await tx.update(dailyCustomEvents).set({ status: "published", publishedAt: now, updatedAt: now })
      .where(and(eq(dailyCustomEvents.id, id), eq(dailyCustomEvents.status, "draft")));
    return { ok: true, data: entries.map(({ id: scranId, name, telegramId }) => ({ id: scranId, name, telegramId })) };
    });
  } catch (error) {
    if (isUniqueViolation(error)) {
      return { ok: false, code: "date_conflict", message: "Daily на эту дату уже создан." };
    }
    throw error;
  }
  if (!result.ok) return result;
  const event = await getCustomDailyEvent(id);
  if (!event) throw new Error("Published Custom Daily could not be reloaded.");
  return { ok: true, data: { event, notificationScrans: result.data } };
}

export async function cancelCustomDailyEvent(
  id: number,
): Promise<CustomDailyDomainResult<CustomDailyDetail>> {
  const result = await db.transaction(async (tx): Promise<CustomDailyDomainResult<null>> => {
    await tx.execute(sql`select ${dailyCustomEvents.id} from ${dailyCustomEvents} where ${dailyCustomEvents.id} = ${id} for update`);
    const [event] = await tx.select().from(dailyCustomEvents).where(eq(dailyCustomEvents.id, id)).limit(1);
    if (!event) return { ok: false, code: "not_found", message: "Событие не найдено." };
    if (event.status === "cancelled") {
      return { ok: false, code: "invalid_status", message: "Событие уже отменено." };
    }
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${event.targetDate}))`);
    if (event.status === "published") {
      const [vote] = await tx.select({ id: scrandleVotes.id }).from(scrandleVotes)
        .innerJoin(dailyScrandles, eq(dailyScrandles.id, scrandleVotes.dailyScrandleId))
        .where(and(eq(dailyScrandles.date, event.targetDate), eq(dailyScrandles.source, "custom"))).limit(1);
      const [resultRow] = await tx.select({ id: dailyUserResults.id }).from(dailyUserResults)
        .where(eq(dailyUserResults.date, event.targetDate)).limit(1);
      if (vote || resultRow) {
        return { ok: false, code: "participation_exists", message: "Событие уже проходили — отмена заблокирована." };
      }
      await tx.delete(dailyScrandles).where(and(
        eq(dailyScrandles.date, event.targetDate),
        eq(dailyScrandles.source, "custom"),
      ));
    }
    await tx.update(dailyCustomEvents).set({ status: "cancelled", updatedAt: new Date() })
      .where(eq(dailyCustomEvents.id, id));
    return { ok: true, data: null };
  });
  if (!result.ok) return result;
  const event = await getCustomDailyEvent(id);
  if (!event) throw new Error("Cancelled Custom Daily could not be reloaded.");
  return { ok: true, data: event };
}

class CustomDailyStateChangedError extends Error {}

function isUniqueViolation(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error
    && (error as { code?: unknown }).code === "23505";
}
