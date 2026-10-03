import { test } from "node:test";
import assert from "node:assert/strict";
import { canonicalJson } from "./canonical.ts";
import {
  GENESIS_SEAL,
  SEAL_ALGORITHM,
  computeSeal,
  nextSeal,
  replayEntity,
  replayScope,
  sealInput,
  sha384Hex,
} from "./seal.ts";
import type { AuditEvent } from "../types.ts";

/**
 * Known-answer vectors for the seal chain.
 *
 * These are regression anchors: if canonical JSON or the hashing rule changes,
 * every historical seal in every deployment becomes unverifiable, so the exact
 * values below must never move.
 */
const VECTORS = {
  // Published SHA-384 vector for the input "abc".
  sha384Abc: "cb00753f45a35e8bb5a03d699ac65007272c32ab0eded1631a8b605a43ff5bed8086072ba1e7cc2358baeca134c825a7",
};

function event(seq: number, patch: Partial<AuditEvent> = {}): AuditEvent {
  return {
    id: `evt-${seq}`,
    ownerScope: "scope-test",
    entityId: "asset-test",
    seq,
    type: "asset.create",
    payload: { label: "test asset", algorithm: "RSA-2048" },
    prevSeal: "",
    seal: "",
    createdAt: "2026-01-01T00:00:00.000Z",
    ...patch,
  };
}

test("sha384 matches the published vector for 'abc'", () => {
  assert.equal(sha384Hex("abc"), VECTORS.sha384Abc);
  assert.equal(SEAL_ALGORITHM, "SHA-384");
  assert.equal(GENESIS_SEAL, "cryptotremor/genesis/v1");
});

test("canonical JSON sorts keys recursively and drops undefined", () => {
  assert.equal(
    canonicalJson({ b: 1, a: { d: 2, c: [{ f: 4, e: 5 }] } }),
    '{"a":{"c":[{"e":5,"f":4}],"d":2},"b":1}',
  );
  assert.equal(canonicalJson({ a: undefined, b: 1 }), '{"b":1}');
  assert.equal(canonicalJson({ z: null, y: true }), '{"y":true,"z":null}');
});

test("canonical JSON is stable regardless of insertion order", () => {
  const first: Record<string, unknown> = {};
  first.z = 1;
  first.a = { y: 2, x: 3 };
  const second: Record<string, unknown> = {};
  second.a = { x: 3, y: 2 };
  second.z = 1;
  assert.equal(canonicalJson(first), canonicalJson(second));
});

test("canonical JSON normalizes -0 and rejects non-finite numbers", () => {
  assert.equal(canonicalJson({ v: -0 }), '{"v":0}');
  assert.throws(() => canonicalJson({ v: Number.NaN }), TypeError);
  assert.throws(() => canonicalJson({ v: Number.POSITIVE_INFINITY }), TypeError);
});

test("seal input is the previous seal concatenated with canonical event JSON", () => {
  const e = event(1);
  const input = sealInput(GENESIS_SEAL, e);
  assert.ok(input.startsWith(GENESIS_SEAL));
  assert.equal(
    input.slice(GENESIS_SEAL.length),
    canonicalJson({
      entityId: e.entityId,
      seq: e.seq,
      type: e.type,
      payload: e.payload,
      createdAt: e.createdAt,
    }),
  );
});

test("a known chain verifies and reports its head", () => {
  const first = event(1);
  const seal1 = computeSeal(GENESIS_SEAL, first);
  const second = event(2, { type: "asset.decide", payload: { decision: "schedule" } });
  const seal2 = computeSeal(seal1, second);

  const chain: AuditEvent[] = [
    { ...first, prevSeal: GENESIS_SEAL, seal: seal1 },
    { ...second, prevSeal: seal1, seal: seal2 },
  ];
  const result = replayEntity(chain);
  assert.equal(result.ok, true);
  assert.equal(result.events, 2);
  assert.equal(result.headSeal, seal2);
  assert.equal(result.brokenAt, null);
  assert.equal(seal2.length, 96, "SHA-384 hex is 96 characters");
});

