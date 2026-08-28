/**
 * Production launch — client types + SSE consumer.
 * Server job lives in launch-run.server.ts (no fake sleep steps).
 */

export type LaunchStepId =
  | "preflight"
  | "billing"
  | "prepaid"
  | "env"
  | "build"
  | "security"
  | "deploy"
  | "publish"
  | "telemetry"
  | "live";

export type LaunchStepStatus =
  | "pending"
  | "running"
  | "done"
  | "failed"
  | "skipped";

export interface LaunchStep {
  id: LaunchStepId;
  title: string;
  description: string;
  status: LaunchStepStatus;
  detail?: string;
  durationMs?: number;
}

export interface ProductionLaunchResult {
  ok: boolean;
  publishUrl: string;
  planTier: "PRO" | "ENTERPRISE";
  prepaidCredits: number;
  region: string;
  domain: string;
  ssl: boolean;
  invoiceId: string;
  steps: LaunchStep[];
  totalMs: number;
}

export type LaunchCallbacks = {
  onSteps: (steps: LaunchStep[]) => void;
  onStep: (step: LaunchStep) => void;
  onProgress: (pct: number, label: string) => void;
  /** Called when server requires Stripe Checkout (redirect URL) */
  onCheckoutRequired?: (url: string, plan: "PRO" | "ENTERPRISE") => void;
  signal?: AbortSignal;
};

const STEP_DEFS: Omit<LaunchStep, "status">[] = [
  { id: "preflight", title: "Checks", description: "typecheck" },
  { id: "billing", title: "Payment", description: "Stripe subscription" },
  { id: "prepaid", title: "Credits", description: "AI token budget" },
  { id: "env", title: "Environment", description: "Region & domain" },
  { id: "build", title: "Build", description: "Production bundle" },
  { id: "security", title: "Security", description: "SSL & headers" },
  { id: "deploy", title: "Deploy", description: "Vercel" },
  { id: "publish", title: "Publish", description: "DNS & healthcheck" },
  { id: "telemetry", title: "Monitoring", description: "Metrics" },
  { id: "live", title: "Live", description: "App is public" },
];

export function createInitialLaunchSteps(): LaunchStep[] {
  return STEP_DEFS.map((s) => ({ ...s, status: "pending" as const }));
}

function parseSseBlock(
  block: string,
): { type: string; data: unknown } | null {
  let type: string | null = null;
  const dataLines: string[] = [];
  for (const line of block.split("\n")) {
    if (line.startsWith("event:")) type = line.slice(6).trim();
    else if (line.startsWith("data:")) dataLines.push(line.slice(5).trim());
  }
  if (!type || !dataLines.length) return null;
  try {
    return { type, data: JSON.parse(dataLines.join("\n")) };
  } catch {
    return null;
  }
}

/**
 * Run production launch via POST /api/launch/run (SSE).
 */
export async function runProductionLaunch(
  opts: {
    projectName?: string;
    preferredPlan?: "PRO" | "ENTERPRISE";
    mode?: "full" | "redeploy";
  },
  cb: LaunchCallbacks,
): Promise<ProductionLaunchResult> {
  const { getBearerToken } = await import("@/lib/auth/client");
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Accept: "text/event-stream",
  };
  const bearer = getBearerToken();
  if (bearer) headers.Authorization = `Bearer ${bearer}`;

  const res = await fetch("/api/launch/run", {
    method: "POST",
    headers,
    body: JSON.stringify({
      projectName: opts.projectName,
      preferredPlan: opts.preferredPlan ?? "PRO",
      mode: opts.mode ?? "full",
    }),
    signal: cb.signal,
  });

  if (res.status === 401) {
    throw new Error("Sign in required to launch production");
  }
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(text.slice(0, 300) || `Launch API HTTP ${res.status}`);
  }
  if (!res.body) {
    throw new Error("Empty launch stream");
  }

  let steps = createInitialLaunchSteps();
  cb.onSteps([...steps]);

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let result: ProductionLaunchResult | null = null;
  let lastError: string | null = null;

  while (true) {
    if (cb.signal?.aborted) {
      await reader.cancel().catch(() => undefined);
      throw new DOMException("Launch aborted", "AbortError");
    }
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    let idx: number;
    while ((idx = buffer.indexOf("\n\n")) !== -1) {
      const block = buffer.slice(0, idx);
      buffer = buffer.slice(idx + 2);
      if (!block.trim() || block.startsWith(":")) continue;
      const parsed = parseSseBlock(block);
      if (!parsed) continue;

      if (parsed.type === "step") {
        const step = parsed.data as LaunchStep;
        steps = steps.map((s) => (s.id === step.id ? step : s));
        cb.onSteps([...steps]);
        cb.onStep(step);
      } else if (parsed.type === "progress") {
        const p = parsed.data as { pct: number; label: string };
        cb.onProgress(p.pct, p.label);
      } else if (parsed.type === "checkout") {
        const c = parsed.data as { url: string; plan: "PRO" | "ENTERPRISE" };
        cb.onCheckoutRequired?.(c.url, c.plan);
      } else if (parsed.type === "done") {
        result = parsed.data as ProductionLaunchResult;
        if (result.steps?.length) {
          steps = result.steps;
          cb.onSteps([...steps]);
        }
      } else if (parsed.type === "error") {
        const err = parsed.data as { message: string };
        lastError = err.message;
      }
    }
  }

  if (result) return result;
  if (lastError) throw new Error(lastError);
  throw new Error("Launch stream ended without result");
}
