/**
 * Quota gateway — pure server module.
 * No studio-store. No client imports. Charge only after pipeline "done".
 *
 * CHARGE_CONTRACT: done=+1 · error/abort/429/fail-before-done=0
 */

import {
  assertPromptQuota,
  recordUsageEvent,
  type QuotaCheck,
} from "@/lib/projects/server";
import {
  buildDeniedResult,
  buildUsageEventPayload,
  FREE_PRODUCT_CAPS,
  quotaBodyFields,
  quotaHeaders,
  toSnapshot,
  type QuotaSnapshot,
} from "./quota-pure";

export {
  FREE_PRODUCT_CAPS,
  quotaBodyFields,
  quotaHeaders,
  toSnapshot,
  type QuotaSnapshot,
} from "./quota-pure";

export type AssertCanRunResult =
  | { ok: true; snapshot: QuotaSnapshot }
  | {
      ok: false;
      status: 429;
      snapshot: QuotaSnapshot;
      body: Record<string, unknown>;
      headers: Record<string, string>;
    };

export async function getQuotaSnapshot(userId: string): Promise<QuotaSnapshot> {
  const quota = await assertPromptQuota(userId);
  return toSnapshot(quota as QuotaCheck & { ok: boolean });
}

/**
 * Pre-request gate. On failure returns ready-to-send 429 payload + headers.
 * Does NOT charge.
 */
export async function assertCanRunPrompt(
  userId: string,
): Promise<AssertCanRunResult> {
  const quota = await assertPromptQuota(userId);
  const snapshot = toSnapshot(quota as QuotaCheck & { ok: boolean });
  if (quota.ok) {
    return { ok: true, snapshot };
  }
  return buildDeniedResult(snapshot);
}

/**
 * CHARGE_CONTRACT: call ONLY after SSE event "done".
 * Never on open / error / abort / 429.
 */
export async function chargePromptUsage(opts: {
  userId: string;
  projectId?: string | null;
  prompt: string;
  provider?: string;
  model?: string;
}): Promise<void> {
  await recordUsageEvent(buildUsageEventPayload(opts));
}
