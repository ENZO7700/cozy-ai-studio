import { createFileRoute } from "@tanstack/react-router";
import { gcHttpClients, handleWsHttp } from "@/lib/realtime/hub-http";

const handle = async ({ request }: { request: Request }) => {
  gcHttpClients();
  return handleWsHttp(request);
};

/**
 * Production-safe transport for mobile pair rooms.
 * Same hub as WebSocket /api/ws (dev). Use when WS upgrade is unavailable.
 */
export const Route = createFileRoute("/api/ws/http")({
  server: {
    handlers: {
      GET: handle,
      POST: handle,
    },
  },
});
