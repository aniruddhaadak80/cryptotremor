/**
 * Anonymous session ownership.
 *
 * Cryptotremor has no accounts. A visitor owns an estate through an opaque
 * scope id stored in an HTTP-only cookie: 128 bits of randomness, never
 * guessable, never sent to the client in readable form, and attached to every
 * query so one visitor can never read or mutate another's records. The share
 * route is the only unauthenticated read surface, and it returns a frozen
 * snapshot rather than live rows.
 */

import { randomBytes } from "node:crypto";
import { cookies } from "next/headers";

export const SCOPE_COOKIE = "ct_scope";
export const SCOPE_MAX_AGE_SECONDS = 60 * 60 * 24 * 365;

export function newScope(): string {
  return randomBytes(16).toString("hex");
}

export function isValidScope(value: unknown): value is string {
  return typeof value === "string" && /^[0-9a-f]{32}$/.test(value);
}

/** Reads the scope without creating one. Returns null for a first-time visitor. */
export async function readScope(): Promise<string | null> {
  const store = await cookies();
  const value = store.get(SCOPE_COOKIE)?.value;
  return isValidScope(value) ? value : null;
}

/**
 * Route-handler variant: reads the scope, creating and setting the cookie when
 * this is the visitor's first write.
 */
export async function ensureScope(): Promise<{ scope: string; created: boolean }> {
  const store = await cookies();
  const existing = store.get(SCOPE_COOKIE)?.value;
  if (isValidScope(existing)) return { scope: existing, created: false };
  const scope = newScope();
  store.set(SCOPE_COOKIE, scope, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SCOPE_MAX_AGE_SECONDS,
  });
  return { scope, created: true };
}

/**
 * Resolves ownership for an API request, in priority order:
 *
 *  1. `x-ct-owner` header — an explicit 128-bit owner capability. Stateless MCP
 *     clients do not keep cookies, so the scope they were handed in the
 *     `initialize` result is passed back on every call. The token is the same
 *     128 bits of randomness as the cookie, so holding it *is* ownership.
 *  2. the session cookie — used by the browser UI.
 *  3. a fresh scope — created and set as a cookie for browser callers.
 */
export async function resolveScope(
  request: Request,
  options: { create: boolean },
): Promise<string | null> {
  const headerValue = request.headers.get("x-ct-owner");
  if (isValidScope(headerValue)) return headerValue;

  const store = await cookies();
  const cookieValue = store.get(SCOPE_COOKIE)?.value;
  if (isValidScope(cookieValue)) return cookieValue;

  if (!options.create) return null;
  const scope = newScope();
  store.set(SCOPE_COOKIE, scope, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SCOPE_MAX_AGE_SECONDS,
  });
  return scope;
}