/**
 * Cryptographic registry and compliance reference data.
 *
 * Every entry is either a standardized algorithm (NIST FIPS / RFC) or a
 * published policy milestone. Sources are named per entry so the UI and the
 * exported report can attribute them.
 */

import type {
  AlgorithmSpec,
  AttackerProfile,
  ComplianceRegime,
  DataClass,
  Deployment,
  MigrationDecision,
  Usage,
} from "../types.ts";

export const ENGINE_VERSION = "pq-survey-v1.0.0";

export const ALGORITHMS: readonly AlgorithmSpec[] = [
  {
    id: "RSA-1024",
    label: "RSA 1024-bit",
    family: "rsa",
    bits: 1024,
    classicalStrength: 80,
    attack: "shor",
    postQuantum: false,
    migrationTarget: "ML-KEM-768 (FIPS 203)",
    note: "Below the NIST SP 800-57 floor of 112 bits and already factorable in practice.",
  },
  {
    id: "RSA-2048",
    label: "RSA 2048-bit",
    family: "rsa",
    bits: 2048,
    classicalStrength: 112,
    attack: "shor",
    postQuantum: false,
    migrationTarget: "ML-KEM-768 (FIPS 203)",
    note: "The most widely deployed public-key size. Shor-broken in a cryptographically relevant timeframe.",
  },
  {
    id: "RSA-3072",
    label: "RSA 3072-bit",
    family: "rsa",
    bits: 3072,
    classicalStrength: 128,
    attack: "shor",
    postQuantum: false,
    migrationTarget: "ML-KEM-768 (FIPS 203)",
    note: "Marginally above the NIST 112-bit floor; quantum cost grows superlinearly.",
  },
  {
    id: "RSA-4096",
    label: "RSA 4096-bit",
    family: "rsa",
    bits: 4096,
    classicalStrength: 152,
    attack: "shor",
    postQuantum: false,
    migrationTarget: "ML-KEM-1024 (FIPS 203)",
    note: "Largest common RSA modulus; the most expensive classical size to attack and quantum alike.",
  },
  {
    id: "ECDSA-P256",
    label: "ECDSA NIST P-256",
    family: "elliptic-curve",
    bits: 256,
    classicalStrength: 128,
    attack: "shor",
    postQuantum: false,
    migrationTarget: "ML-DSA-65 (FIPS 204)",
    note: "Curve25519/P-256 discrete logs are Shor-broken; no ECC curve is quantum safe.",
  },
  {
    id: "ECDSA-P384",
    label: "ECDSA NIST P-384",
    family: "elliptic-curve",
    bits: 384,
    classicalStrength: 192,
    attack: "shor",
    postQuantum: false,
    migrationTarget: "ML-DSA-87 (FIPS 204)",
    note: "Common in TLS 1.3 certificate chains and code signing roots.",
  },
  {
    id: "Ed25519",
    label: "Ed25519",
    family: "elliptic-curve",
    bits: 256,
    classicalStrength: 128,
    attack: "shor",
    postQuantum: false,
    migrationTarget: "ML-DSA-65 (FIPS 204)",
    note: "Fast and common for SSH and code signing; still Shor-broken.",
  },
  {
    id: "X25519",
    label: "X25519 key agreement",
    family: "elliptic-curve",
    bits: 255,
    classicalStrength: 128,
    attack: "shor",
    postQuantum: false,
    migrationTarget: "ML-KEM-768 (FIPS 203)",
    note: "Default TLS 1.3 key exchange group alongside P-256.",
  },
  {
    id: "DH-2048",
    label: "Diffie-Hellman 2048-bit (finite field)",
    family: "finite-field",
    bits: 2048,
    classicalStrength: 112,
    attack: "shor",
    postQuantum: false,
    migrationTarget: "ML-KEM-768 (FIPS 203)",
    note: "Legacy TLS and SFTP key exchange; index calculus and Shor both apply.",
  },
  {
    id: "AES-128-GCM",
    label: "AES-128-GCM",
    family: "symmetric",
    bits: 128,
    classicalStrength: 128,
    attack: "grover",
    postQuantum: false,
    migrationTarget: "AES-256-GCM",
    note: "Grover halves the effective security of symmetric primitives to their key length.",
  },
  {
    id: "AES-256-GCM",
    label: "AES-256-GCM",
    family: "symmetric",
    bits: 256,
    classicalStrength: 256,
    attack: "grover",
    postQuantum: false,
    migrationTarget: "AES-256-GCM (retain)",
    note: "Retains 128-bit security against Grover; normally kept as-is.",
  },
  {
    id: "CHACHA20-POLY1305",
    label: "ChaCha20-Poly1305",
    family: "symmetric",
    bits: 256,
    classicalStrength: 256,
    attack: "grover",
    postQuantum: false,
    migrationTarget: "ChaCha20-Poly1305 (retain)",
    note: "Software-optimized AEAD; Grover-resistant at 256-bit keys.",
  },
  {
    id: "SHA-1",
    label: "SHA-1",
    family: "hash",
    bits: 160,
    classicalStrength: 0,
    attack: "grover",
    postQuantum: false,
    migrationTarget: "SHA-256",
    note: "Collision attacks are practical today; quantum resistance is irrelevant until it is replaced.",
  },
  {
    id: "SHA-256",
    label: "SHA-256",
    family: "hash",
    bits: 256,
    classicalStrength: 256,
    attack: "grover",
    postQuantum: false,
    migrationTarget: "SHA-256 (retain)",
    note: "256-bit preimage resistance falls to 128 bits under Grover, which remains ample.",
  },
  {
    id: "SHA-512",
    label: "SHA-512",
    family: "hash",
    bits: 512,
    classicalStrength: 256,
    attack: "grover",
    postQuantum: false,
    migrationTarget: "SHA-512 (retain)",
    note: "Wide-pipe hash retained for signatures and long-lived digests.",
  },
  {
    id: "ML-KEM-768",
    label: "ML-KEM-768",
    family: "lattice",
    bits: 768,
    classicalStrength: 192,
    attack: "none",
    postQuantum: true,
    fips: "FIPS 203",
    migrationTarget: "Deployed",
    note: "Module-Lattice-Based Key-Encapsulation Mechanism, NIST PQC standard 1 of 3.",
  },
  {
    id: "ML-KEM-1024",
    label: "ML-KEM-1024",
    family: "lattice",
    bits: 1024,
    classicalStrength: 256,
    attack: "none",
    postQuantum: true,
    fips: "FIPS 203",
    migrationTarget: "Deployed",
    note: "Highest security category of FIPS 203.",
  },
  {
    id: "ML-DSA-65",
    label: "ML-DSA-65",
    family: "lattice",
    bits: 3309,
    classicalStrength: 192,
    attack: "none",
    postQuantum: true,
    fips: "FIPS 204",
    migrationTarget: "Deployed",
    note: "Module-Lattice-Based Digital Signature Algorithm, NIST PQC standard 2 of 3.",
  },
  {
    id: "ML-DSA-87",
    label: "ML-DSA-87",
    family: "lattice",
    bits: 4627,
    classicalStrength: 256,
    attack: "none",
    postQuantum: true,
    fips: "FIPS 204",
    migrationTarget: "Deployed",
    note: "Largest FIPS 204 signature category.",
  },
  {
    id: "SLH-DSA-65",
    label: "SLH-DSA-65",
    family: "hash-based",
    bits: 65,
    classicalStrength: 192,
    attack: "none",
    postQuantum: true,
    fips: "FIPS 205",
    migrationTarget: "Deployed",
    note: "Stateless hash-based signature; security from preimage resistance rather than lattice problems.",
  },
  {
    id: "HQC-128",
    label: "HQC-128",
    family: "code-based",
    bits: 128,
    classicalStrength: 128,
    attack: "none",
    postQuantum: true,
    migrationTarget: "Backup KEM under standardization",
    note: "Selected by NIST in March 2025 as a backup key-encapsulation mechanism.",
  },
] as const;

