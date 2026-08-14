import { selectFlagEvaluations, type FlagEvaluation } from '@/lib/db/queries';
import { now } from '@/lib/time';
import type { Environment } from './environments';

/** What the public endpoint serves: one environment's flags as a client would evaluate them. */
export interface FlagEvaluationPayload {
  environment: Environment;
  evaluatedAt: string;
  flags: FlagEvaluation[];
}

/** Read-only by construction: the public read side takes no actor and calls no mutation. */
export async function evaluateFlags(environment: Environment): Promise<FlagEvaluationPayload> {
  return {
    environment,
    evaluatedAt: now().toISOString(),
    flags: await selectFlagEvaluations(environment),
  };
}
