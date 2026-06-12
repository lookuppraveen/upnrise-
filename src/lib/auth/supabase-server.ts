// Supabase client for **server components, server actions, and route handlers**.
// Uses cookies to read the session set by middleware.
//
// Pattern from https://supabase.com/docs/guides/auth/server-side/nextjs

import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

export async function createSupabaseServerClient() {
  const cookieStore = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(toSet) {
          // Can only set cookies inside server actions / route handlers.
          // In server components this throws — wrap in try.
          try {
            toSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            );
          } catch {
            // ignore — middleware will refresh on the next request
          }
        },
      },
    },
  );
}
