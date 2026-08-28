/**
 * Server-only Stripe client + subscription helpers.
 */

import Stripe from "stripe";
import { getSql } from "@/lib/db";
import { ensureUserRow } from "@/lib/projects/server";
import {
  getPriceId,
  getStripeSecretKey,
  isStripeConfigured,
  planFromPriceId,
  promptLimitForPlan,
  type PaidPlanTier,
  type PlanTier,
} from "./config";
import {
  isSuperAdmin,
  SUPER_ADMIN_PROMPT_LIMIT,
} from "@/lib/auth/super-admin";

let stripeSingleton: Stripe | null = null;

export function getStripe(): Stripe {
  const key = getStripeSecretKey();
  if (!key) {
    throw new Error("STRIPE_SECRET_KEY is not configured");
  }
  if (!stripeSingleton) {
    stripeSingleton = new Stripe(key);
  }
  return stripeSingleton;
}

export type BillingSnapshot = {
  planTier: PlanTier;
  status: string;
  stripeCustomerId: string | null;
  stripeSubscriptionId: string | null;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
  promptsUsed: number;
  promptLimit: number;
  yearMonth: string;
  stripeConfigured: boolean;
};

export async function getOrCreateStripeCustomer(
  userId: string,
  email: string | null,
): Promise<string> {
  await ensureUserRow(userId, email);
  const sql = await getSql();
  const existing = await sql<{ stripe_customer_id: string }>`
    select stripe_customer_id from billing_customers where user_id = ${userId} limit 1
  `;
  if (existing[0]?.stripe_customer_id) {
    return existing[0].stripe_customer_id;
  }

  const stripe = getStripe();
  const customer = await stripe.customers.create({
    email: email ?? undefined,
    metadata: { userId },
  });

  await sql`
    insert into billing_customers (user_id, stripe_customer_id, email)
    values (${userId}, ${customer.id}, ${email})
    on conflict (user_id) do update set
      stripe_customer_id = excluded.stripe_customer_id,
      email = coalesce(excluded.email, billing_customers.email),
      updated_at = CURRENT_TIMESTAMP
  `;
  return customer.id;
}

export async function upsertSubscription(opts: {
  userId: string;
  subscriptionId: string | null;
  priceId: string | null;
  status: string;
  currentPeriodEnd: Date | null;
  cancelAtPeriodEnd?: boolean;
}): Promise<void> {
  await ensureUserRow(opts.userId);
  const plan = planFromPriceId(opts.priceId);
  const effectivePlan: PlanTier =
    opts.status === "active" || opts.status === "trialing" ? plan : "FREE";

  const sql = await getSql();
  await sql`
    insert into subscriptions (
      user_id, stripe_subscription_id, stripe_price_id, plan_tier, status,
      current_period_end, cancel_at_period_end, updated_at
    ) values (
      ${opts.userId},
      ${opts.subscriptionId},
      ${opts.priceId},
      ${effectivePlan},
      ${opts.status},
      ${opts.currentPeriodEnd ? opts.currentPeriodEnd.toISOString() : null},
      ${opts.cancelAtPeriodEnd ?? false},
      CURRENT_TIMESTAMP
    )
    on conflict (user_id) do update set
      stripe_subscription_id = excluded.stripe_subscription_id,
      stripe_price_id = excluded.stripe_price_id,
      plan_tier = excluded.plan_tier,
      status = excluded.status,
      current_period_end = excluded.current_period_end,
      cancel_at_period_end = excluded.cancel_at_period_end,
      updated_at = CURRENT_TIMESTAMP
  `;

  await sql`
    update projects
    set plan_tier = ${effectivePlan}, updated_at = CURRENT_TIMESTAMP
    where user_id = ${opts.userId}
  `;
}

export async function setUserPlanFree(userId: string): Promise<void> {
  await upsertSubscription({
    userId,
    subscriptionId: null,
    priceId: null,
    status: "inactive",
    currentPeriodEnd: null,
    cancelAtPeriodEnd: false,
  });
}

export async function findUserIdByCustomerId(
  customerId: string,
): Promise<string | null> {
  const sql = await getSql();
  const rows = await sql<{ user_id: string }>`
    select user_id from billing_customers where stripe_customer_id = ${customerId} limit 1
  `;
  return rows[0]?.user_id ?? null;
}

