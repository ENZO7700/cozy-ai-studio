/**
 * In-memory room hub for project review sessions.
 * Shared via globalThis so Vite HMR doesn't fork state.
 */

import type {
  DiffPendingPayload,
  RealtimeRole,
  ServerToClient,
} from "./protocol";
import {
  pgFindRoomByCode,
  pgFindRoomByProject,
  pgPublishEvent,
  pgSetPendingDiff,
  pgUpsertRoom,
} from "./hub-pg";

export type HubSocket = {
  id: string;
  role: RealtimeRole | null;
  roomId: string | null;
  projectId: string | null;
  send: (msg: ServerToClient) => void;
  close?: () => void;
};

type Room = {
  id: string;
  projectId: string;
  pairCode: string;
  codeExpiresAt: number;
  sockets: Set<string>;
  pendingDiff: DiffPendingPayload | null;
};

type HubState = {
  sockets: Map<string, HubSocket>;
  rooms: Map<string, Room>;
  codeToRoom: Map<string, string>;
};

const g = globalThis as typeof globalThis & { __caiWsHub__?: HubState };

function state(): HubState {
  if (!g.__caiWsHub__) {
    g.__caiWsHub__ = {
      sockets: new Map(),
      rooms: new Map(),
      codeToRoom: new Map(),
    };
  }
  return g.__caiWsHub__;
}

function genCode(): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let out = "";
  for (let i = 0; i < 6; i++) {
    out += alphabet[Math.floor(Math.random() * alphabet.length)];
  }
  return out;
}


