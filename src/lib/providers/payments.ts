export interface IssuedRefund {
  providerRefundId: string;
  paymentId: string;
  amountPence: number;
  currency: string;
}

/** The interface is the production artifact; only the implementation is mocked. */
export interface PaymentsProvider {
  issueRefund(input: {
    /** Caller-supplied key; a repeated key returns the original refund rather than issuing twice. */
    idempotencyKey: string;
    paymentId: string;
    amountPence: number;
    currency: string;
  }): Promise<IssuedRefund>;
}

export class MockStripeProvider implements PaymentsProvider {
  private readonly issued: IssuedRefund[] = [];
  private readonly byIdempotencyKey = new Map<string, IssuedRefund>();

  async issueRefund({
    idempotencyKey,
    ...input
  }: {
    idempotencyKey: string;
    paymentId: string;
    amountPence: number;
    currency: string;
  }): Promise<IssuedRefund> {
    const existing = this.byIdempotencyKey.get(idempotencyKey);
    if (existing !== undefined) return existing;
    const refund: IssuedRefund = {
      providerRefundId: `re_mock_${this.issued.length + 1}_${input.paymentId}`,
      ...input,
    };
    this.issued.push(refund);
    this.byIdempotencyKey.set(idempotencyKey, refund);
    return refund;
  }

  /** Demo affordance: what the mock would have sent to Stripe. */
  issuedRefunds(): readonly IssuedRefund[] {
    return this.issued;
  }
}
