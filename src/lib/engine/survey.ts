/**
 * Survey aggregation: totals, the seismograph trace and the strata cross-section.
 *
 * The trace is the product's signature view. At each year on the rail it asks a
 * single question: if an adversary harvested traffic today, how much of what is
 * captured would still be inside its confidentiality window once the modelled
 * break arrives? The answer only grows as the rail moves right, which is why
 * the trace reads like a recording rather than a bar chart.
 */

import type {
  CryptoAsset,
  StratumBand,
  SurveyAnalysis,
  TracePoint,
} from "../types.ts";
import { ENGINE_VERSION, HORIZON_MAX, HORIZON_MIN, resolveAlgorithm } from "../domain/registry.ts";

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

/** Minimal structural input: `CryptoAsset` satisfies this, and so does a draft. */
export interface TraceInput {
  id: string;
  status: string;
  algorithm: string;
  confidentialityYears: number;
  exposureScore: number;
  ruptureYear: number | null;
}

export function buildTrace(
  assets: TraceInput[],
  ruptureYearByAsset: Map<string, number | null>,
): TracePoint[] {
  const live = assets.filter((asset) => asset.status === "active");
  const points: TracePoint[] = [];
  for (let year = HORIZON_MIN; year <= HORIZON_MAX; year += 1) {
    let harvested = 0;
    for (const asset of live) {
      if (resolveAlgorithm(asset.algorithm).postQuantum) continue;
      const rupture = ruptureYearByAsset.get(asset.id) ?? null;
      if (rupture === null) continue;
      if (year + asset.confidentialityYears > rupture) harvested += 1;
    }
    points.push({
      year,
      harvested,
      // Share of the estate exposed, which is what the drum is recording: a
      // mean score would flatten the curve and hide the compounding.
      intensity: live.length === 0 ? 0 : round1((harvested / live.length) * 100),
    });
  }
  return points;
}

export function buildStrata(assets: CryptoAsset[]): StratumBand[] {
  const groups = new Map<string, CryptoAsset[]>();
  for (const asset of assets) {
    if (asset.status !== "active") continue;
    const list = groups.get(asset.system) ?? [];
    list.push(asset);
    groups.set(asset.system, list);
  }

  const bands: StratumBand[] = [];
  for (const [system, list] of groups) {
    let earliest: number | null = null;
    let exposureSum = 0;
    const algorithmCounts = new Map<string, number>();
    for (const asset of list) {
      if (asset.ruptureYear !== null) {
        earliest = earliest === null ? asset.ruptureYear : Math.min(earliest, asset.ruptureYear);
      }
      exposureSum += asset.exposureScore;
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
    bands.push({
      system,
      depth: 0,
      assets: list.length,
      meanExposure: Math.round((exposureSum / list.length) * 10) / 10,
      earliestRuptureYear: earliest,
      dominantAlgorithm,
    });
  }

  // Shallowest stratum = the one whose break arrives first.
  bands.sort((a, b) => {
    const ay = a.earliestRuptureYear ?? 9999;
    const by = b.earliestRuptureYear ?? 9999;
    if (ay !== by) return ay - by;
    if (b.meanExposure !== a.meanExposure) return b.meanExposure - a.meanExposure;
    return a.system.localeCompare(b.system);
  });
  bands.forEach((band, index) => {
    band.depth = index;
  });
  return bands;
}

export function buildTotals(assets: CryptoAsset[]) {
  const live = assets.filter((asset) => asset.status === "active");
  let critical = 0;
  let urgent = 0;
  let exposureSum = 0;
  let earliest: number | null = null;
  for (const asset of live) {
    if (asset.exposureBand === "critical") critical += 1;
    if (asset.exposureBand === "urgent") urgent += 1;
    exposureSum += asset.exposureScore;
    if (asset.ruptureYear !== null) {
      earliest = earliest === null ? asset.ruptureYear : Math.min(earliest, asset.ruptureYear);
    }
  }
  return {
    assets: assets.length,
    active: live.length,
    retired: assets.length - live.length,
    critical,
    urgent,
    meanExposure: live.length === 0 ? 0 : Math.round((exposureSum / live.length) * 10) / 10,
    earliestRuptureYear: earliest,
  };
}

export function buildSurveyAnalysis(
  assets: CryptoAsset[],
  options: { horizonYear: number; regimeId: string; waves: SurveyAnalysis["waves"] },
): SurveyAnalysis {
  const ruptureYearByAsset = new Map<string, number | null>();
  for (const asset of assets) ruptureYearByAsset.set(asset.id, asset.ruptureYear);

  return {
    engineVersion: ENGINE_VERSION,
    horizonYear: options.horizonYear,
    regimeId: options.regimeId,
    totals: buildTotals(assets),
    waves: options.waves,
    trace: buildTrace(assets, ruptureYearByAsset),
    strata: buildStrata(assets),
    generatedAt: new Date().toISOString(),
  };
}
