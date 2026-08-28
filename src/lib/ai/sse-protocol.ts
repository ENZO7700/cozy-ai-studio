/**
 * Shared SSE event contract for POST /api/agents/run
 * Events: phase | token | file | task | chat | agent | progress | error | done
 */

import type { AgentId } from "./types";
import type { PipelinePhase, TaskNode } from "./types";
import type { AuditReport } from "./auditor";

export type SseEventType =
  | "phase"
  | "token"
  | "file"
  | "task"
  | "chat"
  | "agent"
  | "progress"
  | "error"
  | "done";

export type SsePhaseEvent = { phase: PipelinePhase };
export type SseTokenEvent = {
  agent: AgentId;
  text: string;
  accumulated: string;
};
export type SseFileEvent = {
  path: string;
  content: string;
  language: string;
};
export type SseTaskEvent = {
  graph: TaskNode[];
};
export type SseChatEvent = {
  content: string;
  agent?: AgentId;
};
export type SseAgentEvent = {
  id: string;
  status?: string;
  payload?: string;
  startedAt?: number;
  finishedAt?: number;
};
export type SseProgressEvent = {
  pct: number;
  label: string;
};
export type SseErrorEvent = {
  code: string;
  agent: string;
  userMessage: string;
  detail?: string;
  exampleFix?: string;
  retryable?: boolean;
  recoverable?: boolean;
};

export type SseDonePayload = {
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
  provider: "mistral" | "demo";
  model?: string;
};

export type SsePayloadMap = {
  phase: SsePhaseEvent;
  token: SseTokenEvent;
  file: SseFileEvent;
  task: SseTaskEvent;
  chat: SseChatEvent;
  agent: SseAgentEvent;
  progress: SseProgressEvent;
  error: SseErrorEvent;
  done: SseDonePayload;
};

export function encodeSse<T extends SseEventType>(
  type: T,
  data: SsePayloadMap[T],
): string {
  return `event: ${type}\ndata: ${JSON.stringify(data)}\n\n`;
}
