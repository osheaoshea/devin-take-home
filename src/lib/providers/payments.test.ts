import { describe, expect, it } from 'vitest';
import { MockStripeProvider } from './payments';

describe('MockStripeProvider idempotency', () => {
  it('returns the original refund for a repeated idempotency key', async () => {
    const provider = new MockStripeProvider();
    const input = {
      idempotencyKey: 'refund-1',
      paymentId: 'pi_mock_1000',
      amountPence: 4_500,
      currency: 'GBP',
    };

    const first = await provider.issueRefund(input);
    const retry = await provider.issueRefund(input);

    expect(retry.providerRefundId).toBe(first.providerRefundId);
    expect(provider.issuedRefunds()).toHaveLength(1);
  });

  it('issues distinct refunds for distinct keys', async () => {
    const provider = new MockStripeProvider();
    const first = await provider.issueRefund({
      idempotencyKey: 'refund-1',
      paymentId: 'pi_mock_1000',
      amountPence: 4_500,
      currency: 'GBP',
    });
    const second = await provider.issueRefund({
      idempotencyKey: 'refund-2',
      paymentId: 'pi_mock_1000',
      amountPence: 4_500,
      currency: 'GBP',
    });

    expect(second.providerRefundId).not.toBe(first.providerRefundId);
    expect(provider.issuedRefunds()).toHaveLength(2);
  });
});
