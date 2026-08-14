'use server';

import { redirect } from 'next/navigation';
import { z } from 'zod';
import { permissionForPath } from '@/lib/apps/registry';
import {
  currentSessionToken,
  DEMO_ACCOUNTS,
  DEMO_PASSWORD,
  demoAuthEnabled,
  getActor,
  revokeDemoSession,
  signInAsDemoUser,
  signOutDemoUser,
  TooManyAttemptsError,
} from '@/lib/auth';
import { AuthorizationError, parseGroupRoleMap, permissionsFor, resolveRoles } from '@/lib/rbac';

const demoSignInSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export async function demoSignInAction(formData: FormData): Promise<void> {
  const parsed = demoSignInSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) redirect('/signin?error=invalid');
  try {
    await signInAsDemoUser(parsed.data.email, parsed.data.password);
  } catch (error) {
    redirect(
      error instanceof TooManyAttemptsError ? '/signin?error=throttled' : '/signin?error=rejected',
    );
  }
  redirect('/');
}

const switchDemoUserSchema = z.object({
  email: z.string().email(),
  redirectTo: z.string().optional(),
});

/**
 * Demo convenience only: swaps the signed-in demo account for another one by running the real
 * sign-in path, so the new session's roles come from the account's group claims exactly
 * as they would at the sign-in page. It grants nothing an actor could not get by signing in
 * themselves, but it still refuses unless demo auth is on and a demo actor is already signed in.
 */
export async function switchDemoUserAction(formData: FormData): Promise<void> {
  if (!demoAuthEnabled()) throw new AuthorizationError('demo sign-in is disabled');
  if ((await getActor()) === undefined) redirect('/signin');

  const parsed = switchDemoUserSchema.safeParse(Object.fromEntries(formData));
  const account =
    parsed.success === true
      ? DEMO_ACCOUNTS.find((candidate) => candidate.email === parsed.data.email)
      : undefined;
  if (account === undefined) throw new AuthorizationError('unknown demo account');

  // Signing in before ending the old session means a refused or throttled attempt leaves the actor
  // on the session they already had, rather than signed out and bounced to /signin.
  const requested = safeRedirectPath(parsed.success === true ? parsed.data.redirectTo : undefined);
  const replaced = await currentSessionToken();
  try {
    await signInAsDemoUser(account.email, DEMO_PASSWORD);
  } catch (error) {
    if (error instanceof TooManyAttemptsError || error instanceof AuthorizationError)
      redirect(requested);
    throw error;
  }
  if (replaced !== undefined) await revokeDemoSession(replaced);

  redirect(reachableBy(account.groups, requested));
}

/**
 * Where to land the switched-in account: the page they were on, unless that route's permission is
 * outside what the account's groups resolve to, in which case the hub, which every account sees.
 */
function reachableBy(groups: readonly string[], requested: string): string {
  const permission = permissionForPath(requested);
  if (permission === undefined) return requested;
  const roles = resolveRoles(groups, parseGroupRoleMap(process.env.ENTRA_GROUP_MAP));
  return permissionsFor(roles).has(permission) ? requested : '/';
}

/** Only same-origin paths are honoured, so the hidden field cannot become an open redirect. */
function safeRedirectPath(candidate: string | undefined): string {
  if (candidate === undefined || !candidate.startsWith('/') || candidate.startsWith('//'))
    return '/';
  return candidate;
}

export async function signOutAction(): Promise<void> {
  await signOutDemoUser();
  redirect('/signin');
}
