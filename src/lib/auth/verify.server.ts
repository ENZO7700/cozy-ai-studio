import { getRequest } from "@tanstack/react-start/server";
import { auth, authConfigured as betterAuthConfigured } from "./server";
import { resolveAuthProvider } from "./mode";
import {
  getSupabaseUserFromJwt,
  getSupabaseUserFromRequest,
  isSupabaseServerConfigured,
} from "./supabase.server";

const databaseConfigured = Boolean(process.env.DATABASE_URL?.trim());

export const authConfigured =
  resolveAuthProvider("server") === "supabase"
    ? isSupabaseServerConfigured()
    : betterAuthConfigured;

if (databaseConfigured && !authConfigured && process.env.VITE_AUTH_ENABLED !== "false") {
  console.error(
    "[auth] DATABASE_URL is set but no auth provider is ready " +
      "(set Supabase URL+keys or Better Auth). requireUserId() fails closed.",
  );
}

export const DEV_USER_ID = "dev-user";

export class UnauthorizedError extends Error {
  readonly status = 401;
  constructor() {
    super("Unauthorized");
    this.name = "UnauthorizedError";
  }
}

export type VerifiedUser = { id: string; email: string | null };

/**
 * Resolve signed-in user from current request.
 * Path A: Supabase JWT (bearer / cookie)
 * Path B: Better Auth session
 */
export async function getSessionUser(
  bearerToken?: string,
): Promise<VerifiedUser | null> {
  const provider = resolveAuthProvider("server");
  if (provider === "none") return null;

  if (provider === "supabase") {
    if (bearerToken) {
      const u = await getSupabaseUserFromJwt(bearerToken);
      if (u) return u;
    }
    const request = getRequest();
    if (!request) return null;
    // Prefer explicit bearer from middleware, else request headers/cookies
    return getSupabaseUserFromRequest(request);
  }

  // better-auth
  if (!betterAuthConfigured) return null;
  const request = getRequest();
  if (!request) return null;
  let headers = request.headers;
  if (bearerToken) {
    headers = new Headers(request.headers);
    headers.set("Authorization", `Bearer ${bearerToken}`);
  }
  const session = await auth.api.getSession({ headers });
  if (!session?.user) return null;
  return { id: session.user.id, email: session.user.email ?? null };
}

export async function requireUserId(bearerToken?: string): Promise<string> {
  const provider = resolveAuthProvider("server");
  if (provider === "none") {
    return DEV_USER_ID;
  }
  const user = await getSessionUser(bearerToken);
  if (!user) throw new UnauthorizedError();
  return user.id;
}
