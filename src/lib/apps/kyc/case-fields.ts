import { z } from 'zod';
import type { KycCase } from '@/lib/db/schema';

/**
 * The provider-supplied columns are `jsonb`, so they arrive as `unknown`. These schemas are
 * the boundary between the database's shape and the UI's: unreadable data renders as empty
 * rather than crashing the queue.
 */
const documentUrlsSchema = z.array(z.string()).catch([]);
const watchlistHitsSchema = z.array(z.object({ list: z.string(), match: z.string() })).catch([]);

export type WatchlistHit = z.infer<typeof watchlistHitsSchema>[number];

export function documentUrlsOf(kycCase: KycCase): string[] {
  return documentUrlsSchema.parse(kycCase.documentImageUrls);
}

export function watchlistHitsOf(kycCase: KycCase): WatchlistHit[] {
  return watchlistHitsSchema.parse(kycCase.watchlistHits);
}
