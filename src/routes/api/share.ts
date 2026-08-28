import { createFileRoute } from "@tanstack/react-router";
import { requireUserIdFromRequest } from "@/lib/auth/request-user.server";
import { UnauthorizedError } from "@/lib/auth/verify.server";
import {
  createSharedPreview,
  getSharedPreview,
} from "@/lib/share/server";
import { recordActivationEvent } from "@/lib/activation/server";

/**
 * POST /api/share — create public preview link
 * GET  /api/share?id=a_… — JSON meta + html (for clients)
 */
export const Route = createFileRoute("/api/share")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const id = url.searchParams.get("id")?.trim() ?? "";
        if (!id) {
          return Response.json(
            { error: "MISSING_ID", message: "id query required" },
            { status: 400 },
          );
        }
        try {
          const row = await getSharedPreview(id);
          if (!row) {
            return Response.json(
              { error: "NOT_FOUND", message: "Share not found or expired" },
              { status: 404 },
            );
          }
          return Response.json({
            ok: true,
            id: row.id,
            title: row.title,
            path: `/a/${row.id}`,
            html: row.html,
            promptPreview: row.prompt_preview,
            sourceCode: row.source_code,
            sourceLanguage: row.source_language,
            sourcePath: row.source_path,
            createdAt: row.created_at,
          });
        } catch (e) {
          console.error("[api/share] GET", e);
          return Response.json(
            { error: "SHARE_UNAVAILABLE", message: "Could not load share" },
            { status: 503 },
          );
        }
      },

      POST: async ({ request }) => {
        let userId: string;
        try {
          userId = await requireUserIdFromRequest(request);
        } catch (e) {
          if (
            e instanceof UnauthorizedError ||
            (e as Error)?.name === "UnauthorizedError"
          ) {
            return Response.json(
              { error: "UNAUTHORIZED", message: "Sign in required" },
              { status: 401 },
            );
          }
          throw e;
        }

        let body: {
          html?: string;
          title?: string;
          projectId?: string;
          promptPreview?: string;
          sourceCode?: string | Record<string, string>;
          sourceLanguage?: string;
          sourcePath?: string;
          meta?: Record<string, unknown>;
        };
        try {
          body = (await request.json()) as typeof body;
        } catch {
          return Response.json(
            { error: "INVALID_JSON", message: "JSON body required" },
            { status: 400 },
          );
        }

        try {
          const created = await createSharedPreview({
            userId,
            html: body.html ?? "",
            title: body.title,
            projectId: body.projectId ?? null,
            promptPreview: body.promptPreview ?? null,
            sourceCode: body.sourceCode ?? null,
            sourceLanguage: body.sourceLanguage ?? null,
            sourcePath: body.sourcePath ?? null,
          });
          const origin = new URL(request.url).origin;
          const url = `${origin}${created.path}`;
          await recordActivationEvent({
            userId,
            event: "share_created",
            meta: {
              id: created.id,
              title: body.title ?? null,
              ...(body.meta && typeof body.meta === "object" ? body.meta : {}),
            },
          });
          return Response.json({
            ok: true,
            id: created.id,
            path: created.path,
            url,
          });
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          if (msg === "EMPTY_HTML") {
            return Response.json(
              { error: "EMPTY_HTML", message: "html is required" },
              { status: 400 },
            );
          }
          if (msg === "HTML_TOO_LARGE") {
            return Response.json(
              { error: "HTML_TOO_LARGE", message: "Preview too large to share" },
              { status: 413 },
            );
          }
          if (msg === "SHARE_DAILY_LIMIT") {
            return Response.json(
              {
                error: "SHARE_DAILY_LIMIT",
                message: "Daily share limit reached. Try again tomorrow.",
              },
              { status: 429 },
            );
          }
          console.error("[api/share] POST", e);
          return Response.json(
            {
              error: "SHARE_FAILED",
              message: "Could not create share link. Try copy HTML instead.",
            },
            { status: 503 },
          );
        }
      },
    },
  },
});
