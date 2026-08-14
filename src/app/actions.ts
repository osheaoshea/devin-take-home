'use server';

import { redirect } from 'next/navigation';
import { z } from 'zod';
import { signInAsDemoUser, signOutDemoUser, TooManyAttemptsError } from '@/lib/auth';

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

export async function signOutAction(): Promise<void> {
  await signOutDemoUser();
  redirect('/signin');
}
