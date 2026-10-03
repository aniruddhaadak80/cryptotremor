import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { __setSqlForTests } from "./client.ts";
import { createPgliteClient } from "./pglite.ts";
import type { SqlClient } from "./types.ts";
import { resetSchemaCache } from "./schema.ts";
import {
  createAsset,
  deleteShare,
  createShare,
  getAsset,
  getProfile,
  getShare,
  listAssets,
  listEvents,
  purgeScope,
  recordDecision,
  retireAsset,
  tombstonedIds,
  updateAsset,
  upsertProfile,
} from "./repo.ts";
import { replayScope } from "../integrity/seal.ts";
import type { AssetDraft } from "../types.ts";

const draft: AssetDraft = {
  label: "Payments API TLS certificate",
  system: "payments-gateway",
  usage: "certificate",
  algorithm: "RSA-2048",
  deployment: "partner-shared",
  confidentialityYears: 12,
  dataClass: "regulated",
  ownerTeam: "platform",
  notes: "integration test",
  cve: null,
};

const scope = "a".repeat(32);
const otherScope = "b".repeat(32);

let client: SqlClient;

before(async () => {
  resetSchemaCache();
  client = await createPgliteClient(":memory:");
  __setSqlForTests(client);
});

after(() => {
  __setSqlForTests(null);
  resetSchemaCache();
  // PGlite's close() does not settle under the test runner, so it is fired and
  // forgotten: the process is exiting anyway and the database is in memory.
  void client.close();
});

test("a profile is created on first read with documented defaults", async () => {
  const profile = await getProfile(scope);
  assert.equal(profile.ownerScope, scope);
  assert.equal(profile.horizonYear, 2026);
  assert.equal(profile.regimeId, "nist-ir-8547");
  assert.equal(profile.attackerProfile, "expected");
});

test("profile changes are persisted and validated by the schema layer", async () => {
  const updated = await upsertProfile(scope, { horizonYear: 2031, regimeId: "uk-ncsc", orgName: "Northwind" });
  assert.equal(updated.horizonYear, 2031);
  assert.equal(updated.orgName, "Northwind");
  const reread = await getProfile(scope);
  assert.equal(reread.regimeId, "uk-ncsc");
  await upsertProfile(scope, { horizonYear: 2026, regimeId: "nist-ir-8547", orgName: "" });
});

test("create → read back → the row carries the engine score", async () => {
  const result = await createAsset(scope, draft);
  assert.equal(result.created, true);
  assert.ok(result.event.seal.length === 96);
  assert.ok(result.exposure.rawScore > 0);
  assert.equal(result.asset.algorithm, "RSA-2048");

  const read = await getAsset(scope, result.asset.id);
  assert.ok(read);
  assert.equal(read!.label, draft.label);
  assert.equal(read!.exposureScore, result.asset.exposureScore);
  assert.equal(read!.seal, result.event.seal);
  assert.equal(read!.bits, 2048, "bits are derived from the registry");
});

test("ownership is enforced on read", async () => {
  const created = await createAsset(scope, draft);
  assert.equal(await getAsset(otherScope, created.asset.id), null);
  assert.equal((await listAssets(otherScope, {})).length, 0);
});

test("update re-scores and extends the chain", async () => {
  const created = await createAsset(scope, draft);
  const updated = await update(created.asset.id, { confidentialityYears: 30 });
  assert.ok(updated.exposure.exposureYears >= 0);
  assert.notEqual(updated.event.seal, created.event.seal);
  const events = await listEvents(scope, created.asset.id);
  assert.equal(events.length, 2);
  assert.equal(events[1].type, "asset.update");
  assert.ok(events[1].payload.changed, "the update event records what changed");
});

test("recording a decision is idempotent", async () => {
  const created = await createAsset(scope, draft);
  const first = await recordDecision(scope, created.asset.id, "schedule", "dual-deploy first");
  assert.ok(first);
  const second = await recordDecision(scope, created.asset.id, "schedule", "dual-deploy first");
  assert.ok(second);
  assert.equal(first.event.id, second.event.id, "a retry must not append a second event");
  const events = await listEvents(scope, created.asset.id);
  assert.equal(events.length, 2, "create + one decide");
  assert.ok((first as { exposure: { score: number } }).exposure.score < created.asset.exposureScore);
});

