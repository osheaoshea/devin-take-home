# Spec 00 — Foundation (platform + hub)

> Derived from `technical-context.md` §2, §3, §4, §6, §7, §8, §9. Self-contained: everything spec 01–03 build on is defined here. Nothing outside the technical context is invented.

## Problem Statement

The client pays ~$250K/yr for Power Apps to run three internal tools, with 10+ more planned. Every new tool re-pays for identity, access control, audit and workflow. Engineers want to add an internal tool without re-solving those problems, and compliance wants to answer "who changed what, when, and with which roles?" for every tool at once.

There is nothing to build the three apps on yet: the repository is empty. Until the platform exists, each app would carry its own auth, its own permission checks and its own history table — exactly the duplicated cost that makes Power Apps look reasonable.

## Solution

A thin in-house platform: one Next.js + TypeScript repo where identity, roles, audit, workflow and UI primitives are **fixed cost, built once**, and each app is a small marginal cost on top.

After this spec:

- A user signs in through a mock Entra-shaped IdP in dev/demo (real Entra ID OIDC config present for prod), and their IdP groups are mapped to app roles — never self-assigned.
- Any mutation written by any future app goes through `audited()`, which records actor, roles held at the time, before/after JSON and timestamp in an append-only log, in the same transaction as the change.
- Any state change goes through a generic guarded state machine, so rules like four-eyes approval and threshold routing are declarative and unit-tested.
- Admins can read and filter the audit log at `/admin/audit` and see a before/after diff.
- A hub landing page lists the apps as cards with the roles that may enter and a live count badge, plus a role indicator.
- Adding an app means: a Drizzle table, a workflow transition map with guards, a couple of server actions wrapped in `audited()`, and pages built from `lib/ui` primitives.

Spec 00 ships the platform and the hub. The three apps ship in specs 01–03; the hub's app cards link to routes those specs create, and are shown as "coming soon" until then.

## User Stories

### Auth & identity

1. As an engineer at the client, I want to sign in with my Microsoft (Entra ID) account in production, so that I don't manage another password.
2. As a demo operator, I want to sign in as one of eight pre-seeded demo accounts in dev/demo, so that I can show every role's view without an Entra tenant.
3. As a demo operator, I want the demo accounts to carry fake Entra-style group claims, so that the _real_ group→role mapping code path runs during the demo.
4. As a security reviewer, I want roles derived only from IdP groups, so that no in-app action can grant a user new powers.
5. As a security reviewer, I want the roles a user held to be snapshotted on their user row at sign-in, so that audit entries record the roles the actor held at the time of the action.
6. As a signed-out visitor, I want any app route to redirect me to sign-in, so that nothing is reachable unauthenticated.
7. As a signed-in user, I want my session to survive a server restart and work on serverless, so that sessions live in Postgres and not in memory.
8. As a compliance reviewer, I want to see where MFA step-up would hook in, so that the gap is documented rather than hidden (interface + no-op impl only).

### Roles & access control

9. As a `viewer`, I want read-only access everywhere, so that I can look without risk of changing anything.
10. As a role-holder, I want the nav and hub cards to show only what I can enter, so that the tool feels tailored.
11. As a security reviewer, I want route/action-level enforcement (`requireRole`, `requirePermission`) _and_ query-layer scoping in `lib/db` accessors, so that hiding a button is never the access control.
12. As an attacker POSTing directly to a server action, I want to be rejected with an authorization error, so that the UI is not the security boundary.
13. As an `admin`, I want the union of all role powers plus the audit viewer and demo tools, so that I can operate the platform.
14. As a platform engineer, I want roles and permissions declared in one module with a group→role map read from config (`ENTRA_GROUP_MAP`), so that onboarding a new IdP group is a config change.
15. As a platform engineer, I want an unknown IdP group to be ignored rather than to fail sign-in, so that the client's group sprawl doesn't lock people out.

### Audit

