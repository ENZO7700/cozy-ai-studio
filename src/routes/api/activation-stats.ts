import { createFileRoute } from "@tanstack/react-router";
import {
  getActivationStats,
  recordActivationEvent,
  type ActivationEventName,
} from "@/lib/activation/server";
import { requireUserIdFromRequest } from "@/lib/auth/request-user.server";

/**
 * GET  /api/activation-stats?hours=24 — funnel counts (no PII)
 * POST /api/activation-stats — record event { event, meta? }
 */
export const Route = createFileRoute("/api/activation-stats")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const hours = Number(url.searchParams.get("hours") || "24");
        const stats = await getActivationStats(hours);
        return Response.json({
          ok: true,
          product: "option-b-speed-studio",
          ...stats,
        });
      },

      POST: async ({ request }) => {
        let userId: string | null = null;
        try {
          userId = await requireUserIdFromRequest(request);
        } catch {
          userId = null;
        }
        let body: { event?: string; meta?: Record<string, unknown> };
        try {
          body = (await request.json()) as typeof body;
        } catch {
          return Response.json({ error: "INVALID_JSON" }, { status: 400 });
        }
        const event = body.event?.trim() || "";
        if (!event) {
          return Response.json({ error: "MISSING_EVENT" }, { status: 400 });
        }
        await recordActivationEvent({
          userId,
          event: event as ActivationEventName,
          meta: body.meta ?? null,
        });
        return Response.json({ ok: true });
      },
    },
  },
});
