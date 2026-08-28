/**
 * Auth provider selection — unifies path A (Supabase) and B (Better Auth).
 *
 * AUTH_PROVIDER=
 *   auto        → Supabase if SUPABASE_URL + ANON key set, else Better Auth
 *   supabase    → force A
 *   better-auth → force B
 */

export type AuthProviderId = "supabase" | "better-auth" | "none";

function env(name: string): string | undefined {
  const v = process.env[name] ?? (import.meta as ImportMeta & { env?: Record<string, string> }).env?.[name];
  if (typeof v !== "string") return undefined;
  const t = v.trim();
  return t || undefined;
}

/** Client-safe public env (Vite). */
export function getPublicSupabaseConfig(): {
  url: string | null;
  anonKey: string | null;
} {
  const url =
    (typeof import.meta !== "undefined" &&
      ((import.meta.env.VITE_SUPABASE_URL as string | undefined)?.trim() ||
        (import.meta.env.SUPABASE_URL as string | undefined)?.trim())) ||
    null;
  // ANON JWT, publishable key, or dashboard alias VITE_SUPABASE_KEY
  const anonKey =
    (typeof import.meta !== "undefined" &&
      ((import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined)?.trim() ||
        (import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined)?.trim() ||
        (import.meta.env.VITE_SUPABASE_KEY as string | undefined)?.trim() ||
        (import.meta.env.SUPABASE_ANON_KEY as string | undefined)?.trim() ||
        (import.meta.env.SUPABASE_PUBLISHABLE_KEY as string | undefined)?.trim())) ||
    null;
  return { url: url || null, anonKey: anonKey || null };
}

export function supabaseConfiguredServer(): boolean {
  return Boolean(
    process.env.SUPABASE_URL?.trim() &&
      (process.env.SUPABASE_ANON_KEY?.trim() ||
        process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()),
  );
}

export function supabaseConfiguredClient(): boolean {
  const { url, anonKey } = getPublicSupabaseConfig();
  return Boolean(url && anonKey);
}

/**
 * Resolved provider for the current runtime.
 * Server: reads process.env. Client: Vite public flags + VITE_AUTH_PROVIDER.
 */
export function resolveAuthProvider(side: "server" | "client" = "server"): AuthProviderId {
  const authOff =
    (side === "server"
      ? process.env.VITE_AUTH_ENABLED
      : import.meta.env.VITE_AUTH_ENABLED) === "false";
  if (authOff) return "none";

  const raw = (
    side === "server"
      ? process.env.AUTH_PROVIDER || process.env.VITE_AUTH_PROVIDER
      : import.meta.env.VITE_AUTH_PROVIDER || import.meta.env.AUTH_PROVIDER
  )
    ?.toString()
    .trim()
    .toLowerCase();

  if (raw === "supabase") return "supabase";
  if (raw === "better-auth" || raw === "better_auth" || raw === "grok") {
    return "better-auth";
  }

  // auto
  if (side === "server") {
    if (supabaseConfiguredServer()) return "supabase";
    // Better Auth when broker or explicit secret+url present
    if (
      process.env.BETTER_AUTH_SECRET?.trim() ||
      process.env.GROK_AUTH_CLIENT_ID?.trim() ||
      process.env.VITE_AUTH_ENABLED !== "false"
    ) {
      return "better-auth";
    }
    return "none";
  }

  if (supabaseConfiguredClient()) return "supabase";
  return "better-auth";
}

export function authEnabledResolved(side: "server" | "client" = "client"): boolean {
  return resolveAuthProvider(side) !== "none";
}
