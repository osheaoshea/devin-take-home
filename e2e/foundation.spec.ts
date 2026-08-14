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

test('a viewer cannot reach the audit log', async ({ page }) => {
  await page.goto('/signin');
  await page.getByLabel('Email').fill('viewer@demo.co');
  await page.getByLabel('Password').fill('demo');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByTestId('role-indicator')).toContainText('viewer');

  const response = await page.goto('/admin/audit');
  expect(response?.status()).toBeGreaterThanOrEqual(400);
});