export const ALGORITHM_IDS: readonly string[] = ALGORITHMS.map((a) => a.id);

/** Lookups are case-insensitive so manifests are not hostage to capitalisation. */
const ALGORITHM_INDEX = new Map<string, AlgorithmSpec>(
  ALGORITHMS.map((spec) => [spec.id, spec]),
);
const ALGORITHM_INDEX_FOLDED = new Map<string, AlgorithmSpec>(
  ALGORITHMS.map((spec) => [spec.id.toLowerCase(), spec]),
);

export function canonicalAlgorithmId(id: string): string | null {
  return ALGORITHM_INDEX_FOLDED.get(id.trim().toLowerCase())?.id ?? null;
}

export function getAlgorithm(id: string): AlgorithmSpec | undefined {
  return ALGORITHM_INDEX.get(id) ?? ALGORITHM_INDEX_FOLDED.get(id.trim().toLowerCase());
}

/** Unknown algorithms degrade gracefully instead of throwing. */
export function resolveAlgorithm(id: string): AlgorithmSpec {
  return (
    getAlgorithm(id) ?? {
      id: id.slice(0, 64) || "UNKNOWN",
      label: id.slice(0, 64) || "Unknown algorithm",
      family: "other" as AlgorithmSpec["family"],
      bits: 0,
      classicalStrength: 0,
      attack: "none",
      postQuantum: false,
      migrationTarget: "Replace with an FIPS 203/204/205 primitive",
      note: "Not in the registry. Treated as unclassified until corrected.",
    }
  );
}

