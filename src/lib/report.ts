/**
 * The takeaway artifact: a partner-readable readiness report.
 *
 * One report object is the single source for the on-screen export view, the
 * Markdown and CSV downloads and the frozen snapshot behind a share link. It
 * carries its own provenance (which feeds were live, when they were fetched) and
 * its own integrity reference, so a recipient can check the claim rather than
 * trust the sender.
 */

import type {
  CryptoAsset,
  ExposureResult,
  MigrationWave,
  Profile,
  ReplayReport,
  StratumBand,
} from "./types.ts";
import {
  ENGINE_VERSION,
  buildSurveyAnalysis,
  buildWaves,
  getAlgorithm,
  getRegime,
} from "./engine/index.ts";

export const SAFETY_DISCLAIMER =
  "Cryptotremor produces planning estimates, not a security audit, a compliance determination or a cryptographic review. Rupture years are scenarios derived from published resource estimates and an assumed attacker roadmap, not predictions. Have a qualified cryptographer review any migration decision before acting on it.";

export interface ReportAsset {
  id: string;
  label: string;
  system: string;
  usage: string;
  algorithm: string;
  bits: number;
  deployment: string;
  dataClass: string;
  confidentialityYears: number;
  ownerTeam: string;
  notes: string;
  cve: string | null;
  decision: string;
  decisionNote: string;
  status: string;
  exposureScore: number;
  rawScore: number;
  band: string;
  ruptureYear: number | null;
  bindingConstraint: string;
  effortYears: number;
  recommendation: string;
  logicalQubits: number;
  physicalQubits: number;
  toffoliCount: number;
  seal: string | null;
}

export interface Report {
  title: string;
  org: string;
  generatedAt: string;
  engineVersion: string;
  settings: {
    horizonYear: number;
    regimeId: string;
    regimeLabel: string;
    regimeCitation: string;
    attackerProfile: string;
  };
  totals: {
    assets: number;
    active: number;
    retired: number;
    critical: number;
    urgent: number;
    meanExposure: number;
    earliestRuptureYear: number | null;
  };
  assets: ReportAsset[];
  waves: MigrationWave[];
  strata: StratumBand[];
  provenance: {
    kev: { status: string; source: string; sourceUrl: string; fetchedAt: string; attribution: string; note: string };
    research: { status: string; source: string; sourceUrl: string; fetchedAt: string; attribution: string; note: string };
  };
  integrity: {
    genesisSeal: string;
    headSeal: string | null;
    events: number;
    ok: boolean;
  };
  disclaimer: string;
}

export interface ReportInput {
  org: string;
  profile: Profile;
  assets: CryptoAsset[];
  exposures: Map<string, ExposureResult>;
  provenance: Report["provenance"];
  integrity: Pick<ReplayReport, "genesisSeal" | "headSeal" | "events" | "ok">;
}

function assetToReport(asset: CryptoAsset, exposure: ExposureResult | undefined): ReportAsset {
  return {
    id: asset.id,
    label: asset.label,
    system: asset.system,
    usage: asset.usage,
    algorithm: asset.algorithm,
    bits: asset.bits,
    deployment: asset.deployment,
    dataClass: asset.dataClass,
    confidentialityYears: asset.confidentialityYears,
    ownerTeam: asset.ownerTeam,
    notes: asset.notes,
    cve: asset.cve,
    decision: asset.decision,
    decisionNote: asset.decisionNote,
    status: asset.status,
    exposureScore: asset.exposureScore,
    rawScore: exposure?.rawScore ?? asset.exposureScore,
    band: asset.exposureBand,
    ruptureYear: asset.ruptureYear,
    bindingConstraint: exposure?.bindingConstraint ?? "none",
    effortYears: exposure?.effortYears ?? 0,
    recommendation:
      exposure?.recommendation ??
      getAlgorithm(asset.algorithm)?.migrationTarget ??
      "Replace with an approved post-quantum primitive.",
    logicalQubits: exposure?.quantum.logicalQubits ?? 0,
    physicalQubits: exposure?.quantum.physicalQubits ?? 0,
    toffoliCount: exposure?.quantum.toffoliCount ?? 0,
    seal: asset.seal,
  };
}

export function buildReport(input: ReportInput): Report {
  const regime = getRegime(input.profile.regimeId);
  const assets = input.assets.map((asset) => assetToReport(asset, input.exposures.get(asset.id)));
  const waves = buildWaves(input.assets);
  const analysis = buildSurveyAnalysis(input.assets, {
    horizonYear: input.profile.horizonYear,
    regimeId: input.profile.regimeId,
    waves,
  });

  return {
    title: "Post-quantum migration readiness report",
    org: input.org || "Unnamed organisation",
    generatedAt: new Date().toISOString(),
    engineVersion: ENGINE_VERSION,
    settings: {
      horizonYear: input.profile.horizonYear,
      regimeId: regime.id,
      regimeLabel: regime.label,
      regimeCitation: regime.citation,
      attackerProfile: input.profile.attackerProfile,
    },
    totals: analysis.totals,
    assets,
    waves,
    strata: analysis.strata,
    provenance: input.provenance,
    integrity: {
      genesisSeal: input.integrity.genesisSeal,
      headSeal: input.integrity.headSeal,
      events: input.integrity.events,
      ok: input.integrity.ok,
    },
    disclaimer: SAFETY_DISCLAIMER,
  };
}

