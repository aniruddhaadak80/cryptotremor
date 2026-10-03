/**
 * Quantum cost estimation for a single cryptographic primitive.
 *
 * The model is deliberately explicit about what is grounded in the literature
 * and what is an extrapolation:
 *
 *  - Grounded: the shape of the resource estimates. Shor's modular
 *    exponentiation needs a working register proportional to the modulus, a
 *    Toffoli count superlinear in the modulus size, and on a distance-15
 *    surface code roughly 2*d^2 = 450 physical qubits per logical qubit.
 *  - Calibrated: RSA-2048 lands at ~2.9k logical qubits and ~1.68e8 Toffoli
 *    operations, which is the same order as the published factoring estimates
 *    (Gidney & Ekera 2021, 20M noisy qubits / 8 hours; Gidney 2025, ~1M noisy
 *    qubits / ~1 week). The per-bit coefficients are a documented
 *    approximation, not a physical guarantee.
 *  - Extrapolated: the attacker throughput roadmap. No cryptographically
 *    relevant quantum computer exists, so the year at which a break costs less
 *    than a day is a scenario, and three scenarios are reported side by side.
 *
 * Every input is normalized and clamped so the function is total: unknown
 * algorithms, zero bit sizes and malformed keys never throw.
 */

import type {
  AlgorithmSpec,
  AttackerProfile,
  AttackerProfileId,
  QuantumCost,
} from "../types.ts";
import { ATTACKER_PROFILES, ENGINE_VERSION, HORIZON_MAX, HORIZON_MIN } from "../domain/registry.ts";

/** Logical qubits per modulus bit, calibrated against RSA-2048 estimates. */
export const LOGICAL_QUBITS_PER_BIT = 1.4;
/** Toffoli operations per bit squared for schoolbook modular exponentiation. */
export const TOFFOLI_PER_BIT_SQUARED = 40;
/** Assumed surface-code distance; physical qubits per logical qubit is 2*d^2. */
export const CODE_DISTANCE = 15;
export const PHYSICAL_QUBITS_PER_LOGICAL = 2 * CODE_DISTANCE * CODE_DISTANCE;
/** Logical gates charged per Grover oracle invocation. */
export const ORACLE_GATE_EQUIVALENT = 1000;
/** A break costing at most this many days counts as practically harvestable. */
export const HARVEST_THRESHOLD_DAYS = 1;
export const SECONDS_PER_DAY = 86400;

/** Years reported in the cost ledger, so payloads stay small and comparable. */
export const MILESTONE_YEARS = [2026, 2030, 2035, 2040, 2045] as const;

export function clamp(value: number, min = 0, max = 1): number {
  if (!Number.isFinite(value)) return min;
  return value < min ? min : value > max ? max : value;
}

function safeInt(value: number, fallback: number): number {
  if (!Number.isFinite(value)) return fallback;
  return Math.round(value);
}

export function attackerProfile(id: string): AttackerProfile {
  return ATTACKER_PROFILES[id] ?? ATTACKER_PROFILES.expected;
}

/** Logical operations per second an attacker is assumed to sustain in `year`. */
export function logicalThroughput(
  profile: AttackerProfile,
  year: number,
): number {
  const doublings = (year - profile.baseYear) / profile.doublingYears;
  return profile.baseLogicalGatesPerSecond * Math.pow(2, doublings);
}

/** Logical qubits and Toffoli count for a Shor attack on an n-bit modulus. */
export function shorResources(bits: number): {
  logicalQubits: number;
  toffoliCount: number;
  logicalDepth: number;
} {
  const n = Math.max(1, safeInt(bits, 1));
  const logicalQubits = Math.max(2, Math.ceil(LOGICAL_QUBITS_PER_BIT * n));
  const toffoliCount = Math.max(1, Math.round(TOFFOLI_PER_BIT_SQUARED * n * n));
  // Superficial parallelism is bounded by the workspace a layer can hold.
  const parallelism = Math.max(1, Math.floor(logicalQubits / 8));
  return { logicalQubits, toffoliCount, logicalDepth: Math.ceil(toffoliCount / parallelism) };
}

/** Grover oracle invocations to search a k-bit key space. */
export function groverOracleCount(bits: number): number {
  const k = clamp(bits, 1, 1024);
  // pi/4 * 2^(k/2); the exponent is halved because Grover is quadratic.
  return Math.round((Math.PI / 4) * Math.pow(2, k / 2));
}

function physicalQubits(logical: number): number {
  return Math.round(logical * PHYSICAL_QUBITS_PER_LOGICAL);
}

/** Days required to run `operations` logical gates in `year`. */
export function daysToBreak(
  operations: number,
  profile: AttackerProfile,
  year: number,
): number {
  const rate = logicalThroughput(profile, year);
  if (!Number.isFinite(operations) || operations <= 0) return 0;
  return operations / rate / SECONDS_PER_DAY;
}

function firstHarvestYear(
  operations: number,
  profile: AttackerProfile,
): number | null {
  for (let year = HORIZON_MIN; year <= HORIZON_MAX; year += 1) {
    if (daysToBreak(operations, profile, year) <= HARVEST_THRESHOLD_DAYS) return year;
  }
  return null;
}

