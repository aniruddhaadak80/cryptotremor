/**
 * Storage adapter selection.
 *
 * One typed SQL interface, two implementations:
 *  - `postgres`  a hosted Postgres (Neon on Vercel) reached over TCP;
 *  - `pglite`    an embedded Postgres for zero-config local development and tests.
 *
 * The local adapter must never be selected in a production deployment: if
 * `VERCEL` or `NODE_ENV=production` is set without a database URL the client
 * throws instead of silently using an ephemeral store.
 */

import type { SqlClient } from "./types.ts";

const GLOBAL_KEY = "__cryptotremor_db__";

interface GlobalWithDb {
  [GLOBAL_KEY]?: Promise<SqlClient>;
}

function connectionString(): string | undefined {
  return (
    process.env.DATABASE_URL ??
    process.env.NEON_DATABASE_URL ??
    process.env.POSTGRES_URL ??
    process.env.POSTGRES_PRISMA_URL ??
    undefined
  );
}

function isProduction(): boolean {
  return process.env.VERCEL === "1" || process.env.NODE_ENV === "production";
}

async function createClient(): Promise<SqlClient> {
  const url = connectionString();
  if (url) {
    const { createPostgresClient } = await import("./postgres.ts");
    return createPostgresClient(url);
  }
  if (isProduction()) {
    throw new Error(
      "DATABASE_URL is required in production. Cryptotremor refuses to start on an ephemeral store so that user data cannot silently vanish.",
    );
  }
  const { createPgliteClient } = await import("./pglite.ts");
  return createPgliteClient();
}

export function getSql(): Promise<SqlClient> {
  const scope = globalThis as unknown as GlobalWithDb;
  if (!scope[GLOBAL_KEY]) {
    scope[GLOBAL_KEY] = createClient().catch((error: unknown) => {
      // Do not cache a failed client: a later request may have the variable set.
      delete scope[GLOBAL_KEY];
      throw error;
    });
  }
  return scope[GLOBAL_KEY];
}

export async function storeDescription(): Promise<{
  kind: string;
  detail: string;
  persistent: boolean;
}> {
  const sql = await getSql();
  return sql.describe();
}

/**
 * Test seam: injects a client (or clears it) so integration tests can run
 * against an isolated in-memory database instead of whatever the environment
 * happens to provide. Never called by application code.
 */
export function __setSqlForTests(client: SqlClient | null): void {
  const scope = globalThis as unknown as GlobalWithDb;
  if (client) {
    scope[GLOBAL_KEY] = Promise.resolve(client);
  } else {
    delete scope[GLOBAL_KEY];
  }
}