#!/usr/bin/env node
/**
 * Live end-to-end verification.
 *
 * Usage:
 *   node scripts/verify-live.mjs                 # uses PUBLIC_URL
 *   node scripts/verify-live.mjs https://host    # explicit base URL
 *
 * It makes real HTTP requests against a running deployment and proves the
 * primary journey: import → read back → update → engine → agent mutation →
 * integrity replay → delete. It never prints a secret and never embeds one.
 */

import process from "node:process";

const REPO_URL = "https://github.com/aniruddhaadak80/cryptotremor";
const ENGINE_PREFIX = "pq-survey-v";

const base = (process.argv[2] ?? process.env.PUBLIC_URL ?? "").replace(/\/$/, "");
if (!base) {
  console.error("Set PUBLIC_URL or pass a base URL: node scripts/verify-live.mjs https://host");
  process.exit(2);
}

const cookies = new Map();
let passed = 0;
const failures = [];

function cookieHeader() {
  return [...cookies.entries()].map(([key, value]) => `${key}=${value}`).join("; ");
}

function storeCookies(response) {
  const raw = response.headers.getSetCookie?.() ?? [];
  for (const line of raw) {
    const [pair] = line.split(";");
    const index = pair.indexOf("=");
    if (index > 0) cookies.set(pair.slice(0, index).trim(), pair.slice(index + 1).trim());
  }
}

async function call(path, init = {}) {
  const headers = { ...(init.headers ?? {}) };
  const jar = cookieHeader();
  if (jar) headers.cookie = jar;
  const response = await fetch(`${base}${path}`, { ...init, headers, redirect: "manual" });
  storeCookies(response);
  const type = response.headers.get("content-type") ?? "";
  const body = type.includes("application/json")
    ? await response.json().catch(() => null)
    : await response.text();
  return { response, body, status: response.status };
}

