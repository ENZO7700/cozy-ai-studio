/** Fire-and-forget activation events from the browser. */
export type ClientActivationEvent =
  | "brief_sent"
  | "pipeline_done"
  | "accept"
  | "share_created"
  | "remix_opened"
  | "share_viewed"
  | "reject";

export async function trackActivation(
  event: ClientActivationEvent,
  meta?: Record<string, unknown>,
): Promise<void> {
  try {
    await fetch("/api/activation-stats", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ event, meta }),
      keepalive: true,
    });
  } catch {
    /* ignore */
  }
}

export type ActivationCounts = Record<ClientActivationEvent, number>;

export type ActivationStatsResponse = {
  ok: boolean;
  counts: ActivationCounts;
  totals: number;
  windowHours: number;
  real?: { counts: ActivationCounts; totals: number };
  smoke?: { counts: ActivationCounts; totals: number };
  stripeGate?: {
    ready: boolean;
    reason: string;
    realBriefs: number;
    realAccepts: number;
    realShares: number;
    realViews: number;
  };
};

export async function fetchActivationStats(
  hours = 24,
): Promise<ActivationStatsResponse | null> {
  try {
    const res = await fetch(`/api/activation-stats?hours=${hours}`);
    if (!res.ok) return null;
    return (await res.json()) as ActivationStatsResponse;
  } catch {
    return null;
  }
}
