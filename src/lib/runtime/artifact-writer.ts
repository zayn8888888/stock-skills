import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { getConfig } from "@/lib/config";

export interface WriteResult {
  path: string;
  checksum: string;
  sha256: string;
  sizeBytes: number;
}

/**
 * Write an artifact file to the analysis root with path-boundary enforcement.
 *
 * @param runDir  Subdirectory under analysisRoot/artifacts (e.g. run id or slug)
 * @param filename  Target filename (must not contain path separators that escape the boundary)
 * @param content  UTF-8 string content to write
 */
export function writeArtifact(runDir: string, filename: string, content: string): WriteResult {
  const { analysisRoot } = getConfig();
  const artifactsRoot = path.resolve(analysisRoot, "artifacts");
  const targetDir = path.resolve(artifactsRoot, runDir);
  const targetPath = path.resolve(targetDir, filename);

  // Path-boundary check: resolved path must stay under analysisRoot/artifacts
  if (!targetPath.startsWith(artifactsRoot + path.sep) && targetPath !== artifactsRoot) {
    throw new Error(
      `Path traversal detected: resolved "${targetPath}" is outside artifacts root "${artifactsRoot}"`,
    );
  }

  // Ensure the target directory exists
  mkdirSync(targetDir, { recursive: true });

  // Write the file
  writeFileSync(targetPath, content, "utf-8");

  // Calculate checksums
  const sha256 = createHash("sha256").update(content, "utf-8").digest("hex");
  const sizeBytes = Buffer.byteLength(content, "utf-8");

  return {
    path: targetPath,
    checksum: sha256,
    sha256,
    sizeBytes,
  };
}
