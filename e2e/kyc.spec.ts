import { expect, test, type Page } from '@playwright/test';
import { WEBHOOK_SECRET } from '../playwright.config';

const FOUR_EYES_COPY = 'You escalated this case, so a different manager must resolve it.';

async function signIn(page: Page, email: string): Promise<void> {
  await page.goto('/signin');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill('demo');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByTestId('role-indicator')).toBeVisible();
}

/** Opens the first case of the given state and returns its id, read from the drawer's URL. */
async function openFirstCase(page: Page, state: string): Promise<string> {
  await page.goto(`/kyc?state=${state}`);
  await expect(page.getByRole('heading', { name: 'KYC review queue' })).toBeVisible();
  await page.getByRole('link').filter({ hasText: /\w/ }).nth(0).waitFor();
  await page.locator('tbody tr a').first().click();
  await expect(page.getByRole('dialog')).toBeVisible();
  const id = new URL(page.url()).searchParams.get('case');
  expect(id).not.toBeNull();
  return id ?? '';
}

test('an analyst claims a pending case, approves it, and the action lands in the audit log', async ({
  page,
}) => {
  await signIn(page, 'analyst@demo.co');
  const caseId = await openFirstCase(page, 'pending');

  const drawer = page.getByRole('dialog');
  await expect(drawer.getByText('pending', { exact: true }).first()).toBeVisible();

  await drawer.getByTestId('kyc-action-in_review').getByRole('button').click();
  await expect(
    page.getByRole('dialog').getByText('in_review', { exact: true }).first(),
  ).toBeVisible();
  await expect(page.getByRole('dialog')).toContainText('analyst@demo.co');

  // Sibling action forms post the same field name, so each label must reach its own select.
  const approve = page.getByTestId('kyc-action-approved');
  await approve.getByLabel('Reason code (approved)').selectOption('documents_verified');
  await expect(
    page.getByTestId('kyc-action-rejected').getByLabel('Reason code (rejected)'),
  ).toHaveValue('document_mismatch');
  await approve.getByRole('button', { name: 'Approve' }).click();

  const resolved = page.getByRole('dialog');
  await expect(resolved.getByText('approved', { exact: true }).first()).toBeVisible();
  await expect(resolved).toContainText('documents_verified');
  await expect(resolved).toContainText('terminal');

  // The audit entry the transition wrote, seen by an actor who may read the log.
  await page.goto('/kyc');
  await page.getByRole('button', { name: 'Sign out' }).click();
  await signIn(page, 'admin@demo.co');
  await page.goto(`/admin/audit?entityType=kyc_case&entityId=${caseId}`);

  const rows = page.locator('tbody tr');
  await expect(rows.filter({ hasText: 'kyc.case.approved' })).toHaveCount(1);
  await expect(rows.filter({ hasText: 'kyc.case.in_review' })).toHaveCount(1);
  await rows.filter({ hasText: 'kyc.case.approved' }).getByRole('link').first().click();
  await expect(page.getByRole('dialog')).toContainText('documents_verified');
  await expect(page.getByRole('dialog')).toContainText('analyst@demo.co');
});

test('a refused action is disabled and explained before it is clicked', async ({ page }) => {
  await signIn(page, 'analyst@demo.co');
  await openFirstCase(page, 'escalated');

  // The analyst may not resolve escalations at all, so both panels explain themselves in prose.
  for (const target of ['approved', 'rejected']) {
    const panel = page.getByTestId(`kyc-action-${target}`);
    await expect(panel.getByRole('button')).toBeDisabled();
    await expect(panel.getByRole('alert')).toHaveText("Your role can't perform this action.");
  }
  await expect(page.getByRole('dialog')).not.toContainText('missing_permission');
});

test('a manager resolves a case the analyst escalated (four eyes)', async ({ page }) => {
  await signIn(page, 'kmanager@demo.co');
  await openFirstCase(page, 'escalated');

  const approve = page.getByTestId('kyc-action-approved');
  await approve.getByLabel('Reason code (approved)').selectOption('manual_review_passed');
  await approve.getByRole('button', { name: 'Approve' }).click();

  await expect(
    page.getByRole('dialog').getByText('approved', { exact: true }).first(),
  ).toBeVisible();
});

// Escalates a case last, so the earlier specs still find seeded escalations they may resolve.
test('the manager who escalated a case is shown the four-eyes rule under each blocked action', async ({
  page,
}) => {
  await signIn(page, 'kmanager@demo.co');
  const caseId = await openFirstCase(page, 'pending');

  await page.getByTestId('kyc-action-in_review').getByRole('button').click();
  await page
    .getByTestId('kyc-action-escalated')
    .getByLabel('Reason code (escalated)')
    .selectOption('needs_manager_review');
  await page.getByTestId('kyc-action-escalated').getByRole('button').click();

  await expect(page).toHaveURL(new RegExp(`case=${caseId}`));
  for (const target of ['approved', 'rejected']) {
    const panel = page.getByTestId(`kyc-action-${target}`);
    await expect(panel.getByRole('button')).toBeDisabled();
    // Once, under this action only, and never as a bare guard code.
    await expect(panel.getByRole('alert')).toHaveCount(1);
    await expect(panel.getByRole('alert')).toHaveText(FOUR_EYES_COPY);
  }
  await expect(page.getByRole('dialog')).not.toContainText('same_actor_as_escalator');
});

test('a viewer can read the queue but is offered no actions', async ({ page }) => {
  await signIn(page, 'viewer@demo.co');
  await openFirstCase(page, 'pending');

  const claim = page.getByTestId('kyc-action-in_review');
  await expect(claim.getByRole('button', { name: 'Claim case' })).toBeDisabled();
  await expect(claim.getByRole('alert')).toHaveText("Your role can't perform this action.");
});

test('the demo tool ingests a new applicant through the webhook path', async ({ page }) => {
  await signIn(page, 'admin@demo.co');
  await page.goto('/kyc?state=pending');
  await page.getByRole('button', { name: 'Simulate new applicant' }).click();

  const drawer = page.getByRole('dialog');
  await expect(drawer).toBeVisible();
  await expect(drawer.getByText('pending', { exact: true }).first()).toBeVisible();
  await expect(drawer).toContainText('kyc.case.created');
});

test('the public webhook demands its shared secret and says nothing about the payload', async ({
  request,
}) => {
  const anonymous = await request.post('/api/webhooks/kyc', { data: { nope: true } });
  expect(anonymous.status()).toBe(401);

  const wrongSecret = await request.post('/api/webhooks/kyc', {
    headers: { 'x-webhook-secret': 'not-the-secret' },
    data: { nope: true },
  });
  expect(wrongSecret.status()).toBe(401);

  const refused = await request.post('/api/webhooks/kyc', {
    headers: { 'x-webhook-secret': WEBHOOK_SECRET },
    data: { nope: true },
  });
  expect(refused.status()).toBe(400);
  expect(await refused.json()).toEqual({ error: 'invalid_payload' });

  const accepted = await request.post('/api/webhooks/kyc', {
    headers: { 'x-webhook-secret': WEBHOOK_SECRET },
    data: {
      payload: {
        resource_type: 'check',
        action: 'check.completed',
        object: {
          id: 'chk_e2e',
          status: 'complete',
          result: 'clear',
          risk_score: 12,
          watchlist_hits: [],
          applicant: {
            first_name: 'Webhook',
            last_name: 'Applicant',
            dob: '1990-01-01',
            country: 'GB',
            document_type: 'passport',
            document_image_urls: ['https://placeholder.invalid/doc/e2e-front.png'],
          },
        },
      },
    },
  });
  expect(accepted.status()).toBe(201);
});
