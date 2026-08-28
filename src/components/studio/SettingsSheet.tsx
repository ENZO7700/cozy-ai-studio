import { useEffect, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { Cloud, CloudOff, Copy, Sun, Circle } from "lucide-react";
import { toast } from "sonner";
import { useStudioStore } from "@/stores/studio-store";
import { authEnabled, signOut } from "@/lib/auth/client";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { cn } from "@/lib/utils";

const PROJECT_ID_KEY = "cai-active-project-id";

export function SettingsSheet() {
  const open = useStudioStore((s) => s.settingsOpen);
  const setOpen = useStudioStore((s) => s.setSettingsOpen);
  const theme = useStudioStore((s) => s.theme);
  const toggleTheme = useStudioStore((s) => s.toggleTheme);
  const planTier = useStudioStore((s) => s.planTier);
  const promptsUsed = useStudioStore((s) => s.promptsUsed);
  const promptLimit = useStudioStore((s) => s.promptLimit);
  const navigate = useNavigate();
  const { user } = useCurrentUserState();
  const [projectId, setProjectId] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const remaining =
    planTier === "FREE" ? Math.max(0, (promptLimit || 100) - promptsUsed) : null;

  useEffect(() => {
    if (!open) return;
    try {
      setProjectId(window.localStorage.getItem(PROJECT_ID_KEY));
    } catch {
      setProjectId(null);
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, setOpen]);

  if (!open) return null;

  const copyId = async () => {
    if (!projectId) return;
    try {
      await navigator.clipboard.writeText(projectId);
      setCopied(true);
      toast.success("ID skopírované");
      window.setTimeout(() => setCopied(false), 1400);
    } catch {
      toast.error("Kopírovanie zlyhalo");
    }
  };

  return (
    <div className="fixed inset-0 z-[80]" data-settings-sheet>
      <button
        type="button"
        className="absolute inset-0 bg-charcoal/40"
        aria-label="Zavrieť nastavenia"
        onClick={() => setOpen(false)}
      />
      <aside
        role="dialog"
        aria-modal="true"
        aria-labelledby="settings-sheet-title"
        className="absolute inset-y-0 right-0 flex w-[min(100%,22rem)] flex-col border-l border-border bg-card p-4 shadow-[var(--shadow-elevated)] motion-reduce:transition-none"
      >
        <div className="flex items-center justify-between gap-3">
          <h2 id="settings-sheet-title" className="font-serif text-lg font-semibold">
            Nastavenia
          </h2>
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="inline-flex min-h-10 min-w-10 items-center justify-center rounded-xl text-sm hover:bg-muted"
            aria-label="Zavrieť"
          >
            Esc
          </button>
        </div>

        <div className="mt-4 flex min-h-0 flex-1 flex-col gap-2 overflow-auto">
          <button
            type="button"
            onClick={() => toggleTheme()}
            className="flex min-h-10 w-full items-center gap-2 rounded-xl border border-border px-3 text-left text-sm hover:bg-muted"
          >
            {theme === "dark" ? (
              <Sun className="h-4 w-4 shrink-0 text-muted-foreground" />
            ) : (
              <Circle className="h-4 w-4 shrink-0 fill-muted-foreground/30 text-muted-foreground" />
            )}
            {theme === "dark" ? "Svetlý motív" : "Tmavý motív"}
          </button>

          <button
            type="button"
            onClick={() => {
              setOpen(false);
              void navigate({ to: "/pricing", search: {} });
            }}
            className="flex min-h-10 w-full items-center justify-between gap-2 rounded-xl border border-border px-3 text-left text-sm hover:bg-muted"
          >
            <span>Plán {planTier}</span>
            <span className="font-mono text-xs text-muted-foreground">
              {planTier === "ENTERPRISE" && (promptLimit ?? 0) >= 1_000_000
                ? "∞"
                : remaining != null
                  ? `${remaining} ostáva`
                  : "limity"}
            </span>
          </button>

          <div className="flex min-h-10 items-center gap-2 rounded-xl border border-border px-3">
            {projectId ? (
              <Cloud className="h-4 w-4 shrink-0 text-muted-foreground" />
            ) : (
              <CloudOff className="h-4 w-4 shrink-0 text-muted-foreground" />
            )}
            <div className="min-w-0 flex-1">
              <div className="text-sm">{projectId ? "Cloud" : "Local"}</div>
              <div className="truncate font-mono text-[11px] text-muted-foreground">
                {projectId ?? "bez projektu"}
              </div>
            </div>
            <button
              type="button"
              disabled={!projectId}
              onClick={() => void copyId()}
              className={cn(
                "inline-flex min-h-10 min-w-10 items-center justify-center rounded-lg text-xs",
                projectId ? "hover:bg-muted" : "opacity-40",
              )}
              aria-label="Kopírovať project id"
            >
              <Copy className="h-4 w-4" />
              <span className="sr-only">{copied ? "Skopírované" : "Kopírovať"}</span>
            </button>
          </div>

          {authEnabled && user ? (
            <button
              type="button"
              onClick={() => void signOut("/")}
              className="mt-auto flex min-h-10 w-full items-center justify-center rounded-xl border border-border px-3 text-sm hover:bg-muted"
            >
              Sign out
            </button>
          ) : authEnabled ? (
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                void navigate({ to: "/login", search: { redirect: "/studio" } });
              }}
              className="mt-auto flex min-h-10 w-full items-center justify-center rounded-xl bg-choco px-3 text-sm font-semibold text-white hover:bg-choco/90"
            >
              Sign in
            </button>
          ) : null}
        </div>
      </aside>
    </div>
  );
}
