import { createFileRoute } from "@tanstack/react-router";
import {
  requireUserIdFromRequest,
} from "@/lib/auth/request-user.server";
import { UnauthorizedError } from "@/lib/auth/verify.server";
import { getAppOrigin } from "@/lib/stripe/config";
import {
  isVercelDeployConfigured,
  runLaunchJob,
} from "@/lib/production/launch-run.server";
import { encodeLaunchSse } from "@/lib/production/launch-protocol";
import { auth } from "@/lib/auth/server";

export const Route = createFileRoute("/api/launch/run")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        let userId: string | null = null;
        try {
          userId = await requireUserIdFromRequest(request);
        } catch {
          userId = null;
        }
        const vercelReady = isVercelDeployConfigured();
        const stripe = Boolean(process.env.STRIPE_SECRET_KEY?.trim());
        return Response.json({
          ok: true,
          endpoint: "POST /api/launch/run",
          sse: true,
          authenticated: Boolean(userId),
          vercelHook: Boolean(process.env.VERCEL_DEPLOY_HOOK_URL?.trim()),
          vercelToken: Boolean(process.env.VERCEL_TOKEN?.trim()),
          vercelReady,
          stripe,
          modes: {
            redeploy: vercelReady,
            full: vercelReady && stripe,
          },
        });
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
          projectName?: string;
          preferredPlan?: "PRO" | "ENTERPRISE";
          mode?: "full" | "redeploy";
        };
        try {
          body = (await request.json()) as typeof body;
        } catch {
          return Response.json(
            { error: "INVALID_JSON" },
            { status: 400 },
          );
        }

        const projectName = (body.projectName ?? "cai-app").trim() || "cai-app";
        const preferredPlan =
          body.preferredPlan === "ENTERPRISE" ? "ENTERPRISE" : "PRO";
        const mode = body.mode === "redeploy" ? "redeploy" : "full";
        if (mode === "redeploy" && !isVercelDeployConfigured()) {
          return Response.json(
            {
              error: "VERCEL_NOT_CONFIGURED",
              message:
                "Set VERCEL_DEPLOY_HOOK_URL or VERCEL_TOKEN+VERCEL_PROJECT_ID. Free publish: Share → /a/:id.",
            },
            { status: 503 },
          );
        }

        // Resolve email from session
        let email: string | null = null;
        try {
          const headers = request.headers;
          const session = await auth.api.getSession({ headers });
          email = session?.user?.email ?? null;
        } catch {
          email = null;
        }

        const origin = getAppOrigin(request);
        const abort = new AbortController();
        request.signal.addEventListener(
          "abort",
          () => abort.abort(),
          { once: true },
        );

        const stream = new ReadableStream<Uint8Array>({
          async start(controller) {
            const enc = new TextEncoder();
            const send = (chunk: string) => {
              controller.enqueue(enc.encode(chunk));
            };

            try {
              send(`: cai-launch-job\n\n`);
              await runLaunchJob(
                {
                  userId,
                  email,
                  projectName,
                  preferredPlan,
                  origin,
                  mode,
                  signal: abort.signal,
                },
                {
                  emit: (type, data) => {
                    send(encodeLaunchSse(type, data as never));
                  },
                },
              );
            } catch (e) {
              if (
                !(e instanceof DOMException && e.name === "AbortError")
              ) {
                const msg = e instanceof Error ? e.message : String(e);
                send(
                  encodeLaunchSse("error", {
                    message: msg,
                    retryable: !msg.includes("Stripe Checkout"),
                  }),
                );
              }
            } finally {
              controller.close();
            }
          },
          cancel() {
            abort.abort();
          },
        });

        return new Response(stream, {
          headers: {
            "Content-Type": "text/event-stream; charset=utf-8",
            "Cache-Control": "no-cache, no-transform",
            Connection: "keep-alive",
            "X-Accel-Buffering": "no",
          },
        });
      },
    },
  },
});
