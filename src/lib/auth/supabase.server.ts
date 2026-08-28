/**
 * Supabase Auth — server-only (path A).
 * Prefer service role for admin ops; user verification uses JWT + anon/service getUser.
 */
import { createClient, type SupabaseClient, type User } from "@supabase/supabase-js";

let admin: SupabaseClient | null = null;
let anon: SupabaseClient | null = null;

function url(): string {
  const u = process.env.SUPABASE_URL?.trim();
  if (!u) throw new Error("SUPABASE_URL missing");
  return u;
}

export function isSupabaseServerConfigured(): boolean {
  return Boolean(
    process.env.SUPABASE_URL?.trim() &&
      (process.env.SUPABASE_ANON_KEY?.trim() ||
        process.env.SUPABASE_PUBLISHABLE_KEY?.trim() ||
        process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() ||
        process.env.SUPABASE_SECRET_KEY?.trim()),
  );
}

/** Service role client — server only, bypasses RLS. Never import from client. */
export function getSupabaseAdmin(): SupabaseClient {
  if (admin) return admin;
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() ||
    process.env.SUPABASE_SECRET_KEY?.trim() ||
    process.env.SUPABASE_ANON_KEY?.trim() ||
    process.env.SUPABASE_PUBLISHABLE_KEY?.trim();
  if (!key) throw new Error("SUPABASE_SERVICE_ROLE_KEY or SUPABASE_SECRET_KEY missing");
  admin = createClient(url(), key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return admin;
}

export function getSupabaseAnonServer(): SupabaseClient {
  if (anon) return anon;
  const key =
    process.env.SUPABASE_ANON_KEY?.trim() ||
    process.env.SUPABASE_PUBLISHABLE_KEY?.trim();
  if (!key) throw new Error("SUPABASE_ANON_KEY or SUPABASE_PUBLISHABLE_KEY missing");
  anon = createClient(url(), key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return anon;
}

/** JWKS URL for JWT verification (new Supabase keys). */
export function getSupabaseJwksUrl(): string | null {
  const explicit = process.env.SUPABASE_JWKS_URL?.trim();
  if (explicit) return explicit;
  const base = process.env.SUPABASE_URL?.trim();
  if (!base) return null;
  return `${base.replace(/\/$/, "")}/auth/v1/.well-known/jwks.json`;
}

export type SupabaseVerified = { id: string; email: string | null };

/**
 * Verify a Supabase access token (Bearer) and return the user.
 */
export async function getSupabaseUserFromJwt(
  accessToken: string,
): Promise<SupabaseVerified | null> {
  if (!accessToken?.trim()) return null;
  try {
    const client = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()
      ? getSupabaseAdmin()
      : getSupabaseAnonServer();
    const { data, error } = await client.auth.getUser(accessToken);
    if (error || !data.user) return null;
    return mapUser(data.user);
  } catch {
    return null;
  }
}

/**
 * Resolve user from Request: Authorization Bearer, or sb-access-token cookie.
 */
export async function getSupabaseUserFromRequest(
  request: Request,
): Promise<SupabaseVerified | null> {
  const auth = request.headers.get("authorization") || request.headers.get("Authorization");
  if (auth?.toLowerCase().startsWith("bearer ")) {
    const jwt = auth.slice(7).trim();
    const u = await getSupabaseUserFromJwt(jwt);
    if (u) return u;
  }

  // Common cookie names Supabase SSR / browser may set
  const cookie = request.headers.get("cookie") || "";
  const token =
    readCookie(cookie, "sb-access-token") ||
    readCookie(cookie, "supabase-access-token") ||
    extractFromSbStorageCookie(cookie);
  if (token) return getSupabaseUserFromJwt(token);
  return null;
}

function mapUser(user: User): SupabaseVerified {
  return { id: user.id, email: user.email ?? null };
}

function readCookie(header: string, name: string): string | null {
  for (const part of header.split(";")) {
    const t = part.trim();
    const eq = t.indexOf("=");
    if (eq <= 0) continue;
    if (t.slice(0, eq) !== name) continue;
    try {
      return decodeURIComponent(t.slice(eq + 1));
    } catch {
      return t.slice(eq + 1);
    }
  }
  return null;
}

/** Parse `sb-<ref>-auth-token` style JSON cookies if present. */
function extractFromSbStorageCookie(header: string): string | null {
  for (const part of header.split(";")) {
    const t = part.trim();
    const eq = t.indexOf("=");
    if (eq <= 0) continue;
    const name = t.slice(0, eq);
    if (!name.includes("-auth-token") && !name.startsWith("sb-")) continue;
    let raw = t.slice(eq + 1);
    try {
      raw = decodeURIComponent(raw);
    } catch {
      /* keep */
    }
    try {
      const parsed = JSON.parse(raw) as {
        access_token?: string;
        currentSession?: { access_token?: string };
      };
      if (parsed.access_token) return parsed.access_token;
      if (parsed.currentSession?.access_token) return parsed.currentSession.access_token;
      // chunked array format
      if (Array.isArray(parsed)) {
        const joined = parsed.join("");
        const j = JSON.parse(joined) as { access_token?: string };
        if (j.access_token) return j.access_token;
      }
    } catch {
      /* not json */
    }
  }
  return null;
}
