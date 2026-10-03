/**
 * Hosted Postgres adapter.
 *
 * Used in production against a managed Postgres (Neon on Vercel). Connection
 * pooling is capped because serverless instances are numerous and short-lived;
 * idle clients are released so a cold start never holds the pool open.
 */

import { Pool } from "pg";
import type { SqlClient } from "./types.ts";

export function createPostgresClient(url: string): SqlClient {
  const pool = new Pool({
    connectionString: url,
    max: Number(process.env.DATABASE_POOL_MAX ?? 4),
    idleTimeoutMillis: 10_000,
    connectionTimeoutMillis: 8_000,
    ssl: url.includes("sslmode=disable") ? undefined : { rejectUnauthorized: false },
  });

  const client: SqlClient = {
    async query<T>(sql: string, params: readonly unknown[] = []) {
      const result = await pool.query(sql, params as unknown[]);
      return { rows: result.rows as T[] };
    },
    async transaction<T>(fn: (tx: SqlClient) => Promise<T>) {
      const connection = await pool.connect();
      const txClient: SqlClient = {
        async query<U>(sql: string, params: readonly unknown[] = []) {
          const result = await connection.query(sql, params as unknown[]);
          return { rows: result.rows as U[] };
        },
        async transaction<U>(nested: (inner: SqlClient) => Promise<U>) {
          return nested(txClient);
        },
        describe: () => client.describe(),
        close: async () => {},
      };
      try {
        await connection.query("begin");
        const result = await fn(txClient);
        await connection.query("commit");
        return result;
      } catch (error) {
        await connection.query("rollback");
        throw error;
      } finally {
        connection.release();
      }
    },
    async describe() {
      const started = Date.now();
      await pool.query("select 1 as ok");
      return {
        kind: "postgres",
        detail: `managed Postgres reachable, round trip ${Date.now() - started}ms`,
        persistent: true,
      };
    },
    async close() {
      await pool.end();
    },
  };

  return client;
}