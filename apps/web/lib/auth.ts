import { NextRequest, NextResponse } from "next/server";

/**
 * Maximum allowed request body size for write operations (100 KB).
 * Prevents oversized payloads from reaching tokenization or disk writes.
 */
const MAX_BODY_BYTES = 100_000;

/**
 * Optional write-auth guard. If the ADMIN_SECRET environment variable is set,
 * every mutating request must include `Authorization: Bearer <secret>`.
 * If ADMIN_SECRET is not set, the check is skipped (open access for local dev).
 *
 * Also enforces a 100 KB body size limit via Content-Length header.
 *
 * Returns a 401/413 NextResponse on failure, or null to allow the request.
 */
export function checkWriteAuth(req: NextRequest): NextResponse | null {
  // Body size guard (best-effort early reject via Content-Length header)
  const len = req.headers.get("content-length");
  if (len && parseInt(len, 10) > MAX_BODY_BYTES) {
    return NextResponse.json(
      { error: "Request body too large (max 100 KB)" },
      { status: 413 }
    );
  }

  // Auth guard — only active when ADMIN_SECRET is configured
  const secret = process.env.ADMIN_SECRET;
  if (!secret) return null;

  const auth = req.headers.get("authorization");
  if (!auth || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  return null;
}
