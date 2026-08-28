/**
 * Super-admin gates — unlimited ENTERPRISE, no daily/monthly caps, no Stripe.
 *
 * Env (Production):
 *   SUPER_ADMIN_EMAILS=u0352652320@gmail.com,magicasro@hotmail.com
 *   SUPER_ADMIN_USER_IDS=dev-user
 *   SUPER_ADMIN_OPEN_DEMO=true   (default true when AUTH_PROVIDER=none)
 */

import { DEV_USER_ID } from "./verify.server";
import { resolveAuthProvider } from "./mode";

const DEFAULT_ADMIN_EMAILS = [
  "u0352652320@gmail.com",
  "magicasro@hotmail.com",
];

function parseList(raw: string | undefined): string[] {
  if (!raw?.trim()) return [];
  return raw
    .split(/[,;\s]+/)
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

export function superAdminEmails(): string[] {
  const fromEnv = parseList(process.env.SUPER_ADMIN_EMAILS);
  const merged = new Set([...DEFAULT_ADMIN_EMAILS.map((e) => e.toLowerCase()), ...fromEnv]);
  return [...merged];
}

export function superAdminUserIds(): string[] {
  const fromEnv = parseList(process.env.SUPER_ADMIN_USER_IDS);
  const ids = new Set(fromEnv);
  // Open-demo identity is always super-admin (owner sandbox)
  const openDemo =
    process.env.SUPER_ADMIN_OPEN_DEMO !== "false" &&
    resolveAuthProvider("server") === "none";
  if (openDemo) ids.add(DEV_USER_ID.toLowerCase());
  // Explicit default so Production open-demo is unlimited for the studio owner
  ids.add(DEV_USER_ID.toLowerCase());
  return [...ids];
}

export function isSuperAdmin(opts: {
  userId?: string | null;
  email?: string | null;
}): boolean {
  const id = opts.userId?.trim().toLowerCase();
  if (id && superAdminUserIds().includes(id)) return true;
  const email = opts.email?.trim().toLowerCase();
  if (email && superAdminEmails().includes(email)) return true;
  return false;
}

/** Hard ceiling so UI never shows "0 left" for admins */
export const SUPER_ADMIN_PROMPT_LIMIT = 10_000_000;
