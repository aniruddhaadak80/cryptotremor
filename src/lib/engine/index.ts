/**
 * Public engine surface.
 *
 * Every consumer — server components, REST handlers, MCP tools, the exported
 * report and the tests — imports from here, so there is exactly one
 * implementation of the survey maths in the repository.
 */

export {
  ATTACKER_PROFILES,
  ALGORITHMS,
  ALGORITHM_IDS,
  COMPLIANCE_REGIMES,
  DATA_CLASSES,
  DECISIONS,
  DEPLOYMENTS,
  DEFAULT_ATTACKER_PROFILE,
  DEFAULT_REGIME,
  DEFAULT_SETTINGS,
  ENGINE_VERSION,
  HORIZON_MAX,
  HORIZON_MIN,
  MANIFEST_COLUMNS,
  MANIFEST_TEMPLATE,
  USAGES,
  canonicalAlgorithmId,
  getAlgorithm,
  getRegime,
  resolveAlgorithm,
} from "../domain/registry.ts";

export {
  CODE_DISTANCE,
  HARVEST_THRESHOLD_DAYS,
  LOGICAL_QUBITS_PER_BIT,
  PHYSICAL_QUBITS_PER_LOGICAL,
  TOFFOLI_PER_BIT_SQUARED,
  attackerProfile,
  daysToBreak,
  estimateQuantumCost,
  exposureYears,
  groverOracleCount,
  isHarvestedAt,
  logicalThroughput,
  migrationEffortYears,
  shorResources,
} from "./quantum-cost.ts";

export {
  BANDS,
  FACTOR_WEIGHTS,
  bandFor,
  bandLabel,
  complianceReadout,
  decisionRelief,
  scoreAsset,
} from "./exposure.ts";
export type { ExposureInput } from "./exposure.ts";

export { MAX_GROVER_CANDIDATES, buildWaves, groupBySystem, migrationQueue } from "./migration.ts";
export type { SystemCandidate } from "./migration.ts";

export { buildStrata, buildSurveyAnalysis, buildTotals, buildTrace } from "./survey.ts";

export { abs2, groverSearch } from "./grover.ts";
export type { GroverResult, GroverStep } from "./grover.ts";