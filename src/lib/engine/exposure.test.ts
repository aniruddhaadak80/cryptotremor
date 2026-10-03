import { test } from "node:test";
import assert from "node:assert/strict";
import { bandFor, complianceReadout, decisionRelief, scoreAsset } from "./exposure.ts";
import { COMPLIANCE_REGIMES, ENGINE_VERSION, getRegime } from "../domain/registry.ts";
import type { AssetDraft } from "../types.ts";

const base: AssetDraft = {
  label: "Payments API TLS certificate",
  system: "payments-gateway",
  usage: "certificate",
  algorithm: "RSA-2048",
  deployment: "partner-shared",
  confidentialityYears: 12,
  dataClass: "regulated",
  ownerTeam: "platform",
  notes: "",
  cve: null,
};

function score(overrides: Partial<AssetDraft> = {}, regimeId = "nist-ir-8547", horizonYear = 2026) {
  return scoreAsset({
    ...base,
    ...overrides,
    decision: "none",
    horizonYear,
    regime: getRegime(regimeId),
    attackerProfile: "expected",
  });
}

test("engine version is stamped on every result", () => {
  assert.equal(score().engineVersion, ENGINE_VERSION);
});

test("bands follow the published cut points", () => {
  assert.equal(bandFor(0), "settled");
  assert.equal(bandFor(19.99), "settled");
  assert.equal(bandFor(20), "watch");
  assert.equal(bandFor(40), "plan");
  assert.equal(bandFor(60), "urgent");
  assert.equal(bandFor(80), "critical");
  assert.equal(bandFor(1000), "critical");
  assert.equal(bandFor(Number.NaN), "settled");
});

test("factors are itemized and their points sum to the raw score", () => {
  const result = score();
  const weights = result.factors.reduce((total, factor) => total + factor.weight, 0);
  assert.ok(Math.abs(weights - 1) < 1e-9, `weights must total 1, got ${weights}`);
  const points = result.factors.reduce((total, factor) => total + factor.points, 0);
  assert.ok(Math.abs(points - result.rawScore) < 0.02);
  for (const factor of result.factors) {
    assert.ok(factor.evidence.length > 20, `${factor.key} needs evidence`);
    assert.ok(factor.lever.length > 5, `${factor.key} needs a lever`);
    assert.ok(factor.value >= 0 && factor.value <= 1);
  }
});

test("post-quantum primitives settle at zero", () => {
  const result = score({ algorithm: "ML-KEM-768" });
  assert.equal(result.rawScore, 0);
  assert.equal(result.band, "settled");
  assert.equal(result.bindingConstraint, "none");
  assert.equal(result.quantum.attack, "none");
  assert.match(result.recommendation, /already post-quantum/i);
});

test("long-lived confidential data binds on data lifetime, not capability", () => {
  const result = score({ confidentialityYears: 40, dataClass: "regulated" });
  assert.equal(result.bindingConstraint, "data-lifetime");
  assert.ok(result.exposureYears > 0);
  assert.match(result.recommendation, /Move to/);
});

test("short-lived public data on an internal system scores far lower", () => {
  const heavy = score({ confidentialityYears: 40, dataClass: "regulated", deployment: "partner-shared" });
  const light = score({
    algorithm: "AES-256-GCM",
    confidentialityYears: 1,
    dataClass: "public",
    deployment: "internal",
    usage: "integrity",
  });
  assert.ok(light.rawScore < heavy.rawScore / 2, `${light.rawScore} should be far below ${heavy.rawScore}`);
});

test("compliance pressure rises as the horizon advances", () => {
  const early = score({}, "nist-ir-8547", 2026);
  const late = score({}, "nist-ir-8547", 2034);
  assert.ok(late.rawScore > early.rawScore);
  assert.ok(late.compliance.yearsToBinding! <= early.compliance.yearsToBinding!);
});

test("a breached deadline binds on compliance", () => {
  const result = score({ confidentialityYears: 1, usage: "signature" }, "cnsa-2", 2034);
  assert.equal(result.compliance.regimeId, "cnsa-2");
  assert.ok(result.compliance.yearsToBinding !== null);
});

