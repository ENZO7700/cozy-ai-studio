import { useEffect, useMemo, useRef, useState } from "react";
import { DiffEditor, loader } from "@monaco-editor/react";
import type { editor } from "monaco-editor";
import { Check, X, Code2, Loader2 } from "lucide-react";
import { useStudioStore } from "@/stores/studio-store";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { PreflightBar } from "./PreflightBar";
import { pushAcceptedFilesToWebContainer } from "@/hooks/useWebContainerPreview";

// Configure Monaco CDN loader once
loader.config({
  paths: {
    vs: "https://cdn.jsdelivr.net/npm/monaco-editor@0.52.2/min/vs",
  },
});

function FallbackDiff({
  original,
  modified,
}: {
  original: string;
  modified: string;
}) {
  const lines = useMemo(() => {
    const o = original.split("\n");
    const m = modified.split("\n");
    const max = Math.max(o.length, m.length);
    const rows: { type: "same" | "add" | "del"; text: string; n: number }[] = [];
    for (let i = 0; i < max; i++) {
      const a = o[i];
      const b = m[i];
      if (a === b) {
        rows.push({ type: "same", text: b ?? a ?? "", n: i + 1 });
      } else {
        if (a !== undefined && a !== b) rows.push({ type: "del", text: a, n: i + 1 });
        if (b !== undefined && b !== a) rows.push({ type: "add", text: b, n: i + 1 });
      }
    }
    return rows;
  }, [original, modified]);

  return (
    <div className="h-full overflow-auto cosy-scroll font-mono text-[12.5px] leading-5 p-3 bg-canvas text-canvas-fg">
      {lines.map((row, i) => (
        <div
          key={`${row.n}-${i}-${row.type}`}
          className={cn(
            "flex gap-3 px-2 rounded-sm",
            row.type === "add" && "diff-add",
            row.type === "del" && "diff-del",
          )}
        >
          <span className="w-8 shrink-0 text-right opacity-55 select-none text-canvas-muted tabular-nums">
            {row.n}
          </span>
          <span className="w-5 shrink-0 opacity-60 select-none">
            {row.type === "add" ? ">>" : row.type === "del" ? "<<" : "  "}
          </span>
          <pre className="flex-1 whitespace-pre-wrap break-all font-mono">{row.text || " "}</pre>
        </div>
      ))}
    </div>
  );
}

