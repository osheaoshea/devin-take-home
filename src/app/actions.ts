'use server';

import { redirect } from 'next/navigation';
import { z } from 'zod';
import {
  DEMO_ACCOUNTS,
  DEMO_PASSWORD,
  demoAuthEnabled,
  getActor,
  signInAsDemoUser,
  signOutDemoUser,
  TooManyAttemptsError,
} from '@/lib/auth';
import { AuthorizationError } from '@/lib/rbac';

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
 * sign-out/sign-in path, so the new session's roles come from the account's group claims exactly
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

  await signOutDemoUser();
  await signInAsDemoUser(account.email, DEMO_PASSWORD);
  redirect(safeRedirectPath(parsed.success === true ? parsed.data.redirectTo : undefined));
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
