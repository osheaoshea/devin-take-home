/**
 * Mock IdP accounts. They carry fake Entra group claims so the real group -> role mapping
 * path runs in dev/demo. Enabled only when DEMO_AUTH_ENABLED is true.
 */
export interface DemoAccount {
  email: string;
  password: string;
  name: string;
  groups: string[];
}

export const DEMO_PASSWORD = 'demo';

export const DEMO_ACCOUNTS: DemoAccount[] = [
  {
    email: 'viewer@demo.co',
    password: DEMO_PASSWORD,
    name: 'Vera Viewer',
    groups: ['ENTRA-Internal-Tools-Viewers'],
  },
  {
    email: 'analyst@demo.co',
    password: DEMO_PASSWORD,
    name: 'Anna Analyst',
    groups: ['ENTRA-KYC-Analysts'],
  },
  {
    email: 'kmanager@demo.co',
    password: DEMO_PASSWORD,
    name: 'Kim Manager',
    groups: ['ENTRA-KYC-Managers'],
  },
  {
    email: 'agent@demo.co',
    password: DEMO_PASSWORD,
    name: 'Sam Agent',
    groups: ['ENTRA-Support-Agents'],
  },
  {
    email: 'fmanager@demo.co',
    password: DEMO_PASSWORD,
    name: 'Fay Finance',
    groups: ['ENTRA-Finance-Managers'],
  },
  {
    email: 'fmanager2@demo.co',
    password: DEMO_PASSWORD,
    name: 'Frank Finance',
    groups: ['ENTRA-Finance-Managers'],
  },
  {
    email: 'engineer@demo.co',
    password: DEMO_PASSWORD,
    name: 'Eve Engineer',
    groups: ['ENTRA-Engineering'],
  },
  {
    email: 'admin@demo.co',
    password: DEMO_PASSWORD,
    name: 'Ada Admin',
    groups: ['ENTRA-Platform-Admins'],
  },
];

const LOCAL_HOSTNAMES = new Set(['localhost', '127.0.0.1', '::1', '0.0.0.0']);

/**
 * The mock IdP hands out a fixed password for seeded accounts, admin included, so the flag alone
 * is not enough: an environment that inherits `DEMO_AUTH_ENABLED=true` must still refuse it. Demo
 * sign-in is therefore confined to a locally served app unless a second flag opts a throwaway
 * hosted demo back in.
 */
function servedLocally(): boolean {
  const url = process.env.AUTH_URL ?? process.env.NEXTAUTH_URL;
  if (url === undefined || url === '') return process.env.NODE_ENV !== 'production';
  try {
    return LOCAL_HOSTNAMES.has(new URL(url).hostname.replace(/^\[|\]$/g, ''));
  } catch {
    return false;
  }
}

export function demoAuthEnabled(): boolean {
  if (process.env.DEMO_AUTH_ENABLED !== 'true') return false;
  return servedLocally() || process.env.DEMO_AUTH_ALLOW_REMOTE_HOST === 'true';
}
