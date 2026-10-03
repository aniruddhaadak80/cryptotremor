import type { Metadata } from "next";
import Link from "next/link";
import { readScope } from "@/lib/auth/session";
import { getProfile, listAssets } from "@/lib/db/repo";
import { ENGINE_VERSION, buildSurveyAnalysis, buildWaves } from "@/lib/engine/index";
import { RuptureConsole } from "@/components/rupture-console";
import type { ConsoleAsset } from "@/components/rupture-console";
import { GitHubLink } from "@/components/github-link";
import { fetchStrata } from "@/lib/feed/strata";
import { SITE } from "@/lib/config/site";

export const metadata: Metadata = {
  title: "Seismograph",
  description:
    "Scrub the rupture timeline, watch exposure recompute, and see the Grover-sequenced migration waves and the strata cross-section of the estate.",
  alternates: { canonical: `${SITE.liveUrl}/seismograph` },
};

export const dynamic = "force-dynamic";

export default async function SeismographPage() {
  const scope = await readScope();
  const profile = scope
    ? await getProfile(scope)
    : { horizonYear: 2026, regimeId: "nist-ir-8547", attackerProfile: "expected" };
  const assets = scope ? await listAssets(scope, {}) : [];
  const active = assets.filter((asset) => asset.status === "active");
  const waves = buildWaves(assets);
  const analysis = buildSurveyAnalysis(assets, {
    horizonYear: profile.horizonYear,
    regimeId: profile.regimeId,
    waves,
  });
  const feed = await fetchStrata().catch(() => null);

  const consoleAssets: ConsoleAsset[] = active.map((asset) => ({
    id: asset.id,
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
    decision: asset.decision,
    status: asset.status,
    exposureScore: asset.exposureScore,
  }));

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-10 sm:px-6">
      <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="label">Analysis</p>
          <h1 className="mt-2 text-3xl font-semibold">The rupture timeline</h1>
          <p className="mt-2 max-w-3xl text-sm leading-relaxed text-ash-400">
            The trace records, for each year, how much data captured that year would still be inside
            its confidentiality window once the modelled break arrives. It only grows to the right,
            because the exposure compounds. Drag the rail and the whole survey is re-scored.
          </p>
        </div>
        <div className="flex gap-2">
          <Link href="/survey" className="btn btn-secondary">
            Edit the estate
          </Link>
          <GitHubLink variant="ghost" label="View source" />
        </div>
      </header>

      {assets.length === 0 ? (
        <p className="slab mb-6 border-hazard-500 p-4 text-sm text-hazard-300">
          This session has no estate, so the trace is empty and the waves are computed from nothing.
          {" "}
          <Link href="/" className="link-underline">
            Load the reference estate
          </Link>{" "}
          to see real numbers.
        </p>
      ) : null}

      <RuptureConsole
        trace={analysis.trace}
        assets={consoleAssets}
        initialYear={profile.horizonYear}
        regimeId={profile.regimeId}
        attackerProfile={profile.attackerProfile}
        engineVersion={ENGINE_VERSION}
        established={Boolean(scope) && assets.length > 0}
      />

      <div className="mt-6 grid gap-6 lg:grid-cols-[1.1fr_1fr]">
        <section className="slab-raised p-5">
          <p className="label">Migration waves · Grover amplitude amplification</p>
          <h2 className="mt-1 text-lg font-semibold">Which system to fix first</h2>
          <p className="mt-2 text-sm leading-relaxed text-ash-400">
            A wave is a system, because replacing one library retires every primitive that depends on
            it. Each round searches the remaining candidates with Grover&apos;s algorithm and rotates
            out the winner, so the reported amplification is the measured probability gain over the
            uniform baseline.
          </p>
          {waves.length === 0 ? (
            <p className="mt-4 text-sm text-ash-400">No waves: nothing in the estate has residual exposure.</p>
          ) : (
            <ol className="mt-4 space-y-3">
              {waves.slice(0, 8).map((wave) => (
                <li key={wave.wave} className="border-l border-copper-600 pl-3">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <span className="text-sm text-ash-100">
                      Wave {wave.wave} · {wave.system}
                    </span>
                    <span className="tabular text-xs text-copper-300">
                      {wave.exposureRelieved} pts · {wave.assets.length} asset(s)
                    </span>
                  </div>
                  <p className="mt-1 text-xs leading-relaxed text-ash-400">{wave.rationale}</p>
                  <p className="mt-1 font-data text-[0.65rem] text-ash-500">
                    first rupture {wave.firstRuptureYear ?? "—"} · selected by {wave.selectedBy}
                    {wave.amplification ? ` at ${wave.amplification}x baseline` : ""}
                  </p>
                </li>
              ))}
            </ol>
          )}
        </section>

        <section className="slab-raised p-5">
          <p className="label">Strata cross-section</p>
          <h2 className="mt-1 text-lg font-semibold">Systems ordered by how soon they break</h2>
          {analysis.strata.length === 0 ? (
            <p className="mt-3 text-sm text-ash-400">Nothing to stratify yet.</p>
          ) : (
            <ul className="mt-4 space-y-2">
              {analysis.strata.map((band) => {
                const depthPercent = Math.min(
                  100,
                  18 + band.depth * 7 + (band.earliestRuptureYear ? 0 : 30),
                );
                return (
                  <li key={band.system} className="relative overflow-hidden rounded-[2px] border border-basalt-700 bg-basalt-900 px-3 py-2">
                    <span
                      aria-hidden="true"
                      className="absolute inset-y-0 left-0"
                      style={{
                        width: `${depthPercent}%`,
                        background: `linear-gradient(90deg, rgba(201,121,63,0.22), rgba(79,145,130,0.06))`,
                      }}
                    />
                    <span className="relative flex flex-wrap items-baseline justify-between gap-2">
                      <span className="text-sm text-ash-100">{band.system}</span>
                      <span className="tabular text-xs text-ash-400">
                        depth {band.depth} · {band.assets} asset(s) · mean {band.meanExposure}
                      </span>
                    </span>
                    <span className="relative mt-0.5 block font-data text-[0.65rem] text-ash-500">
                      {band.dominantAlgorithm} · earliest rupture {band.earliestRuptureYear ?? "—"}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}

          <div className="mt-5 border-t border-basalt-700 pt-4">
            <p className="label">External signals</p>
            <p className="tabular mt-1 text-xs text-ash-400">
              CISA KEV {feed?.kev.status ?? "unreachable"} · arXiv {feed?.research.status ?? "unreachable"}
              {feed ? ` · fetched ${feed.kev.fetchedAt.slice(0, 19).replace("T", " ")}` : ""}
            </p>
            <p className="mt-1 text-xs text-ash-500">
              {feed?.kev.note ?? "Feeds are unavailable right now; the survey does not depend on them."}
            </p>
          </div>
        </section>
      </div>
    </div>
  );
}