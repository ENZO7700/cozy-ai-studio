/**
 * Client-safe billing server functions.
 * Handlers dynamically import Stripe / verify.server so createRequire
 * never enters the client graph (fixes /studio crash).
 */
import { createServerFn } from "@tanstack/react-start";
import { authMiddleware } from "@/lib/auth/middleware";
import type { PaidPlanTier } from "@/lib/stripe/config";

async function originFromRequest(): Promise<string> {
  const { getAppOrigin } = await import("@/lib/stripe/config");
  try {
    const { getRequest } = await import("@tanstack/react-start/server");
    const req = getRequest();
    return getAppOrigin(req);
  } catch {
    return getAppOrigin();
  }
}

export const getMyBilling = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const { getBillingSnapshot } = await import("@/lib/stripe/server");
    return getBillingSnapshot(context.userId);
  });

export const createCheckout = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((plan: PaidPlanTier) => {
    if (plan !== "PRO" && plan !== "ENTERPRISE") {
      throw new Error("Invalid plan");
    }
    return plan;
  })
  .handler(async ({ context, data: plan }) => {
    const { isStripeConfigured } = await import("@/lib/stripe/config");
    if (!isStripeConfigured()) {
      throw new Error(
        "Stripe is not configured (STRIPE_SECRET_KEY / STRIPE_PRICE_*)",
      );
    }
    const { getSessionUser } = await import("@/lib/auth/verify.server");
    const { createCheckoutSession } = await import("@/lib/stripe/server");
    const user = await getSessionUser();
    const origin = await originFromRequest();
    return createCheckoutSession({
      userId: context.userId,
      email: user?.email ?? null,
      plan,
      origin,
    });
  });

export const createPortal = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const { isStripeConfigured } = await import("@/lib/stripe/config");
    if (!isStripeConfigured()) {
      throw new Error("Stripe is not configured");
    }
    const { getSessionUser } = await import("@/lib/auth/verify.server");
    const { createBillingPortalSession } = await import("@/lib/stripe/server");
    const user = await getSessionUser();
    const origin = await originFromRequest();
    return createBillingPortalSession({
      userId: context.userId,
      email: user?.email ?? null,
      origin,
    });
  });

/** Activate FREE when no active Stripe subscription */
export const activateFreePlan = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const { getBillingSnapshot, setUserPlanFree } = await import(
      "@/lib/stripe/server"
    );
    const snap = await getBillingSnapshot(context.userId);
    if (
      snap.stripeSubscriptionId &&
      (snap.status === "active" || snap.status === "trialing")
    ) {
      throw new Error(
        "Cancel or switch plan in the Stripe Customer Portal first.",
      );
    }
    await setUserPlanFree(context.userId);
    return getBillingSnapshot(context.userId);
  });
