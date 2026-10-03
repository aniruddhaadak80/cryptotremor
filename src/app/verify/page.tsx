import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { readScope } from "@/lib/auth/session";
import { listAssets, listEvents, tombstonedIds } from "@/lib/db/repo";
import { replayScope, GENESIS_SEAL, SEAL_ALGORITHM } from "@/lib/integrity/seal";
import { GitHubLink } from "@/components/github-link";
import { SITE } from "@/lib/config/site";

export const metadata: Metadata = {
  title: "Integrity",
  description:
    "Replay the SHA-384 audit chain across every primitive in the estate and report the first broken link.",
  alternates: { canonical: `${SITE.liveUrl}/verify` },
};

export const dynamic = "force-dynamic";

export default async function VerifyPage() {
  const scope = await readScope();
  if (!scope) notFound();

  const [events, tombstones, assets] = await Promise.all([
    listEvents(scope),
    tombstonedIds(scope),
    listAssets(scope, {}),
  ]);
  const report = replayScope(events, tombstones);

  const byEntity = new Map<string, typeof events>();
  for (const event of events) {
    const list = byEntity.get(event.entityId) ?? [];
    list.push(event);
    byEntity.set(event.entityId, list);
  }

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-10 sm:px-6">
      <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="label">Integrity</p>
          <h1 className="mt-2 text-3xl font-semibold">Replay the chain</h1>
          <p className="mt-2 max-w-3xl text-sm leading-relaxed text-ash-400">
            Every create, update, decision and delete appends an event whose SHA-384 seal covers the
            previous seal and the canonical JSON of the event. Editing any historical row breaks every
            seal after it, so this page reports the first broken link rather than a pass/fail badge.
          </p>
        </div>
        <GitHubLink variant="ghost" label="View source" />
      </header>

      <section
        className={`slab-raised p-5 ${report.ok ? "border-verd-600" : "border-hazard-500"}`}
        aria-live="polite"
      >
        <div className="flex flex-wrap items-center gap-3">
          <span
            className={`tabular rounded-[2px] border px-2 py-1 text-sm ${
              report.ok ? "band-plan" : "band-critical"
            }`}
          >
            {report.ok ? "chain intact" : "chain broken"}
          </span>
          <span className="tabular text-sm text-ash-300">
            {report.events} event(s) across {report.assets} chain(s)
          </span>
          {report.tombstones > 0 ? (
            <span className="tabular text-xs text-ash-500">{report.tombstones} tombstone(s) retained</span>
          ) : null}
        </div>

        <dl className="mt-4 grid gap-4 sm:grid-cols-3">
          <div>
            <dt className="label">Algorithm</dt>
            <dd className="tabular mt-1 text-sm text-ash-200">{SEAL_ALGORITHM}</dd>
          </div>
          <div className="min-w-0">
            <dt className="label">Genesis</dt>
            <dd className="tabular mt-1 break-all text-xs text-ash-300">{GENESIS_SEAL}</dd>
          </div>
          <div className="min-w-0">
            <dt className="label">Chain head</dt>
            <dd className="tabular mt-1 break-all text-xs text-copper-300">{report.headSeal ?? "none"}</dd>
          </div>
        </dl>

        {report.brokenAt ? (
          <p className="mt-4 border-l border-hazard-500 pl-3 text-sm text-hazard-300">
            First broken link: entity {report.brokenAt.entityId.slice(0, 8)}… at event #{report.brokenAt.seq}.
          </p>
        ) : null}
      </section>

      <section className="mt-6">
        <p className="label">Per-primitive chains</p>
        {byEntity.size === 0 ? (
          <p className="slab mt-3 p-5 text-sm text-ash-400">
            No events yet.{" "}
            <Link href="/" className="link-underline">
              Load the reference estate
            </Link>{" "}
            to create the first chain.
          </p>
        ) : (
          <ul className="mt-3 space-y-2">
            {[...byEntity.entries()].map(([entityId, list]) => {
              const asset = assets.find((candidate) => candidate.id === entityId);
              const last = list[list.length - 1];
              return (
                <li key={entityId} className="slab p-4">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <span className="text-sm text-ash-100">
                      {asset?.label ?? "(retired primitive)"}
                      <span className="ml-2 text-xs text-ash-500">{asset?.system ?? "—"}</span>
                    </span>
                    <span className="tabular text-xs text-ash-500">{list.length} event(s)</span>
                  </div>
                  <p className="tabular mt-1 break-all text-[0.65rem] text-ash-500">{last?.seal}</p>
                  <ul className="mt-2 space-y-1">
                    {list.map((event) => (
                      <li key={event.id} className="flex flex-wrap gap-2 font-data text-[0.65rem] text-ash-400">
                        <span className="tabular w-6 text-right text-ash-500">#{event.seq}</span>
                        <span className="w-40 text-ash-300">{event.type}</span>
                        <span className="tabular">{event.createdAt.slice(0, 19).replace("T", " ")}</span>
                      </li>
                    ))}
                  </ul>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <p className="mt-6 text-xs text-ash-500">
        The same replay runs server-side at{" "}
        <span className="tabular text-copper-300">GET /api/verify</span> and through the{" "}
        <span className="tabular text-copper-300">verify_integrity</span> agent tool.
      </p>
    </div>
  );
}