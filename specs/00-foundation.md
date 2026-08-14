# Spec 00 — Foundation

**One session = this spec = one PR.** Design rationale and rejected alternatives live in
`plans/00-foundation.plan.md`; this document is the build instruction. Where the two disagree, the plan is the
record of *why* and this spec is the record of *what*.

Read `AGENTS.md` before writing code. Every convention there is enforced in CI.

---

## 1. Scope

Build the platform layer that all three apps sit on, plus the hub page and one deliberately trivial reference
app that exercises every foundation seam end-to-end.

**In scope:** repo + toolchain + Docker Compose, Drizzle schema for foundation tables and their migration,
Auth.js with Entra OIDC config and a flag-gated demo credentials provider, `lib/rbac`, `lib/audit`,
`lib/workflow`, `lib/db` accessors, `lib/providers` interfaces (types only), `lib/time`, five `lib/ui`
primitives, the hub, `/admin/audit`, the `_reference` app, seed, unit tests, one Playwright smoke, CI.

**Out of scope** — do not build, do not stub beyond what is listed:

| Thing | Belongs to |
|---|---|
| `ApprovalFlow` component | spec 02 |
| KYC tables, webhook, queue UI | spec 01 |
| Refund tables, threshold routing | spec 02 |
| Flag tables, evaluation endpoint | spec 03 |
| Real Onfido/Stripe calls, real Entra tenant, MFA implementation, notifications, mobile, flag SDKs, multi-region, retention | nothing — context §10 |

---

## 2. Toolchain and pins

Exact versions, no caret ranges for `next` and `next-auth`:

- `next@16.3.1`, React 19, TypeScript strict
- `next-auth@5.0.0-beta.32` + `@auth/drizzle-adapter`
- `drizzle-orm`, `drizzle-kit`, `pg`
- `tailwindcss@4`
- `zod`, `argon2` (or `bcryptjs`)
- `vitest`, `@playwright/test`
- Node 22 LTS (`.nvmrc` + `engines`), pnpm 10 (`packageManager` field)

`docker-compose.yml`: one `postgres:16` service, volume, port 5432.

`proxy.ts` (not `middleware.ts` — renamed in Next 16, exported function is `proxy`, Node runtime only).

Scripts: `dev`, `build`, `start`, `lint`, `typecheck`, `test`, `test:e2e`, `db:generate`, `db:migrate`,
`db:seed`, `db:reset`.

Env (`.env.example`, all zod-parsed in `lib/env.ts`, which must throw at boot on invalid config):

```
DATABASE_URL=            # Compose locally; Neon POOLED connection string in prod
AUTH_SECRET=
AUTH_ENTRA_ID=           # client id / secret / issuer, present but unused in demo
AUTH_ENTRA_SECRET=
AUTH_ENTRA_ISSUER=
ENTRA_GROUP_MAP=         # JSON: { "<group-id-or-name>": ["kyc_analyst", ...] }
DEMO_LOGIN_ENABLED=      # "true" | "false" — must be set explicitly; build asserts presence
```

---

## 3. Public interfaces

These signatures are the contract specs 01–03 build against. Implement them **verbatim**; changing them is a
change to every downstream spec.

### 3.1 `lib/time`

```ts
export type Clock = { now(): Date }
export const systemClock: Clock
export function fixedClock(at: Date): Clock       // tests + deterministic seed
```

All time in app code comes from a `Clock`. No `new Date()` outside `lib/time`.

### 3.2 `lib/rbac`

```ts
export const ROLES = ['viewer','kyc_analyst','kyc_manager','support_agent',
                      'finance_manager','engineer','admin'] as const
export type Role = typeof ROLES[number]

export type Permission =
  | 'audit.read' | 'demo.tools'
  | 'reference.read' | 'reference.close'
  // app specs append their own permissions to this union

export const POLICY: Record<Role, readonly Permission[]>

export type Actor = { id: string; email: string; roles: readonly Role[] }

export function hasRole(actor: Actor, ...roles: Role[]): boolean
export function hasPermission(actor: Actor, permission: Permission): boolean
export function requireRole(actor: Actor, ...roles: Role[]): void        // throws Forbidden
export function requirePermission(actor: Actor, permission: Permission): void

export function resolveRoles(groups: string[], map: GroupRoleMap): Role[]
```

`admin` holds every permission — derive that from `POLICY`, do not hand-list it.

### 3.3 `lib/auth`

