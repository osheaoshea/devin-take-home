import { expect, test, type Page } from '@playwright/test';

const READ_ONLY_COPY =
  'Deciding refunds is the finance managers’ call — your role can read them only.';

async function signIn(page: Page, email: string): Promise<void> {
  await page.goto('/signin');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill('demo');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByTestId('role-indicator')).toBeVisible();
}

async function signOut(page: Page): Promise<void> {
  await page.goto('/refunds');
  await page.getByRole('button', { name: 'Sign out' }).click();
}

/** Opens the nth seeded open request, since seeded data is the only source of refunds. */
async function openSeededRequest(page: Page, index: number): Promise<string> {
  await page.goto('/refunds?state=requested&sort=created&dir=asc');
  await page.locator('tbody tr a').nth(index).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  const refundId = new URL(page.url()).searchParams.get('refund') ?? '';
  expect(refundId).not.toBe('');
  return refundId;
}

test('a finance manager approves one seeded refund and rejects another', async ({ page }) => {
  await signIn(page, 'fmanager@demo.co');

  const approvedId = await openSeededRequest(page, 0);
  await page.getByTestId('refund-action-approved').getByRole('button').click();

  const approved = page.getByRole('dialog');
  await expect(approved.getByText('approved', { exact: true }).first()).toBeVisible();
  await expect(approved).toContainText('fmanager@demo.co');
  await expect(approved).toContainText('terminal');
  // The provider ran on the way into `approved`, and its refund id is on the record.
  await expect(approved).toContainText(/provider re_/);

  const rejectedId = await openSeededRequest(page, 0);
  expect(rejectedId).not.toBe(approvedId);
  await page.getByTestId('refund-action-rejected').getByRole('button').click();

  const rejected = page.getByRole('dialog');
  await expect(rejected.getByText('rejected', { exact: true }).first()).toBeVisible();
  await expect(rejected).toContainText('fmanager@demo.co');
  await expect(rejected).not.toContainText('provider re_');

  // Both decisions are in the log, each naming the manager who took it.
  await signOut(page);
  await signIn(page, 'admin@demo.co');
  await page.goto(`/admin/audit?entityType=refund&entityId=${approvedId}`);
  await expect(page.locator('tbody tr').filter({ hasText: 'refund.approved' })).toHaveCount(1);
  await page.goto(`/admin/audit?entityType=refund&entityId=${rejectedId}`);
  await expect(page.locator('tbody tr').filter({ hasText: 'refund.rejected' })).toHaveCount(1);
});

test('a viewer reads the dashboard but every decision is disabled and explained', async ({
  page,
}) => {
  await signIn(page, 'viewer@demo.co');
  await page.goto('/refunds');

  await expect(page.getByTestId('tile-open-requests')).toContainText(/\d+/);
  await expect(page.getByTestId('tile-total-exposure')).toContainText('£');
  await expect(page.getByTestId('tile-approved-this-week')).toContainText(/\d+/);

  await page.goto('/refunds?state=requested');
  await page.locator('tbody tr a').first().click();
  const drawer = page.getByRole('dialog');

  for (const to of ['approved', 'rejected']) {
    const action = page.getByTestId(`refund-action-${to}`);
    await expect(action.getByRole('button')).toBeDisabled();
    await expect(action.getByRole('alert')).toHaveText(READ_ONLY_COPY);
  }
  await expect(drawer).not.toContainText('missing_permission');
});
