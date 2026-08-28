/**
 * Stripe plan / price configuration from env.
 * Never put secrets in VITE_* vars.
 *
 * Stripe is OFF by default (Option B / P4 hold).
 * Set STRIPE_ENABLED=true only when checkout should go live.
 */

export type PaidPlanTier = "PRO" | "ENTERPRISE";
export type PlanTier = "FREE" | PaidPlanTier;

export const FREE_PROMPT_LIMIT = 100;
export const PRO_PROMPT_LIMIT = 10_000;
export const ENTERPRISE_PROMPT_LIMIT = 1_000_000;

export function getStripeSecretKey(): string | null {
  const k = process.env.STRIPE_SECRET_KEY?.trim();
  return k || null;
}

export function getStripeWebhookSecret(): string | null {
  const k = process.env.STRIPE_WEBHOOK_SECRET?.trim();
  return k || null;
}

/**
 * Stripe is fully disabled unless STRIPE_ENABLED=true.
 * Keys alone do NOT enable checkout (P4 hold / owner request).
 */
export function isStripeConfigured(): boolean {
  if (process.env.STRIPE_ENABLED === "true") {
    return Boolean(getStripeSecretKey() && process.env.STRIPE_PRICE_PRO?.trim());
  }
  return false;
}

/** Price IDs — set in platform env, never hardcode live prices */
export function getPriceId(plan: PaidPlanTier): string | null {
  if (!isStripeConfigured()) return null;
  if (plan === "PRO") {
    return process.env.STRIPE_PRICE_PRO?.trim() || null;
  }
  return process.env.STRIPE_PRICE_ENTERPRISE?.trim() || null;
}

export function planFromPriceId(priceId: string | null | undefined): PlanTier {
  if (!priceId) return "FREE";
  const pro = process.env.STRIPE_PRICE_PRO?.trim();
  const ent = process.env.STRIPE_PRICE_ENTERPRISE?.trim();
  if (pro && priceId === pro) return "PRO";
  if (ent && priceId === ent) return "ENTERPRISE";
  return "FREE";
}

export function promptLimitForPlan(plan: PlanTier): number {
  if (plan === "ENTERPRISE") return ENTERPRISE_PROMPT_LIMIT;
  if (plan === "PRO") return PRO_PROMPT_LIMIT;
  return FREE_PROMPT_LIMIT;
}

export function getAppOrigin(request?: Request): string {
  if (process.env.SITE_URL?.trim()) {
    return process.env.SITE_URL.trim().replace(/\/$/, "");
  }
  if (process.env.BETTER_AUTH_URL?.trim()) {
    return process.env.BETTER_AUTH_URL.trim().replace(/\/$/, "");
  }
  if (process.env.APP_URL?.trim()) {
    return process.env.APP_URL.trim().replace(/\/$/, "");
  }
  if (request) {
    try {
      const u = new URL(request.url);
      return `${u.protocol}//${u.host}`;
    } catch {
      /* ignore */
    }
  }
  return "https://canvas.h4ck3d.me";
}
