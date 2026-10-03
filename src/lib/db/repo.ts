/**
 * Typed repository over the storage adapter.
 *
 * This is the only place that knows SQL. Every mutation writes the row and its
 * audit event in one transaction, so a survey can never contain an event that
 * has no asset or an asset with no seal.
 */

import { randomUUID } from "node:crypto";
import type {
  AssetDraft,
  AssetPatch,
  AuditEvent,
  AuditEventType,
  CryptoAsset,
  ExposureResult,
  MigrationDecision,
  Profile,
  ShareGrant,
} from "../types.ts";
import {
  DEFAULT_SETTINGS,

  getRegime,
  resolveAlgorithm,
  scoreAsset,
} from "../engine/index.ts";
import { GENESIS_SEAL, computeSeal } from "../integrity/seal.ts";
export type { SurveySettings } from "../domain/registry.ts";
import type { SurveySettings } from "../domain/registry.ts";
import { getSql } from "./client.ts";
import { ensureSchema } from "./schema.ts";
import type { SqlClient } from "./types.ts";



export interface AssetFilters {
  search?: string;
  usage?: string;
  deployment?: string;
  dataClass?: string;
  band?: string;
  status?: string;
  system?: string;
  algorithm?: string;
  sort?: "score" | "rupture" | "label" | "updated";
}

const SORT_SQL: Record<NonNullable<AssetFilters["sort"]>, string> = {
  score: "exposure_score desc, created_at asc",
  rupture: "rupture_year asc nulls last, exposure_score desc",
  label: "label asc",
  updated: "updated_at desc",
};

/* ------------------------------------------------------------------ rows */

interface AssetRow {
  id: string;
  owner_scope: string;
  label: string;
  system: string;
  usage: string;
  algorithm: string;
  bits: number;
  deployment: string;
  confidentiality_years: number;
  data_class: string;
  owner_team: string;
  notes: string;
  cve: string | null;
  decision: string;
  decision_note: string;
  decided_at: Date | string | null;
  status: string;
  exposure_score: number | string;
  exposure_band: string;
  rupture_year: number | string | null;
  horizon_year: number;
  created_at: Date | string;
  updated_at: Date | string;
}

