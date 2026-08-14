import { NextResponse } from 'next/server';
import { ingestKycCheck, WEBHOOK_SECRET_HEADER, webhookSecretAccepted } from '@/lib/apps/kyc';
import { onfidoCheckPayloadSchema } from '@/lib/providers';

// Drizzle over TCP needs the Node runtime.
export const runtime = 'nodejs';

/**
 * Unauthenticated by design — the provider cannot hold a session — so a shared secret plus the
 * payload schema are the gate. Failures say only that they failed: an anonymous caller learns
 * nothing about the shape the schema wants.
 */
export async function POST(request: Request): Promise<NextResponse> {
  if (!webhookSecretAccepted(request.headers.get(WEBHOOK_SECRET_HEADER))) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const body: unknown = await request.json().catch(() => undefined);
  const parsed = onfidoCheckPayloadSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'invalid_payload' }, { status: 400 });
  }

  const kycCase = await ingestKycCheck(parsed.data);
  return NextResponse.json({ id: kycCase.id, state: kycCase.state }, { status: 201 });
}
