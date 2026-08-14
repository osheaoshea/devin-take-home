import { NextResponse, type NextRequest } from 'next/server';
import { sessionCookieName } from '@/lib/auth/cookies';

/**
 * A coarse outer gate: anonymous requests never reach a page. It only looks for the session
 * cookie — the edge runtime has no database, so it cannot validate the session or the actor's
 * roles. Pages remain the authoritative layer (`requireActor()` + `enforcePermission()`); this
 * is defense in depth against a route that forgets to call them.
 */
export function middleware(request: NextRequest): NextResponse {
  if (request.cookies.has(sessionCookieName())) return NextResponse.next();

  const signIn = new URL('/signin', request.url);
  return NextResponse.redirect(signIn);
}

export const config = {
  matcher: ['/((?!signin|api/auth|api/webhooks|api/flags|_next/static|_next/image|favicon.ico).*)'],
};