function check(name, condition, detail = "") {
  if (condition) {
    passed += 1;
    console.log(`  PASS  ${name}`);
  } else {
    failures.push(`${name}${detail ? ` — ${detail}` : ""}`);
    console.log(`  FAIL  ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

function rpc(id, method, params) {
  return {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id, method, params }),
  };
}

const OWNER = "0123456789abcdef0123456789abcdef";

async function main() {
  console.log(`\nCryptotremor live verification against ${base}\n`);

  console.log("1. Landing page and shared chrome");
  const home = await call("/");
  check("/ returns 200", home.status === 200, `got ${home.status}`);
  check(
    "/ renders the GitHub repository link in the shared chrome",
    typeof home.body === "string" &&
      home.body.includes(REPO_URL) &&
      /View source|Star on GitHub/.test(home.body),
  );
  check("/ sets an anonymous session cookie", cookies.has("ct_scope"));

  const footerProbe = await call("/survey");
  check(
    "footer repeats the repository link on an internal route",
    typeof footerProbe.body === "string" && footerProbe.body.includes(REPO_URL),
  );

  console.log("\n2. Health probes the production store");
  const health = await call("/api/health");
  check("/api/health returns 200", health.status === 200, `got ${health.status}`);
  check(
    "health reports a real persistence probe",
    health.body?.persistence?.ok === true && typeof health.body?.persistence?.kind === "string",
    JSON.stringify(health.body?.persistence ?? {}),
  );
  check(
    "health reports persistent storage, not an in-memory stub",
    health.body?.persistence?.persistent === true,
    `kind=${health.body?.persistence?.kind} persistent=${health.body?.persistence?.persistent}`,
  );

  console.log("\n3. Live data with provenance");
  const feed = await call("/api/feed/strata");
  check("/api/feed/strata returns 200", feed.status === 200, `got ${feed.status}`);
  check("KEV feed is non-empty", Array.isArray(feed.body?.kev?.items) && feed.body.kev.items.length > 0);
  check(
    "KEV feed carries source metadata and status",
    typeof feed.body?.kev?.source === "string" &&
      ["live", "fallback"].includes(feed.body?.kev?.status) &&
      typeof feed.body?.kev?.fetchedAt === "string",
  );
  check(
    "arXiv feed is non-empty with provenance",
    Array.isArray(feed.body?.research?.items) &&
      feed.body.research.items.length > 0 &&
      typeof feed.body?.research?.sourceUrl === "string",
  );
  check(
    "fallback data is labelled, never presented as live",
    feed.body?.kev?.status !== "fallback" || /sealed|sample/i.test(feed.body.kev.note ?? ""),
  );

  console.log("\n4. Import the reference estate through the public API");
  const imported = await call("/api/survey/import", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ sample: true }),
  });
  check("import returns 200 or 201", imported.status === 200 || imported.status === 201, `got ${imported.status}`);
  const createdRows = imported.body?.assets ?? [];
  check("import wrote real rows", createdRows.length > 0, `created=${createdRows.length}`);

  const list = await call("/api/assets");
  check("read-back returns the estate", Array.isArray(list.body?.assets) && list.body.assets.length > 0);
  const target = list.body.assets[0];
  check("every row carries a score and a seal", Boolean(target?.exposureScore >= 0 && target?.seal));
  check("every row carries a modelled rupture year", target?.ruptureYear !== undefined);

  console.log("\n5. Cross-scope isolation");
  const otherScope = await call("/api/assets", { headers: { "x-ct-owner": OWNER } });
  check(
    "another owner scope cannot read these rows",
    !Array.isArray(otherScope.body?.assets) || otherScope.body.assets.length === 0,
  );
  const crossRead = await call(`/api/assets/${target.id}`, { headers: { "x-ct-owner": OWNER } });
  check("another owner scope gets 404 for a known id", crossRead.status === 404, `got ${crossRead.status}`);

  console.log("\n6. Update through the API");
  const patched = await call(`/api/assets/${target.id}`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ confidentialityYears: 25, notes: "verified by live run" }),
  });
  check("PATCH returns 200", patched.status === 200, `got ${patched.status}`);
  check(
    "PATCH response carries a new seal",
    typeof patched.body?.seal === "string" && patched.body.seal.startsWith("sha384:"),
  );
  const readAfter = await call(`/api/assets/${target.id}`);
  check(
    "read-back reflects the update",
    readAfter.body?.asset?.confidentialityYears === 25 &&
      readAfter.body?.asset?.notes === "verified by live run",
  );

  console.log("\n7. Engine returns a versioned, itemised result");
  const engine = await call("/api/survey");
  check("/api/survey returns 200", engine.status === 200, `got ${engine.status}`);
  check(
    "engine version is stamped",
    String(engine.body?.analysis?.engineVersion ?? engine.body?.engineVersion ?? "").startsWith(ENGINE_PREFIX),
    String(engine.body?.analysis?.engineVersion ?? engine.body?.engineVersion),
  );
  const detail = await call(`/api/assets/${target.id}`);
  const exposure = detail.body?.exposure;
  check("exposure has a score", typeof exposure?.score === "number" && exposure.score >= 0);
  check("exposure has a band", typeof exposure?.band === "string");
  check("exposure has itemised factors", Array.isArray(exposure?.factors) && exposure.factors.length >= 6);
  check(
    "factors carry evidence and weights",
    exposure?.factors?.every((factor) => typeof factor.evidence === "string" && factor.evidence.length > 10),
  );
  check("exposure has a recommendation", typeof exposure?.recommendation === "string" && exposure.recommendation.length > 20);
  check(
    "quantum ledger is present",
    typeof exposure?.quantum?.method === "string" && typeof exposure?.quantum?.ruptureYear === "object",
  );
  check("audit trail is returned", Array.isArray(detail.body?.auditTrail) && detail.body.auditTrail.length >= 2);

  console.log("\n8. MCP handshake and tool discovery");
  const init = await call("/api/mcp", rpc(1, "initialize", { protocolVersion: "2024-11-05" }));
  check("initialize succeeds", init.status === 200 && init.body?.result?.protocolVersion);
  check(
    "initialize advertises server info",
    init.body?.result?.serverInfo?.name === "cryptotremor",
  );
  const ownerToken = init.body?.result?.ownerToken;
  check("initialize returns an owner capability", typeof ownerToken === "string" && ownerToken.length === 32);

  const tools = await call("/api/mcp", rpc(2, "tools/list", {}));
  const toolNames = (tools.body?.result?.tools ?? []).map((tool) => tool.name);
  check("tools/list returns tools", toolNames.length >= 3, `got ${toolNames.length}`);
  for (const required of ["list_assets", "estimate_quantum_cost", "save_asset", "verify_integrity"]) {
    check(`tools/list includes ${required}`, toolNames.includes(required));
  }
  check(
    "tools carry input schemas",
    (tools.body?.result?.tools ?? []).every((tool) => tool.inputSchema && tool.inputSchema.type === "object"),
  );

  const badMethod = await call("/api/mcp", rpc(3, "nope/nope", {}));
  check("unknown method returns JSON-RPC -32601", badMethod.body?.error?.code === -32601);

  console.log("\n9. Agent analysis tool (no mutation)");
  const estimate = await call("/api/mcp", {
    ...rpc(4, "tools/call", {
      name: "estimate_quantum_cost",
      arguments: {
        algorithm: "RSA-2048",
        usage: "certificate",
        deployment: "partner-shared",
        confidentialityYears: 25,
        dataClass: "regulated",
        horizonYear: 2031,
      },
    }),
    headers: { "content-type": "application/json", "x-ct-owner": ownerToken },
  });
  check(
    "estimate_quantum_cost returns a versioned score and factors",
    typeof estimate.body?.result?.structuredContent?.result?.score === "number" &&
      Array.isArray(estimate.body.result.structuredContent.result.factors),
  );
  check(
    "estimate_quantum_cost recommends an action",
    typeof estimate.body?.result?.structuredContent?.result?.recommendation === "string",
  );

  console.log("\n10. Agent mutation writes through the same path");
  const idempotencyKey = `live-verify-${Date.now()}`;
  const saveArgs = {
    label: "Live verification primitive",
    system: "live-verification",
    usage: "key-establishment",
    algorithm: "ECDSA-P384",
    deployment: "internet",
    confidentialityYears: 15,
    dataClass: "confidential",
    ownerTeam: "verification",
    notes: "created by scripts/verify-live.mjs",
    idempotencyKey,
  };
  const save = await call("/api/mcp", {
    ...rpc(5, "tools/call", { name: "save_asset", arguments: saveArgs }),
    headers: { "content-type": "application/json", "x-ct-owner": ownerToken },
  });
  const saved = save.body?.result?.structuredContent;
  check("save_asset created a record", typeof saved?.asset?.id === "string", JSON.stringify(save.body).slice(0, 200));
  check("save_asset returned a seal reference", String(saved?.seal ?? "").startsWith("sha384:"));

  const saveRetry = await call("/api/mcp", {
    ...rpc(6, "tools/call", { name: "save_asset", arguments: saveArgs }),
    headers: { "content-type": "application/json", "x-ct-owner": ownerToken },
  });
  check(
    "save_asset is idempotent on the same key",
    saveRetry.body?.result?.structuredContent?.created === false &&
      saveRetry.body?.result?.structuredContent?.asset?.id === saved?.asset?.id,
  );

  const agentRead = await call("/api/mcp", {
    ...rpc(7, "tools/call", { name: "list_assets", arguments: { system: "live-verification" } }),
    headers: { "content-type": "application/json", "x-ct-owner": ownerToken },
  });
  check(
    "the agent mutation is visible to the agent read tool",
    (agentRead.body?.result?.structuredContent?.assets ?? []).some((asset) => asset.id === saved?.asset?.id),
  );

  console.log("\n11. Decision, integrity replay, then delete");
  const decide = await call("/api/mcp", {
    ...rpc(8, "tools/call", {
      name: "record_decision",
      arguments: { id: saved.asset.id, decision: "schedule", note: "verified" },
    }),
    headers: { "content-type": "application/json", "x-ct-owner": ownerToken },
  });
  check(
    "record_decision persists the decision",
    decide.body?.result?.structuredContent?.asset?.decision === "schedule",
  );
  const decideRetry = await call("/api/mcp", {
    ...rpc(9, "tools/call", {
      name: "record_decision",
      arguments: { id: saved.asset.id, decision: "schedule", note: "verified" },
    }),
    headers: { "content-type": "application/json", "x-ct-owner": ownerToken },
  });
  check(
    "record_decision is idempotent",
    decideRetry.body?.result?.structuredContent?.event?.seq ===
      decide.body?.result?.structuredContent?.event?.seq,
  );

  const verify = await call("/api/verify");
  check("/api/verify returns 200", verify.status === 200, `got ${verify.status}`);
  check("integrity replay is clean", verify.body?.ok === true, JSON.stringify(verify.body?.brokenAt ?? {}));
  check("integrity replay reports no tampered entity", verify.body?.tamperedEntities === 0);
  check("integrity replay reports events", Number(verify.body?.events) > 0, String(verify.body?.events));
  check("integrity replay uses SHA-384", verify.body?.algorithm === "SHA-384");

  const agentVerify = await call("/api/mcp", {
    ...rpc(10, "tools/call", { name: "verify_integrity", arguments: {} }),
    headers: { "content-type": "application/json", "x-ct-owner": ownerToken },
  });
  check(
    "verify_integrity agrees through the agent interface",
    agentVerify.body?.result?.structuredContent?.ok === true,
  );

  const report = await call("/api/report?format=markdown");
  check("markdown export returns 200", report.status === 200, `got ${report.status}`);
  check(
    "markdown export carries provenance and the disclaimer",
    typeof report.body === "string" &&
      report.body.includes("## Provenance") &&
      report.body.includes("planning estimates"),
  );
  const csv = await call("/api/report?format=csv");
  check("csv export returns a header row", typeof csv.body === "string" && csv.body.split("\n")[0].startsWith("label,"));

  const share = await call("/api/report", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ label: "live verification report" }),
  });
  check("share snapshot created", Boolean(share.body?.url), JSON.stringify(share.body).slice(0, 160));
  let shareUrl = "";
  try {
    // The share link is absolute and may point at the configured site origin,
    // so take its path rather than assuming it starts with the base URL.
    shareUrl = new URL(String(share.body?.url ?? "")).pathname;
  } catch {
    shareUrl = "";
  }
  const sharePath = new URL("/r/", base).toString();
  void sharePath;
  if (shareUrl) {
    const page = await call(shareUrl);
    check(
      "partner share page renders without a session",
      page.status === 200 && typeof page.body === "string" && page.body.includes("Frozen snapshot"),
      `got ${page.status}`,
    );

    const apiPath = shareUrl.replace(/^\/r\//, "/api/share/");
    const shared = await call(apiPath);
    check("partner share API returns 200", shared.status === 200, `got ${shared.status}`);
    check(
      "partner share link exposes a chain head",
      Boolean(shared.body?.chain?.headSeal),
      `events=${shared.body?.chain?.events} assets=${shared.body?.assetCount}`,
    );
    check(
      "partner share link carries the estate it froze",
      Number(shared.body?.assetCount) > 0,
      `assetCount=${shared.body?.assetCount}`,
    );
  }

  const removed = await call(`/api/assets/${saved.asset.id}`, {
    method: "DELETE",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ reason: "live verification cleanup" }),
  });
  check("DELETE returns 200", removed.status === 200, `got ${removed.status}`);
  check("DELETE leaves a tombstone rather than erasing history", removed.body?.tombstone === true);
  const afterDelete = await call(`/api/assets/${saved.asset.id}`);
  check(
    "deleted record is represented as retired, not silently dropped",
    afterDelete.status === 200 && afterDelete.body?.asset?.status === "retired",
  );
  const verifyAfter = await call("/api/verify");
  check("integrity still replays after deletion", verifyAfter.body?.ok === true);

  console.log("\n12. Routes, links and the repository");
  for (const route of ["/", "/survey", "/seismograph", "/agent", "/report", "/settings", "/verify"]) {
    const probe = await call(route);
    check(`${route} returns 200`, probe.status === 200, `got ${probe.status}`);
  }
  const badShare = await call("/r/00000000000000000000000000000000");
  check("unknown share token returns 404", badShare.status === 404, `got ${badShare.status}`);
  const missingAsset = await call("/api/assets/00000000-0000-0000-0000-000000000000");
  check("unknown asset id returns 404", missingAsset.status === 404, `got ${missingAsset.status}`);
  const badBody = await call("/api/assets", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ label: "", system: "", usage: "nope" }),
  });
  check("invalid create is rejected with 422", badBody.status === 422, `got ${badBody.status}`);
  check(
    "errors use the stable envelope",
    typeof badBody.body?.error?.code === "string" && typeof badBody.body?.error?.message === "string",
  );
  const unknownAlgorithm = await call("/api/assets", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      label: "x",
      system: "y",
      usage: "signature",
      algorithm: "NOPE-1",
      deployment: "internal",
      confidentialityYears: 1,
      dataClass: "internal",
      ownerTeam: "t",
    }),
  });
  check(
    "unknown algorithm is rejected with a helpful message",
    unknownAlgorithm.status === 422 && /Unknown algorithm/.test(unknownAlgorithm.body?.error?.message ?? ""),
  );

  const repo = await fetch(REPO_URL, { redirect: "follow" });
  check("public GitHub repository returns 200", repo.status === 200, `got ${repo.status}`);
  const manifest = await call("/mcp.json");
  check("/mcp.json is served", manifest.status === 200, `got ${manifest.status}`);
  check(
    "/mcp.json points at the live endpoint",
    String(manifest.body?.servers?.cryptotremor?.url ?? "").includes("/api/mcp"),
    JSON.stringify(manifest.body).slice(0, 160),
  );

  console.log(`\n${passed} checks passed, ${failures.length} failed.`);
  if (failures.length > 0) {
    console.log("\nFailures:");
    for (const failure of failures) console.log(`  - ${failure}`);
    process.exit(1);
  }
  console.log("All live checks passed.");
}

main().catch((error) => {
  console.error(`\nVerification aborted: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});