```ts
export const { handlers, auth, signIn, signOut } = NextAuth(config)

/** Resolves the current Actor from the session by reading users.roles. Throws if unauthenticated. */
export function currentActor(): Promise<Actor>
export function currentActorOrNull(): Promise<Actor | null>

/** MFA step-up: interface + no-op impl. Documented, NOT implemented. */
export interface StepUpVerifier { require(actor: Actor, reason: string): Promise<void> }
export const noopStepUp: StepUpVerifier
```

- `session: { strategy: 'jwt' }`, `maxAge: 30 * 60`. JWT carries `sub` (user id) only; roles in the session
  object are a UI hint and must never be read by an authorization check.
- Providers: Entra ID OIDC (always configured) and Credentials (registered **only** when
  `DEMO_LOGIN_ENABLED === 'true'`, comparing a password hash from `users.password_hash`).
- `signIn` callback: read the `groups` claim (Entra) or the seeded `demo_groups` (credentials) → `resolveRoles`
  → write `users.roles` and `users.roles_resolved_at`.
- `currentActor()` **always** reads roles from the `users` row.

### 3.4 `lib/audit`

```ts
export type AuditContext = {
  actor: Actor
  action: string                    // 'reference.close', 'kyc.case.approve', ...
  entityType: string
  entityId: string
  loadBefore?: (tx: Tx) => Promise<unknown>
}

/** Runs fn in a transaction, writing one audit entry from the returned value. */
export function audited<T>(ctx: AuditContext, fn: (tx: Tx) => Promise<T>): Promise<T>

/** Extra entries for other entities touched by the same mutation, inside the same tx. */
export function auditAlso(tx: Tx, entry: Omit<AuditContext,'loadBefore'> &
                                        { before: unknown; after: unknown }): Promise<void>

export function readAuditLog(actor: Actor, query: AuditQuery): Promise<AuditPage>
```

`audited` opens the transaction, calls `loadBefore(tx)`, runs `fn(tx)`, then inserts the entry with
`actor_roles_snapshot = actor.roles` — all in that one transaction. It is the **only** place in the codebase
allowed to insert into `audit_log`, and `lib/audit` + `lib/db` are the only modules allowed to call
`db.insert|update|delete` (CI-enforced, §7).

### 3.5 `lib/workflow`

```ts
export type GuardResult = { ok: true } | { ok: false; code: string; message: string }

export type Guard<TEntity, TState extends string> =
  (ctx: { actor: Actor; entity: TEntity; transition: { from: TState; to: TState }; context?: unknown })
    => GuardResult | Promise<GuardResult>

export function defineWorkflow<TEntity, TState extends string>(def: {
  transitions: Record<TState, readonly TState[]>            // every state present; terminal => []
  guards?: Partial<Record<`${TState}->${TState}`, readonly Guard<TEntity, TState>[]>>
}): {
  can(ctx): Promise<GuardResult>
  transition(ctx: {
    actor: Actor; entity: TEntity; to: TState; context?: unknown
    action: string; entityType: string; entityId: string
    apply: (tx: Tx) => Promise<TEntity>
  }): Promise<{ ok: true; entity: TEntity } | { ok: false; code: string; message: string }>
}
```

`transition()` checks the transition map, runs the guards in order (first failure wins, returned untranslated),
and on success calls `audited()` with `apply` as the mutation. **No state change may be written outside
`transition()`.**

### 3.6 `lib/db`

```ts
export const db: NodePgDatabase<typeof schema>       // pg Pool, Node runtime only
export type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0]
```

Accessors live in `lib/db/<entity>.ts` and **every one takes `actor` as its first argument** and scopes its
query accordingly. Reads that an actor may not perform return empty/`null`, they do not throw.

### 3.7 `lib/apps` (registry)

```ts
export type AppDescriptor = {
  key: string
  name: string
  description: string
  href: string
  requiredRoles: readonly Role[]
  countBadge?: (actor: Actor) => Promise<{ label: string; value: number } | null>
}
export const APPS: readonly AppDescriptor[]     // barrel: one import line per app
export function appsFor(actor: Actor): readonly AppDescriptor[]
```

Each app owns `src/app/<app>/app.config.ts` exporting its descriptor. Adding an app = new schema file + new
app.config.ts + **one line** in this barrel. Nothing else in `lib/` may change.

### 3.8 `lib/providers` (types only in this spec)

