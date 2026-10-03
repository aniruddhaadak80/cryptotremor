import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowRight,
  Binary,
  Fingerprint,
  Radio,
  ShieldCheck,
  Timer,
  Waves,
} from "lucide-react";
import { EstateIntake } from "@/components/estate-intake";
import { GitHubLink } from "@/components/github-link";
import { SeismographTrace } from "@/components/seismograph-trace";
import {
  DEFAULT_SETTINGS,
  MANIFEST_TEMPLATE,
  buildTrace,
  estimateQuantumCost,
  getAlgorithm,
  getRegime,
  scoreAsset,
} from "@/lib/engine/index";
import { fetchStrata } from "@/lib/feed/strata";
import { parseManifest } from "@/lib/validate";
import type { CryptoAsset, TracePoint } from "@/lib/types";
import { SAFETY_DISCLAIMER } from "@/lib/report";
import { SITE } from "@/lib/config/site";

export const metadata: Metadata = {
  title: `${SITE.name} — ${SITE.tagline}`,
  description: SITE.description,
  alternates: { canonical: SITE.liveUrl },
};

export const dynamic = "force-dynamic";

const regime = getRegime(DEFAULT_SETTINGS.regimeId);

/** The reference estate, scored by the real engine at build time. */
function referenceReading(): { trace: TracePoint[]; count: number; peak: number; earliest: number | null } {
  const parsed = parseManifest(MANIFEST_TEMPLATE);
  const assets: CryptoAsset[] = parsed.drafts.map((draft, index) => {
    const exposure = scoreAsset({
      ...draft,
      decision: "none",
      horizonYear: DEFAULT_SETTINGS.horizonYear,
      regime,
      attackerProfile: DEFAULT_SETTINGS.attackerProfile,
    });
    return {
      id: `ref-${index}`,
      ownerScope: "reference",
      label: draft.label,
      system: draft.system,
      usage: draft.usage,
      algorithm: draft.algorithm,
      bits: getAlgorithm(draft.algorithm)?.bits ?? 0,
      deployment: draft.deployment,
      confidentialityYears: draft.confidentialityYears,
      dataClass: draft.dataClass,
      ownerTeam: draft.ownerTeam,
      notes: draft.notes,
      cve: draft.cve ?? null,
      decision: "none",
      decisionNote: "",
      decidedAt: null,
      status: "active",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
      exposureScore: exposure.score,
      exposureBand: exposure.band,
      ruptureYear: exposure.quantum.ruptureYear[exposure.ruptureYearProfile] ?? null,
      seal: null,
    };
  });
  const trace = buildTrace(assets, new Map(assets.map((a) => [a.id, a.ruptureYear])));
  const years = assets.map((a) => a.ruptureYear).filter((year): year is number => year !== null);
  return {
    trace,
    count: assets.length,
    peak: Math.max(...trace.map((point) => point.intensity), 0),
    earliest: years.length > 0 ? Math.min(...years) : null,
  };
}

function costRow(algorithmId: string) {
  const spec = getAlgorithm(algorithmId);
  if (!spec) return null;
  const cost = estimateQuantumCost(spec, DEFAULT_SETTINGS.attackerProfile, DEFAULT_SETTINGS.horizonYear);
  return { spec, cost };
}