16. As a compliance reviewer, I want an append-only `audit_log` with actor, roles snapshot, action, entity type/id, before, after and timestamp, so that every change is attributable.
17. As a compliance reviewer, I want the audit entry written in the same transaction as the mutation, so that a change can never exist without its audit trail.
18. As a compliance reviewer, I want a failed mutation to leave no audit entry, so that the log never shows changes that didn't happen.
19. As a platform engineer, I want a single `audited(action, fn)` wrapper as the only sanctioned write path, so that "no direct table writes outside the wrapper" is a reviewable convention.
20. As an `admin`, I want to filter the audit log by actor, entity type, entity id, action and date range at `/admin/audit`, so that I can answer an auditor's question quickly.
21. As an `admin`, I want a before/after diff view per entry, so that I can see exactly which fields changed.
22. As a non-admin, I want `/admin/audit` to reject me, so that the log isn't a data leak.
23. As a future app author, I want the audit log to be reusable as an entity's history view, so that spec 03's flag change history needs no separate table.

### Workflow

24. As a platform engineer, I want a generic state machine (transition map per entity type + guards) in `lib/workflow`, so that each app declares states instead of writing ad-hoc `if` chains.
25. As a platform engineer, I want guards to receive `{ actor, entity, transition, context }`, so that a rule can combine role, entity state and cross-entity facts.
26. As a platform engineer, I want an undeclared transition to be rejected, so that terminal states are immutable by construction.
27. As a platform engineer, I want every transition executed through the workflow module to be audited automatically, so that no state change escapes the log.
28. As a platform engineer, I want composable guard helpers (`hasRole`, `not`, `all`, `any`, `distinctActor`) so that four-eyes (spec 01) and dual approval (spec 02) are expressed without new machinery.
29. As a platform engineer, I want a rejected transition to return a typed failure with the guard's reason, so that the UI can explain _why_ an action is unavailable.

### UI primitives & hub

30. As an app author, I want a `DataTable` with server-driven sort, filter and pagination and row-click into a drawer, so that a queue view is a few lines of config.
31. As an app author, I want a zod-schema-driven `Form` with inline field errors, so that validation lives in one schema shared by client and server.
32. As an app author, I want an `ApprovalFlow` component that renders required approvals, who approved, and RBAC-gated action buttons, so that specs 01–03 don't each design approvals.
33. As an app author, I want `DetailDrawer`, `StatusBadge` and `PageShell` (nav, role indicator, app switcher), so that all apps look like one product.
34. As a signed-in user, I want a hub landing page with one card per app showing name, description, the roles that can enter and a live count badge, so that I can find my tool.
35. As an `admin`, I want a link to the audit viewer and demo tools from the hub, so that operator functions are discoverable.
36. As a user without a role for an app, I want its card visibly disabled with the required roles listed, so that I know who to ask for access.

### Data, seed & demo

37. As a demo operator, I want `pnpm db:seed` to create realistic demo data (~40 KYC cases across states, ~30 refunds, ~12 flags) and the eight demo logins, so that the demo has depth on first run.
38. As a developer, I want `docker compose up` + `pnpm db:migrate` + `pnpm db:seed` to be the whole local setup, so that onboarding is minutes.
39. As a developer, I want environments to differ **only** by `DATABASE_URL`, so that Neon in production needs no code change.
40. As a reviewer, I want Drizzle to own the schema with generated SQL migrations committed to git, so that schema history is reviewable and there is exactly one migration tool.
41. As a developer, I want seeding to be idempotent, so that re-running it doesn't duplicate demo data.

### Repo hygiene (the repo is empty today)

42. As a contributor, I want strict TypeScript, ESLint and Prettier configured with `pnpm typecheck`, `pnpm lint`, `pnpm format:check`, so that style is decided once and mechanically enforced.
43. As a contributor, I want a lint rule that fails direct table writes outside `lib/audit` and `lib/db`, so that convention 1 is enforced by CI rather than by review memory.
44. As a contributor, I want GitHub Actions to run typecheck, lint, unit tests and build on every PR, so that main stays green.
45. As a contributor, I want Vitest and Playwright wired up with example runs, so that specs 01–03 add tests instead of test infrastructure.
46. As a contributor, I want a README covering setup, demo logins, architecture and explicit out-of-scope items, so that the honest-tradeoffs story is in the repo.

## Implementation Decisions

### Modules and their public interfaces

`lib/rbac` — the only place role logic lives.

