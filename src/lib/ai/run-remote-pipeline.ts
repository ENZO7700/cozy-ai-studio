/**
 * Client consumer for POST /api/agents/run (SSE).
 * Maps events → same PipelineCallbacks as the mock orchestrator.
 */

import { getBearerToken } from "@/lib/auth/client";
import type { PipelineCallbacks, PipelineResult } from "./orchestrator";
import { PipelineError } from "./errors";
import type {
  SseDonePayload,
  SseErrorEvent,
  SseEventType,
  SsePayloadMap,
} from "./sse-protocol";

export type RemotePipelineRequest = {
  prompt: string;
  originalCode: string;
  activeFile?: string;
  projectId?: string;
  files?: Record<string, { path: string; language: string; content: string }>;
};

function parseSseChunk(
  block: string,
): { type: SseEventType; data: unknown } | null {
  let type: string | null = null;
  const dataLines: string[] = [];
  for (const line of block.split("\n")) {
    if (line.startsWith("event:")) type = line.slice(6).trim();
    else if (line.startsWith("data:")) dataLines.push(line.slice(5).trim());
  }
  if (!type || dataLines.length === 0) return null;
  try {
    return {
      type: type as SseEventType,
      data: JSON.parse(dataLines.join("\n")),
    };
  } catch {
    return null;
  }
}

/**
 * Run production pipeline via SSE.
 * Throws PipelineError on error/abort.
 */
