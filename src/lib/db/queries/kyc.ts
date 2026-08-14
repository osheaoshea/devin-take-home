import { and, asc, count, desc, eq, gte, lte, type SQL } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import { requirePermission, type Actor } from '@/lib/rbac';
import { getDb } from '../client';
import { kycCases, users, type KycCase } from '../schema';

export interface KycQueueFilter {
  state?: KycCase['state'];
  /** Lower bound on the provider's risk score, so reviewers can work the risky cases first. */
  minRisk?: number;
  /** Cases whose SLA is due before this instant; the caller reads the clock through `now()`. */
  dueBefore?: Date;
  assignedToId?: string;
  sort?: KycSortKey;
  direction?: 'asc' | 'desc';
  limit?: number;
  offset?: number;
}

export type KycSortKey = 'sla' | 'risk' | 'applicant' | 'state' | 'created';

const SORT_COLUMNS = {
  sla: kycCases.slaDueAt,
  risk: kycCases.providerRiskScore,
  applicant: kycCases.applicantName,
  state: kycCases.state,
  created: kycCases.createdAt,
} as const;

/** A queue row: the case plus the people on it, which is what the table and drawer show. */
export interface KycCaseRow extends KycCase {
  assignedToEmail: string | null;
  escalatedByEmail: string | null;
}

const assignee = alias(users, 'kyc_assignee');
const escalator = alias(users, 'kyc_escalator');

export async function findKycCaseById(actor: Actor, caseId: string): Promise<KycCase | undefined> {
  requirePermission(actor, 'kyc.read');
  const [row] = await getDb().select().from(kycCases).where(eq(kycCases.id, caseId)).limit(1);
  return row;
}

export async function findKycCaseRowById(
  actor: Actor,
  caseId: string,
): Promise<KycCaseRow | undefined> {
  const [row] = await selectKycCaseRows(actor, eq(kycCases.id, caseId), undefined, 1, 0);
  return row;
}

export async function selectKycCases(actor: Actor, filter: KycQueueFilter): Promise<KycCaseRow[]> {
  const column = SORT_COLUMNS[filter.sort ?? 'sla'];
  return selectKycCaseRows(
    actor,
    kycQueueWhere(filter),
    filter.direction === 'desc' ? desc(column) : asc(column),
    filter.limit ?? 25,
    filter.offset ?? 0,
  );
}

export async function countKycCases(actor: Actor, filter: KycQueueFilter): Promise<number> {
  requirePermission(actor, 'kyc.read');
  const [row] = await getDb()
    .select({ total: count() })
    .from(kycCases)
    .where(kycQueueWhere(filter));
  return row?.total ?? 0;
}

export async function countKycCasesByState(actor: Actor, state: KycCase['state']): Promise<number> {
  requirePermission(actor, 'kyc.read');
  const [row] = await getDb()
    .select({ total: count() })
    .from(kycCases)
    .where(eq(kycCases.state, state));
  return row?.total ?? 0;
}

async function selectKycCaseRows(
  actor: Actor,
  where: SQL | undefined,
  orderBy: SQL | undefined,
  limit: number,
  offset: number,
): Promise<KycCaseRow[]> {
  requirePermission(actor, 'kyc.read');
  const query = getDb()
    .select({
      kycCase: kycCases,
      assignedToEmail: assignee.email,
      escalatedByEmail: escalator.email,
    })
    .from(kycCases)
    .leftJoin(assignee, eq(assignee.id, kycCases.assignedToId))
    .leftJoin(escalator, eq(escalator.id, kycCases.escalatedById))
    .where(where)
    .limit(limit)
    .offset(offset);

  const rows = await (orderBy === undefined ? query : query.orderBy(orderBy));
  return rows.map(({ kycCase, assignedToEmail, escalatedByEmail }) => ({
    ...kycCase,
    assignedToEmail,
    escalatedByEmail,
  }));
}

function kycQueueWhere(filter: KycQueueFilter): SQL | undefined {
  const conditions: SQL[] = [];
  if (filter.state !== undefined) conditions.push(eq(kycCases.state, filter.state));
  if (filter.minRisk !== undefined)
    conditions.push(gte(kycCases.providerRiskScore, filter.minRisk));
  if (filter.dueBefore !== undefined) conditions.push(lte(kycCases.slaDueAt, filter.dueBefore));
  if (filter.assignedToId !== undefined)
    conditions.push(eq(kycCases.assignedToId, filter.assignedToId));
  return conditions.length > 0 ? and(...conditions) : undefined;
}