test("decision relief multiplies the raw exposure down", () => {
  const raw = score().rawScore;
  const scheduled = scoreAsset({
    ...base,
    decision: "schedule",
    horizonYear: 2026,
    regime: getRegime("nist-ir-8547"),
    attackerProfile: "expected",
  });
  assert.ok(decisionRelief("schedule") > 0);
  assert.ok(scheduled.score < raw);
  assert.equal(scheduled.rawScore, raw, "the raw exposure must not change with the decision");
  const migrated = scoreAsset({
    ...base,
    decision: "migrated",
    horizonYear: 2026,
    regime: getRegime("nist-ir-8547"),
    attackerProfile: "expected",
  });
  assert.ok(migrated.score < scheduled.score);
  assert.ok(migrated.score >= 0);
});

test("aggressive attacker scenario raises exposure", () => {
  const expected = score();
  const aggressive = scoreAsset({
    ...base,
    decision: "none",
    horizonYear: 2026,
    regime: getRegime("nist-ir-8547"),
    attackerProfile: "aggressive",
  });
  assert.ok(aggressive.rawScore >= expected.rawScore);
  const conservative = scoreAsset({
    ...base,
    decision: "none",
    horizonYear: 2026,
    regime: getRegime("nist-ir-8547"),
    attackerProfile: "conservative",
  });
  assert.ok(conservative.rawScore <= aggressive.rawScore);
});

test("compliance readout only lists milestones that apply to the usage", () => {
  const regime = COMPLIANCE_REGIMES.find((entry) => entry.id === "eo-14412")!;
  const signature = complianceReadout(regime, "signature", 2026);
  const keyEstablishment = complianceReadout(regime, "key-establishment", 2026);
  assert.ok(signature.milestones.every((m) => m.appliesTo.includes("signature")));
  assert.notEqual(signature.binding?.id, keyEstablishment.binding?.id);
});

test("deterministic repeat gives byte-identical output", () => {
  const a = score();
  const b = score();
  assert.deepEqual(JSON.parse(JSON.stringify(a)), JSON.parse(JSON.stringify(b)));
});

test("malformed and boundary inputs never throw", () => {
  const malformed = scoreAsset({
    label: "",
    system: "",
    usage: "integrity" as never,
    algorithm: "NOT-A-REAL-ALGORITHM",
    deployment: "internal" as never,
    confidentialityYears: 0,
    dataClass: "public",
    ownerTeam: "",
    notes: "",
    decision: "none",
    horizonYear: 2026,
    regime: getRegime("does-not-exist"),
    attackerProfile: "does-not-exist",
  });
  // An unclassified primitive is flagged rather than assumed safe.
  assert.ok(malformed.rawScore > 0, "an unknown algorithm must not be scored as safe");
  assert.ok(malformed.recommendation.length > 10);
  assert.equal(malformed.quantum.attack, "none", "no attack model is claimed for an unknown primitive");

  // The same estate with a registered post-quantum primitive settles at zero.
  const safe = score({
    algorithm: "ML-KEM-768",
    usage: "integrity",
    deployment: "internal",
    confidentialityYears: 0,
    dataClass: "public",
  });
  assert.equal(safe.rawScore, 0);
  // Grover-safe symmetric crypto is equally settled.
  assert.equal(score({ algorithm: "AES-256-GCM", usage: "integrity", deployment: "internal", confidentialityYears: 0, dataClass: "public" }).rawScore, 0);
  // A 128-bit symmetric key does not clear the bar.
  assert.ok(score({ algorithm: "AES-128-GCM", usage: "integrity", deployment: "internal", confidentialityYears: 0, dataClass: "public" }).rawScore > 0);

  assert.doesNotThrow(() => score({ confidentialityYears: 100 }));
  assert.doesNotThrow(() => score({ confidentialityYears: -4 }));
  assert.doesNotThrow(() => score({ algorithm: "" }));
});

test("known exploited CVE adds evidence without inflating the weighted score", () => {
  const plain = score();
  const exploited = scoreAsset({
    ...base,
    decision: "none",
    horizonYear: 2026,
    regime: getRegime("nist-ir-8547"),
    attackerProfile: "expected",
    knownExploited: true,
  });
  assert.ok(exploited.factors.some((factor) => factor.key === "known-exploited"));
  assert.equal(exploited.rawScore, plain.rawScore);
});