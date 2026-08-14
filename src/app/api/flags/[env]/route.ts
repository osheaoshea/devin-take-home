import { NextResponse } from 'next/server';
import { environmentSchema, evaluateFlags } from '@/lib/apps/flags';

// Drizzle over TCP needs the Node runtime.
export const runtime = 'nodejs';

/**
 * The public read side (spec 03): unauthenticated by design, since the clients evaluating flags
 * hold no session, and read-only by construction — there is no other method on this route.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ env: string }> },
): Promise<NextResponse> {
  const parsed = environmentSchema.safeParse((await params).env);
  if (!parsed.success) {
    return NextResponse.json({ error: 'unknown_environment' }, { status: 404 });
  }

  return NextResponse.json(await evaluateFlags(parsed.data));
}
