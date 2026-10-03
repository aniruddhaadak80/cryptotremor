"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Loader2, Plus, RefreshCw, Search, X } from "lucide-react";
import type { AssetDraft, CryptoAsset } from "@/lib/types";
import { DATA_CLASSES, DEPLOYMENTS, USAGES } from "@/lib/engine/index";
import { GitHubLink } from "./github-link";

export interface AssetListResponse {
  assets: CryptoAsset[];
  count: number;
  total: number;
  established: boolean;
}

const BANDS = ["critical", "urgent", "plan", "watch", "settled"] as const;

/** Workspace: filter, sort, search, create and inspect — all through the API. */
export function SurveyWorkspace({ initial }: { initial: AssetListResponse }) {
  const router = useRouter();
  const params = useSearchParams();
  const [data, setData] = useState<AssetListResponse>(initial);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);

  const query = useMemo(() => {
    const next = new URLSearchParams();
    for (const key of ["search", "usage", "deployment", "dataClass", "band", "status", "sort"]) {
      const value = params.get(key);
      if (value) next.set(key, value);
    }
    return next.toString();
  }, [params]);

  const refresh = useCallback(
    async (search: string) => {
      setLoading(true);
      setError(null);
      try {
        const response = await fetch(`/api/assets${search ? `?${search}` : ""}`, { cache: "no-store" });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        setData((await response.json()) as AssetListResponse);
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : "Could not load the estate.");
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  useEffect(() => {
    // Refreshed inside an async callback so state is never set synchronously
    // from the effect body.
    void (async () => {
      await refresh(query);
    })();
  }, [query, refresh]);

  function updateParam(key: string, value: string) {
    const next = new URLSearchParams(params.toString());
    if (value) next.set(key, value);
    else next.delete(key);
    router.replace(`/survey${next.toString() ? `?${next.toString()}` : ""}`, { scroll: false });
  }

  return (
    <div className="space-y-5">
      <div className="slab-raised flex flex-wrap items-center gap-2 p-3">
        <div className="relative min-w-[13rem] flex-1">
          <Search
            className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ash-500"
            aria-hidden="true"
          />
          <input
            className="input pl-8"
            placeholder="Search label, system, algorithm, team"
            aria-label="Search the estate"
            defaultValue={params.get("search") ?? ""}
            onKeyDown={(event) => {
              if (event.key === "Enter") updateParam("search", (event.target as HTMLInputElement).value);
            }}
            onBlur={(event) => updateParam("search", event.target.value)}
          />
        </div>

        <select
          className="select w-auto"
          aria-label="Filter by band"
          value={params.get("band") ?? ""}
          onChange={(event) => updateParam("band", event.target.value)}
        >
          <option value="">All bands</option>
          {BANDS.map((band) => (
            <option key={band} value={band}>
              {band}
            </option>
          ))}
        </select>

        <select
          className="select w-auto"
          aria-label="Filter by usage"
          value={params.get("usage") ?? ""}
          onChange={(event) => updateParam("usage", event.target.value)}
        >
          <option value="">All usages</option>
          {USAGES.map((usage) => (
            <option key={usage} value={usage}>
              {usage}
            </option>
          ))}
        </select>

        <select
          className="select w-auto"
          aria-label="Filter by deployment"
          value={params.get("deployment") ?? ""}
          onChange={(event) => updateParam("deployment", event.target.value)}
        >
          <option value="">All deployments</option>
          {DEPLOYMENTS.map((deployment) => (
            <option key={deployment} value={deployment}>
              {deployment}
            </option>
          ))}
        </select>

        <select
          className="select w-auto"
          aria-label="Filter by data class"
          value={params.get("dataClass") ?? ""}
          onChange={(event) => updateParam("dataClass", event.target.value)}
        >
          <option value="">All data classes</option>
          {DATA_CLASSES.map((value) => (
            <option key={value} value={value}>
              {value}
            </option>
          ))}
        </select>

        <select
          className="select w-auto"
          aria-label="Sort order"
          value={params.get("sort") ?? "score"}
          onChange={(event) => updateParam("sort", event.target.value)}
        >
          <option value="score">Highest exposure</option>
          <option value="rupture">Earliest rupture</option>
          <option value="label">Label</option>
          <option value="updated">Recently updated</option>
        </select>

        <button
          type="button"
          className="btn btn-secondary"
          onClick={() => void refresh(query)}
          disabled={loading}
        >
          {loading ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <RefreshCw className="h-4 w-4" aria-hidden="true" />}
          Refresh
        </button>

        {query ? (
          <button
            type="button"
            className="btn btn-ghost"
            onClick={() => router.replace("/survey", { scroll: false })}
          >
            <X className="h-4 w-4" aria-hidden="true" />
            Clear
          </button>
        ) : null}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="tabular text-sm text-ash-400" aria-live="polite">
          {loading ? "loading…" : `${data.count} shown · ${data.total} in scope`}
        </p>
        <div className="flex gap-2">
          <button type="button" className="btn btn-primary" onClick={() => setShowForm((value) => !value)}>
            <Plus className="h-4 w-4" aria-hidden="true" />
            {showForm ? "Close form" : "Add an asset"}
          </button>
          <GitHubLink variant="ghost" label="View source" />
        </div>
      </div>

      {showForm ? (
        <AssetForm
          onCreated={async () => {
            setShowForm(false);
            await refresh(query);
          }}
        />
      ) : null}

      {error ? (
        <p className="slab border-hazard-500 p-3 text-sm text-hazard-300">{error}</p>
      ) : null}

      {!loading && data.count === 0 ? (
        <div className="slab p-6 text-center">
          <p className="text-base text-ash-200">
            {data.total === 0 ? "This session has no estate yet." : "No assets match those filters."}
          </p>
          <p className="mx-auto mt-2 max-w-md text-sm text-ash-400">
            {data.total === 0
              ? "Load the reference estate from the landing page, or add a single primitive above. Every row is scored on write."
              : "Clear a filter to widen the search."}
          </p>
          {data.total === 0 ? (
            <Link href="/" className="btn btn-secondary mt-4">
              Go to intake
            </Link>
          ) : null}
        </div>
      ) : null}

      <ul className="space-y-2">
        {data.assets.map((asset) => (
          <li key={asset.id}>
            <Link
              href={`/asset/${asset.id}`}
              className="slab-raised flex flex-col gap-3 p-4 transition-colors hover:border-copper-600 sm:flex-row sm:items-center"
            >
              <span
                aria-hidden="true"
                className={`hidden w-1 self-stretch rounded-full sm:block ${
                  asset.status === "retired"
                    ? "bg-basalt-700"
                    : asset.exposureBand === "critical"
                      ? "bg-hazard-400"
                      : asset.exposureBand === "urgent"
                        ? "bg-copper-400"
                        : asset.exposureBand === "plan"
                          ? "bg-verd-400"
                          : "bg-basalt-700"
                }`}
              />
              <span className="min-w-0 flex-1">
                <span className="flex flex-wrap items-center gap-2">
                  <span className="truncate font-medium text-ash-100">{asset.label}</span>
                  <span className="tabular rounded-[2px] border border-basalt-700 px-1.5 py-0.5 text-[0.65rem] text-ash-400">
                    {asset.algorithm}
                  </span>
                  {asset.status === "retired" ? (
                    <span className="tabular rounded-[2px] border border-basalt-700 px-1.5 py-0.5 text-[0.65rem] text-ash-500">
                      retired
                    </span>
                  ) : null}
                  {asset.decision !== "none" && asset.decision !== "accept" ? (
                    <span className="tabular rounded-[2px] border border-verd-700 px-1.5 py-0.5 text-[0.65rem] text-verd-300">
                      {asset.decision}
                    </span>
                  ) : null}
                </span>
                <span className="mt-1 block truncate text-xs text-ash-500">
                  {asset.system} · {asset.usage} · {asset.deployment} · {asset.dataClass} ·{" "}
                  {asset.confidentialityYears}y confidentiality · {asset.ownerTeam}
                </span>
              </span>
              <span className="flex items-center gap-4 sm:shrink-0">
                <span className="text-right">
                  <span className="label block">exposure</span>
                  <span className="tabular text-lg text-ash-100">{asset.exposureScore}</span>
                </span>
                <span className="text-right">
                  <span className="label block">rupture</span>
                  <span className="tabular text-sm text-copper-300">
                    {asset.ruptureYear ?? "—"}
                  </span>
                </span>
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

function AssetForm({ onCreated }: { onCreated: () => Promise<void> | void }) {
  const [draft, setDraft] = useState<AssetDraft>({
    label: "",
    system: "",
    usage: "key-establishment",
    algorithm: "RSA-2048",
    deployment: "internet",
    confidentialityYears: 10,
    dataClass: "confidential",
    ownerTeam: "",
    notes: "",
    cve: null,
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);

  const set = <K extends keyof AssetDraft>(key: K, value: AssetDraft[K]) =>
    setDraft((current) => ({ ...current, [key]: value }));

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    setOk(null);
    try {
      const response = await fetch("/api/assets", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(draft),
      });
      const payload = (await response.json()) as {
        asset?: CryptoAsset;
        seal?: string;
        error?: { message: string };
      };
      if (!response.ok || !payload.asset) {
        setError(payload.error?.message ?? `HTTP ${response.status}`);
        return;
      }
      setOk(
        `Created “${payload.asset.label}” — exposure ${payload.asset.exposureScore} (${payload.asset.exposureBand}), seal ${payload.seal}.`,
      );
      await onCreated();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Request failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="slab-raised space-y-3 p-4">
      <p className="label">New primitive</p>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <label className="block">
          <span className="label">Label</span>
          <input
            className="input mt-1"
            required
            value={draft.label}
            onChange={(event) => set("label", event.target.value)}
            placeholder="Payments API TLS certificate"
          />
        </label>
        <label className="block">
          <span className="label">System</span>
          <input
            className="input mt-1"
            required
            value={draft.system}
            onChange={(event) => set("system", event.target.value)}
            placeholder="payments-gateway"
          />
        </label>
        <label className="block">
          <span className="label">Algorithm</span>
          <select
            className="select mt-1"
            value={draft.algorithm}
            onChange={(event) => set("algorithm", event.target.value)}
          >
            {[
              "RSA-2048",
              "RSA-4096",
              "RSA-1024",
              "ECDSA-P256",
              "ECDSA-P384",
              "Ed25519",
              "X25519",
              "DH-2048",
              "AES-128-GCM",
              "AES-256-GCM",
              "SHA-1",
              "ML-KEM-768",
              "ML-DSA-65",
            ].map((algorithm) => (
              <option key={algorithm} value={algorithm}>
                {algorithm}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="label">Usage</span>
          <select
            className="select mt-1"
            value={draft.usage}
            onChange={(event) => set("usage", event.target.value as AssetDraft["usage"])}
          >
            {USAGES.map((usage) => (
              <option key={usage} value={usage}>
                {usage}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="label">Deployment</span>
          <select
            className="select mt-1"
            value={draft.deployment}
            onChange={(event) => set("deployment", event.target.value as AssetDraft["deployment"])}
          >
            {DEPLOYMENTS.map((deployment) => (
              <option key={deployment} value={deployment}>
                {deployment}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="label">Data class</span>
          <select
            className="select mt-1"
            value={draft.dataClass}
            onChange={(event) => set("dataClass", event.target.value as AssetDraft["dataClass"])}
          >
            {DATA_CLASSES.map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="label">Confidentiality years</span>
          <input
            className="input tabular mt-1"
            type="number"
            min={0}
            max={100}
            value={draft.confidentialityYears}
            onChange={(event) => set("confidentialityYears", Number(event.target.value))}
          />
        </label>
        <label className="block">
          <span className="label">Owning team</span>
          <input
            className="input mt-1"
            required
            value={draft.ownerTeam}
            onChange={(event) => set("ownerTeam", event.target.value)}
            placeholder="platform"
          />
        </label>
        <label className="block">
          <span className="label">CVE (optional)</span>
          <input
            className="input tabular mt-1"
            value={draft.cve ?? ""}
            onChange={(event) => set("cve", event.target.value.trim() === "" ? null : event.target.value)}
            placeholder="CVE-2021-44228"
          />
        </label>
      </div>
      <label className="block">
        <span className="label">Notes</span>
        <textarea
          className="textarea mt-1 h-16"
          value={draft.notes}
          onChange={(event) => set("notes", event.target.value)}
          placeholder="Where it lives, who depends on it, what breaks if it rotates."
        />
      </label>

      <div className="flex flex-wrap items-center gap-3">
        <button type="submit" className="btn btn-primary" disabled={busy}>
          {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : null}
          {busy ? "Scoring…" : "Create and score"}
        </button>
        {ok ? <span className="text-sm text-verd-300">{ok}</span> : null}
        {error ? <span className="text-sm text-hazard-300">{error}</span> : null}
      </div>
    </form>
  );
}