import { createFileRoute } from "@tanstack/react-router";

/**
 * GET /api/runtime-status — WebContainer / isolation checklist (server config side).
 * Client must still report crossOriginIsolated in the browser (top-level tab).
 */
export const Route = createFileRoute("/api/runtime-status")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const coep = "require-corp";
        const coop = "same-origin";
        return Response.json({
          ok: true,
          service: "cozy-ai-studio",
          webcontainer: {
            requiredHeaders: {
              "Cross-Origin-Embedder-Policy": coep,
              "Cross-Origin-Opener-Policy": coop,
            },
            clientChecks: [
              "window.crossOriginIsolated === true",
              "typeof SharedArrayBuffer === 'function'",
              "NOT inside a cross-origin iframe (Grok sandbox preview often fails this)",
            ],
            productionDomain: "https://canvas.h4ck3d.me",
            howToVerify: [
              "Open https://canvas.h4ck3d.me/studio in a top-level tab (not embedded)",
              "DevTools → Console: crossOriginIsolated",
              "DevTools → Network → document → Response Headers: COOP + COEP",
              "Live Preview badge should say WebContainer (not srcDoc)",
            ],
            sources: {
              vercelJson: "vercel.json headers /*",
              publicHeaders: "public/_headers",
              viteDev: "vite.config.ts server.headers + plugin",
            },
            requestHost: request.headers.get("host"),
          },
          mistral: {
            endpoint: "/api/ai-status",
            agents: "POST /api/agents/run",
          },
        });
      },
    },
  },
});
