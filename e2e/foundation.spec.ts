import { expect, test } from '@playwright/test';

test('signed-out visitors are sent to the mock IdP sign-in page', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveURL(/\/signin/);
  await expect(page.getByText('Microsoft Entra ID')).toBeVisible();
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

test('an engineer only sees the tool their roles cover', async ({ page }) => {
  await page.goto('/signin');
  await page.getByLabel('Email').fill('engineer@demo.co');
  await page.getByLabel('Password').fill('demo');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByTestId('role-indicator')).toContainText('engineer');

  const nav = page.getByRole('navigation');
  await expect(nav.getByRole('link', { name: 'Flags' })).toBeVisible();
  await expect(nav.getByRole('link', { name: 'KYC' })).toHaveCount(0);
  await expect(page.getByTestId('card-/kyc')).toContainText('You do not have a role for this tool');

  const response = await page.goto('/kyc');
  expect(response?.status()).toBe(403);
});
