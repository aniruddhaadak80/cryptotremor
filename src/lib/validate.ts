/**
 * Request validation.
 *
 * Every write goes through these schemas before it reaches SQL, so a malformed
 * manifest fails with a useful message instead of a constraint violation. Input
 * sizes are bounded because the product is anonymous and public.
 */

import { z } from "zod";
import { ALGORITHM_IDS, DATA_CLASSES, DECISIONS, DEPLOYMENTS, USAGES, canonicalAlgorithmId } from "./engine/index.ts";
import type { AssetDraft } from "./types.ts";

export const MAX_IMPORT_ROWS = 200;

const bounded = (max: number) => z.string().trim().max(max);

export const assetDraftSchema = z.object({
  label: bounded(120).min(1, "Give the primitive a name"),
  system: bounded(80).min(1, "Name the system that owns it"),
  usage: z.enum(USAGES as unknown as [string, ...string[]]),
  algorithm: bounded(64).min(1, "Choose an algorithm"),
  deployment: z.enum(DEPLOYMENTS as unknown as [string, ...string[]]),
  confidentialityYears: z.coerce
    .number()
    .int()
    .min(0)
    .max(100, "Confidentiality lifetime of 100 years or more is almost certainly a typo"),
  dataClass: z.enum(DATA_CLASSES as unknown as [string, ...string[]]),
  ownerTeam: bounded(80).min(1, "Name the owning team"),
  notes: bounded(600).default(""),
  cve: z
    .string()
    .trim()
    .max(32)
    .regex(/^CVE-\d{4}-\d{4,7}$/i, "Use CVE-YYYY-NNNN format, or leave it blank")
    .nullable()
    .optional(),
});

export const assetPatchSchema = z.object({
  label: bounded(120).min(1).optional(),
  system: bounded(80).min(1).optional(),
  usage: z.enum(USAGES as unknown as [string, ...string[]]).optional(),
  algorithm: bounded(64).min(1).optional(),
  deployment: z.enum(DEPLOYMENTS as unknown as [string, ...string[]]).optional(),
  confidentialityYears: z.coerce.number().int().min(0).max(100).optional(),
  dataClass: z.enum(DATA_CLASSES as unknown as [string, ...string[]]).optional(),
  ownerTeam: bounded(80).min(1).optional(),
  notes: bounded(600).optional(),
  cve: z
    .string()
    .trim()
    .max(32)
    .regex(/^CVE-\d{4}-\d{4,7}$/i)
    .nullable()
    .optional(),
  decision: z.enum(DECISIONS as unknown as [string, ...string[]]).optional(),
  decisionNote: bounded(280).optional(),
});

export const decisionSchema = z.object({
  decision: z.enum(DECISIONS as unknown as [string, ...string[]]),
  note: bounded(280).default(""),
});

export const profileSchema = z.object({
  orgName: bounded(120).optional(),
  horizonYear: z.coerce.number().int().min(2026).max(2045).optional(),
  regimeId: z.enum(["nist-ir-8547", "eo-14412", "cnsa-2", "uk-ncsc"]).optional(),
  attackerProfile: z.enum(["conservative", "expected", "aggressive"]).optional(),
  tolerance: z.coerce.number().int().min(0).max(100).optional(),
});

export const shareSchema = z.object({
  label: bounded(120).min(1, "Name the report so your partners know what it is"),
  orgName: bounded(120).optional(),
});

export const engineRequestSchema = z.object({
  assetIds: z.array(z.string().max(64)).max(200).optional(),
  horizonYear: z.coerce.number().int().min(2026).max(2045).optional(),
  regimeId: z.enum(["nist-ir-8547", "eo-14412", "cnsa-2", "uk-ncsc"]).optional(),
  attackerProfile: z.enum(["conservative", "expected", "aggressive"]).optional(),
});

export const assetListQuerySchema = z.object({
  search: bounded(120).optional(),
  usage: bounded(40).optional(),
  deployment: bounded(40).optional(),
  dataClass: bounded(40).optional(),
  band: bounded(20).optional(),
  status: z.enum(["active", "retired"]).optional(),
  system: bounded(80).optional(),
  algorithm: bounded(64).optional(),
  sort: z.enum(["score", "rupture", "label", "updated"]).optional(),
  limit: z.coerce.number().int().min(1).max(200).optional(),
});

/** Suggests registry ids for a misspelled algorithm. */
export function suggestAlgorithms(value: string): string[] {
  const needle = value.toLowerCase().replace(/[^a-z0-9]/g, "");
  if (!needle) return [];
  return ALGORITHM_IDS.filter((id: string) => {
    const flat = id.toLowerCase().replace(/[^a-z0-9]/g, "");
    return flat.includes(needle) || needle.includes(flat.slice(0, 4));
  }).slice(0, 5);
}

export function validateAlgorithm(value: string): string | null {
  if (ALGORITHM_IDS.includes(value) || canonicalAlgorithmId(value)) return null;
  const suggestions = suggestAlgorithms(value);
  return suggestions.length > 0
    ? `Unknown algorithm "${value}". Did you mean ${suggestions.join(", ")}?`
    : `Unknown algorithm "${value}". Check the registry in settings for the exact id.`;
}

/* -------------------------------------------------------------- manifest */

