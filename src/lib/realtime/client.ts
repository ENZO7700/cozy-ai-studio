/**
 * Browser realtime client — WebSocket first (local dev), HTTP long-poll on prod.
 */

import type {
  ClientToServer,
  DiffPendingPayload,
  RealtimeRole,
  ServerToClient,
} from "./protocol";
import { parseRealtimeMessage } from "./protocol";

export type RealtimeStatus =
  | "idle"
  | "connecting"
  | "open"
  | "paired"
  | "closed"
  | "error";

export type RealtimeTransport = "ws" | "http";

export type RealtimeClientHandlers = {
  onStatus?: (s: RealtimeStatus) => void;
  onPairCode?: (
    code: string,
    meta: { roomId: string; projectId: string; expiresAt: number },
  ) => void;
  onPaired?: (info: {
    roomId: string;
    projectId: string;
    role: RealtimeRole;
    peers: number;
  }) => void;
  onPeer?: (kind: "joined" | "left", role: RealtimeRole, peers: number) => void;
  onDiffPending?: (payload: DiffPendingPayload) => void;
  onDiffAccept?: (approvalId: string, from: RealtimeRole) => void;
  onDiffReject?: (
    approvalId: string,
    from: RealtimeRole,
    reason?: string,
  ) => void;
  onError?: (message: string) => void;
  onTransport?: (t: RealtimeTransport) => void;
};

/** Vercel / HTTPS hosts have no durable WS upgrade — skip straight to HTTP. */
function preferHttpTransport(): boolean {
  if (typeof window === "undefined") return false;
  const host = window.location.hostname;
  if (host === "localhost" || host === "127.0.0.1") return false;
  // sandbox / vercel / any https deploy without native WS plugin
  if (window.location.protocol === "https:") return true;
  if (host.endsWith(".vercel.app")) return true;
  if (host.includes("grok-sandbox") || host.includes("hades-www")) return true;
  return Boolean(import.meta.env.PROD);
}

function wsUrl(): string {
  if (typeof window === "undefined") return "ws://127.0.0.1:8080/api/ws";
  const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
  return `${proto}//${window.location.host}/api/ws`;
}

export class RealtimeClient {
  private ws: WebSocket | null = null;
  private handlers: RealtimeClientHandlers;
  private clientId = "";
  private status: RealtimeStatus = "idle";
  private transport: RealtimeTransport = "ws";
  private pingTimer: ReturnType<typeof setInterval> | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private pollAbort: AbortController | null = null;
  private intentionalClose = false;
  private lastHello: ClientToServer | null = null;
  private wsFailed = false;

  constructor(handlers: RealtimeClientHandlers = {}) {
    this.handlers = handlers;
    if (preferHttpTransport()) {
      this.wsFailed = true;
    }
  }

  getStatus() {
    return this.status;
  }

  getTransport() {
    return this.transport;
  }

  private setStatus(s: RealtimeStatus) {
    this.status = s;
    this.handlers.onStatus?.(s);
  }

  private setTransport(t: RealtimeTransport) {
    this.transport = t;
    this.handlers.onTransport?.(t);
  }

  connect() {
    this.intentionalClose = false;
    if (this.wsFailed || preferHttpTransport()) {
      void this.connectHttp();
      return;
    }
    if (
      this.ws &&
      (this.ws.readyState === WebSocket.OPEN ||
        this.ws.readyState === WebSocket.CONNECTING)
    ) {
      return;
    }
    this.setStatus("connecting");
    this.setTransport("ws");
    let settled = false;
    const failToHttp = () => {
      if (settled || this.intentionalClose) return;
      settled = true;
      this.wsFailed = true;
      try {
        this.ws?.close();
      } catch {
        /* ignore */
      }
      this.ws = null;
      void this.connectHttp();
    };

    try {
      const ws = new WebSocket(wsUrl());
      this.ws = ws;
      const openTimeout = setTimeout(failToHttp, 2500);

      ws.onopen = () => {
        clearTimeout(openTimeout);
        settled = true;
        this.setStatus("open");
        this.pingTimer = setInterval(() => this.send({ type: "ping" }), 25_000);
        if (this.lastHello) this.send(this.lastHello);
      };

      ws.onmessage = (ev) => {
        const msg = parseRealtimeMessage(String(ev.data));
        if (!msg) return;
        this.dispatch(msg as ServerToClient);
      };

      // Quiet fail — HTTP fallback is the real transport on many hosts
      ws.onerror = () => {
        clearTimeout(openTimeout);
        failToHttp();
      };

      ws.onclose = () => {
        clearTimeout(openTimeout);
        if (this.pingTimer) clearInterval(this.pingTimer);
        this.pingTimer = null;
        if (!settled) {
          failToHttp();
          return;
        }
        this.setStatus("closed");
        if (!this.intentionalClose && !this.wsFailed) {
          this.reconnectTimer = setTimeout(() => this.connect(), 1500);
        }
      };
    } catch {
      failToHttp();
    }
  }

