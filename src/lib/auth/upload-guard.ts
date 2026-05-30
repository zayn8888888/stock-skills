import path from "node:path";

/** File extensions that are never allowed to be uploaded. */
const BLOCKED_EXTENSIONS = new Set([
  ".exe",
  ".sh",
  ".py",
  ".bat",
  ".cmd",
  ".msi",
  ".dmg",
  ".zip",
  ".tar",
  ".gz",
]);

/** Default maximum upload size in bytes (50 MB). */
const DEFAULT_MAX_SIZE_BYTES = 50 * 1024 * 1024;

/**
 * Validate an upload against blocked extensions and size limits.
 *
 * @param filename   Original filename from the upload
 * @param sizeBytes  Size of the upload in bytes
 * @param maxSizeBytes  Optional override for the size limit (defaults to 50 MB)
 * @throws {Error} if the file is blocked or exceeds the size limit
 */
export function validateUpload(
  filename: string,
  sizeBytes: number,
  maxSizeBytes: number = DEFAULT_MAX_SIZE_BYTES,
): void {
  // Path-boundary check: filename must not contain directory separators
  if (filename.includes("/") || filename.includes("\\")) {
    throw new Error(`Invalid filename: "${filename}" must not contain path separators`);
  }

  const ext = path.extname(filename).toLowerCase();

  if (BLOCKED_EXTENSIONS.has(ext)) {
    throw new Error(
      `Blocked file extension "${ext}". Disallowed types: ${[...BLOCKED_EXTENSIONS].join(", ")}`,
    );
  }

  if (sizeBytes > maxSizeBytes) {
    throw new Error(
      `File size ${sizeBytes} bytes exceeds the ${maxSizeBytes} byte limit`,
    );
  }
}
