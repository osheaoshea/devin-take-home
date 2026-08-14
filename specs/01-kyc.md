# Spec 01 — KYC review queue (stub)

**Not yet written.** This stub records only the boundaries settled during the spec 00 design session, so this
spec is written without re-litigating them. Scope comes from `technical-context.md` §5.1.

## Inherited from spec 00 (do not rebuild)

- `lib/rbac`: `Actor`, `requirePermission`, `POLICY` — append KYC permissions to the `Permission` union.
- `lib/audit`: `audited()` / `auditAlso()`; `/admin/audit`'s reader component, reused filtered by
  `entity_type = 'kyc_case'` for the per-case audit trail.
- `lib/workflow`: `defineWorkflow` — states `pending → in_review → approved | rejected | escalated`;
  `escalated → approved | rejected`; every state in the transitions map, terminal states map to `[]`.
- `lib/ui`: `DataTable`, `Form`, `DetailDrawer`, `StatusBadge`, `PageShell`.
- `lib/time`: `Clock` — **all** SLA countdown and due-at maths goes through it.
- `lib/providers`: `KycProvider` interface; add the mock implementation here.
- `lib/apps`: export `src/app/kyc/app.config.ts` and add one line to the `lib/apps` barrel.
- `ActionResult<T>`; guard reason codes pass through untranslated and render inline.

## Settled boundaries

1. **Do not create an approval-flow component.** Escalation UI is RBAC-gated action buttons plus the per-case
   audit trail. `ApprovalFlow` is spec 02's to build.
2. KYC tables **and their enums** live in `lib/db/schema/kyc.ts`; this spec owns them (`kyc_cases`,
   `kyc_events`). Foundation owns no shared enums.
3. Every DB-touching route and action declares the Node runtime.
4. `/api/webhooks/kyc` is one of only two public endpoints (no `requirePermission`); its payload is
   zod-validated and archived to `kyc_events` before a case is created.
5. Four-eyes on escalated cases (`kyc_manager` **and** resolver ≠ escalator) follows the `_reference` app's
   guard pattern, and its guard tests are written before the guard.
6. Seed additions are a separate composable module; deterministic, fixed RNG seed, dates from the `Clock`.
7. **Merge serially.** Rebase on `main`, then regenerate the Drizzle migration *after* the rebase and before
   merge, so the journal never conflicts with a parallel app PR.