test("retire is a tombstone and stays idempotent", async () => {
  const created = await createAsset(scope, draft);
  const retired = await retireAsset(scope, created.asset.id, "no longer deployed");
  assert.equal(retired?.status, "retired");
  const again = await retireAsset(scope, created.asset.id, "no longer deployed");
  assert.equal(again?.status, "retired");
  const events = await listEvents(scope, created.asset.id);
  assert.equal(events.length, 2, "create + one tombstone");
  assert.equal(events[1].type, "asset.delete");
  assert.equal(events[1].payload.tombstone, true);
  const tombstones = await tombstonedIds(scope);
  assert.ok(tombstones.includes(created.asset.id));
});

test("listing filters by band, algorithm and free text", async () => {
  const mine = "c".repeat(32);
  const rsa = await createAsset(mine, draft);
  await createAsset(mine, { ...draft, algorithm: "ML-KEM-768", label: "Quantum safe KEM" });
  assert.equal((await listAssets(mine, { algorithm: "RSA-2048" })).length, 1);
  assert.equal((await listAssets(mine, { search: "quantum safe" })).length, 1);
  assert.equal((await listAssets(mine, { search: "nothing-matches" })).length, 0);
  assert.ok((await listAssets(mine, { band: rsa.asset.exposureBand })).length >= 1);
  // Ordering follows the database collation, so compare against a sorted copy
  // rather than assuming case-insensitive ordering.
  const byLabel = (await listAssets(mine, { sort: "label" })).map((asset) => asset.label);
  assert.deepEqual(byLabel, [...byLabel].sort());
});

test("idempotency keys make creates durable and repeatable", async () => {
  const mine = "d".repeat(32);
  const first = await createAsset(mine, draft, false, "agent-key-1");
  const second = await createAsset(mine, draft, false, "agent-key-1");
  assert.equal(first.created, true);
  assert.equal(second.created, false);
  assert.equal(second.asset.id, first.asset.id, "the same key returns the original row");
  assert.equal((await listAssets(mine, {})).length, 1, "no duplicate row");
  const third = await createAsset(mine, { ...draft, label: "Other" }, false, "agent-key-2");
  assert.equal(third.created, true);
  assert.notEqual(third.asset.id, first.asset.id);
});

test("share grants round-trip and can be revoked", async () => {
  const created = await createAsset(scope, draft);
  const grant = await createShare(scope, "partner report", { title: "test" }, 1);
  assert.equal(grant.assetCount, 1);
  const fetched = await getShare(grant.token);
  assert.ok(fetched);
  assert.equal(fetched!.report.title, "test");
  assert.equal(await getShare("0".repeat(32)), null);
  assert.equal(await deleteShare(scope, grant.token), true);
  assert.equal(await getShare(grant.token), null);
  const otherGrant = await createShare(scope, "x", {}, 0);
  assert.equal(await deleteShare(otherScope, otherGrant.token), false, "another scope cannot revoke a link");
  void created;
});

test("the whole scope replays clean after mutations and purges", async () => {
  const mine = "e".repeat(32);
  const created = await createAsset(mine, draft);
  await update(created.asset.id, { deployment: "internet" }, mine);
  await recordDecision(mine, created.asset.id, "migrating", "in flight");
  await retireAsset(mine, created.asset.id, "rolled back");

  const events = await listEvents(mine);
  const report = replayScope(events, await tombstonedIds(mine));
  assert.equal(report.ok, true, JSON.stringify(report.brokenAt));
  assert.equal(report.events, 4);
  assert.equal(report.assets, 1);
  assert.equal(report.tombstones, 1);
  assert.ok(report.headSeal);

  const purged = await purgeScope(mine);
  assert.ok(purged >= 1);
  const afterPurge = replayScope(await listEvents(mine), await tombstonedIds(mine));
  assert.equal(afterPurge.ok, true, "tombstones preserve replayability");
});

test("empty and boundary scopes behave", async () => {
  const mine = "f".repeat(32);
  assert.deepEqual(await listAssets(mine, {}), []);
  assert.equal(await getAsset(mine, "missing"), null);
  assert.equal(await retireAsset(mine, "missing", "x"), null);
  assert.equal(await recordDecision(mine, "missing", "accept", "x"), null);
  const zero = await createAsset(mine, { ...draft, confidentialityYears: 0, algorithm: "AES-256-GCM", usage: "integrity", dataClass: "public", deployment: "internal" });
  assert.equal(zero.asset.exposureScore, 0);
  assert.equal(zero.asset.ruptureYear, null);
});

async function update(id: string, patch: Record<string, unknown>, ownerScope = scope) {
  const result = await updateAsset(ownerScope, id, patch as never);
  assert.ok(result, `update should find ${id} in ${ownerScope}`);
  return result;
}