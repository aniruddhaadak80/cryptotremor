/** Minimal SQL surface shared by both storage adapters. */

export interface SqlResult<T> {
  rows: T[];
}

export interface SqlClient {
  query<T>(sql: string, params?: readonly unknown[]): Promise<SqlResult<T>>;
  /** Runs `fn` inside a single transaction, rolling back on any throw. */
  transaction<T>(fn: (tx: SqlClient) => Promise<T>): Promise<T>;
  describe(): Promise<{ kind: string; detail: string; persistent: boolean }>;
  close(): Promise<void>;
}

export type SqlValue = string | number | boolean | null | Date | object;

export function placeholder(index: number): string {
  return `$${index}`;
}