function iso(value: Date | string | null): string | null {
  if (value === null) return null;
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function num(value: number | string | null): number {
  if (value === null) return 0;
  return typeof value === "number" ? value : Number(value);
}

function toAsset(row: AssetRow): CryptoAsset {
  return {
    id: row.id,
    ownerScope: row.owner_scope,
    label: row.label,
    system: row.system,
    usage: row.usage as CryptoAsset["usage"],
    algorithm: row.algorithm,
    bits: Number(row.bits),
    deployment: row.deployment as CryptoAsset["deployment"],
    confidentialityYears: Number(row.confidentiality_years),
    dataClass: row.data_class as CryptoAsset["dataClass"],
    ownerTeam: row.owner_team,
    notes: row.notes,
    cve: row.cve,
    decision: row.decision as MigrationDecision,
    decisionNote: row.decision_note,
    decidedAt: iso(row.decided_at),
    status: row.status as CryptoAsset["status"],
    createdAt: iso(row.created_at) ?? new Date().toISOString(),
    updatedAt: iso(row.updated_at) ?? new Date().toISOString(),
    exposureScore: num(row.exposure_score),
    exposureBand: row.exposure_band as CryptoAsset["exposureBand"],
    ruptureYear: row.rupture_year === null ? null : num(row.rupture_year),
    seal: null,
  };
}

interface AuditRow {
  id: string;
  owner_scope: string;
  entity_id: string;
  seq: number;
  type: string;
  payload: Record<string, unknown> | string;
  prev_seal: string;
  seal: string;
  created_at: Date | string;
}

function toEvent(row: AuditRow): AuditEvent {
  return {
    id: row.id,
    ownerScope: row.owner_scope,
    entityId: row.entity_id,
    seq: Number(row.seq),
    type: row.type as AuditEventType,
    payload:
      typeof row.payload === "string"
        ? (JSON.parse(row.payload) as Record<string, unknown>)
        : (row.payload ?? {}),
    prevSeal: row.prev_seal,
    seal: row.seal,
    createdAt: iso(row.created_at) ?? new Date().toISOString(),
  };
}

interface ProfileRow {
  owner_scope: string;
  org_name: string;
  horizon_year: number;
  regime_id: string;
  attacker_profile: string;
  tolerance: number;
  updated_at: Date | string;
}

function toProfile(row: ProfileRow): Profile {
  return {
    ownerScope: row.owner_scope,
    orgName: row.org_name,
    horizonYear: Number(row.horizon_year),
    regimeId: row.regime_id,
    attackerProfile: row.attacker_profile,
    tolerance: Number(row.tolerance),
    updatedAt: iso(row.updated_at) ?? new Date().toISOString(),
  };
}

/* --------------------------------------------------------------- helpers */

async function client(): Promise<SqlClient> {
  const sql = await getSql();
  await ensureSchema(sql);
  return sql;
}

function ruptureFor(result: ExposureResult): number | null {
  return result.ruptureYearProfile ? result.quantum.ruptureYear[result.ruptureYearProfile] ?? null : null;
}

export function evaluate(
  draft: AssetDraft,
  decision: MigrationDecision,
  settings: SurveySettings,
  knownExploited = false,
): ExposureResult {
  return scoreAsset({
    ...draft,
    decision,
    horizonYear: settings.horizonYear,
    regime: getRegime(settings.regimeId),
    attackerProfile: settings.attackerProfile,
    knownExploited,
  });
}

async function resolveSettings(sql: SqlClient, scope: string): Promise<SurveySettings> {
  const { rows } = await sql.query<ProfileRow>(
    "select owner_scope, org_name, horizon_year, regime_id, attacker_profile, tolerance, updated_at from profiles where owner_scope = $1",
    [scope],
  );
  const row = rows[0];
  if (!row) return DEFAULT_SETTINGS;
  return {
    horizonYear: Number(row.horizon_year),
    regimeId: row.regime_id,
    attackerProfile: row.attacker_profile,
  };
}

async function appendEvent(
  sql: SqlClient,
  scope: string,
  entityId: string,
  type: AuditEventType,
  payload: Record<string, unknown>,
  createdAt: string,
): Promise<AuditEvent> {
  const { rows } = await sql.query<{ seq: number; seal: string }>(
    "select seq, seal from audit_events where entity_id = $1 order by seq desc limit 1",
    [entityId],
  );
  const previous = rows[0];
  const seq = previous ? Number(previous.seq) + 1 : 1;
  // The previous event's seal is this event's prevSeal.
  const actualPrev = previous ? previous.seal : GENESIS_SEAL;
  const sealable = { entityId, seq, type, payload, createdAt };
  const seal = computeSeal(actualPrev, sealable);
  const id = randomUUID();
  await sql.query(
    `insert into audit_events (id, owner_scope, entity_id, seq, type, payload, prev_seal, seal, created_at)
     values ($1, $2, $3, $4, $5, $6::jsonb, $7, $8, $9)`,
    [id, scope, entityId, seq, type, JSON.stringify(payload), actualPrev, seal, createdAt],
  );
  return {
    id,
    ownerScope: scope,
    entityId,
    seq,
    type,
    payload,
    prevSeal: actualPrev,
    seal,
    createdAt,
  };
}

/* ------------------------------------------------------------------ read */

export async function listAssets(
  scope: string,
  filters: AssetFilters = {},
): Promise<CryptoAsset[]> {
  const sql = await client();
  const clauses = ["owner_scope = $1"];
  const params: unknown[] = [scope];
  const add = (clause: string, value: unknown) => {
    params.push(value);
    clauses.push(clause.replace("?", `$${params.length}`));
  };

  if (filters.status) add("status = ?", filters.status);
  if (filters.usage) add("usage = ?", filters.usage);
  if (filters.deployment) add("deployment = ?", filters.deployment);
  if (filters.dataClass) add("data_class = ?", filters.dataClass);
  if (filters.band) add("exposure_band = ?", filters.band);
  if (filters.system) add("system = ?", filters.system);
  if (filters.algorithm) add("algorithm = ?", filters.algorithm);
  if (filters.search) {
    params.push(`%${filters.search.toLowerCase()}%`);
    const idx = params.length;
    clauses.push(
      `(lower(label) like $${idx} or lower(system) like $${idx} or lower(algorithm) like $${idx} or lower(owner_team) like $${idx} or lower(notes) like $${idx})`,
    );
  }

  const order = SORT_SQL[filters.sort ?? "score"];
  const { rows } = await sql.query<AssetRow>(
    `select * from assets where ${clauses.join(" and ")} order by ${order} limit 500`,
    params,
  );
  const assets = rows.map(toAsset);
  if (assets.length > 0) {
    const seals = await sealsFor(sql, scope, assets.map((a) => a.id));
    for (const asset of assets) asset.seal = seals.get(asset.id) ?? null;
  }
  return assets;
}

async function sealsFor(
  sql: SqlClient,
  scope: string,
  ids: string[],
): Promise<Map<string, string>> {
  const { rows } = await sql.query<{ entity_id: string; seal: string }>(
    `select distinct on (entity_id) entity_id, seal from audit_events
     where owner_scope = $1 and entity_id = any($2::text[])
     order by entity_id, seq desc`,
    [scope, ids],
  );
  return new Map(rows.map((row) => [row.entity_id, row.seal]));
}

export async function getAsset(scope: string, id: string): Promise<CryptoAsset | null> {
  const sql = await client();
  const { rows } = await sql.query<AssetRow>("select * from assets where owner_scope = $1 and id = $2", [
    scope,
    id,
  ]);
  const row = rows[0];
  if (!row) return null;
  const asset = toAsset(row);
  const seals = await sealsFor(sql, scope, [id]);
  asset.seal = seals.get(id) ?? null;
  return asset;
}

export async function countAssets(scope: string): Promise<number> {
  const sql = await client();
  const { rows } = await sql.query<{ count: number | string }>(
    "select count(*) as count from assets where owner_scope = $1",
    [scope],
  );
  return Number(rows[0]?.count ?? 0);
}

/* ----------------------------------------------------------------- write */

export interface MutationResult {
  asset: CryptoAsset;
  exposure: ExposureResult;
  event: AuditEvent;
  created: boolean;
}

export async function createAsset(
  scope: string,
  draft: AssetDraft,
  knownExploited = false,
  idempotencyKey?: string | null,
): Promise<MutationResult> {
  const sql = await client();

  // Durable idempotency: an agent that retries with the same key gets the
  // original row back instead of a duplicate, and no second audit event.
  if (idempotencyKey) {
    const { rows } = await sql.query<AssetRow>(
      "select * from assets where owner_scope = $1 and idempotency_key = $2",
      [scope, idempotencyKey],
    );
    const existing = rows[0];
    if (existing) {
      const asset = toAsset(existing);
      const events = await listEvents(scope, asset.id);
      const event = events[events.length - 1];
      asset.seal = event?.seal ?? null;
      return {
        asset,
        exposure: evaluate(draftFromAsset(asset), asset.decision, await resolveSettings(sql, scope), knownExploited),
        event: event as AuditEvent,
        created: false,
      };
    }
  }

  const settings = await resolveSettings(sql, scope);
  const exposure = evaluate(draft, "none", settings, knownExploited);
  const spec = resolveAlgorithm(draft.algorithm);
  const id = randomUUID();
  const now = new Date().toISOString();

  return sql.transaction(async (tx) => {
    await tx.query(
      `insert into assets (
         id, owner_scope, label, system, usage, algorithm, bits, deployment,
         confidentiality_years, data_class, owner_team, notes, cve, decision,
         decision_note, decided_at, status, exposure_score, exposure_band,
         rupture_year, horizon_year, idempotency_key, created_at, updated_at
       ) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,'none','',null,'active',$14,$15,$16,$17,$18,$19,$19)`,
      [
        id,
        scope,
        draft.label,
        draft.system,
        draft.usage,
        draft.algorithm,
        spec.bits,
        draft.deployment,
        draft.confidentialityYears,
        draft.dataClass,
        draft.ownerTeam,
        draft.notes,
        draft.cve ?? null,
        exposure.score,
        exposure.band,
        ruptureFor(exposure),
        settings.horizonYear,
        idempotencyKey ?? null,
        now,
      ],
    );
    const event = await appendEvent(
      tx,
      scope,
      id,
      "asset.create",
      {
        label: draft.label,
        system: draft.system,
        usage: draft.usage,
        algorithm: draft.algorithm,
        deployment: draft.deployment,
        confidentialityYears: draft.confidentialityYears,
        dataClass: draft.dataClass,
        ownerTeam: draft.ownerTeam,
        cve: draft.cve ?? null,
        engineVersion: exposure.engineVersion,
        exposureScore: exposure.score,
        ruptureYear: ruptureFor(exposure),
      },
      now,
    );
    const asset = (await getAssetIn(tx, scope, id)) as CryptoAsset;
    asset.seal = event.seal;
    return { asset, exposure, event, created: true };
  });
}

async function getAssetIn(sql: SqlClient, scope: string, id: string): Promise<CryptoAsset | null> {
  const { rows } = await sql.query<AssetRow>("select * from assets where owner_scope = $1 and id = $2", [
    scope,
    id,
  ]);
  return rows[0] ? toAsset(rows[0]) : null;
}

function draftFromAsset(asset: CryptoAsset): AssetDraft {
  return {
    label: asset.label,
    system: asset.system,
    usage: asset.usage,
    algorithm: asset.algorithm,
    deployment: asset.deployment,
    confidentialityYears: asset.confidentialityYears,
    dataClass: asset.dataClass,
    ownerTeam: asset.ownerTeam,
    notes: asset.notes,
    cve: asset.cve,
  };
}

export async function updateAsset(
  scope: string,
  id: string,
  patch: AssetPatch,
  knownExploited = false,
): Promise<MutationResult | null> {
  const sql = await client();
  const existing = await getAsset(scope, id);
  if (!existing) return null;
  const settings = await resolveSettings(sql, scope);
  const merged: AssetDraft = { ...draftFromAsset(existing), ...stripDecision(patch) };
  const decision = patch.decision ?? existing.decision;
  const exposure = evaluate(merged, decision, settings, knownExploited);
  const spec = resolveAlgorithm(merged.algorithm);
  const now = new Date().toISOString();

  const changed: Record<string, unknown> = {};
  for (const [key, value] of Object.entries({ ...merged, decision })) {
    const before = (existing as unknown as Record<string, unknown>)[key];
    if (JSON.stringify(before) !== JSON.stringify(value)) changed[key] = { from: before, to: value };
  }

  return sql.transaction(async (tx) => {
    await tx.query(
      `update assets set label=$3, system=$4, usage=$5, algorithm=$6, bits=$7, deployment=$8,
         confidentiality_years=$9, data_class=$10, owner_team=$11, notes=$12, cve=$13,
         decision=$14, decision_note=$15, decided_at=$16, exposure_score=$17, exposure_band=$18,
         rupture_year=$19, horizon_year=$20, updated_at=$21
       where owner_scope=$1 and id=$2`,
      [
        scope,
        id,
        merged.label,
        merged.system,
        merged.usage,
        merged.algorithm,
        spec.bits,
        merged.deployment,
        merged.confidentialityYears,
        merged.dataClass,
        merged.ownerTeam,
        merged.notes,
        merged.cve ?? null,
        decision,
        patch.decisionNote ?? existing.decisionNote,
        patch.decision ? now : existing.decidedAt,
        exposure.score,
        exposure.band,
        ruptureFor(exposure),
        settings.horizonYear,
        now,
      ],
    );
    const event = await appendEvent(
      tx,
      scope,
      id,
      patch.decision && !changed.decision ? "asset.decide" : "asset.update",
      { changed, engineVersion: exposure.engineVersion, exposureScore: exposure.score },
      now,
    );
    const asset = (await getAssetIn(tx, scope, id)) as CryptoAsset;
    asset.seal = event.seal;
    return { asset, exposure, event, created: false };
  });
}

/** The draft fields of a patch, with the decision fields removed. */
function stripDecision(patch: AssetPatch): Partial<AssetDraft> {
  const rest: Partial<AssetDraft> = { ...patch };
  delete (rest as Partial<AssetPatch>).decision;
  delete (rest as Partial<AssetPatch>).decisionNote;
  return rest;
}

export async function recordDecision(
  scope: string,
  id: string,
  decision: MigrationDecision,
  note: string,
): Promise<MutationResult | null> {
  const sql = await client();
  const existing = await getAsset(scope, id);
  if (!existing) return null;

  // Natural idempotency: recording the same decision twice is one event, so an
  // agent retry can never inflate the audit chain.
  if (existing.decision === decision && existing.decisionNote === note && existing.status === "active") {
    const events = await listEvents(scope, id);
    return {
      asset: existing,
      exposure: evaluate(draftFromAsset(existing), decision, await resolveSettings(sql, scope)),
      event: events[events.length - 1] as AuditEvent,
      created: false,
    };
  }
  return updateAsset(scope, id, { decision, decisionNote: note });
}

export async function retireAsset(scope: string, id: string, reason: string): Promise<CryptoAsset | null> {
  const sql = await client();
  const existing = await getAsset(scope, id);
  if (!existing) return null;
  // Already tombstoned: the chain already records this deletion.
  if (existing.status === "retired") return existing;
  const now = new Date().toISOString();
  return sql.transaction(async (tx) => {
    await tx.query(
      "update assets set status='retired', updated_at=$3 where owner_scope=$1 and id=$2",
      [scope, id, now],
    );
    await appendEvent(
      tx,
      scope,
      id,
      "asset.delete",
      {
        tombstone: true,
        reason: reason.slice(0, 280),
        label: existing.label,
        system: existing.system,
        algorithm: existing.algorithm,
        exposureScore: existing.exposureScore,
        statusBefore: existing.status,
      },
      now,
    );
    const asset = await getAssetIn(tx, scope, id);
    if (asset) asset.status = "retired";
    return asset;
  });
}

/** Recomputes every asset in a scope against new settings. */
export async function rescoreScope(
  scope: string,
  settings?: SurveySettings,
): Promise<{ updated: number; settings: SurveySettings }> {
  const sql = await client();
  const active = await resolveSettings(sql, scope);
  const target = settings ?? active;
  const assets = await listAssets(scope, { status: "active" });
  let updated = 0;
  for (const asset of assets) {
    const draft = draftFromAsset(asset);
    const exposure = evaluate(draft, asset.decision, target);
    const rupture = ruptureFor(exposure);
    await sql.query(
      "update assets set exposure_score=$3, exposure_band=$4, rupture_year=$5, horizon_year=$6, updated_at=$7 where owner_scope=$1 and id=$2",
      [scope, asset.id, exposure.score, exposure.band, rupture, target.horizonYear, new Date().toISOString()],
    );
    updated += 1;
  }
  return { updated, settings: target };
}

/* ---------------------------------------------------------------- events */

export async function listEvents(scope: string, entityId?: string): Promise<AuditEvent[]> {
  const sql = await client();
  if (entityId) {
    const { rows } = await sql.query<AuditRow>(
      "select * from audit_events where owner_scope=$1 and entity_id=$2 order by seq asc",
      [scope, entityId],
    );
    return rows.map(toEvent);
  }
  const { rows } = await sql.query<AuditRow>(
    "select * from audit_events where owner_scope=$1 order by entity_id asc, seq asc",
    [scope],
  );
  return rows.map(toEvent);
}

export async function tombstonedIds(scope: string): Promise<string[]> {
  const sql = await client();
  const { rows } = await sql.query<{ id: string }>(
    "select id from assets where owner_scope=$1 and status='retired'",
    [scope],
  );
  return rows.map((row) => row.id);
}

/* --------------------------------------------------------------- profile */

/** Reads the profile row without creating anything. */
async function readProfileRow(sql: SqlClient, scope: string): Promise<ProfileRow | null> {
  const { rows } = await sql.query<ProfileRow>("select * from profiles where owner_scope = $1", [scope]);
  return rows[0] ?? null;
}

function defaultProfile(scope: string): Profile {
  return {
    ownerScope: scope,
    orgName: "",
    horizonYear: DEFAULT_SETTINGS.horizonYear,
    regimeId: DEFAULT_SETTINGS.regimeId,
    attackerProfile: DEFAULT_SETTINGS.attackerProfile,
    tolerance: 0,
    updatedAt: new Date().toISOString(),
  };
}

export async function getProfile(scope: string): Promise<Profile> {
  const sql = await client();
  const row = await readProfileRow(sql, scope);
  if (row) return toProfile(row);
  const fresh = defaultProfile(scope);
  await writeProfile(sql, fresh);
  return fresh;
}

async function writeProfile(sql: SqlClient, next: Profile): Promise<void> {
  await sql.query(
    `insert into profiles (owner_scope, org_name, horizon_year, regime_id, attacker_profile, tolerance, updated_at)
     values ($1,$2,$3,$4,$5,$6,$7)
     on conflict (owner_scope) do update set org_name=$2, horizon_year=$3, regime_id=$4, attacker_profile=$5, tolerance=$6, updated_at=$7`,
    [next.ownerScope, next.orgName, next.horizonYear, next.regimeId, next.attackerProfile, next.tolerance, next.updatedAt],
  );
}

export async function upsertProfile(scope: string, patch: Partial<Profile>): Promise<Profile> {
  const sql = await client();
  // Read the raw row rather than getProfile(): the two must not call each other.
  const row = await readProfileRow(sql, scope);
  const base = row ? toProfile(row) : defaultProfile(scope);
  const next: Profile = {
    ownerScope: scope,
    orgName: patch.orgName ?? base.orgName,
    horizonYear: patch.horizonYear ?? base.horizonYear,
    regimeId: patch.regimeId ?? base.regimeId,
    attackerProfile: patch.attackerProfile ?? base.attackerProfile,
    tolerance: patch.tolerance ?? base.tolerance,
    updatedAt: new Date().toISOString(),
  };
  await writeProfile(sql, next);
  return next;
}

/* ----------------------------------------------------------------- share */

export interface ShareGrantWithReport extends ShareGrant {
  report: Record<string, unknown>;
}

export async function createShare(
  scope: string,
  label: string,
  report: Record<string, unknown>,
  assetCount: number,
): Promise<ShareGrant> {
  const sql = await client();
  const token = randomUUID().replace(/-/g, "");
  const createdAt = new Date().toISOString();
  await sql.query(
    "insert into share_grants (token, owner_scope, label, report, asset_count, created_at) values ($1,$2,$3,$4::jsonb,$5,$6)",
    [token, scope, label, JSON.stringify(report), assetCount, createdAt],
  );
  return { token, ownerScope: scope, label, createdAt, assetCount };
}

export async function getShare(token: string): Promise<ShareGrantWithReport | null> {
  const sql = await client();
  const { rows } = await sql.query<{
    token: string;
    owner_scope: string;
    label: string;
    report: Record<string, unknown> | string;
    asset_count: number;
    created_at: Date | string;
  }>("select * from share_grants where token = $1", [token]);
  const row = rows[0];
  if (!row) return null;
  return {
    token: row.token,
    ownerScope: row.owner_scope,
    label: row.label,
    assetCount: Number(row.asset_count),
    createdAt: iso(row.created_at) ?? new Date().toISOString(),
    report: typeof row.report === "string" ? (JSON.parse(row.report) as Record<string, unknown>) : row.report,
  };
}

export async function listShares(scope: string): Promise<ShareGrant[]> {
  const sql = await client();
  const { rows } = await sql.query<{
    token: string;
    owner_scope: string;
    label: string;
    asset_count: number;
    created_at: Date | string;
  }>("select token, owner_scope, label, asset_count, created_at from share_grants where owner_scope=$1 order by created_at desc limit 25", [scope]);
  return rows.map((row) => ({
    token: row.token,
    ownerScope: row.owner_scope,
    label: row.label,
    assetCount: Number(row.asset_count),
    createdAt: iso(row.created_at) ?? new Date().toISOString(),
  }));
}

export async function deleteShare(scope: string, token: string): Promise<boolean> {
  const sql = await client();
  const { rows } = await sql.query<{ token: string }>(
    "delete from share_grants where owner_scope=$1 and token=$2 returning token",
    [scope, token],
  );
  return rows.length > 0;
}

/** Removes every asset in a scope. Used by the settings danger zone. */
export async function purgeScope(scope: string): Promise<number> {
  const assets = await listAssets(scope, {});
  for (const asset of assets) {
    await retireAsset(scope, asset.id, "purged from settings");
  }
  return assets.length;
}