import { test } from "node:test";
import assert from "node:assert/strict";
import { buildReport, reportToCsv, reportToMarkdown, SAFETY_DISCLAIMER } from "./report.ts";
import type { CryptoAsset, ExposureResult, Profile } from "./types.ts";
import { scoreAsset } from "./engine/index.ts";
import { getRegime } from "./engine/index.ts";

function makeAsset(overrides: Partial<CryptoAsset> = {}): CryptoAsset {
  const base = {
    label: "Payments API TLS certificate",
    system: "payments-gateway",
    usage: "certificate",
    algorithm: "RSA-2048",
    bits: 2048,
    deployment: "partner-shared",
    confidentialityYears: 12,
    dataClass: "regulated",
    ownerTeam: "platform",
    notes: "",
    cve: null,
    decision: "none",
    decisionNote: "",
    status: "active",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ruptureYear: 2031,
    seal: "a".repeat(96),
  };
  const asset = { ...base, ...overrides } as CryptoAsset;
  return asset;
}

const profile: Profile = {
  ownerScope: "s".repeat(32),
  orgName: "Northwind Financial",
  horizonYear: 2026,
  regimeId: "nist-ir-8547",
  attackerProfile: "expected",
  tolerance: 0,
  updatedAt: "2026-01-01T00:00:00.000Z",
};

function build(assets: CryptoAsset[]) {
  const exposures = new Map<string, ExposureResult>();
  for (const asset of assets) {
    exposures.set(
      asset.id,
      scoreAsset({
        label: asset.label,
        system: asset.system,
        usage: asset.usage,
        algorithm: asset.algorithm,
        deployment: asset.deployment,
        confidentialityYears: asset.confidentialityYears,
        dataClass: asset.dataClass,
        ownerTeam: asset.ownerTeam,
        notes: asset.notes,
        cve: asset.cve,
        decision: asset.decision,
        horizonYear: profile.horizonYear,
        regime: getRegime(profile.regimeId),
        attackerProfile: profile.attackerProfile,
      }),
    );
  }
  return buildReport({
    org: profile.orgName,
    profile,
    assets,
    exposures,
    provenance: {
      kev: {
        status: "live",
        source: "CISA Known Exploited Vulnerabilities catalog",
        sourceUrl: "https://www.cisa.gov/sites/default/files/feeds/known_exploited_vulnerabilities.json",
        fetchedAt: "2026-10-01T10:00:00.000Z",
        attribution: "CISA",
        note: "Live catalog.",
      },
      research: {
        status: "fallback",
        source: "arXiv quant-ph (sealed sample)",
        sourceUrl: "https://export.arxiv.org/api/query",
        fetchedAt: "2026-09-28T00:00:00.000Z",
        attribution: "arXiv",
        note: "Sealed offline sample.",
      },
    },
    integrity: { genesisSeal: "cryptotremor/genesis/v1", headSeal: "b".repeat(96), events: 2, ok: true },
  });
}

test("the report carries settings, totals, provenance and integrity", () => {
  const report = build([
    makeAsset({ id: "1" }),
    makeAsset({ id: "2", label: "SFTP key exchange", system: "partner-sftp", algorithm: "DH-2048", exposureScore: 70 }),
  ]);
  assert.equal(report.org, "Northwind Financial");
  assert.equal(report.totals.assets, 2);
  assert.equal(report.settings.regimeId, "nist-ir-8547");
  assert.match(report.settings.regimeCitation, /8547/);
  assert.equal(report.provenance.kev.status, "live");
  assert.equal(report.provenance.research.status, "fallback");
  assert.equal(report.integrity.ok, true);
  assert.equal(report.integrity.events, 2);
  assert.ok(report.waves.length >= 1, "two systems produce at least one wave");
  assert.ok(report.assets.every((asset) => asset.seal));
});

test("an empty estate still produces a valid report", () => {
  const report = build([]);
  assert.equal(report.totals.assets, 0);
  assert.equal(report.totals.meanExposure, 0);
  assert.deepEqual(report.waves, []);
  assert.equal(report.disclaimer, SAFETY_DISCLAIMER);
});

test("CSV output quotes fields containing commas and escapes quotes", () => {
  const report = build([makeAsset({ id: "1", label: 'Payments, "TLS"' })]);
  const csv = reportToCsv(report);
  const [header, ...rows] = csv.split("\n");
  assert.match(header!, /^label,system,usage,algorithm/);
  assert.equal(rows.length, 1);
  assert.match(rows[0]!, /"Payments, ""TLS"""/);
});

test("Markdown output includes every section a reader needs", () => {
  const report = build([makeAsset({ id: "1" })]);
  const markdown = reportToMarkdown(report, "https://cryptotremor.example");
  for (const heading of [
    "# Post-quantum migration readiness report",
    "## Summary",
    "## Migration waves",
    "## Assets",
    "## Provenance",
    "## Integrity",
  ]) {
    assert.ok(markdown.includes(heading), `missing ${heading}`);
  }
  assert.ok(markdown.includes("Northwind Financial"));
  assert.ok(markdown.includes(SAFETY_DISCLAIMER));
  assert.ok(markdown.includes("https://cryptotremor.example"));
  assert.ok(markdown.includes("CISA"));
  assert.ok(markdown.includes("cryptotremor/genesis/v1"));
});

test("Markdown lists active assets before retired ones", () => {
  const report = build([
    makeAsset({ id: "1", label: "Retired thing", status: "retired", exposureScore: 99 }),
    makeAsset({ id: "2", label: "Live thing", exposureScore: 10 }),
  ]);
  const markdown = reportToMarkdown(report, "https://cryptotremor.example");
  assert.ok(markdown.indexOf("Live thing") < markdown.indexOf("Retired thing"));
});

test("per-asset quantum ledger values reach the report", () => {
  const report = build([makeAsset({ id: "1" })]);
  const [asset] = report.assets;
  assert.ok(asset!.logicalQubits > 0);
  assert.ok(asset!.physicalQubits > 0);
  assert.ok(asset!.toffoliCount > 0);
  assert.equal(asset!.bindingConstraint.length > 0, true);
  assert.ok(asset!.recommendation.length > 10);
});

test("the report is JSON-serialisable for storage in share grants", () => {
  const report = build([makeAsset({ id: "1" })]);
  const round = JSON.parse(JSON.stringify(report)) as typeof report;
  assert.deepEqual(round.assets.length, report.assets.length);
  assert.equal(round.totals.assets, report.totals.assets);
});