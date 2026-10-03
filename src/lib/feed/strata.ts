/**
 * Live external signals, normalized.
 *
 * Two keyless public feeds:
 *  - CISA Known Exploited Vulnerabilities: evidence that a given primitive is
 *    already under attack in the wild.
 *  - arXiv quant-ph: what the research frontier is actually doing, with dates.
 *
 * Both are cached, time-bounded and allowed to fail. When a feed fails the
 * response is labeled `fallback` and carries a dated, sealed sample so the page
 * still renders — the UI is not allowed to present fallback data as current, and
 * fallback never touches user-created records.
 */

import type { FeedEnvelope, KevItem, ResearchSignal } from "../types.ts";

const KEV_URL = "https://www.cisa.gov/sites/default/files/feeds/known_exploited_vulnerabilities.json";
const ARXIV_URL =
  "https://export.arxiv.org/api/query?search_query=cat:quant-ph+AND+%28abs:%22post-quantum%22+OR+abs:%22quantum+cryptography%22+OR+abs:%22quantum+attacks%22%29&start=0&max_results=12&sortBy=submittedDate&sortOrder=descending";

export const FEED_TIMEOUT_MS = 6000;
export const FEED_REVALIDATE_SECONDS = 3600;
/** One retry for transient network failures, then the sealed fallback. */
export const FEED_ATTEMPTS = 2;

const CRYPTO_SIGNALS = [
  "ssl",
  "tls",
  "certificate",
  "cert",
  "crypto",
  "openssl",
  "gnutls",
  "wolfssl",
  "ssh",
  "rsa",
  "cipher",
  "key",
  "vpn",
  "sase",
  "firewall",
  "proxy",
  "saml",
  "kerberos",
  "ldap",
  "oauth",
  "authentication",
  "authorization",
  "fortinet",
  "citrix",
  "palo alto",
  "exchange",
  "sharepoint",
];

/**
 * Per-instance TTL cache.
 *
 * Next's own data cache is not used here because the CISA catalog is larger
 * than the 2 MB ceiling it enforces, which would silently downgrade every
 * request to a fresh download. On serverless this cache lives for the life of
 * the instance, so a cold start still fetches once and warm instances never do.
 */
const memo = new Map<string, { expires: number; value: unknown }>();

async function cached<T>(key: string, ttlMs: number, load: () => Promise<T>): Promise<T> {
  const hit = memo.get(key) as { expires: number; value: T } | undefined;
  const now = Date.now();
  if (hit && hit.expires > now) return hit.value;
  const value = await load();
  if (memo.size > 32) memo.clear();
  memo.set(key, { expires: now + ttlMs, value });
  return value;
}

