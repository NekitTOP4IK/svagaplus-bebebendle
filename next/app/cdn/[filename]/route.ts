import { NextResponse } from "next/server";
import { readFile } from "fs/promises";
import path from "path";
import sharp from "sharp";

const UPLOADS_DIR = process.env.UPLOADS_DIR || (process.cwd() === "/app" ? "/app/uploads" : path.join(process.cwd(), "../uploads"));

export async function GET(
  request: Request,
  { params }: { params: Promise<{ filename: string }> }
) {
  try {
    const { filename } = await params;
    const filePath = path.join(UPLOADS_DIR, filename);

    const imageBuffer = await readFile(filePath);
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
