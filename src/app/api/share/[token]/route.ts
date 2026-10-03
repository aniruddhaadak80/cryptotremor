import { NextResponse } from "next/server";
import { errorResponse } from "@/lib/api";
import { resolveScope } from "@/lib/auth/session";
import { getShare } from "@/lib/db/repo";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { params: Promise<{ token: string }> };

/**
 * The only unauthenticated read surface. It returns a frozen snapshot, never
 * live rows, so a leaked link cannot expose or mutate an estate.
 */
export async function GET(_request: Request, { params }: Params) {
  const { token } = await params;
  if (!/^[0-9a-f]{32}$/.test(token)) {
    return errorResponse(422, "bad_token", "That share link is malformed.");
  }
  const share = await getShare(token);
  if (!share) return errorResponse(404, "not_found", "That share link does not exist or was revoked.");

  void resolveScope;
  const report = share.report as { integrity?: { genesisSeal?: string; headSeal?: string | null; events?: number } };
  return NextResponse.json({
    token: share.token,
    label: share.label,
    createdAt: share.createdAt,
    assetCount: share.assetCount,
    report: share.report,
    chain: {
      genesisSeal: report.integrity?.genesisSeal ?? null,
      headSeal: report.integrity?.headSeal ?? null,
      events: report.integrity?.events ?? 0,
      replayable: Boolean(report.integrity?.headSeal),
    },
    verification: {
      method: "SHA-384 hash chain over canonical JSON events",
      note: "The snapshot stores the chain head that was current when it was created. Recompute with POST /api/verify on the owner's session to compare.",
    },
  });
}