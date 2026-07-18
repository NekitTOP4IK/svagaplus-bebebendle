import { asc, desc, eq } from "drizzle-orm";
import { db, announcements, type Announcement } from "@/db/schema";

const TITLE_MAX = 200;
const BODY_MAX = 5000;
const LIST_LIMIT = 50;

export type ValidationResult =
  | { ok: true; title: string; body: string }
  | { ok: false; error: string };

export function validateAnnouncement(input: {
  title?: unknown;
  body?: unknown;
}): ValidationResult {
  if (typeof input.title !== "string") return { ok: false, error: "title must be a string" };
  if (typeof input.body !== "string") return { ok: false, error: "body must be a string" };

  const title = input.title.trim();
  const body = input.body.trim();

  if (title.length === 0) return { ok: false, error: "title is empty" };
  if (title.length > TITLE_MAX) return { ok: false, error: `title exceeds ${TITLE_MAX} chars` };
  if (body.length === 0) return { ok: false, error: "body is empty" };
  if (body.length > BODY_MAX) return { ok: false, error: `body exceeds ${BODY_MAX} chars` };

  return { ok: true, title, body };
}

export async function getActiveAnnouncements(
  limit: number = LIST_LIMIT,
): Promise<Announcement[]> {
  const rows = await db
    .select()
    .from(announcements)
    .where(eq(announcements.active, true))
    .orderBy(asc(announcements.createdAt))
    .limit(limit);
  return rows;
}

export async function listAllAnnouncements(): Promise<Announcement[]> {
  const rows = await db
    .select()
    .from(announcements)
    .orderBy(desc(announcements.createdAt));
  return rows;
}

export async function createAnnouncement(input: {
  title: string;
  body: string;
  active?: boolean;
  createdByUserId: number;
}): Promise<Announcement> {
  const [row] = await db
    .insert(announcements)
    .values({
      title: input.title,
      body: input.body,
      active: input.active ?? true,
      createdByUserId: input.createdByUserId,
    })
    .returning();
  if (!row) throw new Error("createAnnouncement: insert did not return a row");
  return row;
}

export async function updateAnnouncement(
  id: number,
  patch: { title?: string; body?: string; active?: boolean },
): Promise<Announcement | null> {
  const set: Record<string, unknown> = { updatedAt: new Date() };
  if (typeof patch.title === "string") set.title = patch.title;
  if (typeof patch.body === "string") set.body = patch.body;
  if (typeof patch.active === "boolean") set.active = patch.active;

  const [row] = await db
    .update(announcements)
    .set(set)
    .where(eq(announcements.id, id))
    .returning();
  return row ?? null;
}

export async function deleteAnnouncement(id: number): Promise<boolean> {
  const result = await db.delete(announcements).where(eq(announcements.id, id));
  return (result.rowCount ?? 0) > 0;
}