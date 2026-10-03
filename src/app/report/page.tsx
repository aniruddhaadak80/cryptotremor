import type { Metadata } from "next";
import Link from "next/link";
import { readScope } from "@/lib/auth/session";
import { countAssets } from "@/lib/db/repo";
import { ReportActions } from "@/components/report-actions";
import { GitHubLink } from "@/components/github-link";
import { SAFETY_DISCLAIMER } from "@/lib/report";
import { SITE } from "@/lib/config/site";

export const metadata: Metadata = {
  title: "Report",
  description:
    "Export the post-quantum readiness survey as JSON, Markdown or CSV, or freeze a snapshot a partner can read and verify without an account.",
  alternates: { canonical: `${SITE.liveUrl}/report` },
};

export const dynamic = "force-dynamic";

const FORMATS = [
  { format: "json", href: "/api/report?format=json", description: "full report with provenance" },
  { format: "markdown", href: "/api/report?format=markdown", description: "shareable summary" },
  { format: "csv", href: "/api/report?format=csv", description: "spreadsheet per asset" },
];

export default async function ReportPage() {
  const scope = await readScope();
  const assetCount = scope ? await countAssets(scope) : 0;

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-10 sm:px-6">
      <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="label">Takeaway artifact</p>
          <h1 className="mt-2 text-3xl font-semibold">A report a partner can check</h1>
          <p className="mt-2 max-w-3xl text-sm leading-relaxed text-ash-400">
            The export is not a screenshot. It carries the per-asset quantum cost ledger, the wave
            plan, the provenance of every external feed with its retrieval time, and the SHA-384 chain
            head so a recipient can tell whether the document was edited after the fact.
          </p>
        </div>
        <GitHubLink variant="ghost" label="View source" />
      </header>

      {assetCount === 0 ? (
        <p className="slab mb-6 border-hazard-500 p-4 text-sm text-hazard-300">
          {scope
            ? "This session has an empty estate, so an export would carry no assets. "
            : "This session has no estate yet, so the report is empty. "}
          <Link href="/" className="link-underline">
            Load the reference estate
          </Link>{" "}
          to produce a report worth sending.
        </p>
      ) : null}

      <ReportActions hasEstate={assetCount > 0} formats={FORMATS} />

      <section className="slab mt-6 p-5">
        <p className="label">What a recipient can verify</p>
        <ul className="mt-3 space-y-2 text-sm text-ash-400">
          <li className="border-l border-copper-600 pl-3">
            Chain head and genesis value, so replay can be reproduced against{" "}
            <Link href="/verify" className="link-underline text-copper-300">
              /verify
            </Link>
            .
          </li>
          <li className="border-l border-copper-600 pl-3">
            Whether the CISA KEV and arXiv signals were live or the sealed fallback at the moment of
            export.
          </li>
          <li className="border-l border-copper-600 pl-3">
            The exact engine version, compliance regime and attacker scenario behind every number.
          </li>
        </ul>
        <p className="mt-4 border-t border-basalt-700 pt-3 text-xs leading-relaxed text-ash-500">
          {SAFETY_DISCLAIMER}
        </p>
      </section>
    </div>
  );
}