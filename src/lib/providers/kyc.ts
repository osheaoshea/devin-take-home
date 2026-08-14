import { z } from 'zod';

/**
 * Inbound provider payload (Onfido-shaped). The schema and the data are real; only the
 * sender is fake — production points the real provider at the same webhook route.
 */
export const onfidoCheckPayloadSchema = z.object({
  payload: z.object({
    resource_type: z.literal('check'),
    action: z.literal('check.completed'),
    object: z.object({
      id: z.string().min(1),
      status: z.enum(['complete', 'in_progress']),
      result: z.enum(['clear', 'consider']),
      risk_score: z.number().int().min(0).max(100),
      watchlist_hits: z.array(z.object({ list: z.string(), match: z.string() })),
      applicant: z.object({
        first_name: z.string().min(1),
        last_name: z.string().min(1),
        dob: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        country: z.string().length(2),
        document_type: z.enum(['passport', 'driving_licence', 'national_id']),
        document_image_urls: z.array(z.string().url()),
      }),
    }),
  }),
});

export type OnfidoCheckPayload = z.infer<typeof onfidoCheckPayloadSchema>;

export interface KycProvider {
  /** Production would fetch the document; the mock returns the placeholder URL it was given. */
  fetchDocument(url: string): Promise<{ url: string; contentType: string }>;
}

export class MockKycProvider implements KycProvider {
  async fetchDocument(url: string): Promise<{ url: string; contentType: string }> {
    return { url, contentType: 'image/png' };
  }
}
