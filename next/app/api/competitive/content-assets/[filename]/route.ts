import { readFile } from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";

const UPLOADS_DIR =
  process.env.UPLOADS_DIR ||
  (process.cwd() === "/app"
    ? "/app/uploads"
    : path.join(process.cwd(), "../uploads"));

const MIME: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".gif": "image/gif",
};

/**
 * Public GET for competitive content images (GIF-safe, no re-encode).
 */
export async function GET(
  _request: Request,
  ctx: { params: Promise<{ filename: string }> },
) {
  const { filename } = await ctx.params;
  if (!/^[a-f0-9-]{36}\.(png|jpe?g|webp|gif)$/i.test(filename)) {
    return new NextResponse("Not found", { status: 404 });
  }

  try {
    const filePath = path.join(UPLOADS_DIR, "competitive-content", filename);
    const buf = await readFile(filePath);
    const ext = path.extname(filename).toLowerCase();
    const type = MIME[ext] ?? "application/octet-stream";
    return new NextResponse(buf, {
      headers: {
        "Content-Type": type,
        "Cache-Control": "public, max-age=31536000, immutable",
      },
    });
  } catch {
    return new NextResponse("Not found", { status: 404 });
  }
}
