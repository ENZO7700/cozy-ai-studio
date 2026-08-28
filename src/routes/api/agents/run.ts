import { createFileRoute } from "@tanstack/react-router";
import {
  getMistralApiKey,
  isDemoPipelineEnv,
} from "@/lib/ai/mistral.server";
import { runProductionPipeline } from "@/lib/ai/production-run.server";
import { encodeSse } from "@/lib/ai/sse-protocol";
import {
  getUserIdFromRequest,
  requireUserIdFromRequest,
} from "@/lib/auth/request-user.server";
import { UnauthorizedError } from "@/lib/auth/verify.server";
import { authEnabledResolved } from "@/lib/auth/mode";
import { ensureDefaultProject } from "@/lib/projects/server";
import {
  assertCanRunPrompt,
  chargePromptUsage,
  FREE_PRODUCT_CAPS,
  getQuotaSnapshot,
  quotaHeaders,
} from "@/lib/gateway/quota-gateway.server";
import { getDailyPromptCount, getMonthlyUsage } from "@/lib/projects/server";
import { recordActivationEvent } from "@/lib/activation/server";
import { collectUnknownFromRaw } from "@/lib/ai/sk-brief-postprocess";
import { logUnknownGlossaryTokens } from "@/lib/ai/glossary-learn.server";

/**
 * CHARGE_CONTRACT (via @/lib/gateway/quota-gateway.server):
 * done → chargePromptUsage (+1) · error/abort/429/fail-before-done → 0
 */

