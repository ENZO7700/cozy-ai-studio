/**
 * Typed multi-agent pipeline errors with recovery hints.
 * Used by the orchestrator, runStudioPipeline, and UI error panels.
 */

export type PipelineErrorCode =
  | "EMPTY_PROMPT"
  | "RATE_LIMIT"
  | "G0_PLAN_FAILED"
  | "G1_CODE_FAILED"
  | "G2_AUDIT_FAILED"
  | "UNHEALABLE"
  | "TIMEOUT"
  | "NETWORK"
  | "ABORTED"
  | "UNKNOWN";

export type PipelineErrorAgent = "G0_PLANNER" | "G1_CODER" | "G2_AUDITOR" | "ORCHESTRATOR";

export class PipelineError extends Error {
  readonly code: PipelineErrorCode;
  readonly agent: PipelineErrorAgent;
  readonly recoverable: boolean;
  readonly retryable: boolean;
  readonly userMessage: string;
  readonly detail?: string;
  readonly exampleFix?: string;

  constructor(opts: {
    code: PipelineErrorCode;
    agent: PipelineErrorAgent;
    message: string;
    userMessage: string;
    recoverable?: boolean;
    retryable?: boolean;
    detail?: string;
    exampleFix?: string;
  }) {
    super(opts.message);
    this.name = "PipelineError";
    this.code = opts.code;
    this.agent = opts.agent;
    this.userMessage = opts.userMessage;
    this.recoverable = opts.recoverable ?? true;
    this.retryable = opts.retryable ?? true;
    this.detail = opts.detail;
    this.exampleFix = opts.exampleFix;
  }

  static is(e: unknown): e is PipelineError {
    return e instanceof PipelineError;
  }

  static fromUnknown(e: unknown): PipelineError {
    if (PipelineError.is(e)) return e;
    if (e instanceof DOMException && e.name === "AbortError") {
      return new PipelineError({
        code: "ABORTED",
        agent: "ORCHESTRATOR",
        message: "Pipeline aborted",
        userMessage: "Pipeline was cancelled.",
        recoverable: true,
        retryable: true,
      });
    }
    if (e instanceof Error && e.name === "AbortError") {
      return new PipelineError({
        code: "ABORTED",
        agent: "ORCHESTRATOR",
        message: e.message,
        userMessage: "Pipeline was cancelled.",
        recoverable: true,
        retryable: true,
      });
    }
    const msg = e instanceof Error ? e.message : String(e);
    return new PipelineError({
      code: "UNKNOWN",
      agent: "ORCHESTRATOR",
      message: msg,
      userMessage: "Something went wrong in the agent pipeline.",
      detail: msg,
      recoverable: true,
      retryable: true,
      exampleFix: "Retry the same prompt, or simplify the request.",
    });
  }
}

/** Catalog of error-handling demos users can trigger from suggestions */
export const ERROR_HANDLING_EXAMPLES: {
  id: string;
  prompt: string;
  label: string;
  description: string;
  code: PipelineErrorCode;
}[] = [
  {
    id: "rate-limit",
    prompt: "simulate rate limit error",
    label: "Rate limit (429)",
    description: "G1 refuses when compute quota is exhausted — retryable with backoff.",
    code: "RATE_LIMIT",
  },
  {
    id: "g0-fail",
    prompt: "simulate planner failure",
    label: "G0 plan failed",
    description: "Planner cannot decompose an ambiguous prompt into a task graph.",
    code: "G0_PLAN_FAILED",
  },
  {
    id: "g1-fail",
    prompt: "simulate coder crash",
    label: "G1 code failed",
    description: "Coder throws mid-stream — partial diff is discarded.",
    code: "G1_CODE_FAILED",
  },
  {
    id: "unhealable",
    prompt: "simulate unhealable audit failure",
    label: "G2 unhealable",
    description: "Audit finds a non-auto-fixable OWASP issue; pipeline fails after heal attempt.",
    code: "UNHEALABLE",
  },
  {
    id: "timeout",
    prompt: "simulate pipeline timeout",
    label: "Timeout",
    description: "Overall pipeline budget exceeded — abort with retry hint.",
    code: "TIMEOUT",
  },
  {
    id: "network",
    prompt: "simulate network error",
    label: "Network error",
    description: "Transient fetch failure to model endpoint — retryable.",
    code: "NETWORK",
  },
  {
    id: "auto-heal",
    prompt: "inject broken XSS for auto-heal demo",
    label: "Auto-heal success",
    description: "G2 finds XSS, G1 heals, pipeline still completes.",
    code: "G2_AUDIT_FAILED",
  },
];

export function detectErrorScenario(
  prompt: string,
): (typeof ERROR_HANDLING_EXAMPLES)[number] | null {
  const p = prompt.toLowerCase().trim();
  for (const ex of ERROR_HANDLING_EXAMPLES) {
    if (p === ex.prompt || p.includes(ex.prompt) || p.includes(ex.id.replace("-", " "))) {
      return ex;
    }
  }
  // loose aliases
  if (/\brate\s*limit\b|\b429\b/.test(p)) return ERROR_HANDLING_EXAMPLES[0];
  if (/\bplanner\s*fail|g0\s*fail/.test(p)) return ERROR_HANDLING_EXAMPLES[1];
  if (/\bcoder\s*(crash|fail)|g1\s*fail/.test(p)) return ERROR_HANDLING_EXAMPLES[2];
  if (/\bunhealable|cannot\s*heal/.test(p)) return ERROR_HANDLING_EXAMPLES[3];
  if (/\btimeout\b/.test(p)) return ERROR_HANDLING_EXAMPLES[4];
  if (/\bnetwork\b|\boffline\b/.test(p)) return ERROR_HANDLING_EXAMPLES[5];
  if (/\binject|xss|heal|broken/.test(p) && /demo|simulate|example/.test(p)) {
    return ERROR_HANDLING_EXAMPLES[6];
  }
  return null;
}
