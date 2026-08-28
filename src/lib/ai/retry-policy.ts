import type { PipelineErrorCode } from "./errors";
import { PipelineError } from "./errors";

export interface RetryPolicy {
  /** Max automatic retries after the first failure (0 = no auto-retry) */
  maxRetries: number;
  /** Base delay in ms before first retry */
  baseDelayMs: number;
  /** Cap for exponential backoff */
  maxDelayMs: number;
  /** Multiply delay each attempt */
  factor: number;
  /** Add random jitter 0..jitterMs */
  jitterMs: number;
}

/** Default policy for transient failures */
export const DEFAULT_RETRY_POLICY: RetryPolicy = {
  maxRetries: 3,
  baseDelayMs: 600,
  maxDelayMs: 8000,
  factor: 2,
  jitterMs: 250,
};

/**
 * Per-error-code retry budgets.
 * Non-listed codes default to no automatic retry (manual Retry still allowed).
 */
export const RETRY_POLICY_BY_CODE: Partial<Record<PipelineErrorCode, RetryPolicy | null>> = {
  RATE_LIMIT: { maxRetries: 3, baseDelayMs: 800, maxDelayMs: 10000, factor: 2, jitterMs: 300 },
  NETWORK: { maxRetries: 3, baseDelayMs: 500, maxDelayMs: 6000, factor: 2, jitterMs: 200 },
  TIMEOUT: { maxRetries: 2, baseDelayMs: 700, maxDelayMs: 5000, factor: 2, jitterMs: 200 },
  G1_CODE_FAILED: { maxRetries: 2, baseDelayMs: 400, maxDelayMs: 4000, factor: 2, jitterMs: 150 },
  UNKNOWN: { maxRetries: 1, baseDelayMs: 500, maxDelayMs: 2000, factor: 2, jitterMs: 100 },
  // Explicitly non-auto-retryable (user may still click Retry once)
  EMPTY_PROMPT: null,
  ABORTED: null,
  G0_PLAN_FAILED: null,
  G2_AUDIT_FAILED: null,
  UNHEALABLE: null,
};

export function getRetryPolicy(code: PipelineErrorCode): RetryPolicy | null {
  if (code in RETRY_POLICY_BY_CODE) {
    return RETRY_POLICY_BY_CODE[code] ?? null;
  }
  return null;
}

export function isAutoRetryable(err: PipelineError): boolean {
  if (!err.retryable || err.code === "ABORTED") return false;
  const policy = getRetryPolicy(err.code);
  return policy !== null && policy.maxRetries > 0;
}

/**
 * Exponential backoff: base * factor^attempt + jitter
 * attempt is 0-based for the *next* wait after failure #1 → use attemptIndex 0 for first retry delay
 */
export function computeBackoffMs(policy: RetryPolicy, attemptIndex: number): number {
  const exp = policy.baseDelayMs * Math.pow(policy.factor, Math.max(0, attemptIndex));
  const capped = Math.min(policy.maxDelayMs, exp);
  const jitter = policy.jitterMs > 0 ? Math.floor(Math.random() * policy.jitterMs) : 0;
  return Math.round(capped + jitter);
}

export async function waitWithAbort(
  ms: number,
  signal?: AbortSignal,
  onTick?: (remainingMs: number) => void,
): Promise<void> {
  if (ms <= 0) return;
  const start = Date.now();
  const end = start + ms;

  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException("Pipeline aborted", "AbortError"));
      return;
    }

    const tick = () => {
      if (signal?.aborted) {
        cleanup();
        reject(new DOMException("Pipeline aborted", "AbortError"));
        return;
      }
      const now = Date.now();
      const remaining = Math.max(0, end - now);
      onTick?.(remaining);
      if (remaining <= 0) {
        cleanup();
        resolve();
      }
    };

    const interval = setInterval(tick, 100);
    const timeout = setTimeout(() => {
      cleanup();
      resolve();
    }, ms);

    const onAbort = () => {
      cleanup();
      reject(new DOMException("Pipeline aborted", "AbortError"));
    };
    signal?.addEventListener("abort", onAbort, { once: true });

    function cleanup() {
      clearInterval(interval);
      clearTimeout(timeout);
      signal?.removeEventListener("abort", onAbort);
    }

    tick();
  });
}

export interface RetryState {
  attempt: number;
  maxAttempts: number;
  nextDelayMs: number;
  code?: PipelineErrorCode;
  phase: "idle" | "waiting" | "running" | "exhausted";
}
