"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Loader2, Play, Terminal } from "lucide-react";

interface Call {
  id: string;
  label: string;
  tool: string;
  arguments: Record<string, unknown>;
  writes: boolean;
  hint: string;
}

/**
 * Preloaded calls mirror the real tool schemas; the mutating ones use stable
 * idempotency keys, so running the sample call twice returns the original
 * record instead of creating a duplicate.
 */
const CALLS: Call[] = [
  {
    id: "init",
    label: "initialize",
    tool: "",
    arguments: {
      protocolVersion: "2024-11-05",
      capabilities: {},
      clientInfo: { name: "cryptotremor-console", version: "1.0.0" },
    },
    writes: false,
    hint: "Handshake. The returned ownerToken is this session's owner capability.",
  },
  {
    id: "list",
    label: "tools/list",
    tool: "",
    arguments: {},
    writes: false,
    hint: "Discover the typed tools and their JSON schemas.",
  },
  {
    id: "save",
    label: "save_asset (idempotent)",
    tool: "save_asset",
    arguments: {
      label: "Agent-created partner TLS cert",
      system: "partner-portal",
      usage: "certificate",
      algorithm: "RSA-2048",
      deployment: "partner-shared",
      confidentialityYears: 12,
      dataClass: "regulated",
      ownerTeam: "agent",
      notes: "Created through the agent tool to prove the mutation path.",
      idempotencyKey: "console-demo-asset",
    },
    writes: true,
    hint: "Creates and scores a record through the same service layer the UI uses.",
  },
  {
    id: "read",
    label: "list_assets",
    tool: "list_assets",
    arguments: { sort: "score" },
    writes: false,
    hint: "Read back what the agent just wrote.",
  },
  {
    id: "estimate",
    label: "estimate_quantum_cost",
    tool: "estimate_quantum_cost",
    arguments: {
      algorithm: "ECDSA-P256",
      usage: "signature",
      deployment: "internet",
      confidentialityYears: 25,
      dataClass: "regulated",
      horizonYear: 2031,
      attackerProfile: "expected",
    },
    writes: false,
    hint: "Runs the engine on a hypothetical primitive; writes nothing.",
  },
  {
    id: "waves",
    label: "plan_migration_waves",
    tool: "plan_migration_waves",
    arguments: {},
    writes: false,
    hint: "Grover-sequenced wave plan over the whole estate.",
  },
  {
    id: "decide",
    label: "record_decision",
    tool: "record_decision",
    arguments: {
      id: "__LAST_ASSET_ID__",
      decision: "schedule",
      note: "Scheduled from the agent console; dual-deploy first.",
    },
    writes: true,
    hint: "Records a decision on the most recently created asset.",
  },
  {
    id: "signals",
    label: "strata_signals",
    tool: "strata_signals",
    arguments: {},
    writes: false,
    hint: "Live CISA KEV and arXiv signals, labeled live or fallback.",
  },
  {
    id: "integrity",
    label: "verify_integrity",
    tool: "verify_integrity",
    arguments: {},
    writes: false,
    hint: "Replays the SHA-384 chain and reports the first broken link.",
  },
  {
    id: "share",
    label: "create_share_report",
    tool: "create_share_report",
    arguments: { label: "Agent-generated partner report" },
    writes: true,
    hint: "Freezes a snapshot partners can read without an account.",
  },
];

interface LogEntry {
  call: string;
  request: unknown;
  response: unknown;
  ok: boolean;
  at: string;
  link: string | null;
}

