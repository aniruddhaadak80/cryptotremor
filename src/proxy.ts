import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

/**
 * Session bootstrap.
 *
 * Cryptotremor has no accounts, so ownership is an opaque 128-bit scope in an
 * HTTP-only cookie. Setting it here means the very first page view already
 * carries an estate, instead of the scope appearing only after the first write.
 * The value is regenerated when it is missing or malformed; nothing readable is
 * ever sent to the client.
 */
const SCOPE_COOKIE = "ct_scope";
const SCOPE_PATTERN = /^[0-9a-f]{32}$/;
const ONE_YEAR_SECONDS = 60 * 60 * 24 * 365;

export function proxy(request: NextRequest) {
  const existing = request.cookies.get(SCOPE_COOKIE)?.value;
  if (existing && SCOPE_PATTERN.test(existing)) {
    return NextResponse.next();
  }

  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  const scope = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");

  const response = NextResponse.next();
  response.cookies.set(SCOPE_COOKIE, scope, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: ONE_YEAR_SECONDS,
  });
  response.headers.set("x-ct-scope-established", "1");
  return response;
}

export const config = {
  // Static assets and image optimization do not need a session.
  matcher: ["/((?!_next/static|_next/image|favicon.ico|icon.svg|opengraph-image|mcp.json).*)"],
};