import { NextResponse } from "next/server";
import { readFile } from "fs/promises";
import path from "path";
import sharp from "sharp";

const UPLOADS_DIR = process.env.UPLOADS_DIR || (process.cwd() === "/app" ? "/app/uploads" : path.join(process.cwd(), "../uploads"));

const ALLOWED_EXTENSIONS = new Set([".jpg", ".jpeg", ".png", ".webp", ".gif"]);

export async function GET(
  request: Request,
  { params }: { params: Promise<{ filename: string }> }
) {
  try {
    const { filename } = await params;
    // basename strips any path segments, so "..%2F" tricks cannot escape UPLOADS_DIR
    const safeName = path.basename(filename);
    const extension = path.extname(safeName).toLowerCase();
    if (
      !safeName ||
      safeName !== filename ||
      !ALLOWED_EXTENSIONS.has(extension) ||
      !path.resolve(path.join(UPLOADS_DIR, safeName)).startsWith(path.resolve(UPLOADS_DIR) + path.sep)
    ) {
      return new NextResponse("Image not found", { status: 404 });
    }

    const imageBuffer = await readFile(path.join(UPLOADS_DIR, safeName));
    const webpBuffer = await sharp(imageBuffer).webp({ quality: 80 }).toBuffer();

    return new NextResponse(Buffer.from(webpBuffer), {
      headers: {
        "Content-Type": "image/webp",
        "Cache-Control": "public, max-age=31536000, immutable",
      },
    });
  } catch {
    return new NextResponse("Image not found", { status: 404 });
  }
}
