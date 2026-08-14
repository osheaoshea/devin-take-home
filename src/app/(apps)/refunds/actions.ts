'use server';

import { revalidatePath } from 'next/cache';
import { notFound, redirect } from 'next/navigation';
import { z } from 'zod';
import { refundMachine, REFUND_STATES } from '@/lib/apps/refunds';
import { requireActor } from '@/lib/auth';
import { findRefundRowById } from '@/lib/db/queries';
import { TransitionRefusedError } from '@/lib/workflow';

/** The action the button was rendered for, bound server-side rather than posted as hidden fields. */
const targetSchema = z.object({
  refundId: z.string().uuid(),
  to: z.enum(REFUND_STATES),
  returnTo: z.string().optional(),
});

export type RefundTransitionTarget = z.infer<typeof targetSchema>;

/**
 * Moves a refund through the machine, which evaluates the guards, calls the payments provider on
 * the way into `approved` and writes the audit entry. A refusal is not a crash the approver should
 * see: it comes back in the URL as `<to>:<reason>` and renders as a sentence under the one action
 * that was blocked.
 */
export async function transitionRefundAction(rawTarget: RefundTransitionTarget): Promise<void> {
  const actor = await requireActor();
  const target = targetSchema.parse(rawTarget);
  const refund = await findRefundRowById(actor, target.refundId);
  if (refund === undefined) notFound();

  let refusal: string | undefined;
  try {
    await refundMachine.transition({
      actor,
      entity: refund,
      to: target.to,
      context: { actorId: actor.id },
    });
  } catch (error) {
    if (!(error instanceof TransitionRefusedError)) throw error;
    refusal = error.reason;
  }

  revalidatePath('/refunds');
  redirect(
    dashboardHref(target.returnTo, {
      refund: target.refundId,
      error: refusal === undefined ? undefined : `${target.to}:${refusal}`,
    }),
  );
}

/** Rebuilds the dashboard URL the actor came from, keeping their filters and page. */
function dashboardHref(
  returnTo: string | undefined,
  overrides: Record<string, string | undefined>,
): string {
  const safe = returnTo !== undefined && returnTo.startsWith('/refunds') ? returnTo : '/refunds';
  const [path = '/refunds', search = ''] = safe.split('?');
  const params = new URLSearchParams(search);
  params.delete('error');
  for (const [key, value] of Object.entries(overrides)) {
    if (value !== undefined) params.set(key, value);
  }
  const query = params.toString();
  return query === '' ? path : `${path}?${query}`;
}
