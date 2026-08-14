# Plan — Spec 00: Foundation

Status: **awaiting sign-off**. Input: `technical-context.md` (Internal Tools Platform — Project Context).
Output once signed off: `specs/00-foundation.md`, one-screen stubs for `specs/01..03`, `AGENTS.md`, repo-scoped knowledge note.

This document records the decisions behind spec 00, the options rejected, and the tradeoffs we are choosing to
own out loud. Two decisions here contradict the literal wording of the context (§4.1 session storage, §4.5
`ApprovalFlow`); both are called out in §8.

---

## 1. Decisions that contradict the context (read these first)

### 1.1 Sessions are JWT, not database rows

The context (§4.1) specifies a demo credentials provider *and* "sessions stored in Postgres via Drizzle
adapter". Auth.js cannot do both: signing in with the credentials provider requires the JWT session strategy
and fails with `UnsupportedStrategy` under database sessions
(<https://authjs.dev/reference/core/providers/credentials>).

**Decision:** `session: { strategy: "jwt" }` in both environments. The Drizzle adapter stays, but only for
`users`/`accounts` persistence — not sessions. Demo logins are real seeded `users` rows the credentials
provider looks up, so the group→role resolution path and the roles snapshot are identical for Entra and demo.

The JWT carries **user id only** (roles may ride along as a UI hint, never as an authorization input). Every
authorization decision resolves current roles from the `users` row per request — which we already need for the
audit snapshot. Consequence: role changes and revocations take effect on the **next request**; only *session*
revocation is bounded by the token TTL (30 min).

### 1.2 `ApprovalFlow` is deferred to spec 02

The context lists `ApprovalFlow` among the foundation's UI primitives (§4.5). Designed with zero real approval
flows in the repo, it would be wrong, and spec 02 would rewrite it. Spec 00 ships the other five primitives
(`DataTable`, `Form`, `DetailDrawer`, `StatusBadge`, `PageShell`); **spec 02 owns `ApprovalFlow`** and adds it
to `lib/ui` under convention §9.6.

Hard boundary for the parallel fan-out: **spec 01 must not create an approval-flow component.** KYC escalation
UI is RBAC-gated action buttons plus the per-case audit trail.

---

## 2. Architecture decisions

### 2.1 Database driver and the audit transaction guarantee

`audited()` must write the audit entry in the same transaction as the mutation (§4.3). Drizzle's `neon-http`
driver throws `No transactions support in neon-http driver`, so it is unusable here.

**Decision:** `node-postgres` (`pg`) against Neon's **pooled** connection string in production and against
Docker Compose locally. Identical client code; environments differ only by `DATABASE_URL`, preserving §2.

**Hard constraint that follows:** `pg` uses TCP, so every DB-touching route handler, server action, and page
declares the **Node runtime** — no Edge. This is a spec-level rule, not a per-file judgement call.

Conveniently, Next 16's `proxy.ts` (the rename of `middleware.ts`) also runs **only** on the Node runtime and
its runtime is not configurable, so there is no Edge/Node split anywhere in the app.

Rejected: `neon-serverless` (WebSocket) in prod + `pg` locally — two clients, breaks "only `DATABASE_URL`
differs". Rejected: `neon-http` with best-effort auditing — destroys the crown jewel.

### 2.2 `audited()` shape

```ts
audited(
  { action, entityType, entityId, loadBefore?: (tx) => Promise<unknown> },
  (tx) => Promise<After>
): Promise<After>
```

The wrapper owns the transaction, snapshots `before` via the caller-supplied reader, runs `fn(tx)`, and writes
the entry from the returned `after` — so "same transaction" is structurally true rather than aspirational.
Multi-entity mutations write **one entry per entity touched**, all in the same transaction (a refund approval
writes an entry for the refund *and* one for the approval row), keeping entries queryable per entity against
the indexes in §2.6.

Rejected: a generic wrapper that selects before/after itself (would need to know every table's shape, breaks
for multi-row mutations). Rejected: caller passes literal `before`/`after` (makes the guarantee a lie).

### 2.3 Append-only enforcement

A `BEFORE UPDATE OR DELETE` trigger on `audit_log` that `RAISE EXCEPTION`s, shipped in the first migration,
plus a Vitest test asserting the throw. `REVOKE` alone does not bind table owners/superusers and Neon gives
limited role control, so the trigger is the portable option (identical in Compose and Neon).

A dedicated least-privileged DB role is documented as **production hardening, not built**.

### 2.4 RBAC

Explicit permission constants with a `role → permission[]` matrix in `lib/rbac/policy.ts`; `requireRole` and
`requirePermission` derive from it. Table-driven unit tests iterate the matrix (§8 of the context demands
these).

Group→role mapping comes from `ENTRA_GROUP_MAP` — a zod-parsed JSON env var. It is config, not data; an
admin-editable `group_role_map` table is the documented production evolution.

Roles snapshot: `users.roles jsonb` + `users.roles_resolved_at timestamptz`, refreshed on every sign-in.
`audit_log.actor_roles_snapshot` denormalizes per entry. No `user_roles` join table — we never query roles
relationally in this prototype.

### 2.5 Where authorization actually happens

The **authoritative layer is the data-access layer and server actions**: an explicit `actor` argument threaded
into every `lib/db` accessor and `audited()` call, plus `requirePermission`. Layout-level checks are **UX
redirects only**. `proxy.ts` (Next 16's rename of `middleware.ts`, Node runtime) does **cookie-presence checks
only** — deliberately, even though its runtime would now permit a DB read.

Additional rule: **every route handler calls `requirePermission` itself**, except the public KYC webhook and
the public flag-evaluation endpoint.

Rejected: resolving roles from the DB in `proxy.ts` (a query on every matched request, and it centralizes rules
away from the code that uses them; Next's own guidance is that the proxy layer is for routing/rewrites, not
authorization). Rejected: accessors calling `auth()` themselves (hides
the dependency the whole platform is trying to prove, and is untestable).

Mechanically enforced: an ESLint `no-restricted-syntax`/`no-restricted-properties` rule banning
`db.insert|update|delete` outside `lib/audit` and `lib/db`, **run in CI lint — mandatory, not advisory**. A
custom ESLint plugin rule with proper scope/alias tracking is the noted hardening step.

Explicit actor threading also means no `AsyncLocalStorage` request context, which keeps everything
serverless-safe and unit-testable.

### 2.6 Audit reader

Server-driven `DataTable` with filters bound to URL `searchParams` (actor, entity type, entity id, action, date
range), **keyset pagination** on `(created_at, id)`, and a server-rendered field-level diff of `before`/`after`
in the drawer. Admin-only.

Indexes in the migration:

```
(entity_type, entity_id, created_at desc)
(actor_id, created_at desc)
(created_at desc)
```

Specs 01 and 03 reuse this reader filtered by entity — the per-case KYC audit trail and the flag change history
"derived from the audit log" (§5.3) are the same component, which is the reuse claim we want to demo.

### 2.7 Workflow

```ts
defineWorkflow<TState extends string, TEntity>({
  states,
  transitions: Record<TState, TState[]>,
  guards: Partial<Record<`${TState}->${TState}`, Guard<TEntity>[]>>,
}): { can(ctx), transition(ctx) }

type Guard<TEntity> = (ctx: { actor; entity: TEntity; transition; context }) => GuardResult
type GuardResult = { ok: true } | { ok: false; code: string; message: string }
```

Every state appears in `transitions` (terminal states map to `[]`), so a typo'd state fails at compile time;
template-literal transition keys catch a guard attached to a non-existent transition, also at compile time. No
DSL, no runtime machinery.

`transition()` calls `audited()` internally, so an app spec **physically cannot** land an unaudited state
change. Guard reason codes are the blocked-action UX: they pass through `ActionResult` untranslated and render
inline next to the disabled action — no error pages.

### 2.8 Server actions and forms

```ts
type ActionResult<T> =
  | { ok: true; data: T }
  | { ok: false; code: string; message: string; fieldErrors?: Record<string, string[]> }
```

Actions never throw for expected failures (guard denials, zod errors). Forms use React's `useActionState`; no
form library. `lib/ui/Form` takes a zod schema in and renders `fieldErrors` inline. Rejected: react-hook-form +
zodResolver (duplicate validation, client bundle for admin forms).

### 2.9 App registry (the marginal-cost seam)

Each app exports an `AppDescriptor` from `src/app/<app>/app.config.ts`:

```ts
{ key, name, description, href, requiredRoles, countBadge(actor): Promise<number> }
```

A committed barrel in `lib/apps` imports them; the hub renders cards from the registry, filtered by the
viewer's roles. An app PR therefore touches foundation code exactly once, in a one-line barrel edit.

**Spec 00 owns only foundation tables** (`users`, Auth.js adapter tables, `audit_log`, and the reference app's
table). Each app spec owns its own tables, enums, and seed slice; hub badges read counts through the registry
and simply have no card until the app lands. This is the honest test of the platform thesis: if an app spec
can't add tables and a hub card without editing foundation logic, the foundation is wrong.

### 2.10 Reference app

`/admin/demo` — "Reference: demo requests". One table, one state machine (`open → closed`), one guard, one
audited mutation. Its only job is to exercise registry + workflow + audit + RBAC + UI end-to-end, and to be the
copy-paste template for the "10+ more tools planned" story. Registry key `_reference` and the card title carry
the word "Reference" so nobody reads it as product. It is the fixture the foundation's own smoke test drives,
and it is **kept**, not deleted.

### 2.11 Demo identity

Seed stores argon2/bcrypt **hashes**; the credentials provider compares. The provider is registered only when
`DEMO_LOGIN_ENABLED=true` — a single explicit flag, deliberately **not** coupled to `NODE_ENV`, because the
Vercel demo deploy is a production build that still needs demo logins. CI/build asserts only that the flag is
explicitly set. README states the Entra-only posture when it is off.

`PageShell` shows the signed-in user and resolved roles as chips, an app switcher from the registry (filtered by
role), and a **"Demo: switch user"** dropdown gated by the same flag. It re-runs the real credentials sign-in
(not impersonation), so the mapping path stays honest, and it disappears when the flag is off. Demoing
four-eyes and dual approval means switching identity constantly; sign-out/sign-in round trips would eat the
demo. Audit-recorded impersonation was considered and rejected as out of scope (§10).

MFA step-up: one interface, one no-op impl, one comment. Nothing else.

### 2.12 Time

A single injectable `now()` in the foundation is **the only source of time in app code** (added to the
conventions in §6). Spec 01's SLA countdowns depend on it and it is miserable to retrofit.

---

## 3. Stack pins

Next.js **16.3.1** (exact) + React 19, Tailwind v4, Node 22 LTS, pnpm 10, `next-auth` pinned exactly to
**5.0.0-beta.32**, Drizzle latest, Zod, Vitest, Playwright. No caret ranges for `next`/`next-auth` — that is
how a demo breaks the day before it is presented.

Next 16 renamed `middleware.ts` to **`proxy.ts`** (exported function `proxy`, Node runtime only); the spec
asserts `proxy.ts` for the cookie-presence layer. `middleware.ts` still exists for Edge but is deprecated and
ignored at build time when `proxy.ts` is present — we do not use it.

---

## 4. Schema (spec 00 scope)

`lib/db/schema/{auth,audit,_reference}.ts`, re-exported from `schema/index.ts`; `drizzle.config.ts` points at
the barrel. Per-app schema files land with their app spec, and **per-app enums live in that app's file** —
foundation owns only shared enums, of which there are none initially.

| Table | Notes |
|---|---|
| `users` | + `roles jsonb`, `roles_resolved_at`, `password_hash` (demo only) |
| Auth.js adapter tables | `accounts` required; `sessions` and `verification_tokens` are optional for the Drizzle adapter (needed only for the database-session strategy and magic links respectively) and are therefore **not created** per §1.1 |
| `audit_log` | `id, actor_id, actor_roles_snapshot, action, entity_type, entity_id, before jsonb, after jsonb, created_at`; append-only trigger; indexes per §2.6 |
| `_reference_requests` | reference app; state stored as a Postgres enum |

States are Postgres enums; all FKs explicit. One migration history owned by `drizzle-kit generate`, committed.

---

## 5. Testing and CI

- **Vitest, mandatory at the seams:** `lib/rbac` (role resolution + the permission matrix, table-driven),
  `lib/audit` (correct before/after; **a failed mutation rolls back its audit row**), `lib/workflow` (every
  guard, iterating the guards map), the `DataTable` sort/filter **whitelist** (a real query-injection surface),
  and the append-only trigger.
- **Playwright smoke (spec 00):** sign in as a demo user → act on a reference request → the audit entry is
  visible to admin at `/admin/audit`. The context's other smokes belong to the specs that add those features.
- **CI (GitHub Actions):** typecheck, lint (including the mandatory no-direct-writes rule), unit tests, build.
  A `postgres:16` service container; `pnpm db:migrate && pnpm db:seed` before tests; Playwright runs against
  `next start`.
- Seed is **deterministic** (fixed RNG seed) and every relative date derives from the injectable `now()`, so
  SLA assertions don't flake.

Infra scope: Compose + CI + Playwright harness + committed deploy config (`vercel.json`, `.env.example`, README
steps). **No secrets requested** — Vercel/Neon provisioning and env vars are yours.

---

## 6. Conventions (→ `AGENTS.md`, with a pointer knowledge note)

`AGENTS.md` at the repo root is the source of truth; the repo-scoped knowledge note is a short pointer to it
plus the three non-negotiables. Contents:

1. Every mutation goes through `audited()`. No exceptions.
2. No inline role checks — use `lib/rbac` helpers.
3. All state changes go through `lib/workflow`.
4. Zod-validate every external input (forms, webhooks).
5. Server components/actions by default; client components only where interactivity requires.
6. Apps build only on foundation modules; if a primitive is missing, extend `lib/ui`, don't fork it.
7. One session = one spec = one PR.
8. **All time comes from the foundation's injectable `now()`.**
9. **Every DB-touching route/action/page declares the Node runtime** (`pg` is TCP; no Edge).
10. **App PRs merge serially.** Each app session rebases on `main` and **regenerates its Drizzle migration
    after the rebase, before merge**, to avoid journal/numbering conflicts from parallel generation.

---

## 7. Deliverables of the implementation session

1. `specs/00-foundation.md` — scope → public interfaces (verbatim signatures) → schema → file-by-file build
   order → test matrix → DoD checklist (every item a test, a URL, or a command) → non-goals with
   "belongs to spec NN" pointers.
2. One-screen stubs `specs/01-kyc.md`, `specs/02-refunds.md`, `specs/03-flags.md` recording **only** inherited
   interfaces and settled boundaries: no `ApprovalFlow` in 01, spec 02 owns it, per-app enums, serial merge +
   regenerate migrations, Node runtime for DB routes. Without these, the fan-out sessions re-litigate decisions
   already made here.
3. `AGENTS.md` (§6) and the repo-scoped knowledge note.

---

## 8. Named tradeoffs (for the honest-tradeoffs analysis)

| Tradeoff | Consequence | Why accepted |
|---|---|---|
| JWT sessions (§1.1) | Session revocation bounded by the 30-min TTL; role changes apply next request | Credentials provider requires JWT; one code path in both environments |
| `next-auth` is beta (`5.0.0-beta.32`); beta.32 fixed GHSA-8fpg-xm3f-6cx3, where a config error made `auth()` truthy so existence checks failed **open** | A security-critical dependency is pre-1.0 | Exact pin, plus the §2.5 mitigation: authorization lives in the data layer and server actions, never in an existence check |
| Node runtime everywhere (§2.1) | No Edge rendering for app routes | Non-negotiable given the audit transaction guarantee; `proxy.ts` is Node-only in Next 16 anyway |
| Custom `users` table extending the adapter's default (§4) | We own the adapter's schema contract; an adapter upgrade could require a migration | Roles snapshot + demo `password_hash` must live on the user row; the adapter explicitly supports passing your own tables |
| Append-only by trigger, not by DB role (§2.3) | An owner-level actor could drop the trigger | Least-privileged role is provisioning work, documented as hardening |
| Group→role map in env (§2.4) | No admin UI for mapping | Config, not data, at prototype scale; table noted as the production evolution |
| Offset pagination for app tables (§2.6) | Degrades at scale | Prototype volumes; `audit_log` — the only unbounded table — uses keyset |
| Demo user switcher (§2.11) | Extra demo-only surface | Flag-gated, uses the real sign-in path; the demo is unwatchable without it |
| `ApprovalFlow` deferred (§1.2) | Foundation is one primitive short of the context's list | Speculative design would be rewritten by spec 02 anyway |

Also unbuilt, per context §10: real Onfido/Stripe integrations, real Entra tenant and MFA, notifications,
mobile, flag SDKs, multi-region, retention policies.
