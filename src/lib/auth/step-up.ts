import type { Actor } from '@/lib/rbac';

/**
 * MFA step-up hook point. Sensitive actions (large refunds, prod flag flips) would call
 * `requireStepUp()` before proceeding. Documented and stubbed on purpose — a real Entra
 * step-up needs a real tenant, which is out of scope.
 */
export interface StepUpProvider {
  requireStepUp(actor: Actor, action: string): Promise<void>;
}

export class NoopStepUpProvider implements StepUpProvider {
  async requireStepUp(): Promise<void> {
    // No-op: the prototype records the hook point, it does not implement MFA.
  }
}

export const stepUp: StepUpProvider = new NoopStepUpProvider();
