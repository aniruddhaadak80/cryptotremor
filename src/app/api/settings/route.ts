import { NextResponse } from "next/server";
import { errorResponse } from "@/lib/api";
import { resolveScope } from "@/lib/auth/session";
import { getProfile, upsertProfile } from "@/lib/db/repo";
import { profileSchema, zodMessage } from "@/lib/validate";
import {
  ALGORITHMS,
  ATTACKER_PROFILES,
  COMPLIANCE_REGIMES,
  ENGINE_VERSION,
  MANIFEST_TEMPLATE,
} from "@/lib/engine/index";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Settings plus the reference registries, so the client never hard-codes them. */
export async function GET(request: Request) {
  const scope = await resolveScope(request, { create: false });
  return NextResponse.json({
    established: Boolean(scope),
    profile: scope ? await getProfile(scope) : null,
    registry: {
      engineVersion: ENGINE_VERSION,
      algorithms: ALGORITHMS,
      regimes: COMPLIANCE_REGIMES,
      attackerProfiles: Object.values(ATTACKER_PROFILES),
    },
    manifestTemplate: MANIFEST_TEMPLATE,
  });
}

export async function PATCH(request: Request) {
  const scope = await resolveScope(request, { create: false });
  if (!scope) return errorResponse(404, "no_session", "No session scope.");
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return errorResponse(400, "invalid_json", "Request body is not valid JSON.");
  }
  const parsed = profileSchema.safeParse(body ?? {});
  if (!parsed.success) {
    return errorResponse(422, "validation_failed", zodMessage(parsed.error), parsed.error.issues);
  }
  return NextResponse.json({ profile: await upsertProfile(scope, parsed.data) });
}