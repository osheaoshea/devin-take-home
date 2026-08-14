import { expect, test, type Page } from '@playwright/test';

const ROLE_REFUSAL = "Your role can't perform this action.";

async function signIn(page: Page, email: string): Promise<void> {
  await page.goto('/signin');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill('demo');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByTestId('role-indicator')).toBeVisible();
}

/** Opens a flag by key and returns its id, read from the drawer's URL. */
async function openFlag(page: Page, key: string): Promise<string> {
  await page.goto('/flags');
  await expect(page.getByRole('heading', { name: 'Feature flags' })).toBeVisible();
  await page.getByRole('link', { name: key, exact: true }).click();
  await expect(page.getByRole('dialog', { name: key })).toBeVisible();
  const id = new URL(page.url()).searchParams.get('flag');
  expect(id).not.toBeNull();
  return id ?? '';
}

test('an engineer toggles staging and kills a flag, and both changes are in its history', async ({
  page,
}) => {
  await signIn(page, 'engineer@demo.co');
  const flagId = await openFlag(page, 'checkout-v2');

  const staging = page.getByTestId('flag-env-staging');
  const toggle = page.getByTestId('flag-toggle-staging');
  const before = (await toggle.getByRole('button').innerText()) === 'Turn on' ? 'off' : 'on';

  await toggle.getByRole('button').click();
  await expect(page.getByTestId('flag-toggle-staging').getByRole('button')).toHaveText(
    before === 'off' ? 'Turn off' : 'Turn on',
  );
  await expect(staging.getByRole('alert')).toHaveCount(0);

  // The kill switch is a production change, so it is confirmed before it posts.
  await page.getByTestId('flag-kill').getByRole('button', { name: 'Kill everywhere' }).click();
  const confirm = page.getByRole('dialog', { name: /Kill checkout-v2 everywhere/ });
  await expect(confirm).toBeVisible();
  await confirm.getByRole('button', { name: 'Kill everywhere' }).click();

  for (const environment of ['dev', 'staging', 'prod']) {
    await expect(page.getByTestId(`flag-env-${environment}`).getByText(/^off/)).toBeVisible();
  }

  // An engineer holds no audit.read, so the trail is read back by an actor who does.
  await page.goto('/flags');
  await page.getByRole('button', { name: 'Sign out' }).click();
  await signIn(page, 'admin@demo.co');
  await page.goto(`/flags?flag=${flagId}`);

  const history = page.getByTestId('flag-history');
  await expect(history.getByText('flag.kill_switch')).toHaveCount(1);
  await expect(history.getByText(`flag_state.${before === 'off' ? 'on' : 'off'}`)).toHaveCount(1);
  await expect(history).toContainText('engineer@demo.co');
});

test('a viewer sees every flag control disabled and explained in prose', async ({ page }) => {
  await signIn(page, 'viewer@demo.co');
  await openFlag(page, 'instant-payouts');

  const kill = page.getByTestId('flag-kill');
  await expect(kill.getByRole('button')).toBeDisabled();
  await expect(kill.getByRole('alert')).toHaveText(ROLE_REFUSAL);

  for (const environment of ['dev', 'staging', 'prod']) {
    const toggle = page.getByTestId(`flag-toggle-${environment}`);
    await expect(toggle.getByRole('button')).toBeDisabled();
    await expect(toggle.getByRole('alert')).toHaveText(ROLE_REFUSAL);
  }

  const drawer = page.getByRole('dialog', { name: 'instant-payouts' });
  await expect(drawer).not.toContainText('missing_permission');
  await expect(drawer).toContainText('needs the audit.read permission');
});

test('the public evaluation endpoint serves one environment, read-only and unauthenticated', async ({
  request,
}) => {
  const response = await request.get('/api/flags/prod');
  expect(response.status()).toBe(200);
  const body = (await response.json()) as {
    environment: string;
    evaluatedAt: string;
    flags: { key: string; enabled: boolean; kind: string; rolloutPercentage: number }[];
  };
  expect(body.environment).toBe('prod');
  expect(body.flags.length).toBeGreaterThan(0);
  expect(body.flags.map((flag) => flag.key)).toEqual([...body.flags.map((f) => f.key)].sort());

  const unknown = await request.get('/api/flags/qa');
  expect(unknown.status()).toBe(404);

  // Read-only: the route offers no mutating method at all.
  expect((await request.post('/api/flags/prod')).status()).toBe(405);
});
