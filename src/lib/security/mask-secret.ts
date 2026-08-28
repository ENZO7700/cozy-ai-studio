/**
 * Safe display of secrets — never return raw API keys in logs, API, or UI.
 *
 * Rules:
 * - empty / short → "••••" or "(empty)"
 * - default: first 4 + "…" + last 4 (or fewer if short)
 * - URLs (DATABASE_URL): show protocol + host only, mask userinfo/password
 * - known prefixes (sk_live_, sk_test_, whsec_, mistral-) keep prefix visible
 */

const DEFAULT_VISIBLE_HEAD = 4;
const DEFAULT_VISIBLE_TAIL = 4;

export type MaskOptions = {
  /** chars to keep at start (after known prefix) */
  head?: number;
  /** chars to keep at end */
  tail?: number;
  /** replace middle with this */
  maskChar?: string;
  /** if true, return only boolean-style "set"/"missing" */
  booleanOnly?: boolean;
};

const KNOWN_PREFIXES = [
  "sk_live_",
  "sk_test_",
  "rk_live_",
  "rk_test_",
  "whsec_",
  "pk_live_",
  "pk_test_",
  "price_",
  "team_",
  "vercel_",
  "mistral-",
  "Bearer ",
] as const;

export function isSecretKeyName(name: string): boolean {
  const n = name.toUpperCase();
  return (
    n.includes("SECRET") ||
    n.includes("API_KEY") ||
    n.includes("TOKEN") ||
    n.includes("PASSWORD") ||
    n.includes("PRIVATE") ||
    n.endsWith("_KEY") ||
    n.includes("WEBHOOK") ||
    n === "DATABASE_URL" ||
    n.includes("CONNECTION_STRING")
  );
}

/**
 * Mask an arbitrary secret string for logs / debug UI.
 * Never use for auth — display only.
 */
export function maskSecret(
  value: string | null | undefined,
  opts: MaskOptions = {},
): string {
  if (opts.booleanOnly) {
    return value && String(value).trim() ? "set" : "missing";
  }
  if (value == null) return "(empty)";
  const raw = String(value).trim();
  if (!raw) return "(empty)";

  // Connection strings / URLs with credentials
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(raw)) {
    return maskConnectionUrl(raw);
  }

  const head = opts.head ?? DEFAULT_VISIBLE_HEAD;
  const tail = opts.tail ?? DEFAULT_VISIBLE_TAIL;
  const maskChar = opts.maskChar ?? "•";

  let prefix = "";
  let body = raw;
  for (const p of KNOWN_PREFIXES) {
    if (raw.startsWith(p)) {
      prefix = p;
      body = raw.slice(p.length);
      break;
    }
  }

  if (body.length <= head + tail) {
    if (body.length <= 2) return `${prefix}${maskChar.repeat(6)}`;
    return `${prefix}${body.slice(0, 1)}${maskChar.repeat(6)}${body.slice(-1)}`;
  }

  const midLen = Math.min(12, Math.max(4, body.length - head - tail));
  return `${prefix}${body.slice(0, head)}${maskChar.repeat(midLen)}${body.slice(-tail)}`;
}

/** postgresql://user:pass@host:5432/db → postgresql://***:***@host:5432/db */
export function maskConnectionUrl(url: string): string {
  try {
    const u = new URL(url);
    if (u.password) u.password = "***";
    if (u.username) u.username = u.username ? "***" : "";
    // hide long query tokens
    if (u.searchParams.has("password")) u.searchParams.set("password", "***");
    if (u.searchParams.has("token")) u.searchParams.set("token", "***");
    return u.toString();
  } catch {
    // non-standard URI — crude mask
    return url.replace(/:\/\/([^:@/]+):([^@/]+)@/, "://***:***@");
  }
}

/**
 * Fingerprint for env-status style checks: never the secret, only presence + short hint.
 * Example: { set: true, fingerprint: "sk_te…x9Ab" }
 */
export function secretFingerprint(
  value: string | null | undefined,
): { set: boolean; fingerprint: string | null } {
  if (value == null || !String(value).trim()) {
    return { set: false, fingerprint: null };
  }
  return { set: true, fingerprint: maskSecret(value, { head: 2, tail: 4 }) };
}

/** Redact secret-looking keys inside a shallow object (for safe JSON logs). */
export function redactSecrets<T extends Record<string, unknown>>(
  obj: T,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (isSecretKeyName(k) && (typeof v === "string" || v == null)) {
      out[k] = maskSecret(v as string | null);
    } else if (v && typeof v === "object" && !Array.isArray(v)) {
      out[k] = redactSecrets(v as Record<string, unknown>);
    } else {
      out[k] = v;
    }
  }
  return out;
}

/** Safe console helper — never log raw secrets. */
export function logSafe(label: string, data: Record<string, unknown>): void {
  console.info(label, redactSecrets(data));
}
