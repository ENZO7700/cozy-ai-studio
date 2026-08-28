/**
 * Server-side Option B funnel events (brief → share → remix).
 */

import { getSql } from "@/lib/db";

export type ActivationEventName =
  | "brief_sent"
  | "pipeline_done"
  | "accept"
  | "share_created"
  | "remix_opened"
  | "share_viewed"
  | "reject";

const ALLOWED = new Set<ActivationEventName>([
  "brief_sent",
  "pipeline_done",
  "accept",
  "share_created",
  "remix_opened",
  "share_viewed",
  "reject",
]);

function newId() {
  return `act_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

export async function recordActivationEvent(opts: {
  userId?: string | null;
  event: ActivationEventName | string;
  meta?: Record<string, unknown> | null;
}): Promise<void> {
  if (!ALLOWED.has(opts.event as ActivationEventName)) return;
  try {
    const sql = await getSql();
    const meta = opts.meta ? JSON.stringify(opts.meta) : null;
    await sql`
      insert into activation_events (id, user_id, event, meta)
      values (
        ${newId()},
        ${opts.userId ?? null},
        ${opts.event},
        ${meta}::jsonb
      )
    `;
  } catch (e) {
    console.warn("[activation] record failed", e);
  }
}

function emptyCounts(): Record<ActivationEventName, number> {
  return {
    brief_sent: 0,
    pipeline_done: 0,
    accept: 0,
    share_created: 0,
    remix_opened: 0,
    share_viewed: 0,
    reject: 0,
  };
}

export type ActivationStats = {
  windowHours: number;
  counts: Record<ActivationEventName, number>;
  totals: number;
  /** Organic / product traffic (excludes smoke markers) */
  real: {
    counts: Record<ActivationEventName, number>;
    totals: number;
  };
  smoke: {
    counts: Record<ActivationEventName, number>;
    totals: number;
  };
  /** Honest gate: enough real funnel to consider Stripe */
  stripeGate: {
    ready: boolean;
    reason: string;
    realBriefs: number;
    realAccepts: number;
    realShares: number;
    realViews: number;
  };
};

export async function getActivationStats(
  windowHours = 24,
): Promise<ActivationStats> {
  const hours = Math.min(168, Math.max(1, windowHours));
  const empty: ActivationStats = {
    windowHours: hours,
    counts: emptyCounts(),
    totals: 0,
    real: { counts: emptyCounts(), totals: 0 },
    smoke: { counts: emptyCounts(), totals: 0 },
    stripeGate: {
      ready: false,
      reason: "No data yet",
      realBriefs: 0,
      realAccepts: 0,
      realShares: 0,
      realViews: 0,
    },
  };
  try {
    const sql = await getSql();
    const rows = await sql<{ event: string; n: number; kind: string }>`
      select
        event,
        count(*)::int as n,
        case
          when meta is not null
            and (
              meta->>'source' in ('prod-smoke', 'ship-gate', 'e2e')
              or meta->>'e2e' = 'true'
              or meta->>'smoke' = 'true'
            )
          then 'smoke'
          else 'real'
        end as kind
      from activation_events
      where created_at >= CURRENT_TIMESTAMP - (${hours} * interval '1 hour')
      group by 1, 3
    `;

    for (const r of rows) {
      if (!ALLOWED.has(r.event as ActivationEventName)) continue;
      const ev = r.event as ActivationEventName;
      const n = Number(r.n) || 0;
      empty.counts[ev] += n;
      if (r.kind === "smoke") empty.smoke.counts[ev] += n;
      else empty.real.counts[ev] += n;
    }
    empty.totals = Object.values(empty.counts).reduce((a, b) => a + b, 0);
    empty.real.totals = Object.values(empty.real.counts).reduce(
      (a, b) => a + b,
      0,
    );
    empty.smoke.totals = Object.values(empty.smoke.counts).reduce(
      (a, b) => a + b,
      0,
    );

    const realBriefs = empty.real.counts.brief_sent;
    const realAccepts = empty.real.counts.accept;
    const realShares = empty.real.counts.share_created;
    const realViews = empty.real.counts.share_viewed;
    // Gate: meaningful organic path — not just smoke shares
    const ready =
      realBriefs >= 5 && realAccepts >= 3 && realShares >= 3 && realViews >= 2;
    let reason: string;
    if (ready) {
      reason =
        "Reálny funnel drží — Stripe môžeš zapnúť, keď budeš chcieť platený deploy.";
    } else if (realBriefs === 0 && empty.smoke.totals > 0) {
      reason =
        "Zatiaľ len smoke/e2e testy — počkaj na reálnych používateľov Brief → Share.";
    } else if (realBriefs === 0) {
      reason = "Zatiaľ žiadne reálne briefy. Otvor Studio a spusti šablónu.";
    } else {
      reason = `Treba viac reálnej aktivácie (briefy ${realBriefs}/5 · accept ${realAccepts}/3 · share ${realShares}/3 · zobrazenia ${realViews}/2).`;
    }
    empty.stripeGate = {
      ready,
      reason,
      realBriefs,
      realAccepts,
      realShares,
      realViews,
    };
    return empty;
  } catch (e) {
    console.warn("[activation] stats failed", e);
    return empty;
  }
}
