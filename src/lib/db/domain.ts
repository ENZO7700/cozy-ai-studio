/**
 * Server-only domain CRUD — all queries scoped by verified user_id.
 * Tables: projects, project_files, approvals, usage_events, subscriptions, telemetry
 */

import { getSql } from "@/lib/db";
import { ensureUserRow } from "@/lib/projects/server";

export function newId(prefix: string) {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

// ── Projects ───────────────────────────────────────────────────────────────

export type ProjectRow = {
  id: string;
  user_id: string;
  name: string;
  slug: string;
  active_file: string;
  plan_tier: string;
  created_at: string;
  updated_at: string;
};

export type ProjectFileRow = {
  id: string;
  project_id: string;
  path: string;
  language: string;
  content: string;
  updated_at: string;
};

export type ApprovalRow = {
  id: string;
  user_id: string;
  project_id: string | null;
  title: string;
  description: string;
  status: string;
  affected_files_json: string;
  original_code: string;
  modified_code: string;
  language: string;
  preview_html: string | null;
  rejection_reason: string | null;
  created_at: string;
  resolved_at: string | null;
};

export type TelemetryRow = {
  id: string;
  user_id: string;
  project_id: string | null;
  prompt: string;
  status: string;
  rejection_reason: string | null;
  agent_type: string;
  latency_ms: number;
  created_at: string;
};

export type SubscriptionRow = {
  user_id: string;
  stripe_subscription_id: string | null;
  stripe_price_id: string | null;
  plan_tier: string;
  status: string;
  current_period_end: string | null;
  cancel_at_period_end: boolean;
};

export async function listProjects(userId: string): Promise<ProjectRow[]> {
  const sql = await getSql();
  return sql<ProjectRow>`
    select id, user_id, name, slug, active_file, plan_tier,
           created_at::text, updated_at::text
    from projects
    where user_id = ${userId}
    order by updated_at desc
  `;
}

export async function getProject(
  userId: string,
  projectId: string,
): Promise<ProjectRow | null> {
  const sql = await getSql();
  const rows = await sql<ProjectRow>`
    select id, user_id, name, slug, active_file, plan_tier,
           created_at::text, updated_at::text
    from projects
    where id = ${projectId} and user_id = ${userId}
    limit 1
  `;
  return rows[0] ?? null;
}

export async function createProject(
  userId: string,
  input: { name: string; slug: string; planTier?: string; activeFile?: string },
): Promise<ProjectRow> {
  await ensureUserRow(userId);
  const sql = await getSql();
  const id = newId("prj");
  await sql`
    insert into projects (id, user_id, name, slug, active_file, files_json, plan_tier)
    values (
      ${id},
      ${userId},
      ${input.name},
      ${input.slug},
      ${input.activeFile ?? "src/App.tsx"},
      ${"{}"},
      ${input.planTier ?? "FREE"}
    )
  `;
  const row = await getProject(userId, id);
  if (!row) throw new Error("createProject failed");
  return row;
}

export async function updateProject(
  userId: string,
  projectId: string,
  patch: {
    name?: string;
    activeFile?: string;
    planTier?: string;
    slug?: string;
  },
): Promise<ProjectRow | null> {
  const sql = await getSql();
  const rows = await sql<ProjectRow>`
    update projects set
      name = coalesce(${patch.name ?? null}, name),
      active_file = coalesce(${patch.activeFile ?? null}, active_file),
      plan_tier = coalesce(${patch.planTier ?? null}, plan_tier),
      slug = coalesce(${patch.slug ?? null}, slug),
      updated_at = CURRENT_TIMESTAMP
    where id = ${projectId} and user_id = ${userId}
    returning id, user_id, name, slug, active_file, plan_tier,
              created_at::text, updated_at::text
  `;
  return rows[0] ?? null;
}

export async function deleteProject(
  userId: string,
  projectId: string,
): Promise<boolean> {
  const sql = await getSql();
  const rows = await sql<{ id: string }>`
    delete from projects
    where id = ${projectId} and user_id = ${userId}
    returning id
  `;
  return rows.length > 0;
}

export async function ensureDefaultProject(userId: string): Promise<ProjectRow> {
  const existing = await listProjects(userId);
  if (existing[0]) return existing[0];
  return createProject(userId, {
    name: "My Studio Project",
    slug: "default",
  });
}

// ── Project files ──────────────────────────────────────────────────────────

export async function listProjectFiles(
  userId: string,
  projectId: string,
): Promise<ProjectFileRow[]> {
  const sql = await getSql();
  // ownership check via join
  return sql<ProjectFileRow>`
    select f.id, f.project_id, f.path, f.language, f.content, f.updated_at::text
    from project_files f
    join projects p on p.id = f.project_id
    where f.project_id = ${projectId} and p.user_id = ${userId}
    order by f.path
  `;
}

export async function upsertProjectFile(
  userId: string,
  projectId: string,
  file: { path: string; language: string; content: string },
): Promise<ProjectFileRow | null> {
  const owned = await getProject(userId, projectId);
  if (!owned) return null;
  const sql = await getSql();
  const id = newId("file");
  const rows = await sql<ProjectFileRow>`
    insert into project_files (id, project_id, path, language, content, updated_at)
    values (${id}, ${projectId}, ${file.path}, ${file.language}, ${file.content}, CURRENT_TIMESTAMP)
    on conflict (project_id, path) do update set
      language = excluded.language,
      content = excluded.content,
      updated_at = CURRENT_TIMESTAMP
    returning id, project_id, path, language, content, updated_at::text
  `;
  await sql`
    update projects set updated_at = CURRENT_TIMESTAMP where id = ${projectId}
  `;
  // dual-write files_json snapshot for legacy readers
  await dualWriteFilesJson(projectId);
  return rows[0] ?? null;
}

export async function upsertProjectFilesBulk(
  userId: string,
  projectId: string,
  files: Array<{ path: string; language: string; content: string }>,
  activeFile?: string,
): Promise<ProjectFileRow[]> {
  const owned = await getProject(userId, projectId);
  if (!owned) return [];
  const out: ProjectFileRow[] = [];
  for (const f of files) {
    const row = await upsertProjectFile(userId, projectId, f);
    if (row) out.push(row);
  }
  if (activeFile) {
    await updateProject(userId, projectId, { activeFile });
  }
  return out;
}

export async function deleteProjectFile(
  userId: string,
  projectId: string,
  path: string,
): Promise<boolean> {
  const owned = await getProject(userId, projectId);
  if (!owned) return false;
  const sql = await getSql();
  const rows = await sql<{ id: string }>`
    delete from project_files
    where project_id = ${projectId} and path = ${path}
    returning id
  `;
  await dualWriteFilesJson(projectId);
  return rows.length > 0;
}

async function dualWriteFilesJson(projectId: string) {
  const sql = await getSql();
  const files = await sql<{ path: string; language: string; content: string }>`
    select path, language, content from project_files where project_id = ${projectId}
  `;
  const map: Record<string, { path: string; language: string; content: string }> =
    {};
  for (const f of files) {
    map[f.path] = { path: f.path, language: f.language, content: f.content };
  }
  await sql`
    update projects set files_json = ${JSON.stringify(map)}, updated_at = CURRENT_TIMESTAMP
    where id = ${projectId}
  `;
}

/** Full project snapshot for studio hydrate */
export async function loadProjectWorkspace(
  userId: string,
  projectId?: string | null,
): Promise<{
  project: ProjectRow;
  files: ProjectFileRow[];
  pendingApprovals: ApprovalRow[];
  recentTelemetry: TelemetryRow[];
  subscription: SubscriptionRow | null;
  usage: { yearMonth: string; promptsUsed: number; tokensUsed: number };
}> {
  const project = projectId
    ? await getProject(userId, projectId)
    : await ensureDefaultProject(userId);
  if (!project) throw new Error("Project not found");

  let files = await listProjectFiles(userId, project.id);
  // migrate from files_json if project_files empty
  if (files.length === 0) {
    const sql = await getSql();
    const blob = await sql<{ files_json: string }>`
      select files_json from projects where id = ${project.id} limit 1
    `;
    try {
      const parsed = JSON.parse(blob[0]?.files_json || "{}") as Record<
        string,
        { path?: string; language?: string; content?: string }
      >;
      const entries = Object.values(parsed).filter((f) => f?.path && f.content != null);
      if (entries.length) {
        await upsertProjectFilesBulk(
          userId,
          project.id,
          entries.map((f) => ({
            path: f.path!,
            language: f.language || "typescript",
            content: f.content || "",
          })),
        );
        files = await listProjectFiles(userId, project.id);
      }
    } catch {
      /* ignore bad json */
    }
  }

  const pendingApprovals = await listApprovals(userId, {
    projectId: project.id,
    status: "pending",
    limit: 10,
  });
  const recentTelemetry = await listTelemetry(userId, { limit: 50 });
  const subscription = await getSubscription(userId);
  const usage = await getUsageMonthly(userId);

  return {
    project,
    files,
    pendingApprovals,
    recentTelemetry,
    subscription,
    usage,
  };
}

// ── Approvals ──────────────────────────────────────────────────────────────

export async function createApproval(
  userId: string,
  input: {
    projectId?: string | null;
    title: string;
    description: string;
    affectedFiles: string[];
    originalCode: string;
    modifiedCode: string;
    language: string;
    previewHtml?: string;
  },
): Promise<ApprovalRow> {
  await ensureUserRow(userId);
  const sql = await getSql();
  const id = newId("apr");
  const rows = await sql<ApprovalRow>`
    insert into approvals (
      id, user_id, project_id, title, description, status,
      affected_files_json, original_code, modified_code, language, preview_html
    ) values (
      ${id},
      ${userId},
      ${input.projectId ?? null},
      ${input.title},
      ${input.description},
      ${"pending"},
      ${JSON.stringify(input.affectedFiles)},
      ${input.originalCode},
      ${input.modifiedCode},
      ${input.language},
      ${input.previewHtml ?? null}
    )
    returning id, user_id, project_id, title, description, status,
              affected_files_json, original_code, modified_code, language,
              preview_html, rejection_reason, created_at::text, resolved_at::text
  `;
  return rows[0]!;
}

export async function listApprovals(
  userId: string,
  opts?: { projectId?: string; status?: string; limit?: number },
): Promise<ApprovalRow[]> {
  const sql = await getSql();
  const limit = opts?.limit ?? 50;
  if (opts?.projectId && opts?.status) {
    return sql<ApprovalRow>`
      select id, user_id, project_id, title, description, status,
             affected_files_json, original_code, modified_code, language,
             preview_html, rejection_reason, created_at::text, resolved_at::text
      from approvals
      where user_id = ${userId} and project_id = ${opts.projectId} and status = ${opts.status}
      order by created_at desc
      limit ${limit}
    `;
  }
  if (opts?.status) {
    return sql<ApprovalRow>`
      select id, user_id, project_id, title, description, status,
             affected_files_json, original_code, modified_code, language,
             preview_html, rejection_reason, created_at::text, resolved_at::text
      from approvals
      where user_id = ${userId} and status = ${opts.status}
      order by created_at desc
      limit ${limit}
    `;
  }
  return sql<ApprovalRow>`
    select id, user_id, project_id, title, description, status,
           affected_files_json, original_code, modified_code, language,
           preview_html, rejection_reason, created_at::text, resolved_at::text
    from approvals
    where user_id = ${userId}
    order by created_at desc
    limit ${limit}
  `;
}

export async function resolveApproval(
  userId: string,
  approvalId: string,
  decision: {
    status: "approved" | "rejected";
    rejectionReason?: string | null;
  },
): Promise<ApprovalRow | null> {
  const sql = await getSql();
  const rows = await sql<ApprovalRow>`
    update approvals set
      status = ${decision.status},
      rejection_reason = ${decision.rejectionReason ?? null},
      resolved_at = CURRENT_TIMESTAMP
    where id = ${approvalId} and user_id = ${userId}
    returning id, user_id, project_id, title, description, status,
              affected_files_json, original_code, modified_code, language,
              preview_html, rejection_reason, created_at::text, resolved_at::text
  `;
  const row = rows[0] ?? null;
  if (row && decision.status === "approved" && row.project_id) {
    // apply modified code to primary affected file or active path
    let paths: string[] = [];
    try {
      paths = JSON.parse(row.affected_files_json) as string[];
    } catch {
      paths = [];
    }
    const path = paths[0] || "src/App.tsx";
    await upsertProjectFile(userId, row.project_id, {
      path,
      language: row.language,
      content: row.modified_code,
    });
  }
  return row;
}

// ── Telemetry ──────────────────────────────────────────────────────────────

export async function insertTelemetry(
  userId: string,
  input: {
    projectId?: string | null;
    prompt: string;
    status: "APPROVED" | "REJECTED";
    rejectionReason?: string | null;
    agentType: string;
    latencyMs: number;
  },
): Promise<TelemetryRow> {
  await ensureUserRow(userId);
  const sql = await getSql();
  const id = newId("tel");
  const rows = await sql<TelemetryRow>`
    insert into telemetry (
      id, user_id, project_id, prompt, status, rejection_reason, agent_type, latency_ms
    ) values (
      ${id},
      ${userId},
      ${input.projectId ?? null},
      ${input.prompt.slice(0, 2000)},
      ${input.status},
      ${input.rejectionReason ?? null},
      ${input.agentType},
      ${input.latencyMs}
    )
    returning id, user_id, project_id, prompt, status, rejection_reason,
              agent_type, latency_ms, created_at::text
  `;
  return rows[0]!;
}

export async function listTelemetry(
  userId: string,
  opts?: { limit?: number },
): Promise<TelemetryRow[]> {
  const sql = await getSql();
  const limit = opts?.limit ?? 50;
  return sql<TelemetryRow>`
    select id, user_id, project_id, prompt, status, rejection_reason,
           agent_type, latency_ms, created_at::text
    from telemetry
    where user_id = ${userId}
    order by created_at desc
    limit ${limit}
  `;
}

// ── Subscriptions (read) ───────────────────────────────────────────────────

export async function getSubscription(
  userId: string,
): Promise<SubscriptionRow | null> {
  const sql = await getSql();
  const rows = await sql<SubscriptionRow>`
    select user_id, stripe_subscription_id, stripe_price_id, plan_tier, status,
           current_period_end::text, cancel_at_period_end
    from subscriptions
    where user_id = ${userId}
    limit 1
  `;
  return rows[0] ?? null;
}

// ── Usage ──────────────────────────────────────────────────────────────────

export async function getUsageMonthly(userId: string): Promise<{
  yearMonth: string;
  promptsUsed: number;
  tokensUsed: number;
}> {
  const sql = await getSql();
  const ym = `${new Date().getUTCFullYear()}-${String(new Date().getUTCMonth() + 1).padStart(2, "0")}`;
  const rows = await sql<{ prompts_used: number; tokens_used: number }>`
    select prompts_used, tokens_used
    from usage_monthly
    where user_id = ${userId} and year_month = ${ym}
    limit 1
  `;
  return {
    yearMonth: ym,
    promptsUsed: Number(rows[0]?.prompts_used ?? 0),
    tokensUsed: Number(rows[0]?.tokens_used ?? 0),
  };
}

export async function listUsageEvents(
  userId: string,
  opts?: { limit?: number },
): Promise<
  Array<{
    id: string;
    kind: string;
    prompt_preview: string | null;
    tokens_in: number;
    tokens_out: number;
    provider: string | null;
    agent: string | null;
    created_at: string;
  }>
> {
  const sql = await getSql();
  const limit = opts?.limit ?? 50;
  return sql`
    select id, kind, prompt_preview, tokens_in, tokens_out, provider, agent, created_at::text
    from usage_events
    where user_id = ${userId}
    order by created_at desc
    limit ${limit}
  `;
}
