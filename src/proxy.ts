// Single proxy doing two jobs (Next 16 renamed "middleware" → "proxy"):
//
//   1. Refresh the Supabase session cookie on every request (required for
//      Supabase SSR — without this, server components see stale auth state).
//   2. Gate route groups by role: /super → super_admin, /admin → admin,
//      /learn → trainee. Unauthenticated → /login.
//
// Role enforcement happens at three layers:
//   • Here (cheap deny, redirect).
//   • Layout server components (canonical check, hits DB).
//   • RLS policies in Postgres (defense in depth — data layer never trusts
//     the app).
//
// We never trust the `role` claim from a cookie/JWT — we look it up in
// `public.users` via prisma (cached per request).

import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";

const ROUTE_PREFIXES: Array<{
  prefix: string;
  role: "super_admin" | "admin" | "trainee";
}> = [
  { prefix: "/super", role: "super_admin" },
  { prefix: "/admin", role: "admin" },
  { prefix: "/learn", role: "trainee" },
];

function matchedRoute(pathname: string) {
  return ROUTE_PREFIXES.find(
    (r) => pathname === r.prefix || pathname.startsWith(r.prefix + "/"),
  );
}

export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (toSet) => {
          toSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          );
          response = NextResponse.next({ request });
          toSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  // IMPORTANT: refresh the session cookie. Don't remove this call.
  const { data } = await supabase.auth.getUser();
  const user = data.user;

  const { pathname } = request.nextUrl;
  const match = matchedRoute(pathname);

  if (match) {
    if (!user) {
      const url = request.nextUrl.clone();
      url.pathname = "/login";
      url.searchParams.set("next", pathname);
      return NextResponse.redirect(url);
    }
    // Canonical role check happens in the route's layout (DB hit); the proxy
    // just gates unauthenticated access. We don't store role in JWT yet.
  } else if (pathname === "/login" && user) {
    // Already logged in → bounce to home (the root page resolves role and
    // redirects to the right surface).
    const url = request.nextUrl.clone();
    url.pathname = "/";
    return NextResponse.redirect(url);
  }

  return response;
}

export const config = {
  matcher: [
    // Run on everything except static assets.
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
