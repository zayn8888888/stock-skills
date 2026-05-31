import { getConfig } from "@/lib/config";
import { type NextRequest, NextResponse } from "next/server";

/**
 * Check whether the given Origin header value matches the request's Host.
 */
function isAllowedOrigin(origin: string, host: string): boolean {
  try {
    const url = new URL(origin);
    return url.host === host;
  } catch {
    return false;
  }
}

/**
 * Validate authentication for state-changing requests.
 *
 * - GET / HEAD requests pass without authentication.
 * - POST / PATCH / DELETE must satisfy ALL of:
 *   1. Origin header matches the request Host (CSRF protection)
 *   2. X-Requested-With header equals "fetch"
 *   3. Authorization header carries a valid Bearer token
 *
 * @returns `null` when the request is authorised, otherwise a 403 NextResponse.
 */
export function validateAuth(req: NextRequest): NextResponse | null {
  const method = req.method.toUpperCase();

  // Safe methods do not require auth
  if (method === "GET" || method === "HEAD") {
    return null;
  }

  // 1. Origin check
  const origin = req.headers.get("origin");
  const host = req.headers.get("host");
  if (!origin || !host || !isAllowedOrigin(origin, host)) {
    return NextResponse.json({ error: "Forbidden: invalid origin" }, { status: 403 });
  }

  // 2. X-Requested-With check
  const requestedWith = req.headers.get("x-requested-with");
  if (requestedWith !== "fetch") {
    return NextResponse.json(
      { error: "Forbidden: missing X-Requested-With header" },
      { status: 403 },
    );
  }

  // 3. Bearer token check
  const authHeader = req.headers.get("authorization");
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return NextResponse.json(
      { error: "Forbidden: missing or malformed Authorization header" },
      { status: 403 },
    );
  }

  const token = authHeader.slice("Bearer ".length);
  const { token: expectedToken } = getConfig();

  if (!expectedToken || token !== expectedToken) {
    return NextResponse.json({ error: "Forbidden: invalid token" }, { status: 403 });
  }

  return null;
}
