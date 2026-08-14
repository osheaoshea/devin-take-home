import { z } from 'zod';
import { REFUND_REASON_CODES } from './reason-codes';

/**
 * The raise-a-refund form, as both the client `Form` and the server action see it. Agents think
 * in pounds; storage is minor units, so the conversion happens once, here.
 */
export const raiseRefundFormSchema = z.object({
  customerEmail: z.string().email('Enter the customer’s email address.'),
  paymentId: z.string().min(1, 'Enter the original payment id.'),
  amountPounds: z.coerce
    .number({ invalid_type_error: 'Enter an amount in pounds.' })
    .positive('Enter an amount above zero.')
    .max(1_000_000, 'That is larger than any refund this tool handles.'),
  reasonCode: z.enum(REFUND_REASON_CODES),
});

export type RaiseRefundForm = z.infer<typeof raiseRefundFormSchema>;

export function penceFromPounds(pounds: number): number {
  return Math.round(pounds * 100);
}
