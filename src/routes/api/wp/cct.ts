import { createFileRoute } from "@tanstack/react-router";
import {
  applySectionPatches,
  getCctInventory,
  testWpConnection,
} from "@/lib/wordpress/cct.server";
import { getWpCctEnv } from "@/lib/wordpress/env";
import type { SectionPatch } from "@/lib/wordpress/types";

/**
 * GET  /api/wp/cct — inventory or ?action=test
 * POST /api/wp/cct — { accept: true, patches: SectionPatch[] }
 */
export const Route = createFileRoute("/api/wp/cct")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const action = url.searchParams.get("action") ?? "inventory";
        try {
          if (action === "test") {
            const result = await testWpConnection();
            return Response.json(result, { status: result.ok ? 200 : 502 });
          }
          if (action === "env") {
            const env = getWpCctEnv();
            return Response.json({
              ok: true,
              baseUrl: env.baseUrl,
              username: env.username,
              mirror: env.mirror,
              hasAppPassword: Boolean(env.appPassword) && env.appPassword !== "local-cct-mirror",
            });
          }
          const inventory = await getCctInventory();
          return Response.json(inventory);
        } catch (e) {
          console.error("[api/wp/cct] GET", e);
          return Response.json(
            {
              ok: false,
              error: "CCT_UNAVAILABLE",
              message: e instanceof Error ? e.message : "failed",
            },
            { status: 503 },
          );
        }
      },

      POST: async ({ request }) => {
        let body: {
          accept?: boolean;
          patches?: SectionPatch[];
        };
        try {
          body = (await request.json()) as typeof body;
        } catch {
          return Response.json(
            { ok: false, error: "BAD_JSON", message: "Invalid JSON body" },
            { status: 400 },
          );
        }

        if (body.accept !== true) {
          return Response.json(
            {
              ok: false,
              error: "ACCEPT_REQUIRED",
              message: "Write blocked: accept:true required (HitL)",
            },
            { status: 403 },
          );
        }

        try {
          const result = await applySectionPatches(body.patches ?? [], true);
          return Response.json(result, { status: result.ok ? 200 : 400 });
        } catch (e) {
          console.error("[api/wp/cct] POST", e);
          return Response.json(
            {
              ok: false,
              error: "WRITE_FAILED",
              message: e instanceof Error ? e.message : "failed",
            },
            { status: 500 },
          );
        }
      },
    },
  },
});
