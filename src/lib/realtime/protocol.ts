/**
 * Realtime review protocol — desktop ↔ mobile over /api/ws
 */

export type RealtimeRole = "desktop" | "mobile";

export type DiffPendingPayload = {
  approvalId: string;
  title: string;
  description: string;
  files: string[];
  summary: string;
  originalCode?: string;
  modifiedCode?: string;
  language?: string;
  previewHtml?: string;
};

export type ClientToServer =
  | {
      type: "hello";
      role: RealtimeRole;
      clientId: string;
      /** Desktop hosts a room for this project */
      projectId?: string;
      /** Mobile joins with magic pair code */
      pairCode?: string;
    }
  | { type: "create_pair"; projectId: string; clientId: string }
  | { type: "diff.pending"; payload: DiffPendingPayload }
  | { type: "diff.accept"; approvalId: string }
  | { type: "diff.reject"; approvalId: string; reason?: string }
  | { type: "ping" };

export type ServerToClient =
  | {
      type: "welcome";
      clientId: string;
      ws: true;
    }
  | {
      type: "pair_code";
      code: string;
      roomId: string;
      projectId: string;
      expiresAt: number;
    }
  | {
      type: "paired";
      roomId: string;
      projectId: string;
      role: RealtimeRole;
      peers: number;
    }
  | {
      type: "peer_joined";
      role: RealtimeRole;
      peers: number;
    }
  | {
      type: "peer_left";
      role: RealtimeRole;
      peers: number;
    }
  | { type: "diff.pending"; payload: DiffPendingPayload }
  | { type: "diff.accept"; approvalId: string; from: RealtimeRole }
  | { type: "diff.reject"; approvalId: string; from: RealtimeRole; reason?: string }
  | { type: "error"; message: string }
  | { type: "pong" };

export type RealtimeMessage = ClientToServer | ServerToClient;

export function parseRealtimeMessage(raw: string): RealtimeMessage | null {
  try {
    const j = JSON.parse(raw) as RealtimeMessage;
    if (!j || typeof j !== "object" || !("type" in j)) return null;
    return j;
  } catch {
    return null;
  }
}
