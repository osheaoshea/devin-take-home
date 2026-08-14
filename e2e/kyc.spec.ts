import { expect, test, type Page } from '@playwright/test';

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

  await drawer.getByRole('button', { name: 'Claim case' }).click();
  await expect(
    page.getByRole('dialog').getByText('in_review', { exact: true }).first(),
  ).toBeVisible();
  await expect(page.getByRole('dialog')).toContainText('analyst@demo.co');

  await page
    .getByRole('dialog')
    .getByLabel('Reason code (approved)')
    .selectOption('documents_verified');
  await page.getByRole('dialog').getByRole('button', { name: 'Approve' }).click();

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

test('a guard refusal renders inline instead of offering the action', async ({ page }) => {
  await signIn(page, 'analyst@demo.co');
  await openFirstCase(page, 'escalated');

  // The analyst escalated these cases and cannot resolve them: both guards refuse, untranslated.
  await expect(page.getByRole('dialog')).toContainText('missing_permission:kyc.resolve_escalated');
  await expect(page.getByRole('dialog').getByRole('button', { name: 'Approve' })).toHaveCount(0);
});

test('a manager resolves a case the analyst escalated (four eyes)', async ({ page }) => {
  await signIn(page, 'kmanager@demo.co');
  await openFirstCase(page, 'escalated');

  await page
    .getByRole('dialog')
    .getByLabel('Reason code (approved)')
    .selectOption('manual_review_passed');
  await page.getByRole('dialog').getByRole('button', { name: 'Approve' }).click();

  await expect(
    page.getByRole('dialog').getByText('approved', { exact: true }).first(),
  ).toBeVisible();
});

test('a viewer can read the queue but is offered no actions', async ({ page }) => {
  await signIn(page, 'viewer@demo.co');
  await openFirstCase(page, 'pending');

  await expect(page.getByRole('dialog')).toContainText('missing_permission:kyc.claim');
  await expect(page.getByRole('dialog').getByRole('button', { name: 'Claim case' })).toHaveCount(0);
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

test('the public webhook validates its payload', async ({ request }) => {
  const refused = await request.post('/api/webhooks/kyc', { data: { nope: true } });
  expect(refused.status()).toBe(400);

  const accepted = await request.post('/api/webhooks/kyc', {
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
