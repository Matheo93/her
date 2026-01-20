import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

/**
 * HER Middleware - Production Experience Protection
 *
 * Philosophy: HER = ONE page. Just EVA and YOU.
 *
 * In production, only the core experience is accessible:
 * - / (redirects to /voice)
 * - /voice (the ONE experience)
 *
 * All demo/test pages redirect to /voice in production.
 */

const DEMO_ROUTES = [
  "/voice-test",
  "/avatar-gpu",
  "/avatar-demo",
  "/avatar-live",
  "/avatar-transparent",
  "/eva-ditto",
  "/eva-faster",
  "/eva-audio2face",
  "/eva-chat",
  "/eva-realtime",
  "/eva-stream",
  "/eva-viseme",
  "/eva-live",
  "/facetime",
  "/voicemotion",
  "/interruptible",
  "/lipsync",
];

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // In production: HER = ONE page. Just EVA and YOU.
  if (process.env.NODE_ENV === "production") {
    // Landing page redirects directly to the experience
    if (pathname === "/") {
      return NextResponse.redirect(new URL("/voice", request.url));
    }

    // Demo routes redirect to the main experience
    if (DEMO_ROUTES.some((route) => pathname.startsWith(route))) {
      return NextResponse.redirect(new URL("/voice", request.url));
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    // Match all routes except static files and API routes
    "/((?!api|_next/static|_next/image|favicon.ico).*)",
  ],
};
