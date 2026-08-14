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

export function demoAuthEnabled(): boolean {
  return process.env.DEMO_AUTH_ENABLED === 'true';
}
