'use server';

import { revalidatePath } from 'next/cache';
import { notFound, redirect } from 'next/navigation';
import { z } from 'zod';
import {
  environmentSchema,
  FlagChangeRefusedError,
  flagStateMachine,
  killFlag,
  setRolloutPercentage,
} from '@/lib/apps/flags';
import { requireActor, stepUp } from '@/lib/auth';
import { findFlagStateById } from '@/lib/db/queries';
import { AuthorizationError, type Permission } from '@/lib/rbac';
import { TransitionRefusedError } from '@/lib/workflow';
import { flagsHref } from './flags-params';

/** The control the button was rendered for, bound server-side rather than posted as hidden fields. */
const environmentTargetSchema = z.object({
  flagId: z.string().uuid(),
  stateId: z.string().uuid(),
  environment: environmentSchema,
});

const killTargetSchema = z.object({ flagId: z.string().uuid() });

const toggleSchema = z.object({ to: z.enum(['on', 'off']) });
const rolloutSchema = z.object({ percentage: z.coerce.number().int().min(0).max(100) });

export type FlagEnvironmentTarget = z.infer<typeof environmentTargetSchema>;
export type FlagKillTarget = z.infer<typeof killTargetSchema>;

/**
 * Flips one environment through the machine, which evaluates the guards, compare-and-swaps on
 * `enabled` and writes the audit entry. A refusal comes back in the URL as
 * `toggle-<environment>:<reason>`, so it renders under that one control.
 */
export async function toggleFlagEnvironmentAction(
  rawTarget: FlagEnvironmentTarget,
  formData: FormData,
): Promise<void> {
  const actor = await requireActor();
  const target = environmentTargetSchema.parse(rawTarget);
  const { to } = toggleSchema.parse(Object.fromEntries(formData));
  const state = await findFlagStateById(actor, target.stateId);
  if (state === undefined) notFound();

  let refusal: string | undefined;
  try {
    await flagStateMachine.transition({ actor, entity: state, to });
  } catch (error) {
    if (!(error instanceof TransitionRefusedError)) throw error;
    refusal = error.reason;
  }

  finish(target.flagId, `toggle-${target.environment}`, refusal);
}

export async function setFlagRolloutAction(
  rawTarget: FlagEnvironmentTarget,
  formData: FormData,
): Promise<void> {
  const actor = await requireActor();
  const target = environmentTargetSchema.parse(rawTarget);
  const state = await findFlagStateById(actor, target.stateId);
  if (state === undefined) notFound();

  const control = `rollout-${target.environment}`;
  const parsed = rolloutSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) finish(target.flagId, control, 'invalid_percentage');

  finish(
    target.flagId,
    control,
    await refusalOf('flags.write', () =>
      setRolloutPercentage(actor, state, parsed.data.percentage),
    ),
  );
}

/** Every environment off in one audited mutation, gated on `flags.kill_switch` in the accessor. */
export async function killFlagAction(rawTarget: FlagKillTarget): Promise<void> {
  const actor = await requireActor();
  const target = killTargetSchema.parse(rawTarget);
  await stepUp.requireStepUp(actor, 'flags.kill_switch');

  finish(
    target.flagId,
    'kill',
    await refusalOf('flags.kill_switch', () => killFlag(actor, target.flagId)),
  );
}

/**
 * A direct audited change refuses by throwing, and the accessor — not the button — is the gate,
 * so a forged post is a refusal to explain rather than a crash.
 */
async function refusalOf(
  permission: Permission,
  change: () => Promise<unknown>,
): Promise<string | undefined> {
  try {
    await change();
    return undefined;
  } catch (error) {
    if (error instanceof FlagChangeRefusedError) return error.reason;
    if (error instanceof AuthorizationError) return `missing_permission:${permission}`;
    throw error;
  }
}

/** Revalidates the page and reopens the flag, carrying any refusal under its own control. */
function finish(flagId: string, control: string, refusal?: string): never {
  revalidatePath('/flags');
  redirect(flagsHref(flagId, refusal === undefined ? undefined : `${control}:${refusal}`));
}
