/**
 * Schema creation and idempotent first-run setup.
 *
 * Runs once per process against whichever adapter is active. Every statement is
 * `if not exists`, so a redeploy against an existing database is a no-op.
 * There is no automatic demo data: an estate only exists once the owner imports
 * one, which keeps seeded rows from ever colliding with real ones.
 */

import type { SqlClient } from "./types.ts";

export const SCHEMA_STATEMENTS: readonly string[] = [
  `create table if not exists assets (
     id text primary key,
     owner_scope text not null,
     label text not null,
     system text not null,
     usage text not null,
     algorithm text not null,
     bits integer not null,
     deployment text not null,
     confidentiality_years integer not null,
     data_class text not null,
     owner_team text not null,
     notes text not null default '',
     cve text,
     decision text not null default 'none',
     decision_note text not null default '',
     decided_at timestamptz,
     status text not null default 'active',
     exposure_score double precision not null default 0,
     exposure_band text not null default 'settled',
     rupture_year integer,
     horizon_year integer not null,
     idempotency_key text,
     created_at timestamptz not null,
     updated_at timestamptz not null,
     constraint assets_bits_positive check (bits >= 0),
     constraint assets_confidentiality_non_negative check (confidentiality_years >= 0),
     constraint assets_status_valid check (status in ('active','retired')),
     constraint assets_decision_valid check (decision in ('none','accept','schedule','migrating','migrated','retire'))
   )`,
  `create index if not exists assets_scope_status_idx on assets (owner_scope, status)`,
  `create index if not exists assets_scope_system_idx on assets (owner_scope, system)`,
  `create index if not exists assets_scope_score_idx on assets (owner_scope, exposure_score desc)`,
  `create unique index if not exists assets_scope_idem_idx on assets (owner_scope, idempotency_key) where idempotency_key is not null`,
  `create table if not exists audit_events (
     id text primary key,
     owner_scope text not null,
     entity_id text not null,
     seq integer not null,
     type text not null,
     payload jsonb not null,
     prev_seal text not null,
     seal text not null,
     created_at timestamptz not null,
     constraint audit_events_seq_positive check (seq >= 1),
     constraint audit_events_unique_seq unique (entity_id, seq)
   )`,
  `create index if not exists audit_scope_entity_idx on audit_events (owner_scope, entity_id, seq)`,
  `create table if not exists profiles (
     owner_scope text primary key,
     org_name text not null default '',
     horizon_year integer not null,
     regime_id text not null,
     attacker_profile text not null,
     tolerance integer not null default 0,
     updated_at timestamptz not null
   )`,
  `create table if not exists share_grants (
     token text primary key,
     owner_scope text not null,
     label text not null,
     report jsonb not null,
     asset_count integer not null default 0,
     created_at timestamptz not null
   )`,
  `create index if not exists share_scope_idx on share_grants (owner_scope, created_at desc)`,
];

let ensured: Promise<void> | null = null;

export async function ensureSchema(sql: SqlClient): Promise<void> {
  if (!ensured) {
    ensured = (async () => {
      for (const statement of SCHEMA_STATEMENTS) {
        await sql.query(statement);
      }
    })().catch((error: unknown) => {
      ensured = null;
      throw error;
    });
  }
  return ensured;
}

/** Test helper: forget that the schema was created. */
export function resetSchemaCache(): void {
  ensured = null;
}