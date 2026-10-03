# Contributing to Cryptotremor

Thanks for helping make post-quantum planning honest and inspectable. This project is a **planning
instrument**, not a security product, so the bar for contributions is accuracy and evidence rather
than volume.

## What is most valuable

1. **A published resource estimate with a citation.** If you have found a better coefficient for
   Shor or Grover cost — ideally one tied to a specific paper — open an issue describing the source
   before writing code. The engine currently documents which parts are grounded and which are
   extrapolated, and new evidence should update that honestly.
2. **A real manifest format.** SBOM-style inputs (SPDX, CycloneDX) or a parser for a format you
   actually use. Include the format's own documentation link.
3. **A compliance regime we missed.** Country-level or sector-specific migration guidance. Please
   cite the primary document and include the exact milestone wording.
4. **Honesty fixes.** Anywhere the interface implies more certainty than the model has, a fix is
   welcome and encouraged.

## Getting set up

```bash
git clone https://github.com/aniruddhaadak80/cryptotremor.git
cd cryptotremor
npm install
npm run dev
```

No environment variables are required for local development: the app uses an embedded Postgres
(PGlite) under `.tremor/`, which is git-ignored. To point at a real Postgres, copy `.env.example`
to `.env.local` and set `DATABASE_URL`.

## Before you open a pull request

```bash
npm run typecheck
npm run lint
npm test
npm run build
```

All four must pass. If you changed anything the interface can reach, also run the browser journey
against a local production server:

```bash
npm run build && npx next start -p 3111
PLAYWRIGHT_BASE_URL=http://127.0.0.1:3111 npm run test:browser
```

If you changed the engine, add tests for the normal case plus **boundary, empty, malformed and
deterministic-repeat** inputs. The engine must stay total: it may never throw on unknown
algorithms, zero bit sizes or nonsense manifests.

## Rules that are not negotiable

- **Every visible control must do real work.** No dead buttons, `console.log` handlers, fake
  counters, or simulated results presented as live.
- **One engine implementation.** The score, the cost ledger and the wave plan live in
  `src/lib/engine/`. Do not recompute them in a component; import them.
- **User data must survive.** No in-memory `Map`, `localStorage` or serverless filesystem as the
  source of truth in production.
- **Mutations stay idempotent.** Retried agent calls must not duplicate records or inflate the audit
  chain.
- **Deletions are tombstones.** Rows are retained so the SHA-384 chain keeps replaying.
- **No secrets.** Never commit credentials, tokens or `.env` values.

## Commit and PR style

Write commit messages in the imperative mood, scoped to the area:

```
engine: calibrate AES-128 Grover cost against van Oorschot and Wiener
feed: label arXiv fallback as stale instead of current
ui: keep the rupture rail reachable by keyboard
```

In the pull request, describe **what changed and why**, link the evidence for any model change, and
say which verification commands you ran and what they printed.

## Reporting security issues

Please do not open a public issue. See [SECURITY.md](SECURITY.md).

## Code of conduct

Be precise, be kind, and argue about the model rather than the person. Reviewers are volunteers.