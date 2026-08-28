import { useEffect, useMemo, useState } from "react";
import { Smartphone, QrCode, Copy, Check, Wifi, WifiOff } from "lucide-react";
import { toast } from "sonner";
import { RealtimeClient, type RealtimeStatus } from "@/lib/realtime/client";
import { getActiveProjectId } from "@/hooks/useProjectSync";
import { useStudioStore } from "@/stores/studio-store";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  resolveServerApproval,
  persistTelemetry,
} from "@/hooks/useProjectSync";
import { pushAcceptedFilesToWebContainer } from "@/hooks/useWebContainerPreview";
import { saveMyProjectFiles } from "@/lib/db/functions";

/** QR via public chart API (no extra dep) */
function qrUrl(data: string, size = 180) {
  return `https://api.qrserver.com/v1/create-qr-code/?size=${size}x${size}&data=${encodeURIComponent(data)}`;
}

let desktopClient: RealtimeClient | null = null;

export function getDesktopRealtime(): RealtimeClient | null {
  return desktopClient;
}

export function MobilePairPanel({ className }: { className?: string }) {
  const pending = useStudioStore((s) => s.pendingApproval);
  const approvePending = useStudioStore((s) => s.approvePending);
  const rejectPending = useStudioStore((s) => s.rejectPending);
  const lastPrompt = useStudioStore((s) => s.lastPrompt);
  const pipelineLatencyMs = useStudioStore((s) => s.pipelineLatencyMs);

  const [status, setStatus] = useState<RealtimeStatus>("idle");
  const [code, setCode] = useState<string | null>(null);
  const [peers, setPeers] = useState(0);
  const [copied, setCopied] = useState(false);
  const [open, setOpen] = useState(false);

  const projectId = getActiveProjectId() || "default";
  const pairLink = useMemo(() => {
    if (!code || typeof window === "undefined") return "";
    const u = new URL("/mobile", window.location.origin);
    u.searchParams.set("code", code);
    u.searchParams.set("project", projectId);
    return u.toString();
  }, [code, projectId]);

  useEffect(() => {
    const client = new RealtimeClient({
      onStatus: setStatus,
      onPairCode: (c) => setCode(c),
      onPaired: (info) => setPeers(info.peers),
      onPeer: (_k, _r, p) => setPeers(p),
      onDiffAccept: (approvalId) => {
        // Mobile approved — apply on desktop
        const p = useStudioStore.getState().pendingApproval;
        if (!p) return;
        approvePending();
        void pushAcceptedFilesToWebContainer();
        void resolveServerApproval("approved");
        void persistTelemetry({
          prompt: lastPrompt,
          status: "APPROVED",
          agentType: "G0-G1-G2-mobile",
          latencyMs: pipelineLatencyMs,
          projectId: getActiveProjectId(),
        });
        const state = useStudioStore.getState();
        const pid = getActiveProjectId();
        if (pid) {
          void saveMyProjectFiles({
            data: {
              projectId: pid,
              files: Object.values(state.files).map((f) => ({
                path: f.path,
                language: f.language,
                content: f.content,
              })),
              activeFile: state.activeFile,
            },
          });
        }
        toast.success("Mobile approved", {
          description: approvalId.slice(0, 12),
        });
      },
      onDiffReject: (approvalId) => {
        rejectPending();
        void resolveServerApproval("rejected");
        toast.message("Mobile rejected", {
          description: approvalId.slice(0, 12),
        });
      },
      onError: (m) => toast.error(m),
    });
    desktopClient = client;
    client.hostDesktop(projectId);

    return () => {
      client.disconnect();
      if (desktopClient === client) desktopClient = null;
    };
  }, [
    projectId,
    approvePending,
    rejectPending,
    lastPrompt,
    pipelineLatencyMs,
  ]);

  // Push pending diffs to mobile room
  useEffect(() => {
    if (!pending || !desktopClient) return;
    let approvalId = "";
    try {
      approvalId =
        window.sessionStorage.getItem("cai-pending-approval-id") ||
        `local_${Date.now().toString(36)}`;
    } catch {
      approvalId = `local_${Date.now().toString(36)}`;
    }
    desktopClient.publishPending({
      approvalId,
      title: pending.title,
      description: pending.description,
      files: pending.affectedFiles,
      summary: pending.description,
      originalCode: pending.originalCode,
      modifiedCode: pending.modifiedCode,
      language: pending.language,
      previewHtml: pending.previewHtml,
    });
  }, [pending]);

  const copyCode = async () => {
    if (!code) return;
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
      toast.success("Pair code copied");
    } catch {
      toast.message(code);
    }
  };

  const connected = status === "paired" || status === "open";

  return (
    <div
      className={cn(
        "rounded-2xl border border-border bg-card/80 overflow-hidden",
        className,
      )}
    >
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between gap-2 px-3 py-2.5 text-left hover:bg-muted/40 transition-colors"
      >
        <span className="flex items-center gap-2 text-xs font-semibold">
          <Smartphone className="h-3.5 w-3.5 text-choco" />
          Mobile pair
          <span
            className={cn(
              "inline-flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-[10px] font-mono",
              connected
                ? "border-success/40 text-success"
                : "border-border text-muted-foreground",
            )}
          >
            {connected ? (
              <Wifi className="h-3 w-3" />
            ) : (
              <WifiOff className="h-3 w-3" />
            )}
            {status}
            {peers > 0 ? ` · ${peers}` : ""}
          </span>
        </span>
        <QrCode className="h-3.5 w-3.5 text-muted-foreground" />
      </button>

      {open && (
        <div className="border-t border-border px-3 py-3 space-y-3">
          <p className="text-[11px] text-muted-foreground leading-relaxed">
            Scan QR or enter the magic code on your phone. Pending diffs stream
            live over WebSocket — Accept / Reject syncs back to desktop.
          </p>
          {code && pairLink && (
            <div className="flex flex-col sm:flex-row gap-3 items-center">
              <img
                src={qrUrl(pairLink)}
                alt={`Pair code ${code}`}
                width={140}
                height={140}
                className="rounded-xl border border-border bg-white p-1"
              />
              <div className="flex-1 w-full space-y-2">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Magic code
                </p>
                <p className="font-mono text-2xl font-bold tracking-[0.25em] text-foreground">
                  {code}
                </p>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-8 gap-1.5 text-xs"
                    onClick={() => void copyCode()}
                  >
                    {copied ? (
                      <Check className="h-3.5 w-3.5" />
                    ) : (
                      <Copy className="h-3.5 w-3.5" />
                    )}
                    Copy
                  </Button>
                  <Button
                    size="sm"
                    variant="secondary"
                    className="h-8 text-xs"
                    onClick={() => {
                      desktopClient?.hostDesktop(projectId);
                      toast.message("Refreshing pair room…");
                    }}
                  >
                    New code
                  </Button>
                </div>
                <p className="text-[10px] font-mono text-muted-foreground break-all">
                  {pairLink}
                </p>
              </div>
            </div>
          )}
          {!code && (
            <p className="text-xs text-muted-foreground">Connecting to /api/ws…</p>
          )}
        </div>
      )}
    </div>
  );
}