export function CodeDiffViewer() {
  const theme = useStudioStore((s) => s.theme);
  const originalCode = useStudioStore((s) => s.originalCode);
  const modifiedCode = useStudioStore((s) => s.modifiedCode);
  const language = useStudioStore((s) => s.language);
  const diffChunks = useStudioStore((s) => s.diffChunks);
  const acceptChunk = useStudioStore((s) => s.acceptChunk);
  const rejectChunk = useStudioStore((s) => s.rejectChunk);
  const acceptAllDiffs = useStudioStore((s) => s.acceptAllDiffs);
  const rejectAllDiffs = useStudioStore((s) => s.rejectAllDiffs);
  const isPipelineRunning = useStudioStore((s) => s.isPipelineRunning);
  const activeFile = useStudioStore((s) => s.activeFile);

  const [monacoReady, setMonacoReady] = useState(false);
  const [monacoFailed, setMonacoFailed] = useState(false);
  const [allowMonaco, setAllowMonaco] = useState(false);
  const editorRef = useRef<editor.IStandaloneDiffEditor | null>(null);

  // Option B: Monaco desktop-only (mobile uses lightweight FallbackDiff)
  useEffect(() => {
    const mq = window.matchMedia("(min-width: 1024px)");
    const update = () => setAllowMonaco(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);

  useEffect(() => {
    if (!allowMonaco) {
      setMonacoReady(false);
      setMonacoFailed(false);
      return;
    }
    let cancelled = false;
    loader
      .init()
      .then(() => {
        if (!cancelled) setMonacoReady(true);
      })
      .catch(() => {
        if (!cancelled) setMonacoFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [allowMonaco]);

  const hasDiff = originalCode !== modifiedCode;
  const langLabel =
    language === "typescript" ? "TSX" : language === "css" ? "CSS" : language.toUpperCase();

  return (
    <div className="relative flex h-full min-h-0 w-full flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-[var(--shadow-glass)]">
      <div className="flex items-center justify-between gap-3 border-b border-border bg-muted/80 px-4 py-2.5">
        <div className="flex items-center gap-2 min-w-0">
          <Code2 className="h-4 w-4 text-terracotta shrink-0" />
          <div className="min-w-0">
            <span className="font-serif text-sm font-semibold truncate block">Diff</span>
            <span className="text-[11px] font-mono text-muted-foreground truncate hidden sm:block">
              {activeFile || "preview/index.html"}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {isPipelineRunning && (
            <span className="flex items-center gap-1.5 text-xs text-terracotta font-medium">
              <Loader2 className="h-3 w-3 animate-spin" />
              Streaming
            </span>
          )}
          <span className="rounded-md bg-background/80 px-2 py-0.5 text-xs font-mono text-muted-foreground border border-border">
            {langLabel}
          </span>
          {hasDiff && !isPipelineRunning && (
            <>
              <Button size="sm" variant="danger" onClick={rejectAllDiffs} className="h-7 text-xs">
                Reject all
              </Button>
              <Button
                size="sm"
                onClick={() => {
                  acceptAllDiffs();
                  void pushAcceptedFilesToWebContainer();
                }}
                className="h-7 text-xs"
              >
                Accept all
              </Button>
            </>
          )}
        </div>
      </div>

      <div className="px-3 pt-2">
        <PreflightBar />
      </div>

      {/* Inline chunk actions */}
      {hasDiff && diffChunks.length > 0 && !isPipelineRunning && (
        <div className="flex flex-wrap gap-1.5 border-b border-border bg-muted/40 px-3 py-2">
          {diffChunks.map((chunk) => (
            <div
              key={chunk.id}
              className={cn(
                "flex items-center gap-1 rounded-lg border px-2 py-1 text-xs font-mono",
                chunk.accepted === true && "border-success/40 bg-success-bg text-success",
                chunk.accepted === false && "border-danger/40 bg-danger-bg text-danger",
                chunk.accepted === null && "border-border bg-background text-muted-foreground",
              )}
            >
              <span>
                L{chunk.startLine}
                {chunk.endLine !== chunk.startLine ? `–${chunk.endLine}` : ""}
              </span>
              <button
                type="button"
                aria-label="Accept chunk"
                className="rounded p-0.5 hover:bg-success-bg text-success"
                onClick={() => acceptChunk(chunk.id)}
              >
                <Check className="h-3 w-3" />
              </button>
              <button
                type="button"
                aria-label="Reject chunk"
                className="rounded p-0.5 hover:bg-danger-bg text-danger"
                onClick={() => rejectChunk(chunk.id)}
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          ))}
        </div>
      )}

      <div className={cn("relative min-h-0 flex-1 bg-canvas", isPipelineRunning && "stream-caret")}>
        {!hasDiff && !isPipelineRunning ? (
          <div className="flex h-full min-h-[12rem] flex-col items-center justify-center gap-2 px-6 text-center bg-[#F4F1EA]/40 dark:bg-canvas">
            <p className="font-serif text-lg font-semibold text-foreground/80">No Diff yet</p>
            <p className="max-w-sm text-sm text-muted-foreground leading-relaxed">
              Send a brief. When G2 finishes, the Diff appears here for Human-in-the-loop Accept.
            </p>
          </div>
        ) : !allowMonaco || monacoFailed || !monacoReady ? (
          <>
            {!allowMonaco && (
              <div className="absolute top-2 right-2 z-10 rounded-md border border-border bg-card/90 px-2 py-0.5 text-[10px] text-muted-foreground">
                Lightweight diff (mobile)
              </div>
            )}
            <FallbackDiff original={originalCode} modified={modifiedCode} />
          </>
        ) : (
          <DiffEditor
            height="100%"
            language={language === "typescript" ? "typescript" : language}
            original={originalCode}
            modified={modifiedCode}
            theme={theme === "dark" ? "vs-dark" : "light"}
            loading={
              <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Loading editor…
              </div>
            }
            onMount={(ed) => {
              editorRef.current = ed;
            }}
            options={{
              readOnly: true,
              renderSideBySide: false,
              minimap: { enabled: false },
              fontSize: 13,
              fontFamily: "Fira Code, ui-monospace, monospace",
              scrollBeyondLastLine: false,
              smoothScrolling: true,
              useInlineViewWhenSpaceIsLimited: true,
              renderIndicators: true,
              originalEditable: false,
              automaticLayout: true,
              padding: { top: 12, bottom: 12 },
              lineNumbers: "on",
              glyphMargin: false,
              folding: false,
              wordWrap: "on",
            }}
          />
        )}
      </div>
    </div>
  );
}
