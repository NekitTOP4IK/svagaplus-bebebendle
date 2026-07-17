import { NextResponse } from "next/server";
import { and, eq, inArray } from "drizzle-orm";
import { db, scrans } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth-server";
import {
  buildRejectMessage,
  isRejectReasonCode,
  type RejectReasonCode,
} from "@/lib/reject-reasons";
import { writeAuditLog } from "@/lib/moderation-audit";

const BOT_TOKEN = process.env.BOT_TOKEN;
const MAX_IDS = 50;

async function notify(telegramId: string, text: string): Promise<void> {
  if (!BOT_TOKEN) return;
  try {
    await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: telegramId, text }),
      signal: AbortSignal.timeout(5000),
    });
  } catch (error) {
    console.error("bulk notify failed", error);
  }
}

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user || !["moderator", "admin"].includes(user.role)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = (await request.json().catch(() => ({}))) as {
      action?: string;
      ids?: unknown;
      reason?: string;
      note?: string;
    };

    const action = body.action;
    if (action !== "approve" && action !== "reject") {
      return NextResponse.json({ error: "action must be approve|reject" }, { status: 400 });
    }

    if (!Array.isArray(body.ids) || body.ids.length === 0) {
      return NextResponse.json({ error: "ids required" }, { status: 400 });
    }

    const ids = body.ids
      .map((x) => (typeof x === "number" ? x : parseInt(String(x), 10)))
      .filter((n) => Number.isFinite(n) && n > 0)
      .slice(0, MAX_IDS);

    if (ids.length === 0) {
      return NextResponse.json({ error: "no valid ids" }, { status: 400 });
    }

    const rows = await db
      .select({
        id: scrans.id,
        name: scrans.name,
        telegramId: scrans.telegramId,
        approved: scrans.approved,
        rejected: scrans.rejected,
      })
      .from(scrans)
      .where(and(inArray(scrans.id, ids), eq(scrans.approved, false), eq(scrans.rejected, false)));

    let ok = 0;
    if (action === "approve") {
      for (const row of rows) {
        await db
          .update(scrans)
          .set({ approved: true, rejected: false })
          .where(eq(scrans.id, row.id));
        if (row.telegramId && BOT_TOKEN) {
          await notify(
            row.telegramId,
            `✅ Блюдо «${row.name}» одобрено и появится в игре!`,
          );
        }
        ok += 1;
      }
    } else {
      const reasonCode: RejectReasonCode =
        typeof body.reason === "string" && isRejectReasonCode(body.reason)
          ? body.reason
          : "other";
      const note = typeof body.note === "string" ? body.note.trim().slice(0, 280) : "";
      for (const row of rows) {
        await db
          .update(scrans)
          .set({
            approved: false,
            rejected: true,
            rejectReason: note ? `${reasonCode}: ${note}` : reasonCode,
            rejectedAt: new Date(),
            rejectedByUserId: user.id,
          })
          .where(eq(scrans.id, row.id));
        if (row.telegramId) {
          await notify(row.telegramId, buildRejectMessage(row.name, reasonCode, note || undefined));
        }
        ok += 1;
      }
    }

    await writeAuditLog({
      actorUserId: user.id,
      action: `scran.bulk_${action}`,
      details: JSON.stringify({ ids: rows.map((r) => r.id), count: ok, reason: body.reason }),
    });

    return NextResponse.json({ success: true, ok, total: rows.length });
  } catch (error) {
    console.error("[admin/scrans/bulk]", error);
    return NextResponse.json({ error: "Bulk action failed" }, { status: 500 });
  }
}
