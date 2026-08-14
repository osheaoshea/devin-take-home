import { expect, test, type Page } from '@playwright/test';

async function signIn(page: Page, email: string): Promise<void> {
  await page.goto('/signin');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill('demo');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByTestId('role-indicator')).toBeVisible();
}

test('signed-out visitors are sent to the mock IdP sign-in page', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveURL(/\/signin/);
  await expect(page.getByText('Microsoft Entra ID')).toBeVisible();
});

test('middleware turns an anonymous request for a tool away before the page runs', async ({
  page,
}) => {
  await page.goto('/kyc');
  await expect(page).toHaveURL(/\/signin$/);
});

test('an admin sees the hub with their roles and can open the audit log', async ({ page }) => {
  await page.goto('/signin');
  await page.getByLabel('Email').fill('admin@demo.co');
  await page.getByLabel('Password').fill('demo');
  await page.getByRole('button', { name: 'Sign in' }).click();

  await expect(page.getByRole('heading', { name: 'Internal tools' })).toBeVisible();
  await expect(page.getByTestId('role-indicator')).toContainText('admin');
  await expect(page.getByText('KYC review queue')).toBeVisible();

  await page.getByRole('link', { name: 'Audit log' }).click();
  await expect(page.getByRole('heading', { name: 'Audit log' })).toBeVisible();
});

test('a viewer is refused the audit log with a 403 page, not a server error', async ({ page }) => {
  await page.goto('/signin');
  await page.getByLabel('Email').fill('viewer@demo.co');
  await page.getByLabel('Password').fill('demo');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByTestId('role-indicator')).toContainText('viewer');

  const response = await page.goto('/admin/audit');
  expect(response?.status()).toBe(403);
  await expect(page.getByTestId('forbidden')).toContainText('403');
  // Still signed in: refusal is about permissions, not identity.
  await expect(page.getByTestId('role-indicator')).toContainText('viewer');
});

test('a viewer reads the tools but is offered no action controls', async ({ page }) => {
  await signIn(page, 'viewer@demo.co');

  const nav = page.getByRole('navigation');
  await expect(nav.getByRole('link', { name: 'KYC' })).toBeVisible();
  await expect(nav.getByRole('link', { name: 'Audit' })).toHaveCount(0);

  await page.goto('/kyc');
  await expect(page.getByRole('heading', { name: 'KYC review queue' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Simulate new applicant' })).toHaveCount(0);

  const response = await page.goto('/admin/audit');
  expect(response?.status()).toBe(403);
});

test('a manager is given no route to the audit log', async ({ page }) => {
  await signIn(page, 'manager1@demo.co');
  await expect(page.getByTestId('role-indicator')).toContainText('kyc_manager');

  await expect(page.getByRole('navigation').getByRole('link', { name: 'Audit' })).toHaveCount(0);

  const response = await page.goto('/admin/audit');
  expect(response?.status()).toBe(403);
});

test('the demo switcher swaps the signed-in account through the real sign-in path', async ({
  page,
}) => {
  await signIn(page, 'admin@demo.co');

  const switcher = page.getByTestId('demo-switcher');
  await switcher.locator('summary').click();
  await switcher.locator('button', { hasText: 'Viewer' }).click();

  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByTestId('role-indicator')).toContainText('viewer');
  await expect(page.getByTestId('role-indicator')).not.toContainText('admin');

  const response = await page.goto('/admin/audit');
  expect(response?.status()).toBe(403);
});

test('the demo switcher is absent when signed out', async ({ page }) => {
  await page.goto('/signin');
  await expect(page.getByTestId('demo-switcher')).toHaveCount(0);
});
