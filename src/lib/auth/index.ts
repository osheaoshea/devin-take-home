import { randomBytes } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { getDb } from '@/lib/db/client';
import { sessions, users } from '@/lib/db/schema';
import { AuthorizationError, parseGroupRoleMap, resolveRoles, type Actor } from '@/lib/rbac';
import { auth } from './config';
import { DEMO_ACCOUNTS, demoAuthEnabled } from './demo-accounts';
import { verifyPassword } from './password';

export { auth, handlers, signOut } from './config';
export { DEMO_ACCOUNTS, DEMO_PASSWORD, demoAuthEnabled } from './demo-accounts';
export { hashPassword, verifyPassword } from './password';
export { stepUp, NoopStepUpProvider } from './step-up';
export type { StepUpProvider } from './step-up';

const SESSION_MAX_AGE_SECONDS = 60 * 60 * 8;

/**
 * Auth.js keys its cookie on the deployment URL scheme, not NODE_ENV — a production build served
 * over http (local demo) must not use the `__Secure-` prefix or the browser drops the cookie.
 */
function secureCookies(): boolean {
  const url = process.env.AUTH_URL ?? process.env.NEXTAUTH_URL ?? '';
  return url.startsWith('https://') || process.env.VERCEL === '1';
}

function sessionCookieName(): string {
  return secureCookies() ? '__Secure-authjs.session-token' : 'authjs.session-token';
}

/** The signed-in actor, or undefined when signed out. */
export async function getActor(): Promise<Actor | undefined> {
  const session = await auth();
  const userId = session?.user?.id;
  if (userId === undefined) return undefined;
  const [row] = await getDb().select().from(users).where(eq(users.id, userId)).limit(1);
  if (row === undefined) return undefined;
  return { id: row.id, email: row.email, name: row.name, roles: row.roles };
}

/** For route segments and server actions: an actor, or a redirect to sign-in. */
export async function requireActor(): Promise<Actor> {
  const actor = await getActor();
  if (actor === undefined) redirect('/signin');
  return actor;
}

/**
 * Demo sign-in: validates the mock-IdP credentials, re-resolves roles from the account's
 * fake Entra groups, and creates a Postgres-backed session.
 */
export async function signInAsDemoUser(email: string, password: string): Promise<void> {
  if (!demoAuthEnabled()) throw new AuthorizationError('demo sign-in is disabled');
  const account = DEMO_ACCOUNTS.find((candidate) => candidate.email === email);
  const db = getDb();
  const [user] = await db.select().from(users).where(eq(users.email, email)).limit(1);
  if (account === undefined || user === undefined || !verifyPassword(password, user.passwordHash)) {
    throw new AuthorizationError('invalid demo credentials');
  }

  const roles = resolveRoles(account.groups, parseGroupRoleMap(process.env.ENTRA_GROUP_MAP));
  await db.update(users).set({ groups: account.groups, roles }).where(eq(users.id, user.id));

  const sessionToken = randomBytes(32).toString('hex');
  const expires = new Date(Date.now() + SESSION_MAX_AGE_SECONDS * 1000);
  await db.insert(sessions).values({ sessionToken, userId: user.id, expires });

  const store = await cookies();
  store.set(sessionCookieName(), sessionToken, {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    secure: secureCookies(),
    expires,
  });
}

export async function signOutDemoUser(): Promise<void> {
  const store = await cookies();
  const name = sessionCookieName();
  const token = store.get(name)?.value;
  if (token !== undefined) {
    await getDb().delete(sessions).where(eq(sessions.sessionToken, token));
    store.delete(name);
  }
}
