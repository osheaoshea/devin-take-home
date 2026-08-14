import { expect, test, type Page } from '@playwright/test';

const FOUR_EYES_COPY = 'You gave the first approval, so a second finance manager must complete it.';

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

/** Opens a refund by id, which is how each approver picks up where the last one left off. */
async function openRefund(page: Page, refundId: string): Promise<void> {
  await page.goto(`/refunds?refund=${refundId}`);
  await expect(page.getByRole('dialog')).toBeVisible();
}

test('a refund above £5,000 needs two distinct finance managers to settle it', async ({ page }) => {
  await signIn(page, 'agent@demo.co');
  await page.goto('/refunds');

  const raise = page.getByTestId('raise-refund');
  await raise.getByLabel('Customer email').fill('dual@example.com');
  await raise.getByLabel('Original payment id').fill('pi_mock_dual');
  await raise.getByLabel('Amount (£)').fill('7500.50');
  await raise.getByLabel('Reason').selectOption('duplicate_charge');
  await raise.getByRole('button', { name: 'Raise refund' }).click();

  // The refund opens on the amount it was raised for, in the state the guards routed it to.
  const raised = page.getByRole('dialog');
  await expect(raised).toContainText('£7,500.50');
  await expect(raised.getByText('requested', { exact: true }).first()).toBeVisible();
  const refundId = new URL(page.url()).searchParams.get('refund') ?? '';
  expect(refundId).not.toBe('');

  // The agent's own approval limit is £100, so the outright approval is disabled and explained.
  await expect(page.getByTestId('refund-action-approved').getByRole('button')).toBeDisabled();
  await expect(page.getByTestId('refund-action-approved').getByRole('alert')).toContainText(
    'Refunds over £100.00 need a finance manager.',
  );
  await expect(raised).not.toContainText('missing_permission');

  await signOut(page);
  await signIn(page, 'fmanager@demo.co');
  await openRefund(page, refundId);

  // Above £5,000 a finance manager cannot settle it alone: the only approval open routes it on.
  await expect(page.getByTestId('refund-action-approved').getByRole('button')).toBeDisabled();
  await expect(page.getByTestId('refund-action-approved').getByRole('alert')).toContainText(
    'need two finance managers',
  );
  await page.getByTestId('refund-action-needs_second_approval').getByRole('button').click();

  const routed = page.getByRole('dialog');
  await expect(routed.getByText('needs_second_approval', { exact: true }).first()).toBeVisible();
  await expect(routed).toContainText('fmanager@demo.co');
  await expect(routed).not.toContainText('provider re_');

  // Four eyes: the same manager may not complete their own approval.
  const secondApproval = page.getByTestId('refund-action-approved');
  await expect(secondApproval.getByRole('button')).toBeDisabled();
  await expect(secondApproval.getByRole('alert')).toHaveText(FOUR_EYES_COPY);
  await expect(routed).not.toContainText('same_approver');

  await signOut(page);
  await signIn(page, 'fmanager2@demo.co');
  await openRefund(page, refundId);
  await page.getByTestId('refund-action-approved').getByRole('button').click();

  const settled = page.getByRole('dialog');
  await expect(settled.getByText('approved', { exact: true }).first()).toBeVisible();
  await expect(settled).toContainText('fmanager2@demo.co');
  await expect(settled).toContainText('terminal');
  // The provider ran once, on the way into `approved`, and its refund id is on the record.
  await expect(settled).toContainText(/provider re_/);

  // The trail an operator sees: both approvals and the creation, each with its actor.
  await signOut(page);
  await signIn(page, 'admin@demo.co');
  await page.goto(`/admin/audit?entityType=refund&entityId=${refundId}`);
  const rows = page.locator('tbody tr');
  await expect(rows.filter({ hasText: 'refund.approved' })).toHaveCount(1);
  await expect(rows.filter({ hasText: 'refund.needs_second_approval' })).toHaveCount(1);
  await expect(rows.filter({ hasText: 'refund.created' })).toHaveCount(1);
});

test('the dashboard leads with the numbers a finance manager works from', async ({ page }) => {
  await signIn(page, 'fmanager@demo.co');
  await page.goto('/refunds');

  await expect(page.getByTestId('tile-open-requests')).toContainText(/\d+/);
  await expect(page.getByTestId('tile-total-exposure')).toContainText('£');
  await expect(page.getByTestId('tile-approved-this-week')).toContainText(/\d+/);

  // A refund an agent may raise but not approve stays visible to them, and read-only for a viewer.
  await page.goto('/refunds?state=requested');
  await expect(page.locator('tbody tr').first()).toBeVisible();

  await signOut(page);
  await signIn(page, 'viewer@demo.co');
  await page.goto('/refunds?state=requested');
  await expect(page.getByTestId('raise-refund')).toHaveCount(0);
  await page.locator('tbody tr a').first().click();
  const drawer = page.getByRole('dialog');
  await expect(drawer.getByRole('button', { name: /Approve|Reject/ }).first()).toBeDisabled();
  await expect(drawer.getByRole('alert').first()).toContainText("Your role can't perform");
});
