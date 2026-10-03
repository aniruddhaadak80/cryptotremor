import { test } from "node:test";
import assert from "node:assert/strict";
import { parseCsv, parseManifest, suggestAlgorithms, validateAlgorithm } from "./validate.ts";
import { MAX_IMPORT_ROWS, assetDraftSchema, assetPatchSchema, profileSchema } from "./validate.ts";

const header =
  "label,system,usage,algorithm,deployment,confidentialityYears,dataClass,ownerTeam,notes,cve";

test("CSV reader handles quotes, commas and newlines", () => {
  const rows = parseCsv('a,b,c\n"x,1","he said ""hi""","line1\nline2"');
  assert.deepEqual(rows, [
    ["a", "b", "c"],
    ["x,1", 'he said "hi"', "line1\nline2"],
  ]);
});

test("CSV reader ignores trailing blank lines", () => {
  assert.equal(parseCsv("a,b\n1,2\n\n").length, 2);
});

test("a well-formed manifest parses into drafts", () => {
  const result = parseManifest(
    `${header}\nPayments API TLS certificate,payments-gateway,certificate,RSA-2048,partner-shared,7,regulated,platform,"customer payments, 10y retention",`,
  );
  assert.equal(result.errors.length, 0);
  assert.equal(result.drafts.length, 1);
  assert.equal(result.drafts[0].algorithm, "RSA-2048");
  assert.equal(result.drafts[0].confidentialityYears, 7);
  assert.match(result.drafts[0].notes, /10y retention/);
});

test("row errors are reported individually, not thrown", () => {
  const result = parseManifest(
    `${header}\nGood row,system,signature,Ed25519,internal,5,internal,identity,,\nBad algo,system,signature,NOT-REAL,internal,5,internal,identity,,\nBad enum,system,teleportation,Ed25519,internal,5,internal,identity,,\nBad class,system,signature,Ed25519,internal,5,topsecret,identity,,`,
  );
  assert.equal(result.drafts.length, 1);
  assert.equal(result.errors.length, 3);
  assert.ok(result.errors[0].message.includes("Unknown algorithm"));
  assert.ok(result.errors[1].message.includes("usage"));
  assert.ok(result.errors[2].message.includes("dataClass"));
  assert.deepEqual(result.errors.map((entry) => entry.row), [3, 4, 5]);
});

test("missing columns are named", () => {
  const result = parseManifest("label,system\nonly,two");
  assert.equal(result.drafts.length, 0);
  assert.match(result.errors[0].message, /Missing column/);
});

test("JSON manifests are accepted", () => {
  const result = parseManifest(
    JSON.stringify([
      {
        label: "Okta signing key",
        system: "identity",
        usage: "signature",
        algorithm: "Ed25519",
        deployment: "internal",
        confidentialityYears: 5,
        dataClass: "internal",
        ownerTeam: "identity",
        notes: "",
      },
    ]),
  );
  assert.equal(result.errors.length, 0);
  assert.equal(result.drafts[0].label, "Okta signing key");
});

test("malformed JSON is rejected with a readable message", () => {
  const result = parseManifest("[{oops}]");
  assert.equal(result.drafts.length, 0);
  assert.match(result.errors[0].message, /not valid JSON/i);
});

test("imports are bounded", () => {
  const rows = Array.from(
    { length: MAX_IMPORT_ROWS + 5 },
    (_unused, index) => `Row ${index},system,signature,Ed25519,internal,5,internal,identity,,`,
  );
  const result = parseManifest(`${header}\n${rows.join("\n")}`);
  assert.equal(result.drafts.length, 0);
  assert.match(result.errors[0].message, /at most 200 rows/i);
});

test("a manifest with only a header yields no rows and a clear error", () => {
  const result = parseManifest(header);
  assert.equal(result.drafts.length, 0);
  assert.ok(result.errors.length > 0);
});

test("CVE format is validated", () => {
  const draft = assetDraftSchema.safeParse({
    label: "x",
    system: "y",
    usage: "signature",
    algorithm: "RSA-2048",
    deployment: "internal",
    confidentialityYears: 1,
    dataClass: "internal",
    ownerTeam: "t",
    notes: "",
    cve: "not-a-cve",
  });
  assert.equal(draft.success, false);
  const good = assetDraftSchema.safeParse({
    label: "x",
    system: "y",
    usage: "signature",
    algorithm: "RSA-2048",
    deployment: "internal",
    confidentialityYears: 1,
    dataClass: "internal",
    ownerTeam: "t",
    notes: "",
    cve: "CVE-2021-44228",
  });
  assert.equal(good.success, true);
});

test("field lengths are bounded", () => {
  const result = assetDraftSchema.safeParse({
    label: "x".repeat(200),
    system: "y",
    usage: "signature",
    algorithm: "RSA-2048",
    deployment: "internal",
    confidentialityYears: 1,
    dataClass: "internal",
    ownerTeam: "t",
    notes: "",
  });
  assert.equal(result.success, false);
  assert.equal(
    assetDraftSchema.safeParse({
      label: "x",
      system: "y",
      usage: "signature",
      algorithm: "RSA-2048",
      deployment: "internal",
      confidentialityYears: 900,
      dataClass: "internal",
      ownerTeam: "t",
      notes: "",
    }).success,
    false,
    "an impossible confidentiality window must be rejected",
  );
});

test("patch and profile schemas accept partial and bounded input", () => {
  assert.equal(assetPatchSchema.safeParse({}).success, true);
  assert.equal(assetPatchSchema.safeParse({ decision: "nonsense" }).success, false);
  assert.equal(profileSchema.safeParse({ horizonYear: 2020 }).success, false);
  assert.equal(profileSchema.safeParse({ horizonYear: 2031, regimeId: "cnsa-2" }).success, true);
  assert.equal(profileSchema.safeParse({ attackerProfile: "wild" }).success, false);
});

test("algorithm suggestions help with typos", () => {
  assert.equal(validateAlgorithm("RSA-2048"), null);
  assert.match(validateAlgorithm("rsa2048")!, /RSA-2048/);
  assert.ok(suggestAlgorithms("mlkem").length > 0);
  assert.equal(suggestAlgorithms("").length, 0);
});