import { and, asc, count, desc, eq, gte, sql, sum, type SQL } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import { requirePermission, type Actor } from '@/lib/rbac';
import { getDb } from '../client';
import { refunds, users, type Refund } from '../schema';

export interface RefundFilter {
  state?: Refund['state'];
  /** Lower bound in minor units, so the big-ticket refunds can be worked first. */
  minAmountPence?: number;
  sort?: RefundSortKey;
  direction?: 'asc' | 'desc';
  limit?: number;
  offset?: number;
}

export type RefundSortKey = 'created' | 'amount' | 'state' | 'customer';

const SORT_COLUMNS = {
  created: refunds.createdAt,
  amount: refunds.amountPence,
  state: refunds.state,
  customer: refunds.customerEmail,
} as const;

/** A refund plus the people on it: who raised it and, once decided, who decided it. */
export interface RefundRow extends Refund {
  requestedByEmail: string;
  decidedByEmail: string | null;
}

/** The three numbers the dashboard leads with. */
export interface RefundTotals {
  openCount: number;
  /** Sum, in minor units, of everything not yet decided: the platform's outstanding exposure. */
  openExposurePence: number;
  approvedSinceCount: number;
}

const requester = alias(users, 'refund_requester');
const decider = alias(users, 'refund_decider');

export async function findRefundById(actor: Actor, refundId: string): Promise<Refund | undefined> {
  requirePermission(actor, 'refunds.read');
  const [row] = await getDb().select().from(refunds).where(eq(refunds.id, refundId)).limit(1);
  return row;
}

export async function findRefundRowById(
  actor: Actor,
  refundId: string,
): Promise<RefundRow | undefined> {
  const [row] = await selectRefundRows(actor, eq(refunds.id, refundId), undefined, 1, 0);
  return row;
}

export function selectRefunds(actor: Actor, filter: RefundFilter): Promise<RefundRow[]> {
  const column = SORT_COLUMNS[filter.sort ?? 'created'];
  return selectRefundRows(
    actor,
    refundWhere(filter),
    filter.direction === 'asc' ? asc(column) : desc(column),
    filter.limit ?? 25,
    filter.offset ?? 0,
  );
}

export async function countRefunds(actor: Actor, filter: RefundFilter): Promise<number> {
  requirePermission(actor, 'refunds.read');
  const [row] = await getDb().select({ total: count() }).from(refunds).where(refundWhere(filter));
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

/**
 * The dashboard tiles in one round trip. `approvedSince` is an instant the caller reads from
 * `now()`, so the "this week" window is the app's clock and not the database's.
 */
export async function refundTotals(actor: Actor, approvedSince: Date): Promise<RefundTotals> {
  requirePermission(actor, 'refunds.read');
  const [row] = await getDb()
    .select({
      openCount: count(sql`case when ${refunds.state} = 'requested' then 1 end`),
      openExposurePence: sum(
        sql`case when ${refunds.state} = 'requested' then ${refunds.amountPence} else 0 end`,
      ),
      approvedSinceCount: count(
        sql`case when ${refunds.state} = 'approved' and ${gte(refunds.decidedAt, approvedSince)} then 1 end`,
      ),
    })
    .from(refunds);

  return {
    openCount: row?.openCount ?? 0,
    openExposurePence: Number(row?.openExposurePence ?? 0),
    approvedSinceCount: row?.approvedSinceCount ?? 0,
  };
}

async function selectRefundRows(
  actor: Actor,
  where: SQL | undefined,
  orderBy: SQL | undefined,
  limit: number,
  offset: number,
): Promise<RefundRow[]> {
  requirePermission(actor, 'refunds.read');
  const query = getDb()
    .select({ refund: refunds, requestedByEmail: requester.email, decidedByEmail: decider.email })
    .from(refunds)
    .innerJoin(requester, eq(requester.id, refunds.requestedById))
    .leftJoin(decider, eq(decider.id, refunds.decidedById))
    .where(where)
    .limit(limit)
    .offset(offset);

  const rows = await (orderBy === undefined ? query : query.orderBy(orderBy));
  return rows.map(({ refund, requestedByEmail, decidedByEmail }) => ({
    ...refund,
    requestedByEmail,
    decidedByEmail,
  }));
}

function refundWhere(filter: RefundFilter): SQL | undefined {
  const conditions: SQL[] = [];
  if (filter.state !== undefined) conditions.push(eq(refunds.state, filter.state));
  if (filter.minAmountPence !== undefined)
    conditions.push(gte(refunds.amountPence, filter.minAmountPence));
  return conditions.length > 0 ? and(...conditions) : undefined;
}
