"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, CheckCircle2, Loader2 } from "lucide-react";

interface ImportResult {
  created: number;
  errorCount?: number;
  assets?: { id: string; label: string; system: string; algorithm: string; exposureScore: number; band: string; ruptureYear: number | null }[];
  errors?: { row: number; message: string }[];
  error?: { message: string };
}

/**
 * The landing page's primary action. Both buttons perform a real POST that
 * writes rows and audit events; nothing here fakes a result or counts up.
 */
export function EstateIntake() {
  const router = useRouter();
  const [manifest, setManifest] = useState("");
  const [busy, setBusy] = useState<null | "sample" | "custom">(null);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [failure, setFailure] = useState<string | null>(null);

  async function submit(mode: "sample" | "custom") {
    setBusy(mode);
    setFailure(null);
    setResult(null);
    try {
      const response = await fetch("/api/survey/import", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(mode === "sample" ? { sample: true } : { manifest }),
      });
      const payload = (await response.json()) as ImportResult;
      if (!response.ok) {
        setFailure(payload.error?.message ?? `Import failed with status ${response.status}.`);
        return;
      }
      setResult(payload);
      if (payload.created > 0) {
        window.setTimeout(() => router.push("/seismograph"), 900);
      }
    } catch (error) {
      setFailure(
        error instanceof Error
          ? `Could not reach the survey API: ${error.message}`
          : "Could not reach the survey API.",
      );
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="slab-raised p-5 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="label">Step 1 — establish an estate</p>
          <h2 className="mt-1 text-xl font-semibold">Load a cryptographic manifest</h2>
        </div>
        <span className="tabular rounded-[2px] border border-basalt-700 bg-basalt-900 px-2 py-1 text-[0.65rem] text-ash-400">
          anonymous session · no account
        </span>
      </div>

      <p className="mt-3 text-sm leading-relaxed text-ash-400">
        Every row is written to the production database and sealed into an audit chain. Start with the
        bundled reference estate, or paste a CSV/JSON manifest of your own.
      </p>

      <div className="mt-4 flex flex-wrap gap-2">
        <button
          type="button"
          className="btn btn-primary"
          onClick={() => submit("sample")}
          disabled={busy !== null}
        >
          {busy === "sample" ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : null}
          {busy === "sample" ? "Writing rows…" : "Load the reference estate"}
        </button>
        <button
          type="button"
          className="btn btn-secondary"
          onClick={() => submit("custom")}
          disabled={busy !== null || manifest.trim().length === 0}
        >
          {busy === "custom" ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : null}
          {busy === "custom" ? "Importing…" : "Import my manifest"}
        </button>
      </div>

      <label className="mt-4 block">
        <span className="label">Manifest (CSV with a header row, or a JSON array)</span>
        <textarea
          className="textarea mt-2 h-40 w-full"
          spellCheck={false}
          placeholder={
            "label,system,usage,algorithm,deployment,confidentialityYears,dataClass,ownerTeam,notes,cve\n" +
            "Payments API TLS certificate,payments-gateway,certificate,RSA-2048,partner-shared,7,regulated,platform,,"
          }
          value={manifest}
          onChange={(event) => setManifest(event.target.value)}
        />
      </label>

      <div aria-live="polite" className="mt-3 min-h-[1.5rem]">
        {failure ? (
          <p className="flex items-start gap-2 text-sm text-hazard-300">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            <span>{failure}</span>
          </p>
        ) : null}

        {result && result.created > 0 ? (
          <div className="text-sm text-verd-300">
            <p className="flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
              Wrote {result.created} asset{result.created === 1 ? "" : "s"} and sealed{" "}
              {result.created} audit event{result.created === 1 ? "" : "s"}. Opening the seismograph…
            </p>
            {result.errorCount ? (
              <p className="mt-1 text-hazard-300">{result.errorCount} row(s) rejected and listed below.</p>
            ) : null}
          </div>
        ) : null}

        {result && result.created === 0 && result.errorCount === undefined ? (
          <p className="text-sm text-ash-300">{result.assets?.length === 0 ? "" : ""}This scope already holds an estate.</p>
        ) : null}

        {result && result.errors && result.errors.length > 0 ? (
          <ul className="mt-2 space-y-1 border-l border-hazard-500 pl-3 text-xs text-ash-400">
            {result.errors.map((entry) => (
              <li key={`${entry.row}-${entry.message}`} className="tabular">
                row {entry.row}: {entry.message}
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    </div>
  );
}