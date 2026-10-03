/**
 * The deterministic exposure model.
 *
 * Six weighted factors, each normalized to 0..1 and each carrying the plain
 * language evidence that produced it. The score is a weighted mean; the band is
 * a fixed cut; the recommendation is derived from the binding constraint rather
 * than hand-written per asset.
 *
 * The single most important idea in this file: for most real assets the binding
 * constraint is *not* when the quantum computer arrives. It is that data must
 * stay confidential for longer than the adversary needs. That is what
 * harvest-now-decrypt-later means, and it is why the product says "rotate now"
 * even when the modelled rupture year is far away.
 */

import type {
  AssetDraft,
  AttackerProfileId,
  ComplianceReadout,
  ComplianceRegime,
  ExposureBand,
  ExposureResult,
  FactorContribution,
  MigrationDecision,
} from "../types.ts";
import {
  DATA_CLASS_WEIGHT,
  DECISION_RELIEF,
  DEPLOYMENT_WEIGHT,
  ENGINE_VERSION,
  resolveAlgorithm,
} from "../domain/registry.ts";
import {
  clamp,
  estimateQuantumCost,
  exposureYears,
  migrationEffortYears,
} from "./quantum-cost.ts";

export const FACTOR_WEIGHTS = {
  algorithmClass: 0.22,
  harvestLifetime: 0.2,
  complianceClock: 0.16,
  migrationLeadTime: 0.16,
  dataClass: 0.14,
  exposureSurface: 0.12,
} as const;

export const BANDS: ReadonlyArray<{ min: number; band: ExposureBand; label: string }> = [
  { min: 80, band: "critical", label: "Critical" },
  { min: 60, band: "urgent", label: "Urgent" },
  { min: 40, band: "plan", label: "Plan" },
  { min: 20, band: "watch", label: "Watch" },
  { min: 0, band: "settled", label: "Settled" },
];

export function bandFor(score: number): ExposureBand {
  const bounded = Number.isFinite(score) ? Math.max(0, Math.min(100, score)) : 0;
  return BANDS.find((entry) => bounded >= entry.min)?.band ?? "settled";
}

export function bandLabel(band: ExposureBand): string {
  return BANDS.find((entry) => entry.band === band)?.label ?? "Settled";
}

/** How much of the exposure a recorded decision has already relieved. */
export function decisionRelief(decision: MigrationDecision): number {
  return DECISION_RELIEF[decision] ?? 0;
}

function algorithmClassValue(algorithmId: string): { value: number; evidence: string } {
  const spec = resolveAlgorithm(algorithmId);
  if (spec.postQuantum) {
    return {
      value: 0,
      evidence: `${spec.label} is post-quantum${spec.fips ? ` (${spec.fips})` : ""}; no Shor or Grover reduction applies.`,
    };
  }
  if (spec.classicalStrength === 0) {
    return {
      value: 0.95,
      evidence: `${spec.label} has no meaningful classical security left, so it must be replaced before quantum cost even matters.`,
    };
  }
  if (spec.attack === "shor") {
    const value = clamp(0.6 + (spec.bits / 4096) * 0.3, 0.55, 0.92);
    return {
      value,
      evidence: `${spec.label} is ${spec.family} with a ${spec.bits}-bit modulus; Shor's algorithm solves it outright, so quantum cost grows with the modulus.`,
    };
  }
  if (spec.attack === "grover") {
    const value = spec.bits <= 128 ? 0.45 : 0.12;
    return {
      value,
      evidence: `${spec.label} is symmetric; Grover only halves its security to ${Math.floor(spec.bits / 2)} bits, which is why symmetric crypto is the last thing to migrate.`,
    };
  }
  return { value: 0.3, evidence: `${spec.label} is unclassified and needs an owner to place it in the registry.` };
}