```ts
export interface KycProvider   { fetchCase(id: string): Promise<unknown> }
export interface PaymentsProvider {
  getPayment(id: string): Promise<unknown>
  issueRefund(input: { paymentId: string; amountMinor: number; currency: string }): Promise<{ providerRef: string }>
}
```

Mock implementations land with the specs that use them (01, 02). Ship the interfaces and a
`lib/providers/index.ts` that selects an implementation from config, so those specs only add files.

### 3.9 Server action contract

```ts
export type ActionResult<T> =
  | { ok: true; data: T }
  | { ok: false; code: string; message: string; fieldErrors?: Record<string, string[]> }
```

Actions never throw for expected failures. Zod failures → `fieldErrors`. Guard failures → the guard's `code`
and `message`, unchanged.

---

## 4. Schema and migration

`lib/db/schema/{auth,audit,_reference}.ts`, re-exported by `lib/db/schema/index.ts`; `drizzle.config.ts` points
at the barrel. **Per-app tables and enums live in that app's own schema file** — foundation defines no shared
enums.

| Table | Columns |
|---|---|
| `users` | adapter defaults (`id`, `name`, `email` unique, `email_verified`, `image`) **plus** `roles jsonb not null default '[]'`, `roles_resolved_at timestamptz`, `password_hash text`, `demo_groups jsonb` |
| `accounts` | Auth.js adapter default (composite PK on provider + providerAccountId) |
| `audit_log` | `id uuid pk`, `actor_id text not null → users.id`, `actor_roles_snapshot jsonb not null`, `action text not null`, `entity_type text not null`, `entity_id text not null`, `before jsonb`, `after jsonb`, `created_at timestamptz not null default now()` |
| `reference_requests` | `id uuid pk`, `title text not null`, `state reference_state not null default 'open'`, `created_by text → users.id`, `closed_by text → users.id`, `created_at`, `updated_at` |

`sessions` and `verification_tokens` are **not created** — the Drizzle adapter only needs them for the
database-session strategy and magic links, and we use neither.

Enum: `reference_state as enum ('open','closed')`.

Indexes on `audit_log`: `(entity_type, entity_id, created_at desc)`, `(actor_id, created_at desc)`,
`(created_at desc)`.

Append-only enforcement — hand-written into the generated migration:

```sql
CREATE FUNCTION audit_log_reject_mutation() RETURNS trigger AS $$
BEGIN RAISE EXCEPTION 'audit_log is append-only: % is not allowed', TG_OP; END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER audit_log_no_update_delete
BEFORE UPDATE OR DELETE ON audit_log
FOR EACH ROW EXECUTE FUNCTION audit_log_reject_mutation();
```

One migration history, generated by `drizzle-kit generate`, committed. Never hand-edit a generated migration
except to append SQL that Drizzle cannot express (like the trigger above).

---

## 5. Build order

Work in this order; each step is independently reviewable and later steps depend on earlier ones.

1. **Repo + toolchain.** Next app, TS strict, Tailwind v4, ESLint flat config (including the rule in §7),
   Compose, `lib/env.ts`, scripts, `.env.example`, `AGENTS.md`.
2. **Schema + first migration** (§4), `lib/db/client.ts`, `db:migrate`. Verify the trigger by hand once.
3. **`lib/time`.**
4. **`lib/rbac`** + its unit tests. *Tests first here* — the policy matrix is the cheapest thing to get wrong.
5. **`lib/audit`**: `audited`, `auditAlso`, `readAuditLog` + unit tests including the rollback test.
6. **`lib/workflow`**: `defineWorkflow` + unit tests over a fixture workflow (both guard outcomes, a
   disallowed transition, a terminal state).
7. **`lib/auth`**: Auth.js config, both providers, `signIn` role resolution, `currentActor`, `proxy.ts` cookie
   check, sign-in page (Entra button + demo credentials form when enabled), `noopStepUp`.
8. **`lib/ui`**: `PageShell`, `DataTable`, `Form`, `DetailDrawer`, `StatusBadge`. Server components except
   where interaction requires a client island (drawer open state, the demo user switcher).
9. **`lib/apps`** registry + hub page at `/`.
10. **`_reference` app** at `/admin/demo`: list + drawer + "Close request" action wired through
    `defineWorkflow` (`open → closed`, guard: requires `reference.close` **and** `closed_by !== created_by`) and
    therefore through `audited`. Its `app.config.ts` registers the card as **"Reference: demo requests"** with
    key `_reference` and an open-count badge.
