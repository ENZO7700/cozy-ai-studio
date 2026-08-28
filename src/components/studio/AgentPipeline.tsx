import {
  Brain,
  Code2,
  ShieldCheck,
  Circle,
  Square,
  GitBranch,
  Loader2,
  ChevronDown,
} from "lucide-react";
import { useState } from "react";
import { useStudioStore, type AgentStatus } from "@/stores/studio-store";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

const icons = {
  G0_PLANNER: Brain,
  G1_CODER: Code2,
  G2_AUDITOR: ShieldCheck,
};

const shortLabel: Record<string, string> = {
  G0_PLANNER: "G0",
  G1_CODER: "G1",
  G2_AUDITOR: "G2",
};

const statusColor: Record<AgentStatus, string> = {
  idle: "bg-muted-foreground/30",
  pending: "bg-muted-foreground/50",
  in_progress: "bg-choco agent-pulse",
  completed: "bg-success",
  failed: "bg-danger",
};

const phaseLabel: Record<string, string> = {
  idle: "Pripravené",
  planning: "Plánovanie",
  coding: "Kódovanie",
  auditing: "Audit",
  healing: "Oprava",
  completed: "Hotovo",
  failed: "Chyba",
  cancelled: "Zrušené",
};

export function AgentPipeline({ compact = false }: { compact?: boolean }) {
  const agents = useStudioStore((s) => s.agents);
  const isPipelineRunning = useStudioStore((s) => s.isPipelineRunning);
  const pipelinePhase = useStudioStore((s) => s.pipelinePhase);
  const pipelineProgress = useStudioStore((s) => s.pipelineProgress);
  const pipelineProgressLabel = useStudioStore((s) => s.pipelineProgressLabel);
  const taskGraph = useStudioStore((s) => s.taskGraph);
  const cancelPipeline = useStudioStore((s) => s.cancelPipeline);
  const pipelineLatencyMs = useStudioStore((s) => s.pipelineLatencyMs);
  const [detailsOpen, setDetailsOpen] = useState(false);

  const showDetails =
    !compact && (detailsOpen || (!isPipelineRunning && taskGraph.length > 0));

  return (
    <div className="rounded-2xl border border-border bg-card p-2.5 sm:p-3 shadow-sm min-w-0 overflow-hidden">
      {/* Header — wraps, never crushes */}
      <div className="mb-2.5 flex flex-wrap items-center gap-2 min-w-0">
        <h3 className="font-serif text-sm font-semibold shrink-0">Pipeline</h3>
        <div className="flex flex-1 flex-wrap items-center justify-end gap-1.5 min-w-0">
          {isPipelineRunning ? (
            <>
              <span className="inline-flex max-w-full items-center gap-1 rounded-full bg-choco/10 px-2 py-0.5 text-xs font-medium text-choco">
                <Loader2 className="h-3 w-3 animate-spin shrink-0" />
                <span className="truncate">{phaseLabel[pipelinePhase] ?? "Beží"}</span>
              </span>
              <Button
                size="sm"
                variant="danger"
                className="h-7 px-2 text-xs shrink-0"
                onClick={cancelPipeline}
                aria-label="Zastaviť pipeline"
              >
                <Square className="h-3 w-3" />
                Stop
              </Button>
            </>
          ) : pipelinePhase === "completed" && pipelineLatencyMs > 0 ? (
            <span className="text-xs font-mono text-muted-foreground tabular-nums">
              {(pipelineLatencyMs / 1000).toFixed(1)}s
            </span>
          ) : (
            <div className="flex items-center gap-1">
              {(["G0", "G1", "G2"] as const).map((g) => (
                <span
                  key={g}
                  className="rounded-full border border-border bg-muted/60 px-2 py-0.5 text-[10px] font-mono font-semibold text-muted-foreground"
                >
                  {g}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Progress */}
      {(isPipelineRunning || pipelineProgress > 0) && (
        <div className="mb-2.5 min-w-0">
          <div className="mb-1 flex items-center justify-between gap-2 text-xs text-muted-foreground">
            <span className="truncate min-w-0">
              {pipelineProgressLabel || phaseLabel[pipelinePhase]}
            </span>
            <span className="font-mono tabular-nums shrink-0">
              {Math.round(pipelineProgress)}%
            </span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-choco transition-all duration-300 ease-out"
              style={{ width: `${Math.min(100, pipelineProgress)}%` }}
            />
          </div>
        </div>
      )}

      {/* Stage chips — single row, icon + short code; labels don't stack vertically */}
      <div className="grid grid-cols-3 gap-1.5 min-w-0">
        {agents.map((agent) => {
          const Icon = icons[agent.agent];
          return (
            <div
              key={agent.id}
              className={cn(
                "flex min-w-0 flex-col items-center gap-1 rounded-xl border px-1.5 py-2 text-center transition-all",
                agent.status === "in_progress" && "border-choco/50 bg-choco/10",
                agent.status === "completed" && "border-success/30 bg-success-bg/50",
                agent.status === "idle" && "border-border bg-muted/40",
                agent.status === "failed" && "border-danger/40 bg-danger-bg",
                agent.status === "pending" && "border-border bg-muted/30",
              )}
              title={`${agent.label}: ${agent.status}`}
            >
              <div className="relative">
                <Icon
                  className={cn(
                    "h-4 w-4",
                    agent.status === "in_progress"
                      ? "text-choco"
                      : agent.status === "completed"
                        ? "text-success"
                        : "text-muted-foreground",
                  )}
                />
                <span
                  className={cn(
                    "absolute -right-0.5 -top-0.5 h-1.5 w-1.5 rounded-full",
                    statusColor[agent.status],
                  )}
                />
              </div>
              <span className="text-xs font-semibold tabular-nums leading-none">
                {shortLabel[agent.agent] ?? agent.label}
              </span>
              <span className="w-full truncate text-[11px] font-medium text-muted-foreground leading-none">
                {agent.status === "in_progress"
                  ? "beží"
                  : agent.status === "completed"
                    ? "ok"
                    : agent.status === "failed"
                      ? "fail"
                      : agent.status === "pending"
                        ? "…"
                        : "—"}
              </span>
            </div>
          );
        })}
      </div>

      {/* Collapsible details — keeps left rail usable while agents run */}
      {(taskGraph.length > 0 || agents.some((a) => a.payload && a.payload !== "Waiting…")) && (
        <div className="mt-2.5 min-w-0">
          <button
            type="button"
            onClick={() => setDetailsOpen((v) => !v)}
            className="flex w-full items-center gap-1.5 rounded-lg px-1 py-1 text-xs font-medium text-muted-foreground hover:text-foreground"
          >
            <ChevronDown
              className={cn(
                "h-3.5 w-3.5 transition-transform",
                showDetails && "rotate-180",
              )}
            />
            Detail pipeline
            {taskGraph.length > 0 && (
              <span className="ml-auto font-mono tabular-nums">
                {taskGraph.filter((t) => t.status === "completed").length}/
                {taskGraph.length}
              </span>
            )}
          </button>

          {showDetails && (
            <div className="mt-1.5 space-y-2 min-w-0">
              {taskGraph.length > 0 && (
                <div className="rounded-xl border border-border bg-muted/30 p-2 min-w-0">
                  <div className="mb-1.5 flex items-center gap-1.5">
                    <GitBranch className="h-3 w-3 text-success shrink-0" />
                    <span className="text-xs font-semibold text-muted-foreground">
                      Úlohy
                    </span>
                  </div>
                  <ul className="space-y-1 max-h-24 overflow-auto cosy-scroll">
                    {taskGraph.map((node) => (
                      <li
                        key={node.id}
                        className="flex items-start gap-2 text-xs leading-snug min-w-0"
                      >
                        <span
                          className={cn(
                            "mt-1 h-1.5 w-1.5 shrink-0 rounded-full",
                            node.status === "completed" && "bg-success",
                            node.status === "in_progress" && "bg-choco agent-pulse",
                            node.status === "failed" && "bg-danger",
                            node.status === "pending" && "bg-muted-foreground/30",
                          )}
                        />
                        <div className="min-w-0 flex-1 overflow-hidden">
                          <p className="truncate text-foreground/90">{node.title}</p>
                          {node.detail && (
                            <p className="truncate text-muted-foreground font-mono text-[11px]">
                              {node.detail}
                            </p>
                          )}
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              <div className="max-h-24 overflow-auto cosy-scroll rounded-xl bg-muted/50 p-2 min-w-0">
                {agents.map((agent) => (
                  <div key={agent.id} className="mb-2 last:mb-0 min-w-0">
                    <div className="flex items-center gap-1.5 mb-0.5 min-w-0">
                      <Circle
                        className={cn(
                          "h-1.5 w-1.5 fill-current shrink-0",
                          agent.status === "in_progress"
                            ? "text-choco"
                            : agent.status === "completed"
                              ? "text-success"
                              : "text-muted-foreground/40",
                        )}
                      />
                      <span className="text-xs font-mono font-semibold text-muted-foreground truncate">
                        {agent.agent}
                      </span>
                    </div>
                    <pre className="whitespace-pre-wrap break-words font-mono text-[11px] leading-relaxed text-foreground/80 pl-3 overflow-hidden">
                      {agent.payload}
                    </pre>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
