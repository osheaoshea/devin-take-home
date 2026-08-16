import { DrizzleAdapter } from '@auth/drizzle-adapter';
import { eq } from 'drizzle-orm';
import NextAuth, { type NextAuthConfig } from 'next-auth';
import MicrosoftEntraID from 'next-auth/providers/microsoft-entra-id';
import { getDb } from '@/lib/db/client';
import { accounts, sessions, users, verificationTokens } from '@/lib/db/schema';
import { parseGroupRoleMap, resolveRoles } from '@/lib/rbac';

/** One session lifetime for both sign-in paths: demo rows and the Auth.js database strategy. */
export const SESSION_MAX_AGE_SECONDS = 60 * 60 * 8;

export function authAdapter() {
  return DrizzleAdapter(getDb(), {
    usersTable: users,
    accountsTable: accounts,
    sessionsTable: sessions,
    verificationTokensTable: verificationTokens,
  });
}

/**
 * Entra ID is the production identity provider. The demo IdP is not a provider: it signs a
 * user in through `signInAsDemoUser`, which writes a Postgres session row, so demo and
 * production share one session mechanism (database sessions).
 */
function entraProviders(): NextAuthConfig['providers'] {
  const clientId = process.env.AUTH_MICROSOFT_ENTRA_ID_ID;
  const clientSecret = process.env.AUTH_MICROSOFT_ENTRA_ID_SECRET;
  const issuer = process.env.AUTH_MICROSOFT_ENTRA_ID_ISSUER;
  // A demo deployment has no tenant; configuring a half-built provider makes every request fail.
  if (!clientId || !clientSecret || !issuer) return [];
  return [
    MicrosoftEntraID({
      clientId,
      clientSecret,
      issuer,
      authorization: { params: { scope: 'openid profile email GroupMember.Read.All' } },
    }),
  ];
}

export const authConfig: NextAuthConfig = {
  adapter: authAdapter(),
  session: { strategy: 'database', maxAge: SESSION_MAX_AGE_SECONDS },
  pages: { signIn: '/signin' },
  providers: entraProviders(),
  events: {
    /**
     * Roles come from IdP groups, never from in-app state, and are snapshotted on the user
     * row so audit entries record the roles the actor held at the time.
     */
    async signIn({ user, profile }) {
      if (user.id === undefined) return;
      if (profile !== undefined && !Array.isArray(profile.groups)) {
        // Entra omits `groups` and sends `_claim_names`/`_claim_sources` instead once a user is
        // in more than ~200 groups (the token overage limit). Resolving those needs a Graph
        // call, which is deliberately out of scope here — such a user signs in with no roles.
        console.warn(`sign-in for user ${user.id} carried no groups claim; resolving to no roles`);
      }
      const groups = Array.isArray(profile?.groups) ? profile.groups.filter(isString) : [];
      const roles = resolveRoles(groups, parseGroupRoleMap(process.env.ENTRA_GROUP_MAP));
      await getDb().update(users).set({ groups, roles }).where(eq(users.id, user.id));
    },
  },
};

function isString(value: unknown): value is string {
  return typeof value === 'string';
}

export const { handlers, auth, signOut } = NextAuth(authConfig);
