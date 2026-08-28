import { createFileRoute } from "@tanstack/react-router";
import type Stripe from "stripe";
import {
  applySubscriptionObject,
  findUserIdByCustomerId,
  getStripe,
  upsertSubscription,
} from "@/lib/stripe/server";
import {
  getStripeWebhookSecret,
  isStripeConfigured,
} from "@/lib/stripe/config";

export const Route = createFileRoute("/api/stripe/webhook")({
  server: {
    handlers: {
      GET: async () =>
        Response.json({
          ok: true,
          endpoint: "POST /api/stripe/webhook",
          configured: Boolean(
            process.env.STRIPE_SECRET_KEY?.trim() &&
              process.env.STRIPE_WEBHOOK_SECRET?.trim(),
          ),
        }),
      POST: async ({ request }) => {
        if (!isStripeConfigured()) {
          return Response.json(
            { error: "Stripe not configured" },
            { status: 503 },
          );
        }

        const secret = getStripeWebhookSecret();
        if (!secret) {
          return Response.json(
            { error: "STRIPE_WEBHOOK_SECRET missing" },
            { status: 503 },
          );
        }

        const signature = request.headers.get("stripe-signature");
        if (!signature) {
          return Response.json(
            { error: "Missing stripe-signature" },
            { status: 400 },
          );
        }

        const rawBody = await request.text();
        const stripe = getStripe();

        let event: Stripe.Event;
        try {
          event = stripe.webhooks.constructEvent(rawBody, signature, secret);
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          console.error("[stripe webhook] signature", msg);
          return Response.json({ error: `Webhook Error: ${msg}` }, { status: 400 });
        }

        try {
          switch (event.type) {
            case "checkout.session.completed": {
              const session = event.data.object as Stripe.Checkout.Session;
              const userId =
                session.metadata?.userId ||
                session.client_reference_id ||
                null;
              if (session.mode === "subscription" && session.subscription) {
                const subId =
                  typeof session.subscription === "string"
                    ? session.subscription
                    : session.subscription.id;
                const sub = await stripe.subscriptions.retrieve(subId);
                await applySubscriptionObject(sub, userId);
              }
              break;
            }
            case "customer.subscription.created":
            case "customer.subscription.updated":
            case "customer.subscription.deleted": {
              const sub = event.data.object as Stripe.Subscription;
              await applySubscriptionObject(sub);
              if (event.type === "customer.subscription.deleted") {
                const customerId =
                  typeof sub.customer === "string"
                    ? sub.customer
                    : sub.customer.id;
                const userId =
                  sub.metadata?.userId ||
                  (await findUserIdByCustomerId(customerId));
                if (userId) {
                  await upsertSubscription({
                    userId,
                    subscriptionId: sub.id,
                    priceId: null,
                    status: "canceled",
                    currentPeriodEnd: null,
                    cancelAtPeriodEnd: false,
                  });
                }
              }
              break;
            }
            case "invoice.paid":
            case "invoice.payment_failed": {
              // Keep subscription status authoritative via subscription events
              break;
            }
            default:
              break;
          }
        } catch (e) {
          console.error("[stripe webhook] handler", e);
          return Response.json(
            { error: "Webhook handler failed" },
            { status: 500 },
          );
        }

        return Response.json({ received: true });
      },
    },
  },
});