export const USAGES: readonly Usage[] = [
  "key-establishment",
  "signature",
  "certificate",
  "data-at-rest",
  "transport",
  "integrity",
];

export const DEPLOYMENTS: readonly Deployment[] = [
  "internet",
  "partner-shared",
  "internal",
  "embedded",
  "data-at-rest",
];

export const DATA_CLASSES: readonly DataClass[] = [
  "public",
  "internal",
  "confidential",
  "regulated",
];

export const DECISIONS: readonly MigrationDecision[] = [
  "none",
  "accept",
  "schedule",
  "migrating",
  "migrated",
  "retire",
];

export const DATA_CLASS_WEIGHT: Record<DataClass, number> = {
  public: 0.05,
  internal: 0.3,
  confidential: 0.7,
  regulated: 0.95,
};

export const DEPLOYMENT_WEIGHT: Record<Deployment, number> = {
  internal: 0.25,
  "data-at-rest": 0.5,
  embedded: 0.55,
  "partner-shared": 0.8,
  internet: 0.95,
};

/** Share of the total exposure a migration must address before it counts as a wave. */
export const DECISION_RELIEF: Record<MigrationDecision, number> = {
  none: 0,
  accept: 0.15,
  schedule: 0.35,
  migrating: 0.7,
  migrated: 1,
  retire: 1,
};

/**
 * Attacker roadmaps.
 *
 * `baseLogicalGatesPerSecond` is the sustained logical throughput assumed for a
 * first fault-tolerant machine capable of running a break continuously in 2026.
 * It is deliberately far below the idealized rate implied by published factoring
 * estimates: Gidney's 2025 estimate for factoring RSA-2048 in about a week with
 * ~1M noisy qubits works out to roughly 278 logical gate evaluations per second
 * at that scale, so even the aggressive scenario here is more than an order of
 * magnitude slower than that projection.
 *
 * No cryptographically relevant quantum computer exists, so the year at which a
 * break costs less than a day is a scenario rather than a forecast. That is why
 * three are reported side by side and why the compliance clock — not the
 * capability date — usually binds first.
 */
