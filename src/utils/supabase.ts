/**
 * App-wide browser Supabase client (re-export of auth path A).
 * Prefer this over creating ad-hoc clients.
 */
import { getSupabaseBrowser } from "@/lib/auth/supabase-browser";
import { getPublicSupabaseConfig } from "@/lib/auth/mode";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let fallback: SupabaseClient | null = null;

/** Browser client; null if env missing. */
export function getSupabase(): SupabaseClient | null {
  const existing = getSupabaseBrowser();
  if (existing) return existing;
  const { url, anonKey } = getPublicSupabaseConfig();
  if (!url || !anonKey) return null;
  if (!fallback) {
    fallback = createClient(url, anonKey, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
    });
  }
  return fallback;
}

/** Convenience export matching Supabase quickstart shape (may be null if misconfigured). */
export const supabase = new Proxy({} as SupabaseClient, {
  get(_t, prop, receiver) {
    const client = getSupabase();
    if (!client) {
      throw new Error(
        "Supabase nie je nakonfigurovaný — nastav VITE_SUPABASE_URL a VITE_SUPABASE_ANON_KEY (alebo VITE_SUPABASE_KEY).",
      );
    }
    const value = Reflect.get(client, prop, receiver);
    return typeof value === "function" ? value.bind(client) : value;
  },
});
