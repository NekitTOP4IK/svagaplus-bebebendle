import { NextResponse } from "next/server";
import { and, eq, ne, sql } from "drizzle-orm";
import { db, scrans } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth-server";

function normalizeName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[ё]/g, "е")
    .replace(/[^a-zа-я0-9\s]/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Find potential duplicate scrans by similar names */
export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user || !["moderator", "admin"].includes(user.role)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { searchParams } = new URL(request.url);
    const scranId = searchParams.get("scran_id");
    const nameQ = (searchParams.get("name") || "").trim();

    if (scranId) {
      const id = parseInt(scranId, 10);
      if (Number.isNaN(id)) {
        return NextResponse.json({ error: "Invalid scran_id" }, { status: 400 });
      }
      const [source] = await db.select().from(scrans).where(eq(scrans.id, id)).limit(1);
      if (!source) {
        return NextResponse.json({ error: "Not found" }, { status: 404 });
      }
      const norm = normalizeName(source.name);
      const token = norm.split(" ").filter((t) => t.length >= 3)[0] || norm.slice(0, 8);
      if (!token) {
        return NextResponse.json({ source, matches: [] });
      }
      const matches = await db
        .select({
          id: scrans.id,
          name: scrans.name,
          approved: scrans.approved,
          rejected: scrans.rejected,
          price: scrans.price,
          imageUrl: scrans.imageUrl,
          telegramId: scrans.telegramId,
        })
        .from(scrans)
        .where(
          and(
            ne(scrans.id, id),
            sql`lower(${scrans.name}) like ${"%" + token + "%"}`,
          ),
        )
        .limit(20);
      return NextResponse.json({ source: { id: source.id, name: source.name }, matches });
    }

    // Global: groups of exact case-insensitive name collisions among non-rejected
    const groups = await db.execute(sql`
      select lower(name) as key, count(*)::int as cnt, array_agg(id order by id) as ids
      from scrans
      where rejected = false
      group by lower(name)
      having count(*) > 1
      order by count(*) desc
      limit 40
    `);

    return NextResponse.json({
      groups: (groups.rows as Array<{ key: string; cnt: number; ids: number[] }>).map((g) => ({
        name: g.key,
        count: g.cnt,
        ids: g.ids,
      })),
      nameQuery: nameQ || null,
    });
  } catch (error) {
    console.error("[admin/duplicates]", error);
    return NextResponse.json({ error: "Failed to find duplicates" }, { status: 500 });
  }
}
