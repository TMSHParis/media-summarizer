import { NextRequest, NextResponse } from "next/server";
import { writeFile } from "fs/promises";
import path from "path";
import os from "os";

// This route saves the uploaded file to a temp directory
// and returns the path — bypassing body size limits by reading the raw stream
export async function POST(request: NextRequest) {
  try {
    const chunks: Uint8Array[] = [];
    const reader = request.body?.getReader();

    if (!reader) {
      return NextResponse.json({ error: "No body" }, { status: 400 });
    }

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
    }

    const buffer = Buffer.concat(chunks);
    const rawName = request.headers.get("x-file-name") || `upload-${Date.now()}`;
    const fileName = decodeURIComponent(rawName);
    const tempPath = path.join(os.tmpdir(), `media-${Date.now()}-${fileName}`);
    await writeFile(tempPath, buffer);

    return NextResponse.json({ path: tempPath });
  } catch (err) {
    console.error("Upload error:", err);
    return NextResponse.json({ error: "Erreur lors de l'upload" }, { status: 500 });
  }
}
