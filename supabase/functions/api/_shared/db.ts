import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { env } from "./env.ts";

let client: SupabaseClient | null = null;

export function db(): SupabaseClient {
  if (client) return client;
  if (!env.supabaseUrl || !env.serviceRoleKey) {
    throw new Error(
      "SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required for the admin client.",
    );
  }
  client = createClient(env.supabaseUrl, env.serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return client;
}