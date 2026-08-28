import { useEffect, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import {
  ArrowLeft,
  Check,
  X,
  Bell,
  Wifi,
  WifiOff,
  Loader2,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { RealtimeClient, type RealtimeStatus } from "@/lib/realtime/client";
import type { DiffPendingPayload } from "@/lib/realtime/protocol";
import { CozyLogo } from "@/components/brand/CozyLogo";

type MobileSearch = {
  code?: string;
  project?: string;
};

export const Route = createFileRoute("/mobile")({
  component: MobileCompanionPage,
  head: () => ({
    meta: [{ title: "Remote Review — CAI" }],
  }),
  validateSearch: (s: Record<string, unknown>): MobileSearch => ({
    code: typeof s.code === "string" ? s.code : undefined,
    project: typeof s.project === "string" ? s.project : undefined,
  }),
});

function MobileCompanionPage() {
  const search = Route.useSearch();
  const [codeInput, setCodeInput] = useState(search.code?.toUpperCase() ?? "");
  const [status, setStatus] = useState<RealtimeStatus>("idle");
  const [paired, setPaired] = useState(false);
  const [peers, setPeers] = useState(0);
  const [projectId, setProjectId] = useState(search.project ?? "");
  const [queue, setQueue] = useState<DiffPendingPayload[]>([]);
  const [dragX, setDragX] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [startX, setStartX] = useState(0);
  const [client, setClient] = useState<RealtimeClient | null>(null);

  const top = queue[0];

  useEffect(() => {
    const c = new RealtimeClient({
      onStatus: setStatus,
      onPaired: (info) => {
        setPaired(true);
        setPeers(info.peers);
        setProjectId(info.projectId);
        toast.success("Paired with desktop", {
          description: `Room · ${info.peers} peer(s)`,
        });
      },
      onPeer: (_k, _r, p) => setPeers(p),
      onDiffPending: (payload) => {
        setQueue((q) => {
          if (q.some((x) => x.approvalId === payload.approvalId)) return q;
          return [...q, payload];
        });
        toast.message("New review", { description: payload.title });
      },
      onError: (m) => toast.error(m),
    });
    setClient(c);

    // Auto-join if code in URL (QR)
    if (search.code) {
      c.joinMobile(search.code);
    }

    return () => c.disconnect();
  }, [search.code]);

  const join = () => {
    const code = codeInput.trim().toUpperCase();
    if (code.length < 4) {
      toast.error("Enter the 6-character magic code from desktop");
      return;
    }
    client?.joinMobile(code);
  };

  const decide = (approved: boolean) => {
    if (!top || !client) return;
    if (approved) client.accept(top.approvalId);
    else client.reject(top.approvalId);
    setQueue((c) => c.filter((x) => x.approvalId !== top.approvalId));
    setDragX(0);
    toast.success(approved ? `Approved: ${top.title}` : `Rejected: ${top.title}`, {
      description: "Synced to desktop over WebSocket",
    });
  };

  const onPointerDown = (e: React.PointerEvent) => {
    setDragging(true);
    setStartX(e.clientX);
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (!dragging) return;
    setDragX(e.clientX - startX);
  };
  const onPointerUp = () => {
    setDragging(false);
    if (dragX > 100) decide(true);
    else if (dragX < -100) decide(false);
    else setDragX(0);
  };

  const live = status === "paired" || status === "open";

  return (
    <div
      className="flex flex-col bg-background cosy-safe-shell"
      data-mobile-companion
      data-safe-shell="pad"
    >
      <header className="flex items-center justify-between border-b border-border px-4 h-14 shrink-0">
        <Link
          to="/studio"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground min-h-11"
        >
          <ArrowLeft className="h-4 w-4" />
          Studio
        </Link>
        <span className="flex items-center gap-2 font-serif font-bold text-sm">
          <CozyLogo size="sm" variant="seal" />
          Remote Review
        </span>
        <div className="relative p-2 text-muted-foreground min-h-11 min-w-11 flex items-center justify-center" aria-label="Status">
          {live ? (
            <Wifi className="h-4 w-4 text-success" />
          ) : (
            <WifiOff className="h-4 w-4" />
          )}
          {queue.length > 0 && (
            <span className="absolute top-1 right-1 h-2 w-2 rounded-full bg-choco" />
          )}
        </div>
      </header>

      <div className="flex-1 flex flex-col items-center justify-center p-4 max-w-md mx-auto w-full cosy-safe-x">
        {!paired ? (
          <div className="w-full space-y-4">
            <div className="text-center space-y-1">
              <h1 className="font-serif text-2xl font-bold">Pair with desktop</h1>
              <p className="text-sm text-muted-foreground">
                Enter the magic code from Studio → Mobile pair, or open the QR
                link.
              </p>
            </div>
            <label htmlFor="mobile-pair-code" className="block space-y-1.5">
              <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Magic code
              </span>
              <input
                id="mobile-pair-code"
                name="pairCode"
                value={codeInput}
                onChange={(e) =>
                  setCodeInput(e.target.value.toUpperCase().slice(0, 8))
                }
                className="h-14 w-full rounded-2xl border border-border bg-card px-4 text-center font-mono text-2xl tracking-[0.35em] outline-none focus:border-choco"
                placeholder="ABC123"
                autoCapitalize="characters"
                autoComplete="one-time-code"
              />
            </label>
            <Button
              className="w-full h-12 rounded-2xl gap-2 min-h-12"
              onClick={join}
              disabled={status === "connecting"}
            >
              {status === "connecting" ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Wifi className="h-4 w-4" />
              )}
              Connect WebSocket
            </Button>
            <p className="text-center text-[11px] font-mono text-muted-foreground">
              {status}
              {projectId ? ` · ${projectId.slice(0, 12)}` : ""}
            </p>
          </div>
        ) : (
          <>
            <p className="text-xs text-muted-foreground mb-2 text-center">
              Swipe right to approve · left to reject
            </p>
            <p className="text-[11px] font-mono text-success mb-4">
              Paired · {peers} peer(s) · {status}
            </p>

            {top ? (
              <div
                className="w-full touch-none select-none"
                onPointerDown={onPointerDown}
                onPointerMove={onPointerMove}
                onPointerUp={onPointerUp}
                onPointerLeave={onPointerUp}
              >
                <div
                  className={cn(
                    "rounded-2xl border-l-8 border-l-choco border border-border bg-card p-6 shadow-[var(--shadow-elevated)] transition-transform",
                    !dragging && "duration-200",
                  )}
                  style={{
                    transform: `translateX(${dragX}px) rotate(${dragX * 0.04}deg)`,
                  }}
                >
                  <p className="text-xs font-semibold uppercase tracking-wider text-choco mb-2">
                    Pending review · {queue.length} left
                  </p>
                  <h2 className="font-serif text-2xl font-bold mb-2">
                    {top.title}
                  </h2>
                  <p className="text-sm text-muted-foreground mb-4 leading-relaxed">
                    {top.summary || top.description}
                  </p>
                  <div className="rounded-xl bg-muted/60 p-3 mb-4">
                    <p className="text-xs font-semibold text-muted-foreground mb-1.5">
                      FILES
                    </p>
                    {top.files.map((f) => (
                      <p key={f} className="font-mono text-xs text-choco">
                        {f}
                      </p>
                    ))}
                  </div>
                  {top.modifiedCode && (
                    <pre className="mb-6 max-h-32 overflow-auto rounded-xl bg-canvas p-3 text-[10px] font-mono text-canvas-fg cosy-scroll">
                      {top.modifiedCode.slice(0, 800)}
                      {top.modifiedCode.length > 800 ? "…" : ""}
                    </pre>
                  )}
                  <div className="flex gap-3">
                    <Button
                      variant="danger"
                      className="flex-1 min-h-12"
                      onClick={() => decide(false)}
                    >
                      <X className="h-4 w-4" />
                      Reject
                    </Button>
                    <Button
                      className="flex-1 min-h-12"
                      onClick={() => decide(true)}
                    >
                      <Check className="h-4 w-4" />
                      Approve
                    </Button>
                  </div>
                </div>
                <div className="flex justify-between mt-3 px-2 text-xs font-medium">
                  <span
                    className={cn(
                      "text-danger",
                      dragX < -40 ? "opacity-100" : "opacity-30",
                    )}
                  >
                    ← Reject
                  </span>
                  <span
                    className={cn(
                      "text-success",
                      dragX > 40 ? "opacity-100" : "opacity-30",
                    )}
                  >
                    Approve →
                  </span>
                </div>
              </div>
            ) : (
              <div className="text-center py-16">
                <Bell className="h-8 w-8 mx-auto mb-3 text-muted-foreground" />
                <p className="font-serif text-2xl font-bold mb-2">Inbox clear</p>
                <p className="text-sm text-muted-foreground mb-6">
                  Waiting for desktop to push a pending agent diff over
                  WebSocket.
                </p>
                <Link to="/studio">
                  <Button variant="outline" className="min-h-11">
                    Back to studio
                  </Button>
                </Link>
              </div>
            )}
          </>
        )}
      </div>
      {/* Home Indicator clearance */}
          </div>
  );
}
