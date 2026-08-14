# Spec 03 — Feature-flag admin (stub)

**Not yet written.** This stub records the scope, the foundation interfaces the app must use, its state
machine and the boundaries already settled. Scope: `technical-context.md` §5.3. Conventions: `AGENTS.md`.
**Thinness is the point** — this app is the marginal-cost proof, so it adds no machinery.

## Scope

Per-environment flag administration: a flag list with `dev` / `staging` / `prod` state, boolean or percentage
rollout, a one-click kill switch, a read-only public evaluation endpoint, and change history read from the
audit log.

## Inherited interfaces (use, do not rebuild)

- `lib/db/schema/flags.ts` — `flags`, `flagStates` (unique on `(flagId, environment)`), `environmentEnum`
  (`dev` | `staging` | `prod`), `rolloutKindEnum` (`boolean` | `percentage`), `Flag`, `FlagState`, and the
  relations loading a flag with its states. Tables exist and are migrated (`drizzle/0004_flags.sql`).
- `lib/db/queries/flags.ts` — `countFlags(actor)`. Add the list/detail accessors here; actor first,
  `requirePermission(actor, 'flags.read')` inside.
- `lib/db/mutations/flags.ts` — new slice: toggle a `flag_states` row, set a rollout percentage, and turn
  every environment off. Add the interface to `Tx` and `mutations()`. `flag_states` has no `state` column, so
  the slice keeps compare-and-swap semantics with its own `where enabled = <from>` clause rather than
  reusing `compareAndSwapUpdate`.
- `lib/audit` — `audited({ actor, action, entityType: 'flag_state' | 'flag', entityId, before })`;
  `readAuditLog(actor, { entityType, entityId })` **is** the change-history view. No history table.
- `lib/workflow` — `defineMachine`, guard helper `hasPermission`.
- `lib/rbac` — permissions already defined: `flags.read`, `flags.write`, `flags.kill_switch` (all held by
  `engineer`; `viewer` holds `flags.read`).
- `lib/ui` — `PageShell`, `DataTable`, `DetailDrawer`, `Form`, `StatusBadge`, `JsonDiff` (the history diff).
- `lib/time` — `now()`.
- Seeded demo data: 12 flags with all three environment rows each (`lib/db/seed/flags.ts`), a mix of boolean
  and percentage kinds; `engineer@demo.co` is the working role.

## State machine

One machine per `flag_states` row: `defineMachine<FlagState, 'on' | 'off'>({ entityType: 'flag_state',
stateOf: (s) => (s.enabled ? 'on' : 'off'), ... })`.

| Transition | Guards                         |
| ---------- | ------------------------------ |
| `off->on`  | `hasPermission('flags.write')` |
| `on->off`  | `hasPermission('flags.write')` |

Rollout-percentage edits leave `enabled` unchanged, so they are not transitions: they are a direct
`audited()` mutation behind `requirePermission(actor, 'flags.write')`.

## Settled boundaries

1. Change history is the existing audit reader filtered by entity (`flag`, `flag_state`) — reusing the
   foundation component is the demonstration, so no new table and no new reader.
2. Kill switch is one `audited()` mutation over the flag that turns every environment off, gated by
   `flags.kill_switch` in the accessor, not only on the button.
3. `GET /api/flags/:env` is public and read-only, zod-validates its route param, and runs on the Node runtime.
4. Prod changes show a confirm modal — the only client island; everything else is a server component.
5. The app is built from `lib/ui` primitives and registers itself by flipping its `APP_REGISTRY` entry
   (`lib/apps/registry.ts`) to `available: true`; foundation logic stays untouched.