export async function runRemoteMultiAgentPipeline(
  req: RemotePipelineRequest,
  cb: PipelineCallbacks,
): Promise<PipelineResult> {
  const signal = cb.signal;
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Accept: "text/event-stream",
  };
  const bearer = getBearerToken();
  if (bearer) headers.Authorization = `Bearer ${bearer}`;

  const res = await fetch("/api/agents/run", {
    method: "POST",
    headers,
    body: JSON.stringify({
      prompt: req.prompt,
      originalCode: req.originalCode,
      activeFile: req.activeFile,
      projectId: req.projectId,
      files: req.files,
    }),
    signal,
  });

  if (res.status === 401) {
    throw new PipelineError({
      code: "UNKNOWN",
      agent: "ORCHESTRATOR",
      message: "UNAUTHORIZED",
      userMessage: "Sign in required to run agents.",
      detail: "POST /api/agents/run returned 401",
      retryable: false,
      recoverable: true,
      exampleFix: "Open /login and sign in, then retry.",
    });
  }

  if (res.status === 409) {
    throw new PipelineError({
      code: "UNKNOWN",
      agent: "ORCHESTRATOR",
      message: "DEMO_PIPELINE",
      userMessage: "Server is in demo mode.",
      detail: "DEMO_PIPELINE=true",
      retryable: false,
      recoverable: true,
    });
  }

  if (res.status === 503) {
    let detail = "MISTRAL_API_KEY missing";
    try {
      const j = (await res.json()) as { message?: string; hint?: string };
      detail = [j.message, j.hint].filter(Boolean).join(" — ");
    } catch {
      /* ignore */
    }
    throw new PipelineError({
      code: "UNKNOWN",
      agent: "ORCHESTRATOR",
      message: "MISSING_API_KEY",
      userMessage: "Production AI is not configured (no Mistral key).",
      detail,
      retryable: false,
      recoverable: true,
      exampleFix: "Set MISTRAL_API_KEY or VITE_DEMO_PIPELINE=true for mock.",
    });
  }

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    let userMessage = "Failed to start agent pipeline.";
    let detail = text.slice(0, 400);
    let retryable = true;
    if (res.status === 429) {
      retryable = false;
      userMessage = "Prompt quota reached.";
      try {
        const j = JSON.parse(text) as {
          message?: string;
          promptsUsed?: number;
          promptLimit?: number;
          dailyUsed?: number;
          dailyLimit?: number | null;
        };
        if (j.message) userMessage = j.message;
        if (j.dailyLimit != null) {
          detail = `Daily ${j.dailyUsed ?? "?"}/${j.dailyLimit} · Monthly ${j.promptsUsed ?? "?"}/${j.promptLimit ?? "?"}`;
        } else if (j.promptLimit != null) {
          detail = `${j.promptsUsed ?? "?"}/${j.promptLimit} prompts this month`;
        } else if (j.message) {
          detail = j.message;
        }
      } catch {
        /* keep raw text */
      }
    }
    throw new PipelineError({
      code: res.status === 429 ? "RATE_LIMIT" : "NETWORK",
      agent: "ORCHESTRATOR",
      message: `HTTP ${res.status}`,
      userMessage,
      detail,
      retryable,
      recoverable: true,
      exampleFix:
        res.status === 429
          ? "Wait until tomorrow (daily free cap) or next month (monthly free cap)."
          : undefined,
    });
  }

  if (!res.body) {
    throw new PipelineError({
      code: "NETWORK",
      agent: "ORCHESTRATOR",
      message: "No response body",
      userMessage: "Empty pipeline response.",
      retryable: true,
      recoverable: true,
    });
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let donePayload: SseDonePayload | undefined;
  let lastError: SseErrorEvent | undefined;
  const streamedFiles = new Map<string, { content: string; language: string }>();

  while (true) {
    if (signal?.aborted) {
      await reader.cancel().catch(() => undefined);
      throw new DOMException("Pipeline aborted", "AbortError");
    }
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    let idx: number;
    while ((idx = buffer.indexOf("\n\n")) !== -1) {
      const block = buffer.slice(0, idx);
      buffer = buffer.slice(idx + 2);
      if (!block.trim() || block.startsWith(":")) continue;
      const parsed = parseSseChunk(block);
      if (!parsed) continue;

      switch (parsed.type) {
        case "phase":
          cb.onPhase?.((parsed.data as SsePayloadMap["phase"]).phase);
          break;
        case "progress": {
          const p = parsed.data as SsePayloadMap["progress"];
          cb.onProgress?.(p.pct, p.label);
          break;
        }
        case "chat": {
          const c = parsed.data as SsePayloadMap["chat"];
          cb.onChat(c.content, c.agent);
          break;
        }
        case "agent": {
          const a = parsed.data as SsePayloadMap["agent"];
          cb.onAgentUpdate({
            id: a.id,
            status: a.status as never,
            payload: a.payload,
            startedAt: a.startedAt,
            finishedAt: a.finishedAt,
          });
          break;
        }
        case "task":
          cb.onTaskGraph?.((parsed.data as SsePayloadMap["task"]).graph);
          break;
        case "token": {
          const t = parsed.data as SsePayloadMap["token"];
          if (t.accumulated) cb.onStreamCode(t.accumulated);
          break;
        }
        case "file": {
          const f = parsed.data as SsePayloadMap["file"];
          streamedFiles.set(f.path, {
            content: f.content,
            language: f.language,
          });
          break;
        }
        case "error":
          lastError = parsed.data as SseErrorEvent;
          break;
        case "done":
          donePayload = parsed.data as SseDonePayload;
          break;
        default:
          break;
      }
    }
  }

  if (donePayload) {
    if (!donePayload.code && streamedFiles.size) {
      const primary = streamedFiles.get(donePayload.filePath);
      if (primary) donePayload.code = primary.content;
    }
    return {
      plan: donePayload.plan,
      code: donePayload.code,
      language: donePayload.language,
      filePath: donePayload.filePath,
      previewHtml: donePayload.previewHtml,
      auditNotes: donePayload.auditNotes,
      title: donePayload.title,
      description: donePayload.description,
      affectedFiles: donePayload.affectedFiles,
      taskGraph: donePayload.taskGraph,
      audit: donePayload.audit,
      phases: donePayload.phases,
      filePatches: Array.from(streamedFiles.entries()).map(([path, v]) => ({
        path,
        content: v.content,
        language: v.language,
        op: "write" as const,
      })),
    };
  }

  if (lastError) {
    throw new PipelineError({
      code: (lastError.code as PipelineError["code"]) || "UNKNOWN",
      agent: (lastError.agent as PipelineError["agent"]) || "ORCHESTRATOR",
      message: lastError.userMessage,
      userMessage: lastError.userMessage,
      detail: lastError.detail,
      exampleFix: lastError.exampleFix,
      retryable: lastError.retryable ?? true,
      recoverable: lastError.recoverable ?? true,
    });
  }

  throw new PipelineError({
    code: "UNKNOWN",
    agent: "ORCHESTRATOR",
    message: "Stream ended without done",
    userMessage: "Agent pipeline ended unexpectedly.",
    retryable: true,
    recoverable: true,
  });
}

export function isClientDemoPipeline(): boolean {
  try {
    return import.meta.env.VITE_DEMO_PIPELINE === "true";
  } catch {
    return false;
  }
}

export async function fetchAgentStatus(): Promise<{
  provider: string;
  mistralKeyPresent: boolean;
  demoPipeline: boolean;
  authenticated?: boolean;
} | null> {
  try {
    const headers: Record<string, string> = {};
    const bearer = getBearerToken();
    if (bearer) headers.Authorization = `Bearer ${bearer}`;
    const res = await fetch("/api/agents/run", { method: "GET", headers });
    if (!res.ok) return null;
    return (await res.json()) as {
      provider: string;
      mistralKeyPresent: boolean;
      demoPipeline: boolean;
      authenticated?: boolean;
    };
  } catch {
    return null;
  }
}
