import { NextResponse } from "next/server";
import { errorResponse, readJson } from "@/lib/api";
import { resolveScope } from "@/lib/auth/session";
import { countAssets, createAsset } from "@/lib/db/repo";
import { fetchKev, isKnownExploited } from "@/lib/feed/strata";
import { IMPORT_LIMIT_PER_MINUTE, takeQuota } from "@/lib/rate-limit";
import { MAX_IMPORT_ROWS, parseManifest } from "@/lib/validate";
import { MANIFEST_TEMPLATE } from "@/lib/engine/index";
import type { AssetDraft } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Manifest import. Accepts a CSV manifest or a JSON array and reports per-row
 * problems instead of failing the whole batch, because a real inventory always
 * has a typo in it.
 */
export async function POST(request: Request) {
  const scope = await resolveScope(request, { create: true });
  if (!scope) return errorResponse(401, "no_session", "Could not establish a session scope.");

  const existing = await countAssets(scope);
  if (existing > 0) {
    return NextResponse.json({
      created: 0,
      skipped: 0,
      existing,
      note: "This scope already holds an estate. Import adds to it; retire records you no longer want.",
      assets: [],
      errors: [],
    });
  }

  const quota = takeQuota(`import:${scope}`, IMPORT_LIMIT_PER_MINUTE);
  if (!quota.allowed) {
    return NextResponse.json(
      { error: { code: "rate_limited", message: `Import budget reached. Retry in ${quota.retryAfterSeconds}s.` } },
      { status: 429 },
    );
  }

  const body = await readJson(request);
  if (!body.ok) return errorResponse(400, "invalid_json", body.message);
  const value = body.value as Record<string, unknown>;

  let manifest: string;
  if (typeof value.manifest === "string" && value.manifest.trim().length > 0) {
    manifest = value.manifest;
  } else if (value.sample === true) {
    manifest = MANIFEST_TEMPLATE;
  } else {
    return errorResponse(422, "missing_manifest", "Send `manifest` as CSV or JSON, or `sample: true`.");
  }

  if (manifest.length > 200_000) {
    return errorResponse(413, "manifest_too_large", `Manifests are capped at 200 KB; ${MAX_IMPORT_ROWS} rows maximum.`);
  }

  const parsed = parseManifest(manifest);
  if (parsed.drafts.length === 0) {
    return errorResponse(422, "manifest_invalid", "No importable rows were found.", parsed.errors.slice(0, 20));
  }

  const kev = await fetchKev().catch(() => null);
  const created = [];
  for (const draft of parsed.drafts as AssetDraft[]) {
    const knownExploited = isKnownExploited(kev ?? { items: [] } as never, draft.cve ?? null);
    const result = await createAsset(scope, draft, knownExploited);
    created.push({
      id: result.asset.id,
      label: result.asset.label,
      system: result.asset.system,
      algorithm: result.asset.algorithm,
      exposureScore: result.asset.exposureScore,
      band: result.asset.exposureBand,
      ruptureYear: result.asset.ruptureYear,
      knownExploited,
      seal: `sha384:${result.event.seal.slice(0, 16)}`,
    });
  }

  return NextResponse.json(
    {
      created: created.length,
      skipped: 0,
      existing,
      assets: created,
      errors: parsed.errors.slice(0, 20),
      errorCount: parsed.errors.length,
    },
    { status: 201 },
  );
}