test("rewriting a historical payload is detected at the right link", () => {
  const first = event(1);
  const seal1 = computeSeal(GENESIS_SEAL, first);
  const second = event(2, { type: "asset.update" });
  const seal2 = computeSeal(seal1, second);
  const tampered = event(2, { type: "asset.update", payload: { changed: { label: "quietly edited" } } });
  const chain: AuditEvent[] = [
    { ...first, prevSeal: GENESIS_SEAL, seal: seal1 },
    { ...tampered, prevSeal: seal1, seal: seal2 },
  ];
  const result = replayEntity(chain);
  assert.equal(result.ok, false);
  assert.deepEqual(result.brokenAt, { entityId: "asset-test", seq: 2 });
});

test("breaking the prevSeal link is detected", () => {
  const first = event(1);
  const seal1 = computeSeal(GENESIS_SEAL, first);
  const second = event(2);
  const seal2 = computeSeal(seal1, second);
  const chain: AuditEvent[] = [
    { ...first, prevSeal: GENESIS_SEAL, seal: seal1 },
    { ...second, prevSeal: GENESIS_SEAL, seal: seal2 },
  ];
  const result = replayEntity(chain);
  assert.equal(result.ok, false);
  assert.equal(result.brokenAt?.seq, 2);
});

test("a deleted row leaves a hole the replay reports", () => {
  const seals = [GENESIS_SEAL];
  const events: AuditEvent[] = [];
  for (let seq = 1; seq <= 4; seq += 1) {
    const base = event(seq, seq === 4 ? { type: "asset.delete", payload: { tombstone: true } } : {});
    const seal = computeSeal(seals[seq - 1], base);
    seals.push(seal);
    events.push({ ...base, prevSeal: seals[seq - 1], seal });
  }
  const withHole = events.filter((entry) => entry.seq !== 3);
  const result = replayEntity(withHole);
  assert.equal(result.ok, false);
  assert.equal(result.brokenAt?.seq, 4, "the break surfaces at the first event after the gap");
});

test("replay order does not depend on array order", () => {
  const first = event(1);
  const seal1 = computeSeal(GENESIS_SEAL, first);
  const second = event(2);
  const seal2 = computeSeal(seal1, second);
  const chain: AuditEvent[] = [
    { ...second, prevSeal: seal1, seal: seal2 },
    { ...first, prevSeal: GENESIS_SEAL, seal: seal1 },
  ];
  assert.equal(replayEntity(chain).ok, true);
});

test("nextSeal chains from the previous event", () => {
  const first = event(1);
  const seal1 = nextSeal(null, first);
  const previous: AuditEvent = { ...first, prevSeal: GENESIS_SEAL, seal: seal1 };
  const second = event(2);
  assert.equal(nextSeal(previous, second), computeSeal(seal1, second));
});

test("replayScope aggregates entities and tombstones", () => {
  const chainFor = (entityId: string, count: number): AuditEvent[] => {
    const out: AuditEvent[] = [];
    let prev = GENESIS_SEAL;
    for (let seq = 1; seq <= count; seq += 1) {
      const base = event(seq, { entityId });
      const seal = computeSeal(prev, base);
      out.push({ ...base, prevSeal: prev, seal });
      prev = seal;
    }
    return out;
  };
  const report = replayScope([...chainFor("a", 3), ...chainFor("b", 2)], ["a"]);
  assert.equal(report.ok, true);
  assert.equal(report.events, 5);
  assert.equal(report.assets, 2);
  assert.equal(report.tombstones, 1);
  assert.equal(report.genesisSeal, GENESIS_SEAL);
  assert.ok(report.headSeal);
  assert.equal(replayScope([], []).ok, true, "an empty scope replays cleanly");
});

test("empty chains replay without a head", () => {
  const result = replayEntity([]);
  assert.equal(result.ok, true);
  assert.equal(result.events, 0);
  assert.equal(result.headSeal, null);
});