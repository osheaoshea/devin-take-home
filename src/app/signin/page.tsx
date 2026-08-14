import { redirect } from 'next/navigation';
import { demoSignInAction } from '@/app/actions';
import { DEMO_ACCOUNTS, DEMO_PASSWORD, demoAuthEnabled, getActor } from '@/lib/auth';
import { SignInForm } from './SignInForm';

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  if ((await getActor()) !== undefined) redirect('/');
  const { error } = await searchParams;

  return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-6">
      <h1 className="text-lg font-semibold">Internal Tools</h1>
      <p className="mt-1 text-sm text-muted">
        Production signs in with Microsoft Entra ID. This demo uses a mock IdP that issues the same
        group claims.
      </p>
      <div className="mt-6 rounded border border-line bg-surface p-6">
        {demoAuthEnabled() ? (
          <SignInForm action={demoSignInAction} defaultPassword={DEMO_PASSWORD} error={error} />
        ) : (
          <p className="text-sm">
            Demo sign-in is disabled. Set <code>DEMO_AUTH_ENABLED=true</code> for local demos, or
            sign in with Entra ID.
          </p>
        )}
      </div>
      {demoAuthEnabled() ? (
        <div className="mt-6 text-xs text-muted">
          <p className="font-medium text-ink">Demo accounts (password: {DEMO_PASSWORD})</p>
          <ul className="mt-2 space-y-1">
            {DEMO_ACCOUNTS.map((account) => (
              <li key={account.email}>
                {account.email} — {account.groups.join(', ')}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
