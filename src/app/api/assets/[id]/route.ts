import { NextResponse } from "next/server";
import { errorResponse, notFound, readJson } from "@/lib/api";
import { resolveScope } from "@/lib/auth/session";
import { evaluate, getAsset, listEvents, retireAsset, updateAsset } from "@/lib/db/repo";
import { fetchKev, isKnownExploited } from "@/lib/feed/strata";
import { WRITE_LIMIT_PER_MINUTE, takeQuota } from "@/lib/rate-limit";
import { assetPatchSchema, validateAlgorithm, zodMessage } from "@/lib/validate";
import type { AssetPatch } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

export async function GET(request: Request, { params }: Params) {
  const scope = await resolveScope(request, { create: false });
  if (!scope) return notFound();
  const { id } = await params;
  const asset = await getAsset(scope, id);
  if (!asset) return notFound("That asset does not exist in your scope.");

  const [events, profile] = await Promise.all([listEvents(scope, id), import("@/lib/db/repo").then((m) => m.getProfile(scope))]);
  const exposure = evaluate(
    {
      label: asset.label,
      system: asset.system,
      usage: asset.usage,
      algorithm: asset.algorithm,
      deployment: asset.deployment,
      confidentialityYears: asset.confidentialityYears,
      dataClass: asset.dataClass,
      ownerTeam: asset.ownerTeam,
      notes: asset.notes,
      cve: asset.cve,
    },
    asset.decision,
    {
      horizonYear: profile.horizonYear,
      regimeId: profile.regimeId,
      attackerProfile: profile.attackerProfile,
    },
  );

  return NextResponse.json({ asset, exposure, auditTrail: events });
}

export async function PATCH(request: Request, { params }: Params) {
  const scope = await resolveScope(request, { create: false });
  if (!scope) return notFound();
  const quota = takeQuota(`write:${scope}`, WRITE_LIMIT_PER_MINUTE);
  if (!quota.allowed) {
    return NextResponse.json(
      { error: { code: "rate_limited", message: `Too many writes. Retry in ${quota.retryAfterSeconds}s.` } },
      { status: 429 },
    );
  }

  const { id } = await params;
  const body = await readJson(request);
  if (!body.ok) return errorResponse(400, "invalid_json", body.message);
  const value = (body.value ?? {}) as Record<string, unknown>;

  if (typeof value.algorithm === "string") {
    const problem = validateAlgorithm(value.algorithm);
    if (problem) return errorResponse(422, "unknown_algorithm", problem);
  }

  const parsed = assetPatchSchema.safeParse(value);
  if (!parsed.success) {
    return errorResponse(422, "validation_failed", zodMessage(parsed.error), parsed.error.issues);
  }
  if (Object.keys(parsed.data).length === 0) {
    return errorResponse(422, "empty_patch", "Send at least one field to change.");
  }

  const kev = await fetchKev().catch(() => null);
  const knownExploited = isKnownExploited(kev ?? { items: [] } as never, parsed.data.cve ?? undefined);

  const result = await updateAsset(scope, id, parsed.data as AssetPatch, knownExploited);
  if (!result) return notFound("That asset does not exist in your scope.");

  return NextResponse.json({
    asset: result.asset,
    exposure: result.exposure,
    seal: `sha384:${result.event.seal.slice(0, 16)}`,
    event: result.event,
  });
}

export async function DELETE(request: Request, { params }: Params) {
  const scope = await resolveScope(request, { create: false });
  if (!scope) return notFound();
  const quota = takeQuota(`write:${scope}`, WRITE_LIMIT_PER_MINUTE);
  if (!quota.allowed) {
    return NextResponse.json(
      { error: { code: "rate_limited", message: `Too many writes. Retry in ${quota.retryAfterSeconds}s.` } },
      { status: 429 },
    );
  }

  const { id } = await params;
  const body = await readJson(request);
  const reason =
    body.ok && typeof (body.value as Record<string, unknown>)?.reason === "string"
      ? String((body.value as Record<string, unknown>).reason).slice(0, 280)
      : "retired from the survey";

  const asset = await retireAsset(scope, id, reason);
  if (!asset) return notFound("That asset does not exist in your scope.");

  const events = await listEvents(scope, id);
  return NextResponse.json({
    asset,
    tombstone: true,
    note: "The row is retained as a tombstone so the audit chain still replays.",
    event: events[events.length - 1] ?? null,
  });
}