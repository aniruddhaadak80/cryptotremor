import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { getShare } from "@/lib/db/repo";
import { GitHubLink } from "@/components/github-link";
import { SITE } from "@/lib/config/site";
import type { Report } from "@/lib/report";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ token: string }> };

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { token } = await params;
  return {
    title: "Partner report",
    description: "A frozen post-quantum readiness snapshot with provenance and an integrity seal.",
    robots: { index: false, follow: false },
    alternates: { canonical: `${SITE.liveUrl}/r/${token}` },
  };
}

/**
 * Public, read-only partner view. It renders the stored snapshot and nothing
 * else: no session is read, no live rows are touched, and no interactive control
 * can mutate the owner's estate.
 */
export default async function SharedReportPage({ params }: Params) {
  const { token } = await params;
  if (!/^[0-9a-f]{32}$/.test(token)) notFound();
  const share = await getShare(token);
  if (!share) notFound();
  const report = share.report as unknown as Report;

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-10 sm:px-6">
      <header className="border-b border-basalt-700 pb-6">
        <p className="label">Frozen snapshot · no account required</p>
        <h1 className="mt-2 text-3xl font-semibold">{share.label}</h1>
        <p className="mt-2 text-sm text-ash-400">
          {report.org} · generated {report.generatedAt.slice(0, 19).replace("T", " ")} UTC · engine{" "}
          <span className="tabular text-copper-300">{report.engineVersion}</span>
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          <GitHubLink variant="secondary" label="Star on GitHub" />
          <Link href="/" className="btn btn-ghost">
            Run your own survey
          </Link>
        </div>
      </header>

      <section className="mt-6 grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {[
          { label: "Assets", value: report.totals.assets },
          { label: "Active", value: report.totals.active },
          { label: "Critical", value: report.totals.critical },
          { label: "Urgent", value: report.totals.urgent },
          { label: "Mean exposure", value: report.totals.meanExposure },
          { label: "Earliest rupture", value: report.totals.earliestRuptureYear ?? "—" },
        ].map((entry) => (
          <div key={entry.label} className="slab p-3">
            <p className="label">{entry.label}</p>
            <p className="tabular mt-1 text-xl text-ash-100">{entry.value}</p>
          </div>
        ))}
      </section>

      <section className="mt-8">
        <p className="label">Migration waves</p>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[34rem] text-left text-sm">
            <thead>
              <tr className="border-b border-basalt-700 text-ash-500">
                <th scope="col" className="py-2 pr-3 font-normal">Wave</th>
                <th scope="col" className="py-2 pr-3 font-normal">System</th>
                <th scope="col" className="py-2 pr-3 font-normal">Relieved</th>
                <th scope="col" className="py-2 pr-3 font-normal">First rupture</th>
                <th scope="col" className="py-2 font-normal">Selected by</th>
              </tr>
            </thead>
            <tbody>
              {report.waves.map((wave) => (
                <tr key={wave.wave} className="border-b border-basalt-800">
                  <td className="tabular py-2 pr-3 text-ash-400">{wave.wave}</td>
                  <td className="py-2 pr-3 text-ash-100">{wave.system}</td>
                  <td className="tabular py-2 pr-3 text-copper-300">{wave.exposureRelieved}</td>
                  <td className="tabular py-2 pr-3 text-ash-300">{wave.firstRuptureYear ?? "—"}</td>
                  <td className="tabular py-2 text-xs text-ash-400">
                    {wave.selectedBy}
                    {wave.amplification ? ` · ${wave.amplification}x` : ""}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="mt-8">
        <p className="label">Assets</p>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[46rem] text-left text-sm">
            <thead>
              <tr className="border-b border-basalt-700 text-ash-500">
                <th scope="col" className="py-2 pr-3 font-normal">Asset</th>
                <th scope="col" className="py-2 pr-3 font-normal">Algorithm</th>
                <th scope="col" className="py-2 pr-3 font-normal">Exposure</th>
                <th scope="col" className="py-2 pr-3 font-normal">Band</th>
                <th scope="col" className="py-2 pr-3 font-normal">Rupture</th>
                <th scope="col" className="py-2 font-normal">Binding</th>
              </tr>
            </thead>
            <tbody>
              {report.assets.map((asset) => (
                <tr key={asset.id} className="border-b border-basalt-800">
                  <td className="py-2 pr-3 text-ash-100">{asset.label}</td>
                  <td className="tabular py-2 pr-3 text-ash-300">{asset.algorithm}</td>
                  <td className="tabular py-2 pr-3 text-copper-300">{asset.exposureScore}</td>
                  <td className="py-2 pr-3">
                    <span className={`tabular rounded-[2px] border px-1.5 py-0.5 text-xs band-${asset.band}`}>
                      {asset.band}
                    </span>
                  </td>
                  <td className="tabular py-2 pr-3 text-ash-300">{asset.ruptureYear ?? "—"}</td>
                  <td className="tabular py-2 text-xs text-ash-400">{asset.bindingConstraint}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="mt-8 grid gap-4 sm:grid-cols-2">
        <div className="slab p-4">
          <p className="label">Provenance</p>
          <ul className="mt-2 space-y-2 text-xs text-ash-400">
            {(["kev", "research"] as const).map((key) => (
              <li key={key}>
                <span className="text-ash-200">{report.provenance[key].attribution}</span> (
                {report.provenance[key].status}) — {report.provenance[key].source}, retrieved{" "}
                {report.provenance[key].fetchedAt.slice(0, 19).replace("T", " ")}.
              </li>
            ))}
          </ul>
          <p className="mt-3 text-xs text-ash-500">{report.settings.regimeCitation}</p>
        </div>
        <div className="slab p-4">
          <p className="label">Integrity</p>
          <dl className="mt-2 space-y-1 font-data text-xs">
            <div className="flex justify-between gap-3">
              <dt className="text-ash-500">genesis</dt>
              <dd className="truncate text-ash-300">{report.integrity.genesisSeal}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-ash-500">head</dt>
              <dd className="truncate text-ash-300">{report.integrity.headSeal ?? "none"}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-ash-500">events</dt>
              <dd className="tabular text-ash-300">{report.integrity.events}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-ash-500">replay</dt>
              <dd className={report.integrity.ok ? "text-verd-300" : "text-hazard-300"}>
                {report.integrity.ok ? "clean" : "broken"}
              </dd>
            </div>
          </dl>
          <p className="mt-3 text-xs text-ash-500">
            SHA-384 chain over canonical JSON. Verification runs in the owner&apos;s session at{" "}
            <Link href="/verify" className="link-underline text-copper-300">
              /verify
            </Link>
            .
          </p>
        </div>
      </section>

      <p className="mt-8 border-t border-basalt-700 pt-4 text-xs leading-relaxed text-ash-500">
        {report.disclaimer}
      </p>
    </div>
  );
}