```ts
type Role = 'viewer' | 'kyc_analyst' | 'kyc_manager' | 'support_agent'
          | 'finance_manager' | 'engineer' | 'admin';
type Permission = (typeof PERMISSIONS)[number];   // union of literals: 'kyc.claim', 'refunds.approve', …

resolveRoles(groups: string[], map: GroupRoleMap): Role[]   // unknown groups ignored, deduped
permissionsFor(roles: Role[]): Set<Permission>              // admin = union of all
can(actor: Actor, permission: Permission): boolean
requireRole(actor, ...roles): void        // throws AuthorizationError
requirePermission(actor, permission): void
enforceRole(actor, ...roles): void        // route-level: interrupts with a 403 page
enforcePermission(actor, permission): void
```

- `admin` is expanded to the union of all role permissions in `permissionsFor`, not special-cased at call sites.
- The group→role map is parsed from `ENTRA_GROUP_MAP` (JSON) with a zod schema; a documented default map is used in dev/demo.
- Query scoping: `lib/db` accessors take the `Actor` and apply role-derived `where` clauses, so an analyst listing cases cannot receive rows they may not see. Accessors — not callers — own scoping.

`lib/audit` — the only sanctioned write path.

```ts
audited<T>(options: {
  actor: Actor;
  action: string;                     // 'kyc.case.approve'
  entityType: string; entityId: string;
  before?: unknown;                   // the entity the caller read before the mutation
  after?: (result: T) => unknown;     // defaults to the value the mutation returned
}, fn: (tx: Tx) => Promise<T>): Promise<T>
readAuditLog(actor, filter): Promise<AuditEntry[]>         // admin-only, filterable
readAuditLogPage(actor, filter): Promise<AuditLogPage>     // entries + unpaged total
```

- Opens a Drizzle transaction, runs `fn` with the mutation surface (`Tx`), then inserts the audit row inside the same transaction; a thrown error rolls both back.
- `actor_roles_snapshot` comes from the user's persisted snapshot, not from a live re-resolution.
- `before`/`after` are stored as `jsonb`. `before` is **caller-supplied** — the entity read before the change, which is also the compare-and-swap read the guards ran against; `after` is derived from what the mutation returned unless an explicit `after` mapper is given.
- `fn` receives `Tx`, the per-app mutation surface assembled in `lib/db/mutations`, so a caller cannot reach the raw client from inside the wrapper.

`lib/workflow` — generic guarded state machine.

```ts
type Guard<E> = (ctx: { actor: Actor; entity: E; transition: string; context?: unknown })
  => true | { ok: false; reason: string };

defineMachine<E, S extends string>({
  entityType: string;                                   // audit entity type, e.g. 'kyc_case'
  stateOf: (entity: E) => S;
  transitions: Partial<Record<string, Guard<E>[]>>;      // keyed `from->to`
  persist: (args: { tx: Tx; entity: E; from: S; to: S; context: unknown }) => Promise<E>;
  action?: (to: S) => string;                           // defaults to `<entityType>.<to>`
})
machine.can(request): { ok: true } | { ok: false; reason: string }
machine.availableTransitions(request): S[]
machine.transition(request): Promise<E>   // through audited(); throws TransitionRefusedError
```

- Guards are pure and synchronous where possible; cross-entity facts arrive via `context` (e.g. prior approvals), which keeps guards unit-testable without a database.
- Guard helpers: `hasRole`, `hasPermission`, `not`, `all`, `any`, `distinctActor(field)` (four-eyes), `amountAtMost(n)`.
- Undeclared transition = `{ ok: false, reason: 'transition_not_allowed:<from>-><to>' }`; terminal states simply declare no outgoing transitions.
- `persist` receives the `from` state the guards were evaluated against and passes it to `compareAndSwapUpdate`, so a row another writer already moved is refused with `StaleStateError` and surfaces as `TransitionRefusedError('stale_state')` — with no audit entry, because the transaction rolled back.