export const ATTACKER_PROFILES: Record<string, AttackerProfile> = {
  conservative: {
    id: "conservative",
    label: "Conservative (2.0y doubling)",
    baseLogicalGatesPerSecond: 4,
    baseYear: 2026,
    doublingYears: 2.0,
    rationale:
      "Public estimates put a cryptographically relevant quantum computer anywhere from a near-term 2030 prospect to a 15-20 year horizon, so logical throughput is assumed to double only every two years from a low base.",
  },
  expected: {
    id: "expected",
    label: "Expected (1.4y doubling)",
    baseLogicalGatesPerSecond: 8,
    baseYear: 2026,
    doublingYears: 1.4,
    rationale:
      "Midpoint between the conservative and aggressive projections: error correction and logical clock rates improve somewhat faster than the conservative case.",
  },
  aggressive: {
    id: "aggressive",
    label: "Aggressive (1.0y doubling)",
    baseLogicalGatesPerSecond: 20,
    baseYear: 2026,
    doublingYears: 1.0,
    rationale:
      "Upper bound used by red teams: logical throughput doubles every year, roughly the pace of the last two decades of physical qubit-count growth.",
  },
};

export const DEFAULT_ATTACKER_PROFILE = "expected";

/** Survey settings every fresh session starts with. */
export interface SurveySettings {
  horizonYear: number;
  regimeId: string;
  attackerProfile: string;
}

export const HORIZON_MIN = 2026;
export const HORIZON_MAX = 2045;

export const COMPLIANCE_REGIMES: readonly ComplianceRegime[] = [
  {
    id: "nist-ir-8547",
    label: "NIST IR 8547 transition timeline",
    authority: "NIST",
    summary:
      "Quantum-vulnerable algorithms deprecated after 2030 and disallowed after 2035. Applies to all FIPS-approved uses.",
    citation: "NIST IR 8547 ipd, Transition to Post-Quantum Cryptography Standards (Nov 2024)",
    milestones: [
      {
        id: "nist-deprecate",
        label: "Quantum-vulnerable algorithms deprecated",
        year: 2030,
        appliesTo: [
          "key-establishment",
          "signature",
          "certificate",
          "data-at-rest",
          "transport",
          "integrity",
        ],
        citation: "NIST IR 8547 ipd",
      },
      {
        id: "nist-disallow",
        label: "Quantum-vulnerable algorithms disallowed",
        year: 2035,
        appliesTo: [
          "key-establishment",
          "signature",
          "certificate",
          "data-at-rest",
          "transport",
          "integrity",
        ],
        citation: "NIST IR 8547 ipd",
      },
    ],
  },
  {
    id: "eo-14412",
    label: "US Executive Order 14412 / OMB M-26-15",
    authority: "The White House / OMB",
    summary:
      "High-value assets and high-impact systems move to post-quantum key establishment by end of 2030 and signatures by end of 2031.",
    citation: "Executive Order 14412, Securing the Nation Against Advanced Cryptographic Attacks (22 Jun 2026); OMB M-26-15",
    milestones: [
      {
        id: "eo-ke",
        label: "High-value assets: post-quantum key establishment",
        year: 2030,
        appliesTo: ["key-establishment", "certificate", "transport"],
        citation: "EO 14412 / OMB M-26-15",
      },
      {
        id: "eo-sig",
        label: "High-impact systems: post-quantum signatures",
        year: 2031,
        appliesTo: ["signature", "certificate", "integrity"],
        citation: "EO 14412 / OMB M-26-15",
      },
      {
        id: "eo-full",
        label: "Remaining systems migrated",
        year: 2035,
        appliesTo: [
          "key-establishment",
          "signature",
          "certificate",
          "data-at-rest",
          "transport",
          "integrity",
        ],
        citation: "OMB M-26-15",
      },
    ],
  },
  {
    id: "cnsa-2",
    label: "CNSA 2.0 (NSA)",
    authority: "NSA",
    summary:
      "Software and firmware signing on PQC by 2025, preferred by 2030, required for new systems by 2033.",
    citation: "NSA Commercial National Security Algorithm Suite 2.0 FAQ (updated Dec 2024)",
    milestones: [
      {
        id: "cnsa-sign-now",
        label: "Software and firmware signing on PQC",
        year: 2025,
        appliesTo: ["signature", "certificate"],
        citation: "CNSA 2.0 FAQ",
      },
      {
        id: "cnsa-preferred",
        label: "PQC preferred",
        year: 2030,
        appliesTo: ["key-establishment", "signature", "certificate", "transport"],
        citation: "CNSA 2.0 FAQ",
      },
      {
        id: "cnsa-required",
        label: "PQC required for new systems",
        year: 2033,
        appliesTo: [
          "key-establishment",
          "signature",
          "certificate",
          "data-at-rest",
          "transport",
          "integrity",
        ],
        citation: "CNSA 2.0 FAQ",
      },
    ],
  },
  {
    id: "uk-ncsc",
    label: "UK NCSC roadmap",
    authority: "UK NCSC",
    summary:
      "Discovery by 2028, priority systems by 2031, full migration by 2035.",
    citation: "UK NCSC, Timelines for migration to post-quantum cryptography",
    milestones: [
      {
        id: "ncsc-discovery",
        label: "Complete discovery",
        year: 2028,
        appliesTo: [
          "key-establishment",
          "signature",
          "certificate",
          "data-at-rest",
          "transport",
          "integrity",
        ],
        citation: "UK NCSC roadmap",
      },
      {
        id: "ncsc-priority",
        label: "Priority systems migrated",
        year: 2031,
        appliesTo: ["key-establishment", "signature", "certificate", "transport"],
        citation: "UK NCSC roadmap",
      },
      {
        id: "ncsc-full",
        label: "Full migration",
        year: 2035,
        appliesTo: [
          "key-establishment",
          "signature",
          "certificate",
          "data-at-rest",
          "transport",
          "integrity",
        ],
        citation: "UK NCSC roadmap",
      },
    ],
  },
];

