import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import {
  Command,
  Sun,
  Circle,
  LayoutGrid,
  Cloud,
  CloudOff,
  MoreHorizontal,
} from "lucide-react";
import { useStudioStore } from "@/stores/studio-store";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { ProductionLaunchButton } from "./ProductionLaunch";
import { CozyLogo } from "@/components/brand/CozyLogo";
import { UserButton, SignedIn, SignedOut } from "@/lib/auth/gates";
import { authEnabled } from "@/lib/auth/client";
import { useProjectSync } from "@/hooks/useProjectSync";

/**
 * Top chrome — only primary status + SUPER badge visible.
 * Secondary actions live in a single ⋯ menu (search, theme, showcase, pricing).
 */
export function TopBar() {
  const theme = useStudioStore((s) => s.theme);
  const toggleTheme = useStudioStore((s) => s.toggleTheme);
  const setCommandOpen = useStudioStore((s) => s.setCommandOpen);
  const setMobilePanel = useStudioStore((s) => s.setMobilePanel);
  const planTier = useStudioStore((s) => s.planTier);
  const promptsUsed = useStudioStore((s) => s.promptsUsed);
  const promptLimit = useStudioStore((s) => s.promptLimit);
  const dailyUsed = useStudioStore((s) => s.dailyUsed);
  const dailyLimit = useStudioStore((s) => s.dailyLimit);
  const stripeConfigured = useStudioStore((s) => s.stripeConfigured);
  const isPipelineRunning = useStudioStore((s) => s.isPipelineRunning);
  const productionLive = useStudioStore((s) => s.productionLive);
  const productionLaunchRunning = useStudioStore((s) => s.productionLaunchRunning);
  const navigate = useNavigate();
  const { hydrated, syncing, projectId } = useProjectSync();
  const [moreOpen, setMoreOpen] = useState(false);
  const moreRef = useRef<HTMLDivElement>(null);

  const isSuper =
    planTier === "ENTERPRISE" && (promptLimit ?? 0) >= 1_000_000;
  const remaining =
    planTier === "FREE"
      ? Math.max(0, (promptLimit || 100) - promptsUsed)
      : null;
  const dailyLeft =
    planTier === "FREE" && dailyLimit != null
      ? Math.max(0, dailyLimit - dailyUsed)
      : null;

  useEffect(() => {
    if (!moreOpen) return;
    const onDoc = (e: MouseEvent) => {
      if (!moreRef.current?.contains(e.target as Node)) setMoreOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMoreOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [moreOpen]);

  const focusBrief = () => {
    setMobilePanel("chat");
    void navigate({ to: "/studio" });
    requestAnimationFrame(() => {
      document
        .querySelector<HTMLTextAreaElement>('textarea[aria-label="Prompt"]')
        ?.focus();
    });
  };

  return (
    <header className="flex h-12 shrink-0 items-center justify-between gap-2 border-b border-border bg-card/80 px-3 sm:px-4 backdrop-blur-md cosy-safe-x">
      <div className="flex items-center gap-2.5 min-w-0">
        <Link to="/" className="flex items-center gap-2 shrink-0 group">
          <CozyLogo
            size="sm"
            variant="seal"
            className="group-hover:-translate-y-px transition-transform"
          />
          <div className="hidden sm:block min-w-0">
            <div className="font-serif text-sm font-bold leading-none truncate tracking-tight">
              COSY Studio
            </div>
          </div>
        </Link>

        <div
          className={cn(
            "flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-medium border",
            productionLaunchRunning || isPipelineRunning
              ? "border-agents-blue/40 bg-agents-blue/10 text-agents-blue"
              : productionLive
                ? "border-success/40 bg-success/10 text-success"
                : "border-border bg-muted text-muted-foreground",
          )}
        >
          <span
            className={cn(
              "h-1.5 w-1.5 rounded-full",
              productionLaunchRunning || isPipelineRunning
                ? "bg-agents-blue agent-pulse"
                : "bg-success",
            )}
          />
          {productionLaunchRunning
            ? "Deploy…"
            : isPipelineRunning
              ? "Agents"
              : "Ready"}
        </div>

        <div
          className={cn(
            "hidden md:flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-mono border",
            projectId && hydrated
              ? "border-success/30 bg-success/10 text-success"
              : "border-border bg-muted text-muted-foreground",
          )}
          title={projectId ? `Cloud ${projectId}` : "Local"}
        >
          {projectId ? (
            <Cloud className="h-3 w-3" />
          ) : (
            <CloudOff className="h-3 w-3" />
          )}
          {syncing ? "Sync" : projectId ? "Cloud" : "Local"}
        </div>
      </div>

      <div className="flex items-center gap-1.5 min-w-0">
        <button
          type="button"
          onClick={focusBrief}
          className="hidden sm:inline-flex h-8 items-center rounded-full bg-choco px-3 text-xs font-semibold text-white hover:bg-choco/90 transition-colors"
        >
          Brief
        </button>

        <button
          type="button"
          onClick={() => void navigate({ to: "/pricing", search: {} })}
          className={cn(
            "inline-flex items-center gap-1 rounded-full border px-2 h-8 text-[11px] font-mono",
            isSuper
              ? "border-choco/40 bg-choco/15 text-choco"
              : "border-border bg-muted/60 text-muted-foreground",
          )}
          title={
            isSuper
              ? "Super Admin · unlimited"
              : dailyLeft != null
                ? `Daily ${dailyLeft} · Monthly ${remaining}`
                : `Plan ${planTier}`
          }
        >
          <span className="font-semibold">{isSuper ? "SUPER" : planTier}</span>
          {isSuper ? (
            <span className="opacity-80">∞</span>
          ) : remaining != null ? (
            <span className="tabular-nums opacity-80">{remaining}</span>
          ) : null}
        </button>

        {stripeConfigured ? (
          <ProductionLaunchButton stripeConfigured={stripeConfigured} />
        ) : null}

        <div className="relative" ref={moreRef}>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            aria-label="Viac možností"
            aria-expanded={moreOpen}
            onClick={() => setMoreOpen((v) => !v)}
          >
            <MoreHorizontal className="h-4 w-4" />
          </Button>
          {moreOpen && (
            <div className="absolute right-0 top-[calc(100%+6px)] z-50 w-52 rounded-xl border border-border bg-card p-1 shadow-[var(--shadow-elevated)]">
              <button
                type="button"
                className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-xs hover:bg-muted"
                onClick={() => {
                  setMoreOpen(false);
                  setCommandOpen(true);
                }}
              >
                <Command className="h-3.5 w-3.5 text-muted-foreground" />
                Hľadať
                <kbd className="ml-auto font-mono text-[10px] opacity-50">⌘K</kbd>
              </button>
              <button
                type="button"
                className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-xs hover:bg-muted"
                onClick={() => {
                  setMoreOpen(false);
                  void navigate({ to: "/showcase" });
                }}
              >
                <LayoutGrid className="h-3.5 w-3.5 text-muted-foreground" />
                Showcase
              </button>
              <button
                type="button"
                className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-xs hover:bg-muted"
                onClick={() => {
                  setMoreOpen(false);
                  void navigate({ to: "/pricing", search: {} });
                }}
              >
                Plán / limity
              </button>
              <button
                type="button"
                className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-xs hover:bg-muted"
                onClick={() => {
                  setMoreOpen(false);
                  toggleTheme();
                }}
              >
                {theme === "dark" ? (
                  <Sun className="h-3.5 w-3.5 text-muted-foreground" />
                ) : (
                  <Circle className="h-3.5 w-3.5 fill-muted-foreground/30 text-muted-foreground" />
                )}
                {theme === "dark" ? "Svetlý motív" : "Tmavý motív"}
              </button>
            </div>
          )}
        </div>

        {authEnabled && (
          <div className="hidden sm:flex items-center shrink-0">
            <SignedIn>
              <UserButton />
            </SignedIn>
            <SignedOut>
              <Link
                to="/login"
                search={{ redirect: "/studio" }}
                className="text-xs font-medium px-2.5 h-8 inline-flex items-center rounded-xl border border-border hover:border-choco/40"
              >
                Sign in
              </Link>
            </SignedOut>
          </div>
        )}
      </div>
    </header>
  );
}
