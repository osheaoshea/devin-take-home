# Spec 03 — Feature-flag admin (stub)

**Not yet written.** This stub records only the boundaries settled during the spec 00 design session. Scope
comes from `technical-context.md` §5.3. **Thinness is the point** — this app is the marginal-cost proof, so
resist adding anything not in §5.3.

## Inherited from spec 00 (do not rebuild)

- `lib/rbac`, `lib/audit`, `lib/workflow`, `lib/time`, `lib/db` accessors, `lib/ui` primitives, `lib/apps`.
- `ActionResult<T>`; guard reason codes render inline.

## Settled boundaries

1. **No history table.** The change-history view is the spec 00 audit reader filtered by
   `entity_type in ('flag','flag_state')` — this is the foundation-reuse demonstration, so reusing that
   component rather than writing a new one is the point of the app.
2. Flag tables and enums live in `lib/db/schema/flags.ts` (`flags`, `flag_states` per environment).
3. `GET /api/flags/:env` is the second of the two public endpoints (no `requirePermission`), read-only, and
   still declares the Node runtime.
4. Kill switch = one audited mutation turning every env off; `engineer`+ only, enforced in the accessor, not
   just the button.
5. Prod changes show a confirm modal — a client island; everything else stays a server component.
6. Seed additions composable and deterministic.
7. **Merge serially**: rebase on `main`, then regenerate the migration before merge.