`lib/auth` — Auth.js (NextAuth) with the Drizzle adapter and `session: { strategy: 'database' }`; Entra ID OIDC is the only registered provider, and it is registered only when its three env vars are set. The demo IdP is **not** a provider: `signInAsDemoUser(email, password)` validates a mock account against `users.password_hash`, re-resolves its fake group claims through `resolveRoles`, inserts a `sessions` row and sets the session cookie — so demo and production share one session mechanism. It is gated by `demoAuthEnabled()` (`DEMO_AUTH_ENABLED=true` **and** a locally served app, unless `DEMO_AUTH_ALLOW_REMOTE_HOST=true`) and throttled per client and account. The Entra `signIn` event resolves groups → roles via `lib/rbac` and persists the snapshot on `users.roles`. Exposes `getActor()` for server components/actions and `requireActor()` which redirects when signed out. MFA step-up: `StepUpProvider` interface + `NoopStepUpProvider`, called at the documented hook point.

`lib/providers` — `KycProvider` and `PaymentsProvider` interfaces plus mock implementations that persist/log; a config flag (`PROVIDER_MODE`) selects the implementation. Spec 00 defines the interfaces and mocks only; the apps consume them.

`lib/ui` — `PageShell`, `DataTable`, `Form`, `ApprovalFlow`, `DetailDrawer`, `StatusBadge`. Server components by default; only `Form`, `DetailDrawer` and the `DataTable` control bar are client components. `DataTable` reads sort/filter/page from `searchParams` so state is URL-shareable and server-rendered.

`lib/db` — postgres.js driver (TCP, real transactions, `max: 1` and no prepared statements so a pooled Neon URL is safe), Drizzle client, and four **per-app slice directories** behind barrels.

### Module layout (per-app slices + registry)

Foundation modules hold no app logic. Each app is a set of slice files plus one registry entry:

```
lib/db/schema/{foundation,kyc,refunds,flags}.ts      # barrel: index.ts, one export line per app
lib/db/queries/{foundation,kyc,refunds,flags}.ts     # accessors, actor first; barrel: index.ts
lib/db/mutations/{core,kyc}.ts                       # core = Tx types + compareAndSwapUpdate
                                                     # index.ts: `interface Tx extends KycMutations {}`
lib/db/seed/{foundation,kyc,refunds,flags}.ts        # called from lib/db/seed.ts
lib/apps/registry.ts                                 # APP_REGISTRY: one AppDescriptor per app
src/app/(apps)/{kyc,refunds,flags}/page.tsx          # app routes
```

The nav (`PageShell`) and the hub cards both render from `APP_REGISTRY`, so an app appears by adding its descriptor; `available: false` renders the card without an entry link until the app's spec ships. Adding an app therefore means new slice files plus one registry entry, and no edit to foundation logic.

### Schema (Drizzle owns it; one migration history)

Tables from technical context §7 — spec 00 creates all of them, in per-app migrations, so specs 01–03 add no migrations for their core entities: `users` (with `roles` snapshot, `groups`, `password_hash`), Auth.js `accounts`/`sessions`/`verification_tokens`, `audit_log` (`drizzle/0000`), `kyc_cases`, `kyc_events` (`0002`), `refunds`, `refund_approvals` (`0003`), `flags`, `flag_states` (`0004`). All FKs explicit; every state column is a Postgres enum (`kyc_case_state`, `refund_state`, `role`, `environment`, `rollout_kind`). `audit_log` is append-only **in the database**: `drizzle/0001_append_only_audit_log.sql` ships a trigger that raises on any `UPDATE` or `DELETE`. Indexes on `(entity_type, entity_id)`, `actor_id` and `created_at`.

### Access control at two layers

1. Route layer: `requireActor()` then `enforceRole`/`enforcePermission` at the top of every route segment, which interrupt rendering so Next serves `app/forbidden.tsx` with a real 403. Server actions and accessors use the throwing `requireRole`/`requirePermission`, having nothing to render.
2. Query layer: accessors in `lib/db` accept the actor and scope rows; an unauthorized read returns no rows rather than filtered-in-UI rows.

Only `viewer` reads across every tool; each working role reads only the app it works in, so the hub cards and the nav genuinely differ by role.

### Tooling decisions (empty repo)

