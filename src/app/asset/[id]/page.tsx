import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { readScope } from "@/lib/auth/session";
import { evaluate, getAsset, getProfile, listEvents } from "@/lib/db/repo";
import { getAlgorithm } from "@/lib/engine/index";
import { DecisionPanel } from "@/components/decision-panel";
import { SITE } from "@/lib/config/site";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { id } = await params;
  return {
    title: `Asset ${id.slice(0, 8)}`,
    description: "Quantum cost ledger, factor evidence and sealed audit trail for one primitive.",
    alternates: { canonical: `${SITE.liveUrl}/asset/${id}` },
  };
}

function fmt(value: number): string {
  if (!Number.isFinite(value)) return "—";
  if (value >= 1e15) return value.toExponential(3);
  return Math.round(value).toLocaleString();
}

export default async function AssetPage({ params }: Params) {
  const { id } = await params;
  const scope = await readScope();
  if (!scope) notFound();

  const asset = await getAsset(scope, id);
  if (!asset) notFound();

  const [events, profile] = await Promise.all([listEvents(scope, id), getProfile(scope)]);
  const exposure = evaluate(
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
    {
      horizonYear: profile.horizonYear,
      regimeId: profile.regimeId,
      attackerProfile: profile.attackerProfile,
    },
  );
  const spec = getAlgorithm(asset.algorithm);
  const quantum = exposure.quantum;

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-10 sm:px-6">
      <Link href="/survey" className="inline-flex items-center gap-1.5 text-sm text-ash-400 hover:text-copper-300">
        <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        Back to the estate
      </Link>

      <header className="mt-4 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="label">Primitive · {asset.system}</p>
          <h1 className="mt-1 text-3xl font-semibold">{asset.label}</h1>
          <p className="mt-2 max-w-2xl text-sm text-ash-400">
            {asset.algorithm} ({spec?.label ?? "unclassified"}) · {asset.usage} · {asset.deployment} ·{" "}
            {asset.dataClass} · {asset.confidentialityYears} year confidentiality window · owned by{" "}
            {asset.ownerTeam}
            {asset.notes ? ` — ${asset.notes}` : ""}
          </p>
        </div>
        <div className="text-right">
          <span className={`tabular inline-block rounded-[2px] border px-2 py-1 text-sm band-${asset.exposureBand}`}>
            {asset.exposureBand} · {asset.exposureScore}
          </span>
          <p className="tabular mt-1 text-xs text-ash-500">
            raw {exposure.rawScore} × relief {exposure.decisionModifier}
          </p>
        </div>
      </header>

      <div className="mt-8 grid gap-6 lg:grid-cols-[1.15fr_1fr]">
        <div className="space-y-6">
          <section className="slab-raised p-5">
            <p className="label">Quantum cost ledger</p>
            <h2 className="mt-1 text-lg font-semibold">
              {quantum.attack === "none"
                ? "No quantum reduction applies"
                : quantum.attack === "shor"
                  ? "Shor factoring cost"
                  : "Grover search cost"}
            </h2>
            <dl className="mt-4 grid grid-cols-2 gap-4 font-data text-sm sm:grid-cols-4">
              {[
                { label: "Logical qubits", value: quantum.logicalQubits ? fmt(quantum.logicalQubits) : "—" },
                { label: `Physical (d=${quantum.codeDistance})`, value: quantum.physicalQubits ? fmt(quantum.physicalQubits) : "—" },
                { label: "Non-Clifford ops", value: quantum.toffoliCount ? fmt(quantum.toffoliCount) : "—" },
                { label: "Logical depth", value: quantum.logicalDepth ? fmt(quantum.logicalDepth) : "—" },
              ].map((entry) => (
                <div key={entry.label}>
                  <dt className="label">{entry.label}</dt>
                  <dd className="tabular mt-1 text-ash-100">{entry.value}</dd>
                </div>
              ))}
            </dl>

            {Object.keys(quantum.daysToBreak).length > 0 ? (
              <div className="mt-5 overflow-x-auto">
                <table className="w-full min-w-[26rem] text-left font-data text-xs">
                  <caption className="sr-only">Estimated days to break by year</caption>
                  <thead>
                    <tr className="border-b border-basalt-700 text-ash-500">
                      <th scope="col" className="py-1.5 pr-3 font-normal">Year</th>
                      <th scope="col" className="py-1.5 pr-3 font-normal">Days to break</th>
                      <th scope="col" className="py-1.5 font-normal">Harvested?</th>
                    </tr>
                  </thead>
                  <tbody>
                    {Object.entries(quantum.daysToBreak).map(([year, days]) => (
                      <tr key={year} className="border-b border-basalt-800">
                        <td className="tabular py-1.5 pr-3 text-ash-300">{year}</td>
                        <td className="tabular py-1.5 pr-3 text-ash-200">{fmt(days)}</td>
                        <td className="tabular py-1.5">
                          {days <= 1 ? (
                            <span className="text-hazard-300">yes — under a day</span>
                          ) : days <= 30 ? (
                            <span className="text-copper-300">within a month</span>
                          ) : (
                            <span className="text-ash-500">no</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : null}

            <div className="mt-4 flex flex-wrap gap-2">
              {(["conservative", "expected", "aggressive"] as const).map((key) => (
                <span
                  key={key}
                  className="tabular rounded-[2px] border border-basalt-700 bg-basalt-900 px-2 py-1 text-[0.65rem] text-ash-400"
                >
                  {key}: {quantum.ruptureYear[key] ?? "> 2045"}
                </span>
              ))}
            </div>

            <p className="mt-4 border-t border-basalt-700 pt-3 font-data text-[0.7rem] leading-relaxed text-ash-500">
              {quantum.method}
            </p>
          </section>

          <section className="slab-raised p-5">
            <p className="label">Factor evidence</p>
            <h2 className="mt-1 text-lg font-semibold">Why {asset.exposureScore}, not something else</h2>
            <ul className="mt-4 space-y-4">
              {exposure.factors.map((factor) => (
                <li key={factor.key}>
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <span className="text-sm text-ash-200">{factor.label}</span>
                    <span className="tabular text-xs text-ash-500">
                      weight {factor.weight} · {factor.points} pts
                    </span>
                  </div>
                  <div
                    className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-basalt-800"
                    role="img"
                    aria-label={`${factor.label}: ${Math.round(factor.value * 100)} percent of its weight`}
                  >
                    <div
                      className="h-full rounded-full"
                      style={{
                        width: `${Math.round(factor.value * 100)}%`,
                        background:
                          factor.value > 0.66
                            ? "var(--color-hazard-400)"
                            : factor.value > 0.33
                              ? "var(--color-copper-400)"
                              : "var(--color-verd-400)",
                      }}
                    />
                  </div>
                  <p className="mt-1.5 text-xs leading-relaxed text-ash-400">{factor.evidence}</p>
                  <p className="mt-0.5 text-xs text-verd-300">Lever: {factor.lever}</p>
                </li>
              ))}
            </ul>
          </section>
        </div>

        <div className="space-y-6">
          <DecisionPanel asset={asset} exposure={exposure} />

          <section className="slab p-5">
            <p className="label">Compliance</p>
            <h2 className="mt-1 text-base font-semibold">{exposure.compliance.regimeLabel}</h2>
            <p className="mt-1 font-data text-[0.7rem] text-ash-500">{exposure.compliance.milestones[0]?.citation ?? ""}</p>
            <ul className="mt-3 space-y-2">
              {exposure.compliance.milestones.map((milestone) => (
                <li key={milestone.id} className="flex items-baseline justify-between gap-3 border-l border-copper-600 pl-3">
                  <span className="text-sm text-ash-300">{milestone.label}</span>
                  <span className="tabular text-sm text-copper-300">{milestone.year}</span>
                </li>
              ))}
            </ul>
            <p className="mt-3 text-xs text-ash-400">
              Binding constraint: <span className="text-copper-300">{exposure.bindingConstraint}</span> ·
              exposure window {exposure.exposureYears} year(s) · estimated migration effort{" "}
              {exposure.effortYears} year(s)
            </p>
          </section>

          <section className="slab p-5">
            <p className="label">Audit trail · {events.length} sealed event(s)</p>
            <ol className="mt-3 space-y-3">
              {events.map((event) => (
                <li key={event.id} className="border-l border-verd-700 pl-3">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <span className="text-sm text-ash-200">#{event.seq} {event.type}</span>
                    <span className="tabular text-[0.65rem] text-ash-500">{event.createdAt.slice(0, 19).replace("T", " ")}</span>
                  </div>
                  <p className="tabular mt-0.5 break-all text-[0.65rem] text-ash-500">
                    {event.seal}
                  </p>
                  {event.payload.reason ? (
                    <p className="mt-1 text-xs text-ash-400">{String(event.payload.reason)}</p>
                  ) : null}
                  {event.payload.decision ? (
                    <p className="mt-1 text-xs text-ash-400">decision → {String(event.payload.decision)}</p>
                  ) : null}
                </li>
              ))}
            </ol>
            <p className="mt-4 border-t border-basalt-700 pt-3 font-data text-[0.7rem] text-ash-500">
              chain head {asset.seal?.slice(0, 24) ?? "—"}… · verify the whole estate at{" "}
              <Link href="/verify" className="link-underline text-copper-300">
                /verify
              </Link>
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}