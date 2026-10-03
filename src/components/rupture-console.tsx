"use client";

import { useCallback, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Loader2, Save } from "lucide-react";
import { SeismographTrace } from "./seismograph-trace";
import { HORIZON_MAX, HORIZON_MIN, getRegime, scoreAsset } from "@/lib/engine/index";
import type { ExposureResult, MigrationDecision, TracePoint } from "@/lib/types";

export interface ConsoleAsset {
  id: string;
  label: string;
  system: string;
  usage: string;
  algorithm: string;
  deployment: string;
  confidentialityYears: number;
  dataClass: string;
  ownerTeam: string;
  notes: string;
  cve: string | null;
  decision: MigrationDecision;
  status: string;
  exposureScore: number;
}

/**
 * The rupture scrub.
 *
 * Dragging the year rail does three real things: it recomputes every exposure
 * score with the shared engine, it re-sequences the migration queue, and it
 * persists the horizon year so the new scores are written to the database and
 * sealed. The preview while dragging runs the identical engine module the API
 * uses, so what you see before saving is what gets stored.
 */
export function RuptureConsole({
  trace,
  assets,
  initialYear,
  regimeId,
  attackerProfile,
  engineVersion,
  established,
}: {
  trace: TracePoint[];
  assets: ConsoleAsset[];
  initialYear: number;
  regimeId: string;
  attackerProfile: string;
  engineVersion: string;
  established: boolean;
}) {
  const router = useRouter();
  // The horizon is owned by the server, so a fresh prop is copied into local
  // state during render rather than in an effect. That keeps the rail in sync
  // after router.refresh() without a cascading second render.
  const [year, setYear] = useState(initialYear);
  const [savedYear, setSavedYear] = useState(initialYear);
  const [committed, setCommitted] = useState(initialYear);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (savedYear !== initialYear) {
    setSavedYear(initialYear);
    setYear(initialYear);
    setCommitted(initialYear);
  }

  const preview = useMemo(() => {
    const regime = getRegime(regimeId);
    return assets
      .filter((asset) => asset.status === "active")
      .map((asset) => {
        const exposure: ExposureResult = scoreAsset({
          label: asset.label,
          system: asset.system,
          usage: asset.usage as never,
          algorithm: asset.algorithm,
          deployment: asset.deployment as never,
          confidentialityYears: asset.confidentialityYears,
          dataClass: asset.dataClass as never,
          ownerTeam: asset.ownerTeam,
          notes: asset.notes,
          cve: asset.cve,
          decision: asset.decision,
          horizonYear: year,
          regime,
          attackerProfile,
        });
        return { asset, exposure };
      })
      .sort((a, b) => b.exposure.score - a.exposure.score);
  }, [assets, year, regimeId, attackerProfile]);

  const persist = useCallback(
    async (target: number) => {
      setSaving(true);
      setError(null);
      try {
        const response = await fetch("/api/survey", {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ horizonYear: target }),
        });
        const payload = (await response.json()) as {
          rescored?: number;
          error?: { message: string };
        };
        if (!response.ok) {
          setError(payload.error?.message ?? `HTTP ${response.status}`);
          return;
        }
        setCommitted(target);
        setStatus(`Saved. ${payload.rescored ?? 0} assets re-scored and persisted at horizon ${target}.`);
        router.refresh();
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : "Could not reach the survey API.");
      } finally {
        setSaving(false);
      }
    },
    [router],
  );

  function onRelease(target: number) {
    if (target === committed) return;
    void persist(target);
  }

  const activePoint = trace.find((point) => point.year === year);
  const bindingCounts = preview.reduce<Record<string, number>>((totals, entry) => {
    totals[entry.exposure.bindingConstraint] = (totals[entry.exposure.bindingConstraint] ?? 0) + 1;
    return totals;
  }, {});

  return (
    <div className="space-y-6">
      <section className="slab-raised p-5">
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <div>
            <p className="label">Rupture scrub</p>
            <h2 className="mt-1 text-lg font-semibold">Move the horizon and the model moves with it</h2>
          </div>
          <span className="tabular rounded-[2px] border border-basalt-700 bg-basalt-900 px-2 py-1 text-xs text-ash-400">
            engine {engineVersion}
          </span>
        </div>

        <div className="mt-5">
          <label htmlFor="horizon" className="label">
            Horizon year — persisted, re-scores every asset
          </label>
          <div className="mt-3 flex items-center gap-4">
            <input
              id="horizon"
              type="range"
              min={HORIZON_MIN}
              max={HORIZON_MAX}
              step={1}
              value={year}
              onChange={(event) => setYear(Number(event.target.value))}
              onMouseUp={(event) => onRelease(Number((event.target as HTMLInputElement).value))}
              onTouchEnd={(event) => onRelease(Number((event.target as HTMLInputElement).value))}
              onKeyUp={(event) => onRelease(Number((event.target as HTMLInputElement).value))}
              className="h-1.5 w-full cursor-pointer appearance-none rounded-full bg-basalt-700 accent-[var(--color-copper-400)]"
              aria-valuetext={`horizon year ${year}`}
            />
            <span className="tabular w-16 shrink-0 text-right text-2xl text-copper-300">{year}</span>
          </div>
          <div className="mt-1 flex justify-between font-data text-[0.65rem] text-ash-500">
            <span>{HORIZON_MIN}</span>
            <span>2035 · NIST disallow</span>
            <span>{HORIZON_MAX}</span>
          </div>
        </div>

        <div className="mt-5">
          <SeismographTrace
            points={trace}
            horizonYear={year}
            activeYear={year}
            onSelectYear={setYear}
            height={200}
          />
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-4">
          <div className="slab p-3">
            <p className="label">Assets exposed</p>
            <p className="tabular mt-1 text-2xl text-hazard-300">{activePoint?.harvested ?? 0}</p>
            <p className="mt-0.5 text-[0.7rem] text-ash-500">harvested data still inside its window</p>
          </div>
          <div className="slab p-3">
            <p className="label">Estate exposed</p>
            <p className="tabular mt-1 text-2xl text-copper-300">{activePoint?.intensity ?? 0}%</p>
            <p className="mt-0.5 text-[0.7rem] text-ash-500">share of primitives whose data outlives the break</p>
          </div>
          <div className="slab p-3">
            <p className="label">Binding: data lifetime</p>
            <p className="tabular mt-1 text-2xl text-copper-300">{bindingCounts["data-lifetime"] ?? 0}</p>
            <p className="mt-0.5 text-[0.7rem] text-ash-500">secret outlives the modelled break</p>
          </div>
          <div className="slab p-3">
            <p className="label">Binding: compliance</p>
            <p className="tabular mt-1 text-2xl text-verd-300">{bindingCounts.compliance ?? 0}</p>
            <p className="mt-0.5 text-[0.7rem] text-ash-500">deadline or lead time runs out first</p>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-3">
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => onRelease(year)}
            disabled={saving || year === committed || !established}
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Save className="h-4 w-4" aria-hidden="true" />}
            Save horizon {year}
          </button>
          {status ? <span className="text-sm text-verd-300">{status}</span> : null}
          {error ? <span className="text-sm text-hazard-300">{error}</span> : null}
          {!established ? (
            <span className="text-sm text-ash-400">
              Start an estate on the landing page to persist a horizon year.
            </span>
          ) : null}
        </div>
      </section>

      <section className="slab-raised p-5">
        <p className="label">Queue re-sequenced at {year}</p>
        <h2 className="mt-1 text-lg font-semibold">What the engine says matters first</h2>
        {preview.length === 0 ? (
          <p className="mt-3 text-sm text-ash-400">
            No active assets. The queue is computed from the estate, not from a static list.
          </p>
        ) : (
          <ol className="mt-4 divide-y divide-basalt-800">
            {preview.slice(0, 12).map((entry, index) => (
              <li key={entry.asset.id} className="flex flex-wrap items-center gap-3 py-3">
                <span className="tabular w-6 text-xs text-ash-500">{String(index + 1).padStart(2, "0")}</span>
                <Link
                  href={`/asset/${entry.asset.id}`}
                  className="min-w-0 flex-1 truncate text-sm text-ash-100 hover:text-copper-300"
                >
                  {entry.asset.label}
                </Link>
                <span className="tabular text-xs text-ash-500">{entry.asset.system}</span>
                <span className="tabular text-xs text-copper-300">
                  {entry.exposure.quantum.ruptureYear[entry.exposure.ruptureYearProfile] ?? "—"}
                </span>
                <span
                  className={`tabular rounded-[2px] border px-2 py-0.5 text-xs band-${entry.exposure.band}`}
                >
                  {entry.exposure.score}
                </span>
              </li>
            ))}
          </ol>
        )}
      </section>
    </div>
  );
}