export function estimateQuantumCost(
  algorithm: AlgorithmSpec,
  profileId: AttackerProfileId | string,
  horizonYear: number,
): QuantumCost {
  const profile = attackerProfile(profileId);
  const attack = algorithm.attack;

  if (attack === "none" || algorithm.postQuantum) {
    return {
      attack: "none",
      logicalQubits: 0,
      toffoliCount: 0,
      logicalDepth: 0,
      physicalQubits: 0,
      codeDistance: CODE_DISTANCE,
      daysToBreak: {},
      ruptureYear: Object.fromEntries(
        Object.keys(ATTACKER_PROFILES).map((key) => [key, null]),
      ),
      method: `${ENGINE_VERSION}: post-quantum primitive (${algorithm.fips ?? algorithm.family}); no Shor or Grover reduction applies, so no rupture year is modelled.`,
    };
  }

  const operations =
    attack === "shor"
      ? shorResources(algorithm.bits).toffoliCount
      : groverOracleCount(algorithm.bits) * ORACLE_GATE_EQUIVALENT;

  const logicalQubits =
    attack === "shor"
      ? shorResources(algorithm.bits).logicalQubits
      : Math.max(2, Math.ceil(algorithm.bits / 8) + 2);

  const logicalDepth =
    attack === "shor"
      ? shorResources(algorithm.bits).logicalDepth
      : Math.max(1, Math.round(operations / Math.max(1, logicalQubits)));

  const reportedYears = Array.from(
    new Set([...MILESTONE_YEARS, horizonYear]),
  ).filter((y) => y >= HORIZON_MIN && y <= HORIZON_MAX);

  const daysByYear: Record<string, number> = {};
  for (const year of reportedYears) {
    const cost = daysToBreak(operations, profile, year);
    daysByYear[String(year)] = Number.isFinite(cost) ? Number(cost.toPrecision(6)) : 0;
  }

  const ruptureYear: Record<string, number | null> = {};
  for (const key of Object.keys(ATTACKER_PROFILES)) {
    ruptureYear[key] = firstHarvestYear(operations, attackerProfile(key));
  }

  const method =
    attack === "shor"
      ? `${ENGINE_VERSION}: Shor factoring of a ${algorithm.bits}-bit modulus. Logical qubits = ceil(${LOGICAL_QUBITS_PER_BIT}*n); Toffoli = ${TOFFOLI_PER_BIT_SQUARED}*n^2; physical qubits = logical * ${PHYSICAL_QUBITS_PER_LOGICAL} at distance ${CODE_DISTANCE}. Harvest year is the first year the break costs <= ${HARVEST_THRESHOLD_DAYS} day under the profile's throughput roadmap.`
      : `${ENGINE_VERSION}: Grover preimage/key search over a ${algorithm.bits}-bit space. Oracle invocations = (pi/4)*2^(n/2), charged at ${ORACLE_GATE_EQUIVALENT} logical gates per invocation. Harvest year is the first year the break costs <= ${HARVEST_THRESHOLD_DAYS} day.`;

  return {
    attack,
    logicalQubits,
    toffoliCount: Number(operations.toPrecision(6)),
    logicalDepth,
    physicalQubits: physicalQubits(logicalQubits),
    codeDistance: CODE_DISTANCE,
    daysToBreak: daysByYear,
    ruptureYear,
    method,
  };
}

/** True when the break at `year` is cheap enough that captured traffic could be read. */
export function isHarvestedAt(
  cost: QuantumCost,
  profileId: AttackerProfileId | string,
  year: number,
): boolean {
  if (cost.attack === "none") return false;
  const profile = attackerProfile(profileId);
  const operations =
    cost.attack === "shor"
      ? cost.toffoliCount
      : cost.toffoliCount; // toffoliCount already carries oracle cost for Grover
  const days = daysToBreak(operations, profile, year);
  return days <= HARVEST_THRESHOLD_DAYS * 30;
}

/**
 * Years of confidentiality that outlive the expected break. This is the
 * harvest-now-decrypt-later exposure: data captured at `year` that must stay
 * secret for `confidentialityYears` and can be decrypted in `ruptureYear`.
 */
export function exposureYears(
  year: number,
  confidentialityYears: number,
  ruptureYear: number | null,
): number {
  if (ruptureYear === null) return 0;
  const mustStaySecretUntil = year + Math.max(0, confidentialityYears);
  return Math.max(0, mustStaySecretUntil - ruptureYear);
}

/** Total migration effort in years for one asset, from deployment and usage. */
export function migrationEffortYears(
  deployment: string,
  usage: string,
  dataClass: string,
): number {
  const deploymentYears: Record<string, number> = {
    internal: 0.6,
    "data-at-rest": 1.8,
    embedded: 2.6,
    "partner-shared": 1.6,
    internet: 1.0,
  };
  const usageYears: Record<string, number> = {
    certificate: 0.2,
    "key-establishment": 0.6,
    transport: 0.5,
    signature: 0.8,
    "data-at-rest": 0.9,
    integrity: 0.3,
  };
  const classYears: Record<string, number> = {
    public: 0,
    internal: 0.1,
    confidential: 0.3,
    regulated: 0.6,
  };
  const total =
    (deploymentYears[deployment] ?? 1) +
    (usageYears[usage] ?? 0.5) +
    (classYears[dataClass] ?? 0.3);
  return Math.round(total * 100) / 100;
}