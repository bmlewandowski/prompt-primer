import { NextRequest, NextResponse } from "next/server";

// ---------------------------------------------------------------------------
// Simple in-process sliding-window rate limiter for CPU-heavy compile routes.
//
// Limits: 30 requests per IP per 60-second window.
// Note: in-memory state resets on server restart and is not shared across
// multiple instances. Suitable for self-hosted / single-process deployments.
// For multi-instance production, replace with a Redis-backed limiter.
// ---------------------------------------------------------------------------

const WINDOW_MS = 60_000;
const MAX_REQUESTS = 30;

// Map of IP → timestamps of recent requests within the current window
const ipWindows = new Map<string, number[]>();

export function proxy(req: NextRequest) {
  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0].trim() ??
    req.headers.get("x-real-ip") ??
    "unknown";

  const now = Date.now();
  const windowStart = now - WINDOW_MS;

  // Evict timestamps outside the current window
  const timestamps = (ipWindows.get(ip) ?? []).filter((t) => t > windowStart);

  if (timestamps.length >= MAX_REQUESTS) {
    return NextResponse.json(
      { error: "Too many requests. Please wait before compiling again." },
      {
        status: 429,
        headers: {
          "Retry-After": String(Math.ceil(WINDOW_MS / 1000)),
          "X-RateLimit-Limit": String(MAX_REQUESTS),
          "X-RateLimit-Remaining": "0",
          "X-RateLimit-Reset": String(Math.ceil((windowStart + WINDOW_MS) / 1000)),
        },
      }
    );
  }

  timestamps.push(now);
  ipWindows.set(ip, timestamps);

  const remaining = MAX_REQUESTS - timestamps.length;
  const res = NextResponse.next();
  res.headers.set("X-RateLimit-Limit", String(MAX_REQUESTS));
  res.headers.set("X-RateLimit-Remaining", String(remaining));
  return res;
}

export const config = {
  matcher: ["/api/compile", "/api/preview"],
};
