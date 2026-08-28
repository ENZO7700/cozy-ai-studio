import type { AgentId, AgentTask } from "@/stores/studio-store";
import {
  detectIntent,
  generateForIntent,
  type GeneratedArtifact,
} from "./generators";
import type { TaskNode, PipelinePhase } from "./types";
import { auditCode, autoHealCode, type AuditReport } from "./auditor";
import { detectErrorScenario, PipelineError } from "./errors";

export type { PipelinePhase, TaskNode };
export type { GeneratedArtifact };

export interface PipelineResult {
  plan: string;
  code: string;
  language: string;
  filePath: string;
  previewHtml: string;
  auditNotes: string[];
  title: string;
  description: string;
  affectedFiles: string[];
  taskGraph: TaskNode[];
  audit: AuditReport;
  phases: { agent: AgentId; durationMs: number }[];
  /** Multi-file G1 patches from SSE / generators */
  filePatches?: {
    path: string;
    content: string;
    language?: string;
    op?: "write" | "create" | "delete";
  }[];
}

export type PipelineCallbacks = {
  onAgentUpdate: (task: Partial<AgentTask> & { id: string }) => void;
  onStreamCode: (partial: string) => void;
  onChat: (content: string, agent?: AgentId) => void;
  onPhase?: (phase: PipelinePhase) => void;
  onTaskGraph?: (nodes: TaskNode[]) => void;
  onProgress?: (pct: number, label: string) => void;
  signal?: AbortSignal;
  /** 0-based attempt index (retries pass attempt > 0 so demos can succeed) */
  attempt?: number;
};

function sleep(ms: number, signal?: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException("Pipeline aborted", "AbortError"));
      return;
    }
    const t = setTimeout(resolve, ms);
    const onAbort = () => {
      clearTimeout(t);
      reject(new DOMException("Pipeline aborted", "AbortError"));
    };
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

function throwIfAborted(signal?: AbortSignal) {
  if (signal?.aborted) {
    throw new DOMException("Pipeline aborted", "AbortError");
  }
}

async function streamText(
  full: string,
  onChunk: (partial: string) => void,
  opts: { chunkSize?: number; delayMs?: number; signal?: AbortSignal } = {},
) {
  const { chunkSize = 48, delayMs = 12, signal } = opts;
  let acc = "";
  for (let i = 0; i < full.length; i += chunkSize) {
    throwIfAborted(signal);
    acc += full.slice(i, i + chunkSize);
    onChunk(acc);
    await sleep(delayMs, signal);
  }
  onChunk(full);
}

function patchGraph(
  graph: TaskNode[],
  id: string,
  status: TaskNode["status"],
  detail?: string,
): TaskNode[] {
  return graph.map((n) => (n.id === id ? { ...n, status, detail } : n));
}

function failGraph(
  graph: TaskNode[],
  agent: AgentId,
  detail: string,
): TaskNode[] {
  return graph.map((n) => {
    if (n.agent !== agent) return n;
    if (n.status === "completed") return n;
    if (n.status === "in_progress" || n.status === "pending") {
      return { ...n, status: "failed" as const, detail };
    }
    return n;
  });
}

/**
 * Multi-Agent Orchestrator
 * G0 Planner → G1 Coder → G2 Auditor (+ auto-heal loop)
 * Includes intentional error-handling demos via prompt keywords.
 */
export class MultiAgentOrchestrator {
  private signal?: AbortSignal;

  constructor(private readonly options?: { signal?: AbortSignal }) {
    this.signal = options?.signal;
  }

