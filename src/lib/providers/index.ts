import { MockKycProvider, type KycProvider } from './kyc';
import { MockStripeProvider, type PaymentsProvider } from './payments';

export type { KycProvider } from './kyc';
export { MockKycProvider, onfidoCheckPayloadSchema } from './kyc';
export type { OnfidoCheckPayload } from './kyc';
export type { PaymentsProvider, IssuedRefund } from './payments';
export { MockStripeProvider } from './payments';

const mockKyc = new MockKycProvider();
const mockPayments = new MockStripeProvider();

/** Only the mock implementations are built (see out of scope); a real one would swap in here. */
export function kycProvider(): KycProvider {
  return mockKyc;
}

export function paymentsProvider(): PaymentsProvider {
  return mockPayments;
}
