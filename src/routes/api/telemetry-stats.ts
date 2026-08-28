import { createFileRoute } from "@tanstack/react-router";
import { getSql } from "@/lib/db";

/**
 * GET /api/telemetry-stats?hours=24
 * Aggregate HitL approve/reject from telemetry table (no PII).
 */
export const Route = createFileRoute("/api/telemetry-stats")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const hours = Math.min(
          168,
          Math.max(1, Number(url.searchParams.get("hours") || "24") || 24),
        );
        const empty = {
          ok: true,
          windowHours: hours,
          approved: 0,
          rejected: 0,
          total: 0,
          rejectRate: null as number | null,
          reasons: {} as Record<string, number>,
        };
        try {
          const sql = await getSql();
          const rows = await sql<{ status: string; n: number }>`
            select status, count(*)::int as n
            from telemetry
            where created_at >= CURRENT_TIMESTAMP - (${hours} * interval '1 hour')
            group by status
          `;
          for (const r of rows) {
            if (r.status === "APPROVED") empty.approved = Number(r.n) || 0;
            if (r.status === "REJECTED") empty.rejected = Number(r.n) || 0;
          }
          empty.total = empty.approved + empty.rejected;
          empty.rejectRate =
            empty.total > 0
              ? Math.round((empty.rejected / empty.total) * 1000) / 10
              : null;

          const reasons = await sql<{ rejection_reason: string | null; n: number }>`
            select rejection_reason, count(*)::int as n
            from telemetry
            where created_at >= CURRENT_TIMESTAMP - (${hours} * interval '1 hour')
              and status = 'REJECTED'
            group by rejection_reason
          `;
          for (const r of reasons) {
            const key = r.rejection_reason?.trim() || "unspecified";
            empty.reasons[key] = Number(r.n) || 0;
          }
          return Response.json(empty);
        } catch (e) {
          console.warn("[telemetry-stats]", e);
          return Response.json({ ...empty, ok: true, degraded: true });
        }
      },
    },
  },
});