  async runPipeline(
    userPrompt: string,
    _originalCode: string,
    cb: PipelineCallbacks,
  ): Promise<PipelineResult> {
    const signal = cb.signal ?? this.signal;
    const trimmed = userPrompt.trim();

    // ─── Validation example ────────────────────────────────────────────
    if (!trimmed) {
      throw new PipelineError({
        code: "EMPTY_PROMPT",
        agent: "ORCHESTRATOR",
        message: "Empty prompt",
        userMessage: "Prompt cannot be empty.",
        recoverable: true,
        retryable: false,
        exampleFix: "Describe a UI change, e.g. “Add a pricing section”.",
      });
    }

    const attempt = cb.attempt ?? 0;
    // Simulated error demos only fire on the first attempt so auto-retry can succeed
    const rawScenario = detectErrorScenario(trimmed);
    const errorScenario =
      attempt === 0
        ? rawScenario
        : rawScenario?.id === "auto-heal"
          ? rawScenario
          : null;
    if (attempt > 0 && rawScenario && rawScenario.id !== "auto-heal") {
      cb.onChat(
        `Retry attempt ${attempt + 1}: skipping simulated “${rawScenario.label}” failure — running healthy pipeline.`,
        "G0_PLANNER",
      );
    }
    const phases: PipelineResult["phases"] = [];
    const intent = detectIntent(userPrompt);
    const artifact = generateForIntent(intent, userPrompt);
    let graph = artifact.taskGraph.map((n) => ({ ...n }));
    cb.onTaskGraph?.(graph);
    cb.onPhase?.("planning");
    cb.onProgress?.(5, "G0 Planner starting");

    // ─── Phase 1: G0 Planner ───────────────────────────────────────────
    const g0Start = Date.now();
    cb.onAgentUpdate({
      id: "g0",
      status: "in_progress",
      payload: "Decomposing prompt into architecture task graph…",
      startedAt: g0Start,
    });
    cb.onChat("G0 Planner: breaking request into a task graph…", "G0_PLANNER");
    graph = patchGraph(graph, "g0-plan", "in_progress");
    cb.onTaskGraph?.(graph);

    await sleep(400, signal);

    // Error example: G0 plan failed
    if (errorScenario?.code === "G0_PLAN_FAILED") {
      await sleep(500, signal);
      graph = failGraph(graph, "G0_PLANNER", "Ambiguous prompt");
      cb.onTaskGraph?.(graph);
      cb.onAgentUpdate({
        id: "g0",
        status: "failed",
        payload:
          "Failed: cannot decompose prompt into a task graph.\nReason: intent too vague / conflicting constraints.",
        finishedAt: Date.now(),
      });
      cb.onPhase?.("failed");
      throw new PipelineError({
        code: "G0_PLAN_FAILED",
        agent: "G0_PLANNER",
        message: "G0 planner failed",
        userMessage:
          "G0 Planner could not build a task graph from this prompt.",
        detail:
          "Ambiguous or conflicting requirements — no component boundaries found.",
        recoverable: true,
        retryable: true,
        exampleFix:
          "Be specific: “Add a 3-tier pricing section with Free, Pro, Enterprise.”",
      });
    }

    // Error example: network before plan finishes
    if (errorScenario?.code === "NETWORK") {
      await sleep(300, signal);
      cb.onAgentUpdate({
        id: "g0",
        status: "failed",
        payload: "Network error: failed to reach model endpoint (ECONNRESET)",
        finishedAt: Date.now(),
      });
      graph = failGraph(graph, "G0_PLANNER", "Network error");
      cb.onTaskGraph?.(graph);
      cb.onPhase?.("failed");
      throw new PipelineError({
        code: "NETWORK",
        agent: "ORCHESTRATOR",
        message: "ECONNRESET",
        userMessage: "Network error while contacting the model endpoint.",
        detail: "fetch failed: ECONNRESET at api.cozy-ai.studio/v1/agents/g0",
        recoverable: true,
        retryable: true,
        exampleFix: "Check connectivity and retry. Transient failures often succeed on retry.",
      });
    }

    await streamText(
      artifact.plan,
      (partial) => {
        cb.onAgentUpdate({ id: "g0", payload: partial });
        cb.onProgress?.(
          5 +
            Math.min(
              20,
              Math.round((partial.length / Math.max(artifact.plan.length, 1)) * 20),
            ),
          "G0 planning",
        );
      },
      { chunkSize: 28, delayMs: 14, signal },
    );

    graph = patchGraph(graph, "g0-plan", "completed", "Task graph ready");
    graph = patchGraph(graph, "g0-components", "in_progress");
    cb.onTaskGraph?.(graph);
    await sleep(350, signal);
    graph = patchGraph(
      graph,
      "g0-components",
      "completed",
      artifact.affectedFiles.join(", "),
    );
    cb.onTaskGraph?.(graph);

    cb.onAgentUpdate({
      id: "g0",
      status: "completed",
      payload: artifact.plan,
      finishedAt: Date.now(),
    });
    cb.onChat(artifact.plan, "G0_PLANNER");
    phases.push({ agent: "G0_PLANNER", durationMs: Date.now() - g0Start });
    cb.onProgress?.(28, "Plan complete");

    // Error example: timeout after plan
    if (errorScenario?.code === "TIMEOUT") {
      cb.onPhase?.("coding");
      cb.onAgentUpdate({
        id: "g1",
        status: "in_progress",
        payload: "Waiting for model stream…",
        startedAt: Date.now(),
      });
      await sleep(600, signal);
      cb.onAgentUpdate({
        id: "g1",
        status: "failed",
        payload: "Timeout: exceeded 30s pipeline budget",
        finishedAt: Date.now(),
      });
      graph = failGraph(graph, "G1_CODER", "Timeout");
      cb.onTaskGraph?.(graph);
      cb.onPhase?.("failed");
      throw new PipelineError({
        code: "TIMEOUT",
        agent: "ORCHESTRATOR",
        message: "Pipeline timeout",
        userMessage: "Pipeline exceeded the time budget before G1 finished streaming.",
        detail: "deadline_exceeded after 30000ms (demo)",
        recoverable: true,
        retryable: true,
        exampleFix: "Retry, or split the request into smaller UI tasks.",
      });
    }

    // ─── Phase 2: G1 Coder ─────────────────────────────────────────────
    cb.onPhase?.("coding");
    const g1Start = Date.now();
    cb.onAgentUpdate({
      id: "g1",
      status: "in_progress",
      payload: `Generating ${artifact.filePath}…`,
      startedAt: g1Start,
    });
    cb.onChat(
      `G1 Coder: implementing ${artifact.affectedFiles.length} file(s) from plan…`,
      "G1_CODER",
    );

    // Error example: rate limit
    if (errorScenario?.code === "RATE_LIMIT") {
      await sleep(450, signal);
      cb.onAgentUpdate({
        id: "g1",
        status: "failed",
        payload: "429 Too Many Requests — compute quota exhausted",
        finishedAt: Date.now(),
      });
      graph = failGraph(graph, "G1_CODER", "Rate limited");
      cb.onTaskGraph?.(graph);
      cb.onPhase?.("failed");
      throw new PipelineError({
        code: "RATE_LIMIT",
        agent: "G1_CODER",
        message: "429 rate limit",
        userMessage: "G1 Coder hit the compute rate limit.",
        detail: "Retry-After: 12s · remaining tokens: 0 (demo)",
        recoverable: true,
        retryable: true,
        exampleFix: "Wait a few seconds and retry, or upgrade plan for higher throughput.",
      });
    }

    const fileNodes = graph.filter((n) => n.id.startsWith("g1-file-"));
    for (const node of fileNodes) {
      throwIfAborted(signal);
      graph = patchGraph(graph, node.id, "in_progress", node.title);
      cb.onTaskGraph?.(graph);
      await sleep(180, signal);
    }

    // Error example: coder crash mid-stream
    if (errorScenario?.code === "G1_CODE_FAILED") {
      const partial = artifact.code.slice(0, Math.min(180, artifact.code.length));
      cb.onStreamCode(partial);
      await sleep(400, signal);
      cb.onAgentUpdate({
        id: "g1",
        status: "failed",
        payload: "Stream interrupted: model returned malformed tokens",
        finishedAt: Date.now(),
      });
      graph = failGraph(graph, "G1_CODER", "Stream crash");
      cb.onTaskGraph?.(graph);
      cb.onPhase?.("failed");
      // discard partial — callers should not approve broken code
      cb.onStreamCode(_originalCode || "");
      throw new PipelineError({
        code: "G1_CODE_FAILED",
        agent: "G1_CODER",
        message: "G1 stream crashed",
        userMessage: "G1 Coder crashed mid-stream. Partial output was discarded.",
        detail: "JSON parse error at token offset 1842 (demo)",
        recoverable: true,
        retryable: true,
        exampleFix: "Retry the same prompt. If it keeps failing, shorten the request scope.",
      });
    }

    await streamText(
      artifact.code,
      (partial) => {
        cb.onStreamCode(partial);
        const pct = Math.min(
          100,
          Math.round((partial.length / Math.max(artifact.code.length, 1)) * 100),
        );
        cb.onAgentUpdate({
          id: "g1",
          payload: `Streaming ${artifact.filePath}… ${pct}%`,
        });
        cb.onProgress?.(28 + Math.round(pct * 0.42), `G1 coding ${pct}%`);
      },
      { chunkSize: 72, delayMs: 8, signal },
    );

    for (const node of fileNodes) {
      graph = patchGraph(
        graph,
        node.id,
        "completed",
        `${artifact.code.split("\n").length} lines`,
      );
    }
    cb.onTaskGraph?.(graph);

    cb.onAgentUpdate({
      id: "g1",
      status: "completed",
      payload: `Generated ${artifact.code.split("\n").length} lines → ${artifact.filePath}`,
      finishedAt: Date.now(),
    });
    phases.push({ agent: "G1_CODER", durationMs: Date.now() - g1Start });
    cb.onProgress?.(72, "Code generated");

    // ─── Phase 3: G2 Auditor ───────────────────────────────────────────
    cb.onPhase?.("auditing");
    const g2Start = Date.now();
    cb.onAgentUpdate({
      id: "g2",
      status: "in_progress",
      payload: "Running syntax · OWASP · Tailwind audit…",
      startedAt: g2Start,
    });
    cb.onChat("G2 Auditor: static analysis + security pass…", "G2_AUDITOR");

    for (const id of ["g2-syntax", "g2-owasp", "g2-tailwind"] as const) {
      throwIfAborted(signal);
      graph = patchGraph(graph, id, "in_progress");
      cb.onTaskGraph?.(graph);
      await sleep(280, signal);
      graph = patchGraph(graph, id, "completed");
      cb.onTaskGraph?.(graph);
      cb.onProgress?.(
        id === "g2-syntax" ? 78 : id === "g2-owasp" ? 86 : 92,
        `G2 ${id.replace("g2-", "")}`,
      );
    }

    let code = artifact.code;
    let audit = auditCode(code, artifact.language);

    // Auto-heal demo / unhealable demo
    const wantHealDemo =
      errorScenario?.id === "auto-heal" ||
      (/inject|xss|heal|broken/i.test(userPrompt) &&
        errorScenario?.code !== "UNHEALABLE");

    if (wantHealDemo && audit.passed) {
      code = artifact.code.replace(
        /return \(/,
        'const _demo = document.createElement("div"); _demo.innerHTML = "x";\n  return (',
      );
      audit = auditCode(code, artifact.language);
    }

    // Unhealable: inject issue that autoHeal cannot fix (eval)
    if (errorScenario?.code === "UNHEALABLE") {
      code =
        artifact.code +
        `\n// unhealable demo\nconst _bad = eval("1+1");\nvoid _bad;\n`;
      audit = auditCode(code, artifact.language);
    }

    audit = {
      ...audit,
      notes: [...artifact.auditNotes, ...audit.notes],
    };

    if (!audit.passed) {
      cb.onPhase?.("healing");
      cb.onAgentUpdate({
        id: "g2",
        payload: `Found ${audit.issues.filter((i) => i.severity === "error").length} issue(s) — auto-healing…`,
      });
      cb.onChat(
        `G2: issues detected\n${audit.issues.map((i) => `• [${i.severity}] ${i.message}`).join("\n")}\nStarting auto-heal loop…`,
        "G2_AUDITOR",
      );

      cb.onAgentUpdate({
        id: "g1",
        status: "in_progress",
        payload: "Auto-heal: fixing audit findings…",
      });
      await sleep(500, signal);
      const healed = autoHealCode(code, audit.issues);
      const reAudit = auditCode(healed.code, artifact.language);

      if (errorScenario?.code === "UNHEALABLE" || (!reAudit.passed && !healed.fixed.length)) {
        // Heal failed — surface structured error
        cb.onAgentUpdate({
          id: "g1",
          status: "failed",
          payload: "Auto-heal could not resolve all critical issues",
        });
        cb.onAgentUpdate({
          id: "g2",
          status: "failed",
          payload: `Unhealable issues\n${audit.issues
            .filter((i) => i.severity === "error")
            .map((i) => `• ${i.message}`)
            .join("\n")}`,
          finishedAt: Date.now(),
        });
        graph = failGraph(graph, "G2_AUDITOR", "Unhealable");
        cb.onTaskGraph?.(graph);
        cb.onPhase?.("failed");
        // keep original clean code in editor
        cb.onStreamCode(artifact.code);
        throw new PipelineError({
          code: "UNHEALABLE",
          agent: "G2_AUDITOR",
          message: "Audit issues not auto-fixable",
          userMessage:
            "G2 Auditor found critical issues that auto-heal could not fix.",
          detail: audit.issues
            .filter((i) => i.severity === "error")
            .map((i) => `[${i.rule}] ${i.message}`)
            .join("\n"),
          recoverable: true,
          retryable: true,
          exampleFix:
            "Rewrite the prompt to avoid eval/dynamic code, or manually fix the flagged lines.",
        });
      }

      if (reAudit.passed || healed.fixed.length > 0) {
        code = reAudit.passed ? healed.code : artifact.code;
        audit = auditCode(code, artifact.language);
        audit.healed = true;
        audit.notes = [
          ...healed.fixed.map((f) => `HEALED: ${f}`),
          ...audit.notes,
        ];
        cb.onStreamCode(code);
        cb.onChat(
          `G1 auto-heal applied:\n${(healed.fixed.length ? healed.fixed : ["Restored clean artifact"]).map((f) => `• ${f}`).join("\n")}`,
          "G1_CODER",
        );
      } else {
        code = artifact.code;
        audit = auditCode(code, artifact.language);
        audit.healed = true;
        audit.notes = ["HEALED: reverted to clean G1 output", ...audit.notes];
        cb.onStreamCode(code);
      }
      cb.onAgentUpdate({
        id: "g1",
        status: "completed",
        payload: "Auto-heal complete",
      });
    }

    const reportLines = audit.notes.map((n) => `• ${n}`).join("\n");
    const statusLabel = audit.passed
      ? audit.healed
        ? "Passed after auto-heal"
        : "Passed"
      : "Failed";

    cb.onAgentUpdate({
      id: "g2",
      status: audit.passed ? "completed" : "failed",
      payload: `${statusLabel}\n${reportLines}`,
      finishedAt: Date.now(),
    });
    cb.onChat(`G2 Auditor: ${statusLabel}\n${reportLines}`, "G2_AUDITOR");
    phases.push({ agent: "G2_AUDITOR", durationMs: Date.now() - g2Start });

    cb.onStreamCode(code);
    cb.onProgress?.(100, "Pipeline complete");
    cb.onPhase?.(audit.passed ? "completed" : "failed");

    return {
      plan: artifact.plan,
      code,
      language: artifact.language,
      filePath: artifact.filePath,
      previewHtml: artifact.previewHtml,
      auditNotes: audit.notes,
      title: artifact.title,
      description: artifact.description,
      affectedFiles: artifact.affectedFiles,
      taskGraph: graph,
      audit,
      phases,
      filePatches: [
        {
          path: artifact.filePath,
          content: code,
          language: artifact.language,
          op: "write" as const,
        },
      ],
    };
  }
}

export async function runMultiAgentPipeline(
  userPrompt: string,
  originalCode: string,
  cb: PipelineCallbacks,
): Promise<PipelineResult> {
  const orch = new MultiAgentOrchestrator({ signal: cb.signal });
  return orch.runPipeline(userPrompt, originalCode, cb);
}
