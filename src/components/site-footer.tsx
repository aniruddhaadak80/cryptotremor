import Link from "next/link";
import { SITE } from "@/lib/config/site";
import { GitHubLink } from "./github-link";
import { SAFETY_DISCLAIMER } from "@/lib/report";

export function SiteFooter() {
  return (
    <footer className="relative z-10 mt-20 border-t border-basalt-700 bg-basalt-900/60">
      <div className="mx-auto w-full max-w-6xl px-4 py-12 sm:px-6">
        <div className="grid gap-10 md:grid-cols-[1.4fr_1fr_1fr]">
          <div>
            <p className="text-lg font-semibold tracking-tight text-ash-100">{SITE.name}</p>
            <p className="mt-2 max-w-sm text-sm leading-relaxed text-ash-400">
              {SITE.tagline} Built as a public instrument: the engine, the audit chain and the agent
              tools are all in the repository.
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              <GitHubLink variant="secondary" label="Star on GitHub" />
              <Link href="/report" className="btn btn-ghost">
                Export a report
              </Link>
            </div>
            <p className="mt-4 font-data text-xs text-ash-500">{SITE.repoUrl}</p>
          </div>

          <nav aria-label="Product">
            <p className="label">Product</p>
            <ul className="mt-3 space-y-2">
              {SITE.nav.map((item) => (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    className="text-sm text-ash-300 transition-colors hover:text-copper-300"
                  >
                    {item.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>

          <nav aria-label="More">
            <p className="label">More</p>
            <ul className="mt-3 space-y-2">
              {SITE.footerNav
                .filter((item) => !SITE.nav.some((navItem) => navItem.href === item.href))
                .map((item) => (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      className="text-sm text-ash-300 transition-colors hover:text-copper-300"
                    >
                      {item.label}
                    </Link>
                  </li>
                ))}
              <li>
                <a
                  href={SITE.repoUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm text-ash-300 transition-colors hover:text-copper-300"
                >
                  Source repository
                </a>
              </li>
              <li>
                <a
                  href={`${SITE.repoUrl}/issues`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm text-ash-300 transition-colors hover:text-copper-300"
                >
                  Issues and contributions
                </a>
              </li>
            </ul>
          </nav>
        </div>

        <div className="mt-10 space-y-3 border-t border-basalt-700 pt-6">
          <p className="font-data text-xs leading-relaxed text-ash-500">{SAFETY_DISCLAIMER}</p>
          <p className="font-data text-xs text-ash-500">
            Data provenance: CISA Known Exploited Vulnerabilities catalog and arXiv quant-ph, fetched
            at runtime and labelled live or fallback in every report.
          </p>
          <p className="font-data text-xs text-ash-500">
            {SITE.license} licensed · NIST FIPS 203/204/205 · NIST IR 8547 ·{" "}
            <a
              href="https://csrc.nist.gov/projects/post-quantum-cryptography"
              target="_blank"
              rel="noopener noreferrer"
              className="link-underline"
            >
              NCCoE migration project
            </a>
          </p>
        </div>
      </div>
    </footer>
  );
}