export const Route = createFileRoute("/api/agents/run")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const key = Boolean(getMistralApiKey());
        const demo = isDemoPipelineEnv();
        const authOn = authEnabledResolved("server");
        let userId: string | null = null;
        try {
          userId = await getUserIdFromRequest(request);
        } catch {
          userId = null;
        }
        let snapshot: Awaited<ReturnType<typeof getQuotaSnapshot>> | null =
          null;
        if (userId) {
          try {
            snapshot = await getQuotaSnapshot(userId);
          } catch {
            snapshot = null;
          }
        }
        return Response.json({
          ok: true,
          provider: key && !demo ? "mistral" : "demo",
          mistralKeyPresent: key,
          demoPipeline: demo,
          buildMarker: "mistral-agent-g2-1",
          authRequired: authOn,
          authenticated: Boolean(userId),
          userId: userId ? `${userId.slice(0, 8)}…` : null,
          freeProductCaps: {
            daily: FREE_PRODUCT_CAPS.daily,
            monthly: FREE_PRODUCT_CAPS.monthly,
          },
          quota: snapshot
            ? {
                planTier: snapshot.planTier,
                promptsUsed: snapshot.promptsUsed,
                promptLimit: snapshot.promptLimit,
                dailyUsed: snapshot.dailyUsed,
                dailyLimit: snapshot.dailyLimit,
                withinQuota: snapshot.ok,
                superAdmin: Boolean(snapshot.superAdmin),
                freeDailyLimit: FREE_PRODUCT_CAPS.daily,
                freePromptLimit: FREE_PRODUCT_CAPS.monthly,
              }
            : null,
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
              {
                error: "UNAUTHORIZED",
                message: "Sign in required to run agents",
                login: "/login?redirect=/studio",
              },
              { status: 401 },
            );
          }
          throw e;
        }

        let body: {
          prompt?: string;
          originalCode?: string;
          activeFile?: string;
          projectId?: string;
          files?: Record<
            string,
            { path: string; language: string; content: string }
          >;
        };
        try {
          body = (await request.json()) as typeof body;
        } catch {
          return Response.json(
            { error: "INVALID_JSON", message: "Request body must be JSON" },
            { status: 400 },
          );
        }

        const prompt = body.prompt?.trim() ?? "";
        if (!prompt) {
          return Response.json(
            { error: "EMPTY_PROMPT", message: "prompt is required" },
            { status: 400 },
          );
        }

        void (async () => {
          try {
            const { lang, tokens } = collectUnknownFromRaw(prompt);
            if (tokens.length) {
              await logUnknownGlossaryTokens(
                tokens.map((token) => ({
                  token,
                  lang,
                  context: prompt.slice(0, 160),
                  source: "agents-run-prompt",
                })),
              );
            }
          } catch {
            /* ignore */
          }
        })();

        if (isDemoPipelineEnv()) {
          return Response.json(
            {
              error: "DEMO_PIPELINE",
              message:
                "Server is in DEMO_PIPELINE mode — use client mock orchestrator.",
            },
            { status: 409 },
          );
        }

        if (!getMistralApiKey()) {
          return Response.json(
            {
              error: "MISSING_API_KEY",
              message: "MISTRAL_API_KEY is not configured",
              hint: "Set MISTRAL_API_KEY or DEMO_PIPELINE=true for offline mock",
            },
            { status: 503 },
          );
        }

        let gate: Awaited<ReturnType<typeof assertCanRunPrompt>>;
        try {
          gate = await assertCanRunPrompt(userId);
        } catch (e) {
          console.error("[agents/run] quota check failed", e);
          return Response.json(
            {
              error: "QUOTA_UNAVAILABLE",
              message: "Could not verify prompt quota. Try again shortly.",
              freeProductCaps: {
                daily: FREE_PRODUCT_CAPS.daily,
                monthly: FREE_PRODUCT_CAPS.monthly,
              },
            },
            {
              status: 503,
              headers: {
                "X-CAI-Free-Product-Daily": String(FREE_PRODUCT_CAPS.daily),
                "X-CAI-Free-Product-Monthly": String(FREE_PRODUCT_CAPS.monthly),
                "X-CAI-Super-Admin": "0",
              },
            },
          );
        }

        if (!gate.ok) {
          return Response.json(gate.body, {
            status: gate.status,
            headers: gate.headers,
          });
        }

        const snapshot = gate.snapshot;
        const gatewayHeaders = quotaHeaders(snapshot);
        const promptLimit = snapshot.promptLimit;

        void recordActivationEvent({
          userId,
          event: "brief_sent",
          meta: { len: prompt.length },
        });

        let projectId = body.projectId ?? null;
        try {
          const project = await ensureDefaultProject(userId);
          projectId = projectId || project.id;
        } catch (e) {
          console.error("[agents/run] project ensure failed", e);
        }

        const abort = new AbortController();
        const onRequestAbort = () => {
          abort.abort();
        };
        request.signal.addEventListener("abort", onRequestAbort, {
          once: true,
        });

        const stream = new ReadableStream<Uint8Array>({
          async start(controller) {
            const enc = new TextEncoder();
            const send = (chunk: string) => {
              try {
                controller.enqueue(enc.encode(chunk));
              } catch {
                abort.abort();
              }
            };

            try {
              send(
                `: cai-agents-run user=${userId.slice(0, 8)} quota=${snapshot.promptsUsed}/${snapshot.promptLimit} daily=${snapshot.dailyUsed}/${snapshot.dailyLimit ?? "∞"} remaining=${Math.max(0, snapshot.promptLimit - snapshot.promptsUsed)}\n\n`,
              );

              let provider: string | undefined = "mistral";
              let model: string | undefined;
              /** CHARGE_CONTRACT: true only after SSE "done". */
              let completed = false;

              for await (const ev of runProductionPipeline({
                prompt,
                originalCode: body.originalCode ?? "",
                activeFile: body.activeFile,
                files: body.files,
                signal: abort.signal,
              })) {
                if (abort.signal.aborted || request.signal.aborted) {
                  abort.abort();
                  break;
                }
                if (ev.type === "done") {
                  completed = true;
                  provider = ev.data.provider;
                  model = ev.data.model;
                }
                send(encodeSse(ev.type, ev.data as never));
              }

              // CHARGE_CONTRACT: only done + client still connected
              if (
                completed &&
                !abort.signal.aborted &&
                !request.signal.aborted
              ) {
                try {
                  await recordActivationEvent({
                    userId,
                    event: "pipeline_done",
                    meta: { provider: "mistral" },
                  });
                  await chargePromptUsage({
                    userId,
                    projectId,
                    prompt,
                    provider,
                    model,
                  });

                  try {
                    const monthly = await getMonthlyUsage(userId);
                    const daily = await getDailyPromptCount(userId);
                    const used = monthly.promptsUsed;
                    const remaining = Math.max(0, promptLimit - used);
                    send(
                      `: cai-quota-after used=${used} remaining=${remaining} daily=${daily}\n\n`,
                    );
                  } catch {
                    /* best-effort */
                  }
                } catch (e) {
                  console.error("[agents/run] usage record failed", e);
                }
              }
            } catch (e) {
              if (!abort.signal.aborted) {
                const msg = e instanceof Error ? e.message : String(e);
                send(
                  encodeSse("error", {
                    code: "UNKNOWN",
                    agent: "ORCHESTRATOR",
                    userMessage: "Pipeline stream failed.",
                    detail: msg,
                    retryable: true,
                    recoverable: true,
                  }),
                );
              }
            } finally {
              request.signal.removeEventListener("abort", onRequestAbort);
              try {
                controller.close();
              } catch {
                /* already closed */
              }
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
            ...gatewayHeaders,
          },
        });
      },
    },
  },
});
