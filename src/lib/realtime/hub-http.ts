/**
 * HTTP long-poll adapter for the same hub used by WebSocket.
 * Production (Vercel) has no WS upgrade — clients fall back here.
 * Pair rooms dual-write to Postgres so multi-instance works.
 */

import {
  handleClientMessage,
  registerSocket,
  unregisterSocket,
  type HubSocket,
} from "./hub";
import { pgPollEvents } from "./hub-pg";
import type { ServerToClient } from "./protocol";

type HttpClient = {
  sock: HubSocket;
  queue: ServerToClient[];
  lastPoll: number;
  lastEventId: number;
};

const g = globalThis as typeof globalThis & {
  __caiHttpClients__?: Map<string, HttpClient>;
};

function clients() {
  if (!g.__caiHttpClients__) g.__caiHttpClients__ = new Map();
  return g.__caiHttpClients__;
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json",
      "cache-control": "no-store",
    },
  });
}

async function drainPg(c: HttpClient) {
  const roomId = c.sock.roomId;
  if (!roomId) return;
  const events = await pgPollEvents(roomId, c.lastEventId, c.sock.id);
  const seen = new Set(c.queue.map((m) => JSON.stringify(m)));
  for (const ev of events) {
    c.lastEventId = Math.max(c.lastEventId, ev.id);
    const key = JSON.stringify(ev.payload);
    if (seen.has(key)) continue;
    seen.add(key);
    c.queue.push(ev.payload);
  }
}

/** POST /api/ws/http  body: { op: "open" } | { op: "send", clientId, message } | { op: "close", clientId } */
export async function handleWsHttp(request: Request): Promise<Response> {
  if (request.method === "GET") {
    // long-poll: ?clientId=&waitMs=
    const url = new URL(request.url);
    const clientId = url.searchParams.get("clientId") || "";
    const waitMs = Math.min(
      25_000,
      Math.max(0, Number(url.searchParams.get("waitMs") || 15_000)),
    );
    if (!clientId) return json({ error: "clientId required" }, 400);
    const c = clients().get(clientId);
    // Soft reauth (200) — multi-instance / idle GC; client re-opens without red 404
    if (!c) return json({ reauth: true, messages: [], clientId });
    c.lastPoll = Date.now();

    await drainPg(c);

    const deadline = Date.now() + waitMs;
    while (c.queue.length === 0 && Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, 200));
      await drainPg(c);
    }
    const messages = c.queue.splice(0, c.queue.length);
    return json({ clientId, messages, lastEventId: c.lastEventId });
  }

  if (request.method !== "POST") {
    return json({ error: "method not allowed" }, 405);
  }

  let body: {
    op?: string;
    clientId?: string;
    message?: string | object;
  };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return json({ error: "invalid JSON" }, 400);
  }

  if (body.op === "open") {
    const queue: ServerToClient[] = [];
    const sock = registerSocket((msg) => {
      queue.push(msg);
    });
    clients().set(sock.id, {
      sock,
      queue,
      lastPoll: Date.now(),
      lastEventId: 0,
    });
    const c = clients().get(sock.id)!;
    const initial = c.queue.splice(0, c.queue.length);
    return json({ clientId: sock.id, transport: "http", messages: initial });
  }

  if (body.op === "close") {
    const id = body.clientId || "";
    const c = clients().get(id);
    if (c) {
      unregisterSocket(c.sock.id);
      clients().delete(id);
    }
    return json({ ok: true });
  }

  if (body.op === "send") {
    const id = body.clientId || "";
    const c = clients().get(id);
    if (!c) return json({ reauth: true, messages: [], clientId: id });
    c.lastPoll = Date.now();
    const raw =
      typeof body.message === "string"
        ? body.message
        : JSON.stringify(body.message ?? {});
    await handleClientMessage(c.sock, raw);
    await drainPg(c);
    // return any immediately queued replies
    const messages = c.queue.splice(0, c.queue.length);
    return json({ ok: true, messages, lastEventId: c.lastEventId });
  }

  return json({ error: "unknown op" }, 400);
}

/** GC idle HTTP clients (no poll for 2 min) */
export function gcHttpClients() {
  const now = Date.now();
  for (const [id, c] of clients()) {
    if (now - c.lastPoll > 120_000) {
      unregisterSocket(c.sock.id);
      clients().delete(id);
    }
  }
}
