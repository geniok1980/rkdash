import { auth } from '@/lib/auth';
import { NextResponse } from 'next/server';

export default auth((req) => {
  const { nextUrl } = req;
  const isLoggedIn = !!req.auth;
  const isAuthPage = nextUrl.pathname.startsWith('/auth');
  const isPublicPage =
    nextUrl.pathname === '/' ||
    nextUrl.pathname === '/about' ||
    nextUrl.pathname === '/privacy-policy' ||
    nextUrl.pathname === '/terms-of-service' ||
    nextUrl.pathname.startsWith('/api/auth');

  // Allow public pages
  if (isPublicPage) {
    return NextResponse.next();
  }

  // Redirect logged-in users away from auth pages
  if (isAuthPage && isLoggedIn) {
    return NextResponse.redirect(new URL('/dashboard/overview', nextUrl));
  }

  // Redirect unauthenticated users to sign-in
  if (!isLoggedIn && !isAuthPage) {
    return NextResponse.redirect(new URL('/auth/sign-in', nextUrl));
  }

  return NextResponse.next();
});

export const config = {
  matcher: [
    // Match all routes except static files, _next, and API auth routes
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)'
  ]
};
