# Spec 01 — KYC review queue (stub)

**Not yet written.** This stub records the scope, the foundation interfaces the app must use, its state
machine and the boundaries already settled — so the build session decides UI and data shape, not
architecture. Scope: `technical-context.md` §5.1. Conventions: `AGENTS.md`.

## Scope

Work applicant checks end to end: a queue of `kyc_cases` fed by an Onfido-shaped webhook, claim → review →
approve / reject / escalate, escalated cases resolved under four-eyes, and a per-case history read from the
audit log. Deep app: it exercises every foundation seam.

## Inherited interfaces (use, do not rebuild)

- `lib/db/schema/kyc.ts` — `kycCases`, `kycEvents`, `kycCaseStateEnum`, `KycCase`. Tables and enum exist and
  are migrated (`drizzle/0002_kyc.sql`); extend the slice rather than adding parallel tables.
- `lib/db/queries/kyc.ts` — `findKycCaseById(actor, id)`, `countKycCasesByState(actor, state)`. Add the
  queue list/filter accessors here; actor first, `requirePermission(actor, 'kyc.read')` inside.
- `lib/db/mutations/kyc.ts` — `claimKycCase(caseId, assigneeId, from)`,
  `setKycCaseState(caseId, from, to, fields?)` (`escalatedById`, `resolutionReasonCode`, `assignedToId`).
  Both are compare-and-swap on `from` and raise `StaleStateError`.
- `lib/audit` — `audited({ actor, action, entityType, entityId, before })`, with the entity read by the
  query layer passed as `before`; `readAuditLog(actor, { entityType: 'kyc_case', entityId })` is the
  per-case trail. No new history table.
- `lib/workflow` — `defineMachine`, guard helpers `hasPermission`, `distinctActor`, `all`;
  `TransitionRefusedError` carries the guard's reason for inline rendering.
- `lib/rbac` — permissions already defined: `kyc.read`, `kyc.claim`, `kyc.review`, `kyc.approve`,
  `kyc.reject`, `kyc.escalate`, `kyc.resolve_escalated` (`kyc_manager` holds the last one, analysts do not).
- `lib/ui` — `PageShell`, `DataTable`, `DetailDrawer`, `Form`, `StatusBadge`, `JsonDiff`.
- `lib/providers` — `onfidoCheckPayloadSchema`, `MockKycProvider`, `kycProvider()`.
- `lib/time` — `now()`.
- Seeded demo data: 40 cases across all five states (`lib/db/seed/kyc.ts`), `manager1@demo.co` as assignee and
  escalator, `manager2@demo.co` as the distinct resolver.

## State machine

`defineMachine<KycCase, KycCase['state']>({ entityType: 'kyc_case', stateOf: (c) => c.state, ... })`,
transitions keyed `from->to`; `persist` calls the mutation with `from` so the write is a compare-and-swap.

| Transition             | Guards                                                                                                          |
| ---------------------- | --------------------------------------------------------------------------------------------------------------- |
| `pending->in_review`   | `hasPermission('kyc.claim')` — assigns the case to the actor                                                    |
| `in_review->approved`  | `hasPermission('kyc.approve')`                                                                                  |
| `in_review->rejected`  | `hasPermission('kyc.reject')`                                                                                   |
| `in_review->escalated` | `hasPermission('kyc.escalate')` — records `escalatedById`                                                       |
| `escalated->approved`  | `all(hasPermission('kyc.resolve_escalated'), distinctActor((c) => c.escalatedById, 'same_actor_as_escalator'))` |
| `escalated->rejected`  | same as `escalated->approved`                                                                                   |

`approved` and `rejected` declare no outgoing transitions, so they are terminal by construction.

## Settled boundaries

1. **Escalation resolution is four-eyes**: `kyc.resolve_escalated` **plus** `distinctActor` against
   `escalatedById`. Its guard tests come before the guard.
2. SLA countdowns and due-at maths read the clock through `now()` from `lib/time`, so the seed and tests can
   pin it.
3. `/api/webhooks/kyc` is public (no permission check): zod-validate with `onfidoCheckPayloadSchema`, archive
   the payload to `kyc_events`, then create the case.
4. Actions are RBAC-gated buttons plus the per-case audit trail; `ApprovalFlow` belongs to refunds.
5. The app is built from `lib/ui` primitives and registers itself by flipping its `APP_REGISTRY` entry
   (`lib/apps/registry.ts`) to `available: true`; foundation logic stays untouched.