export async function getBillingSnapshot(
  userId: string,
): Promise<BillingSnapshot> {
  if (isSuperAdmin({ userId })) {
    await ensureUserRow(userId);
    const ym = `${new Date().getUTCFullYear()}-${String(new Date().getUTCMonth() + 1).padStart(2, "0")}`;
    let promptsUsed = 0;
    try {
      const sql = await getSql();
      const usage = await sql<{ prompts_used: number }>`
        select prompts_used from usage_monthly
        where user_id = ${userId} and year_month = ${ym} limit 1
      `;
      promptsUsed = Number(usage[0]?.prompts_used ?? 0);
    } catch {
      /* ignore */
    }
    return {
      planTier: "ENTERPRISE",
      status: "active",
      stripeCustomerId: null,
      stripeSubscriptionId: null,
      currentPeriodEnd: null,
      cancelAtPeriodEnd: false,
      promptsUsed,
      promptLimit: SUPER_ADMIN_PROMPT_LIMIT,
      yearMonth: ym,
      stripeConfigured: false,
    };
  }

  const sql = await getSql();
  const ym = `${new Date().getUTCFullYear()}-${String(new Date().getUTCMonth() + 1).padStart(2, "0")}`;

  const sub = await sql<{
    plan_tier: string;
    status: string;
    stripe_subscription_id: string | null;
    current_period_end: string | null;
    cancel_at_period_end: boolean;
  }>`
    select plan_tier, status, stripe_subscription_id,
           current_period_end::text, cancel_at_period_end
    from subscriptions where user_id = ${userId} limit 1
  `;

  const cust = await sql<{ stripe_customer_id: string }>`
    select stripe_customer_id from billing_customers where user_id = ${userId} limit 1
  `;

  const usage = await sql<{ prompts_used: number }>`
    select prompts_used from usage_monthly
    where user_id = ${userId} and year_month = ${ym} limit 1
  `;

  const status = sub[0]?.status ?? "inactive";
  const rawTier = (sub[0]?.plan_tier as PlanTier) || "FREE";
  const planTier =
    status === "active" || status === "trialing" ? rawTier : "FREE";

  return {
    planTier,
    status,
    stripeCustomerId: cust[0]?.stripe_customer_id ?? null,
    stripeSubscriptionId: sub[0]?.stripe_subscription_id ?? null,
    currentPeriodEnd: sub[0]?.current_period_end ?? null,
    cancelAtPeriodEnd: Boolean(sub[0]?.cancel_at_period_end),
    promptsUsed: Number(usage[0]?.prompts_used ?? 0),
    promptLimit: promptLimitForPlan(planTier),
    yearMonth: ym,
    stripeConfigured: isStripeConfigured(),
  };
}

export async function createCheckoutSession(opts: {
  userId: string;
  email: string | null;
  plan: PaidPlanTier;
  origin: string;
}): Promise<{ url: string }> {
  const priceId = getPriceId(opts.plan);
  if (!priceId) {
    throw new Error(
      `Missing env STRIPE_PRICE_${opts.plan} — set the Stripe Price ID`,
    );
  }

  const stripe = getStripe();
  const customerId = await getOrCreateStripeCustomer(opts.userId, opts.email);

  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    customer: customerId,
    line_items: [{ price: priceId, quantity: 1 }],
    success_url: `${opts.origin}/pricing?checkout=success&plan=${opts.plan}`,
    cancel_url: `${opts.origin}/pricing?checkout=cancel`,
    client_reference_id: opts.userId,
    metadata: { userId: opts.userId, plan: opts.plan },
    subscription_data: {
      metadata: { userId: opts.userId, plan: opts.plan },
    },
    allow_promotion_codes: true,
  });

  if (!session.url) {
    throw new Error("Stripe Checkout session missing URL");
  }
  return { url: session.url };
}

export async function createBillingPortalSession(opts: {
  userId: string;
  email: string | null;
  origin: string;
}): Promise<{ url: string }> {
  const stripe = getStripe();
  const customerId = await getOrCreateStripeCustomer(opts.userId, opts.email);
  const session = await stripe.billingPortal.sessions.create({
    customer: customerId,
    return_url: `${opts.origin}/pricing`,
  });
  return { url: session.url };
}

export async function applySubscriptionObject(
  sub: Stripe.Subscription,
  userIdHint?: string | null,
): Promise<void> {
  const customerId =
    typeof sub.customer === "string" ? sub.customer : sub.customer.id;
  const userId =
    userIdHint ||
    sub.metadata?.userId ||
    (await findUserIdByCustomerId(customerId));
  if (!userId) {
    console.warn("[stripe] no user for subscription", sub.id);
    return;
  }

  const priceId = sub.items.data[0]?.price?.id ?? null;
  const rawEnd = (sub as { current_period_end?: number }).current_period_end;
  const periodEnd =
    typeof rawEnd === "number" ? new Date(rawEnd * 1000) : null;

  await upsertSubscription({
    userId,
    subscriptionId: sub.id,
    priceId,
    status: sub.status,
    currentPeriodEnd: periodEnd,
    cancelAtPeriodEnd: Boolean(
      (sub as { cancel_at_period_end?: boolean }).cancel_at_period_end,
    ),
  });
}
