export interface IssuedRefund {
  providerRefundId: string;
  paymentId: string;
  amountPence: number;
  currency: string;
}

/** The interface is the production artifact; only the implementation is mocked. */
export interface PaymentsProvider {
  issueRefund(input: {
    paymentId: string;
    amountPence: number;
    currency: string;
  }): Promise<IssuedRefund>;
}

export class MockStripeProvider implements PaymentsProvider {
  private readonly issued: IssuedRefund[] = [];

  async issueRefund(input: {
    paymentId: string;
    amountPence: number;
    currency: string;
  }): Promise<IssuedRefund> {
    const refund: IssuedRefund = {
      providerRefundId: `re_mock_${this.issued.length + 1}_${input.paymentId}`,
      ...input,
    };
    this.issued.push(refund);
    return refund;
  }

  /** Demo affordance: what the mock would have sent to Stripe. */
  issuedRefunds(): readonly IssuedRefund[] {
    return this.issued;
  }
}