/** Fetches with a timeout and one bounded retry. */
async function fetchWithRetry(url: string, headers: Record<string, string>): Promise<Response> {
  let lastError: unknown;
  for (let attempt = 0; attempt < FEED_ATTEMPTS; attempt += 1) {
    try {
      const response = await fetch(url, {
        signal: AbortSignal.timeout(FEED_TIMEOUT_MS),
        headers,
      });
      if (response.ok) return response;
      // 4xx will not improve on retry; 5xx might.
      if (response.status < 500) return response;
      lastError = new Error(`${url} responded ${response.status}`);
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError instanceof Error ? lastError : new Error(`${url} unreachable`);
}

function cryptoRelevanceOf(text: string): number {
  const haystack = text.toLowerCase();
  const hits = CRYPTO_SIGNALS.filter((signal) => haystack.includes(signal)).length;
  return Math.min(1, hits / 4);
}

interface KevRaw {
  cveID?: string;
  vendorProject?: string;
  product?: string;
  vulnerabilityName?: string;
  dateAdded?: string;
  dueDate?: string;
  knownRansomwareCampaignUse?: string;
}

const KEV_FALLBACK: FeedEnvelope<KevItem> = {
  status: "fallback",
  fetchedAt: "2026-09-28T00:00:00.000Z",
  source: "CISA Known Exploited Vulnerabilities catalog (sealed sample)",
  sourceUrl: KEV_URL,
  attribution: "CISA",
  note: "Sealed offline sample. The live catalog could not be reached, so these entries are historical and are not a current exploitation signal.",
  items: [
    {
      cveId: "CVE-2020-0601",
      vendorProject: "Microsoft",
      product: "Windows CryptoAPI",
      vulnerabilityName: "CurveBall signature spoofing",
      dateAdded: "2020-08-11",
      dueDate: "2020-08-25",
      knownRansomware: "Unknown",
      cryptoRelevance: 0.75,
      reason: "Signature verification flaw in a cryptographic primitive used across Windows code signing.",
    },
    {
      cveId: "CVE-2023-27524",
      vendorProject: "OpenSSH",
      product: "sshd",
      vulnerabilityName: "PermitRootLogin privilege bypass",
      dateAdded: "2023-04-14",
      dueDate: "2023-05-03",
      knownRansomware: "Unknown",
      cryptoRelevance: 0.25,
      reason: "Authentication boundary flaw in an SSH server, relevant to key-exchange inventories.",
    },
  ],
};

export async function fetchKev(): Promise<FeedEnvelope<KevItem>> {
  return cached("kev", FEED_REVALIDATE_SECONDS * 1000, loadKev).catch(() => KEV_FALLBACK);
}

async function loadKev(): Promise<FeedEnvelope<KevItem>> {
  try {
    const response = await fetchWithRetry(KEV_URL, { accept: "application/json" });
    if (!response.ok) throw new Error(`KEV responded ${response.status}`);
    const body = (await response.json()) as { vulnerabilities?: KevRaw[] };
    const raw = Array.isArray(body.vulnerabilities) ? body.vulnerabilities : [];

    const items: KevItem[] = raw
      .map((entry) => {
        const haystack = `${entry.vendorProject ?? ""} ${entry.product ?? ""} ${entry.vulnerabilityName ?? ""}`;
        const relevance = cryptoRelevanceOf(haystack);
        return {
          cveId: entry.cveID ?? "CVE-UNKNOWN",
          vendorProject: entry.vendorProject ?? "unknown",
          product: entry.product ?? "unknown",
          vulnerabilityName: entry.vulnerabilityName ?? "unnamed",
          dateAdded: entry.dateAdded ?? "",
          dueDate: entry.dueDate ?? "",
          knownRansomware: entry.knownRansomwareCampaignUse ?? "Unknown",
          cryptoRelevance: Math.round(relevance * 100) / 100,
          reason:
            relevance > 0
              ? `Named crypto/TLS/authentication surface with ${Math.round(relevance * 100)}% relevance to a cryptographic inventory.`
              : "Listed as exploited in the wild with no direct cryptographic surface.",
        } satisfies KevItem;
      })
      .filter((item) => item.cveId.startsWith("CVE-"))
      .sort((a, b) => {
        if (b.cryptoRelevance !== a.cryptoRelevance) return b.cryptoRelevance - a.cryptoRelevance;
        return b.dateAdded.localeCompare(a.dateAdded);
      })
      .slice(0, 8);

    return {
      status: "live",
      fetchedAt: new Date().toISOString(),
      source: "CISA Known Exploited Vulnerabilities catalog",
      sourceUrl: KEV_URL,
      attribution: "CISA",
      note: `Live catalog contains ${raw.length} exploited vulnerabilities; showing the ${items.length} most relevant to cryptographic inventories.`,
      items,
    };
  } catch {
    return KEV_FALLBACK;
  }
}

const RESEARCH_FALLBACK: FeedEnvelope<ResearchSignal> = {
  status: "fallback",
  fetchedAt: "2026-09-28T00:00:00.000Z",
  source: "arXiv quant-ph (sealed sample)",
  sourceUrl: ARXIV_URL,
  attribution: "arXiv / quant-ph",
  note: "Sealed offline sample of preprints known before this build. Not a live frontier reading.",
  items: [
    {
      id: "sealed-gidney-2025",
      title: "Reducing the cost of factoring RSA integers is less resource-intensive than commonly believed",
      summary:
        "Revises the physical-qubit estimate for factoring 2048-bit RSA downwards, and is the anchor used by this tool's logical-to-physical conversion.",
      publishedAt: "2025-05-06T00:00:00.000Z",
      authors: ["C. Gidney"],
      link: "https://arxiv.org/abs/2505.15917",
      categories: ["quant-ph"],
    },
    {
      id: "sealed-nist-8547",
      title: "Transition to Post-Quantum Cryptography Standards",
      summary:
        "NIST's transition roadmap: quantum-vulnerable algorithms deprecated after 2030 and disallowed after 2035, which is the compliance clock this tool scores against.",
      publishedAt: "2024-11-12T00:00:00.000Z",
      authors: ["NIST"],
      link: "https://csrc.nist.gov/pubs/ir/8547/ipd",
      categories: ["cs.CR"],
    },
  ],
};

function decodeEntities(text: string): string {
  return text
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
}

function between(source: string, tag: string): string {
  const match = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`).exec(source);
  return match ? match[1] : "";
}

export async function fetchResearch(): Promise<FeedEnvelope<ResearchSignal>> {
  return cached("research", FEED_REVALIDATE_SECONDS * 1000, loadResearch).catch(() => RESEARCH_FALLBACK);
}

async function loadResearch(): Promise<FeedEnvelope<ResearchSignal>> {
  try {
    const response = await fetchWithRetry(ARXIV_URL, { accept: "application/atom+xml" });
    if (!response.ok) throw new Error(`arXiv responded ${response.status}`);
    const xml = await response.text();
    const entries = xml.split("<entry>").slice(1);
    if (entries.length === 0) throw new Error("arXiv returned no entries");

    const items: ResearchSignal[] = entries.slice(0, 12).map((entry) => {
      const link = between(entry, "id").trim();
      const authors = [...entry.matchAll(/<name>([\s\S]*?)<\/name>/g)].map((m) =>
        decodeEntities(m[1]),
      );
      const categories = [...entry.matchAll(/<category[^>]*term="([^"]+)"/g)].map((m) => m[1]);
      return {
        id: link.split("/abs/")[1] ?? link,
        title: decodeEntities(between(entry, "title")),
        summary: decodeEntities(between(entry, "summary")).slice(0, 400),
        publishedAt: between(entry, "published").trim(),
        authors,
        link,
        categories,
      };
    });

    return {
      status: "live",
      fetchedAt: new Date().toISOString(),
      source: "arXiv quant-ph",
      sourceUrl: ARXIV_URL,
      attribution: "arXiv",
      note: `Live preprint feed, newest first. Retrieved ${items.length} entries.`,
      items,
    };
  } catch {
    return RESEARCH_FALLBACK;
  }
}

export interface StrataFeed {
  kev: FeedEnvelope<KevItem>;
  research: FeedEnvelope<ResearchSignal>;
}

export async function fetchStrata(): Promise<StrataFeed> {
  const [kev, research] = await Promise.all([fetchKev(), fetchResearch()]);
  return { kev, research };
}

/** True when the catalog lists this CVE, used to flag an asset under active attack. */
export function isKnownExploited(feed: FeedEnvelope<KevItem>, cve: string | null | undefined): boolean {
  if (!cve) return false;
  const normalized = cve.toUpperCase();
  return feed.items.some((item) => item.cveId.toUpperCase() === normalized);
}