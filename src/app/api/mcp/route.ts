/**
 * Live agent interface: MCP-style JSON-RPC 2.0 over HTTP.
 *
 * Supported methods: `initialize`, `notifications/initialized`, `ping`,
 * `tools/list`, `tools/call`. Ten typed tools: four read or analysis, three
 * mutating through the same service layer the UI uses, one report builder and
 * one integrity verifier. Mutations are idempotent (explicit key for creates,
 * natural-state checks for decisions and deletions) and every call is scoped to
 * the caller's owner capability.
 */

import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { resolveScope } from "@/lib/auth/session";
import {
  ENGINE_VERSION,
  buildWaves,
  getAlgorithm,
  getRegime,
  migrationQueue,
  scoreAsset,
} from "@/lib/engine/index.ts";
import {
  createAsset,
  createShare,
  evaluate,
  getProfile,
  listAssets,
  listEvents,
  recordDecision,
  retireAsset,
  tombstonedIds,
} from "@/lib/db/repo.ts";
import { fetchStrata } from "@/lib/feed/strata.ts";
import { replayScope } from "@/lib/integrity/seal.ts";
import { buildReport } from "@/lib/report.ts";
import {
  MCP_LIMIT_PER_MINUTE,
  takeQuota,
} from "@/lib/rate-limit.ts";
import { assetDraftSchema, decisionSchema, zodMessage } from "@/lib/validate";
import type { AssetDraft, MigrationDecision } from "@/lib/types.ts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PROTOCOL_VERSION = "2024-11-05";
const SERVER_INFO = { name: "cryptotremor", version: "1.0.0" };

const READ_ONLY_TOOLS = new Set([
  "list_assets",
  "get_asset",
  "estimate_quantum_cost",
  "plan_migration_waves",
  "verify_integrity",
  "strata_signals",
]);

const JSONRPC_PARSE = -32700;
const JSONRPC_INVALID = -32600;
const JSONRPC_METHOD = -32601;
const JSONRPC_PARAMS = -32602;
const JSONRPC_INTERNAL = -32603;

interface RpcRequest {
  jsonrpc?: string;
  id?: string | number | null;
  method?: string;
  params?: Record<string, unknown>;
}

const TOOL_DEFS = [
  {
    name: "list_assets",
    description:
      "List the caller's cryptographic assets with exposure score, band, rupture year and seal. Read-only.",
    inputSchema: {
      type: "object",
      properties: {
        status: { type: "string", enum: ["active", "retired"] },
        band: { type: "string", enum: ["settled", "watch", "plan", "urgent", "critical"] },
        system: { type: "string", maxLength: 80 },
        sort: { type: "string", enum: ["score", "rupture", "label", "updated"] },
      },
      additionalProperties: false,
    },
  },
  {
    name: "get_asset",
    description: "Fetch one asset by id, including its full audit trail and current seal.",
    inputSchema: {
      type: "object",
      properties: { id: { type: "string", minLength: 1, maxLength: 64 } },
      required: ["id"],
      additionalProperties: false,
    },
  },
  {
    name: "estimate_quantum_cost",
    description:
      "Run the deterministic survey engine on a hypothetical primitive: Shor/Grover resource ledger, six weighted factors, binding constraint and a recommended action. No records are written.",
    inputSchema: {
      type: "object",
      properties: {
        label: { type: "string", maxLength: 120 },
        system: { type: "string", maxLength: 80 },
        usage: { type: "string", maxLength: 40 },
        algorithm: { type: "string", maxLength: 64 },
        deployment: { type: "string", maxLength: 40 },
        confidentialityYears: { type: "number", minimum: 0, maximum: 100 },
        dataClass: { type: "string", maxLength: 40 },
        ownerTeam: { type: "string", maxLength: 80 },
        notes: { type: "string", maxLength: 600 },
        cve: { type: "string", maxLength: 32 },
        horizonYear: { type: "number", minimum: 2026, maximum: 2045 },
        regimeId: { type: "string", maxLength: 40 },
        attackerProfile: { type: "string", enum: ["conservative", "expected", "aggressive"] },
      },
      required: ["usage", "algorithm", "deployment", "confidentialityYears", "dataClass"],
      additionalProperties: false,
    },
  },
  {
    name: "plan_migration_waves",
    description:
      "Sequence the caller's estate into migration waves using Grover amplitude amplification over candidate systems. Read-only.",
    inputSchema: {
      type: "object",
      properties: {},
      additionalProperties: false,
    },
  },
  {
    name: "save_asset",
    description:
      "Create a cryptographic asset and score it with the shared engine. Idempotent: pass the same idempotencyKey to retry safely.",
    inputSchema: {
      type: "object",
      properties: {
        label: { type: "string", maxLength: 120 },
        system: { type: "string", maxLength: 80 },
        usage: { type: "string", maxLength: 40 },
        algorithm: { type: "string", maxLength: 64 },
        deployment: { type: "string", maxLength: 40 },
        confidentialityYears: { type: "number", minimum: 0, maximum: 100 },
        dataClass: { type: "string", maxLength: 40 },
        ownerTeam: { type: "string", maxLength: 80 },
        notes: { type: "string", maxLength: 600 },
        cve: { type: "string", maxLength: 32 },
        idempotencyKey: { type: "string", maxLength: 120 },
      },
      required: ["label", "system", "usage", "algorithm", "deployment", "confidentialityYears", "dataClass", "ownerTeam"],
      additionalProperties: false,
    },
  },
  {
    name: "record_decision",
    description:
      "Record a migration decision on an asset and re-score it. Idempotent: repeating the same decision writes no second audit event.",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string", maxLength: 64 },
        decision: {
          type: "string",
          enum: ["none", "accept", "schedule", "migrating", "migrated", "retire"],
        },
        note: { type: "string", maxLength: 280 },
      },
      required: ["id", "decision"],
      additionalProperties: false,
    },
  },
  {
    name: "retire_asset",
    description:
      "Retire an asset. The row is tombstoned rather than deleted so the audit chain still replays. Idempotent.",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string", maxLength: 64 },
        reason: { type: "string", maxLength: 280 },
      },
      required: ["id"],
      additionalProperties: false,
    },
  },
  {
    name: "create_share_report",
    description:
      "Freeze the current survey into a partner-readable report and return its share token.",
    inputSchema: {
      type: "object",
      properties: {
        label: { type: "string", maxLength: 120 },
        orgName: { type: "string", maxLength: 120 },
      },
      required: ["label"],
      additionalProperties: false,
    },
  },
  {
    name: "verify_integrity",
    description:
      "Replay the caller's SHA-384 seal chain and report the first broken link, if any.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "strata_signals",
    description:
      "Fetch the live external signals behind the survey: CISA known exploited vulnerabilities and arXiv quant-ph preprints, each labeled live or fallback.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
  },
] as const;