export default function LandingPage() {
  const reference = referenceReading();
  const rsa = costRow("RSA-2048");
  const ecdsa = costRow("ECDSA-P256");
  const aes = costRow("AES-256-GCM");
  const kem = costRow("ML-KEM-768");

  return (
    <div className="mx-auto w-full max-w-6xl px-4 pb-16 pt-12 sm:px-6 sm:pt-16">
      <section className="grid gap-10 lg:grid-cols-[1.05fr_1fr] lg:gap-14">
        <div>
          <p className="label inline-flex items-center gap-2">
            <Radio className="h-3.5 w-3.5 text-verd-400" aria-hidden="true" />
            harvest-now-decrypt-later survey instrument
          </p>
          <h1 className="mt-4 text-4xl font-semibold leading-[1.05] tracking-tight sm:text-5xl">
            Your cryptography has a
            <span className="block text-copper-400">rupture date.</span>
            Find it before someone else does.
          </h1>
          <p className="mt-5 max-w-xl text-base leading-relaxed text-ash-300">
            RSA and elliptic-curve keys are not &quot;going to break someday&quot; — an adversary can
            harvest the traffic now and read it once a cryptographically relevant quantum computer
            exists. What breaks first is not the newest key; it is the{" "}
            <span className="text-copper-300">data with the longest confidentiality lifetime</span>.
            Cryptotremor surveys your manifest against real Shor and Grover resource estimates,
            sequences the migration, and hands your partners a report they can verify.
          </p>

          <div className="mt-7 flex flex-wrap items-center gap-3">
            <Link href="#intake" className="btn btn-primary">
              Start the survey
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </Link>
            <Link href="/seismograph" className="btn btn-secondary">
              Open the seismograph
            </Link>
            <GitHubLink variant="ghost" label="Star on GitHub" />
          </div>

          <dl className="mt-8 grid max-w-lg grid-cols-2 gap-x-6 gap-y-4 border-t border-basalt-700 pt-6 sm:grid-cols-4">
            <div>
              <dt className="label">Engine</dt>
              <dd className="tabular mt-1 text-sm text-ash-200">SHA-384 sealed</dd>
            </div>
            <div>
              <dt className="label">Attack model</dt>
              <dd className="tabular mt-1 text-sm text-ash-200">Shor + Grover</dd>
            </div>
            <div>
              <dt className="label">Deadline clock</dt>
              <dd className="tabular mt-1 text-sm text-ash-200">{regime.milestones[0]?.year} / 2035</dd>
            </div>
            <div>
              <dt className="label">Agent tools</dt>
              <dd className="tabular mt-1 text-sm text-ash-200">10 MCP tools</dd>
            </div>
          </dl>
        </div>

        <div className="space-y-4">
          <SeismographTrace points={reference.trace} horizonYear={DEFAULT_SETTINGS.horizonYear} height={190} />
          <div className="slab p-4">
            <p className="label">Reference estate · computed from the bundled manifest</p>
            <p className="mt-2 text-sm leading-relaxed text-ash-300">
              {reference.count} primitives scored by the same engine the API runs. By{" "}
              <span className="tabular text-copper-300">2045</span> the modelled break exposes{" "}
              <span className="tabular text-copper-300">{reference.peak}%</span> of the estate, and
              the earliest rupture is{" "}
              <span className="tabular text-copper-300">{reference.earliest ?? "beyond 2045"}</span>.
              Nothing here is stored — load it to make it yours.
            </p>
          </div>
        </div>
      </section>

      <section id="intake" className="mt-16 scroll-mt-24">
        <EstateIntake />
      </section>

      <section className="mt-16">
        <h2 className="text-2xl font-semibold">The cost ledger is real arithmetic</h2>
        <p className="mt-2 max-w-3xl text-sm leading-relaxed text-ash-400">
          Shor&apos;s algorithm needs a working register proportional to the modulus and a Toffoli
          count superlinear in it; Grover only halves symmetric security. Cryptotremor converts those
          into a physical-qubit figure at a distance-15 surface code, then reports the year a break
          would cost less than a day under three attacker scenarios. Coefficients are calibrated
          against published factoring estimates and documented in the engine.
        </p>

        <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[rsa, ecdsa, aes, kem].map((entry) =>
            entry ? (
              <div key={entry.spec.id} className="slab p-4">
                <p className="label">{entry.spec.id}</p>
                <p className="mt-1 text-sm text-ash-200">{entry.spec.label}</p>
                <dl className="mt-3 space-y-1.5 font-data text-xs">
                  <div className="flex justify-between gap-2">
                    <dt className="text-ash-500">Attack</dt>
                    <dd className="text-ash-200">{entry.cost.attack}</dd>
                  </div>
                  <div className="flex justify-between gap-2">
                    <dt className="text-ash-500">Logical qubits</dt>
                    <dd className="tabular text-ash-200">{entry.cost.logicalQubits.toLocaleString()}</dd>
                  </div>
                  <div className="flex justify-between gap-2">
                    <dt className="text-ash-500">Physical (d=15)</dt>
                    <dd className="tabular text-copper-300">
                      {entry.cost.physicalQubits > 0
                        ? entry.cost.physicalQubits.toLocaleString()
                        : "—"}
                    </dd>
                  </div>
                  <div className="flex justify-between gap-2">
                    <dt className="text-ash-500">Non-Clifford ops</dt>
                    <dd className="tabular text-ash-200">
                      {entry.cost.toffoliCount > 0 ? entry.cost.toffoliCount.toExponential(2) : "—"}
                    </dd>
                  </div>
                  <div className="flex justify-between gap-2 border-t border-basalt-700 pt-1.5">
                    <dt className="text-ash-500">Break &lt; 1 day</dt>
                    <dd className="tabular text-hazard-300">
                      {entry.cost.ruptureYear.expected ?? "> 2045"}
                    </dd>
                  </div>
                </dl>
                <p className="mt-3 border-t border-basalt-700 pt-2 text-xs text-ash-500">
                  → {entry.spec.migrationTarget}
                </p>
              </div>
            ) : null,
          )}
        </div>
      </section>

      <section className="mt-16 grid gap-6 lg:grid-cols-3">
        <article className="slab p-5">
          <Fingerprint className="h-5 w-5 text-copper-400" aria-hidden="true" />
          <h3 className="mt-3 text-base font-semibold">Six weighted factors, itemized</h3>
          <p className="mt-2 text-sm leading-relaxed text-ash-400">
            Algorithm class, harvest lifetime, compliance clock, migration lead time, data
            classification and exposure surface. Each factor carries the sentence that produced it and
            the lever that moves it — no black-box score.
          </p>
        </article>
        <article className="slab p-5">
          <Waves className="h-5 w-5 text-verd-400" aria-hidden="true" />
          <h3 className="mt-3 text-base font-semibold">Grover-sequenced waves</h3>
          <p className="mt-2 text-sm leading-relaxed text-ash-400">
            One migration retires a whole system, so the planner searches over systems with Grover
            amplitude amplification and reports the measured amplification factor for each pick.
          </p>
        </article>
        <article className="slab p-5">
          <ShieldCheck className="h-5 w-5 text-copper-400" aria-hidden="true" />
          <h3 className="mt-3 text-base font-semibold">Sealed, replayable history</h3>
          <p className="mt-2 text-sm leading-relaxed text-ash-400">
            Every create, update, decision and delete appends a SHA-384 hash-chained event over
            canonical JSON. Deletions leave tombstones, so the chain still replays.
          </p>
        </article>
      </section>

      <section className="mt-16">
        <h2 className="text-2xl font-semibold">What a visitor can actually do</h2>
        <ol className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[
            {
              step: "01",
              title: "Import",
              body: "Load a CSV or JSON manifest, or the bundled reference estate. Rows are validated individually so one typo never blocks the batch.",
              icon: Binary,
            },
            {
              step: "02",
              title: "Inspect",
              body: "Open any primitive for its quantum cost ledger, factor evidence, binding constraint and full audit trail.",
              icon: Timer,
            },
            {
              step: "03",
              title: "Decide and scrub",
              body: "Record a migration decision, then drag the rupture rail to any year and watch the queue re-sequence against real measurements.",
              icon: Waves,
            },
            {
              step: "04",
              title: "Export and share",
              body: "Download JSON, Markdown or CSV, or freeze a snapshot partners can read without an account — with the chain head attached.",
              icon: ShieldCheck,
            },
          ].map((item) => (
            <li key={item.step} className="slab p-5">
              <div className="flex items-center justify-between">
                <span className="tabular text-xs text-ash-500">{item.step}</span>
                <item.icon className="h-4 w-4 text-ash-500" aria-hidden="true" />
              </div>
              <h3 className="mt-2 text-base font-semibold">{item.title}</h3>
              <p className="mt-1.5 text-sm leading-relaxed text-ash-400">{item.body}</p>
            </li>
          ))}
        </ol>
      </section>

      <LiveSignals />

      <section className="mt-16">
        <h2 className="text-2xl font-semibold">Read the numbers before the deadline</h2>
        <p className="mt-2 max-w-3xl text-sm leading-relaxed text-ash-400">{SAFETY_DISCLAIMER}</p>
        <div className="mt-5 flex flex-wrap gap-3">
          <Link href="/survey" className="btn btn-primary">
            Open the survey workspace
          </Link>
          <Link href="/agent" className="btn btn-secondary">
            Try the agent console
          </Link>
          <GitHubLink variant="ghost" label="View source on GitHub" />
        </div>
      </section>
    </div>
  );
}

