"use client";

import { useEffect, useState } from "react";
import { Copy, Download, Link2, Loader2, Trash2 } from "lucide-react";
import type { ShareGrant } from "@/lib/types";

/** Export downloads are real endpoints; sharing freezes a stored snapshot. */
export function ReportActions({
  hasEstate,
  formats,
}: {
  hasEstate: boolean;
  formats: { format: string; href: string; description: string }[];
}) {
  const [label, setLabel] = useState("Partner readiness report");
  const [grants, setGrants] = useState<ShareGrant[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  const [created, setCreated] = useState<string | null>(null);

  async function loadGrants() {
    try {
      const response = await fetch("/api/report?grants=1", { cache: "no-store" });
      if (!response.ok) return;
      const payload = (await response.json()) as { grants: ShareGrant[] };
      setGrants(payload.grants);
    } catch {
      setGrants([]);
    }
  }

  useEffect(() => {
    let cancelled = false;
    // Fetched inside an async callback so the state update is never synchronous
    // with the effect body.
    void (async () => {
      try {
        const response = await fetch("/api/report?grants=1", { cache: "no-store" });
        if (!response.ok) return;
        const payload = (await response.json()) as { grants: ShareGrant[] };
        if (!cancelled) setGrants(payload.grants);
      } catch {
        if (!cancelled) setGrants([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function createShare() {
    setBusy(true);
    setMessage(null);
    try {
      const response = await fetch("/api/report", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ label }),
      });
      const payload = (await response.json()) as {
        url?: string;
        error?: { message: string };
      };
      if (!response.ok || !payload.url) {
        setMessage({ tone: "error", text: payload.error?.message ?? `HTTP ${response.status}` });
        return;
      }
      setCreated(payload.url);
      setMessage({ tone: "ok", text: "Snapshot frozen. The link works without an account." });
      await loadGrants();
    } catch (cause) {
      setMessage({ tone: "error", text: cause instanceof Error ? cause.message : "Request failed." });
    } finally {
      setBusy(false);
    }
  }

  async function revoke(token: string) {
    setBusy(true);
    try {
      const response = await fetch(`/api/report?token=${encodeURIComponent(token)}`, {
        method: "DELETE",
      });
      if (!response.ok) {
        setMessage({ tone: "error", text: `Revoke failed with HTTP ${response.status}.` });
        return;
      }
      setMessage({ tone: "ok", text: "Share link revoked." });
      await loadGrants();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-5">
      <section className="slab-raised p-5">
        <p className="label">Download</p>
        <h2 className="mt-1 text-lg font-semibold">Take the survey with you</h2>
        <p className="mt-2 text-sm text-ash-400">
          Every download is generated from the current estate, carries feed provenance and the chain
          head, and includes the safety disclaimer.
        </p>
        <div className="mt-4 grid gap-2 sm:grid-cols-3">
          {formats.map((entry) => (
            <a
              key={entry.format}
              href={entry.href}
              className="slab flex items-center gap-2 px-3 py-2.5 transition-colors hover:border-copper-600"
              aria-disabled={!hasEstate}
            >
              <Download className="h-4 w-4 text-copper-400" aria-hidden="true" />
              <span>
                <span className="block text-sm text-ash-100">{entry.format.toUpperCase()}</span>
                <span className="block text-[0.7rem] text-ash-500">{entry.description}</span>
              </span>
            </a>
          ))}
        </div>
      </section>

      <section className="slab-raised p-5">
        <p className="label">Share with a partner</p>
        <h2 className="mt-1 text-lg font-semibold">Freeze a readable snapshot</h2>
        <p className="mt-2 text-sm text-ash-400">
          The snapshot is stored server-side and served read-only from a public route. Revoking a link
          removes it immediately.
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <label className="flex-1">
            <span className="sr-only">Report label</span>
            <input
              className="input"
              value={label}
              onChange={(event) => setLabel(event.target.value)}
              placeholder="Partner readiness report"
            />
          </label>
          <button type="button" className="btn btn-primary" onClick={createShare} disabled={busy}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Link2 className="h-4 w-4" aria-hidden="true" />}
            Create share link
          </button>
        </div>

        {created ? (
          <div className="mt-3 flex flex-wrap items-center gap-2 border-l border-verd-600 pl-3">
            <a href={created} target="_blank" rel="noopener noreferrer" className="link-underline text-sm text-verd-300">
              {created}
            </a>
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => {
                void navigator.clipboard?.writeText(new URL(created, window.location.origin).toString());
                setMessage({ tone: "ok", text: "Copied the absolute link." });
              }}
            >
              <Copy className="h-4 w-4" aria-hidden="true" />
              Copy
            </button>
          </div>
        ) : null}

        {message ? (
          <p className={`mt-2 text-sm ${message.tone === "ok" ? "text-verd-300" : "text-hazard-300"}`}>
            {message.text}
          </p>
        ) : null}

        {grants.length > 0 ? (
          <ul className="mt-4 divide-y divide-basalt-800 border-t border-basalt-700">
            {grants.map((grant) => (
              <li key={grant.token} className="flex flex-wrap items-center gap-3 py-2.5">
                <span className="min-w-0 flex-1 truncate text-sm text-ash-200">{grant.label}</span>
                <span className="tabular text-xs text-ash-500">
                  {grant.assetCount} assets · {grant.createdAt.slice(0, 10)}
                </span>
                <a
                  href={`/r/${grant.token}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="link-underline text-xs text-copper-300"
                >
                  open
                </a>
                <button
                  type="button"
                  className="btn btn-ghost px-2"
                  onClick={() => revoke(grant.token)}
                  disabled={busy}
                  aria-label={`Revoke share link ${grant.label}`}
                >
                  <Trash2 className="h-4 w-4" aria-hidden="true" />
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-3 text-sm text-ash-500">No share links yet.</p>
        )}
      </section>
    </div>
  );
}