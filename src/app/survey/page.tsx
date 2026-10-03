import type { Metadata } from "next";
import { Suspense } from "react";
import { readScope } from "@/lib/auth/session";
import { listAssets } from "@/lib/db/repo";
import { SurveyWorkspace } from "@/components/survey-workspace";
import type { AssetListResponse } from "@/components/survey-workspace";
import { SITE } from "@/lib/config/site";

export const metadata: Metadata = {
  title: "Survey workspace",
  description:
    "Filter, search, sort, create and inspect every cryptographic primitive in the estate, with exposure score, band and modelled rupture year.",
  alternates: { canonical: `${SITE.liveUrl}/survey` },
};

export const dynamic = "force-dynamic";

export default async function SurveyPage() {
  const scope = await readScope();
  const initial: AssetListResponse = scope
    ? await (async () => {
        const assets = await listAssets(scope, {});
        return { assets, count: assets.length, total: assets.length, established: true };
      })()
    : { assets: [], count: 0, total: 0, established: false };

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-10 sm:px-6">
      <header className="mb-6">
        <p className="label">Workspace</p>
        <h1 className="mt-2 text-3xl font-semibold">The estate</h1>
        <p className="mt-2 max-w-3xl text-sm leading-relaxed text-ash-400">
          Every row is a cryptographic primitive with a real modelled cost of attack. Filters live in
          the URL, so a filtered view can be shared or reloaded without losing state. Nothing here is
          seeded: an estate exists only once you import one.
        </p>
      </header>

      <Suspense fallback={<p className="slab p-4 text-sm text-ash-400">Loading the workspace…</p>}>
        <SurveyWorkspace initial={initial} />
      </Suspense>
    </div>
  );
}