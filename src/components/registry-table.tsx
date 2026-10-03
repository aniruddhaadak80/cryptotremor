"use client";

import { useEffect, useState } from "react";
import { ALGORITHMS, COMPLIANCE_REGIMES, MANIFEST_TEMPLATE } from "@/lib/engine/index";

/**
 * The registries come from the API rather than being duplicated in the client, so
 * the manifest columns and policy milestones cannot drift from what the server
 * will actually accept.
 */
export function RegistryTable() {
  const [manifest, setManifest] = useState(MANIFEST_TEMPLATE);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void fetch("/api/settings", { cache: "no-store" })
      .then((response) => (response.ok ? response.json() : null))
      .then((payload: { manifestTemplate?: string } | null) => {
        if (!cancelled && payload?.manifestTemplate) setManifest(payload.manifestTemplate);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="space-y-6">
      <section className="slab-raised p-5">
        <p className="label">Algorithm registry</p>
        <h2 className="mt-1 text-lg font-semibold">What the engine knows about</h2>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[40rem] text-left text-sm">
            <thead>
              <tr className="border-b border-basalt-700 text-ash-500">
                <th scope="col" className="py-2 pr-3 font-normal">Algorithm</th>
                <th scope="col" className="py-2 pr-3 font-normal">Family</th>
                <th scope="col" className="py-2 pr-3 font-normal">Bits</th>
                <th scope="col" className="py-2 pr-3 font-normal">Attack</th>
                <th scope="col" className="py-2 pr-3 font-normal">PQ</th>
                <th scope="col" className="py-2 font-normal">Migrate to</th>
              </tr>
            </thead>
            <tbody>
              {ALGORITHMS.map((spec) => (
                <tr key={spec.id} className="border-b border-basalt-800 align-top">
                  <td className="py-2 pr-3">
                    <span className="text-ash-100">{spec.id}</span>
                    {spec.fips ? (
                      <span className="tabular ml-1.5 text-[0.65rem] text-verd-300">{spec.fips}</span>
                    ) : null}
                    <span className="mt-0.5 block text-xs text-ash-500">{spec.note}</span>
                  </td>
                  <td className="py-2 pr-3 text-xs text-ash-400">{spec.family}</td>
                  <td className="tabular py-2 pr-3 text-ash-300">{spec.bits}</td>
                  <td className="py-2 pr-3 text-xs text-ash-400">{spec.attack}</td>
                  <td className="py-2 pr-3 text-xs">
                    {spec.postQuantum ? (
                      <span className="text-verd-300">yes</span>
                    ) : (
                      <span className="text-hazard-300">no</span>
                    )}
                  </td>
                  <td className="py-2 text-xs text-ash-400">{spec.migrationTarget}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="slab-raised p-5">
        <p className="label">Compliance regimes</p>
        <h2 className="mt-1 text-lg font-semibold">Which clock binds you</h2>
        <ul className="mt-4 space-y-4">
          {COMPLIANCE_REGIMES.map((regime) => (
            <li key={regime.id} className="border-l border-copper-600 pl-3">
              <p className="text-sm text-ash-100">{regime.label}</p>
              <p className="mt-0.5 text-xs leading-relaxed text-ash-400">{regime.summary}</p>
              <p className="mt-1 font-data text-[0.65rem] text-ash-500">{regime.citation}</p>
              <ul className="mt-2 flex flex-wrap gap-2">
                {regime.milestones.map((milestone) => (
                  <li
                    key={milestone.id}
                    className="tabular rounded-[2px] border border-basalt-700 bg-basalt-900 px-2 py-0.5 text-[0.65rem] text-ash-300"
                  >
                    {milestone.year} · {milestone.label}
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ul>
      </section>

      <section className="slab-raised p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="label">Manifest contract</p>
            <h2 className="mt-1 text-lg font-semibold">Copy the reference manifest</h2>
          </div>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => {
              void navigator.clipboard?.writeText(manifest);
              setCopied(true);
              window.setTimeout(() => setCopied(false), 1800);
            }}
          >
            {copied ? "Copied" : "Copy manifest"}
          </button>
        </div>
        <pre className="tabular mt-3 overflow-auto rounded-[2px] bg-basalt-950 p-3 text-[0.7rem] leading-relaxed text-ash-300">
          {manifest}
        </pre>
      </section>
    </div>
  );
}