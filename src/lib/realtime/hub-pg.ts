/**
 * Postgres durability for mobile pair rooms (Vercel multi-instance safe).
 * Used when DATABASE_URL is set; no-op when PGLite / no DB.
 */

import { getSql, dbSource } from "../db";
import type { DiffPendingPayload, ServerToClient } from "./protocol";

export type PgRoom = {
  id: string;
  project_id: string;
  pair_code: string;
  code_expires_at: string;
  pending_diff: DiffPendingPayload | null;
};

function pgEnabled() {
  return dbSource === "neon" && Boolean(process.env.DATABASE_URL?.trim());
}

export async function pgUpsertRoom(opts: {
  id: string;
  projectId: string;
  pairCode: string;
  codeExpiresAt: number;
  pendingDiff?: DiffPendingPayload | null;
}): Promise<void> {
  if (!pgEnabled()) return;
  try {
    const sql = await getSql();
    const expires = new Date(opts.codeExpiresAt).toISOString();
    const pending =
      opts.pendingDiff === undefined
        ? null
        : opts.pendingDiff
          ? JSON.stringify(opts.pendingDiff)
          : null;
    await sql`
      insert into pair_rooms (
        id, project_id, pair_code, code_expires_at, pending_diff, updated_at
      ) values (
        ${opts.id},
        ${opts.projectId},
        ${opts.pairCode.toUpperCase()},
        ${expires},
        ${pending}::jsonb,
        CURRENT_TIMESTAMP
      )
      on conflict (id) do update set
        pair_code = excluded.pair_code,
        code_expires_at = excluded.code_expires_at,
        pending_diff = coalesce(excluded.pending_diff, pair_rooms.pending_diff),
        updated_at = CURRENT_TIMESTAMP
    `;
  } catch (e) {
    console.warn("[pair-pg] upsert room", e);
  }
}

export async function pgSetPendingDiff(
  roomId: string,
  pending: DiffPendingPayload | null,
): Promise<void> {
  if (!pgEnabled()) return;
  try {
    const sql = await getSql();
    await sql`
      update pair_rooms
      set pending_diff = ${pending ? JSON.stringify(pending) : null}::jsonb,
          updated_at = CURRENT_TIMESTAMP
      where id = ${roomId}
    `;
  } catch (e) {
    console.warn("[pair-pg] set pending", e);
  }
}

export async function pgFindRoomByCode(
  pairCode: string,
): Promise<PgRoom | null> {
  if (!pgEnabled()) return null;
  try {
    const sql = await getSql();
    const code = pairCode.trim().toUpperCase();
    const rows = await sql<{
      id: string;
      project_id: string;
      pair_code: string;
      code_expires_at: string;
      pending_diff: DiffPendingPayload | string | null;
    }>`
      select id, project_id, pair_code, code_expires_at::text, pending_diff
      from pair_rooms
      where pair_code = ${code}
        and code_expires_at > CURRENT_TIMESTAMP
      limit 1
    `;
    const r = rows[0];
    if (!r) return null;
    let pending: DiffPendingPayload | null = null;
    if (r.pending_diff) {
      pending =
        typeof r.pending_diff === "string"
          ? (JSON.parse(r.pending_diff) as DiffPendingPayload)
          : r.pending_diff;
    }
    return {
      id: r.id,
      project_id: r.project_id,
      pair_code: r.pair_code,
      code_expires_at: r.code_expires_at,
      pending_diff: pending,
    };
  } catch (e) {
    console.warn("[pair-pg] find by code", e);
    return null;
  }
}

export async function pgFindRoomByProject(
  projectId: string,
): Promise<PgRoom | null> {
  if (!pgEnabled()) return null;
  try {
    const sql = await getSql();
    const rows = await sql<{
      id: string;
      project_id: string;
      pair_code: string;
      code_expires_at: string;
      pending_diff: DiffPendingPayload | string | null;
    }>`
      select id, project_id, pair_code, code_expires_at::text, pending_diff
      from pair_rooms
      where project_id = ${projectId}
        and code_expires_at > CURRENT_TIMESTAMP
      order by updated_at desc
      limit 1
    `;
    const r = rows[0];
    if (!r) return null;
    let pending: DiffPendingPayload | null = null;
    if (r.pending_diff) {
      pending =
        typeof r.pending_diff === "string"
          ? (JSON.parse(r.pending_diff) as DiffPendingPayload)
          : r.pending_diff;
    }
    return {
      id: r.id,
      project_id: r.project_id,
      pair_code: r.pair_code,
      code_expires_at: r.code_expires_at,
      pending_diff: pending,
    };
  } catch (e) {
    console.warn("[pair-pg] find by project", e);
    return null;
  }
}

export async function pgPublishEvent(
  roomId: string,
  payload: ServerToClient,
  excludeClientId?: string,
): Promise<void> {
  if (!pgEnabled()) return;
  try {
    const sql = await getSql();
    await sql`
      insert into pair_events (room_id, exclude_client_id, payload)
      values (
        ${roomId},
        ${excludeClientId ?? null},
        ${JSON.stringify(payload)}::jsonb
      )
    `;
  } catch (e) {
    console.warn("[pair-pg] publish event", e);
  }
}

export async function pgPollEvents(
  roomId: string,
  afterId: number,
  clientId: string,
  limit = 50,
): Promise<{ id: number; payload: ServerToClient }[]> {
  if (!pgEnabled()) return [];
  try {
    const sql = await getSql();
    const rows = await sql<{ id: number; payload: ServerToClient | string }>`
      select id, payload
      from pair_events
      where room_id = ${roomId}
        and id > ${afterId}
        and (exclude_client_id is null or exclude_client_id <> ${clientId})
      order by id asc
      limit ${limit}
    `;
    return rows.map((r) => ({
      id: Number(r.id),
      payload:
        typeof r.payload === "string"
          ? (JSON.parse(r.payload) as ServerToClient)
          : r.payload,
    }));
  } catch (e) {
    console.warn("[pair-pg] poll events", e);
    return [];
  }
}
