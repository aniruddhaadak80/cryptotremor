import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { resolveScope } from "@/lib/auth/session";
import { countAssets, createAsset, listAssets } from "@/lib/db/repo";
import { fetchKev, isKnownExploited } from "@/lib/feed/strata";
import { IMPORT_LIMIT_PER_MINUTE, WRITE_LIMIT_PER_MINUTE, takeQuota } from "@/lib/rate-limit";
import { errorResponse } from "@/lib/api";
import { assetDraftSchema, assetListQuerySchema, validateAlgorithm, zodMessage } from "@/lib/validate";
import type { AssetDraft } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";


export async function GET(request: Request) {
  const scope = await resolveScope(request, { create: false });
  if (!scope) {
    return NextResponse.json({ assets: [], count: 0, established: false });
  }
  const url = new URL(request.url);
  const parsed = assetListQuerySchema.safeParse(Object.fromEntries(url.searchParams));
  if (!parsed.success) {
    return errorResponse(400, "invalid_query", zodMessage(parsed.error as ZodError));
  }
  const assets = await listAssets(scope, parsed.data);
  return NextResponse.json({
    assets,
    count: assets.length,
    total: await countAssets(scope),
    established: true,
  });
}

export async function POST(request: Request) {
  const scope = await resolveScope(request, { create: true });
  if (!scope) return errorResponse(401, "no_session", "Could not establish a session scope.");

  const quota = takeQuota(`write:${scope}`, WRITE_LIMIT_PER_MINUTE);
  if (!quota.allowed) {
    return NextResponse.json(
      { error: { code: "rate_limited", message: `Too many writes. Retry in ${quota.retryAfterSeconds}s.` } },
      { status: 429, headers: { "retry-after": String(quota.retryAfterSeconds) } },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return errorResponse(400, "invalid_json", "Request body is not valid JSON.");
  }

  const raw = (body ?? {}) as Record<string, unknown>;
  const algorithm = String(raw.algorithm ?? "");
  const algorithmProblem = validateAlgorithm(algorithm);
  if (algorithmProblem) return errorResponse(422, "unknown_algorithm", algorithmProblem);

  const parsed = assetDraftSchema.safeParse(raw);
  if (!parsed.success) {
    return errorResponse(422, "validation_failed", zodMessage(parsed.error as ZodError), parsed.error.issues);
  }

  const importQuota = takeQuota(`asset:${scope}`, IMPORT_LIMIT_PER_MINUTE);
  if (!importQuota.allowed) {
    return NextResponse.json(
      { error: { code: "rate_limited", message: `Import budget reached. Retry in ${importQuota.retryAfterSeconds}s.` } },
      { status: 429 },
    );
  }

  const kev = await fetchKev().catch(() => null);
  const knownExploited = isKnownExploited(kev ?? { items: [] } as never, parsed.data.cve ?? null);

  const result = await createAsset(scope, parsed.data as AssetDraft, knownExploited);
  return NextResponse.json(
    {
      asset: result.asset,
      exposure: result.exposure,
      seal: `sha384:${result.event.seal.slice(0, 16)}`,
      knownExploited,
    },
    { status: 201 },
  );
}