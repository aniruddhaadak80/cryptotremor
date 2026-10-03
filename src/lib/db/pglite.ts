/**
 * Embedded Postgres adapter for local development and tests.
 *
 * PGlite is real Postgres compiled to WebAssembly, so the same SQL, the same
 * `jsonb` columns and the same constraint behaviour run locally and in
 * production. Data is written under `.tremor/` so a dev server restart does not
 * lose the survey.
 */

import type { SqlClient } from "./types.ts";

export const PGLITE_DATA_DIR = ".tremor/pgdata";

export async function createPgliteClient(dataDir?: string): Promise<SqlClient> {
  const { PGlite } = await import("@electric-sql/pglite");
  const requested = dataDir ?? process.env.CT_PGDATA ?? PGLITE_DATA_DIR;
  // PGlite addresses an in-memory database with the `memory://` scheme; the
  // `:memory:` spelling is accepted as a convenience for tests and tooling.
  const inMemory = requested === ":memory:" || requested === "memory://";
  const dir = inMemory ? "memory://" : requested;
  // PGlite creates its own data directory, so no filesystem writes happen at
  // import time and bundlers can trace this module cleanly.
  const pglite = new PGlite(dir);

  const client: SqlClient = {
    async query<T>(sql: string, params: readonly unknown[] = []) {
      const result = await pglite.query<T>(sql, params as unknown[]);
      return { rows: (result.rows ?? []) as T[] };
    },

    async transaction<T>(fn: (tx: SqlClient) => Promise<T>) {
      const wrap = (tx: {
        query: (sql: string, params?: unknown[]) => Promise<{ rows: unknown[] }>;
      }): SqlClient => ({
        query: async <U>(sql: string, params: readonly unknown[] = []) => {
          const result = await tx.query(sql, params as unknown[]);
          return { rows: (result.rows ?? []) as U[] };
        },
        transaction: async <U>(nested: (inner: SqlClient) => Promise<U>) => nested(wrap(tx)),
        describe: () => client.describe(),
        close: async () => {},
      });
      return pglite.transaction((tx) => fn(wrap(tx as never))) as Promise<T>;
    },

    async describe() {
      const version = await pglite.query<{ version: string }>("select version() as version");
      return {
        kind: "pglite",
        detail: `embedded Postgres (${String(version.rows[0]?.version ?? "unknown").slice(0, 40)}) at ${dir}`,
        persistent: !inMemory,
      };
    },

    async close() {
      await pglite.close();
    },
  };

  return client;
}