export interface ManifestRowResult {
  drafts: AssetDraft[];
  errors: { row: number; message: string }[];
}

/** Minimal RFC 4180 style CSV reader: handles quoted fields and embedded commas. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  const source = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");

  for (let i = 0; i < source.length; i += 1) {
    const char = source[i];
    if (inQuotes) {
      if (char === '"') {
        if (source[i + 1] === '"') {
          field += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        field += char;
      }
      continue;
    }
    if (char === '"') {
      inQuotes = true;
    } else if (char === ",") {
      row.push(field);
      field = "";
    } else if (char === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else {
      field += char;
    }
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((entry) => entry.some((cell) => cell.trim().length > 0));
}

function coerceInt(value: string | undefined, fallback: number): number {
  if (value === undefined) return fallback;
  const trimmed = value.trim();
  if (trimmed === "") return fallback;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? Math.trunc(parsed) : Number.NaN;
}

/**
 * Accepts either a CSV manifest or a JSON array of objects. Rows that fail
 * validation are reported individually so one typo never discards a whole
 * import.
 */
export function parseManifest(input: string): ManifestRowResult {
  const trimmed = input.trim();
  const drafts: AssetDraft[] = [];
  const errors: { row: number; message: string }[] = [];

  const recordFromObject = (raw: Record<string, unknown>, row: number) => {
    const candidate = {
      label: String(raw.label ?? ""),
      system: String(raw.system ?? ""),
      usage: String(raw.usage ?? ""),
      algorithm: String(raw.algorithm ?? ""),
      deployment: String(raw.deployment ?? ""),
      confidentialityYears: coerceInt(
        raw.confidentialityYears === undefined ? undefined : String(raw.confidentialityYears),
        5,
      ),
      dataClass: String(raw.dataClass ?? ""),
      ownerTeam: String(raw.ownerTeam ?? ""),
      notes: raw.notes === undefined ? "" : String(raw.notes),
      cve:
        raw.cve === undefined || raw.cve === null || String(raw.cve).trim() === ""
          ? null
          : String(raw.cve),
    };
    const algorithmProblem = validateAlgorithm(candidate.algorithm);
    if (algorithmProblem) {
      errors.push({ row, message: algorithmProblem });
      return;
    }
    const parsed = assetDraftSchema.safeParse(candidate);
    if (!parsed.success) {
      const first = parsed.error.issues[0];
      errors.push({ row, message: `${first.path.join(".") || "row"}: ${first.message}` });
      return;
    }
    drafts.push(parsed.data as AssetDraft);
  };

  if (trimmed.startsWith("[") || trimmed.startsWith("{")) {
    let json: unknown;
    try {
      json = JSON.parse(trimmed);
    } catch {
      return { drafts: [], errors: [{ row: 0, message: "That is not valid JSON." }] };
    }
    const list = Array.isArray(json) ? json : (json as { assets?: unknown[] })?.assets;
    if (!Array.isArray(list)) {
      return { drafts: [], errors: [{ row: 0, message: "Expected a JSON array of assets." }] };
    }
    if (list.length > MAX_IMPORT_ROWS) {
      return {
        drafts: [],
        errors: [{ row: 0, message: `Import at most ${MAX_IMPORT_ROWS} rows at a time.` }],
      };
    }
    list.forEach((entry, index) => {
      if (entry && typeof entry === "object") recordFromObject(entry as Record<string, unknown>, index + 1);
      else errors.push({ row: index + 1, message: "Expected an object." });
    });
    return { drafts, errors };
  }

  const table = parseCsv(trimmed);
  if (table.length < 2) {
    return { drafts: [], errors: [{ row: 0, message: "The manifest needs a header row and at least one asset row." }] };
  }
  const header = table[0].map((cell) => cell.trim().toLowerCase());
  const required = ["label", "system", "usage", "algorithm", "deployment", "confidentialityyears", "dataclass", "ownerteam"];
  const missing = required.filter((column) => !header.includes(column));
  if (missing.length > 0) {
    return { drafts: [], errors: [{ row: 1, message: `Missing column(s): ${missing.join(", ")}` }] };
  }
  if (table.length - 1 > MAX_IMPORT_ROWS) {
    return {
      drafts: [],
      errors: [{ row: 0, message: `Import at most ${MAX_IMPORT_ROWS} rows at a time.` }],
    };
  }

  const index = (name: string) => header.indexOf(name);
  table.slice(1).forEach((cells, offset) => {
    const row = offset + 2;
    const at = (name: string) => {
      const position = index(name);
      return position === -1 ? "" : (cells[position] ?? "").trim();
    };
    recordFromObject(
      {
        label: at("label"),
        system: at("system"),
        usage: at("usage"),
        algorithm: at("algorithm"),
        deployment: at("deployment"),
        confidentialityYears: at("confidentialityyears") || "5",
        dataClass: at("dataclass"),
        ownerTeam: at("ownerteam"),
        notes: at("notes"),
        cve: at("cve"),
      },
      row,
    );
  });

  return { drafts, errors };
}

/** Maps a zod failure into the stable API error envelope. */
export function zodMessage(error: z.ZodError): string {
  const issue = error.issues[0];
  if (!issue) return "Invalid request.";
  const field = issue.path.join(".") || "request";
  return `${field}: ${issue.message}`;
}