/** JSON-RPC success envelope as a plain object; the response is built once. */
function ok(id: unknown, result: unknown) {
  return { jsonrpc: "2.0", id: id ?? null, result };
}

function errorPayload(id: unknown, code: number, message: string, data?: unknown) {
  return {
    jsonrpc: "2.0",
    id: id ?? null,
    error: data === undefined ? { code, message } : { code, message, data },
  };
}

function fail(id: unknown, code: number, message: string, data?: unknown) {
  return NextResponse.json(errorPayload(id, code, message, data));
}

async function runTool(
  name: string,
  params: Record<string, unknown>,
  scope: string | null,
): Promise<{ value: unknown; isError?: boolean }> {
  switch (name) {
    case "list_assets": {
      const assets = await listAssets(scope ?? "__none__", {
        status: params.status as string | undefined,
        band: params.band as string | undefined,
        system: params.system as string | undefined,
        sort: params.sort as "score" | "rupture" | "label" | "updated" | undefined,
      });
      return {
        value: {
          count: assets.length,
          assets: assets.map((asset) => ({
            id: asset.id,
            label: asset.label,
            system: asset.system,
            usage: asset.usage,
            algorithm: asset.algorithm,
            bits: asset.bits,
            deployment: asset.deployment,
            dataClass: asset.dataClass,
            confidentialityYears: asset.confidentialityYears,
            status: asset.status,
            exposureScore: asset.exposureScore,
            band: asset.exposureBand,
            ruptureYear: asset.ruptureYear,
            decision: asset.decision,
            seal: asset.seal,
          })),
        },
      };
    }

    case "get_asset": {
      if (!scope) return { value: { error: "No owner capability was supplied." }, isError: true };
      const id = String(params.id ?? "");
      const [asset, events] = await Promise.all([
        listAssets(scope, {}).then((all) => all.find((candidate) => candidate.id === id) ?? null),
        listEvents(scope, id),
      ]);
      if (!asset) return { value: { error: "Asset not found in this owner scope." }, isError: true };
      return { value: { asset, auditTrail: events } };
    }

    case "estimate_quantum_cost": {
      const profile = scope ? await getProfile(scope) : null;
      const draft = assetDraftSchema.parse({
        label: String(params.label ?? "hypothetical primitive"),
        system: String(params.system ?? "hypothetical"),
        usage: params.usage,
        algorithm: params.algorithm,
        deployment: params.deployment,
        confidentialityYears: params.confidentialityYears,
        dataClass: params.dataClass,
        ownerTeam: String(params.ownerTeam ?? "unassigned"),
        notes: params.notes ?? "",
        cve: params.cve ?? null,
      });
      const result = scoreAsset({
        ...(draft as AssetDraft),
        decision: "none",
        horizonYear: Number(params.horizonYear ?? profile?.horizonYear ?? 2026),
        regime: getRegime(String(params.regimeId ?? profile?.regimeId ?? "nist-ir-8547")),
        attackerProfile: String(params.attackerProfile ?? profile?.attackerProfile ?? "expected"),
      });
      return {
        value: {
          engineVersion: ENGINE_VERSION,
          algorithm: getAlgorithm(draft.algorithm) ?? null,
          migrationTarget: getAlgorithm(draft.algorithm)?.migrationTarget ?? null,
          result,
        },
      };
    }

    case "plan_migration_waves": {
      if (!scope) return { value: { waves: [], note: "No owner capability supplied." } };
      const assets = await listAssets(scope, { status: "active" });
      const waves = buildWaves(assets);
      return {
        value: {
          engineVersion: ENGINE_VERSION,
          queue: migrationQueue(assets).map((asset) => ({
            id: asset.id,
            label: asset.label,
            exposureScore: asset.exposureScore,
            ruptureYear: asset.ruptureYear,
          })),
          waves,
        },
      };
    }

    case "save_asset": {
      if (!scope) return { value: { error: "An owner capability is required to write." }, isError: true };
      const draft = assetDraftSchema.parse(params) as AssetDraft;
      const result = await createAsset(
        scope,
        draft,
        false,
        params.idempotencyKey === undefined ? null : String(params.idempotencyKey).slice(0, 120),
      );
      return {
        value: {
          created: result.created,
          asset: result.asset,
          exposure: result.exposure,
          seal: `sha384:${result.event.seal.slice(0, 16)}`,
        },
      };
    }

    case "record_decision": {
      if (!scope) return { value: { error: "An owner capability is required to write." }, isError: true };
      const parsed = decisionSchema.parse(params);
      const result = await recordDecision(scope, String(params.id), parsed.decision as MigrationDecision, parsed.note);
      if (!result) return { value: { error: "Asset not found in this owner scope." }, isError: true };
      return {
        value: {
          asset: result.asset,
          exposure: result.exposure,
          seal: `sha384:${result.event.seal.slice(0, 16)}`,
        },
      };
    }

    case "retire_asset": {
      if (!scope) return { value: { error: "An owner capability is required to write." }, isError: true };
      const asset = await retireAsset(
        scope,
        String(params.id),
        String(params.reason ?? "retired via agent"),
      );
      if (!asset) return { value: { error: "Asset not found in this owner scope." }, isError: true };
      return { value: { asset, tombstone: true } };
    }

    case "create_share_report": {
      if (!scope) return { value: { error: "An owner capability is required to write." }, isError: true };
      const profile = await getProfile(scope);
      const assets = await listAssets(scope, {});
      const events = await listEvents(scope);
      const exposures = new Map<string, ReturnType<typeof evaluate>>();
      for (const asset of assets) {
        exposures.set(asset.id, evaluate(assetDraftOf(asset), asset.decision, {
          horizonYear: profile.horizonYear,
          regimeId: profile.regimeId,
          attackerProfile: profile.attackerProfile,
        }));
      }
      const replay = replayScope(events, await tombstonedIds(scope));
      const report = buildReport({
        org: String(params.orgName ?? profile.orgName),
        profile,
        assets,
        exposures,
        provenance: {
          kev: {
            status: "live",
            source: "CISA Known Exploited Vulnerabilities catalog",
            sourceUrl: "https://www.cisa.gov/sites/default/files/feeds/known_exploited_vulnerabilities.json",
            fetchedAt: new Date().toISOString(),
            attribution: "CISA",
            note: "Retrieved while building this report.",
          },
          research: {
            status: "live",
            source: "arXiv quant-ph",
            sourceUrl: "https://arxiv.org/list/quant-ph/recent",
            fetchedAt: new Date().toISOString(),
            attribution: "arXiv",
            note: "Retrieved while building this report.",
          },
        },
        integrity: replay,
      });
      const grant = await createShare(scope, String(params.label).slice(0, 120), report as unknown as Record<string, unknown>, assets.length);
      return { value: { token: grant.token, label: grant.label, assetCount: grant.assetCount, createdAt: grant.createdAt } };
    }

    case "verify_integrity": {
      if (!scope) return { value: { error: "No owner capability supplied." }, isError: true };
      const events = await listEvents(scope);
      const report = replayScope(events, await tombstonedIds(scope));
      return { value: report };
    }

    case "strata_signals": {
      const feed = await fetchStrata();
      return { value: feed };
    }

    default:
      return { value: { error: `Unknown tool ${name}` }, isError: true };
  }
}

