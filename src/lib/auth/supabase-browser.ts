/**
 * Supabase Auth — browser client (path A).
 */
import { createClient, type SupabaseClient, type Session, type User } from "@supabase/supabase-js";
import { getPublicSupabaseConfig } from "./mode";

let browser: SupabaseClient | null = null;

export function getSupabaseBrowser(): SupabaseClient | null {
  const { url, anonKey } = getPublicSupabaseConfig();
  if (!url || !anonKey) return null;
  if (!browser) {
    browser = createClient(url, anonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    });
  }
  return browser;
}

export async function getSupabaseSession(): Promise<Session | null> {
  const sb = getSupabaseBrowser();
  if (!sb) return null;
  const { data } = await sb.auth.getSession();
  return data.session ?? null;
}

export async function getSupabaseAccessToken(): Promise<string | null> {
  const session = await getSupabaseSession();
  return session?.access_token ?? null;
}

export async function signInWithSupabaseOAuth(
  provider: "google" | "github" | "apple",
  redirectTo: string,
): Promise<void> {
  const sb = getSupabaseBrowser();
  if (!sb) throw new Error("Supabase nie je nakonfigurovaný (VITE_SUPABASE_URL / ANON_KEY)");
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const { error } = await sb.auth.signInWithOAuth({
    provider,
    options: {
      redirectTo: `${origin}/auth/callback?next=${encodeURIComponent(redirectTo)}`,
    },
  });
  if (error) throw error;
}

export async function signOutSupabase(): Promise<void> {
  const sb = getSupabaseBrowser();
  if (!sb) return;
  await sb.auth.signOut();
}

export type SupabaseAppUser = {
  id: string;
  displayName: string | null;
  primaryEmail: string | null;
  profileImageUrl: string | null;
};

export function mapSupabaseUser(user: User): SupabaseAppUser {
  return {
    id: user.id,
    displayName:
      (user.user_metadata?.full_name as string | undefined) ||
      (user.user_metadata?.name as string | undefined) ||
      user.email?.split("@")[0] ||
      null,
    primaryEmail: user.email ?? null,
    profileImageUrl:
      (user.user_metadata?.avatar_url as string | undefined) ||
      (user.user_metadata?.picture as string | undefined) ||
      null,
  };
}
