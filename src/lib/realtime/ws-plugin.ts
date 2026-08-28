/**
 * Vite plugin: WebSocket upgrade handler for /api/ws
 */

import type { Plugin } from "vite";

export function realtimeWsPlugin(): Plugin {
  return {
    name: "app-builder:realtime-ws",
    apply: "serve",
    configureServer(server) {
      let wss: import("ws").WebSocketServer | null = null;

      const ensureWss = async () => {
        if (wss) return wss;
        const { WebSocketServer } = await import("ws");
        const hub = await import("./hub");
        wss = new WebSocketServer({ noServer: true });
        wss.on("connection", (socket) => {
          const send = (msg: object) => {
            if (socket.readyState === socket.OPEN) {
              socket.send(JSON.stringify(msg));
            }
          };
          const client = hub.registerSocket(send, () => {
            try {
              socket.close();
            } catch {
              /* ignore */
            }
          });
          socket.on("message", (data) => {
            const raw =
              typeof data === "string" ? data : data.toString("utf8");
            void hub.handleClientMessage(client, raw);
          });
          socket.on("close", () => {
            hub.unregisterSocket(client.id);
          });
          socket.on("error", () => {
            hub.unregisterSocket(client.id);
          });
        });
        return wss;
      };

      const onUpgrade = (
        req: { url?: string },
        socket: { destroy: () => void },
        head: Buffer,
      ) => {
        const raw = req.url || "";
        const pathOnly = raw.split("?", 1)[0] || "";
        // Exact path only — do not steal /api/ws/http
        if (pathOnly !== "/api/ws") return;
        void (async () => {
          try {
            const serverWss = await ensureWss();
            serverWss.handleUpgrade(
              req as never,
              socket as never,
              head,
              (ws) => {
                serverWss.emit("connection", ws, req);
              },
            );
          } catch (err) {
            console.error("[realtime-ws] upgrade failed", err);
            socket.destroy();
          }
        })();
      };

      const attach = () => {
        const httpServer = server.httpServer;
        if (!httpServer) return false;
        httpServer.on("upgrade", onUpgrade as never);
        return true;
      };

      if (!attach()) {
        setTimeout(() => {
          attach();
        }, 0);
      }
    },
  };
}
