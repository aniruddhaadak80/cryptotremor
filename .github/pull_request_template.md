name: Pull request
description: Propose a change to Cryptotremor.
title: ""
labels: []
body: |
  ## What this changes

  One or two sentences, and the reason. If it touches the engine, say which model assumption
  changes and what evidence supports it.

  ## Type of change

  - [ ] Engine or model change (include the citation and the calibration impact)
  - [ ] New manifest format or integration
  - [ ] Interface, accessibility or copy
  - [ ] Feed, persistence, integrity or agent interface
  - [ ] Documentation, tests, CI or tooling
  - [ ] Fix for a reported issue — link it: fixes #

  ## Verification I ran

  Paste the commands and their result. All four must pass:

  ```bash
  npm run typecheck
  npm run lint
  npm test
  npm run build
  ```

  If you touched anything reachable from the interface:

  ```bash
  npm run build && npx next start -p 3111
  PLAYWRIGHT_BASE_URL=http://127.0.0.1:3111 npm run test:browser
  ```

  ## Checklist

  - [ ] Tests added or updated, including boundary, empty and malformed inputs for engine changes
  - [ ] No dead controls, placeholder copy or simulated results presented as live
  - [ ] No secrets, `.env` values or credentials in the diff
  - [ ] README, route map and env docs still match the code
  - [ ] The diff contains no unrelated reformatting

  ## Screenshots

  For visual changes, attach before and after at mobile and desktop widths, and confirm the
  signature still reads without animation.