/**
 * Single source of truth for product identity, navigation and outbound links.
 *
 * The repository URL is defined here once. The header, the mobile menu, the
 * landing CTA, the footer and the public manifest all read this value, so a
 * link can never drift from the real repository.
 */

export const SITE = {
  name: "Cryptotremor",
  tagline: "Survey your cryptography before the quantum deadline finds it.",
  description:
    "Cryptotremor is a post-quantum migration readiness instrument. Import a cryptographic manifest, estimate real Shor and Grover costs per primitive, scrub the rupture timeline, sequence migration waves with Grover amplitude amplification, and export a partner-readable readiness report with a verifiable SHA-384 audit chain.",
  liveUrl:
    process.env.NEXT_PUBLIC_SITE_URL ??
    (process.env.VERCEL_PROJECT_PRODUCTION_URL
      ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
      : "http://localhost:3000"),
  repoUrl: "https://github.com/aniruddhaadak80/cryptotremor",
  repoLabel: "aniruddhaadak80/cryptotremor",
  license: "MIT",
  ogImage: "/og.png",
  nav: [
    { href: "/survey", label: "Survey" },
    { href: "/seismograph", label: "Seismograph" },
    { href: "/agent", label: "Agent" },
    { href: "/report", label: "Report" },
    { href: "/settings", label: "Settings" },
  ],
  footerNav: [
    { href: "/survey", label: "Survey workspace" },
    { href: "/seismograph", label: "Rupture analysis" },
    { href: "/agent", label: "Agent console" },
    { href: "/report", label: "Export and sharing" },
    { href: "/verify", label: "Integrity replay" },
  ],
} as const;

export function githubLabel(): string {
  return `Star ${SITE.repoLabel} on GitHub`;
}