function genId() {
  return `c_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

/** Ensure in-memory room exists for a PG room row */
function hydrateRoomFromPg(row: {
  id: string;
  project_id: string;
  pair_code: string;
  code_expires_at: string;
  pending_diff: DiffPendingPayload | null;
}): Room {
  const s = state();
  let room = s.rooms.get(row.id);
  if (!room) {
    room = {
      id: row.id,
      projectId: row.project_id,
      pairCode: row.pair_code,
      codeExpiresAt: Date.parse(row.code_expires_at) || Date.now() + 30 * 60_000,
      sockets: new Set(),
      pendingDiff: row.pending_diff,
    };
    s.rooms.set(room.id, room);
    s.codeToRoom.set(room.pairCode.toUpperCase(), room.id);
  } else {
    room.pairCode = row.pair_code;
    room.codeExpiresAt = Date.parse(row.code_expires_at) || room.codeExpiresAt;
    if (row.pending_diff) room.pendingDiff = row.pending_diff;
    s.codeToRoom.set(room.pairCode.toUpperCase(), room.id);
  }
  return room;
}

export function registerSocket(
  send: (msg: ServerToClient) => void,
  close?: () => void,
): HubSocket {
  const sock: HubSocket = {
    id: genId(),
    role: null,
    roomId: null,
    projectId: null,
    send,
    close,
  };
  state().sockets.set(sock.id, sock);
  sock.send({ type: "welcome", clientId: sock.id, ws: true });
  return sock;
}

export function unregisterSocket(socketId: string) {
  const s = state();
  const sock = s.sockets.get(socketId);
  if (!sock) return;
  leaveRoom(sock);
  s.sockets.delete(socketId);
}

function roomPeerCount(room: Room): number {
  return room.sockets.size;
}

function broadcast(
  room: Room,
  msg: ServerToClient,
  exceptId?: string,
) {
  const s = state();
  for (const id of room.sockets) {
    if (exceptId && id === exceptId) continue;
    s.sockets.get(id)?.send(msg);
  }
  // Durable fan-out for other serverless instances
  void pgPublishEvent(room.id, msg, exceptId);
}

function leaveRoom(sock: HubSocket) {
  if (!sock.roomId) return;
  const s = state();
  const room = s.rooms.get(sock.roomId);
  if (!room) {
    sock.roomId = null;
    return;
  }
  room.sockets.delete(sock.id);
  const role = sock.role ?? "mobile";
  sock.roomId = null;
  if (room.sockets.size === 0) {
    s.codeToRoom.delete(room.pairCode);
    s.rooms.delete(room.id);
  } else {
    broadcast(room, {
      type: "peer_left",
      role,
      peers: roomPeerCount(room),
    });
  }
}

export async function createOrRefreshPair(
  sock: HubSocket,
  projectId: string,
): Promise<{ code: string; roomId: string; projectId: string; expiresAt: number }> {
  leaveRoom(sock);
  const s = state();
  // Reuse room for same project if desktop reconnects
  let room = [...s.rooms.values()].find(
    (r) => r.projectId === projectId && [...r.sockets].some((id) => s.sockets.get(id)?.role === "desktop"),
  );
  if (!room) {
    room = [...s.rooms.values()].find((r) => r.projectId === projectId);
  }
  if (!room) {
    const fromPg = await pgFindRoomByProject(projectId);
    if (fromPg) room = hydrateRoomFromPg(fromPg);
  }
  if (!room) {
    const code = genCode();
    room = {
      id: `room_${projectId.slice(0, 12)}_${Date.now().toString(36)}`,
      projectId,
      pairCode: code,
      codeExpiresAt: Date.now() + 30 * 60_000,
      sockets: new Set(),
      pendingDiff: null,
    };
    s.rooms.set(room.id, room);
    s.codeToRoom.set(code, room.id);
  } else if (room.codeExpiresAt < Date.now()) {
    s.codeToRoom.delete(room.pairCode);
    room.pairCode = genCode();
    room.codeExpiresAt = Date.now() + 30 * 60_000;
    s.codeToRoom.set(room.pairCode, room.id);
  }

  sock.role = "desktop";
  sock.projectId = projectId;
  sock.roomId = room.id;
  room.sockets.add(sock.id);

  await pgUpsertRoom({
    id: room.id,
    projectId: room.projectId,
    pairCode: room.pairCode,
    codeExpiresAt: room.codeExpiresAt,
    pendingDiff: room.pendingDiff,
  });

  return {
    code: room.pairCode,
    roomId: room.id,
    projectId,
    expiresAt: room.codeExpiresAt,
  };
}

export async function joinWithCode(
  sock: HubSocket,
  pairCode: string,
): Promise<{ roomId: string; projectId: string; peers: number } | { error: string }> {
  leaveRoom(sock);
  const code = pairCode.trim().toUpperCase();
  const s = state();
  const roomId = s.codeToRoom.get(code);
  let room = roomId ? s.rooms.get(roomId) : undefined;
  if (!room) {
    const fromPg = await pgFindRoomByCode(code);
    if (fromPg) room = hydrateRoomFromPg(fromPg);
  }
  if (!room) return { error: "Invalid or expired pair code" };
  if (room.codeExpiresAt < Date.now()) {
    s.codeToRoom.delete(code);
    return { error: "Pair code expired — generate a new one on desktop" };
  }

  sock.role = "mobile";
  sock.projectId = room.projectId;
  sock.roomId = room.id;
  room.sockets.add(sock.id);

  broadcast(
    room,
    { type: "peer_joined", role: "mobile", peers: roomPeerCount(room) },
    sock.id,
  );

  // Replay pending diff if any
  if (room.pendingDiff) {
    sock.send({ type: "diff.pending", payload: room.pendingDiff });
  }

  return {
    roomId: room.id,
    projectId: room.projectId,
    peers: roomPeerCount(room),
  };
}

export async function joinAsDesktop(
  sock: HubSocket,
  projectId: string,
): Promise<{ roomId: string; projectId: string; peers: number; code: string; expiresAt: number }> {
  const pair = await createOrRefreshPair(sock, projectId);
  const room = state().rooms.get(pair.roomId)!;
  return {
    roomId: pair.roomId,
    projectId,
    peers: roomPeerCount(room),
    code: pair.code,
    expiresAt: pair.expiresAt,
  };
}

export function publishDiffPending(
  sock: HubSocket,
  payload: DiffPendingPayload,
): { ok: true; peers: number } | { error: string } {
  if (!sock.roomId) return { error: "Not in a room — create a pair first" };
  const room = state().rooms.get(sock.roomId);
  if (!room) return { error: "Room gone" };
  room.pendingDiff = payload;
  void pgSetPendingDiff(room.id, payload);
  broadcast(room, { type: "diff.pending", payload }, sock.id);
  // also echo to sender so multi-desktop works
  sock.send({ type: "diff.pending", payload });
  return { ok: true, peers: roomPeerCount(room) };
}

export function publishDecision(
  sock: HubSocket,
  decision: "accept" | "reject",
  approvalId: string,
  reason?: string,
): { ok: true } | { error: string } {
  if (!sock.roomId) return { error: "Not in a room" };
  const room = state().rooms.get(sock.roomId);
  if (!room) return { error: "Room gone" };
  if (room.pendingDiff?.approvalId === approvalId) {
    room.pendingDiff = null;
    void pgSetPendingDiff(room.id, null);
  }
  const msg: ServerToClient =
    decision === "accept"
      ? {
          type: "diff.accept",
          approvalId,
          from: sock.role ?? "mobile",
        }
      : {
          type: "diff.reject",
          approvalId,
          from: sock.role ?? "mobile",
          reason,
        };
  broadcast(room, msg);
  return { ok: true };
}

export async function handleClientMessage(
  sock: HubSocket,
  raw: string,
): Promise<void> {
  let msg: unknown;
  try {
    msg = JSON.parse(raw);
  } catch {
    sock.send({ type: "error", message: "Invalid JSON" });
    return;
  }
  if (!msg || typeof msg !== "object" || !("type" in msg)) {
    sock.send({ type: "error", message: "Invalid message" });
    return;
  }
  const m = msg as { type: string; [k: string]: unknown };

  switch (m.type) {
    case "ping":
      sock.send({ type: "pong" });
      break;
    case "create_pair": {
      const projectId = String(m.projectId || "");
      if (!projectId) {
        sock.send({ type: "error", message: "projectId required" });
        break;
      }
      const pair = await createOrRefreshPair(sock, projectId);
      sock.send({
        type: "pair_code",
        code: pair.code,
        roomId: pair.roomId,
        projectId: pair.projectId,
        expiresAt: pair.expiresAt,
      });
      sock.send({
        type: "paired",
        roomId: pair.roomId,
        projectId: pair.projectId,
        role: "desktop",
        peers: state().rooms.get(pair.roomId)?.sockets.size ?? 1,
      });
      break;
    }
    case "hello": {
      const role = m.role as RealtimeRole;
      const pairCode = m.pairCode ? String(m.pairCode) : "";
      const projectId = m.projectId ? String(m.projectId) : "";
      if (role === "mobile" && pairCode) {
        const joined = await joinWithCode(sock, pairCode);
        if ("error" in joined) {
          sock.send({ type: "error", message: joined.error });
        } else {
          sock.send({
            type: "paired",
            roomId: joined.roomId,
            projectId: joined.projectId,
            role: "mobile",
            peers: joined.peers,
          });
        }
      } else if (role === "desktop" && projectId) {
        const joined = await joinAsDesktop(sock, projectId);
        sock.send({
          type: "pair_code",
          code: joined.code,
          roomId: joined.roomId,
          projectId: joined.projectId,
          expiresAt: joined.expiresAt,
        });
        sock.send({
          type: "paired",
          roomId: joined.roomId,
          projectId: joined.projectId,
          role: "desktop",
          peers: joined.peers,
        });
      } else {
        sock.send({
          type: "error",
          message: "hello requires desktop+projectId or mobile+pairCode",
        });
      }
      break;
    }
    case "diff.pending": {
      const payload = m.payload as DiffPendingPayload;
      if (!payload?.approvalId) {
        sock.send({ type: "error", message: "payload.approvalId required" });
        break;
      }
      const r = publishDiffPending(sock, payload);
      if ("error" in r) sock.send({ type: "error", message: r.error });
      break;
    }
    case "diff.accept": {
      const r = publishDecision(sock, "accept", String(m.approvalId || ""));
      if ("error" in r) sock.send({ type: "error", message: r.error });
      break;
    }
    case "diff.reject": {
      const r = publishDecision(
        sock,
        "reject",
        String(m.approvalId || ""),
        m.reason ? String(m.reason) : undefined,
      );
      if ("error" in r) sock.send({ type: "error", message: r.error });
      break;
    }
    default:
      sock.send({ type: "error", message: `Unknown type: ${m.type}` });
  }
}
