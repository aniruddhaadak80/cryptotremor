# Security Policy

## Supported version

| Version | Supported |
| --- | --- |
| `main` | Yes |

Cryptotremor has no tagged releases yet; `main` is the supported version.

## What this project is and is not

Cryptotremor is an **open planning instrument**. It is not a security product, a compliance tool, or
a cryptographic implementation. It makes no cryptographic guarantees, stores no keys and no key
material, and must not be used as the sole basis for a security decision.

Reports about **the accuracy or honesty of its model** are extremely welcome and are handled like
bugs: an overconfident rupture year or a misleading label is a defect.

## Reporting a vulnerability

Email **security@users.noreply.github.com** or open a private advisory via
[GitHub Security Advisories](https://github.com/aniruddhaadak80/cryptotremor/security/advisories/new).
Please do not open a public issue first.

Please include: affected route or file, the request that triggers it, the impact you observed, and
reproduction steps. You can expect an acknowledgement within 7 days and a fix or mitigation plan
within 30 days.

## Threat model in brief

The interesting attacks are all **cross-tenant**, because there are no accounts:

| Attack | Mitigation |
| --- | --- |
| Reading another visitor's estate | Every query is scoped by an unguessable 128-bit `owner_scope`; a foreign id returns `404`, not `403`, so existence is not leaked |
| Mutating another visitor's estate | Same scoping, enforced in the repository layer rather than in handlers |
| Forging a session | The scope is 16 bytes from a CSPRNG in an HTTP-only, `SameSite=Lax` cookie; forging requires guessing 128 bits |
| Impersonating an agent estate | `x-ct-owner` accepts only a valid 32-hex scope; it is the same 128 bits as the cookie, so possession is ownership by design |
| Resource exhaustion | Bounded request bodies, manifests capped at 200 rows and 200 KB, bounded lists, query timeouts |
| Bulk scraping | Per-scope rate limits on writes, imports, shares and MCP calls |
| Injection | All SQL is parameterized; all input passes bounded zod schemas; no untrusted HTML is rendered |
| Error leakage | Stable error envelopes; stack traces and environment values are never returned |

### Known, accepted limitations

- **Rate limiting is best-effort on serverless.** The limiter is an in-process map, so it resets on
  cold start and does not aggregate across instances. It stops accidental loops and single-instance
  abuse, not a determined distributed attacker. Real limiting belongs at the edge (Vercel WAF,
  Cloudflare, Upstash).
- **The embedded PGlite store is refused in production.** If `DATABASE_URL` is missing while
  `VERCEL` or `NODE_ENV=production` is set, the application throws rather than using ephemeral
  storage. This is deliberate.
- **Report snapshots are immutable but not authenticated.** Anyone holding a share token can read
  that snapshot. Treat share links as secrets and revoke them from `/report` if they leak.
- **Owner tokens are bearer credentials.** The `ownerToken` returned by `initialize` is equivalent to
  the session cookie. It is safe in transit over HTTPS and must not be logged.
- **No proof of possession.** A visitor can claim any estate scope they hold a token for; there is
  no second factor. Higher-assurance use would need signed attestation.

## Safe handling of cryptographic material

Do **not** paste real private keys, seed phrases, certificates from production systems, or
customer data into Cryptotremor. The manifest format asks only for metadata: algorithm, key size,
usage, deployment, data classification, and how long the data must stay confidential.

## Disclosure

We ask for 90 days before public disclosure of an unfixed issue, and we credit researchers by name
unless they prefer otherwise.