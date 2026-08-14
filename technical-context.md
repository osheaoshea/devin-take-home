# Internal Tools Platform — Project Context

> **Purpose of this file.** Single source of truth for the project. It is the input for generating four build specs (`specs/00-foundation.md`, `specs/01-kyc.md`, `specs/02-refunds.md`, `specs/03-flags.md`). Each spec must be self-contained, reference only this context and the foundation's public interfaces, and include its UI. Do not invent features beyond this document.

## 1. Scenario

A Series C fintech (~60 engineers) pays ~$250K/yr for Microsoft Power Apps, running 3 internal tools (KYC review queue, refunds dashboard, feature-flag admin) with 10+ more planned. We are demonstrating that Devin + a thin in-house platform can replace Power Apps: the **platform is a fixed cost built once; each app is a small marginal cost**. The prototype is **production-shaped, not production-scale**: real auth patterns, real migrations, real access control and audit; mocked external services and free-tier infra.

Client is a Microsoft shop → their identity provider is Entra ID.

## 2. Tech stack (decided — do not substitute)

| Layer            | Choice                                                  | Notes                                                                                                                                                                                     |
| ---------------- | ------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Framework        | Next.js (App Router) + TypeScript                       | Single app, one repo. Server components + server actions preferred.                                                                                                                       |
| Database         | PostgreSQL                                              | Docker Compose locally; Neon (managed Postgres) when deployed. Environments differ **only** by `DATABASE_URL`.                                                                            |
| ORM / migrations | Drizzle                                                 | Drizzle owns the schema. TypeScript table definitions → `drizzle-kit generate` SQL migrations, committed to git. No other migration tooling.                                              |
| Auth             | Auth.js (NextAuth)                                      | Entra ID OIDC provider configured for production; **mock IdP (credentials provider) in dev/demo** issuing fake Entra-style group claims. Sessions stored in Postgres via Drizzle adapter. |
| Styling / UI     | Tailwind + a small shared component library in `lib/ui` | Clean, dense, admin-tool aesthetic. Dark-on-light. No component framework bloat.                                                                                                          |
| Validation       | Zod                                                     | All form inputs and webhook payloads validated with zod schemas.                                                                                                                          |
| Deploy           | Vercel + Neon                                           | App must be serverless-compatible (no filesystem persistence, no long-lived processes).                                                                                                   |
| CI               | GitHub Actions                                          | typecheck, lint, unit tests, build on every PR.                                                                                                                                           |
| Tests            | Vitest (unit) + Playwright (smoke)                      | See testing policy §8.                                                                                                                                                                    |

Package manager: pnpm. Node LTS.

## 3. Repository layout

```
/specs                  # hand-reviewed build specs (this file's children)
/src
  /app
    /(hub)              # landing hub: app cards, role indicator
    /kyc                # app 1
    /refunds            # app 2
    /flags              # app 3
    /admin              # audit log viewer, demo tools
    /api/webhooks/kyc   # inbound mock-provider webhook
  /lib
    /auth               # Auth.js config, group→role mapping
    /rbac               # roles, permissions, middleware + query-layer enforcement
    /audit              # audit wrapper + reader
    /workflow           # state machines + guards
    /ui                 # DataTable, Form, ApprovalFlow, DetailDrawer, StatusBadge
    /db                 # drizzle schema, client, seed
    /providers          # outbound service interfaces + mock implementations
/drizzle                # generated migrations
docker-compose.yml      # single postgres service
```

## 4. Foundation layer (spec 00 — includes the hub page)

### 4.1 Auth & identity

- Auth.js with two providers: Entra ID OIDC (config present, used in prod) and a **demo credentials provider** (dev/demo only) whose accounts carry fake Entra group claims.
- On sign-in: read `groups` claim → resolve app roles via a **group→role map** (config: `ENTRA_GROUP_MAP` env or small table) → persist a snapshot of resolved roles on the `users` row (so audit entries record the roles the actor held _at the time_).
- MFA step-up: stubbed hook point (interface + no-op impl), documented — not implemented.

