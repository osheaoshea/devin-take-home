import { and, count, desc, eq, gte, lte, type SQL } from 'drizzle-orm';
import { requirePermission, type Actor } from '@/lib/rbac';
import { getDb } from './client';
import {
  auditLog,
  flags,
  kycCases,
  refunds,
  users,
  type AuditLogRow,
  type KycCase,
  type Refund,
} from './schema';

export interface AuditLogFilter {
  actorId?: string;
  entityType?: string;
  entityId?: string;
  action?: string;
  from?: Date;
  to?: Date;
  limit?: number;
  offset?: number;
}

export interface AuditLogPage {
  entries: AuditEntry[];
  /** Total matching the filter, ignoring limit/offset, so the pager can size itself. */
  total: number;
}

export interface AuditEntry extends AuditLogRow {
  actorEmail: string;
}

/**
 * Query-layer enforcement: accessors take the actor and refuse (or scope) the read, so a
 * hidden button is never the access control.
 */
export async function selectAuditLog(actor: Actor, filter: AuditLogFilter): Promise<AuditEntry[]> {
  requirePermission(actor, 'audit.read');
  const rows = await getDb()
    .select({ entry: auditLog, actorEmail: users.email })
    .from(auditLog)
    .innerJoin(users, eq(users.id, auditLog.actorId))
    .where(auditLogWhere(filter))
    .orderBy(desc(auditLog.createdAt))
    .limit(filter.limit ?? 200)
    .offset(filter.offset ?? 0);

  return rows.map(({ entry, actorEmail }) => ({ ...entry, actorEmail }));
}

export async function countAuditLog(actor: Actor, filter: AuditLogFilter): Promise<number> {
  requirePermission(actor, 'audit.read');
  const [row] = await getDb()
    .select({ total: count() })
    .from(auditLog)
    .innerJoin(users, eq(users.id, auditLog.actorId))
    .where(auditLogWhere(filter));
  return row?.total ?? 0;
}

function auditLogWhere(filter: AuditLogFilter): SQL | undefined {
  const conditions: SQL[] = [];
  if (filter.actorId !== undefined) conditions.push(eq(auditLog.actorId, filter.actorId));
  if (filter.entityType !== undefined) conditions.push(eq(auditLog.entityType, filter.entityType));
  if (filter.entityId !== undefined) conditions.push(eq(auditLog.entityId, filter.entityId));
  if (filter.action !== undefined) conditions.push(eq(auditLog.action, filter.action));
  if (filter.from !== undefined) conditions.push(gte(auditLog.createdAt, filter.from));
  if (filter.to !== undefined) conditions.push(lte(auditLog.createdAt, filter.to));
  return conditions.length > 0 ? and(...conditions) : undefined;
}

export async function findKycCaseById(actor: Actor, caseId: string): Promise<KycCase | undefined> {
  requirePermission(actor, 'kyc.read');
  const [row] = await getDb().select().from(kycCases).where(eq(kycCases.id, caseId)).limit(1);
  return row;
}

export async function countKycCasesByState(actor: Actor, state: KycCase['state']): Promise<number> {
  requirePermission(actor, 'kyc.read');
  const [row] = await getDb()
    .select({ total: count() })
    .from(kycCases)
    .where(eq(kycCases.state, state));
  return row?.total ?? 0;
}

export async function countRefundsByState(actor: Actor, state: Refund['state']): Promise<number> {
  requirePermission(actor, 'refunds.read');
  const [row] = await getDb()
    .select({ total: count() })
    .from(refunds)
    .where(eq(refunds.state, state));
  return row?.total ?? 0;
}

export async function countFlags(actor: Actor): Promise<number> {
  requirePermission(actor, 'flags.read');
  const [row] = await getDb().select({ total: count() }).from(flags);
  return row?.total ?? 0;
}
