import { NextResponse } from "next/server";
import { SITE } from "@/lib/config/site";
import { errorResponse, readJson } from "@/lib/api";
import { resolveScope } from "@/lib/auth/session";
import { createShare, getProfile, listAssets, listEvents, listShares, deleteShare } from "@/lib/db/repo";
import { evaluate } from "@/lib/db/repo";
import { fetchStrata } from "@/lib/feed/strata";
import { replayScope } from "@/lib/integrity/seal";
import { tombstonedIds } from "@/lib/db/repo";
import { buildReport, reportToCsv, reportToMarkdown } from "@/lib/report";
import { WRITE_LIMIT_PER_MINUTE, takeQuota } from "@/lib/rate-limit";
import { shareSchema, zodMessage } from "@/lib/validate";
import { SAFETY_DISCLAIMER } from "@/lib/report";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * The origin the visitor actually reached, so a preview deployment hands out
 * links that work. Falls back to the configured site URL behind a proxy that
 * does not forward the host header.
 */
function requestOrigin(request: Request): string {
  const forwardedHost = request.headers.get("x-forwarded-host");
  const host = forwardedHost ?? request.headers.get("host");
  if (!host) return SITE.liveUrl;
  const protocol =
    request.headers.get("x-forwarded-proto") ??
    (host.startsWith("localhost") || host.startsWith("127.") ? "http" : "https");
  return `${protocol}://${host}`;
}

async function composeReport(scope: string) {
  const profile = await getProfile(scope);
  const assets = await listAssets(scope, {});
  const events = await listEvents(scope);
  const exposures = new Map<string, ReturnType<typeof evaluate>>();
  for (const asset of assets) {
    exposures.set(
      asset.id,
      evaluate(
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
        { horizonYear: profile.horizonYear, regimeId: profile.regimeId, attackerProfile: profile.attackerProfile },
      ),
    );
  }
  const feed = await fetchStrata().catch(() => null);
  const integrity = replayScope(events, await tombstonedIds(scope));
  const report = buildReport({
    org: profile.orgName,
    profile,
    assets,
    exposures,
    provenance: {
      kev: feed
        ? {
            status: feed.kev.status,
            source: feed.kev.source,
            sourceUrl: feed.kev.sourceUrl,
            fetchedAt: feed.kev.fetchedAt,
            attribution: feed.kev.attribution,
            note: feed.kev.note,
          }
        : {
            status: "fallback",
            source: "CISA Known Exploited Vulnerabilities catalog",
            sourceUrl: "https://www.cisa.gov/sites/default/files/feeds/known_exploited_vulnerabilities.json",
            fetchedAt: integrity.verifiedAt,
            attribution: "CISA",
            note: "Feed unreachable while composing this report.",
          },
      research: feed
        ? {
            status: feed.research.status,
            source: feed.research.source,
            sourceUrl: feed.research.sourceUrl,
            fetchedAt: feed.research.fetchedAt,
            attribution: feed.research.attribution,
            note: feed.research.note,
          }
        : {
            status: "fallback",
            source: "arXiv quant-ph",
            sourceUrl: "https://arxiv.org/list/quant-ph/recent",
            fetchedAt: integrity.verifiedAt,
            attribution: "arXiv",
            note: "Feed unreachable while composing this report.",
          },
    },
    integrity,
  });
  return { report, assets, integrity };
}

/** GET /api/report?format=json|markdown|csv */
export async function GET(request: Request) {
  const scope = await resolveScope(request, { create: false });
  if (!scope) return errorResponse(404, "no_session", "No session scope. Import an estate first.");
  const params = new URL(request.url).searchParams;
  if (params.get("grants") === "1") {
    return NextResponse.json({ grants: await listShares(scope) });
  }
  const format = params.get("format") ?? "json";
  const { report } = await composeReport(scope);
  const stamp = report.generatedAt.slice(0, 10);

  if (format === "markdown" || format === "md") {
    return new NextResponse(reportToMarkdown(report, requestOrigin(request)), {
      headers: {
        "content-type": "text/markdown; charset=utf-8",
        "content-disposition": `attachment; filename="cryptotremor-readiness-${stamp}.md"`,
      },
    });
  }
  if (format === "csv") {
    return new NextResponse(reportToCsv(report), {
      headers: {
        "content-type": "text/csv; charset=utf-8",
        "content-disposition": `attachment; filename="cryptotremor-readiness-${stamp}.csv"`,
      },
    });
  }
  return NextResponse.json({ report, disclaimer: SAFETY_DISCLAIMER });
}

/** POST /api/report → freeze a shareable snapshot for partners. */
export async function POST(request: Request) {
  const scope = await resolveScope(request, { create: true });
  if (!scope) return errorResponse(401, "no_session", "Could not establish a session scope.");

  const quota = takeQuota(`share:${scope}`, WRITE_LIMIT_PER_MINUTE);
  if (!quota.allowed) {
    return NextResponse.json(
      { error: { code: "rate_limited", message: `Too many requests. Retry in ${quota.retryAfterSeconds}s.` } },
      { status: 429 },
    );
  }

  const body = await readJson(request);
  if (!body.ok) return errorResponse(400, "invalid_json", body.message);
  const parsed = shareSchema.safeParse(body.value ?? {});
  if (!parsed.success) {
    return errorResponse(422, "validation_failed", zodMessage(parsed.error), parsed.error.issues);
  }

  const { report, assets } = await composeReport(scope);
  const grant = await createShare(
    scope,
    parsed.data.label,
    report as unknown as Record<string, unknown>,
    assets.length,
  );

  return NextResponse.json(
    {
      grant,
      url: `${requestOrigin(request)}/r/${grant.token}`,
      disclaimer: SAFETY_DISCLAIMER,
    },
    { status: 201 },
  );
}

/** DELETE /api/report?token=... revokes a share link. */
export async function DELETE(request: Request) {
  const scope = await resolveScope(request, { create: false });
  if (!scope) return errorResponse(404, "no_session", "No session scope.");
  const token = new URL(request.url).searchParams.get("token");
  if (!token) return errorResponse(422, "missing_token", "Pass ?token= to revoke.");
  const removed = await deleteShare(scope, token);
  if (!removed) return errorResponse(404, "not_found", "No such share link in your scope.");
  return NextResponse.json({ revoked: true, token });
}
