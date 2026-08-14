/**
 * Cookie naming rules, kept free of database and Auth.js imports so the edge middleware can
 * share them with the Node-runtime session code.
 *
 * Auth.js keys its cookie on the deployment URL scheme, not NODE_ENV — a production build served
 * over http (local demo) must not use the `__Secure-` prefix or the browser drops the cookie.
 */
export function secureCookies(): boolean {
  const url = process.env.AUTH_URL ?? process.env.NEXTAUTH_URL ?? '';
  return url.startsWith('https://') || process.env.VERCEL === '1';
}

export function sessionCookieName(): string {
  return secureCookies() ? '__Secure-authjs.session-token' : 'authjs.session-token';
}
