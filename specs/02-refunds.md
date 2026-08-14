# Spec 02 — Refunds dashboard (stub)

**Not yet written.** This stub records the scope, the foundation interfaces the app must use, its state
machine and the boundaries already settled. Scope: `technical-context.md` §5.2. Conventions: `AGENTS.md`.

## Scope

Raise and decide refunds against mock payments: a dashboard with tiles and a request table, threshold
routing by amount, dual approval above £5,000 recorded as one `refund_approvals` row per approver, and
`issueRefund()` called on final approval only. Workflow app: the guards are the product.

## Inherited interfaces (use, do not rebuild)

- `lib/db/schema/refunds.ts` — `refunds`, `refundApprovals` (unique on `(refundId, approverId)`),
  `refundStateEnum`, `Refund`, plus the relations that load a refund with its approvals. Tables exist and are
  migrated (`drizzle/0003_refunds.sql`).
- `lib/db/queries/refunds.ts` — `countRefundsByState(actor, state)`. Add list/detail accessors here; actor
  first, `requirePermission(actor, 'refunds.read')` inside. Load approvals with the refund, since the
  four-eyes guard reads them.
- `lib/db/mutations/refunds.ts` — new slice: state change via `compareAndSwapUpdate` on `from`, plus the
  approval-row insert and `providerRefundId` stamp. Add the interface to `Tx` and `mutations()`.
- `lib/audit` — `audited({ actor, action, entityType: 'refund', entityId, before })`; `before` is the refund
  the query layer read. The approval row is inserted inside the same transaction.
- `lib/workflow` — `defineMachine`, guard helpers `hasPermission`, `amountAtMost`, `distinctActor`, `all`,
  `any`, `not`.
- `lib/rbac` — permissions already defined: `refunds.read`, `refunds.create`, `refunds.approve_small`
  (`support_agent`), `refunds.approve`, `refunds.co_approve`, `refunds.reject` (`finance_manager`).
- `lib/ui` — **`ApprovalFlow` already exists** (`steps: ApprovalStep[]`, `actions: ApprovalAction[]` with
  `refusedReason`); plus `PageShell`, `DataTable`, `DetailDrawer`, `Form`, `StatusBadge`.
- `lib/providers` — `paymentsProvider()` / `MockStripeProvider.issueRefund({ paymentId, amountPence, currency })`.
- `lib/time` — `now()`.
- Seeded demo data: 30 refunds spread across both thresholds (`lib/db/seed/refunds.ts`), `agent@demo.co` as
  requester, `fmanager@demo.co` and `fmanager2@demo.co` as the two distinct approvers.

## State machine

`defineMachine<RefundWithApprovals, Refund['state']>({ entityType: 'refund', stateOf: (r) => r.state, ... })`.
Amounts are minor units: £100 = `10_000`, £5,000 = `500_000`.

| Transition                                               | Guards                                                                                                                                                           |
| -------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `requested->approved`                                    | `any(all(hasPermission('refunds.approve_small'), amountAtMost(amountPence, 10_000)), all(hasPermission('refunds.approve'), amountAtMost(amountPence, 500_000)))` |
| `requested->needs_second_approval`                       | `all(hasPermission('refunds.approve'), not(amountAtMost(amountPence, 500_000), 'amount_within_single_approval'))` — writes the first approval row                |
| `needs_second_approval->approved`                        | `all(hasPermission('refunds.co_approve'), distinctActor((r) => r.approvals[0]?.approverId, 'same_approver'))` — writes the second approval row                   |
| `requested->rejected`, `needs_second_approval->rejected` | `hasPermission('refunds.reject')`                                                                                                                                |

`approved` and `rejected` declare no outgoing transitions.

## Settled boundaries

1. Threshold routing is guards, not UI: ≤ £100 is auto-approvable by `support_agent` through
   `refunds.approve_small`; ≤ £5,000 by `finance_manager`; above £5,000 needs **two distinct approvers**,
   represented as two `refund_approvals` rows and enforced by `distinctActor`. Guard tests cover both
   boundaries exactly and the same-approver refusal, and are written first.
2. Approval UI uses the existing `ApprovalFlow` from `lib/ui` — no new component. Refusal reasons from the
   machine populate `refusedReason`.
3. `issueRefund()` runs on the transition into `approved` only, and its `providerRefundId` is stored on the
   refund.
4. Amounts stay in minor units as integers with an explicit currency column.
5. The app is built from `lib/ui` primitives and registers itself by flipping its `APP_REGISTRY` entry
   (`lib/apps/registry.ts`) to `available: true`; foundation logic stays untouched.