export function complianceReadout(
  regime: ComplianceRegime,
  usage: string,
  horizonYear: number,
): ComplianceReadout {
  const applicable = regime.milestones.filter((milestone) =>
    milestone.appliesTo.includes(usage as never),
  );
  const sorted = [...applicable].sort((a, b) => a.year - b.year);
  const binding = sorted.find((milestone) => milestone.year >= horizonYear) ?? null;
  const breached = sorted.find((milestone) => milestone.year < horizonYear) ?? null;
  const effective = breached ?? binding;
  return {
    regimeId: regime.id,
    regimeLabel: regime.label,
    milestones: sorted,
    binding: effective,
    yearsToBinding: effective ? effective.year - horizonYear : null,
  };
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

export interface ExposureInput extends AssetDraft {
  decision?: MigrationDecision;
  horizonYear: number;
  regime: ComplianceRegime;
  attackerProfile: AttackerProfileId | string;
  /** True when the supplied CVE appears in the CISA Known Exploited Vulnerabilities catalog. */
  knownExploited?: boolean;
}

/**
 * The single source of truth for exposure. The UI, the REST endpoint, the MCP
 * tools and the exported report all call this function.
 */
export function scoreAsset(input: ExposureInput): ExposureResult {
  const spec = resolveAlgorithm(input.algorithm);
  const horizonYear = Math.round(input.horizonYear);
  const quantum = estimateQuantumCost(spec, input.attackerProfile, horizonYear);
  const profileId = String(input.attackerProfile);
  const ruptureYear = quantum.ruptureYear[profileId] ?? null;

  const compliance = complianceReadout(input.regime, input.usage, horizonYear);
  const effort = migrationEffortYears(input.deployment, input.usage, input.dataClass);
  const yearsExposed = exposureYears(horizonYear, input.confidentialityYears, ruptureYear);
  const yearsToBinding = compliance.yearsToBinding;

  // 1. Algorithm class.
  const algorithmClass = algorithmClassValue(input.algorithm);

  // 2. Harvest-now-decrypt-later lifetime overlap.
  const harvestValue = spec.postQuantum ? 0 : clamp(yearsExposed / 25);

  // 3. Compliance clock: proximity to the binding milestone.
  const complianceValue =
    yearsToBinding === null ? 0.2 : clamp(1 - yearsToBinding / 12);

  // 4. Migration lead time: effort against the time actually available.
  const deficit =
    yearsToBinding === null ? effort / 8 : clamp((effort - yearsToBinding) / 8);
  const leadTimeValue = spec.postQuantum ? 0 : clamp(deficit);

  // 5. Data classification.
  const dataClassValue = clamp(DATA_CLASS_WEIGHT[input.dataClass] ?? 0.3);

  // 6. Exposure surface.
  const surfaceValue = clamp(DEPLOYMENT_WEIGHT[input.deployment] ?? 0.5);

  // A primitive that a quantum adversary cannot meaningfully weaken carries no
  // migration urgency: the standardised post-quantum algorithms, and any
  // symmetric primitive or hash whose Grover-reduced security is still at least
  // 128 bits. Their data classification and reach stay visible on the record
  // itself; those are properties of the data, not of the cryptography.
  // A 128-bit symmetric key does *not* qualify: Grover halves it to 64 bits.
  const quantumSafe =
    spec.postQuantum || (spec.attack === "grover" && spec.bits >= 256);
  const suppressed = quantumSafe;
  const zeroed = (value: number) => (suppressed ? 0 : value);
  const harvest = zeroed(harvestValue);
  const complianceRead = zeroed(complianceValue);
  const leadTime = zeroed(leadTimeValue);

  const factors: FactorContribution[] = [
    {
      key: "algorithm-class",
      label: "Algorithm class",
      value: zeroed(algorithmClass.value),
      weight: FACTOR_WEIGHTS.algorithmClass,
      points: round2(zeroed(algorithmClass.value) * FACTOR_WEIGHTS.algorithmClass * 100),
      evidence: algorithmClass.evidence,
      lever: `Move to ${spec.migrationTarget}.`,
    },
    {
      key: "harvest-lifetime",
      label: "Harvest lifetime",
      value: harvest,
      weight: FACTOR_WEIGHTS.harvestLifetime,
      points: round2(harvest * FACTOR_WEIGHTS.harvestLifetime * 100),
      evidence:
        spec.postQuantum
          ? "Already post-quantum, so there is nothing to harvest."
          : yearsExposed > 0
            ? `Data captured in ${horizonYear} must stay confidential through ${horizonYear + input.confidentialityYears}; the modelled break lands in ${ruptureYear}, so ${round2(yearsExposed)} years of captured data becomes readable retroactively.`
            : `Data must stay confidential through ${horizonYear + input.confidentialityYears}, but the modelled break (${ruptureYear ?? "beyond 2045"}) lands later, so no retroactive exposure is projected yet.`,
      lever:
        yearsExposed > 0
          ? "Re-key now, or shorten how long this data must stay secret."
          : "Keep it on the plan: the overlap appears as the horizon advances.",
    },
    {
      key: "compliance-clock",
      label: "Compliance clock",
      value: complianceRead,
      weight: FACTOR_WEIGHTS.complianceClock,
      points: round2(complianceRead * FACTOR_WEIGHTS.complianceClock * 100),
      evidence: suppressed
        ? "No migration deadline applies to a primitive that is already post-quantum."
        : yearsToBinding === null
          ? `${input.regime.label} sets no milestone for this usage.`
          : yearsToBinding < 0
            ? `${compliance.binding?.label} already passed in ${compliance.binding?.year} under ${input.regime.label}.`
            : `${compliance.binding?.label} in ${compliance.binding?.year} under ${input.regime.label} — ${yearsToBinding} year${yearsToBinding === 1 ? "" : "s"} away.`,
      lever: `Track ${input.regime.label}; switch regimes in settings if another authority binds you.`,
    },
    {
      key: "migration-lead-time",
      label: "Migration lead time",
      value: leadTime,
      weight: FACTOR_WEIGHTS.migrationLeadTime,
      points: round2(leadTime * FACTOR_WEIGHTS.migrationLeadTime * 100),
      evidence: suppressed
        ? "Nothing to migrate."
        : `Estimated ${effort} year${effort === 1 ? "" : "s"} of work to replace this, against ${yearsToBinding === null ? "no published deadline" : `${yearsToBinding} year${yearsToBinding === 1 ? "" : "s"} of runway`}.`,
      lever:
        effort > (yearsToBinding ?? 0)
          ? "Start earlier, or dual-deploy a hybrid handshake to buy runway."
          : "Runway is sufficient; schedule the work rather than rushing it.",
    },
    {
      key: "data-class",
      label: "Data classification",
      value: zeroed(dataClassValue),
      weight: FACTOR_WEIGHTS.dataClass,
      points: round2(zeroed(dataClassValue) * FACTOR_WEIGHTS.dataClass * 100),
      evidence: `${input.dataClass} data carries ${Math.round(dataClassValue * 100)}% of the classification weight.`,
      lever: "Regulated data forces a hard deadline regardless of capability.",
    },
    {
      key: "exposure-surface",
      label: "Exposure surface",
      value: zeroed(surfaceValue),
      weight: FACTOR_WEIGHTS.exposureSurface,
      points: round2(zeroed(surfaceValue) * FACTOR_WEIGHTS.exposureSurface * 100),
      evidence: `${input.deployment} deployments are reachable by adversaries; partner-shared estates change hands with a contract.`,
      lever: "Shared and internet-facing primitives migrate first.",
    },
  ];

  if (input.knownExploited) {
    factors.push({
      key: "known-exploited",
      label: "Known exploited",
      value: 1,
      weight: 0,
      points: 0,
      evidence: `The supplied CVE is in the CISA Known Exploited Vulnerabilities catalog, so this primitive is under active exploitation today.`,
      lever: "Treat as incident response, not migration planning.",
    });
  }

  const rawScore = round2(
    factors.reduce((total, factor) => total + factor.points, 0),
  );

  const decision = input.decision ?? "none";
  const modifier = round2(1 - decisionRelief(decision));
  const score = round2(Math.max(0, Math.min(100, rawScore * modifier)));

  const bindingConstraint: ExposureResult["bindingConstraint"] =
    spec.postQuantum
      ? "none"
      : yearsExposed > 0
        ? "data-lifetime"
        : yearsToBinding !== null && yearsToBinding <= 0
          ? "compliance"
          : yearsToBinding !== null && effort > yearsToBinding
            ? "compliance"
            : ruptureYear !== null
              ? "capability"
              : "none";

  const headline = `${bandLabel(bandFor(score))} · ${rawScore} raw exposure`;
  const recommendation = buildRecommendation({
    band: bandFor(score),
    bindingConstraint,
    spec,
    effort,
    yearsToBinding,
    yearsExposed,
    ruptureYear,
    decision,
    regimeLabel: input.regime.label,
    target: resolveAlgorithm(input.algorithm).migrationTarget,
  });

  return {
    engineVersion: ENGINE_VERSION,
    score,
    band: bandFor(score),
    headline,
    recommendation,
    factors,
    quantum,
    exposureYears: round2(yearsExposed),
    bindingConstraint,
    compliance,
    rawScore,
    decisionModifier: modifier,
    decision,
    effortYears: effort,
    target: spec.migrationTarget,
    ruptureYearProfile: profileId,
  };
}

function buildRecommendation(args: {
  band: ExposureBand;
  bindingConstraint: ExposureResult["bindingConstraint"];
  spec: ReturnType<typeof resolveAlgorithm>;
  effort: number;
  yearsToBinding: number | null;
  yearsExposed: number;
  ruptureYear: number | null;
  decision: MigrationDecision;
  regimeLabel: string;
  target: string;
}): string {
  if (args.decision === "migrated" || args.decision === "retire") {
    return `Recorded as ${args.decision}. Keep the re-keyed material out of the legacy inventory so the survey stays honest.`;
  }
  if (args.spec.postQuantum) {
    return `Already post-quantum. Record it here so partners can see coverage instead of assuming it.`;
  }
  switch (args.bindingConstraint) {
    case "data-lifetime":
      return `Move to ${args.target} now. ${round2(args.yearsExposed)} year(s) of data captured at the horizon would be readable after the modelled break in ${args.ruptureYear}, which is before the data must expire.`;
    case "compliance":
      return `Start now: ${args.regimeLabel} gives ${args.yearsToBinding === null ? "no runway" : `${args.yearsToBinding} year(s)`} and this migration is estimated at ${args.effort} year(s).`;
    case "capability":
      return `Schedule before ${args.ruptureYear}. Capability is the binding constraint, but ${args.effort} year(s) of work means the start date, not the break date, decides the outcome.`;
    default:
      return `Track it. No modelled break inside the horizon and no binding deadline for this usage.`;
  }
}