/* --------------------------------------------------------------- renderers */

function escapeCell(value: string | number | null): string {
  if (value === null) return "";
  const text = String(value);
  if (/[",\n]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
  return text;
}

export function reportToCsv(report: Report): string {
  const header = [
    "label",
    "system",
    "usage",
    "algorithm",
    "bits",
    "deployment",
    "dataClass",
    "confidentialityYears",
    "ownerTeam",
    "exposureScore",
    "rawScore",
    "band",
    "ruptureYear",
    "bindingConstraint",
    "effortYears",
    "logicalQubits",
    "physicalQubits",
    "toffoliCount",
    "decision",
    "status",
    "cve",
    "seal",
  ];
  const lines = [header.join(",")];
  for (const asset of report.assets) {
    lines.push(
      [
        asset.label,
        asset.system,
        asset.usage,
        asset.algorithm,
        asset.bits,
        asset.deployment,
        asset.dataClass,
        asset.confidentialityYears,
        asset.ownerTeam,
        asset.exposureScore,
        asset.rawScore,
        asset.band,
        asset.ruptureYear,
        asset.bindingConstraint,
        asset.effortYears,
        asset.logicalQubits,
        asset.physicalQubits,
        asset.toffoliCount,
        asset.decision,
        asset.status,
        asset.cve ?? "",
        asset.seal ?? "",
      ]
        .map(escapeCell)
        .join(","),
    );
  }
  return lines.join("\n");
}

export function reportToMarkdown(report: Report, liveUrl: string): string {
  const queued = [...report.assets].sort((a, b) => {
    if (a.status !== b.status) return a.status === "active" ? -1 : 1;
    if (b.exposureScore !== a.exposureScore) return b.exposureScore - a.exposureScore;
    return (a.ruptureYear ?? 9999) - (b.ruptureYear ?? 9999);
  });
  const lines: string[] = [];

  lines.push(`# ${report.title}`);
  lines.push("");
  lines.push(`**Organisation:** ${report.org}`);
  lines.push(`**Generated:** ${report.generatedAt}`);
  lines.push(`**Engine:** \`${report.engineVersion}\``);
  lines.push(`**Compliance clock:** ${report.settings.regimeLabel} — ${report.settings.regimeCitation}`);
  lines.push(`**Attacker scenario:** ${report.settings.attackerProfile}`);
  lines.push(`**Horizon year:** ${report.settings.horizonYear}`);
  lines.push("");
  lines.push("## Summary");
  lines.push("");
  lines.push(`- Assets surveyed: **${report.totals.assets}** (${report.totals.active} active, ${report.totals.retired} retired)`);
  lines.push(`- Critical: **${report.totals.critical}** · Urgent: **${report.totals.urgent}**`);
  lines.push(`- Mean exposure: **${report.totals.meanExposure}**`);
  lines.push(`- Earliest modelled rupture: **${report.totals.earliestRuptureYear ?? "beyond 2045"}**`);
  lines.push("");
  lines.push("## Migration waves");
  lines.push("");
  lines.push("| Wave | System | Exposure relieved | First rupture | Selected by |");
  lines.push("| --- | --- | --- | --- | --- |");
  for (const wave of report.waves) {
    lines.push(
      `| ${wave.wave} | ${wave.system} | ${wave.exposureRelieved} | ${wave.firstRuptureYear ?? "—"} | ${wave.selectedBy}${
        wave.amplification ? ` (${wave.amplification}x)` : ""
      } |`,
    );
  }
  lines.push("");
  lines.push("## Assets");
  lines.push("");
  lines.push("| Asset | System | Algorithm | Exposure | Band | Rupture | Decision |");
  lines.push("| --- | --- | --- | --- | --- | --- | --- |");
  for (const asset of queued) {
    lines.push(
      `| ${asset.label} | ${asset.system} | ${asset.algorithm} | ${asset.exposureScore} | ${asset.band} | ${
        asset.ruptureYear ?? "—"
      } | ${asset.decision} |`,
    );
  }
  lines.push("");
  lines.push("## Provenance");
  lines.push("");
  for (const key of ["kev", "research"] as const) {
    const source = report.provenance[key];
    lines.push(`- **${source.attribution}** (${source.status}) — ${source.source}, retrieved ${source.fetchedAt}. ${source.note}`);
  }
  lines.push("");
  lines.push("## Integrity");
  lines.push("");
  lines.push(`- Genesis seal: \`${report.integrity.genesisSeal}\``);
  lines.push(`- Chain head: \`${report.integrity.headSeal ?? "none"}\``);
  lines.push(`- Events: **${report.integrity.events}** · Replay ${report.integrity.ok ? "clean" : "BROKEN"}`);
  lines.push("");
  lines.push("---");
  lines.push("");
  lines.push(report.disclaimer);
  lines.push("");
  lines.push(`Generated by [Cryptotremor](${liveUrl}).`);

  return lines.join("\n");
}
