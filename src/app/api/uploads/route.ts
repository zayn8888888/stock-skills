import { NextRequest, NextResponse } from "next/server";
import { nanoid } from "nanoid";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { getConfig } from "@/lib/config";
import { validateAuth } from "@/lib/auth/middleware";
import { validateUpload } from "@/lib/auth/upload-guard";

/** POST /api/uploads - multipart file upload */
export async function POST(req: NextRequest) {
  const authErr = validateAuth(req);
  if (authErr) return authErr;

  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return NextResponse.json(
      { error: "Invalid multipart form data" },
      { status: 400 },
    );
  }

  const file = formData.get("file");
  if (!file || !(file instanceof File)) {
    return NextResponse.json(
      { error: "A file field is required" },
      { status: 400 },
    );
  }

  const filename = file.name;
  const sizeBytes = file.size;

  // Validate with upload-guard (extension, size, path boundary)
  try {
    validateUpload(filename, sizeBytes);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 400 },
    );
  }

  const { analysisRoot } = getConfig();
  const uploadsDir = path.resolve(analysisRoot, "uploads");
  mkdirSync(uploadsDir, { recursive: true });

  const fileId = nanoid();
  const ext = path.extname(filename);
  const base = path.basename(filename, ext);
  const savedFilename = `${fileId}-${base}${ext}`;
  const filePath = path.resolve(uploadsDir, savedFilename);

  // Path-boundary check
  if (!filePath.startsWith(uploadsDir + path.sep)) {
    return NextResponse.json(
      { error: "Path traversal detected in filename" },
      { status: 400 },
    );
  }

  // Read file buffer and write to disk
  const arrayBuffer = await file.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);
  writeFileSync(filePath, buffer);

  return NextResponse.json(
    {
      file_id: fileId,
      path: filePath,
      filename: savedFilename,
      original_filename: filename,
      size_bytes: sizeBytes,
    },
    { status: 201 },
  );
}
