/**
 * Pure quota gateway helpers — no DB, no store, no side effects.
 * Used by quota-gateway.server.ts and unit tests.
 */

export const FREE_PRODUCT_CAPS = {
  daily: 20,
  monthly: 100,
} as const;

/** Minimal quota shape shared with assertPromptQuota results. */
export type QuotaCore = {
  ok: boolean;
  planTier: string;
  promptsUsed: number;
  promptLimit: number;
  dailyUsed: number;
  dailyLimit: number | null;
  superAdmin?: boolean;
  code?: string;
  message?: string;
};

export type QuotaSnapshot = QuotaCore & {
  freeProductCaps: { daily: number; monthly: number };
};

export function toSnapshot(quota: QuotaCore): QuotaSnapshot {
  return {
    ...quota,
    freeProductCaps: {
      daily: FREE_PRODUCT_CAPS.daily,
      monthly: FREE_PRODUCT_CAPS.monthly,
    },
  };
}

/** Pre-request headers (snapshot BEFORE model / charge). */
export function quotaHeaders(snapshot: QuotaSnapshot): Record<string, string> {
  const used = snapshot.promptsUsed;
  const limit = snapshot.promptLimit;
  const remaining = Math.max(0, limit - used);
  const dailyUsed = snapshot.dailyUsed;
  const dailyLimit = snapshot.dailyLimit;
  const dailyRemaining =
    dailyLimit === null || dailyLimit === undefined
      ? "none"
      : String(Math.max(0, dailyLimit - dailyUsed));

  return {
    "X-CAI-Quota-Used": String(used),
    "X-CAI-Quota-Limit": String(limit),
    "X-CAI-Quota-Remaining": String(remaining),
    "X-CAI-Daily-Used": String(dailyUsed),
    "X-CAI-Daily-Limit":
      dailyLimit === null || dailyLimit === undefined
        ? "none"
        : String(dailyLimit),
    "X-CAI-Daily-Remaining": dailyRemaining,
    "X-CAI-Super-Admin": snapshot.superAdmin ? "1" : "0",
    "X-CAI-Free-Product-Daily": String(FREE_PRODUCT_CAPS.daily),
    "X-CAI-Free-Product-Monthly": String(FREE_PRODUCT_CAPS.monthly),
  };
}

export function quotaBodyFields(snapshot: QuotaSnapshot) {
  const used = snapshot.promptsUsed;
  const limit = snapshot.promptLimit;
  return {
    promptsUsed: used,
    promptLimit: limit,
    quotaRemaining: Math.max(0, limit - used),
    dailyUsed: snapshot.dailyUsed,
    dailyLimit: snapshot.dailyLimit,
    dailyRemaining:
      snapshot.dailyLimit == null
        ? null
        : Math.max(0, snapshot.dailyLimit - snapshot.dailyUsed),
    superAdmin: Boolean(snapshot.superAdmin),
    freeProductCaps: {
      daily: FREE_PRODUCT_CAPS.daily,
      monthly: FREE_PRODUCT_CAPS.monthly,
    },
  };
}

/** 429 body + headers from a blocked snapshot (no charge). */
export function buildDeniedResult(snapshot: QuotaSnapshot) {
  return {
    ok: false as const,
    status: 429 as const,
    snapshot,
    body: {
      error: snapshot.code,
      message: snapshot.message,
      planTier: snapshot.planTier,
      ...quotaBodyFields(snapshot),
    },
    headers: quotaHeaders(snapshot),
  };
}

/** Payload for recordUsageEvent — CHARGE_CONTRACT mapping only. */
export function buildUsageEventPayload(opts: {
  userId: string;
  projectId?: string | null;
  prompt: string;
  provider?: string;
  model?: string;
}) {
  return {
    userId: opts.userId,
    projectId: opts.projectId,
    kind: "prompt" as const,
    promptPreview: opts.prompt,
    provider: opts.provider,
    model: opts.model,
    agent: "G0_G1_G2" as const,
    tokensIn: Math.ceil(opts.prompt.length / 4),
    tokensOut: 0,
  };
}
