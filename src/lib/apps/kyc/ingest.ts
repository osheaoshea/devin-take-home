import { randomUUID } from 'node:crypto';
import { audited } from '@/lib/audit';
import type { KycCase } from '@/lib/db/schema';
import { type OnfidoCheckPayload } from '@/lib/providers';
import type { Actor } from '@/lib/rbac';
import { slaDueAtFor } from './sla';

/**
 * The webhook is public, so a case opened by the provider is attributed to a service identity
 * rather than to a person. It holds no roles, and that is what its audit entries record.
 */
export const KYC_WEBHOOK_ACTOR: Actor = {
  id: '00000000-0000-4000-8000-00000000c0de',
  email: 'kyc-webhook@service.invalid',
  name: 'KYC provider webhook',
  roles: [],
};

/**
 * Archives the provider's payload and opens the case it describes, in one audited transaction:
 * a case can never exist without the check that created it, or without its audit entry.
 */
export function ingestKycCheck(payload: OnfidoCheckPayload): Promise<KycCase> {
  const check = payload.payload.object;
  const applicant = check.applicant;
  const caseId = randomUUID();

  return audited(
    {
      actor: KYC_WEBHOOK_ACTOR,
      action: 'kyc.case.created',
      entityType: 'kyc_case',
      entityId: caseId,
    },
    async (tx) => {
      await tx.ensureServiceActor({
        id: KYC_WEBHOOK_ACTOR.id,
        email: KYC_WEBHOOK_ACTOR.email,
        name: KYC_WEBHOOK_ACTOR.name ?? 'service',
      });
      return tx.recordKycCheck({
        provider: 'onfido',
        payload,
        kycCase: {
          id: caseId,
          applicantName: `${applicant.first_name} ${applicant.last_name}`,
          applicantDob: applicant.dob,
          country: applicant.country,
          documentType: applicant.document_type,
          documentImageUrls: [...applicant.document_image_urls],
          watchlistHits: [...check.watchlist_hits],
          providerRiskScore: check.risk_score,
          slaDueAt: slaDueAtFor(),
        },
      });
    },
  );
}
