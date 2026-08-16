import { randomBytes } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { cookies, headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { getDb } from '@/lib/db/client';
import { sessions, users } from '@/lib/db/schema';
import { AuthorizationError, parseGroupRoleMap, resolveRoles, type Actor } from '@/lib/rbac';
import { auth, SESSION_MAX_AGE_SECONDS } from './config';
import { secureCookies, sessionCookieName } from './cookies';
import { DEMO_ACCOUNTS, demoAuthEnabled } from './demo-accounts';
import { verifyPassword } from './password';
import { demoSignInThrottle } from './throttle';

export { auth, handlers, signOut, SESSION_MAX_AGE_SECONDS } from './config';
export { secureCookies, sessionCookieName } from './cookies';
export { DEMO_ACCOUNTS, DEMO_PASSWORD, demoAuthEnabled } from './demo-accounts';
export { hashPassword, verifyPassword } from './password';
export { stepUp, NoopStepUpProvider } from './step-up';
export { AttemptThrottle, TooManyAttemptsError, DEMO_SIGN_IN_POLICY } from './throttle';
export type { StepUpProvider } from './step-up';

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
 * fake Entra groups, and creates a Postgres-backed session. Failed attempts are throttled per
 * client and account, so the fixed demo password cannot be guessed at request rate.
 */
export async function signInAsDemoUser(email: string, password: string): Promise<void> {
  if (!demoAuthEnabled()) throw new AuthorizationError('demo sign-in is disabled');
  const throttleKey = `${await clientAddress()}:${email.toLowerCase()}`;
  demoSignInThrottle.check(throttleKey);

  const account = DEMO_ACCOUNTS.find((candidate) => candidate.email === email);
  const db = getDb();
  const [user] = await db.select().from(users).where(eq(users.email, email)).limit(1);
  if (account === undefined || user === undefined || !verifyPassword(password, user.passwordHash)) {
    demoSignInThrottle.recordFailure(throttleKey);
    throw new AuthorizationError('invalid demo credentials');
  }
  demoSignInThrottle.recordSuccess(throttleKey);

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

/** Best-effort client identity for throttling; unknown clients share one bucket. */
async function clientAddress(): Promise<string> {
  const header = await headers();
  const forwarded = header.get('x-forwarded-for')?.split(',')[0]?.trim();
  return forwarded !== undefined && forwarded !== '' ? forwarded : 'unknown';
}

export async function signOutDemoUser(): Promise<void> {
  const store = await cookies();
  const name = sessionCookieName();
  const token = store.get(name)?.value;
  if (token !== undefined) {
    await revokeDemoSession(token);
    store.delete(name);
  }
}

/** Deletes one session row, for a session replaced by another rather than signed out. */
export async function revokeDemoSession(token: string): Promise<void> {
  await getDb().delete(sessions).where(eq(sessions.sessionToken, token));
}

/** The token of the request's session, if it carries one. */
export async function currentSessionToken(): Promise<string | undefined> {
  return (await cookies()).get(sessionCookieName())?.value;
}
