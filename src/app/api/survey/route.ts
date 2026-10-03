import { NextResponse } from "next/server";
import { errorResponse, readJson } from "@/lib/api";
import { resolveScope } from "@/lib/auth/session";
import {
  evaluate,
  getProfile,
  listAssets,
  purgeScope,
  rescoreScope,
  upsertProfile,
} from "@/lib/db/repo";
import {
  ENGINE_VERSION,
  buildSurveyAnalysis,
  buildWaves,
  migrationQueue,
} from "@/lib/engine/index";
import { engineRequestSchema, profileSchema, zodMessage } from "@/lib/validate";
import { replayScope } from "@/lib/integrity/seal";
import { listEvents, tombstonedIds } from "@/lib/db/repo";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * The analysis endpoint. A GET returns the full survey analysis for the caller's
 * current settings. A PATCH changes the survey settings (horizon year, compliance
 * regime, attacker scenario), persists them, and re-scores every asset through
 * the same engine the UI and agent tools use — that persistence is what makes
 * the rupture scrub real rather than decorative.
 */
export async function GET(request: Request) {
  const scope = await resolveScope(request, { create: false });
  if (!scope) {
    return NextResponse.json({ established: false, analysis: null, profile: null });
  }

  const [profile, assets] = await Promise.all([getProfile(scope), listAssets(scope, { status: "active" })]);
  const waves = buildWaves(assets);
  const analysis = buildSurveyAnalysis(assets, {
    horizonYear: profile.horizonYear,
    regimeId: profile.regimeId,
    waves,
  });

  return NextResponse.json({
    established: true,
    engineVersion: ENGINE_VERSION,
    profile,
    analysis,
    queue: migrationQueue(assets).map((asset) => asset.id),
    assetCount: assets.length,
  });
}

export async function PATCH(request: Request) {
  const scope = await resolveScope(request, { create: false });
  if (!scope) return errorResponse(404, "no_session", "No session scope. Start a survey first.");

  const body = await readJson(request);
  if (!body.ok) return errorResponse(400, "invalid_json", body.message);
  const parsed = profileSchema.safeParse(body.value ?? {});
  if (!parsed.success) {
    return errorResponse(422, "validation_failed", zodMessage(parsed.error), parsed.error.issues);
  }

  const profile = await upsertProfile(scope, parsed.data);
  const rescored = await rescoreScope(scope);
  const assets = await listAssets(scope, { status: "active" });
  const waves = buildWaves(assets);

  return NextResponse.json({
    profile,
    rescored: rescored.updated,
    engineVersion: ENGINE_VERSION,
    analysis: buildSurveyAnalysis(assets, {
      horizonYear: profile.horizonYear,
      regimeId: profile.regimeId,
      waves,
    }),
  });
}

export async function PUT(request: Request) {
  const scope = await resolveScope(request, { create: false });
  if (!scope) return errorResponse(404, "no_session", "No session scope.");
  const body = await readJson(request);
  if (!body.ok) return errorResponse(400, "invalid_json", body.message);
  const profile = await upsertProfile(scope, (body.value ?? {}) as Record<string, never>);
  return NextResponse.json({ profile });
}

export async function POST(request: Request) {
  const scope = await resolveScope(request, { create: false });
  if (!scope) return errorResponse(404, "no_session", "No session scope.");

  const body = await readJson(request);
  if (!body.ok) return errorResponse(400, "invalid_json", body.message);
  const parsed = engineRequestSchema.safeParse(body.value ?? {});
  if (!parsed.success) {
    return errorResponse(422, "validation_failed", zodMessage(parsed.error), parsed.error.issues);
  }

  const profile = await getProfile(scope);
  const settings = {
    horizonYear: parsed.data.horizonYear ?? profile.horizonYear,
    regimeId: parsed.data.regimeId ?? profile.regimeId,
    attackerProfile: parsed.data.attackerProfile ?? profile.attackerProfile,
  };

  if (parsed.data.assetIds && parsed.data.assetIds.length > 0) {
    const all = await listAssets(scope, {});
    const wanted = new Set(parsed.data.assetIds);
    const results = all
      .filter((asset) => wanted.has(asset.id))
      .map((asset) => ({
        id: asset.id,
        label: asset.label,
        exposure: evaluate(
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
          settings,
        ),
      }));
    return NextResponse.json({ engineVersion: ENGINE_VERSION, settings, results });
  }

  const rescored = await rescoreScope(scope, settings);
  const assets = await listAssets(scope, { status: "active" });
  const waves = buildWaves(assets);
  return NextResponse.json({
    engineVersion: ENGINE_VERSION,
    settings: rescored.settings,
    rescored: rescored.updated,
    analysis: buildSurveyAnalysis(assets, {
      horizonYear: rescored.settings.horizonYear,
      regimeId: rescored.settings.regimeId,
      waves,
    }),
    integrity: replayScope(await listEvents(scope), await tombstonedIds(scope)),
  });
}
/** DELETE /api/survey retires every primitive in the caller's scope. */
export async function DELETE(request: Request) {
  const scope = await resolveScope(request, { create: false });
  if (!scope) return errorResponse(404, "no_session", "No session scope.");
  const retired = await purgeScope(scope);
  return NextResponse.json({
    retired,
    tombstone: true,
    note: "Rows are retained as tombstones so the audit chain still replays.",
  });
}
