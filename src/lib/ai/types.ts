/** Canonical agent identity for pipeline + SSE (store-free). */
export type AgentId = "G0_PLANNER" | "G1_CODER" | "G2_AUDITOR";

/** @deprecated Prefer AgentId — kept for existing TaskNode consumers. */
export type AgentRole = AgentId;

export interface TaskNode {
  id: string;
  title: string;
  agent: AgentRole;
  dependsOn: string[];
  status: "pending" | "in_progress" | "completed" | "failed";
  detail?: string;
}

export type PipelinePhase =
  | "idle"
  | "planning"
  | "coding"
  | "auditing"
  | "healing"
  | "completed"
  | "failed"
  | "cancelled";
