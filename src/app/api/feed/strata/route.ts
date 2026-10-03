import { NextResponse } from "next/server";
import { fetchStrata } from "@/lib/feed/strata";

export const runtime = "nodejs";
export const revalidate = 3600;

/**
 * Normalized external signals. Always answers with the provenance of each feed
 * so a caller can tell live data from the sealed fallback.
 */
export async function GET() {
  const feed = await fetchStrata();
  return NextResponse.json(feed, {
    headers: {
      "cache-control": "public, max-age=0, s-maxage=3600, stale-while-revalidate=86400",
    },
  });
}