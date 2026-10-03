"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { CheckCircle2, Loader2, Trash2 } from "lucide-react";
import { DECISIONS } from "@/lib/engine/index";
import type { CryptoAsset, ExposureResult, MigrationDecision } from "@/lib/types";

/** Record a decision, or retire the primitive. Both write real audit events. */
export function DecisionPanel({
  asset,
  exposure,
}: {
  asset: CryptoAsset;
  exposure: ExposureResult;
}) {
  const router = useRouter();
  const [decision, setDecision] = useState<MigrationDecision>(asset.decision);
  const [note, setNote] = useState(asset.decisionNote);
  const [busy, setBusy] = useState<null | "decide" | "retire">(null);
  const [message, setMessage] = useState<{ tone: "ok" | "error"; text: string } | null>(null);

  async function submitDecision(event: React.FormEvent) {
    event.preventDefault();
    setBusy("decide");
    setMessage(null);
    try {
      const response = await fetch(`/api/assets/${asset.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ decision, decisionNote: note }),
      });
      const payload = (await response.json()) as {
        asset?: CryptoAsset;
        exposure?: ExposureResult;
        seal?: string;
        error?: { message: string };
      };
      if (!response.ok || !payload.asset) {
        setMessage({ tone: "error", text: payload.error?.message ?? `HTTP ${response.status}` });
        return;
      }
      setMessage({
        tone: "ok",
        text: `Decision recorded. Exposure ${payload.exposure?.rawScore} raw × ${payload.exposure?.decisionModifier} relief = ${payload.asset.exposureScore}. Seal ${payload.seal}.`,
      });
      router.refresh();
    } catch (cause) {
      setMessage({ tone: "error", text: cause instanceof Error ? cause.message : "Request failed." });
    } finally {
      setBusy(null);
    }
  }

  async function retire() {
    setBusy("retire");
    setMessage(null);
    try {
      const response = await fetch(`/api/assets/${asset.id}`, {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ reason: note || "retired from the detail view" }),
      });
      const payload = (await response.json()) as { error?: { message: string } };
      if (!response.ok) {
        setMessage({ tone: "error", text: payload.error?.message ?? `HTTP ${response.status}` });
        return;
      }
      setMessage({
        tone: "ok",
        text: "Retired. The row is kept as a tombstone so the audit chain still replays.",
      });
      router.refresh();
    } catch (cause) {
      setMessage({ tone: "error", text: cause instanceof Error ? cause.message : "Request failed." });
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-4">
      <form onSubmit={submitDecision} className="slab-raised space-y-3 p-4">
        <p className="label">Migration decision</p>
        <div className="flex flex-wrap gap-2">
          <label className="flex-1">
            <span className="sr-only">Decision</span>
            <select
              className="select"
              value={decision}
              onChange={(event) => setDecision(event.target.value as MigrationDecision)}
            >
              {DECISIONS.map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </select>
          </label>
          <button type="submit" className="btn btn-primary" disabled={busy !== null}>
            {busy === "decide" ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <CheckCircle2 className="h-4 w-4" aria-hidden="true" />}
            Record decision
          </button>
        </div>
        <label className="block">
          <span className="label">Note (sealed into the audit event)</span>
          <textarea
            className="textarea mt-1 h-16"
            value={note}
            onChange={(event) => setNote(event.target.value)}
            placeholder="Dual-deploy hybrid handshake with the partner gateway before cutting over."
          />
        </label>
        <p className="text-xs text-ash-500">
          Recording the same decision twice writes no second event, so a retried request cannot
          inflate the chain.
        </p>
      </form>

      <div className="slab p-4">
        <p className="label">Retire</p>
        <p className="mt-1 text-sm text-ash-400">
          Removes the primitive from the active survey. The record is tombstoned, not deleted, so the
          seal chain remains replayable.
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <button
            type="button"
            className="btn btn-secondary"
            onClick={retire}
            disabled={busy !== null || asset.status === "retired"}
          >
            {busy === "retire" ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Trash2 className="h-4 w-4" aria-hidden="true" />}
            {asset.status === "retired" ? "Already retired" : "Retire this primitive"}
          </button>
          <Link href="/survey" className="btn btn-ghost">
            Back to the estate
          </Link>
        </div>
      </div>

      <div aria-live="polite" className="min-h-[1.5rem]">
        {message ? (
          <p className={`text-sm ${message.tone === "ok" ? "text-verd-300" : "text-hazard-300"}`}>
            {message.text}
          </p>
        ) : null}
      </div>

      <p className="text-xs text-ash-500">
        Current recommendation: {exposure.recommendation}
      </p>
    </div>
  );
}