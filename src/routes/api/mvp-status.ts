import { createFileRoute } from "@tanstack/react-router";
import { getProductionEnvChecklist } from "@/lib/env/production";
import { secretFingerprint } from "@/lib/security/mask-secret";
import { resolveAuthProvider, supabaseConfiguredServer } from "@/lib/auth/mode";
import { isStripeConfigured } from "@/lib/stripe/config";

/**
 * GET /api/mvp-status — Option B Speed Studio readiness.
 * Booleans + fingerprints only. No DB client import (PGLite unsafe on edge).
 *
 * mvpReady  = demo spine live (Mistral + studio chrome); open demo may use AUTH_PROVIDER=none
 * sellReady = paid path (DB + Stripe) — OFF until STRIPE_ENABLED=true (P4)
 */
export const Route = createFileRoute("/api/mvp-status")({
  server: {
    handlers: {
      GET: async () => {
        try {
          const checklist = getProductionEnvChecklist();
          const mistral = Boolean(process.env.MISTRAL_API_KEY?.trim());
          const demo = checklist.demoPipeline;
          const auth = resolveAuthProvider("server");
          const supabaseOk =
            auth === "supabase" && supabaseConfiguredServer();
          const betterOk = auth === "better-auth";
          // Open demo (Option B): AUTH_PROVIDER=none is intentional and valid.
          const authOk = supabaseOk || betterOk || auth === "none";
          const dbOk = Boolean(process.env.DATABASE_URL?.trim());
          const stripeOk = isStripeConfigured();
          const supabaseServiceRole = Boolean(
            process.env.SUPABASE_SERVICE_ROLE_KEY?.trim(),
          );

          const gates = {
            mistralLive: mistral && !demo,
            authConfigured: authOk && auth !== "none",
            authOpenDemo: auth === "none",
            authProvider: auth,
            databaseUrl: dbOk,
            dbBackend: dbOk ? "postgres" : "pglite",
            supabaseServiceRole,
            stripeCheckout: stripeOk,
            coopCoepHeaders: true,
            studioChrome: true,
            preflightHitL: true,
            liveRuntime: true,
            freeQuota: true,
          };

          // Option B product spine: live AI + UI. Auth login is optional for open demo.
          const optionBReady =
            gates.mistralLive &&
            gates.studioChrome &&
            gates.preflightHitL &&
            gates.liveRuntime &&
            gates.databaseUrl &&
            authOk;

          const mvpReady = optionBReady;

          // Paid sell path only after Stripe explicitly enabled (P4)
          const sellReady =
            mvpReady && gates.databaseUrl && gates.stripeCheckout;

          const missingForMvp = [
            !gates.mistralLive && "MISTRAL_API_KEY + DEMO_PIPELINE=false",
            !gates.databaseUrl && "DATABASE_URL (pooler)",
            !authOk && "AUTH_PROVIDER=none | supabase | better-auth",
          ].filter(Boolean);

          const missingForSell = [
            !gates.stripeCheckout &&
              "STRIPE_ENABLED=true + STRIPE_SECRET_KEY + STRIPE_PRICE_PRO — P4 hold",
          ].filter(Boolean);

          const nextManual = [
            !gates.databaseUrl &&
              "Set DATABASE_URL (Supabase pooler) on Vercel",
            !gates.mistralLive && "Set MISTRAL_API_KEY, DEMO_PIPELINE=false",
            !gates.stripeCheckout &&
              "Stripe OFF (P4). Super-admin has unlimited studio access without billing.",
          ].filter(Boolean);

          const site =
            process.env.SITE_URL?.trim() ||
            "https://canvas.h4ck3d.me";

          return Response.json({
            ok: mvpReady,
            mvpReady,
            optionBReady,
            sellReady,
            fullReady: checklist.ready && sellReady,
            service: "cozy-ai-studio",
            product: "option-b-speed-studio",
            productionUrl: site,
            gates,
            prompts: {
              spine: ["brief", "preview", "share"],
              freeCaps: { daily: 20, monthly: 100 },
              docs: [
                "/docs/SOURCE_OF_TRUTH.md",
                "/docs/MVP_PROMPTS.md",
              ],
            },
            missingForMvp,
            missingForSell,
            fingerprints: {
              mistral: mistral
                ? secretFingerprint(process.env.MISTRAL_API_KEY).fingerprint
                : null,
            },
            nextManual:
              nextManual.length > 0
                ? nextManual
                : ["Option B spine live — Stripe off · Super Admin unlimited"],
          });
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          return Response.json(
            { ok: false, error: "mvp-status-failed", detail: msg },
            { status: 500 },
          );
        }
      },
    },
  },
});
