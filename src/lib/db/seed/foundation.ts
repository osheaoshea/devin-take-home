import { DEMO_ACCOUNTS } from '@/lib/auth/demo-accounts';
import { hashPassword } from '@/lib/auth/password';
import { parseGroupRoleMap, resolveRoles } from '@/lib/rbac';
import { type Database } from '../client';
import { users } from '../schema';

/** Deterministic pseudo-randomness keeps re-seeded demos identical. */
export function makeRandom(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state * 1_103_515_245 + 12_345) % 2_147_483_648;
    return state / 2_147_483_648;
  };
}

export function pick<T>(random: () => number, items: readonly T[]): T {
  const item = items[Math.floor(random() * items.length)];
  if (item === undefined) throw new Error('empty list');
  return item;
}

export async function seedDemoUsers(db: Database): Promise<Record<string, string>> {
  const groupMap = parseGroupRoleMap(process.env.ENTRA_GROUP_MAP);
  const ids: Record<string, string> = {};
  for (const account of DEMO_ACCOUNTS) {
    const [row] = await db
      .insert(users)
      .values({
        email: account.email,
        name: account.name,
        groups: account.groups,
        roles: resolveRoles(account.groups, groupMap),
        passwordHash: hashPassword(account.password),
      })
      .onConflictDoUpdate({
        target: users.email,
        set: {
          name: account.name,
          groups: account.groups,
          roles: resolveRoles(account.groups, groupMap),
          passwordHash: hashPassword(account.password),
        },
      })
      .returning();
    if (row === undefined) throw new Error(`failed to seed ${account.email}`);
    ids[account.email] = row.id;
  }
  return ids;
}
