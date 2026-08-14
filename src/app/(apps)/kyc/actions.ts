'use server';

import { revalidatePath } from 'next/cache';
import { notFound, redirect } from 'next/navigation';
import { z } from 'zod';
import { requireActor } from '@/lib/auth';
import { findKycCaseById } from '@/lib/db/queries';
import {
  ingestKycCheck,
  KYC_STATES,
  kycMachine,
  reasonCodesFor,
  simulatedCheckPayload,
} from '@/lib/kyc';
import { requirePermission } from '@/lib/rbac';
import { TransitionRefusedError } from '@/lib/workflow';

/** The action the button was rendered for, bound server-side rather than posted as hidden fields. */
const targetSchema = z.object({
  caseId: z.string().uuid(),
  to: z.enum(KYC_STATES),
  returnTo: z.string().optional(),
});

const formSchema = z.object({ reasonCode: z.string().min(1).optional() });

export type KycTransitionTarget = z.infer<typeof targetSchema>;

/**
 * Moves a case through the machine, which evaluates the guards and writes the audit entry.
 * A refusal is not a crash the reviewer should see: it comes back in the URL and renders
 * inline next to the action that was blocked.
 */
export async function transitionKycCaseAction(
  rawTarget: KycTransitionTarget,
  formData: FormData,
): Promise<void> {
  const actor = await requireActor();
  const target = targetSchema.parse(rawTarget);
  const { reasonCode } = formSchema.parse(Object.fromEntries(formData));
  const kycCase = await findKycCaseById(actor, target.caseId);
  if (kycCase === undefined) notFound();

  const expected = reasonCodesFor(target.to);
  if (expected.length > 0 && (reasonCode === undefined || !expected.includes(reasonCode))) {
    redirect(queueHref(target.returnTo, target.caseId, 'invalid_reason_code'));
  }

  let refusal: string | undefined;
  try {
    await kycMachine.transition({
      actor,
      entity: kycCase,
      to: target.to,
      context: { actorId: actor.id, reasonCode },
    });
  } catch (error) {
    if (!(error instanceof TransitionRefusedError)) throw error;
    refusal = error.reason;
  }

  revalidatePath('/kyc');
  redirect(queueHref(target.returnTo, target.caseId, refusal));
}

/** Demo-only: replays a provider callback, so the queue has a fresh case to work. */
export async function simulateApplicantAction(returnTo: string | undefined): Promise<void> {
  const actor = await requireActor();
  requirePermission(actor, 'demo.tools');
  const kycCase = await ingestKycCheck(simulatedCheckPayload());

  revalidatePath('/kyc');
  redirect(queueHref(returnTo, kycCase.id));
}

/** Rebuilds the queue URL the reviewer came from, keeping their filters and page. */
function queueHref(returnTo: string | undefined, caseId?: string, error?: string): string {
  const safe = returnTo !== undefined && returnTo.startsWith('/kyc') ? returnTo : '/kyc';
  const [path = '/kyc', search = ''] = safe.split('?');
  const params = new URLSearchParams(search);
  params.delete('error');
  if (caseId !== undefined) params.set('case', caseId);
  if (error !== undefined) params.set('error', error);
  const query = params.toString();
  return query === '' ? path : `${path}?${query}`;
}
