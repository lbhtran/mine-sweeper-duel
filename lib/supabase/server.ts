import { createClient } from "@supabase/supabase-js";

// Server-side Supabase client (uses service role key — never expose to browser)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function createServerClient(): ReturnType<typeof createClient<any>> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceRoleKey) {
    throw new Error(
      "Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY"
    );
  }

  return createClient(url, serviceRoleKey, {
    auth: { persistSession: false },
  });
}
