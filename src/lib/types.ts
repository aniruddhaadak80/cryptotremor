/**
 * Cryptotremor domain types.
 *
 * Every external shape is normalized here so the UI, the REST API and the MCP
 * tools all speak the same vocabulary.
 */

export type AssetStatus = "active" | "retired";

export type Usage =
  | "key-establishment"
  | "signature"
  | "certificate"
  | "data-at-rest"
  | "transport"
  | "integrity";

export type Deployment =
  | "internet"
  | "partner-shared"
  | "internal"
  | "embedded"
  | "data-at-rest";

export type DataClass = "public" | "internal" | "confidential" | "regulated";

export type MigrationDecision =
  | "none"
  | "accept"
  | "schedule"
  | "migrating"
  | "migrated"
  | "retire";

/** How a quantum adversary attacks the primitive. */
export type QuantumAttack = "shor" | "grover" | "none";

export type AlgorithmFamily =
  | "rsa"
  | "elliptic-curve"
  | "finite-field"
  | "lattice"
  | "hash-based"
  | "code-based"
  | "symmetric"
  | "hash";

export interface AlgorithmSpec {
  readonly id: string;
  readonly label: string;
  readonly family: AlgorithmFamily;
  /** Key size in bits. Symmetric ciphers and hashes use their security-relevant size. */
  readonly bits: number;
  /** Classical security level in bits. */
  readonly classicalStrength: number;
  readonly attack: QuantumAttack;
  readonly postQuantum: boolean;
  /** NIST FIPS number when the algorithm is standardized PQC. */
  readonly fips?: string;
  readonly migrationTarget: string;
  readonly note: string;
}

export interface CryptoAsset {
  id: string;
  ownerScope: string;
  label: string;
  system: string;
  usage: Usage;
  algorithm: string;
  bits: number;
  deployment: Deployment;
  /** Years the protected data must remain confidential. */
  confidentialityYears: number;
  dataClass: DataClass;
  ownerTeam: string;
  notes: string;
  cve: string | null;
  decision: MigrationDecision;
  decisionNote: string;
  decidedAt: string | null;
  status: AssetStatus;
  createdAt: string;
  updatedAt: string;
  /** Denormalized engine output kept for listing, sorting and filtering. */
  exposureScore: number;
  exposureBand: ExposureBand;
  ruptureYear: number | null;
  /** SHA-384 seal of this asset's most recent audit event. */
  seal: string | null;
}

export type AssetDraft = {
  label: string;
  system: string;
  usage: Usage;
  algorithm: string;
  deployment: Deployment;
  confidentialityYears: number;
  dataClass: DataClass;
  ownerTeam: string;
  notes: string;
  cve?: string | null;
};

export type AssetPatch = Partial<
  Pick<
    AssetDraft,
    | "label"
    | "system"
    | "usage"
    | "algorithm"
    | "deployment"
    | "confidentialityYears"
    | "dataClass"
    | "ownerTeam"
    | "notes"
    | "cve"
  >
> & {
  decision?: MigrationDecision;
  decisionNote?: string;
};

export type ExposureBand = "settled" | "watch" | "plan" | "urgent" | "critical";

export interface FactorContribution {
  key: string;
  label: string;
  /** Normalized 0..1 input to the factor. */
  value: number;
  weight: number;
  /** value * weight * 100, rounded to 2 decimals. */
  points: number;
  /** Plain-language reading of the raw inputs behind this factor. */
  evidence: string;
  /** What would move this factor. */
  lever: string;
}

export interface QuantumCost {
  attack: QuantumAttack;
  /** Logical qubits required for the break. */
  logicalQubits: number;
  /** Approximate Toffoli (non-Clifford) count. */
  toffoliCount: number;
  /** Logical depth assuming bounded parallelism from the workspace size. */
  logicalDepth: number;
  /** Surface-code physical qubits at the assumed code distance. */
  physicalQubits: number;
  codeDistance: number;
  /** Days to break at the attacker profile for each candidate year. */
  daysToBreak: Record<string, number>;
  /** First year the break costs under one day, per attacker profile. */
  ruptureYear: Record<string, number | null>;
  method: string;
}

