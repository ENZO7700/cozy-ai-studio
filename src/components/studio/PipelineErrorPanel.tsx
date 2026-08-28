import { AlertTriangle, RotateCcw, X, BookOpen, Loader2 } from "lucide-react";
import { useStudioStore } from "@/stores/studio-store";
import { ERROR_HANDLING_EXAMPLES, type PipelineErrorCode } from "@/lib/ai/errors";
import { runStudioPipeline } from "@/lib/ai/run-studio-pipeline";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const codeTone: Partial<Record<PipelineErrorCode, string>> = {
  RATE_LIMIT: "bg-amber-500/15 text-amber-800 dark:text-amber-200",
  TIMEOUT: "bg-amber-500/15 text-amber-800 dark:text-amber-200",
  NETWORK: "bg-amber-500/15 text-amber-800 dark:text-amber-200",
  G0_PLAN_FAILED: "bg-danger-bg text-danger",
  G1_CODE_FAILED: "bg-danger-bg text-danger",
  G2_AUDIT_FAILED: "bg-danger-bg text-danger",
  UNHEALABLE: "bg-danger-bg text-danger",
  EMPTY_PROMPT: "bg-muted text-muted-foreground",
  ABORTED: "bg-muted text-muted-foreground",
  UNKNOWN: "bg-danger-bg text-danger",
};

export function PipelineErrorPanel() {
  const lastError = useStudioStore((s) => s.lastPipelineError);
  const lastPrompt = useStudioStore((s) => s.lastPrompt);
  const clearPipelineError = useStudioStore((s) => s.clearPipelineError);
  const isRunning = useStudioStore((s) => s.isPipelineRunning);
  const retryAttempt = useStudioStore((s) => s.retryAttempt);
  const retryMaxAttempts = useStudioStore((s) => s.retryMaxAttempts);

  if (!lastError) return null;

  return (
    <div
      role="alert"
      className="rounded-2xl border border-danger/30 bg-danger-bg/40 p-3 shadow-sm"
    >
      <div className="flex items-start gap-2.5">
        <div className="mt-0.5 rounded-lg bg-danger/10 p-1.5 text-danger shrink-0">
          <AlertTriangle className="h-4 w-4" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap mb-1">
            <h4 className="font-serif text-sm font-semibold text-foreground">
              Pipeline error
            </h4>
            <span
              className={cn(
                "rounded-md px-1.5 py-0.5 text-xs font-mono font-semibold",
                codeTone[lastError.code] ?? "bg-muted text-muted-foreground",
              )}
            >
              {lastError.code}
            </span>
            <span className="text-xs font-mono text-muted-foreground">
              {lastError.agent}
            </span>
            {retryMaxAttempts > 1 && (
              <span className="text-xs font-mono text-muted-foreground">
                {retryAttempt + 1}/{retryMaxAttempts} attempts
              </span>
            )}
          </div>
          <p className="text-xs text-foreground/90 leading-relaxed">
            {lastError.userMessage}
          </p>
          {lastError.detail && (
            <pre className="mt-2 whitespace-pre-wrap break-words rounded-lg bg-background/60 border border-border px-2 py-1.5 font-mono text-xs text-muted-foreground">
              {lastError.detail}
            </pre>
          )}
          {lastError.exampleFix && (
            <p className="mt-2 text-xs text-muted-foreground">
              <span className="font-semibold text-foreground/80">Recovery: </span>
              {lastError.exampleFix}
            </p>
          )}
          <div className="mt-3 flex flex-wrap gap-2">
            {lastError.retryable && lastPrompt && (
              <Button
                size="sm"
                className="h-8 text-xs"
                disabled={isRunning}
                onClick={() => {
                  clearPipelineError();
                  void runStudioPipeline(lastPrompt, { autoRetry: true });
                }}
              >
                <RotateCcw className="h-3.5 w-3.5" />
                Retry with backoff
              </Button>
            )}
            <Button
              size="sm"
              variant="secondary"
              className="h-8 text-xs"
              onClick={clearPipelineError}
            >
              <X className="h-3.5 w-3.5" />
              Dismiss
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

/** Live auto-retry countdown banner */
export function RetryProgressBanner() {
  const isAutoRetrying = useStudioStore((s) => s.isAutoRetrying);
  const isRunning = useStudioStore((s) => s.isPipelineRunning);
  const countdown = useStudioStore((s) => s.retryCountdownMs);
  const attempt = useStudioStore((s) => s.retryAttempt);
  const max = useStudioStore((s) => s.retryMaxAttempts);
  const cancelPipeline = useStudioStore((s) => s.cancelPipeline);
  const label = useStudioStore((s) => s.pipelineProgressLabel);

  if (!isAutoRetrying && !(isRunning && attempt > 0)) return null;

  const waiting = countdown > 0;

  return (
    <div className="rounded-2xl border border-terracotta/30 bg-terracotta/5 p-3 shadow-sm">
      <div className="flex items-center gap-2.5">
        <Loader2 className="h-4 w-4 text-terracotta shrink-0 animate-spin" />
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold text-foreground">
            {waiting
              ? `Auto-retry in ${(countdown / 1000).toFixed(1)}s`
              : "Auto-retry running"}
          </p>
          <p className="text-xs text-muted-foreground font-mono truncate">
            {max > 0 ? `Attempt ${Math.min(attempt + 1, max)}/${max}` : `Attempt ${attempt + 1}`}
            {label ? ` · ${label}` : ""}
          </p>
        </div>
        <Button
          size="sm"
          variant="danger"
          className="h-8 text-xs shrink-0"
          onClick={cancelPipeline}
        >
          Cancel
        </Button>
      </div>
      {waiting && (
        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted">
          <div className="h-full w-full origin-left animate-pulse rounded-full bg-terracotta/70" />
        </div>
      )}
    </div>
  );
}

/** Catalog of error-handling demo prompts */
export function ErrorHandlingExamples({
  onRun,
  disabled,
}: {
  onRun: (prompt: string) => void;
  disabled?: boolean;
}) {
  return (
    <div className="rounded-2xl border border-border bg-muted/30 p-3 shadow-sm min-w-0 overflow-hidden">
      <div className="mb-2 flex items-center gap-2 min-w-0">
        <BookOpen className="h-3.5 w-3.5 text-success shrink-0" />
        <span className="text-xs font-semibold text-muted-foreground truncate">
          Príklady chýb
        </span>
      </div>
      <p className="text-xs text-muted-foreground mb-2 leading-relaxed break-words">
        Dočasné chyby sa skúsia znova; fatálne zastavia pipeline.
      </p>
      <div className="flex flex-col gap-1.5 min-w-0">
        {ERROR_HANDLING_EXAMPLES.map((ex) => (
          <button
            key={ex.id}
            type="button"
            disabled={disabled}
            title={ex.description}
            onClick={() => onRun(ex.prompt)}
            className="rounded-lg border border-border bg-muted/40 px-2 py-1 text-xs text-muted-foreground hover:border-terracotta/40 hover:text-foreground transition-colors disabled:opacity-50 text-left min-h-8"
          >
            {ex.label}
          </button>
        ))}
      </div>
    </div>
  );
}
