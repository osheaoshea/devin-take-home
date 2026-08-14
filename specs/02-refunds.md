# Spec 02 — Refunds dashboard (stub)

**Not yet written.** This stub records only the boundaries settled during the spec 00 design session. Scope
comes from `technical-context.md` §5.2.

## Inherited from spec 00 (do not rebuild)

- `lib/rbac`, `lib/audit`, `lib/workflow`, `lib/time`, `lib/db` accessors (`actor` first argument, always).
- `lib/ui`: `DataTable`, `Form`, `DetailDrawer`, `StatusBadge`, `PageShell`.
- `lib/providers`: `PaymentsProvider` interface; add `MockStripeProvider` here — `issueRefund()` is called only
  on final approval and records rather than calls out.
- `lib/apps`: export `src/app/refunds/app.config.ts` + one line in the barrel.
- `ActionResult<T>`; guard reason codes render inline.

## Settled boundaries

1. **This spec owns `ApprovalFlow`.** It was deliberately deferred from spec 00 rather than designed
   speculatively: build it in `lib/ui` (extending the library, never forking it, per context §9.6) driven by the
   real threshold logic here, and shaped so spec 01-style gated actions could adopt it later.
2. Refund tables and enums live in `lib/db/schema/refunds.ts` (`refunds`, `refund_approvals` — one row per
   approval, which is what makes dual approval representable).
3. Multi-entity mutations write **one audit entry per entity touched** in the same transaction: approving a
   refund audits the refund *and* the approval row. Use `auditAlso(tx, ...)`.
4. Threshold routing is guards, not UI: `support_agent` ≤ £100, `finance_manager` ≤ £5,000, > £5,000 needs two
   **distinct** `finance_manager` approvals. Guard tests come first and must cover both threshold boundaries
   exactly and the same-approver rejection.
5. Amounts are stored in **minor units as integers** with an explicit currency column — never floats.
6. Node runtime for every DB-touching route/action. Seed additions composable and deterministic.
7. **Merge serially**: rebase on `main`, then regenerate the migration before merge.
