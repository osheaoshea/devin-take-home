import { NextResponse } from 'next/server';
import { ingestKycCheck } from '@/lib/kyc';
import { onfidoCheckPayloadSchema } from '@/lib/providers';

// Drizzle over TCP needs the Node runtime.
export const runtime = 'nodejs';

/**
 * Public by design: the provider cannot hold a session, so the payload schema — not a
 * permission — is the gate. Production points the real provider at this same route.
 */
export async function POST(request: Request): Promise<NextResponse> {
  const body: unknown = await request.json().catch(() => undefined);
  const parsed = onfidoCheckPayloadSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'invalid_payload', issues: parsed.error.issues },
      { status: 400 },
    );
  }

  const kycCase = await ingestKycCheck(parsed.data);
  return NextResponse.json({ id: kycCase.id, state: kycCase.state }, { status: 201 });
}
