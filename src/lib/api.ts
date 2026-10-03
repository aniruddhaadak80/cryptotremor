/** Shared HTTP helpers for the REST surface. */

import { NextResponse } from "next/server";
import type { ErrorEnvelope } from "./types";

export function errorResponse(
  status: number,
  code: string,
  message: string,
  details?: unknown,
): NextResponse<ErrorEnvelope> {
  return NextResponse.json<ErrorEnvelope>(
    { error: { code, message, ...(details === undefined ? {} : { details }) } },
    { status },
  );
}

export async function readJson(request: Request): Promise<{ ok: true; value: unknown } | { ok: false; message: string }> {
  try {
    return { ok: true, value: await request.json() };
  } catch {
    return { ok: false, message: "Request body is not valid JSON." };
  }
}

export function notFound(message = "Not found in this owner scope."): NextResponse<ErrorEnvelope> {
  return errorResponse(404, "not_found", message);
}