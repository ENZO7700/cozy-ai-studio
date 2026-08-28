import { useEffect, useState } from "react";
import { useStudioStore, type PlanTier } from "@/stores/studio-store";
import { authEnabled } from "@/lib/auth/client";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { getMyBilling } from "@/lib/billing/functions";

/**
 * Hydrate plan + usage from server into the store (single mount in StudioShell).
 */
export function useBillingSync() {
  const setQuota = useStudioStore((s) => s.setQuota);
  const setPlanTier = useStudioStore((s) => s.setPlanTier);
  const { user, isPending } = useCurrentUserState();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    const loadAgentsQuota = async () => {
      const res = await fetch("/api/agents/run", { method: "GET" });
      if (!res.ok) return;
      const j = (await res.json()) as {
        quota?: {
          planTier?: string;
          promptsUsed?: number;
          promptLimit?: number;
          dailyUsed?: number;
          dailyLimit?: number | null;
          superAdmin?: boolean;
        };
      };
      if (!j.quota || cancelled) return;
      setQuota({
        planTier: (j.quota.planTier as PlanTier) || "FREE",
        promptsUsed: Number(j.quota.promptsUsed ?? 0),
        promptLimit: Number(j.quota.promptLimit ?? 100),
        dailyUsed: Number(j.quota.dailyUsed ?? 0),
        dailyLimit:
          j.quota.dailyLimit === undefined || j.quota.dailyLimit === null
            ? null
            : Number(j.quota.dailyLimit),
        stripeConfigured: false,
      });
      if (j.quota.planTier) {
        setPlanTier(j.quota.planTier as PlanTier);
      }
    };

    setLoading(true);
    void (async () => {
      try {
        // Always force Stripe off in client hydration (P4 hold / owner request)
        setQuota({ stripeConfigured: false });

        if (authEnabled) {
          if (isPending) return;
          if (user) {
            const snap = await getMyBilling();
            if (cancelled) return;
            setQuota({
              planTier: snap.planTier as PlanTier,
              promptsUsed: snap.promptsUsed,
              promptLimit: snap.promptLimit,
              stripeConfigured: false,
            });
            setPlanTier(snap.planTier as PlanTier);
          }
        }
        await loadAgentsQuota();
        if (!cancelled) setError(null);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [user, isPending, setPlanTier, setQuota]);

  const stripeConfigured = useStudioStore((s) => s.stripeConfigured);
  const dailyUsed = useStudioStore((s) => s.dailyUsed);
  const dailyLimit = useStudioStore((s) => s.dailyLimit);

  return { loading, error, stripeConfigured: false as boolean, dailyUsed, dailyLimit };
}

export async function refreshBillingFromServer() {
  const snap = await getMyBilling();
  useStudioStore.getState().setQuota({
    planTier: snap.planTier as PlanTier,
    promptsUsed: snap.promptsUsed,
    promptLimit: snap.promptLimit,
    stripeConfigured: false,
  });
  return snap;
}

export async function refreshAgentsQuota() {
  try {
    const res = await fetch("/api/agents/run", { method: "GET" });
    if (!res.ok) return null;
    const j = (await res.json()) as {
      quota?: {
        planTier?: string;
        promptsUsed?: number;
        promptLimit?: number;
        dailyUsed?: number;
        dailyLimit?: number | null;
        superAdmin?: boolean;
      };
    };
    if (j.quota) {
      useStudioStore.getState().setQuota({
        planTier: (j.quota.planTier as PlanTier) || "FREE",
        promptsUsed: Number(j.quota.promptsUsed ?? 0),
        promptLimit: Number(j.quota.promptLimit ?? 100),
        dailyUsed: Number(j.quota.dailyUsed ?? 0),
        dailyLimit:
          j.quota.dailyLimit === undefined || j.quota.dailyLimit === null
            ? null
            : Number(j.quota.dailyLimit),
        stripeConfigured: false,
      });
      if (j.quota.planTier) {
        useStudioStore.getState().setPlanTier(j.quota.planTier as PlanTier);
      }
    }
    return j.quota ?? null;
  } catch {
    return null;
  }
}
