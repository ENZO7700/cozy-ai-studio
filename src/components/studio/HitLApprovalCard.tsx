import { useCallback, useEffect, useState } from "react";
import { Check, X, Code2, FileCode2, Share2 } from "lucide-react";
import { toast } from "sonner";
import { useStudioStore } from "@/stores/studio-store";
import { Button } from "@/components/ui/button";
import { pushAcceptedFilesToWebContainer } from "@/hooks/useWebContainerPreview";
import {
  getActiveProjectId,
  persistTelemetry,
  resolveServerApproval,
} from "@/hooks/useProjectSync";
import { saveMyProjectFiles } from "@/lib/db/functions";
import { sharePreviewHtml } from "@/lib/share-preview";
import { trackActivation } from "@/lib/activation/client";
import { cn } from "@/lib/utils";

const BANNER_DELAY_MS = 30_000;

export function HitLApprovalCard() {
  const pending = useStudioStore((s) => s.pendingApproval);
  const preflight = useStudioStore((s) => s.preflightReport);
  const approvePending = useStudioStore((s) => s.approvePending);
  const rejectPending = useStudioStore((s) => s.rejectPending);
  const isRunning = useStudioStore((s) => s.isPipelineRunning);
  const lastPrompt = useStudioStore((s) => s.lastPrompt);
  const pipelineLatencyMs = useStudioStore((s) => s.pipelineLatencyMs);
  const setMobilePanel = useStudioStore((s) => s.setMobilePanel);
  const [sharing, setSharing] = useState(false);
  const [softBanner, setSoftBanner] = useState(false);
  const [pulse, setPulse] = useState(true);

  const blocked = preflight ? !preflight.canAccept : false;

  useEffect(() => {
    if (!pending || isRunning) {
      setSoftBanner(false);
      return;
    }
    setMobilePanel("studio");
    setPulse(true);
    const t = window.setTimeout(() => setSoftBanner(true), BANNER_DELAY_MS);
    const pulseOff = window.setTimeout(() => setPulse(false), 1600);
    requestAnimationFrame(() => {
      const el = document.querySelector("[data-diff-panel]");
      el?.scrollIntoView({ behavior: "smooth", block: "nearest" });
    });
    return () => {
      window.clearTimeout(t);
      window.clearTimeout(pulseOff);
    };
  }, [pending, isRunning, setMobilePanel]);

  const finishApprove = useCallback(async () => {
    approvePending();
    void trackActivation("accept", { source: "ui" });
    void pushAcceptedFilesToWebContainer().then(() => {
      toast.success("Changes applied", {
        description: "Preview updated · Share when ready",
      });
    });
    void (async () => {
      await resolveServerApproval("approved");
      const projectId = getActiveProjectId();
      const state = useStudioStore.getState();
      if (projectId) {
        try {
          await saveMyProjectFiles({
            data: {
              projectId,
              files: Object.values(state.files).map((f) => ({
                path: f.path,
                language: f.language,
                content: f.content,
              })),
              activeFile: state.activeFile,
            },
          });
        } catch {
          /* ignore */
        }
      }
      await persistTelemetry({
        prompt: lastPrompt,
        status: "APPROVED",
        agentType: "G0-G1-G2",
        latencyMs: pipelineLatencyMs,
        projectId,
      });
    })();
    setMobilePanel("preview");
  }, [approvePending, lastPrompt, pipelineLatencyMs, setMobilePanel]);

  const onApprove = useCallback(() => {
    if (blocked) {
      toast.error("Preflight blocked Accept", {
        description: "Patch contract failed — retry the pipeline.",
      });
      return;
    }
    void finishApprove();
  }, [blocked, finishApprove]);

  const onAcceptAndShare = useCallback(async () => {
    if (blocked) {
      toast.error("Preflight blocked Accept", {
        description: "Patch contract failed — retry the pipeline.",
      });
      return;
    }
    const html =
      useStudioStore.getState().pendingApproval?.previewHtml ||
      useStudioStore.getState().previewHtml;
    const title =
      useStudioStore.getState().pendingApproval?.title || "Cozy preview";
    await finishApprove();
    setSharing(true);
    try {
      await sharePreviewHtml(html, {
        title,
        promptPreview: lastPrompt?.slice(0, 280),
      });
    } finally {
      setSharing(false);
    }
  }, [blocked, finishApprove, lastPrompt]);

  const onReject = useCallback(() => {
    rejectPending();
    void trackActivation("reject", { source: "ui" });
  }, [rejectPending]);

  useEffect(() => {
    if (!pending || isRunning) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (
        tag === "INPUT" ||
        tag === "TEXTAREA" ||
        (e.target as HTMLElement)?.isContentEditable
      )
        return;
      if (e.key === "Enter" && !e.metaKey && !e.ctrlKey) {
        e.preventDefault();
        if (e.shiftKey) void onAcceptAndShare();
        else onApprove();
      }
      if (e.key === "Escape") {
        e.preventDefault();
        onReject();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [pending, isRunning, onApprove, onReject, onAcceptAndShare]);

  if (!pending || isRunning) return null;

  return (
    <div
      data-hitl-card
      data-hitl-overlay
      role="dialog"
      aria-label="Human-in-the-Loop approval"
      className="pointer-events-none fixed inset-x-0 z-[60] flex justify-center cosy-fixed-bottom px-3 sm:px-4"
    >
      <div className="pointer-events-auto w-full max-w-lg space-y-2">
        {softBanner && (
          <div
            role="status"
            className="rounded-xl border border-[#D96B43]/40 bg-[#D96B43]/12 px-3 py-2 text-center text-[12px] font-medium text-foreground shadow-[var(--shadow-glass)] backdrop-blur-md"
          >
            Schváľ zmeny, aby sa propsali do Live Preview
          </div>
        )}

        <div className="rounded-2xl border border-border bg-card/95 p-4 shadow-[var(--shadow-elevated)] space-y-3 backdrop-blur-md">
          <div className="flex items-start gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#D96B43]/15 text-[#D96B43]">
              <Code2 className="h-4 w-4" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">
                Human-in-the-Loop
              </p>
              <h3 className="font-serif text-base font-semibold truncate">
                {pending.title}
              </h3>
              <p className="mt-1 text-xs text-muted-foreground leading-relaxed line-clamp-3">
                {pending.description}
              </p>
            </div>
          </div>

          {pending.affectedFiles?.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {pending.affectedFiles.map((f) => (
                <span
                  key={f}
                  className="inline-flex items-center gap-1 rounded-md border border-border bg-muted/60 px-2 py-0.5 font-mono text-[10px] text-muted-foreground"
                >
                  <FileCode2 className="h-3 w-3" />
                  {f}
                </span>
              ))}
            </div>
          )}

          {(preflight?.previewStyleRisk ||
            preflight?.checks?.some(
              (c) => c.id === "preview-css" && c.status === "warn",
            )) && (
            <div
              role="status"
              data-preview-style-risk
              className="rounded-xl border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-[11px] leading-relaxed text-foreground"
            >
              <span className="font-semibold text-amber-700 dark:text-amber-400">
                Preview may be unstyled
              </span>
              {" — "}
              WebContainer has no Tailwind. Prefer a self-contained{" "}
              <code className="font-mono text-[10px]">{"<style>"}</code>{" "}
              layout (or retry with “no Tailwind / use CSS”).
            </div>
          )}

          <div className="flex flex-col gap-2 sm:flex-row">
            <Button
              type="button"
              className={cn(
                "flex-1 min-h-11 h-11 rounded-xl gap-1.5 bg-[#D96B43] text-white hover:bg-[#C85A32] border-0",
                pulse && "accept-pulse-once",
              )}
              disabled={blocked || sharing}
              onClick={() => void onAcceptAndShare()}
            >
              <Share2 className="h-4 w-4" />
              Accept + Share link
            </Button>
            <Button
              type="button"
              variant="secondary"
              className={cn(
                "flex-1 min-h-11 h-11 rounded-xl border border-[#D96B43]/35",
                pulse && "accept-pulse-once",
              )}
              disabled={blocked || sharing}
              onClick={onApprove}
            >
              <Check className="h-4 w-4" />
              Accept only
            </Button>
            <Button
              type="button"
              variant="outline"
              className="min-h-11 h-11 rounded-xl sm:w-auto"
              disabled={sharing}
              onClick={onReject}
            >
              <X className="h-4 w-4" />
              Reject
            </Button>
          </div>
          <p className="text-[10px] text-center text-muted-foreground">
            <kbd className="rounded border border-border bg-muted px-1 font-mono text-[10px]">
              Enter
            </kbd>{" "}
            = Accept ·{" "}
            <kbd className="rounded border border-border bg-muted px-1 font-mono text-[10px]">
              Shift+Enter
            </kbd>{" "}
            = Accept + Share ·{" "}
            <kbd className="rounded border border-border bg-muted px-1 font-mono text-[10px]">
              Esc
            </kbd>{" "}
            = Reject
          </p>
        </div>
      </div>
    </div>
  );
}
