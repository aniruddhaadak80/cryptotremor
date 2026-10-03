"use client";

import { useId, useMemo } from "react";

export interface TracePoint {
  year: number;
  intensity: number;
  harvested: number;
}

/**
 * The signature view: a seismograph drum recording the estate.
 *
 * The trace is not decoration. Each point is the real modelled exposure at that
 * year, computed by the same engine module the API uses, so dragging the year
 * rail redraws a genuinely different measurement. The pen stroke is a CSS
 * animation on a normalized `pathLength`, so it is disabled automatically when
 * the visitor prefers reduced motion and needs no JavaScript to run.
 */
export function SeismographTrace({
  points,
  horizonYear,
  onSelectYear,
  activeYear,
  className = "",
  height = 200,
}: {
  points: TracePoint[];
  horizonYear: number;
  onSelectYear?: (year: number) => void;
  activeYear?: number;
  className?: string;
  height?: number;
}) {
  const gradientId = useId();
  const clipId = useId();

  const geometry = useMemo(() => {
    const width = 1000;
    const padTop = 14;
    const padBottom = 22;
    const usable = Math.max(1, height - padTop - padBottom);
    if (points.length === 0) return { line: "", area: "", maxYear: horizonYear, minYear: horizonYear };
    const minYear = points[0].year;
    const maxYear = points[points.length - 1].year;
    const span = Math.max(1, maxYear - minYear);
    const x = (year: number) => ((year - minYear) / span) * width;
    const y = (intensity: number) => padTop + usable - (Math.min(100, Math.max(0, intensity)) / 100) * usable;

    const coords = points.map((point) => `${x(point.year).toFixed(2)},${y(point.intensity).toFixed(2)}`);
    // Smooth the polyline into a Catmull-Rom-ish curve so the trace reads as a
    // pen stroke rather than a bar chart.
    let line = `M ${coords[0]}`;
    for (let i = 1; i < coords.length; i += 1) {
      const [px, py] = coords[i - 1].split(",").map(Number);
      const [cx, cy] = coords[i].split(",").map(Number);
      const mx = (px + cx) / 2;
      line += ` C ${mx.toFixed(2)},${py.toFixed(2)} ${mx.toFixed(2)},${cy.toFixed(2)} ${cx.toFixed(2)},${cy.toFixed(2)}`;
    }
    const area = `${line} L ${width},${height - padBottom} L 0,${height - padBottom} Z`;
    return { line, area, maxYear, minYear, x, y };
  }, [points, height, horizonYear]);

  const horizonX =
    points.length > 1
      ? ((Math.min(Math.max(horizonYear, points[0].year), points[points.length - 1].year) - points[0].year) /
          Math.max(1, points[points.length - 1].year - points[0].year)) *
        1000
      : null;

  const activePoint = activeYear
    ? points.find((point) => point.year === activeYear)
    : undefined;

  return (
    <figure className={`slab-raised relative overflow-hidden ${className}`.trim()}>
      <svg
        viewBox={`0 0 1000 ${height}`}
        className="block w-full"
        style={{ height }}
        role="img"
        aria-label={`Harvest exposure trace from ${points[0]?.year ?? ""} to ${points[points.length - 1]?.year ?? ""}, reaching ${Math.max(...points.map((point) => point.intensity), 0)} percent of the estate exposed`}
      >
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="var(--color-verd-500)" />
            <stop offset="55%" stopColor="var(--color-copper-400)" />
            <stop offset="100%" stopColor="var(--color-hazard-400)" />
          </linearGradient>
          <linearGradient id={clipId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--color-copper-500)" stopOpacity="0.28" />
            <stop offset="100%" stopColor="var(--color-copper-500)" stopOpacity="0.02" />
          </linearGradient>
        </defs>

        {[0.25, 0.5, 0.75].map((fraction) => (
          <line
            key={fraction}
            x1="0"
            x2="1000"
            y1={height * fraction}
            y2={height * fraction}
            stroke="var(--color-contour)"
            strokeWidth="1"
            strokeDasharray="3 7"
          />
        ))}

        {points.length > 0 ? (
          <>
            <path d={geometry.area} fill={`url(#${clipId})`} />
            <path
              d={geometry.line}
              pathLength={1}
              fill="none"
              stroke={`url(#${gradientId})`}
              strokeWidth="2.4"
              strokeLinecap="round"
              className="trace-line"
              style={{ animationDelay: "120ms" }}
            />
          </>
        ) : (
          <text x="500" y={height / 2} textAnchor="middle" className="fill-ash-500 font-data text-sm">
            no recorded estate yet
          </text>
        )}

        {horizonX !== null && onSelectYear ? (
          <g>
            <line
              x1={horizonX}
              x2={horizonX}
              y1={10}
              y2={height - 18}
              stroke="var(--color-hazard-400)"
              strokeWidth="1.4"
            />
            <circle cx={horizonX} cy={14} r="3.5" fill="var(--color-hazard-400)" />
          </g>
        ) : null}

        {onSelectYear
          ? points.map((point) => (
              <g key={point.year}>
                <rect
                  x={
                    points.length > 1
                      ? ((point.year - points[0].year) /
                          Math.max(1, points[points.length - 1].year - points[0].year)) *
                          1000 -
                        12
                      : 0
                  }
                  y={0}
                  width={24}
                  height={height}
                  fill="transparent"
                  onClick={() => onSelectYear(point.year)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      onSelectYear(point.year);
                    }
                  }}
                  tabIndex={0}
                  role="button"
                  aria-label={`Set horizon to ${point.year}: ${point.harvested} assets exposed, ${point.intensity} percent of the estate`}
                  className="cursor-pointer outline-none"
                />
              </g>
            ))
          : null}
      </svg>

      <figcaption className="flex flex-wrap items-center justify-between gap-2 border-t border-basalt-700 px-3 py-2">
        <span className="label">
          {points.length > 0 ? `${points[0].year} → ${points[points.length - 1].year}` : "no data"}
        </span>
        {activePoint ? (
          <span className="tabular text-xs text-ash-300">
            {activeYear}: {activePoint.harvested} exposed · intensity {activePoint.intensity}
          </span>
        ) : (
          <span className="tabular text-xs text-ash-500">hover or click a year</span>
        )}
      </figcaption>
    </figure>
  );
}