async function LiveSignals() {
  const feed = await fetchStrata();
  return (
    <section className="mt-16">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <h2 className="text-2xl font-semibold">Live signals behind the survey</h2>
        <span
          className={`tabular rounded-[2px] border px-2 py-1 text-[0.65rem] ${
            feed.kev.status === "live" && feed.research.status === "live"
              ? "border-verd-600 bg-verd-700/20 text-verd-300"
              : "border-hazard-500 bg-hazard-500/10 text-hazard-300"
          }`}
        >
          kev: {feed.kev.status} · arxiv: {feed.research.status}
        </span>
      </div>
      <p className="mt-2 max-w-3xl text-sm leading-relaxed text-ash-400">{feed.research.note}</p>

      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <div className="slab p-5">
          <p className="label">{feed.kev.attribution} · known exploited vulnerabilities</p>
          <ul className="mt-3 space-y-2">
            {feed.kev.items.slice(0, 5).map((item) => (
              <li key={item.cveId} className="border-l border-copper-600 pl-3">
                <p className="tabular text-sm text-ash-200">{item.cveId}</p>
                <p className="text-xs text-ash-400">
                  {item.vendorProject} · {item.product} — {item.vulnerabilityName}
                </p>
                <p className="mt-0.5 text-xs text-ash-500">{item.reason}</p>
              </li>
            ))}
          </ul>
          <p className="mt-3 font-data text-[0.65rem] text-ash-500">
            {feed.kev.source} · fetched {feed.kev.fetchedAt}
          </p>
        </div>

        <div className="slab p-5">
          <p className="label">{feed.research.attribution} · quant-ph preprints</p>
          <ul className="mt-3 space-y-2">
            {feed.research.items.slice(0, 5).map((item) => (
              <li key={item.id} className="border-l border-verd-600 pl-3">
                <a
                  href={item.link}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm text-ash-200 hover:text-copper-300"
                >
                  {item.title}
                </a>
                <p className="tabular text-xs text-ash-500">
                  {item.publishedAt.slice(0, 10)} · {item.authors.slice(0, 2).join(", ")}
                </p>
              </li>
            ))}
          </ul>
          <p className="mt-3 font-data text-[0.65rem] text-ash-500">
            {feed.research.source} · fetched {feed.research.fetchedAt}
          </p>
        </div>
      </div>
    </section>
  );
}