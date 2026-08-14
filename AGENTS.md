# AGENTS.md — conventions for this repo

Source of truth for how code is written here. Read this before touching anything. Items marked **(CI)**
fail the build, not the review.

Project context: `technical-context.md`. Build specs: `specs/`. **One session = one spec = one PR.**

## Non-negotiables

1. **Every mutation goes through `audited()`** (`lib/audit`), with an explicit `actor`. The Drizzle client
   is importable only from `lib/db`, `lib/audit` and `lib/auth` (session rows). **(CI)**
2. **Role logic lives in `lib/rbac`.** Call `can`, `hasRole`, `requireRole`, `requirePermission`,
   `enforceRole`, `enforcePermission` — a comparison against `actor.roles` at a call site belongs in
   `lib/rbac` instead.
3. **State changes go through a `lib/workflow` machine.** `defineMachine(...).transition()` evaluates the
   guards and calls `audited()` itself, so a state change written any other way is unaudited and unguarded.

## Authorization

- The authoritative layer is the **query layer**: every accessor in `lib/db/queries` takes the `Actor` as
  its first argument and calls `requirePermission` (or scopes its `where`) itself.
- Pages and route segments call `requireActor()` then `enforcePermission(actor, ...)`, which interrupts
  rendering so Next serves `app/forbidden.tsx` with a real 403. Server actions and accessors use the
  throwing `requirePermission`, having nothing to render.
- `middleware.ts` is a **cookie-presence check only** — it redirects a request carrying no session cookie
  to `/signin`. It cannot reach the database, so it is defense in depth, never the decision.
- Gate the accessor first, then the UI: a button rendered only for permitted actors is presentation.
- Roles come from IdP groups (`ENTRA_GROUP_MAP`, `resolveRoles`) and are snapshotted on the `users` row at
  sign-in. `getActor()` reads that row per request, so the row is the authorization input.

## Auth

- Sessions are **database-backed**: the Auth.js Drizzle adapter with `session: { strategy: 'database' }`,
  rows in `sessions`.
- Entra ID OIDC is the only Auth.js provider. Demo sign-in is not a provider: `signInAsDemoUser()`
  validates a mock-IdP account, re-resolves its fake group claims to roles, inserts a `sessions` row and
  sets the session cookie — so demo and production share one session mechanism.
- Demo sign-in is gated by `demoAuthEnabled()` (`DEMO_AUTH_ENABLED=true` **and** a locally served app,
  unless `DEMO_AUTH_ALLOW_REMOTE_HOST=true`), and throttled per client and account.

## Data

- Drizzle owns the schema. TypeScript tables → `pnpm db:generate` → committed SQL. Append to a generated
  migration only for SQL Drizzle cannot express (e.g. the append-only trigger).
- `audit_log` is append-only, enforced by a trigger shipped in `drizzle/0001_append_only_audit_log.sql`.
- The driver is **postgres.js over TCP**, with real transactions, so `audited()` writes the mutation and
  its audit entry atomically. Every DB-touching page, action and route runs on the Node runtime.
- A state change is a **compare-and-swap**: guards run against an entity read outside the transaction, so
  the mutation passes the expected `from` state to `compareAndSwapUpdate`, which raises `StaleStateError`
  when another writer moved the row first. Pass that same read entity to `audited()` as `before`.
- Money is stored in **minor units as integers** with an explicit currency column.
- Time comes from `now()` in `lib/time`; tests and seeds pin it with `setNow()`.

## Adding an app

An app is a set of **slice files** plus one registry entry. Foundation logic stays untouched:

- **Layering:** per-app domain logic lives in `lib/apps/<app>/`, data slices in
  `lib/db/{schema,mutations,queries,seed}/<app>.ts` and pages in `app/(apps)/<app>/`; the foundation
  modules at the top of `lib/` (`lib/audit`, `lib/auth`, `lib/rbac`, `lib/workflow`, `lib/time`, `lib/ui`, …)
  are never app-specific.
- `lib/apps/<app>/` — the app's own domain logic: its `lib/workflow` machine, reason codes, SLA maths.
- `lib/db/schema/<app>.ts` — its tables and enums, one export line in the schema barrel.
- `lib/db/queries/<app>.ts` — accessors, actor first, one export line in the query barrel.
- `lib/db/mutations/<app>.ts` — a `<App>Mutations` interface plus its factory; add it to the `Tx`
  `extends` clause and the `mutations()` spread in `lib/db/mutations/index.ts`.
- `lib/db/seed/<app>.ts` — deterministic seed data, called from `lib/db/seed.ts`.
- One `AppDescriptor` in `APP_REGISTRY` (`lib/apps/registry.ts`), which is what puts the app in the nav
  and on the hub. Flip `available` to `true` when the app ships.
- Pages under `src/app/(apps)/<app>/`, built from `lib/ui` primitives (`PageShell`, `DataTable`, `Form`,
  `DetailDrawer`, `StatusBadge`, `ApprovalFlow`, `JsonDiff`). Extend `lib/ui` when a primitive is missing.

## Code

- Server components and server actions by default; client components only where interactivity requires.
- Zod-validate every external input (forms, webhooks, route params, `searchParams`).
- Guard refusal reasons (`missing_permission:kyc.approve`, `stale_state`, …) travel untranslated and
  render inline next to the blocked action, which stays visible but disabled. The app maps them to a
  sentence at the presentation edge (e.g. `lib/apps/kyc/refusal-copy.ts`) and falls back to the raw code,
  so a new guard is never silently swallowed.
- Exact versions in `package.json`, no caret ranges.

## Testing

Unit tests are mandatory at the seams and written alongside or before the code: `lib/rbac` (the policy
matrix, table-driven), `lib/audit` (before/after correctness and rollback, against a real throwaway
Postgres), `lib/workflow` (every guard, exercised through the machine). Playwright covers UI flows. Seeds
are deterministic and take their dates from `now()`.

## Git

- **App PRs merge serially.** Each app session rebases on `main` and regenerates its Drizzle migration
  after the rebase, before merge, so the migration journal never conflicts with a parallel app PR.
- Keep plans and TODOs out of the repo, and `.env` out of git.
