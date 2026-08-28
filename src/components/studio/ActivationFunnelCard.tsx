import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Activity,
  RefreshCw,
  ChevronDown,
} from "lucide-react";
import {
  fetchActivationStats,
  type ActivationCounts,
  type ActivationStatsResponse,
} from "@/lib/activation/client";
import { cn } from "@/lib/utils";

const STEPS: { key: keyof ActivationCounts; label: string; hint: string }[] = [
  { key: "brief_sent", label: "Brief", hint: "Brief odoslaný" },
  { key: "pipeline_done", label: "Done", hint: "Pipeline dokončená" },
  { key: "accept", label: "Accept", hint: "Schválenie (Accept)" },
  { key: "share_created", label: "Share", hint: "Verejný odkaz /a/…" },
  { key: "share_viewed", label: "View", hint: "Niekto otvoril odkaz" },
  { key: "remix_opened", label: "Remix", hint: "Remix do Studia" },
];

function pct(from: number, to: number): string | null {
  if (from <= 0) return null;
  return `${Math.min(100, Math.round((to / from) * 100))}%`;
}

/**
 * Funnel collapsed by default — one quiet row, expand for metrics.
 * Stripe gate intentionally not shown (billing off / P4).
 */
export function ActivationFunnelCard({ className }: { className?: string }) {
  const [data, setData] = useState<ActivationStatsResponse | null>(null);
  const [hours, setHours] = useState(24);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [open, setOpen] = useState(false);
  const [hitl, setHitl] = useState<{
    approved: number;
    rejected: number;
    rejectRate: number | null;
  } | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    setError(false);
    void Promise.all([
      fetchActivationStats(hours),
      fetch(`/api/telemetry-stats?hours=${hours}`)
        .then((r) => r.json())
        .catch(() => null),
    ]).then(([s, tel]) => {
      if (!s?.ok) {
        setError(true);
        setLoading(false);
        return;
      }
      setData(s);
      if (tel && tel.ok) {
        setHitl({
          approved: Number(tel.approved) || 0,
          rejected: Number(tel.rejected) || 0,
          rejectRate: tel.rejectRate == null ? null : Number(tel.rejectRate),
        });
      }
      setLoading(false);
    });
  }, [hours]);

  useEffect(() => {
    load();
  }, [load]);

  const counts = data?.real?.counts ?? data?.counts ?? null;
  const totals = data?.real?.totals ?? data?.totals ?? 0;
  const smokeTotals = data?.smoke?.totals ?? 0;

  const bottleneck = useMemo(() => {
    if (!counts) return null;
    const vals = STEPS.map((s) => counts[s.key] ?? 0);
    for (let i = 0; i < vals.length - 1; i++) {
      if (vals[i] >= 2 && vals[i + 1] / vals[i] < 0.5) {
        return {
          from: STEPS[i].label,
          to: STEPS[i + 1].label,
          rate: pct(vals[i], vals[i + 1]),
        };
      }
    }
    return null;
  }, [counts]);

  if (loading && !counts) {
    return null;
  }

  if (error && !counts) {
    return null;
  }

  if (!counts) return null;

  const empty = totals === 0 && smokeTotals === 0;

  return (
    <div
      className={cn(
        "rounded-xl border border-border/70 bg-card/60 overflow-hidden",
        className,
      )}
    >
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-muted/40 transition-colors"
      >
        <Activity className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
        <span className="text-[11px] font-medium text-muted-foreground">
          Funnel
        </span>
        <span className="text-[11px] font-mono tabular-nums text-muted-foreground">
          {totals}
          {smokeTotals > 0 ? ` · ${smokeTotals} smoke` : ""}
        </span>
        {bottleneck && !empty && (
          <span className="hidden sm:inline text-[10px] text-terracotta truncate">
            {bottleneck.from}→{bottleneck.to} {bottleneck.rate}
          </span>
        )}
        <ChevronDown
          className={cn(
            "ml-auto h-3.5 w-3.5 text-muted-foreground transition-transform shrink-0",
            open && "rotate-180",
          )}
        />
      </button>

      {open && (
        <div className="border-t border-border px-3 py-2.5 space-y-2">
          <div className="flex items-center justify-end gap-1.5">
            {[24, 168].map((h) => (
              <button
                key={h}
                type="button"
                onClick={() => setHours(h)}
                className={cn(
                  "rounded-md px-1.5 py-0.5 text-[10px] font-medium border",
                  hours === h
                    ? "border-choco/40 bg-choco/10 text-foreground"
                    : "border-transparent text-muted-foreground hover:bg-muted",
                )}
              >
                {h === 24 ? "24h" : "7d"}
              </button>
            ))}
            <button
              type="button"
              onClick={load}
              disabled={loading}
              title="Refresh"
              className="rounded-md p-1 text-muted-foreground hover:text-foreground hover:bg-muted disabled:opacity-50"
            >
              <RefreshCw className={cn("h-3 w-3", loading && "animate-spin")} />
            </button>
          </div>

          {empty ? (
            <p className="text-[11px] text-muted-foreground leading-relaxed">
              Zatiaľ prázdne. Brief → Accept → Share — tu uvidíš konverziu.
            </p>
          ) : (
            <div className="grid grid-cols-3 sm:grid-cols-6 gap-1.5">
              {STEPS.map((s, i) => {
                const n = counts[s.key] ?? 0;
                const prev = i > 0 ? (counts[STEPS[i - 1].key] ?? 0) : null;
                const conv = prev != null ? pct(prev, n) : null;
                const weak = prev != null && prev >= 2 && n / prev < 0.5;
                return (
                  <div
                    key={s.key}
                    title={s.hint + (conv ? ` · ${conv} z predch.` : "")}
                    className={cn(
                      "rounded-lg border bg-background/70 px-1.5 py-1.5 text-center",
                      weak
                        ? "border-terracotta/40"
                        : n > 0
                          ? "border-success/25"
                          : "border-border",
                    )}
                  >
                    <p className="text-sm font-semibold tabular-nums leading-none">
                      {n}
                    </p>
                    <p className="mt-0.5 text-[9px] text-muted-foreground truncate">
                      {s.label}
                    </p>
                    {conv && (
                      <p className="text-[9px] text-muted-foreground/80 tabular-nums">
                        {conv}
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {hitl && (hitl.approved > 0 || hitl.rejected > 0) && (
            <p className="text-[10px] text-muted-foreground">
              HitL: {hitl.approved} ok / {hitl.rejected} reject
              {hitl.rejectRate != null
                ? ` · ${Math.round(hitl.rejectRate * 100)}% reject`
                : ""}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
