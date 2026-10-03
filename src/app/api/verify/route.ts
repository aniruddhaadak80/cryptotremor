import { NextResponse } from "next/server";
import { errorResponse } from "@/lib/api";
import { resolveScope } from "@/lib/auth/session";
import { listAssets, listEvents, tombstonedIds } from "@/lib/db/repo";
import { replayEntity, replayScope, GENESIS_SEAL, SEAL_ALGORITHM } from "@/lib/integrity/seal";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Replays the caller's audit chains and reports the first broken link, per
 * entity and overall. A rewritten row anywhere in the middle breaks every later
 * seal, so this is the check that makes the history worth anything.
 */
export async function GET(request: Request) {
  const scope = await resolveScope(request, { create: false });
  if (!scope) return errorResponse(404, "no_session", "No session scope.");

  const events = await listEvents(scope);
  const tombstones = await tombstonedIds(scope);
  const assets = await listAssets(scope, {});
  const report = replayScope(events, tombstones);

  const byEntity = new Map<string, typeof events>();
  for (const event of events) {
    const list = byEntity.get(event.entityId) ?? [];
    list.push(event);
    byEntity.set(event.entityId, list);
  }

  const entityChecks = [...byEntity.entries()].map(([entityId, list]) => {
    const result = replayEntity(list);
    const asset = assets.find((candidate) => candidate.id === entityId);
    return {
      entityId,
      label: asset?.label ?? "(retired)",
      system: asset?.system ?? "(unknown)",
      events: result.events,
      ok: result.ok,
      headSeal: result.headSeal,
      brokenAt: result.brokenAt,
    };
  });

  const tampered = entityChecks.filter((check) => !check.ok);

  return NextResponse.json({
    ...report,
    algorithm: SEAL_ALGORITHM,
    genesisSeal: GENESIS_SEAL,
    entityChecks,
    tamperedEntities: tampered.length,
    ok: tampered.length === 0,
    shareable: true,
  });
}