### 4.2 Roles (RBAC)

Roles are derived from IdP groups, never self-assigned in-app:

| Role              | Powers (summary)                                                       |
| ----------------- | ---------------------------------------------------------------------- |
| `viewer`          | Read-only everywhere                                                   |
| `kyc_analyst`     | Work KYC queue: claim, review, approve/reject standard cases, escalate |
| `kyc_manager`     | Everything analyst can + resolve escalated cases (four-eyes, §5.1)     |
| `support_agent`   | Create/approve small refunds (≤ £100)                                  |
| `finance_manager` | Approve refunds ≤ £5,000; co-approve large refunds (§5.2)              |
| `engineer`        | Manage feature flags                                                   |
| `admin`           | All of the above + audit log viewer + demo tools                       |

Enforcement at **two layers**: route/action middleware (`requireRole`, `requirePermission`) _and_ query scoping in `lib/db` accessors. Hidden buttons are not access control.

### 4.3 Audit (crown jewel)

- Append-only `audit_log` table: `id, actor_id, actor_roles_snapshot, action, entity_type, entity_id, before (jsonb), after (jsonb), created_at`.
- Every mutation in the codebase goes through `audited(action, fn)` — a wrapper in `lib/audit` that captures before/after and writes the entry in the same transaction. **Convention: no direct table writes outside the wrapper.**
- Reader UI at `/admin/audit`: filterable by actor, entity, action, date; diff view of before/after. Admin-only.

### 4.4 Workflow (states & guards)

`lib/workflow` provides a tiny generic state machine: a transition map per entity type + guard functions evaluated on each transition. Guards receive `{ actor, entity, transition, context }` and may combine role checks, entity state, and cross-entity rules (e.g. "second approver ≠ first approver"). All transitions are executed through the workflow module and are therefore audited.

### 4.5 UI primitives (`lib/ui`)

- `DataTable` — server-driven sort/filter/paginate, row click → drawer
- `Form` — zod-schema-driven fields, inline errors
- `ApprovalFlow` — shows required approvals, who approved, action buttons gated by RBAC
- `DetailDrawer`, `StatusBadge`, `PageShell` (left sidebar: app nav, account block with role indicator and demo user switcher)

### 4.6 Hub page

Landing page (post-login): card per app (name, description, the roles that can enter, live count badge e.g. pending KYC cases), role indicator, link to audit viewer for admins. Visually echoes an internal-tools portal.

### 4.7 Seed & demo accounts

`pnpm db:seed` creates realistic demo data (≈40 KYC cases across states, ≈30 refunds, ≈12 flags) and these demo logins (listed in README):

| Email            | Password | Fake groups → roles                    |
| ---------------- | -------- | -------------------------------------- |
| admin@demo.co    | demo     | admin                                  |
| manager1@demo.co | demo     | kyc_manager, finance_manager, engineer |
| manager2@demo.co | demo     | kyc_manager, finance_manager, engineer |
| viewer@demo.co   | demo     | viewer                                 |

The two managers are deliberately identical in authority: four-eyes (KYC) and dual approval
(refunds) need a distinct second actor. A demo user switcher in the sidebar swaps between these
accounts through the ordinary mock-IdP sign-in path.

## 5. The three apps

### 5.1 KYC review queue (spec 01) — the deep one

- **Inbound data:** `/api/webhooks/kyc` accepts an Onfido-shaped payload (zod-validated) and creates a case. A "simulate new applicant" admin/demo button (and the seed script) POSTs realistic fake payloads at it. Schema and data are real; only the sender is fake.
- **Case fields:** applicant (name, dob, country, doc type, doc images = placeholder URLs), provider risk score, watchlist hits (fake), SLA due-at.
- **States:** `pending → in_review → approved | rejected | escalated`; `escalated → approved | rejected`.
- **Guards:** analyst can claim (`pending → in_review`, assigns to self) and resolve standard cases; **escalated cases require `kyc_manager` AND resolver ≠ the person who escalated** (four-eyes). Terminal states are immutable.
- **UI:** queue table (filter by state/risk/SLA, SLA countdown badges), case detail drawer (applicant info, risk panel, doc placeholders, per-case audit trail), approve/reject/escalate actions with reason codes, "my cases" view.

