import type { DrizzleTx } from './core';
import { kycMutations, type KycMutations } from './kyc';

export { StaleStateError, compareAndSwapUpdate, type DrizzleTx } from './core';
export type { KycMutations } from './kyc';

/**
 * The mutation surface handed to `audited()`. Every write lives here, so no caller can
 * change a row outside the audit wrapper (convention 1). Each app contributes its own
 * mutation interface: add `mutations/<app>.ts` and one extends-clause line here.
 */
export interface Tx extends KycMutations {}

export function mutations(tx: DrizzleTx): Tx {
  return { ...kycMutations(tx) };
}