export const DEFAULT_REGIME = "nist-ir-8547";

export const DEFAULT_SETTINGS: SurveySettings = {
  horizonYear: HORIZON_MIN,
  regimeId: DEFAULT_REGIME,
  attackerProfile: DEFAULT_ATTACKER_PROFILE,
};

export function getRegime(id: string): ComplianceRegime {
  return (
    COMPLIANCE_REGIMES.find((r) => r.id === id) ??
    (COMPLIANCE_REGIMES.find((r) => r.id === DEFAULT_REGIME) as ComplianceRegime)
  );
}

/** Manifest columns accepted by the importer. */
export const MANIFEST_COLUMNS = [
  "label",
  "system",
  "usage",
  "algorithm",
  "deployment",
  "confidentialityYears",
  "dataClass",
  "ownerTeam",
  "notes",
  "cve",
] as const;

export const MANIFEST_TEMPLATE = [
  "label,system,usage,algorithm,deployment,confidentialityYears,dataClass,ownerTeam,notes,cve",
  "Payments API TLS certificate,payments-gateway,certificate,RSA-2048,partner-shared,7,regulated,platform,\"customer payment flows, 10y retention\",",
  "Partner SFTP key exchange,partner-sftp,key-establishment,DH-2048,partner-shared,10,confidential,integrations,\"quarterly partner statement transfer\",",
  "Data lake envelope encryption,data-lake,data-at-rest,AES-256-GCM,data-at-rest,12,regulated,data-platform,\"column-level keys in KMS\",",
  "Mobile app pinning cert,mobile,certificate,ECDSA-P256,internet,5,internal,mobile,\"issued by internal CA\",",
  "Okta OIDC signing key,identity,signature,Ed25519,internal,5,internal,identity,\"SSO session signing\",",
  "Release signing key,ci,signature,RSA-4096,internal,7,internal,platform,\"notarized binaries\",CVE-2021-44228",
].join("\n");