# Spec 02 — Refunds dashboard

Scope: `technical-context.md` §5.2, narrowed as below. Conventions: `AGENTS.md`.

**Descoped:** threshold tiers and dual approval are deliberately cut — separation of duties is
demonstrated by KYC's four-eyes flow, so refunds stays the deliberately thin app.

## Scope

Review seeded refund requests and decide each one: a dashboard with tiles and a request table, a detail
drawer with Approve/Reject, and `issueRefund()` called on the transition into `approved` only. Refunds are
never raised in the app — `lib/db/seed/refunds.ts` is the only source of requests.

## Inherited interfaces (use, do not rebuild)

- `lib/db/schema/refunds.ts` — `refunds`, `refundStateEnum`, `Refund`. The deciding actor lives on the
  refund itself (`decidedById`, `decidedAt`), migrated in `drizzle/0003_refunds.sql`.
- `lib/db/queries/refunds.ts` — `countRefundsByState(actor, state)` plus the list/detail/tile accessors;
  actor first, `requirePermission(actor, 'refunds.read')` inside.
- `lib/db/mutations/refunds.ts` — `decideRefund(...)`: the state change via `compareAndSwapUpdate` on
  `from`, the decision metadata and the `providerRefundId` stamp in one update.
- `lib/audit` — `audited({ actor, action, entityType: 'refund', entityId, before })`; `before` is the refund
  the query layer read.
- `lib/workflow` — `defineMachine` and `hasPermission`.
- `lib/rbac` — `refunds.read` (`support_agent`, `viewer`), `refunds.approve`, `refunds.reject`
  (`finance_manager`).
- `lib/ui` — `PageShell`, `DataTable`, `DetailDrawer`, `Form`, `StatusBadge`, `JsonDiff`.
- `lib/providers` — `paymentsProvider()` / `MockStripeProvider.issueRefund({ paymentId, amountPence, currency })`.
- `lib/time` — `now()`, the source of `decidedAt`.
- Seeded demo data: 30 refunds across `requested`, `approved` and `rejected` (`lib/db/seed/refunds.ts`),
  `agent@demo.co` as requester and `fmanager@demo.co` as the decider on the settled ones.

## State machine

`defineMachine<Refund, Refund['state']>({ entityType: 'refund', stateOf: (r) => r.state, ... })`.

| Transition            | Guards                             |
| --------------------- | ---------------------------------- |
| `requested->approved` | `hasPermission('refunds.approve')` |
| `requested->rejected` | `hasPermission('refunds.reject')`  |

`approved` and `rejected` declare no outgoing transitions, which is what makes them terminal.

## Settled boundaries

1. One decision per refund, gated by a permission alone: no amount thresholds, no second approver.
2. Actions are evaluated server-side with `refundMachine.can()`; a refused action stays visible but
   disabled, and its refusal renders as a sentence (`lib/apps/refunds/refusal-copy.ts`) under that action
   alone — never a bare snake_case code.
3. `issueRefund()` runs on the transition into `approved` only, inside the same audited transaction as the
   state change, and its `providerRefundId` is stored on the refund.
4. Amounts stay in minor units as integers with an explicit currency column.
5. The app is built from `lib/ui` primitives and registers itself by flipping its `APP_REGISTRY` entry
   (`lib/apps/registry.ts`) to `available: true`; foundation logic stays untouched.