### 5.2 Refunds dashboard (spec 02) — the workflow one

- **Data:** refund requests referencing fake payments from a `MockStripeProvider` (see §6). Fields: customer, original payment, amount, currency, reason code, requester.
- **States:** `requested → approved | rejected`; large refunds pass through `needs_second_approval`.
- **Threshold routing (guards):** `support_agent` approves ≤ £100; `finance_manager` approves ≤ £5,000; > £5,000 requires **two distinct** `finance_manager` approvals. On final approval the outbound provider's `issueRefund()` is called (mock records it).
- **UI:** dashboard tiles (open requests, total exposure, approved-this-week), request table, detail drawer with ApprovalFlow showing threshold logic, approve/reject with reason.

### 5.3 Feature-flag admin (spec 03) — deliberately thin

- Flags: key, description, per-environment state (`dev`/`staging`/`prod`), boolean or percentage rollout, kill switch (all envs off, one click, `engineer`+).
- Change history view **derived from the audit log** (no separate history table — demonstrates foundation reuse).
- Prod changes show a confirm modal. A read-only public evaluation endpoint (`GET /api/flags/:env`) stands in for SDK delivery.
- Thinness is intentional: this app is the marginal-cost proof point.

## 6. Mocking strategy

- **Inbound:** real webhook routes + fake senders (seed script / simulate buttons). Production swap = point the real provider at the URL.
- **Outbound:** interfaces in `lib/providers` (`KycProvider`, `PaymentsProvider`) with mock implementations that persist/log instead of calling out. Config flag selects the implementation. The interface is the production artifact.
- **Identity:** mock IdP issues fake group claims so the _real_ group→role mapping path runs in demo.
- Out loud in the story: "mocked at the boundary, real everywhere else."

## 7. Schema outline (Drizzle, one migration history)

`users`, `sessions/accounts` (Auth.js adapter tables), `audit_log` (§4.3), `kyc_cases`, `kyc_events` (webhook payload archive), `refunds`, `refund_approvals` (one row per approval — supports dual approval), `flags`, `flag_states` (per-env). All FKs and enums explicit; states stored as Postgres enums.

## 8. Testing policy (definition of done)

- **Unit tests (Vitest) are mandatory at the seams:** `lib/rbac` (role resolution + permission checks), `lib/audit` (wrapper writes correct before/after in-transaction), `lib/workflow` (every guard, incl. four-eyes and dual-approval edge cases: same-approver rejection, threshold boundaries). Specs should instruct these tests to be written alongside/before the implementation of each guard.
- **Playwright smokes:** login as analyst → approve a standard case; login as analyst → blocked from resolving an escalated case; engineer flips a flag → audit entry visible to admin.
- UI/CRUD beyond this is covered by smokes, not unit ceremony.

## 9. Conventions Devin must follow (→ knowledge entries)

1. Every mutation goes through `audited()`. No exceptions.
2. No inline role checks — use `lib/rbac` helpers.
3. All state changes go through `lib/workflow`.
4. Zod-validate every external input (forms, webhooks).
5. Server components/actions by default; client components only where interactivity requires.
6. Apps build **only** on foundation modules; if a primitive is missing, extend `lib/ui`, don't fork it.
7. One session = one spec = one PR.

## 10. Explicitly out of scope (state in README/one-pager, do not build)

Real provider integrations (Onfido/Stripe — interfaces only), real Entra tenant/MFA, notifications (email/Teams), mobile rendering, flag SDKs, multi-region/data-residency, retention policies. Each is a line in the honest-tradeoffs analysis, not a build item.

## 11. Later phase (not in specs 00–03)

Devin-feature layer added after core build: "request a tool" form → Devin session API; scheduled nightly audit-anomaly/stale-flag review session; analytics API panel (ACU/cost data feeds the cost slide); DeepWiki link in README. Kept out of the app specs deliberately.
