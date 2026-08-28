import { useEffect, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { Check, ArrowLeft, ExternalLink, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useStudioStore, type PlanTier } from "@/stores/studio-store";
import { cn } from "@/lib/utils";
import { authEnabled } from "@/lib/auth/client";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import {
  activateFreePlan,
  createCheckout,
  createPortal,
  getMyBilling,
} from "@/lib/billing/functions";
import { refreshBillingFromServer } from "@/hooks/useBillingSync";
import { CozyLogo } from "@/components/brand/CozyLogo";

type PricingSearch = {
  checkout?: "success" | "cancel";
  plan?: string;
};

export const Route = createFileRoute("/pricing")({
  component: PricingPage,
  head: () => ({
    meta: [{ title: "Limity — Cozy AI Studio" }],
  }),
  validateSearch: (s: Record<string, unknown>): PricingSearch => {
    const checkout =
      s.checkout === "success" || s.checkout === "cancel"
        ? s.checkout
        : undefined;
    const plan = typeof s.plan === "string" ? s.plan : undefined;
    return { checkout, plan };
  },
});

const tiers: {
  id: PlanTier;
  name: string;
  price: string;
  blurb: string;
  features: string[];
  highlight?: boolean;
  live: boolean;
}[] = [
  {
    id: "FREE",
    name: "Free",
    price: "$0",
    blurb: "Open studio with real caps",
    features: [
      "20 AI prompts / day (server 429)",
      "100 prompts / month",
      "G0 → G1 → G2 pipeline + HitL",
      "Live multi-device preview",
    ],
    live: true,
  },
  {
    id: "PRO",
    name: "Pro",
    price: "$29",
    blurb: "When Stripe keys are configured",
    features: [
      "10k prompts / month (fair use)",
      "Full multi-agent pipeline",
      "Higher daily allowance",
      "Checkout only if STRIPE_* set",
    ],
    highlight: true,
    live: false,
  },
  {
    id: "ENTERPRISE",
    name: "Enterprise",
    price: "$49",
    blurb: "Roadmap — not sold yet",
    features: [
      "Everything in Pro",
      "Team seats (roadmap)",
      "Custom limits (roadmap)",
      "Not available until Stripe + seats ship",
    ],
    live: false,
  },
];

function PricingPage() {
  const planTier = useStudioStore((s) => s.planTier);
  const promptsUsed = useStudioStore((s) => s.promptsUsed);
  const promptLimit = useStudioStore((s) => s.promptLimit);
  const setPlanTier = useStudioStore((s) => s.setPlanTier);
  const { user, isPending } = useCurrentUserState();
  const navigate = useNavigate();
  const search = Route.useSearch();

  const [busy, setBusy] = useState<string | null>(null);
  const [stripeConfigured, setStripeConfigured] = useState(false);
  const [status, setStatus] = useState<string>("inactive");

  useEffect(() => {
    if (!authEnabled || isPending || !user) return;
    void getMyBilling()
      .then((snap) => {
        setPlanTier(snap.planTier as PlanTier);
        useStudioStore.setState({
          promptsUsed: snap.promptsUsed,
          promptLimit: snap.promptLimit,
        });
        setStripeConfigured(snap.stripeConfigured);
        setStatus(snap.status);
      })
      .catch(() => {
        /* ignore */
      });
  }, [user, isPending, setPlanTier]);

  useEffect(() => {
    if (search.checkout === "success") {
      toast.success("Subscription updated", {
        description: "Syncing your plan from Stripe…",
      });
      void refreshBillingFromServer()
        .then((snap) => {
          toast.success(`You're on ${snap.planTier}`, {
            description: `${snap.promptsUsed}/${snap.promptLimit} prompts this month`,
          });
        })
        .catch(() => {
          toast.message("Plan will update when webhook arrives");
        });
    }
    if (search.checkout === "cancel") {
      toast.message("Checkout cancelled");
    }
  }, [search.checkout]);

  const requireAuth = () => {
    if (!authEnabled) return true;
    if (!user) {
      void navigate({
        to: "/login",
        search: { redirect: "/pricing" },
      });
      return false;
    }
    return true;
  };

  const onChoose = async (tier: PlanTier) => {
    if (!requireAuth()) return;

    if (tier === "FREE") {
      setBusy("FREE");
      try {
        const snap = await activateFreePlan();
        setPlanTier(snap.planTier as PlanTier);
        useStudioStore.setState({
          promptsUsed: snap.promptsUsed,
          promptLimit: snap.promptLimit,
        });
        toast.success("On Free plan");
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Could not switch to Free");
      } finally {
        setBusy(null);
      }
      return;
    }

    if (!stripeConfigured) {
      toast.message("Stripe is off", {
        description:
          "Billing is disabled (P4 hold). Super Admin has unlimited access in Studio — no checkout needed.",
      });
      return;
    }
    setBusy(tier);
    try {
      const { url } = await createCheckout({ data: tier });
      window.location.href = url;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      toast.error("Checkout unavailable", {
        description: msg.includes("not configured")
          ? "Set STRIPE_SECRET_KEY and STRIPE_PRICE_PRO / STRIPE_PRICE_ENTERPRISE"
          : msg,
      });
      setBusy(null);
    }
  };

  const openPortal = async () => {
    if (!requireAuth()) return;
    if (!stripeConfigured) {
      toast.message("Billing portal not live — Stripe not configured");
      return;
    }
    setBusy("portal");
    try {
      const { url } = await createPortal();
      window.location.href = url;
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Portal unavailable");
      setBusy(null);
    }
  };

  return (
    <div className="min-h-dvh bg-background">
      <div className="mx-auto max-w-5xl px-4 sm:px-6 py-10">
        <div className="flex items-center justify-between gap-4 mb-8">
          <Link
            to="/"
            className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4" />
            Back
          </Link>
          <Link to="/" className="inline-flex items-center gap-2">
            <CozyLogo size="sm" variant="seal" />
            <span className="font-serif font-bold text-sm">Cozy AI Studio</span>
          </Link>
        </div>

        <p className="text-xs font-semibold tracking-wide text-choco uppercase mb-2">
          Limits & billing
        </p>
        <h1 className="font-serif text-4xl font-bold mb-2">
          Free cap is real. Paid checkout only when Stripe is live.
        </h1>
        <p className="text-muted-foreground mb-2 max-w-xl">
          Current plan:{" "}
          <span className="font-semibold text-foreground font-mono">
            {planTier}
          </span>
          {status !== "inactive" && (
            <span className="text-xs font-mono ml-2 opacity-70">
              ({status})
            </span>
          )}
          {" · "}
          <span className="font-mono text-sm">
            {promptsUsed}/{promptLimit >= 100_000 ? "∞" : promptLimit} prompts
          </span>
        </p>
        <p className="text-xs text-muted-foreground mb-8 max-w-xl">
          {stripeConfigured
            ? "Checkout and Customer Portal are live. Plan + usage come from the server (webhooks + usage_monthly)."
            : "Stripe env not set — Pro/Enterprise buttons stay disabled. Free daily (20) + monthly (100) caps are enforced on /api/agents/run."}
        </p>

        {user && (planTier === "PRO" || planTier === "ENTERPRISE") && (
          <div className="mb-8">
            <Button
              variant="outline"
              className="rounded-xl gap-2"
              disabled={busy === "portal" || !stripeConfigured}
              onClick={() => void openPortal()}
            >
              {busy === "portal" ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <ExternalLink className="h-4 w-4" />
              )}
              Manage billing (Customer Portal)
            </Button>
          </div>
        )}

        <div className="grid gap-5 md:grid-cols-3">
          {tiers.map((tier) => {
            const paidDisabled =
              tier.id !== "FREE" && !stripeConfigured && !tier.live;
            const canCheckout =
              tier.id === "FREE" || stripeConfigured;
            return (
              <article
                key={tier.id}
                className={cn(
                  "flex flex-col rounded-2xl border bg-card p-6",
                  tier.highlight
                    ? "border-choco border-2 shadow-[var(--shadow-brutalist)]"
                    : "border-border shadow-sm",
                  paidDisabled && "opacity-90",
                )}
              >
                {tier.highlight && (
                  <span className="mb-3 inline-block w-fit rounded-full bg-choco/15 px-2.5 py-0.5 text-xs font-semibold text-choco">
                    {stripeConfigured ? "Recommended" : "Coming when Stripe is live"}
                  </span>
                )}
                <h2 className="font-serif text-xl font-bold">{tier.name}</h2>
                <p className="text-sm text-muted-foreground mt-1">{tier.blurb}</p>
                <p className="mt-4 mb-6">
                  <span className="font-serif text-4xl font-bold">{tier.price}</span>
                  <span className="text-sm text-muted-foreground"> / mo</span>
                </p>
                <ul className="space-y-2.5 text-sm mb-8 flex-1">
                  {tier.features.map((f) => (
                    <li key={f} className="flex gap-2">
                      <Check className="h-4 w-4 text-success shrink-0 mt-0.5" />
                      <span>{f}</span>
                    </li>
                  ))}
                </ul>
                <Button
                  variant={tier.highlight ? "default" : "outline"}
                  className="w-full rounded-xl"
                  onClick={() => void onChoose(tier.id)}
                  disabled={
                    planTier === tier.id ||
                    busy === tier.id ||
                    (tier.id !== "FREE" && !canCheckout)
                  }
                >
                  {busy === tier.id ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : planTier === tier.id ? (
                    "Current plan"
                  ) : tier.id === "FREE" ? (
                    "Use Free"
                  ) : !stripeConfigured ? (
                    "Not live yet"
                  ) : (
                    `Checkout ${tier.name}`
                  )}
                </Button>
              </article>
            );
          })}
        </div>

        {!user && authEnabled && !isPending && (
          <p className="mt-8 text-center text-sm text-muted-foreground">
            <Link
              to="/login"
              search={{ redirect: "/pricing" }}
              className="underline underline-offset-4 hover:text-foreground"
            >
              Sign in
            </Link>{" "}
            to subscribe or manage billing.
          </p>
        )}
      </div>
    </div>
  );
}