  private async connectHttp() {
    if (this.intentionalClose) return;
    this.setTransport("http");
    this.setStatus("connecting");
    try {
      const res = await fetch("/api/ws/http", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ op: "open" }),
      });
      if (!res.ok) throw new Error(`http open ${res.status}`);
      const data = (await res.json()) as {
        clientId: string;
        messages?: ServerToClient[];
        reauth?: boolean;
      };
      this.clientId = data.clientId;
      this.setStatus("open");
      for (const m of data.messages ?? []) this.dispatch(m);
      if (this.lastHello) this.send(this.lastHello);
      this.pollAbort?.abort();
      this.pollAbort = new AbortController();
      void this.pollLoop(this.pollAbort.signal);
    } catch (e) {
      this.setStatus("error");
      this.handlers.onError?.(
        e instanceof Error ? e.message : "HTTP realtime failed",
      );
      if (!this.intentionalClose) {
        this.reconnectTimer = setTimeout(() => void this.connectHttp(), 2000);
      }
    }
  }

  private async pollLoop(signal: AbortSignal) {
    while (!signal.aborted && this.transport === "http" && this.clientId) {
      try {
        const res = await fetch(
          `/api/ws/http?clientId=${encodeURIComponent(this.clientId)}&waitMs=15000`,
          { signal },
        );
        if (!res.ok) {
          // Soft reauth path uses 200 + reauth; hard errors re-open
          if (res.status === 404 || res.status === 410 || res.status === 409) {
            await this.connectHttp();
            return;
          }
          await new Promise((r) => setTimeout(r, 800));
          continue;
        }
        const data = (await res.json()) as {
          messages?: ServerToClient[];
          reauth?: boolean;
        };
        if (data.reauth) {
          await this.connectHttp();
          return;
        }
        for (const m of data.messages ?? []) this.dispatch(m);
      } catch {
        if (signal.aborted) return;
        await new Promise((r) => setTimeout(r, 1000));
      }
    }
  }

  private dispatch(msg: ServerToClient) {
    switch (msg.type) {
      case "welcome":
        this.clientId = msg.clientId;
        break;
      case "pair_code":
        this.handlers.onPairCode?.(msg.code, {
          roomId: msg.roomId,
          projectId: msg.projectId,
          expiresAt: msg.expiresAt,
        });
        break;
      case "paired":
        this.setStatus("paired");
        this.handlers.onPaired?.(msg);
        break;
      case "peer_joined":
        this.handlers.onPeer?.("joined", msg.role, msg.peers);
        break;
      case "peer_left":
        this.handlers.onPeer?.("left", msg.role, msg.peers);
        break;
      case "diff.pending":
        this.handlers.onDiffPending?.(msg.payload);
        break;
      case "diff.accept":
        this.handlers.onDiffAccept?.(msg.approvalId, msg.from);
        break;
      case "diff.reject":
        this.handlers.onDiffReject?.(msg.approvalId, msg.from, msg.reason);
        break;
      case "error":
        this.handlers.onError?.(msg.message);
        break;
      case "pong":
        break;
      default:
        break;
    }
  }

  send(msg: ClientToServer) {
    if (this.transport === "http" && this.clientId) {
      void fetch("/api/ws/http", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          op: "send",
          clientId: this.clientId,
          message: msg,
        }),
      })
        .then(async (res) => {
          if (res.status === 404 || res.status === 410) {
            await this.connectHttp();
            // retry once after re-open
            if (this.clientId) {
              void fetch("/api/ws/http", {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({
                  op: "send",
                  clientId: this.clientId,
                  message: msg,
                }),
              }).catch(() => undefined);
            }
            return;
          }
          if (!res.ok) return;
          const data = (await res.json()) as {
            messages?: ServerToClient[];
            reauth?: boolean;
          };
          if (data.reauth) {
            await this.connectHttp();
            return;
          }
          for (const m of data.messages ?? []) this.dispatch(m);
        })
        .catch(() => {
          /* poll will surface */
        });
      return true;
    }
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return false;
    this.ws.send(JSON.stringify(msg));
    return true;
  }

  hostDesktop(projectId: string) {
    this.lastHello = {
      type: "hello",
      role: "desktop",
      clientId: this.clientId || "pending",
      projectId,
    };
    this.connect();
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.send(this.lastHello);
      this.send({ type: "create_pair", projectId, clientId: this.clientId });
    }
  }

  joinMobile(pairCode: string) {
    this.lastHello = {
      type: "hello",
      role: "mobile",
      clientId: this.clientId || "pending",
      pairCode: pairCode.trim().toUpperCase(),
    };
    this.connect();
    if (
      this.ws?.readyState === WebSocket.OPEN ||
      this.transport === "http"
    ) {
      this.send(this.lastHello);
    }
  }

  publishPending(payload: DiffPendingPayload) {
    return this.send({ type: "diff.pending", payload });
  }

  accept(approvalId: string) {
    return this.send({ type: "diff.accept", approvalId });
  }

  reject(approvalId: string, reason?: string) {
    return this.send({ type: "diff.reject", approvalId, reason });
  }

  disconnect() {
    this.intentionalClose = true;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    if (this.pingTimer) clearInterval(this.pingTimer);
    this.pollAbort?.abort();
    if (this.transport === "http" && this.clientId) {
      void fetch("/api/ws/http", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ op: "close", clientId: this.clientId }),
      }).catch(() => undefined);
    }
    try {
      this.ws?.close();
    } catch {
      /* ignore */
    }
    this.ws = null;
    this.setStatus("closed");
  }
}
