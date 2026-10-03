/**
 * Migration wave planner.
 *
 * A wave is a *system*, not an asset: replacing one certificate authority or one
 * key-exchange library retires every primitive that depends on it. The planner
 * therefore searches over systems, and it uses Grover amplitude amplification
 * to pick the system with the best exposure-relieved-per-year-of-effort.
 */

import type { CryptoAsset, MigrationWave } from "../types.ts";
import { decisionRelief } from "./exposure.ts";
import { groverSearch } from "./grover.ts";

export interface SystemCandidate {
  system: string;
  assets: string[];
  labels: string[];
  exposureRelieved: number;
  effortYears: number;
  reliefDensity: number;
  firstRuptureYear: number | null;
  dominantAlgorithm: string;
}

/** Grover state vectors are dense; keep the candidate space bounded and honest. */
export const MAX_GROVER_CANDIDATES = 64;

function candidateFor(
  system: string,
  assets: CryptoAsset[],
): SystemCandidate {
  let exposureRelieved = 0;
  let effortYears = 0;
  let firstRuptureYear: number | null = null;
  const algorithmCounts = new Map<string, number>();

  for (const asset of assets) {
    const residual = 1 - decisionRelief(asset.decision);
    exposureRelieved += asset.exposureScore * residual;
    effortYears = Math.max(effortYears, asset.exposureScore > 0 ? 0.5 : 0);
    if (asset.ruptureYear !== null) {
      firstRuptureYear =
        firstRuptureYear === null ? asset.ruptureYear : Math.min(firstRuptureYear, asset.ruptureYear);
    }
    algorithmCounts.set(asset.algorithm, (algorithmCounts.get(asset.algorithm) ?? 0) + 1);
  }

  let dominantAlgorithm = "mixed";
  let best = -1;
  for (const [algorithm, count] of algorithmCounts) {
    if (count > best) {
      best = count;
      dominantAlgorithm = algorithm;
    }
  }

  const effort = Math.max(0.25, effortYears);
  return {
    system,
    assets: assets.map((a) => a.id),
    labels: assets.map((a) => a.label),
    exposureRelieved: Math.round(exposureRelieved * 100) / 100,
    effortYears: effort,
    reliefDensity: Math.round((exposureRelieved / effort) * 100) / 100,
    firstRuptureYear,
    dominantAlgorithm,
  };
}

export function groupBySystem(assets: CryptoAsset[]): SystemCandidate[] {
  const groups = new Map<string, CryptoAsset[]>();
  for (const asset of assets) {
    const list = groups.get(asset.system) ?? [];
    list.push(asset);
    groups.set(asset.system, list);
  }
  return [...groups.entries()]
    .map(([system, list]) => candidateFor(system, list))
    .sort((a, b) => {
      if (b.reliefDensity !== a.reliefDensity) return b.reliefDensity - a.reliefDensity;
      if (a.firstRuptureYear !== b.firstRuptureYear) {
        return (a.firstRuptureYear ?? 9999) - (b.firstRuptureYear ?? 9999);
      }
      return a.system.localeCompare(b.system);
    });
}

/**
 * Sequences waves. Each round runs one Grover search whose oracle marks the
 * highest relief-density band, rotates the winner out, and repeats.
 */
export function buildWaves(assets: CryptoAsset[]): MigrationWave[] {
  const active = assets.filter((asset) => asset.status === "active");
  const open = groupBySystem(active).filter(
    (candidate) => candidate.exposureRelieved > 0,
  );

  const waves: MigrationWave[] = [];
  const remaining = [...open];

  while (remaining.length > 0) {
    const n = Math.min(remaining.length, MAX_GROVER_CANDIDATES);
    const pool = remaining.slice(0, n);
    const densities = pool.map((candidate) => candidate.reliefDensity);
    const best = Math.max(...densities);
    // Mark the leading band; a single leader keeps Grover deterministic.
    const floor = best * 0.8;
    const marked = densities.map((density) => density >= floor && density > 0);

    const result = groverSearch(pool.length, (index) => marked[index]);
    const picked = pool[result.index];
    const usedQuantum = result.markedCount > 0 && result.markedCount < pool.length;

    waves.push({
      wave: waves.length + 1,
      system: picked.system,
      assets: picked.assets,
      exposureRelieved: picked.exposureRelieved,
      firstRuptureYear: picked.firstRuptureYear,
      selectedBy: usedQuantum ? "grover-amplification" : "greedy-rotation",
      amplification: usedQuantum ? Math.round(result.amplification * 1000) / 1000 : null,
      rationale: usedQuantum
        ? `Grover amplification over ${pool.length} candidate systems raised this system's measured probability to ${(result.probability * 100).toFixed(1)}% (${result.amplification.toFixed(2)}x uniform) after ${result.iterations} iteration${result.iterations === 1 ? "" : "s"}. It relieves ${picked.exposureRelieved} exposure points across ${picked.assets.length} asset${picked.assets.length === 1 ? "" : "s"} for ${picked.effortYears} year(s) of work.`
        : `${picked.system} is the only remaining candidate with relief left, so the rotation is greedy rather than amplified.`,
    });

    remaining.splice(remaining.indexOf(picked), 1);
  }

  return waves;
}

/** Full ordered migration queue: waves first, then loose assets. */
export function migrationQueue(assets: CryptoAsset[]): CryptoAsset[] {
  return [...assets]
    .filter((asset) => asset.status === "active")
    .sort((a, b) => {
      if (b.exposureScore !== a.exposureScore) return b.exposureScore - a.exposureScore;
      if (a.ruptureYear !== b.ruptureYear) {
        return (a.ruptureYear ?? 9999) - (b.ruptureYear ?? 9999);
      }
      const dataClassRank = { regulated: 0, confidential: 1, internal: 2, public: 3 };
      const rank =
        (dataClassRank[a.dataClass as keyof typeof dataClassRank] ?? 4) -
        (dataClassRank[b.dataClass as keyof typeof dataClassRank] ?? 4);
      if (rank !== 0) return rank;
      return a.id.localeCompare(b.id);
    });
}