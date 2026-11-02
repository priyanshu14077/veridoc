import { NextResponse, type NextRequest } from "next/server";

// Optimistic check only: the API is the real authority (it returns 401 and the app redirects).
export function proxy(request: NextRequest) {
  const hasSession = request.cookies.has("cc_session");
  if (!hasSession) {
    const url = new URL("/login", request.url);
    const next = request.nextUrl.pathname + request.nextUrl.search;
    if (next !== "/") url.searchParams.set("next", next);
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  // Never run on /api (keeps upload bodies out of the proxy buffer), static files or /login.
  matcher: ["/((?!api|login|_next/static|_next/image|favicon.ico).*)"],
};