export interface ExposureResult {
  engineVersion: string;
  score: number;
  band: ExposureBand;
  headline: string;
  recommendation: string;
  factors: FactorContribution[];
  quantum: QuantumCost;
  /** Years of confidentiality that still outlive the expected break. */
  exposureYears: number;
  bindingConstraint: "data-lifetime" | "compliance" | "capability" | "none";
  compliance: ComplianceReadout;
  /** Weighted factor sum before any recorded decision is applied. */
  rawScore: number;
  /** Multiplier from the recorded migration decision (1 = nothing recorded). */
  decisionModifier: number;
  decision: MigrationDecision;
  /** Estimated years of work to replace this primitive. */
  effortYears: number;
  /** Recommended replacement, from the registry. */
  target: string;
  /** Attacker profile id used for this result. */
  ruptureYearProfile: string;
}

export interface ComplianceReadout {
  regimeId: string;
  regimeLabel: string;
  milestones: ComplianceMilestone[];
  /** The milestone that binds this asset first. */
  binding: ComplianceMilestone | null;
  yearsToBinding: number | null;
}

export interface ComplianceMilestone {
  id: string;
  label: string;
  year: number;
  appliesTo: Usage[];
  citation: string;
}

export interface ComplianceRegime {
  id: string;
  label: string;
  authority: string;
  summary: string;
  citation: string;
  milestones: ComplianceMilestone[];
}

export type AttackerProfileId = "conservative" | "expected" | "aggressive";

export interface AttackerProfile {
  id: AttackerProfileId;
  label: string;
  /** Logical gates per second assumed available in the base year. */
  baseLogicalGatesPerSecond: number;
  baseYear: number;
  /** Annual doubling time of logical gate throughput. */
  doublingYears: number;
  rationale: string;
}

export interface MigrationWave {
  wave: number;
  system: string;
  assets: string[];
  /** Sum of exposure removed by migrating this system. */
  exposureRelieved: number;
  /** Earliest rupture year among the wave's assets. */
  firstRuptureYear: number | null;
  /** How the wave was selected. */
  selectedBy: "grover-amplification" | "residual-order" | "greedy-rotation";
  /** Amplitude at the Grover oracle for this candidate, when applicable. */
  amplification: number | null;
  rationale: string;
}

export interface SurveyAnalysis {
  engineVersion: string;
  horizonYear: number;
  regimeId: string;
  totals: {
    assets: number;
    active: number;
    retired: number;
    critical: number;
    urgent: number;
    meanExposure: number;
    earliestRuptureYear: number | null;
  };
  waves: MigrationWave[];
  trace: TracePoint[];
  strata: StratumBand[];
  generatedAt: string;
}

export interface TracePoint {
  year: number;
  /** Aggregate exposure at that year, 0..100. */
  intensity: number;
  /** Number of assets whose confidentiality outlives the break at that year. */
  harvested: number;
}

export interface StratumBand {
  system: string;
  /** Depth ordering index; 0 is the shallowest stratum. */
  depth: number;
  assets: number;
  meanExposure: number;
  earliestRuptureYear: number | null;
  dominantAlgorithm: string;
}

export type AuditEventType =
  | "asset.create"
  | "asset.update"
  | "asset.decide"
  | "asset.delete"
  | "report.share";

export interface AuditEvent {
  id: string;
  ownerScope: string;
  entityId: string;
  seq: number;
  type: AuditEventType;
  payload: Record<string, unknown>;
  prevSeal: string;
  seal: string;
  createdAt: string;
}

export interface ReplayReport {
  ok: boolean;
  events: number;
  assets: number;
  genesisSeal: string;
  headSeal: string | null;
  brokenAt: { entityId: string; seq: number } | null;
  verifiedAt: string;
  tombstones: number;
}

export interface ShareGrant {
  token: string;
  ownerScope: string;
  label: string;
  createdAt: string;
  assetCount: number;
}

export interface Profile {
  ownerScope: string;
  orgName: string;
  horizonYear: number;
  regimeId: string;
  attackerProfile: string;
  tolerance: number;
  updatedAt: string;
}

export type FeedStatus = "live" | "fallback";

export interface FeedEnvelope<T> {
  status: FeedStatus;
  fetchedAt: string;
  source: string;
  sourceUrl: string;
  attribution: string;
  note: string;
  items: T[];
}

export interface KevItem {
  cveId: string;
  vendorProject: string;
  product: string;
  vulnerabilityName: string;
  dateAdded: string;
  dueDate: string;
  knownRansomware: string;
  /** Relevance to a cryptographic migration program, 0..1. */
  cryptoRelevance: number;
  reason: string;
}

export interface ResearchSignal {
  id: string;
  title: string;
  summary: string;
  publishedAt: string;
  authors: string[];
  link: string;
  categories: string[];
}

export interface ErrorEnvelope {
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
}