/**
 * Server-only project + usage helpers, always scoped by verified user_id.
 */

import { getSql } from "@/lib/db";
import {
  FREE_PROMPT_LIMIT,
  promptLimitForPlan,
  type PlanTier,
} from "@/lib/stripe/config";
import {
  isSuperAdmin,
  SUPER_ADMIN_PROMPT_LIMIT,
} from "@/lib/auth/super-admin";

export type ProjectRow = {
  id: string;
  user_id: string;
  name: string;
  slug: string;
  active_file: string;
  files_json: string;
  plan_tier: string;
  created_at: string;
  updated_at: string;
};

/** Free-tier hard daily cap (server-enforced before any model call). */
export const FREE_DAILY_PROMPT_LIMIT = Number(
  process.env.FREE_DAILY_PROMPT_LIMIT ?? "20",
);

function newId(prefix: string) {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

function yearMonth(d = new Date()) {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

function utcDayStartIso(d = new Date()) {
  return new Date(
    Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()),
  ).toISOString();
}

/** Ensure a user row exists for FK (dev-user when auth off; no-op if present). */
export async function ensureUserRow(userId: string, email?: string | null) {
  const sql = await getSql();
  await sql`
    insert into "user" ("id", "name", "email", "emailVerified", "createdAt", "updatedAt")
    values (
      ${userId},
      ${email ?? userId},
      ${email ?? `${userId}@local.dev`},
      ${true},
      CURRENT_TIMESTAMP,
      CURRENT_TIMESTAMP
    )
    on conflict ("id") do nothing
  `;

  // Super-admin → ENTERPRISE row so UI / billing snapshot stay consistent
  if (isSuperAdmin({ userId, email })) {
    try {
      await sql`
        insert into subscriptions (
          user_id, plan_tier, status, stripe_subscription_id, stripe_price_id,
          cancel_at_period_end
        )
        values (
          ${userId}, ${"ENTERPRISE"}, ${"active"}, ${null}, ${null}, ${false}
        )
        on conflict (user_id) do update set
          plan_tier = ${"ENTERPRISE"},
          status = ${"active"},
          updated_at = CURRENT_TIMESTAMP
      `;
    } catch {
      /* non-fatal */
    }
  }
}

export async function listProjectsForUser(userId: string): Promise<ProjectRow[]> {
  const sql = await getSql();
  return sql<ProjectRow>`
    select id, user_id, name, slug, active_file, files_json, plan_tier,
           created_at::text, updated_at::text
    from projects
    where user_id = ${userId}
    order by updated_at desc
  `;
}

export async function getProjectForUser(
  userId: string,
  projectId: string,
): Promise<ProjectRow | null> {
  const sql = await getSql();
  const rows = await sql<ProjectRow>`
    select id, user_id, name, slug, active_file, files_json, plan_tier,
           created_at::text, updated_at::text
    from projects
    where id = ${projectId} and user_id = ${userId}
    limit 1
  `;
  return rows[0] ?? null;
}

export async function ensureDefaultProject(userId: string): Promise<ProjectRow> {
  await ensureUserRow(userId);
  const existing = await listProjectsForUser(userId);
  if (existing[0]) return existing[0];

  const sql = await getSql();
  const id = newId("prj");
  const name = "My Studio Project";
  const slug = "default";
  await sql`
    insert into projects (id, user_id, name, slug, active_file, files_json, plan_tier)
    values (${id}, ${userId}, ${name}, ${slug}, ${"src/App.tsx"}, ${"{}"}, ${"FREE"})
  `;
  const row = await getProjectForUser(userId, id);
  if (!row) throw new Error("Failed to create default project");
  return row;
}

export async function saveProjectFiles(
  userId: string,
  projectId: string,
  payload: {
    name?: string;
    activeFile?: string;
    filesJson: string;
    planTier?: string;
  },
): Promise<ProjectRow | null> {
  const sql = await getSql();
  const rows = await sql<ProjectRow>`
    update projects
    set
      name = coalesce(${payload.name ?? null}, name),
      active_file = coalesce(${payload.activeFile ?? null}, active_file),
      files_json = ${payload.filesJson},
      plan_tier = coalesce(${payload.planTier ?? null}, plan_tier),
      updated_at = CURRENT_TIMESTAMP
    where id = ${projectId} and user_id = ${userId}
    returning id, user_id, name, slug, active_file, files_json, plan_tier,
              created_at::text, updated_at::text
  `;
  return rows[0] ?? null;
}

export async function recordUsageEvent(opts: {
  userId: string;
  projectId?: string | null;
  kind?: string;
  promptPreview?: string;
  tokensIn?: number;
  tokensOut?: number;
  model?: string;
  agent?: string;
  provider?: string;
}): Promise<void> {
  await ensureUserRow(opts.userId);
  const sql = await getSql();
  const id = newId("use");
  const tokensIn = opts.tokensIn ?? 0;
  const tokensOut = opts.tokensOut ?? 0;
  const ym = yearMonth();

  await sql`
    insert into usage_events (
      id, user_id, project_id, kind, prompt_preview,
      tokens_in, tokens_out, model, agent, provider
    ) values (
      ${id},
      ${opts.userId},
      ${opts.projectId ?? null},
      ${opts.kind ?? "prompt"},
      ${opts.promptPreview?.slice(0, 500) ?? null},
      ${tokensIn},
      ${tokensOut},
      ${opts.model ?? null},
      ${opts.agent ?? null},
      ${opts.provider ?? null}
    )
  `;

  await sql`
    insert into usage_monthly (user_id, year_month, prompts_used, tokens_used)
    values (${opts.userId}, ${ym}, ${1}, ${tokensIn + tokensOut})
    on conflict (user_id, year_month) do update set
      prompts_used = usage_monthly.prompts_used + 1,
      tokens_used = usage_monthly.tokens_used + excluded.tokens_used
  `;
}

export async function getMonthlyUsage(userId: string): Promise<{
  yearMonth: string;
  promptsUsed: number;
  tokensUsed: number;
}> {
  const sql = await getSql();
  const ym = yearMonth();
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

export async function getDailyPromptCount(userId: string): Promise<number> {
  const sql = await getSql();
  const since = utcDayStartIso();
  const rows = await sql<{ c: number }>`
    select count(*)::int as c
    from usage_events
    where user_id = ${userId}
      and kind = 'prompt'
      and created_at >= ${since}::timestamptz
  `;
  return Number(rows[0]?.c ?? 0);
}

export async function resolvePlanTier(userId: string): Promise<PlanTier> {
  if (isSuperAdmin({ userId })) return "ENTERPRISE";

  const sql = await getSql();
  const sub = await sql<{ plan_tier: string; status: string }>`
    select plan_tier, status from subscriptions where user_id = ${userId} limit 1
  `;
  const status = sub[0]?.status ?? "inactive";
  const tier = (sub[0]?.plan_tier as PlanTier) || "FREE";
  if (status === "active" || status === "trialing") return tier;
  return "FREE";
}

export type QuotaCheck =
  | {
      ok: true;
      planTier: PlanTier;
      promptsUsed: number;
      promptLimit: number;
      dailyUsed: number;
      dailyLimit: number | null;
      superAdmin?: boolean;
    }
  | {
      ok: false;
      code: "DAILY_LIMIT" | "MONTHLY_LIMIT";
      planTier: PlanTier;
      promptsUsed: number;
      promptLimit: number;
      dailyUsed: number;
      dailyLimit: number | null;
      message: string;
      superAdmin?: boolean;
    };

/**
 * Hard server-side quota gate — call BEFORE any Mistral / model work.
 * FREE: daily + monthly caps. Paid: monthly only.
 * Super-admin: always ok, ENTERPRISE, unlimited.
 */
export async function assertPromptQuota(userId: string): Promise<QuotaCheck> {
  if (isSuperAdmin({ userId })) {
    await ensureUserRow(userId);
    let promptsUsed = 0;
    let dailyUsed = 0;
    try {
      const monthly = await getMonthlyUsage(userId);
      promptsUsed = monthly.promptsUsed;
      dailyUsed = await getDailyPromptCount(userId);
    } catch {
      /* usage tables optional for admin path */
    }
    return {
      ok: true,
      planTier: "ENTERPRISE",
      promptsUsed,
      promptLimit: SUPER_ADMIN_PROMPT_LIMIT,
      dailyUsed,
      dailyLimit: null,
      superAdmin: true,
    };
  }

  const planTier = await resolvePlanTier(userId);
  const monthly = await getMonthlyUsage(userId);
  const promptLimit = promptLimitForPlan(planTier);
  const dailyUsed = await getDailyPromptCount(userId);
  const dailyLimit =
    planTier === "FREE" ? FREE_DAILY_PROMPT_LIMIT : null;

  if (dailyLimit !== null && dailyUsed >= dailyLimit) {
    return {
      ok: false,
      code: "DAILY_LIMIT",
      planTier,
      promptsUsed: monthly.promptsUsed,
      promptLimit,
      dailyUsed,
      dailyLimit,
      message: `Daily free limit reached (${dailyUsed}/${dailyLimit}). Try again tomorrow.`,
    };
  }

  if (monthly.promptsUsed >= promptLimit) {
    return {
      ok: false,
      code: "MONTHLY_LIMIT",
      planTier,
      promptsUsed: monthly.promptsUsed,
      promptLimit,
      dailyUsed,
      dailyLimit,
      message: `Monthly prompt limit reached (${monthly.promptsUsed}/${promptLimit}).`,
    };
  }

  return {
    ok: true,
    planTier,
    promptsUsed: monthly.promptsUsed,
    promptLimit: promptLimit || FREE_PROMPT_LIMIT,
    dailyUsed,
    dailyLimit,
  };
}
