---
name: testing-internal-tools-demo
description: Run and test the internal-tools platform demo end to end (mock IdP sign-in, RBAC hub, audit viewer). Use when verifying UI behaviour of this repo locally.
---

# Testing the internal-tools demo locally

## Bring the app up

```bash
export PATH=$HOME/.local/bin:$PATH          # pnpm is user-local
docker compose up -d || docker start itp-postgres   # container may already exist from a prior session
docker exec itp-postgres pg_isready -U postgres
pnpm db:migrate && pnpm db:seed             # idempotent; pnpm db:reset to start clean
pnpm build && pnpm start                    # :3000 (pnpm dev also fine)
```

- `psql` is not on the host: use `docker exec itp-postgres psql -U postgres -d internal_tools -c "..."`.
- Sessions table column is `sessions.user_id` (not `"userId"`), so joins are
  `join users u on u.id = s.user_id`. One row per signed-in browser proves the Postgres session.
- Backgrounding `pnpm start` with `&` inside a one-shot shell tends to die; start it in a
  dedicated background shell instead and poll `curl -s -o /dev/null -w "%{http_code}" localhost:3000/signin`.

## Signing in

`/signin` is a mock IdP (real Entra ID in prod). All 4 demo accounts use password `demo`
(`admin@`, `manager1@`, `manager2@`, `viewer@demo.co`); the two managers are identical in authority
so four-eyes and dual approval have a distinct second actor.
Requires `DEMO_AUTH_ENABLED=true` in `.env`. Wrong password → `/signin?error=rejected` with an inline error.
Sign out and the demo user switcher are in the sidebar's account block; signing out deletes the
Postgres session row, and switching deletes it and creates the next account's.

## Things worth knowing before you write assertions

- Every non-admin role holds `kyc.read`/`refunds.read`/`flags.read` (`READ_EVERYWHERE` in
  `src/lib/rbac/roles.ts`), so with the default group map **no demo account shows the disabled
  "You do not have a role for this tool" card**. To exercise that state (and the
  "unknown IdP group is ignored" path) restrict the group map by config, not code:
  append e.g. `ENTRA_GROUP_MAP={"ENTRA-Engineering":["engineer"]}` to `.env`, restart, then sign in
  as `viewer@demo.co` → "no roles" badge, empty nav, all cards disabled.
  Roles are snapshotted on the user row at sign-in, so **restore `.env` and sign that account in
  again afterwards** or the demo DB keeps the empty roles snapshot.
- The audit table is empty after a fresh seed (seeding is not an audited mutation). To get rows for
  the `/admin/audit` viewer, run a throwaway `tsx` script that loads `.env` via dotenv and calls
  `audited({actor, action:'kyc.case.claim', entityType:'kyc_case', entityId, before}, tx => tx.claimKycCase(id, actorId))`
  with a pending KYC case; that yields a real before/after diff (`state: pending → in_review`).
- Non-admins hitting `/admin/audit` get a thrown `AuthorizationError` → unstyled Next.js 500 page
  ("Application error: a server-side exception has occurred") plus a browser console error. Data is
  not leaked, but if a styled 403 has since been added, expect that instead.
- Role indicator badges live in the sidebar account block (`data-testid="role-indicator"`), and the
  switcher form is `data-testid="demo-switcher"`; nav links are filtered
  by permission and the Audit link/Operator panel are admin-only.
- The `/kyc`, `/refunds`, `/flags` routes are intentional placeholders until specs 01–03, so hub
  cards say "Ships with its own spec" while the nav still links to the placeholder pages.

## Devin Secrets Needed

None — the demo runs fully locally with `.env` copied from `.env.example`.
