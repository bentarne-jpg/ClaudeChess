# Architecture manifest — Sjakkverkstedet

This manifest is the binding reference for every change to this repository. Check each change
against it **before** writing code, and confirm the result in the pull request (see
[§9 Change protocol](#9-change-protocol)).

Rules use three levels:

- **MUST / MUST NOT**: a hard rule. A change that breaks one is not made. If a request requires it,
  stop, explain the conflict, and propose either an alternative or an amendment
  ([§11](#11-amending-this-manifest)).
- **SHOULD**: the default. Deviating needs a stated reason in the pull request.
- **MAY**: allowed, at the author's discretion.

Rules are numbered (for example `A3`, `S5`) so that pull requests and reviews can cite them.

---

## 1. Purpose and product direction

Sjakkverkstedet is a chess app with analysis, rated puzzles and play against a computer. The
planned direction is:

1. user accounts with login,
2. per-user ratings, game history and analyses stored on a server,
3. person-vs-person play in real time.

The architecture exists so that features can be added and changed **without rewriting unrelated
parts of the app**, while staying **secure** and **testable at every layer**.

## 2. Guiding principles

- **P1 – Rules live in one place.** Chess rules, clocks, rating and move classification are
  written once, in the domain layer, and shared by client and server.
- **P2 – The server decides what is true.** Results, clocks, ratings and history are only trusted
  when the server has computed or verified them. The client sends intents, not outcomes.
- **P3 – Dependencies point inward.** UI → application → domain. Infrastructure is plugged in
  through interfaces (ports). The domain depends on nothing.
- **P4 – Features are isolated.** A change to one feature must not require changes to another
  feature's internals.
- **P5 – Every behaviour is tested at the lowest layer that can prove it.**
- **P6 – Small, reversible steps.** Each change leaves the app working and deployable.
- **P7 – Collect as little personal data as possible**, and let users export and delete their own.

## 3. Layers and module boundaries

### 3.1 Target structure

```
packages/
  domain/          pure TypeScript: rules, clock, rating, classification, game state machine
  contracts/       shared message and API schemas (zod), versioned
apps/
  web/
    src/core/      client application layer: use cases, ports
    src/adapters/  api client, engine worker, local cache
    src/features/  analysis/ puzzles/ play/ bot/ profile/ home/  (UI per feature)
    src/ui/        shared UI components (board, eval bar, clock, buttons)
supabase/
  migrations/      versioned database migrations, including row-level security policies
  functions/       Edge Functions (Deno): the server-side use cases (finish game, make move, …)
    _shared/       server application layer and ports; the domain package is bundled in at build time
  tests/           database tests (policies, functions) run against real Postgres
tests/e2e/         Playwright end-to-end tests
```

### 3.2 Dependency rules

- **A1** `packages/domain` MUST NOT import from any other package or app, MUST NOT touch the DOM,
  network, storage, timers or randomness directly (time and randomness are passed in).
- **A2** Application code (use cases) MUST depend only on the domain, `contracts` and its own
  ports (interfaces). It MUST NOT import adapters or UI.
- **A3** Adapters implement ports. Only the composition root (`main.ts` on each side) wires
  adapters to use cases.
- **A4** A feature folder MUST NOT import from another feature folder. Shared needs go into
  `src/ui`, `src/core` or the domain.
- **A5** UI code MUST NOT contain game rules, rating maths, clock arithmetic or classification
  thresholds; it calls the domain or a use case.
- **A6** Every message crossing the network (HTTP body, WebSocket message, stored JSON document)
  MUST have a schema in `packages/contracts`, and it MUST be validated on receipt.
- **A7** These boundaries MUST be enforced by tooling (dependency-cruiser or ESLint boundary
  rules) in CI, not by convention alone.
- **A8** Third-party libraries (chess.js, Stockfish, auth SDKs) SHOULD be wrapped behind a port or
  a thin module, so they can be replaced in one place.
- **A9** A new feature SHOULD arrive behind a feature flag until it is complete.
- **A10** Shared UI components (board, eval bar, move list, clock) MUST be reused rather than
  copied. A second copy of the same component is a defect.

### 3.3 Technology baseline

| Concern | Choice | Status |
|---|---|---|
| Language | TypeScript (strict) everywhere | decided |
| Frontend build | Vite, plain DOM or a light component library, no heavy framework required | decided |
| Chess rules | chess.js wrapped in `packages/domain` | decided |
| Engine | Stockfish (WASM) in a Web Worker, behind an `Engine` port | decided |
| Backend platform | Supabase: Postgres, Auth, Realtime, Edge Functions (ADR-0002) | decided |
| Server-side logic | Supabase Edge Functions (Deno, TypeScript), sharing `packages/domain` | decided |
| Database | Supabase Postgres with versioned migrations and row-level security | decided |
| Realtime | Supabase Realtime (database changes and broadcast) for live games | decided |
| Login | Supabase Auth with hosted providers: Google, Facebook, Vipps as custom OIDC `custom:vipps` (ADR-0003) | decided |
| Frontend hosting | GitHub Pages (static) | decided |
| Rating system | Glicko-2 per pool for games (bullet, blitz, rapid, classical, bot); puzzles keep the asymmetric rule the owner chose (a solve gains about twice what a miss loses) | decided |

Changing a "decided" row requires an amendment ([§11](#11-amending-this-manifest)).

## 4. Security rules

- **S1** Passwords MUST NOT be stored or handled by this app. Login uses hosted providers through
  Supabase Auth (OAuth/OIDC with PKCE).
- **S2** The server MUST verify the identity token on every authenticated request and WebSocket
  connection. Identity is never taken from client-supplied fields.
- **S3** Every read and write MUST be authorised on the server (row-level security or repository
  checks): a user can only change their own data, and can only read games they took part in
  unless the game is public.
- **S4** In person-vs-person games the server MUST validate every move, keep the clocks on server
  time, and decide the result. In bot games the server MUST at least verify that the submitted
  game is legal before it counts for rating.
- **S5** Ratings MUST only be computed on the server. Tables holding ratings, results and moves
  MUST NOT be writable by the `anon` or `authenticated` roles; only Edge Functions (service role)
  and `security definer` database functions write them.
- **S5a** The Supabase service-role key MUST only exist in Edge Functions and CI secrets, never in
  the web app. The web app uses only the public anon key.
- **S6** All input MUST be validated against its schema (A6) and size-limited (for example PGN
  length, message size). Rate limits MUST apply to the API, login and move submission.
- **S7** Text from users or storage MUST be inserted into the page with `textContent` or an
  escaping template. `innerHTML` with interpolated data from users, storage or the network is
  forbidden.
- **S8** The site MUST send a Content-Security-Policy. Scripts and fonts are served from our own
  origin; third-party origins are added only through an amendment.
- **S9** Secrets MUST NOT be committed. They live in the hosting provider's secret store and in CI
  secrets.
- **S10** Dependencies MUST be kept current with Dependabot, scanned with CodeQL, and GitHub
  Actions MUST be pinned to a commit SHA.
- **S11** Users MUST be able to export their data and delete their account. Deleting an account
  removes personal data; finished games kept for opponents' history are anonymised.
- **S12** Personal data collected is limited to: provider user id, display name, optional email
  (for login only), and the user's chess data. Anything more requires an amendment.
- **S13** Logs MUST NOT contain tokens, emails or other personal data beyond the internal user id.

## 5. Data and storage rules

- **D1** PostgreSQL is the source of truth for users, ratings, games, moves, puzzle attempts and
  analyses. Browser storage is a cache and MUST NOT be trusted by the server.
- **D2** Schema changes MUST be made through versioned migrations that are forward-only and
  tested. Destructive migrations (dropping or rewriting data) need a separate, explicitly approved
  pull request with a backup step.
- **D3** Derived data (rating history, statistics) MUST be recomputable from stored facts
  (`game_players`, `puzzle_attempts`).
- **D4** Stored JSON documents MUST carry a schema version, and readers MUST handle older versions.
- **D5** Moves are stored as UCI with ply number and the clock time remaining; PGN is generated,
  not the primary record.
- **D6** Data from the earlier browser-only version is imported once per user on first login, then
  owned by the server.

Initial tables: `users`, `ratings`, `games`, `game_players`, `moves`, `puzzle_attempts`,
`analyses`. New tables follow the same rules.

## 6. Testing rules

| Layer | What it proves | Tool | Rule |
|---|---|---|---|
| Domain | rules, clocks, rating, classification, state transitions | Vitest | **T1** every domain function has unit tests, including edge cases |
| Application | use cases with in-memory fakes and a fake clock | Vitest | **T2** every use case is tested for success, rejection and permission cases |
| Adapter contracts | fakes and real adapters behave the same | Vitest + Testcontainers (Postgres) | **T3** each port has one shared contract suite run against both the fake and the real adapter |
| API / realtime | auth, permissions, schemas, two clients playing, reconnect | Vitest + HTTP/WebSocket clients against a test server and database | **T4** every endpoint and message type is covered, including unauthorised access |
| End-to-end | the main user journeys in real browsers, desktop and phone (390×660) | Playwright, fake engine, test login | **T5** each feature has at least one journey; layout checks cover phone size |

- **T6** A change MUST include tests at the lowest layer that can prove it, plus a higher-layer test
  when it changes a user-visible flow.
- **T7** A bug fix MUST start with a test that reproduces the bug.
- **T8** Tests MUST be deterministic: no real network, no real time, no real Stockfish in unit or
  application tests. The real engine runs only in a small, separate smoke test.
- **T9** Tests MUST NOT be deleted or weakened to make a change pass. If a test is wrong, fixing it
  is stated explicitly in the pull request.
- **T10** Domain and application code SHOULD keep line coverage at or above 90 %.

## 7. Client and UX rules

- **U1** The interface language is Norwegian (bokmål). Code, comments and commit messages are in
  English.
- **U2** On phones, each main screen (analysis, puzzles, play) fits without page scrolling at
  390×660; lists scroll inside their own panel. No top menu, only a Home button.
- **U3** Light and dark mode are both supported; colours come from CSS variables.
- **U4** The board supports tap-to-move and drag, with animation, castling by king-to-rook, and
  promotion choice. These behaviours live in the shared board component (A10).
- **U5** Single-player features (analysis, puzzles, bot play) SHOULD keep working offline; online
  features say clearly when the connection is lost.

## 8. Delivery and environments

- **E1** All changes go through a branch and a pull request. Nothing is pushed directly to `main`.
  A pull request is merged only when CI is green. Merging never changes production (E6).
- **E2** CI runs on every push and pull request: typecheck, lint, boundary rules (A7), all tests,
  build. A red pipeline blocks merging and blocks releasing.
- **E3** The site has three channels (see `docs/RELEASING.md`):
  - **development:** every `dev/<name>` branch is built and published at `/dev/<name>/` for testing;
  - **staging:** `main` is published at `/next/`;
  - **production:** the site root, changed only by the Release or Rollback workflow.
  Database migrations and Edge Functions follow the same channels: dev and staging use the staging
  Supabase project, production uses the production project.
- **E4** CI runs the full Supabase stack locally (`supabase start`) for database and API tests. A
  separate staging project SHOULD be added before person-vs-person play is opened to others.
- **E5** Generated files (for example the offline build) are produced in CI and published as
  release assets, not committed.
- **E6** Production changes only through a release that the owner asks for. A release has a semantic
  version (`vMAJOR.MINOR.PATCH`), is built from a commit with a green CI run, and is first tested
  on staging or a dev channel.
- **E7** Every released version MUST be kept and stay reachable: as a folder at
  `/releases/<version>/`, as a git tag with a GitHub Release (with its offline file), and in
  `versions.json`. Released versions are never deleted or overwritten.
- **E8** Rollback MUST always be possible to any kept release, without rebuilding, with the
  Rollback workflow. The last known good version is the release currently in production that has
  passed its post-release check; before a release, the previous one is the rollback target.
- **E9** Database changes MUST be backward compatible with the release before them (expand, then
  contract in a later release), so a web rollback never breaks against the current database. A
  database backup is taken before every production migration.
- **E10** Before working on a change, read `versions.json` on the live site (or the `site` branch)
  to know what is in production, on staging and in each dev channel.

## 9. Change protocol

Before making any change:

1. **Classify** the change: feature, fix, refactor, data/schema, security, dependency, or
   manifest amendment.
2. **Locate** it: which layer(s) and which feature folder. If it touches more than one feature
   folder, explain why the shared part does not belong in `ui`, `core` or the domain.
3. **Check** it against every relevant rule in §3–§8. If a MUST rule would be broken, stop and
   raise it with the owner before writing code.
4. **Plan the tests** required by §6.
5. **Make** the change in small commits on a branch.

Every pull request description MUST contain this section:

```markdown
## Manifest check
- Change type: …
- Layers / features touched: …
- Rules checked: A1–A10, S…, D…, T…, U… (list the relevant ones)
- Deviations from SHOULD rules: none | … (with reason)
- Tests added: domain … / application … / contract … / API … / e2e …
- Manifest amendment needed: no | yes – see ADR-…
```

A pull request without a completed manifest check is not ready for review.

## 10. Decision records

Significant choices are recorded as Architecture Decision Records in `docs/adr/`, numbered
`NNNN-title.md`, with context, decision, alternatives and consequences. An ADR is never edited
after it is accepted; a later ADR supersedes it.

| ADR | Title | Status |
|---|---|---|
| 0001 | Adopt this architecture manifest and layered TypeScript monorepo | accepted |
| 0002 | Supabase as backend platform | accepted |
| 0003 | Login with Google, Facebook and Vipps | accepted |

## 11. Amending this manifest

- **M1** The manifest changes only by a pull request that changes this file, explains why, and is
  approved by the owner (Bent Arne). Larger changes come with an ADR.
- **M2** No code change may rely on an amendment that has not yet been merged.
- **M3** When a request conflicts with the manifest, the manifest wins until it is amended. The
  conflict is reported, not silently worked around.

## 12. Transition from the current app

The app today is a single file, `app/index.html`, with browser-only storage. Until the migration
is complete:

- **R1** Changes to `app/index.html` SHOULD follow the intent of §3–§7 as far as a single file
  allows: no new duplicated components (A10), no new `innerHTML` with interpolated data (S7), no new
  rule logic mixed into rendering (A5).
- **R2** Migration follows these phases, each one leaving the app fully working:
  1. **Foundation:** TypeScript, Vite, monorepo; extract domain and use cases with tests; CI with
     boundary rules. No visible change for users.
  2. **Accounts and storage:** server, database, login, import of existing local data; ratings and
     history on the server.
  3. **Person vs person:** challenge links, then a lobby; server clocks; reconnection; separate
     rating pools.
  4. **Hardening:** observability, rate-limit tuning, fair-play checks.
- **R3** The Claude artifact version stays a single-player demo; the GitHub Pages site becomes the
  main app from phase 2.
- **R4** `apps/web/src/legacy/` holds the not-yet-migrated feature code. New features MUST NOT be
  added there; code leaving it moves into `features/`, `ui/`, `core/` or the domain with tests.
