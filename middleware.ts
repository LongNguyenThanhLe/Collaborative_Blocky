import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

// This function can be marked `async` if using `await` inside
export function middleware(request: NextRequest) {
  // For Firebase authentication, we'll use client-side auth checks
  // We can't check Firebase auth in middleware directly since it runs on the edge
  // Instead, we'll handle auth redirects via the useAuth hook in protected pages
  
  // Return early for public routes or static assets
  const publicPaths = ['/', '/login', '/signup'];
  const path = request.nextUrl.pathname;
  
  if (publicPaths.includes(path) || 
      path.startsWith('/_next') || 
      path.startsWith('/api') ||
      path.match(/\.(html?|css|js|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)$/)) {
    return NextResponse.next();
  }

  // For protected routes, we'll just continue and let client-side auth handle redirects if needed
  return NextResponse.next();
}

export const config = {
  matcher: [
    // Skip Next.js internals and all static files, unless found in search params
    '/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)',
    // Always run for API routes
    '/(api|trpc)(.*)',
  ],
};
