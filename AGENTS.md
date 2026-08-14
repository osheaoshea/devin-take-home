# AGENTS.md — conventions for this repo

Source of truth for how code is written here. Read this before touching anything. Items marked **(CI)** fail the
build, not the review.

Project context: `technical-context.md`. Build specs: `specs/`. Design records: `plans/`.
**One session = one spec = one PR.**

## Non-negotiables

1. **Every mutation goes through `audited()`** (`lib/audit`). No direct table writes outside `lib/audit` and
   `lib/db`. **(CI)**
2. **No inline role checks.** Use `lib/rbac` helpers (`requireRole`, `requirePermission`, `hasPermission`).
3. **All state changes go through `lib/workflow`.** `transition()` calls `audited()` itself, so a state change
   written any other way is both unaudited and unguarded.

## Authorization

- The authoritative layer is the **data-access layer and server actions**: every `lib/db` accessor takes
  `actor` as its first argument and scopes its query; every action calls `requirePermission`.
- Layout-level checks are **UX redirects only** — never the only check.
- `proxy.ts` does **cookie-presence checks only** (Next 16 renamed `middleware.ts` → `proxy.ts`; the exported
  function is `proxy` and it runs on the Node runtime).
- Every route handler calls `requirePermission` itself, except the two public endpoints: the KYC webhook and
  the flag-evaluation endpoint.
- Hidden buttons are not access control. Gate the accessor, then the UI.
- Roles come from IdP groups via `ENTRA_GROUP_MAP` and are resolved from the `users` row **per request**. Roles
  in the session/JWT are a UI hint only — never an authorization input.

## Data

- Drizzle owns the schema. TypeScript tables → `drizzle-kit generate` → committed SQL. No other migration tool,
  and no hand-editing generated migrations except to append SQL Drizzle cannot express (e.g. triggers).
- **Per-app tables and enums live in that app's own schema file** (`lib/db/schema/<app>.ts`), re-exported from
  the barrel. Foundation owns only genuinely shared enums (currently none).
- `audit_log` is append-only, enforced by a DB trigger.
- Money is stored in **minor units as integers** with an explicit currency column.
- The driver is `pg` (TCP), so **every DB-touching route, action, and page declares the Node runtime.** No Edge.

## Code

- Server components and server actions by default; client components only where interactivity requires.
- Zod-validate every external input (forms, webhooks, route params, env).
- Actions return `ActionResult<T>` and never throw for expected failures. Guard reason codes pass through
  untranslated and render inline next to the blocked action — no error pages.
- **All time comes from `lib/time`'s `Clock`.** `new Date(` outside `lib/time` fails lint. **(CI)**
- Apps build only on foundation modules. If a primitive is missing, extend `lib/ui` — never fork it.
- Adding an app must touch foundation code exactly once: one line in the `lib/apps` barrel.
- Exact pins for `next` and `next-auth` (no caret ranges).

## Testing

Unit tests are mandatory at the seams and are written **alongside or before** the code they cover: `lib/rbac`
(policy matrix, table-driven), `lib/audit` (before/after correctness and rollback), `lib/workflow` (every
guard, including four-eyes and dual-approval boundaries). Playwright covers UI/CRUD; don't write unit ceremony
for it. Seeds are deterministic and all dates derive from the `Clock`.

## Git

- **App PRs merge serially.** Each app session rebases on `main` and then **regenerates its Drizzle migration
  after the rebase, before merge**, so the migration journal never conflicts with a parallel app PR.
- Don't commit plans/TODOs as code, and never commit `.env`.