- pnpm, Node LTS, Next.js App Router, TypeScript `strict` with `noUncheckedIndexedAccess`.
- ESLint flat config: `next/core-web-vitals`, `@typescript-eslint` (type-aware), `eslint-plugin-import` ordering, plus a `no-restricted-imports`/`no-restricted-syntax` pair that bans importing the raw Drizzle client outside `lib/db` and `lib/audit`, enforcing convention 1.
- Prettier (with the Tailwind class-sorting plugin) is the only formatter; ESLint does not format.
- Scripts: `dev`, `build`, `start`, `typecheck`, `lint`, `format`, `format:check`, `test`, `test:e2e`, `db:generate`, `db:migrate`, `db:seed`, `db:reset`.
- CI (GitHub Actions) on every PR: install → `typecheck` → `lint` → `format:check` → `test` → `build`. Playwright smokes run against a Postgres service container.
- Local Postgres via `docker-compose.yml` (single service, named volume). `.env.example` documents `DATABASE_URL`, `AUTH_SECRET`, `AUTH_MICROSOFT_ENTRA_ID_*`, `ENTRA_GROUP_MAP`, `DEMO_AUTH_ENABLED`, `PROVIDER_MODE`.

## Testing Decisions

A good test here verifies behavior through a module's public interface and would survive a rewrite of that module's internals. Expected values are independent literals from this spec, never recomputed the way the implementation computes them. No mocking of internal collaborators; mocks only at system boundaries (the providers, time). Work in vertical slices: one failing test → minimal implementation → next slice.

**Agreed seams (unit, Vitest) — mandatory per technical context §8:**

1. `lib/rbac` public API — `resolveRoles` (group mapping, unknown groups ignored, dedupe), `permissionsFor` (admin union, viewer read-only), `can`, and that `requireRole`/`requirePermission` throw `AuthorizationError`.
2. `lib/audit` public API — `audited()` writes exactly one entry with correct actor, roles snapshot, action, entity type/id and before/after; the entry and the mutation commit atomically; a throwing `fn` leaves neither the change nor an entry. Tested against a real throwaway Postgres database (not a mocked Drizzle), because in-transaction behavior is the property under test. `readAuditLog` filters by actor/entity/action/date and rejects non-admins.
3. `lib/workflow` public API — `can`/`transition` for every guard shipped in spec 00: declared vs undeclared transitions, terminal-state immutability, `hasRole`, `distinctActor` (four-eyes: same actor rejected, different actor allowed) and `amountAtMost` boundaries (at, just under, just over). Guards are tested through the machine, not called directly.

Boundary-condition emphasis: same-approver rejection and threshold boundaries are tested in spec 00 as guard-helper behavior, then reused (not re-tested from scratch) by specs 01–02.

**Playwright smokes (spec 00 scope):** sign in as `admin@demo.co` → hub renders cards with role indicator; sign in as `viewer@demo.co` → `/admin/audit` is rejected; unauthenticated request to the hub → redirected to sign-in. The three cross-app smokes in technical context §8 land with the specs that create their features.

Not unit-tested: UI primitives' rendering, page layout, seed data shape — covered by smokes. No test asserts on call counts, private functions or direct table reads that bypass a module's interface.

## Out of Scope

- The three apps' features and UI (specs 01–03). Spec 00 creates their tables and hub cards only; app routes are placeholders that state which spec delivers them.
- Everything in technical context §10: real Onfido/Stripe integrations (interfaces only), a real Entra tenant and real MFA (config + stubbed step-up hook only), notifications, mobile rendering, flag SDKs, multi-region/data residency, retention policies.
- The Devin-feature layer in §11 (request-a-tool form, scheduled review sessions, analytics panel).
- Production hardening at scale: rate limiting, caching layers, background jobs, observability beyond platform defaults.
- Any role self-assignment UI — roles come from the IdP by design.

## Further Notes

- Conventions from technical context §9 apply to every later spec and should be captured as knowledge entries: `audited()` for all mutations; no inline role checks; all state changes through `lib/workflow`; zod-validate every external input; server components/actions by default; extend `lib/ui` rather than fork it; one session = one spec = one PR.
- The audit log doubling as flag change history (spec 03) is the cheapest demonstration that the platform is load-bearing — keep it in the demo script.
- Demo sign-in must be disabled in production by config (and is refused off localhost regardless), and the README should say so explicitly.