function assetDraftOf(asset: {
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
}): AssetDraft {
  return {
    label: asset.label,
    system: asset.system,
    usage: asset.usage as AssetDraft["usage"],
    algorithm: asset.algorithm,
    deployment: asset.deployment as AssetDraft["deployment"],
    confidentialityYears: asset.confidentialityYears,
    dataClass: asset.dataClass as AssetDraft["dataClass"],
    ownerTeam: asset.ownerTeam,
    notes: asset.notes,
    cve: asset.cve,
  };
}

export async function POST(request: Request) {
  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return fail(null, JSONRPC_PARSE, "Request body is not valid JSON.");
  }

  const batch = Array.isArray(payload);
  const messages = (batch ? payload : [payload]) as RpcRequest[];

  if (messages.length === 0 || messages.length > 20) {
    return fail(null, JSONRPC_INVALID, "Send between 1 and 20 JSON-RPC messages.");
  }

  const responses: unknown[] = [];

  for (const message of messages) {
    if (!message || typeof message !== "object" || message.jsonrpc !== "2.0" || typeof message.method !== "string") {
      responses.push(
        errorPayload(
          (message as RpcRequest)?.id ?? null,
          JSONRPC_INVALID,
          "Each message needs jsonrpc:'2.0' and a method.",
        ),
      );
      continue;
    }

    const params = (message.params ?? {}) as Record<string, unknown>;
    const requestedTool = message.method === "tools/call" ? String(params.name ?? "") : "";
    const writes = !READ_ONLY_TOOLS.has(requestedTool);

    const scope = await resolveScope(request, { create: Boolean(writes) });
    if (scope) {
      const quota = takeQuota(`mcp:${scope}`, MCP_LIMIT_PER_MINUTE);
      if (!quota.allowed) {
        responses.push(
          errorPayload(
            message.id ?? null,
            JSONRPC_INTERNAL,
            `Rate limit reached. Retry in ${quota.retryAfterSeconds}s.`,
          ),
        );
        continue;
      }
    }

    switch (message.method) {
      case "initialize":
        responses.push(
          ok(message.id, {
            protocolVersion: PROTOCOL_VERSION,
            capabilities: { tools: { listChanged: false } },
            serverInfo: SERVER_INFO,
            instructions:
              "Cryptotremor surveys a cryptographic estate for post-quantum exposure. Pass the returned ownerToken as the x-ct-owner header on every call to keep the same estate.",
            ownerToken: scope,
            engineVersion: ENGINE_VERSION,
          }),
        );
        break;

      case "notifications/initialized":
      case "initialized":
        break;

      case "ping":
        responses.push(ok(message.id, {}));
        break;

      case "tools/list":
        responses.push(ok(message.id, { tools: TOOL_DEFS }));
        break;

      case "tools/call": {
        const toolName = String(params.name ?? "");
        if (!TOOL_DEFS.some((tool) => tool.name === toolName)) {
          responses.push(
            errorPayload(message.id ?? null, JSONRPC_METHOD, `No such tool: ${toolName}`),
          );
          break;
        }
        try {
          const result = await runTool(toolName, (params.arguments ?? {}) as Record<string, unknown>, scope);
          responses.push(
            ok(message.id, {
              content: [{ type: "text", text: JSON.stringify(result.value, null, 2) }],
              structuredContent: result.value,
              isError: Boolean(result.isError),
            }),
          );
        } catch (error) {
          const messageText =
            error instanceof ZodError
              ? `Invalid arguments: ${zodMessage(error)}`
              : `Tool failed: ${error instanceof Error ? error.message : "unknown error"}`;
          responses.push(errorPayload(message.id ?? null, JSONRPC_PARAMS, messageText));
        }
        break;
      }

      default:
        responses.push(
          errorPayload(
            message.id ?? null,
            JSONRPC_METHOD,
            `Unknown method ${message.method}`,
          ),
        );
    }
  }

  if (batch) return NextResponse.json(responses);
  return NextResponse.json(responses[0]);
}

export async function GET() {
  return NextResponse.json({
    protocolVersion: PROTOCOL_VERSION,
    serverInfo: SERVER_INFO,
    transport: "POST JSON-RPC 2.0 to /api/mcp",
    tools: TOOL_DEFS.map((tool) => tool.name),
    ownerHeader: "x-ct-owner",
  });
}