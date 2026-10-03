import type { Metadata } from "next";
import Link from "next/link";
import { readScope } from "@/lib/auth/session";
import { countAssets, getProfile } from "@/lib/db/repo";
import { SettingsForm } from "@/components/settings-form";
import { RegistryTable } from "@/components/registry-table";
import { GitHubLink } from "@/components/github-link";
import { SITE } from "@/lib/config/site";

export const metadata: Metadata = {
  title: "Settings",
  description:
    "Set the horizon year, compliance regime and attacker scenario used by the deterministic engine, and inspect the algorithm and policy registries.",
  alternates: { canonical: `${SITE.liveUrl}/settings` },
};

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const scope = await readScope();
  const profile = scope
    ? await getProfile(scope)
    : {
        ownerScope: "",
        orgName: "",
        horizonYear: 2026,
        regimeId: "nist-ir-8547",
        attackerProfile: "expected",
        tolerance: 0,
        updatedAt: new Date().toISOString(),
      };
  const assets = scope ? await countAssets(scope) : 0;

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-10 sm:px-6">
      <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="label">Configuration</p>
          <h1 className="mt-2 text-3xl font-semibold">Assumptions you can change</h1>
          <p className="mt-2 max-w-3xl text-sm leading-relaxed text-ash-400">
            The rupture year depends on assumptions, so they are settings rather than constants. Every
            change re-scores the whole estate through the same engine the API and agent tools use, and
            the profile is stored with your session.
          </p>
        </div>
        <GitHubLink variant="ghost" label="View source" />
      </header>

      {!scope ? (
        <p className="slab mb-6 border-hazard-500 p-4 text-sm text-hazard-300">
          No session scope yet, so these settings will apply to a new estate.{" "}
          <Link href="/" className="link-underline">
            Load the reference estate
          </Link>{" "}
          first if you want to see scores change.
        </p>
      ) : null}

      <SettingsForm profile={profile} assetCount={assets} />

      <div className="mt-8">
        <RegistryTable />
      </div>
    </div>
  );
}