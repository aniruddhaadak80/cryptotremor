"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Save, TriangleAlert } from "lucide-react";
import { ATTACKER_PROFILES, COMPLIANCE_REGIMES } from "@/lib/engine/index";
import type { Profile } from "@/lib/types";

/** Settings write through the API and then re-score the whole estate. */
export function SettingsForm({ profile, assetCount }: { profile: Profile; assetCount: number }) {
  const router = useRouter();
  const [form, setForm] = useState({
    orgName: profile.orgName,
    horizonYear: profile.horizonYear,
    regimeId: profile.regimeId,
    attackerProfile: profile.attackerProfile,
    tolerance: profile.tolerance,
  });
  const [busy, setBusy] = useState<null | "save" | "rescore" | "purge">(null);
  const [message, setMessage] = useState<{ tone: "ok" | "error"; text: string } | null>(null);

  async function save() {
    setBusy("save");
    setMessage(null);
    try {
      const response = await fetch("/api/survey", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(form),
      });
      const payload = (await response.json()) as {
        profile?: Profile;
        rescored?: number;
        error?: { message: string };
      };
      if (!response.ok) {
        setMessage({ tone: "error", text: payload.error?.message ?? `HTTP ${response.status}` });
        return;
      }
      setMessage({
        tone: "ok",
        text: `Saved. ${payload.rescored ?? 0} assets re-scored against ${payload.profile?.regimeId} at horizon ${payload.profile?.horizonYear}.`,
      });
      router.refresh();
    } catch (cause) {
      setMessage({ tone: "error", text: cause instanceof Error ? cause.message : "Request failed." });
    } finally {
      setBusy(null);
    }
  }

  async function purge() {
    const confirmed = window.confirm(
      `Retire all ${assetCount} asset(s) in this session? Records are tombstoned, not deleted, and the audit chain is kept.`,
    );
    if (!confirmed) return;
    setBusy("purge");
    setMessage(null);
    try {
      const response = await fetch("/api/survey", { method: "DELETE" });
      const payload = (await response.json()) as { retired?: number; error?: { message: string } };
      if (!response.ok) {
        setMessage({ tone: "error", text: payload.error?.message ?? `HTTP ${response.status}` });
        return;
      }
      setMessage({
        tone: "ok",
        text: `Estate retired: ${payload.retired ?? 0} row(s) are now tombstones.`,
      });
      router.refresh();
    } finally {
      setBusy(null);
    }
  }

  const profileMeta = ATTACKER_PROFILES[form.attackerProfile];

  return (
    <div className="space-y-5">
      <section className="slab-raised space-y-3 p-5">
        <p className="label">Survey profile</p>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block">
            <span className="label">Organisation name (appears on exports)</span>
            <input
              className="input mt-1"
              value={form.orgName}
              onChange={(event) => setForm({ ...form, orgName: event.target.value })}
              placeholder="Northwind Financial"
            />
          </label>
          <label className="block">
            <span className="label">Horizon year</span>
            <input
              className="input tabular mt-1"
              type="number"
              min={2026}
              max={2045}
              value={form.horizonYear}
              onChange={(event) => setForm({ ...form, horizonYear: Number(event.target.value) })}
            />
          </label>
          <label className="block">
            <span className="label">Compliance regime</span>
            <select
              className="select mt-1"
              value={form.regimeId}
              onChange={(event) => setForm({ ...form, regimeId: event.target.value })}
            >
              {COMPLIANCE_REGIMES.map((regime) => (
                <option key={regime.id} value={regime.id}>
                  {regime.label}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="label">Attacker scenario</span>
            <select
              className="select mt-1"
              value={form.attackerProfile}
              onChange={(event) => setForm({ ...form, attackerProfile: event.target.value })}
            >
              {Object.values(ATTACKER_PROFILES).map((entry) => (
                <option key={entry.id} value={entry.id}>
                  {entry.label}
                </option>
              ))}
            </select>
          </label>
        </div>

        {profileMeta ? (
          <p className="border-l border-copper-600 pl-3 text-xs leading-relaxed text-ash-400">
            {profileMeta.rationale}
          </p>
        ) : null}

        <div className="flex flex-wrap items-center gap-3">
          <button type="button" className="btn btn-primary" onClick={save} disabled={busy !== null}>
            {busy === "save" ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Save className="h-4 w-4" aria-hidden="true" />}
            Save and re-score estate
          </button>
          {message ? (
            <span className={`text-sm ${message.tone === "ok" ? "text-verd-300" : "text-hazard-300"}`}>
              {message.text}
            </span>
          ) : null}
        </div>
      </section>

      <section className="slab p-5">
        <p className="label">Danger zone</p>
        <h2 className="mt-1 text-lg font-semibold">Retire every primitive in this session</h2>
        <p className="mt-2 text-sm text-ash-400">
          Rows are tombstoned rather than deleted so the seal chain remains replayable. This cannot be
          undone, and it only affects the anonymous scope that owns them.
        </p>
        <button type="button" className="btn btn-secondary mt-3" onClick={purge} disabled={busy !== null}>
          {busy === "purge" ? (
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
          ) : (
            <TriangleAlert className="h-4 w-4 text-hazard-400" aria-hidden="true" />
          )}
          Retire {assetCount} asset(s)
        </button>
      </section>
    </div>
  );
}