11. **`/admin/audit`** reader: filters bound to `searchParams`, keyset pagination, field-level diff in the
    drawer, `admin` only.
12. **Seed** (§6).
13. **CI workflow, Playwright smoke, README.**

---

## 6. Seed

`pnpm db:seed` is idempotent, deterministic (fixed RNG seed), and derives every date from an injected `Clock`.
It creates the eight demo users below (argon2/bcrypt-hashed password `demo`, `demo_groups` set to fake
Entra group ids that `ENTRA_GROUP_MAP` maps to the listed roles) and ~8 `reference_requests` across both states.

| Email | Roles |
|---|---|
| viewer@demo.co | `viewer` |
| analyst@demo.co | `kyc_analyst` |
| kmanager@demo.co | `kyc_manager` |
| agent@demo.co | `support_agent` |
| fmanager@demo.co | `finance_manager` |
| fmanager2@demo.co | `finance_manager` |
| engineer@demo.co | `engineer` |
| admin@demo.co | `admin` |

App-specific seed data (KYC cases, refunds, flags) is added by specs 01–03 as separate, composable seed
modules. Do not create their tables here.

---

## 7. Enforcement and CI

`.github/workflows/ci.yml` on every PR: `typecheck` → `lint` → `test` → `build`, plus `test:e2e`, with a
`postgres:16` service container and `db:migrate && db:seed` before the test steps.

ESLint (**mandatory, failing the build**):

- `no-restricted-properties` / `no-restricted-syntax` banning `db.insert`, `db.update`, `db.delete` and the
  `tx` equivalents outside `lib/audit/**` and `lib/db/**`.
- ban `new Date(` outside `lib/time/**`.

Build-time assertion: `DEMO_LOGIN_ENABLED` must be explicitly set (either value) or the build fails.

---

## 8. Test matrix

| Area | Cases |
|---|---|
| `lib/rbac` | table-driven over `POLICY`: every (role, permission) pair; `admin` holds all; `requirePermission` throws for denied; `resolveRoles` — unknown group ignored, multiple groups union, empty → `[]` |
| `lib/audit` | entry written with correct `before`/`after` and `actor_roles_snapshot`; **`fn` throwing rolls back the mutation *and* the audit row**; `auditAlso` writes N entries in one tx; UPDATE and DELETE on `audit_log` both raise |
| `lib/workflow` | allowed transition succeeds and writes an audit entry; disallowed transition returns `ok:false` without writing; each guard's pass and fail path; first failing guard's code is the one returned; terminal state rejects every transition |
| `_reference` guard | `closed_by === created_by` is rejected with its reason code (the four-eyes pattern spec 01 and 02 inherit) |
| `DataTable` | sort/filter params outside the declared whitelist are ignored, not passed to SQL |
| `lib/env` | invalid `ENTRA_GROUP_MAP` JSON throws at boot |
| Playwright smoke | sign in as `admin@demo.co` → hub shows the Reference card with an open count → open a request → close it → `/admin/audit` shows the `reference.close` entry with a visible before/after diff |

---

## 9. Definition of done

Every item observable by running something:

- [ ] `docker compose up -d && pnpm db:migrate && pnpm db:seed` succeeds from a clean clone.
- [ ] `pnpm typecheck && pnpm lint && pnpm test && pnpm build` all pass.
- [ ] `pnpm test:e2e` passes the smoke in §8.
- [ ] CI is green on the PR with the postgres service container.
- [ ] `psql -c "update audit_log set action='x'"` fails with the append-only exception.
- [ ] Adding `db.insert(...)` in a page or action fails `pnpm lint`.
- [ ] `GET /` unauthenticated redirects to sign-in; signed in as `viewer@demo.co` the hub shows no admin link and `/admin/audit` is refused.
- [ ] Signed in as `analyst@demo.co`, the Close action on a reference request renders its guard reason code inline rather than an error page.
- [ ] `/admin/audit` filters by actor, entity, action, and date range via URL params and paginates past page 1.
- [ ] "Demo: switch user" appears with `DEMO_LOGIN_ENABLED=true` and is absent with `false`, where only the Entra button remains on the sign-in page.
- [ ] Two consecutive `pnpm db:seed` runs produce identical data (deterministic + idempotent).
- [ ] README lists demo logins, the local setup commands, the Vercel/Neon env vars, and the out-of-scope list from context §10.
- [ ] `plans/00-foundation.plan.md` §8 tradeoffs are reflected in the README's tradeoffs section.
