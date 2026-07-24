import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth-server";
import { writeAuditLog } from "@/lib/moderation-audit";

const UPLOADS_DIR =
  process.env.UPLOADS_DIR ||
  (process.cwd() === "/app"
    ? "/app/uploads"
    : path.join(process.cwd(), "../uploads"));

const ALLOWED = new Map([
  ["image/png", "png"],
  ["image/jpeg", "jpg"],
  ["image/webp", "webp"],
  ["image/gif", "gif"],
]);

const MAX_BYTES = 4 * 1024 * 1024; // 4 MiB

/**
 * POST multipart: field `file` — store under uploads/competitive-content/.
 * Returns public URL that preserves GIF animation (no sharp re-encode).
 */
export async function POST(request: Request) {
  let user;
  try {
    user = await requireRole("admin");
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "file is required" }, { status: 400 });
    }
    if (file.size <= 0 || file.size > MAX_BYTES) {
      return NextResponse.json(
        { error: "file must be 1B…4MiB" },
        { status: 400 },
      );
    }
    const ext = ALLOWED.get(file.type);
    if (!ext) {
      return NextResponse.json(
        { error: "allowed: png, jpeg, webp, gif" },
        { status: 400 },
      );
    }

    const dir = path.join(UPLOADS_DIR, "competitive-content");
    await mkdir(dir, { recursive: true });
    const filename = `${randomUUID()}.${ext}`;
    const buf = Buffer.from(await file.arrayBuffer());
    await writeFile(path.join(dir, filename), buf);

    const url = `/api/competitive/content-assets/${filename}`;

    await writeAuditLog({
      actorUserId: user.id,
      action: "competitive.content.upload",
      details: JSON.stringify({ filename, type: file.type, size: file.size }),
    });

    return NextResponse.json({ url, filename });
  } catch (error) {
    console.error("[admin/competitive/content/upload]", error);
    return NextResponse.json({ error: "Upload failed" }, { status: 500 });
  }
}