export function AgentConsole() {
  const [owner, setOwner] = useState<string | null>(null);
  const [lastAssetId, setLastAssetId] = useState<string | null>(null);
  const [log, setLog] = useState<LogEntry[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const logRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const stored = window.localStorage.getItem("ct_owner");
    if (stored) setOwner(stored);
  }, []);

  const run = useCallback(
    async (call: Call) => {
      setBusy(call.id);
      setError(null);
      const args = { ...call.arguments } as Record<string, unknown>;
      if (typeof args.id === "string" && args.id === "__LAST_ASSET_ID__") {
        if (!lastAssetId) {
          setError("Create an asset first so the console knows which id to act on.");
          setBusy(null);
          return;
        }
        args.id = lastAssetId;
      }

      const request = {
        jsonrpc: "2.0",
        id: Date.now(),
        method: call.tool ? "tools/call" : call.id === "init" ? "initialize" : "tools/list",
        params: call.tool ? { name: call.tool, arguments: args } : (call.id === "init" ? args : {}),
      };

      try {
        const response = await fetch("/api/mcp", {
          method: "POST",
          headers: {
            "content-type": "application/json",
            ...(owner ? { "x-ct-owner": owner } : {}),
          },
          body: JSON.stringify(request),
        });
        const payload = (await response.json()) as Record<string, unknown>;
        const result = (payload.result ?? null) as Record<string, unknown> | null;
        const content = (result?.structuredContent ?? payload) as Record<string, unknown> | null;

        if (result && typeof result.ownerToken === "string") {
          setOwner(result.ownerToken);
          window.localStorage.setItem("ct_owner", result.ownerToken);
        }
        const asset = content?.asset as { id?: string } | undefined;
        const assets = content?.assets as { id?: string }[] | undefined;
        if (asset?.id) setLastAssetId(asset.id);
        else if (assets && assets.length > 0 && call.id === "read" && assets[0]?.id) {
          setLastAssetId(assets[0].id);
        }
        const token = content?.token as string | undefined;
        const link = token ? `/r/${token}` : asset?.id ? `/asset/${asset.id}` : null;

        setLog((entries) => [
          {
            call: call.label,
            request,
            response: payload,
            ok: !payload.error && !result?.isError,
            at: new Date().toISOString(),
            link,
          },
          ...entries,
        ]);
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : "The agent endpoint did not respond.");
        setLog((entries) => [
          {
            call: call.label,
            request,
            response: { transportError: cause instanceof Error ? cause.message : String(cause) },
            ok: false,
            at: new Date().toISOString(),
            link: null,
          },
          ...entries,
        ]);
      } finally {
        setBusy(null);
      }
    },
    [lastAssetId, owner],
  );

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,22rem)_1fr]">
      <div className="space-y-3">
        <div className="slab-raised p-4">
          <p className="label">Transport</p>
          <p className="mt-1 font-data text-xs text-ash-300">POST /api/mcp · JSON-RPC 2.0</p>
          <p className="mt-2 text-xs leading-relaxed text-ash-400">
            The handshake returns an <span className="text-copper-300">ownerToken</span>; every later call
            sends it back as <span className="text-copper-300">x-ct-owner</span>, so an agent without
            cookies still keeps the same estate.
          </p>
          <p className="tabular mt-2 break-all text-[0.65rem] text-ash-500">
            owner: {owner ?? "not established — run initialize"}
          </p>
        </div>

        <div className="slab-raised p-4">
          <p className="label">Preloaded calls</p>
          <ul className="mt-3 space-y-2">
            {CALLS.map((call) => (
              <li key={call.id}>
                <button
                  type="button"
                  onClick={() => void run(call)}
                  disabled={busy !== null}
                  className="w-full rounded-[2px] border border-basalt-700 bg-basalt-900 px-3 py-2 text-left transition-colors hover:border-copper-600 disabled:opacity-50"
                >
                  <span className="flex items-center justify-between gap-2">
                    <span className="flex items-center gap-2 text-sm text-ash-100">
                      {busy === call.id ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                      ) : (
                        <Play className="h-3.5 w-3.5 text-copper-400" aria-hidden="true" />
                      )}
                      {call.label}
                    </span>
                    {call.writes ? (
                      <span className="tabular rounded-[2px] border border-hazard-500 px-1.5 text-[0.6rem] text-hazard-300">
                        writes
                      </span>
                    ) : (
                      <span className="tabular rounded-[2px] border border-verd-700 px-1.5 text-[0.6rem] text-verd-300">
                        read
                      </span>
                    )}
                  </span>
                  <span className="mt-0.5 block text-[0.7rem] leading-snug text-ash-500">{call.hint}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      </div>

      <div className="space-y-4">
        <div className="slab-raised flex items-center gap-2 p-3">
          <Terminal className="h-4 w-4 text-copper-400" aria-hidden="true" />
          <p className="text-sm text-ash-300">Exchange log — newest first</p>
          {log.length > 0 ? (
            <button
              type="button"
              className="btn btn-ghost ml-auto"
              onClick={() => setLog([])}
            >
              Clear
            </button>
          ) : null}
        </div>

        {error ? <p className="slab border-hazard-500 p-3 text-sm text-hazard-300">{error}</p> : null}

        {log.length === 0 ? (
          <p className="slab p-6 text-center text-sm text-ash-400">
            Run <span className="text-copper-300">initialize</span> to establish the owner token, then
            <span className="text-copper-300"> save_asset</span> to prove the mutation path.
          </p>
        ) : null}

        <div ref={logRef} className="max-h-[30rem] space-y-3 overflow-y-auto">
          {log.map((entry, index) => (
            <details
              key={`${entry.call}-${entry.at}-${index}`}
              className="slab overflow-hidden"
              open={index === 0}
            >
              <summary className="flex cursor-pointer list-none flex-wrap items-center gap-2 px-4 py-3">
                <span
                  className={`tabular rounded-[2px] border px-1.5 py-0.5 text-[0.6rem] ${
                    entry.ok
                      ? "border-verd-700 text-verd-300"
                      : "border-hazard-500 text-hazard-300"
                  }`}
                >
                  {entry.ok ? "ok" : "error"}
                </span>
                <span className="text-sm text-ash-100">{entry.call}</span>
                <span className="tabular ml-auto text-[0.65rem] text-ash-500">
                  {entry.at.slice(11, 19)}
                </span>
                {entry.link ? (
                  <Link href={entry.link} className="link-underline text-xs text-copper-300">
                    open result
                  </Link>
                ) : null}
              </summary>
              <div className="grid gap-3 border-t border-basalt-800 p-4 md:grid-cols-2">
                <div>
                  <p className="label">Request</p>
                  <pre className="tabular mt-1 max-h-64 overflow-auto rounded-[2px] bg-basalt-950 p-3 text-[0.7rem] leading-relaxed text-ash-300">
                    {JSON.stringify(entry.request, null, 2)}
                  </pre>
                </div>
                <div>
                  <p className="label">Response</p>
                  <pre className="tabular mt-1 max-h-64 overflow-auto rounded-[2px] bg-basalt-950 p-3 text-[0.7rem] leading-relaxed text-ash-300">
                    {JSON.stringify(entry.response, null, 2)}
                  </pre>
                </div>
              </div>
            </details>
          ))}
        </div>

        <div className="slab p-4">
          <p className="label">Configuration for other MCP clients</p>
          <pre className="tabular mt-2 overflow-auto rounded-[2px] bg-basalt-950 p-3 text-[0.7rem] leading-relaxed text-ash-300">
{`{
  "mcpServers": {
    "cryptotremor": {
      "type": "http",
      "url": "<live-url>/api/mcp"
    }
  }
}`}
          </pre>
          <p className="mt-2 text-xs text-ash-500">
            The served manifest at <span className="text-copper-300">/mcp.json</span> carries the live
            endpoint.
          </p>
        </div>
      </div>
    </div>
  );
}