import { test } from "node:test";
import assert from "node:assert/strict";
import { sslForUrl } from "./postgres.ts";

test("SSL follows the connection string instead of being forced on", () => {
  assert.deepEqual(sslForUrl("postgresql://u:p@h:5432/db?sslmode=require"), { rejectUnauthorized: false });
  assert.deepEqual(sslForUrl("postgresql://u:p@h:5432/db?sslmode=verify-full"), { rejectUnauthorized: true });
  assert.equal(sslForUrl("postgresql://u:p@h:5432/db?sslmode=disable"), false);
  assert.equal(sslForUrl("postgresql://u:p@h:5432/db"), false);
  assert.equal(sslForUrl("postgresql://u:p@host/db"), false);
});

test("a malformed URL degrades to no TLS rather than throwing", () => {
  assert.doesNotThrow(() => sslForUrl("not a url"));
});
