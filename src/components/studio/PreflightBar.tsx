import { CheckCircle2, AlertTriangle, XCircle, MinusCircle, ShieldCheck } from "lucide-react";
import { useStudioStore } from "@/stores/studio-store";
import { cn } from "@/lib/utils";

const icon = {
  pass: CheckCircle2,
  fail: XCircle,
  warn: AlertTriangle,
  skip: MinusCircle,
} as const;

const tone = {
  pass: "text-success",
  fail: "text-danger",
  warn: "text-amber-500",
  skip: "text-muted-foreground",
} as const;

/**
 * P1 — shows G1 patch contract + preflight before HitL Accept.
 */
export function PreflightBar() {
  const report = useStudioStore((s) => s.preflightReport);
  const pending = useStudioStore((s) => s.pendingApproval);

  if (!report || !pending) return null;

  return (
    <div
      className={cn(
        "mb-2 rounded-xl border px-3 py-2.5 text-xs",
        report.canAccept
          ? "border-success/30 bg-success/5"
          : "border-danger/30 bg-danger/5",
      )}
    >
      <div className="flex items-center gap-2 mb-1.5">
        <ShieldCheck
          className={cn(
            "h-3.5 w-3.5 shrink-0",
            report.canAccept ? "text-success" : "text-danger",
          )}
        />
        <span className="font-semibold text-foreground">
          Preflight · {report.patchCount} file
          {report.patchCount === 1 ? "" : "s"}
        </span>
        <span
          className={cn(
            "ml-auto font-mono text-[10px] uppercase tracking-wide",
            report.canAccept ? "text-success" : "text-danger",
          )}
        >
          {report.canAccept ? "Accept OK" : "Blocked"}
        </span>
      </div>
      <ul className="grid grid-cols-1 sm:grid-cols-2 gap-1">
        {report.checks.map((c) => {
          const Icon = icon[c.status];
          return (
            <li key={c.id} className="flex items-start gap-1.5 min-w-0">
              <Icon className={cn("h-3 w-3 mt-0.5 shrink-0", tone[c.status])} />
              <span className="text-muted-foreground truncate">
                <span className="text-foreground font-medium">{c.label}</span>
                {c.detail ? ` — ${c.detail}` : ""}
              </span>
            </li>
          );
        })}
      </ul>
      {pending.filePatches && pending.filePatches.length > 1 && (
        <p className="mt-1.5 font-mono text-[10px] text-muted-foreground truncate">
          {pending.filePatches.map((p) => p.path).join(" · ")}
        </p>
      )}
    </div>
  );
}
