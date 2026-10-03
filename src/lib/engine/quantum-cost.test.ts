import { test } from "node:test";
import assert from "node:assert/strict";
import {
  CODE_DISTANCE,
  LOGICAL_QUBITS_PER_BIT,
  PHYSICAL_QUBITS_PER_LOGICAL,
  TOFFOLI_PER_BIT_SQUARED,
  attackerProfile,
  daysToBreak,
  estimateQuantumCost,
  exposureYears,
  groverOracleCount,
  logicalThroughput,
  migrationEffortYears,
  shorResources,
} from "./quantum-cost.ts";
import { getAlgorithm } from "../domain/registry.ts";

test("Shor resources scale with the modulus", () => {
  const small = shorResources(2048);
  const large = shorResources(4096);
  assert.equal(small.logicalQubits, Math.ceil(LOGICAL_QUBITS_PER_BIT * 2048));
  assert.equal(small.toffoliCount, TOFFOLI_PER_BIT_SQUARED * 2048 * 2048);
  assert.ok(large.logicalQubits > small.logicalQubits);
  assert.equal(large.toffoliCount / small.toffoliCount, 4, "Toffoli cost is quadratic in modulus size");
  assert.ok(large.logicalDepth > small.logicalDepth);
});

test("physical qubits use the documented surface-code ratio", () => {
  const cost = estimateQuantumCost(getAlgorithm("RSA-2048")!, "expected", 2026);
  assert.equal(cost.codeDistance, CODE_DISTANCE);
  assert.equal(
    cost.physicalQubits,
    Math.round(cost.logicalQubits * PHYSICAL_QUBITS_PER_LOGICAL),
  );
  // Published factoring estimates put RSA-2048 in the ~1M noisy qubit range.
  assert.ok(cost.physicalQubits > 5e5 && cost.physicalQubits < 5e6, `got ${cost.physicalQubits}`);
});

test("Grover oracle count is quadratic in key length", () => {
  const a = groverOracleCount(128);
  const b = groverOracleCount(256);
  assert.ok(a > 0 && b > a);
  assert.ok(Math.abs(Math.log2(b) - Math.log2(a) - 64) < 1, "halving the security level adds 64 to the exponent");
});

test("symmetric crypto does not rupture inside the horizon", () => {
  for (const id of ["AES-256-GCM", "CHACHA20-POLY1305", "SHA-512"]) {
    const cost = estimateQuantumCost(getAlgorithm(id)!, "aggressive", 2045);
    assert.equal(cost.attack, "grover");
    assert.equal(cost.ruptureYear.aggressive, null, `${id} must not rupture inside the horizon`);
  }
});

test("elliptic curves break long before RSA", () => {
  const ec = estimateQuantumCost(getAlgorithm("ECDSA-P256")!, "expected", 2026);
  const rsa = estimateQuantumCost(getAlgorithm("RSA-2048")!, "expected", 2026);
  const ecYear = ec.ruptureYear.expected!;
  const rsaYear = rsa.ruptureYear.expected!;
  assert.ok(ecYear !== null && rsaYear !== null);
  assert.ok(ecYear < rsaYear, `P-256 (${ecYear}) should rupture before RSA-2048 (${rsaYear})`);
});

test("attacker scenarios order conservatively to aggressively", () => {
  const cost = estimateQuantumCost(getAlgorithm("RSA-2048")!, "expected", 2026);
  const conservative = cost.ruptureYear.conservative;
  const expected = cost.ruptureYear.expected;
  const aggressive = cost.ruptureYear.aggressive;
  assert.ok(conservative === null || expected === null || conservative >= expected);
  assert.ok(expected === null || aggressive === null || aggressive <= expected);
  assert.ok(conservative === null || aggressive === null || aggressive <= conservative);
});

test("logical throughput follows the doubling model exactly", () => {
  const profile = attackerProfile("expected");
  const now = profile.baseLogicalGatesPerSecond;
  assert.equal(logicalThroughput(profile, profile.baseYear), now);
  const oneDoubling = logicalThroughput(profile, profile.baseYear + profile.doublingYears);
  assert.ok(Math.abs(oneDoubling - now * 2) / (now * 2) < 1e-9, `${oneDoubling} should be 2x ${now}`);
  assert.ok(daysToBreak(1e8, profile, 2030) > daysToBreak(1e8, profile, 2035));
});

test("post-quantum primitives model no attack", () => {
  const cost = estimateQuantumCost(getAlgorithm("ML-KEM-768")!, "aggressive", 2026);
  assert.equal(cost.attack, "none");
  assert.equal(cost.logicalQubits, 0);
  assert.equal(cost.toffoliCount, 0);
  assert.deepEqual(cost.daysToBreak, {});
  assert.equal(cost.ruptureYear.aggressive, null);
});

test("deterministic: identical inputs produce identical ledgers", () => {
  const spec = getAlgorithm("ECDSA-P384")!;
  const a = estimateQuantumCost(spec, "expected", 2031);
  const b = estimateQuantumCost(spec, "expected", 2031);
  assert.deepEqual(a, b);
});

test("harvest exposure is the overlap between secrecy and the break", () => {
  assert.equal(exposureYears(2026, 10, null), 0, "no modelled break means no retroactive exposure");
  assert.equal(exposureYears(2026, 10, 2040), 0, "break after the data expires is harmless");
  assert.equal(exposureYears(2026, 20, 2030), 16);
  assert.equal(exposureYears(2026, 0, 2030), 0);
  assert.equal(exposureYears(2026, 5, 2030), 1);
});

test("migration effort rises with reach and data class", () => {
  const internal = migrationEffortYears("internal", "integrity", "internal");
  const exposed = migrationEffortYears("internet", "signature", "regulated");
  assert.ok(exposed > internal);
  assert.ok(exposureYears(2026, 0, null) === 0);
});

test("malformed input degrades instead of throwing", () => {
  const weird = { ...getAlgorithm("RSA-2048")!, bits: -5 };
  const cost = estimateQuantumCost(weird, "expected", 2026);
  assert.ok(Number.isFinite(cost.logicalQubits) && cost.logicalQubits > 0);
  assert.ok(Number.isFinite(cost.toffoliCount));
  const nanSpec = { ...getAlgorithm("RSA-2048")!, bits: Number.NaN };
  const nanCost = estimateQuantumCost(nanSpec, "expected", 2026);
  assert.ok(Number.isFinite(nanCost.toffoliCount));
  assert.ok(Number.isFinite(daysToBreak(1, attackerProfile("expected"), 2030)));
});