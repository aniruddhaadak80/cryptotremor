import { NextResponse } from "next/server";
import { storeDescription } from "@/lib/db/client";
import { ENGINE_VERSION } from "@/lib/engine/index";
import { fetchStrata } from "@/lib/feed/strata";
import { ensureScope } from "@/lib/auth/session";
import { countAssets } from "@/lib/db/repo";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Health is a real probe, not a static object: it touches the production
 * persistence path and both external feeds, and reports what it found. A local
 * adapter is reported honestly as `pglite`, never disguised as production.
 */
export async function GET() {
  const started = Date.now();
  let persistence: { ok: boolean; kind: string; detail: string; persistent: boolean };
  let assets = 0;
  try {
    const store = await storeDescription();
    const scope = (await ensureScope()).scope;
    assets = await countAssets(scope);
    persistence = { ok: true, ...store };
  } catch (error) {
    return NextResponse.json(
      {
        status: "degraded",
        engine: ENGINE_VERSION,
        persistence: {
          ok: false,
          kind: "unknown",
          detail: error instanceof Error ? error.message : "unreachable",
          persistent: false,
        },
        feeds: { status: "not-checked" },
        latencyMs: Date.now() - started,
      },
      { status: 503 },
    );
  }

  const feed = await fetchStrata().catch(() => null);
  const liveFeeds = feed
    ? [feed.kev.status, feed.research.status].filter((status) => status === "live").length
    : 0;

  return NextResponse.json({
    status: "ok",
    engine: ENGINE_VERSION,
    persistence,
    assetsInScope: assets,
    feeds: {
      status: feed ? (liveFeeds === 2 ? "live" : liveFeeds > 0 ? "partial" : "fallback") : "unreachable",
      live: liveFeeds,
      sources: feed
        ? {
            kev: { status: feed.kev.status, fetchedAt: feed.kev.fetchedAt, items: feed.kev.items.length },
            research: {
              status: feed.research.status,
              fetchedAt: feed.research.fetchedAt,
              items: feed.research.items.length,
            },
          }
        : null,
    },
    latencyMs: Date.now() - started,
    checkedAt: new Date().toISOString(),
  });
}