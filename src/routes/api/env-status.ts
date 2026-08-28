import { createFileRoute } from "@tanstack/react-router";
import { getProductionEnvChecklist } from "@/lib/env/production";
import { secretFingerprint } from "@/lib/security/mask-secret";

/**
 * GET /api/env-status — booleans + masked fingerprints only (no raw secrets).
 */
export const Route = createFileRoute("/api/env-status")({
  server: {
    handlers: {
      GET: async () => {
        const checklist = getProductionEnvChecklist();
        const mistralKey = process.env.MISTRAL_API_KEY?.trim() || "";
        const mistralKeyPresent = mistralKey.length > 0;
        const aiReady = mistralKeyPresent && !checklist.demoPipeline;

        return Response.json({
          ok: checklist.ready,
          service: "cozy-ai-studio",
          authProvider: checklist.authProvider,
          demoPipeline: checklist.demoPipeline,
          ai: {
            ready: aiReady,
            provider: aiReady ? "mistral" : "demo",
            mistralKeyPresent,
            demoPipeline: checklist.demoPipeline,
            fingerprint: mistralKeyPresent
              ? secretFingerprint(mistralKey).fingerprint
              : null,
            detail: aiReady
              ? "Production Mistral path available"
              : !mistralKeyPresent
                ? "Set MISTRAL_API_KEY on Vercel Production"
                : "DEMO_PIPELINE=true forces mock — set false for real AI",
            endpoints: {
              aiStatus: "/api/ai-status",
              agentsRun: "POST /api/agents/run",
            },
          },
          webcontainer: {
            headersConfigured: true,
            note: "WC needs top-level tab + COOP/COEP; nested Grok iframe → srcDoc fallback",
            runtimeStatus: "/api/runtime-status",
            productionUrl: "https://canvas.h4ck3d.me/studio",
          },
          checks: checklist.checks,
          missingRequired: checklist.missingRequired,
          tip: "Mistral: MISTRAL_API_KEY + DEMO_PIPELINE=false · WC: open production top-level · secrets only in Vercel",
        });
      },
    },
  },
});
