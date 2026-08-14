# Internal Tools Platform

A thin in-house platform for internal tools, built to replace a $250K/year Power Apps estate. The
platform — identity, roles, audit, workflow, UI primitives, schema — is the fixed cost, built once
here in spec 00. Each tool (KYC review, refunds, feature flags) is then a small marginal cost.

Production-shaped, not production-scale: real auth patterns, real migrations, real access control,
real audit behaviour. External services (Onfido, Stripe, Entra) are mocked at documented seams.

## Setup

```bash
pnpm install
cp .env.example .env
# set DEMO_AUTH_ENABLED=true in .env to use the mock IdP locally
docker compose up -d          # postgres:16 on :5432
pnpm db:migrate               # apply committed Drizzle migrations
pnpm db:seed                  # demo accounts + realistic data
pnpm dev                      # http://localhost:3000
```

| Command            | What it does                                             |
| ------------------ | -------------------------------------------------------- |
| `pnpm typecheck`   | `tsc --noEmit`                                           |
| `pnpm lint`        | ESLint (type-aware, plus the platform conventions below) |
| `pnpm format`      | Prettier write (`format:check` in CI)                    |
| `pnpm test`        | Vitest — unit plus database-backed audit/workflow tests  |
| `pnpm test:e2e`    | Playwright smoke tests against a production build        |
| `pnpm db:generate` | Generate a migration from `src/lib/db/schema/`           |
| `pnpm db:migrate`  | Apply migrations                                         |
| `pnpm db:seed`     | Reseed demo data (idempotent)                            |
| `pnpm db:reset`    | Drop everything, then `db:migrate` + `db:seed`           |

Database-backed tests need `TEST_DATABASE_URL` (see `.env.example`); the suite creates and migrates
that database itself.

## Demo accounts

Password for all accounts: `demo`. Sign-in is a mock IdP that issues the same Entra-style group
claims the real tenant would, so role resolution is exercised end to end.

It is off by default (`DEMO_AUTH_ENABLED=false`) and refused outright unless the app is served from
localhost, so an environment that inherits the flag still cannot be signed into with the fixed demo
password; a throwaway hosted demo has to opt back in with `DEMO_AUTH_ALLOW_REMOTE_HOST=true`. Failed
attempts are throttled per client and account.

| Email              | Groups → roles                                          |
| ------------------ | ------------------------------------------------------- |
| `admin@demo.co`    | admin                                                   |
| `manager1@demo.co` | kyc_manager, finance_manager, engineer                  |
| `manager2@demo.co` | kyc_manager, finance_manager, engineer (second manager) |
| `viewer@demo.co`   | viewer                                                  |

The two managers carry identical groups on purpose: four-eyes and dual approval need two distinct
actors with the same authority. `admin` is the only account holding `audit.read`, so the Audit link
and `/admin/audit` are refused for everyone else with a 403 page.

The sidebar's account block carries a demo user switcher (only while `DEMO_AUTH_ENABLED` is on): it
signs the chosen account in through the same mock-IdP path as the sign-in page, so its roles are
resolved from group claims rather than impersonated.

## Architecture

| Module              | Responsibility                                                                               |
| ------------------- | -------------------------------------------------------------------------------------------- |
| `src/lib/auth`      | Auth.js config, Entra ID provider, mock IdP sign-in, group→role resolution, step-up MFA seam |
| `src/lib/rbac`      | Roles, permissions, `requireRole` / `requirePermission` (throw), `enforce*` (403 page)       |
| `src/lib/audit`     | `audited()` — mutation and audit entry in one transaction — and the audit reader             |
| `src/lib/workflow`  | Generic transition machine plus guards (four-eyes, thresholds, permissions)                  |
| `src/lib/db`        | Drizzle schema, client, accessors, mutations, migrations, seed                               |
| `src/lib/ui`        | `PageShell`, `DataTable`, `Form`, `DetailDrawer`, `ApprovalFlow`, `StatusBadge`, `JsonDiff`  |
| `src/lib/providers` | `KycProvider` / `PaymentsProvider` interfaces with mock implementations                      |

Access control is enforced twice: at the route or action, and again in the query accessors, so a
hidden button is never the access control. `src/middleware.ts` adds a coarse outer gate — it
redirects a request carrying no session cookie to `/signin` — but it runs on the edge, cannot
reach the database, and is never the authorization decision.

A transition is a compare-and-swap: guards are evaluated against an entity read outside the
transaction, so the update carries the expected from-state in its `WHERE` and is refused
(`stale_state`) when another writer moved the row first — the loser's transaction rolls back and
writes no audit entry.

The audit log is append-only in the database, not only by convention: a trigger raises on any
`UPDATE` or `DELETE` against `audit_log`.

### Conventions (enforced, not just documented)

1. Every mutation goes through `audited()` — ESLint blocks direct `@/lib/db/client` imports outside
   `src/lib/db`, `src/lib/audit` and `src/lib/auth` (session rows).
2. No inline role checks; use `lib/rbac`.
3. All state changes go through `lib/workflow`.
4. Validate every external input with Zod.
5. Server components and server actions by default; client components only for interactivity.
6. Apps extend `lib/ui` rather than forking it.
7. One spec, one PR.

## Mocked boundaries

`MockKycProvider` returns Onfido-shaped check payloads (validated with the same Zod schema a real
webhook would be), and `MockStripeProvider` records refunds in memory and returns provider refund
ids. Swapping in the real clients means implementing the interface — no call sites change. Step-up
MFA is a documented `StepUpProvider` interface with a no-op implementation.

## Out of scope (deliberately)

Real Onfido/Stripe integrations, a real Entra tenant, real MFA, notifications, mobile layouts,
feature-flag SDKs, multi-region and data residency, retention policies.

## Deployment

Vercel plus Neon. Environments differ only by `DATABASE_URL`; migrations are applied from the
committed `drizzle/` history. GitHub Actions runs typecheck, lint, format check, migrations, unit
tests, build, seed and Playwright smoke on every PR.
