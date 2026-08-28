import { createFileRoute } from "@tanstack/react-router";
import { secretFingerprint } from "@/lib/security/mask-secret";

/**
 * GET /api/ai-status — Mistral readiness (no raw secrets).
 * Expected prod: { ok:true, provider:"mistral", mistralKeyPresent:true, demoPipeline:false }
 */
export const Route = createFileRoute("/api/ai-status")({
  server: {
    handlers: {
      GET: async () => {
        const key = process.env.MISTRAL_API_KEY?.trim() || "";
        const demoPipeline =
          process.env.DEMO_PIPELINE === "true" ||
          process.env.VITE_DEMO_PIPELINE === "true";
        const mistralKeyPresent = key.length > 0;
        const fp = secretFingerprint(key || undefined);
        const ok = mistralKeyPresent && !demoPipeline;

        return Response.json({
          ok,
          provider: mistralKeyPresent && !demoPipeline ? "mistral" : "demo",
          mistralKeyPresent,
          demoPipeline,
          fingerprint: mistralKeyPresent ? fp.fingerprint : null,
          buildMarker: "mistral-agent-g2-1",
          shellRev: "studio-canvas-1",
          vercel: {
            set: "MISTRAL_API_KEY",
            also: "DEMO_PIPELINE=false",
            where: "Vercel → Project → Settings → Environment Variables → Production",
          },
          checklist: [
            {
              id: "mistral_key",
              label: "MISTRAL_API_KEY set",
              pass: mistralKeyPresent,
              fix: "https://console.mistral.ai → API keys → paste into Vercel",
            },
            {
              id: "demo_off",
              label: "DEMO_PIPELINE=false",
              pass: !demoPipeline,
              fix: "Set DEMO_PIPELINE=false (and VITE_DEMO_PIPELINE unset/false)",
            },
            {
              id: "agents_run",
              label: "POST /api/agents/run uses Mistral",
              pass: ok,
              fix: "Redeploy after env; sign in; run one prompt",
            },
          ],
        });
      },
    },
  },
});
